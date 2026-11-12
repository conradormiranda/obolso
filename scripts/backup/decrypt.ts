/**
 * Descriptografa um backup baixado do R2, sem precisar instalar o `age`.
 *   npx tsx scripts/backup/decrypt.ts <chave-privada> <obolso-....sql.gz.age> <saida.sql>
 * O .sql resultante contém TODOS os dados da família: apague-o depois de usar.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Decrypter } from "age-encryption";

async function main() {
  const [keyPath, inPath, outPath] = process.argv.slice(2);
  if (!keyPath || !inPath || !outPath) {
    console.error("Uso: decrypt.ts <chave-privada> <arquivo.sql.gz.age> <saida.sql>");
    process.exit(1);
  }
  const identity = readFileSync(keyPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("AGE-SECRET-KEY-"));
  if (!identity) {
    console.error("Chave privada não encontrada no arquivo.");
    process.exit(1);
  }
  const d = new Decrypter();
  d.addIdentity(identity);
  const gz = await d.decrypt(new Uint8Array(readFileSync(inPath)));
  const sql = gunzipSync(gz);
  writeFileSync(outPath, sql, { mode: 0o600 });
  const tables = (sql.toString("utf8").match(/^COPY /gm) ?? []).length;
  console.log(`OK: ${tables} tabelas descriptografadas em ${outPath}. Apague o arquivo depois de usar.`);
}

void main();
