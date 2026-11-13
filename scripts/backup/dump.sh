#!/usr/bin/env bash
# Dump de DADOS do O Bolso (o schema vem das migrations do repositório).
# Uso: DB_URL=postgresql://... scripts/backup/dump.sh saida.sql
# Inclui: public.*, app_private.* (sem rate_limits), auth.users/identities/mfa_factors.
set -euo pipefail

: "${DB_URL:?defina DB_URL (connection string do Session pooler)}"
DB_URL="$(printf '%s' "$DB_URL" | tr -d '[:space:]')"
OUT="${1:?informe o arquivo de saída}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/17/bin}"

"$PG_BIN/pg_dump" "$DB_URL" \
  --data-only \
  --no-owner \
  --no-privileges \
  --quote-all-identifiers \
  --table='public.*' \
  --table='app_private.*' \
  --table='auth.users' \
  --table='auth.identities' \
  --table='auth.mfa_factors' \
  --exclude-table-data='app_private.rate_limits' \
  --file="$OUT"

# Sanidade: o dump precisa conter as tabelas principais.
for t in households household_members categories monthly_budgets expenses audit_log; do
  grep -q "^COPY \"public\".\"$t\"" "$OUT" || { echo "dump sem a tabela public.$t" >&2; exit 1; }
done
grep -q '^COPY "auth"."users"' "$OUT" || { echo "dump sem auth.users" >&2; exit 1; }
