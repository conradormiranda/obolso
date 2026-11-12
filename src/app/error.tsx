"use client";

/** Página de erro genérica: nunca exibe mensagem técnica ou stack trace. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="text-muted-foreground">Tente novamente em instantes.</p>
      <button
        type="button"
        onClick={reset}
        className="h-11 rounded-lg bg-primary px-5 font-semibold text-primary-foreground"
      >
        Tentar de novo
      </button>
    </main>
  );
}
