export type FormState =
  | { status: "idle" }
  | { status: "error"; message: string }
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
