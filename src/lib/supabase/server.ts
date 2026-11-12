import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isProduction, serverEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Usa SOMENTE a anon key; a autorização é garantida pelo RLS.
 * Cookies de sessão: httpOnly, Secure (produção), SameSite=Lax.
 */
export async function createClient() {
  const env = serverEnv();
  const cookieStore = await cookies();
  const cookieOptions = { httpOnly: true, secure: isProduction, sameSite: "lax" as const, path: "/" };

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, ...cookieOptions });
          }
        } catch {
          // Chamado de um Server Component: cookies são somente leitura ali.
          // O middleware é quem renova a sessão.
        }
      },
    },
  });
}

export type AppSupabaseClient = Awaited<ReturnType<typeof createClient>>;
