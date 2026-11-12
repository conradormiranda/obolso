import { describe, expect, it } from "vitest";
import { maskBrlDigits } from "@/lib/domain/brl-mask";
import { buildSuggestions, filterSuggestions, findDuplicates, findSuggestion, normalizeText } from "@/lib/domain/text";
import { parseBrlToCents } from "@/lib/validation/money";
import type { CategoryKey } from "@/lib/supabase/database.types";

/** Seed de Nov/2026 (seção 8). */
const SEED: { description: string; categoryKey: CategoryKey }[] = [
  ...["Aluguel", "Água", "Gás", "Luz", "Plano de Saúde", "Empréstimo Alberto", "ChatGPT"].map((d) => ({
    description: d,
    categoryKey: "custos_fixos" as const,
  })),
  ...["Valmir Nunes treinador", "Fisioterapia", "Contabilizei contador", "ChatGPT", "Claude", "Elevenlabs", "Wellhub academia"].map(
    (d) => ({ description: d, categoryKey: "conforto" as const }),
  ),
  ...["iPhone Naiara", "Salomon Brasil", "Restaurante Itaici", "Restaurante Camarada", "Restaurante"].map((d) => ({
    description: d,
    categoryKey: "prazeres" as const,
  })),
];

describe("alerta de duplicidade", () => {
  it("dispara para ChatGPT no seed de Nov/2026 (Custos fixos + Conforto) e só para ele", () => {
    expect(findDuplicates(SEED)).toEqual([{ description: "ChatGPT", categories: ["custos_fixos", "conforto"] }]);
  });

  it("ignora maiúsculas, acentos e espaços; mesma categoria repetida não é duplicidade", () => {
    const d = findDuplicates([
      { description: "Plano de Saúde", categoryKey: "custos_fixos" },
      { description: "plano  de saude", categoryKey: "conforto" },
      { description: "Luz", categoryKey: "custos_fixos" },
      { description: "luz", categoryKey: "custos_fixos" },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]?.categories).toEqual(["custos_fixos", "conforto"]);
  });
});

describe("autocompletar", () => {
  const recent = [
    { description: "Restaurante Camarada", categoryKey: "prazeres" as const },
    { description: "ChatGPT", categoryKey: "conforto" as const },
    { description: "chatgpt", categoryKey: "custos_fixos" as const }, // mais antigo
    { description: "Água", categoryKey: "custos_fixos" as const },
  ];
  const list = buildSuggestions(recent);

  it("deduplica mantendo a categoria usada da última vez", () => {
    expect(list).toHaveLength(3);
    expect(findSuggestion(list, "CHATGPT")?.categoryKey).toBe("conforto");
  });

  it("filtra por início e depois por conteúdo, sem acento", () => {
    expect(filterSuggestions(list, "agu").map((s) => s.description)).toEqual(["Água"]);
    expect(filterSuggestions(list, "camar").map((s) => s.description)).toEqual(["Restaurante Camarada"]);
    expect(filterSuggestions(list, "")).toEqual([]);
    expect(normalizeText("  Ação  É ")).toBe("acao e");
  });
});

describe("máscara BRL do lançamento rápido", () => {
  it.each([
    ["", ""],
    ["5", "0,05"],
    ["50", "0,50"],
    ["500", "5,00"],
    ["570000", "5.700,00"],
    ["00012", "0,12"],
    ["R$ 1.234,56", "1.234,56"],
    ["abc", ""],
  ])("%j → %j", (input, out) => {
    expect(maskBrlDigits(input)).toBe(out);
  });

  it("o resultado da máscara é aceito pelo parser do servidor", () => {
    expect(parseBrlToCents(maskBrlDigits("44150"))).toBe(44150);
    expect(parseBrlToCents(maskBrlDigits("1234567890123"))).toBe(1234567890123);
  });
});
