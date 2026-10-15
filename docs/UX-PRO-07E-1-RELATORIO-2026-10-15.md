# UX-PRO-07E-1 — leitura honesta de resposta 2xx sem lista canônica em `/admin/financeiro`

Data: 2026-10-15
Branch da sessão: `arena/aa312267-gruposegsystemseguranca`
Base: `fa5d0f5659045a8accaaa0ebd2574b9da5aab84c` (`origin/main`, merge do PR #231)
Commits da fatia: `fd38e58` (escopo e baseline anteriores à implementação), gate aditivo (testes + runner + workflow), implementação nos cinco arquivos autorizados, evidências/CSVs/relatório.
Decisão de escopo: registrada em `docs/UX-PRO-07E-1-ESCOPO-ANTES-2026-10-15.md` e confirmada pelo owner em duas rodadas de pergunta/resposta (07E-1 ampliada: painel próprio + sub-workspaces; depois, manter os 5 arquivos aprovados — 22 ocorrências — e registrar o resto como 07E-2).

## 1. O que esta fatia fecha — e o que ela não fecha

Fecha somente: em `/admin/financeiro`, uma resposta HTTP 2xx cujo corpo não traz a lista canônica (chave ausente, chave não-array, `null` ou corpo ilegível) passa a ser **falha declarada de leitura**, com código `invalid_finance_response`, texto explicando que isto não significa ausência de registros e repetição disponível — em vez de um falso "nenhum registro encontrado" ou de uma quebra silenciosa do render.

Não fecha:
- UX-PRO-07 como um todo. Esta fatia **não conclui o UX-PRO-07**; conclui apenas o recorte 07E-1 descrito acima.
- A classe D1 na rota inteira: restam 18 ocorrências em 8 arquivos (`FiscalWorkspace`, `GatewayWorkspace`, `ClosureWorkspace`, `CommissionWorkspace`, `CostAllocationWorkspace`, `ExportWorkspace`, `ExpenseWorkspace`, `ManagementResultsWorkspace`), registradas como **UX-PRO-07E-2 pendente** em comentários de código nos arquivos tocados e neste relatório. A classe D1 **não** está fechada em `/admin/financeiro`.
- Os achados transversais herdados do PR #229 (legado avançado, datas/fuso, rolagem interna de tabelas, `<main>` aninhado em `src/app/admin/AdminGate.tsx:115`, contraste noturno da aba ativa, quebra de palavra em cabeçalhos): continuam pendentes, sem correção transversal e sem mistura de rotas.
- Os achados E2–E9 do plano mestre para `/admin/financeiro` que não são da classe D1 (legado avançado em `src/app/admin/ti/OpsAdvanced2Client.tsx`/`OpsAdvanced3Client.tsx`, datas/fuso, rolagem interna, `<main>` aninhado, releitura explícita/hora da última leitura, contraste noturno 1,95:1 em `src/components/ui/UiWorkspace.module.css:72,:103` e `src/app/admin/admin-theme.css:154`, quebra de palavra em cabeçalhos a 768px em `UiWorkspace.module.css:11`).
- C11: fora de escopo, somente por ordem explícita do owner e como item registrado à parte.

## 2. O defeito na implementação anterior (com `file:line` da base `fa5d0f5`)

A leitura confiava em `|| []` sobre a chave canônica. Como `|| []` só cobre `null`/`undefined`/falsy, um corpo 2xx com chave ausente vira lista vazia (vazio falso) e um corpo com chave **não-array** entra truthy no estado e quebra o render:

- `src/app/admin/financeiro/FinanceiroWorkspace.tsx:155` — `const received: Account[] = (a.ok && a.data.receivables) || [];` (e `:158`, `:159`, `:163`, `:287`, `:294`, `:310` para regras, pagamentos, histórico e relatórios).
- `src/app/admin/financeiro/BankReconciliationWorkspace.tsx:106-110` — `statements`, `transactions`, `receivables`, `payables`, `conciliations`.
- `src/app/admin/financeiro/CollectionWorkspace.tsx:75-77` e `:139` — `policies`, `receivables`, `reminders`, `history`.
- `src/app/admin/financeiro/CashflowWorkspace.tsx:87-89` — `snapshots`, `aging`, `receivables`.
- `src/app/admin/financeiro/BudgetWorkspace.tsx:132`, `:144`, `:155` — `budgets`, `scenarios`, `history`; a quebra observada ocorre em `BudgetWorkspace.tsx:175` (`scenarios.filter(...)`) quando `scenarios` chega como objeto.

Superfície autorizada pelo owner: 22 ocorrências nestes 5 arquivos. As demais 18 ocorrências dos outros 8 arquivos ficam para 07E-2.

## 3. Implementação (estritamente aditiva em contrato)

- `src/lib/finance-request.ts:68` — `INVALID_FINANCE_RESPONSE = 'invalid_finance_response'` (código de tela, local a esta rota; o vocabulário canônico `src/lib/finance-vocabulary.mjs` **não** foi alterado, preservando o teste anti-deriva `tests/ux-finance-vocabulary.test.mjs`).
- `src/lib/finance-request.ts:71` — `invalidFinanceResponse(status)`: descritor com `kind:'retry'`, `canRetry:true`, título "A resposta do financeiro não pôde ser lida" e detalhe afirmando que isto **não significa que não existam registros**.
- `src/lib/finance-request.ts:91` — `financeReadList<T>(url, key)`: delega o fetch ao `financeRequest` existente **sem tocar** URL, método, cabeçalhos, `credentials:'same-origin'` e `cache:'no-store'`; valida `Array.isArray(data[key])` e, fora isso, devolve falha descrita.
- `src/lib/finance-request.ts:106` — `financeInvalidListMessage(status)`: "…Resposta do servidor: HTTP 200 (invalid_finance_response)."
- `src/app/admin/financeiro/FinanceiroWorkspace.tsx:149-151`, `:169`, `:293`, `:301` — painel e leituras sob demanda (histórico da conta, relatórios) passam a usar `financeReadList`; escritas (`run`, baixa, estorno, geração recorrente) continuam no helper original.
- `src/app/admin/financeiro/BankReconciliationWorkspace.tsx:64` e `src/app/admin/financeiro/CollectionWorkspace.tsx:54` e `src/app/admin/financeiro/CashflowWorkspace.tsx:72` — `requestList<T>(path, key)` local espelhando a configuração de fetch do arquivo; `readConfirmed` (`Bank…:85`, `Collection…:72`, `Cashflow…:92`) só vira `true` com leitura integral confirmada; em falha o grupo mantém a apresentação herdada (erro relançado).
- `src/app/admin/financeiro/CollectionWorkspace.tsx:75` — `historyState: idle|confirmed|failed` para o histórico sob demanda não afirmar ausência antes de ler.
- `src/app/admin/financeiro/BudgetWorkspace.tsx:110` — `apiList<T>(path, key)`; apresentação por coleção já existente é preservada (leitor apenas, sem novos flags).
- Novos testids de indisponibilidade (somente acrescentados, nenhum removido): `fin05-{statements,transactions,conciliations}-unavailable`, `fin06-{policies,reminders,history}-unavailable`, `fin07-{snapshots,aging}-unavailable`, `fin13-{budget,scenario}-unavailable` com o texto "Lista indisponível — a leitura não foi confirmada; não confundir com ausência de …".

Contratos preservados: mesmos métodos, URLs (incluindo os quatro aliases de cada endpoint financeiro), payloads, cabeçalhos, permissões, idempotência (`duplicate_ack`, `Idempotency-Key` existente em `/api/admin/finance/f03/reports`), auditoria, migrações e servidor. Nenhuma escrita nova foi inventada e nenhuma `Idempotency-Key` foi criada para contrato que não a possui.

## 4. Gate aditivo

- `tests/ux-finance-workspace.integration.test.mjs`: prefixo herdado de 347 linhas / 17004 bytes mantido byte a byte — SHA-256 `42dc4da39b583445e338c9fb7d8586d43c6b1a9bc8745768b4290280f7e8ec74` verificado antes e depois de cada reconstrução; o bloco novo começa na linha 348 e acrescenta 14 casos (arquivo final com 22 `test(`, diff `+511/−0` sobre a base). Nenhuma asserção herdada foi editada, removida ou relaxada.
- Auxiliares novos: `watchPageErrors` (`tests/ux-finance-workspace.integration.test.mjs:437`), `settle` (`:446`, espera âncora presente nas duas implementações e depois as candidatas, para captura e leitura comparáveis), `textOf` (`:466`, lê o texto renderizado; se a superfície não existir, devolve marcador explicativo com o erro de página registrado, em vez de estourar timeout).
- Injeção de falha somente no `window.fetch` da página, apenas em GET, com regra persistente e desligável (`window.__qaFinanceInvalidBody`); nada é injetado em servidor, banco, proxy ou auditoria.
- Runner próprio `scripts/qa-ux-pro-07e1-postgres.mjs` (`MINIMUM_CASES = 22` em `:61`), PostgreSQL descartável, HTTP real e Chromium; auditoria TAP (`:76`, `:136`) reprova fail, skip, todo, resumo ausente/incompleto e aprovações abaixo do mínimo.
- Workflow `.github/workflows/ux-pro-07e1-delivery.yml` com `paths:` preciso em `src/app/admin/financeiro/**`, `src/lib/finance-request.ts`, o arquivo de teste, o runner e o próprio workflow — classificado pelo inventário como gate focal de `/admin/financeiro`, não baseline.

## 5. Baseline contra a implementação anterior

Diretório próprio, sem sobrescrever evidências existentes: `docs/ux-pro-07-financeiro-evidencias/antes-07e-1/` (`gate.txt` + 19 capturas PNG).

Resultado: **10 aprovações / 12 reprovações / 0 skip / 0 todo**, exit 1, 242 s, `UX_FIN_07E1_GATE_REJECTED`. As 10 aprovações são os 8 casos herdados + contrato das chaves canônicas + preservação do vazio legítimo. As 12 reprovações, todas `AssertionError` com causa visível:

| caso | superfície | comportamento da base | evidência |
|---|---|---|---|
| 10 | painel sem `receivables` | renderiza "Nenhum recebível encontrado." | `antes-07e-1/gate.txt` not ok 10; `07e1-painel-recebiveis-corpo-invalido.png` |
| 11 | painel com `rules` não-array | renderiza "Nenhuma regra encontrada." | not ok 11; `07e1-painel-regras-nao-array.png` |
| 12 | painel com corpo ilegível em `payments` | renderiza "Nenhum pagamento encontrado." | not ok 12; `07e1-painel-pagamentos-corpo-ilegivel.png` |
| 14 | painel em falha | oferece repetição sem declarar falha | not ok 14; `07e1-painel-antes-de-repetir.png` |
| 15 | FIN-05 sem `statements` | seção normal com vazio falso | not ok 15; `07e1-conciliacao-corpo-invalido.png` |
| 16 | FIN-13 sem `budgets` | vazio falso de orçamentos | not ok 16; `07e1-orcamento-corpo-invalido.png` |
| 17 | FIN-13 com `scenarios` não-array | **quebra o render**: `scenarios.filter is not a function` (`BudgetWorkspace.tsx:175`), overlay do Next.js na captura | not ok 17; `07e1-cenarios-corpo-invalido.png` |
| 18 | FIN-07 sem `snapshots` | vazio falso de snapshots/aging | not ok 18; `07e1-fluxo-caixa-corpo-invalido.png` |
| 19 | FIN-06 com `policies` não-array | **quebra o render**: `policies.map is not a function` | not ok 19; `07e1-cobranca-corpo-invalido.png` |
| 20 | relatórios sob demanda | lista vazia sem declarar corpo inválido | not ok 20; `07e1-relatorios-corpo-invalido.png` |
| 21 | histórico da conta sob demanda | "Nenhum evento carregado." sem declarar falha | not ok 21; `07e1-historico-corpo-invalido.png` |
| 22 | responsivo 1440/768/390/320 | **quebra o render**: `accounts.map is not a function`; sem superfície para medir | not ok 22; `07e1-falha-declarada-1440.png` |

Os erros de página das três quebras (`accounts.map`, `policies.map`, `scenarios.filter` "is not a function") foram coletados pelo próprio gate via `pageerror` e aparecem literais no `gate.txt` do baseline.

## 6. Execuções finais (duas, independentes)

- Execução 1 (com capturas): `UX_FINANCE_EVIDENCE_DIR=docs/ux-pro-07-financeiro-evidencias` → **22/22, 0 fail, 0 skip, 0 todo**, exit 0, 86 s. Log em `docs/ux-pro-07-financeiro-evidencias/depois-07e-1/execucao-1/gate.txt`; capturas e `resumo.json` na raiz do stage (4 entradas, viewports 1440x900/768x1024/390x844/320x844, tema dia, estado `falha_declarada_corpo_2xx_sem_lista`, sem `firstFocus`/`percursoTeclado` de propósito: não são medidos aqui).
- Execução 2 (sem diretório de evidência, como no CI): **22/22, 0 fail, 0 skip, 0 todo**, exit 0, 80 s. Log em `docs/ux-pro-07-financeiro-evidencias/depois-07e-1/execucao-2/gate.txt`.

## 7. CSVs regenerados e prova do diff

Regenerados exclusivamente por `node scripts/ux-pro-00-inventory.mjs` (nunca editados à mão). O diff se limita à linha 19, a rota `/admin/financeiro`, nos dois arquivos:

- `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv`: gate de jornada passa a incluir `ux-pro-07e1-delivery.yml` (classificação `focal`), viewports `1440x900|320x844|390x844|768x1024` e stages `ux-07-financeiro|ux-pro-07-financeiro`.
- `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`: "capturado em 1440x900, 320x844, 390x844, 768x1024; faltam nenhum" e captura visual com os dois stages.
- `node scripts/ux-pro-00-inventory.mjs --check`: OK, CSVs conferem com o código atual.

## 8. Arquivos protegidos

Depois do build e de cada gate que inicia Next.js: `git checkout -- next-env.d.ts tsconfig.json` e verificação SHA-256 — `next-env.d.ts` `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`, `tsconfig.json` `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`. Nenhum dos dois mudou em `main` durante a fatia; os hashes herdados continuam válidos.

## 9. Bateria completa (tudo verde)

| verificação | resultado |
|---|---|
| `npm test` | 933/933 |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 (migrações 001–180 contínuas) |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run test:l07-delivery:pg` | 43/43 |
| `npm run test:l08-delivery:pg` | 51/51 |
| `npm run test:ext04-suppliers:pg` | 28/28 |
| `node --test tests/ux-finance-vocabulary.test.mjs` | 10/10 |
| `npm run test:ux-finance:pg` (gate herdado, sem edição) | 22/22 |
| `node scripts/qa-ux-pro-07e1-postgres.mjs` (execuções finais 1 e 2) | 22/22 e 22/22 |
| baseline do gate novo contra `fa5d0f5` | 10/12, rejeitado como esperado |

## 10. Limitações e declarações obrigatórias

Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu. As medições automatizadas não equivalem a auditoria WCAG completa. O tema noturno de `/admin/financeiro` não foi medido nesta fatia (contraste é achado transversal E8, fora do escopo). As capturas de teclado/percurso continuam sendo as herdadas do stage `ux-07-financeiro`; o `resumo.json` novo declara apenas o estado de falha declarada por corpo 2xx sem lista.

Esta fatia fecha somente o recorte 07E-1 descrito na seção 1 e **não conclui o UX-PRO-07**: permanecem pendentes 07E-2 (18 ocorrências em 8 arquivos), os achados E2–E9 e os achados transversais do PR #229. A revisão técnica deste trabalho, quando publicada, é automatizada e não constitui aprovação humana.
