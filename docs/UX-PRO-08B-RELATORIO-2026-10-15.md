# UX-PRO-08B — relatório (assistentes privados por área e portal)

**Status:** subfatia implementada; sem validação manual, homologação, revisão humana ou aceite humano. Nada aqui declara conformidade WCAG.

## 1. O que mudou

| Defeito (escopo "antes") | Correção |
|---|---|
| B1 — estilos inline nas três páginas dos assistentes | Substituídos por classes compartilhadas de `UiWorkspace.module.css` (`workspace`, `lede`, `footnote`) + `UiTaskWorkspace`. |
| B2 — página do cliente usava `<main>` inline | Passou a usar `UiTaskWorkspace`, consistente com as páginas staff. |
| B3 — RagWidget exibia `s.source` (caminho relativo) | Removida a exibição do caminho; fontes mostram apenas título. |
| B4 — citações pouco compreensíveis | Adicionada versão do documento quando disponível (`versão N`). |
| B5 — foco visível com cor fixa | Passou a usar token `--ux-color-focus` (com fallback). |

## 2. Preservado (sem alteração)

- Rotas e endpoints `/api/ai/answer`, `/api/admin/ai-rag-*`, `/api/admin/ai-rag-directory-sources`.
- Autorização e papéis em `AdminGate` (`marcelo`/`admin`, `rh`/`admin`).
- Contrato FECH-01 em `rag-widget-contract.mjs` e testids do `RagWidget`.
- Migrações 001–180.
- Gate `npm run test:ai-rag-widget:pg`.

## 3. Verificações

- `npm run typecheck`: aprovado.
- `node --test tests/rag-widget-contract.test.mjs`: 9/9 aprovados.
- `node --test tests/admin-page-gates.test.mjs`: 1/1 aprovado.
- `npm run test:ai-rag-widget:pg`: 25/25 aprovados (0 falhas, 0 pulados, mínimo 20).
- Evidências: `docs/ux-pro-08-assistentes-evidencias/` (12 PNGs + `resumo.json` = 13 arquivos na entrega 08B; reconciliado e expandido na UX-PRO-08D para 29 PNGs + `resumo.json`).

## 4. O que segue pendente

- Subfatia restante da UX-PRO-08: **UX-PRO-08C** (aparência do site e prévias) e **UX-PRO-08D** (medições).
- Transversais E2–E9, C11, UAT e aceite humano.
