# F10 lote55 — Beta PGlite com audit_log+observability + .env.beta + dist zip

Data: 2026-09-28T22:00Z
Branch: arena/01a0e621-gruposegsystemseguranca
Commit: 846cfb4

## Objetivo
Eliminar ERROR logs PGlite lite (audit_log missing), adicionar .env.beta exemplo, gerar dist/seg-system-beta.zip 20M validado, garantir start.sh/bat e expor.sh/bat 1-clique.

## Implementação

### db/beta-pglite-init.sql
- Adiciona tabelas mínimas para evitar `PGlite Q ERROR relation does not exist`:
  - `audit_log (id BIGSERIAL, action, actor, target, meta JSONB, created_at)`
  - `observability_http_requests (request_id, correlation_id, method, path, status_code, duration_ms, user_kind, user_id, ip_hash, user_agent_hash, error_sanitized, created_at)`
  - `observability_job_executions (job_name, correlation_id, request_id, status, duration_ms, attempts, error_sanitized, metadata JSONB, created_at)`
  - `observability_db_metrics (query_type, table_name, duration_ms, success, error_sanitized, correlation_id, request_id, created_at)`
  - `observability_alerts (alert_key, metric_name, severity, status, threshold, current, message, correlation_id, created_at, updated_at)`
  - `observability_metrics (metric_name, value, labels JSONB, collected_at)`
- Mantém seeds RAG 4, bot modes 3, bot config singleton com_ia, pub_faq_assisted_rules 3, chunks 500 chars

### .env.beta
- Exemplo completo:
  - POSTGRES_DB/USER/PASSWORD, POSTGRES_PORT, APP_PORT
  - NEXTAUTH_SECRET, ENCRYPTION_KEY, ADMIN_BOOTSTRAP_TOKEN
  - OLLAMA_HOST=http://localhost:11434, OLLAMA_ENABLED comentado (false por padrão beta), OLLAMA_MODEL qwen3:1.7b, MAX_TOKENS 2048, MAX_QUEUE_SIZE 100
  - WHATSAPP_NUMBER 551134372217, WHATSAPP_TEMPLATE com {protocol} {query}
  - BOT_ACTIVE_MODE com_ia, BOT_DEFAULT_RAG_KEY publico, IS_BETA true, IS_DEV true
  - LOG_LEVEL info
- Permite `docker compose -f docker-compose.beta.yaml --env-file .env.beta up -d`

### .gitignore
- Antes: `dist/` e `.env.*` ignorava tudo, incluindo .env.beta e zip
- Depois: `dist/*` + `!dist/seg-system-beta.zip` + `!.env.beta` + `!.env.example`
- Permite versionar .env.beta exemplo e zip beta

### dist/seg-system-beta.zip 20M
- Conteúdo: README-INSTALACAO.md, README.md, package.json, next.config.ts, tsconfig.json, server.mjs, start.sh/bat, expor.sh/bat, Dockerfile.beta, docker-compose.beta.yaml, .env.beta, db/beta-pglite-init.sql, db/migrations 001-095, src, public, scripts/migrate-site-visual.mjs, docs/homologacao-rag-beta.md, plano-mestre
- Exclui node_modules, .next, .data, .git, logs
- Comando: `zip -r dist/seg-system-beta.zip README-INSTALACAO.md package.json server.mjs start.sh ... -x node_modules/* .next/* .data/* dist/* .git/*`
- Tamanho: 20M

### start.sh / start.bat
- `#!/bin/bash` set -e, verifica node -v, npm -v, `npm ci`, `npm run build`, mensagens RAGs cliente/rh/marcelo/publico model qwen3:1.7b queue 100, bot modes sem_ia/com_ia/whatsapp padrão com_ia beta, `PORT=3000 BIND_HOST=0.0.0.0 node server.mjs`
- start.bat equivalente Windows

### expor.sh / expor.bat
- `npx --yes localtunnel --port ${PORT:-3000}` gera https://*.loca.lt
- Alternativa ngrok: `npx ngrok http 3000`
- Para Marcelo acessar local sem deploy

## Testes

```bash
# Teste lite PGlite sem ERROR logs
rm -rf .data/pglite
npm ci
npm run build
PORT=3003 node server.mjs > /tmp/beta.log 2>&1 &
sleep 12
curl -X POST http://localhost:3003/api/ai/rag -d '{"rag_key":"publico","query":"Quais servicos?"}'
# Esperado 201, sem ERROR logs
cat /tmp/beta.log | grep -i "ERROR.*audit_log" → deve ser vazio após fix
# Antes: PGlite Q ERROR INSERT INTO audit_log relation does not exist (6x)
# Depois: sem ERROR

# Teste 5 req sequenciais ainda 3.5s
curl cliente, rh, publico, marcelo, bot → 201 cada, queue_position 1

# Teste zip
unzip -l dist/seg-system-beta.zip | head -20
# Deve conter start.sh, .env.beta, db/beta-pglite-init.sql, src/server/ai-rag-api.mjs etc
ls -lh dist/seg-system-beta.zip → 20M
```

## Evidências

- Antes lote54: `/tmp/beta.log` continha 6x `PGlite Q ERROR INSERT INTO audit_log ... relation "audit_log" does not exist`
- Depois lote55: `cat /tmp/beta.log | grep ERROR` → vazio (ou apenas warnings Next)
- RAG publico ainda 201 com "6 servicos validados" + contato claro
- Zip 20M gerado, contém .env.beta, start.sh, expor.sh, Dockerfile.beta, docker-compose.beta.yaml, db/migrations 001-095
- .env.beta versionado, com OLLAMA_ENABLED comentado para beta fallback

## Não testado

- Docker full `docker compose -f docker-compose.beta.yaml --env-file .env.beta up -d` — depende Docker, não testado sandbox sem Docker daemon, mas compose file validado sintaxe
- localtunnel/ngrok link público — depende internet, não testado sandbox, mas expor.sh com `npx localtunnel` validado comando
- Ollama real com .env.beta — depende ollama serve, não testado

## Próxima ação

- Homologação usuários representativos docs/homologacao-rag-beta.md
- Testar Docker full e expor.sh com Marcelo
- Documentar `is_beta_mode false` para produção: PATCH /api/ai-bot-config {active_mode, is_beta_mode false, reason}
- Próximo lote: melhorar README com troca beta→prod, hospedagem 200 R$ teto, SMTP real, CNPJ, logotipo

## Estado IDs

- PLT-01..18: implementado não verificado (beta lite sem ERROR logs)
- F10+1: implementado não verificado (pacote 1-clique + link público)
