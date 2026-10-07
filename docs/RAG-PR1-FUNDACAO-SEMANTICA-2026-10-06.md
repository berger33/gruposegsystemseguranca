# RAG PR 1 — Fundação semântica híbrida (2026-10-06/07)

Escopo desta PR: **servidor + curadoria**. Os três assistentes privados do portal
(RagWidget e gate Chromium por papel/conta) ficam para a **PR 1b** — nesta PR o widget
público continua funcionando e o painel `/admin/ti` ganha indexação e estado real.

Nada de migração existente foi alterado: `001–174` permanecem imutáveis e a única
migração nova é a **175**, aditiva, com rollback documentado no fim deste arquivo.

## 1. O que passou a existir

| Peça | Arquivo | Papel |
| --- | --- | --- |
| Migração aditiva | `db/migrations/175-ai-rag-hybrid-embeddings.sql` | vetor por chunk, ledger de respostas, config por área, `published_at`, vínculo do feedback |
| Espelho beta | `db/beta-pglite-init.sql` (marcador `beta-pglite-init-v4.sql`) | mesmas tabelas no PGlite, sem depender de pgvector |
| Embeddings | `src/server/ai-rag-embeddings.mjs` | Ollama `/api/embed` **somente loopback**, dimensão declarada, checksum, códigos de erro |
| Recuperação | `src/server/ai-rag-retrieval.mjs` | escopo antes da busca, FTS por cobertura, busca vetorial (`pgvector` \| `exact` \| `none`), RRF, limiar, contexto com teto |
| Rota canônica | `src/server/ai-rag-real-api.mjs` | protocolo persistido no ledger, ausência honesta, indisponibilidade declarada, sem texto simulado |
| Curadoria | `src/server/ai-rag-api.mjs`, `server.mjs`, `src/app/admin/ti/AiRagClient.tsx` | estado de indexação por área + backfill acionável |
| Contrato de vocabulário | `src/lib/rag-vocabulary.mjs` / `.d.mts`, `src/lib/rag-request.ts` | um único lugar para códigos de erro, títulos e detalhes exibidos |
| Operação | `scripts/rag-embed-backfill.mjs`, `scripts/rag-retention-purge.mjs` | backfill explícito e purge de texto vencido (90 dias) |
| Gates | `tests/rag-core.test.mjs`, `tests/rag-http.integration.test.mjs`, `scripts/qa-rag-http-postgres.mjs` | unitário do núcleo e gate HTTP real sobre PostgreSQL descartável |

### 1.1 Banco (migração 175)

- `ai_rag_chunk_embeddings`: vetor **portátil** `REAL[]` por chunk, `model_name`,
  `dimensions` (16–4096), `content_checksum` (SHA-256 do texto), `status`
  (`pendente`/`gerado`/`erro`) e `error_code`.
  Restrições que impedem mentira: `gerado` exige vetor **e** `generated_at`; `erro`
  exige código; `array_length(embedding,1) = dimensions`.
- `ai_rag_answer_events`: ledger com `protocol UNIQUE` no formato
  `RAG-<PUB|CLI|RH|MAR>-AAAAMMDD-XXXX`, `outcome`
  (`answered`/`no_source`/`ai_unavailable`/`scope_denied`/`error`), modo de recuperação,
  backend, contagem, `top_relevance`, latência, modelo, `ai_available`, e
  `retention_expires_at` (90 dias por padrão). O ledger guarda **apenas metadados
  humanos das fontes**: o trecho recuperado não é copiado.
- `ai_rag_retrieval_config`: por `rag_key` — `min_relevance` **0.500**, `max_chunks` 6,
  `max_context_chars` 6000, candidatos lexical/vetorial 40, `vector_scan_limit` 800,
  pesos 0.50/0.50, retenção 90 dias.
- `ai_rag_documents.published_at` (data de publicação exigida na resposta) e
  `ai_rag_feedback.answer_event_id` (feedback ligado ao protocolo canônico).

Não existe coluna de "cap de rank lexical": o sinal lexical é **cobertura de termos**
(ver §3) e um teto arbitrário só esconderia medição.

### 1.2 Contrato semântico do modo

`retrieval.mode` é `hybrid` **somente** quando existe pelo menos um candidato vetorial
real. Caso contrário é `lexical_only` com `vector_error` explícito:
`embedding_disabled` (provider desligado por ambiente), `embedding_configuration_invalid`,
`embedding_model_missing`, `embedding_unavailable`, `embedding_dimension_mismatch`,
`embedding_http_error`, `vector_search_failed`.

`vector_backend` diz a verdade sobre a conta que foi feita: `pgvector` (operador de
extensão instalada), `exact` (**cosseno exato** sobre o conjunto já filtrado por escopo)
ou `none`. O caminho exato nunca é chamado de ANN/pgvector, nem na resposta nem nos
documentos. Em `lexical_only`, a relevância **é** a cobertura — não há semântica
presumida.

### 1.3 Escopo antes da busca

`scopeClause` é resolvido **antes** de qualquer consulta ao corpus:

- `publico`/`rh`/`marcelo`: `AND d.client_account_id IS NULL` (corpus não é de cliente);
- `cliente`: exige `kind='client'` no ator e filtra por
  `EXISTS (client_access_grants ... g.revoked_at IS NULL AND a.status='active')`;
- autorização de rota: `cliente` sem sessão → `401 client_session_required`; `rh`/`marcelo`
  sem sessão de equipe → `401 staff_session_required`; papel errado → `403 scope_forbidden`.

Publicação é condição da consulta (`d.is_approved AND d.is_published AND i.is_approved AND
i.is_published AND i.is_active`), então rascunho não é recuperável e arquivado deixa de ser.

### 1.4 Corpus é dado, nunca instrução

O contexto vai delimitado (`<<<CONTEXTO_NAO_CONFIAVEL ... FIM_CONTEXTO_NAO_CONFIAVEL>>>`)
e o prompt de sistema manda ignorar qualquer instrução dentro dele. O gate prova que uma
página envenenada no corpus público não muda papel, escopo nem política — inclusive
quando o pedido malicioso é feito com o gatilho exato escrito no documento.

## 2. Embeddings

- Modelo padrão **`nomic-embed-text`** (768 dimensões). O `ollama pull` é ato do
  proprietário: nenhum script baixa modelo.
- `OLLAMA_ENABLED=true` é obrigatório; sem isso, `embedding_disabled` e **nenhum vetor é
  fabricado**. `https` ou host não loopback nunca viram destino de rede.
- Dimensão divergente é recusada antes de gravar (`embedding_dimension_mismatch`).
- Indexação é **idempotente por chunk**: `needsWork` só refaz em
  `ausente | conteudo_alterado | modelo_ou_dimensao | erro_anterior | incompleto | forcado`;
  lote de 16; erro de um chunk não marca o documento inteiro. Conteúdo de chunk nunca é logado.

## 3. Medições de calibração (PostgreSQL 17 real, corpus fictício)

| Hipótese testada | Medida | Decisão |
| --- | --- | --- |
| `ts_rank_cd` como sinal de relevância | match verdadeiro = **0,0333** de rank absoluto | descartado — escala pequena demais para servir de limiar |
| `websearch_to_tsquery` (AND estrito) | pergunta "Como programar férias do colaborador?" × chunk com "férias" → **`matched=false`, rank 0,0000** | descartado — recall praticamente zero com sinônimos/variações |
| Cobertura de termos + `to_tsquery` OR | cobertura 1,0 no match verdadeiro e 0,0 no irrelevante | **adotado** como sinal lexical |
| Limiar único entre caminhos | cobertura e cosseno vivem em [0,1] | `min_relevance` = **0.500** nos dois caminhos (também no PGlite beta) |

Fixtures e resultados ficaram presos em `tests/rag-core.test.mjs` (lexical `['a','b','c']` +
vetor `['b','d']` → ordem RRF `['b','a','d','c']`, `hybrid` aceita `['b','a','d']`).

## 4. O que o gate encontrou (e o que foi corrigido)

Os gates foram escritos a partir do código, antes de rodar. A primeira execução real
achou quatro defeitos — todos corrigidos **no código**, não no teste:

1. **Busca vetorial nunca retornava linha**: o filtro `e.dimensions=$2` apontava para o
   parâmetro errado (`vector_scan_limit`/literal do vetor). Toda recuperação caía
   silenciosamente em `lexical_only`. Agora a dimensão é um parâmetro próprio
   (`queryVector.length`), posicionado antes do escopo.
2. **Indisponibilidade escondia a recuperação**: `503 ai_unavailable` (HTTP erro, resposta
   vazia, timeout/offline) devolvia só `{error, reason, protocol:null}`, sem `sources`, sem
   `retrieval`, sem `ollama_used` — e o protocolo do evento já gravado era jogado fora,
   deixando o feedback sem alcance. Agora as quatro respostas de indisponibilidade têm o
   mesmo contrato: fontes recuperadas, resumo de recuperação, `ollama_used:false`,
   `notice` explícito e **protocolo persistido**.
3. **`ai_busy` também escondia as fontes** por conta própria; passou ao mesmo contrato.
4. **Teto de contexto**: `buildContext` estourava `max_chars` em 2 caracteres por não
   contar o separador `\n\n`. Corrigido (o teto agora é exato).

Além disso, dois testes herdados foram atualizados para a nova arquitetura, sem perder
intenção: `tests/ai-rag-real-scope.test.mjs` (escopo barrado antes do banco; cláusula do
vínculo presente na consulta; RH só consulta RH) e o guarda de ledger em
`tests/ext-compliance-scheduler.test.mjs` (`175`, `001–175`).

## 5. Gates executados

```bash
npm run typecheck                 # verde
npm run test:unit                 # 850 testes, 0 falhas (inclui tests/rag-core.test.mjs)
npm run test:rag:pg               # gate focal: 14 casos, 0 falhas, 0 pulos
node scripts/qa-wave0-static.mjs  # 5/5 verificações estáticas OK
```

O gate focal (`scripts/qa-rag-http-postgres.mjs`) sobe um PostgreSQL descartável em
loopback, aplica `001–175` + replay idempotente pelo migrador real, sobe **duas**
instâncias do produto (uma com o provider habilitado apontando para porta silenciosa,
outra com `OLLAMA_ENABLED=false`) e roda `tests/rag-http.integration.test.mjs` contra HTTP
real. Exige TAP com `pass ≥ 10`, `fail = 0`, `skipped = 0`, `todo = 0`; a execução atual
tem **14 pass / 0 fail**.

O desenho é anti-falso-positivo: como o modelo aponta para uma **porta silenciosa**, uma
resposta `200 no_relevant_source` prova que o modelo **não foi chamado** (se tivesse sido,
viria `503 ai_unavailable`). A ausência honesta é conferida no ledger (protocolo gravado,
`outcome=no_source`, retenção de 90 dias). O duplo de embeddings é **declarado**
(`stub-embed-test`, 768 dimensões, vetorizador de saco de palavras — não é o
`nomic-embed-text`): ele prova mecanismo, checksum, idempotência e backend exato, e nada
além disso.

O que o gate **não** prova, e continua exigindo máquina do proprietário: qualidade de
embedding real, inferência real e caminho `pgvector` (a extensão não existe no
`embedded-postgres`; o gate valida o caminho **exato**, que é o esperado com
`pgvector_extension:false`).

Casos cobertos: migrações/checksums/replay · visitante barrado sem descobrir existência ·
ausência honesta sem chamar o modelo · documento publicado recuperado com indisponibilidade
declarada · rascunho não recuperado e arquivado deixa de ser · cliente A não alcança B ·
vínculo revogado perde a fonte · injeção de prompt não muda escopo/papel · feedback por
protocolo canônico (protocolo inventado → 404) · indexação sem modelo é declarada ·
idempotência e reindexação só do chunk alterado · backend exato declarado, nunca chamado de
ANN · dimensão divergente recusada · IA desligada por ambiente com motivo próprio.

## 6. Configuração

Novas variáveis (documentadas em `.env.example`):

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | modelo de embeddings (precisa existir no Ollama) |
| `OLLAMA_EMBED_DIMENSIONS` | 768 | dimensão declarada, conferida contra a resposta do provider |
| `OLLAMA_EMBED_TIMEOUT_MS` | 20000 | teto por chamada de embedding |
| `RAG_VECTOR_BACKEND` | `auto` | `auto` usa pgvector se houver; `exact` força a conta exata |
| `RAG_STALE_AFTER_DAYS` | 180 | idade em dias a partir da qual a fonte é sinalizada como desatualizada |

Operação:

```bash
# Indexar/atualizar embeddings (manual; exige modelo instalado)
OLLAMA_ENABLED=true OLLAMA_EMBED_MODEL=nomic-embed-text DATABASE_URL=... \
  node scripts/rag-embed-backfill.mjs

# Purge do texto vencido (só loopback; preserva métricas)
DATABASE_URL=... node scripts/rag-retention-purge.mjs
```

Leitura do texto retido é restrita a `admin`/`ti`; o purge apaga apenas
`query`/`response`/`sources` de eventos vencidos e mantém os agregados.

## 7. Rollback

A migração é aditiva e isolada; o rollback não toca dados de negócio:

1. **Desligar a busca vetorial**: `OLLAMA_ENABLED=false` (ou remover `RAG_VECTOR_BACKEND`)
   → o produto volta a `lexical_only` declarado, sem erro e sem semântica presumida.
2. **Reverter o código**: `git revert` do commit desta PR. Como a 175 é aditiva, o código
   anterior continua válido sobre o mesmo banco (as tabelas novas ficam ociosas).
3. **Remover o schema novo** (opcional, só depois do passo 2 e com backup):
   `DROP TABLE IF EXISTS ai_rag_chunk_embeddings;`
   `DROP TABLE IF EXISTS ai_rag_answer_events;`
   `DROP TABLE IF EXISTS ai_rag_retrieval_config;`
   `ALTER TABLE ai_rag_documents DROP COLUMN IF EXISTS published_at;`
   `ALTER TABLE ai_rag_feedback DROP COLUMN IF EXISTS answer_event_id;`
   `DELETE FROM __migrations WHERE filename='175-ai-rag-hybrid-embeddings.sql';`
4. **PGlite beta**: restaurar o marcador anterior em `src/server/pglite-pool.mjs` faz o
   ambiente beta ser recriado a partir do init vigente.

Nenhum passo remove linha de `ai_rag_documents`, `ai_rag_chunks` ou `ai_rag_feedback`.

## 8. Pendências declaradas

- **PR 1b** (assistentes privados: RagWidget por papel/conta + gate Chromium) — entregue em
  [RAG PR 1b — assistentes privados](RAG-PR1B-ASSISTENTES-PRIVADOS-2026-10-06.md), com gate
  `npm run test:rag:chromium` (10 casos) e a correção do acento assimétrico no FTS descrita lá.
- **Modelo real**: `ollama pull nomic-embed-text` é ato do proprietário; sem ele a
  indexação é declarada como indisponível (por desenho).
- **pgvector**: caminho ANN só é exercitado onde a extensão estiver instalada e autorizada.
- **Higiene**: PRs antigas `#173` e `#170` foram fechadas como substituídas pela PR 1
  (2026-10-07).
