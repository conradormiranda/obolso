import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecoverForm } from "./recover-form";

import { guardMfaVerifyPage } from "@/lib/server/mfa";

export const metadata: Metadata = { title: "Código de recuperação" };

export default async function MfaRecoverPage() {
  await guardMfaVerifyPage();
  return (
    <AuthShell
      title="Código de recuperação"
      description="Use um dos códigos que você guardou ao configurar o autenticador. Cada código vale uma vez; depois você vai configurar um novo autenticador."
    >
      <RecoverForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/mfa" className="text-primary underline-offset-4 hover:underline">
          Voltar
        </Link>
      </p>
    </AuthShell>
  );
}
