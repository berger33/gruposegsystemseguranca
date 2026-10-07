# Fase 0 — Auditoria do RAG existente, diagnóstico de ambiente e proposta fechada da PR 1

- Data: 2026-10-06
- Branch de trabalho: `arena/611f8dd7-gruposegsystemseguranca`
- Base: `main` @ `c059e12` (merge da PR #181)
- Natureza deste documento: **auditoria e proposta. Nenhum arquivo de código, migração ou schema foi alterado.**
- Regra aplicada: evoluir o RAG existente (`/api/ai/answer`, `ai_rag_*`, painel `/admin/ti`), **sem criar um
  segundo RAG paralelo** nem recriar PRs/branches antigas.

---

## 1. Reconciliação do repositório, migrações e PRs

| Item | Estado verificado em 2026-10-06 |
|---|---|
| `origin/main` | `c059e12` — merge da PR #181 (UX-11 / EXT-10) |
| Branch da sessão | `arena/611f8dd7-gruposegsystemseguranca`, criada de `c059e12` |
| `git status --short` no início | vazio (árvore limpa) |
| Migrações | 174 arquivos, `001`–`174` contíguos e únicos; última `174-auth-permissions-id-default.sql` |
| Próxima migração livre | **175** |
| Migrador | `scripts/migrate-site-visual.mjs` (lista explícita 001–174 + ledger `__migrations` com checksum SHA-256; recusa banco remoto sem `ALLOW_REMOTE_MIGRATIONS=true`) |
| Migrações com conteúdo de IA | `087` (AI-10 automações), `094` (FAQ assistida/handoff), `095` (RAG/`ai_rag_*`/`ai_bot_*`), `096` (feedback/custo/rollback), `173` (escopo de conta no RAG do cliente) |
| PRs abertas | **#173** (`arena/74f53b85…`) e **#170** (`arena/c2ce0741…`) — ambas 1 commit à frente e 26–28 atrás da `main`, temas **já integrados** por #174 e #172 |
| Branches no remoto | 172 `arena/*`. Não criar novas branches; todo o trabalho permanece nesta sessão |
| Documento de continuidade anterior | `docs/PROMPT-CONTINUACAO-F14-IA-RAG-REAL.md` (F14) — pede exatamente esta auditoria antes de codar |

Recomendação de higiene (não executada sem ordem): **fechar #173 e #170 como substituídas**, sem rebase e sem
nova branch — o conteúdo delas já está na `main` via #174/#172.

### 1.1 Evidências coletadas nesta sessão (comandos realmente executados)

| Comando | Resultado |
|---|---|
| `npm ci` | 82 pacotes instalados, sem erro |
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | **850 pass / 0 fail / 0 skipped** |
| `node scripts/qa-wave0-static.mjs` | **5/5 OK** (imports, deps, migrações 001–174 contíguas e registradas no migrador, CI sem bypass) |
| `npm run build` | exit 0 (Next 16.3.6, build de produção gerado) |
| `npm audit --audit-level=high` | 0 vulnerabilidades |
| `npm run test:rag` (PGlite beta, `OLLAMA_ENABLED=false`, HTTP real) | **passou**: `RAG HTTP smoke: rota canônica, escopo privado e rascunho oculto OK` |
| PostgreSQL descartável (`embedded-postgres` 17.9, cluster temporário em loopback) | sobe em <1 s; extensões disponíveis: `pg_trgm` 1.6, `unaccent` 1.1, `fuzzystrmatch` 1.2; `CREATE EXTENSION vector` → **`extension "vector" is not available`**; `to_tsvector('portuguese', …)` funciona |
| Ollama | **ausente**: `curl 127.0.0.1:11434/api/tags` → conexão recusada (exit 7); nenhum modelo local; nenhum download automático realizado |
| Chromium real | disponível via `@sparticuz/chromium` (`executablePath()` → `/tmp/chromium`) — gate de UI é viável neste ambiente |

O smoke HTTP acima é a prova dinâmica do comportamento **atual** da rota canônica, e é relevante para a PR 1:

- `POST /api/ai/rag` e aliases beta → `410 legacy_ai_retired` (aponta para `/api/ai/answer`);
- pergunta sem trecho relacionado → `200` com `reason=no_relevant_source`, `sources=[]`, `ollama_used=false`
  (**não chama o modelo**);
- `cliente` / `rh` / `marcelo` sem sessão → `401`;
- documento em rascunho → invisível; depois de publicado com `OLLAMA_ENABLED=false` → `503 ollama_disabled`;
- depois de arquivado → volta a `no_relevant_source`.

---

## 2. Inventário objetivo AI-01 … AI-10

Classificação usada: `real_verificado` · `fallback_explicito` · `schema_sem_jornada` · `pendente` · `bloqueado_por_decisao`.
“Verificado” aqui significa **executado e observado nesta sessão**; nada de IA foi considerado verificado sem
Ollama real disponível.

### AI-01 — FAQ pública com respostas aprovadas e transferência humana
- **Rotas**: `POST /api/ai/answer` (canônica, `src/server/ai-rag-real-api.mjs`, `server.mjs:4606`);
  `POST /api/faq-assisted` → `src/server/faq-answer-api.mjs` (busca determinística em `cms_contents` do tipo `faq`
  publicadas, **sem modelo**, com `need_handoff`); `POST /api/ai/bot` → `src/server/ai-rag-api.mjs` (legado,
  com *fallback simulado* rotulado); `/api/ai/rag*` → `410`.
- **Telas**: `/contato` (`RagWidget ragKey="publico"`), `/faq` (`FaqAssistedWidget`), `/admin/ti` (bancada de teste).
- **Tabelas/migrações**: `ai_rag_indexes/documents/chunks/queries` (095), `ai_rag_feedback`/`ai_rag_cost_tracking`
  (096), `pub_faq_assisted_rules`/`pub_faq_sessions`/`pub_faq_messages`/`pub_human_handoff_requests` (094),
  `cms_contents` (088).
- **Inferência real**: só na rota canônica e só com `OLLAMA_ENABLED=true` + fonte recuperada. Verificado nesta
  sessão apenas até o limite do serviço local: com Ollama ausente a rota responde `503 ai_unavailable`
  (não simula). A inferência real **não pôde ser verificada** aqui.
- **Escopo antes da recuperação**: sim — `rag_key` validado contra allowlist e o `WHERE` do SQL já carrega
  `is_approved/is_published/is_active` do índice e do documento.
- **Corpus**: curado manualmente no painel `/admin/ti` (texto colado ou `.txt`/`.md` lido no navegador).
- **Testes**: `tests/ai-rag-public-scope.test.mjs`, `tests/ai-rag-real-scope.test.mjs` (unit),
  `tests/ai-rag.integration.test.mjs` (HTTP + PGlite, roda no CI).
- **Riscos**: prompt injection não é testada com documento envenenado; `/api/ai/bot` mantém caminho com resposta
  de fallback (rotulada) que pode ser confundida com IA; `docs/homologacao-rag-beta.md` (2026-09-28) descreve o
  roteiro de aceite do endpoint **aposentado** (`/api/ai/rag`, hoje `410`) — documento histórico que não serve
  mais como script de homologação.
- **Classificação**: `fallback_explicito` no caminho legado `/api/ai/bot`; `pendente` quanto à inferência real
  (bloqueio de ambiente, não de código). Escopo e ausência honesta de fonte: `real_verificado`.

### AI-02 — Resumo de histórico comercial autorizado com links de origem
- **Rotas/telas**: não existe rota nem tela de resumo por IA. Os dados existem no CRM
  (`crm_interactions`, `crm_opportunities`, `crm_proposals`, migrações 014–031, 106).
- **Classificação**: `pendente`.

### AI-03 — Rascunho de proposta a partir de catálogo e custos aprovados
- **Rotas/telas**: `crm_proposals` versionadas e catálogo existem; **nenhuma geração por IA**. Sem escrita de
  negócio por modelo.
- **Classificação**: `pendente`.

### AI-04 — Classificação/sugestão de resposta a chamados sob revisão
- **Rotas/telas**: `cli_tickets_v2` (075) tem categoria/prioridade; **nenhuma classificação por IA**.
- **Classificação**: `pendente`.

### AI-05 — Extração de campos de documentos em ambiente privado
- **Rotas/telas**: política de retenção e inventário de privacidade existem (`047-plt09-privacy`,
  `retention_policies`, `privacy_data_inventory`); **não há extração, nem parser, nem staging de documento**.
- **Classificação**: `bloqueado_por_decisao` (depende de decisão de retenção/LGPD e de parser seguro).

### AI-06 — Busca interna/RAG filtrada por permissão antes de recuperar
- **Rotas**: `POST /api/ai/answer` (recuperação com escopo no SQL, `src/server/ai-rag-real-api.mjs:38-56`);
  curadoria em `/api/admin/ai-rag-indexes`, `/api/admin/ai-rag-documents`, `/api/admin/ai-rag-chunks`,
  `/api/admin/ai-rag-queries`, `/api/admin/ai-bot-sessions` (`src/server/ai-rag-api.mjs`).
- **Escopo aplicado antes da recuperação — como funciona hoje**:
  - `publico` → visitante, apenas documentos públicos aprovados/publicados de índice aprovado/publicado/ativo;
  - `cliente` → exige sessão de cliente válida (`client_access_grants` não revogado + `client_accounts.status='active'`)
    e filtra `d.client_account_id` vinculado (migração 173);
  - `rh` → sessão staff `rh` ou `admin`; `marcelo` → sessão staff `marcelo` ou `admin`; papéis trocados → `403`;
  - curadoria: `admin` (todas as áreas), `rh` (só `rh`), `ti` (`publico`, `cliente`); `404 not_found` para id fora
    do escopo (não vaza existência).
- **Testes**: unit de escopo + smoke HTTP (401/403, rascunho invisível, arquivado some).
- **Limite real**: a **recuperação é 100 % lexical** — `rankApprovedChunks()` pontua em JS por contagem de termos
  (com heurística de prefixo de 5 caracteres) sobre no máximo 150 chunks trazidos do banco, sem limiar mínimo e
  com `LIMIT 3`. Não há vetor, não há ranking fundido, não há `pg_trgm`/FTS de PostgreSQL.
- **Classificação**: `real_verificado` quanto a **escopo antes da recuperação**; `pendente` quanto a
  **recuperação semântica/híbrida**.

### AI-07 — Relatório gerencial narrado sobre cálculo validado
- **Rotas/telas**: `crm_report_snapshots`, `fin_management_results` (margem `GENERATED`) existem; **não há narração
  por IA** e o modelo não recebe números de negócio.
- **Classificação**: `pendente`.

### AI-08 — Inconsistências cadastrais e próximas ações com justificativa/fonte
- **Rotas/telas**: não existe. Sem detecção por IA.
- **Classificação**: `pendente`.

### AI-09 — Curadoria, versão, publicação, feedback, avaliação, custo/token e rollback
- **Rotas**: `POST/PATCH/GET /api/admin/ai-rag-documents` (curadoria, chunks de 500 caracteres gerados no
  *insert*, `version`, `status`), `PATCH /api/admin/ai-rag-indexes` (aprovar/publicar/arquivar com histórico em
  `ai_rag_history`), `/api/admin/ai-rag-chunks` (leitura), `/api/ai/rag/feedback` (rating 1–5 + `is_helpful`),
  `/api/admin/ai-rag-cost` (custo/token 24 h).
- **Defeitos objetivos encontrados (código, não opinião)**:
  1. **Feedback da rota canônica é impossível de registrar.** `POST /api/ai/answer` devolve protocolo no formato
     `RAG-PUB-<ms>-<hex>` sem gravar nada; `handleFeedback()` procura o protocolo em `ai_rag_queries` e
     `ai_bot_sessions` e, não achando, responde `404 protocol_not_found`. Além disso, `ai_rag_queries.protocol`
     tem `CHECK (protocol ~ '^RAG-[A-Z]+-[0-9]{8}-[A-Z0-9]{4}$')` — o protocolo da rota canônica **nem caberia**
     nessa coluna. Ou seja: o widget público mostra estrelas e o registro nunca acontece.
  2. **Custo/token é simulado** no caminho legado: `cost_cents = Math.ceil(total_tokens * 0.02)` com comentário
     “simulado 0.02 cent por token quando real”. A rota canônica, por decisão documentada, **não grava** custo —
     logo não existe métrica de custo utilizável hoje.
  3. **Rollback não existe como operação**: a única menção é um texto de resposta (`note: '… custo/token e
     rollback'`); não há endpoint nem restauração de versão anterior.
  4. **`embedding_status` e `embedding_vector`** (095 / `beta-pglite-init.sql`) são placeholders legados: nenhum
     código grava vetor, e o default `pendente` não representa estado real de indexação.
- **Classificação**: `schema_sem_jornada` (curadoria existe e funciona para texto; feedback/custo/rollback não
  fecham jornada) + `fallback_explicito` no caminho legado de custo.

### AI-10 — Automações determinísticas antes de agentes autônomos
- **Rotas/telas**: `ext-compliance-scheduler` (timer **opt-in** por `EXT07_EVALUATE_INTERVAL_SECONDS` +
  identidade staff revalidada a cada tick, ledger `ext_compliance_evaluation_runs`, migração 156),
  regras de alerta contratual, tarefas de CRM, lembretes de cobrança. Nenhum agente autônomo, nenhuma escrita
  por modelo.
- **Classificação**: `real_verificado` como automação determinística (com opt-in explícito); não é “IA”.

### Resumo do inventário

| ID | Classificação nesta auditoria | O que falta para “verificado” |
|---|---|---|
| AI-01 | escopo/sem-fonte `real_verificado`; inferência `pendente`; legado `fallback_explicito` | Ollama local + modelo instalado pelo proprietário; remover/aposentar `/api/ai/bot` com fallback |
| AI-02 | `pendente` | rota, tela, contrato de escopo e teste |
| AI-03 | `pendente` | idem, com trava de preço/escopo |
| AI-04 | `pendente` | idem, com revisão humana obrigatória |
| AI-05 | `bloqueado_por_decisao` | decisão de retenção/LGPD + parser seguro |
| AI-06 | escopo `real_verificado`; semântica `pendente` | embeddings reais + busca híbrida (escopo já pronto) |
| AI-07 | `pendente` | cálculo por código + narração restrita |
| AI-08 | `pendente` | regras determinísticas + justificativa/fonte |
| AI-09 | `schema_sem_jornada` | persistir resposta/protocolo, feedback funcional, custo honesto, rollback |
| AI-10 | `real_verificado` (determinístico) | — |

---

## 3. Diagnóstico de Ollama, modelos e armazenamento vetorial

### 3.1 Ollama
- **Não está instalado nem acessível neste ambiente** (loopback recusado). Nenhum modelo disponível
  (`qwen3:1.7b` citado na documentação é expectativa do PC do operador, não fato deste ambiente).
- Nenhum download automático foi feito — e não deve ser.
- Consequência para o plano: **a prova de inferência real e de embedding real só pode ser produzida na máquina
  do operador** (`ollama pull` manual). Neste ambiente, o que se prova é o **estado explícito de indisponibilidade**
  (`ai_unavailable` / `embedding_unavailable`), que é justamente um requisito da Fase 1.
- Modelo configurado hoje: `OLLAMA_MODEL` (default `qwen3:1.7b`), host `OLLAMA_BASE_URL`
  (`http://127.0.0.1:11434`), validação de loopback no código da rota canônica. `.env.example` já traz
  `OLLAMA_ENABLED=false`.
- **Modelo de embeddings: não definido.** Não existe `OLLAMA_EMBED_MODEL` nem chamada a `/api/embed` em lugar nenhum.

### 3.2 Armazenamento vetorial
- **`pgvector` não está disponível** no PostgreSQL descartável usado pelos gates (binários `embedded-postgres`
  17.9 beta: `CREATE EXTENSION vector` falha com “extension "vector" is not available”). Esse é o mesmo motor que
  roda no CI (`ubuntu-latest`, `npm ci` + `scripts/qa-*-postgres.mjs`).
- Disponíveis e comprovados: `pg_trgm`, `unaccent`, `fuzzystrmatch` e busca textual em português
  (`to_tsvector('portuguese', …)`) — base para uma camada lexical séria, hoje inexistente.
- Portanto: **não é possível implementar busca vetorial com índice ANN (HNSW/ivfflat) sem decisão de infraestrutura**
  (instalar/compilar `pgvector` no PostgreSQL do operador e, se quisermos gate no CI, trocar o motor dos testes).
- Alternativa honesta, se `pgvector` não for autorizado: guardar o **vetor real** produzido por Ollama
  (`/api/embed`) em coluna portátil (`real[]` + dimensão) e calcular **similaridade de cosseno exata** sobre o
  conjunto **já filtrado por escopo e limitado**; expor `vector_backend: "pgvector" | "exact"` na resposta e
  documentar que não é ANN. É busca vetorial real (não lexical disfarçada), mas não escala para milhões de chunks.
- Nada de “semântica aproximada por palavra-chave”: se não houver vetor, a resposta/payload dirá
  `retrieval_mode: "lexical_only"`.

### 3.3 Infraestrutura de suporte (já existente, reutilizável)
- PostgreSQL descartável em loopback com senha aleatória e `onLog` silenciado (`scripts/qa-*.mjs`);
- PGlite beta para o caminho 1-clique: **atenção** — em modo beta o servidor aplica `db/beta-pglite-init.sql`
  (marcador `beta-pglite-init-v3.sql`) e **retorna antes** das migrações individuais
  (`src/server/pglite-pool.mjs:196-220`); qualquer tabela nova do RAG precisa existir também nesse init, com
  marcador novo, ou a rota precisa degradar com clareza em beta;
- Chromium real empacotado (`@sparticuz/chromium`) e padrão de gate HTTP+PG+Chromium já consolidado em
  `tests/ux-*.integration.test.mjs` e `scripts/qa-ux-*-postgres.mjs`.

---

## 4. Riscos e decisões pendentes

| # | Risco / pendência | Impacto | Encaminhamento proposto |
|---|---|---|---|
| R1 | `pgvector` indisponível no motor de testes e possivelmente no PC do operador | bloqueia ANN; decisão de arquitetura | decidir com o proprietário (instalar `pgvector` × backend exato portátil × ambos com detecção) |
| R2 | Sem modelo de embeddings definido | bloqueia Fase 1 inteira | decidir modelo e exigir `ollama pull` manual no PC |
| R3 | Feedback da rota canônica nunca é registrado (protocolo não persistido + CHECK de formato) | satisfação não mensurável (Fase 4) | PR 1: ledger `ai_rag_answer_events` + feedback ligado a ele |
| R4 | `cost_cents` simulado no caminho legado | risco de declarar custo inexistente | PR 1: não gravar custo sem preço configurado (`NULL` + `cost_source='unavailable'`) |
| R5 | `/api/ai/bot`, `/api/admin/ai-bot-sessions`, `/api/admin/ai-rag-queries` ainda ativos com fallback rotulado | confusão “IA × fallback”; dados de auditoria misturados | decidir aposentadoria em PR próprio, mantendo curadoria |
| R6 | Corpus tratado como não confiável: defesa existe só no system prompt | prompt injection no conteúdo publicado | PR 1: teste com documento envenenado + título/trecho delimitados e política explícita |
| R7 | `docs/homologacao-rag-beta.md` descreve endpoints aposentados (`410`) | aceite humano inválido por engano | marcar o documento como histórico e publicar roteiro novo |
| R8 | `embedding_status`/`embedding_vector` legados | podem ser lidos como “embedding real” | PR 1: não reutilizar como prova; criar tabela própria e exibir estado real |
| R9 | Chunking fixo de 500 caracteres, sem sobreposição, sem página/seção | qualidade ruim em documento longo/PDF | PR 2 (ingestão) define chunking com origem; PR 1 apenas mantém compatibilidade |
| R10 | Nenhum caminho de arquivo no servidor (`.txt`/`.md` são lidos no navegador) e limite de 20 000 caracteres | bloqueia ingestão real | PR 2 |
| R11 | Rota pública chama o modelo com o texto do corpus no *user message* | decisão de segurança aceitável hoje, mas sem trilha de retenção | definir política de retenção de pergunta/resposta (pergunta Q3 abaixo) |
| R12 | Gate de UI para escopos privados exige sessões reais de cliente/RH/Marcelo | custo de teste | reutilizar `tests/helpers/staff-login.mjs` e o padrão dos gates de UX |

Nenhum agente autônomo, escrita de negócio, SQL livre ou *tool calling* existe hoje — e a proposta **mantém** essa
fronteira.

---

## 5. Proposta fechada da PR 1 — “Fundação semântica híbrida com escopo e fontes verificáveis”

**Objetivo**: substituir a recuperação lexical de contagem de termos por **recuperação híbrida real** (vetorial +
lexical + fusão determinística), com escopo aplicado **antes** da busca, fontes verificáveis na resposta,
indexação idempotente e métricas honestas — reaproveitando integralmente as tabelas, a rota canônica
`/api/ai/answer` e o painel `/admin/ti` já existentes. **Nada de um segundo RAG.**

### 5.1 Migração
**Sim — uma única migração aditiva: `175-ai-rag-hybrid-embeddings.sql`** (a 001–174 permanece intocada; rollback
documentado em `docs/` com o `DROP`/`ALTER … DROP COLUMN` correspondente). Conteúdo previsto:

1. `ai_rag_chunk_embeddings` — `chunk_id` (FK `ON DELETE CASCADE`, **UNIQUE**), `rag_key`, `model_name`
   (`nomic-embed-text`), `model_digest`, `dimensions` (**768**), `content_checksum` (SHA-256 do texto do chunk),
   `embedding real[]` (portátil; também serve de origem ao cast `::vector` quando a extensão existir),
   `status` (`pendente|gerado|erro`), `error_code`, `generated_at`, `created_at/updated_at`. Sem vetor ⇒ sem
   linha com status `gerado`. `dimensions` divergente do modelo configurado ⇒ recusa, não grava.
2. `ai_rag_answer_events` — protocolo, `rag_key`, `client_account_id`, `actor_kind`, `outcome`
   (`answered|no_source|ai_unavailable|scope_denied|error`), `retrieval_mode` (`hybrid|lexical_only`),
   `vector_backend` (`pgvector|exact`), `chunk_count`, `top_score`, `latency_ms`, `model_name`, `ai_available`,
   `query`, `response`, `sources`, `retention_expires_at`, `created_at`. É o que torna a Fase 4 mensurável
   **e corrige R3** (o feedback passa a ter um protocolo persistido). Retenção e tratamento do texto conforme
   §7 (decisão 3).
3. `ai_rag_retrieval_config` — limites por `rag_key`: `min_relevance`, `max_chunks`, `max_context_chars`,
   `lexical_weight`, `vector_weight` com defaults conservadores; alterável só por `admin/ti` e auditado.
4. `ALTER TABLE ai_rag_feedback ADD COLUMN answer_event_id UUID REFERENCES ai_rag_answer_events(id)` (aditivo,
   nulável — compatível com os protocolos antigos de `ai_rag_queries`/`ai_bot_sessions`).
5. Índices: `(rag_key, status)` nos embeddings; `(created_at DESC)` e `(rag_key, created_at DESC)` no ledger.
6. Sem `pgvector` obrigatório: a coluna de vetor é portátil (`real[]`); se a extensão estiver presente, o
   retrieval usa operadores `vector` (cast de array) — decisão final na Q1.

Em modo beta (PGlite 1-clique) as mesmas tabelas entram em `db/beta-pglite-init.sql` com marcador
`beta-pglite-init-v4.sql`, mantendo o init idempotente.

### 5.2 Código (arquivos previstos)

| Arquivo | Ação |
|---|---|
| `src/server/ai-rag-embeddings.mjs` | **novo**: cliente Ollama `/api/embed` **somente loopback**, `nomic-embed-text` (768 dims) por padrão via `OLLAMA_EMBED_MODEL`, identificação de modelo/dimensão/digest, checksum do chunk, idempotência (mesmo chunk + mesmo checksum ⇒ não regrava), erro explícito (`embedding_unavailable`), recusa de dimensão divergente, nunca logar conteúdo |
| `src/server/ai-rag-retrieval.mjs` | **novo**: monta a busca com **filtro de escopo primeiro** (mesma cláusula SQL hoje validada em `ai-rag-real-api.mjs`, extraída para módulo testável), lexical via FTS português + `unaccent`/`pg_trgm` quando disponíveis, vetorial com **detecção automática de backend** (`pgvector` quando `CREATE EXTENSION vector` estiver disponível e autorizada; caso contrário cosseno exato sobre o conjunto já filtrado), **fusão RRF determinística**, `min_relevance`, `max_chunks`, `max_context_chars` |
| `src/server/ai-rag-real-api.mjs` | passar a usar o retrieval; gravar `ai_rag_answer_events` (protocolo persistido); devolver fontes com `title`, `source`, `document_id`, `version`, `published_at`, `excerpt` do trecho efetivamente usado, `stale_warning`, `retrieval_mode`, `vector_backend`; **continuar não chamando o modelo quando não há fonte** e mantendo `ai_unavailable` quando Ollama cai |
| `src/server/ai-rag-api.mjs` | curadoria inalterada em contrato; `handleFeedback` aceita protocolo de `ai_rag_answer_events` (sem quebrar os antigos); custo deixa de ser estimado (`NULL` + `cost_source`) |
| `server.mjs` | registrar as rotas administrativas mínimas: `GET /api/admin/ai-rag-index-status` (modelo/dim/datas/erros/pendências) e `POST /api/admin/ai-rag-embeddings/backfill` (admin/ti, idempotente, sem download de modelo). Nenhuma rota pública nova |
| `scripts/rag-embed-backfill.mjs` | **novo**: indexação manual/idempotente com relatório de pendências e falhas; recusa rodar sem `OLLAMA_EMBED_MODEL` |
| `scripts/rag-retention-purge.mjs` | **novo**: eliminação explícita e auditável dos eventos vencidos (`retention_expires_at`); executável manualmente ou por intervalo opt-in, nunca apaga em silêncio |
| `src/app/admin/ti/AiRagClient.tsx` | exibir estado real de indexação (modelo, dimensão, data, erro) e o botão de backfill |
| `src/components/RagWidget.tsx` | mostrar fontes com versão/data/trecho, aviso de conteúdo desatualizado, aviso de *conteúdo documental vs. dado operacional*, e estados distintos (carregando, sucesso, sem fonte, escopo negado, indisponível, falha de rede) |
| `db/beta-pglite-init.sql` | tabelas novas do item 5.1 + marcador v4 |
| `.env.example` | `OLLAMA_EMBED_MODEL=`, `RAG_VECTOR_BACKEND=auto`, `RAG_MIN_RELEVANCE=`, `RAG_MAX_CHUNKS=` (documentados; **sem segredos**) |

**Fora de escopo da PR 1** (para não virar mega-PR): ingestão de PDF/arquivo (PR 2), dados vivos read-only (PR 3),
métricas/dashboards completos e homologação (PR 4), ligar os três assistentes privados na UI (fatia curta
seguinte — ver Q4).

### 5.3 Rotas e telas afetadas
- **Afetadas**: `POST /api/ai/answer` (payload de resposta mais rico), `POST /api/ai/rag/feedback` (passa a
  funcionar de fato), `/api/admin/ai-rag-cost` (deixa de exibir custo inventado), `/admin/ti` (estado de
  indexação), `/contato` (widget público: fontes, aviso, estados).
- **Não afetadas**: `/api/faq-assisted`, `/admin/rh/assistente`, `/admin/marcelo/assistente`,
  `/cliente/app/assistente` (seguem inertes até a decisão Q4), demais módulos, SMTP, hospedagem.

### 5.4 Testes previstos (proporcionais e reais)

1. **Unit** (`npm run test:unit` entra na lista do `package.json`):
   `tests/rag-embeddings-idempotency.test.mjs` (checksum, sem duplicata, falha parcial não marca como indexado),
   `tests/rag-hybrid-fusion.test.mjs` (RRF determinístico, limiar mínimo, “sem fonte não chama o modelo”),
   `tests/rag-feedback-protocol.test.mjs` (protocolo canônico aceito; formato antigo continua aceito).
2. **PostgreSQL descartável + HTTP real** (`scripts/qa-rag-hybrid-postgres.mjs` +
   `tests/rag-hybrid.integration.test.mjs`): visitante não alcança corpus interno; cliente A não alcança
   documentos/embeddings/fontes de B; despublicado não é recuperado; arquivado deixa de ser recuperado; RH não lê
   base Marcelo e vice-versa; não há descoberta de existência fora do escopo por 401/403/404/título/ranking;
   pergunta sem fonte ⇒ resposta honesta e **zero chamada ao modelo**; indisponibilidade de embeddings ⇒ estado
   explícito; documento com *prompt injection* não altera papel/escopo/ferramenta; reindexação altera só o chunk
   necessário; execução repetida é idempotente; migrações **001–175 do zero + replay** (ledger 175/175).
3. **Chromium real** (`tests/rag-public-ui.integration.test.mjs`): fontes visíveis sem vazar escopo, estados
   distintos de vazio/erro/negado/indisponível/sucesso, feedback gravado por API canônica, 390 px sem rolagem
   horizontal, sem `page.route()`/monkeypatch.
4. **Ollama real (opcional, só na máquina do operador)**: `RAG_OLLAMA_LIVE=1` habilita um gate que exige
   `/api/embed` e `/api/chat` reais e registra modelo/dimensão/latência. **Sem Ollama, o gate é reportado como
   não executado — nunca simulado.**
5. Bateria padrão: `npm ci && npm run typecheck`, `npm run test:unit`, `npm run test:rag`,
   `node scripts/qa-wave0-static.mjs`, `npm run build`, `npm audit --audit-level=high`, `git diff --check`,
   migrações do zero e replay, restauração de arquivos gerados tocados pelos testes.

### 5.5 Limites da prova planejada (o que a PR 1 **não** vai provar)
- **Não** prova inferência real nem embedding real neste ambiente (Ollama ausente): prova o caminho de
  indisponibilidade e o caminho de degradação explícita. A prova de modelo real fica para o PC do operador.
- **Não** prova busca vetorial com índice ANN enquanto `pgvector` não estiver disponível/decisão tomada; sem ele,
  prova busca vetorial **exata** e lexical híbrida, com o backend declarado na resposta.
- **Não** prova satisfação de usuário, homologação humana, desempenho em produção nem comportamento Windows.
- **Não** prova ingestão de PDF, diretórios ou repositórios (PR 2) nem dados vivos (PR 3).
- Custo permanece **não medido** (não será estimado): a PR 1 apenas remove a estimativa falsa.

---

## 6. Decisões do proprietário (2026-10-06) — incorporadas à proposta

| # | Pergunta | Decisão tomada | Efeito na PR 1 |
|---|---|---|---|
| 1 | Armazenamento vetorial | **Ambos com detecção automática**: vetor real gravado de forma portátil (`real[]`, 768 dims); `pgvector` é usado quando a extensão estiver disponível e autorizada no PostgreSQL do PC; caso contrário, cosseno exato sobre o conjunto já filtrado por escopo. O backend usado é declarado na resposta (`vector_backend`). | `RAG_VECTOR_BACKEND=auto`; o código nunca depende de `pgvector` para funcionar, e nunca chama o caminho exato de “ANN”. Gates rodam no caminho exato (o motor de testes não tem `pgvector`); o caminho `pgvector` é validado na máquina do operador, se/quando a extensão for instalada. |
| 2 | Modelo de embeddings | **`nomic-embed-text` (768 dimensões, ~274 MB)**, obtido por `ollama pull` **manual** no PC do operador; nenhum download automático. | `OLLAMA_EMBED_MODEL=nomic-embed-text` como default documentado; dimensão validada na escrita; sem o modelo, os chunks permanecem `pendente` e a resposta declara `retrieval_mode: "lexical_only"` — nunca semântica fingida. |
| 3 | Retenção de pergunta/resposta | **Texto completo (pergunta + resposta + fontes) com retenção definida de 90 dias.** | `ai_rag_answer_events` grava `query`, `response`, `sources` e `retention_expires_at` (90 dias, configurável por `rag_key`); leitura do texto restrita a `admin`/`ti`; **nada** de texto em log; purge explícito por `scripts/rag-retention-purge.mjs`. |
| 4 | Escopo da PR 1 | **Servidor + curadoria; UI privada em fatia curta seguinte.** | Os três assistentes privados continuam inertes na PR 1; a reativação (`RagWidget` com sessão real + gate Chromium por papel/conta) será a **PR 1b**, pequena e revisável. |

### 6.1 Ressalvas registradas sobre as decisões 1 e 3
- **Decisão 1**: o caminho `pgvector` não é exercitado pelos gates descartáveis deste repositório nem pelo CI
  (o `embedded-postgres` não traz a extensão). Enquanto o `pgvector` não for instalado no PC, a prova de ANN
  fica **não executada** — e assim será reportada, sem tratar cosseno exato como índice vetorial aproximado.
- **Decisão 3**: guardar texto completo em 90 dias inclui respostas de escopo `cliente` e `rh`, que podem conter
  dado pessoal ou trabalhista. Mitigações na implementação: acesso ao texto somente por `admin`/`ti` e apenas
  para curadoria; nenhuma cópia em log/console; purge auditado com contagem (sem conteúdo); possibilidade de
  rebaixar escopos específicos para “somente metadados” por configuração, se o proprietário quiser depois.

---

## 7. Próximo passo

Com as quatro decisões acima, a PR 1 está fechada em escopo e pronta para implementação: migração aditiva **175**,
módulos `ai-rag-embeddings.mjs` / `ai-rag-retrieval.mjs`, ajustes na rota canônica `/api/ai/answer`, curadoria
(`/admin/ti`), `beta-pglite-init.sql` (marcador v4), backfill e retenção, mais os gates unitário, PostgreSQL
descartável/HTTP e Chromium descritos em §5.4. Nenhuma migração existente será alterada e nenhuma branch nova
será criada.

**Executado em 07/10/2026** — o resultado está em
[RAG PR 1 — fundação semântica híbrida](RAG-PR1-FUNDACAO-SEMANTICA-2026-10-06.md), com as medições de
calibração e o rollback. A decisão nº 4 desta seção foi aplicada: esta PR entregou **servidor + curadoria**, e o
gate Chromium dos três assistentes privados (RagWidget por papel/conta) passou para a **PR 1b**.

