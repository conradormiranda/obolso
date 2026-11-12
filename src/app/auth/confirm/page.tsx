import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const valid = type === "recovery" && typeof tokenHash === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(tokenHash);

  return (
    <AuthShell
      title="Redefinir senha"
      description={valid ? "Toque em continuar. Em seguida, confirme com o aplicativo autenticador." : undefined}
    >
      {valid ? (
        <ConfirmForm tokenHash={tokenHash} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Link inválido ou expirado.{" "}
          <Link href="/recuperar-senha" className="text-primary underline-offset-4 hover:underline">
            Pedir um novo link
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
