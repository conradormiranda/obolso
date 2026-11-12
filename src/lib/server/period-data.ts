import "server-only";
import type { CategoryKey, PaidBy, PaymentMethod } from "@/lib/supabase/database.types";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { sum } from "@/lib/domain/math";
import type { AnnualInput } from "@/lib/domain/annual";
import { DataError, loadCategories, loadMemberNames, type Category, type MemberNames } from "./budget-data";

/** Dados de um ano (ou de um mês) para visão anual e exportação. Sempre via RLS. */

export type PeriodExpense = {
  month: number;
  expenseDate: string;
  categoryKey: CategoryKey;
  description: string;
  amountCents: number;
  paidBy: PaidBy;
  paymentMethod: PaymentMethod;
  tags: string[];
  notes: string | null;
  isRecurring: boolean;
};
export type PeriodIncome = { month: number; description: string; amountCents: number; receivedBy: PaidBy };

export type PeriodData = {
  year: number;
  month: number | null;
  categories: Category[];
  names: MemberNames;
  budgetMonths: number[];
  targetsByMonth: Map<number, Partial<Record<CategoryKey, number>>>;
  incomes: PeriodIncome[];
  expenses: PeriodExpense[];
};

const PAGE = 1000;

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) throw new DataError("período");
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export async function loadPeriod(supabase: AppSupabaseClient, year: number, month: number | null): Promise<PeriodData> {
  const [categories, names] = await Promise.all([loadCategories(supabase), loadMemberNames(supabase)]);
  const keyById = new Map(categories.map((c) => [c.id, c.key]));

  const from = month ? `${year}-${String(month).padStart(2, "0")}-01` : `${year}-01-01`;
  const to = month ? from : `${year}-12-01`;
  const { data: budgets, error } = await supabase.from("monthly_budgets").select("id, month").gte("month", from).lte("month", to);
  if (error) throw new DataError("orçamentos");
  const monthById = new Map(budgets.map((b) => [b.id, Number(b.month.slice(5, 7))]));
  const ids = [...monthById.keys()];

  const empty = { year, month, categories, names, budgetMonths: [], targetsByMonth: new Map(), incomes: [], expenses: [] };
  if (ids.length === 0) return empty;

  const [targets, incomes, expenses] = await Promise.all([
    fetchAll((a, b) =>
      supabase.from("category_targets").select("budget_id, category_id, percent_bp").in("budget_id", ids).range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("incomes")
        .select("budget_id, description, amount_cents, received_by")
        .in("budget_id", ids)
        .order("created_at")
        .range(a, b),
    ),
    fetchAll((a, b) =>
      supabase
        .from("expenses")
        .select("budget_id, category_id, description, amount_cents, expense_date, paid_by, payment_method, tags, notes, is_recurring")
        .in("budget_id", ids)
        .is("deleted_at", null)
        .order("expense_date")
        .order("created_at")
        .range(a, b),
    ),
  ]);

  const targetsByMonth = new Map<number, Partial<Record<CategoryKey, number>>>();
  for (const t of targets) {
    const m = monthById.get(t.budget_id);
    const k = keyById.get(t.category_id);
    if (!m || !k) continue;
    const entry = targetsByMonth.get(m) ?? {};
    entry[k] = t.percent_bp;
    targetsByMonth.set(m, entry);
  }

  return {
    year,
    month,
    categories,
    names,
    budgetMonths: [...new Set(monthById.values())].sort((a, b) => a - b),
    targetsByMonth,
    incomes: incomes.flatMap((i) => {
      const m = monthById.get(i.budget_id);
      return m ? [{ month: m, description: i.description, amountCents: i.amount_cents, receivedBy: i.received_by }] : [];
    }),
    expenses: expenses.flatMap((e) => {
      const m = monthById.get(e.budget_id);
      const k = keyById.get(e.category_id);
      return m && k
        ? [
            {
              month: m,
              expenseDate: e.expense_date,
              categoryKey: k,
              description: e.description,
              amountCents: e.amount_cents,
              paidBy: e.paid_by,
              paymentMethod: e.payment_method,
              tags: e.tags,
              notes: e.notes,
              isRecurring: e.is_recurring,
            },
          ]
        : [];
    }),
  };
}

/** Entrada da visão anual a partir dos dados do período. */
export function toAnnualInput(p: PeriodData): AnnualInput {
  return p.budgetMonths.map((month) => {
    const spent: Partial<Record<CategoryKey, number>> = {};
    for (const e of p.expenses) {
      if (e.month === month) spent[e.categoryKey] = sum([spent[e.categoryKey] ?? 0, e.amountCents]);
    }
    return {
      month,
      incomeCents: sum(p.incomes.filter((i) => i.month === month).map((i) => i.amountCents)),
      spentCents: spent,
    };
  });
}
