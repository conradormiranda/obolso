import "server-only";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { isProduction, serverEnv } from "@/lib/env";
import { randomHex, sha256Hex } from "@/lib/security/crypto";
import {
  DEVICE_COOKIE,
  PWRESET_COOKIE,
  SESSION_META_COOKIE,
  baseCookieOptions,
  encodePwReset,
  encodeSessionMeta,
} from "@/lib/security/session-policy";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { sendLoginAlert } from "./email";
import { logSecurityEvent } from "./log";
import { clientIp, userAgent } from "./request";

const opts = () => baseCookieOptions(isProduction);

/** Marca o início da sessão do app (base da expiração absoluta e por inatividade). */
export async function startAppSession(userId: string): Promise<void> {
  const now = Date.now();
  const token = await encodeSessionMeta(serverEnv().SESSION_SECRET, { u: userId, s: now, l: now });
  (await cookies()).set(SESSION_META_COOKIE, token, { ...opts(), maxAge: 7 * 24 * 60 * 60 });
}

export async function startPasswordReset(userId: string): Promise<void> {
  const token = await encodePwReset(serverEnv().SESSION_SECRET, userId, Date.now());
  (await cookies()).set(PWRESET_COOKIE, token, { ...opts(), maxAge: 15 * 60 });
}

export async function clearAppCookies(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_META_COOKIE);
  store.delete(PWRESET_COOKIE);
}

async function deviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE)?.value;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const id = randomHex(32);
  store.set(DEVICE_COOKIE, id, { ...opts(), maxAge: 400 * 24 * 60 * 60 });
  return id;
}

/**
 * Chamado quando o login é concluído (aal2). Registra o dispositivo e, se for
 * novo para este usuário, envia e-mail de alerta. Falhas aqui não bloqueiam o
 * login, mas são registradas.
 */
export async function onLoginCompleted(supabase: AppSupabaseClient, user: User): Promise<void> {
  try {
    const deviceHash = await sha256Hex(`${user.id}:${await deviceId()}`);
    const ua = await userAgent();
    const { data: known } = await supabase
      .from("known_devices")
      .select("device_hash")
      .eq("user_id", user.id)
      .eq("device_hash", deviceHash)
      .maybeSingle();

    if (known) {
      await supabase
        .from("known_devices")
        .update({ last_seen: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("device_hash", deviceHash);
      return;
    }

    await supabase.from("known_devices").insert({ user_id: user.id, device_hash: deviceHash, user_agent: ua });
    logSecurityEvent("login_new_device");
    if (user.email) {
      await sendLoginAlert(user.email, { userAgent: ua, ip: await clientIp(), at: new Date() });
    }
  } catch {
    logSecurityEvent("login_alert_failed");
  }
}
