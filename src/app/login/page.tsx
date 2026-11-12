import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { getNonce, turnstileSiteKey } from "@/lib/server/nonce";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const REASONS: Record<string, string> = {
  "sessao-expirada": "Sua sessão expirou. Entre novamente.",
  "link-invalido": "Link inválido ou expirado.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  const notice = motivo ? REASONS[motivo] : undefined;
  return (
    <AuthShell title="Entrar" description="Acesso restrito à família.">
      {notice ? (
        <p role="status" className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      <LoginForm siteKey={turnstileSiteKey()} nonce={await getNonce()} />
      <p className="mt-6 text-center text-sm">
        <Link href="/recuperar-senha" className="text-primary underline-offset-4 hover:underline">
          Esqueci minha senha
        </Link>
      </p>
    </AuthShell>
  );
}
