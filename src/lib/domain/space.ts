/**
 * Espaço do orçamento: "familia" (compartilhado) ou "pessoal" (só do usuário logado).
 * Na URL: ?espaco=pessoal (família é o padrão e não aparece na URL).
 * A separação real é garantida pelo banco (RLS por owner_id); isto é só navegação.
 */
export type Space = "familia" | "pessoal";

export function parseSpace(value: string | string[] | null | undefined): Space {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "pessoal" ? "pessoal" : "familia";
}

export function isPersonal(space: Space): boolean {
  return space === "pessoal";
}

/** Monta um link preservando mês e espaço. */
export function spaceHref(
  path: string,
  params: { mes?: string | null; espaco?: Space; [key: string]: string | null | undefined },
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    if (k === "espaco" && v === "familia") continue;
    sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

export const SPACE_LABEL: Record<Space, string> = { familia: "Família", pessoal: "Pessoal" };
