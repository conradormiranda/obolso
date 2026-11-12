import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { deleteAllFactors, totpNow, type Fixtures } from "../support/fixtures";

function loadFixtures(): Fixtures | null {
  try {
    return JSON.parse(readFileSync("tests/.tmp/fixtures.json", "utf8")) as Fixtures | null;
  } catch {
    return null;
  }
}

const fx = loadFixtures();
if (!fx && process.env.REQUIRE_SECURITY_TESTS === "1") {
  throw new Error("REQUIRE_SECURITY_TESTS=1 mas não há fixtures do Supabase de dev.");
}

test.describe("login, MFA e sessão", () => {
  test.skip(!fx, "Sem Supabase de dev configurado");

  async function fillLogin(page: import("@playwright/test").Page, email: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    // Chave de teste do Turnstile aprova sozinha; espera o token aparecer.
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Entrar" }).click();
  }

  test("senha errada mostra erro genérico", async ({ page }) => {
    if (!fx) return;
    await fillLogin(page, fx.pai.email, "senha-errada-123456");
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
  });

  test("e-mail inexistente mostra exatamente o mesmo erro", async ({ page }) => {
    await fillLogin(page, "ninguem-aqui@example.com", "senha-errada-123456");
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
  });

  test("usuário fora da allowlist não entra (mesma mensagem)", async ({ page }) => {
    if (!fx) return;
    await fillLogin(page, fx.intruso.email, fx.intruso.password);
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
  });

  test("primeiro acesso: configura MFA, vê códigos uma vez, entra e sai de todos os dispositivos", async ({ page }) => {
    if (!fx) return;
    await deleteAllFactors(fx.mae.id);
    await fillLogin(page, fx.mae.email, fx.mae.password);

    await page.waitForURL("**/mfa/configurar");
    // aal1 não acessa o app
    await page.goto("/");
    await page.waitForURL("**/mfa/configurar");

    await page.getByRole("button", { name: "Começar configuração" }).click();
    await page.getByText("Não consegue escanear? Digite a chave").click();
    const secret = (await page.locator("details code").textContent())?.trim() ?? "";
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    await page.getByLabel("Código de 6 dígitos").fill(totpNow(secret));
    await page.getByRole("button", { name: "Ativar" }).click();

    const codes = page.locator("ol li");
    await expect(codes).toHaveCount(10);
    await expect(codes.first()).toHaveText(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);

    await page.getByLabel("Guardei os códigos em local seguro").check();
    await page.getByRole("link", { name: "Continuar" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByText("Olá, Mãe Teste.")).toBeVisible();

    // códigos não podem ser exibidos de novo
    await page.goto("/mfa/configurar");
    await page.waitForURL((u) => u.pathname === "/");

    await page.getByRole("button", { name: "Sair de todos os dispositivos" }).click();
    await page.waitForURL("**/login");
    await page.goto("/");
    await page.waitForURL("**/login");
  });
});
