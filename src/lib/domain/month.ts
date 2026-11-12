/**
 * Mês de referência no formato "AAAA-MM". No banco: date "AAAA-MM-01".
 * O "mês atual" é calculado no fuso de São Paulo.
 */

export type MonthRef = { year: number; month: number }; // month 1..12

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function parseMonthParam(value: string | undefined | null): MonthRef | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

export function currentMonth(now: Date = new Date()): MonthRef {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export function addMonths(ref: MonthRef, delta: number): MonthRef {
  const idx = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function monthParam(ref: MonthRef): string {
  return `${ref.year}-${String(ref.month).padStart(2, "0")}`;
}

export function monthToDb(ref: MonthRef): string {
  return `${monthParam(ref)}-01`;
}

export function monthFromDb(value: string): MonthRef | null {
  return parseMonthParam(value.slice(0, 7));
}

export function monthLabel(ref: MonthRef): string {
  return `${MONTH_NAMES[ref.month - 1]}/${ref.year}`;
}

export function lastDayOfMonth(ref: MonthRef): number {
  return new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();
}

/** Data padrão de um lançamento: hoje, se hoje estiver no mês; senão o dia 1. */
export function defaultEntryDate(ref: MonthRef, now: Date = new Date()): string {
  const today = todayIso(now);
  return today.startsWith(monthParam(ref)) ? today : monthToDb(ref);
}

export function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= lastDayOfMonth({ year: y, month: mo });
}

export function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
