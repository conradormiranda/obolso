# Operação: publicação e dia a dia

Domínio: **obolso.com.br**. Hospedagem: **Vercel**, região `gru1` (São Paulo). Banco: **Supabase**, projeto de produção separado do de dev.

## 1. Contas e onde fica cada segredo

| Segredo | Onde fica | Nunca em |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_ORIGIN`, `ALLOWED_EMAILS`, `SESSION_SECRET`, `RATE_LIMIT_SECRET`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `RESEND_API_KEY`, `ALERT_EMAIL_FROM` | Vercel → Project → Settings → Environment Variables (Production) | repositório, GitHub |
| `service_role` de **produção** | Só no shell, durante o `setup:household` | Vercel, GitHub, arquivos |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitHub → environment `production` | — |
| `PROD_DB_URL`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | GitHub → environment `backup` | — |
| Chave privada `age` de produção | Seu gerenciador de senhas | qualquer lugar online |
| Secrets do dev (`TEST_*`, `DEV_DB_URL`, `DEV_AGE_IDENTITY`, `SUPABASE_ACCESS_TOKEN`) | GitHub → repository secrets e environment `dev` | — |

## 2. Supabase de produção

1. Crie o projeto na região **South America (São Paulo)**.
2. Aplique o schema e a configuração:
   ```bash
   npx supabase link --project-ref <REF_PROD>
   npx supabase db push
   OBOLSO_SITE_URL=https://obolso.com.br OBOLSO_REDIRECT_URL=https://obolso.com.br/auth/confirm npx supabase config push
   ```
3. No painel (Authentication):
   - **SMTP**: host `smtp.resend.com`, porta `465`, usuário `resend`, senha = chave do Resend. Remetente: `O Bolso <nao-responda@obolso.com.br>`.
   - **Email Templates → Reset Password**: assunto "Redefinir senha do O Bolso". O corpo é o conteúdo de `supabase/templates/recovery.html`.
   - Confira a lista de [SUPABASE_SETUP.md](SUPABASE_SETUP.md): cadastro desligado, TOTP ligado, hook ativo e captcha do Supabase **desligado**.
4. Crie os usuários reais (uma única vez):
   ```bash
   SUPABASE_URL=https://<REF_PROD>.supabase.co SETUP_SUPABASE_SERVICE_ROLE_KEY=... RATE_LIMIT_SECRET=<o mesmo da Vercel> \
   PAI_EMAIL=... PAI_NOME=... MAE_EMAIL=... MAE_NOME=... HOUSEHOLD_NAME="Família ..." npm run setup:household
   ```

## 3. Vercel e domínio

1. Crie o projeto na Vercel a partir do repositório GitHub. Framework: Next.js.
2. Preencha as variáveis da tabela da seção 1, com `APP_ORIGIN=https://obolso.com.br`.
3. Em Settings → Domains, adicione `obolso.com.br` e `www.obolso.com.br` (com redirect para o principal).
4. No DNS do domínio (Hostinger), troque o estacionamento pelos registros que a Vercel indicar:
   - `A @ 76.76.21.21`
   - `CNAME www cname.vercel-dns.com`
5. Ainda no DNS, adicione os registros do Resend (SPF, DKIM e MX de retorno) e um DMARC:
   - `TXT _dmarc "v=DMARC1; p=quarantine; rua=mailto:<seu e-mail>"`
6. **Deploy:** só acontece pelo workflow *Deploy (produção)*, depois do CI verde na `main`. A integração Git da Vercel não publica sozinha (`vercel.json`).
7. **HSTS preload:** depois de uma semana estável, cadastre o domínio em hstspreload.org. O cabeçalho já sai com `preload`.

## 4. Primeiro acesso de cada pessoa

1. Abrir https://obolso.com.br e clicar em **Esqueci minha senha**.
2. Clicar no link do e-mail → **Continuar** → configurar o autenticador.
3. Gerar e **guardar os códigos de recuperação**.
4. Definir a senha.

## 5. Dia a dia

| Tarefa | Como |
|---|---|
| Nova versão | Merge na `main`. O CI roda e, se passar, o deploy acontece. |
| Migration nova | `npx supabase db push` no dev (o CI faz isso). Depois de validado, rode manualmente no prod (`link` + `db push`). |
| Ver backups | Actions → *Backup diário*. O resumo de cada execução mostra as contagens. |
| Ensaio de restauração | Actions → *Ensaio de restauração (DEV)*, a cada 3 meses. |
| Perdeu o celular | Entrar com senha + **código de recuperação**, e depois configurar o novo autenticador. |
| Suspeita de invasão | Configurações → **Sair de todos os dispositivos**. Trocar a senha e conferir a Auditoria. |
| Dependências | O Dependabot abre PRs semanais. Faça o merge se o CI passar. |
