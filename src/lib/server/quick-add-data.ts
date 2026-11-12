import "server-only";
import type { User } from "@supabase/supabase-js";
import { buildSuggestions, type Suggestion } from "@/lib/domain/text";
import type { PaidBy } from "@/lib/supabase/database.types";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { loadCategories, loadMemberNames, type Category } from "./budget-data";
import { myRole, payerOptions } from "./form-options";

export type QuickAddData = {
  categories: Pick<Category, "key" | "name" | "color">[];
  payers: { value: PaidBy; label: string }[];
  defaultPayer: PaidBy;
  suggestions: Suggestion[];
};

/** Dados do lançamento rápido: categorias, pagadores e sugestões dos lançamentos anteriores. */
export async function loadQuickAddData(supabase: AppSupabaseClient, user: User): Promise<QuickAddData> {
  const [categories, names, role, recent] = await Promise.all([
    loadCategories(supabase),
    loadMemberNames(supabase),
    myRole(supabase, user),
    supabase
      .from("expenses")
      .select("description, category_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  const keyById = new Map(categories.map((c) => [c.id, c.key]));
  const rows = (recent.data ?? []).flatMap((r) => {
    const key = keyById.get(r.category_id);
    return key ? [{ description: r.description, categoryKey: key }] : [];
  });
  return {
    categories: categories.map((c) => ({ key: c.key, name: c.name, color: c.color })),
    payers: payerOptions(names),
    defaultPayer: role,
    suggestions: buildSuggestions(rows),
  };
}
