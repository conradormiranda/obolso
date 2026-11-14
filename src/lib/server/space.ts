import "server-only";
import type { User } from "@supabase/supabase-js";
import { isPersonal, parseSpace, type Space } from "@/lib/domain/space";

/** Espaço da URL e o owner_id correspondente (null = família). */
export function resolveSpace(value: string | string[] | undefined, user: User): { space: Space; ownerId: string | null } {
  const space = parseSpace(value);
  return { space, ownerId: isPersonal(space) ? user.id : null };
}
