# UX-PRO-10B — correção da PR #263 (arquivos `visuals` órfãos) — relatório (18/10/2026)

**Base:** `main`/`origin/main` = `ff0b500794d92e0983a01ae5cd497d3a3079347b` (merge da PR #263). **Branch fixa da sessão:** `arena/f55f0080-gruposegsystemseguranca`. Escopo medido antes do código em [`UX-PRO-10B-CORRECAO-263-ESCOPO-ANTES-2026-10-18.md`](UX-PRO-10B-CORRECAO-263-ESCOPO-ANTES-2026-10-18.md). **Decisão do proprietário (18/10/2026): remover os arquivos órfãos.** Sem aceite humano, UAT nem declaração de conformidade WCAG; homologação e produção **NO-GO**. A UX-PRO-10B em navegador **continua pendente** — esta correção não a executa.

## 1. O que foi alterado

| Item | Alteração |
|---|---|
| Arquivos órfãos | Removidos `public/visuals/layout-02/` … `public/visuals/layout-10/` (9 `index.html` criados pela #263, sem referência em `src/` ou nos scripts de pacote, sem CSS de layout). `public/visuals/layout-01/` intacto. |
| Documentos | `GAP-IFRAME-ACCESSIBILITY.md`, `GAP-KEYBOARD-ACCESSIBILITY.md`, `GAP-THEME-SWITCHING.md`, `UX-PRO-10A-AUDIT.md` e `UX-PRO-10C-CLOSEOUT.md` movidos da raiz para `docs/` (`git mv`), cada um com banner de retificação de 18/10/2026: premissa corrigida (só o Layout 01 usa iframe), status honesto da 10B (pendente de navegador) e, no 10C, os itens de teclado/zoom e de fechamento de lacunas de ✅ para ⚠️. Histórico preservado. |
| Dependência | Removido `@playwright/test` de `package.json`/`package-lock.json` (0 usos no código; adicionado pela #263). `playwright` permanece declarado e usado. Diff do lock limitado a essa remoção (a entrada vira peer transitiva de `playwright`). |
| Arquivo gerado | `next-env.d.ts` restaurado byte a byte ao conteúdo pré-#263 (blob `ca9e9ed`, MD5 `87a8bf5c65d00003ad1eba1613711943` — o valor canônico das guardas). |
| Guarda nova | `tests/ux-pro-10b-visuals-guard.test.mjs` (4 casos) registrado em `test:unit`: trava o conteúdo de `public/visuals`, a ausência de referências a `visuals/layout-02..10` em `src/`, a residência dos 5 documentos em `docs/` e a não-redeclaração de `@playwright/test`. |

## 2. Fato descoberto durante a implementação (registrado, sem mudança de escopo)

`public/visuals/layout-01/` não é um único HTML: é a **exportação estática completa** do Layout 01 (`index.html`, `_next/static/…`, `404.html`, `__next.*.txt`, `LEIA-ME.txt`). A guarda foi escrita sobre esse invariante real (pasta única `layout-01` com seu `index.html`), e não sobre a suposição inicial de arquivo único.

## 3. Validação executada (nesta branch, antes do commit)

| Comando | Resultado |
|---|---|
| `node --test tests/ux-pro-10b-visuals-guard.test.mjs` | **4/4** |
| Prova de mutação da guarda | Recriar `public/visuals/layout-02/index.html` → **1 falha**; remover → **4/4** de volta |
| `node scripts/qa-wave0-static.mjs` | **5/5** (migrações 001–180) |
| `npm run typecheck` | exit 0 (com `next-env.d.ts` já no conteúdo canônico) |
| `npm test` | **962/962** (958 da base + 4 da guarda nova), 0 fail/skip/todo |
| `npm run build` | exit 0, 105 páginas |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK — CSVs conferem com o código |
| `git diff --check` | limpo |
| Smoke (servidor no ar, PGlite demo) | `200` em `/layout-01`, `/layout-02`, `/layout-10`, `/layout-preview?visual=02`, `/visuals/layout-01/index.html`, `/admin/aparencia`; **`404`** em `/visuals/layout-02/index.html` e `/visuals/layout-10/index.html` (comportamento pré-#263) |
| Guardas pós-validação | `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` ✅ (build/dev o reescrevem; restaurado antes do commit); `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` ✅ |

## 4. O que foi preservado

- Os 10 layouts como prévias React (`/layout-01`…`/layout-10`, `/layout-preview`, `SiteVisualRenderer`, `AppearanceGallery`), 06 como padrão — nenhum arquivo de `src/` foi alterado.
- `public/visuals/layout-01/` completo e os scripts `package:layout-*`.
- Contratos de API, sessão, permissões e dados: intocados (nenhuma migração nova; 001–180 imutáveis).

## 5. Limites e resíduos (nada declarado além do medido)

- **UX-PRO-10B segue pendente**: teclado dentro do iframe do Layout 01, troca de tema, zoom 320/390/768/1440 e comparação em `/layout-preview` exigem sessão própria com navegador real e evidência — os `GAP-*.md` retificados registram isso. Nenhum gap de acessibilidade é declarado resolvido por esta PR.
- A fila remanescente do programa (C11, E2, E3, E5, E8, E9, ID3, ID4, PU4–PU6, 09E-7/8) continua aguardando decisão item a item do proprietário.
- Merge somente com todos os checks da PR em SUCCESS e base `main` confirmada; aceite humano, homologação e produção permanecem **NO-GO**.
