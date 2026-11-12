import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { UnauthorizedError, requireMember } from "@/lib/server/auth";

/**
 * Fase 1: página provisória (o painel do mês chega na Fase 2).
 * Só é alcançável com sessão aal2 de um membro da allowlist.
 */
export default async function HomePage() {
  let displayName = "";
  try {
    const { supabase, user } = await requireMember();
    const { data } = await supabase
      .from("household_members")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    displayName = data?.display_name ?? "";
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    throw e;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">O Bolso</h1>
      <p className="text-lg">Olá{displayName ? `, ${displayName}` : ""}.</p>
      <p className="text-muted-foreground">
        Fundação de segurança ativa. O painel do orçamento chega na próxima fase.
      </p>
      <div className="space-y-3">
        <SignOutButton />
        <SignOutButton everywhere />
      </div>
    </main>
  );
}
