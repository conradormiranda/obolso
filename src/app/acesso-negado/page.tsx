import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Acesso negado" };

export default function AccessDeniedPage() {
  return (
    <AuthShell title="Acesso negado" description="Esta conta não tem permissão para acessar o O Bolso.">
      <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
        Voltar para o login
      </Link>
    </AuthShell>
  );
}
