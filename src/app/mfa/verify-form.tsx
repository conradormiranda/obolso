"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/form-bits";
import { verifyMfaAction } from "@/lib/actions/auth";
import { idleState } from "@/lib/actions/form-state";

export function VerifyForm() {
  const [state, formAction] = useActionState(verifyMfaAction, idleState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field id="code" label="Código de 6 dígitos">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          required
          autoFocus
          className={`${inputClass} tracking-[0.3em] tabular-nums`}
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Verificando…">Verificar</SubmitButton>
    </form>
  );
}
