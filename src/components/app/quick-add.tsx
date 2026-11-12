"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/auth/form-bits";
import { saveExpenseAction } from "@/lib/actions/budget";
import { idleState } from "@/lib/actions/form-state";
import { maskBrlDigits } from "@/lib/domain/brl-mask";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, categoryFromSlug } from "@/lib/domain/categories";
import { currentMonth, defaultEntryDate, monthParam, parseMonthParam } from "@/lib/domain/month";
import { filterSuggestions, findSuggestion, type Suggestion } from "@/lib/domain/text";
import type { CategoryKey, PaidBy } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";

const FAMILY_TAGS = ["Filho", "Casa", "Saúde"] as const;

type Props = {
  categories: { key: CategoryKey; name: string; color: string }[];
  payers: { value: PaidBy; label: string }[];
  defaultPayer: PaidBy;
  suggestions: Suggestion[];
};

/**
 * Lançamento rápido (botão "+" em todas as telas). Caminho típico em 4 toques:
 *   [+] → digita valor (teclado numérico, já focado) → [descrição] digita →
 *   [sugestão] (preenche descrição e categoria da última vez) → [Salvar].
 * Data, pagamento, tags e observação ficam em "Mais opções" (data padrão = hoje).
 */
export function QuickAdd(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Novo lançamento"
        className="fixed bottom-6 right-5 z-40 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-black/40 transition-transform active:scale-95 md:bottom-8 md:right-8"
      >
        <Plus className="size-8" aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo lançamento</DialogTitle>
            <DialogDescription className="sr-only">Valor, descrição, categoria e quem pagou.</DialogDescription>
          </DialogHeader>
          {open ? <QuickAddForm {...props} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuickAddForm({ categories, payers, defaultPayer, suggestions, onDone }: Props & { onDone: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const ref = parseMonthParam(params.get("mes")) ?? currentMonth();
  const routeCategory = pathname.startsWith("/categoria/") ? categoryFromSlug(pathname.split("/")[2] ?? "") : null;

  const [state, action] = useActionState(saveExpenseAction, idleState);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryKey | null>(routeCategory);
  const [paidBy, setPaidBy] = useState<PaidBy>(defaultPayer);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tags, setTags] = useState("");
  const descRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => filterSuggestions(suggestions, description), [suggestions, description]);

  useEffect(() => {
    if (state.status === "success") onDone();
  }, [state, onDone]);

  function pickSuggestion(s: Suggestion) {
    setDescription(s.description);
    setCategory(s.categoryKey);
    setShowSuggestions(false);
  }

  function addTag(tag: string) {
    const list = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!list.includes(tag)) setTags([...list, tag].join(", "));
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="month" value={monthParam(ref)} />
      <input type="hidden" name="returnTo" value="stay" />

      <label className="block">
        <span className="text-sm font-medium">Valor</span>
        <span className="mt-1 flex items-center gap-2 rounded-lg border border-input px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <span className="text-lg text-muted-foreground" aria-hidden="true">
            R$
          </span>
          <input
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="0,00"
            aria-label="Valor em reais"
            value={amount}
            onChange={(e) => setAmount(maskBrlDigits(e.target.value))}
            className="h-14 w-full bg-transparent text-3xl font-bold tabular-nums outline-none"
          />
        </span>
      </label>

      <div className="relative">
        <label htmlFor="qa-description" className="text-sm font-medium">
          Descrição
        </label>
        <Input
          ref={descRef}
          id="qa-description"
          name="description"
          autoComplete="off"
          maxLength={120}
          role="combobox"
          aria-expanded={showSuggestions && matches.length > 0}
          aria-controls="qa-suggestions"
          aria-autocomplete="list"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setShowSuggestions(true);
          }}
          onBlur={() => {
            const exact = findSuggestion(suggestions, description);
            if (exact && !category) setCategory(exact.categoryKey);
          }}
          className="mt-1 h-12 text-base"
        />
        {showSuggestions && matches.length > 0 ? (
          <ul
            id="qa-suggestions"
            role="listbox"
            aria-label="Sugestões de lançamentos anteriores"
            className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
          >
            {matches.map((s) => (
              <li key={s.description} role="option" aria-selected="false">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(s)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left hover:bg-muted"
                >
                  <span className="truncate">{s.description}</span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <CategoryIcon category={s.categoryKey} className="size-3.5" />
                    {categories.find((c) => c.key === s.categoryKey)?.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Categoria</legend>
        <div className="mt-1 grid grid-cols-6 gap-1.5">
          {categories.map((c) => (
            <label key={c.key} className="cursor-pointer" title={c.name}>
              <input
                type="radio"
                name="category"
                value={c.key}
                checked={category === c.key}
                onChange={() => setCategory(c.key)}
                className="peer sr-only"
                aria-label={c.name}
              />
              <span
                className="flex h-12 items-center justify-center rounded-lg border border-input peer-checked:border-transparent peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
                style={category === c.key ? { background: c.color, color: "#1A1A1A" } : { color: c.color }}
              >
                <CategoryIcon category={c.key} className="size-5" />
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1 h-4 text-xs text-muted-foreground" aria-live="polite">
          {category ? categories.find((c) => c.key === category)?.name : "Escolha a categoria"}
        </p>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Quem pagou</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {payers.map((p) => (
            <label key={p.value} className="cursor-pointer">
              <input
                type="radio"
                name="paidBy"
                value={p.value}
                checked={paidBy === p.value}
                onChange={() => setPaidBy(p.value)}
                className="peer sr-only"
              />
              <span className="flex h-11 items-center justify-center rounded-lg border border-input px-2 text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                {p.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer py-1 text-sm font-medium">Mais opções</summary>
        <div className="space-y-3 pb-2 pt-3">
          <label className="block text-sm font-medium">
            Data
            <Input name="expenseDate" type="date" defaultValue={defaultEntryDate(ref)} className="mt-1 h-11 text-base" />
          </label>
          <label className="block text-sm font-medium">
            Pagamento
            <select
              name="paymentMethod"
              defaultValue="pix"
              className="mt-1 h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <div>
            <label className="block text-sm font-medium">
              Tags
              <Input
                name="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="separadas por vírgula"
                maxLength={400}
                className="mt-1 h-11 text-base"
              />
            </label>
            <div className="mt-2 flex gap-2">
              {FAMILY_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-medium">
            Observação
            <textarea
              name="notes"
              maxLength={1000}
              rows={2}
              className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base"
            />
          </label>
        </div>
      </details>

      <FormMessage state={state} />
      <div className={cn(!category && "opacity-90")}>
        <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
      </div>
    </form>
  );
}
