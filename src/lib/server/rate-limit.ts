import "server-only";
import { serverEnv } from "@/lib/env";
import { hmacSha256Hex } from "@/lib/security/crypto";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "./log";

export type RateLimitScope =
  | "login_ip"
  | "login_email"
  | "mfa_user"
  | "mfa_ip"
  | "recovery_ip"
  | "recovery_email";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Registra uma tentativa. As chaves são HMAC(segredo, valor): o banco nunca vê
 * IP ou e-mail em claro, e ninguém consegue mirar o contador de outra pessoa
 * chamando a RPC diretamente (ela também exige o segredo).
 * Falha fechada: erro no banco = tentativa negada.
 */
export async function hitRateLimit(
  supabase: AppSupabaseClient,
  scope: RateLimitScope,
  value: string,
): Promise<RateLimitResult> {
  const secret = serverEnv().RATE_LIMIT_SECRET;
  const key = await hmacSha256Hex(secret, `${scope}:${value}`);
  const { data, error } = await supabase.rpc("rate_limit_hit", { p_secret: secret, p_scope: scope, p_key: key });
  const row = data?.[0];
  if (error || !row) {
    logSecurityEvent("rate_limit_error", { scope });
    return { allowed: false, retryAfterSeconds: 60 };
  }
  if (!row.allowed) logSecurityEvent("rate_limited", { scope });
  return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
}

export function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Muitas tentativas. Tente novamente em ${minutes} minuto${minutes > 1 ? "s" : ""}.`;
}
