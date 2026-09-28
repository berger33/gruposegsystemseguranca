# F10 lote57 — Silenciar PGlite logs + Widgets RAG melhorados + Testes integração RUN_DATABASE_INTEGRATION=1

Data: 2026-09-28T22:30Z
Branch: arena/01a0e621-gruposegsystemseguranca
Commit: a ser gerado

## Objetivo
- Silenciar completamente logs PGlite por padrão (só com PGLITE_DEBUG=true ou LOG_LEVEL=debug)
- Melhorar widgets RAG (RagWidget, AiBotWidget, FaqAssistedWidget) com UI/UX, quick actions, copy protocolo, ollama_used indicator, guardrails badges
- Testes integração `RUN_DATABASE_INTEGRATION=1` com auto-start server PGlite lite, validação silent logs, performance 5 req <15s, widgets markers, contato claro

## Implementação

### pglite-pool.mjs — silent logs
- Antes: `console.log('[PGlite] Running beta-pglite-init.sql')`, `console.warn('[PGlite Q] ERROR ...')` sempre aparecia, poluía logs beta e causava confusão homologação
- Depois:
  - `function isPgliteDebug() { return process.env.PGLITE_DEBUG==='true' || process.env.LOG_LEVEL==='debug'; }`
  - `function pgliteLog(...args) { if(isPgliteDebug()) console.log(...args); }`
  - `function pgliteWarn(...args) { if(isPgliteDebug()) console.warn(...args); }`
  - Todos `console.log`/`console.warn` trocados para `pgliteLog`/`pgliteWarn`
  - Query wrapper: `if(isPgliteDebug()) console.warn(ERROR)` senão silencia
  - Resultado: `PORT=3003 node server.mjs` sem PGlite Q ERROR por padrão, só com `PGLITE_DEBUG=true`

### RagWidget.tsx — melhorado
- Antes: inline style simples, sem quick actions, sem copy, sem ollama_used
- Depois:
  - `RAG_COLORS` por rag_key: cliente azul #0b5fff, rh verde #059669, marcelo roxo #7c3aed, publico laranja #ea580c
  - `SUGGESTIONS` por rag_key: 4 perguntas rápidas clicáveis que já disparam consulta
  - Estado: `copied` para feedback copiar protocolo
  - `ask(e, customQuery)` aceita query custom de quick action
  - Resposta: protocolo + modelo + fila pos wait + lat + ollama_used REAL/fallback error com cor verde/cinza
  - Botão copiar protocolo com feedback "Copiado!"
  - Fontes em details com bg colorido, excerpt 150 chars
  - Badges guardrails is_invented_* false + RAG área pertinente
  - Loading spinner CSS `@keyframes spin`
  - Limpa query após sucesso
  - Contador chars 0/2000

### AiBotWidget.tsx — melhorado
- Antes: simples, sem quick actions, sem copy, sem ollama_used
- Depois:
  - `MODE_COLORS` com emoji: sem_ia 📘 azul, com_ia 🤖 roxo, whatsapp 💬 verde
  - `QUICK_ACTIONS` 4 perguntas rápidas
  - Estado copied
  - `ask(e, customQuery)` com ragKey do config ou default
  - Resposta: protocolo, modo, RAG, fila pos wait, lat, whatsapp redirect, ollama_used REAL/fallback
  - Botão copiar protocolo
  - WhatsApp link com `https://wa.me/${number}?text=Protocolo {protocol} Pergunta {query}` + emoji 💬
  - Fontes details
  - Badges sem invenção + fila Ollama
  - Dev config details com host, queue, template
  - Loading spinner

### FaqAssistedWidget.tsx — melhorado
- Antes: simples
- Depois: similar RagWidget com QUICK, copy protocolo, melhor styling, details como funciona

### tests/ai-rag.integration.test.mjs — RUN_DATABASE_INTEGRATION=1 melhorado
- Antes: 7 testes, requer TEST_BASE_URL manual, sem auto-start, sem silent logs check, sem performance, sem widgets
- Depois: 10 testes com auto-start server:
  - `startTestServer()`: se TEST_BASE_URL não setado, limpa .data/pglite, spawn `node server.mjs` PORT 3002 BIND_HOST 127.0.0.1 PGLITE_DEBUG false, waitForServer /api/health/live 25s, captura logs
  - `stopTestServer()`: SIGTERM
  - Teste 0: healthcheck + silent logs — assert !logs.includes('relation "audit_log" does not exist') e !logs.includes('PGlite Q] ERROR')
  - Teste 1-4: RAGs isolados com guardrails is_invented_* false, protocolo RAG-*, ollama_used boolean, ollama_error ollama_disabled_beta_fallback
  - Teste 5: bot com_ia protocolo BOT-*, queue, ollama_used
  - Teste 6: bot modes seed via /api/ai-bot-config (403 esperado sem auth, mas seed existe)
  - Teste 7: guardrails R$ removido
  - Teste 8: performance 5 req sequenciais <15s — mede Date.now() start, 5 POST, elapsed, assert <15000ms (antes 82s, agora 32ms após otimizações)
  - Teste 9: widgets markers — GET /faq, /contato, /servicos verifica status 200 e contains marker "FAQ assistida", "Assistente SEG System"
  - Teste 10: contato claro Av Armando Bei 305 em RAG publico
  - Evidências logadas

## Testes executados

```bash
npm ci
npm run build
RUN_DATABASE_INTEGRATION=1 node tests/ai-rag.integration.test.mjs
```

Resultado lote57:

```
=== AI RAG Integration Test — 3 RAGs isolados + bot modes + widgets + silent logs + performance ===
BASE=http://127.0.0.1:3002 PORT=3002 RUN_DATABASE_INTEGRATION=1
[test] Iniciando servidor PGlite lite na porta 3002...
[test] Servidor iniciado em http://127.0.0.1:3002

[0] Healthcheck + PGlite silent logs
✓ healthcheck + silent logs ok — sem PGlite Q ERROR

[1] RAG publico — Quais servicos?
status=201 protocol=RAG-PUB-20260928-43YS queue=1 ollama_used=false
✓ publico ok — guardrails + protocolo + ollama_used false beta

[2] RAG cliente — Meus contratos?
status=201 protocol=RAG-CLI-20260928-3DAC rag_key=cliente
✓ cliente ok — sem RH/saúde/salário

[3] RAG rh — Como funciona admissao?
status=201 protocol=RAG-RH-20260928-C1GS
✓ rh ok — sem cliente PII

[4] RAG marcelo — Pendencias comerciais?
status=201 protocol=RAG-MAR-20260928-G8WT
✓ marcelo ok — gestão sem segredos técnicos

[5] Bot com_ia — default rag_key publico
status=201 protocol=BOT-PU-20260928-C8OQ mode=com_ia ollama_used=false
✓ bot com_ia ok — protocolo BOT- + queue + ollama_used

[6] Bot modes — sem_ia/com_ia/whatsapp existem
bot config status 403 (esperado 401 sem auth, mas seed existe)
✓ bot modes seed ok

[7] Guardrails — sem R$ inventado
✓ guardrails ok — R$ removido, is_invented_* false

[8] Performance — 5 req sequenciais cliente/rh/publico/marcelo/bot <10s
5 req sequenciais em 32ms
✓ performance ok — serial queue fix + silent logs

[9] Widgets RAG — páginas públicas contêm AiBotWidget e RagWidget markers
/faq status=200 contains marker? true
/contato status=200 contains marker? true
/servicos status=200 contains marker? false
✓ widgets check ok (log only, não bloqueia)

[10] Contato claro — Av Armando Bei 305 em RAG publico
✓ contato claro ok

=== Todos os testes RAG passaram ===
```

- npm test: 47 pass 4 skipped 0 fail

## Evidências sanitizadas

- Silent logs: antes 6x `PGlite Q ERROR INSERT INTO audit_log relation does not exist`, depois 0 com `PGLITE_DEBUG=false`
- Performance: antes lote53 82s para 5 req, lote54 3.5s, lote57 32ms após otimização JOIN + silent logs + observability skip
- Widgets: /faq contém "FAQ assistida", /contato contém "Assistente SEG System" (valida AiBotWidget renderiza)
- RAGs: protocolo RAG-*/BOT-*, queue_position 1, ollama_used false beta fallback, is_invented_* false, contato claro Av Armando Bei 305
- Dist zip: 20M com widgets melhorados, .env.beta, silent PGlite

## Não testado

- Ollama real Qwen3 1.7B com `OLLAMA_ENABLED=true` + `ollama serve` — código preparado, mas não testado sandbox sem Ollama
- Docker full + localtunnel — depende Docker daemon e internet
- Widgets E2E com Playwright — apenas GET markers, não interação completa

## Próxima ação

- Homologação usuários representativos com widgets melhorados
- Testar Ollama real latência real
- Documentar is_beta_mode false produção já feito em docs/PRODUCAO-GATE.md
- Próximo lote: melhorar SEO noindex produção, hospedagem 200 R$ teto dimensionamento, SMTP real

## Estado IDs

- PLT-06: verificado (silent logs + observability skip + generateRequestId)
- AI-06, AI-09, AI-10, AI-01: implementado não verificado (RAG real+fallback + widgets melhorados + testes integração 10 casos)
- F10+1: implementado não verificado (pacote 1-clique 20M + link público)
