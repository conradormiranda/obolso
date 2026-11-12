import { z } from "zod";
import { CATEGORY_KEYS, PAID_BY, PAYMENT_METHODS } from "@/lib/domain/categories";
import { parsePercentToBp } from "@/lib/domain/math";
import { isValidIsoDate, parseMonthParam } from "@/lib/domain/month";
import { brlInputSchema } from "./money";
import { descriptionSchema, notesSchema, tagSchema } from "./text";

export const monthParamSchema = z
  .string()
  .refine((v) => parseMonthParam(v) !== null, { error: "Mês inválido." });

export const uuidSchema = z.uuid({ error: "Identificador inválido." });

export const isoDateSchema = z.string().refine(isValidIsoDate, { error: "Data inválida." });

const percentField = z.string().transform((v, ctx) => {
  const bp = parsePercentToBp(v);
  if (bp === null) {
    ctx.addIssue({ code: "custom", message: "Percentual inválido (0 a 100, até 2 casas)." });
    return z.NEVER;
  }
  return bp;
});

/** As 6 metas do mês, em percentual digitado → basis points. Soma = 100%. */
export const targetsSchema = z
  .object(Object.fromEntries(CATEGORY_KEYS.map((k) => [k, percentField])) as Record<
    (typeof CATEGORY_KEYS)[number],
    typeof percentField
  >)
  .refine((t) => Object.values(t).reduce((a, b) => a + b, 0) === 10000, {
    error: "A soma das metas precisa ser exatamente 100%.",
  });

/** Tags vêm separadas por vírgula num campo de texto. */
export const tagsInputSchema = z
  .string()
  .max(400)
  .transform((v) =>
    Array.from(
      new Set(
        v
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ),
  )
  .pipe(z.array(tagSchema).max(10, { error: "Máximo de 10 tags." }));

const optionalNotes = z
  .string()
  .max(1000)
  .transform((v) => v.trim())
  .pipe(z.union([z.literal(""), notesSchema]))
  .transform((v) => (v === "" ? null : v));

export const expenseFormSchema = z.object({
  month: monthParamSchema,
  category: z.enum(CATEGORY_KEYS, { error: "Categoria inválida." }),
  description: descriptionSchema,
  amount: brlInputSchema,
  expenseDate: isoDateSchema,
  paidBy: z.enum(PAID_BY, { error: "Escolha quem pagou." }),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: "Forma de pagamento inválida." }),
  tags: tagsInputSchema,
  notes: optionalNotes,
});
export type ExpenseForm = z.infer<typeof expenseFormSchema>;

export const incomeFormSchema = z.object({
  month: monthParamSchema,
  description: descriptionSchema,
  amount: brlInputSchema,
  receivedBy: z.enum(PAID_BY, { error: "Escolha quem recebeu." }),
});
export type IncomeForm = z.infer<typeof incomeFormSchema>;

const optionalDate = z
  .string()
  .max(10)
  .transform((v) => v.trim())
  .pipe(z.union([z.literal(""), isoDateSchema]))
  .transform((v) => (v === "" ? null : v));

/** Despesa recorrente (modelo). Fim opcional (ex.: empréstimo com data de término). */
export const recurringFormSchema = z
  .object({
    category: z.enum(CATEGORY_KEYS, { error: "Categoria inválida." }),
    description: descriptionSchema,
    amount: brlInputSchema,
    paidBy: z.enum(PAID_BY, { error: "Escolha quem paga." }),
    paymentMethod: z.enum(PAYMENT_METHODS, { error: "Forma de pagamento inválida." }),
    startsOn: isoDateSchema,
    endsOn: optionalDate,
    active: z.enum(["on", "off"]).transform((v) => v === "on"),
  })
  .refine((v) => v.endsOn === null || v.endsOn >= v.startsOn, {
    error: "O término precisa ser depois do início.",
    path: ["endsOn"],
  });
export type RecurringForm = z.infer<typeof recurringFormSchema>;
