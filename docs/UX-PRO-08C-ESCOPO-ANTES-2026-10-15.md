# UX-PRO-08C — escopo e medição anterior (aparência do site e prévias)

**Data:** 15/10/2026 · **Base:** `origin/main` commit `5a02f0e1149b0afa8c5c147849e9a2928ffdc280` (merge da PR #245 / UX-PRO-08B).
Subfatia: **08C — Aparência do site** (`/admin/aparencia`, `/layout-preview`, `layout-01..10`), conforme o plano mestre (`docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`: "deixar claro ativo versus comparação e prévia versus publicação") e o cronograma (`docs/CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md` §2).

**Status deste documento:** registro prévio à implementação de código; nenhuma rota de API, regra de autorização, migração, gate herdado ou CSV de inventário foi alterado para produzi-lo. UX-PRO-08A (`/admin/conhecimento`) e UX-PRO-08B (assistentes) estão mergeadas e **não** são reimplementadas aqui.

---

## 1. O que já existe e está consolidado (auditoria na base real)

Superfícies no escopo (arquivos/linhas medidos):

| Superfície | Arquivo | Linhas | Observação |
|---|---|---:|---|
| Painel TI | `src/app/admin/aparencia/page.tsx` | 3 | `AdminGate` (`admin`/`marcelo`/`ti`) + `AppearanceGallery` |
| Painel TI | `src/components/AppearanceGallery.tsx` | 25 | CSS Modules (`AppearanceGallery.module.css`, 8 linhas), 0 estilos inline |
| Prévia comparada | `src/app/layout-preview/page.tsx` | 4 | `SiteVisualPreview`; metadata já tem `robots: noindex/nofollow` |
| Prévia comparada | `src/components/SiteVisualRenderer.tsx` | 78 | export `SiteVisualPreview` (só usado por `/layout-preview`) + default da home pública |
| Prévias individuais | `src/app/layout-01..10/page.tsx` | 11 cada | renderizam `Layout01..10` diretamente |
| Componentes | `src/components/Layout01..10.tsx` | 14–142 | CSS Modules próprios; 0 estilos inline, exceto 1 dinâmico (ver C7) |
| Catálogo | `src/lib/site-visuals.ts` | 26 | `SITE_VISUAL_OPTIONS` (id, nome, descritor, `previewPath`), padrão `06` |

Fluxo de publicação **existente e preservado** (não será alterado):

- Leitura: `GET /api/admin/site-visual` (layout ativo + `canManage`); publicação: `PUT /api/site-visual` com `{visual, expectedVisual, reason}` — exige concessão `site.visual.write`, motivo ≥10 caracteres, checkbox de conferência, concorrência otimista (`visual_changed_refresh`), auditoria (`site_visual_audit`) e 503 com rollback em falha de auditoria (provado em `tests/site-appearance.focal.test.mjs`).
- A home pública (`src/app/page.tsx`) lê `GET /api/site-visual` via `SiteVisualRenderer` (poll 30s + evento `seg-site-visual-updated`) e **não** é superfície desta fatia: nenhuma mudança visual no site público além do que já existe.
- A galeria já distingue parte do problema: cabeçalho "Layout ativo", selo "Ativo" no cartão, rodapé "Você está comparando o layout atual" × "Alteração proposta: X → Y", prévia real em iframe (`/layout-preview?visual=…`) com alternância Desktop/Celular e diálogo de confirmação com devolução de foco ao botão de origem.
- Foco visível da galeria já usa o token `--ux-color-focus` (`AppearanceGallery.module.css`), botões com `min-height: 44px` e grade responsiva (`@media max-width:700px`).

Gates e testes herdados (preservados, sem relaxamento):

- `npm test` (`test:unit`, lista explícita) inclui `tests/site-appearance.focal.test.mjs` (2 testes: manifesto de migrações; seleção/papel/concessão/conflito/auditoria/rollback em PGlite) e `tests/ext12-visual.test.mjs` (EXT-12).
- `npm run test:ext12-visual:pg` — PostgreSQL real + HTTP + Chromium (`scripts/qa-ext12-visual-postgres.mjs`).
- `npm run typecheck`, inventário reproduzível `node scripts/ux-pro-00-inventory.mjs --check`.

**testids medidos:** 0 (zero) em `AppearanceGallery`, `SiteVisualRenderer`, páginas `layout-*` e `layout-preview`. A identificação é por texto/ARIA (`aria-pressed`, `aria-label`, `role=status/alert`, `title` do iframe).

**Estilos inline medidos:** 0 nas páginas e na galeria; 1 em `src/components/Layout09.tsx:94` (largura percentual da barra de progresso, dependente do passo atual — dinâmico por natureza).

## 2. Defeitos medidos e lacunas reproduzidas na base

| ID | Defeito | Evidência no código atual |
|---|---|---|
| C1 | **`/layout-preview` não declara visualmente que é prévia.** Quem abre o link direto (ou o recebe) vê o layout em tela cheia sem nenhuma faixa dizendo que aquilo **não é o site público**, qual layout/nome está exibido, nem como o layout publicado muda. Só o `<title>` e o `noindex` (invisíveis na página) indicam. | `src/app/layout-preview/page.tsx` renderiza apenas `<SiteVisualPreview/>`; nenhum texto de prévia no corpo. |
| C2 | **`/layout-01..10` idem, e sem `noindex`.** As dez prévias individuais não têm faixa de prévia nem `robots: noindex/nofollow` — inconsistente com `/layout-preview`, que já declara `noindex`. O título da aba menciona "Layout NN", mas o corpo é o layout puro. | `grep robots src/app/layout-*/page.tsx` → nenhum resultado; metadata só com `title`/`description`. |
| C3 | **Parâmetro inválido em `/layout-preview` cai para `06` em silêncio.** `?visual=99` exibe o layout 06 sem avisar que o pedido não foi reconhecido — quem compara pode atribuir a prévia ao layout errado. | `layout-preview/page.tsx`: `isSiteVisualId(visual)?visual:'06'` sem qualquer sinalização. |
| C4 | **Cabeçalho da prévia na galeria não diz se o layout comparado é o ativo.** Diz "Prévia real · {nome}", mas a relação ativo × comparação só aparece no rodapé e nos cartões; junto à janela de prévia (onde o olho está) não há selo "Layout ativo no site" × "Em comparação — ainda não publicado". | `AppearanceGallery.tsx` linha da `styles.preview`: `h2` "Prévia real · {chosen.name}" sem estado de publicação. |
| C5 | **Sem âncora estável de evidência nas prévias.** Nenhum `data-testid` na faixa/prévia permite à UX-PRO-08D medir "prévia declarada" sem depender de texto solto de cada layout. | testids medidos = 0 (§1). |
| C6 | **Foco visível fora da galeria não é padronizado nas prévias.** Cada layout usa seu CSS; qualquer faixa nova precisa nascer com foco por token `--ux-color-focus` e alvos ≥44px, sem depender de cor fixa. (O atalho "Aparência" do site público usa `#64b9ee` fixo em `SiteVisualRenderer.module.css` — registrado como observação **fora de escopo**: é o site público, intocado nesta fatia.) | `SiteVisualRenderer.module.css:3`; layouts sem regra comum de prévia. |
| C7 | **1 estilo inline dinâmico remanescente** (`Layout09.tsx:94`, largura da barra de progresso conforme o passo). É dinâmico por natureza; remover exigiria CSS custom property — registrado para decisão explícita no escopo (§3 mantém, com justificativa). | `grep -c "style={{" src/components/Layout*.tsx` → apenas Layout09 = 1. |
| C8 | **Responsividade da declaração de prévia inexistente por definição** (não há faixa): quando existir, precisa quebrar em 320/390px sem rolagem horizontal própria e permanecer legível em 768/1440px, nos temas dos layouts. | consequência de C1/C2. |

## 3. Escopo planejado para UX-PRO-08C

1. **Componente novo e aditivo `SitePreviewNotice`** (`src/components/SitePreviewNotice.tsx` + `.module.css`, sem hooks, server-safe):
   - Faixa no topo da prévia: "Prévia interna — Layout {id} · {nome}", texto curto de que **não é o site público** e de que o layout publicado só muda pelo painel de Aparência, com confirmação, motivo e auditoria; links "Abrir Aparência do site" (`/admin/aparencia`) e "Ver site atual" (`/`).
   - `data-testid="site-preview-notice"` (C5), foco visível com `var(--ux-color-focus)` e fallback, alvos ≥44px, `flex-wrap` para 320px (C6/C8), tokens `--ux-color-*` (sem cor fixa nova).
   - Variante honesta para C3: quando o parâmetro pedido é inválido, a faixa declara "parâmetro não reconhecido — exibindo o layout 06 (padrão)".
2. **`/layout-preview`**: compõe `SitePreviewNotice` + `SiteVisualPreview` (sem alterar o renderer nem a home pública).
3. **`/layout-01..10`**: cada página ganha a faixa com seu id/nome e `robots: {index:false, follow:false}` no metadata (C2) — 2 linhas por página, sem tocar nos componentes `LayoutNN`.
4. **Galeria (`AppearanceGallery.tsx`)**: selo junto ao cabeçalho da prévia — `selected===active` → "Layout ativo no site"; diferente → "Em comparação — ainda não publicado" (só quando o ativo é conhecido), com `data-testid="appearance-preview-state"` (C4/C5). Nenhum texto, botão, estado ou chamada existente muda.
5. **Teste estático dedicado** `tests/ux-pro-08c-appearance.test.mjs` (padrão dos testes `ux-pro-03-*`): faixa presente nas 11 rotas de prévia, `noindex` nas 11, selo de estado na galeria, testids e ausência de caminho físico/segredo — registrado na lista explícita de `test:unit`.
6. **Validação e evidências**: `npm test`, `npm run typecheck`, `test:ext12-visual:pg` quando o ambiente permitir, inventário `--check`; capturas 320/390/768/1440 + teclado em `docs/ux-pro-08-aparencia-evidencias/` com `resumo.json`.

**Mantido com justificativa:** o estilo inline de `Layout09.tsx:94` (C7) — largura calculada do passo atual; é o único inline das superfícies e não é "remanescente de página". Se um dia for removido, será com CSS custom property em fatia própria.

## 4. Fora de escopo

- Qualquer alteração em `PUT /api/site-visual`, `GET /api/admin/site-visual`, `src/server/site-appearance-api.mjs`, concessão `site.visual.write`, auditoria ou migrações 001–180.
- Site público (home, `PublicSite`, `SiteVisualRenderer` default, atalho "Aparência") — nenhuma mudança visual além do já existente; **nenhum layout será publicado** nesta fatia.
- Componentes `Layout01..10` (visual interno), `/admin/conhecimento`, assistentes/`RagWidget` (08A/08B mergeadas).
- Transversais E2–E9 e C11. Medições integrais das três superfícies da família 08 ficam para a **UX-PRO-08D**.
- Homologação/produção (NO-GO); nenhum aceite humano é declarado.
