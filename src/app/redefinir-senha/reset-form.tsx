"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/form-bits";
import { resetPasswordAction } from "@/lib/actions/auth";
import { idleState } from "@/lib/actions/form-state";

export function ResetForm() {
  const [state, formAction] = useActionState(resetPasswordAction, idleState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field id="password" label="Nova senha">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          aria-describedby="password-hint"
          className={inputClass}
        />
      </Field>
      <p id="password-hint" className="text-xs text-muted-foreground">
        Mínimo de 12 caracteres. Uma frase longa é ótima. Senhas que já vazaram na internet são recusadas.
      </p>
      <Field id="confirm" label="Repita a nova senha">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Salvando…">Salvar nova senha</SubmitButton>
    </form>
  );
}
