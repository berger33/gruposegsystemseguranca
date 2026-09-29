#!/usr/bin/env bash
# Prévia local QA: não configura serviço externo, Postgres, SMTP ou produção.
set -euo pipefail
cd "$(dirname "$0")"
for name in DATABASE_URL DATABASE_MIGRATION_URL CLIENT_DOCS_DIR PGLITE_DATA_DIR; do
  if [[ -n "${!name:-}" ]]; then echo "RECUSADO: remova $name do ambiente antes de iniciar QA." >&2; exit 2; fi
done
shopt -s nullglob
for name in .env*; do
  echo "RECUSADO: $name detectado; use uma extração limpa para QA local." >&2; exit 2
done
command -v node >/dev/null && command -v npm >/dev/null || { echo 'Instale Node.js 22 e npm antes de iniciar.' >&2; exit 2; }
[[ "$(node -p 'process.versions.node.split(".")[0]')" == '22' ]] || { echo 'Esta prévia foi validada somente com Node.js 22.' >&2; exit 2; }
# O ZIP é código-fonte; npm ci requer internet para dependências publicadas.
# O processo web usa SOMENTE PGlite local; nenhum token/admin real é pré-configurado.
unset DATABASE_URL DATABASE_MIGRATION_URL CLIENT_DOCS_DIR PGLITE_DATA_DIR MAIL_HOST MAIL_USER MAIL_PASSWORD MAIL_FROM LEADS_NOTIFY_EMAIL OLLAMA_HOST
export QA_PGLITE_ONLY=true OLLAMA_ENABLED=false NEXT_PUBLIC_ALLOW_INDEX=false NEXT_PUBLIC_ENV=beta
export BIND_HOST=127.0.0.1 PORT=3000
printf '\nGrupo SEG System — PRÉVIA QA LOCAL, não produção\n'
printf 'Instalando dependências travadas e compilando (primeira execução pode demorar)...\n'
npm ci --no-audit --no-fund
npm run build
printf '\nAbra http://localhost:3000 no navegador. Pare com Ctrl+C.\n'
node server.mjs
