import "server-only";
import type { User } from "@supabase/supabase-js";
import type { PaidBy } from "@/lib/supabase/database.types";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import type { MemberNames } from "./budget-data";

export function payerOptions(names: MemberNames): { value: PaidBy; label: string }[] {
  return [
    { value: "pai", label: names.pai },
    { value: "mae", label: names.mae },
    { value: "conjunto", label: "Conjunto" },
  ];
}

/** "Quem pagou" padrão = usuário logado. */
export async function myRole(supabase: AppSupabaseClient, user: User): Promise<PaidBy> {
  const { data } = await supabase.from("household_members").select("role").eq("user_id", user.id).maybeSingle();
  return data?.role ?? "conjunto";
}
