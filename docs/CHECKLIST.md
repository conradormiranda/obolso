# Checklist final de aceite

Legenda: ✅ verificado, com evidência · ⏳ depende da publicação em produção.
Evidências de 12/11/2026, contra o projeto Supabase de **dev**. Onde a coluna diz "⏳ produção", o mesmo item precisa ser conferido de novo depois do deploy.

| # | Item | Status | Evidência |
|---|---|---|---|
| 1 | Não existe nenhuma forma de criar conta nova (UI e API testadas) | ✅ | Testes de segurança "cadastro bloqueado": `signUp` recusado, inclusive com e-mail da família; criação pela **API admin** recusada pelo trigger em `auth.users`. E2E "não existe cadastro na interface" e redirect de `/cadastro`. |
| 2 | Apenas os 2 e-mails conseguem entrar, e só com MFA | ✅ | E2E: usuário fora da allowlist recebe "E-mail ou senha inválidos". Segurança: intruso com MFA não lê nada; membro em `aal1` não lê nada. Middleware e `requireMember` exigem `aal2`. |
| 3 | RLS ativo e testado em 100% das tabelas | ✅ | Teste `security_rls_report`: todas as tabelas de `public` e `app_private` têm RLS **habilitado e forçado**, `public` com políticas e zero GRANT para `anon`. |
| 4 | `service_role` ausente do frontend, do repositório e da Vercel | ✅ / ⏳ | `src/` tem 0 ocorrências. O bundle do cliente (`.next/static`) não contém chave nem `service_role`. O repositório não tem segredos versionados. O navegador não recebe **nenhuma** chave do Supabase. **⏳ Vercel:** conferir a lista de variáveis depois de configurar. |
| 5 | Cabeçalhos de segurança verificados (securityheaders.com nota A ou superior) | ✅ / ⏳ | E2E confere CSP com nonce (sem `unsafe-inline`/`unsafe-eval` em scripts), HSTS com preload, XFO DENY, nosniff, Referrer-Policy, Permissions-Policy e X-Robots-Tag. **⏳** Rodar securityheaders.com em https://obolso.com.br. |
| 6 | Rate limit e captcha funcionando no login e na recuperação de senha | ✅ / ⏳ | E2E: a 6ª tentativa de login em 15 min é bloqueada, mesmo com a senha certa. Segurança: RPC sem o segredo é recusada e o bloqueio acontece na 6ª chamada. O Turnstile é validado no servidor (hostname e action). **⏳** Turnstile com chave real e recuperação de senha com e-mail real em produção. |
| 7 | Valores monetários em centavos inteiros em todo o sistema | ✅ | Colunas `bigint` com `CHECK > 0 e ≤ 10¹¹`. Nenhum `float`/`numeric` nas migrations. Parsing BRL, cálculos (BigInt) e exportação feitos com inteiros e testados. |
| 8 | Divisão por zero tratada ("sem meta") | ✅ | Unitários "CORREÇÃO DO BUG". E2E: mês novo com renda zero mostra 7× "sem meta" e nenhum "100%". |
| 9 | Backup diário rodando e restauração testada | ⏳ | Workflows `backup.yml` (diário, `pg_dump` → age → R2) e `restore-drill.yml` (apagar e restaurar o dev, comparar contagens, testes). A criptografia com as chaves geradas foi testada nos dois sentidos. **Falta:** repositório no GitHub, R2 e a primeira execução de cada workflow. |
| 10 | Auditoria registrando criação, edição e exclusão | ✅ | Segurança: INSERT, SOFT_DELETE e RESTORE registrados com o autor certo; UPDATE/DELETE no log recusados até para a `service_role`. E2E: a tela de Auditoria mostra os lançamentos. |
| 11 | Site não indexável por buscadores | ✅ | E2E: `robots.txt` com `Disallow: /`, meta `noindex, nofollow` e `X-Robots-Tag`. |
| 12 | Lançamento rápido em até 4 toques no celular | ✅ | E2E "lançamento rápido em até 4 toques" (Pixel 7): "+", descrição, sugestão, Salvar. O valor é digitado no teclado numérico, que já abre focado. |

## Itens a fechar na publicação

- [ ] Variáveis da Vercel conferidas (nenhuma `service_role`)
- [ ] securityheaders.com: nota ___
- [ ] Login real com Turnstile de produção
- [ ] Recuperação de senha com e-mail real (Resend)
- [ ] Alerta de login em dispositivo novo recebido
- [ ] Primeiro backup no R2: arquivo ___, contagens ___
- [ ] Backup de produção descriptografado com a chave privada (`decrypt.ts`)
- [ ] Ensaio de restauração (DEV): contagens idênticas e testes verdes
- [ ] App instalado na tela inicial do celular (Android e iPhone)
