import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TOTP } from "otpauth";
import { randomBytes } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";

/**
 * Fixtures dos testes de segurança e E2E.
 *
 * TRAVA DE SEGURANÇA: só roda contra o projeto Supabase de DEV. Exige
 * TEST_SUPABASE_PROJECT_REF batendo com a URL e recusa um household que não
 * seja o de teste. A service_role usada aqui é a do projeto de dev, nunca a de
 * produção.
 */

export const TEST_HOUSEHOLD_NAME = "Família Teste (dev)";
export const TEST_EMAILS = {
  pai: "e2e-pai@example.com",
  mae: "e2e-mae@example.com",
  intruso: "e2e-intruso@example.com",
} as const;

export type TestUser = { id: string; email: string; password: string };
export type Fixtures = { householdId: string; pai: TestUser; mae: TestUser; intruso: TestUser };

type Db = SupabaseClient<Database>;

export function requireTestEnv() {
  const env = {
    url: process.env.SUPABASE_URL ?? "",
    anonKey: process.env.SUPABASE_ANON_KEY ?? "",
    serviceKey: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? "",
    projectRef: process.env.TEST_SUPABASE_PROJECT_REF ?? "",
    rateLimitSecret: process.env.RATE_LIMIT_SECRET ?? "",
  };
  const missing = Object.entries(env)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Variáveis de teste ausentes: ${missing.join(", ")}`);
  if (new URL(env.url).hostname !== `${env.projectRef}.supabase.co`) {
    throw new Error("SUPABASE_URL não corresponde a TEST_SUPABASE_PROJECT_REF. Recusando rodar fora do projeto de dev.");
  }
  return env;
}

export function hasTestEnv(): boolean {
  try {
    requireTestEnv();
    return true;
  } catch {
    return false;
  }
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function adminClient(): Db {
  const env = requireTestEnv();
  return createClient<Database>(env.url, env.serviceKey, noPersist);
}

export function anonClient(): Db {
  const env = requireTestEnv();
  return createClient<Database>(env.url, env.anonKey, noPersist);
}

const CATEGORIES = [
  { key: "custos_fixos", name: "Custos fixos", icon: "house", color: "#5BC0EB", sort_order: 1 },
  { key: "conforto", name: "Conforto", icon: "car", color: "#4FE3C1", sort_order: 2 },
  { key: "metas", name: "Metas", icon: "target", color: "#F2E94E", sort_order: 3 },
  { key: "prazeres", name: "Prazeres", icon: "wine", color: "#F28CE6", sort_order: 4 },
  { key: "liberdade_financeira", name: "Liberdade financeira", icon: "dollar-sign", color: "#6C8CF5", sort_order: 5 },
  { key: "conhecimento", name: "Conhecimento", icon: "graduation-cap", color: "#F7931E", sort_order: 6 },
] as const;

async function ensureUser(admin: Db, email: string): Promise<TestUser> {
  const password = `${randomBytes(24).toString("base64url")}-Aa1`;
  const { error: allowErr } = await admin.rpc("admin_allow_email", { p_email: email });
  if (allowErr) throw new Error(`admin_allow_email: ${allowErr.message}`);

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (error) throw error;
    return { id: existing.id, email, password };
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser falhou");
  return { id: data.user.id, email, password };
}

export async function ensureFixtures(): Promise<Fixtures> {
  const env = requireTestEnv();
  const admin = adminClient();

  await admin.rpc("admin_set_rate_limit_secret", { p_secret: env.rateLimitSecret });
  await admin.rpc("admin_reset_rate_limits");

  const { data: households, error: hhErr } = await admin.from("households").select("id, name");
  if (hhErr) throw hhErr;
  let householdId: string;
  if (households.length === 0) {
    const { data, error } = await admin.from("households").insert({ name: TEST_HOUSEHOLD_NAME }).select("id").single();
    if (error) throw error;
    householdId = data.id;
    const { error: catErr } = await admin
      .from("categories")
      .insert(CATEGORIES.map((c) => ({ ...c, household_id: householdId })));
    if (catErr) throw catErr;
  } else {
    const hh = households[0];
    if (!hh || hh.name !== TEST_HOUSEHOLD_NAME) {
      throw new Error("Household existente não é o de teste. Recusando continuar (projeto errado?).");
    }
    householdId = hh.id;
  }

  const pai = await ensureUser(admin, TEST_EMAILS.pai);
  const mae = await ensureUser(admin, TEST_EMAILS.mae);
  const intruso = await ensureUser(admin, TEST_EMAILS.intruso);

  const { error: memErr } = await admin.from("household_members").upsert(
    [
      { household_id: householdId, user_id: pai.id, display_name: "Pai Teste", role: "pai" },
      { household_id: householdId, user_id: mae.id, display_name: "Mãe Teste", role: "mae" },
    ],
    { onConflict: "household_id,user_id" },
  );
  if (memErr) throw memErr;

  return { householdId, pai, mae, intruso };
}

export async function deleteAllFactors(userId: string): Promise<void> {
  const admin = adminClient();
  const { data } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of data?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
  }
}

export function totpNow(secret: string): string {
  return new TOTP({ secret, digits: 6, period: 30, algorithm: "SHA1" }).generate();
}

/** Login só com senha (aal1). */
export async function signInAal1(user: TestUser): Promise<Db> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`login aal1 falhou: ${error.message}`);
  return client;
}

/** Login completo com TOTP (aal2). Recria o fator a cada chamada. */
export async function signInAal2(user: TestUser): Promise<Db> {
  await deleteAllFactors(user.id);
  const client = await signInAal1(user);
  const { data: enrolled, error: enrollErr } = await client.auth.mfa.enroll({ factorType: "totp" });
  if (enrollErr || !enrolled) throw new Error(`enroll falhou: ${enrollErr?.message}`);
  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId: enrolled.id,
    code: totpNow(enrolled.totp.secret),
  });
  if (error) throw new Error(`verify falhou: ${error.message}`);
  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") throw new Error("sessão não chegou a aal2");
  return client;
}
