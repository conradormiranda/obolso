import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <Link href="/" className="text-primary underline-offset-4 hover:underline">
        Ir para o início
      </Link>
    </main>
  );
}
