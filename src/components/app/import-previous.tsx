"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { FormMessage } from "@/components/auth/form-bits";
import { importPreviousMonthAction } from "@/lib/actions/budget";
import { idleState } from "@/lib/actions/form-state";
import { SpaceField } from "./space";

/** Traz do mês anterior os Custos fixos (mesmo valor) e a próxima parcela das compras parceladas. */
export function ImportPreviousMonth({ month }: { month: string }) {
  const [state, action, pending] = useActionState(importPreviousMonthAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="month" value={month} />
      <SpaceField />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
      >
        <Download className="size-4 rotate-180" aria-hidden="true" />
        {pending ? "Importando…" : "Importar fixas e parcelas do mês anterior"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
