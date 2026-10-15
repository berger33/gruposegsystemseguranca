# UX-PRO-07F-1 — datas e fuso em `/admin/financeiro` — escopo ANTES do código

Data: 2026-10-15 (documento escrito antes de qualquer edição de código desta fatia).
Branch da sessão: `arena/c544b76f-gruposegsystemseguranca` (branch pinado do Arena; nenhum outro branch foi criado, trocado ou recebido push).
Base conferida: `origin/main` = `12fe34e591d4272f3ccb5753fe28671896b7c0da` (merge do PR #233, fim da 07E-2) e `HEAD` = o mesmo SHA; `git rev-list --left-right --count origin/main...HEAD` = `0 0`; árvore limpa (`git status --porcelain` vazio).

## 1. Situação herdada e reconferência das PRs

- `gh pr list --state open` → somente a **#230** (`UX-PRO-07D-1`, `arena/fde056de-…`, `OPEN`, `mergeable: CONFLICTING`). Nada foi reaplicado, fechado, reaberto ou alterado nela.
- **#228** (`UX-PRO-07C-2`) conferida como `CLOSED`; não foi reaberta.
- Não existe PR aberta desta fatia (07F-1) e nada desta fatia havia sido enviado ao GitHub.
- Os 4 commits locais da tentativa anterior da 07F-1 citados na instrução de continuação **não existem neste workspace** e os artefatos de handover (`/home/user/UX-PRO-07F-1.bundle`, `/home/user/UX-PRO-07F-1.patch`) **não estão presentes**: a busca por `git log --all --oneline | grep -E '^(360bf8b|98d0ee7|a9f52eb|569f519)'`, por `git cat-file -t`, pelo reflog e por todo o sistema de arquivos (`find / -xdev -name 'UX-PRO-07F-1*'`) não encontrou nem os objetos nem os arquivos. Portanto esta fatia está sendo **refeita** aqui, pelo caminho da §4 da instrução, com documento de escopo antes do código.
- Repositório limpo: a bateria é executada do zero nesta sessão (`npm ci` → 81 pacotes, 0 vulnerabilidades).

## 2. Identificação da fatia como pendente (sem presumir achado novo)

O achado desta fatia já estava registrado como pendência em três lugares, sempre no recorte `/admin/financeiro`:

- `docs/UX-PRO-07E-1-RELATORIO-2026-10-15.md:16,17` — entre os achados E2–E9 do plano mestre para `/admin/financeiro` consta "datas/fuso"; o mesmo relatório registra os achados transversais herdados do PR #229 (dentre eles "datas/fuso").
- `docs/UX-PRO-07E-2-RELATORIO-2026-10-15.md:17` — repete o item "datas/fuso" como pendente, exigindo decisão de escopo explícita do owner.
- `docs/UX-PRO-07D-1-ESCOPO-ANTES-2026-10-15.md:120` — o achado **E3 — datas e horas** (`timestamptz` exibido por `String(...).slice(0, 16)` sem fuso e datas em ISO), que é o mesmo defeito em **outra rota** (`/admin/operacao`, com o texto ISO fixado em `tests/l06-delivery.integration.test.mjs:1149,:1160`). Rota diferente, fora do recorte desta fatia; **não** foi tocada aqui.

Esta fatia **não** escolheu sozinha o próximo achado: ela executa o recorte 07F-1 expressamente ordenado pelo owner na instrução desta sessão, e mantém fora tudo o que a instrução mantém fora (E2, E4–E9, transversais do PR #229, E3 de `/admin/operacao` e C11).

## 3. Mapa auditado por grep robusto (base `12fe34e`)

Padrões aplicados em `src/app/admin/financeiro/*.tsx` (`grep -nE`): `new Date(`, `toLocaleString(`, `toLocaleDateString(`, `toISOString(`, `Intl.DateTimeFormat`, `slice(0,10)`, `slice(0, 10)`, `slice(0,7)`, `slice(0, 7)`, `slice(0,16)`, `slice(0, 16)`, `split("T")` — **mais** varredura de todos os campos `*_date` / `*_at` no diretório (o grep de padrões é piso, não teto).

Resultado: **20 exibições de data/hora em 17 linhas de 9 arquivos**.

| # | Arquivo | Linha | Antes (base) | Depois | Testid da superfície |
| --- | --- | --- | --- | --- | --- |
| 1 | `FinanceiroWorkspace.tsx` | 500 | `{String(rule.start_date).slice(0, 10)}` | `{financeDate(rule.start_date)}` | `finance-rule-<id>` |
| 2-3 | `FinanceiroWorkspace.tsx` | 631 | `{String(item.period_start)} a {String(item.period_end)}` | `{financeDate(item.period_start)} a {financeDate(item.period_end)}` | `finance-f03-reports` |
| 4-5 | `BudgetWorkspace.tsx` | 356 | `{String(selected.period_start).slice(0, 10)} a {String(selected.period_end).slice(0, 10)}` | `{financeDate(selected.period_start)} a {financeDate(selected.period_end)}` | `fin13-detail-status` |
| 6 | `BudgetWorkspace.tsx` | 412 | `{new Date(entry.changed_at).toLocaleString("pt-BR")}` | `{financeDateTime(entry.changed_at)}` | `fin13-history-list` |
| 7 | `CashflowWorkspace.tsx` | 196 | `{String(snapshot.competence_date).slice(0, 10)}` | `{financeDate(snapshot.competence_date)}` | `fin07-snapshots` |
| 8 | `CashflowWorkspace.tsx` | 215 | `{String(item.competence_date).slice(0, 10)}` | `{financeDate(item.competence_date)}` | `fin07-aging` |
| 9 | `ClosureWorkspace.tsx` | 18 | `${d.closure.competence_date.slice(0,7)}` | `${financeMonth(d.closure.competence_date)}` | `fin15-notice` |
| 10 | `ClosureWorkspace.tsx` | 23 | `{x.competence_date.slice(0,7)}` (opção do `select`) | `{financeMonth(x.competence_date)}` | `fin15-select` |
| 11 | `ClosureWorkspace.tsx` | 24 | `{selected.competence_date.slice(0,7)}` (detalhe) | `{financeMonth(selected.competence_date)}` | `fin15-detail` |
| 12 | `CommissionWorkspace.tsx` | 25 | `{x.provision_date.slice(0,10)}` (opção do `select`) | `{financeDate(x.provision_date)}` | `fin16-select` |
| 13 | `CommissionWorkspace.tsx` | 26 | `{selected.reviewed_at && new Date(selected.reviewed_at).toLocaleString("pt-BR")}` | `{selected.reviewed_at && financeDateTime(selected.reviewed_at)}` | `fin16-review-audit` |
| 14 | `CostAllocationWorkspace.tsx` | 98 | `{String(item.competence_date).slice(0,10)}` | `{financeDate(item.competence_date)}` | `fin08-imports` |
| 15 | `CostAllocationWorkspace.tsx` | 117 | `{String(cost.competence_date).slice(0,10)}` | `{financeDate(cost.competence_date)}` | `fin08-costs` |
| 16-17 | `ExportWorkspace.tsx` | 33 | `{selected.period_start.slice(0,10)} a {selected.period_end.slice(0,10)}` | `{financeDate(selected.period_start)} a {financeDate(selected.period_end)}` | `fin14-detail` |
| 18 | `ExportWorkspace.tsx` | 34 | `{new Date(x.created_at).toLocaleString("pt-BR")}` | `{financeDateTime(x.created_at)}` | `fin14-log-list` |
| 19 | `BankReconciliationWorkspace.tsx` | 272 | `{transaction.transaction_date}` | `{financeDate(transaction.transaction_date)}` | `fin05-transactions` |
| 20 | `ManagementResultsWorkspace.tsx` | 84 | `{r.competence_date}` | `{financeDate(r.competence_date)}` | `fin09-result-<id>` |

Cinco arquivos do diretório **não exibem data alguma** e por isso não aparecem no mapa: `CollectionWorkspace.tsx` (o campo `sent_at` existe no tipo mas não é renderizado), `ExpenseWorkspace.tsx`, `FiscalWorkspace.tsx`, `GatewayWorkspace.tsx` e `page.tsx` (reexporta o painel). `FinanceiroWorkspace.tsx` é o painel próprio e hospeda 3 das 20 exibições.

### 3.1 Tipos conferidos no banco (as colunas são `DATE` **ou** `TIMESTAMPTZ`)

| Coluna exibida | Migração | Tipo |
| --- | --- | --- |
| `fin_recurrence_rules.start_date` | `db/migrations/077-…:43` | `DATE` |
| `fin_budgets.period_start` / `period_end` | `db/migrations/080-…:20,21` | `DATE` |
| `fin_exports.period_start` / `period_end` | `db/migrations/080-…:67,68` | `DATE` |
| `fin_competence_closures.competence_date` | `db/migrations/080-…:102` | `DATE` |
| `fin_commission_provisions.provision_date` | `db/migrations/080-…:145` | `DATE` |
| `fin_budget_history.changed_at` | `db/migrations/132-…:5` | `TIMESTAMPTZ` |
| `fin_commission_provisions.reviewed_at` | `db/migrations/080-…:151` | `TIMESTAMPTZ` |
| `fin_export_logs.created_at` | `db/migrations/080-…:89-95` | `TIMESTAMPTZ` |
| `fin_bank_transactions.transaction_date` | `db/migrations/078-…:34` | `DATE` |
| `fin_cost_imports` / `fin_costs` / `fin_aging_receivables` / `fin_cashflow_snapshots` `.competence_date` | `db/migrations/078-…:124,146,162,178` | `DATE` |
| `fin_management_results.competence_date` | `db/migrations/079-…:25` | `DATE` |
| `fin_f03_reports.period_start` / `period_end` | `db/migrations/159-f03-…:27,28` | `DATE` |

Ou seja: **17 das 20 exibições são datas de calendário (`DATE`)** e exatamente **3 são carimbos (`TIMESTAMPTZ`)** — `BudgetWorkspace.tsx:412`, `CommissionWorkspace.tsx:26` e `ExportWorkspace.tsx:34`. Os dois casos são defeitos diferentes e recebem tratamento diferente:

- `DATE` exibido em ISO cru (`2037-01-15`, `2037-01`, `2037-01-15T00:00:00.000Z` depois da serialização JSON) — ilegível para quem opera, e a fatia anterior (`slice(0, 10)`) dependia de a serialização começar pela data;
- `TIMESTAMPTZ` renderizado por `new Date(v).toLocaleString("pt-BR")` **sem `timeZone`** — o texto muda conforme o fuso da máquina que renderiza; o mesmo registro aparece com horas diferentes para pessoas diferentes, e a tela não declara fuso nenhum.

## 4. Regra decidida

**Arquivo novo de tela** `src/lib/finance-dates.mjs` (+ `src/lib/finance-dates.d.mts` com as declarações), com **três funções puras e duas constantes**:

1. `financeDate(v)` — ausente (`null`/`undefined`/`''`/só espaços) → constante `FINANCE_DATE_ABSENT` = `'Não informada'`; se o texto casar `^(\d{4})-(\d{2})-(\d{2})` → `DD/MM/AAAA` montado **dos dígitos capturados** (sem `Intl`, sem `new Date`); qualquer outro texto → **devolvido cru** (nada é inventado).
2. `financeMonth(v)` — mesma regra sobre `^(\d{4})-(\d{2})` → `MM/AAAA`.
3. `financeDateTime(v)` — ausente → constante `FINANCE_DATE_TIME_ABSENT` = `'Não informado'`; se `new Date(v)` for inválido → texto cru; senão `DD/MM/AAAA HH:mm UTC` por `Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', hourCycle: 'h23', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })` mais o sufixo literal `' UTC'`.

Por que este arquivo é de tela e **não** entra em `src/lib/finance-vocabulary.mjs`: o vocabulário canônico traduz apenas códigos que os servidores financeiros devolvem, com teste anti-deriva próprio (`tests/ux-finance-vocabulary.test.mjs`, 10 casos). Formatação de data é decisão de apresentação desta rota, exatamente como o descritor de diagnóstico de tela em `src/lib/finance-request.ts:60-80` (mesma decisão registrada lá). **`finance-vocabulary.mjs` não é alterado nesta fatia.**

Por que **UTC declarado** para os carimbos: é a convenção vigente do repositório — `timeZone: 'UTC'` em `analytics-vocabulary.mjs:219,228`, `compliance-vocabulary.mjs:306,315`, `expansion-vocabulary.mjs:469,478`, `fleet-vocabulary.mjs:274,283`, `knowledge-vocabulary.mjs:163,171`, `quality-vocabulary.mjs:231,240`, `satisfaction-vocabulary.mjs:262,271`, `third-party-vocabulary.mjs:330,339` e nos auxiliares `honestDate`/`honestDateTime` (`bidding-vocabulary.mjs:100`, `continuity-vocabulary.mjs:44`, `intel-vocabulary.mjs:54`, `supplier-vocabulary.mjs:25`), além de `src/app/cliente/app/renovacao/page.tsx:80`. Com fuso declarado no próprio texto, o carimbo deixa de depender da máquina.

Por que **não** usar `Intl` nem `new Date` nas datas de calendário: `DATE` não tem fuso; converter para instante e voltar é justamente o que desloca um dia. Montar `DD/MM/AAAA` dos dígitos é determinístico em qualquer fuso e em qualquer locale. **Decisão explícita desta fatia: nenhum "horário de Brasília" é introduzido** — a convenção não está ratificada no repositório (`docs/PLANO-MESTRE-IMPLEMENTACAO.md:84` fala de "fuso operacional explícito, inicialmente America/Sao_Paulo configurável", que é decisão de produto ainda não tomada) e inventá-la seria inventar regra.

## 5. Fora do recorte (não misturar)

- Os 19 `<input type="date">` da rota (entrada, não exibição).
- `CashflowWorkspace.tsx:162` (`due_date: selected?.due_date?.slice(0, 10)` — preenchimento de formulário a partir do registro) e `CostAllocationWorkspace.tsx:76` (`competence_date: …slice(0,10)` — idem).
- `FinanceiroWorkspace.tsx:237` (`const date = rule.start_date.slice(0, 10)` — corpo de `POST /api/fin/generate-recurring`): **payload não muda** nesta fatia.
- `BudgetWorkspace.tsx:218` e `ExpenseWorkspace.tsx:119` (`Date.now()` usado em chave/identificador, não em exibição).
- `ManagementResultsWorkspace.tsx:16` (`toLocaleString` de percentual, não de data).
- `src/lib/finance-vocabulary.mjs` e `tests/ux-finance-vocabulary.test.mjs`.
- **E3 de `/admin/operacao`** (`OperacaoWorkspace.tsx` com `String(...).slice(0, 16)` e o texto ISO fixado em `tests/l06-delivery.integration.test.mjs:1149,:1160`): rota diferente; exige decisão e subfatia próprias.
- E2, E4–E9 do plano mestre, achados transversais do PR #229 e C11.
- Métodos, URLs, corpos, cabeçalhos, permissões, idempotência, auditoria, migrações e servidor: **nenhuma mudança**. Nenhuma `Idempotency-Key` é criada ou alterada.

## 6. Plano de execução (nesta ordem)

1. **Escopo** — este documento (commit `docs(UX-PRO-07F-1): …`), antes de qualquer código.
2. **Gate aditivo** — acrescentar 10 casos (35–44) ao fim de `tests/ux-finance-workspace.integration.test.mjs` (prefixo herdado de 1340 linhas / 76.468 bytes / SHA-256 `e9fc84369f227c5308e240ca92dc21262c14c59c5648689457157d820e98c487` mantido byte a byte e reconferido antes/depois), criar `tests/ux-finance-dates.test.mjs` (6 casos puros), `scripts/qa-ux-pro-07f1-postgres.mjs` (cópia independente do runner 07E-2, `MINIMUM_CASES = 44`, banco descartável `seg_qa_ux_finance_07f1`, auditoria TAP) e `.github/workflows/ux-pro-07f1-delivery.yml` com `paths:` preciso; somar o teste novo a `test:unit`.
3. **Baseline** — guardar a implementação anterior em `/tmp`, rodar o gate novo contra ela no diretório próprio `docs/ux-pro-07-financeiro-evidencias/antes-07f-1/` e restaurar a implementação; nenhuma asserção herdada é tocada para "fazer passar".
4. **Correção** — `src/lib/finance-dates.mjs`, `src/lib/finance-dates.d.mts` e as 17 linhas dos 9 arquivos de tela.
5. **Duas execuções finais independentes** do gate focal (`execucao-1` com capturas e `execucao-2` sem diretório de evidência, como no CI).
6. **CSVs** regenerados somente por `node scripts/ux-pro-00-inventory.mjs`, com prova campo a campo do diff (1 linha por arquivo, só `/admin/financeiro`).
7. **Bateria completa** e **relatório** `docs/UX-PRO-07F-1-RELATORIO-2026-10-15.md`.

## 7. Declarações

- Esta fatia **não conclui o UX-PRO-07**; ela fecha somente o recorte das 20 exibições de data/hora de `/admin/financeiro` descrito nas seções 3 e 4.
- O programa UX-PRO-07 só pode ser declarado concluído quando existir `docs/UX-PRO-07-CONSOLIDACAO-<data>.md` e os checks estiverem verdes em `main` após todas as fatias.
- Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu.
- As medições automatizadas não equivalem a auditoria WCAG completa.
- Arquivos protegidos reconferidos nesta base: `next-env.d.ts` `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2` e `tsconfig.json` `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.
