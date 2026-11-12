import { expect, test } from "@playwright/test";
import { deleteAllFactors, totpNow } from "../support/fixtures";
import { fillLogin, loadFixtures, resetRateLimits } from "./helpers";

const fx = loadFixtures();
if (!fx && process.env.REQUIRE_SECURITY_TESTS === "1") {
  throw new Error("REQUIRE_SECURITY_TESTS=1 mas não há fixtures do Supabase de dev.");
}

test.describe("login, MFA e sessão", () => {
  test.skip(!fx, "Sem Supabase de dev configurado");

  test("senha errada mostra erro genérico", async ({ page }) => {
    if (!fx) return;
    await fillLogin(page, fx.pai.email, "senha-errada-123456");
    await expect(page.locator("form [role=alert]")).toHaveText("E-mail ou senha inválidos.");
  });

  test("e-mail inexistente mostra exatamente o mesmo erro", async ({ page }) => {
    await fillLogin(page, "ninguem-aqui@example.com", "senha-errada-123456");
    await expect(page.locator("form [role=alert]")).toHaveText("E-mail ou senha inválidos.");
  });

  test("rate limit: 6ª tentativa em 15 min é bloqueada, mesmo com a senha certa", async ({ page }) => {
    if (!fx) return;
    test.setTimeout(120_000);
    await resetRateLimits();
    for (let i = 1; i <= 5; i++) {
      await fillLogin(page, fx.pai.email, `senha-errada-${i}-abcdef`, { keepRateLimit: true });
      await expect(page.locator("form [role=alert]")).toHaveText("E-mail ou senha inválidos.");
    }
    await fillLogin(page, fx.pai.email, fx.pai.password, { keepRateLimit: true });
    await expect(page.locator("form [role=alert]")).toContainText("Muitas tentativas");
    await resetRateLimits();
  });

  test("usuário fora da allowlist não entra (mesma mensagem)", async ({ page }) => {
    if (!fx) return;
    await fillLogin(page, fx.intruso.email, fx.intruso.password);
    await expect(page.locator("form [role=alert]")).toHaveText("E-mail ou senha inválidos.");
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

    // Sem códigos de recuperação, o app exige gerá-los antes de liberar o início.
    await page.waitForURL("**/mfa/codigos");
    await page.goto("/");
    await page.waitForURL("**/mfa/codigos");
    await page.getByRole("button", { name: "Gerar códigos de recuperação" }).click();

    const codes = page.locator("ol li");
    await expect(codes).toHaveCount(10);
    await expect(codes.first()).toHaveText(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);

    await page.getByLabel("Guardei os códigos em local seguro").check();
    await page.getByRole("link", { name: "Continuar" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByRole("heading", { name: "Orçamento doméstico" })).toBeVisible();

    // MFA já configurado: tela de configuração volta para o início
    await page.goto("/mfa/configurar");
    await page.waitForURL((u) => u.pathname === "/");
    // códigos não são exibidos de novo; só é possível gerar novos
    await page.goto("/mfa/codigos");
    await expect(page.getByText("Você tem 10 códigos de recuperação válidos.", { exact: false })).toBeVisible();
    await expect(page.locator("ol li")).toHaveCount(0);

    await page.goto("/conta");

    await page.getByRole("button", { name: "Sair de todos os dispositivos" }).click();
    await page.waitForURL("**/login");
    await page.goto("/");
    await page.waitForURL("**/login");
  });
});
