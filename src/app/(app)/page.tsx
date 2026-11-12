import Link from "next/link";
import { CalendarRange, ChevronRight, Repeat } from "lucide-react";
import { ExportLinks } from "@/components/app/export-links";
import { CopyPreviousMonth } from "@/components/app/copy-previous";
import { DuplicateAlert } from "@/components/app/duplicate-alert";
import { MonthSelector } from "@/components/app/month-selector";
import { Panel } from "@/components/app/panel";
import { SpendingDonut } from "@/components/app/spending-donut";
import { SummaryTable } from "@/components/app/summary-table";
import { TargetsCard } from "@/components/app/targets-card";
import { Money } from "@/components/app/usage";
import { Button } from "@/components/ui/button";
import { createMonthAction } from "@/lib/actions/budget";
import { monthLabel } from "@/lib/domain/month";
import { computeSummary } from "@/lib/domain/summary";
import { findDuplicates } from "@/lib/domain/text";
import { requireMember } from "@/lib/server/auth";
import { loadMonth } from "@/lib/server/budget-data";
import { resolveMonth } from "@/lib/server/month-param";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ref, param } = resolveMonth((await searchParams).mes);
  const { supabase } = await requireMember();
  const data = await loadMonth(supabase, ref);

  const summary = computeSummary({
    incomeCents: data.incomeCents,
    categories: data.categories,
    targetsBp: data.targetsBp,
    spentCents: data.spentCents,
  });

  const duplicates = findDuplicates(data.expenses);
  const categoryNames = Object.fromEntries(data.categories.map((c) => [c.key, c.name])) as Record<
    (typeof data.categories)[number]["key"],
    string
  >;

  const toolbar = (
    <div className="flex flex-wrap items-start gap-2">
      <CopyPreviousMonth month={param} />
      <Link
        href="/recorrentes"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted"
      >
        <Repeat className="size-4" aria-hidden="true" /> Recorrentes
      </Link>
      <Link
        href={`/anual?ano=${ref.year}`}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted"
      >
        <CalendarRange className="size-4" aria-hidden="true" /> Visão anual
      </Link>
      {data.budgetId ? <ExportLinks period={param} label={monthLabel(ref)} /> : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Orçamento doméstico</h1>
          <p className="text-sm text-muted-foreground">Distribuição da renda da família em 6 categorias.</p>
        </div>
        <MonthSelector month={param} />
      </div>

      {/* Mesma posição na árvore com ou sem orçamento: preserva a mensagem da ação de copiar. */}
      {toolbar}

      {data.budgetId === null ? (
        <section className="rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="mb-4">O orçamento de {monthLabel(ref)} ainda não foi criado.</p>
          <form action={createMonthAction}>
            <input type="hidden" name="month" value={param} />
            <Button type="submit" className="h-11 px-6 text-base font-semibold">
              Criar orçamento de {monthLabel(ref)}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Começa com as metas padrão (40/10/10/10/25/5) e com os lançamentos recorrentes ativos.
          </p>
        </section>
      ) : (
        <>
          <DuplicateAlert duplicates={duplicates} names={categoryNames} month={param} />
          <Link
            href={`/renda?mes=${param}`}
            className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 hover:border-primary/60"
          >
            <span>
              <span className="block text-sm font-semibold text-primary">Renda do mês</span>
              <span className="text-2xl font-bold">
                <Money cents={data.incomeCents} />
              </span>
              <span className="block text-xs text-muted-foreground">
                {data.incomes.length === 0
                  ? "Nenhuma fonte cadastrada. Toque para adicionar."
                  : `${data.incomes.length} fonte${data.incomes.length > 1 ? "s" : ""} de renda`}
              </span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
          </Link>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
            <Panel title="Gastos">
              <SpendingDonut
                totalCents={summary.totalSpentCents}
                slices={summary.rows.map((r) => ({ key: r.key, name: r.name, color: r.color, cents: r.spentCents }))}
              />
            </Panel>
            <Panel title="Resumo">
              <SummaryTable summary={summary} month={param} />
            </Panel>
            <Panel title="Metas">
              <TargetsCard month={param} rows={summary.rows.map((r) => ({ key: r.key, name: r.name, bp: r.targetBp }))} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
