import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { computeAnnual } from "@/lib/domain/annual";
import { toCsv } from "@/lib/export/csv";
import { bpToFraction, centsToDecimal, isoToBr } from "@/lib/export/format";
import { buildXlsx } from "@/lib/export/xlsx";

describe("visão anual", () => {
  it("12 meses × 6 categorias com totais e Liberdade financeira do ano", () => {
    const a = computeAnnual([
      { month: 1, incomeCents: 1_000_000, spentCents: { custos_fixos: 400_000, liberdade_financeira: 250_000 } },
      { month: 11, incomeCents: 2_400_000, spentCents: { prazeres: 360_450, liberdade_financeira: 600_000 } },
    ]);
    expect(a.months).toHaveLength(12);
    expect(a.months[1]?.hasBudget).toBe(false);
    expect(a.months[0]?.totalSpentCents).toBe(650_000);
    expect(a.categoryTotals.liberdade_financeira).toBe(850_000);
    expect(a.incomeTotal).toBe(3_400_000);
    expect(a.spentTotal).toBe(1_610_450);
    expect(a.freedom).toEqual({ cents: 850_000, ofIncome: { kind: "pct", bp: 2500, level: "ok" } });
  });

  it("ano sem renda: liberdade 'sem meta' (sem divisão por zero)", () => {
    expect(computeAnnual([]).freedom.ofIncome).toEqual({ kind: "none" });
  });
});

describe("formatação de exportação (inteiros → texto)", () => {
  it("centavos e percentuais", () => {
    expect(centsToDecimal(123456)).toBe("1234.56");
    expect(centsToDecimal(5, ",")).toBe("0,05");
    expect(centsToDecimal(100_000_000_000)).toBe("1000000000.00");
    expect(centsToDecimal(-44150, ",")).toBe("-441,50");
    expect(bpToFraction(1250)).toBe("0.125");
    expect(bpToFraction(10000)).toBe("1");
    expect(bpToFraction(10961)).toBe("1.0961");
    expect(bpToFraction(0)).toBe("0");
    expect(isoToBr("2026-11-05")).toBe("05/11/2026");
  });
});

describe("CSV", () => {
  it("BOM, ';', aspas e proteção contra fórmula", () => {
    const csv = toCsv(["Descrição", "Valor"], [
      [{ text: "=HYPERLINK(\"http://x\")" }, { number: "10,00" }],
      [{ text: "Aluguel; casa" }, { number: "5700,00" }],
      [{ text: "+55 11" }, null],
      [{ text: "@SUM(A1)" }, { number: "1,00" }],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Descrição;Valor");
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x"")";10,00`);
    expect(lines[2]).toBe(`"Aluguel; casa";5700,00`);
    expect(lines[3]).toBe("'+55 11;");
    expect(lines[4]).toBe("'@SUM(A1);1,00");
  });
});

describe("XLSX", () => {
  it("gera pacote OOXML válido com estilos de moeda e texto escapado", () => {
    const bytes = buildXlsx([
      {
        name: "Lançamentos",
        header: ["Descrição", "Valor", "Uso"],
        rows: [
          [{ text: "<script>&\"x\"" }, { money: "1234.56" }, { percent: "0.125" }],
          [null, { money: "0.05" }, null],
        ],
        widths: [30, 14, 8],
      },
      { name: "Resumo/2026", header: ["A"], rows: [] },
    ]);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]),
    );
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
    expect(sheet).toContain("&lt;script&gt;&amp;&quot;x&quot;");
    expect(sheet).toContain('<c r="B2" s="2"><v>1234.56</v></c>');
    expect(sheet).toContain('<c r="C2" s="3"><v>0.125</v></c>');
    expect(sheet).not.toContain("<script>");
    const wb = strFromU8(files["xl/workbook.xml"] ?? new Uint8Array());
    expect(wb).toContain('name="Resumo 2026"');
  });

  it("recusa valor monetário malformado", () => {
    expect(() => buildXlsx([{ name: "x", header: ["v"], rows: [[{ money: "1e5" }]] }])).toThrow();
  });
});

describe("montagem da exportação", async () => {
  const { buildCsv, buildWorkbook } = await import("@/lib/export/build");
  const categories = [
    { key: "custos_fixos" as const, name: "Custos fixos", color: "#000000", sortOrder: 1 },
    { key: "conforto" as const, name: "Conforto", color: "#000000", sortOrder: 2 },
    { key: "metas" as const, name: "Metas", color: "#000000", sortOrder: 3 },
    { key: "prazeres" as const, name: "Prazeres", color: "#000000", sortOrder: 4 },
    { key: "liberdade_financeira" as const, name: "Liberdade financeira", color: "#000000", sortOrder: 5 },
    { key: "conhecimento" as const, name: "Conhecimento", color: "#000000", sortOrder: 6 },
  ];
  const input = {
    year: 2026,
    month: 11,
    categories,
    names: { pai: "Pai", mae: "Mãe" },
    targetsByMonth: new Map([[11, { custos_fixos: 4000, conforto: 1000, metas: 1000, prazeres: 1000, liberdade_financeira: 2500, conhecimento: 500 }]]),
    annualInput: [{ month: 11, incomeCents: 2_400_000, spentCents: { custos_fixos: 876_870 } }],
    incomes: [{ month: 11, description: "Salário", amountCents: 2_400_000, receivedBy: "pai" as const }],
    expenses: [
      {
        month: 11,
        expenseDate: "2026-11-01",
        categoryKey: "custos_fixos" as const,
        description: "Aluguel",
        amountCents: 570_000,
        paidBy: "conjunto" as const,
        paymentMethod: "boleto" as const,
        tags: ["Casa"],
        notes: null,
        isRecurring: true,
      },
    ],
  };

  it("CSV do mês com valores em centavos exatos", () => {
    const lines = buildCsv(input).slice(1).split("\r\n");
    expect(lines[1]).toBe("01/11/2026;Nov/2026;Custos fixos;Aluguel;5700,00;Conjunto;Boleto;Sim;Casa;");
  });

  it("XLSX do mês tem Lançamentos, Rendas e Resumo", () => {
    const files = unzipSync(buildWorkbook(input));
    expect(Object.keys(files).filter((f) => f.startsWith("xl/worksheets/"))).toHaveLength(3);
    const resumo = strFromU8(files["xl/worksheets/sheet3.xml"] ?? new Uint8Array());
    expect(resumo).toContain("<v>8768.70</v>");
    expect(resumo).toContain("<v>0.9134</v>"); // 8.768,70 / 9.600,00 = 0,91340…
  });

  it("XLSX do ano tem resumo 12 meses", () => {
    const files = unzipSync(buildWorkbook({ ...input, month: null }));
    const wb = strFromU8(files["xl/workbook.xml"] ?? new Uint8Array());
    expect(wb).toContain("Resumo anual");
    const sheet = strFromU8(files["xl/worksheets/sheet3.xml"] ?? new Uint8Array());
    expect((sheet.match(/<row /g) ?? []).length).toBe(14); // cabeçalho + 12 meses + total
  });
});

describe("auditoria legível", async () => {
  const { describeAudit } = await import("@/lib/domain/audit");
  it("alteração de valor mostra antes → depois e campos alterados", () => {
    const v = describeAudit({
      table_name: "expenses",
      action: "UPDATE",
      before: { description: "Aluguel", amount_cents: 570000, updated_at: "a" },
      after: { description: "Aluguel", amount_cents: 590000, updated_at: "b" },
    });
    expect(v).toEqual({
      title: "Lançamento alterado",
      description: "Aluguel",
      amountCents: 590000,
      previousAmountCents: 570000,
      changedFields: ["valor"],
    });
  });
  it("exclusão lógica e restauração", () => {
    expect(describeAudit({ table_name: "expenses", action: "SOFT_DELETE", before: null, after: { description: "X" } }).title).toBe(
      "Lançamento excluído",
    );
    expect(describeAudit({ table_name: "incomes", action: "RESTORE", before: null, after: null }).title).toBe("Renda restaurada");
  });
});

describe("user agent", async () => {
  const { describeUserAgent } = await import("@/lib/domain/user-agent");
  it("resume navegador e sistema", () => {
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari no iPhone");
    expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe("Chrome no Android");
    expect(describeUserAgent("")).toBe("Dispositivo desconhecido");
  });
});
