# Entrega L07 — financeiro e Marcelo (fatias em andamento)

## Atualização vigente — fechamento de matriz e evidências (2026-10-02)

A matriz do L07 foi fechada: FIN-01..16 e ADM-01..12 conferidos requisito a
requisito contra tela/API/tabela/autorização reais e subtestes existentes do
gate, com mapa completo (requisito → tela/rota → API → tabelas canônicas →
subtestes → resultado → pendência) em
[MATRIZ-FECHAMENTO-L07.md](MATRIZ-FECHAMENTO-L07.md). Três divergências de
evidência foram corrigidas **acrescentando prova ou implementando** — nunca
ajustando texto para parecer completo: trava SQL da migração 137 provada nas
três tabelas (recebíveis, pagáveis, custos) no subteste 36; período vazio
asserido no próprio cartão `ADM-05.renovacoes` no subteste 39; e a “margem por
contrato” do requisito ADM-04, ausente do painel (com afirmação incorreta no
relatório anterior, corrigida com nota), implementada como cartão
`ADM-04.margem_por_contrato` sobre o resultado canônico de FIN-09, provada no
subteste 38 — sem migração nova (próxima livre: 139). Gate L07 **43/43 em duas
execuções consecutivas** no estado final; baseline reconfirmada antes de
qualquer edição (estático 5/5, typecheck 0, unitários 196/196, migrações
138/138, L03–L06 verdes; uma execução da baseline 42/43 com falha de subteste
não identificada, registrada sem maquiagem). Regressões completas verdes no
mesmo SHA. Relatório: [ENTREGA-L07-MATRIZ.md](ENTREGA-L07-MATRIZ.md).
**Aceite humano de Marcelo/Andreia pendente para todos os FIN/ADM; o L07 não
está concluído e o L08 não foi iniciado.** Faltam para concluir o L07: aceite
humano nas jornadas, destino declarado da dívida dos 80 órfãos de `/admin/ti`,
investigação/aceite das instabilidades de ambiente e execução em Windows (ver
matriz §7).

## Atualização anterior — jornadas FIN-14/15/16 (2026-10-02)

As abas **Exportações**, **Fechamento** e **Comissões** foram entregues em `/admin/financeiro`, usando os handlers integrados e a migração aditiva 137 para idempotência concorrente e trava de lançamentos em competência fechada. Download limitado, autoria da reabertura e bloqueio de pagamento automático são decididos no servidor; falhas de leitura têm retry e ações só confirmam após persistência. Gate L07: 37/37 em duas execuções consecutivas; demais gates e regressões L03–L06 verdes no mesmo SHA. FIN-14/15/16 passam a `pronto_local` apenas na validação automática; aceite humano pendente. Relatório: [ENTREGA-L07-FIN14-15-16.md](ENTREGA-L07-FIN14-15-16.md). **L07 não está concluído**: ADM-01..12/painel Marcelo é a próxima fatia, ainda não iniciada; L08 não foi iniciado.


**Data de início:** 2026-10-01
**Base histórica da primeira fatia:** `main` @ `c42164cd146bd2c68737c0c6228ccc208c4c52a7` (merge da PR #42, fechamento do L06).
**Base integrada atual:** `main`/`origin/main` @ `588b48f12b85fd07e2ca575e56f9b11ba97a1d67` (merge da PR #46, workflow L07 verde no job `110246095200`).
**Branch de sessão atual:** `arena/01a0f77c-gruposegsystemseguranca`.

> L07 é o mesmo terreno do L06: **não é greenfield**. O schema (migrações 077–080 FIN, 081–082 ADM) e as APIs (`fin-api`, `fin-management-api`, `fin-advanced-api`, `fin-budget-api`, `adm-api`, `adm-advanced-api`, `commission-api`, `cost-parameter-api`, `budget-api`, `cli-finance-api`) já existem da fase de layout. Os 28 itens da matriz (`FIN-01..16`, `ADM-01..12`) estão `a_revalidar`: ninguém jamais provou essas jornadas por execução. Esta entrega conduz o L07 em **fatias verificáveis**; cada fatia fecha o gate verde. Merge de PR só com autorização explícita do usuário.

## Atualização anterior — revalidação FIN-09/FIN-11/FIN-12 e baixa FIN-12 → FIN-04 (2026-10-02)

A referência atual para esta fatia é `main`/`origin/main` `ffdf7fbb49832abe30930c355b3085d190a7861e`, na branch `arena/01a0fa11-gruposegsystemseguranca`. A migração **135** é aditiva: preserva 001–134, impede margem FIN-09 legada onde o cálculo canônico é incompleto e fecha a integridade entre cobrança sandbox, webhook, pagamento FIN-04 e estorno reversor.

O gate local `npm run test:l07-delivery:pg` terminou **31/31**: HTTP real, PostgreSQL descartável, sessão/cookie, Next e Chromium reais. Ele prova que FIN-09 não mascara leitura falha como lista vazia e declara margem incompleta; FIN-11 determina obrigação pela atividade, não emite nota real e permite retry de falha de leitura; FIN-12 recusa HMAC/payload divergente e replay concorrente (1 criação + 5 replays), cria a baixa FIN-04/histórico, atualiza o recebível e cria o reversor no estorno. `node scripts/qa-wave0-static.mjs` 5/5, `npm run typecheck`, `npm test` 196/196, `npm run build` (78 páginas) e `npm run test:migrations:pg` 135/135 em dois passes (clone/checksum negativo, 522 tabelas) também passaram.

FIN-09, FIN-11 e FIN-12 passam a `pronto_local` para validação automática. A [PR #69](https://github.com/berger33/gruposegsystemseguranca/pull/69) está aberta sem merge e recebeu 5/5 checks verdes (estático/smoke, FIN L07, contratos, CRM e operações). Nenhuma emissão, cobrança, Pix/boleto, PSP, banco, certificado ou mensagem real foi produzida. Aceite humano e Windows continuam pendentes; L07 ainda não está concluído e L08 não foi iniciado. Próximo recorte: FIN-10 e a avaliação seletiva de #47/#53.

## Atualização vigente — fatia FIN-10 + avaliação adaptativa #47/#53 (2026-10-02)

Base: `main`/`origin/main` `bd794dc99bfc12a7e8a811783bda1234aeb4fe6b` (merge da PR #69), branch Arena `arena/01a0fa9e-gruposegsystemseguranca`. A migração **136** (`136-fin10-fin05-policy-history-locks.sql`) é aditiva: preserva 001–135 e adiciona snapshot de alçada (`approval_limit_cents`/`authority_limit_cents`), `allow_self_approval` com segregação migrada da CHECK 079 para o state machine com governança ativa, índice único parcial de duplicidade natural pendente, trava estrita de exclusão de despesa e os endurecedores FIN-05/#47 (FKs RESTRICT + CHECK movimento–conta) na forma auditável aprovada nas fatias anteriores.

A API `src/server/fin-management-api.mjs` (rotas `/api/fin/expenses`, `/api/fin/expense-history`, `/api/fin/expense-authorities`) ganhou busca textual com escape, replay idempotente sob concorrência (mesma chave + mesmo conteúdo → 200, conteúdo diferente → 409), decisão exigindo motivo e derivando `approver_name` da identidade autenticada, e TI leitura-somente consistentemente. A UI `ExpenseWorkspace.tsx` ganhou estados `fin10-error`/`fin10-retry`, `fin10-empty`, `fin10-policy`, busca, histórico expansível e preenchimento em R$ pt-BR (`Intl.NumberFormat`). A avaliação seletiva de #47/#53 está registrada em [`docs/CONSOLIDACAO-L07-PRS-PENDENTES.md`](./CONSOLIDACAO-L07-PRS-PENDENTES.md) — nenhuma das duas foi integrada em bloco, nenhuma migração foi copiada, nenhuma PR de referência foi fechada.

O gate local `npm run test:l07-delivery:pg` terminou **35/35 em duas execuções consecutivas sem skips**, incluindo cobertura HTTP+SQL direto e a jornada Chromium completa de FIN-10 além das regressões homologadas FIN-01..16. `npm run test:migrations:pg` 136/136 (dois passes + clone/checksum negativo), `npm test` 196/196, typecheck, estático 5/5 e build também passaram — ver [`docs/EVIDENCIAS-ENTREGA-LOCAL.md`](./EVIDENCIAS-ENTREGA-LOCAL.md) para a tabela completa de evidências. FIN-10 passa a `pronto_local` apenas para a validação automática desta fatia; aceite humano, Windows, e qualquer emissão fiscal/PSP/Pix/boleto/banco/credencial real permanecem explicitamente fora. PR aberta sem merge, aguardando autorização. **L07 ainda não está concluído e L08 não foi iniciado.** Próximo recorte já documentado em [`docs/PROMPT-PROXIMA-SESSAO-L07-FIN14-16.md`](./PROMPT-PROXIMA-SESSAO-L07-FIN14-16.md): jornadas UI FIN-14/15/16.

## Resultado técnico local

### Fatia 1 — fundação do gate L07 e casos FIN-01..04 pela API canônica

**Sem migração nova.** O schema 077–082 existente cobre tudo o que a fatia exercita. Migrações 001–123 permanecem intactas.

#### Auditoria antes do código (o que a leitura provou)

- **Rotas canônicas `/api/fin/*` completas** (74 entradas fin, 32 adm no roteador), com autorização por sessão de staff + papel (`admin`/`ti`/`financeiro`; `comercial` somente leitura/criação de recebíveis) + same-origin, resolvendo `401`/`403`/`403 origin_forbidden` antes de qualquer escrita.
- **Idempotência real no banco**: `fin_accounts_receivable` tem `UNIQUE(contract_id, competence_date, contract_item_id, recurrence_id)`; `fin_accounts_payable` tem `UNIQUE(contract_id, competence_date, supplier_id, recurrence_id)`; `chk_paid_le_amount` impede saldo pago maior que o valor; `chk_estorno_requires_previous` impede estorno sem pagamento de origem; `fin_payment_history.reason` exige 10–1000 caracteres.
- **Lacunas confirmadas por leitura e execução** (corrigidas nesta fatia as três primeiras):
  1. `POST /api/fin/payments` aceitava `amount_cents` zero/negativo/não numérico e devolvia `500` (violação de CHECK) em vez de `400`; `account_type` fora do enum também chegava ao banco.
  2. Baixa sobre conta inexistente devolvia `500` por FK em vez de `404`.
  3. O fluxo de pagamento **nunca gravava `paid_at`** (somente o PATCH manual de status gravava): recebível ficava `recebido` sem data de liquidação; e estorno total deixava o status estagnado (`recebido` com saldo zero) porque o fallback preservava o status anterior.
  4. Aritmética de saldo misturava BIGINT textual do `node-pg` com número (`"40000" + 60000`), funcionando por coerção acidental de `Math.min/max` — o mesmo padrão de `||` latente que o L06 já caçou.
- **Lacunas conhecidas e deliberadamente adiadas para fatias seguintes** (documentadas, não ignoradas):
  - **Aliases históricos `/api/hr/fin-*`, `/api/admin/hr/fin-*`, `/api/crm/hr/fin-*` (e `adm-*`) passam pela borda de RH** (`authorizeLegacyHrRequest`) — a mesma família de bug do OPS-01. Os componentes de UI existentes (`FinClient`, `FinAdvancedClient` etc. em `src/app/admin/ti/`) chamam **exclusivamente** esses aliases e **não são importados por nenhuma página** (código morto): a jornada de tela financeira ainda não existe. Correção da borda + tela real + jornada Chromium = fatia seguinte.
  - Baixa/estorno **sem transação nem bloqueio concorrente** (`SELECT ... FOR UPDATE`): duas baixas simultâneas não ultrapassam o valor (CHECK do banco), mas podem perder atualização; falha no meio pode deixar pagamento sem espelho no saldo. Caso obrigatório 2 do gate (transação) fica para a fatia de hardening FIN-01..04.
  - **Estorno repetido do mesmo `previous_payment_id` não é rejeitado** e estorno não é limitado ao valor do pagamento de origem (caso obrigatório 2 do gate).
  - `auditLog` do módulo fin **engole erros** (`catch {}`): auditoria fora do ar não derruba a mutação (fail-closed do caso obrigatório 10 pendente).
  - `PATCH /api/fin/receivables` permite mudar status para `recebido` sem pagamento associado (com razão auditada, mas sem movimento).

#### O que a fatia entrega

- **`tests/l07-delivery.integration.test.mjs`** — gate L07 com 3 subtestes sobre HTTP real, PostgreSQL descartável e servidor `next dev` dedicado (`.next/integration-l07`, porta aleatória), login de staff pelo fluxo real (`provisionAndLoginStaff`):
  1. **FIN-01 + FIN-02**: recebível vinculado a contrato/competência/vencimento com protocolo `REC-FIN-*`, trilha inicial `Criação inicial` e auditoria; pagável com fornecedor/centro de custo/categoria e aprovação que registra aprovador+data com trilha; negativos padrão (anônimo 401, papel `rh` 403, same-origin 403, campos 400, vencimento<competência 400, fornecedor duplicado 409, aprovação sem razão 400).
  2. **FIN-03**: regra de recorrência com reajuste documentado; geração **antes** da aprovação negada (`rule_not_approved`); aprovação registra aprovador; geração aplica reajuste (100000→110000) e marca `last_generated_competence`; **segunda geração na mesma competência devolve 409 `already_generated` sem duplicar** (contagem = 1 no banco); regra suspensa negada com motivo; regra inativa negada; regra inexistente 404.
  3. **FIN-04**: baixa parcial deixa saldo (`parcial`, 40000/100000); baixa complementar conclui e **grava `paid_at`**; estorno devolve saldo com flag no histórico; **estorno total devolve a conta a `pendente` com `paid_at` limpo**; histórico imutável com a cadeia completa; valor zero/negativo `400`; estorno sem pagamento de origem `400`; baixa sobre conta inexistente `404` sem pagamento órfão; `comercial` não dá baixa (403); cross-origin 403; auditoria de estorno registrada.
- **`scripts/qa-l07-delivery-postgres.mjs`** — mesmo contrato dos gates L04–L06: PostgreSQL embutido descartável (`seg_qa_l07`), migrações completas antes do teste, recusa `DATABASE_URL` de chamador, limpeza do diretório temporário.
- **`package.json`** — script `test:l07-delivery:pg`.
- **`.github/workflows/l07-delivery.yml`** — workflow "L07 Finance delivery" (job `finance-postgres-browser`, grupo de concorrência `delivery-<PR>`, path filters espelhados dos demais gates).
- **`src/server/fin-api.mjs`** — correções cirúrgicas em `handlePayments` (POST): validação de entrada (valor numérico positivo, `account_type` no enum, conta existe → 404), aritmética de saldo com números explícitos, `paid_at` gravado na liquidação e limpo fora dela, status coerente após estorno total (`pendente`).

#### Evidência de execução (local, PostgreSQL descartável)

- `npm run test:l07-delivery:pg` — **3/3, duas rodadas seguidas, exit 0** (HTTP real + migrações 001–123 aplicadas no cluster descartável).
- Regressão da fatia: `npm run typecheck` ✓ · `node scripts/qa-wave0-static.mjs` 5/5 ✓ · `npm test` 196/196 ✓ · `npm run test:migrations:pg` 123/123 (517 tabelas) ✓ · `npm run build` ✓.
- Bateria baseline pré-fatia (antes de qualquer mudança): typecheck, estático 5/5, unitários 196/196, migrações 123/123, L04 20/20, L05 1/1, L06 9/9 — nada herdado quebrado.

#### Casos obrigatórios do gate L07 — cobertura atual

| Caso obrigatório (prompt L07) | Situação na fatia 1 |
|---|---|
| 1. Geração recorrente idempotente (FIN-01/03) | **Coberto** (subteste 2) |
| 2. Baixa parcial/estorno com transação, concorrência e estorno repetido rejeitado (FIN-04/05) | Parcial: parcial/estorno cobertos; **transação/concorrência/estorno repetido ficam para a próxima fatia** |
| 3. Compra aprovada gera obrigação com segregação (FIN-02/10) | Parcial: aprovação coberta; segregação solicitar/aprovar fica para FIN-10 |
| 4. Marcelo decide pelo painel (ADM-01..06) | Pendente (fatia 7) |
| 5. Webhook de gateway simulado (FIN-12) | Pendente (fatia 5) |
| 6. Fechamento de competência (FIN-14/15) | Pendente (fatia 6) |
| 7. Exportação com trilha (FIN-14) | Pendente (fatia 6) |
| 8. Comissão provisionada sobre recebimento (FIN-16) | Pendente (fatia 6) |
| 9. Jornada Chromium | Pendente — **não existe tela financeira**; a próxima fatia cria a tela e a jornada |
| 10. Fail-closed com auditoria fora do ar | Pendente (o `auditLog` do fin ainda engole erros) |

## Próximas fatias (planejadas, sujeitas à auditoria de cada uma)

- **Fatia 2 — FIN-01..04 endurecidos + tela**: transação e `FOR UPDATE` nas baixas, estorno repetido rejeitado e limitado ao pagamento de origem, `auditLog` fail-closed, isenção dos aliases `fin-*`/`adm-*` na borda de RH (padrão OPS-01), tela financeira real consumindo `/api/fin/*` canônico e jornada Chromium (casos 9 e 10 do gate).
- Fatias 3–8 conforme o prompt (`docs/PROMPT-CONTINUACAO-L07-FINANCEIRO-MARCELO.md`).

### Fatia 2 — implementação local de hardening e tela financeira

A implementação local da fatia 2 está no commit `b517fec`: `handlePayments` agora abre uma transação, bloqueia a conta com `FOR UPDATE`, rejeita sobre-pagamento com `409 overpayment`, valida origem/conta e repetição de estorno (`409 estorno_already_exists`), e grava a auditoria pelo mesmo cliente antes do commit. A borda de RH isenta aliases `ops-*`, `fin-*` e `adm-*`; a página `/admin/financeiro` foi criada com as abas Recebíveis, Recorrência e Pagamentos, estados de erro/carregamento/vazio e chamadas exclusivamente canônicas `/api/fin/*`.

Evidência executada após a mudança: `npm run typecheck` passou; `node scripts/qa-wave0-static.mjs` passou 5/5; `npm run test:migrations:pg` passou 123/123 e 517 tabelas (checksum negativo 006 esperado); `npm test` passou 196/196; `npm run test:l07-delivery:pg` passou 3/3; `npm run test:l06-delivery:pg` passou 9/9. A segunda rodada Chromium/fail-closed específica da fatia 2 ainda não foi adicionada; por isso FIN-01..04 permanecem `a_revalidar` na matriz e esta PR não deve ser considerada concluída.

### Fechamento da fatia 2 — FIN-01..04 endurecidos e navegador real

O gate foi ampliado de 3 para **6 subtestes reais**. Duas requisições HTTP concorrentes sobre a mesma conta comprovam o bloqueio `FOR UPDATE`, ausência de perda de atualização e rejeição `409 overpayment`, sem pagamento órfão. O gate também comprova que sobre-pagamento não cria pagamento, histórico ou auditoria; que um segundo estorno da mesma origem devolve `409 estorno_already_exists`; e que estorno acima da origem ou em conta diferente devolve `400` sem efeito parcial.

A indisponibilidade de `audit_log` é criada e restaurada em `finally`: a baixa retorna `503 audit_unavailable` e a transação reverte pagamento, saldo, status e histórico. `handleGenerateRecurring` também passou a bloquear a regra e executar geração, atualização da recorrência, histórico e auditoria no mesmo cliente/transação, com rollback e `503` em falha de auditoria. A tela deixou de inventar UUID e exige uma conta de cliente explícita e visível para geração.

A jornada usa Chromium empacotado real, login real de staff financeiro, cookie de sessão real, Next real e PostgreSQL descartável. Pela tela `/admin/financeiro`, cria e aprova regra, gera cobrança, prova o erro 409 na repetição e a ausência de duplicata; depois seleciona recebível, dá baixa parcial, confere saldo/status/histórico e realiza estorno com motivo válido.

Evidência desta sessão: pré-voo completo verde; `npm run typecheck`; estático **5/5**; migrações **123/123 e 517 tabelas** (mismatch negativo da 006 esperado); unitários **196/196**; L07 **6/6**; L06 **9/9**; build exit 0. A regressão final registra duas rodadas L07 consecutivas abaixo. Commit: commit da branch desta sessão (registrado no histórico Git/PR).

Tabela atualizada dos casos 1–10: (1) coberto; (2) coberto para FIN-04, sem antecipar FIN-05; (3) cobertura FIN-02 desta fatia preservada, segregação FIN-10 pendente; (4) pendente ADM; (5) pendente FIN-12; (6) pendente FIN-14/15; (7) pendente FIN-14; (8) pendente FIN-16; (9) coberto por Chromium real; (10) coberto por auditoria indisponível com rollback. FIN-05..16 e ADM-01..12 não foram iniciados.

### Estabilização pós-merge da fatia 2 — 2026-10-01

**Base auditada:** `main` e `origin/main` em `ab98356b571f6f8deae03486d1b904b16fd0a1d3` (merge da PR #45). O checkout raso disponibilizou o merge, mas não o seu pai `c4f8f5a`; o SHA de cabeça da PR #45 foi confirmado pelo GitHub como `c4f8f5aae663cd02a7d6ac64865f436016be26d8`.

#### Check vermelho da PR #45

A execução `36821183125`, job `110237090033`, falhou na etapa **L07 real HTTP, disposable PostgreSQL and Chromium**. Foram tentados `gh run view --log-failed`, o endpoint de logs do job e as anotações do check. Os dois downloads de log retornaram `EOF`; as anotações expõem somente o exit 1, sem stack ou subteste. Portanto, **a causa histórica não pôde ser recuperada e não é atribuída a um motivo especulativo**.

A comparação possível foi feita por evidência disponível: o workflow seleciona Node 22; este checkout executou Node `v22.22.3`, aceito por `@sparticuz/chromium@153.0.0` (`^22.17.0 || >=24.0.0`). O aviso do Actions sobre Node 20/24 diz respeito ao runtime interno das actions de checkout/setup, não ao Node 22 configurado para os comandos. A jornada continua com `@sparticuz/chromium`, `executablePath()` real, Playwright real, login/cookie reais, o cabeçalho `Origin` same-origin, Next e PostgreSQL descartáveis. Como hardening determinístico, o lançamento passou a remover o argumento amplo `--disable-web-security` (padrão já usado pelos gates L05/L06), e o runner remove `.next/integration-l07` antes e depois de cada execução. Não há alegação de que essas mudanças expliquem a falha cujo log não foi recuperável.

#### Transações revisadas e alterações

- `handleReceivables` (POST e PATCH) e `handlePayables` (POST e PATCH) deixaram de dispersar escrita, histórico, atualização de recorrência e auditoria em `pool.query` independentes. Cada mutação agora abre `pool.connect()`, usa o mesmo cliente em `BEGIN`, executa a escrita de negócio, histórico imutável, atualização da regra quando aplicável e `auditLog({ client })`, faz `COMMIT` somente depois da auditoria, faz `ROLLBACK` em qualquer erro e libera o cliente em `finally`.
- Os dois handlers agora devolvem `503 {"error":"audit_unavailable"}` quando `audit_log` está indisponível. A aprovação de pagável também ganha entrada de histórico imutável na mesma transação da aprovação/auditoria.
- `handleGenerateRecurring` e `handlePayments` foram revisados: já mantêm respectivamente recebível + `last_generated_competence` + histórico + auditoria, e pagamento/estorno + saldo/status + histórico + auditoria, no mesmo cliente transacional; preservam `FOR UPDATE`, os negativos de sobre-pagamento e de estorno e o rollback fail-closed.
- Naquela sessão não houve mudança de schema nem migration 124; FIN-05..16 e ADM-01..12 ainda não haviam sido iniciados.

#### Gate, Chromium e regressões executadas

Os seis subtestes foram preservados. O subteste de auditoria indisponível agora cobre por HTTP real e PostgreSQL real: criação de recebível, criação de pagável, geração recorrente e baixa. Ele renomeia `audit_log`, exige 503 para cada mutação e, após a restauração garantida por `finally`, prova ausência de recebível/pagável/histórico inicial, ausência de cobrança/histórico gerados e `last_generated_competence` inalterado. O ruído `relation "audit_log" does not exist` na janela de teste é esperado.

A jornada Chromium permanece com **um browser para o subteste**, conta e regra identificadas pelo próprio subteste, polling de estado final e sem mocks. Ela comprovou renderização do workspace, criação/aprovação/geração da regra, duplicidade 409 visível, exatamente uma linha gerada, seleção do recebível, baixa parcial, saldo/status parcial, estorno com razão válida, estado/histórico posterior e tabela de pagamentos visível.

Resultados reais desta sessão, somente com dados sintéticos e PostgreSQL descartável:

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `npm run test:migrations:pg` | 123/123; 517 tabelas; cenário negativo de checksum da 006 esperado |
| `npm test` | 196/196 |
| `npm run test:l07-delivery:pg` | 6/6 em **duas rodadas consecutivas** após limpeza de `.next/integration-l07` |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run build` | exit 0 |

A PR nova é a **#46**; o commit de código da sessão é `f4354d9` (`fix: fecha transacoes restantes do L07`). O workflow novo **L07 Finance delivery** passou: [run 36822878630, job 110242735739](https://github.com/berger33/gruposegsystemseguranca/actions/runs/36822878630/job/110242735739), conclusão `success` (39 s). A PR permanece aberta e não foi feito merge.

**Limitações honestas:** não foi possível recuperar a causa específica da falha antiga; a execução verde nova é a evidência disponível. A entrega usa exclusivamente ambiente descartável/sintético, não integra gateway, cobrança, banco ou credenciais de produção. Os módulos FIN-05..16 e ADM-01..12 continuam fora daquele trabalho histórico.

### Continuação atual — FIN-05

A entrega desta sessão está registrada em [`docs/ENTREGA-L07-FIN05.md`](./ENTREGA-L07-FIN05.md): FIN-05 foi fechado localmente com API transacional/fail-closed, migração 124, aba de conciliação no workspace financeiro e dois subtestes adicionais do gate L07. O gate final passou **8/8 em duas execuções consecutivas**. FIN-06..16 e ADM-01..12 permanecem fora do escopo.

### Continuação atual — FIN-06

**Base confirmada:** `origin/main` em `9de7c5ac6dea9b6822e3e4050519ff4048432f77` (merge da PR #48, que entregou FIN-05). Sessão `arena/01a0f795-gruposegsystemseguranca`, nova e distinta da sessão anterior (`arena/01a0f77c-...`).

A entrega desta sessão está registrada em [`docs/ENTREGA-L07-FIN06.md`](./ENTREGA-L07-FIN06.md): FIN-06 (cobrança com responsável, lembretes, histórico e política aprovada) foi auditado, endurecido e fechado localmente. A implementação anterior (migration 078) já tinha tabelas e rotas de rascunho, mas a auditoria não era transacional/fail-closed, não havia validação server-side de UUIDs/papéis consistente com FIN-01..05, a política não tinha campos estruturados de tipo de lembrete/dias antes/escalonamento, e o histórico não tinha uma garantia de banco contra bloqueio automático de portal. Essa implementação antiga foi reescrita (não apenas mantida) com o mesmo padrão transacional usado em FIN-01..05. Migração aditiva `125-fin06-collection-hardening.sql`, aba **Cobrança** no workspace financeiro (`CollectionWorkspace.tsx`) e dois subtestes adicionais do gate L07 (HTTP real + Chromium). O gate final passou **10/10 em duas execuções consecutivas**. FIN-07..16 e ADM-01..12 permanecem fora do escopo.

### Continuação atual — ADM-01..12 (painel funcional do Marcelo)

**Base confirmada:** `main` em `ad8668b09f757da60e1486e52e57a9df4f39aae6`
(merge da PR #73), reconfirmada por baseline verde em worktree do próprio
commit base antes de qualquer edição (gate L07 37/37 em duas execuções
consecutivas, estático 5/5, typecheck 0, unitários 196/196, migrações exit 0).
Sessão `arena/01a0fd08-gruposegsystemseguranca`.

A entrega está registrada em [`docs/ENTREGA-L07-ADM01-12.md`](./ENTREGA-L07-ADM01-12.md):
`/admin/marcelo` deixou de ser protótipo descritivo e passou a painel funcional
com doze indicadores calculados de registros canônicos (fonte, período e
data-base visíveis), drill-down de cada cartão até o registro real preservando
autorização, decisão unificada ADM-06 com alçada/segregação/idempotência e
auditoria fail-closed (503 com rollback), espaço de trabalho por identidade,
relatórios limitados e auditados, configurações versionadas, meta separada do
realizado, diário CON-11 por permissão e análises de expansão. Migração aditiva
`138-adm01-12-painel-marcelo-decisoes-escopo.sql`, API
`src/server/adm-panel-api.mjs` (11 rotas `/api/adm/panel/*`) e UI
`src/app/admin/marcelo/MarceloPanel.tsx`. O gate L07 foi de 37 para **43
subtestes**. Os componentes órfãos de `/admin/ti` foram inventariados por prova
em [`docs/INVENTARIO-ADMIN-TI.md`](./INVENTARIO-ADMIN-TI.md): 0 promovidos,
2 adaptados, 80 como dívida explícita. ADM-01..12 passam a `pronto_local` com
**aceite humano pendente**; L07 **não** está declarado concluído e L08 não foi
iniciado.
