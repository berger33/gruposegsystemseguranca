# Relatório de entrega — EXT-07 Compliance corporativo — Hardening (migração 155) — 2026-10-03

> Este relatório documenta a camada de hardening entregue nesta sessão como migração **155** (PR #115). O arquivo `docs/ENTREGA-RELATORIO-2026-10-03-EXT07-COMPLIANCE-HARDENING.md`, vindo do main via PR #113, documenta a camada 154 e permanece intacto.

## Base e decisão
- PR #103: **MERGED** em `2026-10-03T20:48:13Z`.
- Merge commit: `eff0bbddb5d5681d2612010e4349cfb9ff61234b` (pais: `efc74bacb7a23314db1d267d91438519dc342a8c` main; `3cf218d949e3ce04fe49e82ce2dcd1ca6b874584` feature "feat(ext07): entregar jornada canonica de compliance").
- Passo zero (início da sessão): `HEAD` = `origin/main` = merge-base = `eff0bbd`; divergência `0/0`; árvore limpa; 153 migrações; próxima livre: 154.
- **Reconciliação posterior**: enquanto a bateria era validada, o PR #113 (sessão paralela sobre a mesma tarefa) foi mergeado — `origin/main` avançou para `cda0c18` com a migração `154-ext07-compliance-hardening.sql` **deles** (constraints NOT VALID + índices). Decisão registrada: a migração desta sessão passou a ser a **155**, camada aditiva sobre a 154 do main, reconciliada pelo gate HTTP real; nada de 001–154 foi reescrito.
- Fonte canônica: `ext_compliance_documents` (086 + 153 + 154 + 155). Não foi criada tabela paralela: a 086 já era a fonte funcional e a 153/154/155 a endurecem; linhas anteriores permanecem `origin='registro_legado'` sem prova retroativa.
- Fonte da tarefa: `ext_compliance_tasks`, dedicada de compliance. Nenhuma tarefa existente (CRM/RH/operação) oferece vínculo obrigação/documento/período + regra + fatos + privacidade + idempotência compatíveis; nada foi misturado.

## Estado real da 153 e lacunas reproduzidas por probe (antes de editar)
Probe executado em PostgreSQL 17 descartável (`embedded-postgres`), migrações 001–153 aplicadas, `server.mjs --dev` real com `DATABASE_URL` sintético, sessões staff reais criadas por SQL e login em `/api/admin/session`, fixtures somente `@example.invalid`. Resultados observados:
1. **Rota canônica morta na borda**: `/api/ext/compliance/*` não estava em `API_PATH_MATCH`; o servidor entregava a rota ao Next, que respondia **404 HTML**. Toda a API canônica da 153 estava inalcançável por HTTP.
2. Com a borda liberada apenas para o probe: **anônimo ficava sem resposta** (nenhum 401; conexão pendurava até timeout do cliente) — `staff()` retornava `null` sem escrever resposta.
3. **Criação de documento impossível**: o fonte continha `/^\\d{4}-\\d{2}-\\d{2}$/` (barras invertidas duplas no literal). Essa regex nunca casa uma data real, então todo `POST /api/ext/compliance/documents` devolvia `400 invalid_validity`.
4. `evaluate` lia `evaluation_date` do corpo; a data do cliente só não vingava **por acidente** do mesmo bug de regex — corrigir a regex sem remover a leitura teria introduzido a regressão de relógio do cliente.
5. Documento com validade já vencida persistia `status='vigente'` (inserção via SQL comprovou); `vencida` com validade futura também era aceita pelo banco.
6. Tarefa podia ser criada na avaliação com responsável desativado (fail-closed violado) e conclusão sem responsável ativo não era revalidada.
7. Sem rota de renovação/versionamento (405), sem detalhe de documento (405), sem listagem de tarefas (405), UUID inválido devolvia 405 em vez de 400, transição em tarefa terminal estourava o trigger e virava 503 em vez de 409.
8. Índice `ext_compliance_current_version_unique` da 153 não via renovações (`replacement_of IS NULL` exclui a nova versão) e, ao mesmo tempo, bloqueava nova referência para a obrigação mesmo depois de vencida — obrigações travavam após o primeiro vencimento.
9. Listagem legada (`SELECT *`) expunha `storage_key`, `file_url`, `file_name`, `document_number`, `declared_reference`; o handler legado ainda continha `INSERT`/`UPDATE` — autoridade concorrente em código.
10. `/api/ext/continuity-plans` (EXT-10) quebrava com `column ca.name does not exist` (`client_accounts` tem `display_name`); a promise rejeitada escapava do `try { return handler(...) } catch` do `routeApi` (o `catch` não captura rejeição de promise retornada) e **nenhuma resposta era enviada** — o cliente pendurava até o próprio timeout.
11. O gate `qa-ext07-compliance-postgres.mjs` da 153 só validava migração + TAP focal estático: sem HTTP, sem sessão staff, sem 401/403/same-origin/retry/concorrência/rollback.

Todo o probe foi executado com `DATABASE_URL`/`DATABASE_MIGRATION_URL` limpas (recusa explícita), em cluster temporário com `seg_qa_` prefix; os temporários foram apagados após a execução; nenhum banco real foi usado.

## Reconciliação com a 154 do main (PR #113, commit cda0c18)
A 154 do main adicionou constraints NOT VALID (`ext_compliance_private_canonical`, `ext_compliance_issue_start`, `ext_compliance_expiry_rule`, `ext_compliance_task_owner`, `ext_compliance_task_dates`, `ext_compliance_version_positive`), o índice `ext_compliance_events_entity_idx` e o índice único `ext_compliance_one_current_version`. Essa camada não corrigiu nenhuma das 11 lacunas do probe (rota morta na borda, regex de data, 401 ausente, evaluate com relógio do cliente, exposição legada, EXT-10 pendurado, gate sem HTTP) — mas **duas** de suas objects são incompatíveis com a jornada exigida, comprovado pelo gate HTTP real após o merge:
1. `ext_compliance_one_current_version` (`(obligation_id) WHERE origin='ext07_canonica' AND replacement_of IS NULL AND status <> 'cancelada'`) reproduz o defeito do índice da 153: não vê a renovação (a nova versão tem `replacement_of` preenchido) e continua bloqueando novo registro da obrigação após o vencimento (a linha vencida permanece no índice).
2. `ext_compliance_task_dates` (`due_date >= evaluation_date`) impede nascer a tarefa de um documento já vencido — a data-limite é a validade passada e a avaliação é hoje; "vencimento gera tarefa" é critério de aceite da jornada.

Decisão da 155: **preservar** as cinco constraints compatíveis e o índice de eventos da 154 (privacidade canônica, coerência emissão/início, regra de vencimento, proprietário de tarefa, versão positiva) e **corrigir** apenas as duas incompatíveis: `DROP INDEX ext_compliance_one_current_version` (substituído por `ext_compliance_current_document_unique` com predicado de estados correntes) e `DROP CONSTRAINT ext_compliance_task_dates` (o guard de tarefa da 155 mantém as invariantes reais). A `ext_compliance_version_positive_check` originalmente planejada aqui foi suprimida: a `ext_compliance_version_positive` da 154 já cobre `version_no > 0`.

## Implementação da 155 (aditiva sobre 001–154)
`db/migrations/155-ext07-compliance-hardening.sql` — preserva legado, sem dado retroativo, sem seed:
- `ALTER TYPE ext_compliance_status ADD VALUE IF NOT EXISTS 'substituida'` — estado terminal para substituição formal por renovação (novo registro; o anterior nunca é sobrescrito).
- Substitui os índices de versão corrente (o da 153 e o da 154 do main): `ext_compliance_current_document_unique` em `(obligation_id)` `WHERE origin='ext07_canonica' AND status IN ('vigente','a_vencer','em_renovacao')` — no máximo uma versão corrente; vencidas/substituídas/canceladas são histórico e liberam novo registro.
- Guard de documento reforçado cobrindo INSERT **e** UPDATE (comparações enum com `::text`): canônico exige `is_private` e referência declarada; `vigente` não pode ter validade vencida; `vencida` não pode ter validade futura; terminais (`cancelada`,`substituida`) são imutáveis; canônicos não têm validade/metadados de arquivo/número/referência/privacidade/versionamento alteráveis.
- Guard de tarefa reforçado cobrindo INSERT **e** UPDATE: nasce `aberta` com responsável staff (fail-closed no banco), transições explícitas (`aberta→em_andamento`, conclusão de `aberta|em_andamento`, cancelamento de `aberta|em_andamento`), conclusão exige responsável+resultado, cancelamento exige justificativa, terminais imutáveis.
- Constraints `NOT VALID` de versionamento: sem autoreferência em `replacement_of`, `version_no >= 1`, referência declarada obrigatória em canônico. Índice de tarefas por obrigação.

## API, validade, privacidade e fronteira documental
- `server.mjs`: registro de `pathname.startsWith("/api/ext/compliance/")` em `API_PATH_MATCH` — a correção estrutural que liga a jornada à borda.
- `src/server/ext-compliance-api.mjs` reescrito: 401 anônimo e 403 papel não autorizado (admin|ti) **antes** de qualquer query; same-origin em todas as mutações; `Idempotency-Key` obrigatória (8–200); corpo > 128 KB → 413; JSON inválido → 400; UUID inválido → 400; corpo lido uma única vez; sessão staff exclusivamente via `readSession` (nenhuma mistura de fonte de login).
- Obrigação: tipo, título, descrição, fonte declarada, escopo, justificativa de aplicabilidade, regra de validade, criticidade (allowlist, padrão `media`), responsável staff ativo canônico (recusa inexistente/cliente/suspenso), estado derivado (`pendente`) e autoria/timestamps do servidor — nada do corpo decide isso. Aplicabilidade é declaração interna rastreável; **não** é validação jurídica nem confirmação por órgão público.
- Documento: obrigação canônica exigida; referência privada obrigatória (`reference_type` allowlist + `declared_reference` + `reference_source`); datas coerentes (emissão não futura, vencimento ≥ emissão, vigência dentro do período); **estado derivado do relógio do servidor** (`vencida` quando já expirado); uma versão corrente por obrigação (a segunda exige renovação → 409); campos `status`/`is_private`/autoria/`file_*` do corpo são ignorados — `file_name`/`file_url`/`storage_key` nunca persistem em canônico. A referência declarada é **distinta de arquivo real**: nenhuma alegação de upload, bytes, checksum, malware scan, armazenamento verificado ou download (mensagem explícita na resposta e na UI).
- Privacidade: listagem minimizada (sem `storage_key`, `file_url`, `file_name`, `document_number`, `declared_reference`); detalhe autorizado com allowlist (inclui a referência, nunca metadados de arquivo); nenhuma rota pública (verificado por HTTP); `is_private` estrutural e imutável para canônico; legado reduzido a leitura minimizada com alias `items`.
- Renovação/versionamento: `POST /documents/:id/renew` exige justificativa (10–2000) e validade corrente; cria novo registro com `replacement_of` no anterior e `version_no+1`; o anterior vira `substituida` (terminal, imutável, dados intactos); terminal não renova (409); sem ciclo (só corrente não-terminal renova e a renovação o torna terminal); histórico preservado com autor/timestamp/justificativa.
- Estados temporais: avaliação marca `a_vencer` dentro da antecedência declarada (sem tarefa — tarefa é do vencimento), `vencida` no vencimento, e deriva o estado da obrigação a partir do documento corrente único. Estado arbitrário não é aceito: sem PATCH de documentos/obrigações (405) e guard de banco impede coerência impossível.
- Tarefas: listagem `/api/ext/compliance/tasks` minimizada; regra explícita `expiry_at_or_before_evaluation_date` por documento; criada na mesma transação da avaliação; única por documento/período/regra (UNIQUE + `ON CONFLICT DO NOTHING`); contém regra, data-base, fatos e responsável canônico; período em ISO estável (`YYYY-MM-DD:YYYY-MM-DD` — a 153 gravava `Date.toString()` locale-dependente); conclusão exige responsável ativo + resultado (10–2000); cancelamento exige justificativa (10–1000); terminais não reabrem nem por API (409) nem por banco (trigger).
- **Sem geração contínua automática**: a avaliação temporal é operação administrativa explícita (botão/rota `POST /evaluate`); execução agendada futura é pendência documentada, não resolvida por esta entrega.

## Fail-closed, transação, auditoria, idempotência e concorrência
- Toda mutação canônica: `BEGIN` → advisory lock `(identidade, chave)` → replay de idempotência → revalidação/lock do registro → escrita → geração de tarefa (quando aplicável) → evento imutável → `audit_log` → `COMMIT`. Falha de `audit_log` → `ROLLBACK` + **503** + estado inalterado (obrigação, evento e tarefa não persistem) — comprovado por trigger de falha no gate.
- Retry com a mesma chave e mesmo corpo → `200 replayed:true` sem duplicação; mesma chave com corpo divergente → `409 idempotency_key_reused`; duas requisições concorrentes com a mesma chave → exatamente um registro (advisory lock + evento).
- Fail-closed sem responsável: avaliação reporta o documento em `facts.failed_closed` (motivo `responsible_staff_missing`), não cria tarefa e não altera estado; o banco recusa INSERT de tarefa sem responsável. Conclusão revalida responsável ativo.
- Transições inválidas/terminais mapeadas para 409 (mensagens de trigger mapeadas; API valida antes com 400/409 explícitos).

## Resultados exatos (bateria revalidada pós-reconciliação)
- `npm ci`: sucesso (82 pacotes, 0 vulnerabilidades).
- Sintaxe (`node --check`) dos novos/alterados `.mjs`: sucesso.
- `node scripts/qa-wave0-static.mjs`: **5/5**, migrações **001–155**.
- `npm run typecheck`: sucesso.
- Teste focal EXT-07 (`tests/ext07-compliance.test.mjs`): **19/19**.
- `npm test`: **457/457**, 0 falhas, 0 skips, 0 todo.
- `npm run build`: sucesso, **92 páginas**, incluindo `/admin/compliance` (e `/admin/ti` preservado).
- `npm run test:migrations:pg`: **155/155** checksums; segunda passada idempotente; clone com mutação sintética rejeitada (`migration_checksum_mismatch`), sem rebaseline; `QA_PG_TEMP_CLEANED`.
- `npm run test:ext07-compliance:pg`: **37/37 casos, 0 fail, 0 skip, 0 todo** (mínimo exigido 35) — PostgreSQL 17 descartável, migrações 001–155, servidor HTTP real, sessão staff real, fixtures `.invalid`, cluster temporário apagado.
- Gates de jornadas reutilizadas: EXT-04 **28/28**; EXT-05 **33/33**; EXT-06 (não regressão) **36/36**.
- `git diff --check`: sucesso. `next-env.d.ts`/`tsconfig.json` revertidos após builds.
- Correção colateral comprovada pelo gate: `/api/ext/continuity-plans` (EXT-10) agora responde 200 (`ca.display_name`); o bug fazia a rota pendurar sem resposta desde 086.

## Gates que não cobrem EXT-07
O estático (`qa-wave0`), o typecheck, o `npm test` unitário, o `build`, o gate de migrações e os gates EXT-01..06/CLI não substituem o gate dedicado EXT-07: nenhum deles exerce `/api/ext/compliance/*` por HTTP com sessão staff, renovação, fail-closed, replay/concorrência ou rollback de auditoria. Bateria pesada integral, aplicação em banco de destino, execução agendada, aceite humano e homologação Windows **não** são declarados nem necessários para esta entrega.

## Pendências
- Aplicar as migrações em banco de destino e validar em ambiente real do operador (fora do escopo desta entrega).
- Execução agendada/contínua da avaliação temporal (hoje é operação administrativa explícita; o `evaluate` e a resposta documentam isso).
- Achado de plataforma (fora do escopo EXT-07, registrado): `routeApi` usa `try { return handler(req,res) } catch` — a rejeição de promise retornada por um handler não é capturada e a resposta fica pendurada até o timeout do cliente. O bug concreto do EXT-10 foi corrigido; recomenda-se endurecer o dispatch para todos os handlers em trabalho futuro.
- Nenhum aceite humano foi inventado; nenhuma integração regulatória, ator externo, upload, bytes, checksum, malware scan, armazenamento verificado ou download foi declarado.
