# Prompt para próxima sessão — Grupo SEG System — Pós-merge completo

Data: 2026-09-28T22:10Z BRT
Branch arena: arena/01a0e621-gruposegsystemseguranca @ a8e936a lote58-fix
Branch main: main @ 34f7005 Merge arena/01a0e621 completo
Remote: origin/main atualizado com merge, origin/arena/01a0e621 com lote58-fix

## Contexto consolidado

**Objetivo original:** Incorporar `docs/plano-mestre-implementacao-2026-09-28` à `arena/01a0e621`, reconciliar README, 222 requisitos rastreados, lotes pequenos, registrar evidências. Requisito RAG: 3 RAGs isolados cliente (portal cliente contratos/documentos/chamados/agenda sem RH/saúde/salário), RH (admissão/férias/benefícios sem cliente PII), Marcelo (gestão negócio sem segredos técnicos/saúde irrestrita), público (serviços/segmentos/FAQ), modelo Ollama Qwen3 1.7B qwen3:1.7b host http://localhost:11434 max_queue_size 100 max_tokens 2048 fila queue_position/wait_ms, bot modes sem_ia/com_ia/whatsapp singleton_id=1 active_mode com_ia beta padrão, whatsapp 551134372217 template {protocol} {query}, guardrails is_invented_* CHECK false. Novo requisito: download completo executável local poucos cliques já com RAG simulado, link público para Marcelo (localtunnel/ngrok), sem necessidade configurar DB manualmente.

**O que foi feito até lote58:**

- **F0-F7 concluídas:** SEC-01..15, PLT-01..18, PUB-01..10 (088-092,094), CON-01..11, HR-01..24 EMP-01..19, OPS-01..16 CLI-01..15 AST-01..12, FIN-01..16 ADM-01..12 — implementado não verificado, migrações 001-095 idempotentes
- **F8 verificado:** backup restauração testada ambiente isolado is_restore_tested is_isolated, observabilidade healthcheck config flags env isolation maintenance docs, build 66 págs, testes 47 pass
- **F9 implementado não verificado:** EXT-01..17 (085-087), AI-01,06,09,10 (094-095), AI-02..05,07,08 condicional dispensado
- **F10 concluída:** noindex preservado não produtivo
- **F10+1 lote57:** Silenciar PGlite logs por padrão via `isPgliteDebug()` PGLITE_DEBUG=true || LOG_LEVEL=debug, `pgliteLog/pgliteWarn` condicionais, query wrapper sem console.warn ERROR por padrão, serial queue mantido; widgets RAG melhorados `RagWidget.tsx` 202 linhas RAG_COLORS por rag_key (cliente #0b5fff, rh #059669, marcelo #7c3aed, publico #ea580c) SUGGESTIONS 4 por RAG, estados copied/latency/ollama_used, ask customQuery, copy protocolo feedback, badges queue/latency/Ollama REAL vs fallback, spinner; `AiBotWidget.tsx` 183 linhas MODE_COLORS emoji sem_ia 📘 com_ia 🤖 whatsapp 💬 QUICK_ACTIONS 4 copy protocolo WhatsApp link wa.me/{number}?text=Protocolo, badges fila/lat/ollama_used, dev config details; `FaqAssistedWidget.tsx` similar; tests `ai-rag.integration.test.mjs` 10 casos auto-start server PGlite lite porta 3002 rm -rf .data/pglite spawn server.mjs PGLITE_DEBUG false waitForServer /api/health/live 25s, teste0 healthcheck silent logs sem audit_log does not exist e sem PGlite Q ERROR, teste1-4 RAGs isolados guardrails is_invented_* false protocolo RAG-* ollama_used boolean, teste5 bot com_ia BOT-* queue, teste6 bot modes seed, teste7 guardrails R$ removido, teste8 performance 5 req sequenciais <15s 32ms (antes 82s), teste9 widgets markers GET /faq /contato true, teste10 contato claro Av Armando Bei 305; validado RUN_DATABASE_INTEGRATION=1 10 pass + npm test 47 pass 4 skipped + build 66 págs + dist zip 20M
- **F10+1 lote58:** AllowIndex condicional produção gate `layout.tsx` allowIndex = NEXT_PUBLIC_ALLOW_INDEX==='true' && NEXT_PUBLIC_ENV==='production', robots index true apenas se allowIndex senão false, mantém noindex beta por padrão, gate produção documentado; Feedback RAG + custo/token tracking: `beta-pglite-init.sql` + migration `096-ai-rag-feedback-custo-token-rollback.sql` tabelas `ai_rag_feedback` protocolo rag_key query_id bot_session_id rating 1..5 feedback_text is_helpful visitor_name origin + `ai_rag_cost_tracking` prompt_tokens completion_tokens total_tokens cost_cents latency_ms queue_position ollama_used + views `ai_rag_curadoria_view` avg_rating helpful 30d + `ai_rag_cost_24h_view` total_requests avg_tokens sum_tokens avg_cost sum_cost avg_latency real_ollama_count 24h, para curadoria base versão publicação avaliação custo/token rollback AI-09; `ai-rag-api.mjs` handleFeedback POST /api/ai/rag/feedback sameOrigin rating 1..5 feedback_text 500 is_helpful auditLog + handleCostTracking GET /api/admin/ai-rag-cost admin/ti auth aggregates 24h + cost tracking em queries/bot_sessions prompt/completion/total cost_cents latency ollama_used; `server.mjs` rotas /api/ai/rag/feedback /api/public/ai/rag/feedback /api/admin/ai-rag-feedback + /api/admin/ai-rag-cost /api/ai/rag/cost /api/ai-rag-cost-tracking + API_PATH_MATCH; `RagWidget.tsx` + `AiBotWidget.tsx` feedback UI rating 0..5 estrelas ★☆ 32px feedbackText 500 textarea feedbackSent/Loading sendFeedback POST feedback protocol rag_key rating feedback_text is_helpful origin widget_feedback botoes Útil Não útil + cost tracking note; `ai-rag.integration.test.mjs` post() com Origin BASE para sameOrigin, Teste 11 feedback 201 rating 5 helpful true curadoria, Teste 12 custo/token GET cost 403 sem auth mas endpoint existe + PGlite SELECT COUNT AVG cnt 12 avg 289, 12 pass performance 38ms

**Validação atual (lote58):**
- npm ci ok, npm run build 66 págs ok (Next 16.3.6)
- npm test 51 tests 47 pass 4 skipped 0 fail
- RUN_DATABASE_INTEGRATION=1 node tests/ai-rag.integration.test.mjs 12 pass: healthcheck silent logs ok, publico/cliente/rh/marcelo/bot com_ia ok, guardrails ok R$ removido is_invented_* false, performance 5 req sequenciais 38ms <15s, widgets /faq true /contato true, contato claro Av Armando Bei 305, feedback 201 rating 5, cost_tracking cnt 12 avg 289
- dist/seg-system-beta.zip 20M (zip -r . -x node_modules/* .git/* .data/* dist/* .next/* downloads/* *.log) contém 001-096 + beta-pglite-init.sql + feedback/cost + widgets feedback + .env.beta + server.mjs + src + public/images + docs/CONTROLE-IMPLEMENTACAO + evidencias
- Download completo executável local: `npm ci && npm run build && npm start` → PGlite lite auto-migrate 001-096, sem necessidade configurar DB manualmente, RAG simulado fallback, feedback e custo/token tracking funcionando, link público para Marcelo via `npx localtunnel --port 3000` ou `ngrok http 3000`
- Produção gate: layout.tsx allowIndex condicional, beta noindex mantido, produção libera com NEXT_PUBLIC_ALLOW_INDEX=true + NEXT_PUBLIC_ENV=production

**Merge completo:**
- Branch arena/01a0e621 @ a8e936a merged into main @ 34f7005 via --no-ff
- Push origin main 49d366c..34f7005 ok, origin arena 7a641a2..a8e936a ok
- Arquivos no merge: db/beta-pglite-init.sql, 096 migration, dist zip 20M, docs/CONTROLE-IMPLEMENTACAO.md, docs/evidencias/F10-lote54/55/57/58, server.mjs (4568 linhas), layout.tsx allowIndex, AiBotWidget, FaqAssistedWidget, RagWidget, ai-rag-api.mjs, pglite-pool.mjs silent logs, ai-rag.integration.test.mjs 12 testes

**Pendências (222 requisitos rastreados, F10+1 implementado não verificado):**
- Reconciliar README: README atual fala apenas de layout 06, leads, portal cliente etapa 1/2, mas não menciona RAG 3 separados, bot modes, Ollama Qwen3 1.7B, feedback, custo/token, allowIndex gate, download beta 1-clique, dist zip 20M, expor.sh localtunnel/ngrok, homologação RAG beta. Precisa atualizar README com seção RAG beta, widgets, instalação beta 1-clique, link público Marcelo, produção gate, contato claro Av Armando Bei 305
- Homologação usuários representativos: docs/homologacao-rag-beta.md não existe em main após merge (foi removido durante clean, mas existe em evidencias? Precisa recriar docs/homologacao-rag-beta.md com roteiro cliente/RH/Marcelo/publico + bot modes + feedback + custo/token + allowIndex + contato claro + guardrails)
- Testar Docker full: Dockerfile.beta, docker-compose.beta.yaml, start.sh/start.bat, expor.sh/expor.bat localtunnel/ngrok para Marcelo
- Testar Ollama real: OLLAMA_ENABLED=true + ollama pull qwen3:1.7b, latência real, ollama_used true, cost_tracking real
- Produção: autorização explícita para remover noindex, configurar hospedagem 200 R$ teto, SMTP real, CNPJ, logotipo, política aprovada, backup restauração testada ambiente isolado, D-01..D-13
- 222 requisitos: verificar docs/CONTROLE-IMPLEMENTACAO.md rastreio, atualizar checkpoint com F10+1 lote58 e próxima ação
- Registrar evidências: F10-lote58 já criado, mas precisa evidência Docker, Ollama real, homologação usuários
- Não publicar em produção nem contratar serviços automaticamente até autorização explícita

## Prompt para próxima sessão (copiar e colar)

```
Você está na branch main @ 34f7005 (merge arena/01a0e621 completo lote58). Branch arena/01a0e621 @ a8e936a lote58-fix já mergeada. Objetivo: continuar incorporação docs/plano-mestre-implementacao-2026-09-28, reconciliar README, 222 requisitos rastreados, lotes pequenos, registrar evidências.

Contexto atual:
- F0-F7 concluídas, F8 verificado, F9 implementado não verificado, F10 concluída, F10+1 implementado não verificado (AI RAG 3 separados cliente/RH/Marcelo/publico + Ollama Qwen3 1.7B qwen3:1.7b host http://localhost:11434 max_queue_size 100 max_tokens 2048 fila queue_position/wait_ms + bot modes sem_ia/com_ia/whatsapp singleton_id=1 active_mode com_ia beta padrão whatsapp 551134372217 template {protocol} {query} + guardrails is_invented_* false + contato claro Av Armando Bei 305 + silent logs pglite-pool isPgliteDebug() gate + widgets RagWidget 202 linhas RAG_COLORS SUGGESTIONS 4 + AiBotWidget 183 linhas MODE_COLORS emoji QUICK_ACTIONS 4 + FaqAssistedWidget + feedback RAG ai_rag_feedback rating 1..5 is_helpful + custo/token ai_rag_cost_tracking prompt/completion/total cost_cents latency ollama_used + views curadoria 30d e cost 24h + handleFeedback POST /api/ai/rag/feedback + handleCostTracking GET /api/ai/rag/cost + cost tracking em queries/bot_sessions + server.mjs rotas + layout.tsx allowIndex = NEXT_PUBLIC_ALLOW_INDEX==='true' && NEXT_PUBLIC_ENV==='production' gate noindex + dist zip 20M download completo executável local poucos cliques RAG simulado + link público Marcelo localtunnel/ngrok + sem necessidade configurar DB manualmente)
- Validação: npm ci ok, npm run build 66 págs, npm test 47 pass 4 skipped, RUN_DATABASE_INTEGRATION=1 node tests/ai-rag.integration.test.mjs 12 pass (healthcheck silent logs sem audit_log does not exist e sem PGlite Q ERROR, RAGs isolados publico/cliente/rh/marcelo, bot com_ia BOT-*, guardrails R$ removido, performance 5 req 38ms <15s, widgets /faq true /contato true, contato claro, feedback 201 rating 5, cost_tracking cnt 12 avg 289), dist zip 20M
- Merge completo: main @ 34f7005 contém db/beta-pglite-init.sql, migration 096, server.mjs rotas feedback/cost, layout.tsx allowIndex, RagWidget/AiBotWidget/FaqAssistedWidget melhorados com feedback UI 5 estrelas + textarea 500 + Útil/Não útil + cost tracking note, pglite-pool silent logs, ai-rag.integration.test.mjs 12 testes, docs/CONTROLE-IMPLEMENTACAO.md checkpoint 21:42Z BRT lote58 + evidencias F10-lote54/55/57/58
- Pendências: reconciliar README (adicionar seção RAG beta 3 RAGs + bot modes + Ollama + feedback + custo/token + allowIndex gate + instalação beta 1-clique + dist zip + expor.sh + contato claro), recriar docs/homologacao-rag-beta.md com roteiro homologação usuários representativos cliente/RH/Marcelo/publico + bot modes + feedback + custo/token + guardrails + contato claro, testar Docker full Dockerfile.beta docker-compose.beta.yaml start.sh expor.sh localtunnel para Marcelo, testar Ollama real OLLAMA_ENABLED=true ollama pull qwen3:1.7b latência real ollama_used true, atualizar docs/CONTROLE-IMPLEMENTACAO.md com 222 requisitos rastreados e próximo passo homologação, registrar evidências F10-lote59-docker-ollama-homologacao, não publicar em produção nem contratar serviços automaticamente até autorização explícita, preservar código mais recente

Tarefa próxima sessão:
1. Inventário: verificar README atual vs RAG implementação, verificar se docs/homologacao-rag-beta.md existe, verificar Dockerfile.beta e expor.sh, verificar 222 requisitos em docs/CONTROLE-IMPLEMENTACAO.md
2. Reconciliar README: adicionar seção RAG beta, 3 RAGs isolados, bot modes, Ollama Qwen3 1.7B, feedback, custo/token, allowIndex gate, instalação beta 1-clique (npm ci && npm run build && npm start + PGlite lite auto-migrate), dist zip 20M download completo, link público Marcelo via localtunnel/ngrok, contato claro Av Armando Bei 305, guardrails, sem invenção preço/cobertura/licença/prazo
3. Recriar docs/homologacao-rag-beta.md com roteiro homologação usuários representativos (cliente, RH, Marcelo, público) + bot modes sem_ia/com_ia/whatsapp + feedback rating + custo/token + allowIndex + contato claro + guardrails + protocolo preservado
4. Testar Docker beta e expor.sh localtunnel (se Docker daemon ausente sandbox, documentar bloqueio e criar evidência)
5. Documentar teste Ollama real opcional (OLLAMA_ENABLED=true) com evidência latência real vs fallback
6. Atualizar docs/CONTROLE-IMPLEMENTACAO.md checkpoint novo lote59 com validação npm test + RAG 12 pass + build 66 págs + dist zip + homologação pendente
7. Registrar evidência docs/evidencias/F10-lote59-...md com testes, decisões, bloqueios, próximo passo
8. Build + zip 20M atualizado + commit + push arena/01a0e621 + merge main se necessário, sem publicar produção

Restrições:
- Preservar código mais recente, não substituir aplicação pela versão documental
- Reconciliar links README
- Começar por inventário e correções segurança seguindo dependências e critérios aceite plano
- Implementar por lotes pequenos funcionais, usar agentes paralelos somente quando houver suporte e tarefas independentes
- Manter 222 requisitos rastreados
- Registrar testes, evidências, decisões, bloqueios e próximo passo ao final de cada execução
- Não marcar telas demonstrativas ou integrações simuladas como funcionalidades concluídas
- Continuar com implementação concreta, não apenas planejamento
- Não publicar em produção nem contratar serviços automaticamente
- Branch fixa arena/01a0e621-gruposegsystemseguranca, push --force se necessário, merge main com --no-ff

Validação esperada próxima sessão:
- README reconciliado com RAG beta, instalação 1-clique, dist zip, expor.sh, contato claro, guardrails
- docs/homologacao-rag-beta.md existe com roteiro completo
- npm test 47 pass 4 skipped, RUN_DATABASE_INTEGRATION=1 12 pass 38ms, build 66 págs, dist zip 20M
- docs/CONTROLE-IMPLEMENTACAO.md atualizado checkpoint lote59
- Evidência F10-lote59 criada
- Commit + push arena + main merge se necessário
```

## Arquivos chave para próxima sessão

- `src/app/layout.tsx`: allowIndex gate produção
- `src/server/pglite-pool.mjs`: silent logs isPgliteDebug gate
- `src/server/ai-rag-api.mjs`: handleIndexes, handleDocuments, handleQueries, handleBotConfig, handleBotSessions, handleChunks, handleFeedback, handleCostTracking + cost tracking
- `server.mjs`: rotas /api/ai/rag/feedback, /api/ai/rag/cost, etc + API_PATH_MATCH
- `src/components/RagWidget.tsx`: 202 linhas + feedback UI 5 estrelas + cost tracking
- `src/components/AiBotWidget.tsx`: 183 linhas + feedback UI
- `src/components/FaqAssistedWidget.tsx`: melhorado
- `tests/ai-rag.integration.test.mjs`: 12 testes auto-start PGlite lite porta 3002, silent logs, performance 38ms, feedback 201, cost_tracking cnt 12
- `db/beta-pglite-init.sql`: lite com audit_log + observability_* + ai_rag_feedback + ai_rag_cost_tracking
- `db/migrations/096-ai-rag-feedback-custo-token-rollback.sql`: feedback + cost + views curadoria
- `dist/seg-system-beta.zip`: 20M download completo executável local
- `docs/CONTROLE-IMPLEMENTACAO.md`: checkpoint 21:42Z BRT lote58
- `docs/evidencias/F10-lote58-allowindex-feedback-custo-token.md`: evidência lote58
- `docs/evidencias/F10-lote57-silent-pglite-widgets-rag-integration.md`: evidência lote57
- `README.md`: precisa reconciliação RAG beta

## Comandos validação

```bash
npm ci
npm run build
npm test
RUN_DATABASE_INTEGRATION=1 node tests/ai-rag.integration.test.mjs
rm -rf .data/pglite && PORT=3002 BIND_HOST=127.0.0.1 PGLITE_DEBUG=false node server.mjs &
curl -s http://127.0.0.1:3002/api/health/live
curl -X POST http://127.0.0.1:3002/api/ai/rag -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:3002" -d '{"rag_key":"publico","query":"Quais servicos?"}'
curl -X POST http://127.0.0.1:3002/api/ai/rag/feedback -H "Content-Type: application/json" -H "Origin: http://127.0.0.1:3002" -d '{"protocol":"RAG-PUB-...","rag_key":"publico","rating":5,"is_helpful":true}'
zip -r dist/seg-system-beta.zip . -x "node_modules/*" ".git/*" ".data/*" "dist/*" ".next/*" "downloads/*" "*.log"
```

## Próximo passo imediato

Reconciliar README + recriar homologacao-rag-beta.md + testar Docker/expor.sh + evidência lote59 + commit/push arena + merge main
