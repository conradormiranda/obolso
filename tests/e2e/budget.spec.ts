import { expect, test } from "@playwright/test";
import { adminClient } from "../support/fixtures";
import { loadFixtures, loginWithFreshMfa } from "./helpers";

const fx = loadFixtures();
const year = 2050 + Math.floor(Math.random() * 40);
const mm = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const MONTH = `${year}-${mm}`;

test.describe("Fase 2: orçamento do mês", () => {
  test.skip(!fx, "Sem Supabase de dev configurado");
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.afterAll(async () => {
    if (!fx) return;
    const admin = adminClient();
    const { data } = await admin.from("monthly_budgets").select("id").eq("month", `${MONTH}-01`).maybeSingle();
    if (!data) return;
    await admin.from("expenses").delete().eq("budget_id", data.id);
    await admin.from("monthly_budgets").delete().eq("id", data.id);
  });

  test("criar mês, renda, lançamentos, metas, excluir e desfazer", async ({ page }) => {
    if (!fx) return;
    await loginWithFreshMfa(page, fx.pai);

    // Mês novo: botão de criar
    await page.goto(`/?mes=${MONTH}`);
    await page.getByRole("button", { name: /Criar orçamento de/ }).click();
    await expect(page.getByText("Renda do mês")).toBeVisible();

    // CORREÇÃO DO BUG: renda zero → "sem meta", nunca 100%
    await expect(page.getByText("sem meta").filter({ visible: true }).first()).toBeVisible();
    expect(await page.getByText("100%", { exact: true }).count()).toBe(0);
    await expect(page.getByText("Você não possui gastos cadastrados.")).toBeVisible();

    // Renda
    await page.getByRole("link", { name: /Renda do mês/ }).click();
    await page.getByLabel("Descrição").fill("Salário teste");
    await page.getByLabel("Valor (R$)").fill("10.000,00");
    await page.getByRole("button", { name: "Adicionar renda" }).click();
    await expect(page.getByText("Renda adicionada.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Renda do mês" }).locator("..").getByText("R$ 10.000,00")).toBeVisible();

    // Lançamento em Custos fixos
    await page.goto(`/categoria/custos-fixos?mes=${MONTH}`);
    await page.getByRole("link", { name: "Adicionar" }).click();
    await page.getByLabel("Valor (R$)").fill("-10");
    await page.getByLabel("Descrição").fill("Aluguel teste");
    await page.getByRole("button", { name: "Adicionar lançamento" }).click();
    await expect(page.locator("form [role=alert]")).toContainText(/Valor|maior que zero/);

    await page.getByLabel("Valor (R$)").fill("4.500,00");
    await page.getByLabel("Descrição").fill("<script>alert(1)</script>");
    await page.getByRole("button", { name: "Adicionar lançamento" }).click();
    await expect(page.locator("form [role=alert]")).toContainText("não são permitidos");

    await page.getByLabel("Descrição").fill("Aluguel teste");
    await page.getByRole("button", { name: "Adicionar lançamento" }).click();
    await page.waitForURL(`**/categoria/custos-fixos?mes=${MONTH}`);
    await expect(page.getByText("Aluguel teste")).toBeVisible();
    // devo gastar = 40% de 10.000 = 4.000 → 4.500 = 112,5% (vermelho)
    await expect(page.getByText("112,5%").filter({ visible: true }).first()).toBeVisible();

    // Excluir com confirmação e desfazer
    await page.getByRole("button", { name: "Excluir Aluguel teste" }).click();
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText("Nenhum lançamento neste mês.")).toBeVisible();
    await page.getByRole("button", { name: /Desfazer/ }).click();
    await expect(page.getByText("Aluguel teste")).toBeVisible();

    // Metas: soma diferente de 100% é recusada
    await page.goto(`/?mes=${MONTH}`);
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Meta de Conhecimento em %").fill("4");
    await expect(page.getByText("Soma: 99%")).toBeVisible();
    await page.getByRole("button", { name: "Salvar metas" }).click();
    await expect(page.getByText("A soma das metas precisa ser exatamente 100%.")).toBeVisible();
    await page.getByLabel("Meta de Conhecimento em %").fill("3");
    await page.getByLabel("Meta de Custos fixos em %").fill("42");
    await page.getByRole("button", { name: "Salvar metas" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("42%").filter({ visible: true }).first()).toBeVisible();

    // Totais do painel
    await expect(page.getByText("R$ 4.500,00").filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("R$ 5.500,00").filter({ visible: true }).first()).toBeVisible(); // ainda posso gastar
    await page.screenshot({ path: "test-results/dashboard-mobile.png", fullPage: true });
  });
});
