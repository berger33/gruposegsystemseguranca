# UX-PRO-07C-2 — escopo, baseline e medição anterior: estados de escrita em `/admin/fornecedores`

**Data:** 15/10/2026

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

**Fatia registrada aqui:** UX-PRO-07C-2 — estado de envio pendente, prevenção de duplo clique, reconciliação de resultado, classificação de falha e fail-closed das nove mutações canônicas de `/admin/fornecedores`, exatamente o que a UX-PRO-07C-1 deixou registrada como pendente na seção 8 do seu relatório ("Escritas fora do escopo").

**Origem do recorte:** `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`, seção 2, linha 07C, dividida nas subfatias 07C-1 (leitura, PR #226) e 07C-2 (escritas, esta fatia) no mesmo padrão da divisão 07B-1/07B-2.

## 1. Base realmente conferida

Conferência feita no checkout desta sessão, antes de qualquer edição de tela:

- branch de trabalho: `arena/f074d327-gruposegsystemseguranca` (branch fixa da sessão);
- `HEAD` local e `origin/main`: `ff0e6d620104364a35438785d8767400704d90cf` (merge da PR #226, UX-PRO-07C-1), confirmado por `git fetch origin main` e `git rev-parse`; árvore de trabalho limpa (`git status --porcelain` vazio);
- PRs abertas: **nenhuma** (`gh pr list --state open` vazio); a trilha anterior (#223, #224, #225, #226) consta `MERGED` e já está em `origin/main`; a fatia 07A (`/admin/patrimonio`) foi entregue antes da PR #222;
- `git stash list`: vazio; nenhum stash antigo reaplicado;
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`;
- dependências instaladas com `npm ci` (81 pacotes, 0 vulnerabilidades);
- `node scripts/ux-pro-00-inventory.mjs --check` → `OK`; 100 entradas de rota; contagem estática, não equivale a passagem visual, teste de estados ou aceite humano.

Foram lidos antes deste registro: `AGENTS.md`, `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`, o mapa mestre `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`, `docs/UX-PRO-07-PATRIMONIO-ESTADOS-2026-10-14.md`, `docs/UX-PRO-07-ESCOPO-EMERGENCIAL-ANTES-2026-10-14.md`, `docs/UX-PRO-07-EMERGENCIAL-RELATORIO-2026-10-14.md`, `docs/UX-PRO-07B-2-ESCOPO-ANTES-2026-10-14.md`, `docs/UX-PRO-07B-2-RELATORIO-2026-10-14.md`, `docs/UX-PRO-07B-2-CONTINUACAO-2026-10-14.md`, `docs/UX-PRO-07C-1-ESCOPO-ANTES-2026-10-14.md`, `docs/UX-PRO-07C-1-RELATORIO-2026-10-14.md`, os dois CSVs vigentes de 13/10/2026, `scripts/ux-pro-00-inventory.mjs`, `scripts/qa-ux-supplier-postgres.mjs`, `tests/ux-supplier-workspace.integration.test.mjs`, `tests/ux-supplier-vocabulary.test.mjs`, `src/app/admin/fornecedores/FornecedoresWorkspace.tsx`, `src/lib/supplier-read.ts`, `src/lib/supplier-request.ts`, `src/lib/supplier-vocabulary.mjs` (+ `supplier-vocabulary.d.mts`), `src/lib/emergency-request.ts` (padrão 07B-2 da escrita), `src/server/ext-supplier-api.mjs` e `src/components/ui/UiState.tsx`.

Nada de UX-PRO-07A, 07B-1, 07B-2 (inclusive continuação B16/B17) ou 07C-1 é reaberto: nenhum arquivo de `/admin/patrimonio`, `/admin/emergencial`, `src/lib/asset-request.ts`, `src/lib/emergency-request.ts` ou do caminho de leitura de `supplier-read.ts` é tocado por esta fatia, e nenhuma asserção herdada é editada.

## 2. Mapa das nove mutações que a subfatia trata

Todas com `Idempotency-Key` obrigatório, mesma origem e permissões checadas no servidor (`src/server/ext-supplier-api.mjs`, `guard` com `write: true`).

| # | Mutação | Verbo/URL (inalterada) | Rótulo do gerador de chave (inalterado) | Resposta canônica de sucesso | Chave canônica do corpo 2xx |
| --- | --- | --- | --- | --- | --- |
| 1 | Criar cotação | `POST /api/ext/supplier/suppliers/:supplierId/products/:productId/quotations` | `create-quotation` | `201` `{quotation, volume_condition, external_actor_boundary}` | `quotation.id` |
| 2 | Transição de status da cotação | `POST /api/ext/supplier/quotations/:id/status` | `quote-<id>-<status>` | `200` `{quotation}` | `quotation.id` |
| 3 | Decisão (aprovar/rejeitar) | `POST /api/ext/supplier/quotations/:id/decision` | `decision-<id>` | `200` `{quotation}` | `quotation.id` |
| 4 | Validade | `POST /api/ext/supplier/quotations/:id/validities` | `validity-<id>` | `201` `{validity, derived, source}` | `validity.id` |
| 5 | Regra de alerta | `POST /api/ext/supplier/quotations/:id/alert-rules` | `alert-<id>` | `201` `{alert_rule, source}` | `alert_rule.id` |
| 6 | Referência documental | `POST /api/ext/supplier/quotations/:id/documents` | `document-<id>` | `201` `{document, superseded_document_id, document_boundary}` | `document.id` |
| 7 | Criar pedido derivado | `POST /api/ext/supplier/quotations/:id/orders` | `order-<id>` | `201` `{order, external_actor_boundary}` | `order.id` + `order.protocol` (lidos pela tela) |
| 8 | Transição de status do pedido | `POST /api/ext/supplier/orders/:id/status` | `order-<orderId>-<status>` | `200` `{order}` | `order.id` |
| 9 | Prazo do pedido | `POST /api/ext/supplier/orders/:id/deadlines` | `deadline-<orderId>` | `201` `{deadline, derived}` | `deadline.id` |

Replay idempotente do servidor: `200` com o corpo canônico de `onReplay` acrescido de `replayed: true` (`ext-supplier-api.mjs`, `runMutation`). Para validade, regra de alerta, documento e prazo, o `onReplay` devolve o registro vigente (que pode ser `null` se já foi substituído por outro fluxo); o recibo destas quatro aceita `replayed: true` como confirmação de aplicação.

Contratos que esta subfatia não pode quebrar:

- `tests/ux-supplier-workspace.integration.test.mjs:15` (caso 1, herdado) exige que a UI continue declarando `<h1>EXT-04 — Fornecedores</h1>`, `role="tablist"`, `data-ui-state="denied"`, `supplierRequest` e `Sem upload real`;
- `tests/ux-supplier-vocabulary.test.mjs` exige cobertura de todos os códigos literais do servidor, handlers despachados e o wrapper `supplierRequest` com `payload:unknown` e `credentials:'same-origin'`;
- `tests/admin-page-gates.test.mjs:26` exige `page.tsx` com a ordem publicada `["marcelo","admin","ti"]`;
- `tests/ui-surface-locale.test.mjs` recusa `toLocale…String()` sem localidade explícita em `src/app` e `src/components`;
- `tests/ext04-suppliers.test.mjs` e `tests/ext04-suppliers.integration.test.mjs` provam payload, idempotência, replay, concorrência, auditoria e imutabilidade no servidor. Nenhuma dessas asserções é tocada;
- o gerador de chave permanece `newKey(operation)` = `ext04-${operation}-${crypto.randomUUID()}`, com os mesmos rótulos da tabela acima, e a semântica de preservação permanece: chave guardada enquanto houver falha, apagada somente por uma resposta real bem-sucedida;
- `src/server/ext-supplier-api.mjs`, `server.mjs`, RBAC, permissões, auditoria, migrações e tenancy: intocados.

## 3. Estados atuais de escrita — medição anterior

SHA-base = `ff0e6d6`, `FornecedoresWorkspace.tsx` com 753 linhas (pós-07C-1).

| ID | Medição anterior | Evidência `file:line` no SHA-base |
| --- | --- | --- |
| E1 | Existe `busy` (string da operação em curso) e todos os botões de escrita ficam `disabled={Boolean(busy)}`, mas nenhum elemento declara `aria-busy`, não existe região `role="status"` nomeando qual escrita está em curso nem declaração de que o resultado ainda não foi reconciliado. | `:104` (`busy`), `:231` (`setBusy(operation)`), `:471`, `:552`, `:562-563`, `:577`, `:617`, `:631`, `:673`, `:705`, `:744` (`disabled={Boolean(busy)}` sem `aria-busy`) |
| E2 | `setBusy(operation)` ocorre antes do primeiro `await`, porém não há guarda síncrona (ref): um segundo clique no mesmo tick, antes de o React re-renderizar com `disabled`, não tem bloqueio comprovado por teste. | `:228-242` (`mutate` sem ref; nenhum `useRef` de envio no arquivo) |
| E3 | Sem reconciliação de corpo: `data.quotation.id` e `data.order.protocol` são lidos sem validação — uma resposta `2xx` sem a chave canônica lança `TypeError` sem captura (na criação) ou produz `Pedido undefined derivado…` (no pedido) e é tratada como sucesso; as demais mutações declaram sucesso sem validar o corpo. | `:258` (`data.quotation.id`), `:285` (`data.order.protocol`), `:236-238` (sucesso declarado só pelo status) |
| E4 | Falha de escrita vira uma única mensagem (`title: detail` do vocabulário + rodapé `Código técnico`), sem distinguir conflito (409), validação (400), transitório (5xx/rede) e negativa (401/403), e sem declarar que o resultado da escrita é incerto após falha transitória. | `:236`, `:239-241` (`setWriteError` com string única), `:451-456` (faixa única `fornecedores-escrita-falha`) |
| E5 | `401`/`403` em escrita não falham fechado: a faixa aparece e as listas, o detalhe e os formulários lidos continuam visíveis como se o acesso continuasse válido. | `:236`, `:239-241` contra `:132-142` (`failClosed`, caminho existente da leitura, nunca disparado por escrita) |
| E6 | A chave de idempotência é preservada em falha e reutilizada no reenvio pelo mesmo botão (correto), mas não há affordance explícita de repetição segura: nada explica que reenviar usa a mesma chave, não há botão de repetição e não existe declaração de que a tela não repete o `POST` automaticamente. | `:229-230`, `:237`, `:240` (`Chave preservada para repetição segura: <key>` apenas como texto de erro) |

Restrições herdadas da 07C-1 que permanecem vigentes: a seleção de cotação relê somente o detalhe; as leituras têm estado por recurso com preservação, hora e fail-closed; `2xx` malformada de leitura vira `invalid_supplier_response`. Esta fatia não reabre nenhum desses comportamentos.

### 3.1 Item dependente de decisão — C11

`FornecedoresWorkspace.tsx:422-426` (no SHA-base) mantém `role="tablist"` com cinco `role="tab"` em que `aria-selected` é sempre `index === 0`, sem `aria-controls`, `tabpanel`, troca de aba ou setas/Home/End. Conforme registrado na 07C-1, corrigir C11 reconfigura o layout vigente e passa a ocultar conteúdo hoje sempre visível. **C11 não é tratado nesta subfatia**: exige ordem explícita do proprietário e item separado registrado. Nenhuma asserção será enfraquecida para acomodá-lo.

## 4. Subfatia UX-PRO-07C-2 — incluído e excluído

### Incluído

1. **Estado de envio pendente por ação**: enquanto uma das nove escritas está em curso, a tela declara em região `role="status"` qual ação está sendo enviada (criação da cotação, transição da cotação, decisão, validade, regra de alerta, referência documental, pedido derivado, transição do pedido, prazo) e que o resultado ainda não foi confirmado; o botão da ação em curso recebe `aria-busy`; **os nove controles de escrita ficam bloqueados** durante o envio (escritas concorrentes tocam a mesma máquina de estados canônica; o servidor continua sendo a autoridade). Os controles de **leitura** (`Atualizar listas`/`Atualizar detalhe`) permanecem disponíveis: `GET`s são seguros e o mecanismo da 07C-1 já descarta resposta superada.
2. **Guarda síncrona contra duplo clique**: ref verificada antes do primeiro `await`, de modo que um segundo clique no mesmo tick não dispare segundo `POST`; o `disabled` mantém o bloqueio até a resposta. O gerador de `Idempotency-Key` e seus rótulos permanecem idênticos.
3. **Reconciliação de resultado**: corpo `2xx` validado antes de sucesso com a chave canônica de cada mutação (tabela da seção 2); `2xx` sem a chave canônica vira falha declarada (`invalid_supplier_write_response`), nunca sucesso, nunca ausência e sem derrubar a tela; em sucesso, a tela relê exatamente o que relia antes (listas + detalhe, pelo mecanismo existente `refresh`).
4. **Classificação da falha de escrita com o código real**: transporte novo `src/lib/supplier-write.ts` (sem fetch próprio — as nove mutações continuam saindo pela `supplierRequest` existente) classifica rede, `401`, `403`, transitório (`5xx`/`408`/`429`/`audit_unavailable`/`supplier_journey_unavailable`) e recusa definitiva (conflito/validação/não encontrado), com o código técnico do servidor, a causa canônica do vocabulário e orientação distinta por classe; a faixa `role="alert"` identifica a ação.
5. **Fail-closed em `401`/`403` de escrita**: a negativa dispara a releitura pelo caminho existente da 07C-1, que limpa listas, detalhe, seleção e formulários protegidos e apresenta o estado de negativa sem repetição; a negativa não é apresentada como dado desatualizado.
6. **Incerteza declarada em falha transitória, sem repetição automática e com repetição explícita pela mesma chave**: falha de rede/`5xx`/`2xx` malformada preserva a solicitação original (ação, URL, corpo e `Idempotency-Key`); a faixa `role="alert"` declara que não é possível afirmar se a escrita foi aplicada, que a tela não repete o `POST` automaticamente e oferece botão explícito que reenvia exatamente a solicitação armazenada; enquanto não houver confirmação, as demais escritas ficam bloqueadas; as leituras seguem disponíveis para conferir o estado atual.

### Excluído

- qualquer alteração de verbo, URL, corpo, cabeçalho, gerador/rotulação de chave, estado de domínio, transição canônica, permissão, auditoria, migração ou tenancy; `src/server/ext-supplier-api.mjs` e `server.mjs` não são tocados;
- repetição automática de `POST`, fila de escritas, UI otimista ou reconciliação por polling;
- mudança no caminho de leitura da 07C-1 (`supplier-read.ts`, estados por recurso, seleção, fail-closed de leitura) e nos componentes compartilhados;
- `page.tsx`, `AdminGate`, papéis declarados, metadados e navegação;
- **C11** (abas sem painel) — registrado, não corrigido, conforme a seção 3.1;
- asserções herdadas de `tests/ext04-suppliers*.test.mjs`, `tests/ux-supplier-vocabulary.test.mjs`, `tests/l06-delivery.integration.test.mjs`, `tests/l08-delivery.integration.test.mjs` e dos dez casos vigentes do gate focal (nenhuma é editada, removida ou relaxada; os casos novos são aditivos);
- `/admin/fornecedores` não é misturada com nenhuma outra rota nesta PR;
- validação manual, homologação, revisão humana e aceite humano.

## 5. Prova exigida para encerrar a UX-PRO-07C-2

1. **Gate focal aditivo com navegador real** (`tests/ux-supplier-workspace.integration.test.mjs`, executado por `scripts/qa-ux-supplier-postgres.mjs`: PostgreSQL descartável, migrações reais, servidor HTTP real, Chromium; falhas injetadas somente em `window.fetch` da página), provando: envio pendente por ação com `aria-busy` e `role="status"` e bloqueio das demais escritas com leituras ainda disponíveis; duplo clique enviando exatamente 1 `POST` com payload canônico e `Idempotency-Key` com o rótulo original; falha transitória de escrita com código real, incerteza declarada, listas preservadas com hora, nenhum reenvio automático e repetição explícita que reenvia a mesma URL, o mesmo corpo e a mesma chave e reconcilia de verdade; recusa definitiva (conflito real do servidor) distinta de transitório, com código canônico e sem botão de repetição; `401`/`403` de escrita falhando fechado; `2xx` malformada nunca virando sucesso nem ausência; autorização das escritas preservada no servidor (anônimo `401`, papel sem permissão `403`, papel autorizado `201`/`200`); envio pendente e falha de escrita medidos em 320/390/768/1440 px e tema noturno com contraste instrumentado.
2. O gate novo deve ser **executado primeiro contra a implementação anterior** e o resultado registrado em `docs/ux-pro-07-fornecedores-evidencias/antes-07c-2/`, sem tratar isso como regressão de gate herdado.
3. **Preservação:** `npm run test:ext04-suppliers:pg` continua 28/28, os dez casos da 07C-1 continuam passando sem edição, e nenhuma asserção herdada é alterada.
4. **Evidências** em `docs/ux-pro-07-fornecedores-evidencias/`: estados de escrita (envio, incerta, negada, resposta inválida, conflito) nas larguras exigidas; `resumo.json` com `problems: []` em todas as entradas, derivado de overflow do documento, menor alvo medido e contrastes instrumentados.
5. **Relatório depois** com tabela E1–E6 antes/depois por `file:line` do SHA-base e da implementação final, contratos preservados, gates executados e limitações.
6. **Inventário:** regenerar os dois CSVs somente com `node scripts/ux-pro-00-inventory.mjs`; provar que o diff se limita à linha 20 (`/admin/fornecedores`) — ou que nenhuma célula mudou; nunca editar CSV à mão.
7. **Bateria completa** antes de abrir a PR: `npm ci`; `npm test` (933/933 na base); `npm run typecheck`; `npm run build`; `node scripts/qa-wave0-static.mjs` (5/5); `node scripts/ux-pro-00-inventory.mjs --check`; `npm run test:ext04-suppliers:pg` (28/28); `npm run test:l06-delivery:pg`; `npm run test:l08-delivery:pg`; o gate focal novo em duas execuções independentes; `git diff --check` limpo; `next-env.d.ts` e `tsconfig.json` restaurados e reconferidos pelos dois SHA-256 após cada build e cada gate que suba o Next.

Este documento não é aprovação das fatias seguintes e não declara aceite humano. Uma PR desta subfatia só pode ser mergeada depois de todos os checks remotos verdes (cancelado, pulado, em fila ou sem runner não conta), estado `MERGEABLE`/`CLEAN` e revisão técnica automatizada publicada como comentário — sem alegar revisão humana.
