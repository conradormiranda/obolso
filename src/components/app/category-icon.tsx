import { Car, DollarSign, GraduationCap, House, Target, Wine, type LucideProps } from "lucide-react";
import type { CategoryKey } from "@/lib/supabase/database.types";

const ICONS: Record<CategoryKey, React.ComponentType<LucideProps>> = {
  custos_fixos: House,
  conforto: Car,
  metas: Target,
  prazeres: Wine,
  liberdade_financeira: DollarSign,
  conhecimento: GraduationCap,
};

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  custos_fixos: "Custos fixos",
  conforto: "Conforto",
  metas: "Metas",
  prazeres: "Prazeres",
  liberdade_financeira: "Liberdade financeira",
  conhecimento: "Conhecimento",
};

export function CategoryIcon({ category, ...props }: { category: CategoryKey } & LucideProps) {
  const Icon = ICONS[category];
  return <Icon aria-hidden="true" {...props} />;
}
