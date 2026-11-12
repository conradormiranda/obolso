"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/auth/form-bits";
import { saveTargetsAction } from "@/lib/actions/budget";
import { idleState } from "@/lib/actions/form-state";
import { formatBp, parsePercentToBp } from "@/lib/domain/math";
import type { CategoryKey } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Row = { key: CategoryKey; name: string; bp: number };

function bpToInput(bp: number): string {
  return formatBp(bp).replace("%", "").replace(/\./g, "");
}

export function TargetsCard({ rows, month }: { rows: Row[]; month: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveTargetsAction, idleState);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.key, bpToInput(r.bp)])),
  );

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [state]);

  useEffect(() => {
    if (open) setValues(Object.fromEntries(rows.map((r) => [r.key, bpToInput(r.bp)])));
  }, [open, rows]);

  const total = useMemo(() => {
    let t = 0;
    for (const r of rows) {
      const bp = parsePercentToBp(values[r.key] ?? "");
      if (bp === null) return null;
      t += bp;
    }
    return t;
  }, [rows, values]);

  return (
    <>
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between font-semibold">
            <span>{r.name}</span>
            <span className="tabular-nums">{formatBp(r.bp)}</span>
          </li>
        ))}
      </ul>
      <Button variant="outline" className="mt-6 h-11 px-6 text-base font-semibold" onClick={() => setOpen(true)}>
        Editar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Metas do mês</DialogTitle>
            <DialogDescription>Percentual da renda para cada categoria. A soma precisa ser 100%.</DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-3" noValidate>
            <input type="hidden" name="month" value={month} />
            {rows.map((r) => (
              <label key={r.key} className="flex items-center justify-between gap-3 text-sm font-medium">
                <span>{r.name}</span>
                <span className="flex items-center gap-1">
                  <Input
                    name={r.key}
                    inputMode="decimal"
                    value={values[r.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [r.key]: e.target.value }))}
                    className="h-10 w-20 text-right text-base tabular-nums"
                    aria-label={`Meta de ${r.name} em %`}
                  />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
            ))}
            <p
              className={cn(
                "text-right text-sm font-semibold tabular-nums",
                total === 10000 ? "text-success" : "text-destructive",
              )}
              aria-live="polite"
            >
              Soma: {total === null ? "valor inválido" : formatBp(total)}
            </p>
            <FormMessage state={state} />
            <SubmitButton pendingText="Salvando…">Salvar metas</SubmitButton>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
