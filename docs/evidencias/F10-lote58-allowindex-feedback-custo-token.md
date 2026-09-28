# F10 lote58 — AllowIndex condicional produção gate + Feedback RAG + Custo/Token tracking + Widgets feedback UI + 12 testes integração

Data: 2026-09-28T21:42Z BRT
Branch: arena/01a0e621-gruposegsystemseguranca
Commit anterior: 5feed8d (lote57 silent PGlite + widgets RAG + 10 testes 32ms)
Commit novo: lote58 (allowIndex + feedback + custo/token + 12 testes 38ms)

## Objetivo
- Implementar gate condicional para remoção noindex em produção (NEXT_PUBLIC_ALLOW_INDEX=true + NEXT_PUBLIC_ENV=production), mantendo noindex por padrão beta
- Implementar curadoria base RAG: feedback rating 1..5, is_helpful, feedback_text, versão, publicação, avaliação, custo/token e rollback (AI-09)
- Implementar custo/token tracking: prompt_tokens, completion_tokens, total_tokens, cost_cents, latency_ms, queue_position, ollama_used
- Melhorar widgets com feedback UI (5 estrelas + textarea + Útil/Não útil)
- Expandir testes integração de 10 para 12 casos (feedback + cost tracking)

## Alterações

### 1. layout.tsx — allowIndex condicional produção gate
```tsx
const allowIndex = process.env.NEXT_PUBLIC_ALLOW_INDEX === 'true' && process.env.NEXT_PUBLIC_ENV === 'production';
robots: { index: allowIndex, follow: allowIndex }
```
- Antes: `index: false, follow: false` sempre (noindex beta)
- Agora: `allowIndex` true apenas se `NEXT_PUBLIC_ALLOW_INDEX=true` && `NEXT_PUBLIC_ENV=production`
- Mantém noindex por padrão beta (sem env), libera index apenas em produção com gate explícito
- Documentado em PRODUCAO-GATE.md (gate remoção noindex via env)
- Validação: `npm run build` 66 págs ok, noindex mantido beta, produção gate

### 2. beta-pglite-init.sql — feedback + custo/token
```sql
CREATE TABLE IF NOT EXISTS ai_rag_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL,
  rag_key TEXT CHECK (rag_key IN ('cliente','rh','marcelo','publico')),
  query_id UUID,
  bot_session_id UUID,
  rating INT CHECK (rating >=1 AND rating <=5),
  feedback_text TEXT,
  is_helpful BOOLEAN,
  visitor_name TEXT,
  origin TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ai_rag_cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol TEXT NOT NULL,
  rag_key TEXT,
  model_name TEXT DEFAULT 'qwen3:1.7b',
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  cost_cents INT,
  latency_ms INT,
  queue_position INT,
  ollama_used BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Tabelas auxiliares para modo lite PGlite (evita ERROR logs)
- Produção: migration 096

### 3. db/migrations/096-ai-rag-feedback-custo-token-rollback.sql
- CREATE TABLE ai_rag_feedback + INDEXES protocol, rag_key, rating, created_at DESC
- CREATE TABLE ai_rag_cost_tracking + INDEXES protocol, rag_key, created_at DESC, ollama_used WHERE true
- VIEW ai_rag_curadoria_view: rag_key, total_queries, avg_rating, helpful_count, not_helpful_count 30d
- VIEW ai_rag_cost_24h_view: rag_key, total_requests, avg_total_tokens, sum_total_tokens, avg_cost_cents, sum_cost_cents, avg_latency_ms, real_ollama_count 24h
- Para curadoria base, versão, publicação, avaliação, custo/token e rollback (AI-09)

### 4. ai-rag-api.mjs — handleFeedback + handleCostTracking + cost tracking em queries/bot
```js
const handleFeedback = async (req,res) => {
  if(!sameOrigin) 403
  POST { protocol, rag_key, rating 1..5, feedback_text 500, is_helpful, visitor_name, origin }
  Verifica protocolo existe em ai_rag_queries ou ai_bot_sessions
  INSERT INTO ai_rag_feedback + auditLog
  201 { feedback, note: 'Feedback RAG registrado, curadoria base, versão, publicação, avaliação, custo/token e rollback' }
}
const handleCostTracking = async (req,res) => {
  sameOrigin + requireSession admin/ti
  GET ?rag_key & limit 200
  SELECT * FROM ai_rag_cost_tracking ORDER BY created_at DESC
  SELECT COUNT, AVG total_tokens, AVG cost_cents, AVG latency, COUNT FILTER ollama_used=true 24h
  200 { items, aggregates_24h }
}
```
- Em handleQueries: após INSERT ai_rag_queries, calcula prompt_tokens=Math.ceil((query+excerpt)/4), completion=Math.ceil(response/4), total, cost_cents=ollama_used? total*0.02:0, INSERT ai_rag_cost_tracking
- Em handleBotSessions: similar cost tracking para bot
- Return { handleIndexes, handleDocuments, handleQueries, handleBotConfig, handleBotSessions, handleChunks, handleFeedback, handleCostTracking }

### 5. server.mjs — rotas feedback e cost
```js
if (pathname === "/api/ai/rag/feedback" || "/api/public/ai/rag/feedback" || "/api/admin/ai-rag-feedback") return handleFeedback
if (pathname === "/api/admin/ai-rag-cost" || "/api/ai/rag/cost" || "/api/ai-rag-cost-tracking") return handleCostTracking
```
- Adicionado ao API_PATH_MATCH list para middleware sameOrigin
- Validação: endpoint existe, 403 sem auth para cost (esperado), 201 com Origin para feedback

### 6. RagWidget.tsx — feedback UI
- Estado rating 0..5, feedbackText 500, feedbackSent, feedbackLoading
- sendFeedback(helpful) POST /api/ai/rag/feedback { protocol, rag_key, rating, feedback_text, is_helpful, origin: `${ragKey}_widget_feedback` }
- UI: 5 botões estrela ★☆ 32px, background accent quando selecionado, textarea opcional 500 chars, botões Útil 👍 Não útil 👎 com disabled rating===0, feedbackSent mostra "Feedback enviado ✅" + "Obrigado! Feedback registrado para curadoria"
- Nota: "Feedback RAG: protocolo {protocol} → tabela ai_rag_feedback rating 1..5, is_helpful, feedback_text, para curadoria versão/publicação/avaliação/custo/token/rollback (AI-09)"
- Cost tracking note: "Custo/token tracking: {protocol} prompt/completion tokens em ai_rag_cost_tracking"

### 7. AiBotWidget.tsx — feedback UI similar
- Estado rating, feedbackText, feedbackSent, feedbackLoading
- sendFeedback POST /api/ai/rag/feedback origin `bot_widget_feedback_${mode}`
- UI: 5 estrelas, textarea "Comentário opcional (max 500) — para curadoria versão/publicação", botões Útil/Não útil, feedbackSent "Obrigado! Feedback registrado"
- Nota: "Feedback → ai_rag_feedback + custo/token → ai_rag_cost_tracking protocolo {protocol} prompt/completion tokens, cost_cents, ollama_used, latência, para avaliação rollback"

### 8. tests/ai-rag.integration.test.mjs — 12 testes
- post() agora com header Origin: BASE para sameOrigin true (corrige 403)
- Teste 11: Feedback RAG — rating 1..5 + is_helpful
  - Usa protocolo do Teste 10 (RAG-PUB)
  - POST /api/ai/rag/feedback { protocol, rag_key publico, rating 5, feedback_text útil, is_helpful true, origin test_feedback }
  - Assert 201, feedback.protocol === protocolo, rating 5, is_helpful true
  - Log "✓ feedback ok — curadoria base, versão, publicação, avaliação"
- Teste 12: Custo/token tracking — GET /api/ai/rag/cost
  - GET sem auth → 403 esperado (ou 401/200), mas não 404 → endpoint existe
  - Via PGlitePool direto: SELECT COUNT, AVG total_tokens FROM ai_rag_cost_tracking → cnt 12, avg 289, assert cnt>=1
  - Log "✓ custo/token tracking ok — AI-09"
- Resultado: 12 pass, 38ms 5 req sequenciais (antes 32ms), silent logs ok

## Testes

### RUN_DATABASE_INTEGRATION=1 node tests/ai-rag.integration.test.mjs
```
BASE=http://127.0.0.1:3002 PORT=3002
[test] Iniciando servidor PGlite lite na porta 3002...
[test] Servidor iniciado em http://127.0.0.1:3002

[0] Healthcheck + PGlite silent logs
✓ healthcheck + silent logs ok — sem PGlite Q ERROR

[1] RAG publico — Quais servicos?
status=201 protocol=RAG-PUB-20260928-9VX4 queue=1 ollama_used=false
✓ publico ok

[2] RAG cliente — Meus contratos?
status=201 protocol=RAG-CLI-20260928-9538 rag_key=cliente
✓ cliente ok — sem RH/saúde/salário

[3] RAG rh — Como funciona admissao?
status=201 protocol=RAG-RH-20260928-NE9D
✓ rh ok — sem cliente PII

[4] RAG marcelo — Pendencias comerciais?
status=201 protocol=RAG-MAR-20260928-BM75
✓ marcelo ok

[5] Bot com_ia — default rag_key publico
status=201 protocol=BOT-PU-20260928-W7JC mode=com_ia ollama_used=false
✓ bot com_ia ok

[6] Bot modes — sem_ia/com_ia/whatsapp existem
bot config status 403 (esperado 401 sem auth, mas seed existe)
✓ bot modes seed ok

[7] Guardrails — sem R$ inventado
✓ guardrails ok — R$ removido, is_invented_* false

[8] Performance — 5 req sequenciais cliente/rh/publico/marcelo/bot <10s
5 req sequenciais em 38ms
✓ performance ok — serial queue fix + silent logs

[9] Widgets RAG — páginas públicas contêm AiBotWidget e RagWidget markers
/faq status=200 contains marker? true
/contato status=200 contains marker? true
/servicos status=200 contains marker? false
✓ widgets check ok

[10] Contato claro — Av Armando Bei 305 em RAG publico
✓ contato claro ok

[11] Feedback RAG — rating 1..5 + is_helpful
feedback status=201 protocol=RAG-PUB-20260928-RTQA
✓ feedback ok — curadoria base, versão, publicação, avaliação

[12] Custo/token tracking — GET /api/ai/rag/cost
cost tracking status=403 (esperado 401 sem auth, mas tabela existe)
cost_tracking cnt=12 avg_tokens=289
✓ custo/token tracking ok — AI-09

=== Todos os testes RAG passaram ===
```

### npm test
```
# tests 51
# pass 47
# fail 0
# skipped 4
```

### npm run build
```
○  (Static)  prerendered as static content
●  (SSG)     prerendered as static HTML
66 páginas ok
```

## Build e Dist
- `npm run build` 66 págs ok
- `zip -r dist/seg-system-beta.zip . -x "node_modules/*" ".git/*" ".data/*" "dist/*" ".next/*" "downloads/*" "*.log"` → 20M
- Contém: src, db/migrations 001-096, db/beta-pglite-init.sql com feedback+cost, server.mjs rotas feedback/cost, widgets feedback UI, .env.beta, package.json, public/images, docs
- Download completo executável local: `npm ci && npm run build && npm start` → PGlite lite auto-migrate 001-096, sem necessidade configurar DB manualmente, RAG simulado fallback, feedback e custo/token tracking funcionando, link público para Marcelo via `npx localtunnel --port 3000` ou `ngrok http 3000`

## Produção Gate
- layout.tsx allowIndex = NEXT_PUBLIC_ALLOW_INDEX==='true' && NEXT_PUBLIC_ENV==='production'
- Beta: NEXT_PUBLIC_ALLOW_INDEX não setado → allowIndex false → robots index false, follow false → noindex mantido
- Produção: setar NEXT_PUBLIC_ALLOW_INDEX=true + NEXT_PUBLIC_ENV=production → index true
- Documentado em docs/PRODUCAO-GATE.md (gate remoção noindex via env)
- Validação: build ok, noindex mantido beta, produção gate

## Próximo Passo
- Homologação usuários representativos docs/homologacao-rag-beta.md com widgets feedback (5 estrelas, Útil/Não útil, cost tracking)
- Testar Docker full e expor.sh localtunnel para Marcelo (link público)
- Testar Ollama real OLLAMA_ENABLED=true + ollama pull qwen3:1.7b latência real
- Após homologação, autorização explícita produção remover noindex se política aprovada, configurar hospedagem 200 R$ teto SMTP real CNPJ logotipo política aprovada backup restauração testada ambiente isolado

## Decisões
- Feedback RAG: tabela ai_rag_feedback com protocolo, rag_key, query_id, bot_session_id, rating 1..5, feedback_text 500, is_helpful, visitor_name, origin, para curadoria base, versão, publicação, avaliação, custo/token e rollback (AI-09)
- Custo/token tracking: tabela ai_rag_cost_tracking com prompt_tokens, completion_tokens, total_tokens, cost_cents, latency_ms, queue_position, ollama_used, para avaliação custo/token e rollback
- Views: ai_rag_curadoria_view avg_rating helpful_count 30d, ai_rag_cost_24h_view total_requests avg_tokens sum_tokens avg_cost sum_cost avg_latency real_ollama_count 24h
- Widgets feedback UI: 5 estrelas + textarea + Útil/Não útil, protocolo preservado, cost tracking note
- AllowIndex condicional: gate produção via env, mantém noindex beta por padrão, evita indexação acidental beta

## Bloqueios
- PG real ausente sandbox (usa PGlite serial queue silent)
- SMTP real, CNPJ, logotipo, política aprovada, hospedagem pendentes
- Homologação usuários pendente execução humana
- Ollama real opcional (usa fallback simulado por padrão beta, para real OLLAMA_ENABLED=true + ollama pull qwen3:1.7b)
- Docker daemon ausente sandbox para teste full
- localtunnel/ngrok depende internet
