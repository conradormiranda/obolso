import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { PWRESET_COOKIE, isPwResetValid } from "@/lib/security/session-policy";
import { createClient, type AppSupabaseClient } from "@/lib/supabase/server";

/**
 * Redirects feitos por Server Actions renderizam o destino SEM passar pelo
 * middleware. Por isso as páginas de autenticação repetem aqui a mesma regra
 * de roteamento do middleware (defesa em profundidade).
 */

export async function hasVerifiedTotp(supabase: AppSupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.all ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
}

export async function mfaLandingPath(supabase: AppSupabaseClient): Promise<"/mfa" | "/mfa/configurar"> {
  return (await hasVerifiedTotp(supabase)) ? "/mfa" : "/mfa/configurar";
}

type AuthState = {
  supabase: AppSupabaseClient;
  userId: string | null;
  isMember: boolean;
  aal2: boolean;
  hasFactor: boolean;
};

async function authState(): Promise<AuthState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null, isMember: false, aal2: false, hasFactor: false };
  const [{ data: isMember }, { data: aal }, hasFactor] = await Promise.all([
    supabase.rpc("am_i_member"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    hasVerifiedTotp(supabase),
  ]);
  return { supabase, userId: user.id, isMember: isMember === true, aal2: aal?.currentLevel === "aal2", hasFactor };
}

async function pwResetPending(userId: string): Promise<boolean> {
  const store = await cookies();
  return isPwResetValid(serverEnv().SESSION_SECRET, store.get(PWRESET_COOKIE)?.value, userId, Date.now());
}

/** Página de verificação do MFA: exige sessão aal1 com fator verificado. */
export async function guardMfaVerifyPage(): Promise<void> {
  const s = await authState();
  if (!s.userId || !s.isMember) redirect("/login");
  if (s.aal2) redirect((await pwResetPending(s.userId)) ? "/redefinir-senha" : "/");
  if (!s.hasFactor) redirect("/mfa/configurar");
}

/** Página de configuração do MFA: exige sessão aal1 SEM fator verificado. */
export async function guardMfaSetupPage(): Promise<void> {
  const s = await authState();
  if (!s.userId || !s.isMember) redirect("/login");
  // Recém-configurado (inclusive no re-render pós-ação): segue para os códigos.
  if (s.aal2) redirect("/mfa/codigos");
  if (s.hasFactor) redirect("/mfa");
}

/** Página de nova senha: exige aal2 e cookie de redefinição válido. */
export async function guardPasswordResetPage(): Promise<void> {
  const s = await authState();
  if (!s.userId || !s.isMember) redirect("/login");
  if (!s.aal2) redirect(s.hasFactor ? "/mfa" : "/mfa/configurar");
  if (!(await pwResetPending(s.userId))) redirect("/");
}
