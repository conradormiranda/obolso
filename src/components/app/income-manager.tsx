"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
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
import { deleteIncomeAction, saveIncomeAction } from "@/lib/actions/budget";
import { idleState } from "@/lib/actions/form-state";
import type { PaidBy } from "@/lib/supabase/database.types";
import { formatCents } from "@/lib/validation/money";

export type IncomeItem = { id: string; description: string; amountCents: number; receivedBy: PaidBy; receivedByLabel: string };

function centsToInput(cents: number): string {
  return formatCents(cents).replace(/^R\$\s*/, "").replace(/ /g, "");
}

export function IncomeManager({
  items,
  month,
  payers,
  defaultReceiver,
}: {
  items: IncomeItem[];
  month: string;
  payers: { value: PaidBy; label: string }[];
  defaultReceiver: PaidBy;
}) {
  const [editing, setEditing] = useState<IncomeItem | null>(null);
  const [toDelete, setToDelete] = useState<IncomeItem | null>(null);
  const [state, action] = useActionState(saveIncomeAction, idleState);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      setEditing(null);
      formRef.current?.reset();
    }
  }, [state]);

  const current = editing;
  const echo = state.status === "error" ? state.fields : undefined;
  const formKey = `${current?.id ?? "new"}:${echo ? JSON.stringify(echo) : ""}`;

  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma fonte de renda neste mês.</p>
      ) : (
        <ul className="divide-y divide-dashed divide-border">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.description}</p>
                <p className="text-xs text-muted-foreground">{i.receivedByLabel}</p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatCents(i.amountCents)}</p>
              <button
                type="button"
                aria-label={`Editar ${i.description}`}
                onClick={() => setEditing(i)}
                className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Excluir ${i.description}`}
                onClick={() => setToDelete(i)}
                disabled={pending}
                className="flex size-10 items-center justify-center rounded-full bg-destructive text-white disabled:opacity-50"
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

      <form
        ref={formRef}
        key={formKey}
        action={action}
        className="space-y-4 rounded-2xl border border-border bg-card p-5"
        noValidate
      >
        <h2 className="text-lg font-bold text-primary">{current ? "Editar renda" : "Adicionar renda"}</h2>
        <input type="hidden" name="month" value={month} />
        {current ? <input type="hidden" name="id" value={current.id} /> : null}
        <Field id="income-description" label="Descrição">
          <Input
            id="income-description"
            name="description"
            maxLength={120}
            placeholder="Salário, comissão, renda extra…"
            defaultValue={echo?.description ?? current?.description ?? ""}
            required
            className={inputClass}
          />
        </Field>
        <Field id="income-amount" label="Valor (R$)">
          <Input
            id="income-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={echo?.amount ?? (current ? centsToInput(current.amountCents) : "")}
            required
            className={`${inputClass} tabular-nums`}
          />
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Quem recebeu</legend>
          <div className="grid grid-cols-3 gap-2">
            {payers.map((p) => (
              <label key={p.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="receivedBy"
                  value={p.value}
                  defaultChecked={(echo?.receivedBy ?? current?.receivedBy ?? defaultReceiver) === p.value}
                  className="peer sr-only"
                />
                <span className="flex h-11 items-center justify-center rounded-lg border border-input px-2 text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                  {p.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <FormMessage state={state} />
        <SubmitButton pendingText="Salvando…">{current ? "Salvar alterações" : "Adicionar renda"}</SubmitButton>
        {current ? (
          <Button type="button" variant="ghost" className="h-10 w-full" onClick={() => setEditing(null)}>
            Cancelar edição
          </Button>
        ) : null}
      </form>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir renda?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `${toDelete.description} — ${formatCents(toDelete.amountCents)}` : ""}
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
                  const r = await deleteIncomeAction(item.id);
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
