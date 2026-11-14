/**
 * Leitor de fatura de cartão: OFX (padrão dos bancos brasileiros: Bradesco,
 * Itaú, BTG, Santander…) e CSV (colunas detectadas automaticamente).
 * Função pura, sem rede e sem float: valores viram centavos inteiros.
 */

export type StatementLine = {
  /** ISO AAAA-MM-DD */
  date: string;
  description: string;
  /** Valor gasto, em centavos (> 0). */
  amountCents: number;
  installment: { number: number; total: number } | null;
  externalId: string | null;
};

export type ParsedStatement = {
  format: "ofx" | "csv";
  lines: StatementLine[];
  /** Créditos (pagamento da fatura, estornos) ignorados. */
  ignoredCredits: number;
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

/** dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd, aaaammdd (OFX). */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  // OFX: aaaammdd[hhmmss[.xxx]][[-3:BRT]]
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
// Descrição e parcelas
// ---------------------------------------------------------------------------

/** Remove marcação/controle e espaços repetidos; limita a 120 caracteres. */
export function cleanDescription(raw: string): string {
  return raw
    .replace(/[<>]/g, " ")
     
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .trim();
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

/** Pagamento da fatura, estorno, crédito: não é gasto. */
const CREDIT_WORDS = /\b(pagamento|pgto|estorno|credito|crédito|devolu[cç][aã]o|cashback|anuidade estornada)\b/i;

function buildLine(
  date: string | null,
  rawDescription: string,
  signedCents: number | null,
  expenseIsNegative: boolean,
  externalId: string | null,
): StatementLine | "credit" | null {
  if (!date || signedCents === null) return null;
  const desc = cleanDescription(rawDescription);
  if (!desc) return null;
  const spend = expenseIsNegative ? -signedCents : signedCents;
  if (spend <= 0 || CREDIT_WORDS.test(desc)) return "credit";
  if (spend > MAX_CENTS) return null;
  const { base, installment } = extractInstallment(desc);
  return { date, description: base, amountCents: spend, installment, externalId };
}

// ---------------------------------------------------------------------------
// OFX (SGML ou XML)
// ---------------------------------------------------------------------------

function ofxTag(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return m ? m[1]!.trim() : null;
}

export function parseOfx(text: string): ParsedStatement {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) throw new StatementError("Nenhuma transação encontrada no arquivo OFX.");
  const lines: StatementLine[] = [];
  let ignoredCredits = 0;
  let invalidLines = 0;
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0] ?? raw;
    const date = parseDate(ofxTag(block, "DTPOSTED") ?? ofxTag(block, "DTUSER") ?? "");
    const amount = parseSignedCents(ofxTag(block, "TRNAMT") ?? "");
    const memo = ofxTag(block, "MEMO");
    const name = ofxTag(block, "NAME");
    const description = memo && memo.length >= (name?.length ?? 0) ? memo : (name ?? memo ?? "");
    // No OFX de cartão, compra vem com valor negativo (débito na conta do cartão).
    const r = buildLine(date, description, amount, true, ofxTag(block, "FITID"));
    if (r === "credit") ignoredCredits++;
    else if (r === null) invalidLines++;
    else lines.push(r);
  }
  return { format: "ofx", lines, ignoredCredits, invalidLines };
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

const DATE_HEADERS = ["data", "date", "data da compra", "data compra", "data lancamento", "dt"];
const DESC_HEADERS = ["descricao", "lancamento", "historico", "estabelecimento", "title", "description", "descrição", "titulo", "detalhe"];
const AMOUNT_HEADERS = ["valor", "amount", "valor (r$)", "valor r$", "valor em r$", "valor brl", "valor (brl)"];

export function parseCsv(text: string): ParsedStatement {
  const rows = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (rows.length < 2) throw new StatementError("O arquivo CSV está vazio.");
  const headerIdx = rows.findIndex((r) => {
    const n = norm(r);
    return DATE_HEADERS.some((h) => n.includes(h)) && AMOUNT_HEADERS.some((h) => n.includes(h.split(" ")[0]!));
  });
  if (headerIdx < 0) throw new StatementError("Não encontrei as colunas de data, descrição e valor no CSV.");
  const headerLine = rows[headerIdx]!;
  const sep = (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsvLine(headerLine, sep).map(norm);
  const find = (cands: string[]) => header.findIndex((h) => cands.some((c) => h === c || h.startsWith(c)));
  const iDate = find(DATE_HEADERS);
  const iDesc = find(DESC_HEADERS);
  const iAmount = find(AMOUNT_HEADERS);
  if (iDate < 0 || iDesc < 0 || iAmount < 0) {
    throw new StatementError("Não encontrei as colunas de data, descrição e valor no CSV.");
  }

  const body = rows.slice(headerIdx + 1).map((r) => splitCsvLine(r, sep));
  const amounts = body.map((r) => parseSignedCents(r[iAmount] ?? "")).filter((v): v is number => v !== null);
  // Convenção do arquivo: se a maioria dos valores é negativa, compra = negativo.
  const negatives = amounts.filter((v) => v < 0).length;
  const expenseIsNegative = negatives > amounts.length / 2;

  const lines: StatementLine[] = [];
  let ignoredCredits = 0;
  let invalidLines = 0;
  for (const r of body) {
    const out = buildLine(parseDate(r[iDate] ?? ""), r[iDesc] ?? "", parseSignedCents(r[iAmount] ?? ""), expenseIsNegative, null);
    if (out === "credit") ignoredCredits++;
    else if (out === null) invalidLines++;
    else lines.push(out);
  }
  return { format: "csv", lines, ignoredCredits, invalidLines };
}

export const MAX_STATEMENT_BYTES = 2_000_000;
export const MAX_STATEMENT_LINES = 300;

export function parseStatement(text: string): ParsedStatement {
  if (text.length > MAX_STATEMENT_BYTES) throw new StatementError("Arquivo grande demais (máximo de 2 MB).");
  const t = text.replace(/^﻿/, "");
  const parsed = /<OFX>|<STMTTRN>|OFXHEADER/i.test(t) ? parseOfx(t) : parseCsv(t);
  if (parsed.lines.length > MAX_STATEMENT_LINES) throw new StatementError(`Máximo de ${MAX_STATEMENT_LINES} compras por arquivo.`);
  if (parsed.lines.length === 0) throw new StatementError("Nenhuma compra encontrada no arquivo.");
  return parsed;
}
