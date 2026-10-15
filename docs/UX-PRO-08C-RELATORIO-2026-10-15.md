# UX-PRO-08C — relatório (aparência do site e prévias)

**Status:** relatório da subfatia UX-PRO-08C após a implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG. **Esta fatia não encerra a família UX-PRO-08** (resta a UX-PRO-08D). Escopo medido previamente em `docs/UX-PRO-08C-ESCOPO-ANTES-2026-10-15.md`. Nenhum layout foi publicado nesta fatia.

## 1. O que mudou

| Defeito (escopo "antes") | Correção |
|---|---|
| C1 — `/layout-preview` sem declaração visível de prévia | Novo componente server-safe `SitePreviewNotice` (`src/components/SitePreviewNotice.tsx` + `.module.css`): faixa "Prévia interna — Layout NN · nome", declaração de que não é o site público, de que o publicado só muda em Aparência (confirmação, motivo, auditoria) e links para o painel e para o site atual. |
| C2 — `/layout-01..10` sem faixa e sem `noindex` | Cada página exibe a faixa com seu id/nome e ganha `robots: {index:false, follow:false}` no metadata (paridade com `/layout-preview`). Componentes `LayoutNN` intocados. |
| C3 — `?visual=` inválido caía para 06 em silêncio | A faixa declara "o layout pedido no endereço não foi reconhecido; esta é a prévia do layout 06 (padrão)". |
| C4 — cabeçalho da prévia da galeria sem estado de publicação | Selo junto à prévia (`data-testid="appearance-preview-state"`): "Layout ativo no site" × "Em comparação — ainda não publicado", quando o ativo é conhecido. |
| C5 — sem âncoras de evidência | `data-testid="site-preview-notice"` e `appearance-preview-state` (aditivos). |
| C6/C8 — foco/temas/responsividade da declaração | Faixa com tokens `--ux-color-*`, foco `:focus-visible` por `--ux-color-focus`, alvos ≥44px, `flex-wrap` verificado em 320/390/768/1440px. |

Mantido com justificativa (C7): único estilo inline das superfícies, `Layout09.tsx:94` — largura dinâmica da barra de progresso conforme o passo; removê-lo exigiria CSS custom property em fatia própria.

## 2. Preservado (sem alteração)

- Fluxo de publicação integral: `PUT /api/site-visual` (concessão `site.visual.write`, motivo ≥10, checkbox, `expectedVisual`, auditoria, 503/rollback), `GET /api/admin/site-visual`, `src/server/site-appearance-api.mjs`, migrações 001–180.
- Site público: home (`src/app/page.tsx`), `PublicSite`, `SiteVisualRenderer` (default/poll/evento) e componentes `Layout01..10` — nenhuma mudança visual; **nenhum layout publicado**.
- Papéis `AdminGate` (`admin`/`marcelo`/`ti`), textos e estados existentes da galeria (loading/erro/sucesso/sem concessão, diálogo com devolução de foco).
- Gates herdados: `test:ext12-visual:pg`, `site-appearance.focal`, inventário UX-PRO-00 (conferido, sem regeneração necessária).

## 3. Verificações

- `npm test`: **942/942** aprovados (0 falhas/pulados), incluindo `site-appearance.focal`, `ext12-visual` e o novo `tests/ux-pro-08c-appearance.test.mjs` (3/3, registrado em `test:unit`).
- `npm run typecheck`: aprovado.
- `npm run test:ext12-visual:pg`: **14/14** (PostgreSQL real + HTTP + Chromium, mínimo 14).
- `node scripts/ux-pro-00-inventory.mjs --check`: OK após regenerar os CSVs (o gerador credita `/admin/aparencia` e `/layout-03` a partir do `resumo.json` desta fatia). Reproduzido em árvore limpa com as envs do CI: 942/942.
- Evidências `docs/ux-pro-08-aparencia-evidencias/`: 16 capturas Chromium real (4 rotas × 320/390/768/1440) + `resumo.json` (etapa `ux-pro-08c` adicionada a `scripts/ux-evidence-capture.mjs`, com larguras por etapa sem alterar as demais). Primeiro Tab recai na faixa ("Abrir Aparência do site", contorno sólido) nas rotas de prévia. 15/16 sem problemas; em `/admin/aparencia` 320px o resumo registra 1 requisição de iframe abortada (`net::ERR_ABORTED` da prévia `?visual=06` ao encerrar o contexto) — captura válida, sem 5xx nem rolagem horizontal.

## 4. O que segue pendente

- **UX-PRO-08D** (medições/resíduos das três superfícies da família 08) — próxima subfatia.
- Transversais E2–E9, C11, UAT e aceite humano. Homologação/produção: **NO-GO**.
