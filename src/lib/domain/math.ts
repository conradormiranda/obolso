/**
 * Aritmética inteira para dinheiro e percentuais. Nada de float em cálculo:
 * divisões usam BigInt com arredondamento "half up" (valores não negativos).
 */

/** round(n / d) para inteiros, com n >= 0 e d > 0. */
export function divRound(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw new RangeError("inteiro inválido");
  if (d <= 0) throw new RangeError("divisor deve ser positivo");
  const neg = n < 0;
  const bn = BigInt(Math.abs(n));
  const bd = BigInt(d);
  const q = (bn * 2n + bd) / (bd * 2n);
  const r = Number(q);
  return neg ? -r : r;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    total += v;
    if (!Number.isSafeInteger(total)) throw new RangeError("soma fora do intervalo seguro");
  }
  return total;
}

/** Basis points → texto pt-BR. 4000 → "40%", 1250 → "12,5%", 3333 → "33,33%". */
export function formatBp(bp: number, maxDecimals = 2): string {
  const neg = bp < 0;
  const abs = Math.abs(bp);
  const whole = Math.trunc(abs / 100);
  let frac = String(abs % 100).padStart(2, "0").slice(0, maxDecimals).replace(/0+$/, "");
  if (maxDecimals === 0) frac = "";
  const wholeFmt = new Intl.NumberFormat("pt-BR").format(whole);
  return `${neg ? "-" : ""}${wholeFmt}${frac ? `,${frac}` : ""}%`;
}

/** Arredonda bp para 1 casa decimal de percentual (múltiplo de 10 bp). */
export function roundBpTo1Decimal(bp: number): number {
  return divRound(bp, 10) * 10;
}

/**
 * Percentual digitado ("40", "12,5", "12.5", "0,25") → basis points inteiros.
 * Até 2 casas decimais, 0 a 100. Retorna null se inválido.
 */
export function parsePercentToBp(input: string): number | null {
  const s = input.trim().replace("%", "").trim().replace(".", ",");
  if (!/^\d{1,3}(,\d{1,2})?$/.test(s)) return null;
  const [i = "0", f = ""] = s.split(",");
  const bp = Number(i) * 100 + Number(f.padEnd(2, "0"));
  return bp >= 0 && bp <= 10000 ? bp : null;
}
