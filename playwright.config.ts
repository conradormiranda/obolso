import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.test.local", quiet: true });

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E contra o build de produção (`next start`), apontando para o Supabase de DEV
 * e para as chaves de TESTE do Turnstile.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure", locale: "pt-BR" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Sem Supabase de dev configurado, valores fictícios permitem testar a
      // superfície pública (nenhuma chamada ao Supabase acontece sem sessão).
      SUPABASE_URL: process.env.SUPABASE_URL ?? "https://placeholder.supabase.co",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "placeholder-anon-key-for-public-tests",
      SESSION_SECRET: process.env.SESSION_SECRET ?? "e2e-session-secret-0123456789abcdef0123",
      RATE_LIMIT_SECRET: process.env.RATE_LIMIT_SECRET ?? "e2e-rate-limit-secret-0123456789abcdef",
      ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? "e2e-pai@example.com,e2e-mae@example.com",
      APP_ORIGIN: baseURL,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    },
  },
});
