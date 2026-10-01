# Entrega L07 — financeiro e Marcelo (fatias em andamento)

**Data de início:** 2026-10-01
**Base integrada:** `main` @ `c42164cd146bd2c68737c0c6228ccc208c4c52a7` (merge da PR #42, fechamento do L06).
**Branch de sessão:** `arena/01a0f487-gruposegsystemseguranca`.

> L07 é o mesmo terreno do L06: **não é greenfield**. O schema (migrações 077–080 FIN, 081–082 ADM) e as APIs (`fin-api`, `fin-management-api`, `fin-advanced-api`, `fin-budget-api`, `adm-api`, `adm-advanced-api`, `commission-api`, `cost-parameter-api`, `budget-api`, `cli-finance-api`) já existem da fase de layout. Os 28 itens da matriz (`FIN-01..16`, `ADM-01..12`) estão `a_revalidar`: ninguém jamais provou essas jornadas por execução. Esta entrega conduz o L07 em **fatias verificáveis**; cada fatia fecha o gate verde. Merge de PR só com autorização explícita do usuário.

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
