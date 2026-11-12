# Segurança do O Bolso

Plataforma privada de orçamento doméstico, com exatamente 2 usuários, exposta na internet. Referência: OWASP ASVS nível 2.
Este documento registra **cada decisão de segurança** e o motivo dela. Atualize-o em toda mudança relevante.

## 1. Modelo de ameaças (resumo)

| Ameaça | Mitigação principal |
|---|---|
| Alguém cria conta e acessa os dados | Cadastro desativado + trigger em `auth.users` + hook `before_user_created` + allowlist em 3 camadas |
| Senha vazada ou adivinhada | MFA TOTP obrigatório, rate limit progressivo, Turnstile, checagem HIBP |
| Sessão roubada | Cookies `httpOnly`/`Secure`/`SameSite=Lax`, JWT de 10 min, expiração de 30 min por inatividade e de 7 dias no total, "sair de todos os dispositivos" |
| Acesso direto à API do Supabase com a anon key | RLS forçado em todas as tabelas, com exigência de `aal2` e de pertencer ao household. O navegador nem recebe a anon key |
| XSS | CSP com nonce (sem `unsafe-inline`/`unsafe-eval` em scripts), React escapa a saída e entradas com `<`/`>` são rejeitadas no servidor e no banco |
| CSRF / clickjacking | Checagem explícita de `Origin` + checagem nativa das Server Actions, `SameSite=Lax`, `frame-ancestors 'none'` e `X-Frame-Options: DENY` |
| Adulteração de histórico | `audit_log` append-only, preenchido por triggers. UPDATE/DELETE/TRUNCATE bloqueados até para a `service_role` |
| Perda de dados | Exclusão lógica (30 dias). Backup diário criptografado com `age` (Fase 5) |

## 2. Autenticação

- **Cadastro desativado** em 4 camadas:
  1. `enable_signup = false` no Supabase Auth.
  2. Trigger `obolso_enforce_allowed_email` (`BEFORE INSERT OR UPDATE OF email` em `auth.users`) recusa qualquer e-mail fora de `app_private.allowed_emails`, venha de signup, convite, OAuth ou **API admin** (testado). O hook `before_user_created` também está ativo, mas os testes mostraram que ele **não** cobre a API admin; por isso existe o trigger.
  3. Nenhuma rota, botão ou formulário de cadastro no app (testado no E2E).
  4. Mesmo que um usuário fosse criado, ele não está em `household_members`: o middleware faz logout e o RLS não entrega nada.
- **Criação dos 2 usuários**: `scripts/setup-household.ts`, rodado localmente uma única vez com a `service_role` passada só como variável do shell. A senha inicial é aleatória e descartada; cada pessoa define a sua pelo fluxo de recuperação.
- **Allowlist em 3 camadas** (defesa em profundidade):
  1. Tabela `household_members` (no máximo 2 linhas, garantido por `unique(household_id, role)` + household único).
  2. Middleware: `am_i_member()` a cada requisição. Quem não é membro sofre logout forçado e vai para `/acesso-negado`.
  3. RLS: toda política chama `app_private.is_member_aal2(household_id)`.
- **MFA TOTP obrigatório**: sem `aal2`, o middleware só libera `/mfa`, `/mfa/configurar` e `/mfa/recuperar`. O RLS também exige `aal2`, então uma sessão `aal1` não lê nada mesmo chamando a API diretamente (testado).
- **Códigos de recuperação**: 10 códigos (~49 bits cada), gerados no banco (`gen_random_bytes`) e guardados só como SHA-256 em `app_private`. São gerados na página `/mfa/codigos` (exige `aal2`) e exibidos uma única vez. A página inicial obriga quem não tem códigos a gerá-los. Cadastrar um autenticador novo invalida os códigos anteriores. Ao usar um código, o fator TOTP é removido (testado no Supabase de dev), o usuário configura um novo e recebe um e-mail de alerta.
- **Redirects de Server Actions** renderizam o destino sem passar pelo middleware. Por isso as páginas de MFA e de nova senha repetem a mesma regra de acesso no servidor (`src/lib/server/mfa.ts`), e a página inicial usa `requireMember` (aal2).
- **Senha**: mínimo de 12 caracteres, máximo de 72 bytes (limite do bcrypt) e nenhuma regra de composição. O app checa no **Have I Been Pwned por k-anonymity**: só os 5 primeiros caracteres do SHA-1 saem do servidor. Se o HIBP estiver fora do ar, a troca é recusada (falha fechada). A proteção de senha vazada nativa do Supabase exige plano Pro, por isso a checagem é feita no app.
- **Login**: a mensagem é sempre "E-mail ou senha inválidos.", inclusive para quem está fora da allowlist. A resposta tem tempo mínimo de 700 ms para reduzir o vazamento por timing.
- **Turnstile**: validado no servidor (`siteverify`), conferindo `hostname` e `action`. A chave de teste da Cloudflare só é aceita quando `APP_ORIGIN` é localhost. **O captcha nativo do Supabase Auth fica DESLIGADO**: o token do Turnstile é de uso único e já é consumido na validação do app.
- **Rate limit** (tabela Postgres `app_private.rate_limits`, função `rate_limit_hit`):
  - Login: 5 tentativas a cada 15 min por IP **e** por e-mail. MFA: 5 por usuário e 10 por IP. Recuperação: 5 por IP e 3 por e-mail.
  - Bloqueio progressivo: 15 min, 30, 60… até no máximo 24 h. A progressão zera depois de 24 h sem bloqueio.
  - Chaves = HMAC-SHA256(`RATE_LIMIT_SECRET`, escopo:valor): o banco nunca vê IP ou e-mail em claro.
  - A RPC exige o segredo (o banco guarda só o SHA-256 dele), então ninguém consegue zerar ou mirar o contador de outra pessoa pela API pública.
  - Falha fechada: se o banco der erro, a tentativa é negada.
  - Soma-se ao rate limit nativo do Supabase Auth.
- **Recuperação de senha**: o e-mail só é enviado se o endereço estiver em `ALLOWED_EMAILS`. A resposta é sempre idêntica e tem tempo mínimo de 1,2 s. O link leva a uma página com botão "Continuar" (POST), para que scanners de e-mail não consumam o token. Trocar a senha exige ter passado pelo **MFA** (`aal2`) e ter um cookie assinado de redefinição válido por 15 min. Depois da troca, as outras sessões são encerradas.
- **Sessão** (o plano Free do Supabase recusa `[auth.sessions]`; a seção fica comentada no `config.toml` e os limites valem só pelo app):
  - O JWT expira em 10 min, com rotação de refresh token.
  - Inatividade de 30 min e máximo absoluto de 7 dias, aplicados **no app** com o cookie assinado `ob_session` (HMAC), vinculado ao `user_id`. Sem o cookie, o app falha fechado e faz logout. Os campos `[auth.sessions]` do Supabase também foram configurados, mas exigem plano Pro.
  - "Sair de todos os dispositivos" = `signOut({ scope: "global" })`, que revoga todos os refresh tokens.
- **Troca de senha logada** (Configurações): exige a senha atual, conferida num cliente separado que não mexe na sessão e é encerrado em seguida, e o código do autenticador. A senha nova passa pela checagem HIBP. Ao final, as outras sessões são encerradas. Há rate limit por usuário.
- **Trocar autenticador**: exige o código atual. Remove o fator e obriga a reconfigurar, o que invalida os códigos de recuperação antigos.
- **Sessões ativas**: a função `my_sessions()` (`security definer`, exige `aal2`) devolve só as sessões do próprio usuário (testado).
- **Alerta de login**: depois do MFA, o dispositivo é identificado por um cookie aleatório `ob_device` (httpOnly, 400 dias) e guardado como `sha256(user_id:device_id)` em `known_devices`. Dispositivo novo gera um e-mail (Resend) com data, navegador e IP.

## 3. Autorização e dados

- **RLS habilitado e FORÇADO em todas as tabelas** (`public` e `app_private`). Um teste automatizado consulta `pg_class`/`pg_policies` e falha se alguma tabela estiver sem RLS, sem FORCE, sem política (`public`) ou com algum GRANT para `anon`.
- **Privilégios mínimos**: privilégios padrão revogados de `anon`/`authenticated`, e GRANTs explícitos por tabela. `expenses` não tem DELETE (exclusão é lógica). `audit_log` só tem SELECT.
- **Chaves**: o navegador **não recebe nenhuma chave do Supabase**. Todo acesso passa por Server Components e Server Actions com a anon key no servidor. A `service_role` não é usada pelo app em nenhum ambiente. Ela existe apenas no script de setup (shell local) e nos testes contra o projeto de **dev** (secret do CI).
- **Mutações**: só por Server Actions/Route Handlers. Em cada uma: Origin verificado, sessão + `aal2` + membro (`requireMember`), entrada validada com Zod e autorização final pelo RLS.
- **Integridade no banco**:
  - `created_by` é sempre `auth.uid()` (trigger). `id`, `household_id`, `created_by` e `created_at` são imutáveis.
  - FKs compostas `(household_id, id)` impedem misturar dados de households.
  - CHECKs replicam a validação do Zod: texto seguro, valor > 0 e ≤ R$ 1 bilhão, enums.
- **Dinheiro**: `bigint` em centavos no banco e `number` inteiro no TypeScript (limite de 10¹¹ centavos, bem abaixo de `MAX_SAFE_INTEGER`). O parsing de "1.234,56" não passa por float. A formatação BRL acontece só na apresentação.
- **Percentuais**: basis points (`4000 = 40%`). Uma constraint trigger diferida exige 6 categorias somando exatamente 10000.
- **Auditoria**: triggers em `households`, `household_members`, `categories`, `monthly_budgets`, `category_targets`, `incomes`, `recurring_templates` e `expenses` registram quem, quando, a ação (INSERT/UPDATE/DELETE/SOFT_DELETE/RESTORE) e o JSON antes/depois.
- **Funções de negócio** (`create_month_budget`, `copy_previous_month`) são `SECURITY INVOKER`: rodam com o RLS de quem chama e conferem `is_member_aal2` no início. A criação de mês também gera os lançamentos recorrentes na mesma transação.
- **Exclusão lógica**: `deleted_at`. Restaurar é possível até 30 dias. Lançamento excluído não pode ser editado. O `pg_cron` purga o que passou de 30 dias, e a purga também fica auditada.

## 4. Camada web

- **CSP por requisição** (middleware) com nonce aleatório de 128 bits:
  `script-src 'self' 'nonce-…' 'strict-dynamic' https://challenges.cloudflare.com`, `connect-src 'self'`, `frame-src https://challenges.cloudflare.com`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'` e `upgrade-insecure-requests` (em https).
  - `style-src` permite `'unsafe-inline'`: estilos inline são necessários para os gráficos (Recharts). O requisito proíbe `unsafe-inline` apenas para scripts.
  - `'unsafe-eval'` só existe em `next dev`.
- **Cabeçalhos estáticos** (`next.config.ts`): HSTS de 2 anos com `includeSubDomains; preload`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (câmera, microfone, geolocalização, pagamento, USB etc. desativados), COOP/CORP `same-origin`, `X-Robots-Tag: noindex` e sem `X-Powered-By`.
- **Indexação**: `robots.txt` com `Disallow: /`, meta `noindex, nofollow` em todas as páginas e `X-Robots-Tag`.
- **Exportação** (`GET /exportar`): leitura apenas, exige sessão `aal2` de membro, dados via RLS, resposta `Cache-Control: private, no-store` e `Content-Disposition: attachment`. O CSV tem proteção contra *formula injection* (prefixo `'` em células que começam com `= + - @`). O XLSX é gerado no servidor com XML escapado; valores monetários saem de inteiros, sem float.
- **Nada no navegador**: nenhum dado financeiro em `localStorage`/`sessionStorage`. Logs do servidor só registram nome de evento (`logSecurityEvent`), sem e-mail, IP, valores ou tokens.
- **Erros**: `error.tsx`, `global-error.tsx` e `not-found.tsx` são genéricos e o Next não envia stack traces em produção. Source maps de produção estão desativados.
- **Todas as páginas são dinâmicas** (`force-dynamic`): nenhum HTML com dados privados fica em cache estático.
- **PWA sem service worker**: o app é instalável (manifesto + ícones gerados no build), mas não registra service worker, então não existe nenhum cache offline de dados financeiros. Um teste E2E confirma que não há service worker registrado.
- **Sugestões do lançamento rápido** (descrições e categorias anteriores) vêm do servidor a cada renderização da área autenticada, ficam só na memória da página e nunca vão para `localStorage`.

## 5. Dependências e CI

- Versões exatas no `package.json` + `package-lock.json`. Dependabot semanal (npm e GitHub Actions). Actions fixadas por SHA.
- `overrides`:
  - `postcss` 8.5.32, porque o Next 15 embute uma versão vulnerável.
  - `@typescript-eslint/*` 8.72.2 e `minimatch` ≥ 11.0.1, que são ferramentas de lint.
- Pendências do `npm audit` em 12/11/2026: apenas severidade **baixa** em `deepmerge`, via CLI do `shadcn` (dependência de desenvolvimento, sem correção publicada). O CI exige:
  - zero vulnerabilidades moderadas ou maiores em dependências de produção;
  - zero vulnerabilidades altas no total.
- **Deploy só após CI verde**: a integração Git da Vercel não publica (`vercel.json`). O workflow *Deploy (produção)* roda apenas quando o CI da `main` termina com sucesso, com as variáveis puxadas do painel da Vercel no momento do build.
- **Backup**: `pg_dump` diário → gzip → `age` (chave pública versionada; a privada só existe com o dono) → bucket R2 privado. A connection string do banco e as chaves do R2 ficam num environment do GitHub (`backup`). Detalhes e restauração em [docs/BACKUP.md](docs/BACKUP.md).
- **Ensaio de restauração** com par de chaves separado, só para o dev, para que a chave privada de produção nunca precise ir para o GitHub.
- CI: lint → typecheck → unitários → (migrations no Supabase de dev) testes de segurança → E2E. Os testes de segurança e E2E falham, em vez de serem pulados, se faltar ambiente (`REQUIRE_SECURITY_TESTS=1`).
- As fixtures de teste se recusam a rodar se a URL não corresponder a `TEST_SUPABASE_PROJECT_REF` ou se o household existente não for o de teste. Isso protege a produção contra execução acidental.

## 6. Riscos remanescentes conhecidos

1. **Janela antes do primeiro MFA**: quem tiver a senha antes do dono configurar o TOTP pode registrar o próprio autenticador. Mitigação: o setup cria os usuários com senha aleatória descartada. Cada pessoa define a senha pelo e-mail e configura o MFA na mesma sessão.
2. **Consumo de código de recuperação** depende de `delete from auth.mfa_factors` executado pela função `security definer`. Validado no projeto de dev em 12/11/2026; se a Supabase restringir esse DELETE no futuro, o teste de segurança acusa.
3. **IP do cliente** vem de `x-forwarded-for`, que é confiável atrás da Vercel. Fora dela, o rate limit por IP pode ser contornado; o limite por e-mail e por usuário continua valendo.
4. **Abuso de armazenamento do rate limit**: mitigado porque a RPC exige o segredo e há limpeza horária via `pg_cron`.
5. **Credencial do banco no GitHub (backup)**: o `pg_dump` precisa de um usuário que enxergue tudo, ou seja, que ignore o RLS, e no Supabase só o `postgres` faz isso. A connection string fica num environment protegido do GitHub. Mitigação: o repositório é privado, o environment `backup` tem acesso restrito e a senha do banco é trocada se houver suspeita.
6. **Plano gratuito do Supabase**: o projeto pausa depois de 7 dias sem uso e não tem backup gerenciado. Mitigação: nosso backup diário. Para reativar, basta um clique no painel.
