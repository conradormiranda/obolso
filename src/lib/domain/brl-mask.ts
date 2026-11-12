/**
 * Máscara BRL "tipo caixa eletrônico": os dígitos digitados são centavos.
 * "5" → "0,05", "570000" → "5.700,00". Nunca usa float. Máx. 13 dígitos
 * (R$ 99.999.999.999,99; o limite de R$ 1 bilhão é validado no servidor).
 */
export function maskBrlDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 13);
  if (digits === "") return "";
  const padded = digits.padStart(3, "0");
  const int = padded.slice(0, -2);
  const dec = padded.slice(-2);
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intFmt},${dec}`;
}
