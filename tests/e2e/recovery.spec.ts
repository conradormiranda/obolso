import { expect, test } from "@playwright/test";
import { adminClient, deleteAllFactors, totpNow } from "../support/fixtures";
import { freshTotp, loadFixtures, resetRateLimits } from "./helpers";

/**
 * Primeiro acesso real: link de recuperação (o mesmo do e-mail) → Continuar →
 * configurar MFA → códigos → nova senha → app. E depois o login normal com a
 * senha nova + código do autenticador.
 */
const fx = loadFixtures();

test.describe("primeiro acesso pelo link de recuperação", () => {
  test.skip(!fx, "Sem Supabase de dev configurado");
  test.describe.configure({ timeout: 180_000 });

  test.afterAll(async () => {
    if (!fx) return;
    await adminClient().auth.admin.updateUserById(fx.mae.id, { password: fx.mae.password });
  });

  test("link → MFA → códigos → nova senha → app → sair → login com a senha nova", async ({ page }) => {
    if (!fx) return;
    await resetRateLimits();
    await deleteAllFactors(fx.mae.id);
    const admin = adminClient();
    await admin.rpc("admin_reset_rate_limits");
    // Zera os códigos de recuperação da Mãe (como um usuário novo).
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "recovery", email: fx.mae.email });
    expect(error).toBeNull();
    const tokenHash = link?.properties?.hashed_token ?? "";
    expect(tokenHash).not.toBe("");

    // 1) Link do e-mail
    await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=recovery`);
    await page.getByRole("button", { name: "Continuar" }).click();

    // 2) Configurar MFA
    await page.waitForURL("**/mfa/configurar");
    await page.getByRole("button", { name: "Começar configuração" }).click();
    await page.getByText("Não consegue escanear? Digite a chave").click();
    const secret = (await page.locator("details code").textContent())?.trim() ?? "";
    const code1 = totpNow(secret);
    await page.getByLabel("Código de 6 dígitos").fill(code1);
    await page.getByRole("button", { name: "Ativar" }).click();

    // 3) Códigos de recuperação (obrigatórios antes de seguir)
    await page.waitForURL("**/mfa/codigos");
    await page.getByRole("button", { name: /Gerar (novos )?códigos/ }).click();
    await expect(page.locator("ol li")).toHaveCount(10);
    await page.getByLabel("Guardei os códigos em local seguro").check();
    await page.getByRole("link", { name: "Continuar" }).click();

    // 4) Nova senha
    await page.waitForURL("**/redefinir-senha");
    const newPassword = `primeiro-acesso-${Date.now()}-ok`;
    await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
    await page.getByLabel("Repita a nova senha").fill(newPassword);
    await page.getByRole("button", { name: "Salvar nova senha" }).click();

    // 5) Dentro do app
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByRole("heading", { name: "Orçamento doméstico" })).toBeVisible();
    await expect(page.getByText("Algo deu errado")).toHaveCount(0);

    // 6) Sair e entrar com a senha nova + TOTP
    await page.goto("/conta");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await page.waitForURL("**/login");
    await resetRateLimits();
    await page.getByLabel("E-mail").fill(fx.mae.email);
    await page.getByLabel("Senha").fill(newPassword);
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL("**/mfa");
    await page.getByLabel("Código de 6 dígitos").fill(await freshTotp(secret, code1));
    await page.getByRole("button", { name: "Verificar" }).click();
    await page.waitForURL((u) => u.pathname === "/");
    await expect(page.getByRole("heading", { name: "Orçamento doméstico" })).toBeVisible();
  });
});
