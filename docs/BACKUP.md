# Backup e restauração

## Como funciona

| Item | Detalhe |
|---|---|
| Quando | Todo dia às 03:17 (Brasília), workflow **Backup diário (produção)**. Também roda sob demanda (Actions → Run workflow). |
| O quê | `pg_dump --data-only` de `public.*`, `app_private.*` (exceto `rate_limits`), `auth.users`, `auth.identities`, `auth.mfa_factors`. O schema não entra porque é recriado pelas migrations do repositório. |
| Criptografia | `gzip` + `age`, usando a chave **pública** em `backup/age-recipients.txt`. O dump em texto nunca sai do runner e é apagado com `shred`. |
| Destino | Bucket **privado** no Cloudflare R2, pasta `diario/`. Regra de ciclo de vida recomendada: apagar depois de 90 dias. |
| Chave privada | Existe **só com você**, no gerenciador de senhas. Não está no GitHub, na Vercel nem no R2. |
| Conferência | Cada execução publica no resumo do job a **contagem de linhas** por tabela (só números). |
| Falha | O GitHub manda e-mail ao dono do repositório quando um workflow agendado falha. |

## Teste de restauração

O workflow **Ensaio de restauração (DEV)** executa o procedimento inteiro contra o projeto de **dev**, nunca contra o de produção:

1. Faz o dump.
2. Criptografa com a chave pública de dev.
3. Descriptografa com a chave privada de dev, guardada no secret `DEV_AGE_IDENTITY`.
4. **Apaga** os dados do dev.
5. Restaura.
6. Compara as contagens de antes e depois.
7. Roda os testes de segurança para provar que o app voltou a funcionar.

Para rodar: Actions → *Ensaio de restauração (DEV)* → *Run workflow*, digitando `APAGAR-DEV`.

O par de chaves de dev é separado do de produção. Por isso a chave privada de dev pode ficar como secret do GitHub, e a de produção nunca precisa sair do seu gerenciador de senhas.

**Confirme também a chave de produção:** baixe um backup real do R2 e rode:

```bash
npx tsx scripts/backup/decrypt.ts ~/caminho/da/chave-PRODUCAO.txt obolso-AAAAMMDDTHHMMSSZ.sql.gz.age /tmp/obolso.sql
```

Depois de conferir, apague `/tmp/obolso.sql`, porque ele contém todos os dados da família.

## Restauração real (desastre)

1. Crie um projeto Supabase novo, de preferência na região `sa-east-1`.
2. Aplique o schema:
   ```bash
   npx supabase link --project-ref <REF_NOVO>
   npx supabase db push
   ```
3. Configure o Auth do projeto novo seguindo o [OPERACAO.md](OPERACAO.md), seção 2.
4. Baixe o backup mais recente do R2 e descriptografe com `scripts/backup/decrypt.ts` (veja acima).
5. Restaure os dados. Precisa do `psql` 17 instalado; se não tiver, use o mesmo passo do workflow de ensaio num runner. A variável `CONFIRM_REF` é uma trava: o script recusa rodar se a URL não for do projeto novo.
   ```bash
   TARGET_DB_URL='<connection string do Session pooler do projeto novo>' CONFIRM_REF=<REF_NOVO> \
     PG_BIN=/caminho/para/bin scripts/backup/restore.sh /tmp/obolso.sql
   ```
6. Atualize `SUPABASE_URL` e `SUPABASE_ANON_KEY` na Vercel e reimplante.
7. Rode `admin_set_rate_limit_secret` de novo com o `RATE_LIMIT_SECRET` atual. O hash do segredo fica em `app_private.config` e é restaurado junto, mas confira.
8. Apague o `.sql` em texto.

As senhas e os fatores de MFA dos usuários são restaurados com `auth.users` e `auth.mfa_factors`. Cada pessoa entra normalmente, com a mesma senha e o mesmo autenticador.
