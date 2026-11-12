import { sha1HexUpper } from "./crypto";

/**
 * Verificação de senha vazada no Have I Been Pwned via k-anonymity:
 * só os 5 primeiros caracteres do SHA-1 saem do servidor; a senha nunca.
 * Em caso de falha de rede retorna "unavailable" (o chamador bloqueia a troca).
 */
export type PwnedResult = "pwned" | "clean" | "unavailable";

export async function checkPwnedPassword(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PwnedResult> {
  const hash = await sha1HexUpper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "obolso-password-check" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "unavailable";
    const body = await res.text();
    for (const line of body.split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix && Number(count) > 0) return "pwned";
    }
    return "clean";
  } catch {
    return "unavailable";
  }
}
