import { describe, expect, it } from "vitest";
import { addMonths, defaultEntryDate, isValidIsoDate, monthLabel, parseMonthParam } from "@/lib/domain/month";
import { categoryFromSlug } from "@/lib/domain/categories";
import { expenseFormSchema, incomeFormSchema, targetsSchema } from "@/lib/validation/budget";

const validExpense = {
  month: "2026-11",
  category: "custos_fixos",
  description: "Aluguel",
  amount: "5.700,00",
  expenseDate: "2026-11-05",
  paidBy: "conjunto",
  paymentMethod: "boleto",
  tags: "Casa, casa ,  Saúde",
  notes: "",
};

describe("lançamento (validação no servidor)", () => {
  it("aceita e normaliza um lançamento válido", () => {
    const r = expenseFormSchema.parse(validExpense);
    expect(r.amount).toBe(570000);
    expect(r.tags).toEqual(["Casa", "casa", "Saúde"]);
    expect(r.notes).toBeNull();
  });

  it.each([
    ["valor negativo", { amount: "-10,00" }],
    ["valor zero", { amount: "0,00" }],
    ["valor texto", { amount: "dez reais" }],
    ["acima de 1 bilhão", { amount: "1.000.000.000,01" }],
    ["script na descrição", { description: "<script>alert(1)</script>" }],
    ["descrição vazia", { description: "   " }],
    ["categoria inexistente", { category: "cassino" }],
    ["data impossível", { expenseDate: "2026-02-30" }],
    ["quem pagou inválido", { paidBy: "vizinho" }],
    ["forma de pagamento inválida", { paymentMethod: "cheque" }],
    ["tag com marcação", { tags: "<b>x</b>" }],
    ["mês inválido", { month: "2026-13" }],
  ])("rejeita %s", (_label, patch) => {
    expect(expenseFormSchema.safeParse({ ...validExpense, ...patch }).success).toBe(false);
  });

  it("renda: mesmas regras de valor e texto", () => {
    const ok = { month: "2026-11", description: "Salário", amount: "12.000,00", receivedBy: "pai" };
    expect(incomeFormSchema.parse(ok).amount).toBe(1_200_000);
    expect(incomeFormSchema.safeParse({ ...ok, amount: "-1" }).success).toBe(false);
    expect(incomeFormSchema.safeParse({ ...ok, receivedBy: "filho" }).success).toBe(false);
  });
});

describe("metas", () => {
  const base = { custos_fixos: "40", conforto: "10", metas: "10", prazeres: "10", liberdade_financeira: "25", conhecimento: "5" };
  it("soma exatamente 100%", () => {
    expect(targetsSchema.parse(base).custos_fixos).toBe(4000);
    expect(targetsSchema.safeParse({ ...base, conhecimento: "4" }).success).toBe(false);
    expect(targetsSchema.safeParse({ ...base, custos_fixos: "39,5", conhecimento: "5,5" }).success).toBe(true);
    expect(targetsSchema.safeParse({ ...base, custos_fixos: "abc" }).success).toBe(false);
  });
});

describe("meses", () => {
  it("parse, navegação e rótulo", () => {
    expect(parseMonthParam("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam("2026-1")).toBeNull();
    expect(parseMonthParam("1999-12")).toBeNull();
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthLabel({ year: 2026, month: 11 })).toBe("Novembro/2026");
  });

  it("datas", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    const now = new Date("2026-11-12T15:00:00Z");
    expect(defaultEntryDate({ year: 2026, month: 11 }, now)).toBe("2026-11-12");
    expect(defaultEntryDate({ year: 2026, month: 10 }, now)).toBe("2026-10-01");
  });

  it("slugs de categoria", () => {
    expect(categoryFromSlug("custos-fixos")).toBe("custos_fixos");
    expect(categoryFromSlug("hack")).toBeNull();
  });
});
