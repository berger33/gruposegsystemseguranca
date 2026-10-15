# UX-PRO-07C-1 — escopo, baseline e medição anterior da leitura de `/admin/fornecedores`

**Data:** 14/10/2026

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

**Fatia registrada aqui:** UX-PRO-07C-1 — estados honestos das quatro leituras canônicas de `/admin/fornecedores` (`references`, `quotations`, `orders` e detalhe da cotação), com prova de navegador (PostgreSQL descartável, HTTP real e Chromium). As escritas da rota permanecem intactas e ficam para a subfatia seguinte da 07C.

**Origem do recorte:** `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`, seção 2, linha 07C — “Corrigir somente lacunas demonstradas; completar 320/768/noite/teclado/estados”. A confirmação do recorte (07C, somente leitura) foi feita com o proprietário nesta sessão.

## 1. Base realmente conferida

Conferência feita no checkout desta sessão, antes de qualquer edição de tela:

- branch de trabalho: `arena/a3144e64-gruposegsystemseguranca`;
- `HEAD` local, `main` e `origin/main`: `ba2a06f8e0fd2827615af3e299b87c58ddcf92e3` (merge da PR #225, continuação B16/B17 da UX-PRO-07B-2); `git status --porcelain` vazio antes de cada verificação;
- PRs abertas anteriores a esta: nenhuma concorrente desta fatia; a #224 e a #225 constam `MERGED` e o merge já está em `origin/main`;
- `git stash list`: vazio; nenhum stash antigo reaplicado;
- `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`;
- `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`;
- dependências instaladas com `npm ci` (81 pacotes, 0 vulnerabilidades);
- `node scripts/ux-pro-00-inventory.mjs --check` → `OK`; 100 entradas de rota; contagem estática, não equivale a passagem visual, teste de estados ou aceite humano.

Foram lidos antes deste registro: `AGENTS.md`, `docs/ARENA-PRESERVAR-FUNCIONALIDADES.md`, `docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`, `docs/UX-PRO-07-ESCOPO-EMERGENCIAL-ANTES-2026-10-14.md`, `docs/UX-PRO-07-PATRIMONIO-ESTADOS-2026-10-14.md`, `docs/UX-PRO-07-EMERGENCIAL-RELATORIO-2026-10-14.md`, `docs/UX-PRO-07B-2-ESCOPO-ANTES-2026-10-14.md`, `docs/UX-PRO-07B-2-RELATORIO-2026-10-14.md`, `docs/UX-PRO-07B-2-CONTINUACAO-2026-10-14.md`, os dois CSVs vigentes de 13/10/2026, `scripts/ux-pro-00-inventory.mjs`, `scripts/qa-ux-supplier-postgres.mjs`, `scripts/qa-ux-asset-postgres.mjs`, `scripts/ux-pro-00-keyboard-evidence.mjs`, `tests/ux-asset-workspace.integration.test.mjs`, `tests/ux-supplier-workspace.integration.test.mjs`, `tests/ux-supplier-vocabulary.test.mjs`, `tests/ext04-suppliers.integration.test.mjs`, `src/app/admin/fornecedores/FornecedoresWorkspace.tsx`, `src/app/admin/fornecedores/page.tsx`, `src/lib/supplier-request.ts`, `src/lib/supplier-vocabulary.mjs`, `src/server/ext-supplier-api.mjs` e `src/components/ui/UiState.tsx`.

Nada de UX-PRO-07A ou UX-PRO-07B foi reaberto: nenhum arquivo de `/admin/patrimonio`, `/admin/emergencial`, `src/lib/asset-request.ts` ou `src/lib/emergency-request.ts` é tocado por esta fatia, e nenhuma asserção herdada é editada.

## 2. Mapa da rota `/admin/fornecedores`

| Item | Valor vigente | Fonte |
| --- | --- | --- |
| Entrada | `/admin/fornecedores` (1 entrada de rota) | `src/app/admin/fornecedores/page.tsx` |
| Arquivos locais | 2 | `page.tsx`, `FornecedoresWorkspace.tsx` |
| Guarda de UI | `AdminGate allowedRoles={["marcelo","admin","ti"]}` | `page.tsx:11`; matriz estática em `tests/admin-page-gates.test.mjs:26` |
| Autorização real | `hasPermission` no servidor (EXT-04 `guard`) | `src/server/ext-supplier-api.mjs` (`guard`) |
| Leitura 1 | `GET /api/ext/supplier/references` → `{ suppliers, products, source, external_actor_boundary }` | `FornecedoresWorkspace.tsx:69`; `ext-supplier-api.mjs:279-296` |
| Leitura 2 | `GET /api/ext/supplier/quotations` → `{ quotations[], … }` | `FornecedoresWorkspace.tsx:70`; `ext-supplier-api.mjs:298-330` |
| Leitura 3 | `GET /api/ext/supplier/orders` → `{ orders[], … }` | `FornecedoresWorkspace.tsx:71`; `ext-supplier-api.mjs:539-540` |
| Leitura 4 | `GET /api/ext/supplier/quotations/:id` → `{ quotation, validities, alert_rule, documents, orders }` | `FornecedoresWorkspace.tsx:61`; `ext-supplier-api.mjs:376-402` |
| Escritas (fora desta fatia) | 9 mutações canônicas com `Idempotency-Key` e chave preservada em falha | `FornecedoresWorkspace.tsx:82-97`, `:104-160` |
| Gate herdado da rota | `npm run test:ext04-suppliers:pg` (28 casos, HTTP real + PostgreSQL) | `scripts/qa-ext04-suppliers-postgres.mjs`, `.github/workflows/ext04-delivery.yml` |
| Gate focal vigente | `npm run test:ux-supplier:pg` — **2 casos estáticos** (leitura de arquivo; não abre navegador) | `tests/ux-supplier-workspace.integration.test.mjs:6-10` |
| Captura visual anterior | `docs/ux-09-fornecedores-evidencias/` — 2 entradas (1440×900, 390×844), sem 320/768 e sem noite | `docs/ux-09-fornecedores-evidencias/resumo.json` |

Restrições de contrato que esta fatia não pode quebrar:

- `tests/admin-page-gates.test.mjs:26` exige `page.tsx` com a ordem publicada `["marcelo","admin","ti"]`;
- `tests/ux-supplier-vocabulary.test.mjs` exige cobertura de todos os códigos literais do servidor, handlers despachados e o wrapper com `payload:unknown` e `credentials:'same-origin'`;
- `tests/ux-supplier-workspace.integration.test.mjs:7` exige que a UI continue declarando `<h1>EXT-04 — Fornecedores</h1>`, `role="tablist"`, `data-ui-state="denied"`, `supplierRequest` e `Sem upload real`;
- `tests/ui-surface-locale.test.mjs` recusa `toLocale…String()` sem localidade explícita em `src/app` e `src/components`;
- `tests/ext04-suppliers.test.mjs` e `tests/ext04-suppliers.integration.test.mjs` provam payload, idempotência, replay, concorrência, auditoria e imutabilidade no servidor. Nenhuma dessas asserções é tocada.

## 3. Estados atuais de leitura — medição anterior

SHA-base = `ba2a06f`, `FornecedoresWorkspace.tsx` com 228 linhas.

| ID | Medição anterior | Evidência `file:line` no SHA-base |
| --- | --- | --- |
| C1 | Um único booleano `loading` atende as três leituras paralelas e nenhum estado existe para o detalhe. A única indicação é um parágrafo genérico que desaparece ao fim da carga; não há como saber qual recurso está em curso, e o detalhe nunca apresenta carregamento próprio. | `:42` (`loading`), `:66` (`setLoading(true)`), `:77` (`setLoading(false)`), `:165` (parágrafo único), `:59-63` (`loadDetail` sem estado) |
| C2 | `error` é uma única string compartilhada por leitura e pelas nove mutações; a faixa de leitura não traz o código técnico, não distingue rede, 401/403, 5xx e resposta inesperada, e oferece “Repetir carregamento” inclusive quando a causa não é repetível. O `canRetry` já devolvido por `describeSupplierError` nunca é consultado pela UI. | `:44`, `:76`, `:85`, `:94`, `:167`; `src/lib/supplier-vocabulary.mjs` (`describeSupplierError` devolve `canRetry`) |
| C3 | Resposta `2xx` malformada vira vazio falso: `references.suppliers \|\| []`, `quotationData.quotations \|\| []`, `orderData.orders \|\| []`. Um corpo `{note}` sem as chaves canônicas é apresentado como “não há registros”. | `:73-74` |
| C4 | Falha de releitura não invalida os arrays e não os marca: o conteúdo anterior continua visível exatamente como se fosse uma leitura recém-concluída. | `:66-77` (nenhuma limpeza no `catch`), `:166-167` |
| C5 | A negativa mostra a faixa `data-ui-state="denied"`, mas fornecedores, produtos, cotações, pedidos e o detalhe lidos continuam renderizados abaixo dela — a tela não falha fechado. | `:45`, `:166` contra `:187-224` |
| C6 | Não existe hora da última leitura concluída em nenhum ponto da tela. | ausência em `:165-168` e em `:187-224` |
| C7 | `load` depende de `selectedId` e o efeito roda a cada mudança de `load`: selecionar uma cotação relança as **três** leituras de lista para obter apenas o detalhe, misturando seleção com estado de lista. | `:75`, `:78` (`}, [loadDetail, selectedId]);`), `:80` (`useEffect(() => { void load(); }, [load]);`), `:190` |
| C8 | Nenhum estado desta rota foi exercitado em navegador. O gate focal vigente contém apenas duas asserções sobre o conteúdo de arquivos e não abre Chromium: a prova de “browser failure injection” é uma expressão regular aplicada ao próprio runner. | `tests/ux-supplier-workspace.integration.test.mjs:6-10` |
| C9 | Não há captura em 320 px nem em 768 px; não há captura noturna; o percurso de teclado não foi verificado em navegador. | CSV vigente, linha 20 da matriz: `capturado em 1440x900, 390x844; faltam 320px, 768px`; `teclado = primeiro foco registrado em captura; percurso completo nao verificado` |
| C10 | A apresentação usa apenas cores fixas inline e nenhum componente compartilhado; o contraste noturno nunca foi medido. Cores confirmadas: `#fff`, `#111827`, `#1d4ed8`, `#374151`, `#fffbeb`, `#b45309`, `#fff1f2`, `#9f1239`, `#a16207`, `#dc2626`, `#166534`, `#b91c1c`, `#d1d5db`, `#9ca3af`, `#e5e7eb`. | `:15-19` (`panel`, `row`, `input`, `button`, `secondary`), `:163` (`main`), `:166-168`, `:171`, `:190`, `:221` |
| C11 | `<nav role="tablist">` com cinco `role="tab"` em que `aria-selected` é sempre `index === 0`; não há `aria-controls`, `tabpanel`, troca de aba nem setas/Home/End. | `:170-171` |

### 3.1 Decisão registrada sobre C11

C11 é um defeito real de semântica, mas corrigi-lo exige transformar os cinco rótulos em abas verdadeiras com painéis — o que reconfigura o layout vigente (formulário + lista à esquerda e detalhe/validade/documentos à direita, com pedidos abaixo) e passa a ocultar conteúdo hoje sempre visível. A regra do repositório é preservar o layout selecionado e não reduzir capacidade por iniciativa própria. Por isso **C11 não é corrigido nesta subfatia**: fica registrado como lacuna demonstrada, com `file:line`, para decisão explícita do proprietário na subfatia seguinte da 07C. Nenhuma asserção existente é alterada para acomodar o defeito.

## 4. Gates herdados executados na base intacta (antes da implementação)

| Verificação | Resultado em `ba2a06f` |
| --- | --- |
| `npm test` | **933/933**, 0 falhas, 0 pulados, 0 todo |
| `npm run typecheck` | exit **0** |
| `node scripts/qa-wave0-static.mjs` | **5/5** verificações OK |
| `node scripts/ux-pro-00-inventory.mjs --check` | `OK`; 100 entradas; CSVs não alterados |
| `npm run test:ext04-suppliers:pg` (gate herdado da rota) | **28/28**, `EXT04_TAP_SUMMARY: pass=28 fail=0 skipped=0 todo=0 minimo_exigido=28`, `QA_EXT04_PG_TEMP_CLEANED: true` |
| `npm run test:ux-supplier:pg` (gate focal vigente) | **2/2**, `UX_SUPPLIER_TEST_EXIT: 0`, `QA_PG_TEMP_CLEANED: true` — 2 casos estáticos, sem navegador |
| `npm run test:l06-delivery:pg` | exit **0**, `L06_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l08-delivery:pg` | **51/51**, exit **0**, `L08_DELIVERY_TEST_EXIT: 0` |
| `next-env.d.ts` / `tsconfig.json` após os gates Next | restaurados por `git checkout --`; SHA-256 `18b697c4…` / `2128c956…`; árvore limpa |

## 5. Subfatia UX-PRO-07C-1 — incluído e excluído

### Incluído

1. **Estado por recurso** para as quatro leituras: “ainda não lido”, “lendo”, “pronto”, “falhou” e “negado”, cada um com `data-testid` próprio, no mesmo modelo das fatias 07A e 07B-1.
2. **Carregamento contextual**: nenhum vazio, total ou zero é exibido antes de resposta válida; cada recurso declara o que está lendo.
3. **Vazio honesto**: somente após resposta `2xx` válida, declarando que a consulta foi concluída, o que o recorte cobre e quando atualizar.
4. **Falha classificada com causa real**: rede, `401`, `403`, `5xx`/`408`/`429` e resposta inesperada, com o código técnico do servidor; repetição **somente** quando a causa permitir.
5. **Resposta `2xx` malformada nunca é vazio**: ausência de `suppliers`/`products`, `quotations` ou `orders` vira falha declarada, e o detalhe sem `quotation` também.
6. **Falha transitória de releitura preserva o dado lido e o marca**: faixa `role="alert"` com a hora local da última leitura concluída, o código real e a declaração de que o conteúdo pode estar desatualizado; a repetição, quando permitida, atualiza de verdade.
7. **Negativa e `401` depois do sucesso falham fechado**: listas, detalhe e formulários dependentes saem da tela; a negativa não é apresentada como dado desatualizado e não oferece repetição.
8. **Seleção desacoplada da lista**: trocar a cotação selecionada relê **somente** o detalhe, sem relançar as três leituras de lista; um controle explícito de releitura executa exatamente os mesmos `GET`s já usados na carga inicial.
9. **Apresentação**: primitivos compartilhados já existentes (`UiTaskWorkspace`, `UiState`, `UiBadge`, `UiWorkspace.module.css`) no lugar das cores fixas de C10; alvos ≥ 44 px; foco visível; nenhuma nova chamada `toLocale…` sem localidade.
10. **Prova**: gate focal com navegador real e capturas em 320/390/768/1440 px, tema noturno pelo controle real do envelope, percurso de teclado medido e `resumo.json` derivado das medições.

### Excluído

- qualquer alteração de verbo, URL, corpo, cabeçalho `Idempotency-Key`, estado de domínio, transição canônica, permissão, auditoria, migração ou tenancy das nove mutações; `src/server/ext-supplier-api.mjs` e `server.mjs` não são tocados;
- estados de envio pendente, duplo clique e reconciliação de resultado das escritas (subfatia seguinte da 07C); a guarda síncrona e as mensagens de chave preservada das mutações permanecem como estão;
- `page.tsx`, `AdminGate`, papéis declarados, metadados e navegação;
- C11 (abas sem painel) — registrado, não corrigido, conforme a seção 3.1;
- asserções herdadas de `tests/ext04-suppliers*.test.mjs`, `tests/ux-supplier-vocabulary.test.mjs`, `tests/l06-delivery.integration.test.mjs`, `tests/l08-delivery.integration.test.mjs` e os dois casos estáticos vigentes do gate focal (nenhuma é editada, removida ou relaxada; os casos novos são aditivos);
- `/admin/fornecedores` não é misturada com nenhuma outra rota nesta PR;
- validação manual, homologação, revisão humana e aceite humano.

## 6. Prova exigida para encerrar a UX-PRO-07C-1

1. **Gate focal com navegador real**, aditivo aos dois casos estáticos vigentes, executado por `scripts/qa-ux-supplier-postgres.mjs` (PostgreSQL descartável, `DATABASE_URL` remoto recusado, migrações reais, servidor HTTP real, Chromium, limpeza confirmada mesmo em falha; falhas injetadas somente em `window.fetch` da página), provando: autorização das quatro leituras (anônimo 401, papel sem permissão 403, `admin` 200); carregamento contextual distinto de vazio; falha inicial com causa e código reais e repetição que realmente emite nova leitura; preservação marcada com hora em falha transitória de releitura; recuperação real após repetir; `403` depois do sucesso falhando fechado; `2xx` malformada que nunca vira ausência; seleção de cotação sem relançar as três listas; 320/390/768/1440 px e tema noturno medidos; percurso de teclado registrado.
2. O gate novo deve ser **executado primeiro contra a implementação anterior** e o resultado registrado em `docs/ux-pro-07-fornecedores-evidencias/antes/`, sem fingir que isso é regressão de gate herdado.
3. **Preservação:** `npm run test:ext04-suppliers:pg` continua 28/28, os dois casos estáticos continuam passando sem edição, e nenhuma asserção herdada é alterada.
4. **Evidências** em `docs/ux-pro-07-fornecedores-evidencias/`: repouso em 1440, 768, 390 e 320 px no tema dia; 768 px no tema noite; percurso de teclado em 390 px; falha inicial; falha de releitura com dado preservado. `resumo.json` com `problems: []` em todas as entradas, derivado de overflow do documento, menor alvo medido e contrastes instrumentados.
5. **Relatório depois** com tabela C1–C11 antes/depois por `file:line` do SHA-base e da implementação final, contratos preservados, gates executados e limitações.
6. **Inventário:** regenerar os dois CSVs somente se as células justificadas mudarem; comparar de forma estruturada com os snapshots anteriores e provar que o diff se limita à linha 20 (`/admin/fornecedores`) e ao efeito reproduzível dos novos artefatos. Nunca editar CSV à mão.
7. **Bateria completa** antes de fechar: `npm test`, `npm run typecheck`, `npm run build`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `npm run test:ext04-suppliers:pg`, `npm run test:l06-delivery:pg`, `npm run test:l08-delivery:pg` e o gate focal novo; `git diff --check` limpo e os dois SHA-256 protegidos reconferidos depois de restaurar as alterações automáticas.

Este documento não é aprovação das fatias seguintes e não declara aceite humano. Uma PR desta subfatia só pode ser mergeada depois de todos os checks visíveis verdes, estado mergeável confirmado (`MERGEABLE`/`CLEAN`) e revisão técnica automatizada publicada como comentário — sem alegar revisão humana.
