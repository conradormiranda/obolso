import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ExpenseForm } from "@/components/app/expense-form";
import { CATEGORY_SLUG } from "@/lib/domain/categories";
import { monthFromDb, monthParam } from "@/lib/domain/month";
import { requireMember } from "@/lib/server/auth";
import { loadCategories, loadExpense, loadMemberNames } from "@/lib/server/budget-data";
import { payerOptions } from "@/lib/server/form-options";
import { formatCents } from "@/lib/validation/money";
import { uuidSchema } from "@/lib/validation/budget";

export const metadata: Metadata = { title: "Editar lançamento" };

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const { supabase } = await requireMember();
  const [expense, categories, names] = await Promise.all([
    loadExpense(supabase, id.data),
    loadCategories(supabase),
    loadMemberNames(supabase),
  ]);
  if (!expense || expense.deleted_at) notFound();

  const category = categories.find((c) => c.id === expense.category_id);
  const { data: budget } = await supabase.from("monthly_budgets").select("month").eq("id", expense.budget_id).maybeSingle();
  const ref = budget ? monthFromDb(budget.month) : null;
  if (!category || !ref) notFound();
  const param = monthParam(ref);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <Link
        href={`/categoria/${CATEGORY_SLUG[category.key]}?mes=${param}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Voltar
      </Link>
      <h1 className="text-2xl font-bold text-primary">Editar lançamento</h1>
      <ExpenseForm
        categories={categories.map((c) => ({ key: c.key, name: c.name }))}
        payers={payerOptions(names)}
        initial={{
          id: expense.id,
          month: param,
          category: category.key,
          description: expense.description,
          amount: formatCents(expense.amount_cents).replace(/^R\$\s*/, "").replace(/ /g, ""),
          expenseDate: expense.expense_date,
          paidBy: expense.paid_by,
          paymentMethod: expense.payment_method,
          tags: expense.tags.join(", "),
          notes: expense.notes ?? "",
        }}
      />
    </div>
  );
}
