/**
 * Conversões para exportação SEM aritmética de ponto flutuante: centavos e
 * basis points inteiros viram texto decimal por manipulação de string.
 */

/** 123456 → "1234.56" (sep ".") ou "1234,56" (sep ","). Aceita negativos. */
export function centsToDecimal(cents: number, sep: "." | "," = "."): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError("centavos inválidos");
  const neg = cents < 0;
  const s = String(Math.abs(cents)).padStart(3, "0");
  return `${neg ? "-" : ""}${s.slice(0, -2)}${sep}${s.slice(-2)}`;
}

/** 1250 bp → "0.125" (fração, para formatar como % em planilha). */
export function bpToFraction(bp: number): string {
  if (!Number.isSafeInteger(bp) || bp < 0) throw new RangeError("bp inválido");
  const s = String(bp).padStart(5, "0");
  const int = s.slice(0, -4);
  const frac = s.slice(-4).replace(/0+$/, "");
  return frac ? `${Number(int)}.${frac}` : String(Number(int));
}

/** "2026-11-05" → "05/11/2026" */
export function isoToBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
