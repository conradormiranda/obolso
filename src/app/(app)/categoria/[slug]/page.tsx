import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { CATEGORY_LABEL, CategoryIcon } from "@/components/app/category-icon";
import { ExpenseList } from "@/components/app/expense-list";
import { MonthSelector } from "@/components/app/month-selector";
import { Money, UsageBar, UsageText } from "@/components/app/usage";
import { CATEGORY_SLUG, categoryFromSlug, paidByLabel } from "@/lib/domain/categories";
import { formatBp } from "@/lib/domain/math";
import { computeSummary } from "@/lib/domain/summary";
import { requireMember } from "@/lib/server/auth";
import { loadMonth } from "@/lib/server/budget-data";
import { resolveMonth } from "@/lib/server/month-param";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ mes?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const key = categoryFromSlug((await params).slug);
  return { title: key ? CATEGORY_LABEL[key] : "Categoria" };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const key = categoryFromSlug((await params).slug);
  if (!key) notFound();
  const { ref, param } = resolveMonth((await searchParams).mes);
  const { supabase } = await requireMember();
  const data = await loadMonth(supabase, ref);

  const summary = computeSummary({
    incomeCents: data.incomeCents,
    categories: data.categories,
    targetsBp: data.targetsBp,
    spentCents: data.spentCents,
  });
  const row = summary.rows.find((r) => r.key === key);
  const name = row?.name ?? CATEGORY_LABEL[key];
  const items = data.expenses
    .filter((e) => e.categoryKey === key)
    .map((e) => ({
      id: e.id,
      description: e.description,
      amountCents: e.amountCents,
      expenseDate: e.expenseDate,
      paidByLabel: paidByLabel(e.paidBy, data.names),
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-primary">
          <CategoryIcon category={key} className="size-6" />
          {name}
        </h1>
        <MonthSelector month={param} />
      </div>

      <section aria-label="Progresso da meta" className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Subtotal</p>
            <p className="text-2xl font-bold">
              <Money cents={row?.spentCents ?? 0} />
            </p>
          </div>
          <div className="text-right text-sm">
            <p>
              Meta {formatBp(row?.targetBp ?? 0)} · <Money cents={row?.shouldSpendCents ?? 0} />
            </p>
            <p>
              Utilizado: <UsageText usage={row?.usage ?? { kind: "none" }} />
            </p>
          </div>
        </div>
        <UsageBar usage={row?.usage ?? { kind: "none" }} label={`Uso da meta de ${name}`} />
      </section>

      <section aria-label="Lançamentos" className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary">Lançamentos</h2>
          <Link
            href={`/lancamento/novo?mes=${param}&categoria=${CATEGORY_SLUG[key]}`}
            className="flex h-10 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" aria-hidden="true" /> Adicionar
          </Link>
        </div>
        <ExpenseList items={items} month={param} />
      </section>
    </div>
  );
}
