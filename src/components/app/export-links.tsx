import { Download } from "lucide-react";
import { spaceHref, type Space } from "@/lib/domain/space";

/** Links de download (GET autenticado, resposta com Content-Disposition). */
export function ExportLinks({ period, label, espaco }: { period: string; label: string; espaco: Space }) {
  const cls =
    "inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted";
  return (
    <div className="flex flex-wrap gap-2" aria-label={`Exportar ${label}`}>
      <a href={spaceHref("/exportar", { periodo: period, formato: "csv", espaco })} className={cls} download>
        <Download className="size-4" aria-hidden="true" /> CSV
      </a>
      <a href={spaceHref("/exportar", { periodo: period, formato: "xlsx", espaco })} className={cls} download>
        <Download className="size-4" aria-hidden="true" /> XLSX
      </a>
    </div>
  );
}
