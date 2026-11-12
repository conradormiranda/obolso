"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/form-bits";
import { Turnstile } from "@/components/auth/turnstile";
import { loginAction } from "@/lib/actions/auth";
import { idleState } from "@/lib/actions/form-state";

export function LoginForm({ siteKey, nonce }: { siteKey: string; nonce: string }) {
  const [state, formAction] = useActionState(loginAction, idleState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field id="email" label="E-mail">
        <Input id="email" name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>
      <Field id="password" label="Senha">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </Field>
      <Turnstile siteKey={siteKey} nonce={nonce} action="login" resetSignal={state} />
      <FormMessage state={state} />
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  );
}
