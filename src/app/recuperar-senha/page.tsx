import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { getNonce, turnstileSiteKey } from "@/lib/server/nonce";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default async function RecoveryPage() {
  return (
    <AuthShell
      title="Recuperar senha"
      description="Enviaremos um link para o seu e-mail. Para trocar a senha você também vai precisar do aplicativo autenticador."
    >
      <RecoveryForm siteKey={turnstileSiteKey()} nonce={await getNonce()} />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          Voltar para o login
        </Link>
      </p>
    </AuthShell>
  );
}
