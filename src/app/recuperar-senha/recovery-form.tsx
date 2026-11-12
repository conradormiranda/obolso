"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/form-bits";
import { Turnstile } from "@/components/auth/turnstile";
import { requestRecoveryAction } from "@/lib/actions/auth";
import { idleState } from "@/lib/actions/form-state";

export function RecoveryForm({ siteKey, nonce }: { siteKey: string; nonce: string }) {
  const [state, formAction] = useActionState(requestRecoveryAction, idleState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field id="email" label="E-mail">
        <Input id="email" name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>
      <Turnstile siteKey={siteKey} nonce={nonce} action="recovery" resetSignal={state} />
      <FormMessage state={state} />
      <SubmitButton pendingText="Enviando…">Enviar link</SubmitButton>
    </form>
  );
}
