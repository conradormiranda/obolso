import { expect, test } from "@playwright/test";
import { loadFixtures, loginWithFreshMfa } from "./helpers";

/**
 * Capturas de tela para revisão visual (não faz parte do CI).
 * Rodar: DEMO_SCREENSHOTS=1 npx playwright test tests/e2e/demo-screenshots.spec.ts
 * Requer o mês Nov/2026 populado no projeto de DEV (seed de demonstração).
 */
const fx = loadFixtures();
const OUT = "docs/screenshots";

test.describe("capturas de demonstração", () => {
  test.skip(!fx || !process.env.DEMO_SCREENSHOTS, "Somente sob demanda (DEMO_SCREENSHOTS=1)");
  test.describe.configure({ timeout: 180_000 });

  test("telas principais", async ({ page }) => {
    if (!fx) return;
    await page.goto("/login");
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await page.screenshot({ path: `${OUT}/01-login-celular.png` });

    await loginWithFreshMfa(page, fx.pai);

    await page.goto("/?mes=2026-11");
    await expect(page.getByText("Possível lançamento duplicado")).toBeVisible();
    await page.screenshot({ path: `${OUT}/02-painel-celular.png`, fullPage: true });

    await page.goto("/categoria/conforto?mes=2026-11");
    await page.screenshot({ path: `${OUT}/03-categoria-celular.png`, fullPage: true });

    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByLabel("Valor em reais").pressSequentially("10400");
    await page.getByRole("combobox", { name: "Descrição" }).fill("Rest");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.screenshot({ path: `${OUT}/04-lancamento-rapido-celular.png` });
    await page.keyboard.press("Escape");

    await page.goto("/recorrentes");
    await page.screenshot({ path: `${OUT}/05-recorrentes-celular.png`, fullPage: true });

    await page.goto("/conta");
    await page.screenshot({ path: `${OUT}/07-configuracoes-celular.png`, fullPage: true });

    await page.goto("/auditoria");
    await page.screenshot({ path: `${OUT}/08-auditoria-celular.png`, fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?mes=2026-11");
    await expect(page.getByText("Possível lançamento duplicado")).toBeVisible();
    await page.screenshot({ path: `${OUT}/06-painel-desktop.png`, fullPage: true });

    await page.goto("/anual?ano=2026");
    await page.screenshot({ path: `${OUT}/09-visao-anual-desktop.png`, fullPage: true });
  });
});
