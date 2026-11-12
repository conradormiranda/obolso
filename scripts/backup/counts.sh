#!/usr/bin/env bash
# Conta as linhas de cada tabela num dump (só números; nenhum dado é impresso).
# Uso: scripts/backup/counts.sh dump.sql
set -euo pipefail
awk '
  /^COPY / { table=$2; n=0; inblock=1; next }
  inblock && /^\\\.$/ { print table "\t" n; inblock=0; next }
  inblock { n++ }
' "${1:?arquivo}" | sort
