import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ExportLinks } from "@/components/app/export-links";
import { IncomeVsSpendingChart } from "@/components/app/income-vs-spending-chart";
import { Panel } from "@/components/app/panel";
import { Money, UsageText } from "@/components/app/usage";
import { MONTH_SHORT, computeAnnual } from "@/lib/domain/annual";
import { CATEGORY_KEYS } from "@/lib/domain/categories";
import { currentMonth } from "@/lib/domain/month";
import { requireMember } from "@/lib/server/auth";
import { loadPeriod, toAnnualInput } from "@/lib/server/period-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Visão anual" };

function parseYear(v: string | undefined): number {
  const n = v && /^\d{4}$/.test(v) ? Number(v) : NaN;
  return n >= 2000 && n <= 2100 ? n : currentMonth().year;
}

export default async function AnnualPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const year = parseYear((await searchParams).ano);
  const { supabase } = await requireMember();
  const period = await loadPeriod(supabase, year, null);
  const annual = computeAnnual(toAnnualInput(period));
  const catName = Object.fromEntries(period.categories.map((c) => [c.key, c.name]));
  const navCls = "flex size-11 items-center justify-center rounded-full border border-border hover:bg-muted";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Visão anual</h1>
          <p className="text-sm text-muted-foreground">12 meses × 6 categorias.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/anual?ano=${year - 1}`} aria-label="Ano anterior" className={navCls}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Link>
          <span className="flex h-11 min-w-28 items-center justify-center rounded-full bg-primary px-5 text-base font-bold text-primary-foreground">
            {year}
          </span>
          <Link href={`/anual?ano=${year + 1}`} aria-label="Próximo ano" className={navCls}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <ExportLinks period={String(year)} label={`o ano de ${year}`} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-primary">Renda no ano</p>
          <p className="text-2xl font-bold">
            <Money cents={annual.incomeTotal} />
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-primary">Gasto no ano</p>
          <p className="text-2xl font-bold">
            <Money cents={annual.spentTotal} />
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-primary">Foi para Liberdade financeira</p>
          <p className="text-2xl font-bold">
            <Money cents={annual.freedom.cents} />
          </p>
          <p className="text-xs text-muted-foreground">
            {annual.freedom.ofIncome.kind === "none" ? (
              "sem renda no ano"
            ) : (
              <>
                <UsageText usage={{ ...annual.freedom.ofIncome, level: "ok" }} className="text-success" /> da renda do ano
              </>
            )}
          </p>
        </div>
      </div>

      <Panel title="Renda × gasto por mês">
        <IncomeVsSpendingChart
          data={annual.months.map((m) => ({ label: MONTH_SHORT[m.month - 1] ?? "", renda: m.incomeCents, gasto: m.totalSpentCents }))}
        />
      </Panel>

      <Panel title="Gasto por mês e categoria">
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[820px] text-sm tabular-nums">
            <caption className="sr-only">Gasto por mês e categoria em {year}</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="pb-3 pr-3 font-semibold">Mês</th>
                {CATEGORY_KEYS.map((k) => (
                  <th key={k} scope="col" className="pb-3 pr-3 text-right font-semibold">{catName[k]}</th>
                ))}
                <th scope="col" className="pb-3 pr-3 text-right font-semibold">Total</th>
                <th scope="col" className="pb-3 text-right font-semibold">Renda</th>
              </tr>
            </thead>
            <tbody>
              {annual.months.map((m) => (
                <tr key={m.month} className={cn("border-t border-dashed border-border", !m.hasBudget && "text-muted-foreground")}>
                  <th scope="row" className="py-2.5 pr-3 text-left font-semibold">
                    <Link href={`/?mes=${year}-${String(m.month).padStart(2, "0")}`} className="hover:text-primary">
                      {MONTH_SHORT[m.month - 1]}
                    </Link>
                  </th>
                  {CATEGORY_KEYS.map((k) => (
                    <td key={k} className="py-2.5 pr-3 text-right"><Money cents={m.spentCents[k]} /></td>
                  ))}
                  <td className="py-2.5 pr-3 text-right font-semibold"><Money cents={m.totalSpentCents} /></td>
                  <td className="py-2.5 text-right"><Money cents={m.incomeCents} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-bold">
                <th scope="row" className="py-3 pr-3 text-left">Total</th>
                {CATEGORY_KEYS.map((k) => (
                  <td key={k} className="py-3 pr-3 text-right"><Money cents={annual.categoryTotals[k]} /></td>
                ))}
                <td className="py-3 pr-3 text-right"><Money cents={annual.spentTotal} /></td>
                <td className="py-3 text-right"><Money cents={annual.incomeTotal} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}
