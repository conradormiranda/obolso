import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "./reset-form";

import { guardPasswordResetPage } from "@/lib/server/mfa";

export const metadata: Metadata = { title: "Nova senha" };

export default async function ResetPasswordPage() {
  await guardPasswordResetPage();
  return (
    <AuthShell title="Escolha uma nova senha" description="Depois de salvar, as outras sessões serão encerradas.">
      <ResetForm />
    </AuthShell>
  );
}
