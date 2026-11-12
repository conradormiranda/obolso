import { describe, expect, it } from "vitest";
import { checkPwnedPassword } from "@/lib/security/hibp";
import { sha1HexUpper } from "@/lib/security/crypto";

function fakeFetch(body: string, ok = true, seen: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(body, { status: ok ? 200 : 503 });
  }) as typeof fetch;
}

describe("HIBP k-anonymity", () => {
  it("envia só o prefixo de 5 caracteres e detecta senha vazada", async () => {
    const hash = await sha1HexUpper("password123456");
    const seen: string[] = [];
    const body = `0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:42\r\n`;
    expect(await checkPwnedPassword("password123456", fakeFetch(body, true, seen))).toBe("pwned");
    expect(seen).toEqual([`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`]);
    expect(seen[0]).not.toContain(hash.slice(5));
  });

  it("senha não listada (ou só no padding com contagem 0) é aceita", async () => {
    const hash = await sha1HexUpper("uma frase bem longa e unica");
    expect(await checkPwnedPassword("uma frase bem longa e unica", fakeFetch(`${hash.slice(5)}:0\n`))).toBe("clean");
  });

  it("indisponibilidade do serviço é reportada (chamador falha fechado)", async () => {
    expect(await checkPwnedPassword("qualquer coisa aqui", fakeFetch("", false))).toBe("unavailable");
  });
});
