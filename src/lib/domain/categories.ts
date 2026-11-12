import type { CategoryKey, PaidBy, PaymentMethod } from "@/lib/supabase/database.types";

/** Ordem e metadados fixos de interface (nome/cor vêm do banco). */
export const CATEGORY_KEYS = [
  "custos_fixos",
  "conforto",
  "metas",
  "prazeres",
  "liberdade_financeira",
  "conhecimento",
] as const satisfies readonly CategoryKey[];

export function isCategoryKey(v: string): v is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(v);
}

/** Slug de URL ↔ chave (URLs legíveis em pt-BR). */
export const CATEGORY_SLUG: Record<CategoryKey, string> = {
  custos_fixos: "custos-fixos",
  conforto: "conforto",
  metas: "metas",
  prazeres: "prazeres",
  liberdade_financeira: "liberdade-financeira",
  conhecimento: "conhecimento",
};

export function categoryFromSlug(slug: string): CategoryKey | null {
  const found = Object.entries(CATEGORY_SLUG).find(([, s]) => s === slug);
  return found ? (found[0] as CategoryKey) : null;
}

export const DEFAULT_TARGETS_BP: Record<CategoryKey, number> = {
  custos_fixos: 4000,
  conforto: 1000,
  metas: 1000,
  prazeres: 1000,
  liberdade_financeira: 2500,
  conhecimento: 500,
};

export const PAID_BY = ["pai", "mae", "conjunto"] as const satisfies readonly PaidBy[];
export const PAYMENT_METHODS = ["pix", "debito", "credito", "boleto", "dinheiro"] as const satisfies readonly PaymentMethod[];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  boleto: "Boleto",
  dinheiro: "Dinheiro",
};

export function paidByLabel(value: PaidBy, names: { pai: string; mae: string }): string {
  if (value === "conjunto") return "Conjunto";
  return value === "pai" ? names.pai : names.mae;
}
