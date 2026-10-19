# UX-PRO-10B — correção da PR #263 (arquivos `visuals` órfãos) — escopo antes do código (18/10/2026)

**Base conferida:** `main`/`origin/main` = `ff0b500794d92e0983a01ae5cd497d3a3079347b` (merge da PR #263), árvore limpa, divergência 0/0. Branch fixa da sessão: `arena/f55f0080-gruposegsystemseguranca`. **Decisão do proprietário (18/10/2026): remover os arquivos órfãos** (opção recomendada na auditoria), em vez de mantê-los e ligá-los. Sem aceite humano, UAT nem declaração de conformidade WCAG; homologação e produção **NO-GO**.

## 1. O defeito medido (PR #263, mergeada em 18/10/2026)

A PR #263 ("UX-Pro-10A: Resolve P0 iframe accessibility gap") partiu de uma premissa falsa e declarou resolvido um gap que não resolveu:

| # | Fato medido no código atual | Evidência |
|---|---|---|
| C1 | **Só o Layout 01 usa iframe** para `/visuals/...`. Os layouts 02–10 são componentes React próprios (`Layout02.tsx`…`Layout10.tsx`), renderizados por `SiteVisualRenderer`/`/layout-preview`. | `grep visuals/layout src/` → único hit: `src/components/Layout01.tsx:8` |
| C2 | Os 9 arquivos `public/visuals/layout-02..10/index.html` criados pela #263 **não são referenciados por nada** (nem `src/`, nem scripts de pacote, que só copiam `visuals/layout-01`). São órfãos. | `scripts/package-layout-*.sh` só tratam `visuals/layout-01` |
| C3 | Os snapshots 03–10 têm ~10 KB, uma linha, só header+hero+footer (sem seção de serviços), resíduos de payload RSC (`<!--$-->`) e **nenhum CSS de layout** (só `/brand/logo-only.css`, que estiliza apenas o símbolo da marca). Acessados direto, renderizam sem estilo. Não resolvem acessibilidade de iframe. | leitura dos arquivos; `id="servicos"` ausente em 02–10 |
| C4 | Os documentos da #263 (`GAP-*.md`, `UX-PRO-10A-AUDIT.md`, `UX-PRO-10C-CLOSEOUT.md`) foram criados na **raiz** do repositório, fora de `docs/`, afirmam que "todos os 10 layouts têm iframe" (falso, ver C1) e mantêm checklists pendentes — enquanto o título da PR declara o P0 resolvido. A UX-PRO-10B (teclado/tema/zoom em navegador) **nunca foi executada**. | leitura dos 5 arquivos |
| C5 | A #263 adicionou `@playwright/test` ao `package.json` **sem nenhum uso** no código (os testes usam `playwright`, já declarado). | `grep @playwright/test src tests scripts` → 0 hits |
| C6 | A #263 commitou churn do arquivo gerado `next-env.d.ts` (`./.next/dev/...` no lugar de `./.next/integration-ux-contract/...`). O conteúdo pré-#263 tem MD5 `87a8bf5c65d00003ad1eba1613711943`, o valor canônico das guardas técnicas registradas nas fatias 09C–09E. | `gh api` no pai `d1bba3e`; MD5 reproduzido |

## 2. Escopo autorizado desta correção (somente isto)

1. **Remover** `public/visuals/layout-02/` … `public/visuals/layout-10/` (9 arquivos órfãos de C2/C3). As URLs diretas `/visuals/layout-02..10/index.html` voltam a responder 404, como antes da #263. `public/visuals/layout-01/index.html` permanece intacto (é o único referenciado e o esperado pelos scripts de pacote).
2. **Mover** os 5 documentos da #263 da raiz para `docs/` (`git mv`), corrigindo neles a premissa falsa (C1/C4) e registrando o status honesto: **UX-PRO-10B pendente de teste em navegador** (teclado dentro do iframe do Layout 01, troca de tema, zoom 320/390/768/1440, `/layout-preview`). Conteúdo histórico preservado sob banner de retificação, no padrão das fatias anteriores.
3. **Remover** a dependência sem uso `@playwright/test` de `package.json`/`package-lock.json` (C5). `playwright` permanece.
4. **Restaurar** `next-env.d.ts` ao conteúdo pré-#263 (MD5 `87a8bf5c65d00003ad1eba1613711943`) (C6).
5. **Teste focal novo** `tests/ux-pro-10b-visuals-guard.test.mjs`, registrado em `test:unit`: trava que `public/visuals` contém apenas `layout-01`, que nenhum código referencia `visuals/layout-02..10`, que os 5 documentos vivem em `docs/` (e não na raiz) e que `@playwright/test` não volta a ser declarado sem uso.

## 3. O que está preservado (não tocar)

- Os 10 layouts como prévias React (`/layout-01`…`/layout-10`, `/layout-preview`, `SiteVisualRenderer`, `AppearanceGallery`), com o 06 como padrão — nenhum componente, rota, título ou comportamento muda.
- `public/visuals/layout-01/index.html` e os scripts `package:layout-*`, que o empacotam.
- Contratos de API, sessão, permissões, dados e demais superfícies: fora do escopo; nenhum arquivo de `src/` é alterado.
- A fila UX-PRO remanescente (C11, E2, E3, E5, E8, E9, ID3, ID4, PU4–PU6, 09E-7/8) continua aguardando decisão item a item; esta correção **não** executa a UX-PRO-10B em navegador nem declara gap de acessibilidade resolvido.

## 4. Validação exigida antes de abrir a PR

`node scripts/qa-wave0-static.mjs` (5/5), `npm run typecheck`, `npm test` (incl. o focal novo), `npm run build`, inventário `ux-pro-00-inventory --check`, smoke com servidor no ar (`/layout-01`, `/layout-02`, `/layout-preview?visual=02`, `/visuals/layout-01/index.html` → 200; `/visuals/layout-02/index.html` → 404) e `git diff --check`. Ao final, `next-env.d.ts` reconferido no MD5 canônico (build/dev o reescrevem; restaurar antes de commitar).
