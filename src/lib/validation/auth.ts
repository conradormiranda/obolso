import { z } from "zod";

export const PASSWORD_MIN = 12;
/** bcrypt (usado pelo Supabase Auth) considera só os primeiros 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: "E-mail inválido." }));

/** No login aceitamos qualquer senha não vazia; a política vale na criação/troca. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
  turnstileToken: z.string().min(1).max(4096),
});

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN, { error: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` })
      .refine((p) => new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES, {
        error: `A senha pode ter no máximo ${PASSWORD_MAX_BYTES} bytes.`,
      }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { error: "As senhas não conferem.", path: ["confirm"] });

export const totpCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, { error: "Informe os 6 dígitos do aplicativo autenticador." }));

export const mfaVerifySchema = z.object({ code: totpCodeSchema });

export const mfaEnrollVerifySchema = z.object({
  factorId: z.uuid(),
  code: totpCodeSchema,
});

export const recoveryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/, { error: "Código de recuperação inválido." }));

export const recoveryRequestSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().min(1).max(4096),
});
