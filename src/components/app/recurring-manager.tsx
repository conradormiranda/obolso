"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/form-bits";
import { deleteRecurringAction, saveRecurringAction } from "@/lib/actions/budget";
import { idleState } from "@/lib/actions/form-state";
import { maskBrlDigits } from "@/lib/domain/brl-mask";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/domain/categories";
import { formatDateBr } from "@/lib/domain/month";
import type { CategoryKey, PaidBy, PaymentMethod } from "@/lib/supabase/database.types";
import { formatCents } from "@/lib/validation/money";
import { CategoryIcon } from "./category-icon";

export type RecurringItem = {
  id: string;
  categoryKey: CategoryKey;
  description: string;
  amountCents: number;
  paidBy: PaidBy;
  paymentMethod: PaymentMethod;
  active: boolean;
  startsOn: string;
  endsOn: string | null;
};

const selectClass = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base";

function centsToInput(cents: number): string {
  return maskBrlDigits(String(cents));
}

export function RecurringManager({
  items,
  categories,
  payers,
  defaultPayer,
  today,
}: {
  items: RecurringItem[];
  categories: { key: CategoryKey; name: string }[];
  payers: { value: PaidBy; label: string }[];
  defaultPayer: PaidBy;
  today: string;
}) {
  const [editing, setEditing] = useState<RecurringItem | null>(null);
  const [toDelete, setToDelete] = useState<RecurringItem | null>(null);
  const [state, action] = useActionState(saveRecurringAction, idleState);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [formNonce, setFormNonce] = useState(0);

  useEffect(() => {
    if (state.status === "success") {
      setEditing(null);
      setFormNonce((n) => n + 1);
    }
  }, [state]);

  const echo = state.status === "error" ? state.fields : undefined;
  const cur = editing;
  const v = {
    category: echo?.category ?? cur?.categoryKey ?? "custos_fixos",
    description: echo?.description ?? cur?.description ?? "",
    amount: echo?.amount ?? (cur ? centsToInput(cur.amountCents) : ""),
    paidBy: echo?.paidBy ?? cur?.paidBy ?? defaultPayer,
    paymentMethod: echo?.paymentMethod ?? cur?.paymentMethod ?? "pix",
    startsOn: echo?.startsOn ?? cur?.startsOn ?? today,
    endsOn: echo?.endsOn ?? cur?.endsOn ?? "",
    active: echo ? echo.active === "on" : (cur?.active ?? true),
  };
  const formKey = `${cur?.id ?? "new"}:${formNonce}:${echo ? JSON.stringify(echo) : ""}`;
  const catName = (k: CategoryKey) => categories.find((c) => c.key === k)?.name ?? k;
  const payerName = (p: PaidBy) => payers.find((x) => x.value === p)?.label ?? p;

  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma despesa recorrente cadastrada.</p>
      ) : (
        <ul className="divide-y divide-dashed divide-border">
          {items.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <CategoryIcon category={r.categoryKey} className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {r.description}
                  {!r.active ? <span className="ml-2 text-xs font-normal text-muted-foreground">(pausado)</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {catName(r.categoryKey)} · {payerName(r.paidBy)} · desde {formatDateBr(r.startsOn)}
                  {r.endsOn ? ` até ${formatDateBr(r.endsOn)}` : ""}
                </p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatCents(r.amountCents)}</p>
              <button
                type="button"
                aria-label={`Editar ${r.description}`}
                onClick={() => setEditing(r)}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Excluir ${r.description}`}
                onClick={() => setToDelete(r)}
                disabled={pending}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive text-white disabled:opacity-50"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {deleteError ? (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      ) : null}

      <form key={formKey} action={action} className="space-y-4 rounded-2xl border border-border bg-card p-5" noValidate>
        <h2 className="text-lg font-bold text-primary">{cur ? "Editar recorrente" : "Nova despesa recorrente"}</h2>
        {cur ? <input type="hidden" name="id" value={cur.id} /> : null}
        <Field id="rec-description" label="Descrição">
          <Input id="rec-description" name="description" maxLength={120} defaultValue={v.description} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="rec-amount" label="Valor (R$)">
            <Input
              id="rec-amount"
              name="amount"
              inputMode="numeric"
              defaultValue={v.amount}
              onChange={(e) => {
                e.target.value = maskBrlDigits(e.target.value);
              }}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field id="rec-category" label="Categoria">
            <select id="rec-category" name="category" defaultValue={v.category} className={selectClass}>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="rec-paidBy" label="Quem paga">
            <select id="rec-paidBy" name="paidBy" defaultValue={v.paidBy} className={selectClass}>
              {payers.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="rec-payment" label="Pagamento">
            <select id="rec-payment" name="paymentMethod" defaultValue={v.paymentMethod} className={selectClass}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="rec-start" label="Início (dia do lançamento)">
            <Input id="rec-start" name="startsOn" type="date" defaultValue={v.startsOn} className={inputClass} />
          </Field>
          <Field id="rec-end" label="Término (opcional)">
            <Input id="rec-end" name="endsOn" type="date" defaultValue={v.endsOn} className={inputClass} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={v.active} className="size-4" />
          Ativo
        </label>
        <FormMessage state={state} />
        <SubmitButton pendingText="Salvando…">{cur ? "Salvar alterações" : "Criar recorrente"}</SubmitButton>
        {cur ? (
          <Button type="button" variant="ghost" className="h-10 w-full" onClick={() => setEditing(null)}>
            Cancelar edição
          </Button>
        ) : null}
      </form>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir recorrente?</AlertDialogTitle>
            <AlertDialogDescription>
              Os lançamentos já gerados nos meses continuam. {toDelete ? `${toDelete.description} — ${formatCents(toDelete.amountCents)}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                const item = toDelete;
                setToDelete(null);
                if (!item) return;
                startTransition(async () => {
                  const r = await deleteRecurringAction(item.id);
                  setDeleteError(r.status === "error" ? r.message : null);
                  if (editing?.id === item.id) setEditing(null);
                });
              }}
            >
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
