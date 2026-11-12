/**
 * Testes de segurança (seção 4.5) contra o projeto Supabase de DEV.
 * No CI eles são obrigatórios (REQUIRE_SECURITY_TESTS=1 faz falhar se faltar env).
 */
import { randomBytes, createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  ensureFixtures,
  hasTestEnv,
  requireTestEnv,
  signInAal1,
  signInAal2,
  type Fixtures,
} from "../support/fixtures";

const PUBLIC_TABLES = [
  "households",
  "household_members",
  "categories",
  "monthly_budgets",
  "category_targets",
  "incomes",
  "recurring_templates",
  "expenses",
  "known_devices",
  "audit_log",
] as const;

const shouldRun = hasTestEnv();
if (!shouldRun && process.env.REQUIRE_SECURITY_TESTS === "1") {
  throw new Error("REQUIRE_SECURITY_TESTS=1 mas as variáveis do projeto de dev não estão configuradas.");
}

describe.skipIf(!shouldRun)("segurança do banco (Supabase dev)", () => {
  let fx: Fixtures;
  const createdBudgets: string[] = [];

  beforeAll(async () => {
    fx = await ensureFixtures();
  });

  afterAll(async () => {
    if (!createdBudgets.length) return;
    const admin = adminClient();
    await admin.from("expenses").delete().in("budget_id", createdBudgets);
    await admin.from("monthly_budgets").delete().in("id", createdBudgets);
  });

  // -------------------------------------------------------------------------
  describe("cadastro bloqueado", () => {
    it("signUp pela API pública retorna erro", async () => {
      const email = `novo-${randomBytes(6).toString("hex")}@example.com`;
      const { data, error } = await anonClient().auth.signUp({ email, password: randomBytes(24).toString("base64url") });
      expect(error).not.toBeNull();
      expect(data.user).toBeNull();
    });

    it("signUp com e-mail da família também é recusado", async () => {
      const { error } = await anonClient().auth.signUp({ email: fx.pai.email, password: randomBytes(24).toString("base64url") });
      expect(error).not.toBeNull();
    });

    it("banco bloqueia criação de usuário fora da allowlist até pela API admin", async () => {
      const email = `fora-${randomBytes(6).toString("hex")}@example.com`;
      const { data, error } = await adminClient().auth.admin.createUser({ email, password: "x".repeat(20), email_confirm: true });
      expect(error).not.toBeNull();
      expect(data.user).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("RLS em 100% das tabelas", () => {
    it("toda tabela tem RLS habilitado e forçado; public tem políticas e nenhum grant para anon", async () => {
      const { data, error } = await adminClient().rpc("security_rls_report");
      expect(error).toBeNull();
      expect(data && data.length).toBeGreaterThan(0);
      for (const t of data ?? []) {
        expect.soft(t.rls_enabled, `${t.schema_name}.${t.table_name} sem RLS`).toBe(true);
        expect.soft(t.rls_forced, `${t.schema_name}.${t.table_name} sem FORCE RLS`).toBe(true);
        expect.soft(t.anon_privileges, `${t.schema_name}.${t.table_name} com grant para anon`).toBe(0);
        if (t.schema_name === "public") {
          expect.soft(t.policy_count, `${t.table_name} sem política`).toBeGreaterThan(0);
        }
      }
      const publicTables = (data ?? []).filter((t) => t.schema_name === "public").map((t) => t.table_name).sort();
      expect(publicTables).toEqual([...PUBLIC_TABLES].sort());
    });

    it("relatório e funções admin não são acessíveis sem service_role", async () => {
      const anon = anonClient();
      expect((await anon.rpc("security_rls_report")).error).not.toBeNull();
      expect((await anon.rpc("admin_allow_email", { p_email: "x@example.com" })).error).not.toBeNull();
      expect((await anon.rpc("admin_reset_rate_limits")).error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("sem sessão (anon)", () => {
    it.each(PUBLIC_TABLES)("não lê %s", async (table) => {
      const { data, error } = await anonClient().from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0).toBe(true);
      expect(error).not.toBeNull(); // sem GRANT: erro de permissão
    });

    it("não escreve", async () => {
      const { error } = await anonClient().from("households").insert({ name: "invasor" });
      expect(error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("membro com senha correta mas sem MFA (aal1)", () => {
    it("não lê nenhuma tabela de dados", async () => {
      const client = await signInAal1(fx.pai);
      for (const table of PUBLIC_TABLES) {
        const { data } = await client.from(table).select("*").limit(5);
        expect(data ?? [], `aal1 leu ${table}`).toHaveLength(0);
      }
    });

    it("não escreve nem gera códigos de recuperação", async () => {
      const client = await signInAal1(fx.pai);
      const { error } = await client.from("monthly_budgets").insert({ month: "2999-01-01" });
      expect(error).not.toBeNull();
      expect((await client.rpc("mfa_recovery_codes_generate")).error).not.toBeNull();
    });

    it("am_i_member funciona em aal1 (necessário para o middleware)", async () => {
      const client = await signInAal1(fx.pai);
      const { data } = await client.rpc("am_i_member");
      expect(data).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("usuário autenticado fora da allowlist (mesmo com MFA)", () => {
    it("não lê nada e não escreve nada", async () => {
      const client = await signInAal2(fx.intruso);
      expect((await client.rpc("am_i_member")).data).toBe(false);
      for (const table of PUBLIC_TABLES) {
        const { data } = await client.from(table).select("*").limit(5);
        expect(data ?? [], `intruso leu ${table}`).toHaveLength(0);
      }
      const insert = await client
        .from("monthly_budgets")
        .insert({ household_id: fx.householdId, month: "2998-01-01" });
      expect(insert.error).not.toBeNull();
      const update = await client.from("households").update({ name: "hackeado" }).eq("id", fx.householdId).select();
      expect(update.data ?? []).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  describe("membro com MFA (aal2): controle positivo e validação no banco", () => {
    it("lê o household e as 6 categorias", async () => {
      const client = await signInAal2(fx.pai);
      expect((await client.from("households").select("id")).data).toHaveLength(1);
      expect((await client.from("categories").select("id")).data).toHaveLength(6);
    });

    it("metas precisam somar 100%, valores inválidos são rejeitados, exclusão é lógica e auditada", async () => {
      const client = await signInAal2(fx.pai);
      const month = `${3000 + Math.floor(Math.random() * 5000)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-01`;
      const { data: budget, error: bErr } = await client.from("monthly_budgets").insert({ month }).select("id").single();
      expect(bErr).toBeNull();
      if (!budget) throw new Error("sem orçamento");
      createdBudgets.push(budget.id);

      const { data: cats } = await client.from("categories").select("id, key").order("sort_order");
      const catIds = (cats ?? []).map((c) => c.id);
      expect(catIds).toHaveLength(6);

      const bad = await client
        .from("category_targets")
        .insert(catIds.map((category_id) => ({ budget_id: budget.id, category_id, percent_bp: 1000 })));
      expect(bad.error, "soma 60% deveria falhar").not.toBeNull();

      const pcts = [4000, 1000, 1000, 1000, 2500, 500];
      const good = await client
        .from("category_targets")
        .insert(catIds.map((category_id, i) => ({ budget_id: budget.id, category_id, percent_bp: pcts[i] ?? 0 })));
      expect(good.error).toBeNull();

      const base = { budget_id: budget.id, category_id: catIds[0] as string, paid_by: "pai" as const };
      const invalid: { amount_cents: number; description: string }[] = [
        { amount_cents: -100, description: "negativo" },
        { amount_cents: 0, description: "zero" },
        { amount_cents: 100_000_000_001, description: "acima de 1 bilhão" },
        { amount_cents: 100, description: "<script>alert(1)</script>" },
        { amount_cents: 100, description: "" },
      ];
      for (const v of invalid) {
        const { error } = await client.from("expenses").insert({ ...base, ...v });
        expect(error, `deveria rejeitar ${JSON.stringify(v)}`).not.toBeNull();
      }
      // texto no lugar de número
      const asText = await client
        .from("expenses")
        .insert({ ...base, description: "texto", amount_cents: "dez" as unknown as number });
      expect(asText.error).not.toBeNull();
      // float
      const asFloat = await client.from("expenses").insert({ ...base, description: "float", amount_cents: 10.5 });
      expect(asFloat.error).not.toBeNull();

      const { data: exp, error: eErr } = await client
        .from("expenses")
        .insert({ ...base, description: "Aluguel teste", amount_cents: 570000 })
        .select("id, created_by")
        .single();
      expect(eErr).toBeNull();
      if (!exp) throw new Error("sem lançamento");
      expect(exp.created_by).toBe(fx.pai.id);

      // created_by não pode ser forjado
      const forged = await client
        .from("expenses")
        .update({ created_by: fx.mae.id })
        .eq("id", exp.id)
        .select("created_by")
        .single();
      expect(forged.data?.created_by).toBe(fx.pai.id);

      // DELETE físico não é permitido
      const del = await client.from("expenses").delete().eq("id", exp.id);
      expect(del.error).not.toBeNull();

      // exclusão lógica e restauração
      const soft = await client.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", exp.id);
      expect(soft.error).toBeNull();
      const restore = await client.from("expenses").update({ deleted_at: null }).eq("id", exp.id);
      expect(restore.error).toBeNull();

      // auditoria registrou e é imutável
      const { data: audit } = await client
        .from("audit_log")
        .select("id, action, actor_id")
        .eq("table_name", "expenses")
        .eq("record_id", exp.id)
        .order("id");
      const actions = (audit ?? []).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(["INSERT", "SOFT_DELETE", "RESTORE"]));
      expect((audit ?? []).every((a) => a.actor_id === fx.pai.id)).toBe(true);

      const firstId = audit?.[0]?.id ?? 0;
      const upd = await client.from("audit_log").update({ action: "DELETE" } as never).eq("id", firstId);
      expect(upd.error).not.toBeNull();
      const delAudit = await client.from("audit_log").delete().eq("id", firstId);
      expect(delAudit.error).not.toBeNull();
      // nem a service_role apaga o log
      const adminDel = await adminClient().from("audit_log").delete().eq("id", firstId);
      expect(adminDel.error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("criação de mês (RPC create_month_budget)", () => {
    const randomMonth = () =>
      `${2050 + Math.floor(Math.random() * 40)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-01`;

    it("aal1 e intruso não criam mês", async () => {
      const aal1 = await signInAal1(fx.pai);
      expect((await aal1.rpc("create_month_budget", { p_month: randomMonth() })).error).not.toBeNull();
      const intruso = await signInAal2(fx.intruso);
      expect((await intruso.rpc("create_month_budget", { p_month: randomMonth() })).error).not.toBeNull();
    });

    it("membro aal2 cria com metas padrão (soma 100%) e é idempotente; mês inválido é recusado", async () => {
      const client = await signInAal2(fx.pai);
      const month = randomMonth();
      const first = await client.rpc("create_month_budget", { p_month: month });
      expect(first.error).toBeNull();
      if (first.data) createdBudgets.push(first.data);
      const second = await client.rpc("create_month_budget", { p_month: month });
      expect(second.data).toBe(first.data);
      const { data: targets } = await client.from("category_targets").select("percent_bp").eq("budget_id", first.data ?? "");
      expect((targets ?? []).map((t) => t.percent_bp).sort((a, b) => a - b)).toEqual([500, 1000, 1000, 1000, 2500, 4000]);
      expect((await client.rpc("create_month_budget", { p_month: "2030-05-15" })).error).not.toBeNull();
      expect((await client.rpc("create_month_budget", { p_month: "1990-01-01" })).error).not.toBeNull();
    });

    it("atualizar metas em várias instruções separadas falha (soma checada no commit)", async () => {
      const client = await signInAal2(fx.pai);
      const { data: id } = await client.rpc("create_month_budget", { p_month: randomMonth() });
      if (id) createdBudgets.push(id);
      const { data: t } = await client.from("category_targets").select("category_id").eq("budget_id", id ?? "").limit(1);
      const single = await client
        .from("category_targets")
        .update({ percent_bp: 9000 })
        .eq("budget_id", id ?? "")
        .eq("category_id", t?.[0]?.category_id ?? "");
      expect(single.error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("Fase 3: recorrentes e cópia do mês anterior", () => {
    const createdTemplates: string[] = [];
    afterAll(async () => {
      if (createdTemplates.length) await adminClient().from("recurring_templates").delete().in("id", createdTemplates);
    });

    it("mês novo gera lançamentos só dos recorrentes ativos e vigentes; dia limitado ao fim do mês", async () => {
      const client = await signInAal2(fx.pai);
      const { data: cats } = await client.from("categories").select("id, key");
      const catId = cats?.find((c) => c.key === "custos_fixos")?.id ?? "";
      const year = 2100; // único ano livre de outros testes
      const tag = randomBytes(4).toString("hex");
      const tpl = (description: string, extra: Record<string, unknown>) => ({
        category_id: catId,
        description: `${description} ${tag}`,
        amount_cents: 1000,
        paid_by: "pai" as const,
        payment_method: "boleto" as const,
        starts_on: `${year}-01-31`,
        ends_on: null,
        active: true,
        ...extra,
      });
      const { data: rows, error } = await client
        .from("recurring_templates")
        .insert([
          tpl("Ativo", {}),
          tpl("Pausado", { active: false }),
          tpl("Encerrado", { ends_on: `${year}-01-31` }),
          tpl("Futuro", { starts_on: `${year}-03-01` }),
        ])
        .select("id");
      expect(error).toBeNull();
      createdTemplates.push(...(rows ?? []).map((r) => r.id));

      // limpa fevereiro/2100 se sobrou de execução anterior
      const admin = adminClient();
      const { data: old } = await admin.from("monthly_budgets").select("id").eq("month", `${year}-02-01`).maybeSingle();
      if (old) {
        await admin.from("expenses").delete().eq("budget_id", old.id);
        await admin.from("monthly_budgets").delete().eq("id", old.id);
      }

      const { data: budgetId } = await client.rpc("create_month_budget", { p_month: `${year}-02-01` });
      if (budgetId) createdBudgets.push(budgetId);
      const { data: generated } = await client
        .from("expenses")
        .select("description, expense_date, is_recurring, recurring_template_id")
        .eq("budget_id", budgetId ?? "")
        .like("description", `%${tag}`);
      expect((generated ?? []).map((g) => g.description)).toEqual([`Ativo ${tag}`]);
      expect(generated?.[0]?.expense_date).toBe(`${year}-02-28`);
      expect(generated?.[0]?.is_recurring).toBe(true);
    });

    it("copiar mês anterior: metas sobrescritas, rendas sem duplicar; sem mês anterior dá erro", async () => {
      const client = await signInAal2(fx.pai);
      const base = 2060 + Math.floor(Math.random() * 30);
      const prev = `${base}-05-01`;
      const cur = `${base}-06-01`;
      const { data: prevId } = await client.rpc("create_month_budget", { p_month: prev });
      if (prevId) createdBudgets.push(prevId);
      const { data: cats } = await client.from("categories").select("id, key").order("sort_order");
      const custom = [5000, 1000, 1000, 1000, 1500, 500];
      await client
        .from("category_targets")
        .upsert((cats ?? []).map((c, i) => ({ budget_id: prevId ?? "", category_id: c.id, percent_bp: custom[i] ?? 0 })), {
          onConflict: "budget_id,category_id",
        });
      await client.from("incomes").insert({ budget_id: prevId ?? "", description: "Salário cópia", amount_cents: 500000, received_by: "pai" });

      const first = await client.rpc("copy_previous_month", { p_month: cur });
      expect(first.error).toBeNull();
      expect(first.data).toBe(1);
      const second = await client.rpc("copy_previous_month", { p_month: cur });
      expect(second.data).toBe(0);
      const { data: curBudget } = await client.from("monthly_budgets").select("id").eq("month", cur).single();
      if (curBudget) createdBudgets.push(curBudget.id);
      const { data: t } = await client.from("category_targets").select("percent_bp").eq("budget_id", curBudget?.id ?? "");
      expect((t ?? []).map((x) => x.percent_bp).sort((a, b) => a - b)).toEqual([...custom].sort((a, b) => a - b));
      const { data: inc } = await client.from("incomes").select("description").eq("budget_id", curBudget?.id ?? "");
      expect(inc).toHaveLength(1);

      const noPrev = await client.rpc("copy_previous_month", { p_month: "2049-01-01" });
      expect(noPrev.error).not.toBeNull();
    });

    it("intruso e aal1 não copiam meses", async () => {
      const aal1 = await signInAal1(fx.pai);
      expect((await aal1.rpc("copy_previous_month", { p_month: "2070-06-01" })).error).not.toBeNull();
      const intruso = await signInAal2(fx.intruso);
      expect((await intruso.rpc("copy_previous_month", { p_month: "2070-06-01" })).error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("códigos de recuperação do MFA", () => {
    it("código válido remove o autenticador uma única vez; código errado não", async () => {
      const aal2 = await signInAal2(fx.pai);
      const { data: codes, error } = await aal2.rpc("mfa_recovery_codes_generate");
      expect(error).toBeNull();
      expect(codes).toHaveLength(10);
      const code = codes?.[0] ?? "";

      const admin = adminClient();
      const factorsBefore = await admin.auth.admin.mfa.listFactors({ userId: fx.pai.id });
      expect(factorsBefore.data?.factors.length).toBeGreaterThan(0);

      // Nova sessão só com senha (aal1), como quem perdeu o celular.
      const aal1 = await signInAal1(fx.pai);
      expect((await aal1.rpc("mfa_recovery_code_consume", { p_code: "AAAAA-BBBBB" })).data).toBe(false);
      expect((await aal1.rpc("mfa_recovery_code_consume", { p_code: code })).data).toBe(true);
      expect((await aal1.rpc("mfa_recovery_code_consume", { p_code: code })).data).toBe(false);

      const factorsAfter = await admin.auth.admin.mfa.listFactors({ userId: fx.pai.id });
      expect(factorsAfter.data?.factors ?? []).toHaveLength(0);
    });

    it("intruso não consegue consumir códigos", async () => {
      const client = await signInAal1(fx.intruso);
      expect((await client.rpc("mfa_recovery_code_consume", { p_code: "AAAAA-BBBBB" })).error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("rate limit", () => {
    it("bloqueia na 6ª tentativa em 15 min e exige o segredo do servidor", async () => {
      const { rateLimitSecret } = requireTestEnv();
      const anon = anonClient();
      const key = createHmac("sha256", rateLimitSecret).update(`login_email:${randomBytes(8).toString("hex")}`).digest("hex");

      const noSecret = await anon.rpc("rate_limit_hit", { p_secret: "errado".repeat(8), p_scope: "login_email", p_key: key });
      expect(noSecret.error).not.toBeNull();

      for (let i = 1; i <= 5; i++) {
        const { data } = await anon.rpc("rate_limit_hit", { p_secret: rateLimitSecret, p_scope: "login_email", p_key: key });
        expect(data?.[0]?.allowed, `tentativa ${i}`).toBe(true);
      }
      const { data: blocked } = await anon.rpc("rate_limit_hit", { p_secret: rateLimitSecret, p_scope: "login_email", p_key: key });
      expect(blocked?.[0]?.allowed).toBe(false);
      expect(blocked?.[0]?.retry_after_seconds).toBeGreaterThan(800);
    });
  });
});
