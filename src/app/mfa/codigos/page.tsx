import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { PWRESET_COOKIE, isPwResetValid } from "@/lib/security/session-policy";
import { UnauthorizedError, requireMember } from "@/lib/server/auth";
import { RecoveryCodes } from "./codes";

export const metadata: Metadata = { title: "Códigos de recuperação" };

export default async function RecoveryCodesPage() {
  let remaining = 0;
  let next = "/";
  try {
    const { supabase, user } = await requireMember();
    const { data } = await supabase.rpc("mfa_recovery_codes_remaining");
    remaining = data ?? 0;
    const store = await cookies();
    if (await isPwResetValid(serverEnv().SESSION_SECRET, store.get(PWRESET_COOKIE)?.value, user.id, Date.now())) {
      next = "/redefinir-senha";
    }
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    throw e;
  }
  return (
    <AuthShell title="Códigos de recuperação" description="Obrigatórios para recuperar o acesso.">
      <RecoveryCodes remaining={remaining} next={next} />
    </AuthShell>
  );
}
