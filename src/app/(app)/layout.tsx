import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { QuickAdd } from "@/components/app/quick-add";
import { UnauthorizedError, requireMember } from "@/lib/server/auth";
import { loadQuickAddData, type QuickAddData } from "@/lib/server/quick-add-data";

/**
 * Área autenticada. Além do middleware, cada renderização confere aqui:
 * sessão + aal2 + membro, e exige códigos de recuperação gerados.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let quick: QuickAddData;
  try {
    const { supabase, user } = await requireMember();
    const { data: remaining } = await supabase.rpc("mfa_recovery_codes_remaining");
    if ((remaining ?? 0) === 0) redirect("/mfa/codigos");
    quick = await loadQuickAddData(supabase, user);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    throw e;
  }

  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-16" />}>
        <AppHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 md:px-6">{children}</main>
      <Suspense fallback={null}>
        <QuickAdd {...quick} />
      </Suspense>
    </div>
  );
}
