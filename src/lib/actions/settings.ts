"use server";

import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { checkPwnedPassword } from "@/lib/security/hibp";
import { UnauthorizedError, requireMember } from "@/lib/server/auth";
import { logSecurityEvent } from "@/lib/server/log";
import { hitRateLimit, rateLimitMessage } from "@/lib/server/rate-limit";
import { assertSameOrigin } from "@/lib/server/request";
import type { Database } from "@/lib/supabase/database.types";
import { newPasswordSchema, totpCodeSchema } from "@/lib/validation/auth";
import { safeText } from "@/lib/validation/text";
import { MSG, type FormState } from "./form-state";

async function guard() {
  try {
    await assertSameOrigin();
  } catch {
    logSecurityEvent("origin_rejected");
    return null;
  }
  try {
    return await requireMember();
  } catch (e) {
    if (e instanceof UnauthorizedError) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------
export async function updateDisplayNameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await guard();
  if (!ctx) return { status: "error", message: MSG.genericError };
  const parsed = safeText(1, 60).safeParse(formData.get("displayName"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? MSG.genericError };
  const { data, error } = await ctx.supabase
    .from("household_members")
    .update({ display_name: parsed.data })
    .eq("user_id", ctx.user.id)
    .select("user_id");
  if (error || !data.length) return { status: "error", message: MSG.genericError };
  revalidatePath("/", "layout");
  return { status: "success", message: "Nome atualizado." };
}

// ---------------------------------------------------------------------------
// Troca de senha: senha atual + código do autenticador + nova senha (HIBP)
// ---------------------------------------------------------------------------
const changePasswordSchema = z.object({
  current: z.string().min(1, { error: "Informe a senha atual." }).max(256),
  code: totpCodeSchema,
});

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await guard();
  if (!ctx) return { status: "error", message: MSG.genericError };
  const { supabase, user } = ctx;
  if (!user.email) return { status: "error", message: MSG.genericError };

  const limit = await hitRateLimit(supabase, "mfa_user", user.id);
  if (!limit.allowed) return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };

  const creds = changePasswordSchema.safeParse({ current: formData.get("current"), code: formData.get("code") });
  if (!creds.success) return { status: "error", message: creds.error.issues[0]?.message ?? MSG.genericError };
  const next = newPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!next.success) return { status: "error", message: next.error.issues[0]?.message ?? MSG.genericError };
  if (next.data.password === creds.data.current) {
    return { status: "error", message: "A nova senha precisa ser diferente da atual." };
  }

  // 1) Senha atual: verificada num cliente separado, sem tocar na sessão do usuário.
  const env = serverEnv();
  const probe = createSupabaseJs<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: pwError } = await probe.auth.signInWithPassword({ email: user.email, password: creds.data.current });
  if (pwError) {
    logSecurityEvent("password_change_wrong_current");
    return { status: "error", message: "Senha atual incorreta." };
  }
  await probe.auth.signOut({ scope: "local" });

  // 2) Código do autenticador.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.all.find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!totp) return { status: "error", message: MSG.genericError };
  const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: creds.data.code });
  if (mfaError) return { status: "error", message: MSG.invalidCode };

  // 3) Senha nova não pode estar vazada.
  const pwned = await checkPwnedPassword(next.data.password);
  if (pwned === "pwned") return { status: "error", message: "Essa senha aparece em vazamentos de dados conhecidos. Escolha outra." };
  if (pwned === "unavailable") return { status: "error", message: "Não foi possível verificar a senha agora. Tente novamente em instantes." };

  const { error } = await supabase.auth.updateUser({ password: next.data.password });
  if (error) {
    if (error.code === "same_password") return { status: "error", message: "A nova senha precisa ser diferente da atual." };
    if (error.code === "weak_password") return { status: "error", message: "Senha fraca. Use pelo menos 12 caracteres." };
    if (error.code === "reauthentication_needed") {
      return { status: "error", message: "Por segurança, saia e entre de novo antes de trocar a senha." };
    }
    return { status: "error", message: MSG.genericError };
  }
  await supabase.auth.signOut({ scope: "others" });
  logSecurityEvent("password_changed");
  return { status: "success", message: "Senha alterada. As outras sessões foram encerradas." };
}

// ---------------------------------------------------------------------------
// Trocar autenticador: confirma com o código atual, remove o fator e reconfigura
// ---------------------------------------------------------------------------
export async function replaceAuthenticatorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await guard();
  if (!ctx) return { status: "error", message: MSG.genericError };
  const { supabase, user } = ctx;
  const limit = await hitRateLimit(supabase, "mfa_user", user.id);
  if (!limit.allowed) return { status: "error", message: rateLimitMessage(limit.retryAfterSeconds) };

  const code = totpCodeSchema.safeParse(formData.get("code"));
  if (!code.success) return { status: "error", message: MSG.invalidCode };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.all.find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!totp) return { status: "error", message: MSG.genericError };
  const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.data });
  if (mfaError) return { status: "error", message: MSG.invalidCode };

  const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
  if (error) return { status: "error", message: MSG.genericError };
  await supabase.auth.refreshSession();
  logSecurityEvent("mfa_replaced");
  redirect("/mfa/configurar");
}
