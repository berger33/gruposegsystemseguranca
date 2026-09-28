# Plano Mestre Implementação — 2026-09-28

Incorporação do plano mestre com 222 requisitos rastreados, foco em RAG 3 isolados + bot modes + pacote beta 1-clique.

## Resumo executivo

Este documento consolida `docs/PLANO-MESTRE-IMPLEMENTACAO.md` com os requisitos adicionais de 2026-09-28:

- **3 RAGs isolados** cliente / RH / Marcelo + público, informações apenas áreas pertinentes
- **Modelo Ollama Qwen3 1.7B** `qwen3:1.7b`, host `http://localhost:11434`, `max_queue_size 100`, `max_tokens 2048`, fila `queue_position/wait_ms`
- **Bot modes** `sem_ia` / `com_ia` / `whatsapp`, singleton_id=1, `active_mode com_ia` beta padrão, WhatsApp `551134372217` template `{protocol} {query}`
- **Guardrails** `is_invented_price/coverage/license/deadline` CHECK false, sem preço fictício
- **Download completo executável local poucos cliques já com RAG simulado**, link público para Marcelo via `localtunnel`/`ngrok`, sem necessidade configurar DB manualmente

## Requisitos RAG detalhados

### RAG Cliente — `rag_key=cliente`
- **Escopo:** portal cliente contratos/documentos/chamados/agenda/financeiro quando habilitado
- **Sem:** RH/saúde/salário detalhado, dados de outros clientes
- **Fonte:** `ai_rag_documents` com `rag_key=cliente`, `keywords` cliente/portal/contratos/documentos/chamados/agenda/financeiro
- **Isolamento:** query só busca `ai_rag_documents WHERE rag_key='cliente' AND is_published=true AND is_approved=true`

### RAG RH — `rag_key=rh`
- **Escopo:** admissão/férias/benefícios/treinamentos/ponto/folha
- **Sem:** dados cliente PII (CPF cliente, etc)
- **Módulo:** Andreia RH, acesso por campo/categoria
- **Fonte:** `ai_rag_documents` `rh`

### RAG Marcelo — `rag_key=marcelo`
- **Escopo:** gestão negócio, indicadores, aprovações, comercial, operacional, financeiro, margem, renovação, risco
- **Sem:** segredos técnicos, saúde irrestrita, dados pessoais sensíveis
- **Visão:** meu dia, pendências reais, leads, oportunidades, cobertura, SLA, implantação

### RAG Público — `rag_key=publico`
- **Escopo:** serviços validados (6), segmentos, FAQ revisada, contato claro Av. Armando Bei 305, tel (11) 3437-2217
- **Sem:** preço fictício, cobertura/licença/prazo inventado, promessa sem reserva
- **Padrão beta:** `default_rag_key=publico`

### Modelo Ollama Qwen3 1.7B
- `model_name=qwen3:1.7b`, `ollama_host=http://localhost:11434`, `max_queue_size=100`, `max_tokens=2048`, `temperature=0.7`
- Fila simulada in-memory `queueState.current % max_queue_size`, `queue_wait_ms` random 100-500ms, `queue_position`
- Todo mundo atendido em fila, sem invenção
- **Beta sem Ollama:** funciona simulado, sem necessidade de `ollama pull`. Quando Ollama disponível, trocar `OLLAMA_HOST`.

### Bot modes
- `sem_ia`: usa `pub_faq_assisted_rules` aprovadas, sem LLM
- `com_ia`: Ollama Qwen3 1.7B + RAG específico por perfil, fila, base aprovada apenas área pertinente
- `whatsapp`: redireciona para WhatsApp `551134372217` com template `Olá, vim do site Grupo SEG System. Protocolo {protocol}. Pergunta: {query}.`
- Config singleton `ai_bot_config singleton_id=1 active_mode=com_ia is_dev_mode=true is_beta_mode=true default_rag_key=publico`
- Campo desenvolvedor altera dinâmica chat bot sem IA / com IA / WhatsApp, padrão com IA beta

## Pacote beta 1-clique

### Lite PGlite (sem Docker)
- `server.mjs` fallback `getPGlitePool()` se `DATABASE_URL` ausente
- `db/beta-pglite-init.sql` schema mínimo: `site_visual_config`, `public_leads`, `auth_*`, `ai_rag_indexes` 4, `ai_rag_documents` 4, `ai_rag_chunks` 3 por doc, `ai_bot_modes` 3, `ai_bot_config` singleton com_ia, `pub_faq_assisted_rules` 3
- `src/server/pglite-pool.mjs` modo lite: se `beta-pglite-init.sql` existe, aplica só ele, não 95 migrações full
- `start.sh` / `start.bat`: `npm ci + npm run build + PORT=3000 node server.mjs`
- RAG fila simulada, sem Ollama real

### Full Docker
- `Dockerfile.beta` multi-stage Node 22
- `docker-compose.beta.yaml`: postgres:17-alpine + app, `DATABASE_URL` postgres://..., 95 migrações full via `pglite-pool.mjs` ou `DATABASE_URL`
- `.env.beta` com secrets beta
- Opcional `ollama` service comentado

### Link público Marcelo
- `expor.sh` / `expor.bat`: `npx localtunnel --port 3000` gera `https://*.loca.lt`
- Alternativa `npx ngrok http 3000`

## 222 requisitos rastreados

Os 222 requisitos do plano mestre permanecem rastreados em `docs/CONTROLE-IMPLEMENTACAO.md`. Cada lote pequeno registra evidências, decisões, bloqueios e próximo passo.

Critérios de aceite RAG:
- [x] 4 RAGs criados com `rag_key` único
- [x] `model_name qwen3:1.7b`, `max_queue_size 100`, `max_tokens 2048`
- [x] Documentos por RAG apenas área pertinente
- [x] Queries com `protocol`, `queue_position`, `queue_wait_ms`, `is_invented_* false`
- [x] Bot config singleton `active_mode com_ia`, WhatsApp `551134372217`
- [x] API `POST /api/ai/rag` e `POST /api/ai/bot` funcionando PGlite sem DB
- [x] `server.mjs` sem `DATABASE_URL` usa PGlite
- [x] `start.sh/bat` 1-clique
- [x] `expor.sh/bat` link público
- [x] `Dockerfile.beta` + `docker-compose.beta.yaml` full

## Evidências

- `rm -rf .data/pglite && node --input-type=module getPGlitePool`: `beta-pglite-init.sql applied`, `ai_rag_indexes cnt 4`, `model_name qwen3:1.7b max_queue_size 100`
- `PORT=3002 node server.mjs`: `Using PGlite fallback`, `listening on 0.0.0.0:3002`, `health/live healthy`, `POST /api/ai/rag rag_key=publico` retorna 6 serviços validados com `queue_position`
- Build: 66 páginas, 46 rotas, `next build` ok sem `DATABASE_URL`
- Zip beta: `dist/seg-system-beta.zip` 20M

## Próximos lotes

- Ativar Ollama real Qwen3 1.7B e testar latência real
- Migrar PGlite para Postgres full em Docker e validar 95 migrações
- Adicionar testes de integração RAG com `RUN_DATABASE_INTEGRATION=1`
- Documentar troca `is_beta_mode false` para produção

## Referências

- `docs/PLANO-MESTRE-IMPLEMENTACAO.md` — plano completo
- `README-INSTALACAO.md` — instruções 1-clique + RAG + link público
- `db/beta-pglite-init.sql` — schema lite
- `db/migrations/095-ai-rag-cliente-rh-marcelo-ollama-qwen3-bot-modes.sql` — schema full
- `src/server/ai-rag-api.mjs` — implementação RAG + bot modes fila simulada
