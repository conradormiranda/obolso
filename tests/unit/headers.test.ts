import { describe, expect, it } from "vitest";
import { buildCsp, staticSecurityHeaders } from "@/lib/security/headers";

function directive(csp: string, name: string): string {
  return csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
}

describe("CSP", () => {
  const prod = buildCsp("abc123", false, true);

  it("scripts só com nonce, sem unsafe-inline/unsafe-eval em produção", () => {
    const scripts = directive(prod, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("unsafe-inline");
    expect(scripts).not.toContain("unsafe-eval");
  });

  it("bloqueia framing, plugins e base-uri; navegador não acessa terceiros", () => {
    expect(directive(prod, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(prod, "object-src")).toBe("object-src 'none'");
    expect(directive(prod, "base-uri")).toBe("base-uri 'none'");
    expect(directive(prod, "connect-src")).toBe("connect-src 'self'");
    expect(prod).toContain("upgrade-insecure-requests");
  });

  it("unsafe-eval só em desenvolvimento", () => {
    expect(directive(buildCsp("n", true), "script-src")).toContain("'unsafe-eval'");
  });
});

describe("cabeçalhos estáticos", () => {
  const h = Object.fromEntries(staticSecurityHeaders.map((x) => [x.key, x.value]));
  it("contém todos os cabeçalhos exigidos", () => {
    expect(h["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains; preload");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/);
    expect(h["X-Robots-Tag"]).toContain("noindex");
  });
});
