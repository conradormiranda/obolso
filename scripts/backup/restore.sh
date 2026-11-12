#!/usr/bin/env bash
# Restaura um dump de DADOS num projeto Supabase cujo schema já foi criado
# pelas migrations (supabase db push) e cujas tabelas estão VAZIAS.
# Uso: TARGET_DB_URL=postgresql://... CONFIRM_REF=<ref-do-destino> scripts/backup/restore.sh dump.sql
#
# session_replication_role=replica desliga triggers (auditoria, imutabilidade,
# allowlist em auth.users) durante a carga, para restaurar o histórico como estava.
set -euo pipefail

: "${TARGET_DB_URL:?defina TARGET_DB_URL}"
: "${CONFIRM_REF:?defina CONFIRM_REF com o project ref do destino (trava contra engano)}"
IN="${1:?informe o arquivo .sql}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/17/bin}"

case "$TARGET_DB_URL" in
  *"$CONFIRM_REF"*) ;;
  *) echo "TARGET_DB_URL não aponta para o projeto $CONFIRM_REF. Abortando." >&2; exit 1 ;;
esac

{ echo "SET session_replication_role = replica;"; cat "$IN"; } |
  "$PG_BIN/psql" "$TARGET_DB_URL" --no-psqlrc --quiet -v ON_ERROR_STOP=1 --single-transaction
echo "Restauração concluída."
