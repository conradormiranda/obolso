import type { CategoryKey } from "@/lib/supabase/database.types";
import { divRound, sum } from "./math";

/**
 * Resumo do mês (tabela "Resumo" do painel).
 *
 *   Devo gastar   = renda × meta%                    (centavos, arredondado)
 *   Utilizado     = valor gasto ÷ devo gastar         (bp)
 *   Participação  = valor gasto ÷ total gasto         (bp)
 *
 * Correção do bug da ferramenta original: quando renda ou meta é zero,
 * "Utilizado" NÃO é 100%: é "sem meta" (kind: "none").
 */

export type UsageLevel = "ok" | "warn" | "over";
export type Usage = { kind: "none" } | { kind: "pct"; bp: number; level: UsageLevel };

/** Verde até 80%, amarelo acima de 80% até 100%, vermelho acima de 100%. */
export function usageLevel(bp: number): UsageLevel {
  if (bp <= 8000) return "ok";
  if (bp <= 10000) return "warn";
  return "over";
}

export function computeUsage(spentCents: number, budgetCents: number): Usage {
  if (budgetCents <= 0) return { kind: "none" };
  const bp = divRound(spentCents * 10000, budgetCents);
  return { kind: "pct", bp, level: usageLevel(bp) };
}

export type CategoryInfo = { key: CategoryKey; name: string; color: string; sortOrder: number };

export type SummaryInput = {
  incomeCents: number;
  categories: readonly CategoryInfo[];
  targetsBp: Partial<Record<CategoryKey, number>>;
  spentCents: Partial<Record<CategoryKey, number>>;
};

export type SummaryRow = {
  key: CategoryKey;
  name: string;
  color: string;
  targetBp: number;
  spentCents: number;
  shouldSpendCents: number;
  usage: Usage;
  shareBp: number | null;
};

export type Summary = {
  rows: SummaryRow[];
  incomeCents: number;
  totalSpentCents: number;
  remainingCents: number;
  usage: Usage;
};

export function computeSummary(input: SummaryInput): Summary {
  const categories = [...input.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalSpentCents = sum(categories.map((c) => input.spentCents[c.key] ?? 0));

  const rows = categories.map((c): SummaryRow => {
    const targetBp = input.targetsBp[c.key] ?? 0;
    const spentCents = input.spentCents[c.key] ?? 0;
    const shouldSpendCents = input.incomeCents > 0 ? divRound(input.incomeCents * targetBp, 10000) : 0;
    return {
      key: c.key,
      name: c.name,
      color: c.color,
      targetBp,
      spentCents,
      shouldSpendCents,
      usage: computeUsage(spentCents, shouldSpendCents),
      shareBp: totalSpentCents > 0 ? divRound(spentCents * 10000, totalSpentCents) : null,
    };
  });

  return {
    rows,
    incomeCents: input.incomeCents,
    totalSpentCents,
    remainingCents: input.incomeCents - totalSpentCents,
    usage: computeUsage(totalSpentCents, input.incomeCents),
  };
}
