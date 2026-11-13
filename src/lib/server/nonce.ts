import "server-only";
import { headers } from "next/headers";

export async function getNonce(): Promise<string> {
  return (await headers()).get("x-nonce") ?? "";
}

export function turnstileSiteKey(): string {
  return (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
}
