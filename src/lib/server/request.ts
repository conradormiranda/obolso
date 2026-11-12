import "server-only";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";

export class ForbiddenOriginError extends Error {
  constructor() {
    super("Origem não permitida");
  }
}

/**
 * Proteção CSRF explícita: além da checagem nativa do Next para Server Actions,
 * exigimos que o Origin seja exatamente o domínio do app.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  const expected = new URL(serverEnv().APP_ORIGIN).origin;
  if (origin !== expected) throw new ForbiddenOriginError();
}

/** IP do cliente (Vercel define x-forwarded-for/x-real-ip). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || h.get("x-real-ip") || "unknown";
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") ?? "desconhecido").slice(0, 300);
}

/** Resposta com tempo mínimo, para não vazar informação por timing. */
export async function atLeast<T>(ms: number, work: Promise<T>): Promise<T> {
  const [result] = await Promise.all([work, new Promise((r) => setTimeout(r, ms))]);
  return result;
}
