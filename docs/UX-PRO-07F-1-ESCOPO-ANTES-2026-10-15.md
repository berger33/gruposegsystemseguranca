# UX-PRO-07F-1 — datas e fuso em `/admin/financeiro`

**Data:** 15/10/2026

**Status deste documento:** registro anterior à implementação. Nenhuma tela, API, regra de autorização, gate ou CSV foi alterado para produzi-lo.

## 1. Base efetivamente conferida

- Branch fixada da sessão: `arena/22f1ab37-gruposegsystemseguranca`. Nenhuma troca de branch; nenhum stash, commit ou conteúdo de sessão anterior foi reaplicado.
- `HEAD` local == `origin/main` == `12fe34e591d4272f3ccb5753fe28671896b7c0da` (merge da PR #233, 07E-2), divergência **0/0** após `git fetch --prune origin`. Árvore de trabalho limpa.
- Worktree único: `/home/user/gruposegsystemseguranca`.
- PRs na conferência: **nenhuma PR desta fatia existe**; **#230** (`arena/fde056de-gruposegsystemseguranca`, 07D-1 antiga de `/admin/operacao`) segue `OPEN`/`CONFLICTING` e **não foi fechada, reaberta, alterada nem teve conteúdo reaplicado**; **#228** segue `CLOSED` (redundante com a #227) e **não foi reaberta**. #233 (`MERGED`) é o topo da `main`.
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2` (igual ao registrado).
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65` (igual ao registrado).
- `docs/ux-pro-07-financeiro-evidencias/resumo.json`: `78a213281c64a08d99ab2e53b962ea43d5fc0d36703f7436e9cffb01460d689c` (igual ao registrado).
- Prefixos herdados do gate confirmados **antes** de qualquer edição de teste: `tests/ux-finance-workspace.integration.test.mjs` tem **1.340 linhas / 76.468 bytes / 34 casos `test(` / SHA-256 `e9fc84369f227c5308e240ca92dc21262c14c59c5648689457157d820e98c487`**; o prefixo interno da 07E-2 (858 linhas / 45.438 bytes / `21c4f686f343bdea9f8dc972dc931edbd77320b912fb93166661af35df889884`) e o da 07E-1 (347 linhas / 17.004 bytes / `42dc4da39b583445e338c9fb7d8586d43c6b1a9bc8745768b4290280f7e8ec74`) seguem íntegros dentro dele.

**Observação de proveniência (registrada antes do código):** os quatro commits locais da tentativa anterior desta mesma fatia (`569f519`, `a9f52eb`, `98d0ee7`, `360bf8b`) e os três artefatos de handover (`/home/user/UX-PRO-07F-1.bundle`, `/home/user/UX-PRO-07F-1.patch`, `/home/user/PROMPT-CONTINUACAO-UX-PRO-07F-1.md`) **não existem neste workspace**: `git cat-file` não resolve os quatro hashes, `git fsck` não encontrou objeto solto e os três arquivos não estão em `/home/user`. Por isso esta fatia foi **refeita pelo caminho do §4** do prompt de continuidade (documento de escopo antes do código, mapa auditado por grep, gate aditivo, baseline próprio). Consequência declarada com honestidade: o bloco NOVO do gate desta reconstrução tem conteúdo próprio e, portanto, **seu SHA-256 não é o `2c108f7833457e69…` citado naquele handover**; o hash efetivamente produzido fica registrado no relatório desta fatia para servir de prefixo herdado à próxima sessão. Os dois prefixos herdados que o §6.3 exige preservar (07E-1 e 07E-2) estão confirmados acima, byte a byte.

Foram relidos antes desta definição: `AGENTS.md`, `README.md`, `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md` (seção `UX-PRO-07`), `docs/UX-PRO-07E-1-RELATORIO-2026-10-15.md`, `docs/UX-PRO-07E-2-RELATORIO-2026-10-15.md`, `docs/UX-PRO-07E-1-ESCOPO-ANTES-2026-10-15.md` e `docs/UX-PRO-07E-2-ESCOPO-ANTES-2026-10-15.md`.

## 2. Identificação da fatia realmente pendente

O recorte «datas e fuso em `/admin/financeiro`» está citado como pendência aberta em três lugares do `main` atual, **sem fatia própria atribuída**:

- `docs/UX-PRO-07E-1-RELATORIO-2026-10-15.md:16-17` — «datas/fuso» entre os achados do plano mestre para `/admin/financeiro` que continuam pendentes.
- `docs/UX-PRO-07E-2-RELATORIO-2026-10-15.md:17` — mesma pendência, repetida após o fechamento da classe D1.
- `docs/UX-PRO-07D-1-ESCOPO-ANTES-2026-10-15.md:120` — o mesmo tema aparece como **E3 de `/admin/operacao`**, que é **rota diferente e fica FORA deste recorte** (§6, fora de escopo).

Escolha de recorte desta fatia: **somente** as exibições de data/hora de `/admin/financeiro` (mesma rota já tratada nas fatias 07B/07E). Nenhuma outra rota é tocada; nenhum outro achado E2–E9 é corrigido; nenhum achado transversal do PR #229 é corrigido em modo transversal.

## 3. Mapa auditado (grep robusto, antes do código)

Padrões aplicados em `src/app/admin/financeiro/*.tsx`: `new Date(`, `toLocaleString(`, `toLocaleDateString(`, `toISOString(`, `Intl.DateTimeFormat`, `slice(0,10)`, `slice(0,7)`, `slice(0,16)`, `split("T")` e varredura dos campos `*_date`/`*_at`. Nenhum arquivo da pasta usa `toISOString(` nem `Intl.DateTimeFormat`; `split("T")` não ocorre.

**20 exibições de data/hora em 17 linhas de 9 arquivos** (as duas linhas que rendem duas exibições cada estão marcadas ‡):

| # | Arquivo | Linha | Antes | Depois |
| --- | --- | --- | --- | --- |
| 1 | `FinanceiroWorkspace.tsx` | 500 | `{String(rule.start_date).slice(0, 10)}` | `{financeDate(rule.start_date)}` |
| 2-3 ‡ | `FinanceiroWorkspace.tsx` | 631 | `{String(item.period_start)} a {String(item.period_end)}` | `{financeDate(item.period_start)} a {financeDate(item.period_end)}` |
| 4-5 ‡ | `BudgetWorkspace.tsx` | 356 | `{String(selected.period_start).slice(0, 10)} a {String(selected.period_end).slice(0, 10)}` | `{financeDate(selected.period_start)} a {financeDate(selected.period_end)}` |
| 6 | `BudgetWorkspace.tsx` | 412 | `{new Date(entry.changed_at).toLocaleString("pt-BR")}` | `{financeDateTime(entry.changed_at)}` |
| 7 | `CashflowWorkspace.tsx` | 196 | `{String(snapshot.competence_date).slice(0, 10)}` | `{financeDate(snapshot.competence_date)}` |
| 8 | `CashflowWorkspace.tsx` | 215 | `{String(item.competence_date).slice(0, 10)}` | `{financeDate(item.competence_date)}` |
| 9 | `ClosureWorkspace.tsx` | 18 | `${d.closure.competence_date.slice(0,7)}` (aviso do POST) | `${financeMonth(d.closure.competence_date)}` |
| 10 | `ClosureWorkspace.tsx` | 23 | `{x.competence_date.slice(0,7)}` (opção do `<select>`) | `{financeMonth(x.competence_date)}` |
| 11 | `ClosureWorkspace.tsx` | 24 | `{selected.competence_date.slice(0,7)}` (detalhe) | `{financeMonth(selected.competence_date)}` |
| 12 | `CommissionWorkspace.tsx` | 25 | `{x.provision_date.slice(0,10)}` (opção do `<select>`) | `{financeDate(x.provision_date)}` |
| 13 | `CommissionWorkspace.tsx` | 26 | `{new Date(selected.reviewed_at).toLocaleString("pt-BR")}` | `{financeDateTime(selected.reviewed_at)}` |
| 14 | `CostAllocationWorkspace.tsx` | 98 | `{String(item.competence_date).slice(0,10)}` (tabela de importações) | `{financeDate(item.competence_date)}` |
| 15 | `CostAllocationWorkspace.tsx` | 117 | `{String(cost.competence_date).slice(0,10)}` (tabela de custos) | `{financeDate(cost.competence_date)}` |
| 16-17 ‡ | `ExportWorkspace.tsx` | 33 | `{selected.period_start.slice(0,10)} a {selected.period_end.slice(0,10)}` | `{financeDate(selected.period_start)} a {financeDate(selected.period_end)}` |
| 18 | `ExportWorkspace.tsx` | 34 | `{new Date(x.created_at).toLocaleString("pt-BR")}` (trilha) | `{financeDateTime(x.created_at)}` |
| 19 | `BankReconciliationWorkspace.tsx` | 272 | `{transaction.transaction_date}` | `{financeDate(transaction.transaction_date)}` |
| 20 | `ManagementResultsWorkspace.tsx` | 84 | `{r.competence_date}` | `{financeDate(r.competence_date)}` |

**Tipos conferidos no schema (lidos antes do código):**

- `db/migrations/077-...sql:44` — `fin_recurrence_rules.start_date DATE NOT NULL` (exibição 1).
- `db/migrations/078-...sql:23,34,166` — `fin_bank_statements.import_date DATE`, `fin_bank_transactions.transaction_date DATE`, `fin_cost_imports.import_date DATE` (exibições 14, 19).
- `db/migrations/080-...sql:20-21` e `:67-68` — `fin_budgets.period_start/period_end DATE` e `fin_exports.period_start/period_end DATE` (exibições 4-5, 16-17); `:102` — `fin_competence_closures.competence_date DATE` (exibições 9-11); `:145` — `fin_commission_provisions.provision_date DATE` (exibição 12); `:80`, `:95`, `:151`, `:177` — `fin_exports.generated_at`, `fin_export_logs.created_at`, `fin_commission_provisions.reviewed_at` e `fin_commission_provision_history.created_at`, todos `TIMESTAMPTZ`.
- `db/migrations/132-fin13-budget-hardening.sql:5` — `fin_budget_history.changed_at TIMESTAMPTZ` (exibição 6).
- `db/migrations/159-f03-receivable-settlement-report.sql:27-28` — `period_start`/`period_end DATE` (exibições 2-3).

São exatamente **os 3 carimbos `TIMESTAMPTZ`** (exibições 6, 13 e 18) e **17 datas de calendário** — a razão de os auxiliares serem separados.

**Superfícies de `/admin/financeiro` sem nenhuma exibição de data** (`CollectionWorkspace`, `ExpenseWorkspace`, `FiscalWorkspace`, `GatewayWorkspace`): confirmado por grep — os campos `due_date`, `created_at`, `changed_at` desses arquivos só aparecem como valor de `<input type="date">`, estado de formulário, filtro de busca ou corpo de POST, nunca como texto renderizado de registro.

**Fora do recorte (não misturar nesta fatia):**

- os **19 `<input type="date">`** (20 ocorrências, porque `ExportWorkspace.tsx:31` traz dois campos na mesma linha): são campos de formulário, com valor ISO de contrato do `<input>` — mexer neles mudaria o payload das escritas;
- `CashflowWorkspace.tsx:162` e `CostAllocationWorkspace.tsx:76` — preenchimento de formulário a partir do registro selecionado (o valor do `<input type="date">` precisa continuar ISO);
- `FinanceiroWorkspace.tsx:237` — corpo de `POST /api/fin/generate-recurring` (**payload não muda**);
- `BudgetWorkspace.tsx:218` e `ExpenseWorkspace.tsx:119` — `Date.now()` em chave de idempotência de interface (não é data exibida);
- `ManagementResultsWorkspace.tsx:16` — `toLocaleString("pt-BR")` de percentual (número, não data);
- `ClosureWorkspace.tsx:17` e `CommissionWorkspace.tsx:19` — filtros de busca sobre o dado cru (comportamento de busca preservado);
- `src/lib/finance-vocabulary.mjs` — **não será alterado** (anti-deriva em `tests/ux-finance-vocabulary.test.mjs`);
- E3 de `/admin/operacao` (`tests/l06-delivery.integration.test.mjs:1149,:1160` fixam texto ISO) — rota diferente; **nenhuma correção transversal**;
- todos os demais achados E2, E4–E9 e os transversais do PR #229; C11.

## 4. Regra decidida

Arquivo novo `src/lib/finance-dates.mjs` + `src/lib/finance-dates.d.mts`, **três funções puras e duas constantes**:

- `financeDate(v)` — ausente (`null`/`undefined`/`''`) → `'Não informada'`; se o texto começa em `^(\d{4})-(\d{2})-(\d{2})` → `DD/MM/AAAA` montado **dos dígitos** (sem `Intl`, sem `new Date`); qualquer outro texto → devolvido como veio (nada é inventado).
- `financeMonth(v)` — mesma regra sobre `^(\d{4})-(\d{2})` → `MM/AAAA`.
- `financeDateTime(v)` — ausente → `'Não informado'`; `new Date(v)` inválido → texto cru; caso contrário `DD/MM/AAAA HH:mm UTC` por `Intl.DateTimeFormat('pt-BR', { timeZone:'UTC', hourCycle:'h23', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })` + `' UTC'`.
- Constantes exportadas `FINANCE_DATE_ABSENT` e `FINANCE_DATETIME_ABSENT`, para que gate e tela citem o mesmo literal.

**Por que UTC declarado (e não «horário de Brasília»):** a convenção vigente do repositório já é `timeZone:'UTC'` explícito nos vocabulários de analytics, compliance, expansion, fleet, knowledge, quality, satisfaction e third-party (21 ocorrências em `src/lib`) e nos auxiliares `honestDate`/`honestDateTime`; `America/Sao_Paulo` **não está ratificado** no repositório, então introduzi-lo seria inventar uma decisão de produto não tomada pelo owner. O carimbo passa a declarar o fuso na própria frase (`UTC`), de modo que o texto nunca dependa da máquina de quem opera.

**Por que `Intl` não é usado nas datas de calendário:** `DATE` é data de calendário (não tem fuso); convertê-la por `new Date`/`Intl` reintroduziria exatamente o defeito desta fatia (deslocamento de um dia conforme o fuso da máquina). Montar `DD/MM/AAAA` a partir dos dígitos é determinístico em qualquer fuso.

**Decisão de arquivo (não de vocabulário):** `finance-dates.mjs` é auxiliar **de tela**, não tradutor de código de servidor — por isso **não** entra em `finance-vocabulary.mjs`, mesma decisão já registrada em `src/lib/finance-request.ts:69-80`.

**Contrato preservado:** nenhum método, URL, corpo, cabeçalho, permissão, idempotência, auditoria, migração ou servidor muda. Nenhuma `Idempotency-Key` será inventada.

## 5. Plano de implementação (após este registro)

1. **Gate aditivo antes da correção:** `tests/ux-finance-workspace.integration.test.mjs` recebe **10 casos novos (35–44) por acréscimo, depois do último caso herdado** (linha 1.340); o prefixo de 1.340 linhas / 76.468 bytes / `e9fc8436…` será conferido antes e depois de cada reconstrução, nenhuma asserção herdada é editada/removida/relaxada e `node --check` roda ao final. Casos: contrato HTTP cru seguindo ISO em 10 endpoints; FIN-15 `MM/AAAA` (opção, detalhe e aviso do POST); FIN-16 data pt-BR e carimbo `UTC`; FIN-14 período e trilha; FIN-13 período e histórico; FIN-05/07/08/09 nas tabelas/listas; painel (início da regra e período do relatório f03); ausente e formato inesperado pelo auxiliar herdado `openFinanceInvalidBody`; o **mesmo** carimbo com `timezoneId` `America/Sao_Paulo` e `Asia/Tokyo`; transbordo ≤ 0 em 1440/768/390/320 + `07f1-resumo.json`. Injeção de falha somente em `window.fetch` da página e somente em GET.
2. **Teste unitário do auxiliar:** `tests/ux-finance-dates.test.mjs` (6 casos), acrescentado a `test:unit` no `package.json`.
3. **Runner + workflow:** `scripts/qa-ux-pro-07f1-postgres.mjs` (cópia independente do runner da 07E-2; os runners herdados ficam **intactos**; `MINIMUM_CASES = 44`; banco descartável `seg_qa_ux_finance_07f1`; HTTP real; Chromium `--single-process`; auditoria TAP que reprova `fail`/`skip`/`todo`/resumo ausente e aprovações abaixo do mínimo) e `.github/workflows/ux-pro-07f1-delivery.yml` com `paths:` preciso (rota, os dois arquivos do auxiliar, os dois arquivos de teste, o runner, `package.json` e o próprio workflow; job `focal`, como os gates irmãos).
4. **Baseline próprio:** o gate novo roda **antes** da correção, com capturas em `docs/ux-pro-07-financeiro-evidencias/antes-07f-1/` (diretório novo; nenhuma evidência existente é sobrescrita). Esperado: 35/44 com 9 reprovações provando o defeito (a única aprovação nova é o caso de contrato, que existe justamente para provar que o payload não mudou, e que por isso **passa** na implementação anterior).
5. **Correção:** `src/lib/finance-dates.mjs` + `src/lib/finance-dates.d.mts` e as 20 exibições das 17 linhas nos 9 arquivos, exatamente como a seção 3.
6. **Execuções finais:** duas independentes (`depois-07f-1/execucao-1/`, `execucao-2/`), com `07f1-resumo.json` próprio que **omite `firstFocus` e `percursoTeclado`** (não medidos aqui) e declara isso; o `resumo.json` herdado do stage permanece byte a byte.
7. **CSVs:** somente `node scripts/ux-pro-00-inventory.mjs`; diff esperado é 1 linha alterada por arquivo, apenas `/admin/financeiro`, no campo dos gates automatizados (ganhando `ux-pro-07f1-delivery.yml`).
8. **Arquivos protegidos:** após o build e cada gate que inicia Next.js, `git checkout -- next-env.d.ts tsconfig.json` e conferência dos hashes da seção 1.
9. **Bateria completa antes da PR:** `npm ci`; `npm test`; `npm run typecheck`; `npm run build`; `node scripts/qa-wave0-static.mjs`; `node scripts/ux-pro-00-inventory.mjs --check`; `npm run test:l06-delivery:pg`; `npm run test:l07-delivery:pg`; `npm run test:l08-delivery:pg`; `npm run test:ext04-suppliers:pg`; `node --test tests/ux-finance-vocabulary.test.mjs`; `npm run test:ux-finance:pg`; e o gate desta fatia (duas execuções).
10. **Entrega:** push no branch pinado; PR pequena com escopo, evidências e declarações; checks remotos verdes; `MERGEABLE`/`CLEAN`; revisão técnica automatizada como **comentário**; `gh pr merge <n> --merge` como último comando da cadeia.

## 6. Preservações verificadas antes de editar (grep em `tests/`)

Varredura dos testids das 9 superfícies em `tests/`: **nenhum teste do repositório asserta data ISO renderizada** nessas superfícies. O que existe é:

- `tests/l07-delivery.integration.test.mjs:369` — só espera `[data-testid="finance-rule-<id>"]` existir e clica em «Aprovar» (nenhuma asserção sobre «Início»).
- `tests/l07-delivery.integration.test.mjs:2913-2922` — FIN-15/16: asserta `fin15-status`/`fin16-status` (`reaberta`, `revisada`), contagem de versões, `/automático proibido/i` e `fin16-review-audit` com `/autor/i`; **nunca** o texto da data.
- `tests/l07-delivery.integration.test.mjs:972` — FIN-09 com 500 → `fin09-error` com `/internal|falha/i`, `fin09-list` com 0 `li`, `fin09-retry` recuperando; `:1096` FIN-08 asserta `R$ 120,00` (moeda, não data); `:2452-2455` FIN-13 asserta protocolo, receita, margem e situação.
- `tests/ux-finance-workspace.integration.test.mjs:1115-1144` (casos herdados 07E-2) usam `selectOption` por **valor** (id) e contam `li` — não leem o rótulo com data.
- A única asserção do repositório que fixa data ISO **renderizada** é `tests/l06-delivery.integration.test.mjs:1149` (`/2026-10-05/`), que está em **`/admin/operacao`** — fora deste recorte e intocada.

Também verificado: nenhum dos 9 arquivos é citado por `tests/ux-finance-vocabulary.test.mjs` (anti-deriva do vocabulário), e `scripts/ux-pro-00-inventory.mjs` conta `arquivos_locais` por pasta da rota — por isso o auxiliar novo vai para `src/lib` (fora da pasta da rota) e nenhum arquivo novo entra em `src/app/admin/financeiro/`.

## 7. Declarações

Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu. As medições automatizadas não equivalem a auditoria WCAG completa. Esta fatia fecha somente o recorte da seção 3 e **não conclui o UX-PRO-07**: permanecem pendentes os achados E2, E4–E9, os transversais do PR #229 (inclusive o E3 de `/admin/operacao`, rota distinta) e C11, cada um à espera de decisão de escopo explícita do owner. Nenhuma próxima fatia é presumida por este documento.
