"use client";

import { useSearchParams } from "next/navigation";
import { parseSpace, type Space } from "@/lib/domain/space";

export function useSpace(): Space {
  return parseSpace(useSearchParams().get("espaco"));
}

/** Campo oculto com o espaço atual (família/pessoal), para os formulários. */
export function SpaceField() {
  return <input type="hidden" name="espaco" value={useSpace()} />;
}
