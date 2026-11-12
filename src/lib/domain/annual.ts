import type { CategoryKey } from "@/lib/supabase/database.types";
import { CATEGORY_KEYS } from "./categories";
import { computeUsage, type Usage } from "./summary";
import { sum } from "./math";

/** Visão anual: 12 meses × 6 categorias, com totais (centavos inteiros). */

export type MonthTotals = {
  month: number; // 1..12
  hasBudget: boolean;
  incomeCents: number;
  spentCents: Record<CategoryKey, number>;
  totalSpentCents: number;
};

export type AnnualInput = {
  month: number;
  incomeCents: number;
  spentCents: Partial<Record<CategoryKey, number>>;
}[];

export type Annual = {
  months: MonthTotals[];
  categoryTotals: Record<CategoryKey, number>;
  incomeTotal: number;
  spentTotal: number;
  /** Quanto foi efetivamente para Liberdade financeira no ano, e quanto isso é da renda. */
  freedom: { cents: number; ofIncome: Usage };
};

function emptyByCategory(): Record<CategoryKey, number> {
  return Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])) as Record<CategoryKey, number>;
}

export function computeAnnual(input: AnnualInput): Annual {
  const byMonth = new Map(input.map((m) => [m.month, m]));
  const months: MonthTotals[] = Array.from({ length: 12 }, (_, i) => {
    const m = byMonth.get(i + 1);
    const spent = emptyByCategory();
    for (const k of CATEGORY_KEYS) spent[k] = m?.spentCents[k] ?? 0;
    return {
      month: i + 1,
      hasBudget: Boolean(m),
      incomeCents: m?.incomeCents ?? 0,
      spentCents: spent,
      totalSpentCents: sum(CATEGORY_KEYS.map((k) => spent[k])),
    };
  });
  const categoryTotals = emptyByCategory();
  for (const k of CATEGORY_KEYS) categoryTotals[k] = sum(months.map((m) => m.spentCents[k]));
  const incomeTotal = sum(months.map((m) => m.incomeCents));
  const spentTotal = sum(months.map((m) => m.totalSpentCents));
  const freedomCents = categoryTotals.liberdade_financeira;
  return {
    months,
    categoryTotals,
    incomeTotal,
    spentTotal,
    freedom: { cents: freedomCents, ofIncome: computeUsage(freedomCents, incomeTotal) },
  };
}

export const MONTH_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
