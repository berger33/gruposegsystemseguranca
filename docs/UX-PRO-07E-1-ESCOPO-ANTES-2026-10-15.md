# UX-PRO-07E-1 — leitura honesta em `/admin/financeiro`: escopo e baseline

**Data:** 15/10/2026

**Status deste documento:** registro anterior à implementação. Nenhuma tela, API, regra de autorização, gate ou CSV foi alterado para produzi-lo.

## 1. Base efetivamente conferida

- Branch fixada da sessão: `arena/aa312267-gruposegsystemseguranca`. Nenhuma troca de branch; nenhum stash ou commit de sessão anterior foi reaplicado.
- `HEAD` local == `origin/main` == `fa5d0f5659045a8accaaa0ebd2574b9da5aab84c` (merge da PR #231), divergência **0/0** após `git fetch origin --prune`. Árvore de trabalho limpa.
- Worktree único: `/home/user/gruposegsystemseguranca`.
- PRs abertas na conferência: somente **#230** (`arena/fde056de-gruposegsystemseguranca`, leitura de `/admin/operacao`), estado `CONFLICTING`. **Não foi fechada, reaberta, alterada nem teve conteúdo reaplicado** — o proprietário não autorizou.
- #228 permanece `CLOSED` (redundante com a #227): não reaberta, commits não reaplicados.
- Merges conferidos: #227 `85e1e07`, #229 `2eb5ca9`, #231 `fa5d0f5` — todos presentes em `origin/main`.
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2` (igual ao registrado).
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65` (igual ao registrado).
- Nenhum dos dois arquivos protegidos tem mudança legítima na main atual; os hashes herdados foram conferidos **antes** de qualquer edição e valem como baseline.

Foram relidos antes desta definição: `AGENTS.md`, `README.md`, `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md:103-108` (seção UX-PRO-07), `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md` (mapa fatiado), `docs/UX-PRO-07D-1-RELATORIO-2026-10-15.md` e `docs/UX-PRO-07D-2-RELATORIO-2026-10-15.md`.

## 2. Identificação da próxima fatia realmente pendente

O mapa fatiado (`docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md:44-58`) declara a ordem **provisória** e exige reconferência contra a `main`. Estado verificado neste SHA:

| Fatia | Rota | Estado em `origin/main` |
| --- | --- | --- |
| 07A | `/admin/patrimonio` | entregue (#222) — não reaberta |
| 07B-1/2 | `/admin/emergencial` | entregue (#223, #224, #225) — não reaberta |
| 07C-1/2 | `/admin/fornecedores` | entregue (#226, #227) — não reaberta |
| 07D-1 | `/admin/operacao` leitura canônica | entregue (#229) — não reaberta |
| 07D-2 | `/admin/operacao` ciência de escala | entregue (#231) — escopo entregue não reaberto |
| **07E** | **`/admin/financeiro`** | **nunca recebeu etapa UX-PRO-07**: `capturas_stage` no inventário continua `ux-07-financeiro` (etapa anterior UX-07 fatia B) |

Não foi presumida passagem automática para 07E. Antes de escolhê-la, foi verificada a pendência real dentro de `/admin/operacao`: a única escrita canônica da rota (`POST /api/ops/schedule-acks`, `OperacaoWorkspace.tsx:550`) já foi tratada pela 07D-2, e o que resta na rota são exatamente os achados transversais/herdados listados na instrução do proprietário (legado avançado E2, datas/fuso E3, rolagem interna E5, `<main>` aninhado E6, contraste noturno E8, quebra de palavras E9) — itens que exigem decisão explícita de escopo e **não** foram tocados aqui.

Auditoria de `/admin/financeiro` neste SHA (13 arquivos, 2.621 linhas): a rota já possui `financeRequest` com descritor de erro (`src/lib/finance-request.ts`) e o painel próprio descarta as três listas quando uma leitura não é `ok` (`FinanceiroWorkspace.tsx:145-152`). Permanece, porém, o defeito da **classe D1** já corrigido em `/admin/operacao` pela 07D-1:

> Uma resposta **2xx cujo corpo não traz a lista canônica** (chave ausente, valor não-array ou JSON ilegível) é apresentada como **"nenhum registro"**, sem falha declarada.

O servidor **garante** a chave canônica no 200 e devolve `[]` quando realmente não há registro — exemplo: `src/server/fin-advanced-api.mjs:83` devolve `{ statements: rows, synthetic: true }`. Logo exigir a chave + `Array.isArray` no cliente **não** transforma vazio legítimo em falha: preserva o vazio honesto e elimina apenas o vazio falso. É o mesmo critério de `opsReadList` (`src/app/admin/operacao/OperacaoWorkspace.tsx:336-344`).

## 3. Decisão explícita de escopo do proprietário

A primeira contagem apresentada ao proprietário (22 ocorrências em 5 arquivos) estava **errada**: os sub-workspaces menores são minificados em linhas longas e usam `||[]` sem espaço, que a expressão regular inicial não capturou. A contagem corrigida, antes de qualquer edição, é **40 ocorrências da classe D1 em 13 arquivos**:

| Arquivo | Ocorrências | Nesta fatia |
| --- | --- | --- |
| `FinanceiroWorkspace.tsx` | 7 (`:155,158,159,163,287,294,310`) | **sim** |
| `BankReconciliationWorkspace.tsx` | 5 (`:106-110`) | **sim** |
| `CollectionWorkspace.tsx` | 4 (`:75-77,139`) | **sim** |
| `BudgetWorkspace.tsx` | 3 (`:132,144,155`) | **sim** |
| `CashflowWorkspace.tsx` | 3 (`:87-89`) | **sim** |
| `FiscalWorkspace.tsx` | 4 (`:44` ×4) | não — 07E-2 |
| `GatewayWorkspace.tsx` | 3 (`:49` ×3) | não — 07E-2 |
| `ClosureWorkspace.tsx` | 2 (`:9,13`) | não — 07E-2 |
| `CommissionWorkspace.tsx` | 2 (`:11,15`) | não — 07E-2 |
| `CostAllocationWorkspace.tsx` | 2 (`:37` ×2) | não — 07E-2 |
| `ExportWorkspace.tsx` | 2 (`:15,21`) | não — 07E-2 |
| `ExpenseWorkspace.tsx` | 2 (`:61,72`) | não — 07E-2 |
| `ManagementResultsWorkspace.tsx` | 1 (`:33`) | não — 07E-2 |

Com a contagem corrigida em mãos, o proprietário decidiu **manter os 5 arquivos aprovados (22 ocorrências)** e **registrar os 8 restantes (18 ocorrências) como pendência 07E-2**. Consequência declarada desde já: **esta fatia NÃO fecha a classe D1 na rota inteira** — ela fecha o painel próprio e quatro sub-workspaces. As oito áreas restantes continuam com o vazio falso e serão tratadas em fatia própria.

## 4. Escopo pequeno autorizado

**Uma rota, um escopo:** leitura honesta em `/admin/financeiro` — resposta 2xx sem lista canônica deixa de virar ausência de registro.

Incluído:

1. painel próprio (`FinanceiroWorkspace.tsx`): recebíveis, regras de recorrência, pagamentos, histórico da conta e relatório de baixas F03;
2. `BankReconciliationWorkspace.tsx`: extratos, transações, recebíveis, pagáveis e conciliações;
3. `BudgetWorkspace.tsx`: orçamentos, cenários e histórico;
4. `CashflowWorkspace.tsx`: snapshots, aging e recebíveis;
5. `CollectionWorkspace.tsx`: políticas, recebíveis, lembretes e histórico;
6. gate focal novo, estritamente aditivo, com auditoria TAP;
7. evidências em diretórios exclusivos e inventário regenerado pelo gerador.

Fora do escopo (nada será alterado):

- os 8 sub-workspaces restantes da rota (18 ocorrências) — pendência **07E-2**;
- qualquer método, URL, query, payload, cabeçalho, credencial, `Idempotency-Key`, permissão, regra de negócio, auditoria, migração, servidor ou banco;
- `src/lib/finance-vocabulary.mjs` e `src/lib/finance-vocabulary.d.mts` — o teste anti-deriva `tests/ux-finance-vocabulary.test.mjs:109-118` proíbe tradução de código que os servidores não devolvem; por isso o código de diagnóstico desta tela **não** entra no vocabulário (mesma decisão da 07D-1 em `OperacaoWorkspace.tsx:317-321`);
- `page.tsx`, `AdminGate`, papéis (`financeiro|marcelo|admin|ti`) e a regra "menu não é autorização";
- as 16 abas, o tablist, o teclado, o vocabulário em português e a apresentação de valores em reais;
- achados transversais da #229: legado avançado (E2), datas/fuso (E3), rolagem interna de tabelas (E5), `<main>` aninhado (E6), contraste noturno de estilos compartilhados (E8) e quebra de palavras (E9);
- C11 — continua reservado a ordem explícita do proprietário, como item separado e registrado;
- 07A, 07B-1, 07B-2, 07C-1, 07C-2, 07D-1 e o escopo entregue da 07D-2;
- validação manual, homologação, revisão humana ou aceite humano.

## 5. Contratos inventariados e preservados

Leituras tocadas (todas continuam com o mesmo método `GET`, URL, cabeçalhos e credenciais):

| Superfície | Endpoints | Chave canônica |
| --- | --- | --- |
| Painel próprio | `/api/admin/finance/f03/receivables`, `/api/fin/recurrence-rules`, `/api/fin/payments`, `/api/fin/payment-history?receivable_id=`, `/api/admin/finance/f03/reports` | `receivables`, `rules`, `payments`, `history`, `reports` |
| Conciliação | `/api/fin/bank-statements`, `/api/fin/bank-transactions`, `/api/fin/receivables`, `/api/fin/payables`, `/api/fin/conciliations` | `statements`, `transactions`, `receivables`, `payables`, `conciliations` |
| Orçamento | `/api/fin/budgets`, `/api/fin/budget-scenarios`, `/api/fin/budget-history?budget_id=` | `budgets`, `scenarios`, `history` |
| Fluxo de caixa | `/api/fin/cashflow-snapshots`, `/api/fin/aging-receivables`, `/api/fin/receivables` | `snapshots`, `aging`, `receivables` |
| Cobrança | `/api/fin/collection-policies`, `/api/fin/receivables`, `/api/fin/collection-reminders`, `/api/fin/collection-history` | `policies`, `receivables`, `reminders`, `history` |

- `financeRequest` (`src/lib/finance-request.ts:16-46`) permanece **intacto**: mesmas URL, método, corpo, cabeçalhos (`accept`, `content-type` condicional) e `credentials: 'same-origin'`, `cache: 'no-store'`. O leitor novo é uma função **acrescentada** ao lado, não uma modificação.
- Os `request()`/`api()` locais dos sub-workspaces (`BankReconciliationWorkspace.tsx:41-49`, `BudgetWorkspace.tsx:87-95`, `CashflowWorkspace.tsx:57-62`, `CollectionWorkspace.tsx:39-44`) permanecem **intactos** e continuam servindo todas as escritas; a leitura de lista ganha um caminho próprio que reproduz **exatamente** os mesmos cabeçalhos (`Content-Type: application/json`) e método, sem acrescentar nem remover cabeçalho.
- Nenhuma escrita (`POST`/`PATCH`) é alterada: `Idempotency-Key` existente em `/api/admin/finance/f03/reports` (`FinanceiroWorkspace.tsx:303`) é preservada e nenhuma chave nova é inventada.
- Nenhuma mudança de servidor, auditoria, migração, banco persistente, tenancy, transição, URL pública ou outra rota.

## 6. Gate aditivo e prova exigida

- Arquivo de testes herdado `tests/ux-finance-workspace.integration.test.mjs`: **8 casos herdados preservados byte a byte** (347 linhas, 17.004 bytes, SHA-256 `42dc4da39b583445e338c9fb7d8586d43c6b1a9bc8745768b4290280f7e8ec74`). Os casos novos são **acrescentados após** esse prefixo; nenhuma asserção herdada é editada, removida ou relaxada.
- Runner novo e independente `scripts/qa-ux-pro-07e1-postgres.mjs`: cluster PostgreSQL exclusivo e descartável, migrações vigentes reais, servidor HTTP real e Chromium. Recusa banco fornecido pelo operador (`DATABASE_URL`, `DATABASE_MIGRATION_URL`, `RUN_DATABASE_INTEGRATION_REMOTE`) e limpa o cluster ao fim. O runner herdado `scripts/qa-ux-finance-postgres.mjs` permanece intacto.
- **Auditoria TAP**: rejeita `not ok`, diretiva `SKIP`/`TODO`, resumo ausente ou incompleto, total diferente das aprovações, qualquer `fail`/`skipped`/`todo` e aprovações abaixo do mínimo. **Não permite filtro de testes** (o runner herdado aceita `UX_FINANCE_TEST_PATTERN`; o novo não).
- Falhas, atrasos e corpos ilegíveis são injetados **somente em `window.fetch` da página**, como nos gates anteriores da série. Nenhum erro é injetado no servidor, banco, proxy ou auditoria.
- Massa inteiramente sintética, criada pelas próprias APIs financeiras no banco descartável.
- Workflow aditivo `.github/workflows/ux-pro-07e1-delivery.yml`, com filtro `paths:` restrito a `src/app/admin/financeiro/**`, de modo que o inventário o associe somente a esta rota.

Provas obrigatórias para encerrar a fatia:

1. **Baseline** do gate novo contra a implementação anterior intacta, com os casos novos reprovando e os 8 herdados passando, em diretório próprio `docs/ux-pro-07-financeiro-evidencias/antes-07e-1/`, sem sobrescrever evidência existente.
2. **Vazio legítimo preservado**: 2xx com listas vazias continua mostrando o vazio honesto, não falha.
3. **Duas execuções finais independentes** do gate, ambas acima do mínimo, sem `fail`/`skip`/`todo`.
4. **Bateria pré-PR**: `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `npm run test:l06-delivery:pg`, `npm run test:l08-delivery:pg`, `npm run test:ext04-suppliers:pg`, `node --test tests/ux-finance-vocabulary.test.mjs`, `npm run test:ux-finance:pg` (herdado) e o gate novo.
5. **Arquivos protegidos**: `git checkout -- next-env.d.ts tsconfig.json` após o build e após **cada** gate que suba Next.js, com `sha256sum -c` dos hashes da seção 1.
6. **CSVs regenerados somente por `node scripts/ux-pro-00-inventory.mjs`**, com prova de que o diff se restringe à linha de `/admin/financeiro`. Nunca editar CSV à mão.
7. **Relatório antes/depois** com referências `file:line`, limitações explícitas e as duas declarações obrigatórias.

Esta fatia fecha somente o escopo de leitura honesta especificado acima. **Não conclui UX-PRO-07, não conclui 07E e não fecha a classe D1 na rota inteira.**

Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu

As medições automatizadas não equivalem a auditoria WCAG completa
