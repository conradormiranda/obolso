import { z } from "zod";

/**
 * Variáveis de ambiente do servidor. Nenhuma delas é exposta ao navegador:
 * o app não usa cliente Supabase no browser, então nem a anon key vai para o
 * bundle do cliente. A única variável pública é a site key do Turnstile.
 *
 * Este módulo não importa "server-only" porque também é usado pelo middleware.
 */
const serverSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  APP_ORIGIN: z.url(),
  SESSION_SECRET: z.string().min(32),
  RATE_LIMIT_SECRET: z.string().min(32),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  ALLOWED_EMAILS: z
    .string()
    .min(3)
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  RESEND_API_KEY: z.string().optional(),
  ALERT_EMAIL_FROM: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    // Lista apenas os nomes das variáveis inválidas, nunca os valores.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${names}`);
  }
  // Em um deploy real (https) o alerta de login por e-mail é obrigatório.
  if (parsed.data.APP_ORIGIN.startsWith("https://") && (!parsed.data.RESEND_API_KEY || !parsed.data.ALERT_EMAIL_FROM)) {
    throw new Error("Variáveis de ambiente inválidas ou ausentes: RESEND_API_KEY, ALERT_EMAIL_FROM");
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = process.env.NODE_ENV === "production";
