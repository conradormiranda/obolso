import type { Metadata } from "next";
import { IncomeManager } from "@/components/app/income-manager";
import { MonthSelector } from "@/components/app/month-selector";
import { Money } from "@/components/app/usage";
import { paidByLabel } from "@/lib/domain/categories";
import { requireMember } from "@/lib/server/auth";
import { loadMonth } from "@/lib/server/budget-data";
import { myRole, payerOptions } from "@/lib/server/form-options";
import { resolveMonth } from "@/lib/server/month-param";

export const metadata: Metadata = { title: "Renda do mês" };

export default async function IncomePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { ref, param } = resolveMonth((await searchParams).mes);
  const { supabase, user } = await requireMember();
  const [data, role] = await Promise.all([loadMonth(supabase, ref), myRole(supabase, user)]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Renda do mês</h1>
          <p className="text-2xl font-bold">
            <Money cents={data.incomeCents} />
          </p>
        </div>
        <MonthSelector month={param} />
      </div>
      <IncomeManager
        month={param}
        payers={payerOptions(data.names)}
        defaultReceiver={role}
        items={data.incomes.map((i) => ({ ...i, receivedByLabel: paidByLabel(i.receivedBy, data.names) }))}
      />
    </div>
  );
}
