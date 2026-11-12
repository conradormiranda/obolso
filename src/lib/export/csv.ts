/**
 * CSV para Excel em pt-BR: separador ";", UTF-8 com BOM, CRLF.
 * Proteção contra CSV/formula injection: células de texto que começam com
 * = + - @ TAB ou CR recebem um apóstrofo na frente (OWASP).
 */

export type CsvCell = { text: string } | { number: string } | null;

const DANGEROUS = /^[=+\-@\t\r]/;

function escapeCell(cell: CsvCell): string {
  if (cell === null) return "";
  let v = "text" in cell ? cell.text : cell.number;
  if ("text" in cell && DANGEROUS.test(v)) v = `'${v}`;
  if (/[";\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  const lines = [header.map((h) => escapeCell({ text: h })).join(";"), ...rows.map((r) => r.map(escapeCell).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
