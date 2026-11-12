# O Bolso

Orçamento doméstico privado da família: renda distribuída em 6 categorias por percentual. Feito para 2 usuários, com MFA obrigatório.

Stack: Next.js 15 (App Router) · Supabase (Postgres, Auth, RLS) · Tailwind + shadcn/ui · Zod · Vitest · Playwright · Vercel.

- Segurança: veja [SECURITY.md](SECURITY.md).
- Configuração do Supabase: veja [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Desenvolvimento

```bash
npm ci
cp .env.example .env.local          # preencha com o projeto Supabase de DEV
npm run dev
```

## Testes

```bash
npm run lint && npm run typecheck
npm test                            # unitários
npm run test:security               # RLS/allowlist/MFA contra o Supabase de dev (.env.test.local)
npm run build && npm run test:e2e   # Playwright (mobile)
```

Sem `.env.test.local`, os testes que dependem do Supabase são pulados localmente. No CI eles são obrigatórios.

## Secrets do GitHub Actions (projeto de DEV)

| Secret | Uso |
|---|---|
| `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_PROJECT_REF` | testes |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | fixtures de teste (somente dev) |
| `TEST_SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN` | `supabase db push` no dev |
| `TEST_RATE_LIMIT_SECRET`, `TEST_SESSION_SECRET` | segredos do app nos testes |

## Fases

1. ✅ Fundação e segurança
2. ✅ Núcleo do orçamento
3. ✅ Usabilidade
4. Análise
5. Produção
