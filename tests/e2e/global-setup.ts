import { mkdirSync, writeFileSync } from "node:fs";
import { ensureFixtures, hasTestEnv } from "../support/fixtures";

/** Prepara usuários de teste no projeto de DEV e grava as credenciais em arquivo ignorado pelo git. */
export default async function globalSetup() {
  mkdirSync("tests/.tmp", { recursive: true });
  if (!hasTestEnv()) {
    writeFileSync("tests/.tmp/fixtures.json", JSON.stringify(null));
    return;
  }
  const fx = await ensureFixtures();
  writeFileSync("tests/.tmp/fixtures.json", JSON.stringify(fx), { mode: 0o600 });
}
