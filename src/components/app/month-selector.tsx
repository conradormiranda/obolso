"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, monthLabel, monthParam, parseMonthParam } from "@/lib/domain/month";

/** Seletor de mês: anterior / próximo / escolher (input nativo, bom no celular). */
export function MonthSelector({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = parseMonthParam(month);
  if (!ref) return null;
  const prev = monthParam(addMonths(ref, -1));
  const next = monthParam(addMonths(ref, 1));
  const linkClass =
    "flex size-11 items-center justify-center rounded-full border border-border hover:bg-muted focus-visible:outline-2";

  return (
    <div className="flex items-center gap-2">
      <Link href={`${pathname}?mes=${prev}`} aria-label="Mês anterior" className={linkClass}>
        <ChevronLeft className="size-5" aria-hidden="true" />
      </Link>
      <label className="relative">
        <span className="sr-only">Escolher mês</span>
        <span className="pointer-events-none flex h-11 min-w-44 items-center justify-center rounded-full bg-primary px-5 text-base font-bold text-primary-foreground">
          {monthLabel(ref)}
        </span>
        <input
          type="month"
          value={month}
          min="2000-01"
          max="2100-12"
          onChange={(e) => {
            if (parseMonthParam(e.target.value)) router.push(`${pathname}?mes=${e.target.value}`);
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <Link href={`${pathname}?mes=${next}`} aria-label="Próximo mês" className={linkClass}>
        <ChevronRight className="size-5" aria-hidden="true" />
      </Link>
    </div>
  );
}
