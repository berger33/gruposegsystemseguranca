# UX-PRO-07F-1 — datas e fuso em `/admin/financeiro` (DD/MM/AAAA, MM/AAAA e carimbo com fuso declarado em UTC)

Data: 2026-10-15
Branch da sessão: `arena/22f1ab37-gruposegsystemseguranca`
Base: `12fe34e591d4272f3ccb5753fe28671896b7c0da` (`origin/main`, merge do PR #233, 07E-2)
Commits da fatia: escopo (`49a1058`, registrado antes do código), gate aditivo (`516f3dd`), correção (`ca7f28d`), relatório/evidências/CSVs (commit deste arquivo).
Decisão de escopo: registrada em `docs/UX-PRO-07F-1-ESCOPO-ANTES-2026-10-15.md`, com o mapa auditado das 20 exibições por `file:line` da base, a regra decidida e o "fora do recorte". Nenhum código foi escrito antes desse registro.

## 1. O que esta fatia fecha — e o que ela não fecha

Fecha somente: em `/admin/financeiro`, as **20 exibições de data/hora** das nove áreas financeiras (painel, FIN-05, FIN-07, FIN-08, FIN-09, FIN-13, FIN-14, FIN-15 e FIN-16) deixam de imprimir o valor cru em ISO:

| dado | antes (texto em tela) | depois |
| --- | --- | --- |
| 17 colunas `DATE` | `2037-02-01`, `2037-02-05T00:00:00.000Z` | `01/02/2037`, `05/02/2037` |
| competência (`DATE`) | `2037-02` | `02/2037` |
| 3 carimbos `TIMESTAMPTZ` | `15/10/2026, 12:35:17` (hora da MÁQUINA) | `15/10/2026 12:35 UTC` (fuso declarado) |

Ausência continua ausência declarada (`Não informada`/`Não informado`), nunca célula vazia nem data inventada; formato inesperado volta como veio, inteiro, sem truncar.

Não fecha:

- **UX-PRO-07 como um todo.** Esta fatia **não conclui o UX-PRO-07**; conclui apenas o recorte acima. Nenhuma próxima fatia é presumida por este documento.
- Os achados **E2** e **E4–E9** do plano mestre para `/admin/financeiro` (legado avançado, rolagem interna de tabelas, `<main>` aninhado, releitura explícita/hora da última leitura, contraste noturno, quebra de palavra a 768px, entre outros): seguem pendentes, cada um exigindo decisão de escopo explícita do owner.
- Os achados **transversais do PR #229**, inclusive o **E3 de `/admin/operacao`** (`tests/l06-delivery.integration.test.mjs:1149,:1160` fixam texto ISO nessa outra rota): pendentes; **nenhuma correção transversal** foi feita e nenhuma rota foi misturada.
- **C11**: fora de escopo; somente por ordem explícita do owner.
- Os itens declarados "fora do recorte" no escopo (seção 4): os **19 `<input type="date">`** (20 ocorrências do token, porque `ExportWorkspace.tsx:31` traz dois campos na mesma linha), os preenchimentos de formulário de `CashflowWorkspace.tsx` e `CostAllocationWorkspace.tsx`, o corpo do `POST /api/fin/generate-recurring` em `FinanceiroWorkspace.tsx:238`, os `Date.now()` em chave de idempotência de interface, o `toLocaleString("pt-BR")` de percentual em `ManagementResultsWorkspace.tsx:16` e os filtros de busca sobre o dado cru — todos intactos por decisão.

## 2. O defeito na implementação anterior (com `file:line` da base `12fe34e`)

Duas classes de defeito, ambas medidas em tela pelo gate (seção 5):

- **(a) ISO cru** — `String(x).slice(0, 10)`, `x.slice(0, 7)` ou interpolação direta do valor do driver: o registro aparecia como `2037-02-01` (data de calendário) ou `2037-02-05T00:00:00.000Z` (timestamp de meia-noite do `pg`).
- **(b) fuso herdado da máquina** — `new Date(x).toLocaleString("pt-BR")` nos 3 carimbos `TIMESTAMPTZ`: o **mesmo** instante saía com horas diferentes conforme o fuso de quem opera, e o texto não declarava fuso nenhum.

As 20 exibições estão em **17 linhas de 9 arquivos** (as duas linhas marcadas ‡ rendem duas exibições cada):

| # | Arquivo | Linha (base) | Antes | Depois |
| --- | --- | --- | --- | --- |
| 1 | `FinanceiroWorkspace.tsx` | 500 | `{String(rule.start_date).slice(0, 10)}` | `{financeDate(rule.start_date)}` |
| 2-3 ‡ | `FinanceiroWorkspace.tsx` | 631 | `{String(item.period_start)} a {String(item.period_end)}` | `{financeDate(item.period_start)} a {financeDate(item.period_end)}` |
| 4-5 ‡ | `BudgetWorkspace.tsx` | 356 | `{String(selected.period_start).slice(0, 10)} a {String(selected.period_end).slice(0, 10)}` | `{financeDate(selected.period_start)} a {financeDate(selected.period_end)}` |
| 6 | `BudgetWorkspace.tsx` | 412 | `{new Date(entry.changed_at).toLocaleString("pt-BR")}` | `{financeDateTime(entry.changed_at)}` |
| 7 | `CashflowWorkspace.tsx` | 196 | `{String(snapshot.competence_date).slice(0, 10)}` | `{financeDate(snapshot.competence_date)}` |
| 8 | `CashflowWorkspace.tsx` | 215 | `{String(item.competence_date).slice(0, 10)}` | `{financeDate(item.competence_date)}` |
| 9 | `ClosureWorkspace.tsx` | 18 | `${d.closure.competence_date.slice(0, 7)}` (aviso do POST) | `${financeMonth(d.closure.competence_date)}` |
| 10 | `ClosureWorkspace.tsx` | 23 | `{x.competence_date.slice(0, 7)}` (opção do `<select>`) | `{financeMonth(x.competence_date)}` |
| 11 | `ClosureWorkspace.tsx` | 24 | `{selected.competence_date.slice(0, 7)}` (detalhe) | `{financeMonth(selected.competence_date)}` |
| 12 | `CommissionWorkspace.tsx` | 25 | `{x.provision_date.slice(0, 10)}` (opção do `<select>`) | `{financeDate(x.provision_date)}` |
| 13 | `CommissionWorkspace.tsx` | 26 | `{new Date(selected.reviewed_at).toLocaleString("pt-BR")}` | `{financeDateTime(selected.reviewed_at)}` |
| 14 | `CostAllocationWorkspace.tsx` | 98 | `{String(item.competence_date).slice(0, 10)}` (importações) | `{financeDate(item.competence_date)}` |
| 15 | `CostAllocationWorkspace.tsx` | 117 | `{String(cost.competence_date).slice(0, 10)}` (custos) | `{financeDate(cost.competence_date)}` |
| 16-17 ‡ | `ExportWorkspace.tsx` | 33 | `{selected.period_start.slice(0, 10)} a {selected.period_end.slice(0, 10)}` | `{financeDate(selected.period_start)} a {financeDate(selected.period_end)}` |
| 18 | `ExportWorkspace.tsx` | 34 | `{new Date(x.created_at).toLocaleString("pt-BR")}` (trilha) | `{financeDateTime(x.created_at)}` |
| 19 | `BankReconciliationWorkspace.tsx` | 272 | `{transaction.transaction_date}` | `{financeDate(transaction.transaction_date)}` |
| 20 | `ManagementResultsWorkspace.tsx` | 84 | `{r.competence_date}` | `{financeDate(r.competence_date)}` |

Tipos conferidos no schema antes do código (detalhados no escopo, seção 3): `fin_recurrence_rules.start_date`, `fin_bank_transactions.transaction_date`, `fin_cost_imports`/`fin_costs.competence_date`, `fin_budgets.period_start/period_end`, `fin_exports.period_start/period_end`, `fin_competence_closures.competence_date`, `fin_commission_provisions.provision_date` e os recebíveis de relatório f03 (`db/migrations/159-…sql:27-28`) são **`DATE`** (17 exibições); `fin_budget_history.changed_at`, `fin_commission_provisions.reviewed_at` e `fin_export_logs.created_at` são **`TIMESTAMPTZ`** (os 3 carimbos) — a razão de os auxiliares serem separados.

## 3. Implementação (estritamente aditiva em contrato)

- `src/lib/finance-dates.mjs` (88 linhas) + `src/lib/finance-dates.d.mts` (6 linhas) — módulo **de tela**, deliberadamente fora de `finance-vocabulary.mjs` (mesma decisão registrada em `src/lib/finance-request.ts:69-80`), com três funções puras e duas constantes exportadas:
  - `financeDate(v)` — `null`/`undefined`/`''` → `FINANCE_DATE_ABSENT` (`'Não informada'`); `^(\\d{4})-(\\d{2})-(\\d{2})` → `DD/MM/AAAA` montado **dos dígitos** (sem `Intl`, sem `new Date`); qualquer outro texto → devolvido como veio.
  - `financeMonth(v)` — `^(\\d{4})-(\\d{2})` → `MM/AAAA`; mesma regra de ausência/inesperado.
  - `financeDateTime(v)` — ausente → `FINANCE_DATETIME_ABSENT` (`'Não informado'`); `new Date(v)` inválido → texto cru; caso contrário `Intl.DateTimeFormat('pt-BR', { timeZone:'UTC', hourCycle:'h23', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })` + `' UTC'` → `DD/MM/AAAA HH:mm UTC`.
- As **17 linhas** da tabela da seção 2, nos 9 arquivos, exatamente como auditado — no diff: 9 arquivos, `+26/−17` nas linhas de exibição, mais os imports de `financeDate`/`financeMonth`/`financeDateTime`.
- Nenhum contrato mudou: mesmos métodos, URLs (incluindo os aliases dos endpoints financeiros), payloads, cabeçalhos, permissões, alçadas, idempotência (`idempotent_replay`/`duplicate_ack` preservados), trilha de auditoria, migrações e servidor. **Nenhum arquivo de `src/server/` foi tocado** e nenhuma `Idempotency-Key` foi inventada.
- `FinanceiroWorkspace.tsx:238` da base (`const date = rule.start_date.slice(0, 10)`, corpo do `POST /api/fin/generate-recurring`) segue **intacto**: o payload continua ISO, por decisão de recorte.
- `src/lib/finance-vocabulary.mjs` **não** foi alterado (anti-deriva preservada por `tests/ux-finance-vocabulary.test.mjs`, 10/10).

**Por que UTC declarado, e não «horário de Brasília»:** a convenção vigente do repositório já é `timeZone:'UTC'` explícito nos vocabulários de analytics, compliance, expansion, fleet, knowledge, quality, satisfaction e third-party, além de `honestDate`/`honestDateTime`; `America/Sao_Paulo` **não está ratificado** no repositório, então introduzi-lo seria inventar decisão de produto não tomada pelo owner. O fuso passa a ser **declarado no próprio texto** (`… UTC`), de modo que a leitura não dependa da máquina de quem opera.

**Por que `Intl` não é usado nas datas de calendário:** `DATE` é data de calendário, sem fuso; convertê-la por `new Date`/`Intl` reintroduziria exatamente o defeito desta fatia (deslocamento de um dia conforme o fuso da máquina). `DD/MM/AAAA` a partir dos dígitos é determinístico em qualquer fuso — provado em subprocesso por `tests/ux-finance-dates.test.mjs`.

## 4. Gate aditivo

- `tests/ux-finance-workspace.integration.test.mjs`: **prefixo herdado de 1.340 linhas / 76.468 bytes mantido byte a byte** — SHA-256 `e9fc84369f227c5308e240ca92dc21262c14c59c5648689457157d820e98c487` conferido antes e depois da reconstrução. O bloco novo começa na linha 1.341 e vai até a 1.878; arquivo final com **44 casos** (`^\\s*test(`), `node --check` OK. **Nenhuma asserção herdada foi editada, removida ou relaxada.**
- Auxiliares novos no bloco: `qa07f1Create` (POST pela própria API), `qa07f1OptionsText` (espera a **existência** da `<option>` — o elemento nativo é invisível para o Playwright — e devolve o texto das opções), `qa07f1WaitOptionValue` e `qa07f1OpenTimezone` (abre o navegador com `timezoneId`). Abas, painéis, captura e a regra de injeção de falha usam os auxiliares **herdados** (`gotoTab07e2`, `settle07e2`, `settle`, `capture`, `textOf`, `openFinanceInvalidBody`) — nada herdado foi modificado.
- Casos 35 a 44, nesta ordem: (35) **contrato** — massa sintética pelas dez APIs financeiras e leitura dos dez endpoints provando que o JSON continua ISO cru; (36) FIN-15 `MM/AAAA` na opção, no detalhe e no aviso do POST; (37) FIN-16 data pt-BR na opção e carimbo da revisão com fuso declarado; (38) FIN-14 período e trilha; (39) FIN-13 período e histórico; (40) FIN-05/07/08/09 nas tabelas/listas, incluindo aging e custos; (41) painel — início da regra e período do relatório f03; (42) ausência declarada (`Não informada`/`Não informado`, nunca `Invalid Date`/`NaN`/`undefined`) e formato inesperado preservado cru, sem data inventada; (43) o **mesmo** carimbo idêntico com `timezoneId` `America/Sao_Paulo` e `Asia/Tokyo` (o texto não pode mudar com a máquina); (44) responsivo 1440/768/390/320 com `transbordoDocumentoPx = 0` e `07f1-resumo.json`.
- Massa sintética criada pelas **próprias APIs financeiras** (ano 2037, sufixo `randomUUID`), com o fechamento de competência criado **por último** e em competência distinta: a migração 137 fecha meses (`fechada`/`bloqueada`) e recusa escrita neles (`db/migrations/137-fin14-15-16-ui-idempotency-closure-lock.sql:48`, erro `fin_competence_closed`) — a primeira montagem reprovava o caso 35 por esse motivo (rodada descartada preservada, seção 5).
- Injeção de falha **somente** no `window.fetch` da página e **somente em GET**, pela regra persistente e desligável herdada; nada é injetado em servidor, banco, proxy ou auditoria.
- Runner próprio `scripts/qa-ux-pro-07f1-postgres.mjs` (`MINIMUM_CASES = 44` em `:64`; banco descartável `seg_qa_ux_finance_07f1`; PostgreSQL temporário, HTTP real e Chromium; auditoria TAP que reprova `fail`, `skip`, `todo`, resumo ausente/incompleto e aprovações abaixo do mínimo). Os runners herdados permanecem **intactos**.
- Workflow `.github/workflows/ux-pro-07f1-delivery.yml` (job `focal`, `timeout-minutes: 40`) com `paths:` preciso: a pasta da rota, os dois arquivos do auxiliar, os dois arquivos de teste, o runner, `package.json` e o próprio workflow; inclui o passo unitário `node --test tests/ux-finance-dates.test.mjs`. Classificado pelo inventário como gate focal de `/admin/financeiro`.
- `tests/ux-finance-dates.test.mjs` (6 casos) acrescentado a `test:unit` no `package.json` (1 linha), cobrindo o comportamento das três funções, a determinação em subprocesso sob dois fusos e a varredura do sistema de arquivos (as 20 exibições nas 17 linhas e as 20 ocorrências de `type="date"`).

## 5. Baseline contra a implementação anterior

Diretório próprio `docs/ux-pro-07-financeiro-evidencias/antes-07f-1/` (`gate.txt` + 56 PNG, dos quais 9 são capturas dos casos novos e 47 são as evidências herdadas reescritas dentro da rodada pelo próprio gate, comportamento documentado de `UX_FINANCE_EVIDENCE_DIR`). A implementação anterior foi estacionada fora do repositório antes de reverter, e a correção foi reaplicada depois — nenhuma evidência existente foi sobrescrita.

Resultado: **35 aprovações / 9 reprovações / 0 skip / 0 todo**, exit 1, 334,8 s, `UX_FIN_07F1_GATE_REJECTED` e `UX_FIN_07F1_TEST_EXIT: 1` (`UX_FIN_07F1_TAP_SUMMARY: pass=35 fail=9 skipped=0 todo=0 minimo_exigido=44`). As 35 aprovações são os 34 casos herdados + o **caso 35 (contrato)**, que passa antes e depois justamente para provar que payload e JSON não mudaram. As 9 reprovações são todas o defeito medido em tela:

| caso | superfície | comportamento da base | mensagem literal no `gate.txt` |
| --- | --- | --- | --- |
| 36 | FIN-15 | competência em ISO na opção | `a opção do FIN-15 precisa trazer MM/AAAA; opções: "Selecione | 2037-04 · fechada | 2037-01 · fechada"` |
| 37 | FIN-16 | data em ISO na opção | `a opção do FIN-16 precisa trazer DD/MM/AAAA; opções: "Selecione | sem regra · 2037-02-15 · em_revisao | …"` |
| 38 | FIN-14 | período em ISO no detalhe | `o período do FIN-14 precisa sair em pt-BR; texto: "EXP-FIN-… · 2037-02-01 a 2037-02-28 · …"` |
| 39 | FIN-13 | período em ISO no detalhe | `o período do FIN-13 precisa sair em pt-BR; texto: "ORC-FIN-… · período 2037-02-01 a 2037-02-28 …"` |
| 40 | FIN-05/07/08/09 | datas das listas em ISO | `a Reconciliation precisa exibir a data em pt-BR; texto: "FIN05-07F1-… · 2037-02-05T00:00:00.000Z · …"` |
| 41 | painel | início da regra em ISO | `o início da regra precisa sair em pt-BR; texto: "… Início 2037-02-03 …"` |
| 42 | ausência | ausência não declarada | `data ausente precisa ser declarada nas duas linhas (nulo e campo omitido)` (esperado `true`, obtido `false`) |
| 43 | carimbo | fuso herdado da máquina, não declarado | `o carimbo precisa declarar o fuso em "America/Sao_Paulo"; texto: "… · 15/10/2026, 12:35:17"` |
| 44 | responsivo 1440px | sem a competência em pt-BR para medir | `a competência em pt-BR precisa existir em 1440px; opções: "Selecione | 2037-04 · fechada | 2037-01 · fechada"` |

Rodada preliminar rejeitada, preservada como evidência do processo em `antes-07f-1/execucao-preliminar-descartada-ordenacao-da-massa/gate.txt`: **34/44 com 10 reprovações**, porque o fechamento de competência era criado **antes** da massa e a migração 137 recusou as escritas seguintes no mês fechado (`fin_competence_closed`) — o caso 35 reprovava por causa disso, não pelo defeito. Corrigida a ordem da massa (fechamento por último, em competência distinta), o baseline passou a isolar o defeito e deu o esperado **35/9**. A rodada foi movida para subdiretório próprio em vez de apagada.

## 6. Execuções finais (duas, independentes)

- Execução 1 (com diretório de evidência `depois-07f-1/execucao-1/`): **44/44, 0 fail, 0 skip, 0 todo**, `UX_FIN_07F1_TAP_SUMMARY: pass=44 fail=0 skipped=0 todo=0 minimo_exigido=44`, `UX_FIN_07F1_TEST_EXIT: 0`, 237,6 s; 76 entradas (72 PNG — 25 desta fatia — + `gate.txt` + `07f1-resumo.json` + os resumos herdados reescritos na rodada).
- Execução 2 (sem diretório de evidência, como no CI): **44/44, 0 fail, 0 skip, 0 todo**, exit 0, 212,5 s; log em `depois-07f-1/execucao-2/gate.txt`.
- `07f1-resumo.json` (arquivo próprio; não sobrescreve nada): 4 entradas (1440x900/768x1024/390x844/320x844), tema dia, papel `financeiro`, `state: "datas_em_ptbr_e_fuso_declarado_fin15"`, `transbordoDocumentoPx: 0` nas quatro larguras e `formatoDataObservado` com a opção literal `Selecione | 04/2037 · fechada | 03/2037 · fechada | 01/2037 · fechada`; declara explicitamente que **não** mede percurso de teclado nem primeiro foco e que o tema noturno não foi medido.
- O `resumo.json` canônico do stage (`docs/ux-pro-07-financeiro-evidencias/resumo.json`) permaneceu **byte a byte**: SHA-256 `78a213281c64a08d99ab2e53b962ea43d5fc0d36703f7436e9cffb01460d689c`.

## 7. CSVs regenerados e prova do diff

Regenerados exclusivamente por `node scripts/ux-pro-00-inventory.mjs` (nunca editados à mão). A conferência campo a campo mostra **1 linha alterada de 100 em cada arquivo, só a rota `/admin/financeiro`**, e o único campo alterado é a lista de gates automatizados, que passa a incluir `ux-pro-07f1-delivery.yml`:

- `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`: campo `gates_automatizados` passa de `ux-finance-delivery.yml|ux-pro-07e1-delivery.yml|ux-pro-07e2-delivery.yml` para `ux-finance-delivery.yml|ux-pro-07e1-delivery.yml|ux-pro-07e2-delivery.yml|ux-pro-07f1-delivery.yml`.
- `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`: campo idem, na parte "teste automatizado de jornada"; viewports, stage e as demais colunas ficam idênticos.
- `node scripts/ux-pro-00-inventory.mjs --check`: OK (100 entradas; 58 com gate automatizado).

## 8. Arquivos protegidos

Depois do build e de cada gate que inicia Next.js: `git checkout -- next-env.d.ts tsconfig.json` e conferência SHA-256 — `next-env.d.ts` `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`, `tsconfig.json` `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`. Nenhum dos dois mudou em `main` durante a fatia.

## 9. Bateria completa

| verificação | resultado |
| --- | --- |
| `npm ci` | OK (0 vulnerabilidades) |
| `npm test` | 939/939 (0 fail, 0 skip, 0 todo) |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 (migrações 001–180 contínuas e únicas) |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run test:l07-delivery:pg` | 43/43 |
| `npm run test:l08-delivery:pg` | 51/51 |
| `npm run test:ext04-suppliers:pg` | 28/28 |
| `node --test tests/ux-finance-vocabulary.test.mjs` | 10/10 |
| `node --test tests/ux-finance-dates.test.mjs` | 6/6 |
| `npm run test:ux-finance:pg` (gate herdado, sem edição) | 44/44 |
| gate desta fatia — execuções finais 1 e 2 | 44/44 e 44/44 |
| baseline do gate novo contra `12fe34e` | 35/44, rejeitado como esperado |

## 10. Preservações verificadas

- Varredura em `tests/` (registrada no escopo, seção 6): **nenhum teste do repositório asserta data ISO renderizada** nessas nove superfícies; os testes que citam os testids leem valor de `<select>` por id e contagens, nunca o rótulo com data. A única asserção que fixa ISO renderizado (`tests/l06-delivery.integration.test.mjs:1149`) é de `/admin/operacao` — rota distinta, intocada.
- Escritas intocadas: métodos, URLs, corpos, cabeçalhos e as chaves de idempotência existentes; nenhuma `Idempotency-Key` inventada; nenhum arquivo de `src/server/` tocado; nenhuma migração criada ou alterada.
- As **20 ocorrências de `type="date"`** (19 campos) seguem intactas, com valor ISO de contrato do `<input>`; o corpo do `POST /api/fin/generate-recurring` (`FinanceiroWorkspace.tsx:238`) intacto; filtros de busca sobre o dado cru intactos.
- `src/lib/finance-vocabulary.mjs` intacto — `node --test tests/ux-finance-vocabulary.test.mjs` 10/10.
- Caso 35 (contrato) passa **antes e depois**: os dez endpoints de data continuam devolvendo ISO cru no JSON.

## 11. Limitações e declarações obrigatórias

Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu. As medições automatizadas não equivalem a auditoria WCAG completa.

Limitações declaradas: o `07f1-resumo.json` **não** mede percurso de teclado nem primeiro foco (cobertos pelos stages herdados; o inventário agrega por rota) e o **tema noturno não foi medido** nesta fatia (contraste é o achado transversal E8, fora do escopo). Não há medição de leitor de tela nem de contraste automatizado além do que os stages herdados já produzem.

Observação de entrega registrada sem ação: existe **entrega paralela do mesmo recorte** no PR **#234**, aberto a partir de outro branch de sessão (`arena/c544b76f-…`); os nove workspaces e o `package.json` daquele branch estão byte a byte idênticos aos desta fatia, mas o auxiliar, os testes, o runner, o workflow e os CSVs diferem. Aquele PR está `OPEN` com um check reprovado (`ux-ops-postgres-browser`, rota `/admin/operacao`, sem relação com esta fatia). Esta sessão **não** comentou, não reexecutou, não alterou nem mesclou o PR #234: a escolha de qual entrega deve entrar em `main` é decisão do owner.

Esta fatia fecha somente o recorte descrito na seção 1 e **não conclui o UX-PRO-07**: permanecem pendentes os achados E2 e E4–E9 de `/admin/financeiro`, os achados transversais do PR #229 (inclusive o E3 de `/admin/operacao`) e C11 — cada um à espera de decisão de escopo explícita do owner. A revisão técnica deste trabalho, quando publicada, é automatizada e não constitui aprovação humana.
