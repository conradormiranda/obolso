import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

/** Chave secreta pública de testes da Cloudflare (sempre aprova). Só aceita em localhost. */
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

const responseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
});

/** Valida o token do Cloudflare Turnstile no servidor. Falha fechada. */
export async function verifyTurnstile(token: string, ip: string, expectedAction: string): Promise<boolean> {
  const env = serverEnv();
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const parsed = responseSchema.safeParse(await res.json());
    if (!parsed.success || !parsed.data.success) return false;
    const expectedHost = new URL(env.APP_ORIGIN).hostname;
    // Chave de teste da Cloudflare (CI/dev): devolve hostname "example.com" e sem action.
    const isTestKey = env.TURNSTILE_SECRET_KEY === TURNSTILE_TEST_SECRET;
    if (isTestKey) {
      return expectedHost === "localhost" || expectedHost === "127.0.0.1";
    }
    return parsed.data.hostname === expectedHost && parsed.data.action === expectedAction;
  } catch {
    return false;
  }
}
