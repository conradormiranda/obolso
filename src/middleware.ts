import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { base64UrlEncode, randomBytes } from "@/lib/security/crypto";
import { buildCsp } from "@/lib/security/headers";
import { decideRoute } from "@/lib/security/routes";
import {
  PWRESET_COOKIE,
  SESSION_META_COOKIE,
  baseCookieOptions,
  decodeSessionMeta,
  encodeSessionMeta,
  evaluateSession,
  isPwResetValid,
} from "@/lib/security/session-policy";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Middleware (toda requisição de página/ação):
 *  1. Gera nonce e CSP estrita.
 *  2. Renova a sessão do Supabase (cookies httpOnly).
 *  3. Allowlist: usuário fora de household_members → logout forçado + /acesso-negado.
 *  4. Expiração por inatividade (30 min) e absoluta (7 dias).
 *  5. MFA obrigatório: sem aal2, só as telas de MFA.
 */
export async function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const nonce = base64UrlEncode(randomBytes(16));
  const httpsOrigin = (process.env.APP_ORIGIN ?? "").startsWith("https://");
  const csp = buildCsp(nonce, isDev, httpsOrigin);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const withCsp = <T extends NextResponse>(res: T): T => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  let env;
  try {
    env = serverEnv();
  } catch {
    return withCsp(new NextResponse("Serviço indisponível", { status: 503 }));
  }

  const cookieOptions = baseCookieOptions(!isDev);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, ...cookieOptions });
        }
      },
    },
  });

  // Server Actions (POST com o cabeçalho Next-Action) NUNCA são redirecionadas
  // aqui: um redirect no meio da ação quebra a resposta ("Algo deu errado").
  // Cada ação confere sessão, aal2 e membro por conta própria (requireMember).
  const isServerAction = request.method === "POST" && request.headers.has("next-action");

  const redirectTo = (path: string) => {
    if (isServerAction) return withCsp(response);
    const res = NextResponse.redirect(new URL(path, request.url), 303);
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return withCsp(res);
  };

  // getUser() valida o JWT no servidor de Auth (não confia só no cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let aal: "aal1" | "aal2" | null = null;
  let hasVerifiedFactor = false;
  let pwResetPending = false;

  if (user) {
    const { data: isMember, error: memberError } = await supabase.rpc("am_i_member");
    if (memberError) {
      return withCsp(new NextResponse("Serviço indisponível", { status: 503 }));
    }
    if (isMember !== true) {
      await supabase.auth.signOut({ scope: "local" });
      response.cookies.delete(SESSION_META_COOKIE);
      return redirectTo("/acesso-negado");
    }

    const now = Date.now();
    const meta = await decodeSessionMeta(env.SESSION_SECRET, request.cookies.get(SESSION_META_COOKIE)?.value);
    const check = evaluateSession(meta, user.id, now);
    if (!check.ok) {
      await supabase.auth.signOut({ scope: "local" });
      response.cookies.delete(SESSION_META_COOKIE);
      response.cookies.delete(PWRESET_COOKIE);
      return redirectTo(check.reason === "missing" ? "/login" : "/login?motivo=sessao-expirada");
    }
    if (check.shouldTouch) {
      const token = await encodeSessionMeta(env.SESSION_SECRET, { ...check.meta, l: now });
      response.cookies.set(SESSION_META_COOKIE, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 });
    }

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = aalData?.currentLevel === "aal2" ? "aal2" : "aal1";
    hasVerifiedFactor = aalData?.nextLevel === "aal2";
    pwResetPending = await isPwResetValid(env.SESSION_SECRET, request.cookies.get(PWRESET_COOKIE)?.value, user.id, now);
  }

  const decision = decideRoute({
    path: request.nextUrl.pathname,
    hasUser: Boolean(user),
    aal,
    hasVerifiedFactor,
    pwResetPending,
  });

  if (decision.action === "redirect") return redirectTo(decision.to);
  return withCsp(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|icons/|apple-icon|icon.svg).*)"],
};
