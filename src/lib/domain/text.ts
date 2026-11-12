import type { CategoryKey } from "@/lib/supabase/database.types";

/** Normaliza para comparação: minúsculas, sem acentos, espaços simples. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type Duplicate = { description: string; categories: CategoryKey[] };

/**
 * Alerta de duplicidade: a mesma descrição em DUAS OU MAIS categorias no mesmo
 * mês (ex.: uma assinatura lançada em Custos fixos e em Conforto).
 */
export function findDuplicates(items: readonly { description: string; categoryKey: CategoryKey }[]): Duplicate[] {
  const map = new Map<string, { description: string; categories: Set<CategoryKey> }>();
  for (const it of items) {
    const k = normalizeText(it.description);
    const entry = map.get(k) ?? { description: it.description, categories: new Set<CategoryKey>() };
    entry.categories.add(it.categoryKey);
    map.set(k, entry);
  }
  return [...map.values()]
    .filter((e) => e.categories.size > 1)
    .map((e) => ({ description: e.description, categories: [...e.categories] }))
    .sort((a, b) => a.description.localeCompare(b.description, "pt-BR"));
}

export type Suggestion = { description: string; categoryKey: CategoryKey };

/** Lista de sugestões a partir dos lançamentos mais recentes primeiro (categoria da última vez). */
export function buildSuggestions(
  recentFirst: readonly { description: string; categoryKey: CategoryKey }[],
  max = 300,
): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const it of recentFirst) {
    const k = normalizeText(it.description);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ description: it.description, categoryKey: it.categoryKey });
    if (out.length >= max) break;
  }
  return out;
}

/** Filtra sugestões: começa com o texto primeiro, depois contém. */
export function filterSuggestions(list: readonly Suggestion[], query: string, limit = 6): Suggestion[] {
  const q = normalizeText(query);
  if (q.length < 1) return [];
  const starts: Suggestion[] = [];
  const contains: Suggestion[] = [];
  for (const s of list) {
    const n = normalizeText(s.description);
    if (n === q) continue;
    if (n.startsWith(q)) starts.push(s);
    else if (n.includes(q)) contains.push(s);
  }
  return [...starts, ...contains].slice(0, limit);
}

export function findSuggestion(list: readonly Suggestion[], description: string): Suggestion | undefined {
  const q = normalizeText(description);
  return list.find((s) => normalizeText(s.description) === q);
}
