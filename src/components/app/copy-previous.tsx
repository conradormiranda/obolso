"use client";

import { useActionState } from "react";
import { Copy } from "lucide-react";
import { FormMessage } from "@/components/auth/form-bits";
import { copyPreviousMonthAction } from "@/lib/actions/budget";
import { idleState } from "@/lib/actions/form-state";

export function CopyPreviousMonth({ month }: { month: string }) {
  const [state, action, pending] = useActionState(copyPreviousMonthAction, idleState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
      >
        <Copy className="size-4" aria-hidden="true" />
        {pending ? "Copiando…" : "Copiar metas e rendas do mês anterior"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}
