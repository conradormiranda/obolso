import { describe, expect, it } from "vitest";
import { MAX_AMOUNT_CENTS, amountCentsSchema, brlInputSchema, formatCents, parseBrlToCents } from "@/lib/validation/money";

describe("parseBrlToCents", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234,5", 123450],
    ["1234", 123400],
    ["R$ 5.700,00", 570000],
    ["170,70", 17070],
    ["0,01", 1],
    ["1.000.000.000,00", 100000000000],
  ])("%s → %d centavos", (input, cents) => {
    expect(parseBrlToCents(input)).toBe(cents);
  });

  it.each(["-10,00", "abc", "10,999", "1,2,3", "1.23,00", "", "10.5", "1e5", "<script>", "  ", "Infinity", "0x10"])(
    "rejeita %j",
    (input) => {
      expect(parseBrlToCents(input)).toBeNull();
    },
  );
});

describe("amountCentsSchema / brlInputSchema (validação no servidor)", () => {
  it("rejeita negativos, zero, frações e acima de R$ 1 bilhão", () => {
    expect(amountCentsSchema.safeParse(-1).success).toBe(false);
    expect(amountCentsSchema.safeParse(0).success).toBe(false);
    expect(amountCentsSchema.safeParse(10.5).success).toBe(false);
    expect(amountCentsSchema.safeParse(MAX_AMOUNT_CENTS + 1).success).toBe(false);
    expect(amountCentsSchema.safeParse("100").success).toBe(false);
    expect(amountCentsSchema.safeParse(MAX_AMOUNT_CENTS).success).toBe(true);
  });

  it("converte texto BRL válido e rejeita texto inválido", () => {
    expect(brlInputSchema.parse("441,50")).toBe(44150);
    expect(brlInputSchema.safeParse("1.000.000.000,01").success).toBe(false);
    expect(brlInputSchema.safeParse("dez reais").success).toBe(false);
    expect(brlInputSchema.safeParse("0,00").success).toBe(false);
  });
});

describe("formatCents", () => {
  it("formata em pt-BR sem erro de arredondamento", () => {
    const nbsp = / /g;
    expect(formatCents(570000).replace(nbsp, " ")).toBe("R$ 5.700,00");
    expect(formatCents(17070).replace(nbsp, " ")).toBe("R$ 170,70");
    expect(formatCents(1).replace(nbsp, " ")).toBe("R$ 0,01");
    expect(formatCents(100000000000).replace(nbsp, " ")).toBe("R$ 1.000.000.000,00");
    expect(formatCents(-44150).replace(nbsp, " ")).toBe("-R$ 441,50");
  });
});
