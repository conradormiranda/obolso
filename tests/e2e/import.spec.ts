import { expect, test } from "@playwright/test";
import { adminClient } from "../support/fixtures";
import { loadFixtures, loginWithFreshMfa } from "./helpers";

/** Botão "Importar fixas e parcelas do mês anterior" pela interface. */
const fx = loadFixtures();
const year = 2050 + Math.floor(Math.random() * 40);
const mm = 1 + Math.floor(Math.random() * 11);
const A = `${year}-${String(mm).padStart(2, "0")}`;
const B = `${year}-${String(mm + 1).padStart(2, "0")}`;
const TAG = Math.random().toString(36).slice(2, 7);

test.describe("importar do mês anterior", () => {
  test.skip(!fx, "Sem Supabase de dev configurado");
  test.describe.configure({ timeout: 180_000 });

  test.afterAll(async () => {
    if (!fx) return;
    const admin = adminClient();
    const { data } = await admin.from("monthly_budgets").select("id").in("month", [`${A}-01`, `${B}-01`]);
    const ids = (data ?? []).map((b) => b.id);
    if (ids.length) {
      await admin.from("expenses").delete().in("budget_id", ids);
      await admin.from("monthly_budgets").delete().in("id", ids);
    }
  });

  test("despesa fixa + compra parcelada 1/3 → mês seguinte traz a fixa e a 2/3", async ({ page }) => {
    if (!fx) return;
    await loginWithFreshMfa(page, fx.pai);

    // Mês A: uma fixa e uma compra parcelada (1 de 3)
    await page.goto(`/?mes=${A}`);
    await page.getByRole("button", { name: /Criar orçamento de/ }).click();
    await expect(page.getByText("Renda do mês")).toBeVisible();

    await page.goto(`/categoria/custos-fixos?mes=${A}`);
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByLabel("Valor em reais").pressSequentially("15000");
    await page.getByRole("combobox", { name: "Descrição" }).fill(`Internet ${TAG}`);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });

    await page.goto(`/categoria/prazeres?mes=${A}`);
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByLabel("Valor em reais").pressSequentially("90000");
    await page.getByRole("combobox", { name: "Descrição" }).fill(`Sofá ${TAG}`);
    await page.getByText("Mais opções").click();
    await page.getByLabel("Parcela atual").fill("1");
    await page.getByLabel("Total de parcelas").fill("3");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByText(`Sofá ${TAG}`)).toBeVisible();
    await expect(page.getByText("1/3")).toBeVisible();

    // Mês B: importar
    await page.goto(`/?mes=${B}`);
    await page.getByRole("button", { name: "Importar fixas e parcelas do mês anterior" }).click();
    await expect(page.getByText("Importado: 1 despesa fixa e 1 parcela.")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Importar fixas e parcelas do mês anterior" }).click();
    await expect(page.getByText("Nada novo para importar")).toBeVisible({ timeout: 15_000 });

    await page.goto(`/categoria/prazeres?mes=${B}`);
    await expect(page.getByText(`Sofá ${TAG}`)).toBeVisible();
    await expect(page.getByText("2/3")).toBeVisible();
    await page.goto(`/categoria/custos-fixos?mes=${B}`);
    await expect(page.getByText(`Internet ${TAG}`)).toBeVisible();
    await expect(page.getByText("R$ 150,00").first()).toBeVisible();
  });
});
