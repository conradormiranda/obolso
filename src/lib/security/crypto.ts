/**
 * Primitivas criptográficas baseadas em Web Crypto (funcionam no Edge e no Node).
 */

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  try {
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function randomHex(n: number): string {
  return Array.from(randomBytes(n), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(data)));
}

export async function sha1HexUpper(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-1", encoder.encode(data))).toUpperCase();
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data));
  return new Uint8Array(sig);
}

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  return toHex((await hmacSha256(secret, data)).buffer as ArrayBuffer);
}

/** Verificação em tempo constante (crypto.subtle.verify). */
export async function hmacVerify(secret: string, data: string, signature: Uint8Array): Promise<boolean> {
  return crypto.subtle.verify("HMAC", await hmacKey(secret), signature as BufferSource, encoder.encode(data));
}
