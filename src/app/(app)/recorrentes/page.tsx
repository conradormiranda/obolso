import type { Metadata } from "next";
import { RecurringManager } from "@/components/app/recurring-manager";
import { todayIso } from "@/lib/domain/month";
import { requireMember } from "@/lib/server/auth";
import { loadCategories, loadMemberNames } from "@/lib/server/budget-data";
import { myRole, payerOptions } from "@/lib/server/form-options";

export const metadata: Metadata = { title: "Despesas recorrentes" };

export default async function RecurringPage() {
  const { supabase, user } = await requireMember();
  const [categories, names, role, templates] = await Promise.all([
    loadCategories(supabase),
    loadMemberNames(supabase),
    myRole(supabase, user),
    supabase
      .from("recurring_templates")
      .select("id, category_id, description, amount_cents, paid_by, payment_method, active, starts_on, ends_on")
      .order("active", { ascending: false })
      .order("description"),
  ]);
  const keyById = new Map(categories.map((c) => [c.id, c.key]));
  const items = (templates.data ?? []).flatMap((t) => {
    const key = keyById.get(t.category_id);
    return key
      ? [
          {
            id: t.id,
            categoryKey: key,
            description: t.description,
            amountCents: t.amount_cents,
            paidBy: t.paid_by,
            paymentMethod: t.payment_method,
            active: t.active,
            startsOn: t.starts_on,
            endsOn: t.ends_on,
          },
        ]
      : [];
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Despesas recorrentes</h1>
        <p className="text-sm text-muted-foreground">
          Aluguel, plano de saúde, assinaturas, empréstimos… Os ativos viram lançamentos automaticamente quando um mês novo
          é criado, e podem ser editados naquele mês sem mudar o modelo.
        </p>
      </div>
      <RecurringManager
        items={items}
        categories={categories.map((c) => ({ key: c.key, name: c.name }))}
        payers={payerOptions(names)}
        defaultPayer={role}
        today={todayIso()}
      />
    </div>
  );
}
