import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { adminClient, deleteAllFactors, hasTestEnv, totpNow, type Fixtures, type TestUser } from "../support/fixtures";

export function loadFixtures(): Fixtures | null {
  try {
    return JSON.parse(readFileSync("tests/.tmp/fixtures.json", "utf8")) as Fixtures | null;
  } catch {
    return null;
  }
}

/** Os testes fazem vários logins do mesmo IP; zera o rate limit para não se bloquearem. */
export async function resetRateLimits() {
  if (hasTestEnv()) await adminClient().rpc("admin_reset_rate_limits");
}

export async function fillLogin(page: Page, email: string, password: string, opts: { keepRateLimit?: boolean } = {}) {
  if (!opts.keepRateLimit) await resetRateLimits();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Login completo: remove fatores, entra, configura TOTP pela UI e gera códigos. */
export async function loginWithFreshMfa(page: Page, user: TestUser): Promise<{ secret: string; lastCode: string }> {
  await deleteAllFactors(user.id);
  await fillLogin(page, user.email, user.password);
  await page.waitForURL("**/mfa/configurar");
  await page.getByRole("button", { name: "Começar configuração" }).click();
  await page.getByText("Não consegue escanear? Digite a chave").click();
  const secret = (await page.locator("details code").textContent())?.trim() ?? "";
  const lastCode = totpNow(secret);
  await page.getByLabel("Código de 6 dígitos").fill(lastCode);
  await page.getByRole("button", { name: "Ativar" }).click();
  await page.waitForURL("**/mfa/codigos");
  await page.getByRole("button", { name: "Gerar códigos de recuperação" }).click();
  await page.getByLabel("Guardei os códigos em local seguro").check();
  await page.getByRole("link", { name: "Continuar" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  return { secret, lastCode };
}

/** Espera o próximo código TOTP (o mesmo código não deve ser reaproveitado). */
export async function freshTotp(secret: string, used: string): Promise<string> {
  for (let i = 0; i < 70; i++) {
    const code = totpNow(secret);
    if (code !== used) return code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("TOTP não mudou");
}
