import { z } from "zod";
import { signPayload, verifyPayload } from "./signed-cookie";

/** Expiração por inatividade (30 min) e absoluta (7 dias). */
export const INACTIVITY_MS = 30 * 60 * 1000;
export const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
/** Evita reescrever o cookie a cada requisição. */
export const TOUCH_INTERVAL_MS = 60 * 1000;

export const SESSION_META_COOKIE = "ob_session";
export const PWRESET_COOKIE = "ob_pwreset";
export const DEVICE_COOKIE = "ob_device";
export const PWRESET_TTL_MS = 15 * 60 * 1000;

const sessionMetaSchema = z.object({
  u: z.uuid(), // user id ao qual a sessão pertence
  s: z.number().int().positive(), // início (ms)
  l: z.number().int().positive(), // última atividade (ms)
});
export type SessionMeta = z.infer<typeof sessionMetaSchema>;

export type SessionCheck =
  | { ok: true; meta: SessionMeta; shouldTouch: boolean }
  | { ok: false; reason: "missing" | "user-mismatch" | "inactive" | "absolute" };

export function evaluateSession(meta: SessionMeta | null, userId: string, now: number): SessionCheck {
  if (!meta) return { ok: false, reason: "missing" };
  if (meta.u !== userId) return { ok: false, reason: "user-mismatch" };
  if (now - meta.s > ABSOLUTE_MS || meta.s > now + 60_000) return { ok: false, reason: "absolute" };
  if (now - meta.l > INACTIVITY_MS) return { ok: false, reason: "inactive" };
  return { ok: true, meta, shouldTouch: now - meta.l > TOUCH_INTERVAL_MS };
}

export async function encodeSessionMeta(secret: string, meta: SessionMeta): Promise<string> {
  return signPayload(secret, "session", meta);
}

export async function decodeSessionMeta(secret: string, token: string | undefined): Promise<SessionMeta | null> {
  const parsed = sessionMetaSchema.safeParse(await verifyPayload(secret, "session", token));
  return parsed.success ? parsed.data : null;
}

const pwresetSchema = z.object({ u: z.uuid(), e: z.number().int().positive() });

export async function encodePwReset(secret: string, userId: string, now: number): Promise<string> {
  return signPayload(secret, "pwreset", { u: userId, e: now + PWRESET_TTL_MS });
}

export async function isPwResetValid(
  secret: string,
  token: string | undefined,
  userId: string,
  now: number,
): Promise<boolean> {
  const parsed = pwresetSchema.safeParse(await verifyPayload(secret, "pwreset", token));
  return parsed.success && parsed.data.u === userId && parsed.data.e > now;
}

export function baseCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
}
