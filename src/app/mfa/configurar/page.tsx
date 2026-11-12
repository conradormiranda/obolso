import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Enroll } from "./enroll";

import { guardMfaSetupPage } from "@/lib/server/mfa";

export const metadata: Metadata = { title: "Configurar autenticador" };

export default async function MfaSetupPage() {
  await guardMfaSetupPage();
  return (
    <AuthShell
      title="Configurar verificação em duas etapas"
      description="Obrigatória para acessar o O Bolso."
    >
      <Enroll />
      <SignOutButton className="mt-4" />
    </AuthShell>
  );
}
