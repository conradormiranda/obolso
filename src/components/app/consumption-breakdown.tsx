import { CONSUMPTION, type ConsumptionKey } from "@/lib/domain/consumption";
import { sum } from "@/lib/domain/math";
import { formatCents } from "@/lib/validation/money";

/** Gastos do mês agrupados por tipo de consumo (bares e restaurantes, mercado…). */
export function ConsumptionBreakdown({
  expenses,
}: {
  expenses: readonly { amountCents: number; consumption: ConsumptionKey | null }[];
}) {
  const totals = new Map<ConsumptionKey | "sem_tipo", number>();
  for (const e of expenses) {
    const k = e.consumption ?? "sem_tipo";
    totals.set(k, sum([totals.get(k) ?? 0, e.amountCents]));
  }
  const total = sum([...totals.values()]);
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, cents]) => {
        const pct = total > 0 ? Math.round((cents * 1000) / total) / 10 : 0;
        return (
          <li key={k}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{k === "sem_tipo" ? "Sem tipo" : CONSUMPTION[k].label}</span>
              <span className="tabular-nums">
                {formatCents(cents)} <span className="text-xs text-muted-foreground">{pct.toLocaleString("pt-BR")}%</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
