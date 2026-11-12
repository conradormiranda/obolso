import { base64UrlDecode, base64UrlEncode, hmacSha256, hmacVerify } from "./crypto";

/**
 * Cookies assinados com HMAC-SHA256: `payload.assinatura`, ambos base64url.
 * Usados para metadados de sessão (inatividade/expiração absoluta) e para o
 * fluxo de redefinição de senha. Não guardam nenhum dado financeiro.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function signPayload(secret: string, purpose: string, payload: unknown): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const sig = await hmacSha256(secret, `${purpose}.${body}`);
  return `${body}.${base64UrlEncode(sig)}`;
}

export async function verifyPayload(secret: string, purpose: string, token: string | undefined): Promise<unknown> {
  if (!token || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sigPart] = parts as [string, string];
  const sig = base64UrlDecode(sigPart);
  const raw = base64UrlDecode(body);
  if (!sig || !raw) return null;
  if (!(await hmacVerify(secret, `${purpose}.${body}`, sig))) return null;
  try {
    return JSON.parse(decoder.decode(raw)) as unknown;
  } catch {
    return null;
  }
}
