# UX-PRO-07E-2 — leitura honesta de resposta 2xx sem lista canônica nas 8 superfícies restantes de `/admin/financeiro`

**Data:** 15/10/2026

**Status deste documento:** registro anterior à implementação. Nenhuma tela, API, regra de autorização, gate ou CSV foi alterado para produzi-lo.

## 1. Base efetivamente conferida

- Branch fixada da sessão: `arena/71865335-gruposegsystemseguranca`. Nenhuma troca de branch; nenhum stash ou commit de sessão anterior foi reaplicado.
- `HEAD` local == `origin/main` == `61ec10bc24ffc9bc7ae462e104b49d7b26b8f3eb` (merge da PR #232, 07E-1), divergência **0/0** após `git fetch --prune origin`. Árvore de trabalho limpa.
- Worktree único: `/home/user/gruposegsystemseguranca`.
- PRs abertas na conferência: somente **#230** (`arena/fde056de-gruposegsystemseguranca`, 07D-1 antiga de `/admin/operacao`, `OPEN`/`CONFLICTING`). **Não foi fechada, reaberta, alterada nem teve conteúdo reaplicado** — o proprietário não autorizou.
- #228 permanece `CLOSED` (redundante com a #227): não reaberta; commits não reaplicados.
- Merges conferidos: #229 `2eb5ca9`, #231 `fa5d0f5`, #232 `61ec10b` — todos presentes em `origin/main`.
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2` (igual ao registrado).
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65` (igual ao registrado).
- Nenhum dos dois arquivos protegidos tem mudança legítima na main atual; os hashes herdados continuam válidos como baseline.
- Prefixo herdado do gate confirmado ANTES de qualquer reconstrução: `tests/ux-finance-workspace.integration.test.mjs` tem **858 linhas / 45.438 bytes / SHA-256 `21c4f686f343bdea9f8dc972dc931edbd77320b912fb93166661af35df889884`** (22 casos `test(`). O prefixo interno da 07E-1 (347 linhas / 17.004 bytes / `42dc4da39b583445e338c9fb7d8586d43c6b1a9bc8745768b4290280f7e8ec74`) segue íntegro dentro dele.

Foram relidos antes desta definição: `AGENTS.md`, `README.md`, `docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md` (seção UX-PRO-07), `docs/UX-PRO-07E-1-ESCOPO-ANTES-2026-10-15.md`, `docs/UX-PRO-07E-1-RELATORIO-2026-10-15.md` e os comentários de registro em `src/lib/finance-request.ts:69-78`.

## 2. Identificação da próxima fatia realmente pendente

A UX-PRO-07E-2 está registrada como próxima fatia em dois lugares do main atual: comentário em `src/lib/finance-request.ts:69-78` e seção "Não fecha" de `docs/UX-PRO-07E-1-RELATORIO-2026-10-15.md`. A decisão de remeter estas 18 ocorrências para uma fatia própria (em vez de ampliar a 07E-1) foi do owner, em duas rodadas de pergunta/resposta registradas no relatório da 07E-1. Nenhuma outra fatia do programa foi presumida: os achados E2–E9 e os transversais exigem decisão de escopo explícita do owner e continuam parados; C11 permanece fora de escopo.

## 3. Mapa de ocorrências auditado (grep robusto, antes do código)

Padrões de busca em `src/app/admin/financeiro/`: `\|\|\s*\[\]`, `\|\|\[\]` e `\?\? \[\]` (inclui `||[]` sem espaço). Os 5 arquivos já fechados na 07E-1 (`FinanceiroWorkspace`, `BankReconciliationWorkspace`, `CollectionWorkspace`, `CashflowWorkspace`, `BudgetWorkspace`) foram excluídos do recorte.

**18 leituras D1 (resposta 2xx cujo corpo troca a lista canônica por `[]`) em 8 arquivos:**

| # | Arquivo | Linha | Endpoint GET | Chave canônica | Atual |
| --- | --- | --- | --- | --- | --- |
| 1 | `FiscalWorkspace.tsx` | 44 | `/api/fin/fiscal-activity-rules` | `rules` | `r.rules\|\|[]` |
| 2 | `FiscalWorkspace.tsx` | 44 | `/api/fin/fiscal-providers` | `providers` | `p.providers\|\|[]` |
| 3 | `FiscalWorkspace.tsx` | 44 | `/api/fin/fiscal-obligations` | `obligations` | `o.obligations\|\|[]` |
| 4 | `FiscalWorkspace.tsx` | 44 | `/api/fin/fiscal-documents` | `documents` | `d.documents\|\|[]` |
| 5 | `GatewayWorkspace.tsx` | 49 | `/api/fin/payment-gateways` | `gateways` | `g.gateways\|\|[]` |
| 6 | `GatewayWorkspace.tsx` | 49 | `/api/fin/gateway-webhooks` | `webhooks` | `w.webhooks\|\|[]` |
| 7 | `GatewayWorkspace.tsx` | 49 | `/api/fin/gateway-charges` | `charges` | `c.charges\|\|[]` |
| 8 | `ClosureWorkspace.tsx` | 9 | `/api/fin/competence-closures` | `closures` | `d.closures\|\|[]` |
| 9 | `ClosureWorkspace.tsx` | 13 | `/api/fin/report-versions?closure_id=` | `versions` | `d.versions\|\|[]` |
| 10 | `CommissionWorkspace.tsx` | 11 | `/api/fin/commission-provisions` | `provisions` | `d.provisions\|\|[]` |
| 11 | `CommissionWorkspace.tsx` | 15 | `/api/fin/commission-provision-history?provision_id=` | `history` | `d.history\|\|[]` |
| 12 | `CostAllocationWorkspace.tsx` | 37 | `/api/fin/cost-imports` | `imports` | `importData.imports\|\|[]` |
| 13 | `CostAllocationWorkspace.tsx` | 37 | `/api/fin/costs` | `costs` | `costData.costs\|\|[]` |
| 14 | `ExportWorkspace.tsx` | 15 | `/api/fin/exports` | `exports` | `d.exports\|\|[]` |
| 15 | `ExportWorkspace.tsx` | 21 | `/api/fin/export-logs?export_id=` | `logs` | `d.logs\|\|[]` |
| 16 | `ExpenseWorkspace.tsx` | 61 | `/api/fin/expenses` | `expenses` | `lists.value.expenses ?? []` |
| 17 | `ExpenseWorkspace.tsx` | 72 | `/api/fin/expense-history?expense_id=` | `history` | `json.history ?? []` |
| 18 | `ManagementResultsWorkspace.tsx` | 33 | `/api/fin/management-results` | `results` | `b.results\|\|[]` |

Confirmação de contrato no servidor (lida antes do código): os 18 endpoints existem com quatro aliases cada (`/api/admin/hr/fin-*`, `/api/crm/hr/fin-*`, `/api/hr/fin-*`, `/api/fin/*`) em `server.mjs:3904-3993`, e os handlers sempre enviam a chave no 200, `[]` quando o vazio é legítimo (`src/server/fin-management-api.mjs:57,164,283,381,392,479,587,800,919,1080`; `src/server/fin-advanced-api.mjs:823,908`; `src/server/fin-budget-api.mjs:472,621,635,754,771,904`). É isso que autoriza a tela a exigir a chave em vez de aceitar `[]`.

**2 hits relacionados, auditados e FORA do recorte D1 desta fatia** (não são leitura de lista canônica — são fallback de campo/render sobre dado já lido; ficam registrados sem correção misturada):

- `FiscalWorkspace.tsx:52` — `(provider.supported_obligations||[])`: campo de um registro já validado.
- `ExpenseWorkspace.tsx:152` — `(history[e.id]||[])`: fallback de render da lista de histórico (o D1 correspondente é a ocorrência #17; com ela corrigida, o fallback só enxerga lista confirmada ou estado de falha).

## 4. O que esta fatia fecha — e o que não entra

Entra (e só isto): as 18 leituras acima passam a exigir a chave canônica `Array.isArray` na resposta 2xx; fora isso, **falha declarada de leitura** com o descritor `invalid_finance_response` já existente (`src/lib/finance-request.ts:71,106`), em vez de vazio falso ou quebra de render. O vazio legítimo (chave presente com `[]`) continua vazio concluído.

Não entra nesta fatia:
- Escritas (POST/PATCH) de qualquer uma das 8 superfícies: métodos, URLs, payloads, cabeçalhos, `duplicate_ack`/`idempotent_replay`, `Idempotency-Key` existente (FIN-14 `storage_key` sintético, FIN-16 `idempotency_key` do formulário, FIN-10/11/12 chaves informadas pela tela) permanecem byte a byte como estão. Nenhuma `Idempotency-Key` nova será inventada.
- `ExpenseWorkspace.tsx` leitura de `expense-authorities` → chave `authority` (objeto/null, não lista): fora da classe D1.
- Os 2 hits relacionados da seção 3.
- Achados E2–E9 do plano mestre e os transversais do PR #229 (legado avançado em `src/app/admin/ti/OpsAdvanced2Client.tsx`/`OpsAdvanced3Client.tsx`, datas/fuso, rolagem interna de tabelas, `<main>` aninhado em `src/app/admin/AdminGate.tsx:115`, releitura explícita/hora da última leitura, contraste noturno 1,95:1 em `src/components/ui/UiWorkspace.module.css:72,:103` e `src/app/admin/admin-theme.css:154`, quebra de palavra em cabeçalhos a 768px em `UiWorkspace.module.css:11`): cada um continua exigindo decisão de escopo explícita do owner.
- C11: fora de escopo; somente por ordem explícita do owner.
- `src/lib/finance-vocabulary.mjs`: não será alterado (anti-deriva em `tests/ux-finance-vocabulary.test.mjs`). O descritor de tela continua em `src/lib/finance-request.ts`.
- Nenhuma outra rota será tocada.

## 5. Plano de implementação (após este registro)

1. **Código (estritamente aditivo em contrato):** em cada arquivo, um leitor local (`apiList`/`requestList`/`readList`) que reproduz EXATAMENTE método, URL, cabeçalhos e cache do helper de fetch já existente (que permanece intacto servindo as escritas) e lança `Error(financeInvalidListMessage(status))` quando a chave não é array. Apresentação:
   - Superfícies cujo vazio já é guardado por `!error` (FIN-15, FIN-16, FIN-14, FIN-10, FIN-09): o canal de erro existente (`fin15-read-error`, `fin16-read-error`, `fin14-read-error`, `fin10-error`, `fin09-error`) recebe a mensagem descrita; o texto de vazio falso fica suprimido pela guarda herdada. Leituras sob demanda (versões FIN-15, histórico FIN-16, trilha FIN-14, histórico FIN-10) ganham canal de erro próprio (novos testids `fin15-versions-error`, `fin16-history-error`, `fin14-logs-error`, `fin10-history-error-<id>`), sem afirmar "Sem eventos." sobre falha.
   - Superfícies de grupo com vazio sem guarda (FIN-11 4 listas, FIN-12 3 listas, FIN-08 2 listas): padrão idêntico ao da 07E-1 em `BankReconciliationWorkspace.tsx` — flag `readConfirmed` (grupo tudo-ou-nada, como já faz o FIN-05) e marcadores novos `fin11-{rules,providers,obligations,documents}-unavailable`, `fin12-{gateways,webhooks,charges}-unavailable`, `fin08-{imports,costs}-unavailable` com o texto "Lista indisponível — a leitura não foi confirmada; não confundir com ausência de …".
2. **Gate estritamente aditivo:** `tests/ux-finance-workspace.integration.test.mjs` é reconstruído por acréscimo após a linha 858; o prefixo de 858 linhas / 45.438 bytes / SHA-256 `21c4f686…` será conferido antes e depois. Nenhuma asserção herdada é editada, removida ou relaxada. Os casos novos cobrem: contrato HTTP das 18 chaves; corpo 2xx inválido por superfície (as 18 ocorrências); leituras sob demanda; vazio legítimo preservado; falha declarada sem transbordo em 1440/768/390/320 com capturas. Injeção somente em `window.fetch` da página, apenas em GET, como no padrão `openFinanceInvalidBody` herdado.
3. **Baseline:** o gate novo roda contra a implementação anterior com capturas em `docs/ux-pro-07-financeiro-evidencias/antes-07e-2/` (diretório próprio; nenhuma evidência existente é sobrescrita). Esperado: casos novos reprovados com o vazio falso/quebra visível — evidência do defeito, não defeito do gate.
4. **Runner + workflow:** `scripts/qa-ux-pro-07e2-postgres.mjs` (PostgreSQL descartável, HTTP real, Chromium, auditoria TAP reprova fail/skip/todo/resumo ausente e aprovações abaixo do mínimo) e `.github/workflows/ux-pro-07e2-delivery.yml` com `paths:` preciso (arquivos da rota tocados, `src/lib/finance-request.ts` apenas se alterado, o teste, o runner e o próprio workflow).
5. **Execuções finais:** duas independentes (`depois-07e-2/execucao-1/`, `execucao-2/`), com `resumo.json` próprio que omite `firstFocus`/`percursoTeclado` (não medidos aqui; o inventário agrega por rota, não sobrescreve).
6. **CSVs:** somente `node scripts/ux-pro-00-inventory.mjs`; diff deve se limitar à linha de `/admin/financeiro` (workflow novo classificado como gate focal).
7. **Arquivos protegidos:** após build e cada gate que inicia Next.js, `git checkout -- next-env.d.ts tsconfig.json` e conferência dos hashes da seção 1.
8. **Bateria completa antes da PR:** `npm ci`; `npm test`; `npm run typecheck`; `npm run build`; `node scripts/qa-wave0-static.mjs`; `node scripts/ux-pro-00-inventory.mjs --check`; `npm run test:l06-delivery:pg`; `npm run test:l07-delivery:pg`; `npm run test:l08-delivery:pg`; `npm run test:ext04-suppliers:pg`; `node --test tests/ux-finance-vocabulary.test.mjs`; `npm run test:ux-finance:pg` (herdado, sem edição); gate novo (duas execuções). Antes de tocar os componentes de rota, `tests/` já foi varrido pelos testids FIN-08..FIN-16 (L07 cobre FIN-05/06/07/13, o painel e jornadas FIN-08..FIN-16 — ver seção 6).
9. **Entrega:** push no branch pinado; PR pequena com escopo/evidências/declarações; checks remotos verdes; `MERGEABLE`/`CLEAN`; revisão técnica automatizada como comentário; merge com `gh pr merge <n> --merge` como último comando da cadeia; confirmação em `origin/main`.

## 6. Preservações verificadas antes de editar (grep em `tests/`)

- `tests/l07-delivery.integration.test.mjs:2890-2899` — leitura 500 + retry em FIN-14/15/16 exige `fin14-read-error`/`fin15-read-error`/`fin16-read-error` com `/não foi possível/i` e limpeza após `fin{14,15,16}-retry`: o caminho de falha HTTP não-2xx mantém a frase herdada (o prefixo "Não foi possível ler …" também envolve a mensagem nova de corpo inválido).
- `tests/l07-delivery.integration.test.mjs:972` — FIN-09: 500 → `fin09-error` com `/internal|falha/i`, `fin09-list` com 0 `li`, `fin09-retry` recarrega.
- `tests/l07-delivery.integration.test.mjs:1316` — FIN-10: falha de leitura não mostra `fin10-empty`; `:1330-1331` busca sem resultado mostra `fin10-empty` com "busca aplicada" (vazio legítimo confirmado); `:1345-1355` histórico feliz com alçada em `fin10-history-<id>` preservado.
- `tests/l07-delivery.integration.test.mjs:2915` — `fin15-versions` → `fin15-version-list` com 2 versões preservadas: caminho feliz das versões preservado.
- Nenhum teste do repositório asserta os textos de vazio ("Nenhuma regra cadastrada.", "Nenhum provedor.", "Nenhuma obrigação.", "Nenhum documento.", "Nenhum gateway cadastrado.", "Nenhuma importação.", "Nenhum custo.", "Nenhuma competência encontrada.", "Nenhuma provisão encontrada.", "Nenhuma exportação encontrada.", "Nenhum resultado registrado.", "Nenhuma solicitação.", "Sem eventos.") das 8 superfícies — a troca do vazio falso pelo marcador de indisponibilidade (FIN-11/12/08) não quebra asserção herdada alguma.

## 7. Declarações

Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu. As medições automatizadas não equivalem a auditoria WCAG completa. Esta fatia fecha somente o escopo especificado na seção 4 e **não conclui o UX-PRO-07**: permanecem pendentes os achados E2–E9, os transversais do PR #229 e C11, cada um à espera de decisão de escopo explícita do owner.
