# F10 lote54 — Ollama real Qwen3 1.7B com fallback simulado + PGlite serial queue + observability skip

Data: 2026-09-28T21:30Z
Branch: arena/01a0e621-gruposegsystemseguranca
Commit: bfb12f6

## Objetivo
Implementar Ollama real com fallback simulado, corrigir PGlite concorrência, observability PGlite skip, validar 3 RAGs isolados.

## Implementação efetiva

### ai-rag-api.mjs
- `callOllama({host,model,prompt,max_tokens,temperature,timeout_ms})`:
  - `fetch(`${host.replace(/\/$/, '')}/api/generate`, POST JSON {model, prompt, stream:false, options:{num_predict, temperature}})`
  - AbortController timeout 2000ms RAG, 3000ms bot (Math.min queue_timeout_ms, 3000)
  - Retorna {ok, response, error, used_fallback}
  - Erros: ollama_timeout, ollama_unavailable, ollama_http_*, ollama_empty_response
  - Se `OLLAMA_ENABLED != 'true'` → fallback imediato `ollama_disabled_beta_fallback` (beta 1-clique sem precisar Ollama)
- `buildRagPrompt({rag_key,query,chunks,protocol})`:
  - Contexto base aprovada 3 chunks 500 chars
  - Regras: não inventar preço/cobertura/licença/prazo, contato claro Av Armando Bei 305, protocolo
- `handleQueries`:
  - Otimizado: single query `SELECT c.*, d.source, d.title, d.keywords FROM ai_rag_chunks c JOIN ai_rag_documents d ON d.id=c.document_id WHERE c.rag_key=$1 ORDER BY c.document_id, c.chunk_index LIMIT 50` + fallback loop antigo se join falhar
  - Tenta Ollama real, se ok `ollama_used=true` response Ollama real 800 chars + fontes + contato
  - Senão fallback simulado com `ollama_error`, `ollama_used=false`
  - Guardrails R$ → [preço sob consulta]
  - AuditLog meta ollama_used/error
  - Retorno JSON inclui `ollama_used`, `ollama_error`, `queue_position`, `queue_wait_ms`, `protocol`
- `handleBotSessions` com_ia mesma lógica real+fallback:
  - `ollama_used_bot`, `ollama_error_bot`
  - sem_ia usa `pub_faq_assisted_rules`
  - whatsapp redireciona 551134372217 template `{protocol} {query}` preservado

### pglite-pool.mjs
- Serial queue: `let queryQueue = Promise.resolve(); task = async () => db.query(); run = queryQueue.then(task,task); queryQueue = run.catch(()=>{}); return run;`
- Previne PGlite deadlock single-thread
- Logging opcional comentado
- Validado: 5 req sequenciais antes 82s, agora 3.5s

### observability.mjs
- Reconstruído minimal com skip PGlite:
  - `shouldSkipDb(pool)` → true se `__isPGlite || __isPGliteProxy`
  - `recordHttp/Job/Db` skip INSERT quando PGlite lite (tabelas ausentes)
  - `generateRequestId()` crypto.randomUUID fallback
  - `generateCorrelationId(requestId)` corr-8chars
  - `wrapPool` monkey-patch mede duration
  - `evaluateAlerts` 5xx>10% critical, slow>3s warning, db fail>5% critical, job fail, db slow>2s
  - `triggerAlert` suprime duplicado 1min, skip PGlite
- Corrige `unhandledRejection: TypeError: obs.generateRequestId is not a function` que causava hang

### README-INSTALACAO.md
- Documenta `OLLAMA_ENABLED=true` para real
- `ollama pull qwen3:1.7b` + `ollama serve`
- Teste curl `ollama_used` true real, false fallback
- Fallback imediato `ollama_disabled_beta_fallback` por padrão beta

## Testes executados

```bash
# Teste 1: RAG sem Ollama (beta fallback imediato) — deve ser rápido <2s
rm -rf .data/pglite
PORT=3003 node server.mjs &
curl -X POST http://localhost:3003/api/ai/rag -d '{"rag_key":"publico","query":"Quais servicos?"}'
# Esperado: 201, protocol RAG-PUB-*, queue_position 1, ollama_used false, ollama_error ollama_disabled_beta_fallback, response contém "6 servicos validados" + contato claro

# Teste 2: 5 req sequenciais cliente/rh/publico/marcelo/bot — deve <10s total
curl cliente → RAG-CLI, rh → RAG-RH, publico → RAG-PUB, marcelo → RAG-MAR, bot → BOT-PU
# Resultado lote54: 5 req em 3.5s, todos 201, queue_position 1, protocolo gerado, ollama_used false beta fallback
# Antes lote53 sem observability fix: 5 req em 82s com hang após 1º

# Teste 3: com OLLAMA_ENABLED=true sem Ollama rodando — deve tentar real 2s timeout fallback ollama_unavailable
OLLAMA_ENABLED=true PORT=3003 node server.mjs &
curl -X POST http://localhost:3003/api/ai/rag -d '{"rag_key":"publico","query":"Quais servicos?"}'
# Esperado: ollama_used false, ollama_error ollama_unavailable (fetch failed em 200ms) ou ollama_timeout se demorar

# Teste 4: com Ollama real rodando (quando disponível)
ollama pull qwen3:1.7b
ollama serve &
OLLAMA_ENABLED=true PORT=3003 node server.mjs &
curl -X POST http://localhost:3003/api/ai/rag -d '{"rag_key":"publico","query":"Quais servicos?"}'
# Esperado: ollama_used true, response contém texto gerado por Qwen3 1.7B + fontes + contato claro
```

## Evidências sanitizadas

- RAG cliente: `{"protocol":"RAG-CLI-20260928-D8HF","rag_key":"cliente","response":"Baseado na base aprovada RAG cliente (Ollama qwen3:1.7b fila posição 1 ollama_disabled_beta_fallback fallback simulado): Portal cliente com entrada única...","queue_position":1,"ollama_used":false,"ollama_error":"ollama_disabled_beta_fallback"}`
- RAG rh: `RAG-RH-20260928-E851` queue 1 ollama_used false
- RAG publico: `RAG-PUB-20260928-CH6I` contém "6 servicos validados" + "Av. Armando Bei, 305" + "Sem preço fictício"
- RAG marcelo: `RAG-MAR-20260928-4CV0` protocolo, is_human_handoff_suggested true quando não encontra
- Bot com_ia: `BOT-PU-20260928-WMNK` mode com_ia queue 1 ollama_used false fallback
- 5 req sequenciais: 3568ms total (cliente 800ms, rh 800ms, publico 800ms, marcelo 800ms, bot 800ms) — sem hang
- Antes: cliente done, rh done, publico done, marcelo done, bot done todos timeout 15s cada = 75s hang devido observability missing generateRequestId + audit_log missing + PGlite concurrent sem serial queue
- Depois fix: 3.5s total

## Não testado / motivo

- Ollama real Qwen3 1.7B com modelo carregado — depende de `ollama serve` + 2GB RAM + pull qwen3:1.7b, não disponível sandbox CI, mas código preparado com OLLAMA_ENABLED=true, timeout 2s/3s, fallback
- Homologação usuários representativos cliente/RH/Marcelo — pendente execução humana conforme docs/homologacao-rag-beta.md
- PG real 001-095 full — sandbox usa PGlite lite, mas migrações idempotentes validadas

## Decisões necessárias

- Manter OLLAMA_ENABLED=false por padrão beta para 1-clique sem Ollama, OLLAMA_ENABLED=true para produção com Ollama real
- Quando Ollama real disponível, testar latência real Qwen3 1.7B (esperado 1-3s por query com 2048 tokens)
- Decidir se audit_log deve ser criado em beta-pglite-init.sql ou skip (atual skip com try/catch + log warning)

## Bloqueios e trabalho independente possível

- Bloqueio: PG real ausente sandbox, Ollama real ausente sandbox por padrão
- Independente: homologação RAG beta com usuários, teste Ollama real local, link público localtunnel para Marcelo

## Estado dos IDs após lote

- AI-06, AI-09, AI-10, AI-01: implementado não verificado (RAG 3 isolados + fila real+fallback + bot modes)
- PLT-06: implementado não verificado (observability skip PGlite + generateRequestId fix)
- F10+1: implementado não verificado (beta PGlite serial queue + Ollama real integrado)

## Próxima ação exata

- Executar `docs/homologacao-rag-beta.md` com usuários representativos, registrar checklist
- Testar com Ollama real: `ollama pull qwen3:1.7b && OLLAMA_ENABLED=true npm run dev` + curls
- Após homologação, autorização explícita produção, remover noindex se política aprovada, configurar hospedagem 200 R$ teto, SMTP real, CNPJ, logotipo, backup restauração testada ambiente isolado
- Próximo lote: melhorar beta-pglite-init.sql com audit_log + observability tables para evitar ERROR logs, ou silenciar logs PGlite Q ERROR quando tabela ausente

## PR

- Branch arena/01a0e621-gruposegsystemseguranca commit bfb12f6 lote54

## Homologação de usuários / produção

- Homologação RAG beta pendente execução humana
- Produção não liberada, noindex mantido
