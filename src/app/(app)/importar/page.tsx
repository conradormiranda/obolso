import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MonthSelector } from "@/components/app/month-selector";
import { StatementImport } from "@/components/app/statement-import";
import { isConsumptionKey } from "@/lib/domain/consumption";
import { monthLabel } from "@/lib/domain/month";
import { spaceHref } from "@/lib/domain/space";
import { buildHistory } from "@/lib/import/categorize";
import { requireMember } from "@/lib/server/auth";
import { loadCategories, loadMemberNames, loadMonth } from "@/lib/server/budget-data";
import { myRole, payerOptions } from "@/lib/server/form-options";
import { resolveMonth } from "@/lib/server/month-param";
import { resolveSpace } from "@/lib/server/space";

export const metadata: Metadata = { title: "Importar fatura" };

export default async function ImportStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; espaco?: string }>;
}) {
  const sp = await searchParams;
  const { ref, param } = resolveMonth(sp.mes);
  const { supabase, user } = await requireMember();
  const { space, ownerId } = resolveSpace(sp.espaco, user);

  const [categories, names, role, month, recent] = await Promise.all([
    loadCategories(supabase),
    loadMemberNames(supabase),
    myRole(supabase, user),
    loadMonth(supabase, ref, ownerId),
    // Histórico para sugerir seção e tipo: o que este usuário já pode ver (RLS).
    supabase
      .from("expenses")
      .select("description, category_id, consumption")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);
  const keyById = new Map(categories.map((c) => [c.id, c.key]));
  const history = buildHistory(
    (recent.data ?? []).flatMap((r) => {
      const key = keyById.get(r.category_id);
      return key ? [{ description: r.description, categoryKey: key, consumption: isConsumptionKey(r.consumption) ? r.consumption : null }] : [];
    }),
  );

  return (
    <div className="space-y-5">
      <Link
        href={spaceHref("/", { mes: param, espaco: space })}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Voltar
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Importar fatura do cartão</h1>
          <p className="text-sm text-muted-foreground">
            As compras entram em {monthLabel(ref)} · {space === "pessoal" ? "Pessoal (só você vê)" : "Família"}.
          </p>
        </div>
        <MonthSelector month={param} />
      </div>
      <StatementImport
        month={param}
        monthName={monthLabel(ref)}
        categories={categories.map((c) => ({ key: c.key, name: c.name }))}
        payers={payerOptions(names)}
        defaultPayer={role}
        history={[...history.entries()]}
        existing={month.expenses.map((e) => ({
          date: e.expenseDate,
          description: e.description,
          amountCents: e.amountCents,
          installment: e.installmentTotal && e.installmentNumber ? { number: e.installmentNumber, total: e.installmentTotal } : null,
        }))}
      />
    </div>
  );
}
