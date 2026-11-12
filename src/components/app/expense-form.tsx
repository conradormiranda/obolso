"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/form-bits";
import { saveExpenseAction } from "@/lib/actions/budget";
import { idleState } from "@/lib/actions/form-state";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/domain/categories";
import type { CategoryKey, PaidBy, PaymentMethod } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type ExpenseFormValues = {
  id?: string;
  month: string;
  category: CategoryKey;
  description: string;
  amount: string;
  expenseDate: string;
  paidBy: PaidBy;
  paymentMethod: PaymentMethod;
  tags: string;
  notes: string;
};

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Formulário de lançamento (Fase 2). O lançamento rápido em 4 toques vem na Fase 3. */
export function ExpenseForm({
  initial,
  categories,
  payers,
}: {
  initial: ExpenseFormValues;
  categories: { key: CategoryKey; name: string }[];
  payers: { value: PaidBy; label: string }[];
}) {
  const [state, action] = useActionState(saveExpenseAction, idleState);
  // Após erro, reexibe o que foi enviado (o React limpa o form a cada envio).
  const echo = state.status === "error" ? state.fields : undefined;
  const v = {
    category: echo?.category ?? initial.category,
    description: echo?.description ?? initial.description,
    amount: echo?.amount ?? initial.amount,
    expenseDate: echo?.expenseDate ?? initial.expenseDate,
    paidBy: echo?.paidBy ?? initial.paidBy,
    paymentMethod: echo?.paymentMethod ?? initial.paymentMethod,
    tags: echo?.tags ?? initial.tags,
    notes: echo?.notes ?? initial.notes,
  };
  const formKey = echo ? JSON.stringify(echo) : "initial";

  return (
    <form key={formKey} action={action} className="space-y-4" noValidate>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="month" value={initial.month} />

      <Field id="amount" label="Valor (R$)">
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          defaultValue={v.amount}
          required
          className={cn(inputClass, "text-xl font-semibold tabular-nums")}
        />
      </Field>

      <Field id="description" label="Descrição">
        <Input
          id="description"
          name="description"
          maxLength={120}
          autoComplete="off"
          defaultValue={v.description}
          required
          className={inputClass}
        />
      </Field>

      <Field id="category" label="Categoria">
        <select id="category" name="category" defaultValue={v.category} className={selectClass}>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Quem pagou</legend>
        <div className="grid grid-cols-3 gap-2">
          {payers.map((p) => (
            <label key={p.value} className="cursor-pointer">
              <input type="radio" name="paidBy" value={p.value} defaultChecked={v.paidBy === p.value} className="peer sr-only" />
              <span className="flex h-11 items-center justify-center rounded-lg border border-input px-2 text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                {p.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field id="expenseDate" label="Data">
          <Input id="expenseDate" name="expenseDate" type="date" defaultValue={v.expenseDate} required className={inputClass} />
        </Field>
        <Field id="paymentMethod" label="Pagamento">
          <select id="paymentMethod" name="paymentMethod" defaultValue={v.paymentMethod} className={selectClass}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="tags" label="Tags (separadas por vírgula)">
        <Input id="tags" name="tags" maxLength={400} placeholder="Filho, Casa, Saúde" defaultValue={v.tags} className={inputClass} />
      </Field>

      <Field id="notes" label="Observação">
        <textarea
          id="notes"
          name="notes"
          maxLength={1000}
          rows={3}
          defaultValue={v.notes}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </Field>

      <FormMessage state={state} />
      <SubmitButton pendingText="Salvando…">{initial.id ? "Salvar alterações" : "Adicionar lançamento"}</SubmitButton>
    </form>
  );
}
