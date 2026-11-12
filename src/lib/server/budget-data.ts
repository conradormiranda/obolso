import "server-only";
import type { CategoryKey, PaidBy, PaymentMethod } from "@/lib/supabase/database.types";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { monthToDb, type MonthRef } from "@/lib/domain/month";
import { sum } from "@/lib/domain/math";
import type { CategoryInfo } from "@/lib/domain/summary";

/**
 * Leitura dos dados de um mês. Sempre com o cliente do usuário (anon key +
 * sessão): o RLS garante que só membros aal2 do household enxergam algo.
 */

export type Category = CategoryInfo & { id: string };

export type Expense = {
  id: string;
  categoryKey: CategoryKey;
  description: string;
  amountCents: number;
  expenseDate: string;
  paidBy: PaidBy;
  paymentMethod: PaymentMethod;
  tags: string[];
  notes: string | null;
};

export type Income = { id: string; description: string; amountCents: number; receivedBy: PaidBy };

export type MemberNames = { pai: string; mae: string };

export type MonthData = {
  categories: Category[];
  names: MemberNames;
  budgetId: string | null;
  targetsBp: Partial<Record<CategoryKey, number>>;
  incomes: Income[];
  incomeCents: number;
  expenses: Expense[];
  spentCents: Partial<Record<CategoryKey, number>>;
};

export class DataError extends Error {}

export async function loadCategories(supabase: AppSupabaseClient): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("id, key, name, color, sort_order").order("sort_order");
  if (error) throw new DataError("categorias");
  return data.map((c) => ({ id: c.id, key: c.key, name: c.name, color: c.color, sortOrder: c.sort_order }));
}

export async function loadMemberNames(supabase: AppSupabaseClient): Promise<MemberNames> {
  const { data, error } = await supabase.from("household_members").select("role, display_name");
  if (error) throw new DataError("membros");
  return {
    pai: data.find((m) => m.role === "pai")?.display_name ?? "Pai",
    mae: data.find((m) => m.role === "mae")?.display_name ?? "Mãe",
  };
}

export async function findBudgetId(supabase: AppSupabaseClient, ref: MonthRef): Promise<string | null> {
  const { data, error } = await supabase.from("monthly_budgets").select("id").eq("month", monthToDb(ref)).maybeSingle();
  if (error) throw new DataError("orçamento");
  return data?.id ?? null;
}

export async function loadMonth(supabase: AppSupabaseClient, ref: MonthRef): Promise<MonthData> {
  const [categories, names, budgetId] = await Promise.all([
    loadCategories(supabase),
    loadMemberNames(supabase),
    findBudgetId(supabase, ref),
  ]);
  const keyById = new Map(categories.map((c) => [c.id, c.key]));

  if (!budgetId) {
    return { categories, names, budgetId: null, targetsBp: {}, incomes: [], incomeCents: 0, expenses: [], spentCents: {} };
  }

  const [targetsRes, incomesRes, expensesRes] = await Promise.all([
    supabase.from("category_targets").select("category_id, percent_bp").eq("budget_id", budgetId),
    supabase.from("incomes").select("id, description, amount_cents, received_by").eq("budget_id", budgetId).order("created_at"),
    supabase
      .from("expenses")
      .select("id, category_id, description, amount_cents, expense_date, paid_by, payment_method, tags, notes")
      .eq("budget_id", budgetId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (targetsRes.error || incomesRes.error || expensesRes.error) throw new DataError("mês");

  const targetsBp: Partial<Record<CategoryKey, number>> = {};
  for (const t of targetsRes.data) {
    const key = keyById.get(t.category_id);
    if (key) targetsBp[key] = t.percent_bp;
  }

  const incomes = incomesRes.data.map((i) => ({
    id: i.id,
    description: i.description,
    amountCents: i.amount_cents,
    receivedBy: i.received_by,
  }));

  const expenses: Expense[] = [];
  const spentCents: Partial<Record<CategoryKey, number>> = {};
  for (const e of expensesRes.data) {
    const key = keyById.get(e.category_id);
    if (!key) continue;
    expenses.push({
      id: e.id,
      categoryKey: key,
      description: e.description,
      amountCents: e.amount_cents,
      expenseDate: e.expense_date,
      paidBy: e.paid_by,
      paymentMethod: e.payment_method,
      tags: e.tags,
      notes: e.notes,
    });
    spentCents[key] = sum([spentCents[key] ?? 0, e.amount_cents]);
  }

  return {
    categories,
    names,
    budgetId,
    targetsBp,
    incomes,
    incomeCents: sum(incomes.map((i) => i.amountCents)),
    expenses,
    spentCents,
  };
}

export async function loadExpense(supabase: AppSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, budget_id, category_id, description, amount_cents, expense_date, paid_by, payment_method, tags, notes, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new DataError("lançamento");
  return data;
}
