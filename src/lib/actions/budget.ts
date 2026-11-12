"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CATEGORY_KEYS, CATEGORY_SLUG } from "@/lib/domain/categories";
import { monthToDb, parseMonthParam, type MonthRef } from "@/lib/domain/month";
import { UnauthorizedError, requireMember } from "@/lib/server/auth";
import { loadCategories } from "@/lib/server/budget-data";
import { logSecurityEvent } from "@/lib/server/log";
import { assertSameOrigin } from "@/lib/server/request";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  expenseFormSchema,
  incomeFormSchema,
  monthParamSchema,
  recurringFormSchema,
  targetsSchema,
  uuidSchema,
} from "@/lib/validation/budget";
import { MSG, echoFields, type FormState } from "./form-state";

/**
 * Mutações do orçamento. Em TODAS: Origin verificado → sessão + aal2 + membro
 * (requireMember) → entrada validada com Zod → autorização final pelo RLS.
 */

type Ctx = { supabase: AppSupabaseClient; userId: string };

async function memberContext(): Promise<Ctx | null> {
  try {
    await assertSameOrigin();
  } catch {
    logSecurityEvent("origin_rejected");
    return null;
  }
  try {
    const { supabase, user } = await requireMember();
    return { supabase, userId: user.id };
  } catch (e) {
    if (e instanceof UnauthorizedError) return null;
    throw e;
  }
}

function fieldError(error: { issues: { message: string }[] }, fields?: Record<string, string>): FormState {
  return { status: "error", message: error.issues[0]?.message ?? MSG.genericError, fields };
}

function dbError(code: string | undefined, fields?: Record<string, string>): FormState {
  if (code === "23514") return { status: "error", message: "Valores inválidos. Confira os campos.", fields };
  return { status: "error", message: MSG.genericError, fields };
}

const EXPENSE_FIELDS = ["category", "description", "amount", "expenseDate", "paidBy", "paymentMethod", "tags", "notes"] as const;
const INCOME_FIELDS = ["description", "amount", "receivedBy"] as const;

function refresh() {
  revalidatePath("/", "layout");
}

async function ensureBudget(supabase: AppSupabaseClient, ref: MonthRef): Promise<string | null> {
  const { data, error } = await supabase.rpc("create_month_budget", { p_month: monthToDb(ref) });
  return error ? null : data;
}

// ---------------------------------------------------------------------------
// Mês
// ---------------------------------------------------------------------------
export async function createMonthAction(formData: FormData): Promise<void> {
  const ctx = await memberContext();
  if (!ctx) redirect("/login");
  const parsed = monthParamSchema.safeParse(formData.get("month"));
  const ref = parsed.success ? parseMonthParam(parsed.data) : null;
  if (!ref) redirect("/");
  await ensureBudget(ctx.supabase, ref);
  refresh();
  redirect(`/?mes=${parsed.data}`);
}

// ---------------------------------------------------------------------------
// Metas (as 6 de uma vez, numa única instrução: a soma é checada no commit)
// ---------------------------------------------------------------------------
export async function saveTargetsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };

  const month = monthParamSchema.safeParse(formData.get("month"));
  if (!month.success) return fieldError(month.error);
  const parsed = targetsSchema.safeParse(Object.fromEntries(CATEGORY_KEYS.map((k) => [k, formData.get(k) ?? ""])));
  if (!parsed.success) return fieldError(parsed.error);

  const ref = parseMonthParam(month.data);
  if (!ref) return { status: "error", message: "Mês inválido." };
  const budgetId = await ensureBudget(ctx.supabase, ref);
  if (!budgetId) return { status: "error", message: MSG.genericError };

  const categories = await loadCategories(ctx.supabase);
  const rows = categories.map((c) => ({ budget_id: budgetId, category_id: c.id, percent_bp: parsed.data[c.key] }));
  const { error } = await ctx.supabase.from("category_targets").upsert(rows, { onConflict: "budget_id,category_id" });
  if (error) return dbError(error.code);

  refresh();
  return { status: "success", message: "Metas atualizadas." };
}

// ---------------------------------------------------------------------------
// Rendas
// ---------------------------------------------------------------------------
export async function saveIncomeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };

  const parsed = incomeFormSchema.safeParse({
    month: formData.get("month"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    receivedBy: formData.get("receivedBy"),
  });
  const incomeEcho = echoFields(formData, INCOME_FIELDS);
  if (!parsed.success) return fieldError(parsed.error, incomeEcho);
  const idRaw = formData.get("id");
  const id = idRaw ? uuidSchema.safeParse(idRaw) : null;
  if (id && !id.success) return { status: "error", message: MSG.genericError };

  const fields = {
    description: parsed.data.description,
    amount_cents: parsed.data.amount,
    received_by: parsed.data.receivedBy,
  };

  if (id) {
    const { data, error } = await ctx.supabase.from("incomes").update(fields).eq("id", id.data).select("id");
    if (error) return dbError(error.code, incomeEcho);
    if (!data.length) return { status: "error", message: "Renda não encontrada." };
  } else {
    const ref = parseMonthParam(parsed.data.month);
    const budgetId = ref ? await ensureBudget(ctx.supabase, ref) : null;
    if (!budgetId) return { status: "error", message: MSG.genericError };
    const { error } = await ctx.supabase.from("incomes").insert({ ...fields, budget_id: budgetId });
    if (error) return dbError(error.code, incomeEcho);
  }
  refresh();
  return { status: "success", message: id ? "Renda atualizada." : "Renda adicionada." };
}

export async function deleteIncomeAction(id: string): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { status: "error", message: MSG.genericError };
  const { data, error } = await ctx.supabase.from("incomes").delete().eq("id", parsed.data).select("id");
  if (error || !data.length) return { status: "error", message: MSG.genericError };
  refresh();
  return { status: "success", message: "Renda excluída." };
}

// ---------------------------------------------------------------------------
// Lançamentos
// ---------------------------------------------------------------------------
export async function saveExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };

  const parsed = expenseFormSchema.safeParse({
    month: formData.get("month"),
    category: formData.get("category"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    expenseDate: formData.get("expenseDate"),
    paidBy: formData.get("paidBy"),
    paymentMethod: formData.get("paymentMethod"),
    tags: formData.get("tags") ?? "",
    notes: formData.get("notes") ?? "",
  });
  const echo = echoFields(formData, EXPENSE_FIELDS);
  if (!parsed.success) return fieldError(parsed.error, echo);
  const idRaw = formData.get("id");
  const id = idRaw ? uuidSchema.safeParse(idRaw) : null;
  if (id && !id.success) return { status: "error", message: MSG.genericError };

  const categories = await loadCategories(ctx.supabase);
  const category = categories.find((c) => c.key === parsed.data.category);
  if (!category) return { status: "error", message: "Categoria inválida." };

  const fields = {
    category_id: category.id,
    description: parsed.data.description,
    amount_cents: parsed.data.amount,
    expense_date: parsed.data.expenseDate,
    paid_by: parsed.data.paidBy,
    payment_method: parsed.data.paymentMethod,
    tags: parsed.data.tags,
    notes: parsed.data.notes,
  };

  if (id) {
    const { data, error } = await ctx.supabase
      .from("expenses")
      .update(fields)
      .eq("id", id.data)
      .is("deleted_at", null)
      .select("id");
    if (error) return dbError(error.code, echo);
    if (!data.length) return { status: "error", message: "Lançamento não encontrado." };
  } else {
    const ref = parseMonthParam(parsed.data.month);
    const budgetId = ref ? await ensureBudget(ctx.supabase, ref) : null;
    if (!budgetId) return { status: "error", message: MSG.genericError };
    const { error } = await ctx.supabase.from("expenses").insert({ ...fields, budget_id: budgetId });
    if (error) return dbError(error.code, echo);
  }

  refresh();
  // Lançamento rápido fica na tela atual; o formulário completo volta para a categoria.
  if (formData.get("returnTo") === "stay") {
    return { status: "success", message: id ? "Lançamento atualizado." : "Lançamento adicionado." };
  }
  redirect(`/categoria/${CATEGORY_SLUG[parsed.data.category]}?mes=${parsed.data.month}`);
}

/** Exclusão lógica (restaurável por 30 dias; a tela oferece "Desfazer" por 10 s). */
export async function deleteExpenseAction(id: string): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { status: "error", message: MSG.genericError };
  const { data, error } = await ctx.supabase
    .from("expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .select("id");
  if (error || !data.length) return { status: "error", message: MSG.genericError };
  refresh();
  return { status: "success", message: "Lançamento excluído." };
}

export async function restoreExpenseAction(id: string): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { status: "error", message: MSG.genericError };
  const { data, error } = await ctx.supabase
    .from("expenses")
    .update({ deleted_at: null })
    .eq("id", parsed.data)
    .not("deleted_at", "is", null)
    .select("id");
  if (error || !data.length) return { status: "error", message: "Não foi possível restaurar." };
  refresh();
  return { status: "success", message: "Lançamento restaurado." };
}

// ---------------------------------------------------------------------------
// Recorrentes (modelos). Geram lançamentos quando um mês novo é criado.
// ---------------------------------------------------------------------------
const RECURRING_FIELDS = ["category", "description", "amount", "paidBy", "paymentMethod", "startsOn", "endsOn", "active"] as const;

export async function saveRecurringAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };

  const parsed = recurringFormSchema.safeParse({
    category: formData.get("category"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    paidBy: formData.get("paidBy"),
    paymentMethod: formData.get("paymentMethod"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn") ?? "",
    active: formData.get("active") === "on" ? "on" : "off",
  });
  const echo = echoFields(formData, RECURRING_FIELDS);
  if (!parsed.success) return fieldError(parsed.error, echo);
  const idRaw = formData.get("id");
  const id = idRaw ? uuidSchema.safeParse(idRaw) : null;
  if (id && !id.success) return { status: "error", message: MSG.genericError };

  const categories = await loadCategories(ctx.supabase);
  const category = categories.find((c) => c.key === parsed.data.category);
  if (!category) return { status: "error", message: "Categoria inválida." };

  const fields = {
    category_id: category.id,
    description: parsed.data.description,
    amount_cents: parsed.data.amount,
    paid_by: parsed.data.paidBy,
    payment_method: parsed.data.paymentMethod,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn,
    active: parsed.data.active,
  };
  if (id) {
    const { data, error } = await ctx.supabase.from("recurring_templates").update(fields).eq("id", id.data).select("id");
    if (error) return dbError(error.code, echo);
    if (!data.length) return { status: "error", message: "Recorrente não encontrado." };
  } else {
    const { error } = await ctx.supabase.from("recurring_templates").insert(fields);
    if (error) return dbError(error.code, echo);
  }
  refresh();
  return { status: "success", message: id ? "Recorrente atualizado." : "Recorrente criado." };
}

export async function deleteRecurringAction(id: string): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { status: "error", message: MSG.genericError };
  const { data, error } = await ctx.supabase.from("recurring_templates").delete().eq("id", parsed.data).select("id");
  if (error || !data.length) return { status: "error", message: MSG.genericError };
  refresh();
  return { status: "success", message: "Recorrente excluído." };
}

// ---------------------------------------------------------------------------
// Copiar metas e rendas do mês anterior
// ---------------------------------------------------------------------------
export async function copyPreviousMonthAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };
  const month = monthParamSchema.safeParse(formData.get("month"));
  const ref = month.success ? parseMonthParam(month.data) : null;
  if (!ref) return { status: "error", message: "Mês inválido." };
  const { data, error } = await ctx.supabase.rpc("copy_previous_month", { p_month: monthToDb(ref) });
  if (error) {
    if (error.code === "P0002") return { status: "error", message: "O mês anterior não tem orçamento." };
    return { status: "error", message: MSG.genericError };
  }
  refresh();
  const n = data ?? 0;
  return {
    status: "success",
    message: `Metas copiadas${n > 0 ? ` e ${n} renda${n > 1 ? "s" : ""} adicionada${n > 1 ? "s" : ""}` : "; nenhuma renda nova para copiar"}.`,
  };
}
