#!/usr/bin/env bash
# Dedicated disposable PostgreSQL QA, never production or a user-supplied database.
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null && command -v npm >/dev/null || { echo 'Instale Node.js 22 e npm.' >&2; exit 2; }
printf 'HOMOLOGAÇÃO LOCAL: pare a prévia PGlite anterior (porta 3000). Não use dados reais.\n'
node scripts/qa-homologacao-local.mjs --preflight
npm ci --no-audit --no-fund
node scripts/qa-homologacao-local.mjs
