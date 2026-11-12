import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireMember } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const { supabase, user } = await requireMember();
  const { data } = await supabase.from("household_members").select("display_name").eq("user_id", user.id).maybeSingle();

  return (
    <div className="mx-auto max-w-md space-y-6 py-4">
      <h1 className="text-2xl font-bold text-primary">Minha conta</h1>
      <p>
        Conectado como <strong>{data?.display_name ?? ""}</strong>.
      </p>
      <Link href="/mfa/codigos" className="block text-primary underline-offset-4 hover:underline">
        Códigos de recuperação do MFA
      </Link>
      <div className="space-y-3">
        <SignOutButton />
        <SignOutButton everywhere />
      </div>
      <p className="text-sm text-muted-foreground">Perfil, troca de senha, sessões e auditoria chegam na Fase 4.</p>
    </div>
  );
}
