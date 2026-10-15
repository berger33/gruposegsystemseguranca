# UX-PRO-08D — Relatório de Execução e Fechamento da Família UX-PRO-08

- **Data:** 2026-10-15
- **Base em `main`:** `8dfbd7e451787dcf6f56e93b81d8e4edb26ceda5` (PR #246 — `UX-PRO-08C` mergeado; precedido por PR #245 — `UX-PRO-08B` e PR #244 — `UX-PRO-08A`)
- **Subfatia:** `UX-PRO-08D` — resíduos e medições das três superfícies da família `UX-PRO-08` (`/admin/conhecimento`, assistentes `/admin/marcelo/assistente`, `/admin/rh/assistente`, `/cliente/app/assistente`, e aparência/prévias `/admin/aparencia`, `/layout-preview`, `/layout-01`..`/layout-10`)
- **Escopo pré-código:** `docs/UX-PRO-08D-ESCOPO-ANTES-2026-10-15.md`
- **Status:** subfatia implementada e família `UX-PRO-08` consolidada no escopo automatizado; **sem aceite humano, sem validação manual e sem declaração de conformidade WCAG**. Homologação humana e gate de produção permanecem **NO-GO**.

---

## 1. O que mudou na UX-PRO-08D (lacunas numeradas D1–D8)

| # | Lacuna do escopo "antes" | Ação executada | Evidência / Destino |
|---|---|---|---|
| **D1** | `/admin/conhecimento` tinha apenas as 3 capturas de estado 08A em `1440x900` e um `resumo.json` sem `stage` nem `entries[]` legível pelo gerador `ux-pro-00-inventory.mjs`. | Estendido `tests/ux-knowledge-workspace.integration.test.mjs` de forma aditiva com o caso `UX-PRO-08D: medições 320/390/768/1440px, tema dia/noite e percurso de teclado em /admin/conhecimento` e emissão canônica de `docs/ux-pro-08-conhecimento-evidencias/resumo.json` (`stage: "ux-pro-08-conhecimento"`, `entries[]`, `recordKeyboardCapture`). | 9 PNGs + `resumo.json` em `docs/ux-pro-08-conhecimento-evidencias/`; gate `test:ux-knowledge:pg` 10/10 aprovado. |
| **D2** | Discrepância na `UX-PRO-08B`: `docs/ux-pro-08-assistentes-evidencias/resumo.json` declarava `"13 PNGs"` quando havia 12 arquivos `.png` + `resumo.json` (= 13 arquivos na pasta), e faltava `entries[]` com `stage`/`route`/`viewport`. | Reconciliada a contagem em `docs/ux-pro-08-assistentes-evidencias/resumo.json` (`reconciliacaoContagem08b`) e em `docs/UX-PRO-08B-RELATORIO-2026-10-15.md`; adicionada emissão estruturada de `entries[]` (`stage: "ux-pro-08-assistentes"`). | 29 PNGs (12 herdados + 17 novos da 08D) + `resumo.json` validados por `tests/ux-pro-08c-appearance.test.mjs`. |
| **D3** | Assistentes privados (`/admin/marcelo/assistente`, `/admin/rh/assistente`, `/cliente/app/assistente`) sem capturas completas em `320/390/768/1440px`, sem captura `768x1024` no tema `night` nas rotas staff e sem `percursoTeclado` estruturado em `390x844`. | Estendido `tests/ai-rag-widget.integration.test.mjs` com o 26º caso `UX-PRO-08D: medições 320/390/768/1440px, tema dia/noite e percurso de teclado nos três assistentes privados` + `recordKeyboardCapture`. | 17 novos PNGs em `docs/ux-pro-08-assistentes-evidencias/`; gate `test:ai-rag-widget:pg` 26/26 aprovado (mínimo exigido: 20). |
| **D4** | Em `docs/ux-pro-08-aparencia-evidencias/resumo.json`, `/layout-preview` estava gravado com query string (`route: "/layout-preview?visual=03"` e `?visual=99`), impedindo crédito no inventário `ux-pro-00`; faltava captura `768x1024` (`night`) em `/admin/aparencia`, `percursoTeclado` em `390x844` para `/admin/aparencia`, `/layout-preview` e `/layout-03`, e `w320-aparencia.png` registrava `net::ERR_ABORTED` transitório. | Normalizado `route: "/layout-preview"` (preservando `requestedRoute`), re-capturado `w320-aparencia.png` sem `ERR_ABORTED`, capturado `w768-noite-aparencia.png` e registrados os percursos de teclado `w390-teclado-aparencia.png`, `w390-teclado-layout-preview-03.png` e `w390-teclado-layout-03.png` (`stage: "ux-pro-08-aparencia"`). | 20 PNGs + `resumo.json` em `docs/ux-pro-08-aparencia-evidencias/`; `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv` e `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` regenerados (`rotasComCapturaVisual`: 27 → 32). |
| **D5** | Resíduo em `src/components/RagWidget.tsx`: paleta clara inline (`RAG_COLORS`) faz com que textos sem cor inline herdem `--ux-color-text` claro no tema `night` sobre fundo claro do cartão (`1.08:1` em Marcelo e `1.12:1` em RH), e botão de envio em RH (`#059669`) tem contraste `3.77:1`. | Medido em Chromium real e **registrado como lacuna pendente em `problems[]`** das entradas `assistente-marcelo-768-noite.png` e `assistente-rh-768-noite.png`, sem reimplementar `RagWidget.tsx` nesta subfatia. | `docs/ux-pro-08-assistentes-evidencias/resumo.json` (`problems[]`). |
| **D6** | Resíduo em `src/components/AppearanceGallery.module.css`: `.option` (`background: white`) e `.selected` (`background: #f8faff`) usam `color: var(--ux-color-text)`, que no tema `night` resulta em contraste `1.18:1` sobre o fundo claro fixo do cartão. | Medido em Chromium real e **registrado como lacuna pendente em `problems[]`** da entrada `w768-noite-aparencia.png`, sem reimplementar `AppearanceGallery` nesta subfatia. | `docs/ux-pro-08-aparencia-evidencias/resumo.json` (`problems[]`). |
| **D7** | Estilo inline dinâmico de barra de progresso em `Layout09.tsx:94` e foco `#64b9ee` no atalho de `SiteVisualRenderer.module.css:3` (`C6`/`C7` da 08C). | Mantidos com justificativa documental (largura dinâmica de etapa e superfície pública fora de escopo). | Documentado no escopo e neste relatório. |
| **D8** | Transversal **E8** em `/admin/conhecimento`: `.tabActive` noturno com contraste `1.95:1` (`#fff` sobre `--ux-color-brand` noturno `#92bdf2` em `UiWorkspace.module.css`); **E6** (`<main>` aninhado sob `AdminGate.tsx:115`); e prévias `/layout-01`, `02`, `04..10` reservadas à passagem integral da `UX-PRO-10A`. | Medido (`contrasteAbaAtiva: 1.95` vs `contrasteTitulo: 12.92` e `contrasteAbaInativa: 7.83`) e **registrado em `problems[]`** de `conhecimento-768-noite.png`; transversais mantidos fora de escopo sem autorização do responsável. | `docs/ux-pro-08-conhecimento-evidencias/resumo.json` (`problems[]`). |

---

## 2. Medições objetivas consolidadas da família UX-PRO-08

| Rota | Papel exercitado | Larguras capturadas (dia) | Tema noite (`768x1024`) | Overflow horiz. máx. | Menor alvo medido | Contraste título (dia / noite) | Percurso de teclado (`390x844`) |
|---|---|---|---|---|---|---|---|
| `/admin/conhecimento` | `admin` / `financeiro` (403) | `320x844`, `390x844`, `768x1024`, `1440x900` | Capturado (`conhecimento-768-noite.png`) | `0px` | `44px` | `15.54:1` / `12.92:1` (resíduo E8 `.tabActive` `1.95:1` registrado) | `firstFocus: true`, 7 passos até `knowledge-tab-procedimentos` |
| `/admin/marcelo/assistente` | `marcelo` | `320x844`, `390x844`, `768x1024`, `1440x900` | Capturado (`assistente-marcelo-768-noite.png`) | `0px` | `44px` | `15.54:1` / `12.92:1` (resíduo D5 rótulo `1.08:1` no cartão claro registrado) | `firstFocus: true`, 12 passos até `rag-question` e `rag-submit` |
| `/admin/rh/assistente` | `rh` / `financeiro` (403) | `320x844`, `390x844`, `768x1024`, `1440x900` | Capturado (`assistente-rh-768-noite.png`) | `0px` | `44px` | `15.54:1` / `12.92:1` (resíduo D5 rótulo `1.12:1` e envio `3.77:1` registrados) | `firstFocus: true`, 12 passos até `rag-question` e `rag-submit` |
| `/cliente/app/assistente` | `cliente` (conta vinculada) | `320x844`, `390x844`, `768x1024`, `1440x900` | Fora do escopo do tema admin (`day`) | `0px` | `44px` | `15.54:1` (dia; envio `5.13:1`, rótulo `14.28:1`) | `firstFocus: true`, 23 passos até `rag-question` e `rag-submit` |
| `/admin/aparencia` | `ti` | `320x780`, `390x844`, `768x1024`, `1440x900` | Capturado (`w768-noite-aparencia.png`) | `0px` | `44px` | `12.92:1` no título e subtítulo noturnos (resíduo D6 `.option` `1.18:1` registrado) | `firstFocus: true`, 7 passos até o 1º cartão da galeria |
| `/layout-preview` | `ti` / `publico` (`?visual=03` e `?visual=99`) | `320x780`, `390x844`, `768x1024`, `1440x900` | Fora do escopo do tema admin | `0px` | `44px` (faixa `SitePreviewNotice`) | Faixa `SitePreviewNotice` e conteúdo sem transbordo | `firstFocus: true`, 6 passos (`Abrir Aparência do site`, `Ver site atual`, início) |
| `/layout-03` | `ti` / `publico` | `320x780`, `390x844`, `768x1024`, `1440x900` | Fora do escopo do tema admin | `0px` | `44px` (faixa `SitePreviewNotice`) | Faixa `SitePreviewNotice` e conteúdo sem transbordo | `firstFocus: true`, 6 passos (`Abrir Aparência do site`, `Ver site atual`, início) |

---

## 3. Fechamento consolidado da família UX-PRO-08 (08A + 08B + 08C + 08D)

| Subfatia | PR / Merge em `main` | Superfície | Entregas verificadas |
|---|---|---|---|
| **UX-PRO-08A** | PR #244 (`ab39b6dc`) | `/admin/conhecimento` | Validação fail-closed `invalid_knowledge_response` para 2xx sem `items`, preservação da lista lida com horário em `pt-BR` (`America/Sao_Paulo`) em falha transitória de releitura, limpeza fail-closed em 401/403 pós-sucesso. |
| **UX-PRO-08B** | PR #245 (`5a02f0e`) | `/admin/marcelo/assistente`, `/admin/rh/assistente`, `/cliente/app/assistente`, `RagWidget.tsx` | Migração das três páginas privadas para `UiTaskWorkspace` + `UiWorkspace.module.css` (zero `style={{` nas 3 páginas), omissão de caminho interno `s.source` nas citações, exibição de `versão N` e foco visível com `--ux-color-focus`. |
| **UX-PRO-08C** | PR #246 (`8dfbd7e`) | `/admin/aparencia`, `/layout-preview`, `/layout-01`..`/layout-10` | Faixa `SitePreviewNotice` em todas as 11 rotas de prévia (declarando prévia interna × publicação oficial e aviso de parâmetro inválido), `robots: { index: false, follow: false }` nas 11 rotas e selo `appearance-preview-state` na galeria. |
| **UX-PRO-08D** | Esta PR | Todas as 3 áreas da família `UX-PRO-08` | Medições e capturas em `320/390/768/1440px` (dia), `768px` (noite nas 4 rotas staff) e percurso de teclado em `390px` nas 7 rotas inspecionadas; reconciliação da contagem de PNGs da 08B (29 PNGs); atualização dos 3 `resumo.json` e dos CSVs do inventário `UX-PRO-00` (`rotasComCapturaVisual`: 27 → 32); registro explícito dos resíduos `D5`, `D6`, `D7` e `D8`/`E8`. |

---

## 4. Contratos, gates e funcionalidades preservados

- **APIs e regras de negócio:** `/api/ext/knowledge/*`, `/api/ai/answer`, `/api/admin/ai-rag-*`, `/api/admin/site-visual`, `/api/site-visual` inalterados.
- **Autorização e papéis:** `AdminGate` e escopos por papel (`marcelo`, `rh`, `admin`, `ti`, `cliente`) inalterados.
- **Banco de dados:** migrações `001`–`180` intactas.
- **Verificações executadas:**
  - `npm run typecheck`: aprovado (`0` erros).
  - `node scripts/ux-pro-00-inventory.mjs --check`: aprovado (inventário e matriz sincronizados).
  - `node --test tests/ux-pro-08c-appearance.test.mjs tests/ux-pro-00-inventory.test.mjs tests/ux-pro-00-precision.test.mjs`: `15/15` aprovados.
  - `node --test tests/site-appearance.focal.test.mjs tests/rag-widget-contract.test.mjs tests/ux-knowledge-vocabulary.test.mjs tests/ext08-knowledge.test.mjs tests/ext12-visual.test.mjs tests/seo-technical.test.mjs tests/admin-page-gates.test.mjs`: `47/47` aprovados.
  - `UX_KNOWLEDGE_EVIDENCE_DIR=docs/ux-pro-08-conhecimento-evidencias npm run test:ux-knowledge:pg`: `10/10` aprovados.
  - `FECH01_EVIDENCE_DIR=docs/ux-pro-08-assistentes-evidencias npm run test:ai-rag-widget:pg`: `26/26` aprovados (mínimo exigido: `20`).
  - `npm run test:ext08-knowledge:pg`: `14/14` aprovados.
  - `npm run test:ext12-visual:pg`: `14/14` aprovados.

---

## 5. Limitações e pendências registradas

1. **Resíduos da superfície registrados para PR própria (sem reimplementar componentes nesta fatia de medição):**
   - **D5 (`src/components/RagWidget.tsx`):** paleta clara inline (`RAG_COLORS`) no modo noite gera contraste `1.08:1` (Marcelo) e `1.12:1` (RH) no rótulo da pergunta que herda `--ux-color-text` claro, e o botão de envio em RH (`#059669`) tem contraste `3.77:1`.
   - **D6 (`src/components/AppearanceGallery.module.css`):** `.option` e `.selected` mantêm fundo claro fixo (`white`/`#f8faff`) com `color: var(--ux-color-text)`, gerando contraste `1.18:1` no modo noite.
   - **D7 (`Layout09.tsx:94` / `SiteVisualRenderer.module.css:3`):** largura dinâmica inline da barra de progresso e cor de foco no atalho público.
2. **Transversais fora de escopo (E2–E9 e C11):** contraste noturno `1.95:1` de `.tabActive` em `UiWorkspace.module.css` (**E8**) e `<main>` aninhado sob `AdminGate.tsx:115` (**E6**).
3. **Passagem integral de todas as 11 prévias (`/layout-01`..`/layout-10` + `/layout-preview`):** programada para a `UX-PRO-10A`.
4. **Homologação humana, UAT e gate de produção:** permanecem **NO-GO**.
