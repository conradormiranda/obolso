import { expect, test, type Locator } from "@playwright/test";
import { adminClient } from "../support/fixtures";
import { loadFixtures, loginWithFreshMfa } from "./helpers";

const fx = loadFixtures();
const year = 2050 + Math.floor(Math.random() * 40);
const mm = 1 + Math.floor(Math.random() * 11);
const M = `${year}-${String(mm).padStart(2, "0")}`;
const M2 = `${year}-${String(mm + 1).padStart(2, "0")}`;
const TAG = Math.random().toString(36).slice(2, 7);

test.describe("Fase 3: usabilidade", () => {
  test.skip(!fx, "Sem Supabase de dev configurado");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.afterAll(async () => {
    if (!fx) return;
    const admin = adminClient();
    const { data } = await admin.from("monthly_budgets").select("id").in("month", [`${M}-01`, `${M2}-01`]);
    const ids = (data ?? []).map((b) => b.id);
    if (ids.length) {
      await admin.from("expenses").delete().in("budget_id", ids);
      await admin.from("monthly_budgets").delete().in("id", ids);
    }
    await admin.from("recurring_templates").delete().like("description", `%${TAG}`);
  });

  test("recorrentes, lançamento rápido em 4 toques, duplicidade e cópia do mês anterior", async ({ page }) => {
    if (!fx) return;
    await loginWithFreshMfa(page, fx.pai);

    // 1) Modelo recorrente
    await page.goto("/recorrentes");
    await page.getByLabel("Descrição").fill(`E2E Aluguel ${TAG}`);
    await page.getByLabel("Valor (R$)").pressSequentially("250000");
    await expect(page.getByLabel("Valor (R$)")).toHaveValue("2.500,00");
    await page.getByLabel("Início (dia do lançamento)").fill(`${year}-01-10`);
    await page.getByRole("button", { name: "Criar recorrente" }).click();
    await expect(page.getByText("Recorrente criado.")).toBeVisible();

    // 2) Mês novo gera o lançamento recorrente
    await page.goto(`/?mes=${M}`);
    await page.getByRole("button", { name: /Criar orçamento de/ }).click();
    await expect(page.getByText("Renda do mês")).toBeVisible();
    await page.goto(`/categoria/custos-fixos?mes=${M}`);
    await expect(page.getByText(`E2E Aluguel ${TAG}`)).toBeVisible();

    // 3) Primeiro lançamento rápido (cria o histórico para o autocompletar)
    await page.goto(`/?mes=${M}`);
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    const amount = page.getByLabel("Valor em reais");
    await expect(amount).toBeFocused();
    await amount.pressSequentially("4990");
    await expect(amount).toHaveValue("49,90");
    await page.getByRole("combobox", { name: "Descrição" }).fill(`E2E Streaming ${TAG}`);
    await page.locator(`label[title="Conforto"]`).click();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // 4) Lançamento rápido em até 4 toques, com sugestão da categoria da última vez
    let taps = 0;
    const tap = async (l: Locator) => {
      taps += 1;
      await l.click();
    };
    await tap(page.getByRole("button", { name: "Novo lançamento" })); // 1
    await page.getByLabel("Valor em reais").pressSequentially("4990"); // teclado numérico (já focado)
    await tap(page.getByRole("combobox", { name: "Descrição" })); // 2
    await page.keyboard.type("E2E Str");
    await tap(page.getByRole("option").filter({ hasText: `E2E Streaming ${TAG}` })); // 3
    await expect(page.getByRole("radio", { name: "Conforto" })).toBeChecked();
    await tap(page.getByRole("button", { name: "Salvar" })); // 4
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(taps).toBeLessThanOrEqual(4);

    // 5) A partir da tela de categoria, a categoria vem pré-selecionada → duplicidade
    await page.goto(`/categoria/custos-fixos?mes=${M}`);
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await expect(page.getByRole("radio", { name: "Custos fixos" })).toBeChecked();
    await page.getByLabel("Valor em reais").pressSequentially("4990");
    await page.getByRole("combobox", { name: "Descrição" }).fill(`E2E Streaming ${TAG}`);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.goto(`/?mes=${M}`);
    const alert = page.getByRole("alert").filter({ hasText: "Possível lançamento duplicado" });
    await expect(alert).toContainText(`E2E Streaming ${TAG}`);
    await expect(alert).toContainText("Custos fixos");
    await expect(alert).toContainText("Conforto");

    // 6) Copiar metas e rendas do mês anterior
    await page.goto(`/renda?mes=${M}`);
    await page.getByLabel("Descrição").fill(`E2E Salário ${TAG}`);
    await page.getByLabel("Valor (R$)").fill("8.000,00");
    await page.getByRole("button", { name: "Adicionar renda" }).click();
    await expect(page.getByText("Renda adicionada.")).toBeVisible();
    await page.goto(`/?mes=${M2}`);
    await page.getByRole("button", { name: "Copiar metas e rendas do mês anterior" }).click();
    await expect(page.getByText(/Metas copiadas e 1 renda adicionada/)).toBeVisible();
    await expect(page.getByText("R$ 8.000,00").first()).toBeVisible();
    await page.screenshot({ path: "test-results/phase3-dashboard.png", fullPage: true });
  });

  test("PWA: manifesto e ícones, sem service worker (sem cache offline)", async ({ page, request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const json = (await manifest.json()) as { name: string; display: string; icons: { src: string }[] };
    expect(json.name).toBe("O Bolso");
    expect(json.display).toBe("standalone");
    for (const icon of json.icons) {
      const r = await request.get(icon.src);
      expect(r.status()).toBe(200);
      expect(r.headers()["content-type"]).toContain("image/png");
    }
    await page.goto("/login");
    const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    expect(registrations).toBe(0);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });
});
