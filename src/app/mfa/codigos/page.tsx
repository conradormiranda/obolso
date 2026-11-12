import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { UnauthorizedError, requireMember } from "@/lib/server/auth";
import { RecoveryCodes } from "./codes";

export const metadata: Metadata = { title: "Códigos de recuperação" };

export default async function RecoveryCodesPage() {
  let remaining = 0;
  try {
    const { supabase } = await requireMember();
    const { data } = await supabase.rpc("mfa_recovery_codes_remaining");
    remaining = data ?? 0;
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    throw e;
  }
  return (
    <AuthShell title="Códigos de recuperação" description="Obrigatórios para recuperar o acesso.">
      <RecoveryCodes remaining={remaining} />
    </AuthShell>
  );
}
