"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
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
import { deleteExpenseAction, restoreExpenseAction } from "@/lib/actions/budget";
import { formatDateBr } from "@/lib/domain/month";
import { formatCents } from "@/lib/validation/money";

export type ExpenseItem = {
  id: string;
  description: string;
  amountCents: number;
  expenseDate: string;
  paidByLabel: string;
};

const UNDO_SECONDS = 10;

/** Lista de lançamentos: editar, excluir com confirmação e "Desfazer" por 10 s. */
export function ExpenseList({ items, month }: { items: ExpenseItem[]; month: string }) {
  const [toDelete, setToDelete] = useState<ExpenseItem | null>(null);
  const [undo, setUndo] = useState<{ id: string; description: string; left: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!undo) return;
    timer.current = setInterval(() => {
      setUndo((u) => (u && u.left > 1 ? { ...u, left: u.left - 1 } : null));
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [undo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function confirmDelete() {
    const item = toDelete;
    if (!item) return;
    setToDelete(null);
    startTransition(async () => {
      const r = await deleteExpenseAction(item.id);
      if (r.status === "success") {
        setError(null);
        setUndo({ id: item.id, description: item.description, left: UNDO_SECONDS });
      } else {
        setError(r.status === "error" ? r.message : null);
      }
    });
  }

  function undoDelete() {
    const u = undo;
    if (!u) return;
    setUndo(null);
    startTransition(async () => {
      const r = await restoreExpenseAction(u.id);
      if (r.status === "error") setError(r.message);
    });
  }

  return (
    <>
      {items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nenhum lançamento neste mês.</p>
      ) : (
        <ul className="divide-y divide-dashed divide-border">
          {items.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateBr(e.expenseDate)} · {e.paidByLabel}
                </p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatCents(e.amountCents)}</p>
              <Link
                href={`/lancamento/${e.id}?mes=${month}`}
                aria-label={`Editar ${e.description}`}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Link>
              <button
                type="button"
                aria-label={`Excluir ${e.description}`}
                onClick={() => setToDelete(e)}
                disabled={pending}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive text-white disabled:opacity-50"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `${toDelete.description} — ${formatCents(toDelete.amountCents)}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete}>
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {undo ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg"
        >
          <span className="min-w-0 truncate text-sm">“{undo.description}” excluído</span>
          <Button variant="outline" className="h-9 shrink-0" onClick={undoDelete}>
            Desfazer ({undo.left})
          </Button>
        </div>
      ) : null}
    </>
  );
}
