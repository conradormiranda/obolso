import { Input } from "@/components/ui/input";

/** "Parcela [n] de [total]" — deixe vazio para compra à vista. */
export function InstallmentFields({ number = "", total = "" }: { number?: string; total?: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Compra parcelada? (deixe vazio se for à vista)</legend>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span>Parcela</span>
        <Input
          name="installmentNumber"
          inputMode="numeric"
          maxLength={3}
          defaultValue={number}
          placeholder="1"
          aria-label="Parcela atual"
          className="h-11 w-16 text-center text-base tabular-nums"
        />
        <span>de</span>
        <Input
          name="installmentTotal"
          inputMode="numeric"
          maxLength={3}
          defaultValue={total}
          placeholder="10"
          aria-label="Total de parcelas"
          className="h-11 w-16 text-center text-base tabular-nums"
        />
      </div>
    </fieldset>
  );
}
