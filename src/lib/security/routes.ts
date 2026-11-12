/**
 * Decisão de roteamento do middleware (função pura, testada em unidade).
 *
 * Ordem: sem sessão → /login. Com sessão aal1 → apenas telas de MFA.
 * Com aal2 → app liberado (exceto telas de login/MFA, que voltam para "/").
 */

export const PUBLIC_PATHS = new Set(["/login", "/recuperar-senha", "/auth/confirm", "/acesso-negado"]);
export const LOGOUT_PATH = "/sair";
export const MFA_VERIFY_PATH = "/mfa";
export const MFA_SETUP_PATH = "/mfa/configurar";
export const MFA_RECOVERY_PATH = "/mfa/recuperar";
export const PWRESET_PATH = "/redefinir-senha";

const AUTH_ONLY_WHEN_LOGGED_OUT = new Set(["/login", "/recuperar-senha", MFA_VERIFY_PATH, MFA_RECOVERY_PATH, MFA_SETUP_PATH]);

export type RouteInput = {
  path: string;
  hasUser: boolean;
  aal: "aal1" | "aal2" | null;
  hasVerifiedFactor: boolean;
  pwResetPending: boolean;
};

export type RouteDecision = { action: "next" } | { action: "redirect"; to: string };

const next: RouteDecision = { action: "next" };
const redirect = (to: string): RouteDecision => ({ action: "redirect", to });

export function decideRoute(input: RouteInput): RouteDecision {
  const { path } = input;

  if (!input.hasUser) {
    return PUBLIC_PATHS.has(path) ? next : redirect("/login");
  }

  if (path === LOGOUT_PATH || path === "/acesso-negado" || path === "/auth/confirm") {
    return next;
  }

  if (input.aal !== "aal2") {
    const allowed = input.hasVerifiedFactor ? [MFA_VERIFY_PATH, MFA_RECOVERY_PATH] : [MFA_SETUP_PATH];
    return allowed.includes(path) ? next : redirect(allowed[0] as string);
  }

  // aal2
  if (input.pwResetPending && path !== PWRESET_PATH) return redirect(PWRESET_PATH);
  if (!input.pwResetPending && path === PWRESET_PATH) return redirect("/");
  if (AUTH_ONLY_WHEN_LOGGED_OUT.has(path)) return redirect("/");
  return next;
}
