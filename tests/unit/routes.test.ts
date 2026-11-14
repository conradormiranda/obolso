import { describe, expect, it } from "vitest";
import { decideRoute, type RouteInput } from "@/lib/security/routes";

const base: RouteInput = { path: "/", hasUser: false, aal: null, hasVerifiedFactor: false, pwResetPending: false };

describe("decideRoute", () => {
  it("sem sessão: rotas protegidas vão para /login", () => {
    for (const path of ["/", "/mfa", "/mfa/configurar", "/redefinir-senha", "/configuracoes", "/qualquer"]) {
      expect(decideRoute({ ...base, path })).toEqual({ action: "redirect", to: "/login" });
    }
  });

  it("sem sessão: páginas públicas liberadas", () => {
    for (const path of ["/login", "/recuperar-senha", "/auth/confirm", "/acesso-negado"]) {
      expect(decideRoute({ ...base, path })).toEqual({ action: "next" });
    }
  });

  it("não existe rota de cadastro pública", () => {
    for (const path of ["/cadastro", "/signup", "/register"]) {
      expect(decideRoute({ ...base, path })).toEqual({ action: "redirect", to: "/login" });
    }
  });

  it("aal1 sem fator: só a configuração do MFA", () => {
    const u = { ...base, hasUser: true, aal: "aal1" as const };
    expect(decideRoute({ ...u, path: "/" })).toEqual({ action: "redirect", to: "/mfa/configurar" });
    expect(decideRoute({ ...u, path: "/mfa" })).toEqual({ action: "redirect", to: "/mfa/configurar" });
    expect(decideRoute({ ...u, path: "/mfa/configurar" })).toEqual({ action: "next" });
  });

  it("aal1 com fator: só verificação/recuperação", () => {
    const u = { ...base, hasUser: true, aal: "aal1" as const, hasVerifiedFactor: true };
    expect(decideRoute({ ...u, path: "/" })).toEqual({ action: "redirect", to: "/mfa" });
    expect(decideRoute({ ...u, path: "/redefinir-senha", pwResetPending: true })).toEqual({ action: "redirect", to: "/mfa" });
    expect(decideRoute({ ...u, path: "/mfa/configurar" })).toEqual({ action: "redirect", to: "/mfa" });
    expect(decideRoute({ ...u, path: "/mfa" })).toEqual({ action: "next" });
    expect(decideRoute({ ...u, path: "/mfa/recuperar" })).toEqual({ action: "next" });
  });

  it("aal2: app liberado, telas de login voltam para o início", () => {
    const u = { ...base, hasUser: true, aal: "aal2" as const, hasVerifiedFactor: true };
    expect(decideRoute({ ...u, path: "/" })).toEqual({ action: "next" });
    for (const path of ["/login", "/mfa", "/mfa/configurar", "/mfa/recuperar", "/recuperar-senha", "/redefinir-senha"]) {
      expect(decideRoute({ ...u, path })).toEqual({ action: "redirect", to: "/" });
    }
  });

  it("aal2 com redefinição pendente: força a troca de senha", () => {
    const u = { ...base, hasUser: true, aal: "aal2" as const, hasVerifiedFactor: true, pwResetPending: true };
    expect(decideRoute({ ...u, path: "/" })).toEqual({ action: "redirect", to: "/redefinir-senha" });
    expect(decideRoute({ ...u, path: "/redefinir-senha" })).toEqual({ action: "next" });
    // pode guardar os códigos de recuperação antes de trocar a senha
    expect(decideRoute({ ...u, path: "/mfa/codigos" })).toEqual({ action: "next" });
  });
});
