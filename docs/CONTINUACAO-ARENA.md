# Continuidade Arena — 2026-10-04 (F06 / EXT-10 — validação PostgreSQL)

## Incremento 12 — prova focal da continuidade canônica

- Reconciliação desta sessão: `gh pr view 135` confirmou PR **MERGED** com merge commit real `cf3a1f4c580f44b92969a61548eec8d304e9c005`; o commit tem como pais o ponto anterior `58e213a11ccae35fc2f21002c9e1dda6b87bc333` e `9396d03f0ff1cc7064ed3675525f2387d0718a4c`. `origin/main`, `main` local e a branch fixa apontam para `cf3a1f4c580f44b92969a61548eec8d304e9c005`; o checkout iniciou sem alterações locais inesperadas.
- PRs #126, #127, #129, #132, #133 e #134 estão `MERGED` no GitHub e não foram recriadas, reabertas ou remescladas.
- Branch de trabalho: `arena/01a108ea-gruposegsystemseguranca`. O ledger vigente é **001–163**, todos imutáveis nesta sessão; a próxima migração livre é **164**. Não foram aplicadas migrações no computador do operador e não foi criada a 164.
- Implementação revisada: `db/migrations/162-ext10-continuity-canonical-journey.sql`, `src/server/ext-continuity-api.mjs`, dispatcher em `server.mjs` e UI `/admin/continuidade`. A correção desta fatia é somente na API: transições `arquivado`/`rascunho` usam a ação de auditoria já permitida `continuity_plan_update`, pois a migração 162 não adiciona ações dinâmicas para esses dois estados. A migração 162 não foi alterada.
- Bateria criada: `tests/ext10-continuity.integration.test.mjs` e `scripts/qa-ext10-continuity-postgres.mjs`; estados materiais nascem por HTTP. SQL do gate prepara apenas cluster, identidades staff fictícias, credenciais, grants e controles de falha. O gate usa PostgreSQL 17 descartável, servidor HTTP real, três sessões staff fictícias, Chromium real, concorrência e reinício do servidor.
- Cobertura comprovada: RBAC fail-closed, same-origin, sessões/autoria distintas, post IDs e contatos internos, máquina de estados, replay/conflito SHA-256, advisory lock, `FOR UPDATE`, concorrência, eventos append-only, auditoria transacional com rollback/503, legado 410, UI protegida e persistência após reinício. Acionamentos e exercícios são registros internos; não há SMTP, telefonia, gateway ou fornecedor externo.
- Evidência: `npm run test:ext10-continuity:pg` **17/17**, sem skip/todo/fail; migrações 001–163 foram aplicadas no cluster descartável. `tests/ext10-continuity.test.mjs` **9/9**, `npm test` **564/564**, `npm run typecheck`, `npm run build` (**98 páginas**), `npm run test:migrations:pg` (**163/163**), `git diff --check` e `node --check` passaram. `npm ci` reparou as dependências do embedded PostgreSQL; o gate não usou banco remoto.
- Limites honestos: isto prova a jornada interna de staff, não aceite humano, Windows/EPERM, banco de destino, contatos realmente notificados, ator externo, cliente autenticado ou isolamento por `client_account_id`. A tabela base tem referência de cliente, mas a API canônica exercitada nesta fatia recebe `post_id` e não implementa um portal/escopo de cliente; isso permanece pendente e não foi contado como cobertura.
- Próximo passo concreto: manter a entrega pequena em PR separada para esta validação/correção, sem merge automático; depois tratar a próxima lacuna priorizada somente após revisão, mantendo a migração livre 164 reservada.

# Continuidade Arena — 2026-10-04 (F07 / EXT-11)

## Incremento 11 — EXT-11 / F07 Analytics e experimentos A/B controlados

- Base confirmada: merge commit `58e213a11ccae35fc2f21002c9e1dda6b87bc333`; branch Arena fixa `arena/01a108c7-gruposegsystemseguranca`. PRs #126, #127, #129, #132, #133 e #134 já estão integradas e não foram recriadas, reabertas ou remescladas.
- Migração aditiva **163** (`163-ext11-analytics-canonical-journey.sql`): preserva 001–162, classifica linhas legadas da tabela 086 como `registro_legado`, cria eventos/observações append-only e exige origem operacional interna, minimização e fingerprint SHA-256. Novos estados de negócio são criados somente pela API HTTP.
- API canônica: `GET/POST /api/ext/analytics/experiments`, detalhe por id, aprovação em `/approve`, transição em `/transition` e observação real em `/observations`. Estados entregues: `rascunho`, `em_execucao`, `concluido`, `cancelado`, `arquivado`; execução exige aprovação humana anterior e conclusão exige observações reais de A e B.
- Garantias: RBAC granular `analytics.read/write/approve/execute` server-side fail-closed, sessão individual, same-origin, Idempotency-Key/fingerprint, replay/conflict, advisory lock + `FOR UPDATE`, auditoria atômica `auth_access_audit` com rollback e 503. Eventos e observações possuem trigger imutável.
- Escrita legada `/api/ext/analytics-experiments` recebe HTTP 410 após as guardas; não há tráfego, conversão, vencedor, significância estatística, integração externa ou dado inventado. A UI `/admin/analytics` usa `AdminGate` e informa quando faltam dados.
- Evidência: `npm ci` reparou as dependências e disponibilizou `libpq.so.5` no pacote embedded; Wave0 5/5, `npm run typecheck` OK, `npm test` 555/555, `npm run build` 98 páginas, unitário EXT-11 10/10, `npm run test:ext11-analytics:pg` 18/18, `npm run test:migrations:pg` 163/163 e `npm run test:ext07-compliance:pg` 43/43 passaram; `git diff --check`/`node --check` verdes. Os gates PG usaram clusters descartáveis, HTTP real e sessões staff reais. Aceite humano e Windows/EPERM seguem fora do gate técnico.

## Incremento 10 — Continuidade de Negócios e Contingência (histórico da implementação)

- Base histórica: `origin/main` `7c30993352a306d8dd8767d8599b037954d124f7`; branch anterior `arena/01a108ab-gruposegsystemseguranca`. A validação final desta fatia está registrada no Incremento 12 sobre o main atualizado e não recria nenhuma PR anterior.
- Migração aditiva **162** (`162-ext10-continuity-canonical-journey.sql`) preservada: eventos imutáveis, fingerprint SHA-256, idempotência por titular, permissões `continuity.read/write/activate` e ações de auditoria. O ledger vigente agora é 001–163; a próxima livre é 164.
- API canônica e UI permanecem as descritas: planos, detalhe, transição e exercícios em `/api/ext/continuity/*`, com `/admin/continuidade` protegido por `AdminGate`. Acionamento é registro interno; não há SMTP, telefonia ou gateway externo.
- A execução real do gate, inclusive Chromium e reinício, ocorreu posteriormente e está descrita no Incremento 12; aceite humano, Windows/EPERM, cliente/ator externo e banco de destino continuam pendentes.

# Continuidade Arena — 2026-10-04 (F01 cobertura + F03 + F04 / EXT-08 + F05 / EXT-09)

## Incremento 9 — F05: Expansão e Novas Unidades — Planejamento, Capacidade e Cenários Financeiros (EXT-09)

- **Base confirmada:** `origin/main` `b63a51e6e2af200b0ac93370dbe629f631dec718`; **branch fixa:** `arena/01a1085d-gruposegsystemseguranca`.
- **Fonte canônica preservada:** `ext_expansion_plans`, `ext_expansion_scenarios` e eventos transacionais `ext_expansion_events`.
- **Migração aditiva:** `161-ext09-expansion-canonical-journey.sql` acrescenta controle canônico de ciclo de vida de planos de expansão (`rascunho -> em_analise -> aprovado -> em_execucao -> concluido` ou `rejeitado` / `cancelado`), dimensionamento de capacidade (postos/vigilantes), cenários financeiros A/B com cálculo de margem projetada, justificativa formal obrigatória em cancelamentos/rejeições, tabela de eventos de expansão imutáveis com fingerprint SHA-256 e ampliação de ações de auditoria em `auth_access_audit_action_check`. **Migrações 001–160 imutáveis**, próxima livre 162.
- **API e Rotas:**
  - `GET /api/ext/expansion/plans`: listagem e busca com filtros de `status`, `target_location`, `q`, contagem de cenários e margem estimada calculada.
  - `POST /api/ext/expansion/plans`: criação de plano de expansão com título, localidade alvo, capacidade estimada (postos), custos e receitas declaradas; protocolo canônico automático `EXP-EXT-YYYYMMDD-XXXX`; status inicial `rascunho`; flag `is_estimate: true` e nota explicativa honesta; exige permissão `expansion.write` (`comercial`, `financeiro`, `marcelo`, `admin`, `ti`).
  - `GET /api/ext/expansion/plans/:id`: detalhe com metadados do plano, cenários vinculados e trilha de eventos.
  - `PATCH /api/ext/expansion/plans/:id`: atualização de plano em status `rascunho`.
  - `POST /api/ext/expansion/plans/:id/transition`: máquina de estados controlada (`rascunho -> em_analise -> aprovado -> em_execucao -> concluido`, `rejeitado`, `cancelado`). `aprovado` exige permissão `expansion.approve` (`financeiro`, `marcelo`, `admin`); `cancelado` e `rejeitado` exigem justificativa formal (mínimo 5 caracteres).
  - `POST /api/ext/expansion/plans/:id/scenarios`: criação de cenários financeiros (A/B, Conservador/Otimista/Pessimista) com cálculo automático de `projected_margin_cents = projected_revenue_cents - projected_cost_cents`, rejeição de duplicidade de nome e gravação atômica em eventos.
  - `DELETE /api/ext/expansion/scenarios/:id`: exclusão de cenários financeiros com lock no plano.
  - Rotas legadas: `GET /api/ext/expansion-plans` mantida para leitura compatível minimizada; rotas legadas de escrita respondem HTTP **410** `legacy_expansion_writer_retired`.
- **Garantias Técnicas:**
  - Autorização server-side fail-closed com `hasPermission()` e sessões individuais.
  - Verificação de mesma origem (`sameOrigin`) em todas as mutações (`POST`/`PATCH`/`DELETE`).
  - Idempotência com chave obrigatória `Idempotency-Key` e verificação de fingerprint SHA-256 (replay idêntico retorna 200, divergente 409).
  - Bloqueios concorrentes com locks PostgreSQL (`advisory lock` + `FOR UPDATE`).
  - Auditoria atômica transacional em `auth_access_audit` / `audit_log`; em caso de indisponibilidade de auditoria, toda a transação sofre rollback e retorna **503** `audit_unavailable`.
- **UI / Telas:**
  - Nova tela `/admin/expansao` protegida por `AdminGate` para papéis `['comercial', 'financeiro', 'marcelo', 'admin', 'ti']`.
  - Componente `ExpansionWorkspace.tsx` com filtros de plano, simulador de cenários A/B, transições de status guiadas, eventos históricos e avisos claros de que projeções financeiras são meras estimativas e não constituem garantia de resultado ou faturamento futuro.
- **Validação e Provas:**
  - `node scripts/qa-wave0-static.mjs`: **5/5** verificações estáticas OK (migrações 001–161 registradas nos 4 pontos de verificação).
  - `npm test`: **545/545** testes unitários aprovados (incluindo `tests/ext09-expansion.test.mjs` com 9/9 casos).
  - `npm run typecheck`: OK (0 erros de tipagem).
  - `npm run test:ext09-expansion:pg`: **16/16** testes end-to-end aprovados em PostgreSQL 17 descartável, servidor HTTP real e sessões staff reais.
  - `npm run test:ext08-knowledge:pg`: **15/15** casos aprovados.
  - `npm run test:ext07-compliance:pg`: **43/43** casos aprovados.
  - `npm run test:f03-contas-baixa-relatorio:pg`: **1/1** aprovado.
  - `npm run test:f03-client-ticket-acceptance:pg`: **1/1** aprovado.
  - `npm run test:f03-employee-request-rh-return:pg`: **1/1** aprovado.
  - `npm run test:l08-delivery:pg`: **51/51** casos aprovados.
  - `npm run test:migrations:pg`: **161/161** checksums verificados e idempotência de migrações provada.
- **Limites:** Sem integração bancária fictícia, sem SMTP externo, sem inteligência artificial simulada, projeções expressamente declaradas como estimativas de planejamento. Aceite humano formal do operador e validação Windows/EPERM permanecem pendentes.

## Incremento 8 — F04: Base de Conhecimento e Procedimentos Operacionais Canônicos (EXT-08)

- **Base confirmada:** `origin/main` `b63a51e6e2af200b0ac93370dbe629f631dec718`; **branch fixa:** `arena/01a1085d-gruposegsystemseguranca`.
- **Fonte canônica preservada:** `ext_knowledge_base`, `ext_knowledge_base_history`, `ext_knowledge_acknowledgments` e eventos transacionais `ext_knowledge_events`.
- **Migração aditiva:** `160-ext08-knowledge-canonical-journey.sql` acrescenta controle canônico de ciclo de vida (`rascunho -> em_revisao -> aprovado -> publicado -> arquivado`), versionamento estrito (edição de artigo publicado cria automaticamente nova versão imutável em status rascunho e arquiva a anterior ao publicar), registro de ciência formal vinculado a cada versão específica, chaves de idempotência e tabela de eventos imutáveis com fingerprinting de requisição. **Migrações 001–159 imutáveis**, próxima livre 161.
- **API e Rotas:**
  - `GET /api/ext/knowledge/articles`: listagem/busca com filtros de categoria, status, texto `q` e tag; isolamento de rascunhos para não-editores e checagem de `access_roles`.
  - `POST /api/ext/knowledge/articles`: criação de POP/artigo com título, slug único, conteúdo mínimo (50 caracteres), categoria e tags; inicia em status `rascunho` e versão 1; exige permissão `knowledge.write`.
  - `GET /api/ext/knowledge/articles/:id`: detalhe do artigo com contagem de ciências, booleano `user_acknowledged` do titular e histórico completo de versões.
  - `PATCH /api/ext/knowledge/articles/:id`: edição do artigo. Em artigos publicados/arquivados, cria nova versão versionada (`isNewVersion: true`, `version + 1`) em rascunho com isolamento.
  - `POST /api/ext/knowledge/articles/:id/transition`: transição controlada de status. `publicado` exige permissão `knowledge.publish` (admin/marcelo); `arquivado` exige motivo formal (`reason`).
  - `POST /api/ext/knowledge/articles/:id/acknowledge`: registro de ciência formal com permissão `knowledge.acknowledge`, idempotência e vínculo à versão exata.
  - `GET /api/ext/knowledge/articles/:id/acknowledgments`: auditoria de colaboradores que registraram ciência no procedimento.
  - Rota legada: `GET /api/ext/knowledge-base` mantida para leitura compatível minimizada; `POST /api/ext/knowledge-base` aposentada com HTTP **410** `legacy_knowledge_writer_retired`.
- **Garantias Técnicas:**
  - Autorização server-side fail-closed com `hasPermission()` e sessões individuais.
  - Verificação de mesma origem (`sameOrigin`) em todas as mutações (`POST`/`PATCH`).
  - Idempotência com chave obrigatória `Idempotency-Key` e verificação de fingerprint SHA-256 (replay idêntico retorna 200, divergente 409).
  - Bloqueios concorrentes com locks PostgreSQL (`advisory lock` + `FOR UPDATE`).
  - Auditoria atômica transacional em `auth_access_audit` / `audit_log`; em caso de indisponibilidade de auditoria, toda a transação sofre rollback e retorna **503** `audit_unavailable`.
- **UI / Telas:**
  - Nova tela `/admin/conhecimento` protegida por `AdminGate` para papéis `['marcelo', 'admin', 'ti', 'rh', 'supervisor', 'comercial']`.
  - Componente `KnowledgeWorkspace.tsx` com busca por texto, filtro por categoria, criação de POP, visualização de histórico de revisões, máquina de transição de estados, indicador honesto de ciência formal e avisos claros de que não há IA externa nem integrações de terceiros simuladas.
- **Validação e Provas:**
  - `node scripts/qa-wave0-static.mjs`: **5/5** verificações estáticas OK (migrações 001–160 registradas nos 4 pontos de verificação).
  - `npm test`: **536/536** testes unitários aprovados (incluindo `tests/ext08-knowledge.test.mjs` com 10/10 casos).
  - `npm run typecheck`: OK (0 erros de tipagem).
  - `npm run test:ext08-knowledge:pg`: **15/15** testes end-to-end aprovados em PostgreSQL 17 descartável, servidor HTTP real e sessões staff reais.
  - `npm run test:ext07-compliance:pg`: **43/43** casos aprovados.
  - `npm run test:f03-contas-baixa-relatorio:pg`: **1/1** aprovado.
  - `npm run test:l08-delivery:pg`: **51/51** casos aprovados.
  - `npm run qa:evidence`: **14/14** passos aprovados.
- **Limites:** Sem geração por IA externa, sem sincronização externa de terceiros, sem dados reais de produção. Aceite humano formal do operador e validação Windows/EPERM permanecem pendentes.

## Incremento 7 — F03 contas → baixa → relatório

- **Base confirmada:** `origin/main` `a0815cfcfd7df17f30dce2e99ab744a36c3f341a` (merge da PR #129); **branch fixa:** `arena/01a10845-gruposegsystemseguranca`; **implementação:** `23910567a2a329dc4f46c4aae6cf740c9d4888aa`; PR [#132](https://github.com/berger33/gruposegsystemseguranca/pull/132); documentação inicial `8e7d84230fded1fcac9a256f5d1752e402f49b5a`. O commit documental pendente da sessão anterior foi absorvido como `60d8764`; #126/#127/#129 não foram recriadas.
- **Fonte canônica preservada:** `fin_accounts_receivable`, `fin_payments` e `fin_payment_history`. A migração aditiva `159-f03-receivable-settlement-report.sql` acrescenta chave/fingerprint de idempotência à baixa, snapshots imutáveis `fin_f03_reports` e concessões explícitas `financeiro.*`; **001–158 imutáveis**, próxima livre 160.
- **API/UI:** fila escopada `GET /api/admin/finance/f03/receivables`; baixa manual `POST .../:id/settlements`; snapshots `GET/POST /api/admin/finance/f03/reports`. Sessão individual, mesma origem, permissão fail-closed por conta, advisory lock + `FOR UPDATE`, máquina `pendente|vencido|parcial → parcial|recebido`, auditoria e histórico na mesma transação. Aliases antigos de escrita `/api/*/hr/fin-payments` retornam 410; `/api/fin/payments` permanece para compatibilidade FIN-04 já coberta pelo L07. A tela declara ausência de banco, gateway, baixa automática, SMTP e envio externo.
- **Gate dedicado:** `npm run test:f03-contas-baixa-relatorio:pg` **1/1** (PG17 descartável `seg_demo_local`, estados criados por HTTP, A/B, concorrência 5×/4×, conflito de chave, rollback sem auditoria e Chromium). Regressões: Wave 0 **5/5**, typecheck OK, `npm test` **526/526**, L07 **43/43**, L08 **51/51**, client-space **22/22**, client-access **27/27**, F03 lead/funcionário/chamado **1/1** cada e demo-local OK.
- **Falhas reais corrigidas:** a primeira execução não alcançou as rotas por ausência do prefixo no `API_PATH_MATCH` (404); depois, o `UPDATE` reutilizou `$3` como enum e texto e o PostgreSQL recusou com `inconsistent types deduced for parameter $3` (casts explícitos). A primeira rodada paralela de regressões saturou/colidiu servidores Next e gerou timeouts/locks ambientais; as suítes foram repetidas serialmente, sem alteração ou enfraquecimento de asserções. O primeiro L07 após a troca canônica falhou porque o papel financeiro legado não tinha concessão explícita; a migração passou a provisionar/revogar o conjunto padrão em `auth_permissions`, sem bypass de papel, e L07 repetiu **43/43**.

### Limites

As quatro jornadas automatizadas F03 estão provadas, mas **F03 não está concluída**: ainda faltam aceite humano e Windows/EPERM. Sem dados reais, banco/PSP, SMTP, eSocial, assinatura externa, hosting permanente ou IA externa.

## Incremento 6 — F03 cliente → chamado → atendimento → aceite

- **Base confirmada:** `origin/main` `a459e07d42a855f93af4d76d047b49f3ff5e204e` (merge normal da PR #127, conferido por `git fetch origin main`); **branch fixa:** `arena/01a107a9-gruposegsystemseguranca`; **commits desta fatia:** `3c7e9ab1da469b94d7cf383491f9240df30a8b6e` (implementação) e `7bf821eabba64b3880698d83b7a0fae3c5001594` (documentação/continuidade); **PR:** [#129](https://github.com/berger33/gruposegsystemseguranca/pull/129), **integrada pelo merge normal `a0815cfcfd7df17f30dce2e99ab744a36c3f341a`** — não recriar/reabrir/remesclar #126, #127 nem #129.
- **Escopo entregue localmente:** o cliente autenticado abre chamado por `POST /api/client/tickets` com `Idempotency-Key` (já canônico); o staff enxerga somente o recorte das concessões reais `client.tickets.read`/`client.tickets.write` (fail-closed, escopo por conta) na fila canônica `GET /api/admin/client/l08/tickets`; transições estritas `open|waiting_client → in_progress → resolved` em `PATCH` exigem devolutiva de 5–1000 caracteres; o cliente aceita em `PATCH /api/client/tickets/:id/accept` (`resolved → closed`, `closed_at`). O SLA de chamados legados `waiting_client` é retomado na mesma transação — nenhuma pausa dura para sempre.
- **Garantias:** sessões individuais e mesma origem; verificação de permissão no servidor; lock (advisory + `FOR UPDATE` + `UPDATE ... WHERE status`), chave de idempotência por tentativa, replay 200, mesmo eixo com conteúdo divergente 409; trilha `client_ticket_messages`, histórico de estado e `auth_access_audit` (`ticket_attend`/`ticket_resolve`/`ticket_accept`) na mesma transação; concorrência 5×/4× convergindo para 1 efeito material. Escrita legada CLI-05 (`PATCH /api/admin/tickets/:id` e afins) responde **410** `legacy_cli_ticket_write_retired` após as guardas de sessão, sem bypass; leitura legada permanece.
- **Migração:** aditiva `158-f03-client-ticket-acceptance.sql` (`client_ticket_messages`, checks ampliados, ações de auditoria); **001–157 imutáveis**, registrada no manifesto, Wave 0, relatório de evidências e asserção EXT-07. UI honesta: `/admin/clientes` reescrito sobre a fila canônica; portal mostra a trilha e ganha aceite com chave por tentativa; a criação já era idempotente via `requestRef`.

### Prova repetida e falhas reais corrigidas

- `node scripts/qa-wave0-static.mjs`: **5/5** (001–158); `npm run typecheck`: OK; `npm test`: **526/526**; `git diff --check` / `node --check`: OK.
- `npm run test:f03-client-ticket-acceptance:pg`: **1/1** — PG17 descartável, HTTP real, Chromium nas duas personas; isolamento A/B na fila, 410 legado, concorrência e replay, rollbacks por falha injetada de auditoria (abertura, resolução e aceite), trilhas finais assertadas.
- Regressões na mesma sessão: `npm run test:l08-delivery:pg` (**51/51**), `node scripts/qa-tenant-postgres.mjs` client-space (**22/22**), `npm run test:client-access:pg` (**27/27**), `npm run test:f03-lead-to-implementation:pg` (**1/1**), `npm run test:f03-employee-request-rh-return:pg` (**1/1**), `npm run test:demo-local:pg` (OK).
- **Falhas reais:** helper da suíte só anexava `Idempotency-Key` em dois POSTs — PATCHes canônicos perdiam a chave (helper agora a utiliza sempre que fornecida); asserção “resolver antes de assumir” referenciava variável inexistente — substituída por chamado irmão criado via HTTP (409 com `status:"open"`); consulta da trilha usava `ORDER BY created_at` inexistente em `client_ticket_status_audit` — ordena por `id`; uma execução do gate falhou na subida do servidor dev por health timeout ambiental (120 s) — repetição sem alteração de código saiu verde (flakiness acompanhada); inventário L08 re-expandido com as rotas canônicas. Nenhuma asserção foi enfraquecida.

### Merge registrado

- Após o push dos dois commits, `gh pr checks 129 --watch --interval 20` passou nos 14 checks publicados (admin-entry, biddings, client-portal, compliance, contracts, crm, dispatch-guard, finance, operations, quality, satisfaction, static-and-smoke, suppliers, third-parties). Merge `a0815cfcfd7df17f30dce2e99ab744a36c3f341a` (2026-10-04); a PR #129 está fechada/integrada e não deve ser reaberta.

### Limites e próximo passo

F03 **continua em execução**: esta é a terceira jornada (lead→implantação na #126; funcionário→RH na #127). Falta contas→baixa→relatório, além do aceite humano e Windows/EPERM. Sem dados reais, segredos em git/logs, SMTP, banco bancário, eSocial, assinatura externa, hospedagem permanente ou IA externa.


## Incremento 5 — F03 funcionário → solicitação → análise RH → retorno

- **Base confirmada:** `origin/main` `7a41837385985e2321fc86f8b461f133d7c01423` (merge normal da PR #126). **Branch fixa:** `arena/01a10761-gruposegsystemseguranca`.
- **Commits desta fatia:** `d0f1cdebfb5fecac2fc7bb639b554faf1724a7b7` (implementação) e `fcddf69` (evidência/documentação). **PR desta fatia:** [#127](https://github.com/berger33/gruposegsystemseguranca/pull/127), aberta a partir desta branch; **integrada em `origin/main` pelo merge `a459e07d42a855f93af4d76d047b49f3ff5e204e`**; não recriar a PR #126 nem reabrir/remesclar a #127, ambas já integradas.
- **Escopo entregue localmente:** o funcionário autenticado abre uma solicitação por `POST /api/employee/actions/request`, sempre pelo titular da sessão e com `Idempotency-Key`; RH lê somente o recorte permitido em `GET /api/admin/hr/l03/self-requests` e revisa em `PATCH` na ordem `solicitado → em_analise → aprovado|rejeitado`, com retorno de ao menos cinco caracteres. O portal próprio mostra os retornos canônicos; a aba **Solicitações** do RH não afirma SMTP.
- **Garantias:** sessão individual e mesma origem; `hasPermission()` server-side com `employees.read`/`employees.write` e escopo de organização/unidade/contrato/próprio; lock transacional, impressão de requisição, replay 200, reutilização divergente 409, follow-up e `audit_log` na mesma transação. O legado EMP-12 mantém somente leitura compatível; `POST`/`PATCH` em `/api/admin|crm|hr/self-requests` e `POST` em follow-ups retornam 410 `legacy_emp12_write_retired`, impedindo bypass.
- **Migração:** nova `157-f03-employee-request-rh-return.sql`; `001–156` permanecem imutáveis. O manifesto fechado, a verificação estática e o relatório de evidências agora registram `001–157`.

### Prova repetida e falhas reais corrigidas

- `npm ci`: 82 pacotes, 0 vulnerabilidades (dependências sem mudança nesta fatia).
- `node scripts/qa-wave0-static.mjs`: **5/5**; `git diff --check` e `node --check` dos handlers/runner/teste: passaram.
- `npm run typecheck`: passou; `npm test`: **526/526**, 0 falhas.
- `npm run test:f03-employee-request-rh-return:pg`: **1/1** em PostgreSQL **17** descartável, HTTP real e Chromium; aplica `001–157`, usa somente seed sintético `seg_demo_local`, remove o cluster temporário. Cobre anônimo/origem/papel sem permissão, titular forjado ignorado, criação/revisão concorrentes e replay, chave divergente, transição direta proibida, rollback por falha injetada de `audit_log`, retry, bloqueio do legado EMP-12, retorno próprio, A/B e a UI funcionário→RH→funcionário em viewports desktop/mobile sem console/page/HTTP 5xx.
- A primeira execução do novo gate falhou fechada no manifesto ainda limitado a 156; o manifesto foi registrado honestamente em 157, sem remover a guarda. O PostgreSQL real então revelou uso do mesmo placeholder para enum e texto (`inconsistent types deduced`); criação e filtro/transição receberam parâmetros/casts explícitos. No Chromium foram corrigidos seletor ambíguo e a corrida entre refresh/limpeza do retorno; a prova conserva, e fortalece, as asserções.

### Limites e próximo passo

F03 **continua em execução**, não concluída: a primeira jornada (lead→implantação) veio da PR #126 e esta é a segunda; ainda faltam cliente→chamado→aceite e contas→baixa→relatório, além do aceite humano e Windows/EPERM. Não houve dados reais, segredos persistidos, SMTP, banco bancário, eSocial, assinatura externa, hospedagem permanente ou IA externa.


## Incremento 4 — primeira jornada F03: lead até implantação

- **Base vigente:** `origin/main` em `972e6563f5ea4888b62e88b8c126a925d79f6068` (merge da PR #125 sobre `7d0990a`). Branch fixa: `arena/01a1073d-gruposegsystemseguranca`.
- **PR desta fatia:** **#126**, commits `c1a557f` (implementação) e `e45e41b` (documentação), branch fixa `arena/01a1073d-gruposegsystemseguranca`. A PR é pequena e ainda não deve ser integrada automaticamente.
- **Escopo entregue localmente:** conversão lead→empresa/contato/oportunidade agora é transacional com auditoria; gate HTTP real percorre lead público, oportunidade, proposta com item e revisão, aceite server-side, contrato canônico e checklist de implantação. O contrato bloqueia antes do aceite; retries concorrentes convergem para um contrato, itens, implantação, dez passos e um audit de criação.
- **Fronteiras de autorização e isolamento:** anônimo não converte/lê contrato, origem cruzada é recusada, comercial não cria contrato L05, e clientes fictícios A/B recebem somente sua própria conta por sessão individual. A UI autenticada carrega a implantação real; falha de listagem e lista vazia agora são estados visíveis, não silêncio.
- **Fontes canônicas preservadas:** seed F03 existente foi reutilizado; nenhum estado de negócio foi inserido diretamente. SQL do gate só lê asserções e cria trigger temporário para provocar rollback de auditoria. Migrações `001–156` não mudaram; próxima livre confirmada: `157`.

### Validação desta fatia

- `npm ci`: já validado na #125; sem alteração de dependências.
- `npm run typecheck`: passou.
- `npm test`: **526/526**.
- `npm run test:f03-lead-to-implementation:pg`: passou **1/1** em PostgreSQL 17 descartável + HTTP real + Chromium; seed `seg_demo_local` isolado, temporários removidos.
- `npm run test:l04-delivery:pg`: passou **20/20** (regressão CRM/conversão/proposta/aceite).
- `npm run test:l05-delivery:pg`: passou **1/1** (regressão contrato/implantação).
- `npm run build`: passou com **94 páginas**; `git diff --check` e `node --check` passaram.
- **Falha real corrigida:** a primeira execução do gate parou no guard do migrador (`qa_database_name_required: seg_qa_ prefix`) porque a massa canônica exige `seg_demo_local`. O runner foi corrigido para usar exclusivamente `seg_demo_local` em cluster loopback descartável, com a autorização do seed mantida e sem relaxar asserções; a repetição passou. Depois do push dos dois commits, `gh pr checks 126 --watch --interval 10` passou em todos os checks publicados (static/smoke, quality, CRM, contracts, operations, finance, client portal, compliance, admin entry, dispatch e EXT-02..07).

### Limites ainda ativos

F03 **não está concluída**. Esta PR entrega somente a primeira das quatro jornadas: funcionário→RH→retorno, cliente→chamado→aceite e contas→baixa→relatório permanecem pendentes. O aceite humano, Windows/EPERM, SMTP, assinatura qualificada, banco bancário, eSocial, hospedagem definitiva e integrações externas continuam fora da prova. A integração da #126 e checks publicados ainda precisam ser conferidos antes de qualquer merge.


## Incremento 3 — revisão da PR #124 e cobertura restante do AdminGate

- **Base revisada:** `7d0990aaca47a8ea21b2380834289d2c73165b81` (merge da PR #123 no `main`).
- **PR substituta:** **#125**, branch `arena/01a1073d-gruposegsystemseguranca`, commit de implementação `e2fa152`, integrada em `origin/main` pelo merge `972e6563`.
- A PR #124 (`cd189159`) foi revisada contra o main pós-#123: o run antigo `37183947261` falhou no `QA-HOM-008 persistent synthetic restart`, enquanto o run posterior `37183965345`, no mesmo HEAD, passou; todos os demais checks publicados para aquele HEAD também passaram. Como a PR estava `CONFLICTING`/`DIRTY` e a sessão não pode fazer push na branch-fonte antiga, ela foi comentada e fechada como `superseded`, sem descartar o escopo válido.
- As 28 páginas administrativas restantes receberam `AdminGate` com papéis conferidos contra o mapa de `src/app/admin/AdminGate.tsx`. A matriz está protegida por `tests/admin-page-gates.test.mjs`. Não houve alteração de API, autorização no servidor, migração ou seed F03.
- Exceções preservadas: `/admin/convite` continua deeplink público de aceite de convite; `/admin/verificacao-manual` continua com reautenticação própria para ação sensível. O gate é somente envelope de UI; cada API segue responsável por 401/403 e escopo no servidor.
- Validação local desta substituta: `npm ci` (82 pacotes, 0 vulnerabilidades), `npm run typecheck`, `npm test` (526/526), `npm run test:admin-entry:pg` (13/13, PG17 descartável + Chromium real), `npm run build` (94 páginas) e `git diff --check`, todos aprovados. A execução de testes pode regenerar `next-env.d.ts`/`tsconfig.json`; esses artefatos foram restaurados e não entram nesta PR.


## Histórico do incremento 2 — fundação F03 (PR #123)

## Identificação

- Base: `b61691fb95aa68d1a43e5f3b5cf43131de2c397c` (main, merge da PR #122/F00+F01).
- Branch: `arena/01a105a3-gruposegsystemseguranca`.
- PR: **#123** — `feat(f03): massa sintética idempotente e isolada`.
- Commit de implementação: `0fc7048` (o commit documental final apenas registra a PR).
- Escopo desta fatia: limpeza pós-F00 no GitHub + fundação idempotente da massa F03.
- Migrações: nenhuma; 001–156 permanecem imutáveis e a próxima livre continua 157 (reconfirmar no próximo main).

## Ações de repositório

Após integrar a #122, foram fechadas **sem merge** as 27 alternativas superseded classificadas no F00: #104–#112, #114, #116, #117; #102; #79, #81, #82, #84, #86; #47, #53, #59, #60, #62, #67, #70, #72, #75. A #121 também foi fechada porque seu conteúdo documental já foi incorporado pela #122. Cada grupo recebeu comentário apontando a linha oficial. A #124 foi revisada e fechada como `superseded`; a substituta #125 é a linha oficial nesta sessão. A documentação anterior dizia “26 superseded”; a soma correta é 12 + 1 + 5 + 9 = 27.

## Implementação F03 desta fatia

- `scripts/local-demo-seed.mjs`: seed transacional exclusivo do demo isolado, com lock advisory e marcador versionado. Primeira execução só aceita `seg_demo_local`, capacidade explícita do runner, UUID de instalação e banco de negócio vazio. Replay com o mesmo marcador é no-op; marcador/instalação divergente falha fechado. Falha reverte marcador e dados juntos.
- Massa exclusivamente fictícia (`@example.invalid`): sete papéis staff individuais (`ti`, `rh`, `admin`, `marcelo`, `comercial`, `financeiro`, `supervisor`), clientes A/B, identidade de funcionário, duas contas, dois contratos, grants A/B exclusivos, cadastro laboral e permissão `employees.self_service` com escopo `own`.
- Todas as senhas são geradas por CSPRNG, armazenadas somente como hash e impressas uma única vez na primeira inicialização. Replay e restart não rotacionam nem reimprimem.
- `scripts/local-demo.mjs`: segredo separado e persistente para sessão do funcionário, recusando injeção pelo ambiente do operador; credenciais retornadas pelo seed novo.
- `scripts/qa-local-demo-persistent.mjs`: prova recusa sem capacidade, instalação divergente, replay sem duplicação, contagens e auditoria; login real de clientes A/B com visibilidade de uma única empresa cada; login e leitura do perfil próprio do funcionário; preservação das provas anteriores de convite, revisão manual, restart, cópia fria e restauração isolada.

## Validação real

Ambiente: sandbox Linux, Node 22, PostgreSQL 17.9 embedded descartável, sem banco/SMTP/segredos do operador.

- `npm ci`: sucesso; 82 pacotes, 0 vulnerabilidades.
- `npm run typecheck`: sucesso.
- `npm test`: **525/525**, 0 falhas e 0 skips.
- `npm run test:demo-local:pg`: sucesso; replay no-op; A/B isolados; funcionário próprio; convite/revisão/grant; backup a quente recusado; cópia fria, verificação e restauração separada; restart persistente; temporários removidos.
- `npm run build`: sucesso; 94 páginas geradas.
- `git diff --check` e `node --check` nos três scripts: sucesso.

A primeira tentativa de `typecheck` ocorreu antes de `npm ci` e falhou com `tsc: not found`; a primeira suíte unitária nesse mesmo estado incompleto falhou 13 casos por dependências ausentes. Após `npm ci`, ambas passaram integralmente. O gate F03 também encontrou `EMPLOYEE_SESSION_SECRET_NOT_CONFIGURED` ao exercitar pela primeira vez a conta do funcionário; a configuração isolada ganhou segredo próprio e o gate passou na repetição, sem relaxar asserção.

## Limites e pendências

Esta fatia entrega a **fundação da massa**, não conclui F03. Continuam pendentes, uma jornada por fatia:

1. lead → oportunidade → proposta revisada → contrato → implantação;
2. funcionário → solicitação → análise RH → retorno;
3. cliente → chamado → atendimento → aceite;
4. contas a pagar/receber → baixa → relatório.

Também pendem Windows/EPERM (F02), aceite humano e integrações externas. Não há SMTP real, banco bancário, eSocial, assinatura, dados reais ou hospedagem definitiva. O seed vale para instalações novas da demo isolada; marcador legado não é atualizado silenciosamente para evitar criar/reexibir credenciais numa instalação em uso.

## Prompt completo para a próxima sessão

```text
Continue berger33/gruposegsystemseguranca na branch fixa
arena/01a1073d-gruposegsystemseguranca, a partir de origin/main
972e6563f5ea4888b62e88b8c126a925d79f6068. Leia os quatro documentos de
continuidade/status/plano/checklist. A PR #126 é a primeira jornada F03 e não
pode ser tratada como F03 concluída: confira seus checks antes de qualquer merge.
Não refaça F00/F01 nem o seed F03. Implemente somente a próxima fatia F03
(funcionário → solicitação → análise RH → retorno), usando APIs/fontes canônicas,
HTTP real, PostgreSQL 17 descartável e a massa sintética já existente. Preserve
RBAC server-side, PLAT-01, sessões individuais, isolamento A/B, auditoria
transacional, idempotência/retry e UI honesta. Migrações 001–156 permanecem
imutáveis; reconfirme que a próxima livre é 157. Dados só em .invalid; sem SMTP
real, banco bancário, eSocial, assinatura externa, hospedagem definitiva ou IA
externa. Uma fatia por PR pequena; registre qualquer falha real, corrija e repita.
Atualize continuidade, status, plano e checklist com SHA base, branch, PR,
commits, comandos, resultados e limites; não declare F03 concluída.
```
