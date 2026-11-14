import "server-only";
import { monthToDb, type MonthRef } from "@/lib/domain/month";
import { isPersonal, type Space } from "@/lib/domain/space";
import { UnauthorizedError, requireMember } from "@/lib/server/auth";
import { logSecurityEvent } from "@/lib/server/log";
import { assertSameOrigin } from "@/lib/server/request";
import type { AppSupabaseClient } from "@/lib/supabase/server";

/** Contexto das Server Actions: Origin verificado → sessão + aal2 + membro. */
export type Ctx = { supabase: AppSupabaseClient; userId: string };

export async function memberContext(): Promise<Ctx | null> {
  try {
    await assertSameOrigin();
  } catch {
    logSecurityEvent("origin_rejected");
    return null;
  }
  try {
    const { supabase, user } = await requireMember();
    return { supabase, userId: user.id };
  } catch (e) {
    if (e instanceof UnauthorizedError) return null;
    throw e;
  }
}

/** Garante o orçamento do mês no espaço (família/pessoal) e devolve o id. */
export async function ensureBudget(supabase: AppSupabaseClient, ref: MonthRef, space: Space): Promise<string | null> {
  const { data, error } = await supabase.rpc("create_month_budget", {
    p_month: monthToDb(ref),
    p_personal: isPersonal(space),
  });
  return error ? null : data;
}
