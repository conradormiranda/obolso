import type { Metadata } from "next";
import Link from "next/link";
import { describeAudit } from "@/lib/domain/audit";
import { requireMember } from "@/lib/server/auth";
import { formatCents } from "@/lib/validation/money";

export const metadata: Metadata = { title: "Auditoria" };

const PAGE_SIZE = 50;
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Log de auditoria (somente leitura): quem, quando, o quê, antes/depois. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const raw = Number((await searchParams).pagina ?? "1");
  const page = Number.isSafeInteger(raw) && raw >= 1 && raw <= 10000 ? raw : 1;
  const { supabase } = await requireMember();

  const [{ data: rows, count }, { data: members }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, table_name, action, actor_id, before, after, at", { count: "exact" })
      .order("id", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("household_members").select("user_id, display_name"),
  ]);
  const nameById = new Map((members ?? []).map((m) => [m.user_id, m.display_name]));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Registro permanente de toda criação, alteração e exclusão. Ninguém consegue editar ou apagar este histórico.
        </p>
      </div>

      {(rows ?? []).length === 0 ? (
        <p className="text-muted-foreground">Nenhum registro.</p>
      ) : (
        <ol className="divide-y divide-dashed divide-border rounded-2xl border border-border bg-card px-5">
          {(rows ?? []).map((r) => {
            const v = describeAudit(r);
            return (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-semibold">{v.title}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    <time dateTime={r.at}>{dateFmt.format(new Date(r.at))}</time> ·{" "}
                    {r.actor_id ? (nameById.get(r.actor_id) ?? "Usuário removido") : "Sistema"}
                  </p>
                </div>
                <p className="text-sm">
                  {v.description ? <span>{v.description}</span> : null}
                  {v.amountCents !== null ? (
                    <span className="tabular-nums">
                      {v.description ? " · " : ""}
                      {v.previousAmountCents !== null ? (
                        <>
                          <s className="text-muted-foreground">{formatCents(v.previousAmountCents)}</s> →{" "}
                        </>
                      ) : null}
                      {formatCents(v.amountCents)}
                    </span>
                  ) : null}
                </p>
                {v.changedFields.length ? (
                  <p className="text-xs text-muted-foreground">Campos: {v.changedFields.join(", ")}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <nav aria-label="Páginas" className="flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link href={`/auditoria?pagina=${page - 1}`} className="text-primary underline-offset-4 hover:underline">
            ← Mais recentes
          </Link>
        ) : (
          <span />
        )}
        <span className="text-muted-foreground">
          Página {page} de {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={`/auditoria?pagina=${page + 1}`} className="text-primary underline-offset-4 hover:underline">
            Mais antigos →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
