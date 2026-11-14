"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-bits";
import { generateRecoveryCodesAction, type RecoveryCodesResult } from "@/lib/actions/auth";

export function RecoveryCodes({ remaining, next }: { remaining: number; next: string }) {
  const [result, setResult] = useState<RecoveryCodesResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  if (result?.status === "ok") {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Guarde estes códigos em um lugar seguro (por exemplo, no seu gerenciador de senhas). Eles{" "}
          <strong>não serão mostrados de novo</strong> e cada um vale uma única vez.
        </p>
        <ol className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 font-mono text-sm tabular-nums">
          {result.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4" />
          Guardei os códigos em local seguro
        </label>
        {/* Navegação completa (não client-side): garante que o endereço e a tela batem. */}
        {saved ? (
          <a
            href={next}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground"
          >
            Continuar
          </a>
        ) : (
          <Button className="h-11 w-full" disabled>
            Continuar
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {remaining > 0
          ? `Você tem ${remaining} código${remaining > 1 ? "s" : ""} de recuperação válido${remaining > 1 ? "s" : ""}. Gerar novos invalida os anteriores.`
          : "Os códigos de recuperação permitem entrar se você perder o celular com o autenticador."}
      </p>
      {result?.status === "error" ? <FormMessage state={{ status: "error", message: result.message }} /> : null}
      <Button
        className="h-11 w-full text-base font-semibold"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await generateRecoveryCodesAction()))}
      >
        {pending ? "Gerando…" : remaining > 0 ? "Gerar novos códigos" : "Gerar códigos de recuperação"}
      </Button>
      {remaining > 0 ? (
        <a href={next} className="block text-center text-sm text-primary underline-offset-4 hover:underline">
          {next === "/" ? "Voltar" : "Continuar"}
        </a>
      ) : null}
    </div>
  );
}
