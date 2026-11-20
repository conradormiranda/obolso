import { describe, expect, it } from "vitest";
import { buildHistory, isLikelyDuplicate, merchantKey, suggestCategory } from "@/lib/import/categorize";
import { extractInstallment, parseDate, parseSignedCents, parseStatement, paymentMethodFromAccount, StatementError } from "@/lib/import/statement";

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261105000000[-3:BRT]
<TRNAMT>-104.00
<FITID>abc1
<MEMO>RESTAURANTE ITAICI
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261107
<TRNAMT>-333.33
<FITID>abc2
<MEMO>MAGAZINE LUIZA 03/10
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261110
<TRNAMT>2500.00
<FITID>abc3
<MEMO>PAGAMENTO EFETUADO
</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1>
</OFX>`;

describe("valores e datas sem float", () => {
  it.each([
    ["1.234,56", 123456],
    ["-1234.56", -123456],
    ["1,234.56", 123456],
    ["R$ 50", 5000],
    ["(12,00)", -1200],
    ["104.00", 10400],
    ["0,5", 50],
    ["15,00-", -1500],
  ])("%s → %d", (input, cents) => {
    expect(parseSignedCents(input)).toBe(cents);
  });
  it("rejeita lixo", () => {
    expect(parseSignedCents("abc")).toBeNull();
    expect(parseSignedCents("12a")).toBeNull();
  });
  it("datas", () => {
    expect(parseDate("05/11/2026")).toBe("2026-11-05");
    expect(parseDate("5/11/26")).toBe("2026-11-05");
    expect(parseDate("2026-11-05")).toBe("2026-11-05");
    expect(parseDate("20261105000000[-3:BRT]")).toBe("2026-11-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });
});

describe("parcelas na descrição", () => {
  it.each([
    ["MAGAZINE LUIZA 03/10", "MAGAZINE LUIZA", 3, 10],
    ["LOJA X PARC 2/6", "LOJA X", 2, 6],
    ["LOJA Y - Parcela 4 de 12", "LOJA Y", 4, 12],
    ["APPLE (1/3)", "APPLE", 1, 3],
  ])("%s", (input, base, n, t) => {
    expect(extractInstallment(input)).toEqual({ base, installment: { number: n, total: t } });
  });
  it("datas e números soltos não viram parcela", () => {
    expect(extractInstallment("POSTO 24 HORAS").installment).toBeNull();
    expect(extractInstallment("LOJA 12/2026").installment).toBeNull();
  });
});

describe("OFX", () => {
  it("lê compras, parcelas e ignora pagamento", () => {
    const r = parseStatement(OFX);
    expect(r.format).toBe("ofx");
    expect(r.ignored).toBe(1);
    expect(r.lines).toEqual([
      { date: "2026-11-05", description: "RESTAURANTE ITAICI", amountCents: 10400, installment: null, paymentMethod: "credito", externalId: "abc1" },
      { date: "2026-11-07", description: "MAGAZINE LUIZA", amountCents: 33333, installment: { number: 3, total: 10 }, paymentMethod: "credito", externalId: "abc2" },
    ]);
  });
});

describe("CSV", () => {
  it("formato Itaú/Bradesco (; e vírgula decimal, compras positivas)", () => {
    const csv = "data;lançamento;valor\n05/11/2026;RESTAURANTE CAMARADA;441,50\n06/11/2026;PAGAMENTO FATURA;-2.000,00\n07/11/2026;SHOPEE 02/05;59,90\n";
    const r = parseStatement(csv);
    expect(r.format).toBe("csv");
    expect(r.ignored).toBe(1);
    expect(r.lines.map((l) => [l.date, l.description, l.amountCents, l.installment])).toEqual([
      ["2026-11-05", "RESTAURANTE CAMARADA", 44150, null],
      ["2026-11-07", "SHOPEE", 5990, { number: 2, total: 5 }],
    ]);
  });
  it("formato com , e compras negativas, aspas e BOM", () => {
    const csv = '﻿Date,Description,Amount\n2026-11-03,"Uber *Trip, SP",-23.40\n2026-11-04,Netflix,-55.90\n2026-11-05,Estorno Netflix,55.90\n';
    const r = parseStatement(csv);
    expect(r.lines.map((l) => [l.description, l.amountCents])).toEqual([
      ["Uber *Trip, SP", 2340],
      ["Netflix", 5590],
    ]);
    expect(r.ignored).toBe(1);
  });
  it("descrição com marcação é limpa", () => {
    const r = parseStatement("data;descricao;valor\n05/11/2026;<script>LOJA</script>;10,00\n");
    expect(r.lines[0]?.description).toBe("script LOJA /script");
  });
  it("erros claros", () => {
    expect(() => parseStatement("qualquer coisa\nsem colunas")).toThrow(StatementError);
    expect(() => parseStatement("data;descricao;valor\n")).toThrow(StatementError);
  });
});

const OFX_CONTA = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341</BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>12000.00<FITID>c1<MEMO>SALARIO EMPRESA X</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-3500.00<FITID>c2<MEMO>PIX ENVIADO IMOBILIARIA ALUGUEL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261107<TRNAMT>-8000.00<FITID>c3<MEMO>PAGTO FATURA CARTAO ITAUCARD</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261108<TRNAMT>-210.55<FITID>c4<MEMO>PAGTO BOLETO ENEL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261109<TRNAMT>-45.00<FITID>c5<MEMO>COMPRA CARTAO DEB PADARIA REAL</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261110<TRNAMT>300.00<FITID>c6<MEMO>PIX RECEBIDO MARIA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("extrato da conta corrente", () => {
  it("OFX de conta: gastos com forma de pagamento, entradas viram renda, fatura do cartão é ignorada", () => {
    const r = parseStatement(OFX_CONTA);
    expect(r.kind).toBe("conta");
    expect(r.kindDetected).toBe(true);
    expect(r.cardBillPayments).toBe(1);
    expect(r.lines.map((l) => [l.description, l.amountCents, l.paymentMethod])).toEqual([
      ["PIX ENVIADO IMOBILIARIA ALUGUEL", 350000, "pix"],
      ["PAGTO BOLETO ENEL", 21055, "boleto"],
      ["COMPRA CARTAO DEB PADARIA REAL", 4500, "debito"],
    ]);
    expect(r.incomes).toEqual([
      { date: "2026-11-05", description: "SALARIO EMPRESA X", amountCents: 1200000, suggested: true },
      { date: "2026-11-10", description: "PIX RECEBIDO MARIA", amountCents: 30000, suggested: false },
    ]);
  });
  it("CSV Itaú (valor com sinal, coluna de saldo, linhas de saldo ignoradas)", () => {
    const csv = "data;lançamento;ag./origem;valor (R$);saldos (R$)\n04/11/2026;SALDO ANTERIOR;;;1.000,00\n05/11/2026;PIX TRANSF JOAO;;-150,00;850,00\n05/11/2026;SAQUE 24H;;-100,00;750,00\n06/11/2026;REMUNERACAO/SALARIO;;5.000,00;5.750,00\n06/11/2026;SALDO DO DIA;;;5.750,00\n";
    const r = parseStatement(csv);
    expect(r.kind).toBe("conta");
    expect(r.lines.map((l) => [l.description, l.amountCents, l.paymentMethod])).toEqual([
      ["PIX TRANSF JOAO", 15000, "pix"],
      ["SAQUE 24H", 10000, "dinheiro"],
    ]);
    expect(r.incomes.map((i) => [i.description, i.amountCents, i.suggested])).toEqual([["REMUNERACAO/SALARIO", 500000, true]]);
  });
  it("CSV Bradesco (colunas Crédito e Débito separadas)", () => {
    const csv = "Extrato de: Agência: 1234 Conta: 5678\nData;Lançamento;Dcto.;Crédito (R$);Débito (R$);Saldo (R$)\n05/11/2026;PAGTO ELETRON COBRANCA SABESP;123;;98,70;1.901,30\n06/11/2026;TRANSF SALDO C/SAL P/CC;;4.000,00;;5.901,30\n07/11/2026;CARTAO CREDITO BRADESCARD;;;2.500,00;3.401,30\n";
    const r = parseStatement(csv);
    expect(r.kind).toBe("conta");
    expect(r.kindDetected).toBe(true);
    expect(r.lines.map((l) => [l.description, l.amountCents, l.paymentMethod])).toEqual([["PAGTO ELETRON COBRANCA SABESP", 9870, "boleto"]]);
    expect(r.incomes.map((i) => [i.amountCents, i.suggested])).toEqual([[400000, true]]);
    expect(r.cardBillPayments).toBe(1);
  });
  it("o usuário pode dizer que o arquivo é fatura (ou extrato)", () => {
    const csv = "data;descricao;valor\n05/11/2026;LOJA A;-10,00\n06/11/2026;LOJA B;-20,00\n";
    expect(parseStatement(csv).kind).toBe("cartao");
    expect(parseStatement(csv, "conta").kind).toBe("conta");
    expect(parseStatement(csv, "conta").lines).toHaveLength(2);
  });
  it.each([
    ["PIX ENVIADO FULANO", "pix"],
    ["PAGTO BOLETO", "boleto"],
    ["DEBITO AUTOMATICO VIVO", "boleto"],
    ["SAQUE BANCO24H", "dinheiro"],
    ["TED 237 JOAO", "pix"],
    ["COMPRA ELO DEBITO", "debito"],
  ])("forma de pagamento: %s → %s", (d, m) => {
    expect(paymentMethodFromAccount(d)).toBe(m);
  });
});

describe("categorização por tipo de consumo e seção", () => {
  const history = buildHistory([
    { description: "Restaurante Itaici", categoryKey: "prazeres", consumption: "bares_restaurantes" },
    { description: "Wellhub academia", categoryKey: "conforto", consumption: "cuidados_pessoais" },
  ]);
  it("usa o histórico primeiro", () => {
    expect(suggestCategory("RESTAURANTE ITAICI", history)).toEqual({ section: "prazeres", consumption: "bares_restaurantes", source: "historico" });
    expect(suggestCategory("WELLHUB ACADEMIA SAO PAULO", history)).toEqual({ section: "conforto", consumption: "cuidados_pessoais", source: "historico" });
  });
  it.each([
    ["IFD*RESTAURANTE NOVO", "delivery", "prazeres"],
    ["BAR DO JUAREZ", "bares_restaurantes", "prazeres"],
    ["PADARIA REAL", "bares_restaurantes", "prazeres"],
    ["CARREFOUR HIPER", "mercado", "custos_fixos"],
    ["PAO DE ACUCAR-1234", "mercado", "custos_fixos"],
    ["DROGASIL 123", "saude", "custos_fixos"],
    ["UBER *TRIP", "transporte", "conforto"],
    ["POSTO IPIRANGA", "transporte", "conforto"],
    ["NETFLIX.COM", "assinaturas", "conforto"],
    ["SMARTFIT", "cuidados_pessoais", "conforto"],
    ["CINEMARK", "lazer", "prazeres"],
    ["LATAM AIRLINES", "viagem", "prazeres"],
    ["UDEMY", "educacao", "conhecimento"],
    ["MERCADOLIVRE*LOJA", "compras", "prazeres"],
    ["PETZ", "pets", "conforto"],
  ])("%s → %s / %s", (desc, consumption, section) => {
    expect(suggestCategory(desc, new Map())).toEqual({ section, consumption, source: "regra" });
  });
  it("desconhecido fica para o usuário", () => {
    expect(suggestCategory("XPTO LTDA", history)).toEqual({ section: null, consumption: null, source: null });
  });
  it("nome do estabelecimento normalizado", () => {
    expect(merchantKey("IFD*Pizzaria Bella 123")).toBe("pizzaria bella");
  });
  it("duplicado: mesmo valor, ±3 dias, nome parecido", () => {
    const existing = [{ date: "2026-11-04", description: "Restaurante Itaici", amountCents: 10400 }];
    expect(isLikelyDuplicate({ date: "2026-11-05", description: "RESTAURANTE ITAICI", amountCents: 10400 }, existing)).toBe(true);
    expect(isLikelyDuplicate({ date: "2026-11-15", description: "RESTAURANTE ITAICI", amountCents: 10400 }, existing)).toBe(false);
    expect(isLikelyDuplicate({ date: "2026-11-05", description: "OUTRA LOJA", amountCents: 10400 }, existing)).toBe(false);
  });
  it("parcela já importada do mês anterior é duplicada, mesmo com a data da compra", () => {
    const existing = [{ date: "2026-11-07", description: "Magazine Luiza", amountCents: 33333, installment: { number: 3, total: 10 } }];
    const parcel = { date: "2026-08-07", description: "MAGAZINE LUIZA", amountCents: 33333 };
    expect(isLikelyDuplicate({ ...parcel, installment: { number: 3, total: 10 } }, existing)).toBe(true);
    expect(isLikelyDuplicate({ ...parcel, installment: { number: 4, total: 10 } }, existing)).toBe(false);
  });
});
