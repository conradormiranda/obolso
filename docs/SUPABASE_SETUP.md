# Configuração do Supabase

São dois projetos: **dev** (testes e CI, só com usuários fictícios) e **produção** (a família). Nunca misture os dois.

## 1. Aplicar o schema

```bash
npx supabase login
npx supabase link --project-ref <REF>
npx supabase db push
npx supabase config push   # aplica supabase/config.toml (auth, MFA, hook)
```

## 2. Conferir no painel (Authentication)

Mesmo depois do `config push`, confira cada item:

- **Sign In / Providers → Email**: `Allow new users to sign up` = **OFF**. Confirm email: ON.
- **Sign In / Providers → Anonymous sign-ins**: OFF.
- **Multi-Factor**: TOTP habilitado (enroll + verify). Máximo de 2 fatores.
- **Passwords**: comprimento mínimo de **12** e nenhuma exigência de composição. A proteção contra senha vazada é feita pelo app.
- **Sessions**: JWT expiry de **600 s**, rotação de refresh token ON. *Time-box* de 7 dias e inatividade de 30 min, se o plano permitir. O app aplica os mesmos limites de qualquer forma.
- **Attack Protection → Captcha**: **OFF**. O app valida o Turnstile no servidor; ligar aqui quebraria o login, porque o token só pode ser usado uma vez.
- **Hooks → Before User Created**: Postgres function `public.hook_before_user_created`.
- **URL Configuration**:
  - Site URL = `https://<seu-domínio>`.
  - Redirect URLs = apenas `https://<seu-domínio>/auth/confirm`.
- **SMTP** (Resend): host `smtp.resend.com`, porta 465, usuário `resend` e senha = API key do Resend. Remetente no domínio verificado.
- **Email Templates → Reset Password** (o link precisa usar `token_hash`):

  ```html
  <h2>Redefinir senha do O Bolso</h2>
  <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Redefinir minha senha</a></p>
  <p>Se você não pediu, ignore este e-mail.</p>
  ```

## 3. Projeto de dev (testes)

1. Crie o `.env.test.local` (ignorado pelo git) com estas variáveis:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `TEST_SUPABASE_PROJECT_REF`
   - `TEST_SUPABASE_SERVICE_ROLE_KEY` (do projeto de **dev**)
   - `RATE_LIMIT_SECRET`
   - `SESSION_SECRET`
2. Rode `npm run test:security`. As fixtures criam o household "Família Teste (dev)" e os usuários `e2e-*@example.com`.
3. **Não** rode `setup:household` no projeto de dev.

## 4. Produção

1. Aplique o schema (passo 1) e confira o painel (passo 2).
2. Gere os segredos: `openssl rand -base64 48`, uma vez para `SESSION_SECRET` e outra para `RATE_LIMIT_SECRET`.
3. Rode `npm run setup:household` (instruções no topo de `scripts/setup-household.ts`).
4. Configure as variáveis na Vercel, conforme o `.env.example`, **sem** nenhuma `service_role`.
5. Cada pessoa:
   1. abre o app e clica em "Esqueci minha senha";
   2. clica no link do e-mail e configura o MFA;
   3. guarda os códigos de recuperação;
   4. define a senha.
