"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_KEYS, CATEGORY_SLUG } from "@/lib/domain/categories";
import { SPACE_LABEL, parseSpace, spaceHref, type Space } from "@/lib/domain/space";
import { CATEGORY_LABEL, CategoryIcon } from "./category-icon";
import { Logo } from "@/components/brand/logo";

/** Cabeçalho: marca (volta ao painel), ícones das 6 categorias e conta. Mantém o ?mes. */
export function AppHeader() {
  const pathname = usePathname();
  const params = useSearchParams();
  const mesRaw = params.get("mes");
  const mes = mesRaw && /^\d{4}-\d{2}$/.test(mesRaw) ? mesRaw : null;
  const espaco = parseSpace(params.get("espaco"));
  const link = (path: string, space: Space = espaco) => spaceHref(path, { mes, espaco: space });
  // Telas que têm versão família e pessoal (as demais não mostram a chave).
  const spaceAware = pathname === "/" || pathname.startsWith("/categoria/") || ["/renda", "/anual", "/recorrentes", "/lancamento/novo"].includes(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:px-6">
        <Link href={link("/")} className="mr-auto text-xl" aria-label="O Bolso, início">
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
                href={link(href)}
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
          href={link("/anual")}
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
      {spaceAware ? (
        <nav aria-label="Espaço do orçamento" className="mx-auto flex max-w-6xl gap-1 px-4 pb-2 md:px-6">
          {(["familia", "pessoal"] as const).map((sp) => (
            <Link
              key={sp}
              href={link(pathname, sp)}
              aria-current={espaco === sp ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                espaco === sp ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {SPACE_LABEL[sp]}
              {sp === "pessoal" ? <span className="sr-only"> (só você vê)</span> : null}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
