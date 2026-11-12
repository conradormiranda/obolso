import { expect, test } from "@playwright/test";

test.describe("superfície pública", () => {
  test("cabeçalhos de segurança presentes", async ({ request }) => {
    const res = await request.get("/login", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const h = res.headers();
    const csp = h["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9_-]+'/);
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(h["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains; preload");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["x-robots-tag"]).toContain("noindex");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("nonce muda a cada requisição", async ({ request }) => {
    const a = (await request.get("/login")).headers()["content-security-policy"];
    const b = (await request.get("/login")).headers()["content-security-policy"];
    expect(a).not.toBe(b);
  });

  test("robots.txt bloqueia tudo e páginas têm noindex", async ({ request, page }) => {
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toMatch(/Disallow: \//);
    await page.goto("/login");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex.*nofollow/);
  });

  for (const path of ["/", "/mfa", "/mfa/configurar", "/mfa/recuperar", "/redefinir-senha", "/qualquer-coisa"]) {
    test(`sem sessão, ${path} redireciona para /login`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect([303, 307, 308]).toContain(res.status());
      expect(new URL(res.headers()["location"] ?? "", "http://x").pathname).toBe("/login");
    });
  }

  test("login carrega sem violações de CSP e com o captcha", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
    });
    await page.goto("/login");
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 20_000 });
    await page.screenshot({ path: "test-results/login-mobile.png", fullPage: true });
    expect(violations).toEqual([]);
  });

  test("não existe cadastro na interface", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Entrar" }).or(page.getByText("Entrar").first())).toBeVisible();
    const html = (await page.content()).toLowerCase();
    for (const word of ["cadastr", "criar conta", "sign up", "signup", "registr"]) {
      expect(html).not.toContain(word);
    }
  });

  test("Server Action com Origin de outro site é recusada", async ({ request }) => {
    const res = await request.post("/login", {
      headers: { Origin: "https://evil.example", "Next-Action": "0".repeat(40), "Content-Type": "text/plain" },
      data: "[]",
      maxRedirects: 0,
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
