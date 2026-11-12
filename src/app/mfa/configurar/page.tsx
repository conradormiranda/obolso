import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Enroll } from "./enroll";

export const metadata: Metadata = { title: "Configurar autenticador" };

export default function MfaSetupPage() {
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
