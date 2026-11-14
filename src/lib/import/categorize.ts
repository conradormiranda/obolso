import { CONSUMPTION, consumptionFromText, type ConsumptionKey } from "@/lib/domain/consumption";
import { normalizeText } from "@/lib/domain/text";
import type { CategoryKey } from "@/lib/supabase/database.types";

/**
 * Sugestão para compras da fatura, SEM serviços externos:
 * 1) histórico (mesmo estabelecimento já lançado antes: mesma seção e tipo);
 * 2) regras de palavras-chave → tipo de consumo → seção padrão do tipo;
 * 3) senão, fica para o usuário escolher na revisão.
 */

export type Suggestion = {
  section: CategoryKey | null;
  consumption: ConsumptionKey | null;
  source: "historico" | "regra" | null;
};

export type HistoryEntry = { section: CategoryKey; consumption: ConsumptionKey | null };

/** Normaliza nome de estabelecimento: tira prefixos de adquirentes, números e símbolos. */
export function merchantKey(description: string): string {
  return normalizeText(description)
    .replace(/^(ifd|mp|mercadopago|pag|pagseguro|ec|ppro|pp|dl|ebanx|paypal|sumup|stone|zp|ton|htm|pg)\s*\*\s*/, "")
    .replace(/[*#]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestCategory(description: string, history: ReadonlyMap<string, HistoryEntry>): Suggestion {
  const byRule = consumptionFromText(description);
  const key = merchantKey(description);
  if (key) {
    let hit = history.get(key);
    if (!hit) {
      // Mesmo estabelecimento com variação no fim (filial, cidade): primeiras 2 palavras.
      const head = key.split(" ").slice(0, 2).join(" ");
      if (head.length >= 4) {
        for (const [k, v] of history) {
          if (k.startsWith(head)) {
            hit = v;
            break;
          }
        }
      }
    }
    if (hit) return { section: hit.section, consumption: hit.consumption ?? byRule, source: "historico" };
  }
  if (byRule) return { section: CONSUMPTION[byRule].section, consumption: byRule, source: "regra" };
  return { section: null, consumption: null, source: null };
}

/** Histórico: estabelecimento normalizado → o lançamento mais recente dele. */
export function buildHistory(
  recentFirst: readonly { description: string; categoryKey: CategoryKey; consumption?: ConsumptionKey | null }[],
): Map<string, HistoryEntry> {
  const map = new Map<string, HistoryEntry>();
  for (const it of recentFirst) {
    const k = merchantKey(it.description);
    if (k && !map.has(k)) map.set(k, { section: it.categoryKey, consumption: it.consumption ?? null });
  }
  return map;
}

type DupItem = {
  date: string;
  description: string;
  amountCents: number;
  installment?: { number: number; total: number } | null;
};

/**
 * Provável duplicado: mesmo valor e nome parecido, e
 *  - parcela: mesma parcela (n/T), qualquer data (a fatura mostra a data da compra);
 *  - à vista: data até 3 dias de diferença.
 */
export function isLikelyDuplicate(line: DupItem, existing: readonly DupItem[]): boolean {
  const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
  const a = merchantKey(line.description).split(" ").slice(0, 2).join(" ");
  return existing.some((e) => {
    if (e.amountCents !== line.amountCents) return false;
    const b = merchantKey(e.description).split(" ").slice(0, 2).join(" ");
    const similar = a.length === 0 || b.length === 0 || a === b || a.startsWith(b) || b.startsWith(a);
    if (!similar) return false;
    if (line.installment) {
      return e.installment?.number === line.installment.number && e.installment.total === line.installment.total;
    }
    return Math.abs(day(e.date) - day(line.date)) <= 3;
  });
}
