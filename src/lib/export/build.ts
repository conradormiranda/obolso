import { MONTH_SHORT, computeAnnual, type AnnualInput } from "@/lib/domain/annual";
import { CATEGORY_KEYS, PAYMENT_METHOD_LABEL, paidByLabel } from "@/lib/domain/categories";
import { computeSummary, type CategoryInfo } from "@/lib/domain/summary";
import type { CategoryKey, PaidBy, PaymentMethod } from "@/lib/supabase/database.types";
import { toCsv, type CsvCell } from "./csv";
import { bpToFraction, centsToDecimal, isoToBr } from "./format";
import { buildXlsx, type XlsxCell, type XlsxSheet } from "./xlsx";

/** Monta CSV/XLSX de um período a partir de dados já carregados (função pura, testável). */

export type ExportInput = {
  year: number;
  month: number | null;
  categories: CategoryInfo[];
  names: { pai: string; mae: string };
  targetsByMonth: Map<number, Partial<Record<CategoryKey, number>>>;
  annualInput: AnnualInput;
  incomes: { month: number; description: string; amountCents: number; receivedBy: PaidBy }[];
  expenses: {
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
  }[];
};

const EXPENSE_HEADER = ["Data", "Mês", "Categoria", "Descrição", "Valor (R$)", "Quem pagou", "Pagamento", "Recorrente", "Tags", "Observação"];

function monthName(year: number, m: number): string {
  return `${MONTH_SHORT[m - 1]}/${year}`;
}

export function buildCsv(input: ExportInput): string {
  const cat = Object.fromEntries(input.categories.map((c) => [c.key, c.name]));
  const rows: CsvCell[][] = input.expenses.map((e) => [
    { text: isoToBr(e.expenseDate) },
    { text: monthName(input.year, e.month) },
    { text: cat[e.categoryKey] ?? e.categoryKey },
    { text: e.description },
    { number: centsToDecimal(e.amountCents, ",") },
    { text: paidByLabel(e.paidBy, input.names) },
    { text: PAYMENT_METHOD_LABEL[e.paymentMethod] },
    { text: e.isRecurring ? "Sim" : "Não" },
    { text: e.tags.join(", ") },
    { text: e.notes ?? "" },
  ]);
  return toCsv(EXPENSE_HEADER, rows);
}

export function buildWorkbook(input: ExportInput): Uint8Array {
  const cat = Object.fromEntries(input.categories.map((c) => [c.key, c.name]));
  const money = (cents: number): XlsxCell => ({ money: centsToDecimal(cents) });

  const sheets: XlsxSheet[] = [
    {
      name: "Lançamentos",
      header: EXPENSE_HEADER,
      widths: [12, 10, 20, 36, 14, 14, 12, 11, 24, 36],
      rows: input.expenses.map((e) => [
        { text: isoToBr(e.expenseDate) },
        { text: monthName(input.year, e.month) },
        { text: cat[e.categoryKey] ?? e.categoryKey },
        { text: e.description },
        money(e.amountCents),
        { text: paidByLabel(e.paidBy, input.names) },
        { text: PAYMENT_METHOD_LABEL[e.paymentMethod] },
        { text: e.isRecurring ? "Sim" : "Não" },
        { text: e.tags.join(", ") },
        { text: e.notes ?? "" },
      ]),
    },
    {
      name: "Rendas",
      header: ["Mês", "Descrição", "Valor (R$)", "Quem recebeu"],
      widths: [10, 36, 14, 14],
      rows: input.incomes.map((i) => [
        { text: monthName(input.year, i.month) },
        { text: i.description },
        money(i.amountCents),
        { text: paidByLabel(i.receivedBy, input.names) },
      ]),
    },
  ];

  if (input.month !== null) {
    const m = input.annualInput.find((a) => a.month === input.month);
    const summary = computeSummary({
      incomeCents: m?.incomeCents ?? 0,
      categories: input.categories,
      targetsBp: input.targetsByMonth.get(input.month) ?? {},
      spentCents: m?.spentCents ?? {},
    });
    sheets.push({
      name: "Resumo",
      header: ["Categoria", "Meta", "Valor gasto (R$)", "Devo gastar (R$)", "Utilizado", "Participação"],
      widths: [22, 8, 16, 16, 11, 13],
      rows: [
        ...summary.rows.map((r): XlsxCell[] => [
          { text: r.name },
          { percent: bpToFraction(r.targetBp) },
          money(r.spentCents),
          money(r.shouldSpendCents),
          r.usage.kind === "pct" ? { percent: bpToFraction(r.usage.bp) } : { text: "sem meta" },
          r.shareBp === null ? { text: "—" } : { percent: bpToFraction(r.shareBp) },
        ]),
        [{ text: "Renda do mês" }, null, money(summary.incomeCents), null, null, null],
        [{ text: "Total gasto" }, null, money(summary.totalSpentCents), null, null, null],
        [{ text: "Ainda posso gastar" }, null, money(summary.remainingCents), null, null, null],
      ],
    });
  } else {
    const annual = computeAnnual(input.annualInput);
    sheets.push({
      name: "Resumo anual",
      header: ["Mês", ...CATEGORY_KEYS.map((k) => cat[k] ?? k), "Total gasto", "Renda"],
      widths: [8, ...CATEGORY_KEYS.map(() => 16), 16, 16],
      rows: [
        ...annual.months.map((m): XlsxCell[] => [
          { text: MONTH_SHORT[m.month - 1] ?? "" },
          ...CATEGORY_KEYS.map((k) => money(m.spentCents[k])),
          money(m.totalSpentCents),
          money(m.incomeCents),
        ]),
        [{ text: "Total" }, ...CATEGORY_KEYS.map((k) => money(annual.categoryTotals[k])), money(annual.spentTotal), money(annual.incomeTotal)],
      ],
    });
  }
  return buildXlsx(sheets);
}
