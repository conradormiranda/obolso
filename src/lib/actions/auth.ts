"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { checkPwnedPassword } from "@/lib/security/hibp";
import { PWRESET_COOKIE, isPwResetValid } from "@/lib/security/session-policy";
import { UnauthorizedError, requireMember, requireMemberAal1 } from "@/lib/server/auth";
import { logSecurityEvent } from "@/lib/server/log";
import { hitRateLimit, rateLimitMessage } from "@/lib/server/rate-limit";
import { assertSameOrigin, atLeast, clientIp } from "@/lib/server/request";
import { clearAppCookies, onLoginCompleted, startAppSession, startPasswordReset } from "@/lib/server/session";
import { sendRecoveryCodeUsedAlert } from "@/lib/server/email";
import { verifyTurnstile } from "@/lib/server/turnstile";
import { mfaLandingPath } from "@/lib/server/mfa";
import { createClient } from "@/lib/supabase/server";
import {
  loginSchema,
  mfaEnrollVerifySchema,
  mfaVerifySchema,
  newPasswordSchema,
  recoveryCodeSchema,
  recoveryRequestSchema,
} from "@/lib/validation/auth";
import { MSG, type FormState } from "./form-state";

type Outcome = { state: FormState } | { redirect: string };

const fail = (message: string): Outcome => ({ state: { status: "error", message } });

async function guardOrigin(): Promise<boolean> {
  try {
    await assertSameOrigin();
    return true;
  } catch {
    logSecurityEvent("origin_rejected");
    return false;
  }
}

function finish(outcome: Outcome): FormState {
  if ("redirect" in outcome) redirect(outcome.redirect);
  return outcome.state;
}

// ---------------------------------------------------------------------------
// Login (e-mail + senha + Turnstile)
// ---------------------------------------------------------------------------
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await guardOrigin())) return { status: "error", message: MSG.genericError };

  const outcome = await atLeast(
    700,
    (async (): Promise<Outcome> => {
      const parsed = loginSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
        turnstileToken: formData.get("cf-turnstile-response"),
      });
      if (!parsed.success) return fail(MSG.invalidCredentials);
      const { email, password, turnstileToken } = parsed.data;

      const ip = await clientIp();
      const supabase = await createClient();
      const [byIp, byEmail] = await Promise.all([
        hitRateLimit(supabase, "login_ip", ip),
        hitRateLimit(supabase, "login_email", email),
      ]);
      if (!byIp.allowed || !byEmail.allowed) {
        return fail(rateLimitMessage(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds)));
      }

      if (!(await verifyTurnstile(turnstileToken, ip, "login"))) return fail(MSG.captchaFailed);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        logSecurityEvent("login_failed");
        return fail(MSG.invalidCredentials);
      }

      const { data: isMember } = await supabase.rpc("am_i_member");
      if (isMember !== true) {
        await supabase.auth.signOut({ scope: "local" });
        logSecurityEvent("login_not_member");
        return fail(MSG.invalidCredentials);
      }

      await startAppSession(data.user.id);
      logSecurityEvent("login_password_ok");
      return { redirect: await mfaLandingPath(supabase) };
    })(),
  );
  return finish(outcome);
}

// ---------------------------------------------------------------------------
// MFA: verificação no login
// ---------------------------------------------------------------------------
export async function verifyMfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await guardOrigin())) return { status: "error", message: MSG.genericError };
  let outcome: Outcome;
  try {
    const parsed = mfaVerifySchema.safeParse({ code: formData.get("code") });
    if (!parsed.success) return { status: "error", message: MSG.invalidCode };

    const { supabase, user } = await requireMemberAal1();
    const ip = await clientIp();
    const [byUser, byIp] = await Promise.all([
      hitRateLimit(supabase, "mfa_user", user.id),
      hitRateLimit(supabase, "mfa_ip", ip),
    ]);
    if (!byUser.allowed || !byIp.allowed) {
      return { status: "error", message: rateLimitMessage(Math.max(byUser.retryAfterSeconds, byIp.retryAfterSeconds)) };
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.all.find((f) => f.factor_type === "totp" && f.status === "verified");
    if (!totp) {
      outcome = { redirect: "/mfa/configurar" };
    } else {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: parsed.data.code });
      if (error) {
        logSecurityEvent("mfa_failed");
        return { status: "error", message: MSG.invalidCode };
      }
      logSecurityEvent("mfa_ok");
      await onLoginCompleted(supabase, user);
      const store = await cookies();
      const pending = await isPwResetValid(serverEnv().SESSION_SECRET, store.get(PWRESET_COOKIE)?.value, user.id, Date.now());
      outcome = { redirect: pending ? "/redefinir-senha" : "/" };
    }
  } catch (e) {
    if (e instanceof UnauthorizedError) outcome = { redirect: "/login" };
    else return { status: "error", message: MSG.genericError };
  }
  return finish(outcome);
}

// ---------------------------------------------------------------------------
// MFA: cadastro do autenticador
// ---------------------------------------------------------------------------
export type EnrollStart =
  | { status: "ok"; factorId: string; qrCode: string; secret: string }
  | { status: "error"; message: string };

export async function startEnrollAction(): Promise<EnrollStart> {
  if (!(await guardOrigin())) return { status: "error", message: MSG.genericError };
  try {
    const { supabase } = await requireMemberAal1();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const all = factors?.all ?? [];
    if (all.some((f) => f.status === "verified")) {
      return { status: "error", message: "Você já tem um autenticador configurado." };
    }
    for (const f of all) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `O Bolso ${new Date().toISOString().slice(0, 10)}`,
      issuer: "O Bolso",
    });
    if (error || !data) return { status: "error", message: MSG.genericError };
    return { status: "ok", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  } catch {
    return { status: "error", message: MSG.genericError };
  }
}

export async function confirmEnrollAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await guardOrigin())) return { status: "error", message: MSG.genericError };
  let outcome: Outcome;
  try {
    const parsed = mfaEnrollVerifySchema.safeParse({ factorId: formData.get("factorId"), code: formData.get("code") });
    if (!parsed.success) return { status: "error", message: MSG.invalidCode };

    const { supabase, user } = await requireMemberAal1();
    const limit = await hitRateLimit(supabase, "mfa_user", user.id);
    if (!limit.allowed) return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: parsed.data.factorId,
      code: parsed.data.code,
    });
    if (error) return { status: "error", message: MSG.invalidCode };

    logSecurityEvent("mfa_enrolled");
    // Autenticador novo invalida os códigos de recuperação anteriores.
    await supabase.rpc("mfa_recovery_codes_clear");
    await onLoginCompleted(supabase, user);
    // Os códigos de recuperação são gerados em página própria (aal2).
    outcome = { redirect: "/mfa/codigos" };
  } catch (e) {
    if (e instanceof UnauthorizedError) outcome = { redirect: "/login" };
    else return { status: "error", message: MSG.genericError };
  }
  return finish(outcome);
}

export type RecoveryCodesResult = { status: "ok"; codes: string[] } | { status: "error"; message: string };

/** Gera (ou regenera) os 10 códigos de recuperação. Exige aal2. Exibidos uma única vez. */
export async function generateRecoveryCodesAction(): Promise<RecoveryCodesResult> {
  if (!(await guardOrigin())) return { status: "error", message: MSG.genericError };
  try {
    const { supabase } = await requireMember();
    const { data, error } = await supabase.rpc("mfa_recovery_codes_generate");
    if (error || !data || data.length !== 10) return { status: "error", message: MSG.genericError };
    logSecurityEvent("mfa_recovery_codes_generated");
    return { status: "ok", codes: data };
  } catch {
    return { status: "error", message: MSG.genericError };
  }
}

// ---------------------------------------------------------------------------
// MFA: uso de código de recuperação
// ---------------------------------------------------------------------------
export async function redeemRecoveryCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await guardOrigin())) return { status: "error", message: MSG.genericError };
  let outcome: Outcome;
  try {
    const parsed = recoveryCodeSchema.safeParse(formData.get("code"));
    if (!parsed.success) return { status: "error", message: "Código de recuperação inválido." };

    const { supabase, user } = await requireMemberAal1();
    const ip = await clientIp();
    const [byUser, byIp] = await Promise.all([
      hitRateLimit(supabase, "mfa_user", user.id),
      hitRateLimit(supabase, "mfa_ip", ip),
    ]);
    if (!byUser.allowed || !byIp.allowed) {
      return { status: "error", message: rateLimitMessage(Math.max(byUser.retryAfterSeconds, byIp.retryAfterSeconds)) };
    }

    const { data: ok, error } = await supabase.rpc("mfa_recovery_code_consume", { p_code: parsed.data });
    if (error || ok !== true) {
      logSecurityEvent("mfa_recovery_failed");
      return { status: "error", message: "Código de recuperação inválido." };
    }
    logSecurityEvent("mfa_recovery_used");
    await supabase.auth.refreshSession();
    if (user.email) await sendRecoveryCodeUsedAlert(user.email);
    outcome = { redirect: "/mfa/configurar" };
  } catch (e) {
    if (e instanceof UnauthorizedError) outcome = { redirect: "/login" };
    else return { status: "error", message: MSG.genericError };
  }
  return finish(outcome);
}

// ---------------------------------------------------------------------------
// Recuperação de senha (resposta sempre idêntica)
// ---------------------------------------------------------------------------
export async function requestRecoveryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await guardOrigin())) return { status: "error", message: MSG.genericError };

  return atLeast(
    1200,
    (async (): Promise<FormState> => {
      const parsed = recoveryRequestSchema.safeParse({
        email: formData.get("email"),
        turnstileToken: formData.get("cf-turnstile-response"),
      });
      if (!parsed.success) return { status: "error", message: "Informe um e-mail válido e conclua a verificação." };
      const { email, turnstileToken } = parsed.data;

      const ip = await clientIp();
      const supabase = await createClient();
      const [byIp, byEmail] = await Promise.all([
        hitRateLimit(supabase, "recovery_ip", ip),
        hitRateLimit(supabase, "recovery_email", email),
      ]);
      if (!byIp.allowed || !byEmail.allowed) {
        return {
          status: "error",
          message: rateLimitMessage(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds)),
        };
      }
      if (!(await verifyTurnstile(turnstileToken, ip, "recovery"))) {
        return { status: "error", message: MSG.captchaFailed };
      }

      const env = serverEnv();
      if (env.ALLOWED_EMAILS.includes(email)) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${new URL(env.APP_ORIGIN).origin}/auth/confirm`,
        });
        logSecurityEvent(error ? "recovery_send_failed" : "recovery_sent");
      } else {
        logSecurityEvent("recovery_not_allowlisted");
      }
      return { status: "success", message: MSG.recoverySent };
    })(),
  );
}

/** Confirmação do link de recuperação (POST explícito, para que scanners de e-mail não consumam o token). */
export async function confirmRecoveryLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await guardOrigin())) return { status: "error", message: MSG.genericError };
  let outcome: Outcome;
  const tokenHash = formData.get("token_hash");
  if (typeof tokenHash !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) {
    return { status: "error", message: "Link inválido ou expirado. Peça um novo." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (error || !data.user) {
    logSecurityEvent("recovery_link_invalid");
    return { status: "error", message: "Link inválido ou expirado. Peça um novo." };
  }
  const { data: isMember } = await supabase.rpc("am_i_member");
  if (isMember !== true) {
    await supabase.auth.signOut({ scope: "local" });
    outcome = { redirect: "/acesso-negado" };
  } else {
    await startAppSession(data.user.id);
    await startPasswordReset(data.user.id);
    logSecurityEvent("recovery_link_ok");
    // Precisa passar pelo MFA antes de trocar a senha.
    outcome = { redirect: await mfaLandingPath(supabase) };
  }
  return finish(outcome);
}

// ---------------------------------------------------------------------------
// Nova senha (após recuperação + MFA)
// ---------------------------------------------------------------------------
export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await guardOrigin())) return { status: "error", message: MSG.genericError };
  let outcome: Outcome;
  try {
    const { supabase, user } = await requireMember();
    const store = await cookies();
    const valid = await isPwResetValid(serverEnv().SESSION_SECRET, store.get(PWRESET_COOKIE)?.value, user.id, Date.now());
    if (!valid) return { status: "error", message: "O prazo para redefinir a senha expirou. Peça um novo link." };

    const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
    if (!parsed.success) {
      return { status: "error", message: parsed.error.issues[0]?.message ?? MSG.genericError };
    }

    const pwned = await checkPwnedPassword(parsed.data.password);
    if (pwned === "pwned") {
      return {
        status: "error",
        message: "Essa senha aparece em vazamentos de dados conhecidos. Escolha outra.",
      };
    }
    if (pwned === "unavailable") {
      return { status: "error", message: "Não foi possível verificar a senha agora. Tente novamente em instantes." };
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      if (error.code === "same_password") {
        return { status: "error", message: "A nova senha precisa ser diferente da atual." };
      }
      if (error.code === "weak_password") {
        return { status: "error", message: "Senha fraca. Use pelo menos 12 caracteres." };
      }
      return { status: "error", message: MSG.genericError };
    }
    store.delete(PWRESET_COOKIE);
    await supabase.auth.signOut({ scope: "others" });
    logSecurityEvent("password_reset_ok");
    outcome = { redirect: "/" };
  } catch (e) {
    if (e instanceof UnauthorizedError) outcome = { redirect: "/login" };
    else return { status: "error", message: MSG.genericError };
  }
  return finish(outcome);
}

// ---------------------------------------------------------------------------
// Sair
// ---------------------------------------------------------------------------
export async function signOutAction(): Promise<void> {
  if (!(await guardOrigin())) return;
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  await clearAppCookies();
  redirect("/login");
}

export async function signOutEverywhereAction(): Promise<void> {
  if (!(await guardOrigin())) return;
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  await clearAppCookies();
  logSecurityEvent("signout_global");
  redirect("/login");
}
