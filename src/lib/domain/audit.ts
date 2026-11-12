import type { AuditAction, Json } from "@/lib/supabase/database.types";

/** Descreve uma linha do audit_log em linguagem simples (somente leitura). */

export const TABLE_LABEL: Record<string, string> = {
  expenses: "Lançamento",
  incomes: "Renda",
  category_targets: "Meta",
  monthly_budgets: "Orçamento do mês",
  recurring_templates: "Recorrente",
  household_members: "Membro",
  households: "Família",
  categories: "Categoria",
};

export const ACTION_LABEL: Record<AuditAction, string> = {
  INSERT: "criado",
  UPDATE: "alterado",
  DELETE: "apagado definitivamente",
  SOFT_DELETE: "excluído",
  RESTORE: "restaurado",
};

/** Substantivos femininos: "Renda criada", "Meta alterada". */
const FEMININE = new Set(["incomes", "category_targets", "households", "categories"]);
const ACTION_LABEL_F: Record<AuditAction, string> = {
  INSERT: "criada",
  UPDATE: "alterada",
  DELETE: "apagada definitivamente",
  SOFT_DELETE: "excluída",
  RESTORE: "restaurada",
};

const FIELD_LABEL: Record<string, string> = {
  description: "descrição",
  amount_cents: "valor",
  category_id: "categoria",
  expense_date: "data",
  paid_by: "quem pagou",
  received_by: "quem recebeu",
  payment_method: "pagamento",
  tags: "tags",
  notes: "observação",
  percent_bp: "percentual",
  display_name: "nome",
  active: "ativo",
  starts_on: "início",
  ends_on: "término",
};

const IGNORED = new Set(["updated_at", "deleted_at", "created_at"]);

function asRecord(v: Json | null): Record<string, Json | undefined> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

export type AuditView = {
  title: string;
  description: string | null;
  amountCents: number | null;
  previousAmountCents: number | null;
  changedFields: string[];
};

export function describeAudit(row: { table_name: string; action: AuditAction; before: Json | null; after: Json | null }): AuditView {
  const before = asRecord(row.before);
  const after = asRecord(row.after);
  const cur = after ?? before;
  const num = (r: Record<string, Json | undefined> | null, k: string) => {
    const v = r?.[k];
    return typeof v === "number" && Number.isSafeInteger(v) ? v : null;
  };
  const str = (r: Record<string, Json | undefined> | null, k: string) => {
    const v = r?.[k];
    return typeof v === "string" ? v : null;
  };

  const changed =
    row.action === "UPDATE" && before && after
      ? Object.keys(after)
          .filter((k) => !IGNORED.has(k) && JSON.stringify(after[k]) !== JSON.stringify(before[k]))
          .map((k) => FIELD_LABEL[k] ?? k)
      : [];

  const amount = num(cur, "amount_cents");
  const prevAmount = row.action === "UPDATE" ? num(before, "amount_cents") : null;

  return {
    title: `${TABLE_LABEL[row.table_name] ?? row.table_name} ${(FEMININE.has(row.table_name) ? ACTION_LABEL_F : ACTION_LABEL)[row.action]}`,
    description: str(cur, "description") ?? str(cur, "display_name") ?? str(cur, "month"),
    amountCents: amount,
    previousAmountCents: prevAmount !== null && prevAmount !== amount ? prevAmount : null,
    changedFields: changed,
  };
}
