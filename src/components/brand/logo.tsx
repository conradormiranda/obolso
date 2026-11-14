import { cn } from "@/lib/utils";

/**
 * Marca do O Bolso (versão 1A): bolso de peça única, traço fino, costura tracejada.
 * Minimalista e discreta (nada que remeta a dinheiro). Usa currentColor.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {/* contorno do bolso (peça única) */}
      <path d="M7 6.5h18v12.2c0 .9-.4 1.7-1.2 2.2L16 26l-7.8-5.1c-.8-.5-1.2-1.3-1.2-2.2z" strokeWidth="1.5" />
      {/* costura acompanhando o contorno */}
      <path
        d="M9.6 9.2h12.8v9c0 .5-.2.9-.6 1.2L16 23.1l-5.8-3.7c-.4-.3-.6-.7-.6-1.2z"
        strokeWidth="1"
        strokeDasharray="1.4 1.7"
        opacity="0.75"
      />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold tracking-tight text-primary", className)}>
      <LogoMark className={cn("size-[1.4em]", markClassName)} />
      <span>O Bolso</span>
    </span>
  );
}
