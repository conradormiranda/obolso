import { expect, test } from "@playwright/test";
import { adminClient } from "../support/fixtures";
import { loadFixtures, loginWithFreshMfa } from "./helpers";

/** Espaço pessoal: o pai lança no pessoal dele; a mãe não vê em lugar nenhum. */
const fx = loadFixtures();
const year = 2050 + Math.floor(Math.random() * 40);
const MONTH = `${year}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}`;
const SECRET = `Presente surpresa ${Math.random().toString(36).slice(2, 7)}`;

test.describe("espaço pessoal", () => {
  test.skip(!fx, "Sem Supabase de dev configurado");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.afterAll(async () => {
    if (!fx) return;
    const admin = adminClient();
    const { data } = await admin.from("monthly_budgets").select("id").eq("month", `${MONTH}-01`);
    const ids = (data ?? []).map((b) => b.id);
    if (ids.length) {
      await admin.from("expenses").delete().in("budget_id", ids);
      await admin.from("monthly_budgets").delete().in("id", ids);
    }
  });

  test("pai lança no pessoal; mãe não vê no pessoal dela, na família nem na auditoria", async ({ page, browser }) => {
    if (!fx) return;
    await loginWithFreshMfa(page, fx.pai);

    // Chave Família | Pessoal
    await page.goto(`/?mes=${MONTH}`);
    await page.getByRole("link", { name: /Pessoal/ }).click();
    await page.waitForURL(/espaco=pessoal/);
    await expect(page.getByRole("heading", { name: "Orçamento pessoal" })).toBeVisible();
    await page.getByRole("button", { name: /Criar orçamento de/ }).click();
    await expect(page.getByText("Renda do mês")).toBeVisible();
    await expect(page).toHaveURL(/espaco=pessoal/);

    // Lançamento rápido no pessoal
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByLabel("Valor em reais").pressSequentially("25000");
    await page.getByRole("combobox", { name: "Descrição" }).fill(SECRET);
    await page.locator('label[title="Prazeres"]').click();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
    await page.goto(`/categoria/prazeres?mes=${MONTH}&espaco=pessoal`);
    await expect(page.getByText(SECRET)).toBeVisible();

    // Na família do pai, não aparece
    await page.goto(`/categoria/prazeres?mes=${MONTH}`);
    await expect(page.getByText(SECRET)).toHaveCount(0);

    // Mãe: em outro navegador
    const ctx = await browser.newContext();
    const mae = await ctx.newPage();
    await loginWithFreshMfa(mae, fx.mae);
    await mae.goto(`/categoria/prazeres?mes=${MONTH}&espaco=pessoal`);
    await expect(mae.getByText(SECRET)).toHaveCount(0);
    await mae.goto(`/categoria/prazeres?mes=${MONTH}`);
    await expect(mae.getByText(SECRET)).toHaveCount(0);
    await mae.goto("/auditoria");
    await expect(mae.getByRole("heading", { name: "Auditoria" })).toBeVisible();
    await expect(mae.getByText(SECRET)).toHaveCount(0);
    const exportCsv = await mae.request.get(`/exportar?periodo=${MONTH}&formato=csv&espaco=pessoal`);
    expect(await exportCsv.text()).not.toContain(SECRET);
    await ctx.close();

    // O pai vê na própria auditoria, marcado como pessoal
    await page.goto("/auditoria");
    await expect(page.getByText(SECRET).first()).toBeVisible();
  });
});
