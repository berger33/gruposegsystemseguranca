## Atualização corrente — EXT-13 / F09 Relatório periódico canônico

- Base confirmada: PR #137 `MERGED` no merge commit `fcc7cf4f8a7fbdface6efb565af708672a12413a`; `origin/main`, `main` local e a branch fixa desta sessão `arena/01a10929-gruposegsystemseguranca` partiram desse SHA com checkout limpo. PRs #126, #127, #129, #132, #133, #134, #136 e #137 já integradas e intocadas.
- Fatia escolhida: próxima EXT pendente. O isolamento por `client_account_id` da EXT-10 segue pendente por falta de confirmação explícita como requisito desta rodada.
- Migração aditiva `165-ext13-reports-canonical-journey.sql`; 001–164 imutáveis; próxima livre: **166**.
- Entregue: definição de relatório com período/tipo/destinatários declarados, máquina de estados com aprovação justificada, geração contada (`COUNT(*)`) de tabelas-fonte internas reais fixas por tipo, snapshot de totais com fingerprint e envio registrado restrito a destinatários staff ativos; eventos `ext_report_events` e logs legados append-only.
- Rotas: `/api/ext/reports/periodic`, `/:id`, `/:id/transition`, `/:id/generate`, `/:id/send`; escrita legada `/api/ext/periodic-reports` responde 410 depois dos guards. UI `/admin/relatorios` protegida por `AdminGate`.
- Garantias provadas no gate: RBAC granular server-side fail-closed (`reports.*`), sessões individuais, same-origin, Idempotency-Key com SHA-256 replay/conflito, advisory lock + `FOR UPDATE`, concorrência, auditoria transacional 503/rollback, imutabilidade de eventos/logs, geração exigindo aprovação e envio exigindo geração + staff ativo. Totais conferidos contra o SQL, com dado-fonte comercial nascido pela rota pública real `/api/leads`.
- Provas: `npm ci`; Wave0 5/5; unitário EXT-13 12/12; `npm run test:ext13-reports:pg` 17/17; `npm run typecheck` OK; `npm test` 586/586; `npm run test:migrations:pg` 165/165; `npm run build` com 99 páginas; regressão EXT-12 14/14; `git diff --check` e `node --check` OK.
- Pendências: aceite humano do operador, Windows/EPERM e validação de banco de destino continuam pendentes; o envio EXT-13 é registro interno autorizado — sem SMTP, arquivo, CDN, agenda automática ou fornecedor externo.

## Atualização anterior — EXT-12 / F08 Editor visual avançado canônico

- Base confirmada: PR #136 `MERGED` no merge commit `e03c59141e614fbea31a9b6d9f05b24766177201`; `origin/main`, `main` local e a branch fixa desta sessão `arena/01a108ff-gruposegsystemseguranca` partiram desse SHA com checkout limpo. PRs #126, #127, #129, #132, #133, #134 e #136 já integradas e intocadas.
- Fatia escolhida: próxima EXT pendente. O isolamento por `client_account_id` da EXT-10 segue pendente por falta de confirmação explícita como requisito desta rodada.
- Migração aditiva `164-ext12-visual-editor-canonical-journey.sql`; 001–163 imutáveis; próxima livre: **165**.
- Entregue: tokens e layouts canônicos com versionamento, revisão, transição, aprovação, prévia interna e publicação auditada; eventos `ext_visual_editor_events` e `ext_editor_history` append-only; índice de versão publicada única por chave.
- Rotas: `/api/ext/visual/tokens`, `/:id`, `/:id/revisions`, `/:id/transition`, `/:id/publish`; `/api/ext/visual/layouts`, `/:id`, `/:id/revisions`, `/:id/transition`, `/:id/preview`, `/:id/publish`. Escritas legadas `/api/ext/visual-tokens` e `/api/ext/visual-layouts` retornam 410 depois dos guards. UI `/admin/visual` protegida por `AdminGate`.
- Garantias provadas no gate: RBAC granular server-side fail-closed (`visual_editor.*`), sessões individuais, same-origin, Idempotency-Key com SHA-256 replay/conflito, advisory lock + `FOR UPDATE`, auditoria transacional 503/rollback, imutabilidade de eventos/histórico, publicação exigindo aprovação e prévia.
- Provas: `npm ci`; Wave0 5/5; unitário EXT-12 10/10; `npm run test:ext12-visual:pg` 14/14; `npm run typecheck` OK; `npm test` 574/574; `npm run test:migrations:pg` 164/164; `npm run build` com 98 páginas; `git diff --check` e `node --check` OK.
- Pendências: aceite humano do operador, Windows/EPERM e validação de banco de destino continuam pendentes; publicação EXT-12 é registro interno, sem deploy externo, CDN, fornecedor ou upload real de arquivo.

## Atualização anterior — EXT-11 / F07 Analytics e experimentos A/B controlados

- Base confirmada: merge `58e213a11ccae35fc2f21002c9e1dda6b87bc333`; branch Arena fixa `arena/01a108c7-gruposegsystemseguranca`; PRs #126, #127, #129, #132, #133 e #134 já integradas e intocadas.
- Migração aditiva `163-ext11-analytics-canonical-journey.sql`; 001–162 imutáveis; próxima livre: **164**.
- Entregue: hipóteses, variantes A/B, métrica declarada, minimização e estados `rascunho/em_execucao/concluido/cancelado/arquivado`; aprovação humana, reversão/cancelamento, observações agregadas de fonte operacional interna e trilha append-only.
- Rotas: `/api/ext/analytics/experiments`, `/:id`, `/:id/approve`, `/:id/transition` e `/:id/observations`; escrita legada `/api/ext/analytics-experiments` responde 410 depois dos guards. UI `/admin/analytics` protegida por `AdminGate`.
- Garantias provadas no gate: RBAC server-side fail-closed e grants `analytics.*`, sessões individuais, same-origin, Idempotency-Key com SHA-256 replay/conflito, advisory lock + `FOR UPDATE`, auditoria transacional 503/rollback e imutabilidade de eventos/observações. Sem dado inventado, teste externo ou significância alegada.
- Provas: `npm ci`; Wave0 5/5; typecheck OK; `npm test` 555/555; `npm run build` com 98 páginas; `npm run test:migrations:pg` 163/163; unitário focal EXT-11 10/10; `npm run test:ext11-analytics:pg` 18/18 e `npm run test:ext07-compliance:pg` 43/43 em PG17 descartável + servidor HTTP + sessões staff reais; `git diff --check`/`node --check` OK. O primeiro bloqueio ambiental de `libpq.so.5` foi reparado somente instalando as dependências do lockfile; nenhum banco remoto foi usado.
- Pendências: aceite humano do operador, Windows/EPERM e validação de banco de destino continuam pendentes; a conclusão não significa ativação de tráfego A/B ou integração externa.

## Atualização corrente — EXT-10 / F06 Continuidade (registro anterior)

A implementação foi concluída na fatia anterior; a prova focal e a reconciliação desta sessão estão na seção validada abaixo. Aceites humano, Windows/EPERM e limites externos continuam pendentes.

# Plano de conclusão (Arena) — lista única de trabalho

## Atualização corrente — EXT-10 / F06 Continuidade validada

- Base daquela sessão: merge real da PR #135 `cf3a1f4c580f44b92969a61548eec8d304e9c005`, com pais `58e213a11ccae35fc2f21002c9e1dda6b87bc333` e `9396d03f0ff1cc7064ed3675525f2387d0718a4c`; a sessão atual reconfirmou a PR #136 integrada em `e03c59141e614fbea31a9b6d9f05b24766177201`. PRs #126, #127, #129, #132, #133, #134 e #136 estão integradas e não devem voltar ao fluxo.
- Ledger **001–163** preservado e imutável nesta fatia; próxima migração livre **164**. A migração 162 não foi alterada e a 164 não é necessária.
- F06 cobre a jornada interna de planos por posto, contatos declarados, procedimentos de contingência/recuperação, transições e exercícios simulados. A API canônica é `/api/ext/continuity/plans`, detalhe, `/transition` e `/exercises`; a UI é `/admin/continuidade`. Escritas legadas retornam 410.
- Guardas provadas: RBAC server-side fail-closed, same-origin, sessões individuais, idempotência SHA-256/replay/conflito, advisory lock, `FOR UPDATE`, máquina de estados, auditoria atômica com rollback/503, eventos imutáveis e reinício do servidor. Planos/exercícios foram criados por HTTP; SQL do gate só preparou identidades/grants/controles.
- Gate: `npm run test:ext10-continuity:pg` **17/17**, PG17 descartável, 001–163, servidor HTTP, Chromium e fixtures inteiramente fictícios. Unitário `tests/ext10-continuity.test.mjs` **9/9**; regressões: `npm test` **564/564**, typecheck, build **98 páginas**, migrações **163/163**, `git diff --check` e `node --check`.
- Correção encontrada pelo PostgreSQL: estados `arquivado` e reabertura para `rascunho` não possuem ações específicas no check histórico de auditoria da 162; a API usa `continuity_plan_update` nesses casos. Nenhuma migração histórica foi modificada.
- Não contar como entregue: cliente autenticado/escopo por `client_account_id`, ator externo, contato realmente notificado, SMTP/telefonia/gateway/fornecedor, Windows/EPERM, banco de destino e aceite humano. A próxima etapa deve escolher uma lacuna funcional explícita; não criar a migração 164 por conveniência.

## Atualização corrente — EXT-09 / F05 Expansão, Dimensionamento e Cenários Financeiros

- Base `b63a51e6e2af200b0ac93370dbe629f631dec718`, branch `arena/01a1085d-gruposegsystemseguranca`.
- Migração aditiva `161-ext09-expansion-canonical-journey.sql` acrescenta controle canônico de ciclo de vida (`rascunho -> em_analise -> aprovado -> em_execucao -> concluido` ou `rejeitado` / `cancelado`), dimensionamento de capacidade (postos), cenários financeiros A/B com margem projetada, justificativa obrigatória para cancelamento/rejeição, tabela imutável `ext_expansion_events` com fingerprint SHA-256 e ampliação de ações em `auth_access_audit_action_check`. Migrações 001–160 imutáveis; **próxima livre: 162**.
- API e UI canônicas: rotas `/api/ext/expansion/plans` e sub-rotas `/scenarios` e `/transition` + UI protegida em `/admin/expansao` com `ExpansionWorkspace.tsx`. Legado `/api/ext/expansion-plans` com escrita aposentada em HTTP 410.
- Provas completas:
  - Gate dedicado: `npm run test:ext09-expansion:pg` **16/16** aprovados em PostgreSQL 17 descartável.
  - Testes unitários focais: `tests/ext09-expansion.test.mjs` **9/9** aprovados (`npm test` total: **545/545**).
  - Wave 0 estático: **5/5**; `npm run typecheck`: OK; `npm run test:migrations:pg`: **161/161**; EXT-08 **15/15**; EXT-07 **43/43**; F03 **1/1** cada.
- Próximo passo: seguir sequência planejada para EXT-10 / F06 (continuidade de negócios e contingência) ou próximo incremento do roadmap.

## Atualização — EXT-08 / F04 Base de Conhecimento e Procedimentos Operacionais

- Base `b63a51e6e2af200b0ac93370dbe629f631dec718`, branch `arena/01a1085d-gruposegsystemseguranca`.
- Migração aditiva `160-ext08-knowledge-canonical-journey.sql` acrescenta ciclo de vida canônico (`rascunho -> em_revisao -> aprovado -> publicado -> arquivado`), versionamento imutável com isolamento de rascunhos, registro de ciência formal por colaborador e versão, chaves de idempotência e tabela de eventos imutáveis com fingerprint SHA-256. Migrações 001–159 imutáveis; **próxima livre: 161**.
- API e UI canônicas: rotas `/api/ext/knowledge/articles` (listagem/busca, criação, detalhe, edição com nova versão, transição e ciência) + UI protegida em `/admin/conhecimento` com `KnowledgeWorkspace.tsx`. Legado `/api/ext/knowledge-base` com escrita aposentada em HTTP 410.
- Provas completas:
  - Gate dedicado: `npm run test:ext08-knowledge:pg` **15/15** aprovados em PostgreSQL 17 descartável.
  - Testes unitários focais: `tests/ext08-knowledge.test.mjs` **10/10** aprovados (`npm test` total: **536/536**).
  - Wave 0 estático: **5/5**; `npm run typecheck`: OK; `npm run qa:evidence`: **14/14**; L07 **43/43**; L08 **51/51**; EXT-07 **43/43**.
- Próximo passo: seguir sequência planejada para EXT-09 / F05 (expansão e novas unidades) ou rodada de pendências específicas.

## Atualização corrente — F03 contas → baixa → relatório

- Base `a0815cfcfd7df17f30dce2e99ab744a36c3f341a`, branch `arena/01a10845-gruposegsystemseguranca`, implementação `23910567a2a329dc4f46c4aae6cf740c9d4888aa`, PR [#132](https://github.com/berger33/gruposegsystemseguranca/pull/132); documentação `8e7d84230fded1fcac9a256f5d1752e402f49b5a`. Migração 159 aditiva; próxima livre 160.
- Entregue o quarto fluxo automatizado sobre fontes FIN-01..04: leitura e baixa por conta com `financeiro.*` fail-closed, transição estrita, idempotência, locks, transação, histórico/auditoria e relatório interno imutável. Escrita dos aliases HR retorna 410; sem simular banco/SMTP/entrega.
- Provas: gate focal 1/1; Wave0 5/5; typecheck; unitários 526/526; L07 43/43; L08 51/51; client-space 22/22; client-access 27/27; F03 #126/#127/#129 1/1; demo-local OK.
- Próximo passo: revisão/aceite humano e prova Windows/EPERM. **Não marcar F03 concluída antes desses dois gates.** Depois, seguir EXT-08/F04 em fatia separada.

## Atualização corrente — F03 cliente → chamado → atendimento → aceite

- **Base:** `origin/main` `a459e07d42a855f93af4d76d047b49f3ff5e204e` (PR #127 já integrada); **branch fixa:** `arena/01a107a9-gruposegsystemseguranca`; **commits:** `3c7e9ab1da469b94d7cf383491f9240df30a8b6e` (implementação) + `7bf821eabba64b3880698d83b7a0fae3c5001594` (documentação); **PR:** [#129](https://github.com/berger33/gruposegsystemseguranca/pull/129), **integrada em `origin/main` pelo merge `a0815cfcfd7df17f30dce2e99ab744a36c3f341a`**. Não recriar/reabrir/remesclar #126, #127 nem #129.
- A jornada cliente→chamado→atendimento→aceite foi validada por `npm run test:f03-client-ticket-acceptance:pg` (**1/1**, PostgreSQL 17 descartável, HTTP e Chromium), Wave 0 5/5, typecheck, `npm test` 526/526 e regressões (`test:l08-delivery:pg` **51/51**, client-space **22/22**, `test:client-access:pg` **27/27**, gates F03 #126/#127 **1/1**, `test:demo-local:pg`). A migração livre 158 foi consumida additivamente; 001–157 imutáveis; **próxima livre: 159**.
- A prova preserva autorização fail-closed e mesma origem, sessões individuais, A/B, auditabilidade transacional, idempotência/retry e transações atômicas com trilha de mensagens; a escrita CLI-05 legada fechou com 410 `legacy_cli_ticket_write_retired`; a UI administrativa e o portal expõem a trilha e somente ações legais da máquina de estados. Falhas reais (helper de chave de idempotência, asserção de chamado prematuro, ordenação da trilha, health timeout ambiental) foram corrigidas e a execução repetida sem remover asserções.
- **Limites:** F03 ainda não está concluída — falta contas→baixa→relatório, além do aceite humano e Windows/EPERM; SMTP, banco, eSocial, assinatura, hosting e IA externos continuam fora.

## Atualização — F03 funcionário → RH → retorno

- **Base:** `origin/main` `7a41837385985e2321fc86f8b461f133d7c01423` (PR #126 já integrada); **branch fixa:** `arena/01a10761-gruposegsystemseguranca`; **commits:** `d0f1cdebfb5fecac2fc7bb639b554faf1724a7b7` (implementação) e `fcddf69` (evidência/documentação); **PR:** [#127](https://github.com/berger33/gruposegsystemseguranca/pull/127). Não recriar a #126.
- A jornada funcionário→solicitação→análise RH→retorno foi validada localmente por `npm run test:f03-employee-request-rh-return:pg` (**1/1**, PostgreSQL 17 descartável, HTTP e Chromium), além de Wave 0 5/5, typecheck e `npm test` 526/526. A migração livre 157 foi consumida additivamente; 001–156 continuam imutáveis.
- A prova preserva autorização fail-closed e mesma origem, sessões individuais, A/B, auditabilidade transacional e retry idempotente; escrita EMP-12 legada foi fechada com 410 para não contornar a rota canônica.
- Falhas reais registradas: manifesto fechado ainda em 156; conflito enum/texto revelado no PostgreSQL; e seletores/concorrência do Chromium. Todos foram corrigidos e a execução foi repetida sem remover asserções.
- **Limites:** F03 ainda não está concluída — faltam cliente→chamado→aceite e contas→baixa→relatório, aceite humano e Windows/EPERM; SMTP, banco, eSocial, assinatura, hosting e IA externos continuam fora.


Data: 2026-10-04. Base vigente desta fatia: `origin/main` `972e6563f5ea4888b62e88b8c126a925d79f6068`; branch fixa `arena/01a1073d-gruposegsystemseguranca`; PR #126 (`c1a557f` + documentação `e45e41b`), checks publicados verdes. F00/F01 estão integradas; a PR #125 (`e2fa152`) foi integrada no merge acima. Deriva de [docs/auditoria-2026-10-04/02-PLANO-ARENA.md](auditoria-2026-10-04/02-PLANO-ARENA.md) já reconciliado em [STATUS-ATUAL-CONSOLIDADO.md](STATUS-ATUAL-CONSOLIDADO.md). Este é o plano operacional vigente entre sessões; cada sessão atualiza a coluna "situação" e [CONTINUACAO-ARENA.md](CONTINUACAO-ARENA.md).

## Regras permanentes

1. Uma fatia de implementação por PR; PR pequeno revisável; nunca mesclar PRs alternativas antigas.
2. Migrações 001–164 são imutáveis; próxima livre no main vigente: **165** (reconfirmar antes de cada fatia).
3. Autorização no servidor em toda API; nunca apenas ocultação no menu. Fail-closed em erro de banco/permissão.
4. Preservar PLAT-01 (despacho à prova de rejeição), credenciais individuais, isolamento entre clientes, auditoria transacional e idempotência.
5. Evidência real por fatia: comando + resultado + SHA + limite da prova. Banco sempre descartável (embedded-postgres de teste ou Compose exclusivo do operador). Sem segredos em git/logs.
6. SMTP real e hospedagem definitiva fora do escopo; não declará-los como entregues.
7. Não contar tabela/API/tela incompleta ou fallback de IA como funcionalidade concluída.

## Sequência e dependências

| Etapa | Escopo | Dependência | Situação |
|---|---|---|---|
| F00 | Reconciliação dos 222 IDs + classificação dos PRs abertos | — | **concluída nesta sessão**: STATUS-ATUAL-CONSOLIDADO.md + PRs classificados (27 superseded, #121 fonte) |
| F01 | Entrada e navegação por papel: `/admin` hub, `/admin/entrar` login central, redirecionamento seguro com retorno, rótulo papel-neutro, menu por papel, 401/403/500 compreensíveis | F00 | **integrada pela PR #125 (`e2fa152`), merge `972e656`**; aceite humano pendente |
| F02 | Windows/EPERM symlink, isolamento QA×ambiente, scripts start/stop/status, backup/restauração em instância separada | F01 | pendente — requer Windows do operador para aceite |
| F03 | Massa de demonstração e jornadas de negócio ponta a ponta (lead→recebimento, funcionário→RH, cliente→chamado, contas→baixa) | F01 | **em execução**: fundação + três jornadas provadas (lead→contrato→implantação #126 `c1a557f`, gate 1/1; funcionário→solicitação→hora→retorno #127 `d0f1cde`, gate 1/1; cliente→chamado→atendimento→aceite #129 `3c7e9ab1`, gate 1/1); falta contas→baixa→relatório |
| F04 | EXT-08 conhecimento: base de procedimentos versionados, ciência formal, máquina de estados e busca | F01 | **entregue localmente**: migração 160, API canônica, `/admin/conhecimento`, gate `test:ext08-knowledge:pg` 15/15; aceite humano pendente |
| F05–F13 | EXT-09 expansão, EXT-10 continuidade, EXT-11 analytics, EXT-12 visual, EXT-13 relatórios, EXT-14 inteligência comercial, EXT-15 emergencial, EXT-16 central/vídeo (projeto separado), EXT-17 biometria (projeto separado) — um requisito por PR | F01 | F05/F06/F07/F08/F09 têm implementação e gates locais nas fatias 161/162/163/164/165; EXT-10 está provada somente na jornada interna de staff e ainda não tem escopo/isolamento de cliente ou ator externo; EXT-14–17 permanecem pendentes; tabelas 086–087 não são, por si, jornada entregue |
| F14 | IA/RAG real: AI-06 recuperação autorizada + AI-09 curadoria primeiro; depois AI-01..05, 07, 08, 10. Fallback não é inferência. | F03 (massa e escopos) | pendente; OLLAMA_ENABLED=false hoje = fallback |
| F15 | Fronteiras parciais: portal externo fornecedor, upload real, recuperação de conta sem SMTP, jobs vs reinício, notificações internas, isolamento A/B, EXT-07 obrigação vencida | F04+ | pendente |
| F16 | Aceite final: matriz de aceite 03-ACEITE.md, humano de Marcelo/Andreia/funcionário, relatório de riscos, runbook Windows | todas | pendente |

## Trabalho imediato após F01 (ordem)

1. ~~Fechar PRs superseded~~ — **concluído em 04/10/2026**: 27 alternativas fechadas sem merge + #121 fechada após integração documental pela #122; a #124 foi revisada, fechada como superseded e reaplicada na PR #125 sobre o main pós-#123.
2. **F03 — concluir as jornadas sobre a massa idempotente já criada**: lead→contrato→implantação (PR #126), funcionário→solicitação→RH→retorno (PR #127) e cliente→chamado→atendimento→aceite (PR #129) foram provadas; resta contas→baixa→relatório (próxima fatia). Uma jornada por fatia revisável, sem duplicar fontes canônicas.
3. **EXT-08 (F04)** — primeira fatia EXT pendente.
4. Rodada dedicada: obrigação vencida do EXT-07 criando tarefa (pendência declarada no aceite técnico).

## Estados que NÃO permitem declaração de conclusão

- Qualquer EXT-08..17 ou AI-01..10 sem jornada UI→API→PG provada e RBAC testado.
- Aceite humano não registrado por papel (Marcelo/Andreia/funcionário/clientes A e B).
- Windows sem os três casos de symlink exercitados (EPERM) e backup/restauração ensaiados.
