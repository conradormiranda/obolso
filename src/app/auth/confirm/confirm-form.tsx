"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/auth/form-bits";
import { confirmRecoveryLinkAction } from "@/lib/actions/auth";
import { idleState } from "@/lib/actions/form-state";

export function ConfirmForm({ tokenHash }: { tokenHash: string }) {
  const [state, formAction] = useActionState(confirmRecoveryLinkAction, idleState);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <FormMessage state={state} />
      <SubmitButton pendingText="Validando…">Continuar</SubmitButton>
    </form>
  );
}
