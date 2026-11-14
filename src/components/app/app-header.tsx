"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_KEYS, CATEGORY_SLUG } from "@/lib/domain/categories";
import { CATEGORY_LABEL, CategoryIcon } from "./category-icon";
import { Logo } from "@/components/brand/logo";

/** Cabeçalho: marca (volta ao painel), ícones das 6 categorias e conta. Mantém o ?mes. */
export function AppHeader() {
  const pathname = usePathname();
  const params = useSearchParams();
  const mes = params.get("mes");
  const q = mes && /^\d{4}-\d{2}$/.test(mes) ? `?mes=${mes}` : "";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:px-6">
        <Link href={`/${q}`} className="mr-auto text-xl" aria-label="O Bolso, início">
          <Logo className="hidden sm:inline-flex" />
          <Logo className="sm:hidden [&>span:last-child]:sr-only" />
        </Link>
        <nav aria-label="Categorias" className="flex items-center gap-0.5 sm:gap-1">
          {CATEGORY_KEYS.map((key) => {
            const href = `/categoria/${CATEGORY_SLUG[key]}`;
            const active = pathname === href;
            return (
              <Link
                key={key}
                href={`${href}${q}`}
                aria-label={CATEGORY_LABEL[key]}
                title={CATEGORY_LABEL[key]}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full transition-colors sm:size-10",
                  active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <CategoryIcon category={key} className="size-[18px] sm:size-5" />
              </Link>
            );
          })}
        </nav>
        <Link
          href="/anual"
          aria-label="Visão anual"
          title="Visão anual"
          aria-current={pathname === "/anual" ? "page" : undefined}
          className={cn(
            "ml-1 hidden size-9 items-center justify-center rounded-full sm:flex sm:size-10",
            pathname === "/anual" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          <CalendarRange className="size-5" aria-hidden="true" />
        </Link>
        <Link
          href="/conta"
          aria-label="Minha conta"
          title="Minha conta"
          aria-current={pathname === "/conta" ? "page" : undefined}
          className={cn(
            "ml-1 flex size-9 items-center justify-center rounded-full sm:size-10",
            pathname === "/conta" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          <UserRound className="size-5" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
