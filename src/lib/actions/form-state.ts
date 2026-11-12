export type FormState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: Record<string, string> }
  | { status: "success"; message: string };

export const idleState: FormState = { status: "idle" };

export const MSG = {
  invalidCredentials: "E-mail ou senha inválidos.",
  captchaFailed: "Não foi possível confirmar a verificação anti-robô. Tente novamente.",
  genericError: "Não foi possível concluir a operação. Tente novamente.",
  invalidCode: "Código inválido. Confira o aplicativo autenticador e tente de novo.",
  recoverySent:
    "Se o e-mail estiver autorizado, você receberá em instantes um link para redefinir a senha. Confira também a caixa de spam.",
} as const;

/** Campos de texto enviados, para reexibir o formulário após um erro (React 19 limpa o form). */
export function echoFields(formData: FormData, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) {
    const v = formData.get(n);
    if (typeof v === "string") out[n] = v.slice(0, 2000);
  }
  return out;
}
