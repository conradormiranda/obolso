"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { FormMessage } from "@/components/auth/form-bits";
import { Button } from "@/components/ui/button";
import { confirmStatementAction } from "@/lib/actions/statement";
import { idleState } from "@/lib/actions/form-state";
import { CONSUMPTION, CONSUMPTION_KEYS, isConsumptionKey, type ConsumptionKey } from "@/lib/domain/consumption";
import { isCategoryKey, PAYMENT_METHOD_LABEL } from "@/lib/domain/categories";
import { formatDateBr } from "@/lib/domain/month";
import { spaceHref } from "@/lib/domain/space";
import { isLikelyDuplicate, merchantKey, suggestCategory, type HistoryEntry } from "@/lib/import/categorize";
import { parseStatement, StatementError, type ParsedStatement, type StatementKind } from "@/lib/import/statement";
import type { CategoryKey, PaidBy } from "@/lib/supabase/database.types";
import { formatCents } from "@/lib/validation/money";
import { cn } from "@/lib/utils";
import { SpaceField, useSpace } from "./space";

type Existing = { date: string; description: string; amountCents: number; installment: { number: number; total: number } | null };
type Override = { include?: boolean; section?: CategoryKey | null; consumption?: ConsumptionKey | null };
type ExistingIncome = { description: string; amountCents: number };

/** Renda provavelmente já cadastrada: mesmo valor e nome parecido. */
function incomeExists(i: { description: string; amountCents: number }, existing: readonly ExistingIncome[]): boolean {
  const head = (s: string) => merchantKey(s).split(" ").slice(0, 2).join(" ");
  const a = head(i.description);
  return existing.some((e) => e.amountCents === i.amountCents && (head(e.description) === a || a === "" || head(e.description) === ""));
}

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Lê o arquivo no navegador: UTF-8 ou, se não for, Windows-1252 (comum em OFX de banco). */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

/**
 * Importar fatura: o arquivo (OFX/CSV) é lido AQUI, no navegador, e não é
 * enviado. Cada compra recebe tipo de consumo e seção sugeridos (histórico →
 * regras); prováveis duplicados vêm desmarcados. Só as linhas confirmadas vão
 * para o servidor.
 */
export function StatementImport({
  month,
  monthName,
  categories,
  payers,
  defaultPayer,
  history,
  existing,
  existingIncomes,
}: {
  month: string;
  monthName: string;
  categories: { key: CategoryKey; name: string }[];
  payers: { value: PaidBy; label: string }[];
  defaultPayer: PaidBy;
  history: [string, HistoryEntry][];
  existing: Existing[];
  existingIncomes: ExistingIncome[];
}) {
  const [text, setText] = useState<string | null>(null);
  const [kindOverride, setKindOverride] = useState<StatementKind | undefined>(undefined);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [incomeChecks, setIncomeChecks] = useState<Record<number, boolean>>({});
  const [paidBy, setPaidBy] = useState<PaidBy>(defaultPayer);
  const [state, action, pending] = useActionState(confirmStatementAction, idleState);
  const fileRef = useRef<HTMLInputElement>(null);
  const espaco = useSpace();

  const historyMap = useMemo(() => new Map(history), [history]);

  const { parsed, parseError } = useMemo((): { parsed: ParsedStatement | null; parseError: string | null } => {
    if (text === null) return { parsed: null, parseError: null };
    try {
      return { parsed: parseStatement(text, kindOverride), parseError: null };
    } catch (err) {
      return {
        parsed: null,
        parseError: err instanceof StatementError ? err.message : "Não consegui ler este arquivo. Use o OFX ou CSV do banco.",
      };
    }
  }, [text, kindOverride]);

  const rows = useMemo(() => {
    if (!parsed) return [];
    return parsed.lines.map((line, i) => {
      const s = suggestCategory(line.description, historyMap);
      const duplicate = isLikelyDuplicate(line, existing);
      const o = overrides[i] ?? {};
      const consumption = o.consumption !== undefined ? o.consumption : s.consumption;
      const section =
        o.section !== undefined ? o.section : o.consumption ? CONSUMPTION[o.consumption].section : s.section;
      return { i, line, source: s.source, duplicate, include: o.include ?? !duplicate, consumption, section };
    });
  }, [parsed, historyMap, existing, overrides]);

  const incomes = useMemo(() => {
    if (!parsed) return [];
    return parsed.incomes.map((line, i) => {
      const duplicate = incomeExists(line, existingIncomes);
      return { i, line, duplicate, include: incomeChecks[i] ?? (line.suggested && !duplicate) };
    });
  }, [parsed, existingIncomes, incomeChecks]);

  // Depois de salvar, volta ao início (escolher outro arquivo).
  useEffect(() => {
    if (state.status === "success") {
      setText(null);
      setKindOverride(undefined);
      setOverrides({});
      setIncomeChecks({});
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [state]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setReadError(null);
    setText(null);
    setKindOverride(undefined);
    setOverrides({});
    setIncomeChecks({});
    if (!file) return;
    setFileName(file.name);
    try {
      setText(await readText(file));
    } catch {
      setReadError("Não consegui abrir este arquivo.");
    }
  }

  function changeKind(k: StatementKind) {
    setKindOverride(k);
    setOverrides({});
    setIncomeChecks({});
  }

  const set = (i: number, patch: Override) => setOverrides((o) => ({ ...o, [i]: { ...o[i], ...patch } }));
  const selected = rows.filter((r) => r.include);
  const missing = selected.filter((r) => !r.section).length;
  const totalCents = selected.reduce((a, r) => a + r.line.amountCents, 0);
  const selectedIncomes = incomes.filter((r) => r.include);
  const incomePayload = JSON.stringify(selectedIncomes.map((r) => ({ description: r.line.description, amountCents: r.line.amountCents })));
  const error = readError ?? parseError;
  const count = selected.length + selectedIncomes.length;
  const payload = JSON.stringify(
    selected.map((r) => ({
      date: r.line.date,
      description: r.line.description,
      amountCents: r.line.amountCents,
      section: r.section,
      consumption: r.consumption,
      paymentMethod: r.line.paymentMethod,
      installmentNumber: r.line.installment?.number ?? null,
      installmentTotal: r.line.installment?.total ?? null,
    })),
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <label htmlFor="statement-file" className="block text-sm font-semibold">
          Fatura do cartão ou extrato da conta (OFX ou CSV)
        </label>
        <p className="mb-3 text-xs text-muted-foreground">
          No app ou site do banco, abra a fatura ou o extrato e procure “Exportar” ou “Baixar” → OFX (ou Excel/CSV). O
          arquivo é lido só neste aparelho; nada dele fica guardado.
        </p>
        <label
          className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/60 px-4 text-sm font-semibold text-primary hover:bg-muted"
        >
          <FileUp className="size-4" aria-hidden="true" />
          {fileName || "Escolher arquivo"}
          <input
            ref={fileRef}
            id="statement-file"
            type="file"
            accept=".ofx,.qfx,.csv,.txt,application/x-ofx,text/csv,text/plain"
            onChange={onFile}
            className="sr-only"
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {state.status === "success" ? (
          <div className="mt-3 space-y-2">
            <FormMessage state={state} />
            <Link href={spaceHref("/", { mes: month, espaco })} className="text-sm font-semibold text-primary underline">
              Ver o orçamento de {monthName}
            </Link>
          </div>
        ) : null}
      </section>

      {parsed ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="rows" value={payload} />
          <input type="hidden" name="incomes" value={incomePayload} />
          <SpaceField />

          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="mb-2 text-sm font-semibold">
              Este arquivo é{parsed.kindDetected ? "" : " (confira)"}:
            </legend>
            {(["cartao", "conta"] as const).map((k) => (
              <label key={k} className="cursor-pointer">
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={parsed.kind === k}
                  onChange={() => changeKind(k)}
                  className="peer sr-only"
                />
                <span className="flex h-10 items-center rounded-lg border border-input px-3 text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                  {k === "cartao" ? "Fatura do cartão" : "Extrato da conta"}
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {parsed.lines.length} gasto{parsed.lines.length === 1 ? "" : "s"}
              {parsed.kind === "conta" ? ` · ${parsed.incomes.length} entrada${parsed.incomes.length === 1 ? "" : "s"}` : ""}
              {parsed.ignored > 0 ? ` · ${parsed.ignored} ignorado(s)` : ""}
              {parsed.invalidLines > 0 ? ` · ${parsed.invalidLines} linha(s) ilegível(is)` : ""}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-9" onClick={() => setOverrides((o) => Object.fromEntries(rows.map((r) => [r.i, { ...o[r.i], include: true }])))}>
                Marcar todos
              </Button>
              <Button type="button" variant="outline" className="h-9" onClick={() => setOverrides((o) => Object.fromEntries(rows.map((r) => [r.i, { ...o[r.i], include: false }])))}>
                Desmarcar todos
              </Button>
            </div>
          </div>
          {parsed.cardBillPayments > 0 ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">
              O pagamento da fatura do cartão não entra como gasto (senão contaria duas vezes). Importe a fatura do cartão
              para lançar as compras dela.
            </p>
          ) : null}

          {rows.length > 0 ? <h2 className="text-lg font-bold text-primary">Gastos</h2> : null}
          <ul className="divide-y divide-dashed divide-border rounded-2xl border border-border bg-card px-4">
            {rows.map((r) => (
              <li key={r.i} className={cn("flex gap-3 py-3", !r.include && "opacity-60")}>
                <input
                  type="checkbox"
                  aria-label={`Importar ${r.line.description}`}
                  checked={r.include}
                  onChange={(e) => set(r.i, { include: e.target.checked })}
                  className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {r.line.description}
                        {r.line.installment ? (
                          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
                            {r.line.installment.number}/{r.line.installment.total}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateBr(r.line.date)} · {PAYMENT_METHOD_LABEL[r.line.paymentMethod]}
                        {r.source === "historico" ? " · como da última vez" : ""}
                        {r.duplicate ? (
                          <span className="ml-1 font-semibold text-warning"> · parece já lançado neste mês</span>
                        ) : null}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{formatCents(r.line.amountCents)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label={`Tipo de consumo de ${r.line.description}`}
                      value={r.consumption ?? ""}
                      onChange={(e) => set(r.i, { consumption: isConsumptionKey(e.target.value) ? e.target.value : null })}
                      className={selectClass}
                    >
                      <option value="">Tipo de consumo…</option>
                      {CONSUMPTION_KEYS.map((k) => (
                        <option key={k} value={k}>
                          {CONSUMPTION[k].label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Seção de ${r.line.description}`}
                      value={r.section ?? ""}
                      onChange={(e) => set(r.i, { section: isCategoryKey(e.target.value) ? e.target.value : null })}
                      className={cn(selectClass, r.include && !r.section && "border-warning text-warning")}
                    >
                      <option value="">Escolha a seção…</option>
                      {categories.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {incomes.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-primary">Entradas → Renda do mês</h2>
              <p className="text-xs text-muted-foreground">
                Marque só o que é renda (salário, pró-labore…). Transferências entre contas e resgates ficam de fora.
              </p>
              <ul className="divide-y divide-dashed divide-border rounded-2xl border border-border bg-card px-4">
                {incomes.map((r) => (
                  <li key={r.i} className={cn("flex items-center gap-3 py-3", !r.include && "opacity-60")}>
                    <input
                      type="checkbox"
                      aria-label={`Lançar como renda ${r.line.description}`}
                      checked={r.include}
                      onChange={(e) => setIncomeChecks((c) => ({ ...c, [r.i]: e.target.checked }))}
                      className="size-5 shrink-0 accent-[var(--primary)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{r.line.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateBr(r.line.date)}
                        {r.duplicate ? <span className="ml-1 font-semibold text-warning"> · parece já cadastrada</span> : null}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-success">{formatCents(r.line.amountCents)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="sticky bottom-20 z-30 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="paidBy" className="text-sm font-medium">
                Quem pagou / recebeu
              </label>
              <select
                id="paidBy"
                name="paidBy"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value as PaidBy)}
                className={cn(selectClass, "w-auto")}
              >
                {payers.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">(as rendas marcadas ficam no nome de quem recebeu)</span>
            </div>
            {missing > 0 ? (
              <p className="text-sm font-semibold text-warning">
                Escolha a seção de {missing} gasto{missing > 1 ? "s" : ""} marcado{missing > 1 ? "s" : ""}.
              </p>
            ) : null}
            {state.status === "error" ? <FormMessage state={state} /> : null}
            <Button type="submit" disabled={pending || count === 0 || missing > 0} className="h-11 w-full text-base font-semibold">
              {pending
                ? "Salvando…"
                : [
                    `Salvar ${selected.length} lançamento${selected.length === 1 ? "" : "s"} (${formatCents(totalCents)})`,
                    selectedIncomes.length > 0 ? `${selectedIncomes.length} renda${selectedIncomes.length === 1 ? "" : "s"}` : null,
                  ]
                    .filter(Boolean)
                    .join(" e ") + ` em ${monthName}`}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
