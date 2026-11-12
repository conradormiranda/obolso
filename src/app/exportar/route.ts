import { NextResponse, type NextRequest } from "next/server";
import { buildCsv, buildWorkbook } from "@/lib/export/build";
import { UnauthorizedError, requireMember } from "@/lib/server/auth";
import { logSecurityEvent } from "@/lib/server/log";
import { loadPeriod, toAnnualInput } from "@/lib/server/period-data";

export const dynamic = "force-dynamic";

/**
 * GET /exportar?periodo=AAAA-MM|AAAA&formato=csv|xlsx
 * Leitura apenas (sem efeito colateral). Exige sessão aal2 de membro; dados via RLS.
 * CSV = lançamentos do período. XLSX = Lançamentos, Rendas e Resumo.
 */
export async function GET(req: NextRequest) {
  const periodo = req.nextUrl.searchParams.get("periodo") ?? "";
  const formato = req.nextUrl.searchParams.get("formato") ?? "";
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(periodo);
  const year = m ? Number(m[1]) : NaN;
  const month = m?.[2] ? Number(m[2]) : null;
  if (!m || year < 2000 || year > 2100 || (month !== null && (month < 1 || month > 12)) || !["csv", "xlsx"].includes(formato)) {
    return new NextResponse("Parâmetros inválidos", { status: 400 });
  }

  let supabase;
  try {
    ({ supabase } = await requireMember());
  } catch (e) {
    if (e instanceof UnauthorizedError) return new NextResponse("Não autorizado", { status: 401 });
    throw e;
  }

  const period = await loadPeriod(supabase, year, month);
  const input = {
    year,
    month,
    categories: period.categories,
    names: period.names,
    targetsByMonth: period.targetsByMonth,
    annualInput: toAnnualInput(period),
    incomes: period.incomes,
    expenses: period.expenses,
  };
  const base = `obolso-${periodo}`;
  logSecurityEvent("export", { formato, escopo: month === null ? "ano" : "mes" });

  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };
  if (formato === "csv") {
    return new NextResponse(buildCsv(input), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}-lancamentos.csv"`,
      },
    });
  }
  const bytes = buildWorkbook(input);
  return new NextResponse(new Blob([bytes as BlobPart]), {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
