import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { adminClient } from "../support/fixtures";
import { freshTotp, loadFixtures, loginWithFreshMfa } from "./helpers";

const fx = loadFixtures();
const YEAR = 2050 + Math.floor(Math.random() * 40);
const MONTH = `${YEAR}-03`;
const TAG = Math.random().toString(36).slice(2, 7);

test.describe("Fase 4: análise, exportação, auditoria e configurações", () => {
  test.skip(!fx, "Sem Supabase de dev configurado");
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.afterAll(async () => {
    if (!fx) return;
    const admin = adminClient();
    const { data } = await admin.from("monthly_budgets").select("id").gte("month", `${YEAR}-01-01`).lte("month", `${YEAR}-12-01`);
    const ids = (data ?? []).map((b) => b.id);
    if (ids.length) {
      await admin.from("expenses").delete().in("budget_id", ids);
      await admin.from("monthly_budgets").delete().in("id", ids);
    }
    await admin.from("household_members").update({ display_name: "Mãe Teste" }).eq("user_id", fx.mae.id);
    // restaura a senha da fixture (o teste troca a senha da Mãe)
    await admin.auth.admin.updateUserById(fx.mae.id, { password: fx.mae.password });
  });

  test("visão anual, exportação CSV/XLSX e auditoria", async ({ page, browser }) => {
    if (!fx) return;
    await loginWithFreshMfa(page, fx.pai);

    // Dados do mês: renda 10.000 e 1.000 em Liberdade financeira
    await page.goto(`/?mes=${MONTH}`);
    await page.getByRole("button", { name: /Criar orçamento de/ }).click();
    await expect(page.getByText("Renda do mês")).toBeVisible();
    await page.goto(`/renda?mes=${MONTH}`);
    await page.getByLabel("Descrição").fill(`Salário ${TAG}`);
    await page.getByLabel("Valor (R$)").fill("10.000,00");
    await page.getByRole("button", { name: "Adicionar renda" }).click();
    await expect(page.getByText("Renda adicionada.")).toBeVisible();
    await page.goto(`/categoria/liberdade-financeira?mes=${MONTH}`);
    await page.getByRole("button", { name: "Novo lançamento" }).click();
    await page.getByLabel("Valor em reais").pressSequentially("100000");
    await page.getByRole("combobox", { name: "Descrição" }).fill(`Tesouro ${TAG}`);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // Visão anual
    await page.goto(`/anual?ano=${YEAR}`);
    const freedom = page.locator("div").filter({ has: page.getByText("Foi para Liberdade financeira") }).last();
    await expect(freedom).toContainText("R$ 1.000,00");
    await expect(freedom).toContainText("10%");
    await expect(page.getByRole("table")).toContainText("Mar");
    await expect(page.getByRole("img", { name: /Gráfico de linhas/ })).toBeVisible();

    // Exportação (mesmos cookies da página)
    const csv = await page.request.get(`/exportar?periodo=${MONTH}&formato=csv`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(csv.headers()["content-disposition"]).toContain("attachment");
    expect(csv.headers()["cache-control"]).toContain("no-store");
    const csvText = await csv.text();
    expect(csvText).toContain(`Tesouro ${TAG}`);
    expect(csvText).toContain(";1000,00;");

    const xlsx = await page.request.get(`/exportar?periodo=${YEAR}&formato=xlsx`);
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    const files = unzipSync(new Uint8Array(await xlsx.body()));
    expect(strFromU8(files["xl/workbook.xml"] ?? new Uint8Array())).toContain("Resumo anual");
    expect(strFromU8(files["xl/worksheets/sheet1.xml"] ?? new Uint8Array())).toContain(`Tesouro ${TAG}`);

    expect((await page.request.get(`/exportar?periodo=abc&formato=csv`)).status()).toBe(400);
    const anon = await browser.newContext();
    const denied = await anon.request.get(`/exportar?periodo=${MONTH}&formato=csv`, { maxRedirects: 0 });
    expect([303, 307, 401]).toContain(denied.status());
    expect(await denied.text()).not.toContain(`Tesouro ${TAG}`);
    await anon.close();

    // Auditoria (somente leitura)
    await page.goto("/auditoria");
    await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
    await expect(page.getByText(`Tesouro ${TAG}`).first()).toBeVisible();
    await expect(page.getByText("Lançamento criado").first()).toBeVisible();
  });

  test("configurações: nome, sessões, troca de senha e de autenticador", async ({ page }) => {
    if (!fx) return;
    const { secret, lastCode } = await loginWithFreshMfa(page, fx.mae);
    await page.goto("/conta");

    // Perfil
    await page.getByLabel("Nome de exibição").fill("<b>x</b>");
    await page.getByRole("button", { name: "Salvar nome" }).click();
    await expect(page.getByText("Os caracteres < e > não são permitidos.")).toBeVisible();
    await page.getByLabel("Nome de exibição").fill("Mãe Editada");
    await page.getByRole("button", { name: "Salvar nome" }).click();
    await expect(page.getByText("Nome atualizado.")).toBeVisible();

    // Sessões ativas
    await expect(page.getByText("esta sessão")).toBeVisible();

    // Troca de senha: senha atual errada
    const newPassword = `nova-senha-e2e-${TAG}-${Date.now()}`;
    await page.getByLabel("Senha atual").fill("senha-errada-123456");
    await page.getByLabel("Nova senha (mínimo 12 caracteres)").fill(newPassword);
    await page.getByLabel("Repita a nova senha").fill(newPassword);
    await page.getByLabel("Código do autenticador").fill("000000");
    await page.getByRole("button", { name: "Trocar senha" }).click();
    await expect(page.getByText("Senha atual incorreta.")).toBeVisible();

    // código errado
    await page.getByLabel("Senha atual").fill(fx.mae.password);
    await page.getByLabel("Nova senha (mínimo 12 caracteres)").fill(newPassword);
    await page.getByLabel("Repita a nova senha").fill(newPassword);
    await page.getByLabel("Código do autenticador").fill("000000");
    await page.getByRole("button", { name: "Trocar senha" }).click();
    await expect(page.getByText(/Código inválido/)).toBeVisible();

    // sucesso
    const code = await freshTotp(secret, lastCode);
    await page.getByLabel("Senha atual").fill(fx.mae.password);
    await page.getByLabel("Nova senha (mínimo 12 caracteres)").fill(newPassword);
    await page.getByLabel("Repita a nova senha").fill(newPassword);
    await page.getByLabel("Código do autenticador").fill(code);
    await page.getByRole("button", { name: "Trocar senha" }).click();
    await expect(page.getByText("Senha alterada. As outras sessões foram encerradas.")).toBeVisible();

    // Trocar autenticador → volta para a configuração do MFA
    const code2 = await freshTotp(secret, code);
    await page.getByLabel("Código atual do autenticador").fill(code2);
    await page.getByRole("button", { name: "Trocar autenticador" }).click();
    await page.waitForURL("**/mfa/configurar");
    await expect(page.getByRole("button", { name: "Começar configuração" })).toBeVisible();
  });
});
