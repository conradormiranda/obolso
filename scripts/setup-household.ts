/**
 * Setup do household de PRODUÇÃO. Rodar UMA vez, localmente, pelo terminal:
 *
 *   SUPABASE_URL=... SETUP_SUPABASE_SERVICE_ROLE_KEY=... RATE_LIMIT_SECRET=... \
 *   PAI_EMAIL=... PAI_NOME=... MAE_EMAIL=... MAE_NOME=... HOUSEHOLD_NAME="Família ..." \
 *   npm run setup:household
 *
 * - A service_role key só existe nesta execução (variável do shell). Nunca vai
 *   para arquivo, repositório, Vercel ou frontend.
 * - Cria os 2 usuários com senha aleatória que NÃO é exibida. Cada um define a
 *   própria senha pelo fluxo "Esqueci minha senha" e então configura o MFA.
 * - Idempotente: rodar de novo não duplica nada.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Database } from "../src/lib/supabase/database.types";

const env = z
  .object({
    SUPABASE_URL: z.url(),
    SETUP_SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    RATE_LIMIT_SECRET: z.string().min(32),
    PAI_EMAIL: z.email(),
    PAI_NOME: z.string().min(1).max(60),
    // Mãe é opcional: pode ser adicionada depois rodando o script de novo.
    MAE_EMAIL: z.email().optional(),
    MAE_NOME: z.string().min(1).max(60).optional(),
    HOUSEHOLD_NAME: z.string().min(1).max(80),
  })
  .safeParse(process.env);

if (!env.success) {
  console.error("Variáveis ausentes:", env.error.issues.map((i) => i.path.join(".")).join(", "));
  process.exit(1);
}
const e = env.data;

const CATEGORIES = [
  { key: "custos_fixos", name: "Custos fixos", icon: "house", color: "#5BC0EB", sort_order: 1 },
  { key: "conforto", name: "Conforto", icon: "car", color: "#4FE3C1", sort_order: 2 },
  { key: "metas", name: "Metas", icon: "target", color: "#F2E94E", sort_order: 3 },
  { key: "prazeres", name: "Prazeres", icon: "wine", color: "#F28CE6", sort_order: 4 },
  { key: "liberdade_financeira", name: "Liberdade financeira", icon: "dollar-sign", color: "#6C8CF5", sort_order: 5 },
  { key: "conhecimento", name: "Conhecimento", icon: "graduation-cap", color: "#F7931E", sort_order: 6 },
] as const;

const admin = createClient<Database>(e.SUPABASE_URL, e.SETUP_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Result = { data: unknown; error: { message: string } | null };

async function must<R extends Result>(label: string, p: PromiseLike<R>): Promise<NonNullable<R["data"]>> {
  const { data, error } = await p;
  if (error || data === null || data === undefined) {
    console.error(`Falha em ${label}: ${error?.message ?? "sem dados"}`);
    process.exit(1);
  }
  return data as NonNullable<R["data"]>;
}

async function ensureUser(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const allow = await admin.rpc("admin_allow_email", { p_email: normalized });
  if (allow.error) {
    console.error(`Falha em admin_allow_email: ${allow.error.message}`);
    process.exit(1);
  }
  const list = await must("listUsers", admin.auth.admin.listUsers({ page: 1, perPage: 200 }));
  const found = list.users.find((u) => u.email === normalized);
  if (found) return found.id;
  const created = await must(
    "createUser",
    admin.auth.admin.createUser({
      email: normalized,
      password: randomBytes(32).toString("base64url"), // descartada; o usuário redefine
      email_confirm: true,
    }),
  );
  if (!created.user) process.exit(1);
  return created.user.id;
}

async function main() {
  const secret = await admin.rpc("admin_set_rate_limit_secret", { p_secret: e.RATE_LIMIT_SECRET });
  if (secret.error) {
    console.error(`Falha em admin_set_rate_limit_secret: ${secret.error.message}`);
    process.exit(1);
  }

  const households = await must("households", admin.from("households").select("id, name"));
  let householdId: string;
  if (households.length === 0) {
    const hh = await must("insert household", admin.from("households").insert({ name: e.HOUSEHOLD_NAME }).select("id").single());
    householdId = hh.id;
    const cats = await admin.from("categories").insert(CATEGORIES.map((c) => ({ ...c, household_id: householdId })));
    if (cats.error) {
      console.error(`Falha em categories: ${cats.error.message}`);
      process.exit(1);
    }
  } else {
    const first = households[0];
    if (!first) process.exit(1);
    householdId = first.id;
  }

  if (Boolean(e.MAE_EMAIL) !== Boolean(e.MAE_NOME)) {
    console.error("Informe MAE_EMAIL e MAE_NOME juntos (ou nenhum dos dois).");
    process.exit(1);
  }
  const paiId = await ensureUser(e.PAI_EMAIL);
  const rows: { household_id: string; user_id: string; display_name: string; role: "pai" | "mae" }[] = [
    { household_id: householdId, user_id: paiId, display_name: e.PAI_NOME, role: "pai" },
  ];
  if (e.MAE_EMAIL && e.MAE_NOME) {
    const maeId = await ensureUser(e.MAE_EMAIL);
    rows.push({ household_id: householdId, user_id: maeId, display_name: e.MAE_NOME, role: "mae" });
  }

  const members = await admin.from("household_members").upsert(rows, { onConflict: "household_id,user_id" });
  if (members.error) {
    console.error(`Falha em household_members: ${members.error.message}`);
    process.exit(1);
  }

  console.log(`Household configurado com ${rows.length} membro(s) e 6 categorias.`);
  console.log('Próximo passo: cada um acessa o app, clica em "Esqueci minha senha", define a senha e configura o MFA.');
}

void main();
