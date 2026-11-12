import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default function MfaPage() {
  return (
    <AuthShell title="Verificação em duas etapas" description="Abra o aplicativo autenticador e digite o código.">
      <VerifyForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/mfa/recuperar" className="text-primary underline-offset-4 hover:underline">
          Perdi o acesso ao autenticador
        </Link>
      </p>
      <SignOutButton className="mt-4" />
    </AuthShell>
  );
}
