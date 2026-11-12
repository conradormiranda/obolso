import "server-only";
import { currentMonth, monthParam, parseMonthParam, type MonthRef } from "@/lib/domain/month";

/** Mês da URL (?mes=AAAA-MM) ou o mês atual em São Paulo. */
export function resolveMonth(value: string | string[] | undefined): { ref: MonthRef; param: string } {
  const raw = Array.isArray(value) ? value[0] : value;
  const ref = parseMonthParam(raw) ?? currentMonth();
  return { ref, param: monthParam(ref) };
}
