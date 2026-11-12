import { describe, expect, it } from "vitest";
import { divRound, formatBp, parsePercentToBp, roundBpTo1Decimal, sum } from "@/lib/domain/math";
import { computeSummary, computeUsage, usageLevel, type CategoryInfo } from "@/lib/domain/summary";
import { DEFAULT_TARGETS_BP } from "@/lib/domain/categories";

const CATS: CategoryInfo[] = [
  { key: "custos_fixos", name: "Custos fixos", color: "#5BC0EB", sortOrder: 1 },
  { key: "conforto", name: "Conforto", color: "#4FE3C1", sortOrder: 2 },
  { key: "metas", name: "Metas", color: "#F2E94E", sortOrder: 3 },
  { key: "prazeres", name: "Prazeres", color: "#F28CE6", sortOrder: 4 },
  { key: "liberdade_financeira", name: "Liberdade financeira", color: "#6C8CF5", sortOrder: 5 },
  { key: "conhecimento", name: "Conhecimento", color: "#F7931E", sortOrder: 6 },
];

describe("aritmética inteira", () => {
  it("divRound arredonda half-up sem float", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(4, 3)).toBe(1);
    expect(divRound(0, 7)).toBe(0);
    expect(divRound(100_000_000_000 * 10000, 3)).toBe(333_333_333_333_333);
    expect(() => divRound(1, 0)).toThrow();
    expect(() => divRound(0.5, 1)).toThrow();
  });

  it("soma detecta overflow", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(() => sum([Number.MAX_SAFE_INTEGER, 1])).toThrow();
  });

  it("percentuais", () => {
    expect(parsePercentToBp("40")).toBe(4000);
    expect(parsePercentToBp("12,5")).toBe(1250);
    expect(parsePercentToBp("12.5%")).toBe(1250);
    expect(parsePercentToBp("0,25")).toBe(25);
    expect(parsePercentToBp("100")).toBe(10000);
    for (const bad of ["101", "-5", "abc", "1,234", "", "1e2"]) expect(parsePercentToBp(bad)).toBeNull();
    expect(formatBp(4000)).toBe("40%");
    expect(formatBp(1250)).toBe("12,5%");
    expect(formatBp(3333)).toBe("33,33%");
    expect(formatBp(123456, 1)).toBe("1.234,5%");
    expect(formatBp(roundBpTo1Decimal(1205), 1)).toBe("12,1%");
  });
});

describe("Utilizado", () => {
  it("faixas de cor: verde até 80%, amarelo até 100%, vermelho acima", () => {
    expect(usageLevel(0)).toBe("ok");
    expect(usageLevel(8000)).toBe("ok");
    expect(usageLevel(8001)).toBe("warn");
    expect(usageLevel(10000)).toBe("warn");
    expect(usageLevel(10001)).toBe("over");
  });

  it("CORREÇÃO DO BUG: meta ou renda zero é 'sem meta', nunca 100%", () => {
    expect(computeUsage(0, 0)).toEqual({ kind: "none" });
    expect(computeUsage(50000, 0)).toEqual({ kind: "none" });
  });

  it("nada gasto com meta definida é 0%", () => {
    expect(computeUsage(0, 100000)).toEqual({ kind: "pct", bp: 0, level: "ok" });
  });
});

describe("computeSummary", () => {
  it("renda zero (estado da tela original): todas as linhas 'sem meta'", () => {
    const s = computeSummary({ incomeCents: 0, categories: CATS, targetsBp: DEFAULT_TARGETS_BP, spentCents: {} });
    expect(s.rows.every((r) => r.usage.kind === "none")).toBe(true);
    expect(s.rows.every((r) => r.shareBp === null)).toBe(true);
    expect(s.usage).toEqual({ kind: "none" });
    expect(s.totalSpentCents).toBe(0);
    expect(s.remainingCents).toBe(0);
  });

  it("calcula devo gastar, utilizado e participação em centavos/bp", () => {
    const s = computeSummary({
      incomeCents: 2_000_000, // R$ 20.000,00
      categories: CATS,
      targetsBp: DEFAULT_TARGETS_BP,
      spentCents: {
        custos_fixos: 876_870, // R$ 8.768,70 (seed Nov/2026)
        conforto: 250_900, // R$ 2.509,00
        prazeres: 360_450, // R$ 3.604,50
      },
    });
    const by = Object.fromEntries(s.rows.map((r) => [r.key, r]));
    expect(by.custos_fixos?.shouldSpendCents).toBe(800_000);
    expect(by.custos_fixos?.usage).toEqual({ kind: "pct", bp: 10961, level: "over" });
    expect(by.conforto?.shouldSpendCents).toBe(200_000);
    expect(by.conforto?.usage).toEqual({ kind: "pct", bp: 12545, level: "over" });
    expect(by.metas?.usage).toEqual({ kind: "pct", bp: 0, level: "ok" });
    expect(by.liberdade_financeira?.shouldSpendCents).toBe(500_000);
    expect(s.totalSpentCents).toBe(1_488_220);
    expect(s.remainingCents).toBe(511_780);
    expect(s.usage).toEqual({ kind: "pct", bp: 7441, level: "ok" });
    const shares = s.rows.map((r) => r.shareBp ?? 0);
    expect(Math.abs(shares.reduce((a, b) => a + b, 0) - 10000)).toBeLessThanOrEqual(3);
  });

  it("meta de 0% em uma categoria com gasto: 'sem meta' só nela", () => {
    const s = computeSummary({
      incomeCents: 1_000_000,
      categories: CATS,
      targetsBp: { ...DEFAULT_TARGETS_BP, metas: 0, liberdade_financeira: 3500 },
      spentCents: { metas: 10_000 },
    });
    const metas = s.rows.find((r) => r.key === "metas");
    expect(metas?.usage).toEqual({ kind: "none" });
    expect(metas?.shareBp).toBe(10000);
  });

  it("gasto acima da renda deixa saldo negativo e uso geral vermelho", () => {
    const s = computeSummary({ incomeCents: 100_000, categories: CATS, targetsBp: DEFAULT_TARGETS_BP, spentCents: { prazeres: 150_000 } });
    expect(s.remainingCents).toBe(-50_000);
    expect(s.usage).toEqual({ kind: "pct", bp: 15000, level: "over" });
  });
});
