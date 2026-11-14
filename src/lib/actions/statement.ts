"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORY_KEYS, PAID_BY } from "@/lib/domain/categories";
import { CONSUMPTION_KEYS } from "@/lib/domain/consumption";
import { parseMonthParam } from "@/lib/domain/month";
import { parseSpace } from "@/lib/domain/space";
import { MAX_STATEMENT_LINES } from "@/lib/import/statement";
import { ensureBudget, memberContext } from "@/lib/server/action-context";
import { loadCategories } from "@/lib/server/budget-data";
import { isoDateSchema, monthParamSchema } from "@/lib/validation/budget";
import { descriptionSchema } from "@/lib/validation/text";
import { MSG, type FormState } from "./form-state";

/**
 * Salva as compras revisadas da fatura. O arquivo é lido no navegador e NUNCA
 * é enviado nem guardado: só chegam aqui as linhas confirmadas, revalidadas.
 */

const rowSchema = z
  .object({
    date: isoDateSchema,
    description: descriptionSchema,
    amountCents: z.number().int().min(1).max(100_000_000_000),
    section: z.enum(CATEGORY_KEYS, { error: "Escolha a seção de todas as compras marcadas." }),
    consumption: z.enum(CONSUMPTION_KEYS).nullable(),
    installmentNumber: z.number().int().min(1).max(120).nullable(),
    installmentTotal: z.number().int().min(2).max(120).nullable(),
  })
  .refine(
    (r) =>
      (r.installmentNumber === null && r.installmentTotal === null) ||
      (r.installmentNumber !== null && r.installmentTotal !== null && r.installmentNumber <= r.installmentTotal),
    { error: "Parcela inválida." },
  );

const payloadSchema = z.object({
  month: monthParamSchema,
  paidBy: z.enum(PAID_BY, { error: "Escolha quem pagou." }),
  rows: z
    .array(rowSchema)
    .min(1, { error: "Marque ao menos uma compra." })
    .max(MAX_STATEMENT_LINES, { error: `Máximo de ${MAX_STATEMENT_LINES} compras por vez.` }),
});

export async function confirmStatementAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await memberContext();
  if (!ctx) return { status: "error", message: MSG.genericError };

  let rows: unknown;
  try {
    rows = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { status: "error", message: MSG.genericError };
  }
  const parsed = payloadSchema.safeParse({ month: formData.get("month"), paidBy: formData.get("paidBy"), rows });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? MSG.genericError };

  const ref = parseMonthParam(parsed.data.month);
  const espaco = formData.get("espaco");
  const budgetId = ref ? await ensureBudget(ctx.supabase, ref, parseSpace(typeof espaco === "string" ? espaco : null)) : null;
  if (!budgetId) return { status: "error", message: MSG.genericError };

  const categories = await loadCategories(ctx.supabase);
  const idByKey = new Map(categories.map((c) => [c.key, c.id]));
  const inserts = [];
  for (const r of parsed.data.rows) {
    const categoryId = idByKey.get(r.section);
    if (!categoryId) return { status: "error", message: "Seção inválida." };
    inserts.push({
      budget_id: budgetId,
      category_id: categoryId,
      description: r.description,
      amount_cents: r.amountCents,
      expense_date: r.date,
      paid_by: parsed.data.paidBy,
      payment_method: "credito" as const,
      consumption: r.consumption,
      installment_number: r.installmentNumber,
      installment_total: r.installmentTotal,
    });
  }

  // Uma única instrução: ou entram todas, ou nenhuma.
  const { error } = await ctx.supabase.from("expenses").insert(inserts);
  if (error) {
    if (error.code === "23514") return { status: "error", message: "Alguma compra tem valor inválido. Confira a lista." };
    return { status: "error", message: MSG.genericError };
  }
  revalidatePath("/", "layout");
  const n = inserts.length;
  return { status: "success", message: `${n} lançamento${n > 1 ? "s" : ""} salvo${n > 1 ? "s" : ""}.` };
}
