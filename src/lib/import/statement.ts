/**
 * Leitor de fatura de cartão E de extrato de conta corrente: OFX (padrão dos
 * bancos brasileiros: Bradesco, Itaú, BTG, Santander…) e CSV (colunas
 * detectadas automaticamente, inclusive Crédito/Débito separados).
 * Função pura, sem rede e sem float: valores viram centavos inteiros.
 */

import type { PaymentMethod } from "@/lib/supabase/database.types";

export type StatementKind = "cartao" | "conta";

export type StatementLine = {
  /** ISO AAAA-MM-DD */
  date: string;
  description: string;
  /** Valor gasto, em centavos (> 0). */
  amountCents: number;
  installment: { number: number; total: number } | null;
  paymentMethod: PaymentMethod;
  externalId: string | null;
};

/** Entrada de dinheiro no extrato da conta (candidata a Renda do mês). */
export type IncomeLine = {
  date: string;
  description: string;
  amountCents: number;
  /** Parece salário/pró-labore: vem marcada. */
  suggested: boolean;
};

export type ParsedStatement = {
  format: "ofx" | "csv";
  kind: StatementKind;
  /** O tipo foi deduzido do arquivo (OFX diz) ou é palpite (CSV). */
  kindDetected: boolean;
  lines: StatementLine[];
  incomes: IncomeLine[];
  /** Ignorados: pagamentos/estornos da fatura; saldos e pagamento da fatura no extrato. */
  ignored: number;
  /** Pagamentos de fatura de cartão encontrados no extrato (não contam como gasto). */
  cardBillPayments: number;
  /** Linhas que não deu para entender. */
  invalidLines: number;
};

export class StatementError extends Error {}

const MAX_CENTS = 100_000_000_000;

// ---------------------------------------------------------------------------
// Valores e datas (sem float)
// ---------------------------------------------------------------------------

/** "1.234,56" | "-1234.56" | "1,234.56" | "R$ 50" | "(12,00)" → centavos com sinal. */
export function parseSignedCents(raw: string): number | null {
  let s = raw.trim().replace(/\s+/g, "").replace(/^R\$/i, "").replace(/R\$/i, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const decIdx = Math.max(lastComma, lastDot);
  let intPart = s;
  let decPart = "";
  // Separador decimal = o último separador, se tiver 1 ou 2 dígitos depois dele.
  if (decIdx >= 0 && s.length - decIdx - 1 <= 2 && s.length - decIdx - 1 >= 1) {
    intPart = s.slice(0, decIdx);
    decPart = s.slice(decIdx + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(decPart) || intPart.length > 13) return null;
  const cents = Number(intPart || "0") * 100 + Number(decPart.padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= last ? `${y}-${pad2(m)}-${pad2(d)}` : null;
}

/** dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd, aaaammdd[hhmmss][[-3:BRT]] (OFX). */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})(\d{2})(\d{2})(?:\d{0,6})(?:\.\d+)?(?:\[[^\]]*\])?$/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(y, Number(m[2]), Number(m[1]));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Descrição, parcelas e classificação
// ---------------------------------------------------------------------------

/** Remove marcação/controle e espaços repetidos; limita a 120 caracteres. */
export function cleanDescription(raw: string): string {
  return (
    raw
      .replace(/[<>]/g, " ")
       
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120)
      .trim()
  );
}

const INSTALLMENT_PATTERNS = [
  /\s*[-–(]?\s*parc(?:ela)?\.?\s*(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})\s*\)?\s*$/i,
  /\s*[-–(]?\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*\)?\s*$/,
  /\s*[-–(]?\s*(\d{1,3})\s+de\s+(\d{1,3})\s*\)?\s*$/i,
];

/** "LOJA X 03/10" → { base: "LOJA X", installment: 3 de 10 }. */
export function extractInstallment(description: string): { base: string; installment: StatementLine["installment"] } {
  for (const re of INSTALLMENT_PATTERNS) {
    const m = re.exec(description);
    if (!m) continue;
    const n = Number(m[1]);
    const t = Number(m[2]);
    if (t >= 2 && t <= 120 && n >= 1 && n <= t) {
      const base = description.slice(0, m.index).trim();
      if (base.length > 0) return { base, installment: { number: n, total: t } };
    }
  }
  return { base: description, installment: null };
}

function plain(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[*#._/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Na FATURA: pagamento, estorno, crédito → não é gasto. */
const CARD_CREDIT_WORDS = /\b(pagamento|pgto|estorno|credito|devolucao|cashback|anuidade estornada)\b/;
/** No EXTRATO: linhas de saldo. */
const BALANCE_WORDS = /^(saldo|sdo|s d o)\b|\bsaldo (anterior|do dia|final|disponivel|total|bloqueado|em conta)\b/;
/** No EXTRATO: pagamento da fatura do cartão (as compras vêm pela fatura). */
const CARD_BILL_WORDS =
  /\b(fatura|fat cartao|fat cart|pagto cartao|pag cartao|pagamento cartao|cartao de credito|cartao credito|itaucard|bradescard|btg card|card pagamento|pagto fat|pag fat)\b/;
/** No EXTRATO: transferência entre contas do próprio titular. */
const OWN_TRANSFER_WORDS = /\b(mesma titularidade|entre contas|transf(erencia)? (entre|p\/) (minhas )?contas|conta propria|aplicacao automatica|resgate automatico)\b/;
const SALARY_WORDS = /\b(salario|sal|proventos|folha|pro labore|prolabore|remuneracao|pagto salario|pgto salario|vencimentos|ferias|13o|decimo terceiro|plr)\b/;

/** Forma de pagamento deduzida da descrição do extrato. */
export function paymentMethodFromAccount(description: string): PaymentMethod {
  const n = plain(description);
  if (/\bpix\b/.test(n)) return "pix";
  if (/\b(boleto|titulo|titulos|cobranca|convenio|darf|gps|das|tributo|concessionaria|pagto conta|pag conta|pagamento de conta|debito automatico|deb aut)\b/.test(n)) return "boleto";
  if (/\b(saque|saq)\b/.test(n)) return "dinheiro";
  if (/\b(ted|doc|transf|transferencia)\b/.test(n)) return "pix";
  return "debito";
}

type Classified =
  | { type: "expense"; line: StatementLine }
  | { type: "income"; line: IncomeLine }
  | { type: "ignored"; cardBill?: boolean }
  | { type: "invalid" };

/**
 * Classifica uma transação. `signedCents` segue a convenção "saída negativa,
 * entrada positiva" (já convertida pelo leitor).
 */
function classify(kind: StatementKind, date: string | null, rawDescription: string, signedCents: number | null, externalId: string | null): Classified {
  if (!date || signedCents === null || signedCents === 0) return { type: "invalid" };
  const desc = cleanDescription(rawDescription);
  if (!desc) return { type: "invalid" };
  const n = plain(desc);
  const abs = Math.abs(signedCents);
  if (abs > MAX_CENTS) return { type: "invalid" };

  if (kind === "cartao") {
    if (signedCents > 0 || CARD_CREDIT_WORDS.test(n)) return { type: "ignored" };
    const { base, installment } = extractInstallment(desc);
    return { type: "expense", line: { date, description: base, amountCents: abs, installment, paymentMethod: "credito", externalId } };
  }

  // Extrato da conta
  if (BALANCE_WORDS.test(n)) return { type: "ignored" };
  if (OWN_TRANSFER_WORDS.test(n)) return { type: "ignored" };
  if (signedCents > 0) {
    return { type: "income", line: { date, description: desc, amountCents: abs, suggested: SALARY_WORDS.test(n) } };
  }
  if (CARD_BILL_WORDS.test(n)) return { type: "ignored", cardBill: true };
  return {
    type: "expense",
    line: { date, description: desc, amountCents: abs, installment: null, paymentMethod: paymentMethodFromAccount(desc), externalId },
  };
}

function collect(format: ParsedStatement["format"], kind: StatementKind, kindDetected: boolean, items: Classified[]): ParsedStatement {
  const out: ParsedStatement = { format, kind, kindDetected, lines: [], incomes: [], ignored: 0, cardBillPayments: 0, invalidLines: 0 };
  for (const c of items) {
    if (c.type === "expense") out.lines.push(c.line);
    else if (c.type === "income") out.incomes.push(c.line);
    else if (c.type === "ignored") {
      out.ignored++;
      if (c.cardBill) out.cardBillPayments++;
    } else out.invalidLines++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// OFX (SGML ou XML)
// ---------------------------------------------------------------------------

function ofxTag(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1]!.trim() : null;
}

export function detectOfxKind(text: string): StatementKind | null {
  if (/<CCSTMTRS>|<CCACCTFROM>|<CREDITCARDMSGSRSV1>/i.test(text)) return "cartao";
  if (/<STMTRS>|<BANKACCTFROM>|<BANKMSGSRSV1>/i.test(text)) return "conta";
  return null;
}

export function parseOfx(text: string, kindOverride?: StatementKind): ParsedStatement {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) throw new StatementError("Nenhuma transação encontrada no arquivo OFX.");
  const detected = detectOfxKind(text);
  const kind = kindOverride ?? detected ?? "cartao";
  const items = blocks.map((raw) => {
    const block = raw.split(/<\/STMTTRN>/i)[0] ?? raw;
    const date = parseDate(ofxTag(block, "DTPOSTED") ?? ofxTag(block, "DTUSER") ?? "");
    const amount = parseSignedCents(ofxTag(block, "TRNAMT") ?? "");
    const memo = ofxTag(block, "MEMO");
    const name = ofxTag(block, "NAME");
    const description = memo && memo.length >= (name?.length ?? 0) ? memo : (name ?? memo ?? "");
    // OFX: saída (compra, débito) é negativa; entrada é positiva.
    return classify(kind, date, description, amount, ofxTag(block, "FITID"));
  });
  return collect("ofx", kind, detected !== null, items);
}

// ---------------------------------------------------------------------------
// CSV (colunas detectadas pelo cabeçalho)
// ---------------------------------------------------------------------------

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const DATE_HEADERS = ["data", "date", "dt"];
const DESC_HEADERS = ["descricao", "lancamento", "historico", "estabelecimento", "title", "description", "titulo", "detalhe", "memo"];
const AMOUNT_HEADERS = ["valor", "amount", "montante", "quantia"];
const CREDIT_HEADERS = ["credito", "entrada", "entradas", "credit"];
const DEBIT_HEADERS = ["debito", "saida", "saidas", "debit"];
const BALANCE_HEADERS = ["saldo", "balance"];

export function parseCsv(text: string, kindOverride?: StatementKind): ParsedStatement {
  const rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rows.length < 2) throw new StatementError("O arquivo CSV está vazio.");
  const cellsOf = (r: string) => {
    const sep = (r.match(/;/g)?.length ?? 0) >= (r.match(/,/g)?.length ?? 0) ? ";" : ",";
    return { sep, cells: splitCsvLine(r, sep).map(norm) };
  };
  const has = (cells: string[], cands: string[]) => cells.findIndex((h) => cands.some((c) => h === c || h.startsWith(c)));

  const headerIdx = rows.findIndex((r) => {
    const { cells } = cellsOf(r);
    return has(cells, DATE_HEADERS) >= 0 && (has(cells, AMOUNT_HEADERS) >= 0 || (has(cells, CREDIT_HEADERS) >= 0 && has(cells, DEBIT_HEADERS) >= 0));
  });
  if (headerIdx < 0) throw new StatementError("Não encontrei as colunas de data, descrição e valor no CSV.");
  const { sep, cells: header } = cellsOf(rows[headerIdx]!);
  const iDate = has(header, DATE_HEADERS);
  const iDesc = has(header, DESC_HEADERS);
  const iAmount = has(header, AMOUNT_HEADERS);
  const iCredit = has(header, CREDIT_HEADERS);
  const iDebit = has(header, DEBIT_HEADERS);
  const split = iAmount < 0 && iCredit >= 0 && iDebit >= 0;
  if (iDate < 0 || iDesc < 0 || (iAmount < 0 && !split)) {
    throw new StatementError("Não encontrei as colunas de data, descrição e valor no CSV.");
  }

  const body = rows.slice(headerIdx + 1).map((r) => splitCsvLine(r, sep));
  const descs = body.map((r) => norm(r[iDesc] ?? "")).join(" ");
  // Extrato da conta: colunas Crédito/Débito, coluna de saldo, ou cara de extrato (Pix, saldo…).
  const looksAccount = split || has(header, BALANCE_HEADERS) >= 0 || /\b(pix|saldo|ted|doc|tarifa|saque)\b/.test(descs);
  const kind = kindOverride ?? (looksAccount ? "conta" : "cartao");

  // Valor com sinal no padrão "saída negativa".
  const signedOf = (r: string[]): number | null => {
    if (split) {
      const c = parseSignedCents(r[iCredit] ?? "");
      const d = parseSignedCents(r[iDebit] ?? "");
      if (d !== null && d !== 0) return -Math.abs(d);
      if (c !== null && c !== 0) return Math.abs(c);
      return null;
    }
    return parseSignedCents(r[iAmount] ?? "");
  };
  let flip = false;
  if (!split && kind === "cartao") {
    // Fatura em CSV costuma trazer compras POSITIVAS: se a maioria é positiva, inverte.
    const amounts = body.map(signedOf).filter((v): v is number => v !== null);
    flip = amounts.filter((v) => v > 0).length >= amounts.length / 2;
  }

  const items = body.map((r) => {
    const v = signedOf(r);
    return classify(kind, parseDate(r[iDate] ?? ""), r[iDesc] ?? "", v === null ? null : flip ? -v : v, null);
  });
  return collect("csv", kind, split || kindOverride !== undefined, items);
}

export const MAX_STATEMENT_BYTES = 2_000_000;
export const MAX_STATEMENT_LINES = 300;

export function parseStatement(text: string, kindOverride?: StatementKind): ParsedStatement {
  if (text.length > MAX_STATEMENT_BYTES) throw new StatementError("Arquivo grande demais (máximo de 2 MB).");
  const t = text.replace(/^﻿/, "");
  const parsed = /<OFX>|<STMTTRN>|OFXHEADER/i.test(t) ? parseOfx(t, kindOverride) : parseCsv(t, kindOverride);
  if (parsed.lines.length > MAX_STATEMENT_LINES || parsed.incomes.length > MAX_STATEMENT_LINES) {
    throw new StatementError(`Máximo de ${MAX_STATEMENT_LINES} lançamentos por arquivo.`);
  }
  if (parsed.lines.length === 0 && parsed.incomes.length === 0) throw new StatementError("Nenhum lançamento encontrado no arquivo.");
  return parsed;
}
