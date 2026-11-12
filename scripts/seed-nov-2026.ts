/**
 * Seed OPCIONAL de Novembro/2026 (seção 8 do prompt). Só roda quando você pedir:
 *
 *   SUPABASE_URL=... SETUP_SUPABASE_SERVICE_ROLE_KEY=... npm run seed:nov2026
 *
 * - Usa a service_role só nesta execução (variável do shell), como o setup.
 * - Cria o orçamento de Nov/2026 (metas padrão) se não existir.
 * - Recusa rodar se o mês já tiver lançamentos (não duplica).
 * - Premissas (o prompt não define; ajuste por variável se quiser):
 *     SEED_PAID_BY=conjunto (pai|mae|conjunto), SEED_DATE=2026-11-01,
 *     forma de pagamento = Pix. Nenhuma renda é criada.
 * - "ChatGPT" aparece em Custos fixos e em Conforto de propósito: o alerta de
 *   duplicidade (Fase 3) deve disparar com este seed.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CategoryKey, Database } from "../src/lib/supabase/database.types";
import { parseBrlToCents } from "../src/lib/validation/money";

const env = z
  .object({
    SUPABASE_URL: z.url(),
    SETUP_SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    SEED_PAID_BY: z.enum(["pai", "mae", "conjunto"]).default("conjunto"),
    SEED_DATE: z.string().regex(/^2026-11-(0[1-9]|[12]\d|30)$/).default("2026-11-01"),
  })
  .safeParse(process.env);
if (!env.success) {
  console.error("Variáveis inválidas:", env.error.issues.map((i) => i.path.join(".")).join(", "));
  process.exit(1);
}
const e = env.data;

const SEED: Record<CategoryKey, [string, string][]> = {
  custos_fixos: [
    ["Aluguel", "5.700,00"],
    ["Água", "170,70"],
    ["Gás", "250,00"],
    ["Luz", "300,00"],
    ["Plano de Saúde", "1.918,00"],
    ["Empréstimo Alberto", "300,00"],
    ["ChatGPT", "130,00"],
  ],
  conforto: [
    ["Valmir Nunes treinador", "220,00"],
    ["Fisioterapia", "970,00"],
    ["Contabilizei contador", "259,00"],
    ["ChatGPT", "130,00"],
    ["Claude", "130,00"],
    ["Elevenlabs", "600,00"],
    ["Wellhub academia", "200,00"],
  ],
  prazeres: [
    ["iPhone Naiara", "1.000,00"],
    ["Salomon Brasil", "233,00"],
    ["Restaurante Itaici", "104,00"],
    ["Restaurante Camarada", "441,50"],
    ["Restaurante", "292,00"],
    ["Viagem Águas de São Pedro", "939,00"],
    ["Viagem Campos Figueira", "595,00"],
  ],
  metas: [],
  liberdade_financeira: [],
  conhecimento: [],
};

const DEFAULT_BP: Record<CategoryKey, number> = {
  custos_fixos: 4000,
  conforto: 1000,
  metas: 1000,
  prazeres: 1000,
  liberdade_financeira: 2500,
  conhecimento: 500,
};

const admin = createClient<Database>(e.SUPABASE_URL, e.SETUP_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function main() {
  const { data: hh } = await admin.from("households").select("id").limit(1).maybeSingle();
  if (!hh) fail("Nenhum household. Rode o setup:household antes.");
  const { data: pai } = await admin.from("household_members").select("user_id").eq("role", "pai").maybeSingle();
  if (!pai) fail("Membro 'pai' não encontrado.");
  const { data: cats } = await admin.from("categories").select("id, key").eq("household_id", hh.id);
  if (!cats || cats.length !== 6) fail("Categorias ausentes.");
  const catId = new Map(cats.map((c) => [c.key, c.id]));

  let { data: budget } = await admin
    .from("monthly_budgets")
    .select("id")
    .eq("household_id", hh.id)
    .eq("month", "2026-11-01")
    .maybeSingle();
  if (!budget) {
    const ins = await admin
      .from("monthly_budgets")
      .insert({ household_id: hh.id, month: "2026-11-01", created_by: pai.user_id })
      .select("id")
      .single();
    if (ins.error) fail(`orçamento: ${ins.error.message}`);
    budget = ins.data;
    const t = await admin.from("category_targets").insert(
      cats.map((c) => ({ household_id: hh.id, budget_id: ins.data.id, category_id: c.id, percent_bp: DEFAULT_BP[c.key] })),
    );
    if (t.error) fail(`metas: ${t.error.message}`);
  }

  const { count } = await admin
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("budget_id", budget.id)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) fail("Nov/2026 já tem lançamentos. Seed não aplicado (para não duplicar).");

  const rows = (Object.entries(SEED) as [CategoryKey, [string, string][]][]).flatMap(([key, items]) =>
    items.map(([description, brl]) => {
      const cents = parseBrlToCents(brl);
      if (cents === null) fail(`valor inválido no seed: ${brl}`);
      return {
        household_id: hh.id,
        budget_id: budget.id,
        category_id: catId.get(key) ?? fail(`categoria ${key}`),
        description,
        amount_cents: cents,
        expense_date: e.SEED_DATE,
        paid_by: e.SEED_PAID_BY,
        payment_method: "pix" as const,
        created_by: pai.user_id,
      };
    }),
  );
  const res = await admin.from("expenses").insert(rows);
  if (res.error) fail(`lançamentos: ${res.error.message}`);
  console.log(`Seed aplicado: ${rows.length} lançamentos em Novembro/2026.`);
}

void main();
