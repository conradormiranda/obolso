"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/form-bits";
import { redeemRecoveryCodeAction } from "@/lib/actions/auth";
import { idleState } from "@/lib/actions/form-state";

export function RecoverForm() {
  const [state, formAction] = useActionState(redeemRecoveryCodeAction, idleState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field id="code" label="Código de recuperação">
        <Input
          id="code"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXXX-XXXXX"
          maxLength={11}
          required
          className={`${inputClass} font-mono uppercase tracking-wider`}
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Validando…">Usar código</SubmitButton>
    </form>
  );
}
