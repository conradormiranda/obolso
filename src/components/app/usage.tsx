import { cn } from "@/lib/utils";
import { formatBp, roundBpTo1Decimal } from "@/lib/domain/math";
import type { Usage } from "@/lib/domain/summary";
import { formatCents } from "@/lib/validation/money";

const LEVEL_CLASS = {
  ok: "text-success",
  warn: "text-warning",
  over: "text-destructive",
} as const;

const LEVEL_LABEL = { ok: "dentro da meta", warn: "perto do limite", over: "acima da meta" } as const;

/** "Utilizado": verde ≤ 80%, amarelo ≤ 100%, vermelho > 100%; sem meta = cinza. */
export function UsageText({ usage, className }: { usage: Usage; className?: string }) {
  if (usage.kind === "none") {
    return <span className={cn("text-muted-foreground", className)}>sem meta</span>;
  }
  return (
    <span className={cn("font-semibold tabular-nums", LEVEL_CLASS[usage.level], className)}>
      {formatBp(roundBpTo1Decimal(usage.bp), 1)}
      <span className="sr-only"> ({LEVEL_LABEL[usage.level]})</span>
    </span>
  );
}

const BAR_CLASS = { ok: "bg-success", warn: "bg-warning", over: "bg-destructive" } as const;

export function UsageBar({ usage, label }: { usage: Usage; label: string }) {
  const pct = usage.kind === "pct" ? Math.min(100, usage.bp / 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={usage.kind === "pct" ? Math.round(pct) : undefined}
      aria-valuetext={usage.kind === "pct" ? formatBp(roundBpTo1Decimal(usage.bp), 1) : "sem meta"}
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
    >
      {usage.kind === "pct" ? (
        <div className={cn("h-full rounded-full", BAR_CLASS[usage.level])} style={{ width: `${pct}%` }} />
      ) : null}
    </div>
  );
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatCents(cents)}</span>;
}
