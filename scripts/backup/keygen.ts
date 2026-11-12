/**
 * Gera um par de chaves age (formato padrão, compatível com o `age` CLI).
 *   npx tsx scripts/backup/keygen.ts <arquivo-da-chave-privada> <arquivo-de-recipients-no-repo>
 * A chave PRIVADA é gravada fora do repositório com permissão 600 e nunca é impressa.
 * A chave PÚBLICA é gravada no arquivo de recipients (versionado).
 */
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateIdentity, identityToRecipient } from "age-encryption";

async function main() {
  const [privPath, pubPath] = process.argv.slice(2);
  if (!privPath || !pubPath) {
    console.error("Uso: keygen.ts <chave-privada-fora-do-repo> <recipients-no-repo>");
    process.exit(1);
  }
  const priv = resolve(privPath);
  if (priv.startsWith(resolve("."))) {
    console.error("A chave privada não pode ficar dentro do repositório.");
    process.exit(1);
  }
  if (existsSync(priv)) {
    console.error("Já existe um arquivo nesse caminho; não vou sobrescrever.");
    process.exit(1);
  }
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  writeFileSync(priv, `# O Bolso — chave privada de backup (age). Guarde no gerenciador de senhas.\n# public key: ${recipient}\n${identity}\n`, {
    mode: 0o600,
  });
  writeFileSync(resolve(pubPath), `${recipient}\n`);
  console.log(`Chave pública: ${recipient}`);
  console.log(`Chave privada gravada em: ${priv}`);
}

void main();
