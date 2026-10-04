# Continuidade Arena — 2026-10-04 (F01 cobertura + F03)

## Incremento 7 — F03 contas → baixa → relatório (financeiro)

- **Base confirmada:** `origin/main` `a0815cfcfd7df17f30dce2e99ab744a36c3f341a` (merge normal da PR #129, conferido por `git fetch origin main`); **branch fixa:** `arena/01a10835-gruposegsystemseguranca`; **commits desta fatia:** `4cce117c51622b1528e363c7d0bdbe28766f5b31` (implementação) e o commit de documentação desta seção; **PR:** [#131](https://github.com/berger33/gruposegsystemseguranca/pull/131). Não recriar/reabrir/remesclar #126, #127 e #129.
- **Escopo entregue localmente:** a quarta e última jornada F03. A conta nasce por `POST /api/admin/finance/l07/settlements` com `Idempotency-Key` obrigatória e escopo granular; a fila staff `GET` do mesmo caminho mostra somente o recorte das concessões reais `finance.settlements.read` (fail-closed: sem concessão é **403**, nunca lista vazia); a baixa acontece em `PATCH` com máquina estrita `pendente|vencido|parcial → parcial|recebido|pago`, motivo de 10–1000 caracteres e saldo validado; o relatório da competência vive em `GET /api/admin/finance/l07/settlement-report?competence=AAAA-MM`, calculado em tempo real sobre `fin_accounts_receivable`/`fin_accounts_payable`/`fin_payments` e com a leitura auditada.
- **Garantias:** sessão administrativa individual e mesma origem; `hasPermission()` no servidor por conta de cliente; lock consultivo + `FOR UPDATE` + `UPDATE ... WHERE status AND amount_paid_cents`; ledger `fin_settlement_requests` com impressão digital (replay 200, chave divergente 409); pagamento, histórico imutável, ledger e `auth_access_audit` (`fin_account_open`/`fin_account_settle`/`fin_settlement_report_read`) na mesma transação — falha de auditoria responde 503 e desfaz tudo. Sobrepagamento é **409 settlement_exceeds_balance**, nunca truncado em silêncio. As contas sob governança canônica recusam o atalho legado: baixa FIN-04 responde **410 legacy_fin04_settlement_write_retired** e a troca de situação FIN-01/02 responde **410 legacy_fin01_status_write_retired**, ambas depois das guardas de sessão.
- **Migração:** aditiva `159-f03-accounts-settlement-report.sql` (`fin_settlement_requests`, `fin_canonical_accounts`, ações de auditoria); **001–158 imutáveis**, registrada no manifesto PG, Wave 0, relatório de evidências e asserção EXT-07. UI honesta: aba “Contas, baixa e relatório” em `/admin/financeiro`, com chave de idempotência por tentativa, erro visível, lista vazia explícita e rótulo de governança por conta.

### Prova repetida e limites da prova

- `node scripts/qa-wave0-static.mjs`: **5/5** (001–159); `npm run typecheck`: OK; `npm test`: **526/526**; `npm run build`: OK; `git diff --check` / `node --check`: OK.
- `npm run test:f03-contas-baixa-relatorio:pg`: **1/1** — PostgreSQL 17 descartável, HTTP real e Chromium; cobre anônimo/cliente/staff sem concessão, escopo A/B na fila, na baixa e no relatório, 410 das duas rotas legadas sem tocar o estado, concorrência 5×/4× convergindo para um efeito material, replay 200 e divergência 409, sobrepagamento 409, rollback por falha injetada de auditoria, baixa sobre conta liquidada 409, conta inexistente 404 e a jornada completa na interface sem console/page/HTTP 5xx.
- Regressões na mesma sessão: `npm run test:l07-delivery:pg` (**43/43**), `npm run test:l08-delivery:pg` (**51/51**), `node scripts/qa-tenant-postgres.mjs` client-space (**22/22**), `npm run test:client-access:pg` (**27/27**), `npm run test:f03-lead-to-implementation:pg` (**1/1**), `npm run test:f03-employee-request-rh-return:pg` (**1/1**), `npm run test:f03-client-ticket-acceptance:pg` (**1/1**), `npm run test:demo-local:pg` (OK).
- **Decisão de desenho registrada honestamente:** o legado FIN-01/02/04 **não** foi aposentado em bloco — ele é a fonte provada de 30+ passos do gate L07 e continua atendendo contas legadas. O 410 incide exatamente sobre as contas nascidas na rota canônica, que é onde o atalho legado contornaria idempotência, escopo granular e auditoria transacional. `next-env.d.ts`/`tsconfig.json`, regenerados pelos gates, foram restaurados antes do commit (padrão das fatias anteriores).

### Limites e próximo passo

F03 **não** está concluída: faltam o aceite humano por papel e Windows/EPERM (F02). A geração recorrente FIN-03 ainda cria contas fora da governança canônica e deve ser reconciliada em fatia própria. Sem dados reais, segredos em git/logs, SMTP, banco bancário, eSocial, assinatura externa, hospedagem permanente ou IA externa.

## Incremento 6 — F03 cliente → chamado → atendimento → aceite

- **Base confirmada:** `origin/main` `a459e07d42a855f93af4d76d047b49f3ff5e204e` (merge normal da PR #127, conferido por `git fetch origin main`); **branch fixa:** `arena/01a107a9-gruposegsystemseguranca`; **commits desta fatia:** `3c7e9ab1da469b94d7cf383491f9240df30a8b6e` (implementação) e o commit de documentação desta seção; **PR:** [#129](https://github.com/berger33/gruposegsystemseguranca/pull/129). Não recriar/remesclar #126/nem #127.
- **Escopo entregue localmente:** o cliente autenticado abre chamado por `POST /api/client/tickets` com `Idempotency-Key` (já canônico); o staff enxerga somente o recorte das concessões reais `client.tickets.read`/`client.tickets.write` (fail-closed, escopo por conta) na fila canônica `GET /api/admin/client/l08/tickets`; transições estritas `open|waiting_client → in_progress → resolved` em `PATCH` exigem devolutiva de 5–1000 caracteres; o cliente aceita em `PATCH /api/client/tickets/:id/accept` (`resolved → closed`, `closed_at`). O SLA de chamados legados `waiting_client` é retomado na mesma transação — nenhuma pausa dura para sempre.
- **Garantias:** sessões individuais e mesma origem; verificação de permissão no servidor; lock (advisory + `FOR UPDATE` + `UPDATE ... WHERE status`), chave de idempotência por tentativa, replay 200, mesmo eixo com conteúdo divergente 409; trilha `client_ticket_messages`, histórico de estado e `auth_access_audit` (`ticket_attend`/`ticket_resolve`/`ticket_accept`) na mesma transação; concorrência 5×/4× convergindo para 1 efeito material. Escrita legada CLI-05 (`PATCH /api/admin/tickets/:id` e afins) responde **410** `legacy_cli_ticket_write_retired` após as guardas de sessão, sem bypass; leitura legada permanece.
- **Migração:** aditiva `158-f03-client-ticket-acceptance.sql` (`client_ticket_messages`, checks ampliados, ações de auditoria); **001–157 imutáveis**, registrada no manifesto, Wave 0, relatório de evidências e asserção EXT-07. UI honesta: `/admin/clientes` reescrito sobre a fila canônica; portal mostra a trilha e ganha aceite com chave por tentativa; a criação já era idempotente via `requestRef`.

### Prova repetida e falhas reais corrigidas

- `node scripts/qa-wave0-static.mjs`: **5/5** (001–158); `npm run typecheck`: OK; `npm test`: **526/526**; `git diff --check` / `node --check`: OK.
- `npm run test:f03-client-ticket-acceptance:pg`: **1/1** — PG17 descartável, HTTP real, Chromium nas duas personas; isolamento A/B na fila, 410 legado, concorrência e replay, rollbacks por falha injetada de auditoria (abertura, resolução e aceite), trilhas finais assertadas.
- Regressões na mesma sessão: `npm run test:l08-delivery:pg` (**51/51**), `node scripts/qa-tenant-postgres.mjs` client-space (**22/22**), `npm run test:client-access:pg` (**27/27**), `npm run test:f03-lead-to-implementation:pg` (**1/1**), `npm run test:f03-employee-request-rh-return:pg` (**1/1**), `npm run test:demo-local:pg` (OK).
- **Falhas reais:** helper da suíte só anexava `Idempotency-Key` em dois POSTs — PATCHes canônicos perdiam a chave (helper agora a utiliza sempre que fornecida); asserção “resolver antes de assumir” referenciava variável inexistente — substituída por chamado irmão criado via HTTP (409 com `status:"open"`); consulta da trilha usava `ORDER BY created_at` inexistente em `client_ticket_status_audit` — ordena por `id`; uma execução do gate falhou na subida do servidor dev por health timeout ambiental (120 s) — repetição sem alteração de código saiu verde (flakiness acompanhada); inventário L08 re-expandido com as rotas canônicas. Nenhuma asserção foi enfraquecida.

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
