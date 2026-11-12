import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { CATEGORY_SLUG } from "@/lib/domain/categories";
import type { Duplicate } from "@/lib/domain/text";
import type { CategoryKey } from "@/lib/supabase/database.types";

/** Alerta: mesma descrição em mais de uma categoria no mês. */
export function DuplicateAlert({
  duplicates,
  names,
  month,
}: {
  duplicates: Duplicate[];
  names: Record<CategoryKey, string>;
  month: string;
}) {
  if (duplicates.length === 0) return null;
  return (
    <section role="alert" className="rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-warning">
        <TriangleAlert className="size-4" aria-hidden="true" />
        Possível lançamento duplicado
      </p>
      <ul className="mt-2 space-y-1">
        {duplicates.map((d) => (
          <li key={d.description}>
            <strong>{d.description}</strong> aparece em{" "}
            {d.categories.map((c, i) => (
              <span key={c}>
                {i > 0 ? (i === d.categories.length - 1 ? " e " : ", ") : null}
                <Link href={`/categoria/${CATEGORY_SLUG[c]}?mes=${month}`} className="underline underline-offset-2">
                  {names[c]}
                </Link>
              </span>
            ))}
            .
          </li>
        ))}
      </ul>
    </section>
  );
}
