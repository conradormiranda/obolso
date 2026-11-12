import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExpenseForm } from "@/components/app/expense-form";
import { CATEGORY_SLUG, categoryFromSlug } from "@/lib/domain/categories";
import { defaultEntryDate, monthLabel } from "@/lib/domain/month";
import { requireMember } from "@/lib/server/auth";
import { loadCategories, loadMemberNames } from "@/lib/server/budget-data";
import { myRole, payerOptions } from "@/lib/server/form-options";
import { resolveMonth } from "@/lib/server/month-param";

export const metadata: Metadata = { title: "Novo lançamento" };

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; categoria?: string }>;
}) {
  const sp = await searchParams;
  const { ref, param } = resolveMonth(sp.mes);
  const category = (sp.categoria && categoryFromSlug(sp.categoria)) || "custos_fixos";
  const { supabase, user } = await requireMember();
  const [categories, names, role] = await Promise.all([
    loadCategories(supabase),
    loadMemberNames(supabase),
    myRole(supabase, user),
  ]);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <Link
        href={`/categoria/${CATEGORY_SLUG[category]}?mes=${param}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold text-primary">Novo lançamento · {monthLabel(ref)}</h1>
      <ExpenseForm
        categories={categories.map((c) => ({ key: c.key, name: c.name }))}
        payers={payerOptions(names)}
        initial={{
          month: param,
          category,
          description: "",
          amount: "",
          expenseDate: defaultEntryDate(ref),
          paidBy: role,
          paymentMethod: "pix",
          tags: "",
          notes: "",
        }}
      />
    </div>
  );
}
