## Atualização 2026-10-04 — F07 / EXT-11 Analytics e experimentos A/B controlados

**Base:** merge `58e213a11ccae35fc2f21002c9e1dda6b87bc333`; branch `arena/01a108c7-gruposegsystemseguranca`; PRs #126, #127, #129, #132, #133 e #134 não foram recriadas nem remescladas.

- [x] Migração 163 aditiva; 001–162 imutáveis; próxima livre 164; tabela 086 preservada como legado e sem escrita canônica retroativa.
- [x] Hipótese explícita, variantes A/B, métrica, privacidade/minimização e estados `rascunho`, `em_execucao`, `concluido`, `cancelado`, `arquivado`.
- [x] Aprovação humana separada antes da execução; reversão/cancelamento controlados; observações só de origem operacional interna declarada, sem `winner`, significância ou resultados inventados.
- [x] `ext_analytics_experiment_events` e `ext_analytics_observations` append-only com triggers de imutabilidade e origem/fingerprint registrados.
- [x] Rotas canônicas e dispatcher/API_PATH_MATCH registrados: listagem, criação, detalhe, aprovação, transição e observações; escrita legada retorna 410 após autenticação/RBAC/same-origin.
- [x] RBAC granular server-side fail-closed, sessões individuais, same-origin em mutações, Idempotency-Key com SHA-256 replay/conflito, advisory lock + `FOR UPDATE`.
- [x] Auditoria atômica em `auth_access_audit`; falha injetada provoca rollback total e HTTP 503 `audit_unavailable`.
- [x] UI `/admin/analytics` protegida por `AdminGate`, com mensagem explícita quando os dados são insuficientes e sem promessa de tráfego, conversões, fornecedor ou integração externa.
- [x] Teste unitário focal `tests/ext11-analytics.test.mjs`: **10/10**.
- [x] Gate focal `npm run test:ext11-analytics:pg`: **18/18**, PostgreSQL 17 descartável, migrações 001–163, servidor HTTP real e sessões staff reais; sem INSERT SQL de experimento/observação.
- [x] Ambiente: `npm ci` reparou dependências e disponibilizou `libpq.so.5` no pacote embedded; banco remoto não utilizado.
- [x] `node scripts/qa-wave0-static.mjs` **5/5**, `npm run typecheck`, `npm test` **555/555**, `npm run build` (**98 páginas**), `npm run test:migrations:pg` **163/163**, `git diff --check` e `node --check`.
- [ ] Aceite humano.
- [ ] Windows/EPERM e aplicação no banco de destino.

## Atualização 2026-10-04 — F06 / EXT-10 Continuidade

- [x] Migração 162 aditiva; 001–161 imutáveis; próxima livre 163.
- [x] API canônica de planos, transições e simulados com RBAC, same-origin, idempotência, locks e auditoria fail-closed.
- [x] UI `/admin/continuidade` protegida por AdminGate e sem promessa de acionamento externo.
- [ ] Gate focal PG17/HTTP real EXT-10 e migrações 162/162: implementação preparada; execução bloqueada neste ambiente pela ausência de `libpq.so.5` no binário embedded-postgres.

# Checklist da entrega local — 222 requisitos

## Atualização 2026-10-04 — F05 / EXT-09: Expansão, Dimensionamento e Cenários Financeiros

**Base:** `b63a51e6e2af200b0ac93370dbe629f631dec718`; **branch fixa:** `arena/01a1085d-gruposegsystemseguranca`.

- [x] Migração 161 aditiva; 001–160 imutáveis; manifesto/Wave0/evidências atualizados; próxima 162.
- [x] Fonte canônica de expansão (`ext_expansion_plans`, `ext_expansion_scenarios`, `ext_expansion_events`) preservada; estados criados exclusivamente por HTTP.
- [x] Permissões explícitas `expansion.read`, `expansion.write`, `expansion.approve` fail-closed; sessões individuais e mesma origem.
- [x] Dimensionamento de capacidade (postos de serviço) e cenários financeiros simulados A/B (Conservador, Otimista, etc.) com cálculo automático de margem projetada.
- [x] Máquina de estados controlada (`rascunho -> em_analise -> aprovado -> em_execucao -> concluido` ou `rejeitado` / `cancelado` com justificativa obrigatória).
- [x] Advisory lock + `FOR UPDATE`, idempotência com fingerprint SHA-256 e auditoria atômica transacional em `auth_access_audit` (com rollback e 503 sob indisponibilidade).
- [x] Rotas legadas de escrita aposentadas com HTTP 410.
- [x] UI honesta `/admin/expansao` com aviso explícito de que projeções são meras estimativas declaradas e não constituem garantia de faturamento ou resultado.
- [x] Gate focal: `npm run test:ext09-expansion:pg` **16/16** aprovado em PostgreSQL 17 descartável.
- [x] Regressões: Wave0 5/5, typecheck, npm test 545/545, EXT-08 15/15, EXT-07 43/43, F03 gates 1/1, L08 51/51, migrações 161/161.
- [x] `git diff --check` e `node --check` verdes.
- [ ] Aceite humano.
- [ ] Windows/EPERM.

## Atualização 2026-10-04 — F04 / EXT-08: Base de Conhecimento e POPs Canônicos

**Base:** `b63a51e6e2af200b0ac93370dbe629f631dec718`; **branch fixa:** `arena/01a1085d-gruposegsystemseguranca`.

- [x] Migração 160 aditiva; 001–159 imutáveis; manifesto/Wave0/evidências atualizados; próxima 161.
- [x] Fonte canônica de base de conhecimento (`ext_knowledge_base`, `ext_knowledge_base_history`, `ext_knowledge_acknowledgments`, `ext_knowledge_events`) preservada; estados criados por HTTP.
- [x] Permissões explícitas `knowledge.read`, `knowledge.write`, `knowledge.publish`, `knowledge.acknowledge` fail-closed; sessões individuais e mesma origem.
- [x] Versionamento estrito e imutável de procedimentos; edição de artigo publicado gera automaticamente nova versão rascunho com isolamento.
- [x] Registro formal de ciência por colaborador vinculado à versão exata do procedimento.
- [x] Advisory lock + `FOR UPDATE`, idempotência com fingerprint SHA-256 e auditoria atômica transacional.
- [x] Rota legada de escrita aposentada com HTTP 410.
- [x] UI honesta `/admin/conhecimento` protegida por `AdminGate` sem alegações de IA externa.
- [x] Gate focal: `npm run test:ext08-knowledge:pg` **15/15** aprovado em PostgreSQL 17 descartável.
- [x] Regressões: Wave0 5/5, typecheck, npm test 536/536, EXT-07 43/43, F03 gates 1/1, L08 51/51.
- [x] `git diff --check` e `node --check` verdes.
- [ ] Aceite humano.
- [ ] Windows/EPERM.

## Atualização 2026-10-04 — F03 contas → baixa → relatório

**Base:** `a0815cfcfd7df17f30dce2e99ab744a36c3f341a`; **branch:** `arena/01a10845-gruposegsystemseguranca`; **commit de implementação:** `23910567a2a329dc4f46c4aae6cf740c9d4888aa`; PR [#132](https://github.com/berger33/gruposegsystemseguranca/pull/132); documentação `8e7d84230fded1fcac9a256f5d1752e402f49b5a`. Commit anterior `a118f86` absorvido como `60d8764`.

- [x] Migração 159 aditiva; 001–158 imutáveis; manifesto/Wave0/evidências atualizados; próxima 160.
- [x] Fonte canônica FIN preservada; estados da prova criados por HTTP, nunca SQL direto.
- [x] `financeiro.*` fail-closed por conta; A/B, sessões individuais e mesma origem.
- [x] Baixa manual com transição estrita, advisory lock, `FOR UPDATE`, idempotência, histórico e auditoria atômicos.
- [x] Relatório snapshot limitado e imutável; sem banco, PSP, baixa automática, SMTP ou envio externo.
- [x] Legado HR de escrita responde 410; UI usa a baixa canônica.
- [x] Gate focal 1/1; regressões: Wave0 5/5, typecheck, npm test 526/526, L07 43/43, L08 51/51, client-space 22/22, client-access 27/27, gates F03 anteriores 1/1 e demo-local OK.
- [x] `git diff --check` e `node --check` verdes.
- [ ] Aceite humano.
- [ ] Windows/EPERM.

Falhas reais registradas: prefixo ausente no dispatcher (404), parâmetro PostgreSQL `$3` com tipos inconsistentes, concorrência ambiental de vários servidores Next e ausência de grant explícito no papel financeiro legado. Correções aplicadas e provas repetidas serialmente sem enfraquecer asserções. **F03 não concluída enquanto os dois itens finais estiverem abertos.**

## Atualização 2026-10-04 — F03 cliente → chamado → atendimento → aceite

**Base:** `origin/main` `a459e07d42a855f93af4d76d047b49f3ff5e204e` (PR #127 conferida e integrada); **branch fixa:** `arena/01a107a9-gruposegsystemseguranca`; **commits:** `3c7e9ab1da469b94d7cf383491f9240df30a8b6e` (implementação) e documentação desta seção; **PR:** [#129](https://github.com/berger33/gruposegsystemseguranca/pull/129), **integrada pelo merge `a0815cfcfd7df17f30dce2e99ab744a36c3f341a`** (14 checks publicados verdes antes do merge). Não recriar/reabrir/remesclar #126, #127 nem #129.

Entregue localmente: migração aditiva `158-f03-client-ticket-acceptance.sql` (`client_ticket_messages` + checks/auditorias; 001–157 imutáveis), fila canônica staff `GET /api/admin/client/l08/tickets` com `client.tickets.read` fail-closed e recorte pelas concessões, transições estritas `open|waiting_client → in_progress → resolved` com `client.tickets.write` por conta e devolutiva 5–1000 caracteres na mesma transação (lock + `UPDATE ... WHERE status` + trilha + `auth_access_audit`), aceite do cliente `PATCH /api/client/tickets/:id/accept` (`resolved → closed`, `closed_at`, chave própria), SLA de `waiting_client` legados retomado transacionalmente. Escrita CLI-05 legada (`PATCH /api/admin/tickets/:id` e afins) retorna 410 `legacy_cli_ticket_write_retired` após as guardas de sessão. UI `/admin/clientes` reescrita sobre a fila canônica; portal `/cliente/app/chamados` mostra trilha e aceite com chave por tentativa.

**Comandos/resultados:** `node scripts/qa-wave0-static.mjs` (**5/5**, manifesto 001–158); `npm run typecheck` (OK); `npm test` (**526/526**, 0 falhas); `npm run test:f03-client-ticket-acceptance:pg` (**1/1**, PG17 descartável + HTTP + Chromium); `npm run test:l08-delivery:pg` (**51/51**); `node scripts/qa-tenant-postgres.mjs` client-space (**22/22**); `npm run test:client-access:pg` (**27/27**); `npm run test:f03-lead-to-implementation:pg` (**1/1**); `npm run test:f03-employee-request-rh-return:pg` (**1/1**); `npm run test:demo-local:pg` (OK); `git diff --check` e `node --check` (OK). O gate valida negações (anônimo, origem cruzada, staff sem concessão, cliente cruzado, staff no aceite), retrato 410 da CLI-05, concorrência/replay/conflito de criação e atendimento, máquina de estados, rollbacks por falha injetada de auditoria (resolução e aceite), isolamento A/B e UI cliente→staff→cliente com monitoramento de console/page/5xx.

**Falhas reais e correção:** o helper da suíte client-space só anexava `Idempotency-Key` em dois POSTs — nova forma honra a chave sempre que fornecida; a asserção de transição prematura referenciava variável inexistente — recriada com chamado irmão via HTTP (409 com `status:"open"`); a trilha de auditoria não tinha `created_at` indexável — ordenação por `id`; uma execução do gate falhou no health timeout ambiental do servidor dev — repetida limpa, verde; inventário L08 re-expandido com as rotas canônicas. Nenhuma asserção foi enfraquecida.

**Limites:** F03 não está concluída. Permanecem contas→baixa→relatório, aceite humano e Windows/EPERM. Sem dados reais, SMTP, banco bancário, eSocial, assinatura externa, hosting permanente ou IA externa.

## Atualização 2026-10-04 — F03 funcionário → solicitação → análise RH → retorno

**Base:** `origin/main` `7a41837385985e2321fc86f8b461f133d7c01423` (a PR #126 foi conferida e já está integrada); **branch fixa:** `arena/01a10761-gruposegsystemseguranca`; **commits:** `d0f1cdebfb5fecac2fc7bb639b554faf1724a7b7` (implementação) e `fcddf69` (evidência/documentação); **PR:** [#127](https://github.com/berger33/gruposegsystemseguranca/pull/127). Não recriar #126.

Entregue localmente: migração aditiva `157-f03-employee-request-rh-return.sql` (somente idempotência/replay; 001–156 imutáveis), criação canônica no portal próprio com chave de idempotência, fila RH com `employees.read`/`employees.write` e escopo real, transições estritas `solicitado → em_analise → aprovado|rejeitado`, resposta obrigatória de 5+ caracteres, follow-up/auditoria na mesma transação e retorno visível somente ao titular. A aba RH usa a rota canônica e afirma corretamente que não envia SMTP. A escrita da rota EMP-12 legada e de seus follow-ups agora retorna 410 `legacy_emp12_write_retired`, impedindo atalhos sem escopo, transação e idempotência.

**Comandos/resultados:** `npm ci` (82 pacotes, 0 vulnerabilidades); `node scripts/qa-wave0-static.mjs` (**5/5**, manifesto 001–157); `npm run typecheck` (OK); `npm test` (**526/526**, 0 falhas); `npm run test:f03-employee-request-rh-return:pg` (**1/1**, PostgreSQL 17 descartável + HTTP real + Chromium); `git diff --check` e `node --check` (OK). O gate valida anônimo/origem/papel negados, proprietário forjado ignorado, concorrência/replay/conflito de criação/revisão, máquina de estados, rollback de `audit_log` e retry, bloqueio do legado, isolamento A/B, retorno próprio e UI desktop/mobile sem console/page/5xx.

**Falhas reais e correção:** a primeira tentativa recusou o manifesto ainda 001–156; 157 foi registrado nos quatro pontos sem remover a guarda. O PG17 revelou placeholder compartilhado entre enum/texto, corrigido com parâmetro separado/casts explícitos. O Chromium revelou seletor ambíguo, limitação `--single-process` e corrida do refresh RH; foram corrigidos com seletor textarea, navegadores por papel e espera da confirmação, mantendo as asserções.

**Limites:** F03 não está concluída. Permanecem cliente→chamado→aceite, contas→baixa→relatório, aceite humano e Windows/EPERM. Não foram usados dados reais, SMTP, banco bancário, eSocial, assinatura externa, hosting permanente ou IA externa.


## Atualização 2026-10-04 — primeira jornada F03 na PR #126

Base `origin/main` `972e6563f5ea4888b62e88b8c126a925d79f6068`, branch `arena/01a1073d-gruposegsystemseguranca`, commits `c1a557f` (implementação) e `e45e41b` (documentação), PR **#126**; todos os checks publicados da PR passaram. A jornada lead→oportunidade→proposta revisada→contrato→implantação foi provada por `npm run test:f03-lead-to-implementation:pg` (**1/1**, PostgreSQL 17 descartável, HTTP real, Chromium e seed F03 existente). O gate cobre autorização server-side/deny-by-default, mesma origem, rollback quando a auditoria falha, retry concorrente sem duplicar contrato/itens/implantação/passos, bloqueio antes de aceite, clientes A/B isolados e UI com erro/vazio/checklist honesto. A conversão CRM-04 passou a compartilhar transação com seus audits; o detalhe/listagem L05 converge checklist e informa total.

Comandos aprovados nesta fatia: `npm run typecheck`; `npm test` (**526/526**); `npm run test:f03-lead-to-implementation:pg` (**1/1**); `npm run test:l04-delivery:pg` (**20/20**); `npm run test:l05-delivery:pg` (**1/1**); `npm run build` (**94 páginas**); `git diff --check`; `node --check` nos scripts F03. A primeira tentativa do gate encontrou `qa_database_name_required: seg_qa_ prefix`; o runner foi corrigido para o nome canônico `seg_demo_local` em cluster loopback descartável e reexecutado sem reduzir asserções. Nenhuma migração foi criada ou alterada: 001–156 permanecem imutáveis e a próxima livre é 157.

Limites: F03 continua em execução; funcionário→RH→retorno, cliente→chamado→aceite e contas→baixa→relatório, aceite humano, Windows/EPERM e integrações externas não estão entregues. Não houve SMTP real, banco bancário, eSocial, assinatura externa, hospedagem definitiva ou IA externa.

## Atualização 2026-10-04 — revisão da cobertura F01 e PR substituta #125

Sobre `origin/main` pós-#125 (`972e6563`). A cobertura restante das páginas administrativas foi reaplicada na PR #125 (`e2fa152`) e integrada: 28 páginas agora usam `AdminGate`, com matriz de papéis testada estaticamente em `tests/admin-page-gates.test.mjs`. `/admin/convite` e `/admin/verificacao-manual` permanecem nas exceções deliberadas. As APIs não foram alteradas e continuam autorizando no servidor; este incremento anterior não promoveu nenhum requisito de jornada F03 nem substituiu a validação HTTP/PG dos módulos. Validação: typecheck, 526/526 unitários, gate admin-entry 13/13 em PG17 + Chromium, build 94 páginas e diff check limpos. PR #124 foi fechada como conflitante/superseded após conferência dos checks antigo e posterior.

## Atualização 2026-10-04 — F03 fundação da massa sintética isolada

O bootstrap exclusivo de `demo:local:init` agora cria, em uma única transação, sete contas staff individuais (incluindo RH e Marcelo), clientes fictícios A/B com grants mutuamente exclusivos, um funcionário com identidade e permissão somente de autoatendimento próprio, duas contas e dois contratos fictícios. Senhas são aleatórias e exibidas apenas na primeira inicialização. O seed exige capacidade explícita do runner, banco `seg_demo_local`, instalação UUID correspondente e banco de negócio vazio; reexecução válida é no-op, sem duplicar registros nem rotacionar/reexibir credenciais; instalação divergente falha fechada. `npm run test:demo-local:pg` passou em PostgreSQL 17 descartável: replay, contagens/auditoria, login de A e B com isolamento, login/perfil próprio do funcionário, convite/revisão manual, persistência, backup frio e restauração isolada. Isto é somente a fundação de F03: as quatro jornadas de negócio ponta a ponta continuam pendentes; sem SMTP, banco bancário, eSocial ou assinatura real.

## Atualização 2026-10-04 — F01 entrada e navegação central de staff entregue localmente

`/admin` deixou de ser 404 (hub por papel) e `/admin/entrar` é a entrada canônica: conta individual padrão com rótulo papel-neutro ("E-mail da conta individual"), chave legada só é oferecida quando habilitada no servidor (`GET /api/admin/session/options`), MFA integrado no mesmo fluxo. Anônimo em página protegida é levado ao login com retorno ao destino (`next` sanitizado: somente caminhos internos de `/admin`, nunca domínio externo); menu por papel e saída visível no chrome compartilhado. RBAC do servidor intocado: RH segue recebendo 403 real em `/api/adm/panel/*` (nada foi concedido à força para consertar navegação). Provas: gate dedicado `npm run test:admin-entry:pg` **13/13** (PostgreSQL 17 descartável + Chromium real: anônimo→login→retorno, RH sem painel administrativo, `next` externo recusado, senha errada com erro compreensível, logout com revogação), unit `tests/admin-entry.test.mjs` 11/11, regressão `test:staff-auth:pg` 21/21, suíte 525/525, build com `/admin` e `/admin/entrar`. Workflow `admin-entry-delivery.yml`. Aceite humano (Marcelo/Andreia) e Windows seguem pendentes. Detalhes: [docs/CONTINUACAO-ARENA.md](CONTINUACAO-ARENA.md).

## Atualização 2026-10-03 — PLAT-01 despacho HTTP à prova de rejeição assíncrona

Sobre `8c4d71a` (PR #115 MERGED): correção de plataforma sem migração nova. O despacho de `routeApi` não aguardava a promise do handler — rejeição assíncrona ficava sem resposta e **derrubava o processo**. Agora há `dispatchGuarded` com 500 fail-closed, guarda do callback de `createServer` e rede de segurança de processo. Focal 25/25 e guarda estática 7/7 (provada por mutação); suíte 494/494; bateria **integral** executada com evidência em PDF versionada (`docs/evidencias/qa-evidencia-2026-10-03-plat01-despacho-http.pdf`): wave 0 5/5, build 92, migrations 155/155 ×2 + negativo, gates EXT-07 37/37, EXT-06 36/36, EXT-05 33/33, EXT-04 28/28. Nenhum requisito CLI/EXT mudou de estado. Aceite humano e Windows seguem pendentes. Ver [relatório PLAT-01](ENTREGA-RELATORIO-2026-10-03-PLAT01-DESPACHO-HTTP.md).

## Atualização 2026-10-03 — EXT-04 fornecedores internos entregue localmente

Quarta fatia EXT sobre `5abc199` (PR #98 MERGED): EXT-04 passa a `pronto_local` **somente como jornada interna de staff**, com `/admin/fornecedores`, `/api/ext/supplier/*`, migração 150, teste focal 42/42, suíte 424/424, build 89, migrations 150/150 e gate dedicado 28/28. Condição "se volume justificar": **SEM EVIDÊNCIA**; ator externo/login/sessão/grant/upload/aceite: **PENDENTE**, não simulado. CLI-01..15 e EXT-01..03 preservadas; EXT-05..17 pendentes. Bateria pesada, destino, aceite humano e Windows pendentes. Ver [relatório EXT-04](ENTREGA-RELATORIO-2026-10-03-EXT04-FORNECEDORES.md).

## Atualização 2026-10-03 — EXT-03 licitações entregue localmente (terceira fatia do lote EXT)

Terceira fatia do lote EXT sobre a base `4518b3f` (PR #97 MERGED): EXT-03 passou a `pronto_local` por validação automática rápida **mais um gate HTTP/DB dedicado à jornada** (tela real `/admin/licitacoes` + `/api/ext/bidding/*`, migração aditiva 149, teste dedicado 67/67, suíte 382/382, migrações 149/149, `test:ext03-biddings:pg` 26/26 — este reprovou 22/26 na primeira execução e expôs defeito real, corrigido e re-provado). A condição do plano *"se mercado relevante"* foi avaliada contra o repositório e declarada **indicada e não confirmada** — não foi presumida. CLI-01..15, EXT-01 e EXT-02 preservadas sem reabertura; EXT-04..17 e os órfãos de `/admin/ti` permanecem nos estados abaixo. Ver [`ENTREGA-EXT.md`](ENTREGA-EXT.md) e [`ENTREGA-RELATORIO-2026-10-03-EXT03-LICITACOES.md`](ENTREGA-RELATORIO-2026-10-03-EXT03-LICITACOES.md). Aceite humano e Windows seguem pendentes.

## Atualização 2026-10-03 — EXT-02 terceiros entregue localmente (segunda fatia do lote EXT)

Segunda fatia do lote EXT sobre a base `48aa7a4` (PR #96 MERGED): EXT-02 passou a `pronto_local` por validação automática rápida **mais um gate HTTP/DB dedicado à jornada** (tela real `/admin/terceiros` + `/api/ext/third-party/*`, migração aditiva 148, teste dedicado 50/50, suíte 315/315, migrações 148/148, `test:ext02-third-parties:pg` 22/22). CLI-01..15 e EXT-01 preservadas sem reabertura; EXT-03..17 e os órfãos de `/admin/ti` permanecem nos estados abaixo. Ver [`ENTREGA-EXT.md`](ENTREGA-EXT.md) e [`ENTREGA-RELATORIO-2026-10-03-EXT02-TERCEIROS.md`](ENTREGA-RELATORIO-2026-10-03-EXT02-TERCEIROS.md). Aceite humano e Windows seguem pendentes.

## Atualização 2026-10-03 — EXT-01 frota entregue localmente (lote EXT iniciado)

Primeira fatia do lote EXT sobre a base `3353b2f` (PR #95 MERGED): EXT-01 passou a `pronto_local` por validação automática rápida (jornada real `/admin/frota` + `/api/ext/fleet/*`, migração aditiva 147, teste dedicado 20/20, suíte 265/265, migrações 147/147). CLI-01..15 preservadas sem reabertura; EXT-02..17 e os órfãos de `/admin/ti` permanecem nos estados abaixo. Ver [`ENTREGA-EXT.md`](ENTREGA-EXT.md) e [`ENTREGA-RELATORIO-2026-10-03-EXT01-FROTA.md`](ENTREGA-RELATORIO-2026-10-03-EXT01-FROTA.md). Aceite humano e Windows seguem pendentes.

## Atualização 2026-10-02 — aceite L07 e auditoria L08 sem início

Marcelo e Andreia aceitaram FIN-01..16 e ADM-01..12 integralmente em 02/10/2026. Windows não foi validado e nenhuma evidência foi apresentada; portanto L07 permanece em execução. Decisão dos 80 órfãos: promover por área somente com prova, sem ordem declarada. CLI-01..15 e EXT-01..17 abaixo foram auditados contra código real, mas mantêm seus estados: o L08 não foi iniciado e a existência de API/tabela/componente órfão não foi tratada como entrega. Matriz detalhada em [`AUDITORIA-TERRENO-L08.md`](AUDITORIA-TERRENO-L08.md).

Atualização de controle em 2026-10-02 (fechamento de matriz do L07): FIN-01..16 e ADM-01..12 conferidos requisito a requisito contra tela/API/tabelas/autorização reais e os **43 subtestes vigentes** do gate `test:l07-delivery:pg`; cada linha de FIN/ADM agora cita seus subtestes e a matriz completa está em [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md). Naquela revisão, todos permaneciam `pronto_local` na validação automática e o aceite humano estava pendente; o registro posterior está na atualização acima. Ver também [consolidação](CONSOLIDACAO-L07-PRS-PENDENTES.md) e [retomada](PROMPT-RETOMADA-L07-CONSOLIDADO.md). L04–L06 já têm entregas técnicas integradas. Estados abaixo conservam evidências por requisito, não uma porcentagem global; não houve promoção em massa nesta revisão.
Leia EXECUCAO-ENTREGA-LOCAL.md. Todos começam em a_revalidar para confrontar evidências históricas com a versão final. Isso não apaga o trabalho realizado.
Para cada ID, completar: rota/tela; API/tabela; perfil/escopo; integração; teste e commit; evidência; bloqueio; aceite humano.
Estados: a_revalidar, pendente, em_execucao, bloqueado, pronto_local, depende_integracao_externa.
SMTP/hospedagem externa estão fora da entrega; adaptadores simulados precisam ser identificados. AI-02/03/04/05/07/08 continuam no escopo.
Não copiar "verificado" de relatório histórico sem verificar a versão entregue.

## SEC-01
Inventariar rotas, APIs, tabelas, jobs, permissões e documentação no commit atual Aceite: Mapa com real/parcial/prévia/ausente e divergências documentadas
- Estado: em_execucao
- Tela / API / dados / autorização: Inventário do L00 registrado em docs/ESTADO-EXECUCAO-LOCAL.md e docs/EVIDENCIAS-ENTREGA-LOCAL.md.
- Integração e evidência (teste, resultado, commit): L00: 222 IDs únicos confirmados; 82/82 componentes administrativos órfãos; 5 achados do plano mestre revalidados como já corrigidos — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Falta o mapa completo rota-a-rota por ID (real/parcial/prévia/ausente).

## SEC-02
Corrigir verificações de escopo para negar por padrão em qualquer erro Aceite: Testar usuário A/B, outra unidade/contrato e falha de banco sem retorno de dados
- Estado: pronto_local (parcial)
- Tela / API / dados / autorização: Sessão administrativa: `server.mjs` readSession + `src/server/staff-session.mjs`; tabela `auth_staff_sessions`; nega por padrão em erro de banco.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` 21/21 (cenários 12,13,14) + `tests/staff-session-await-guard.test.mjs` 4/4 — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Parcial: cobre autenticação de staff. Escopo por unidade/contrato em consultas de negócio ainda a revalidar (L02+).

## SEC-03
Associar documentos a conta/unidade/contrato/classificação e aplicar autorização uniforme Aceite: Lista, busca, download, exportação e links respeitam o mesmo escopo
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-04
Login individual de staff, papéis, convites e revogação Aceite: Andreia acessa RH; funcionário não acessa RH geral; auditoria identifica pessoa
- Estado: em_execucao (autenticação, revogação e navegação central por papel prontas em validação automática; aceite humano pendente)
- Tela / API / dados / autorização: `/admin/entrar` (login central), `/admin` (hub por papel), `POST /api/admin/session` (e-mail/senha), `GET /api/admin/session`, `GET /api/admin/session/options`; tabelas auth_identities, auth_credentials, auth_staff_profiles, auth_staff_sessions; papel vem do banco.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` cenários 1-10 (sem perfil 403, pending_email 401, suspensão/rebaixamento/epoch derrubam sessão, auditoria com identityId — commit 6b117f0); F01 2026-10-04: gate `test:admin-entry:pg` 13/13 + `tests/admin-entry.test.mjs` 11/11 (entrada, redireciono seguro, menu por papel, revogação).
- Pendência / fronteira externa / aceite humano: "Andreia acessa RH" agora tem tela acessível com papel rh (gate browser), mas os 82 componentes administrativos de /admin/ti continuam órfãos (ver L00-9); papéis supervisor/comercial/financeiro mapeados no redireciono, jornadas próprias por módulo seguem nos lotes; convites de staff não revalidados; aceite humano pendente.

## SEC-05
Substituir tokens compartilhados por autenticação individual com migração controlada Aceite: Credenciais legadas desligadas após contas válidas; recuperação administrativa documentada
- Estado: pronto_local
- Tela / API / dados / autorização: Token compartilhado recusado por padrão em `POST /api/admin/session`; exige SITE_ADMIN_LEGACY_TOKENS=true e desliga-se quando há conta individual; bootstrap cria identidade auditável.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` cenário 11 (403 legacy_admin_tokens_disabled) + `tests/staff-auth-hardening.test.mjs` 16/16; suítes tenant/client-access/cli-v2 migradas para login individual — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Procedimento de recuperação administrativa documentado em docs/ESTADO-EXECUCAO-LOCAL.md; sem aceite humano.

## SEC-06
MFA padrão por biblioteca mantida, desafio no login, recuperação e rate limit Aceite: Senha sozinha não emite sessão privilegiada; TOTP/recovery inválido ou reutilizado negado
- Estado: pronto_local
- Tela / API / dados / autorização: `POST /api/admin/session` devolve 202+desafio quando há MFA; `POST /api/admin/session/mfa` conclui; tabelas auth_mfa e auth_mfa_challenges.
- Integração e evidência (teste, resultado, commit): `npm run test:staff-auth:pg` cenários 15,16,18,19,20,21: senha sozinha não emite sessão, TOTP replay negado, recuperação de uso único, limite de 5 tentativas, expiração, rate limit 429 — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Chave CLIENT_MFA_ENCRYPTION_KEY ausente mantém MFA indisponível (503), nunca rebaixa para senha. Aceite humano pendente.

## SEC-07
Corrigir troca de e-mail e handlers HTTP Aceite: Senha atual verificada, novo e-mail confirmado, token único/expirável, atualização atômica, aviso antigo e sessões revogadas
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-08
Migrações rastreadas e executáveis Aceite: Banco vazio e upgrade de snapshot sintético passam; constraints corretas, repetição do runner segura
- Estado: pronto_local
- Tela / API / dados / autorização: `scripts/migrate-site-visual.mjs` (manifesto 001-099) e tabela `__migrations` com checksum e lock consultivo.
- Integração e evidência (teste, resultado, commit): `npm run test:migrations:pg`: banco vazio 99/99 e 499 tabelas; segunda passagem idempotente; clone adulterado recusado com migration_checksum_mismatch — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Contagens fixas substituídas por leitura do disco. Não executado em Windows.

## SEC-09
Reparar suíte e testar APIs reais Aceite: Testes não substituem chamada HTTP por SQL demonstrativo; dependências e CI reproduzíveis
- Estado: em_execucao
- Tela / API / dados / autorização: Suítes: test:unit (177) e gates em PostgreSQL real por HTTP.
- Integração e evidência (teste, resultado, commit): L01: nova suíte HTTP real `scripts/qa-staff-auth-postgres.mjs` 21/21; suítes existentes migradas de token compartilhado/cookie forjado para login individual; nenhuma expectativa foi apagada — commit 6b117f0.
- Pendência / fronteira externa / aceite humano: Cobertura ainda concentrada em autenticação e infraestrutura; jornadas de negócio sem teste de ponta a ponta.

## SEC-10
Consolidar orçamento/simulador e catálogo Aceite: Só confirmar após persistência; preço fictício ausente do fluxo real; sem modo administrativo público
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-11
Separar prévias e recursos reais Aceite: Nenhuma simulação concede permissão ou informa envio inexistente
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-12
Privacidade e declarações de aprovação verificáveis Aceite: Minuta explicitamente pendente enquanto faltar aprovação; texto completo antes de publicar
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-13
Segurança de sessão, CSRF, origem e erros Aceite: Cookies seguros em produção, origem/CSRF em mutações, JSON limitado, métodos corretos, erro sem stack/segredo
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-14
Auditoria durável e operacional Aceite: Alterações sensíveis rastreáveis; indisponibilidade de auditoria não gera falsa segurança
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## SEC-15
Proteção de abuso e identidade Aceite: Limites de login/convite/formulário/reenvio, respostas antienumeração, proxy/IP confiável definido
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PUB-01
catálogo único dos seis serviços validados no projeto; cada item tem descrição, público, perguntas de qualificação e flag de publicação. Cerca elétrica ou novos serviços entram somente após validação comercial.
- Estado: pronto_local
- Tela / API / dados / autorização: `src/lib/service-catalog.mjs` — catálogo único dos 6 serviços (descrição, público, perguntas de qualificação, flag de publicação). Consumido por `/servicos`, `/orcamento` e `/contato`.
- Integração e evidência (teste, resultado, commit): Gate `npm run test:l04-delivery:pg` (Chromium real) navega `/servicos` e usa o mesmo catálogo em `/orcamento`/`/contato` — sessão L04, branch `arena/01a0ed3d-gruposegsystemseguranca`.
- Pendência / fronteira externa / aceite humano: Nenhum novo serviço (ex.: cerca elétrica) foi adicionado; catálogo permanece fechado aos 6 validados. Sem tela de administração do catálogo em si (é código, não CMS) — aceite humano pendente.

## PUB-02
páginas por serviço e segmento, contato claro, FAQ revisada, cases/imagens autorizados; revisão de acessibilidade, navegação e desempenho.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/servicos`, `/servicos/[id]`, `/segmentos`, `/faq`, `/contato`, `/conteudos` e `/conteudos/[slug]`; cases exigem declaração de autorização; conteúdo simples sem HTML executável.
- Integração e evidência (teste, resultado, commit): Gate L04 cenários 1, 11, 16 e 18: navegação HTTP/Chromium, viewport móvel, handoff com consentimento/protocolo e bloqueio de case não autorizado. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Aceite visual e revisão do conteúdo pelos responsáveis pendentes. Teste funcional móvel não é certificação WCAG nem ensaio de carga.

## PUB-03
orçamento e visita integrados à mesma API; protocolo persistido, consentimento/aviso pertinente, origem/campanha, antispam, deduplicação controlada e responsável de atendimento.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST /api/leads` (`server.mjs handleCreateLead`) grava `public_leads` (protocolo, consentimento, origem, campanha, canal, e-mail, dedup_key); validação em `src/lib/public-lead-validation.mjs`.
- Integração e evidência (teste, resultado, commit): Gate L04: visitante anônimo real (sem sessão) envia `/contato`; dedup/antispam/consentimento testados por HTTP direto com controles negativos (origem/campanha maliciosa, canal inválido, e-mail inválido, replay). Corrigido nesta sessão: `public-lead-validation.mjs` descartava silenciosamente origin/campaign/channel/email do formulário real; `handleCreateLead` confiava em `dedupKey` vindo do navegador — agora a chave é derivada só no servidor (telefone+cidade+serviços+janela de 30min).
- Pendência / fronteira externa / aceite humano: Responsável de atendimento por lead ainda é atribuído manualmente em `/admin/leads`, sem regra automática de distribuição. Antispam é básico (padrões de marcação/URL); sem CAPTCHA. O limite dedicado do endpoint (5 envios por IP a cada 10 min) passou a aceitar `LEAD_MAX_ATTEMPTS` por ambiente do servidor, com padrão seguro inalterado e valor inválido caindo no padrão — usado apenas pelo gate, como já era feito com `ADMIN_LOGIN_MAX_ATTEMPTS`.

## PUB-04
visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa responsável confirma, notificação não promete horário sem reserva real.
- Estado: pronto_local
- Tela / API / dados / autorização: `PATCH /api/admin/leads/:id` (`handleAdminLeadStatus`) com estados solicitada→em_agendamento→confirmada→realizada→cancelada; UI em `/admin/leads` (papéis `marcelo`,`ti`,`comercial`,`admin`).
- Integração e evidência (teste, resultado, commit): Gate L04 exercita transições de visita reais via HTTP autenticado com sessão de staff `comercial` (login real, não token). Nesta sessão (`arena/01a0eeda`), o cenário 7 do gate provou o vínculo com CRM-08: a agenda comercial propaga confirmação/realização/cancelamento ao lead de origem com `lead_visit_confirm`/`lead_visit_cancel` e histórico em `public_lead_status_audit`, na mesma transação (falha de auditoria injetada reverte a visita e o lead).
- Pendência / fronteira externa / aceite humano: Notificação ao solicitante sobre confirmação de horário usa a caixa local (L02) — nunca promete envio real (SMTP fora de escopo). Sem tela dedicada de agenda/calendário; apenas lista com status. Corrigido nesta sessão: `PATCH /api/admin/leads/:id` auditava qualquer transição de visita (inclusive cancelamento) como `lead_visit_confirm` e engolia a falha de auditoria com `try {} catch {}` — o mapeamento passou a ser fiel e a falha de trilha reverte a transição.

## PUB-05
FAQ assistida e transferência humana; bot não inventa preço, cobertura, licença ou prazo. IA/RAG só depois de base aprovada e controles do capítulo 19.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `FaqAssistedWidget` em `/faq` → `POST /api/faq-assisted`; respostas de FAQ publicada em `cms_contents`. Encaminhamento a `/contato?origin=faq`, pergunta só no navegador, lead real em `/api/leads`. Sessões/mensagens legadas protegidas.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 16: pergunta sensível sem preço inventado, resposta publicada com fonte, acesso público às sessões negado e envio real no Chromium com origem `faq`. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: LLM/RAG pertence a L09. Atendimento humano só é solicitado após persistir o formulário com consentimento; sem SMTP ou promessa de atendimento instantâneo.

## PUB-06
CMS de páginas, FAQ, cases, blog e vagas, com rascunho/revisão/publicação, histórico e reversão.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/publicacao` → CMS com admin/marcelo/ti. `cms_contents`, versões e histórico imutáveis; `/conteudos` e `/conteudos/[slug]` leem somente publicados.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 16: rascunho privado, transições, duas versões publicadas sequencialmente com uma ativa, restauração como nova versão, histórico, negação e rollback por auditoria injetada. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Textos e autorização de cases precisam de aceite humano antes de uso real. Texto simples; sem novo upload público.

## PUB-07
temas com preview, publicação autorizada, configuração persistida e rollback; preferência dia/noite separada da identidade global. Implementar após núcleo.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/tema` e aba Temas de `/admin/publicacao`; `pub_themes`, versões/histórico/preferências. Prévia isolada; publicação e rollback transacionais, um tema ativo; leitura pública mínima.
- Integração e evidência (teste, resultado, commit): Gate L04 cenários 16–17: prévia não altera estado global, publicar dois temas, restaurar anterior, recarregar navegador e manter paleta, preferência pessoal não muda tema global. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Tokens aplicados às superfícies editoriais; seleção dos dez layouts permanece em `/admin/visual`. Portais internos não são redesenhados. Aceite visual humano pendente.

## PUB-08
SEO técnico, títulos, sitemap, redirects e verificação de domínio na liberação; preservar noindex em ambientes não produtivos.
- Estado: pronto_local (limites externos/condicionais descritos abaixo)
- Tela / API / dados / autorização: `GET /robots.txt` e `GET /sitemap.xml` públicos, ambos **derivados do código** (`src/lib/seo-technical.mjs` + `src/server/seo-technical-api.mjs`); prévia autenticada `GET /api/admin/seo/sitemap-preview`; cadastro `GET/POST/PATCH /api/admin/seo-redirects`; resolução do desvio no caminho da requisição, antes do Next. Sitemap montado a partir das rotas estáticas reais + `PUBLIC_SERVICES` (`src/lib/service-catalog.mjs`) + `SEGMENT_EXAMPLES` (`src/lib/segment-examples.mjs`, convertido de `.ts` para ter uma fonte só), com XML escapado e somente `<loc>`. `noindex` fail-closed: só libera com `NEXT_PUBLIC_ENV=production` **e** `NEXT_PUBLIC_ALLOW_INDEX=true` — fora disso `Disallow: /` sem linha `Sitemap:`, `X-Robots-Tag: noindex, nofollow` e `/sitemap.xml` 404. Papéis `marcelo`,`ti`,`admin`: sem sessão 401, papel fora da lista **403** (antes era 401), mutação sem mesma origem 403, método errado 405 com `Allow`. Escrita transacional com trilha em `auth_access_audit` (`seo_redirect_create`/`seo_redirect_update`, `actor_kind` = papel) na mesma transação. Migração **112** (aditiva) reautoriza essas duas ações. Tabelas `seo_redirects` (usada), `seo_configs`/`seo_sitemap_entries` (declaradas **não** fonte de verdade).
- Integração e evidência (teste, resultado, commit): Gate `npm run test:l04-delivery:pg` **11/11 duas vezes consecutivas** — cenário "PUB-08: SEO técnico — robots/sitemap derivados, noindex fail-closed e redirect real". Prova: robots fail-closed e `/sitemap.xml` 404 imune a `?released/force/preview`; prévia 401/403/405/200 sem `/admin`, `/api/`, `/cliente`, `/funcionario`, `/layout-0`, `/qa/`, `/proposta` e sem `<lastmod>/<priority>/<changefreq>`; **cada uma das 17 URLs derivadas buscada por HTTP real exigindo 200 e `<title>` não vazio**; `GET /api/seo` e `/api/seo-configs` anônimos 401 e `comercial` 403 (vazamento de rascunho fechado); 14 recusas nomeadas do cadastro (externo absoluto, `//` relativo a protocolo, barra invertida, espaço, sombra de rota pública real, de `/admin`, de `/api` e do próprio `/sitemap.xml`, destino inexistente, destino em área interna, laço, tipo de status inventado, motivo curto e campo gerido pelo servidor vindo do cliente) — nenhuma grava linha — mais a recusa de **cadeia**, alcançável só por fixture SQL; falha de auditoria injetada por gatilho ⇒ 503 e **zero** linha em `seo_redirects`; criação 201 com exatamente 1 linha de trilha `actor_kind='ti'` e 2ª tentativa `duplicate_old_path`; ação não autorizada ainda recusada pelo banco com `23514`; salto real 301 preservando `?utm`, POST não desviado, `is_active=false` para de desviar e `true` volta, com 1 linha de trilha por alteração; `PATCH` de domínio para `verificado` ⇒ 400 `domain_verification_not_supported` com a linha ainda `pendente`; Chromium real sai de `/promo-portaria` e chega em `/servicos` usando `page.waitForResponse`, sem rolagem horizontal e sem erro de console. Também `npm test` 196/196, `npm run typecheck` 0 erros, `npm run test:migrations:pg` 112/112 checksums e 510 tabelas, `node scripts/qa-wave0-static.mjs` 5/5, `npm run build` OK.
- Pendência / fronteira externa / aceite humano: **Verificação de domínio fica FORA por fronteira externa** (exige DNS/HTTP no domínio real) — em vez de um botão que mente, o caminho que fabricava o fato foi fechado. **`SeoClient.tsx` foi descartado para esta finalidade e permanece órfão**: permite digitar qualquer URL no sitemap, `robots` livre e "Marcar verificado" com um clique. `seo_sitemap_entries` e `seo_configs` continuam existindo sem tela e sem serem fonte de verdade; a coluna `hits` continua 0 e não é incrementada (contar exigiria escrever no banco a cada requisição pública). `/layout-01..10`, `/qa/modulos` e `/proposta/aceite/[token]` ficam fora do sitemap por decisão. Curinga/regex e redirect por domínio fora. **Achado aberto registrado**: as migrações 099/100/103 redigitaram o CHECK de `auth_access_audit` e apagaram 148 ações da lista da 093; a 112 reautoriza só as duas que esta fatia prova — a migração 117 acrescenta somente ações efetivamente usadas nesta entrega; ações dos demais lotes continuam sujeitas à revisão. Indexação **não foi ligada** (nada é publicado em produção). Aceite humano pendente.

- Revalidação final L04: cenários anteriores preservados e executados novamente; consultar SHA e resultados em docs/ENTREGA-L04.md.

## PUB-09
montador de pacote/comparador de serviços e planos somente a partir de catálogo e regras aprovadas; nenhuma promessa/preço de demonstração em produção.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/publicacao` aba Pacotes e `/pacotes`; serviços publicados/validados, regras aprovadas, revisão, aprovação, publicação e comparação. APIs públicas somente leitura e sem custo interno.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 18: preço vindo do cliente recusado, publicação sem aprovação bloqueada, composição persistida, comparador real em Chromium, preço ausente continua nulo/sob consulta e revogação recolhe publicação. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Sem tabela de preço inventada, compatibilidade de equipamento garantida ou contratação automática. Precificação segue vistoria/orçamento/proposta.

## PUB-10
mensuração de origem e conversão com minimização de dados; testes A/B somente após tráfego, hipótese e tratamento de dados definidos.
- Estado: pronto_local (limites externos/condicionais descritos abaixo)
- Tela / API / dados / autorização: `GET /api/admin/leads/metrics?from=&to=` (`handleAdminLeadMetrics` em `server.mjs`) agrega `public_leads` por origem/campanha/canal e cruza com `crm_opportunities.public_lead_id`/`stage`. Painel `src/app/admin/leads/OriginMetricsPanel.tsx` renderizado em `/admin/leads`. Papéis `marcelo`,`ti`,`comercial`,`admin` (os mesmos de `GET /api/admin/leads`); sem sessão 401, papel fora da lista 403, método diferente de GET 405. Somente leitura: não escreve nada e não grava trilha por consulta. Sem migração nova (001–110 inalteradas).
- Integração e evidência (teste, resultado, commit): Gate `npm run test:l04-delivery:pg` 9/9 duas vezes consecutivas — cenário "PUB-10: mensuração de origem e conversão". Prova: 401 anônimo, 403 papel `rh`, 405 em POST com `Allow: GET`, 400 `invalid_period` (formato inválido, `from > to`, data inexistente 2026-02-31) e 400 `period_too_long` acima de 366 dias; agregados conferidos contra fixture (lead de 40 dias atrás fora da janela de 30 dias, origem em branco virando `(não informado)`, taxa 0% com base existente vs. `null` sem base); minimização provada por asserção de que telefone, e-mail, nome e ids de lead não aparecem no JSON nem no DOM, que as chaves da linha são só rótulos e inteiros, e que `&detail=1&raw=true&include=leads` não destrava nada; Chromium real com sessão `comercial` lê 4 pedidos na janela padrão de 90 dias, encurta para 30 dias esperando a resposta HTTP real e passa a ler 3.
- Pendência / fronteira externa / aceite humano: **Testes A/B continuam sem rota e sem tela, por decisão registrada** — o requisito os condiciona a tráfego, hipótese e tratamento de dados definidos, e nenhuma das três coisas existe. **`OriginMetricsClient.tsx` foi descartado para esta finalidade e permanece órfão**: é um CRUD onde um humano digitaria `total_leads`/`converted_leads` à mão, o que seria métrica inventada com cara de relatório; as tabelas da migração 092 (`pub10_origin_metrics`, `pub10_conversion_events`, `pub10_ab_tests`) continuam existindo, sem tela e sem serem fonte de verdade de nada. Fora desta fatia: exportação (CSV/PDF), gráficos, comparação entre períodos, atribuição multi-toque, contrato como degrau do funil e qualquer envio a ferramenta externa de analytics. "Ganho no funil" é decisão comercial registrada, nunca dinheiro recebido. Aceite humano pendente.

- Revalidação final L04: cenários anteriores preservados e executados novamente; consultar SHA e resultados em docs/ENTREGA-L04.md.

## CRM-01
cadastro central de empresas e contatos; nome, identificação fiscal quando necessária, segmento, cidade, unidades, canais e responsáveis. Distinguir prospect/cliente/parceiro sem duplicar entidade.
- Estado: **pronto_local** (superfície dedicada de unidades entregue nesta continuação; aceite humano pendente)
- Tela / API / dados / autorização: `/admin/crm` agora inclui `UnitManager.tsx`, com seleção de empresa, criação e edição controladas de unidade, nome da unidade (obrigatório), cidade, endereço e indicação de unidade principal. `GET /api/crm/units?companyId=...` exige escopo de empresa; `GET/PATCH /api/crm/units/:id` não permite trocar `company_id`. Regra atômica desmarca unidade principal anterior ao promover ou criar nova unidade principal. Sessão individual e família `comercial/admin/marcelo/ti`; anônimo 401, RH 403, origem/método inválidos negados. Criação e edição usam auditoria transacional com rollback.
- Integração e evidência (teste, resultado, commit): Gate dedicado `CRM-01: unidades dedicadas com escopo de empresa, unidade principal única, auditoria transacional e UI`, em PostgreSQL descartável + HTTP real + Chromium real sem `--disable-web-security`, **14/14 no total em duas execuções finais consecutivas**. O cenário dedicado prova 401/403/405, empresa obrigatória/inexistente, campos completos, edição de endereço e cidade, unidade principal sem duplicidade por desmarcação atômica, empresa imutável, auditoria e rollback por falha injetada na criação e edição. Migração aditiva 115 reautoriza `crm_unit_create` e `crm_unit_update`, preservando o CHECK anterior e exigindo `auth_access_audit_action_check` e `actor_kind='comercial'`.
- Pendência / fronteira externa / aceite humano: nenhum mapa externo, geocodificação ou integração de terceiros nesta fatia. Aceite humano/Windows continuam pendentes; L04 segue parcial e L05 não iniciado.

## CRM-02
contato com função no processo de compra (decisor, influenciador, usuário, financeiro), preferências e restrições de abordagem; registrar origem legítima, sem coleta indiscriminada.
- Estado: **pronto_local** (superfície dedicada entregue nesta continuação; aceite humano pendente)
- Tela / API / dados / autorização: `/admin/crm` agora inclui `ContactManager.tsx`, com seleção de empresa, criação e edição controladas de contato, função/papel de compra, preferências de canais e horário, restrições, origem controlada, contato principal e ativo/inativo. `GET /api/crm/contacts?companyId=...` exige escopo de empresa; `GET/PATCH /api/crm/contacts/:id` não permite trocar `company_id`. Sessão individual e família `comercial/admin/marcelo/ti`; anônimo 401, RH 403, origem/método inválidos negados. Criação e edição usam auditoria transacional.
- Integração e evidência (teste, resultado, commit): Gate dedicado `CRM-02: contato dedicado com escopo de empresa, edição e auditoria transacional`, em PostgreSQL descartável + HTTP real + Chromium real sem `--disable-web-security`, **13/13 no total em duas execuções finais consecutivas**. O cenário dedicado prova 401/403/405, empresa obrigatória/inexistente, preferências/origem inválidas, leitura por empresa, campos completos, edição de estado e função, empresa imutável, auditoria e rollback por falha injetada na criação e edição. Migração aditiva 114 reautoriza somente `crm_contact_update`, preservando o CHECK anterior e exigindo `auth_access_audit_action_check` e `actor_kind='comercial'`.
- Pendência / fronteira externa / aceite humano: nenhum envio externo, SMTP, unidade ou sincronização externa entra nesta fatia. A coluna legada `crm_contacts.company_id` permanece nullable para preservar migrações/histórico, mas toda nova criação e edição da superfície exige empresa válida. Aceite humano/Windows continuam pendentes; L04 segue parcial e L05 não iniciado.

## CRM-03
importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção de fórmula maliciosa na exportação.
- Estado: pronto_local (gate L04 15/15 em duas execuções consecutivas, PostgreSQL descartável e Chromium real)
- Tela / API / dados / autorização: `/admin/crm` com `ImportDedupReview.tsx`; `GET /api/crm/imports/:id/duplicates` e `PATCH /api/crm/imports/:id/rows/:n` (família comercial, RH 403); commit fail-closed em `POST /api/crm/imports/:id/commit`; migração 116 (`decision`, `decision_note`, `decided_by`, `decided_by_id`, `decided_at` + ação `crm_import_row_decision`).
- Integração e evidência (teste, resultado, commit): cenário 15 do gate L04 (decisão explícita persistida e auditada, 409 `pending_dedup_review`, 400 `actions_not_accepted`, rollback 503 por auditoria injetada, curinga ILIKE escapado, jornada UI em Chromium real). Local: static 5/5, migrations 116/116 (510 tabelas, clone/checksum negativo), gate L04 15/15 x2, unit 196/196, typecheck e build aprovados.
- Pendência / fronteira externa / aceite humano: sem aceite humano do proprietário. Mesclagem/atualização do registro existente, deduplicação de contatos e revisão de lotes antigos pela tela seguem fora, por decisão.

## CRM-04
converter lead do site em contato/oportunidade preservando histórico; tratar duplicidade e contato sem empresa.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST /api/crm/leads/:id/convert`; UI em `/admin/leads` (`convertLead()`, novo nesta sessão) e em `/admin/crm` (`convertLead()` pré-existente).
- Integração e evidência (teste, resultado, commit): Gate L04: conversão de lead real por HTTP autenticado (staff `comercial`) e reconversão idempotente do mesmo lead (não duplica empresa/oportunidade).
- Pendência / fronteira externa / aceite humano: Tratamento de duplicidade é feito pela chave de empresa informada manualmente no prompt; não há resolução automática de contato sem empresa.

## CRM-05
oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade e motivo de perda.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/crm` — formulário "Nova oportunidade (CRM-05)" com todos os campos (empresa, título, serviço, necessidade, unidade da mesma empresa, prioridade, previsão, valor, próxima ação/data, origem), kanban/tabela exibindo serviço, responsável, unidade, previsão, origem e motivo de perda, e painel `OpportunitySummary.tsx` de manutenção. API `POST /api/crm/opportunities` valida todos os campos (unidade precisa pertencer à mesma empresa; criação de unidade segue sendo escopo de CRM-01, sem rota própria) e `PATCH /api/crm/opportunities/:id` mantém serviço, necessidade, unidade, previsão, valor, próxima ação/data e prioridade (chave omitida não altera; `null`/string vazia limpa). Atribuição é imutável: `origin`/`campaign`/`responsible_id`/`responsible_name` nunca são editáveis (400 `field_not_editable`) e `public_lead_id` nunca vem do corpo (400 `server_managed_fields`). O responsável é gravado de verdade nos dois caminhos de criação (POST direto e conversão de lead), com nome de `auth_identities.display_name`. A listagem é pessoal (só o próprio funil), exige papel da família comercial e aplica busca/prioridade no servidor com curinga escapado (`100%` é literal). Detalhe de empresa também filtra oportunidades pela mesma borda. Mutação audita na mesma transação (falha injetada reverte).
- Integração e evidência (teste, resultado, commit): Sessão `arena/01a0eef9` (fatia notas/kanban): `npm run test:l04-delivery:pg` **8/8, duas vezes consecutivas** — o oitavo cenário cria oportunidade com TODOS os campos por HTTP e confere persistência campo a campo, exercita controles negativos de cada campo (prioridade inválida, unidade de outra empresa, valor negativo, previsão inválida, vínculo de lead forjado, empresa inexistente), imutabilidade de atribuição, manutenção por PATCH incluindo limpeza de unidade, busca literal `100%` sem casar `1000`, borda pessoal (outro comercial 404 na listagem/detalhe/PATCH, RH 403, sem sessão 401, origem ausente 403 em mutação) e a jornada de UI real preenchendo o formulário completo e conferindo cartão e tabela. Ver `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e `docs/PROMPT-CONTINUACAO-CRM-NOTAS-KANBAN.md`.
- Pendência / fronteira externa / aceite humano: Criação/edição de unidade segue sem rota própria (escopo CRM-01; o gate usa fixture SQL declarada). `service_id` do catálogo é validado quando informado, mas a UI usa `service_name` livre. Aceite humano/Windows não executado; sem SMTP/hospedagem externa.

## CRM-06
funil inicial novo → qualificação → vistoria/diagnóstico → proposta em elaboração → enviada → negociação → ganho/perdido. Motivo obrigatório para perda; reabertura auditada. Não tratar “ganho” como dinheiro recebido.
- Estado: pronto_local
- Tela / API / dados / autorização: `PATCH /api/crm/opportunities/:id` com histórico de estágio (`crm_opportunity_stages`) por transição; painel `OpportunitySummary.tsx` movimenta o funil exigindo motivo de perda e motivo de reabertura na própria interface. Regras: perda exige motivo (400 `loss_reason_required`) e o banco também recusa `stage='perdido'` sem motivo (CHECK `NOT VALID`, vale para escrita nova); motivo só existe enquanto perdido (reabertura limpa o `loss_reason` corrente — o motivo antigo permanece no histórico); sair de `perdido`/`ganho` para estágio aberto é reabertura com motivo obrigatório (400 `reopen_reason_required`) auditada com ação dedicada `crm_opportunity_reopen`; trocar direto entre `ganho` e `perdido` é recusado (400 `invalid_terminal_transition`); `is_won`/`is_lost` não podem divergir do estágio (CHECK no banco); `ganho` é estado de funil — a UI mostra explicitamente "ganho é estado de funil — não é dinheiro recebido" e o gate confere que nenhuma linha de contrato nasce do estágio.
- Integração e evidência (teste, resultado, commit): Sessão `arena/01a0eef9`: `npm run test:l04-delivery:pg` **8/8, duas vezes consecutivas** — o oitavo cenário percorre o funil completo (novo→qualificação→vistoria→proposta_elaboração→proposta_enviada→negociacao→ganho), prova perda sem motivo recusada, troca direta de terminal recusada nos dois sentidos, reabertura sem motivo recusada, reabertura com motivo limpando o `loss_reason`, histórico de estágios completo com motivos, trilha de auditoria com as ações na ordem (incluindo `crm_opportunity_reopen`), rollback por falha de auditoria injetada na reabertura e os CHECKs do banco como controle negativo por SQL. UI real movimenta estágios com os motivos exigidos. Ver `docs/EVIDENCIAS-ENTREGA-LOCAL.md`.
- Pendência / fronteira externa / aceite humano: Sem drag-and-drop no kanban (movimentação por painel de detalhe, deliberado). Aceite humano/Windows não executado.

## CRM-07
kanban e tabela, filtros, busca, tarefas vencidas, histórico de ligações/reuniões, anexos e notas internas autorizadas.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/crm` → “Abrir tarefas”; `OpportunityTasks.tsx` (tarefas pessoais com paginação real 1–100/`offset`/total, filtros de situação/busca/vencidas no servidor, edição de prazo com `expected_version` e delegação explícita), `MyDelegatedTasks.tsx` (visão pessoal “Tarefas delegadas a mim”, aceite/recusa e execução) e `OpportunityInteractions.tsx` (histórico completo). Oportunidades agora têm busca por título, filtro de prioridade e alternância kanban/tabela. Delegação: só o responsável pela oportunidade delega, tarefa a tarefa, para outro staff ativo com papel `comercial`, por e-mail exato e erro genérico (sem oráculo de diretório); nasce `pendente`, exige aceite (que transfere `responsible_id`), pode ser revogada enquanto pendente e recusada devolve o controle ao dono; tarefas de cadência (CRM-09) não são delegáveis; o delegado só vê título/prazo/prioridade/estado, empresa, título da oportunidade e quem delegou — nenhum outro acesso à oportunidade. As interações têm GET paginado (1–100, `limit`/`offset`/total), POST dos sete tipos, PATCH com `expected_version`, DELETE lógico e upload/download de anexo privado. A propriedade continua individual e sem bypass administrativo; ações e auditoria transacionam juntas (novas ações `crm_task_update`, `crm_task_delegate`, `crm_task_delegation_revoke`, `crm_task_delegation_accept`, `crm_task_delegation_decline`, `crm_task_delegated_status`). Migrações 104 (tarefas), 105/106 (interações) e 109 (versão otimista por gatilho, campos de delegação com CHECK de coerência, índice parcial). O detalhe legado mantém a borda e não deixa a tarefa delegada “sumir” do dono. Fatia `arena/01a0eef9`: o detalhe legado agora é 404 para qualquer identidade fora da propriedade e também devolve `notes`; oportunidades ganharam formulário de criação com todos os campos de CRM-05, painel de manutenção `OpportunitySummary.tsx` com movimentação de funil (motivo de perda e de reabertura exigidos), tabela/kanban com todos os campos, busca/prioridade no servidor e borda pessoal; migração 111 (notas, CHECKs de funil, ações de auditoria).
- Integração e evidência (teste, resultado, commit): tarefas — código 7bab313, PR #13; interações — código `c69685f` (histórico). Prazo/paginação/delegação — sessão `arena/01a0eeb7`: `node scripts/qa-wave0-static.mjs` 5/5; `npm run test:migrations:pg` 109/109 com replay, clone e checksum negativo (509 tabelas); `npm run test:l04-delivery:pg` **6/6, duas vezes consecutivas** — o sexto cenário é HTTP + Chromium + PostgreSQL descartável: 34 tarefas reais com paginação sem sobreposição/perda, controles negativos de `limit`/`offset`/`status`/`q`/`overdue`, busca com curinga escapado (`100%` literal), uma operação por PATCH (transição OU prazo), edição de prazo com conflito de versão real e recusa em tarefa encerrada, delegação negada sem sessão/RH/origem/e-mail inválido/não dono, erro genérico idêntico para RH/inexistente/autodelegação, tarefa de cadência não delegável (fixture SQL), pendente congela o dono, recusa devolve, revogação limpa, aceite transfere `responsible_id` (conferido no banco), delegado sem acesso à oportunidade (404/lista vazia), transições exclusivas do delegado, trilha de auditoria completa por ator e rollback por falha de auditoria injetada no aceite; na UI real, o dono busca/edita prazo/delega, o delegado (segundo navegador/sessão) aceita e conclui, e o dono revê o estado `aceita` após recarregar, sem erro de console/5xx nem rolagem horizontal. `npm test` 186/186; `npm run typecheck` 0 erros; `npm run build` com `/admin/crm`. Ver `docs/EVIDENCIAS-ENTREGA-LOCAL.md` e `docs/PROMPT-CONTINUACAO-CRM-TAREFAS-DELEGACAO.md`. Notas internas + campo a campo — sessão `arena/01a0eef9`: `qa-wave0-static` 5/5; `test:migrations:pg` 111/111 (replay, clone, checksum negativo, 510 tabelas); `npm run test:l04-delivery:pg` **8/8, duas vezes consecutivas** — o oitavo cenário cobre tudo o que está descrito acima (campo a campo, imutabilidade de atribuição, funil com reabertura auditada, CHECKs do banco por controle negativo, CRUD de notas com versão/autor/exclusão lógica/rollback de auditoria e jornada de UI completa); `npm test` 186/186; `typecheck` 0 erros; `build` com `/admin/crm`. Ver `docs/PROMPT-CONTINUACAO-CRM-NOTAS-KANBAN.md`.
- Pendência / fronteira externa / aceite humana: Requisito integral atendido nesta última fatia (sessão `arena/01a0eef9`): kanban e tabela com todos os campos de CRM-05/06, filtros (tipo/estágio/prioridade) e busca aplicados no servidor com curinga escapado, tarefas vencidas, histórico de interações com anexos e **notas internas dedicadas** (`OpportunityNotes.tsx`, `crm_opportunity_notes`, rotas em `src/server/crm-note-api.mjs`) — corpo 1–4000 com trim validado na API e no banco, versão otimista por gatilho, exclusão lógica, só quem escreveu edita/exclui, auditoria transacional (`crm_note_create`/`crm_note_update`/`crm_note_delete`) e paginação real 1–100; nota nunca aparece em superfície pública, do cliente ou de empresa. A borda pessoal passou a cobrir a oportunidade em si (listagem, detalhe legado e PATCH eram abertos a qualquer sessão de staff — defeito corrigido; RH 403, outro comercial 404, participante de visita usa a própria agenda). Revogação de delegação após aceite continua fora por decisão. Aceite humano/Windows não executado; sem SMTP/hospedagem externa.

## CRM-08
agenda de visitas e reuniões, responsável, participantes, confirmação, reagendamento e cancelamento. Links/calendário externo somente por integração configurada.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `MyAgenda` em `/admin/crm`: lista e semana reutilizam `OpportunityVisits` para ações; lembretes internos nas próximas 24h ao abrir/atualizar. API existente mantém responsável/participante, conflito de horário e versão otimista.
- Integração e evidência (teste, resultado, commit): Gate L04 cenários 4, 7 e 9: participantes, reagendamento, conflitos, vínculo com lead, navegação semanal e confirmação de visita pelo calendário, com lembrete real de visita em duas horas. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: SMTP, push e calendário externo não configurados. Lembretes desta entrega são internos à agenda; não funcionam como notificação em segundo plano. Aceite humano/Windows é L10.

## CRM-09
cadências de prospecção inicialmente como tarefas; automação de mensagens depende de autorização, opt-out quando aplicável e provedor.
- Estado: pronto_local (recorte manual; automação externa pendente)
- Tela / API / dados / autorização: `/admin/crm` → `CadenceClient.tsx`; modelos privados e passos em `crm_cadence_templates`/`crm_cadence_steps`; aplicações em `crm_cadence_enrollments`; tarefas derivadas em `crm_tasks` com `cadence_enrollment_id`, `cadence_step_id` e `suggested_channel`. Rotas `GET/POST /api/crm/cadences/templates`, `PATCH /api/crm/cadences/templates/:id`, `GET/POST /api/crm/opportunities/:id/cadences` e `PATCH /api/crm/opportunities/:id/cadence-contact`. Somente o papel `comercial` ativo cria/edita/arquiva/aplica seus modelos; proprietário da oportunidade é obrigatório; nenhum bypass administrativo.
- Integração e evidência (teste, resultado, commit): Migração `108-crm-manual-cadences.sql`; `npm run test:migrations:pg` 108/108, replay, clone/checksum negativo, 509 tabelas; `npm run test:l04-delivery:pg` 5/5 com Chromium + HTTP + PostgreSQL descartável. O cenário CRM-09 cria/edita modelo pela UI, recarrega, aplica tarefas, prova outro comercial/RH/sessão/origem/método/campos inválidos, oportunidade alheia, deduplicação, conflito de versão, opt-out, ganho, contato inativo e rollback de auditoria.
- Pendência / fronteira externa / aceite humano: Canal é apenas sugestão; não há envio automático, worker, SMTP ou provedor. Opt-out cancela pendências abertas/em andamento; ganho/perda e contato inativo fazem o mesmo, preservando concluídas. Reativação não ressuscita tarefas; novo contato/modelo exige novo fluxo. Aceite humano/Windows pendente.

## CRM-10
carteira com renovação, serviços adicionais, reativação, indicações, oportunidades sem próxima ação e relacionamentos por grupo/unidade.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/carteira` e `/api/crm/portfolio`: carteira pessoal, grupo/unidade, falta/vencimento de próxima ação e ações de renovação/upsell/cross-sell/recuperação/indicação. Reutiliza oportunidades, renovações e indicações; vínculo/idempotência em `crm_portfolio_actions`.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 19: usuário A/B, criação vinculada, retry sem duplicidade, recuperação de perdida, auditoria transacional com rollback e UI móvel. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Carteira pessoal conforme política anterior; ganho não representa recebimento. Implantação e efeitos contratuais pertencem a L05.

## CRM-11
separar serviços recorrentes/avulsos, instalação, manutenção, venda, locação/comodato quando praticados. Campos: unidade de cobrança, escopo, exclusões, recursos, custo, preço, vigência e aprovação.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. Serviços/equipamentos via `CatalogClient.tsx`/`EquipmentClient.tsx` na tab catálogo.
- Integração e evidência (teste, resultado, commit): Gate L04 usa catálogo/equipamento reais como base do orçamento técnico e de mão de obra.
- Pendência / fronteira externa / aceite humano: Locação/comodato como modalidade de cobrança não foi exercitada explicitamente no gate; existe no schema.

## CRM-12
equipamentos: fabricante/modelo, especificações, compatibilidades, fornecedor, garantia e ligação com estoque. Não confundir serviço com item físico.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `EquipmentClient.tsx`.
- Integração e evidência (teste, resultado, commit): Gate L04 cria/consulta equipamento real vinculado ao orçamento técnico.
- Pendência / fronteira externa / aceite humano: Ligação com estoque físico não foi exercitada (fora do escopo local declarado).

## CRM-13
vistoria com checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações e responsável técnico.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `InspectionClient.tsx` na tab vistoria.
- Integração e evidência (teste, resultado, commit): Gate L04: cria vistoria real vinculada à visita/oportunidade, por HTTP autenticado, antes de orçar.
- Pendência / fronteira externa / aceite humano: Fotos autorizadas e checklist completo por serviço não foram exercitados byte a byte; o gate cobre os campos estruturais.

## CRM-14
orçamento de mão de obra com composição de cobertura, salários e custos aplicáveis, benefícios, provisões, substituição, supervisão, uniforme/EPI, deslocamento, materiais e indiretos.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `LaborBudgetClient.tsx` na tab orçamentos.
- Integração e evidência (teste, resultado, commit): Gate L04 cria orçamento de mão de obra real vinculado à vistoria.
- Pendência / fronteira externa / aceite humano: Todos os componentes de custo (benefícios, provisões, substituição etc.) existem no schema; o gate não confere cada um isoladamente, só a criação e o fluxo de aprovação de preço.

## CRM-15
orçamento técnico com materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia e manutenção.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `TechnicalBudgetClient.tsx` na tab orçamentos.
- Integração e evidência (teste, resultado, commit): Gate L04 cria orçamento técnico real (materiais/equipamento/instalação) vinculado à mesma vistoria.
- Pendência / fronteira externa / aceite humano: Garantia e manutenção como campos foram criados no schema; não foram todos exercitados individualmente pelo gate.

## CRM-16
parâmetros de tributos/custos/jornada versionados com validade, fonte e aprovador; nenhuma alíquota ou regra coletiva inventada. Impedir preço oficial se faltar parâmetro essencial.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `CostParameterClient.tsx` na tab precos.
- Integração e evidência (teste, resultado, commit): Gate L04 prova o bloqueio intencional: sem parâmetro essencial, o preço oficial não pode ser aprovado (`essential_params_missing_cannot_approve_official_price`) — comportamento correto da regra de negócio, confirmado por controle negativo real, não simulado.
- Pendência / fronteira externa / aceite humano: Fonte/aprovador de cada parâmetro não foram auditados um a um; o gate cobre o efeito (bloqueio) e não o cadastro completo de todas as alíquotas.

## CRM-17
cenários de preço e margem, separando margem de markup. Para tributos proporcionais à receita e margem sobre receita, uma simulação pode usar preço = custo / (1 - taxa - margem), somente sob premissas explícitas, denominador válido e aprovação contábil. Não impor essa fórmula a todos os regimes.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `PriceScenarioClient.tsx` na tab precos.
- Integração e evidência (teste, resultado, commit): Gate L04 cria cenário de preço válido e testa controle negativo de denominador inválido (fórmula preço = custo / (1 - taxa - margem) recusada quando o denominador não é positivo).
- Pendência / fronteira externa / aceite humano: Aprovação contábil formal do cenário é um campo/flag no fluxo, não uma integração externa real; permanece decisão local, não contábil oficial.

## CRM-18
alçadas de desconto e exceções; motivo, solicitante, aprovador e versão. Alteração de itens/custos após aprovação reabre a aprovação.
- Estado: pronto_local
- Tela / API / dados / autorização: `src/server/discount-api.mjs` (corrigido nesta sessão) + `DiscountClient.tsx` na tab precos.
- Integração e evidência (teste, resultado, commit): Achado e corrigido nesta sessão: a verificação de alçada era um bloco vazio (nunca bloqueava de fato) com bypass implícito para qualquer papel/admin. Agora: bloqueio de autoaprovação verificado primeiro (solicitante == aprovador nunca aprova), depois `hasPermission(pool,{permission:'proposals.approve_discount'})` real via `auth_permissions` — sem bypass por papel. Gate L04 prova: negação de autoaprovação, negação por falta de permissão, aprovação real por segunda identidade com a concessão, e reabertura da aprovação após editar item pós-aprovação (mecanismo já existente, agora com trilha de prova ponta a ponta).
- Pendência / fronteira externa / aceite humano: A concessão de `proposals.approve_discount` ainda é feita nesta entrega via inserção direta em `auth_permissions` para fins de prova; não há tela de administração de concessão de permissões comerciais (a de RH/portal cobre outros domínios).

## CRM-19
proposta versionada com itens, quantidades, recorrência, implantação, escopo, exclusões, prazo, reajuste previsto, validade e condições; PDF gerado a partir da mesma versão persistida.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `ProposalClient.tsx` na tab propostas.
- Integração e evidência (teste, resultado, commit): Gate L04: cria proposta versionada com itens reais, transições de versão, trava de itens após envio (409), e gera PDF cujos bytes/cabeçalho são verificados de verdade (não é simulação).
- Pendência / fronteira externa / aceite humano: Reajuste previsto e condições contratuais complexas existem como campos; não foram todos exercitados individualmente.

## CRM-20
estados rascunho → revisão → aprovada para envio → enviada → aceita/recusada/expirada/substituída; preservar versões enviadas.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `ProposalClient.tsx`.
- Integração e evidência (teste, resultado, commit): Gate L04 percorre rascunho→revisão→aprovada para envio→enviada, incluindo a trava de itens (409) após o envio; versões anteriores preservadas.
- Pendência / fronteira externa / aceite humano: Estados aceita/recusada/expirada/substituída são exercitados via o fluxo de aceite (CRM-22/23), não isoladamente aqui.

## CRM-21
envio rastreado com estados realistas (fila, enviado pelo provedor, falhou; entrega/leitura só quando comprovadas), aceite e assinatura por integração.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `ProposalDeliveryClient.tsx` na tab propostas.
- Integração e evidência (teste, resultado, commit): Gate L04 confirma que a entrega é honesta: usa só a caixa de saída local (L02), nunca declara "entregue"/"lido" sem `proof` explícito — sem SMTP nem provedor real, conforme escopo.
- Pendência / fronteira externa / aceite humano: Assinatura por integração (DocuSign etc.) não existe e não está no escopo local; aceite é só o link seguro (CRM-22).

## CRM-22
aceite por link seguro, expirável e vinculado à versão, se adotado; decisão jurídica sobre valor do aceite registrada. Não chamar clique simples de assinatura qualificada.
- Estado: pronto_local
- Tela / API / dados / autorização: `src/server/proposal-acceptance-api.mjs` (bug de `require()` em ESM corrigido nesta sessão) + nova página pública `/proposta/aceite/[token]` (`AcceptanceClient.tsx`, novo nesta sessão) — primeira UI para esse fluxo, que antes só existia como API.
- Integração e evidência (teste, resultado, commit): Gate L04 prova por Chromium real: token forjado 404, versão divergente após nova versão 409, link expirado 410 (backdatando `created_at` e `expires_at` para satisfazer `chk_expires_future`), aceite real preenchendo o formulário, reuso do link já aceito 410. Cópia explícita na tela: "aceite simples, não assinatura qualificada".
- Pendência / fronteira externa / aceite humano: Decisão jurídica formal sobre o valor do aceite simples não foi registrada (é uma decisão de negócio/jurídica, fora do escopo técnico desta sessão).

## CRM-23
proposta aceita cria contrato/implantação de modo idempotente; retries não duplicam cliente, contrato, postos ou faturamento.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/comercial` (`ComercialWorkspace.tsx`, novo nesta sessão) — tabs vistoria/orcamentos/precos/propostas/contratos/catalogo/relatorios/biblioteca. `ContractClient.tsx` na tab contratos.
- Integração e evidência (teste, resultado, commit): Gate L04 aceita a proposta duas vezes seguidas (reuso do link já usado → 410) e confirma, via consulta direta, que existe exatamente uma linha de contrato — idempotência real provada, não assumida.
- Pendência / fronteira externa / aceite humano: É um contrato mínimo/stub: sem numeração fiscal, sem integração de faturamento; rotulado como tal.

## CRM-24
relatórios de conversão por etapa/origem, ciclo de vendas, tarefas atrasadas, motivos de perda, pipeline por período e cenário. Previsão ponderada é estimativa identificada.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: Relatórios em `/admin/comercial`; consultas usam fontes limitadas à identidade antes da agregação. Conversão, ciclo, perdas, atrasos, pipeline e previsão ponderada.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 19: total de oportunidades conferido, usuário alheio com zero, estimativa de 1000 ponderada em 100 no estágio novo e marcação explícita de estimativa. Cenário 1 mantém acesso às telas anteriores. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Probabilidades são estimativas; cenários de preço são alternativas vinculadas, sem soma como receita. Não equivale a faturado/recebido ou previsão garantida.

## CRM-25
metas e comissões versionadas; base de cálculo (contratado/faturado/recebido), período, cancelamento e aprovação configuráveis, sem pagamento automático.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: `/admin/comercial`: metas/regras/comissões da gestão, leitura comercial limitada, `crm_commercial_versions` imutável e snapshot da regra utilizada. Alterar regra retira aprovação; cálculo anterior preservado.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 20: meta versionada, regra recebida de 5%, base informada de 1000 → comissão de 50, aprovação, bloqueio de pagamento antecipado/conflitante, cancelamento com motivo e preservação do cálculo após mudar regra. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Sem pagamento automático. Base informada é manual e deve ser conferida pela gestão; integração com recebíveis/faturamento é L07. Registros antigos sem regra comprovada mantêm snapshot nulo.

## CRM-26
biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação de propostas.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: Biblioteca/campanhas/comparação em `/admin/comercial`, gestão restrita; edição de material revoga aprovação, campanha exige biblioteca aprovada e é pausada se o material perde aprovação.
- Integração e evidência (teste, resultado, commit): Gate L04 cenário 20: material rascunho bloqueia campanha, aprovação permite cadastro, edição volta a rascunho e pausa campanha ativa; reativação com material não aprovado é negada. Versões preservadas. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Nenhum disparo de campanha externo. URLs de materiais restringidas a HTTPS/caminho interno. Conteúdo e autorização real dos materiais dependem do responsável.

## CRM-27
parcerias e indicações, renovação/upsell e recuperação da carteira, com responsáveis e métricas.
- Estado: pronto_local (escopo técnico L04)
- Tela / API / dados / autorização: Parcerias/indicações/renovações em `/admin/comercial` e ações em `/admin/carteira`; leitura comercial própria e gestão administrativa explícita; filtro de datas das métricas corrigido.
- Integração e evidência (teste, resultado, commit): Gate L04 cenários 19–20: renovação/upsell/cross-sell/recuperação/indicação com vínculo; métricas da carteira derivadas do funil; renovação de 100 para 125 com uplift 25%; filtro por período/responsável retorna contagem correta. Evidência final, SHA e links em docs/ENTREGA-L04.md.
- Pendência / fronteira externa / aceite humano: Sem comissão automática de parceiros, contatos externos ou sincronização contratual completa; efeitos de L05/L07 permanecem nesses lotes.

## CON-01
contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos. Admissão de cadastro manual com origem identificada.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/admin/contratos` e detalhe; `contract-l05-api.mjs`; `crm_contracts`, unidades/itens/responsáveis e vínculos L02/portal da 118. Só `admin`/`marcelo` escrevem; comercial só lê a própria carteira.
- Integração e evidência (teste, resultado, commit): Gate L05: cadastro manual sem proposta fictícia, retry, unidade da empresa, responsável, item e documento privado; HTTP+PG+Chromium aprovado.
- Pendência / fronteira externa / aceite humano: documento deve já existir no provider privado L02; nenhuma conta/contrato de portal é criado automaticamente; aceite humano pendente.

## CON-02
itens recorrentes e avulsos, postos/turnos contratados, SLA, obrigações de cada parte, exclusões e cronograma.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: detalhe contratual usa recursos `items`, `posts`, `sla`, `obligations`, `exclusions` e `schedule`, todos com whitelist, escopo de empresa/unidade e leitura persistida.
- Integração e evidência (teste, resultado, commit): Gate L05 persiste item recorrente, posto e SLA; valida referência de unidade fora da empresa.
- Pendência / fronteira externa / aceite humano: dimensionamento operacional posterior não é inferido pelo cadastro de posto.

## CON-03
estados rascunho, em revisão, aguardando assinatura, ativo, suspenso e encerrado; transições autorizadas e data de efeito. Não confundir assinatura com ativação operacional.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/status` registra histórico, data de efeito e evento de assinatura separado; ativação somente para gestor autorizado e com pré-requisitos.
- Integração e evidência (teste, resultado, commit): Gate L05 prova 409 para implantação incompleta, assinatura sem ativação e ativação posterior válida.
- Pendência / fronteira externa / aceite humano: assinatura externa não é executada nem alegada; a evidência informada é registro interno.

## CON-04
aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobrescrever valores históricos ou gerar cobrança duplicada.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/amendments` exige chave idempotente, base, justificativa e data; aprovação grava histórico e não reescreve o total histórico.
- Integração e evidência (teste, resultado, commit): Gate L05 aprova reajuste e confirma `crm_contracts.total_price` original preservado.
- Pendência / fronteira externa / aceite humano: não há geração de cobrança ou reajuste financeiro automático.

## CON-05
alertas configuráveis de vencimento/renovação, tarefas com responsável e negociação vinculada ao CRM.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: regras e execução em `/alert-rules`; `crm_contract_alert_runs` impede duplicação e cria tarefa, oportunidade CRM e notificação local `queued` na mesma transação.
- Integração e evidência (teste, resultado, commit): Gate L05 reprocessa a mesma data e confirma uma única execução com tarefa/oportunidade/outbox.
- Pendência / fronteira externa / aceite humano: `queued` é caixa de saída local, não envio, entrega ou leitura externa.

## CON-06
obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/document-obligations`; aprovação exige `client_document_id` privado no contrato portal explicitamente vinculado; mapa 118 preserva a prova.
- Integração e evidência (teste, resultado, commit): Gate L05 cria obrigação e só aprova com comprovante privado em escopo.
- Pendência / fronteira externa / aceite humano: não há upload de bytes novo nesta tela; reutiliza L02.

## CON-07
implantação com checklist: contrato, data de início, postos, dimensionamento, contratação/alocação, exames/treinamentos, equipamentos, instruções, faturamento e convite do cliente.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/implantation` cria/backfill dez passos explicitamente pendentes; atualização requer base de verificação e checks reais para assinatura, início e postos.
- Integração e evidência (teste, resultado, commit): Gate L05 conclui passos sintéticos documentados e só então ativa.
- Pendência / fronteira externa / aceite humano: RH/operação/faturamento de lotes posteriores não são simulados como integração automática.

## CON-08
bloqueios claros para implantação incompleta; exceção somente autorizada, motivada e permitida pelas regras aplicáveis. Não permitir contornar exigência legal com simples checkbox.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: bloqueios e exceções em `/implantation`; exceção tem motivação, aprovação e validade; bloqueio legal é não-waivable.
- Integração e evidência (teste, resultado, commit): Gate L05 prova ativação recusada antes do checklist e ativação válida apenas após condições.
- Pendência / fronteira externa / aceite humano: avaliação jurídica permanece humana; a API apenas impede a exceção legal.

## CON-09
encerramento com desmobilização de equipe, devolução, cobranças/pendências, documentos e revogação de escopos; preservar histórico.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/closure` exige passos concluídos; preserva registros e revoga somente contrato portal associado, mantendo grants de outros contratos ativos.
- Integração e evidência (teste, resultado, commit): Gate L05 fecha o checklist, verifica contrato CRM/portal encerrado e allowlist do outro contrato preservada.
- Pendência / fronteira externa / aceite humano: não baixa cobrança nem apaga pendência; comunicação externa não é enviada.

## CON-10
dossiê de fiscalização contratual, medição/aceite de serviços e evidências de qualidade.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/fiscal` persiste dossiê e medição; evidência aceita exclusivamente documento privado L02 no escopo do contrato.
- Integração e evidência (teste, resultado, commit): Gate L05 cria dossiê e medição por HTTP com papel autorizado.
- Pendência / fronteira externa / aceite humano: não emite documento fiscal e não aceita URL como evidência.

## CON-11
diário de decisões de gestão com acesso restrito, vínculo a contrato/processo e busca; não armazenar segredos ou prontuários em notas livres.
- Estado: pronto_local (L05)
- Tela / API / dados / autorização: `/management-diary` é restrito a `admin`/`marcelo`, pesquisa no escopo do contrato e rejeita padrões de senha/token/CPF/prontuário.
- Integração e evidência (teste, resultado, commit): Gate L05 grava decisão e confirma 403 para comercial.
- Pendência / fronteira externa / aceite humano: filtro de termos é defesa adicional, não substitui política humana de classificação.

## EMP-01
perfil próprio e solicitação de atualização cadastral; dados restritos mascarados conforme necessidade e mudança revisada.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` (perfil e login próprio); `/api/employee/session`, `/me`, `/profile-updates`; `auth_employee_access`, `hr_employees`; titular derivado do cookie employee.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: login individual, perfil A/B, parâmetro `employee_id` adversarial ignorado, troca de senha com revogação. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-02
próximo plantão com local, horário, função, contato do supervisor, orientações e itens necessários.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Jornada/Pedidos; fachada `/api/employee/home`, `/schedule/:id/ack` e `/actions/{time-correction,absence}`; dados 065 + escala/ponto de RH.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03 HTTP + Chromium móvel: próximo plantão, escala publicada/ciência, jornada, correção e ausência pela interface; A/B isolados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-03
calendário de escala, folgas, alterações e ciência da versão publicada; usuário não modifica unilateralmente a escala.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Jornada/Pedidos; fachada `/api/employee/home`, `/schedule/:id/ack` e `/actions/{time-correction,absence}`; dados 065 + escala/ponto de RH.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03 HTTP + Chromium móvel: próximo plantão, escala publicada/ciência, jornada, correção e ausência pela interface; A/B isolados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-04
jornada individual, comprovantes/importação de provedor, divergências e pedido de correção; preservar registro original.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Jornada/Pedidos; fachada `/api/employee/home`, `/schedule/:id/ack` e `/actions/{time-correction,absence}`; dados 065 + escala/ponto de RH.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03 HTTP + Chromium móvel: próximo plantão, escala publicada/ciência, jornada, correção e ausência pela interface; A/B isolados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-05
aviso de ausência/atraso com protocolo, motivo limitado, responsável e acompanhamento; aciona fluxo de cobertura.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Jornada/Pedidos; fachada `/api/employee/home`, `/schedule/:id/ack` e `/actions/{time-correction,absence}`; dados 065 + escala/ponto de RH.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03 HTTP + Chromium móvel: próximo plantão, escala publicada/ciência, jornada, correção e ausência pela interface; A/B isolados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-06
troca de plantão com solicitação, aceite do outro profissional quando aplicável, validações e aprovação operacional.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Pedidos/Mais; `/api/employee/actions/{shift-swap,handover,occurrence,procedure-ack}`; tabelas da migração 066, sempre no escopo da sessão.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: troca com aceite do destinatário, passagem com aceite, ocorrência privada e ciência de procedimento; alvos de outra unidade/titular negados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-07
passagem de serviço com pendências, chaves, equipamentos, ocorrências e aceite; não expor dados desnecessários de terceiros.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Pedidos/Mais; `/api/employee/actions/{shift-swap,handover,occurrence,procedure-ack}`; tabelas da migração 066, sempre no escopo da sessão.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: troca com aceite do destinatário, passagem com aceite, ocorrência privada e ciência de procedimento; alvos de outra unidade/titular negados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-08
ocorrência com categoria, descrição, horário, local e anexo pertinente; restrição para informações pessoais.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Pedidos/Mais; `/api/employee/actions/{shift-swap,handover,occurrence,procedure-ack}`; tabelas da migração 066, sempre no escopo da sessão.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: troca com aceite do destinatário, passagem com aceite, ocorrência privada e ciência de procedimento; alvos de outra unidade/titular negados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-09
procedimentos do posto versionados, ciência e contatos de apoio.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Pedidos/Mais; `/api/employee/actions/{shift-swap,handover,occurrence,procedure-ack}`; tabelas da migração 066, sempre no escopo da sessão.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: troca com aceite do destinatário, passagem com aceite, ocorrência privada e ciência de procedimento; alvos de outra unidade/titular negados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-10
envio de documentos solicitados, status pendente/em análise/aprovado/rejeitado com motivo e nova versão.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Documentos/Pedidos/Mais; documentos privados, solicitações e uniforme/EPI em `/api/employee/*`; migração 067 + provider/hash da 102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: upload/download privado, revisão RH, holerite próprio, solicitação e recibo operacional de EPI; acessos cruzados retornam 404. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-11
holerites/informes/documentos próprios, acesso privado e histórico de disponibilização; publicação proveniente de fonte autorizada.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Documentos/Pedidos/Mais; documentos privados, solicitações e uniforme/EPI em `/api/employee/*`; migração 067 + provider/hash da 102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: upload/download privado, revisão RH, holerite próprio, solicitação e recibo operacional de EPI; acessos cruzados retornam 404. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-12
férias, afastamentos, benefícios e reembolsos com solicitação, anexos restritos, aprovação e prazo de resposta.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Documentos/Pedidos/Mais; documentos privados, solicitações e uniforme/EPI em `/api/employee/*`; migração 067 + provider/hash da 102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: upload/download privado, revisão RH, holerite próprio, solicitação e recibo operacional de EPI; acessos cruzados retornam 404. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-13
uniformes/EPI/equipamentos com entrega, recibo, solicitação de troca e devolução.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Documentos/Pedidos/Mais; documentos privados, solicitações e uniforme/EPI em `/api/employee/*`; migração 067 + provider/hash da 102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: upload/download privado, revisão RH, holerite próprio, solicitação e recibo operacional de EPI; acessos cruzados retornam 404. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-14
cursos e reciclagens, comprovantes e alertas de vencimento.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Documentos/Mais; cursos, comunicados, atendimento RH e canal confidencial em `/api/employee/actions/*`; migração 068.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: comprovante de curso no provider privado, comunicação/central, protocolo RH e canal identificado; recursos de A negados a B. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-15
comunicados direcionados, confirmação de leitura e central de notificações.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Documentos/Mais; cursos, comunicados, atendimento RH e canal confidencial em `/api/employee/actions/*`; migração 068.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: comprovante de curso no provider privado, comunicação/central, protocolo RH e canal identificado; recursos de A negados a B. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-16
atendimento RH com protocolo, categoria, mensagens privadas e acompanhamento.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Documentos/Mais; cursos, comunicados, atendimento RH e canal confidencial em `/api/employee/actions/*`; migração 068.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: comprovante de curso no provider privado, comunicação/central, protocolo RH e canal identificado; recursos de A negados a B. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## EMP-17
canal confidencial separado, com responsáveis e política de acesso; anonimato somente se efetivamente suportado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Início/Documentos/Mais; cursos, comunicados, atendimento RH e canal confidencial em `/api/employee/actions/*`; migração 068.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate L03: comprovante de curso no provider privado, comunicação/central, protocolo RH e canal identificado; recursos de A negados a B. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Canal sigiloso e identificado; anonimato não está habilitado e pedido anônimo falha explicitamente. Aceite humano no Windows pendente.

## EMP-18
PWA instalável e fila offline limitada para tarefas operacionais aprovadas; idempotência, conflito explícito, horário do dispositivo e recebimento no servidor separados. Não cachear documentos médicos/salariais por padrão.
- Estado: pronto_local
- Tela / API / dados / autorização: PWA `/funcionario`, fila local por empregado só para ciência aprovada e `/api/employee/offline`; service worker exclui API/portal e conteúdo médico/salarial; migração 069/102.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Chromium fica offline, guarda 1 tarefa, volta online e espera 201; HTTP prova retry idempotente, conflito explícito e timestamps separados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Fila deliberadamente limitada; não armazena documentos médicos/salariais. Teste no Windows permanece para L10.

## EMP-19
FAQ interna, acessibilidade por teclado/leitor, linguagem simples e baixo consumo de dados.
- Estado: pronto_local
- Tela / API / dados / autorização: `/funcionario` > Mais, FAQ interno e preferências de acessibilidade; layout móvel 390×844, navegação sem mouse e linguagem simples; migração 069.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium percorre todas as abas, encontra FAQ/acessibilidade e recusa rolagem horizontal; build e typecheck aprovados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; nenhuma integração externa é alegada.

## HR-01
cadastro profissional separado de identidade de login; matrícula, vínculo, cargo, empregador/filial, gestor, admissão, status, contatos necessários e histórico.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Admissão & acesso/Processos HR-01,02,05; `hr-api` e migração 057; cadastro laboral separado da identidade e remuneração sob concessão própria.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium cria cadastro + admissão + acesso e escala; HTTP prova salário mascarado sem `employees.compensation.read`. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-02
histórico de cargo, lotação, remuneração autorizada e vínculo com datas de efeito; acesso por campo/categoria.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Admissão & acesso/Processos HR-01,02,05; `hr-api` e migração 057; cadastro laboral separado da identidade e remuneração sob concessão própria.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium cria cadastro + admissão + acesso e escala; HTTP prova salário mascarado sem `employees.compensation.read`. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-03
recrutamento com vaga, requisitos pertinentes, candidatos, triagem, entrevista, decisão e comunicação; retenção e acesso próprios para currículo.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-03,04,06; `HrRecruitmentClient`, `hr-recruitment-api` e migração 059, sob `employees.read/write`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre o grupo conectado e exige carga das APIs sem erro; migração 001–102 e build aprovados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-04
banco de talentos e autorização/base aplicável; descarte configurado, sem acúmulo indefinido.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-03,04,06; `HrRecruitmentClient`, `hr-recruitment-api` e migração 059, sob `employees.read/write`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre o grupo conectado e exige carga das APIs sem erro; migração 001–102 e build aprovados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Política e descarte são configuráveis; base jurídica e prazos reais exigem decisão do controlador. Aceite Windows pendente.

## HR-05
admissão com checklist por função, documentos, validação, exame/treinamento e integração; não exigir dado sem finalidade.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Admissão & acesso/Processos HR-01,02,05; `hr-api` e migração 057; cadastro laboral separado da identidade e remuneração sob concessão própria.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium cria cadastro + admissão + acesso e escala; HTTP prova salário mascarado sem `employees.compensation.read`. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-06
dossiê com tipos, versões, validade, pendências e aprovador. CNV e demais documentos apenas para funções/atividades aplicáveis, após confirmação.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-03,04,06; `HrRecruitmentClient`, `hr-recruitment-api` e migração 059, sob `employees.read/write`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre o grupo conectado e exige carga das APIs sem erro; migração 001–102 e build aprovados. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-07
desligamento com checklist, devolução, revogação, documentação e pendências; histórico laboral preservado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Desligamento/Processos HR-07..09; `hr-termination-api`, políticas/status/férias e migração 060; trigger 102 revoga acesso.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate conclui desligamento pela interface e comprova sessão employee revogada; status/papel/senha também têm controles negativos. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-08
mudança de status (afastado/suspenso/desligado) com efeito em permissões e alocação conforme política, sem automatizar sanção trabalhista.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Desligamento/Processos HR-07..09; `hr-termination-api`, políticas/status/férias e migração 060; trigger 102 revoga acesso.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate conclui desligamento pela interface e comprova sessão employee revogada; status/papel/senha também têm controles negativos. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-09
férias com períodos aquisitivo/concessivo quando aplicáveis, saldo importado/validado, programação, conflito de cobertura e aprovação.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Desligamento/Processos HR-07..09; `hr-termination-api`, políticas/status/férias e migração 060; trigger 102 revoga acesso.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate conclui desligamento pela interface e comprova sessão employee revogada; status/papel/senha também têm controles negativos. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-10
afastamentos com período, retorno, documentação restrita e substituição; supervisor vê indisponibilidade/aptidão operacional necessária, não diagnóstico.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-10..12 e portal Jornada; `hr-absence-api`, afastamentos/ponto/banco/regras versionadas; migração 061.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium solicita correção e ausência; grupo RH carrega APIs reais; fechamento demonstrativo preserva trilha. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-11
integração de ponto, justificativas, divergências, workflow de correção e fechamento de competência; trilha de reabertura.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-10..12 e portal Jornada; `hr-absence-api`, afastamentos/ponto/banco/regras versionadas; migração 061.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium solicita correção e ausência; grupo RH carrega APIs reais; fechamento demonstrativo preserva trilha. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-12
banco de horas, adicionais e horas extras somente com regras versionadas e validadas para o vínculo/convenção; não fixar 12x36/6x1 como regra universal.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-10..12 e portal Jornada; `hr-absence-api`, afastamentos/ponto/banco/regras versionadas; migração 061.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium solicita correção e ausência; grupo RH carrega APIs reais; fechamento demonstrativo preserva trilha. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-13
benefícios com elegibilidade, solicitações, conferência, alterações por período e exportação ao fornecedor.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-13..16; `hr-benefits-api`, benefícios/adiantamentos/saúde/exportações da migração 062; saúde usa `employees.health.*`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre formulários e APIs conectados sem erro; autorização separada de saúde e borda granular foram exercitadas. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Exportação local não comprova entrega ao fornecedor. Integração externa não é alegada; aceite Windows pendente.

## HR-14
adiantamentos/reembolsos com alçada e comprovantes, integração com financeiro e prevenção de duplicidade.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-13..16; `hr-benefits-api`, benefícios/adiantamentos/saúde/exportações da migração 062; saúde usa `employees.health.*`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre formulários e APIs conectados sem erro; autorização separada de saúde e borda granular foram exercitadas. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-15
saúde ocupacional com agenda, vencimentos e documentos necessários; acesso restrito. Não replicar prontuário médico completo no cadastro comum.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-13..16; `hr-benefits-api`, benefícios/adiantamentos/saúde/exportações da migração 062; saúde usa `employees.health.*`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre formulários e APIs conectados sem erro; autorização separada de saúde e borda granular foram exercitadas. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Acesso de saúde é separado; o sistema não se declara prontuário médico. Validação ocupacional e aceite Windows pendentes.

## HR-16
integração/exportação para contabilidade/SST, recibos de processamento, erros e correção. Não declarar envio eSocial sem protocolo válido do responsável/provedor.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-13..16; `hr-benefits-api`, benefícios/adiantamentos/saúde/exportações da migração 062; saúde usa `employees.health.*`.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate Chromium abre formulários e APIs conectados sem erro; autorização separada de saúde e borda granular foram exercitadas. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Adaptador/recibo local, sem afirmar envio eSocial/SST oficial. Provedor e protocolo externo dependem de integração futura.

## HR-17
treinamento por cargo/atividade, obrigatoriedade aplicável, validade, inscrição, presença e comprovante.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-17..20 e Fechamento; `hr-training-api`, treinamento/competências/uniformes/DP da migração 063.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate prova curso/comprovante e uniforme/recibo no escopo próprio, fecha competência pela interface e carrega o grupo RH completo. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-18
matriz de competências integrada à alocação, sem decisão automática de contratação/punição.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-17..20 e Fechamento; `hr-training-api`, treinamento/competências/uniformes/DP da migração 063.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate prova curso/comprovante e uniforme/recibo no escopo próprio, fecha competência pela interface e carrega o grupo RH completo. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-19
uniformes/EPI com entrega, recibo, substituição, validade/controle aplicável e devolução.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-17..20 e Fechamento; `hr-training-api`, treinamento/competências/uniformes/DP da migração 063.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate prova curso/comprovante e uniforme/recibo no escopo próprio, fecha competência pela interface e carrega o grupo RH completo. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-20
fechamento DP com faltas, férias, variáveis e documentos conferidos; exportação versionada e acesso do contador limitado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Processos HR-17..20 e Fechamento; `hr-training-api`, treinamento/competências/uniformes/DP da migração 063.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate prova curso/comprovante e uniforme/recibo no escopo próprio, fecha competência pela interface e carrega o grupo RH completo. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Fechamento é demonstrativo e não constitui cálculo trabalhista oficial; validação contábil e aceite Windows pendentes.

## HR-21
holerites/informes importados de fonte autorizada, vinculação inequívoca ao colaborador, revisão antes de publicar e correção rastreada.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Fechamento & holerite/Processos HR-21..24; `hr-advanced-api` + documentos privados 102; migração 064.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate publica e baixa holerite pela interface com fonte/concessão explícitas e abre avaliações, atendimento e indicadores sem erro de API. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Fonte autorizada é cadastrada pelo operador local; sem entrega externa nem cálculo oficial. Aceite Windows pendente.

## HR-22
avaliações e planos de desenvolvimento com critérios definidos, acesso privado e participação humana; feedback de cliente não vira punição automática.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Fechamento & holerite/Processos HR-21..24; `hr-advanced-api` + documentos privados 102; migração 064.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate publica e baixa holerite pela interface com fonte/concessão explícitas e abre avaliações, atendimento e indicadores sem erro de API. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-23
atendimento interno com fila, responsável, categoria, prazo e mensagens; anexos de saúde fora de tickets genéricos.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Fechamento & holerite/Processos HR-21..24; `hr-advanced-api` + documentos privados 102; migração 064.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate publica e baixa holerite pela interface com fonte/concessão explícitas e abre avaliações, atendimento e indicadores sem erro de API. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## HR-24
indicadores de quadro, admissão, faltas, rotatividade, férias, documentos e atendimento, com fórmula e período explícitos.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/funcionarios` > Fechamento & holerite/Processos HR-21..24; `hr-advanced-api` + documentos privados 102; migração 064.
- Integração e evidência (teste, resultado, commit): `npm run test:l03-delivery:pg` 1/1 em HTTP + Chromium + PostgreSQL descartável; Gate publica e baixa holerite pela interface com fonte/concessão explícitas e abre avaliações, atendimento e indicadores sem erro de API. Patchset L03 desta branch.
- Pendência / fronteira externa / aceite humano: Aceite humano no Windows permanece para L10; regras legais/contábeis continuam dependentes de validação competente.

## OPS-01
estrutura cliente → unidade atendida → posto físico → necessidade por turno → alocação; cargo/função em entidade própria.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Postos e Alocações` em `/admin/operacao` exibe a cadeia completa com nomes canônicos por join de leitura (sem entidade paralela): cliente (`crm_companies`), unidade atendida (`crm_company_units`), contrato (`crm_contracts`), posto, necessidade por turno e alocação com posto e profissional. As seções `Cargos e funções (OPS-01)` e `Necessidade por turno (OPS-01)` carregam em grupo próprio, com estados de carregamento, vazio e erro desacoplados dos 9 fetches originais da tela. `GET /api/ops/posts`, `GET /api/ops/allocations` e `GET /api/ops/post-shift-needs` devolvem os nomes da cadeia. `POST /api/ops/post-shift-needs` valida posto existente e ativo, contrato operacional, turno existente e ativo, cargo existente, headcount inteiro 1..100 e dia 0..6, com troca de ID devolvendo 404/409 nomeados (nunca colisão de FK); headcount `0` deixou de ser convertido silenciosamente em `1` (coalescência nullish); idempotência NULL-safe por `IS NOT DISTINCT FROM` (a unicidade DISTINCT do banco não cobria dia/cargo ausentes); necessidade e auditoria gravadas na mesma transação (fail-closed). Os aliases históricos `/api/hr/ops-*`, `/api/admin/hr/ops-*` e `/api/crm/hr/ops-*` saíram da borda de RH legada: o handler de operação autoriza a si mesmo (sessão de staff + papel + same-origin), idêntico ao caminho canônico `/api/ops/*`; antes admin/ti recebiam 403 `employee_permission_required` no alias legado e 200 no canônico do mesmo recurso, e os clientes embutidos da tela de operação renderizavam vazio. Paths de RH que não são de operação continuam na borda.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde 9/9 (antes 8/8) com o subteste `L06 OPS-01` em HTTP real + PostgreSQL descartável + Chromium: alias legado e canônico respondem igual (anônimo 401; admin/ti/rh 200; comercial 403 `forbidden` pelo handler); `/api/hr/employees` segue exigindo permissão granular de RH (403 para admin sem concessão); necessidade negada para anônimo (401) e comercial (403); dia 7, headcount 0 e headcount 1,5 recusados (400); posto, turno e cargo inexistentes recusados com 404 nomeados; posto inativo (409 `post_inactive`) e contrato encerrado (409 `contract_not_operational`); repetição com dia/cargo ausentes rejeitada (409 `duplicate_need`) sem segunda linha; auditoria indisponível → 503 sem efeito parcial e recuperação após restauração; leitura devolve `post_name`/`shift_template_name`/`role_name` e a alocação fecha a cadeia com `post_name`/`employee_name`; Chromium real renderiza cliente, unidade, cargo, turno e profissional da cadeia na aba `Postos e Alocações`. Regressões: `npm run test:l04-delivery:pg` 20/20, `npm run test:l05-delivery:pg` 1/1, `npm run test:migrations:pg` 123/123, `npm test` 196/196, `npm run typecheck`, `npm run build` e `node scripts/qa-wave0-static.mjs` 5/5. Nenhuma migração 124 necessária.
- Pendência / fronteira externa / aceite humano: aceite humano pendente (revisão de entrega). A tela expõe o cadastro real; não propõe dimensionamento automático — posto sem necessidade por turno cadastrada aparece com lacuna, não com número inventado.

## OPS-02
dimensionamento contratado versus planejado e realizado, cobertura por faixa de tempo e profissional habilitado.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Dimensionamento (OPS-02)` em `/admin/operacao` com contratado × planejado × realizado por faixa de tempo, horas exigidas/realizadas, cobertura % (derivada pelo banco em `coverage_percent`), alocados na faixa, habilitados e sem cargo exigido, além das lacunas de cobertura registradas — com **período e fórmula explícitos no rodapé** e estados de carregamento/vazio/erro em grupo de fetch próprio, desacoplado dos demais. `GET /api/ops/dimensioning` devolve, por registro, o cruzamento com profissional habilitado recomputado ao vivo por `LEFT JOIN LATERAL` sobre as alocações não canceladas da faixa do registro: `allocated_employees`, `qualified_employees`, `unqualified_employees`, `employees_without_requirement` e `allocated_hours` (soma das horas dos turnos da faixa). A regra de habilitação é a **mesma** do motor OPS-04 — predicado único `QUALIFICATION_USABLE_SQL` (`is_valid` e validade ≥ `GREATEST(hoje, data da alocação)` em `ops_employee_qualifications`), extraído de `evaluateOps04` e reutilizado; não existe segunda regra. Alocação sem cargo exigido é contada à parte: não vira habilitado nem inabilitado. `GET /api/ops/coverage-gaps` devolve o nome canônico do posto. Escrita de dimensionamento segue endurecida (valores finitos/inteiros/não negativos, enum de status, posto ativo, coerência de empresa/unidade/contrato, contrato operacional).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde 9/9 com o subteste `L06 OPS-02` ampliado em HTTP real + PostgreSQL descartável + Chromium: na mesma faixa do registro, dois profissionais alocados (um com cargo exigido e qualificação válida, outro sem cargo exigido) e um terceiro **fora da faixa** — painel devolve `allocated_employees=2` (o de fora excluído), `qualified_employees=1`, `unqualified_employees=0`, `employees_without_requirement=1` e `allocated_hours=16`; cobertura planejada versus realizada lida do registro (372/744 = 50%); qualificação **revogada pela API depois da alocação** (upsert de qualificação) faz o painel recomputar para `qualified_employees=0` e `unqualified_employees=1` — a degradação vira lacuna visível, não número fictício; lacunas lidas com nome canônico do posto; Chromium real renderiza posto, 50%, "sem habilitação válida", fórmula explícita no rodapé e data de lacuna. Regressões: `npm run test:l04-delivery:pg` 20/20, `npm run test:l05-delivery:pg` 1/1, `npm run test:migrations:pg` 123/123, `npm test` 196/196, `npm run typecheck`, `npm run build` e `node scripts/qa-wave0-static.mjs` 5/5. Nenhuma migração 124 necessária.
- Pendência / fronteira externa / aceite humano: aceite humano pendente (revisão de entrega). Horas alocadas são soma dos turnos das alocações da faixa e não substituem as horas realizadas informadas no registro — divergência entre realizado informado e alocado é exibida, não conciliada.

## OPS-03
escala em rascunho/publicada/revisada, validade e histórico; calendário por posto/equipe/pessoa e ciência.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Escalas (OPS-03)` em `/admin/operacao` com versões (empresa, unidade/equipe, validade, situação, publicação), **calendário nas três visões exigidas** — por posto (profissionais escalados no posto por dia), por equipe (profissionais distintos por unidade por dia) e por pessoa (turnos do profissional por dia) —, ciência registrada pela interface e histórico de transições (rascunho → publicada → revisada com motivo e autor). Colunas do calendário são os dias da validade da própria versão (janela de 31 colunas com recorte declarado quando a validade excede); célula vazia é ausência de registro, não folga confirmada. Grupo de carregamento próprio com estados de carregamento/vazio/erro; o detalhe da versão selecionada (entradas, ciências, histórico) carrega sob demanda. `GET /api/ops/schedule-versions`, `GET /api/ops/schedule-entries` e `GET /api/ops/schedule-acks` devolvem os nomes canônicos (empresa, unidade, posto, profissional, turno) por join, sem entidade paralela. `POST /api/ops/schedule-acks` passou a exigir papel de operação (`admin`/`ti`/`rh`): antes qualquer sessão de staff registrava ciência por qualquer profissional. O caminho canônico `/api/ops/schedule-history` foi adicionado ao roteador — era o único endpoint de operação sem alias canônico (só existiam os três aliases históricos de RH).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde 9/9 com o subteste `L06 OPS-03` ampliado em HTTP real + PostgreSQL descartável + Chromium: duas entradas na versão publicada (uma com ciência, uma pendente); ciência negada para anônimo (401) e papel comercial (403) — antes comercial obtinha 201; jornada completa de ciência **pela interface** em Chromium real: clique registra ciência (201, "Ciência registrada para…"), segundo clique exibe "segunda ciência não duplica efeito" (409 `duplicate_ack`), estado "ciente desde" visível e SQL confirma exatamente 2 ciências para 2 profissionais, sem duplicação da UI; calendário por posto renderiza posto e profissionais da cadeia, por equipe renderiza a unidade e por pessoa o turno canônico; histórico mostra a transição "revisada → publicada". Regressões: `npm run test:l04-delivery:pg` 20/20, `npm run test:l05-delivery:pg` 1/1, `npm run test:migrations:pg` 123/123, `npm test` 196/196, `npm run typecheck`, `npm run build` e `node scripts/qa-wave0-static.mjs` 5/5. Nenhuma migração 124 necessária.
- Pendência / fronteira externa / aceite humano: aceite humano pendente — a ciência registrada pela interface comprova ciência do profissional, não substitui validação de convenção coletiva/jurídico da escala em si. Publicação registra histórico, entradas respeitam validade e retries de entrada/ciência são rejeitados sem duplicação (já provados no gate).

## OPS-04
validar sobreposição, indisponibilidade, habilitação, documentação e regras de jornada/descanso configuradas e aprovadas.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Jornada & Habilitação (OPS-04)` em `/admin/operacao`. Motor único `evaluateOps04` aplicado a `POST /api/ops/allocations` e `POST /api/ops/schedule-entries`: posto ativo, contrato operacional, funcionário `ativo`, sobreposição real de turno, indisponibilidade em `hr_absences` (bloqueia `solicitado/em_analise/aprovado/em_afastamento`; `rejeitado/cancelado/retornado` não bloqueiam), habilitação em `ops_employee_qualifications` e validade do documento conferida contra `GREATEST(CURRENT_DATE, data alvo)`. Jornada diária/semanal, descanso mínimo e dias consecutivos só são aplicados quando existe regra **aprovada e ativa** em `ops_work_rules`; havendo várias, vale a combinação mais restritiva. `PATCH /api/ops/work-rules` grava mudança e auditoria na mesma transação. Sem regra aprovada nada é presumido e a resposta declara `work_rule_applied: false`. Nenhuma migração 124 foi necessária: o schema 070 já continha as tabelas.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde 8/8 (antes 7/7) com o subteste `L06 OPS-04` em HTTP real + PostgreSQL descartável + Chromium: anônimo (401) e papel comercial (403) em regra e qualificação; regra não aprovada não inventa limite (9h/dia aceitos, `work_rule_applied:false`); aprovação auditada (`ops_work_rule_update`); `max_daily_hours_exceeded` (422, 9h > 8h); `min_rest_hours_violated` (422, 10h < 11h) e 18h de descanso aceitos; `max_weekly_hours_exceeded` (422, 21h > 16h); `max_consecutive_days_exceeded` (422, 3 > 2); `qualification_required`, `qualification_expired`, `qualification_invalid` (422) e alocação aprovada após habilitação válida; `role_required_by_work_rule` (422) quando a regra aprovada exige certificação, liberado ao desativar a regra; `employee_unavailable` (409) com afastamento aprovado e ausência `rejeitado` não bloqueando; na escala, funcionário desligado (409), posto inexistente (404), `overlap_detected` (409), retry (409) e validação positiva persistida com `entry_id`; auditoria indisponível devolve 503 sem efeito parcial em alocação, entrada de escala e alteração de regra. Regressões: `npm run test:l04-delivery:pg` 20/20, `npm run test:l05-delivery:pg` 1/1, `npm run test:migrations:pg` 123/123, `npm test` 196/196, `npm run typecheck`, `npm run build` e `node scripts/qa-wave0-static.mjs` 5/5.
- Pendência / fronteira externa / aceite humano: aceite humano pendente. A qualificação guarda `document_url` em texto; vincular o comprovante ao provedor privado L02 (`client_documents`) exige coluna nova e, portanto, migração aditiva — deliberadamente fora desta fatia. Conformidade legal/convenção coletiva dos limites configurados continua dependendo de validação de RH/jurídico: o sistema aplica a regra aprovada, não julga se ela é legal.

## OPS-05
ausência abre pendência de cobertura; candidatos de substituição por disponibilidade/qualificação, decisão humana e comunicação.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ops/coverage-requests`, `POST/GET/PATCH /api/ops/substitution-candidates`, `POST/GET /api/ops/coverage-communications`. Tabelas `ops_coverage_requests`, `ops_substitution_candidates`, `ops_coverage_communications`. Validação fail-closed de contrato operacional, funcionário ativo, qualificação para o cargo (`ops_employee_qualifications`), disponibilidade e sobreposição de turno (`checkCandidateConflict`). Decisão humana com registro de auditoria atômico.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 2.1-2.11): nega anônimo (401), papel indevido (403), posto inexistente (404), contrato encerrado (409), candidato sem qualificação (409 `candidate_unqualified`), candidato com sobreposição de turno (409 `candidate_shift_conflict`), candidato desligado (409 `employee_not_operational`), decisão humana registra e atualiza status para `candidato_encontrado`.
- Pendência / fronteira externa / aceite humano: Comunicações e notificações são internas/sintéticas no sistema (sem envio externo SMS/WhatsApp real). Aceite humano pendente.

## OPS-06
passagem de plantão com origem/destino, pendências, aceite e escalonamento de não aceite.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ops/handovers`, `GET /api/ops/handover-escalations`. Tabelas `ops_handovers`, `ops_handover_escalations`. Validação fail-closed de posto ativo, contrato operacional, funcionários de origem e destino distintos e ativos, protocolo único (`HND-OPS-...`), pendências, itens de guarda, ciência idempotente e escalonamento obrigatório de motivo.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 3.1-3.5): nega anônimo (401), posto inexistente (404), mesmo funcionário na origem/destino (400), contrato encerrado (409), aceite idempotente sem duplicar efeito, escalonamento sem motivo bloqueado (400) e com motivo registrado em trilha imutável.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## OPS-07
livro de ocorrências com categoria/severidade, responsável, ações e encerramento; evidências privadas e histórico imutável de retificação.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ops/occurrence-book`, `GET /api/ops/occurrence-history`, `POST/GET /api/ops/occurrence-evidences`, `POST/GET /api/ops/occurrence-actions`. Tabelas `ops_occurrence_book`, `ops_occurrence_history`, `ops_occurrence_evidences`, `ops_occurrence_actions`. Protocolo único (`OCC-OPS-...`), retificação com motivo obrigatório e preservação imutável da versão anterior, vínculo de evidências com validação de escopo multi-tenant do L02 (`client_documents`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 4.1-4.8): nega anônimo (401), contrato encerrado (409), retificação sem motivo (400), documento privado de outro cliente/contrato rejeitado (403), documento no mesmo escopo aceito (201), histórico preserva versão original e retificada com flag e auditoria fail-closed.
- Pendência / fronteira externa / aceite humano: Nenhum acionamento policial/SAMU/bombeiros externo ou 24h real simulado. Aceite humano pendente.

## OPS-08
checklists por serviço/cliente, versão, frequência, itens obrigatórios e evidências proporcionais.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ops/checklist-templates`, `POST/GET/PATCH /api/ops/checklist-runs`, `POST/GET /api/ops/checklist-answers`. Tabelas `ops_checklist_templates`, `ops_checklist_runs`, `ops_checklist_answers`. Execução vinculada a posto e contrato operacional, validação de preenchimento obrigatório de todos os itens com `is_required=true` antes da finalização, registro de não-conformidade e evidências no escopo L02, finalização e retry de envio idempotentes.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 5.1-5.6): nega anônimo (401), contrato encerrado (409), finalização com item obrigatório não preenchido rejeitada (422 `missing_required_items`), resposta de item duplicada impedida com upsert idempotente, finalização aprovada após preenchimento integral e retry idempotente sem efeito colateral.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## OPS-09
visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação.
- Estado: pronto_local
- Tela / API / dados / autorização: abas `Supervisão` em `/admin/operacao`; `/api/ops/supervision-visits`, `/supervision-inspections` e `/supervision-action-plans`; posto e contrato ativos, supervisor ativo, score 0–100, apontamentos e verificação nominal. Migração aditiva 123 e auditoria transacional fail-closed.
- Integração e evidência (teste, resultado, commit): Subtest 5 do gate L06 cobre criação, score inválido e verificação obrigatória; `npm run test:l06-delivery:pg` verde, 5/5.
- Pendência / fronteira externa / aceite humano: aceite humano da operação permanece pendente.

## OPS-10
rondas e pontos de verificação quando aplicáveis; prevenção de repetição/replay, tratamento de localização indisponível e evidência auditável. GPS/QR isolado não prova execução.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Rondas & Claviculário`; `/api/ops/patrols`, `/patrol-points` e `/patrol-readings`; detecta `duplicate_qr`, `too_fast`, `gps_jump`, exige motivo de localização indisponível e oferece chave idempotente de leitura.
- Integração e evidência (teste, resultado, commit): Subtest 5 valida localização indisponível, replay e retry idempotente.
- Pendência / fronteira externa / aceite humano: fluxo obrigatoriamente rotulado sintético; QR/GPS não é prova de presença real.

## OPS-11
chaves, rádios, materiais e equipamentos com guarda/transferência/devolução.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Rondas & Claviculário`; `/api/ops/keys` e `/key-movements`; tipos fechados, responsável/finalidade e índice único de custódia ativa.
- Integração e evidência (teste, resultado, commit): Subtest 5 confirma retirada, segunda retirada 409 e devolução preservando a cadeia.
- Pendência / fronteira externa / aceite humano: conferência física e aceite humano pendentes.

## OPS-12
relatórios periódicos ao cliente com revisão de conteúdo e privacidade.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Relatórios`; `/api/ops/client-reports`; transições estritas `rascunho → em_revisao → aprovado → enviado`, escopo contrato/unidade/documento e revisão de privacidade.
- Integração e evidência (teste, resultado, commit): Subtest 5 bloqueia envio antecipado e valida aprovação formal antes da liberação.
- Pendência / fronteira externa / aceite humano: envio externo real não é alegado; aceite humano pendente.

## OPS-13
métricas de cobertura, tempo descoberto, incidentes, visitas e reincidência; definir fonte e janela.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Métricas & Escalas`; `/api/ops/metrics-definitions` e `/metrics-snapshots`; fonte, janela, fórmula, valor e completude (`completo`, `parcial`, `incompleto`) explícitos.
- Integração e evidência (teste, resultado, commit): Subtest 5 rejeita valor ausente/zero implícito e incompletude sem justificativa.
- Pendência / fronteira externa / aceite humano: qualidade da fonte deve ser validada pelo responsável.

## OPS-14
escalas assistidas/automáticas depois das regras validadas; apresentar conflitos, motivos e revisão humana antes de publicar.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Métricas & Escalas`; `/api/ops/assisted-schedules` e `/assisted-schedule-entries`; detecta sobreposição, interjornada e falta de qualificação, gravando conflitos explicáveis.
- Integração e evidência (teste, resultado, commit): Subtest 5 produz conflito e confirma bloqueio 409 da publicação.
- Pendência / fronteira externa / aceite humano: publicação exige conflitos resolvidos, revisão humana e motivo.

## OPS-15
supervisão de limpeza com rotinas por ambiente, consumo e não conformidades.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Limpeza`; APIs de ambientes, rotinas, execuções e não conformidades; executor ativo, inspeção/score e severidade registrados.
- Integração e evidência (teste, resultado, commit): Subtest 5 cobre banheiro, rotina diária, executor, inspeção de qualidade e NC alta.
- Pendência / fronteira externa / aceite humano: inspeção física real permanece responsabilidade humana.

## OPS-16
eventos de monitoramento via conector, fila, reconhecimento e escalonamento; não construir substituto de central 24h ou armazenar vídeo sem projeto específico.
- Estado: pronto_local
- Tela / API / dados / autorização: aba `Monitoramento Sintético`; `/api/ops/monitoring-connectors` e `/monitoring-events`; restrições SQL `is_synthetic=true`, eventos fechados e fluxo pendente/reconhecido/em tratamento/resolvido.
- Integração e evidência (teste, resultado, commit): Subtest 5 rejeita evento não sintético e valida reconhecimento, tratamento, encerramento e Chromium real.
- Pendência / fronteira externa / aceite humano: sem central 24h, vídeo ou promessa de despacho externo real.

## CLI-01
identidade, convite, recuperação e sessão reais; entrada única, rotas antigas identificadas/redirecionadas com cuidado.
- Estado: a_revalidar
- Tela / API / dados / autorização: Rotas reais de entrada/convite/recuperação e `/cliente/app`; `/api/auth/*`; tabelas 003/097–101. Metadados v2 em `/api/cli/entry-points|old-routes` (074), staff-only.
- Integração e evidência (teste, resultado, commit): Integração PG legada de acesso existe; a camada v2 está somente no `CliClient.tsx` órfão e ainda não tem gate L08.
- Pendência / fronteira externa / aceite humano: Aceite L08 não iniciado; unificar sem presumir que alias v2 é jornada cliente.

## CLI-02
múltiplos contatos do cliente e papéis por conta/unidade/contrato. Delegação pelo cliente apenas se autorizada, sem ampliação fora do próprio escopo.
- Estado: a_revalidar
- Tela / API / dados / autorização: Contas/grants legados em `/admin/clientes` e `/api/client/accounts`; contatos/escopos/delegação v2 na 074 e `cli-api.mjs`, staff-only.
- Integração e evidência (teste, resultado, commit): Escopo legado A≠B é provado por `client-space.integration`; delegação v2 do cliente não é.
- Pendência / fronteira externa / aceite humano: UI v2 órfã e falta prova de autoria/escopo por recurso.

## CLI-03
contratos, itens de serviço, vigência, documentos e escopo claro; conteúdo técnico interno não publicado automaticamente.
- Estado: a_revalidar
- Tela / API / dados / autorização: `/cliente/app/contratos` usa `/api/client/contracts`/004; itens, escopos e vigência v2 usam 074 e handlers staff-only.
- Integração e evidência (teste, resultado, commit): Contrato legado por conta tem prova PG; conteúdo v2 está no `CliClient.tsx` órfão.
- Pendência / fronteira externa / aceite humano: Falta gate cliente para itens/vigência e bloqueio de conteúdo interno.

## CLI-04
documentos com categoria/validade/versão, busca e download privado; autorização testada em todos os caminhos.
- Estado: em_execucao
- Tela / API / dados / autorização: `/cliente/app/documentos`; APIs legadas de lista/download e v2 de categoria/versão/log; tabelas 004/074/101.
- Integração e evidência (teste, resultado, commit): Bytes privados, integridade e A≠B têm prova legada/QA; alias v2 é staff-only e devolve metadado/URL, não streaming cliente.
- Pendência / fronteira externa / aceite humano: Mantido `em_execucao`; falta jornada v2 integral e gate L08.

## CLI-05
chamados com protocolo, categoria, prioridade, responsável, mensagens, anexos, SLA e histórico.
- Estado: a_revalidar
- Tela / API / dados / autorização: `/cliente/app/chamados` usa legado; `cli_tickets_v2`/mensagens/anexos/histórico/SLA na 075 e `cli-advanced-api.mjs`.
- Integração e evidência (teste, resultado, commit): Legado tem prova PG e `cli_tickets_v2` é fonte canônica provada no ADM; isso não prova portal v2, cujo alias exige staff.
- Pendência / fronteira externa / aceite humano: Componente v2 órfão; falta cliente A≠B, transação e UI.

## CLI-06
estados aberto/em atendimento/aguardando cliente/resolvido/encerrado, reabertura e motivo; pausas de SLA explicitamente definidas.
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers/tabelas v2 de estados, reabertura, histórico e pausas SLA (075); sem tela cliente.
- Integração e evidência (teste, resultado, commit): Sem gate L08; múltiplas escritas/auditoria não têm rollback fail-closed provado.
- Pendência / fronteira externa / aceite humano: Órfão/não provado.

## CLI-07
agenda de visita/manutenção, confirmação, reagendamento e histórico.
- Estado: a_revalidar
- Tela / API / dados / autorização: Aliases `/api/cli|client/visits`, histórico e tabelas 075; sem tela cliente.
- Integração e evidência (teste, resultado, commit): Alias cliente alcança handler staff-only; sem prova A≠B.
- Pendência / fronteira externa / aceite humano: Órfão/não provado.

## CLI-08
relatórios de execução e medição/aceite de serviço com revisão.
- Estado: a_revalidar
- Tela / API / dados / autorização: Aliases de relatórios v2/histórico e tabelas 075; sem tela cliente.
- Integração e evidência (teste, resultado, commit): Handler/componente existem, sem jornada de revisão/aceite/autorização.
- Pendência / fronteira externa / aceite humano: Órfão/não provado.

## CLI-09
cobranças/documentos fiscais/comprovantes somente quando financeiro estiver integrado; dados da própria conta.
- Estado: a_revalidar
- Tela / API / dados / autorização: Alias de cobranças v2 e `cli_charges_v2` (076); sem tela cliente.
- Integração e evidência (teste, resultado, commit): Sem vínculo provado com FIN nem escopo da própria conta.
- Pendência / fronteira externa / aceite humano: Órfão; qualquer PSP/fiscal real continua fora.

## CLI-10
solicitação de serviço adicional gera oportunidade no CRM com origem e responsável.
- Estado: a_revalidar
- Tela / API / dados / autorização: Alias de solicitações de serviço e `cli_service_requests` (076); sem tela cliente.
- Integração e evidência (teste, resultado, commit): Não há prova de oportunidade CRM, origem/responsável e atomicidade.
- Pendência / fronteira externa / aceite humano: Órfão/não provado.

## CLI-11
satisfação pós-atendimento e periódica, plano de ação e risco de renovação baseado em fatos.
- Estado: pronto_local (validação automática rápida; gate pesado e aceite humano pendentes)
- Tela / API / dados / autorização: Tela `/cliente/app/satisfacao` e rota `/api/client/satisfaction-surveys` sob sessão de cliente (`cli-finance-api.mjs`). Fontes canônicas: `cli_satisfaction_surveys`, `cli_satisfaction_action_plans`, `client_tickets`, `cli_charges_v2` e `crm_companies`; migração aditiva 142. Anônimo 401, conta sem grant 403 auditado, pesquisa de outra identidade 403, segunda resposta 409, autoria derivada da sessão.
- Integração e evidência (teste, resultado, commit): `tests/cli11-satisfaction-portal.test.mjs` 6/6; estático 5/5 (001–142); typecheck OK; `npm test` 205/205; build 83 páginas. Risco calculado só de contagens canônicas gravadas em `facts_json`; plano de ação só com responsável real do CRM; resposta, fatos, plano e auditoria na mesma transação com rollback/503. Relatório: [ENTREGA-L08-RELATORIO-2026-10-03-CLI11-SATISFACAO.md](ENTREGA-L08-RELATORIO-2026-10-03-CLI11-SATISFACAO.md).
- Pendência / fronteira externa / aceite humano: gate `test:l08-delivery:pg` com HTTP/PostgreSQL/Chromium reais adiado junto da bateria pesada; migração 142 ainda não aplicada em ambiente de destino; pesquisas históricas sem destinatário não aparecem no portal; aceite humano e Windows pendentes.

## CLI-12
renovação e comunicação contratual com registro, sem bloquear indiscriminadamente o portal por inadimplência.
- Estado: pronto_local (validação automática rápida; gate pesado e aceite humano pendentes)
- Tela / API / dados / autorização: Tela `/cliente/app/renovacao` e rota `/api/client/renewal-communications` sob sessão de cliente (`cli-finance-api.mjs`). Fontes canônicas: `cli_renewal_communications` (076), nova `cli_renewal_comm_responses` (143), `client_contracts.ends_on`, `crm_renewals.renewal_date`, `client_access_grants` e `auth_access_audit`. Anônimo 401, conta sem grant 403 auditado, comunicação não enviada tratada como inexistente, autoria derivada da sessão (corpo forjado ignorado), manifestação duplicada/tipo não permitido/chave reusada divergente 409.
- Integração e evidência (teste, resultado, commit): `tests/cli12-renewal-communications.test.mjs` 10/10 (registrado em `test:unit`); estático 5/5 (001–143); typecheck OK; `npm test` 215/215; build 84 páginas. Provado por teste que inadimplência em `cli_charges_v2` não participa da autorização (CLI-12 e leituras CLI-10/CLI-11); restrição só por `encerramento` bloqueante com `block_reason`, declarada com motivo e origem; manifestação não escreve em contratos, cobranças ou renovações; ciência e auditoria na mesma transação com rollback/503; vencimentos com fonte e data-base declaradas e ausência preservada. Rota administrativa legada intacta. Relatório: [ENTREGA-L08-RELATORIO-2026-10-03-CLI12-RENOVACAO.md](ENTREGA-L08-RELATORIO-2026-10-03-CLI12-RENOVACAO.md).
- Pendência / fronteira externa / aceite humano: gate `test:l08-delivery:pg` com HTTP/PostgreSQL/Chromium reais adiado junto da bateria pesada; migração 143 ainda não aplicada em ambiente de destino; comunicações históricas sem `sent_at` não aparecem no portal até terem envio registrado; tratativa da manifestação permanece manual pela equipe; aceite humano e Windows pendentes.

## CLI-13
modos convite, solicitação com aprovação e autocadastro configuráveis; vínculo verificado no servidor em todos. Autocadastro nunca libera contratos sozinho.
- Estado: pronto_local (validação automática rápida; gate pesado e aceite humano pendentes)
- Tela / API / dados / autorização: `/cliente/acesso`, `/admin/portal/solicitacoes`, `/api/public/portal-access-requests` e aliases; configuração/revisão admin/ti separada da entrada pública. Fontes: tabelas 076, convite 003, grants 004, histórico e idempotência 144. Conta/documento verificados no servidor; autoria e aprovador derivados da sessão.
- Integração e evidência (teste, resultado, commit): `tests/cli13-portal-access-modes.test.mjs` 11/11; estático 5/5 (001–144); typecheck OK; `npm test` 226/226; build 84 páginas. Modo inativo, recusa auditada, replay/conflito, 400 + CHECK contra auto-release, rollback/503 e ausência de INSERT em identidade/sessão/grant/contrato provados. Relatório: [ENTREGA-L08-RELATORIO-2026-10-03-CLI13-ACESSO.md](ENTREGA-L08-RELATORIO-2026-10-03-CLI13-ACESSO.md).
- Pendência / fronteira externa / aceite humano: `test:l08-delivery:pg`, cascata L03..L08 e aplicação da migração 144 adiados; sem aceite humano novo; Windows pendente.

## CLI-14
segurança da conta com MFA opcional, gestão de sessões e troca de e-mail concluída; fluxos ligados ao backend real.
- Estado: pronto_local (validação automática rápida; gate pesado e aceite humano pendentes)
- Tela / API / dados / autorização: `/cliente/app/seguranca`; MFA em `auth_mfa`, sessões em `auth_sessions`, troca em `auth_email_change`; sessão cliente, same-origin e autoria derivada no servidor; migração aditiva 145.
- Integração e evidência (teste, resultado, commit): `tests/cli14-account-security.test.mjs` 4/4 e rotas 9/9; estático 5/5 (001–145), typecheck OK. Integral/build a registrar após execução.
- Pendência / fronteira externa / aceite humano: bateria pesada CLI-14, cascata L03..L08, aplicação destino, aceite e Windows pendentes; sem aceite humano novo.

## CLI-15
reclamação sobre colaborador tratada em canal restrito, com compartilhamento mínimo com RH.
- Estado: pronto_local (validação automática rápida; bateria pesada e aceite humano pendentes)
- Tela / API / dados / autorização: `/cliente/app/reclamacoes-colaborador`; `/api/client/employee-complaints` (+ detalhe por UUID) sob sessão de cliente canônica e same-origin; tabelas da 093 com migração aditiva 146 (origem `portal_cliente`, idempotência por identidade, ações de auditoria); autoria/conta/UUIDs/protocolo derivados no servidor; RH recebe só protocolo, categoria, severidade e situação, justificados campo a campo em `cli_employee_complaint_hr_shares`; rota administrativa legada restrita a admin/ti/rh com projeção mínima para RH e sem atalho para cliente.
- Integração e evidência (teste, resultado, commit): `tests/cli15-employee-complaint.test.mjs` 15/15 (registrado em `test:unit`); estático 5/5 (001–146); typecheck OK; `npm test` 245/245; build 85 páginas com a rota cliente listada; `npm run test:l08-delivery:pg` 51/51 aplica 001–146 (gate legado CLI-01..05; não cobre a jornada CLI-15). Isolamento A≠B com 403 genérico auditado, corpo forjado ignorado, 400 sem Idempotency-Key, replay idêntico sem duplicar, 409 em reuso divergente, 503 + rollback em falha da auditoria e minimização de RH provados no teste dedicado. Relatório: [ENTREGA-L08-RELATORIO-2026-10-03-CLI15-RECLAMACAO.md](ENTREGA-L08-RELATORIO-2026-10-03-CLI15-RECLAMACAO.md).
- Pendência / fronteira externa / aceite humano: bateria pesada específica de CLI-15 (HTTP/DB em PostgreSQL descartável dedicado), cascata L03..L08, aplicação da migração 146 em destino, aceite humano e Windows pendentes; sem aceite humano novo.

## FIN-01
contas a receber vinculadas a contrato, competência, vencimento, recorrência, moeda, valor e situação.
- Estado: pronto_local
- Tela / API / dados / autorização: workspace `/admin/financeiro`, `/api/fin/receivables`, PostgreSQL real e papéis financeiros; `rh` negado 403.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` 6/6 em duas rodadas finais, HTTP e Chromium reais; `handleReceivables` transacional e fail-closed comprovado; commit `f4354d9`, PR #46 e workflow L07 [36822878630](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36822878630/job/110242735739) verde.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 1, 6 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: dados apenas sintéticos; nenhuma integração de produção.

## FIN-02
contas a pagar, fornecedores, categoria, centro de custo, vencimento, aprovação e anexos.
- Estado: pronto_local
- Tela / API / dados / autorização: workspace financeiro e APIs canônicas de pagáveis, fornecedores e centros; PostgreSQL real; `financeiro`/`admin`/`ti`.
- Integração e evidência (teste, resultado, commit): gate L07 6/6 em duas rodadas preserva criação e aprovação auditada de pagável, fornecedor e centro; `handlePayables` POST/PATCH transacional e criação fail-closed 503 sem pagável/histórico parcial; unitários 196/196; commit `f4354d9`, PR #46 e workflow L07 [36822878630](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36822878630/job/110242735739) verde.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 1 — nota: TI tem leitura na borda do servidor, mas a asserção dedicada de TI-leitura do domínio FIN está nos subtestes 19 (FIN-10) e 33 (FIN-14) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: anexos e pagamentos externos permanecem sintéticos; FIN-05..16 não iniciados.

## FIN-03
geração recorrente idempotente por contrato/competência/item; pró-rata, reajuste e suspensão conforme regras aprovadas.
- Estado: pronto_local
- Tela / API / dados / autorização: aba Recorrência exige conta real selecionada/informada, APIs canônicas, transação única de geração/histórico/regra/auditoria.
- Integração e evidência (teste, resultado, commit): Chromium cria/aprova/gera, repete e vê 409; banco confirma uma linha; geração com auditoria indisponível devolve 503 sem recebível/histórico e sem alterar `last_generated_competence`; L07 6/6 em duas rodadas; commit `f4354d9`, PR #46 e workflow L07 [36822878630](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36822878630/job/110242735739) verde.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 2, 6 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: não há cobrança externa; conta é sintética e explícita.

## FIN-04
pagamento/recebimento parcial, estorno, cancelamento, renegociação e baixa auditada; nunca apagar saldo por edição silenciosa.
- Estado: pronto_local
- Tela / API / dados / autorização: aba Pagamentos, transação, `FOR UPDATE`, overpayment 409, estorno limitado/escopado/repetido 409 e auditoria fail-closed.
- Integração e evidência (teste, resultado, commit): HTTP concorrente real, auditoria indisponível 503 sem efeito e Chromium com baixa/estorno; L07 6/6 duas vezes; `handlePayments` e todos os demais handlers FIN-01..04 auditados como transacionais; commit `f4354d9`, PR #46 e workflow L07 [36822878630](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36822878630/job/110242735739) verde.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 3, 4, 5, 6 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: sem gateway ou banco real; FIN-05..16 não iniciados.

## FIN-05
conciliação por importação/extrato ou provedor, sugestão e confirmação; evitar duplicar transações.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → aba **Conciliação bancária** (`BankReconciliationWorkspace.tsx`) usa somente `/api/fin/bank-statements`, `/api/fin/bank-transactions` e `/api/fin/conciliations`. Acesso exige sessão de staff, papel `financeiro`/`admin`/`ti` e same-origin. Extrato e transações são explicitamente sintéticos; `storage_key` e `bank_ref` são únicos; a conciliação exige exatamente uma conta e uma transação bancária, registra sugestão, confirmação/divergência e marca a transação como conciliada somente na confirmação. A migração aditiva `124-fin05-conciliation-hardening.sql` acrescenta unicidade parcial da transação bancária por conciliação e CHECK de valor não negativo.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` **8/8** (HTTP real + PostgreSQL descartável + Chromium real, incluindo a jornada FIN-05); duas execuções finais consecutivas verdes. Cobertura: anônimo/RH/origem externa negados, importação, duplicidade de `storage_key`/`bank_ref`/conciliação, referências inválidas, confirmação repetida, auditoria indisponível com `503` e rollback, e UI real. `npm run typecheck` e `npm run build` verdes.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 7, 8 (jornada Chromium), 21 — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: não há banco, provedor, gateway, webhook, arquivo ou credencial de produção; não há cobrança automática. Aceite humano/Windows permanece pendente. FIN-06..16 e ADM-01..12 continuam fora desta sessão.

## FIN-06
cobrança com responsável, lembretes, histórico e política aprovada; sem mensagens reais ou bloqueio de portal automático na implementação.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → aba **Cobrança** (`CollectionWorkspace.tsx`) usa somente `/api/fin/collection-policies`, `/api/fin/collection-reminders` e `/api/fin/collection-history`. Acesso exige sessão de staff, papel `financeiro`/`admin`/`ti` e same-origin. Política de cobrança tem nome único, descrição, tipo de lembrete, dias antes, nível de escalonamento e separação entre criação (rascunho não aprovado) e aprovação auditada. Lembrete exige política aprovada/ativa, recebível existente, responsável (2–200), conteúdo (20–2000) e nunca aceita `is_real_message=true` (rejeitado com `400`). Histórico é imutável por trigger de banco e `is_blocking_action` é sempre `false` por `CHECK`. A migração aditiva `125-fin06-collection-hardening.sql` acrescenta `reminder_type`/`days_before`/`escalation_level` estruturados à política e `is_blocking_action` ao histórico.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` **10/10** (HTTP real + PostgreSQL descartável + Chromium real, incluindo a jornada FIN-06) em duas execuções finais consecutivas. Cobertura: anônimo/papel indevido/origem externa negados, duplicidade de nome, aprovação sem autorização rejeitada, aprovação válida e auditada, referências inválidas, lembrete com responsável, conteúdo inválido rejeitado, `is_real_message=true` rejeitado, envio apenas simulado, histórico imutável sem bloqueio automático, e auditoria indisponível com `503`/rollback. `npm run typecheck`, `node scripts/qa-wave0-static.mjs` (5/5), `npm test` (196/196), `npm run test:migrations:pg` (125/125) e `npm run build` verdes; `npm run test:l06-delivery:pg` 9/9 preservado. Detalhe completo em [`docs/ENTREGA-L07-FIN06.md`](./ENTREGA-L07-FIN06.md).
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 9, 10 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: não há e-mail, WhatsApp, SMS, gateway, webhook, arquivo ou credencial de produção; "envio" é sempre uma transição de estado local simulada. Aceite humano/Windows permanece pendente. FIN-07..16 e ADM-01..12 continuam fora do escopo FIN-06; FIN-07 é documentado na seção seguinte.

## FIN-07
fluxo de caixa previsto/realizado, vencidos, próximos pagamentos e aging de recebíveis.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → aba **Fluxo de caixa / Aging** (`CashflowWorkspace.tsx`), usando `/api/fin/cashflow-snapshots` e `/api/fin/aging-receivables`. Acesso exige sessão de staff, papel `financeiro`/`admin`/`ti` e same-origin. A migration aditiva `126-fin07-cashflow-aging-hardening.sql` preserva o rascunho 078, permite aging por `(receivable_id, competence_date)`, deriva valor restante no banco e valida o vínculo/bucket canônicos. Criações são sintéticas, transacionais e auditadas fail-closed.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` **12/12** em duas execuções consecutivas (HTTP real + PostgreSQL descartável + sessão/cookie real + Next local + Chromium real). `npm test` 196/196, `npm run typecheck`, `node scripts/qa-wave0-static.mjs` 5/5 com migrations 001–126, `npm run test:l06-delivery:pg` 9/9 e `npm run build` verdes. Detalhe em [`docs/ENTREGA-L07-FIN07.md`](./ENTREGA-L07-FIN07.md).
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 11, 12 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: fluxo e aging não integram banco/gateway real, não baixam recebíveis, não enviam cobrança e usam somente dados sintéticos. `npm run test:migrations:pg` termina exit 0 após dois passes de 126/126, rejeita o clone com checksum adulterado como esperado e restaura o clone; aceite humano/Windows permanece pendente. FIN-08..16 e ADM-01..12 continuam fora desta sessão.

## FIN-08
custo por cliente/contrato/posto, importação de custos de pessoal, equipamentos, materiais e supervisão com rateio documentado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → aba **Custos / Rateio** (`CostAllocationWorkspace.tsx`), usando `/api/fin/cost-imports` e `/api/fin/costs`. Sessão de staff, papel `financeiro`/`admin`/`ti` e same-origin são obrigatórios. A migration aditiva `127-fin08-cost-allocation-hardening.sql` preserva o rascunho 078, adiciona valor de origem/chave idempotente, valida conta–contrato–posto pelo escopo canônico, sincroniza origem/competência da importação e protege no banco o cálculo do valor alocado pelo percentual documentado. Criações são transacionais e auditadas fail-closed.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` **14/14** em duas execuções consecutivas (PostgreSQL descartável, HTTP real, sessão/cookie real, Next local e Chromium real). Cobertura FIN-08: autorização/origem, fontes e filtros inválidos, importação e linha idempotentes, vínculos canônicos, divergência de importação, valor rateado adulterado na API e em SQL direto, listagem/agregados, auditoria indisponível com 503/rollback e jornada visual. Regressões: unitários 196/196, L06 9/9, migrations 001–127, typecheck, build e static 5/5 verdes. Detalhe em [`docs/ENTREGA-L07-FIN08.md`](./ENTREGA-L07-FIN08.md).
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 15, 16 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: apenas metadados/valores sintéticos; nenhum arquivo, folha, estoque, ERP ou provedor externo é lido. UUIDs opcionais de equipamento/supervisão ainda não possuem catálogo canônico no rascunho. Restrições novas preservam linhas históricas sem certificá-las retroativamente. Aceite humano/Windows permanece pendente. FIN-09..16 e ADM-01..12 não foram iniciados.

## FIN-09
resultado gerencial por contrato, separando receita contratada, faturada, recebida, custos e caixa; margem sem dados completos exibida como incompleta.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → Resultado gerencial (`ManagementResultsWorkspace.tsx`) usa a rota canônica `/api/fin/management-results`; PostgreSQL calcula/conserva a margem canônica e declara base incompleta em vez de aceitar percentual do navegador ou inventar zero. Sessão, papel financeiro/admin e same-origin são decididos no servidor; TI permanece leitura quando aplicável. A migração 135 impede margem legada quando a margem calculada é nula.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` 31/31 (PostgreSQL descartável, HTTP real e Chromium) cobre margem incompleta, cálculo no servidor, auditoria/rollback e UI de falha de leitura + retry; `npm run test:migrations:pg` 135/135 em dois passes; estático 5/5, typecheck, build e `npm test` 196/196 verdes nesta fatia.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 13, 14 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: resultados são dados sintéticos locais; aceite humano e Windows pendentes. L07 não está encerrado.

## FIN-10
despesas/reembolsos e compras com alçada, evidência e segregação entre solicitar/aprovar quando definida.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → aba **Despesas / Compras** (`ExpenseWorkspace.tsx`; tipos despesa/reembolso/compra), usando a rota canônica `/api/fin/expenses` de `src/server/fin-management-api.mjs (handler FIN-10)` . Lista/busca (`?q=` nome, protocolo, referência da evidência), criação com valores em **R$ pt-BR** (`Intl.NumberFormat`), solicitação exige solicitante real derivado da sessão, categoria, valor, evidência sintética e `threshold_cents`; decisão exige motivo e nunca ocorre para política inexistente/inativa ("alçada não configurada/inativa") — quando aplicável a tela declara "decide até R$ X" e registra `approver_name` real da sessão. Falha de leitura mostra `fin10-error` + `fin10-retry`; a lista vazia só aparece com leitura bem-sucedida. Autorização no servidor: anônimo 401, TI somente leitura, mesma origem. Histórico `fin10-history-toggle-<id>`/`fin10-history-<id>` apresenta "Alçada aplicada: R$ N" (snapshot `approval_limit_cents`/`authority_limit_cents` da migração 136).
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` **35/35 em duas execuções consecutivas** (PostgreSQL descartável + Chromium real). Cobertura FIN-10 (subtestes 17–22, HTTP, SQL direto e jornada de navegador): busca textual, 6 POSTs concorrentes idênticos (200 replay ou 409), duplicidade natural pendente bloqueada, sem alçada / alçada inativa / valor excedendo a alçada / autoaprovação — todos recusados, atualização de alçada não reaprova automaticamente, SQL direto com autoaprovação → `fin_expense_segregation`, DELETE direto → `fin_expense_no_delete`, histórico com snapshot 200050, zero efeitos financeiros (payments/baixas/conciliações), auditoria indisponível → 503 `audit_unavailable` com rollback total. Gate da cadeia no mesmo commit: `npm run test:migrations:pg` 136/136 (2 passes), `npm test` 196/196, typecheck, estático 5/5 e build verdes. Avaliação adaptativa registrada em [`docs/CONSOLIDACAO-L07-PRS-PENDENTES.md`](./CONSOLIDACAO-L07-PRS-PENDENTES.md).
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 17, 18, 19, 20, 22 (jornadas Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: política padrão é vazia (ausência não aprova); evidências são metadados sintéticos; nenhuma emissão fiscal, Pix/boleto, cobrança ou pagamento real. Aceite humano/Windows pendente. Ambições #47/#53 integradas seletivamente conforme consolidação acima; nenhuma rota paralela/2º test-id em /admin/ti/novo. L07 não está encerrado.

## FIN-11
integração contábil/fiscal mediante provedor; determinar NFS-e/NF-e ou outra obrigação conforme atividade, sem assumir uma nota para tudo.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → Fiscal (`FiscalWorkspace.tsx`) usa `/api/fin/fiscal-activity-rules`, provedores, obrigações e documentos canônicos. Regra de atividade determina a obrigação; o provedor sandbox só registra documento sintético. Sessão, papel e origem são validados no servidor; a tela revela falha de leitura e permite retry.
- Integração e evidência (teste, resultado, commit): gate L07 31/31 inclui HTTP de provedores/obrigações/documentos, negativas de autorização/origem, determinação por atividade, nenhuma emissão real, auditoria fail-closed e Chromium para a jornada fiscal/retry. Migrações 001–135 reaplicadas e verificadas no mesmo ambiente isolado.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 23, 24 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: não há NFS-e/NF-e, certificado, credencial, arquivo, ERP ou transmissão para provedor real. Aceite humano e Windows pendentes.

## FIN-12
boletos/Pix/gateway somente após seleção e sandbox; validar assinatura de webhook, replay, idempotência e conciliação; sem cobrança real em testes.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/financeiro` → Boletos / Pix / Gateway (`GatewayWorkspace.tsx`) usa APIs canônicas de gateway, cobrança, webhook/histórico e simulador sandbox. O servidor confere HMAC/payload, autorização e origem; somente gateway selecionado/homologado em sandbox recebe cobrança. A conciliação materializa a baixa FIN-04 na mesma transação (`fin_payments`, recebível e histórico); estorno cria pagamento reversor ligado à baixa original. A migração 135 assegura os vínculos pagamento–charge e baixa/estorno.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` 31/31 prova assinatura divergente recusada, replay concorrente (1 criação + 5 replays), criação de uma baixa FIN-04, saldo/status do recebível, estorno reversor e Chromium confirmando a baixa no banco; auditoria indisponível reverte a operação. `npm run test:migrations:pg` 135/135, estático 5/5, typecheck, build e unitários 196/196 verdes.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 25, 26 (jornada Chromium) — a baixa/estorno FIN-04 resultante é asserida no mesmo subteste — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: gateway, assinatura e pagamentos são simuladores locais; não há Pix/boleto, PSP, banco, adquirente, cobrança ou valor real. Aceite humano e Windows pendentes.

## FIN-13

> Revalidação concluída em 2026-10-01 sobre a main `4ea3578`: os seis achados foram reproduzidos por teste real (31 subtestes do gate L07, 4 reprovados antes da correção) e corrigidos por fatia aditiva com a migração **134**, sem reescrever a 132. Melhorias de #60/#62 portadas ou descartadas com justificativa registrada na [consolidação](CONSOLIDACAO-L07-PRS-PENDENTES.md). Os PRs de referência continuam abertos.

orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado.
- Estado: pronto_local (validação automática completa; aceite humano pendente)
- Tela / API / dados / autorização: Aba “Orçamento / Cenários” em `/admin/financeiro` (`BudgetWorkspace.tsx`) com seleção por nome/protocolo, moeda em R$, erro de leitura visível e ações de revisão/aprovação/histórico. APIs `GET/POST/PATCH /api/fin/budgets`, `GET/POST /api/fin/budget-scenarios` e `GET /api/fin/budget-history` (mais aliases `/api/{admin,crm}/hr/fin-budget*`), em `src/server/fin-budget-api.mjs`. Tabelas `fin_budgets`, `fin_budget_scenarios` e `fin_budget_history` (migrações 080, 132 e a aditiva 134). Sessão obrigatória, papéis financeiro/admin, `/admin/ti` somente leitura, same-origin nas mutações; escrita + histórico + auditoria na mesma transação, com rollback e `503 audit_unavailable`.
- Integração e evidência (teste, resultado, commit): Gate `npm run test:l07-delivery:pg` **31/31** em duas execuções aprovadas (era 27/27 antes da fatia; uma execução intermediária deu 30/31 por queda do Chromium no `launch` no subteste 18 de FIN-10, fora desta fatia — ver EVIDENCIAS-ENTREGA-LOCAL.md), com PostgreSQL descartável, HTTP real e Chromium real. Cobre: edição de orçamento aprovado recusada (409 `approved_budget_locked_requires_revision`) com trava equivalente no banco; revisão com motivo e autor que incrementa versão, retira a aprovação e exige nova aprovação; histórico imutável com snapshot anterior/posterior, versões, autor real, data e motivo; margem calculada no servidor/banco com receita zero e dados incompletos tratados sem inventar percentual nem apagar valores conhecidos; idempotência de criação com retry sequencial (200 replay), conflito de conteúdo (409) e **retry concorrente de 6 requisições gerando um único orçamento**; erro de leitura exibido na interface em vez de lista vazia; papel indevido, anônimo e TI negados; rollback quando a auditoria falha; aprovação sem gerar recebível, pagável, pagamento ou cobrança. Regressões preservadas: `npm test` 196/196, `test:migrations:pg` 134/134 com replay/clone/checksum, L03 1/1, L04 20/20, L05 1/1, L06 9/9, typecheck e build aprovados. Detalhes em [ENTREGA-L07-FIN13.md](ENTREGA-L07-FIN13.md) e [EVIDENCIAS-ENTREGA-LOCAL.md](EVIDENCIAS-ENTREGA-LOCAL.md).
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 27, 28, 29, 30, 31, 32 (jornadas Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: **Aceite humano pendente** (nenhuma aprovação de Marcelo/Andreia registrada) e validação em Windows pendente — a sessão rodou em Linux. Adiados por decisão de negócio: origem do número e data-base por cenário (#62), premissas estruturadas e aprovador distinto do autor/mínimo de dois cenários (#59). Orçamento permanece estimativo: não gera cobrança, pagamento ou obrigação.

## FIN-14
exportação do período com trilha, filtros, totais conciliáveis e acesso limitado do contador.
- Estado: pronto_local (validação automática completa; aceite humano pendente)
- Tela / API / dados / autorização: Aba “Exportações” em `/admin/financeiro`, seleção por nome/protocolo, R$, erro de leitura + retry, geração e download sintético limitado. `GET/POST/PATCH /api/fin/exports`, `GET /api/fin/export-logs` e `GET /api/fin/export-download`; sessão e papel financeiro/admin, TI somente leitura, papel indevido/anônimo negados. Download exige estado gerado, escopo contador e validade, devolve somente o artefato persistido e audita o acesso.
- Integração e evidência (teste, resultado, commit): migrações 080/133/137; replay idêntico e concorrente por `storage_key` retorna o mesmo registro, conteúdo divergente é recusado; trilha imutável e auditoria fail-closed. Gate L07 37/37 duas vezes, incluindo Chromium.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 33, 36, 37 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: artefato apenas sintético, sem envio ao contador/storage externo. Aceite humano e Windows pendentes.

## FIN-15
fechamento de competência e reabertura autorizada; preservar versões de relatório.
- Estado: pronto_local (validação automática completa; aceite humano pendente)
- Tela / API / dados / autorização: Aba “Fechamento” em `/admin/financeiro`, seleção da competência, motivo para reabertura/novo fechamento e histórico de versões. Autorizador vem exclusivamente da sessão. Trigger da migração 137 bloqueia SQL direto em recebíveis, pagáveis e custos do mês fechado/bloqueado; reabertura explícita libera o mês.
- Integração e evidência (teste, resultado, commit): retry/concorrência por competência preserva uma única versão inicial; todas as versões são imutáveis; escrita + versão + auditoria são atômicas. Gate L07 37/37 duas vezes com prova HTTP, SQL e Chromium.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 34, 36, 37 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: aceite humano e Windows pendentes; fechamento não substitui validação contábil externa.

## FIN-16
comissões ligadas à regra CRM-25, provisão e revisão; não pagar automaticamente.
- Estado: pronto_local (validação automática completa; aceite humano pendente)
- Tela / API / dados / autorização: Aba “Comissões” em `/admin/financeiro`, seleção por regra/data/situação, R$, revisão humana e histórico auditável. A tela declara e preserva `is_auto_paid=false`; baixa é somente registro manual após revisão, sem banco/PSP/Pix/boleto.
- Integração e evidência (teste, resultado, commit): `idempotency_key` + fingerprint na migração 137, seis retries concorrentes com um único registro, conflito de conteúdo recusado, tentativa automática recusada em API e banco, auditoria fail-closed. Gate L07 37/37 duas vezes com Chromium.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 35, 36, 37 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: não há pagamento real; aceite humano e Windows pendentes.

## AST-01
produtos/SKU, fornecedores, unidade de medida, custo, local e estoque mínimo.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ast/suppliers`, `POST/GET/PATCH /api/ast/products`, workspace `/admin/patrimonio`. Tabelas `ast_suppliers`, `ast_products`. Validação de SKU único (409), nomes, unidades de medida, custos, preços e estoques mínimos. Transação atômica com auditoria fail-closed.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 2): nega anônimo (401), papel indevido (403), fornecedor com nome duplicado negado (409), produto com SKU duplicado negado (409), criação válida com vínculo de fornecedor e auditoria atômica persistida.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-02
entradas/saídas/transferências/ajustes por motivo com histórico; saldo derivado de movimentos consistentes.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ast/stock-movements`. Tabelas `ast_stock_movements`, `ast_products`. Bloqueio pessimista (`FOR UPDATE`), validação de escopo de contrato operacional e trava em banco (`CHECK stock_current >= 0`) para impedir saldo negativo fail-closed.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 3.1-3.3): entrada de 50 eleva saldo para 50, saída de 20 reduz saldo para 30, tentativa de saída de 40 (superior ao saldo de 30) bloqueada fail-closed com 400 (`insufficient_stock`), saldo permanece 30.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-03
reserva para proposta/implantação sem confundir reserva com saída; liberação em cancelamento.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ast/reservations`. Tabelas `ast_reservations`, `ast_stock_movements`, `ast_products`. Cálculo atômico de saldo disponível (`stock_current - reservas ativas`), índice único contra reservas ativas duplicadas, ações de liberar (recompõe disponibilidade sem afetar estoque físico) e converter (baixa efetiva em estoque via `movement_type='saida'`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 4.1-4.5): reserva de 15 reduz disponibilidade, tentativa de sobre-reserva de 20 negada (400 `insufficient_available_stock`), retry duplicado negado (409), liberação recompõe disponibilidade uma única vez (segunda liberação negada 400), conversão em saída reduz saldo físico de 30 para 20.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-04
equipamentos serializados por cliente/posto/colaborador, proprietário, garantia, manutenção e termo de guarda.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ast/serialized-assets`. Tabela `ast_serialized_assets`. Vínculo a `product_id`, número de série único (`serial_number`), garantias, contratos e postos operacionais.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 5): criação de ativo serializado com status `disponivel`, serial duplicado rejeitado com 409 (`duplicate_serial_number`), histórico e auditoria fail-closed.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-05
entrega/devolução, avaria/perda, fotos pertinentes e conferência.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET /api/ast/deliveries`. Tabelas `ast_deliveries`, `ast_serialized_assets`. Gestão de custódia e termos de guarda com conferência antes/depois, fotos e notas; bloqueia dupla entrega ativa de ativo já em uso (`em_uso`) sem prévia devolução.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 5.1-5.3): entrega para titular altera status para `em_uso`, tentativa de entrega simultânea do mesmo ativo negada (409 `asset_already_in_use`), devolução altera status de volta para `disponivel`, cadeia de custódia preservada.
- Pendência / fronteira externa / aceite humano: Fotos/anexos operam sobre armazenamento privado local/sintético. Aceite humano pendente.

## AST-06
requisição, cotação, seleção, aprovação, pedido, recebimento e vínculo a conta a pagar.
- Estado: pronto_local
- Tela / API / dados / autorização: `POST/GET/PATCH /api/ast/requisitions`, `POST/GET/PATCH /api/ast/quotations`, `POST/GET/PATCH /api/ast/purchase-orders`, `GET /api/ast/requisition-history`, `GET /api/ast/order-history`. Tabelas `ast_requisitions`, `ast_quotations`, `ast_purchase_orders`, `ast_requisition_history`, `ast_order_history`. Protocolos automáticos (`REQ-AST-...`, `PED-AST-...`), fluxo sintético interno rotulado (`is_synthetic_flow=true`), seleção exclusiva de cotação e recebimento total com entrada automática no estoque.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (cenário 6): criação de requisição, aprovação auditada, cotação selecionada, pedido sintético emitido, recebimento total gera entrada automática (+10) no estoque físico e trilhas imutáveis de histórico preservadas.
- Pendência / fronteira externa / aceite humano: Não integra compras fiscais ou pagamentos externos reais (fluxo sintético interno rotulado). Aceite humano pendente.

## AST-07
inventário físico, divergências e ajuste aprovado.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/patrimonio` (aba Inventários Físicos com lista, protocolo, status e contagem). Endpoints: `POST/GET/PATCH /api/ast/inventories`, `POST/GET/PATCH /api/ast/inventory-items`, `GET /api/ast/inventory-history`. Tabelas: `ast_inventories`, `ast_inventory_items`, `ast_inventory_history`. Protocolo gerado (`INV-AST-...`), conciliação física de contagem, histórico imutável e aplicação atômica de ajuste de estoque apenas após aprovação formal (`status='aprovado'`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 2): inventário criado, contagem física divergente (esperado 30, apurado 25), aprovação atômica deduz 5 unidades do saldo em estoque com `FOR UPDATE`, re-aprovação bloqueada por idempotência, navegação confirmada em Chromium real.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-08
ordem de serviço com solicitante, contrato, técnico, agenda, diagnóstico, checklist, peças e execução.
- Estado: pronto_local
- Tela / API / dados / autorização: `/admin/patrimonio` (aba Ordens de Serviço (OS) com protocolo, prioridade, técnico, status e detalhes). Endpoints: `POST/GET/PATCH /api/ast/service-orders`, `GET /api/ast/service-order-history`. Tabelas: `ast_service_orders`, `ast_service_order_history`. Protocolo gerado (`OS-AST-...`), escopo de contrato operacional e cliente vinculados, checklist de diagnóstico, baixa atômica de peças (`movement_type='saida'`, `reference_type='ordem_servico'`) e obrigatoriedade de notas de execução e identificação do técnico para conclusão.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 3): abertura de OS, bloqueio de conclusão sem notas de execução (400), conclusão válida deduz 5 peças do saldo em estoque (25 -> 20), re-conclusão bloqueada sem duplicidade de consumo, rejeição atômica de OS com peças excedentes ao estoque disponível, navegação confirmada em Chromium real.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-09
evidências antes/depois, aceite, garantia, retorno e custo; acesso cliente somente ao que for aprovado.
- Estado: pronto_local
- Tela / API / dados / autorização: Endpoints: `POST/GET/PATCH /api/ast/service-order-evidences`. Tabela: `ast_service_order_evidences`. Validação estrita de escopo L02 de documentos privados (`client_documents`), proibição de anexos de outros clientes/contratos (403), tipo de evidência antes/depois, garantia, custo e liberação controlada de visibilidade para o cliente (`is_client_visible=true`) somente após aprovação (`is_approved=true` ou status aprovado no documento L02).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 4): bloqueio de evidência de cliente divergente (403 `document_scope_violation`), cadastro de evidência válida do mesmo contrato, rejeição de visibilidade ao cliente sem aprovação (400), e aprovação com liberação de visibilidade e prazo de garantia.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-10
manutenção preventiva/corretiva, periodicidade, alerta, próxima visita e histórico por ativo.
- Estado: pronto_local
- Tela / API / dados / autorização: Endpoints: `POST/GET/PATCH /api/ast/maintenance-plans`, `POST/GET /api/ast/maintenance-executions`. Tabelas: `ast_maintenance_plans`, `ast_maintenance_executions`. Planos de manutenção preventiva/corretiva por ativo (`asset_id`), periodicidade em dias, alerta antecipado, registro de execuções com técnico responsável, custo e avanço automático da próxima data de visita (`next_due_date`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 5): criação de plano preventivo trimestral (90 dias), registro de execução de manutenção técnica, e conferência no banco de que a próxima data de vencimento foi atualizada atomicamente no plano para a data indicada na execução.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-11
dossiê técnico de CFTV com modelos, localização autorizada, garantia e documentação; senhas de equipamentos fora do cadastro/log comum.
- Estado: pronto_local
- Tela / API / dados / autorização: Endpoints: `POST/GET/PATCH /api/ast/cftv-dossiers`. Tabela: `ast_cftv_dossiers`. Dossiê com modelo, fabricante, número de série, endereço IP, documentação técnica anexada, e proteção absoluta contra senhas em texto puro (`plaintext_password_prohibited` com rejeição 400 se `plain_password` ou `password` forem fornecidos), exigindo referência a cofre corporativo de senhas (`password_reference` / `password_storage_hint`).
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 6): tentativa de envio de senha em texto plano rejeitada com 400, e cadastro seguro do dossiê com apontador URI de cofre seguro e meta auditada sem credenciais sensíveis.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## AST-12
materiais de limpeza com consumo por local, reposição e comparação ao previsto.
- Estado: pronto_local
- Tela / API / dados / autorização: Endpoints: `POST/GET /api/ast/cleaning-materials`. Tabela: `ast_cleaning_materials`. Consumo esperado vs real por local/posto, período apurado, cálculo automático de razão de consumo (`consumption_ratio`), variância percentual (`variance_percent`), e acionamento automático do indicador de necessidade de reposição (`needs_replacement=true`) em caso de consumo excedente ao previsto.
- Integração e evidência (teste, resultado, commit): `npm run test:l06-delivery:pg` verde (Subtest 4, cenário 7): registro de consumo de produto de limpeza com consumo de 12 unidades contra 10 previstas, validação da variância (2 unidades / 20%), e flag `needs_replacement` ativada.
- Pendência / fronteira externa / aceite humano: Aceite humano pendente.

## ADM-01
painel “Meu dia” com pendências reais, prioridade, responsável e ação.
- Estado: pronto_local
- Tela / API / dados / autorização: Tela `/admin/marcelo` (aba Indicadores, `MarceloPanel.tsx`) com cartão `ADM-01.pendencias`. API `GET /api/adm/panel/indicators` e `GET /api/adm/panel/drilldown?indicator=ADM-01.pendencias` (`src/server/adm-panel-api.mjs`). Fontes canônicas: `fin_expenses` (pendente), `cli_tickets_v2` (aberto) e `ops_occurrence_book` (aberto), cada linha com prioridade, responsável e ação. Autorização decidida no servidor: anônimo 401; papéis fora de `admin|marcelo|ti` 403; TI estritamente leitura (`scope.can_decide=false`).
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA), subteste “ADM-01..05/12: papéis, origem declarada e drill-down de cada indicador até o registro canônico”: 3 pendências canônicas no período semeado, cada linha abrindo `GET /api/adm/panel/record` com o mesmo `record_id`; subteste “falha de leitura … e o retry recupera”: fonte indisponível vira `status:'indisponivel'` com `value:null` (nunca zero) e drill-down 503; jornada Chromium “do cartão ao registro e à decisão”.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 38, 39, 43 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-02
visão comercial com leads novos, oportunidades paradas, propostas e próximas ações.
- Estado: pronto_local
- Tela / API / dados / autorização: Cartões `ADM-02.leads_novos`, `ADM-02.oportunidades_paradas` e `ADM-02.propostas` na aba Indicadores. Fontes: `public_leads`, `crm_opportunities` (sem próxima ação/contrato) e `crm_proposals`. Cada cartão publica `source.tables`, `source.period_field`, `period` e `as_of`; o drill-down do lead projeta allowlist **sem PII** (sem nome/telefone).
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA), mesmo subteste de indicadores: contagem 1/1/1 contra os registros semeados, origem declarada por cartão e asserção explícita de que `name`/`phone` não saem na projeção do lead.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 38, 43 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-03
visão operacional com cobertura, ocorrências críticas, SLA e implantação.
- Estado: pronto_local
- Tela / API / dados / autorização: Cartões `ADM-03.ocorrencias_criticas`, `ADM-03.sla_estourado` e `ADM-03.implantacoes_pendentes`. Fontes: `ops_occurrence_book` (severidade crítica), `cli_tickets_v2` (SLA vencido) e `crm_contract_implantations`. Indisponibilidade de fonte é declarada por cartão e contada em `unavailable_count`.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA): subteste de falha de leitura renomeia `ops_occurrence_book`, prova dois cartões `indisponivel` com `value:null`, drill-down 503 (`drilldown_source_unavailable`), cartão não relacionado intacto e recuperação pelo retry sem intervenção manual.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 38, 39, 43 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-04
visão financeira com fonte/competência, saldo, vencimentos e margem por contrato.
- Estado: pronto_local
- Tela / API / dados / autorização: Cartões `ADM-04.recebiveis_vencidos` e `ADM-04.pagaveis_a_vencer`, em centavos, com competência/vencimento como campo de período declarado. Fontes: `fin_accounts_receivable` e `fin_accounts_payable`. Valor formatado em `pt-BR`/BRL na tela e `amount_cents` na API.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA): contagem e soma conferidas contra os registros canônicos; jornada Chromium confere `R$ 1.500,00`, a fonte `fin_accounts_receivable` e a data-base no cartão, abre a lista filtrada e o registro real.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 38, 43 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-05
contratos próximos de renovar, reclamações reincidentes e risco de perda justificado.
- Estado: pronto_local
- Tela / API / dados / autorização: Cartão `ADM-05.renovacoes` (fonte `crm_renewals`, com empresa, data de renovação e responsável) e drill-down para o registro canônico `crm_renewal`. Risco só aparece quando há registro canônico que o justifique — nenhum rótulo de risco é inferido sem origem.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA): o cartão conta a renovação semeada e cada linha abre o registro `crm_renewals`; período sem registro devolve `record_count:0` com `empty_reason:'sem_registro_canonico_no_periodo'` e `amount_cents:null` (ausência não vira zero inventado).
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 38, 43 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-06
aprovação unificada de descontos, compras, despesas e exceções permitidas; alçadas por valor/escopo.
- Estado: pronto_local
- Tela / API / dados / autorização: Aba Aprovações e `POST /api/adm/panel/decisions`, unificando despesas (`fin_expenses`) e descontos (`crm_discount_requests`). Alçada por valor vem de `fin_expense_approval_authorities` (sem linha ativa ninguém aprova); segregação solicitante≠decisor; autoria sempre da sessão. A mesma transação grava origem + `fin_expense_history` + `adm_panel_decisions` + `adm_panel_decision_history` + `audit_log`; falha de auditoria devolve 503 e reverte tudo. Idempotência por `idempotency_key` com `pg_advisory_xact_lock`.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA), subteste “ADM-06: decisão unificada com alçada, segregação, idempotência concorrente e auditoria fail-closed”: anônimo 401, TI 403 `read_only`, origem estranha 403, sem alçada 403 `approval_authority_exceeded` sem alterar o registro, 6 chamadas concorrentes → exatamente 1 criação e 5 replays com o mesmo id, limite aplicado gravado, histórico imutável (UPDATE/DELETE recusados), chave repetida com outro conteúdo 409, segunda decisão sobre a mesma origem 409, valor acima da alçada 403 e `audit_log` indisponível → 503 com rollback comprovado em banco; jornada Chromium aprova a despesa pela tela e o banco mostra `approver_identity` da sessão.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 40, 43 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-07
busca autorizada, favoritos, filtros salvos e atalhos com contexto.
- Estado: pronto_local
- Tela / API / dados / autorização: Aba Espaço de trabalho e `GET/POST /api/adm/panel/workspace`: favoritos, filtros salvos e atalhos sempre no escopo da identidade da sessão (`user_identity` enviado pelo cliente é ignorado); atalho só aceita URL interna `/admin/...`. Migração 138 adiciona CHECK `NOT VALID` de dono em `adm_search_favorites`, `adm_saved_filters` e `adm_shortcuts`.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA), subteste “ADM-07/08/09”: favorito criado por Marcelo nasce com `user_identity` da sessão mesmo recebendo outra identidade no corpo, não aparece para outra identidade, TI recebe 403 na escrita, RH 403 na leitura, atalho externo 400 e, com `audit_log` indisponível, a gravação devolve 503 sem deixar linha.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 41 — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-08
relatórios exportáveis e agendados para destinatários autorizados; registrar geração/envio e limitar dados.
- Estado: pronto_local
- Tela / API / dados / autorização: Aba Relatórios: `POST /api/adm/panel/reports` e `GET /api/adm/panel/report-download`. O total do relatório é **recalculado** pela mesma SQL canônica do cartão; dados limitados (`is_limited=true`, apenas `record_count`, `amount_cents`, `period_start`, `period_end`, `indicator_code`); destinatário precisa ser identidade ativa com papel autorizado; geração e download gravam `adm_report_logs` + `audit_log` na mesma transação; protocolo `REL-ADM-YYYYMMDD-XXXX`; download com `no-store`.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA): total do relatório igual ao do cartão, destinatário sem papel 403 `recipient_not_authorized`, TI 403 na geração, 4 chamadas concorrentes → 1 criação + 3 replays, mesma chave com outro título 409, download anônimo 401, de terceiro 403, do destinatário 200 com exatamente os 5 campos limitados, log de download e trilha conferidos em banco, e 503 com rollback quando a auditoria falha.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 41 — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-09
configurações de negócio versionadas: catálogo, preços, alçadas, conteúdo, SLA e preferências.
- Estado: pronto_local
- Tela / API / dados / autorização: Aba Configurações: `POST /api/adm/panel/business-configs` versiona com advisory lock por `config_key`, desativa a versão anterior, grava `supersedes_id`, exige motivo de 10–1000 caracteres e registra `adm_business_config_history` + auditoria na mesma transação. Migração 138 cria o índice parcial que garante uma única versão ativa por chave.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA): versões 1→2 com a anterior preservada e inativa, `supersedes_id` correto, duas linhas de histórico, motivo curto 400 e, com auditoria indisponível, 503 sem terceira versão e com a versão 2 ainda ativa.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 41 — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-10
metas e cenários com comparação prevista/realizada, sem confundir estimativa com resultado.
- Estado: pronto_local
- Tela / API / dados / autorização: Aba Metas: `GET /api/adm/panel/goals` separa `target` (estimativa, `crm_goals.target_value`, `is_estimate:true`) de `realized` (resultado, `crm_contracts.total_price`, com `record_count` e `as_of`), com `comparison_note` explicando que não são o mesmo número e `realized_status:'indisponivel'` quando a fonte do realizado falha.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA), subteste “ADM-10/11/12”: anônimo 401, RH 403, meta canônica publicada com fonte de cada lado, realizado contado de contratos reais e asserção de que estimativa e resultado são números distintos; a tela mostra “estimativa” e a fonte do realizado na aba Metas (jornada Chromium).
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 42, 43 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-11
trilha e diário de decisões CON-11 acessíveis conforme permissão.
- Estado: pronto_local
- Tela / API / dados / autorização: Aba Diário: `GET /api/adm/panel/decision-diary` sobre `crm_management_diary` (CON-11). TI não recebe entradas `restrito`/`diretoria` (`restricted_visible:false`, `hidden_visibilities`); cada entrada lida grava `adm_management_diary_access` com a identidade do leitor + auditoria na mesma transação, fail-closed.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA): TI não vê a decisão restrita e vê a de equipe, RH 403, Marcelo vê a restrita com acesso registrado, e com `audit_log` indisponível a leitura sensível devolve 503 sem deixar nenhuma linha de acesso (contagem antes = depois).
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 42 — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## ADM-12
análises de expansão, qualidade e oportunidades adicionais alimentadas pelos módulos reais.
- Estado: pronto_local
- Tela / API / dados / autorização: Aba Expansão: `GET /api/adm/panel/expansion` com blocos `oportunidades_abertas` (estimativa), `contratos_ativos` e `qualidade_ocorrencias` (realizado), cada um com fonte, `as_of` e indisponibilidade declarada, mais a lista de `adm_expansion_analyses` com `analyses_empty_reason` quando não há análise registrada. O cartão `ADM-12.oportunidades_expansao` abre o drill-down até a oportunidade real.
- Integração e evidência (teste, resultado, commit): `npm run test:l07-delivery:pg` verde (43 subtestes, duas execuções consecutivas no mesmo SHA): blocos com tipo e fonte conferidos, contagens batendo com os módulos reais e, ao tornar `crm_opportunities` ilegível, o bloco vira `indisponivel` com `value:null` em vez de zero; a aba Expansão exibe “realizado” na jornada Chromium.
- Subtestes vigentes do gate L07 (43, mesma numeração da matriz de fechamento): 38, 42, 43 (jornada Chromium) — ver [MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md).
- Pendência / fronteira externa / aceite humano: Aceite humano pendente (Marcelo/Andreia não validaram esta entrega). Sem fronteira externa: nenhum PSP, banco, SMTP, emissão ou dado de cliente real é tocado. Dívida explícita: os 80 componentes órfãos de `/admin/ti` não promovidos (ver `docs/INVENTARIO-ADMIN-TI.md`).

## PLT-01
diretório de usuários, papéis, escopos, convites, suspensão/revogação e revisão periódica de acesso.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-02
auditoria consultável por autor/ação/objeto/período/resultado, com acesso restrito e exportação auditada.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-03
integrações com status configurado/não configurado/falha, último processamento, erros sanitizados e teste de conexão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-04
fila durável de notificações com destinatário autorizado, deduplicação, tentativas, backoff, falha final e reprocessamento.
- Estado: pronto_local
- Tela / API / dados / autorização: POST/GET /api/admin/notifications, POST /api/admin/notifications/:id/retry, POST /api/admin/notifications/process (sessão de staff). Tabela notification_queue com dedup_key único parcial, attempts/max_attempts, next_attempt_at e escada de backoff 1/5/15/60/240 min; estados queued, sending, local_outbox, failed, dead.
- Integração e evidência (teste, resultado, commit): tests/l02-delivery.integration.test.mjs 6, 7 e 8 (HTTP real + PostgreSQL descartável), commit 4b95616. Dois defeitos corrigidos e provados por controle negativo: (a) isValidUuid com 4 grupos recusava todo UUID canônico; (b) reivindicação não atômica permitia entrega dupla — com o código antigo restaurado o teste 8 falha com "entregue 2 vezes".
- Pendência / fronteira externa / aceite humano: A tela de operação da fila ainda não existe; o consumo é por API. Reprocessamento manual exposto, mas sem agendador automático em execução contínua.

## PLT-05
notificações no painel, e-mail e canais externos configurados, preferências e templates revisados; nenhuma informação médica em assunto/push.
- Estado: em_execucao
- Tela / API / dados / autorização: Canal de e-mail roteado para a caixa de saída LOCAL (src/server/local-outbox.mjs); GET /api/admin/outbox e /api/admin/outbox/:id sob sessão de staff. Preferências e templates existem em 043-plt05-notifications.sql.
- Integração e evidência (teste, resultado, commit): tests/l02-delivery.integration.test.mjs 9 a 14, commit 4b95616: estado gravado é local_outbox e sent_at permanece nulo; nenhuma resposta contém "enviado"/"entregue"; listagem não devolve o corpo; leitura é contada e auditada; mensagem vencida responde 410.
- Pendência / fronteira externa / aceite humano: SMTP está fora do escopo por decisão do cliente: não há e-mail real. Falta a tela de painel de notificações e a revisão de conteúdo de templates (assunto/push sem informação médica) ainda não foi verificada por teste.

## PLT-06
observabilidade de HTTP/jobs/DB, correlação por request/event ID, métricas e alertas acionáveis, sem segredos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-07
healthcheck/liveness/readiness, degradação explícita de dependências e painel operacional restrito.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-08
backup de banco e documentos, criptografia, acesso, retenção e restauração testada em ambiente isolado.
- Estado: em_execucao
- Tela / API / dados / autorização: scripts/demo-offline-snapshot.mjs: cópia fria de pgdata + documents com manifest.json (formato seg-demo-cold-copy-v1) contendo caminho, bytes e sha256 por arquivo; restauração em diretório e cluster isolados, sem sobrescrever a origem.
- Integração e evidência (teste, resultado, commit): npm run test:demo-local:pg (QA-HOM-009), commit 4b95616: backup a quente é recusado com o lock do runner; a restauração isolada confere marcador de instalação, ledger de migrações e todos os checksums, sobe PostgreSQL próprio e valida por HTTP que o cliente enxerga a conta A e não a B.
- Pendência / fronteira externa / aceite humano: A trilha de dump lógico (npm run test:backup-restore:pg) NÃO foi exercitada neste ambiente: exige pg_dump/pg_restore 17, que não existem no sandbox Linux (o pacote embedded-postgres traz apenas initdb, pg_ctl e postgres) e não há pacote disponível. A suíte recusa de forma explícita e não cria banco. No alvo Windows o PostgreSQL 17 instala esses binários e a suíte deve ser executada lá. Criptografia em repouso e política de retenção ainda não implementadas.

## PLT-09
política de privacidade completa, inventário de dados/finalidades, bases aplicáveis, destinatários, prazos, contatos e direitos; revisão competente antes de publicar.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-10
pedidos de acesso/correção/eliminação com verificação de identidade, responsável, prazo e impedimentos legais documentados.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-11
retenção por categoria, descarte em jobs verificáveis, retenção excepcional formal e histórico minimizado.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-12
resposta a incidente com responsáveis, contenção, evidências, análise e comunicação conforme avaliação aplicável.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-13
gestão de configurações, flags, manutenção, rollout e reversão; negócio separado de infraestrutura.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-14
revisão de dependências, lockfile, vulnerabilidades, atualizações e CI.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-15
importação/exportação, logs de integração, limites, webhooks autenticados, retries e reconciliação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-16
orçamento operacional e alertas de uso de armazenamento, mensagens, IA, banco e infraestrutura.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-17
isolamento de desenvolvimento/homologação/produção com contas e dados próprios; previews sem dados reais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## PLT-18
documentação para manutenção por outro programador, configuração, migração, diagnóstico e recuperação.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## EXT-01
Frota Aceite: Veículo, responsável, abastecimento, manutenção, documentos e custo; se frota própria existir
- Estado: pronto_local (validação automática rápida; bateria pesada específica, aceite humano e Windows pendentes)
- Tela / API / dados / autorização: Tela real `/admin/frota` (FrotaWorkspace) e API canônica `/api/ext/fleet/*` (`src/server/ext-fleet-api.mjs`); tabelas `ext_fleet_*` da 085 + `ext_fleet_responsible_history`/`ext_fleet_maintenance_rules`/`ext_fleet_vehicle_events` da 147; papéis admin/marcelo/ti (anônimo 401, papel não autorizado 403); autoria da sessão, vínculo da URL, corpo forjado ignorado; same-origin + `Idempotency-Key` em toda mutação; transação única negócio+evento+`audit_log` com 503/rollback; histórico/custo somente canônico com fonte e data-base; alerta somente por regra explícita registrada; "se frota própria existir" declarado quando vazio; rotas legadas `/api/ext/fleet-*` com mutação 410.
- Integração e evidência (teste, resultado, commit): `tests/ext01-fleet.test.mjs` 20/20 (em `test:unit`); `npm test` 265/265; estático 5/5 (001–147); build 86 páginas com `/admin/frota`; `test:migrations:pg` 147/147 ×2 com checksum negativo rejeitado; `test:l08-delivery:pg` 51/51 (aplica 001–147; não cobre a jornada EXT-01). Relatório `ENTREGA-RELATORIO-2026-10-03-EXT01-FROTA.md`.
- Pendência / fronteira externa / aceite humano: Upload real de arquivo de documento fica fora desta fatia (metadados sintéticos declarados na tela). Bateria pesada HTTP/DB dedicada, aplicação em destino, aceite humano e homologação Windows pendentes. O órfão EXT de `/admin/ti` segue não promovido.

## EXT-02
Terceiros Aceite: Cadastro, contrato, documentos, vencimentos, acesso temporário e avaliação
- Estado: pronto_local (validação automática rápida + gate HTTP/DB dedicado da jornada; bateria pesada integral, aceite humano e Windows pendentes)
- Critério do plano: "terceiro acessa só OS/contrato autorizado e perde acesso ao término" — imposto por `ext_third_party_access_grants` (escopo único autorizado, término obrigatório, vigência derivada, revogação declarada) e provado por HTTP/DB.
- Tela / API / dados / autorização: Tela real `/admin/terceiros` (TerceirosWorkspace) e API canônica `/api/ext/third-party/*` (`src/server/ext-third-party-api.mjs`); tabelas `ext_third_part*` da 085 + `ext_third_party_access_grants`/`ext_third_party_evaluations`/`ext_third_party_document_rules`/`ext_third_party_events` da 148; papéis admin/marcelo/ti (anônimo 401, papel não autorizado 403); autoria da sessão, vínculo da URL, corpo forjado ignorado; contrato vinculado só após validação canônica em `crm_contracts` com quem verificou/quando/situação; same-origin + `Idempotency-Key` em toda mutação; transação única negócio+evento+`audit_log` com 503/rollback; vencimento derivado só da data registrada e "a vencer" só com regra explícita; avaliação com autor, data e justificativa; rotas legadas com leitura autorizada (chave `items` preservada) e mutação 410.
- Integração e evidência (teste, resultado, commit): `tests/ext02-third-parties.test.mjs` 50/50 (em `test:unit`); **`npm run test:ext02-third-parties:pg` 22/22 por HTTP real contra PostgreSQL real** (`tests/ext02-third-parties.integration.test.mjs` + `scripts/qa-ext02-third-parties-postgres.mjs`, CI em `.github/workflows/ext02-delivery.yml`); `npm test` 315/315; estático 5/5 (001–148); build 87 páginas com `/admin/terceiros`; `test:migrations:pg` 148/148 ×2 com checksum negativo rejeitado; `test:l08-delivery:pg` 51/51 e `test:demo-local:pg` OK (aplicam 001–148; **não** cobrem a jornada EXT-02). Relatório `ENTREGA-RELATORIO-2026-10-03-EXT02-TERCEIROS.md`.
- Pendência / fronteira externa / aceite humano: **Não existe ator externo "terceiro" autenticado**; nenhuma sessão, login ou canal externo foi criado ou simulado — o acesso do próprio terceiro permanece PENDENTE e é declarado pela API (`external_actor_boundary`) e pela tela. Upload real de arquivo de documento fica fora desta fatia (metadados sintéticos declarados). Bateria pesada integral, aplicação em destino, aceite humano e homologação Windows pendentes. O órfão EXT de `/admin/ti` segue não promovido.

## EXT-03
Licitações Aceite: Edital, prazos, documentos, responsáveis, proposta e resultado; se mercado relevante
- Estado: pronto_local (validação automática rápida + gate HTTP/DB dedicado da jornada; bateria pesada integral, aceite humano e Windows pendentes)
- Condição do plano ("se mercado relevante"): **indicada e NÃO confirmada**. Única evidência: `docs/referencias-marca.md` cita "órgãos públicos" entre os segmentos do site atual, em seção marcada "confirmar antes da nova publicação"; nenhum edital ou contrato público existe no repositório. A jornada foi implementada e a condição é **declarada** (`market_relevance: "indicada_nao_confirmada"`) em API, tela e docs; nenhum dado foi semeado e em nenhum lugar se afirma que a empresa participa de licitações. Confirmação do proprietário: PENDENTE.
- Critério do plano: imposto por registro canônico em dois níveis — **proposta** em `ext_bidding_proposals` versionada pelo servidor e recusada pelo banco (`CHECK`) se posterior ao prazo registrado; **prazo** em `ext_bidding_deadlines` com fonte declarada, um vigente por tipo e substituição explícita (editar/apagar bloqueado por gatilho); **resultado** só com edital encerrado, com autor/data/justificativa e imutável; **situação terminal final** (homologado não reabre, nem por API nem por banco); **responsável** como identidade canônica de equipe com papel copiado no ato; **checklist** derivado dos documentos ativos; **alerta** só com regra de antecedência registrada.
- Tela / API / dados / autorização: Tela real `/admin/licitacoes` (LicitacoesWorkspace) e API canônica `/api/ext/bidding/*` (`src/server/ext-bidding-api.mjs`); tabelas `ext_bidding_*` da 085 + `ext_bidding_deadlines`/`_responsible_assignments`/`_proposals`/`_checklist_items`/`_alert_rules`/`_events` da 149; papéis admin/marcelo/ti (anônimo 401, papel não autorizado 403); autoria da sessão, vínculo da URL, corpo forjado ignorado, UUID validado no servidor; same-origin + `Idempotency-Key` em toda mutação; transação única negócio+evento+`audit_log` com 503/rollback; versão de documento sob transação e lock (nunca `MAX(version)+1` solto); situação e prazos derivados só de registro canônico, com fonte e data-base declaradas; rotas legadas com leitura autorizada (chave `items` preservada) e mutação 410.
- Integração e evidência (teste, resultado, commit): `tests/ext03-biddings.test.mjs` 67/67 (em `test:unit`); **`npm run test:ext03-biddings:pg` 26/26 por HTTP real contra PostgreSQL real** (`tests/ext03-biddings.integration.test.mjs` + `scripts/qa-ext03-biddings-postgres.mjs`, CI em `.github/workflows/ext03-delivery.yml`) — primeira execução 22/26, defeito real de comparação `enum`×`text` em gatilho isolado e corrigido, re-provado sem enfraquecer asserção; `npm test` 382/382; estático 5/5 (001–149); build 88 páginas com `/admin/licitacoes`; `test:migrations:pg` 149/149 ×2 com checksum negativo rejeitado; `test:l08-delivery:pg`, `test:demo-local:pg` e demais gates aplicam 001–149 mas **não** cobrem a jornada EXT-03. Relatório `ENTREGA-RELATORIO-2026-10-03-EXT03-LICITACOES.md`.
- Pendência / fronteira externa / aceite humano: **Não existe portal público de compras integrado** (ComprasNet, BEC/SP, PNCP ou equivalente), nem importação automática de edital, nem envio de proposta a órgão, nem upload real de arquivo — `file_url`/`storage_key` são referências declaradas pela equipe e a API nunca afirma que o arquivo foi recebido. Confirmação do mercado pelo proprietário, bateria pesada integral, aplicação em destino, aceite humano e homologação Windows pendentes. O órfão EXT de `/admin/ti` segue não promovido.

## EXT-04
Portal fornecedores Aceite: Cotações/documentos/pedidos com escopo próprio; se volume justificar
- Estado: pronto_local **da jornada interna de staff** (gate HTTP/DB dedicado; condição de volume e ator externo pendentes)
- Condição: `sem_evidencia`. `PLANO-MESTRE-IMPLEMENTACAO.md:423` declara "se volume justificar"; `AUDITORIA-TERRENO-L08.md:85` registra apenas handler/tabelas sem fornecedor restrito provado; não há medição/meta/histórico. API, tela e docs declaram o veredito; nenhum dado semeado.
- Tela / API / dados / autorização: `/admin/fornecedores`; `/api/ext/supplier/*`; tabelas 085 endurecidas + validade, pedidos, prazos, alertas e eventos da 150. Staff admin/marcelo/ti; anônimo 401, papel indevido 403; same-origin; autoria da sessão; IDs/vínculos pela URL/registro; idempotência; transação única negócio+evento+auditoria, 503/rollback; decisão e terminais protegidos; versão documental sob lock. Legado preserva `items` na leitura e retorna 410 na mutação depois das guardas.
- Integração e evidência: focal 42/42; `npm test` 424/424; estático 5/5 (001–150); build 89; migrations 150/150 ×2; **`test:ext04-suppliers:pg` 28/28**, zero skip/todo, HTTP+PostgreSQL reais e CI própria. Demais gates não cobrem EXT-04.
- Pendência / fronteira externa / aceite humano: não existe identidade/login/sessão/grant/canal/upload/aceite de fornecedor; "escopo próprio" externo permanece pendente e não é apresentado como aceite. `file_url`/`storage_key` são referências. Confirmação de volume, bateria pesada, destino, aceite humano e Windows pendentes; aceite Marcelo/Andreia somente L07. Órfão `/admin/ti/ExtClient.tsx` não promovido.

## EXT-05
Qualidade Aceite: Não conformidade, causa, ação corretiva, verificação e reincidência; **Encerrar apenas com evidência e responsável**
- Estado: pronto_local (jornada interna de staff + gate HTTP/PostgreSQL dedicado; destino, aceite humano e Windows pendentes).
- Tela / API / dados / autorização: `/admin/qualidade`; `/api/ext/quality/*`; migração 151 sobre as tabelas 085. Staff admin/marcelo/ti; 401/403 distintos; same-origin; autoria da sessão; vínculos da URL/registro; UUID/corpo limitado; idempotência por identidade. Causa, ação, verificação, fechamento, reabertura e reincidência têm históricos canônicos imutáveis. Estados e pré-condições do fechamento existem na API e no PostgreSQL. Legado lê com `items` e mutação retorna 410 após guardas.
- Integração e evidência: probe anterior 9/9 lacunas; focal 6/6; `npm test` 430/430; Wave 0 5/5 (001–151); build 90 com rota real; migrations 151/151 ×2; gate dedicado **33/33**, zero skip/todo, HTTP real + PostgreSQL 17 + sessão staff + 503/rollback. Estático/typecheck/unit/build/migrations e demais gates não cobrem a jornada.
- Pendência / fronteira externa / aceite humano: jornada exclusivamente interna, sem ator externo exigido ou inventado. Evidência é referência declarada, não upload/arquivo verificado/armazenamento. Bateria pesada integral, aplicação em destino, aceite humano e Windows pendentes; Marcelo/Andreia somente L07. `ExtClient.tsx` preservado.

## EXT-06
Satisfação/carteira Aceite: Pesquisas, CSAT/NPS quando adequado, histórico e tarefa de recuperação
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers `/api/ext/*` para satisfação; tabelas `ext_satisfaction_surveys`/085; interface correspondente está nos três componentes EXT órfãos de `/admin/ti`.
- Integração e evidência (teste, resultado, commit): API e schema existem, mas não há rota que renderize o componente nem gate L08 por requisito; existência de tabela não é prova de jornada.
- Pendência / fronteira externa / aceite humano: Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira simulada explícita. Ver `AUDITORIA-TERRENO-L08.md`.

## EXT-07
Compliance corporativo Aceite: Licenças/certidões/seguros e obrigações aplicáveis com responsável e validade
- Estado: entregue_e_verificado_gate_local (2026-10-03, hardening 155 sobre a 153 e a 154 do main; base PR #103 + PR #113; 2026-10-04, execução agendada da avaliação temporal — migração 156 + agendador in-process opt-in por ambiente)
- Tela / API / dados / autorização: `/admin/compliance` com obrigações, referências privadas, renovação versionada e tarefas; `/api/ext/compliance/{obligations,documents,evaluate,tasks}` com 401 anônimo, 403 papel não autorizado, same-origin em mutações, Idempotency-Key obrigatória e replay/409 divergente; fonte canônica `ext_compliance_documents` (153/154/155) e tarefa em `ext_compliance_tasks`; escritores legados aposentados com 410 após os guardas.
- Integração e evidência (teste, resultado, commit): gate `npm run test:ext07-compliance:pg` — PostgreSQL 17 descartável, migrações 001–155, servidor HTTP real, sessão staff real, **37/37 casos, 0 fail/skip/todo**; migrações 155/155 com replay e clone negativo; EXT-04 28/28, EXT-05 33/33, EXT-06 36/36; `npm test` 457/457; build 92 páginas incluindo `/admin/compliance`.
- Pendência / fronteira externa / aceite humano: aplicação em banco de destino — decisões operacionais tomadas (2026-10-04: intervalo 3600 s + identidade declarada TI), fluxo ensaiado ponta a ponta em cluster descartável (32 verificações verdes) e runbook versionado (`docs/APLICACAO-BANCO-DESTINO.md`, com `.env.example` documentando as variáveis); a execução na máquina real do operador, o aceite humano e a validação Windows permanecem pendentes; execução agendada ENTREGUE (2026-10-04: migração 156, `EXT07_EVALUATE_INTERVAL_SECONDS` + `EXT07_EVALUATE_IDENTITY`, ledger append-only, rota `GET /api/ext/compliance/schedule`); referência documental é declarada (sem upload/bytes/checksum/malware scan/download); nenhum ator externo ou aceite humano inventado.

## EXT-08
Base de conhecimento Aceite: Procedimentos versionados, busca, acesso e ciência
- Estado: entregue_e_verificado_gate_local (2026-10-04, migração aditiva 160 + rotas canônicas `/api/ext/knowledge/*` + UI `/admin/conhecimento`)
- Tela / API / dados / autorização: `/admin/conhecimento` protegido por `AdminGate` para papéis de gestão e operação; API canônica `/api/ext/knowledge/articles` para listagem/busca textual, criação (mínimo 50 chars, slug único), detalhe com histórico de versões, atualização com versionamento imutável (`isNewVersion: true`), transição de estados (`rascunho -> em_revisao -> aprovado -> publicado -> arquivado`) e ciência formal individual por colaborador e versão; rota legada `/api/ext/knowledge-base` aposentada para escrita (HTTP 410); fail-closed server-side com `hasPermission()`, `sameOrigin` obrigatório nas mutações, idempotência com hash SHA-256 e rollback atômico com 503 `audit_unavailable` se o log de auditoria falhar.
- Integração e evidência (teste, resultado, commit): gate dedicado `npm run test:ext08-knowledge:pg` — PostgreSQL 17 descartável, migrações 001–160, servidor HTTP real e sessões staff reais, **15/15 casos aprovados, 0 fail/skip/todo**; testes unitários focais `tests/ext08-knowledge.test.mjs` **10/10** (`npm test` **536/536**); `node scripts/qa-wave0-static.mjs` **5/5**; `npm run typecheck` OK; `npm run qa:evidence` **14/14**.
- Pendência / fronteira externa / aceite humano: Aceite humano formal do operador e validação Windows/EPERM permanecem pendentes. Sem IA externa e sem dados de terceiros.

## EXT-09
Expansão/unidades Aceite: Planejamento de filial/contrato, capacidade e cenários financeiros
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers `/api/ext/*` para expansão/cenários; tabelas `ext_expansion_*`/086; interface correspondente está nos três componentes EXT órfãos de `/admin/ti`.
- Integração e evidência (teste, resultado, commit): API e schema existem, mas não há rota que renderize o componente nem gate L08 por requisito; existência de tabela não é prova de jornada.
- Pendência / fronteira externa / aceite humano: Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira simulada explícita. Ver `AUDITORIA-TERRENO-L08.md`.

## EXT-10
Continuidade operacional Aceite: Contingência por posto/cliente, contatos, exercícios e recuperação
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers `/api/ext/*` para continuidade/exercícios; tabelas `ext_continuity_*`/086; interface correspondente está nos três componentes EXT órfãos de `/admin/ti`.
- Integração e evidência (teste, resultado, commit): API e schema existem, mas não há rota que renderize o componente nem gate L08 por requisito; existência de tabela não é prova de jornada.
- Pendência / fronteira externa / aceite humano: Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira simulada explícita. Ver `AUDITORIA-TERRENO-L08.md`.

## EXT-11
Analytics/A-B Aceite: Hipótese, variantes aprovadas, métrica e privacidade
- Estado: entregue_e_verificado_gate_local (2026-10-04, migração 163 + API/UI canônicas + gate PG17/HTTP)
- Tela / API / dados / autorização: `/admin/analytics` protegido por `AdminGate`; `/api/ext/analytics/experiments` e sub-rotas de aprovação, transição e observações reais; `ext_analytics_experiments` preservada com `origin`, eventos e observações append-only; grants `analytics.read/write/approve/execute` consultados no servidor. Escrita `/api/ext/analytics-experiments` responde 410 após as guardas.
- Integração e evidência (teste, resultado, commit): unitário focal 10/10; gate `npm run test:ext11-analytics:pg` 18/18 sem skip/todo/fail, PostgreSQL 17 descartável, 001–163, HTTP real e sessões staff reais; replay/conflito, concorrência, transição sem aprovação, fonte sintética, rollback de auditoria, imutabilidade e legado 410 cobertos.
- Pendência / fronteira externa / aceite humano: aceite humano formal, Windows/EPERM e aplicação no banco de destino continuam pendentes. Não há tráfego A/B externo, significância, vencedor, SMTP, fornecedor ou dado inventado. Ver `AUDITORIA-TERRENO-L08.md`.

## EXT-12
Editor visual avançado Aceite: Tokens/layouts versionados, preview e publicação
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers `/api/ext/*` para tokens/layouts/histórico; tabelas `ext_visual_*`/086; interface correspondente está nos três componentes EXT órfãos de `/admin/ti`.
- Integração e evidência (teste, resultado, commit): API e schema existem, mas não há rota que renderize o componente nem gate L08 por requisito; existência de tabela não é prova de jornada.
- Pendência / fronteira externa / aceite humano: Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira simulada explícita. Ver `AUDITORIA-TERRENO-L08.md`.

## EXT-13
Relatório periódico Aceite: Consolidação de métricas e envio autorizado
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers `/api/ext/*` para relatórios/logs; tabelas `ext_periodic_report*`/087; interface correspondente está nos três componentes EXT órfãos de `/admin/ti`.
- Integração e evidência (teste, resultado, commit): API e schema existem, mas não há rota que renderize o componente nem gate L08 por requisito; existência de tabela não é prova de jornada.
- Pendência / fronteira externa / aceite humano: Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira simulada explícita. Ver `AUDITORIA-TERRENO-L08.md`.

## EXT-14
Inteligência comercial Aceite: Indicações, reativação e recomendações baseadas em histórico
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers `/api/ext/*` para inteligência comercial; tabelas `ext_commercial_intelligence`/087; interface correspondente está nos três componentes EXT órfãos de `/admin/ti`.
- Integração e evidência (teste, resultado, commit): API e schema existem, mas não há rota que renderize o componente nem gate L08 por requisito; existência de tabela não é prova de jornada.
- Pendência / fronteira externa / aceite humano: Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira simulada explícita. Ver `AUDITORIA-TERRENO-L08.md`.

## EXT-15
Apoio emergencial Aceite: Canal, destinatário, disponibilidade e escalonamento definidos
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers `/api/ext/*` para canais/testes emergenciais; tabelas `ext_emergency_*`/087; interface correspondente está nos três componentes EXT órfãos de `/admin/ti`.
- Integração e evidência (teste, resultado, commit): API e schema existem, mas não há rota que renderize o componente nem gate L08 por requisito; existência de tabela não é prova de jornada.
- Pendência / fronteira externa / aceite humano: Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira simulada explícita. Ver `AUDITORIA-TERRENO-L08.md`.

## EXT-16
Central/vídeo Aceite: Projeto separado para eventos de monitoramento, vídeo e disponibilidade
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers `/api/ext/*` para projetos/eventos de central; tabelas `ext_central_*`/087; interface correspondente está nos três componentes EXT órfãos de `/admin/ti`.
- Integração e evidência (teste, resultado, commit): API e schema existem, mas não há rota que renderize o componente nem gate L08 por requisito; existência de tabela não é prova de jornada.
- Pendência / fronteira externa / aceite humano: Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira simulada explícita. Ver `AUDITORIA-TERRENO-L08.md`.

## EXT-17
Biometria/reconhecimento Aceite: Projeto separado, necessidade e avaliação de impacto/base aplicável
- Estado: a_revalidar
- Tela / API / dados / autorização: Handlers `/api/ext/*` para projetos de biometria; tabelas `ext_biometry_projects`/087; interface correspondente está nos três componentes EXT órfãos de `/admin/ti`.
- Integração e evidência (teste, resultado, commit): API e schema existem, mas não há rota que renderize o componente nem gate L08 por requisito; existência de tabela não é prova de jornada.
- Pendência / fronteira externa / aceite humano: Permanece `a_revalidar`: faltam autorização por ator externo quando aplicável, auditoria transacional/rollback, idempotência, UI e fronteira simulada explícita. Ver `AUDITORIA-TERRENO-L08.md`.

## AI-01
FAQ pública com respostas aprovadas e transferência humana; informar limites, não inventar serviços/credenciais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-02
resumo de histórico comercial autorizado, com links para registros de origem.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-03
rascunho de proposta a partir de catálogo e versão de custos aprovados; sem alterar preço/escopo ou enviar sozinho.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-04
classificação e sugestão de resposta a chamados, submetida a revisão.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-05
extração de campos de documentos em ambiente privado, revisão humana e descarte de artefatos conforme política.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-06
busca interna/RAG filtrada por permissão antes de recuperar conteúdo; isolar índices/consultas quando necessário.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-07
relatório gerencial com cálculos feitos por código/consulta validada; IA narra, não inventa totais.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-08
inconsistências cadastrais e próximas ações sugeridas, com justificativa e fonte.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-09
curadoria da base, versão, publicação, feedback, avaliação, custo/token e rollback.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## AI-10
automações determinísticas de vencimentos, distribuição de tarefas e cobrança interna antes de agentes autônomos.
- Estado: a_revalidar
- Tela / API / dados / autorização: preencher
- Integração e evidência (teste, resultado, commit): preencher
- Pendência / fronteira externa / aceite humano: preencher

## L08 — decisão de sequência e primeira fatia (02/10/2026)

A PR #77 está mergeada na main oficial (`06be226`). L07 foi encerrado no escopo
local e aceito humanamente por Marcelo e Andreia. Windows não foi homologado:
permanece pendente e adiado para o fechamento integral do sistema. A transição
para L08 foi autorizada pelo proprietário. A decisão dos 80 componentes órfãos
permanece: promoção por área somente com prova; até lá são protótipos.

CLI-01..05 foram consolidados sobre a fonte canônica legada das migrações 003–005
(`auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`,
`client_documents`, `client_tickets` e auditorias), sem duplicar a fonte v2.
Rotas reais: `/cliente/entrar`, `/cliente/app/conta`, `/cliente/app/contratos`,
`/cliente/app/documentos`, `/cliente/app/chamados`; APIs correspondentes em
`/api/auth/*` e `/api/client/*`. O gate `test:l08-delivery:pg` prova isolamento
A/B, autorização derivada da sessão, corpo forjado sem ampliação, download
privado, histórico e erros de acesso. CLI-06..15 e EXT-01..17 não foram
promovidos.

## Série L08 hardening — 02/10/2026

- **Lote/base:** L08 hardening da primeira fatia, baseado na `main` oficial em `c16673c3c2a8f749ec476edb7a91dc62d2c1dfc`; PR #78 confirmada mergeada nesse merge commit e presente na main. Branch de trabalho: `arena/l08-hardening-20261002`.
- **Mudança:** o subteste Chromium deixou de usar apenas `setContent` sintético. Agora inicia o servidor real em loopback, navega por HTTP para `/cliente/entrar` com Chromium empacotado e verifica heading e campos reais. PostgreSQL continua descartável; não há sessão ou dado inventado no smoke.
- **Fonte/tabelas:** CLI-01..05 permanecem na fonte legada canônica: `auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`, `client_documents`, `client_tickets` e auditorias. Nenhuma migração criada; 001–138 permanecem imutáveis; próxima livre: 139.
- **Prova automática L08:** 11/11 em duas execuções (a segunda execução deverá ser registrada no relatório final desta série), incluindo 8 subtestes de isolamento/autorização/forged body/download/auditoria/revogação, inventário canônico e jornada Chromium real.
- **Regressões:** estático 5/5, typecheck OK, build exit 0. A execução unitária inicial no ambiente desta sessão teve falhas ambientais pré-existentes relacionadas à versão Node 20/dependências do conjunto de backup/homologação; não foram mascaradas nem alteradas. Windows não foi executado e continua pendente.
- **Classificação:** implementação local + validação automática Linux/PostgreSQL descartável. Aceite humano anterior de Marcelo e Andreia permanece preservado; isto não constitui aceite novo nem homologação Windows.
- **Não promovidos:** CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor restrito e integrações externas. Próximo passo: revisão humana da PR; merge somente após revisão, sem merge automático.

## Reconciliação pós-PR #83 — 03/10/2026

A `main` oficial em `31834ec` já contém a PR #83 (`4a5a4a9`), posterior à PR
#80. Esse lote implementou o hardening transacional de CLI-01..05 descrito em
`ENTREGA-L08-RELATORIO-2026-10-02-ATOMICIDADE-CLI01-05.md`: auditoria
fail-closed, atomicidade, download privado antes dos bytes, idempotência
concorrente de chamados/documentos e jornada completa de acesso no gate L08.
A migração aditiva `139-l08-client-space-atomic-idempotency.sql` é a última da
sequência contínua 001–139; 001–138 permanecem imutáveis e a próxima livre é
140.

Revalidação desta base no Linux/Node 22: estático 5/5, typecheck, unitários,
build, migrações 139/139, L03, L04, L05, duas execuções L07 (43/43) e duas
execuções L08 (50/50) passaram. L06 terminou 8/9: o subteste 8 sofreu SIGSEGV no
lançamento do Chromium (`Target page, context or browser has been closed`); a
falha foi preservada, sem skip, relaxamento de assertiva ou aumento de timeout.
Nenhum requisito adicional foi promovido por esta reconciliação. CLI-06..15,
EXT-01..17, APIs v2 não promovidas, órfãos de `/admin/ti`, fornecedor restrito e
integrações externas continuam fora do escopo. O aceite humano anterior de
Marcelo e Andreia permanece; não houve novo aceite humano nem homologação
Windows.

A matriz obrigatória foi repetida após esta atualização documental e terminou
integralmente verde, inclusive L06 9/9; o SIGSEGV anterior não recorreu. L07
passou 43/43 duas vezes e L08 passou 50/50 duas vezes.

## Resiliência de Interface e Separação de Sessões pós-PR #85 — 03/10/2026

- **Lote/base:** L08 pós-merge da PR #85, baseado na `main` oficial em `8eae38ae7ce84b9a824a63d469d36e03a3b0a5c0`. Branch de trabalho: `arena/01a0fffd-gruposegsystemseguranca`.
- **Mudança:** resiliência das telas do portal do cliente (`ClientSpaceProvider`, `/cliente/app`, `/contratos`, `/documentos`, `/chamados`, `/seguranca`) com retry explícito (`Tentar novamente`) em alertas e distinção de falha do provedor de contas; adicionado subteste de separação estrita de sessões staff × cliente em `tests/client-space.integration.test.mjs`.
- **Fonte/tabelas:** CLI-01..05 permanecem na fonte legada canônica (`auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`, `client_documents`, `client_tickets` e auditorias). Nenhuma migração criada; 001–139 imutáveis; próxima livre: 140.
- **Validação:** estático 5/5 OK, typecheck OK (`tsc --noEmit`), unitários 196/196 OK, build 78 páginas OK (`next build` Turbopack).
- **Classificação:** implementação local + validação estática/unitária/build. Aceite humano local de Marcelo e Andreia sobre L07 preservado; homologação Windows continua pendente e adiada até o fechamento integral.
- **Não promovidos:** CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor restrito e integrações externas. Próximo passo: PR contra main para revisão humana; sem merge automático.

### EXT-06 — satisfação/carteira — evidência de implementação (2026-10-03)

- [x] Fonte CLI-11 promovida; nenhuma terceira fonte e legado 085 sem writer.
- [x] `/admin/satisfacao` e `/api/ext/satisfaction/*` reais.
- [x] Portal e API cliente preservados com conta/grant/destinatário.
- [x] Metodologia/escala/fonte/período e regra de acompanhamento explícitos.
- [x] Resposta e eventos imutáveis; retry, conflito e concorrência cobertos.
- [x] Acompanhamento único, responsável canônico ou pendência fail-closed.
- [x] Conclusão com resultado; cancelamento com justificativa; terminais sem reabertura silenciosa.
- [x] Projeção cliente sem funcionário, identidade interna, fatos, risco, tarefa e auditoria.
- [x] Falha de `audit_log` retorna 503 e reverte negócio/evento.
- [ ] Aceite humano — não realizado nem presumido.

### EXT-07 — evidência da sessão 2026-10-03
- [x] Fonte canônica definida: `ext_compliance_documents` endurecida, linhas antigas classificadas como legado.
- [x] Tarefa canônica definida: `ext_compliance_tasks`, com unicidade por documento/período/regra.
- [x] Critério estrutural: documento privado e avaliação temporal idempotente.
- [ ] Gate PostgreSQL real e homologação permanecem pendentes até execução do ambiente dedicado.
