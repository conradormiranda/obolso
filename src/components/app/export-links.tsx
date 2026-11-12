import { Download } from "lucide-react";

/** Links de download (GET autenticado, resposta com Content-Disposition). */
export function ExportLinks({ period, label }: { period: string; label: string }) {
  const cls =
    "inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted";
  return (
    <div className="flex flex-wrap gap-2" aria-label={`Exportar ${label}`}>
      <a href={`/exportar?periodo=${period}&formato=csv`} className={cls} download>
        <Download className="size-4" aria-hidden="true" /> CSV
      </a>
      <a href={`/exportar?periodo=${period}&formato=xlsx`} className={cls} download>
        <Download className="size-4" aria-hidden="true" /> XLSX
      </a>
    </div>
  );
}
