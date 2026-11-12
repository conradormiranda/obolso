import { describe, expect, it } from "vitest";
import {
  emailSchema,
  loginSchema,
  newPasswordSchema,
  recoveryCodeSchema,
  totpCodeSchema,
} from "@/lib/validation/auth";
import { descriptionSchema, notesSchema, tagsSchema } from "@/lib/validation/text";

describe("descrição e textos livres", () => {
  it.each([
    "<script>alert(1)</script>",
    "Aluguel <b>",
    "a > b",
    "linha\u0000nula",
    "tab\tescondido",
    "",
    "   ",
    "x".repeat(121),
  ])("rejeita %j", (v) => {
    expect(descriptionSchema.safeParse(v).success).toBe(false);
  });

  it("aceita textos comuns com acentos e símbolos", () => {
    expect(descriptionSchema.parse("  Viagem Águas de São Pedro  ")).toBe("Viagem Águas de São Pedro");
    expect(descriptionSchema.safeParse("Empréstimo - Alberto (3/10) & cia.").success).toBe(true);
  });

  it("limita observações e tags", () => {
    expect(notesSchema.safeParse("x".repeat(1001)).success).toBe(false);
    expect(tagsSchema.safeParse(Array.from({ length: 11 }, (_, i) => `t${i}`)).success).toBe(false);
    expect(tagsSchema.safeParse(["Filho", "<img>"]).success).toBe(false);
    expect(tagsSchema.safeParse(["Filho", "Casa", "Saúde"]).success).toBe(true);
  });
});

describe("autenticação", () => {
  it("normaliza e-mail", () => {
    expect(emailSchema.parse("  Pai@Example.COM ")).toBe("pai@example.com");
    expect(emailSchema.safeParse("não é email").success).toBe(false);
  });

  it("login exige token do captcha", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x", turnstileToken: "" }).success).toBe(false);
  });

  it("senha nova: mínimo 12, sem regras de composição, máx. 72 bytes", () => {
    const ok = "frase longa sem numeros";
    expect(newPasswordSchema.safeParse({ password: ok, confirm: ok }).success).toBe(true);
    expect(newPasswordSchema.safeParse({ password: "curta123!", confirm: "curta123!" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: ok, confirm: ok + "x" }).success).toBe(false);
    const long = "ç".repeat(40); // 80 bytes
    expect(newPasswordSchema.safeParse({ password: long, confirm: long }).success).toBe(false);
  });

  it("código TOTP e código de recuperação", () => {
    expect(totpCodeSchema.parse("123 456")).toBe("123456");
    expect(totpCodeSchema.safeParse("12345").success).toBe(false);
    expect(totpCodeSchema.safeParse("abcdef").success).toBe(false);
    expect(recoveryCodeSchema.parse(" abcde-23456 ")).toBe("ABCDE-23456");
    expect(recoveryCodeSchema.safeParse("ABCDE23456").success).toBe(false);
  });
});
