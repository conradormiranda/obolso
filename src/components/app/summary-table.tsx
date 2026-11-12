import Link from "next/link";
import { CATEGORY_SLUG } from "@/lib/domain/categories";
import { formatBp, roundBpTo1Decimal } from "@/lib/domain/math";
import type { Summary } from "@/lib/domain/summary";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { Money, UsageText } from "./usage";

function Share({ bp }: { bp: number | null }) {
  return <span className="tabular-nums">{bp === null ? "—" : formatBp(roundBpTo1Decimal(bp), 1)}</span>;
}

/** Tabela "Resumo". Em telas largas, tabela; no celular, lista empilhada. */
export function SummaryTable({ summary, month }: { summary: Summary; month: string }) {
  return (
    <div>
      {/* Desktop */}
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">Resumo do mês por categoria</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="pb-3 font-semibold">Categoria</th>
            <th scope="col" className="pb-3 text-right font-semibold">Valor gasto</th>
            <th scope="col" className="pb-3 text-right font-semibold">Devo gastar</th>
            <th scope="col" className="pb-3 text-right font-semibold">Utilizado</th>
            <th scope="col" className="pb-3 text-right font-semibold">Participação</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((r) => (
            <tr key={r.key} className="border-t border-dashed border-border">
              <th scope="row" className="py-3 text-left font-semibold">
                <Link href={`/categoria/${CATEGORY_SLUG[r.key]}?mes=${month}`} className="hover:text-primary">
                  {r.name}
                </Link>
              </th>
              <td className="py-3 text-right"><Money cents={r.spentCents} /></td>
              <td className="py-3 text-right"><Money cents={r.shouldSpendCents} /></td>
              <td className="py-3 text-right"><UsageText usage={r.usage} /></td>
              <td className="py-3 text-right"><Share bp={r.shareBp} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Celular */}
      <ul className="space-y-1 md:hidden">
        {summary.rows.map((r) => (
          <li key={r.key}>
            <Link
              href={`/categoria/${CATEGORY_SLUG[r.key]}?mes=${month}`}
              className="flex items-center gap-3 rounded-lg px-1 py-3 hover:bg-muted"
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${r.color}26`, color: r.color }}
              >
                <CategoryIcon category={r.key} className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold">{r.name}</span>
                  <UsageText usage={r.usage} className="text-sm" />
                </span>
                <span className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    <Money cents={r.spentCents} className="text-foreground" /> de <Money cents={r.shouldSpendCents} />
                  </span>
                  <span>
                    <Share bp={r.shareBp} /> do total
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-5">
        <div>
          <dd className="text-lg font-bold text-success sm:text-2xl"><Money cents={summary.totalSpentCents} /></dd>
          <dt className="text-xs font-semibold text-muted-foreground">Total gasto</dt>
        </div>
        <div>
          <dd className={cn("text-lg font-bold sm:text-2xl", summary.remainingCents < 0 ? "text-destructive" : "text-foreground")}>
            <Money cents={summary.remainingCents} />
          </dd>
          <dt className="text-xs font-semibold text-muted-foreground">Ainda posso gastar</dt>
        </div>
        <div>
          <dd className="text-lg sm:text-2xl"><UsageText usage={summary.usage} /></dd>
          <dt className="text-xs font-semibold text-muted-foreground">Utilizado</dt>
        </div>
      </dl>
    </div>
  );
}
