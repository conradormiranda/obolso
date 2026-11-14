import { expect, test } from "@playwright/test";
import { adminClient } from "../support/fixtures";
import { loadFixtures, loginWithFreshMfa } from "./helpers";

/** Importar fatura: arquivo → revisão (tipo de consumo + seção) → salvar. */
const fx = loadFixtures();
const year = 2050 + Math.floor(Math.random() * 40);
const mm = 1 + Math.floor(Math.random() * 12);
const M = `${year}-${String(mm).padStart(2, "0")}`;
const TAG = Math.random().toString(36).slice(2, 7).toUpperCase();
const d = (day: number) => `${String(day).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${year}`;

// CSV no formato Itaú/Bradesco (Windows-1252 com acento, ; e vírgula decimal).
const csv = [
  "data;lançamento;valor",
  `${d(3)};${TAG} BAR DO ZE;87,50`,
  `${d(4)};${TAG} CARREFOUR;312,40`,
  `${d(5)};PAGAMENTO EFETUADO;-1.500,00`,
  `${d(6)};${TAG} SOFA 02/06;450,00`,
  `${d(7)};${TAG} XPTO LTDA;19,90`,
].join("\r\n");

test.describe("importar fatura do cartão", () => {
  test.skip(!fx, "Sem Supabase de dev configurado");
  test.describe.configure({ timeout: 180_000 });

  test.afterAll(async () => {
    if (!fx) return;
    const admin = adminClient();
    const { data } = await admin.from("monthly_budgets").select("id").eq("month", `${M}-01`);
    const ids = (data ?? []).map((b) => b.id);
    if (ids.length) {
      await admin.from("expenses").delete().in("budget_id", ids);
      await admin.from("category_targets").delete().in("budget_id", ids);
      await admin.from("monthly_budgets").delete().in("id", ids);
    }
  });

  test("CSV → sugestões → escolher a seção do desconhecido → salvar → duplicados na 2ª vez", async ({ page }) => {
    if (!fx) return;
    await loginWithFreshMfa(page, fx.pai);
    await page.goto(`/importar?mes=${M}`);
    await expect(page.getByRole("heading", { name: "Importar fatura do cartão" })).toBeVisible();

    const file = { name: "fatura.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "latin1") };
    await page.locator("#statement-file").setInputFiles(file);
    await expect(page.getByText("4 compras encontradas · 1 pagamento(s)/estorno(s) ignorado(s)")).toBeVisible();

    // Sugestões por regra: tipo de consumo + seção.
    await expect(page.getByLabel(`Tipo de consumo de ${TAG} BAR DO ZE`)).toHaveValue("bares_restaurantes");
    await expect(page.getByLabel(`Seção de ${TAG} BAR DO ZE`)).toHaveValue("prazeres");
    await expect(page.getByLabel(`Tipo de consumo de ${TAG} CARREFOUR`)).toHaveValue("mercado");
    await expect(page.getByLabel(`Seção de ${TAG} CARREFOUR`)).toHaveValue("custos_fixos");
    await expect(page.getByText("2/6")).toBeVisible();

    // Desconhecido: precisa escolher a seção.
    await expect(page.getByText("Escolha a seção de 2 compras marcadas.")).toBeVisible();
    await page.getByLabel(`Tipo de consumo de ${TAG} SOFA`).selectOption("casa");
    await expect(page.getByLabel(`Seção de ${TAG} SOFA`)).toHaveValue("conforto");
    await page.getByLabel(`Seção de ${TAG} XPTO LTDA`).selectOption("conforto");

    await page.getByRole("button", { name: /Salvar 4 lançamentos/ }).click();
    await expect(page.getByText("4 lançamentos salvos.")).toBeVisible({ timeout: 20_000 });

    // Entrou na seção certa, com o tipo de consumo e a parcela.
    await page.goto(`/categoria/prazeres?mes=${M}`);
    await expect(page.getByText(`${TAG} BAR DO ZE`)).toBeVisible();
    await expect(page.getByText("Bares e restaurantes").first()).toBeVisible();
    await page.goto(`/categoria/conforto?mes=${M}`);
    await expect(page.getByText(`${TAG} SOFA`)).toBeVisible();
    await expect(page.getByText("2/6")).toBeVisible();

    // Painel por tipo de consumo.
    await page.goto(`/?mes=${M}`);
    await expect(page.getByRole("region", { name: "Por tipo de consumo" })).toContainText("Mercado");

    // Segunda vez: tudo aparece como já lançado (desmarcado).
    await page.goto(`/importar?mes=${M}`);
    await page.locator("#statement-file").setInputFiles(file);
    await expect(page.getByText("parece já lançado neste mês")).toHaveCount(4);
    await expect(page.getByRole("button", { name: /Salvar 0 lançamentos/ })).toBeDisabled();
  });
});
