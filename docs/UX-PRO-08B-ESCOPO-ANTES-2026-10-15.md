# UX-PRO-08B — escopo e medição anterior (assistentes privados por área e portal)

**Data:** 15/10/2026 · **Base:** `origin/main` commit `ab39b6dc8d6e7a4fb85b4d9d18c7330eae23ec5a` (merge da PR #244 / UX-PRO-08A).
Subfatia: **08B — Assistentes (Marcelo, RH, cliente, público)**, conforme o plano mestre (`docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`) e o cronograma (`docs/CRONOGRAMA-COMPLETO-UX-E-SISTEMA-2026-10-15.md`).

**Status deste documento:** registro prévio à implementação de código; nenhuma rota de API, regra de autorização, migração, gate herdado ou CSV de inventário foi alterado para produzi-lo. A subfatia UX-PRO-08A (`/admin/conhecimento`) está integralmente entregue e mergeada e **não** é reimplementada aqui.

---

## 1. O que já existe e está consolidado (auditoria na base real)

Superfícies in scope:

- `src/app/admin/marcelo/assistente/page.tsx` (29 linhas) — `AdminGate` para `marcelo`/`admin`; usa `UiTaskWorkspace` + `RagWidget` (`ragKey="marcelo"`).
- `src/app/admin/rh/assistente/page.tsx` (30 linhas) — `AdminGate` para `rh`/`admin`; usa `UiTaskWorkspace` + `RagWidget` (`ragKey="rh"`) + `AiRagClient` (revisão da base).
- `src/app/cliente/app/assistente/page.tsx` (17 linhas) — portal do cliente; usa `<main>` + `RagWidget` (`ragKey="cliente"`).
- `src/components/RagWidget.tsx` (308 linhas) — componente compartilhado FECH-01; contrato em `src/lib/rag-widget-contract.mjs`.

Contrato FECH-01 já implementado e protegido por gates:

- `rag-widget-contract.test.mjs` (12 testes puros) + `tests/ai-rag-widget.integration.test.mjs` (gate `npm run test:ai-rag-widget:pg`, mínimo 20 casos, PostgreSQL 17 + Chromium real + provedor determinístico).
- Estados honestos já distinguem: `empty_scope` (sem documentos publicados), `no_source` (sem resultado relevante), `busy` (modelo ocupado, com `retry_after_seconds`), `ai_disabled` (`ollama_disabled`), `ai_timeout` (`ollama_timeout_or_offline`), `ai_unavailable`, `ai_misconfigured`, `network`, `session_required`, `denied`, `source_unavailable`, `invalid_question`, `error`.
- Servidor (`src/server/ai-rag-real-api.mjs`) exige flag E estado publicado (`PUBLISHED_STATES`), escopo por conta vinculada no cliente, autorização por papel no staff, e não chama o modelo sem fonte.
- Fontes retornadas pelo servidor: `{ title, source, document_id, version }`. O widget exibe `title` e `source` (caminho relativo da fonte por pasta, ex.: `Fonte — arquivo.md`).

---

## 2. Defeitos medidos e lacunas reproduzidas na base

| ID | Defeito | Evidência no código atual |
|---|---|---|
| B1 | **Estilos inline remanescentes nas três páginas dos assistentes** (padding, maxWidth, margin, fontFamily, fontSize, opacity, background, borderRadius) em vez de classes compartilhadas de `UiWorkspace.module.css`/`UiTaskWorkspace`. | `marcelo/assistente/page.tsx` 4 `style={{...}}`; `rh/assistente/page.tsx` 4; `cliente/app/assistente/page.tsx` 4. |
| B2 | **Página do cliente usa `<main>` com estilo inline**, inconsistente com as páginas staff que usam `UiTaskWorkspace`; sem tarefas/navegação de seção. | `cliente/app/assistente/page.tsx:5`. |
| B3 | **RagWidget exibe `s.source` em parênteses** ao lado do título da fonte. `source` é `${source.name}/${rel}` (caminho relativo dentro da raiz autorizada) ou texto livre da curadoria; expõe estrutura de pastas/caminhos relativos ao usuário final. | `RagWidget.tsx` bloco `Fontes publicadas usadas`: `<strong>{s.title}</strong> ... ({s.source})`. |
| B4 | **Citações pouco compreensíveis**: a lista de fontes mostra apenas título e caminho; não informa versão do documento nem rótulo de origem compreensível. | mesmo bloco; servidor já retorna `version`. |
| B5 | **Foco visível do widget definido por `<style>` interno com cor fixa** (`#1d4ed8`) em vez de token `--ux-color-focus` usado pelo restante do design system. | `RagWidget.tsx` `<style>{... .rag-widget :focus-visible { outline: 3px solid #1d4ed8; ... }` |
| B6 | **Cores fixas no widget** (`#1f2937`, `#fff`, `#fef2f2`, `#fecaca`, `#b91c1c`, `#cbd5e1`, etc.) em vez de tokens semânticos; contraste no tema noturno não verificado. | múltiplos `style={{...}}` em `RagWidget.tsx`. |
| B7 | **Modelo ocupado (ai_busy) informa retry, mas sem contagem visual explícita** além do texto; o contrato já carrega `retryAfterSeconds`. | `busyDetail()` em `RagWidget.tsx`. |
| B8 | **Sem teste estático dedicado à subfatia 08B** (preservação de testids, estados e ausência de caminhos físicos no widget). | `tests/rag-widget-contract.test.mjs` cobre contrato, mas não a apresentação de fontes/estilos das páginas. |

---

## 3. Escopo planejado para UX-PRO-08B

1. **Limpeza de estilos inline nas três páginas** dos assistentes:
   - Substituir `style={{...}}` por classes de `UiWorkspace.module.css` (`workspace`, `lede`, `footnote`/`notice`) e `UiTaskWorkspace`.
   - Página do cliente passa a usar `UiTaskWorkspace` em vez de `<main>` inline.
   - Manter `AdminGate`, `RagWidget`, `AiRagClient` e todos os props/contratos.
2. **RagWidget — fontes compreensíveis e sem caminhos físicos**:
   - Remover exibição de `s.source` cru; exibir título e, quando disponível, `versão {version}`.
   - Rotular a seção como "Fontes publicadas usadas" mantendo testid `rag-sources`.
   - Manter testids existentes (`rag-widget`, `rag-scope`, `rag-status`, `rag-failure`, `rag-answer`, `rag-answer-response`, `rag-answer-origin`, `rag-protocol`, `rag-copy-protocol`, `rag-retry`, `rag-question`, `rag-submit`, `rag-counter`, `rag-suggestion-*`).
3. **Foco visível** do widget passa a usar token `--ux-color-focus` (com fallback) em vez de cor fixa.
4. **Validação e regressão**:
   - `npm test` (inclui `rag-widget-contract.test.mjs`).
   - `npx tsc --noEmit`.
   - Gate dedicado `npm run test:ai-rag-widget:pg` (quando ambiente permitir) — preservado, sem alteração de contrato.
   - Evidências em `docs/ux-pro-08-assistentes-evidencias/` (`resumo.json` + capturas 320/390/768/1440).

---

## 4. Fora de escopo

- Qualquer modificação em endpoints `/api/ai/answer`, `/api/ai/bot`, `/api/admin/ai-rag-*`, `/api/admin/ai-rag-directory-sources` ou regras de autorização/papéis.
- Migrações 001–180 (imutáveis).
- `/admin/conhecimento` e UX-PRO-08A (já entregue).
- Aparência do site e layouts 01–10 (UX-PRO-08C).
- Transversais E2–E9 e C11.
- Homologação/produção (NO-GO).
