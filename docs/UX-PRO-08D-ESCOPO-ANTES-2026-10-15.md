# UX-PRO-08D — escopo e medição anterior (resíduos e medições da família UX-PRO-08)

**Data:** 15/10/2026 · **Base:** `origin/main` commit `8dfbd7e451787dcf6f56e93b81d8e4edb26ceda5` (merge da PR #246 / UX-PRO-08C).
Subfatia: **08D — Resíduos e medições das três superfícies da família UX-PRO-08** (`/admin/conhecimento`, assistentes Marcelo/RH/cliente e aparência/prévias), conforme o plano mestre (`docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`) e o cronograma (`docs/CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md` §2).

**Status deste documento:** registro prévio à implementação; nenhuma rota de API, regra de autorização, migração, componente de produto, gate herdado ou CSV de inventário foi alterado para produzi-lo. As entregas de UX-PRO-08A (PR #244, `ab39b6dc`), UX-PRO-08B (PR #245, `5a02f0e1`) e UX-PRO-08C (PR #246, `8dfbd7e4`) estão mergeadas na `main` e **não** são reimplementadas.

---

## 1. Cobertura atual medida na base (`8dfbd7e4`)

Medição extraída diretamente dos `resumo.json` existentes e da matriz vigente (`docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` + `node scripts/ux-pro-00-inventory.mjs --check`):

| Superfície / Rota | Pasta de evidência da família 08 | Larguras no `resumo.json` atual | Tema `night` | Teclado (`percursoTeclado` no inventário) | Estado na matriz UX-PRO-00 (`2026-10-13.csv`) |
|---|---|---|---|---|---|
| `/admin/conhecimento` (08A) | `docs/ux-pro-08-conhecimento-evidencias/` (3 PNGs 1440px de estados) + `docs/ux-07-conhecimento-evidencias/` | `1440x900`, `390x844` (via `ux-07-conhecimento`; faltam `320px` e `768px`) | Sem captura `night` | Apenas `firstFocus` (`outline: "auto"`); sem `percursoTeclado` | `capturado em 1440x900, 390x844; faltam 320px, 768px` · `percurso completo nao verificado` |
| `/admin/marcelo/assistente` (08B) | `docs/ux-pro-08-assistentes-evidencias/` | 1 PNG 1440px (`desktop-marcelo-resposta.png`), mas `resumo.json` **sem `entries`** | Sem captura `night` | Sem `firstFocus` nem `percursoTeclado` por rota | `sem captura; 320/390/768/1440 px nao verificados` · `sem marcador e sem verificacao` |
| `/admin/rh/assistente` (08B) | `docs/ux-pro-08-assistentes-evidencias/` | 9 PNGs 1440px (`desktop-rh-*`, `desktop-ocupado`, etc.), mas `resumo.json` **sem `entries`** | Sem captura `night` | 1 PNG `desktop-teclado-foco-visivel.png`, sem `percursoTeclado` em `entries` | `sem captura; 320/390/768/1440 px nao verificados` · `sem marcador e sem verificacao` |
| `/cliente/app/assistente` (08B) | `docs/ux-pro-08-assistentes-evidencias/` | 1 PNG 390px (`mobile-390-cliente-resposta.png`), mas `resumo.json` **sem `entries`** | Fora do escopo admin (identidade do portal do cliente) | Sem `firstFocus` nem `percursoTeclado` | `sem captura; 320/390/768/1440 px nao verificados` · `sem marcador e sem verificacao` |
| `/admin/aparencia` (08C) | `docs/ux-pro-08-aparencia-evidencias/` | `320x780`, `390x844`, `768x1024`, `1440x900` (dia) | Sem captura `night` | Apenas `firstFocus` objeto; sem `percursoTeclado` | `capturado em 1440x900, 320x780, 390x844, 768x1024; faltam nenhum` · `percurso completo nao verificado` |
| `/layout-preview` (08C) | `docs/ux-pro-08-aparencia-evidencias/` | Gravado com query (`route: "/layout-preview?visual=03"` e `?visual=99`), **não casando** com `/layout-preview` no gerador | Fora do escopo admin (prévia pública) | Apenas `firstFocus` objeto; sem `percursoTeclado` | `sem captura; 320/390/768/1440 px nao verificados` · `sem marcador e sem verificacao` |
| `/layout-03` (08C — amostra das prévias `/layout-01..10`) | `docs/ux-pro-08-aparencia-evidencias/` | `320x780`, `390x844`, `768x1024`, `1440x900` | Fora do escopo admin (prévia pública) | Apenas `firstFocus` objeto; sem `percursoTeclado` | `capturado em 1440x900, 320x780, 390x844, 768x1024; faltam nenhum` · `percurso completo nao verificado` |

### Conferência do registro `"13 PNGs"` × 12 arquivos `.png` em `docs/ux-pro-08-assistentes-evidencias/`

Na árvore `8dfbd7e4`, o diretório `docs/ux-pro-08-assistentes-evidencias/` contém **13 arquivos no total**, sendo **12 arquivos `.png`** e **1 arquivo `resumo.json`**:
1. `desktop-base-indisponivel.png`
2. `desktop-marcelo-resposta.png`
3. `desktop-modelo-falhou.png`
4. `desktop-modelo-indisponivel.png`
5. `desktop-negado-403.png`
6. `desktop-ocupado.png`
7. `desktop-rh-resposta-com-fonte.png`
8. `desktop-sem-fonte.png`
9. `desktop-sessao-revogada.png`
10. `desktop-teclado-foco-visivel.png`
11. `mobile-390-cliente-resposta.png`
12. `mobile-390-publico-sem-fonte.png`
13. `resumo.json` (contado indevidamente como 13º PNG no texto `"evidencias": "13 PNGs em docs/ux-pro-08-assistentes-evidencias/"`).

---

## 2. Gates herdados das três áreas (a preservar)

- **08A (Conhecimento / EXT-08):**
  - `npm run test:ux-knowledge:pg` (`scripts/qa-ux-knowledge-postgres.mjs` → `tests/ux-knowledge-workspace.integration.test.mjs`)
  - `npm run test:ext08-knowledge:pg` (`scripts/qa-ext08-knowledge-postgres.mjs` → `tests/ext08-knowledge.integration.test.mjs`)
  - `node --test tests/ux-knowledge-vocabulary.test.mjs tests/ext08-knowledge.test.mjs`
- **08B (Assistentes / FECH-01):**
  - `npm run test:ai-rag-widget:pg` (`scripts/qa-ai-rag-widget-postgres.mjs` → `tests/ai-rag-widget.integration.test.mjs`, mínimo 20 casos, 0 fail/skip/todo)
  - `node --test tests/rag-widget-contract.test.mjs tests/ai-rag-real-scope.test.mjs tests/ai-rag-public-scope.test.mjs`
- **08C (Aparência e prévias / EXT-12):**
  - `npm run test:ext12-visual:pg` (`scripts/qa-ext12-visual-postgres.mjs`)
  - `node --test tests/site-appearance.focal.test.mjs tests/ext12-visual.test.mjs tests/ux-pro-08c-appearance.test.mjs`
- **Inventário e baseline:**
  - `node scripts/ux-pro-00-inventory.mjs --check`
  - `node --test tests/ux-pro-00-inventory.test.mjs tests/ux-pro-00-precision.test.mjs`
  - `npm test` e `npm run typecheck`

---

## 3. Lacunas e resíduos numerados (`D1`–`D8`)

| ID | Superfície | Descrição da lacuna / resíduo | Ação na UX-PRO-08D |
|---|---|---|---|
| **D1** | `/admin/conhecimento` (08A) | `docs/ux-pro-08-conhecimento-evidencias/resumo.json` não possui `stage` nem `entries` no formato de `scripts/ux-pro-00-inventory.mjs`, e a rota não tem capturas `320x844`, `768x1024` (dia), `768x1024` (`night`) nem `percursoTeclado` (`firstFocus: true` + sequência de alvos Tab). | Medir e capturar `320/390/768/1440px` (dia), `768px` (`night`) e `390px` (teclado com `recordKeyboardCapture`) no gate `tests/ux-knowledge-workspace.integration.test.mjs`, preservando os 3 PNGs de estados da 08A e gravando `entries` com `stage: "ux-pro-08-conhecimento"`. |
| **D2** | Assistentes (08B — `resumo.json`) | Divergência `"13 PNGs"` × 12 PNGs reais em `docs/ux-pro-08-assistentes-evidencias/` (o 13º arquivo é `resumo.json`), e ausência de `stage: "ux-pro-08-assistentes"` + `entries: [...]`, deixando as 3 rotas de assistente sem captura e sem teclado creditados na matriz UX-PRO-00. | Reconciliar a contagem documental e estruturar `docs/ux-pro-08-assistentes-evidencias/resumo.json` com `stage: "ux-pro-08-assistentes"` e `entries: [...]`, preservando os 12 PNGs existentes de estados/jornada. |
| **D3** | `/admin/marcelo/assistente`, `/admin/rh/assistente`, `/cliente/app/assistente` (08B) | Faltam capturas em `320x844`, `390x844` (em Marcelo e RH), `768x1024` (dia e noite em Marcelo e RH; dia no cliente), `1440x900` (no cliente) e `percursoTeclado` (`firstFocus: true` + sequência Tab até o campo de pergunta e envio) nas três rotas. | Adicionar medição de larguras `320/390/768/1440`, tema `night` (nas 2 rotas staff) e `percursoTeclado` via `recordKeyboardCapture` em `tests/ai-rag-widget.integration.test.mjs` quando `FECH01_EVIDENCE_DIR` estiver definido. |
| **D4** | `/admin/aparencia`, `/layout-preview`, `/layout-03` (08C) | Em `docs/ux-pro-08-aparencia-evidencias/resumo.json`: (a) `route: "/layout-preview?visual=03"` com query string impediu o gerador UX-PRO-00 de creditar `/layout-preview`; (b) `stage` estava como `"ux-pro-08c"` em vez de `"ux-pro-08-aparencia"`; (c) falta captura de `/admin/aparencia` em `768x1024` no tema `night`; (d) falta `percursoTeclado` (`firstFocus: true` + array de alvos) em `/admin/aparencia`, `/layout-preview` e `/layout-03`; (e) a captura `320x780` de `/admin/aparencia` registrou 1 `net::ERR_ABORTED` do iframe `?visual=06`. | Completar em `docs/ux-pro-08-aparencia-evidencias/` a captura `w768-noite-aparencia.png` e as capturas de teclado, normalizar `route: "/layout-preview"` (preservando a query no campo `query`/`state`), eliminar o `ERR_ABORTED` em 320px e gravar `percursoTeclado` via `recordKeyboardCapture` com `stage: "ux-pro-08-aparencia"`. |
| **D5** | `src/components/RagWidget.tsx` (08B) | Resíduo de `B6` (08B): `RagWidget.tsx` usa paleta clara inline por escopo (`RAG_COLORS`: `#ecfdf5` em RH, `#f5f3ff` em Marcelo; embora `.rag-suggestion` declare `padding: 5px 10px`, o escopo de `UiTaskWorkspace`/`admin-theme.css` garante `min-height: 44px` computado). No tema `night` das rotas staff, o cartão do widget mantém fundo claro serializado em `rgb(...)` enquanto textos sem cor inline herdam `--ux-color-text` claro (`#e5edf7`), reduzindo o contraste do rótulo da pergunta para `1.08:1` (Marcelo) e `1.12:1` (RH), e o acento `#059669` do escopo RH tem contraste `3.77:1` com `#fff`. | **Registrado como pendência numerada para PR própria (não alterar `RagWidget.tsx` nem `admin-theme.css` nesta fatia):** medido em Chromium real no tema `night` (`768x1024`) de `/admin/marcelo/assistente` e `/admin/rh/assistente` e registrado em `problems` das respectivas entradas de `docs/ux-pro-08-assistentes-evidencias/resumo.json`. |
| **D6** | `src/components/AppearanceGallery.module.css` (08C) | Em `/admin/aparencia` no tema `night` (`html[data-admin-theme="night"]`), `.option` (`background: white; color: var(--ux-color-text)`), `.selected` (`background: #f8faff`) e `.device button, .device a, .secondary` (`background: white; color: var(--ux-color-brand)`) mantêm fundo branco fixo com texto noturno claro (`#e5edf7` / `#92bdf2`), gerando contraste ~1.18:1 nos cartões e ~1.95:1 nos controles secundários. | **Registrado como pendência numerada para PR própria:** medido em Chromium real em `768x1024` (`night`) e registrado em `problems` da entrada `w768-noite-aparencia.png` em `docs/ux-pro-08-aparencia-evidencias/resumo.json`. |
| **D7** | `src/components/Layout09.tsx:94` e `src/components/SiteVisualRenderer.module.css:3` (08C) | Resíduos documentados em `C6`/`C7` da 08C: 1 estilo inline dinâmico de largura percentual da barra de progresso em `Layout09.tsx:94` e cor fixa `#64b9ee` no foco do atalho público em `SiteVisualRenderer.module.css:3`. | **Mantidos com justificativa / fora de escopo:** largura dinâmica de passo e componente do site público (intocado sem autorização). |
| **D8** | Transversais (`E6`, `E8`, `E9`) e amostragem de `/layout-01..10` | Em `/admin/conhecimento` no tema `night`, a aba ativa `.tabActive` e `.actions .primary` de `UiWorkspace.module.css` têm contraste `1.95:1` (`#fff` sobre `--ux-color-brand` noturno `#92bdf2` — **E8**); `<main>` aninhado sob `AdminGate.tsx:115` (**E6**); e as demais prévias individuais (`/layout-01`, `02`, `04..10`) seguem para a passagem integral da `UX-PRO-10A`. | **Fora de escopo por regra inegociável:** medidos e registrados em `problems` de `conhecimento-768-noite.png` e no relatório de fechamento da família UX-PRO-08. |

---

## 4. Escopo de execução desta subfatia (UX-PRO-08D)

1. **Não reimplementar** `/admin/conhecimento`, `RagWidget.tsx`, páginas dos assistentes, `SitePreviewNotice`, `noindex` nem `AppearanceGallery.tsx`.
2. **Estender de forma aditiva as medições automatizadas** (`tests/ux-knowledge-workspace.integration.test.mjs`, `tests/ai-rag-widget.integration.test.mjs` e teste/coleta da 08D) para:
   - Capturar `320/390/768/1440px` (dia), `768px` (noite nas rotas staff) e `percursoTeclado` (`firstFocus: true` via `recordKeyboardCapture`) para `/admin/conhecimento`, `/admin/marcelo/assistente`, `/admin/rh/assistente`, `/cliente/app/assistente`, `/admin/aparencia`, `/layout-preview` e `/layout-03`;
   - Gravar os `resumo.json` completos com `stage` e `entries` nas três pastas (`docs/ux-pro-08-conhecimento-evidencias/`, `docs/ux-pro-08-assistentes-evidencias/`, `docs/ux-pro-08-aparencia-evidencias/`), reconciliando a contagem de PNGs da 08B;
   - Regenerar os CSVs de inventário e matriz (`node scripts/ux-pro-00-inventory.mjs`) creditando as capturas e percursos de teclado das três superfícies.
3. **Executar todos os gates e verificações das três áreas** e emitir o relatório de fechamento da família UX-PRO-08 (`docs/UX-PRO-08D-RELATORIO-2026-10-15.md`).

## 5. Fora de escopo

- Qualquer alteração funcional, de API, payload, permissão, papel ou migração (001–180 imutáveis).
- Correção de código dos resíduos registrados como pendência (`D5`, `D6`, `D7`) ou transversais (`D8` / `E2–E9` / `C11`).
- Site público além do que já existe e publicação de layout.
- Homologação humana, UAT e gate de produção (**NO-GO**).
