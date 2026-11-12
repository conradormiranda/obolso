"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormMessage, SubmitButton, inputClass } from "@/components/auth/form-bits";
import {
  confirmEnrollAction,
  startEnrollAction,
  type EnrollConfirmState,
  type EnrollStart,
} from "@/lib/actions/auth";

const initialConfirm: EnrollConfirmState = { status: "idle" };

export function Enroll() {
  const [start, setStart] = useState<EnrollStart | null>(null);
  const [starting, startTransition] = useTransition();
  const [confirm, confirmAction] = useActionState(confirmEnrollAction, initialConfirm);
  const [saved, setSaved] = useState(false);

  if (confirm.status === "codes") {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Autenticador configurado. Guarde estes <strong>códigos de recuperação</strong> em um lugar seguro (por
          exemplo, no seu gerenciador de senhas). Eles <strong>não serão mostrados de novo</strong>. Cada um vale uma
          única vez.
        </p>
        <ol className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 font-mono text-sm tabular-nums">
          {confirm.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4" />
          Guardei os códigos em local seguro
        </label>
        {saved ? (
          <Link
            href="/"
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground"
          >
            Continuar
          </Link>
        ) : (
          <Button className="h-11 w-full" disabled>
            Continuar
          </Button>
        )}
      </div>
    );
  }

  if (!start || start.status === "error") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          O acesso exige um aplicativo autenticador (Google Authenticator, 1Password, Authy…). Tenha-o em mãos.
        </p>
        {start?.status === "error" ? <FormMessage state={{ status: "error", message: start.message }} /> : null}
        <Button
          className="h-11 w-full text-base font-semibold"
          disabled={starting}
          onClick={() => startTransition(async () => setStart(await startEnrollAction()))}
        >
          {starting ? "Gerando…" : "Começar configuração"}
        </Button>
      </div>
    );
  }

  return (
    <form action={confirmAction} className="space-y-4" noValidate>
      <p className="text-sm">1. Escaneie o QR code no aplicativo autenticador.</p>
      {/* QR code em SVG gerado pelo Supabase (data URI). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={start.qrCode} alt="QR code para o aplicativo autenticador" className="mx-auto size-48 rounded-lg bg-white p-2" />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Não consegue escanear? Digite a chave</summary>
        <code className="mt-2 block break-all rounded bg-muted p-2 font-mono text-xs">{start.secret}</code>
      </details>
      <p className="text-sm">2. Digite o código de 6 dígitos que aparece no aplicativo.</p>
      <input type="hidden" name="factorId" value={start.factorId} />
      <Field id="code" label="Código de 6 dígitos">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          required
          className={`${inputClass} tracking-[0.3em] tabular-nums`}
        />
      </Field>
      <FormMessage state={confirm} />
      <SubmitButton pendingText="Verificando…">Ativar</SubmitButton>
    </form>
  );
}
