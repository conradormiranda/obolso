"use client";

import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/form-bits";
import { idleState } from "@/lib/actions/form-state";
import { changePasswordAction, replaceAuthenticatorAction, updateDisplayNameAction } from "@/lib/actions/settings";

export function DisplayNameForm({ current }: { current: string }) {
  const [state, action] = useActionState(updateDisplayNameAction, idleState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <Field id="displayName" label="Nome de exibição">
        <Input id="displayName" name="displayName" defaultValue={current} maxLength={60} className={inputClass} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Salvando…">Salvar nome</SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, idleState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3" noValidate>
      <Field id="current" label="Senha atual">
        <Input id="current" name="current" type="password" autoComplete="current-password" className={inputClass} />
      </Field>
      <Field id="new-password" label="Nova senha (mínimo 12 caracteres)">
        <Input id="new-password" name="password" type="password" autoComplete="new-password" className={inputClass} />
      </Field>
      <Field id="confirm" label="Repita a nova senha">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" className={inputClass} />
      </Field>
      <Field id="pw-code" label="Código do autenticador">
        <Input
          id="pw-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className={`${inputClass} tracking-[0.3em] tabular-nums`}
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Trocando…">Trocar senha</SubmitButton>
    </form>
  );
}

export function ReplaceAuthenticatorForm() {
  const [state, action] = useActionState(replaceAuthenticatorAction, idleState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <p className="text-sm text-muted-foreground">
        Para trocar de celular ou de aplicativo: confirme com o código atual. Em seguida você configura o novo autenticador
        e gera novos códigos de recuperação.
      </p>
      <Field id="mfa-code" label="Código atual do autenticador">
        <Input
          id="mfa-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className={`${inputClass} tracking-[0.3em] tabular-nums`}
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText="Confirmando…">Trocar autenticador</SubmitButton>
    </form>
  );
}
