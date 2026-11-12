import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient, type AppSupabaseClient } from "@/lib/supabase/server";

export class UnauthorizedError extends Error {
  constructor() {
    super("Não autorizado");
  }
}

/**
 * Exigido em TODA mutação e leitura de dados: sessão válida, membro da
 * allowlist e MFA concluído (aal2). O RLS repete essas verificações no banco.
 */
export async function requireMember(): Promise<{ supabase: AppSupabaseClient; user: User }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") throw new UnauthorizedError();

  const { data: isMember } = await supabase.rpc("am_i_member");
  if (isMember !== true) throw new UnauthorizedError();

  return { supabase, user };
}

/** Sessão aal1 de um membro (telas de MFA). */
export async function requireMemberAal1(): Promise<{ supabase: AppSupabaseClient; user: User }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();
  const { data: isMember } = await supabase.rpc("am_i_member");
  if (isMember !== true) throw new UnauthorizedError();
  return { supabase, user };
}
