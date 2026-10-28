# UX-PRO-03 — reauditoria reproduzível do `TiConsole` (resultado)

**Data:** 27/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** primeira da frente UX-PRO-03. **Nenhum componente órfão foi ativado**: a decisão de 02/10 (`docs/ENTREGA-L07-ACEITE-E-AUDITORIA-L08.md`) só permite promover por área **com prova** de papel, origem, fonte, drill-down e autorização. Esta fatia entrega a base de prova que faltava e fecha duas lacunas nas abas já montadas.

## 1. Estado encontrado (RED)

1. **Fonte de estado obsoleta.** `docs/INVENTARIO-ADMIN-TI.md` é um retrato de 02/10 com **82 arquivos e "0 imports"**. O `TiConsole` atual monta **12 abas** via `dynamic(() => import('./X'))`, e vários `*Client.tsx` são importados por `ComercialWorkspace`, `RhWorkspace` e `OperacaoWorkspace`. A auditoria de 26/10 registrava "39 ligados / 44 órfãos" sem gerador reproduzível.
2. **Duas abas montadas sem prova focal.** `AiRagClient` (269 linhas, 7 endpoints) e `ThemeClient` (adapter de `AppearanceGallery`) eram renderizados no console sem nenhum teste que nomeasse o componente — exatamente o critério "com prova" que a decisão exige.
3. **Sem guarda contra regressão.** Nada impedia que um órfão fosse ligado ao console, ou que uma aba perdesse o teste/endpoint, sem que o CI percebesse.

`node --test tests/ux-pro-03-ti-reaudit.test.mjs` na base: **1/3 aprovado, 2 falhas** — falta de prova focal em `AiRagClient`/`ThemeClient` e ausência do inventário reproduzível. A guarda de paridade (12 abas = 12 renderizações, gate `ti|admin`) **já passava**, o que confirma que a navegação em si está correta.

## 2. Correção (aditiva, sem tocar em componentes)

- **`scripts/ux-pro-03-ti-inventory.mjs`** — gerador determinístico com `--check`. Enumera os `*Client.tsx` de `src/app/admin/ti`, classifica por grafo real de importação (`console`, `workspace`, `orfao`), extrai os literais `/api/...`, confere o despacho em `server.mjs` (normalizando as barras escapadas das regexes de rota), localiza testes focais com **fronteira de palavra** e registra o papel de cada aba.
- **`docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv`** + **`.json`** — 83 linhas, uma por componente, mais resumo com SHA-256 de `TiConsole.tsx`/`page.tsx` e contadores. `--check` falha se o código mudar e o CSV não for regenerado.
- **`tests/ux-pro-03-ti-reaudit.test.mjs`** — guarda que lê o código diretamente (sem depender do gerador, para não ser prova circular): exige teste focal e endpoint despachado em cada aba montada, paridade de navegação, gate `ti|admin`, nenhum órfão renderizado e inventário sincronizado. Como executa `--check` e está no `test:unit`, **o CI passa a bloquear deriva automaticamente**, sem novo workflow.
- **`tests/ux-pro-03-ti-ai-rag-ui.test.mjs`** (3/3) e **`tests/ux-pro-03-ti-theme-ui.test.mjs`** (3/3) — provas focais das duas abas: montagem/gate, os 7 endpoints do RAG e os 2 da galeria, escopos `publico/cliente/rh/marcelo`, publicação revisada, limites declarados (sem embedding/fila/custo), permissão `site.visual.write`, concorrência `visual_changed_refresh`, confirmação com motivo e estados de leitura/erro.

**Preservado:** nenhum arquivo de `src/app/admin/ti/` ou `src/components/` foi alterado; nenhuma rota, RBAC, migração, handler ou configuração mudou. Os 3 testes entraram no `test:unit` (131 arquivos).

## 3. Evidências (GREEN)

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-03-ti-reaudit.test.mjs` | **3/3** (RED 1/3 → GREEN) |
| `tests/ux-pro-03-ti-ai-rag-ui.test.mjs` / `...theme-ui.test.mjs` | **3/3** + **3/3** |
| `AWS_EXECUTION_ENV=… npm test` | **1068/1068**, 0 falhas/skips/todo |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** páginas |
| `qa-wave0-static` / `ux-pro-00 --check` / `ux-pro-03 --check` | 5/5 / 100 rotas / 83 componentes |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |
| `next-env.d.ts` / `tsconfig.json` | SHA `1862ac4b…` / `2128c956…` intactos |

### Retrato reproduzível em 27/10

| Classificação | Total | Observação |
|---|---:|---|
| `console` | **12** | abas reais do `TiConsole`; **12 `com_prova`, 0 lacunas** |
| `workspace` | **25** | montados por `ComercialWorkspace`/`RhWorkspace`/`OperacaoWorkspace` |
| `orfao` | **46** | **`promovidos: 0`** — nenhum importado em `src/app` |
| Total | **83** | 402 literais `/api/…`, **0 sem despacho** |

**Por que 46 e não 44?** A contagem anterior usava heurística diferente. O gerador exige um *specifier* de importação exato, o que elimina falsos positivos como `BudgetClient` "importado" por `LaborBudgetClient`; além disso, os dois componentes **adaptados** em 02/10 (`AdmClient`, `AdmAdvancedClient`) continuam órfãos no grafo de importação — foram *reimplementados* em `/admin/marcelo`, não ligados. `37 ligados + 46 órfãos = 83`. O número antigo permanece registrado como histórico; o novo é reproduzível por `node scripts/ux-pro-03-ti-inventory.mjs --check`.

## 4. Limitações honestas

- **Prova estática**, não gate de navegador: confirma montagem, papel declarado, despacho e teste focal; **não** prova autorização exercida em runtime, drill-down real nem aceite humano.
- **Nenhum órfão promovido.** A decisão do proprietário não declarou ordem entre áreas; nenhuma ordem foi inventada. Cada futura promoção exige uma PR por família com os cinco critérios de 02/10.
- Gate do portal **não reexecutado** (último: **35/35**): nenhuma página, handler ou migração do portal do cliente foi alterada nesta fatia.
- Outros gates com `NEXT_DIST_DIR` próprio ainda não auditados; `PLT-SMK-001` continua como guarda. Produção segue **NO-GO**.

> **Atualização no mesmo dia:** duas fatias seguintes promoveram PLT-14 e PLT-18. Os números **deste** relatório são o retrato **inicial** (12 abas / 46 órfãos). O estado vigente é **16 abas / 42 órfãos / 4 promoções**, registrado em `docs/UX-PRO-03-PROMOCAO-DEPENDENCIAS-2026-10-27.md`, `docs/UX-PRO-03-PROMOCAO-DOCUMENTACAO-MANUTENCAO-2026-10-27.md` e no CSV/JSON regenerados.

## 5. Próxima fatia

Concluída a **reauditoria**; a fatia seguinte iniciou a **promoção "com prova"** (1 feita, **45 órfãos restantes**), uma família por PR, escolhida sem presumir prioridade (o proprietário não a declarou). O CSV já aponta família, APIs e testes existentes para orientar cada promoção. Alternativamente, seguir pela frente UX-PRO-06/04/05. Fila vigente: `docs/STATUS-VIGENTE.md`.
