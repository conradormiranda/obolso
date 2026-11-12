import { z } from "zod";

/**
 * Dinheiro: SEMPRE inteiro em centavos. Nunca usamos float para cálculo.
 * Limite: R$ 1.000.000.000,00 = 100.000.000.000 centavos (cabe com folga em
 * Number.MAX_SAFE_INTEGER e em bigint no Postgres).
 */
export const MAX_AMOUNT_CENTS = 100_000_000_000;

export const amountCentsSchema = z
  .number({ error: "Valor inválido." })
  .int({ error: "Valor inválido." })
  .positive({ error: "O valor precisa ser maior que zero." })
  .max(MAX_AMOUNT_CENTS, { error: "Valor acima do limite de R$ 1 bilhão." });

/**
 * Converte texto digitado em BRL para centavos, sem passar por float.
 * Aceita: "1.234,56", "1234,56", "1234,5", "1234", "R$ 1.234,56".
 * Rejeita: negativos, letras, mais de 2 casas decimais, separadores ambíguos.
 */
export function parseBrlToCents(input: string): number | null {
  const s = input.replace(/^\s*R\$\s*/i, "").replace(/\s+/g, "");
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(s)) return null;
  const [intPart = "", decPart = ""] = s.split(",");
  const digits = intPart.replace(/\./g, "");
  if (digits.length > 13) return null;
  const cents = Number(digits) * 100 + Number(decPart.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export const brlInputSchema = z
  .string()
  .max(32, { error: "Valor inválido." })
  .transform((v, ctx) => {
    const cents = parseBrlToCents(v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Valor inválido." });
      return z.NEVER;
    }
    return cents;
  })
  .pipe(amountCentsSchema);

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formatação só na camada de apresentação. */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.trunc(abs / 100);
  const centavos = abs % 100;
  // Formata a parte inteira com Intl e concatena os centavos exatos.
  const intFormatted = brl.format(reais).replace(/,00$/, "");
  return `${negative ? "-" : ""}${intFormatted},${String(centavos).padStart(2, "0")}`;
}
