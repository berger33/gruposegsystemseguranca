# UX-PRO-08A — escopo e medição anterior (`/admin/conhecimento`)

**Data:** 15/10/2026 · **Base:** `origin/main` commit `9c657048844244378064afde015b5a6bf69c25e2` (merge da PR #243 / UX-PRO-07M).
Início formal de **UX-PRO-08 — Conhecimento, assistentes e aparência do site**.
Subfatia: **08A — Entrada/curadoria do conhecimento/RAG por área e portal (`/admin/conhecimento`)**, conforme o plano mestre (`docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md`).

**Status deste documento:** registro prévio à implementação de código; nenhuma rota de API, regra de autorização, migração, gate herdado ou CSV de inventário foi alterado para produzi-lo.

---

## 1. O que já existe e está consolidado (auditoria na base real)

A tela `/admin/conhecimento` (`src/app/admin/conhecimento/KnowledgeWorkspace.tsx`, 534 linhas) já foi estruturada sobre a jornada canônica EXT-08 com:
- `AdminGate` restrito a `marcelo`, `admin` e `ti`.
- Quatro abas acessíveis reais (`role="tablist"` / `role="tab"` / `role="tabpanel"`) com roving `tabIndex` e navegação de teclado (`ArrowRight`, `ArrowLeft`, `Home`, `End`).
- Ausência de estilos inline (`style={{...}}`), utilizando classes de `src/components/ui/UiWorkspace.module.css`.
- Vocabulário anti-deriva (`src/lib/knowledge-vocabulary.mjs`) cobrindo todos os erros de `src/server/ext-knowledge-api.mjs`, ausência honesta (`Dado ausente`), ciclo de vida (`rascunho`, `em_revisao`, `aprovado`, `publicado`, `arquivado`) e papéis de equipe.
- Idempotência com chave `Idempotency-Key` por operação.
- Gate automatizado herdado em CI (`.github/workflows/ux-knowledge-delivery.yml` e `npm run test:ux-knowledge:pg`), rodando PostgreSQL efêmero e Chromium Playwright real sem mocks do servidor.

---

## 2. Defeitos medidos e lacunas reproduzidas na base

Seguindo o padrão das subfatias de preservação e robustez de leitura (07F–07M):

| ID | Defeito | Evidência no código atual (`KnowledgeWorkspace.tsx`) |
|---|---|---|
| A1 | **Ausência de módulo canônico de transporte (`src/lib/knowledge-request.ts`):** `knowledgeRequest` está embutido localmente em `KnowledgeWorkspace.tsx:75-103`. As outras famílias do sistema possuem wrapper padronizado com resultado tipado discriminado `{ ok: true, status, data } \| { ok: false, status, error }`. | `KnowledgeWorkspace.tsx:75-103` |
| A2 | **2xx malformado vira falso vazio (classe D1):** Resposta 2xx sem as chaves esperadas (`items` na listagem, `article` no detalhe, `history` no histórico, `items` nas ciências) vira `empty` silencioso (`items = Array.isArray(result.data.items) ? result.data.items : []; setArticles(items.length ? ready : empty)`), escondendo erro do servidor ou payload incompleto. | `KnowledgeWorkspace.tsx:143`, `:152`, `:164`, `:173` |
| A3 | **Releitura descarta o dado sem preservar hora da última leitura concluída:** Ao disparar nova busca/filtro na listagem (`loadArticles`) ou recarregar detalhe/histórico/ciência na mesma entidade, o estado é reiniciado imediatamente para `{ phase: "loading" }`, descartando o conteúdo anterior antes da confirmação da nova leitura. | `KnowledgeWorkspace.tsx:135`, `:147`, `:157`, `:167` |
| A4 | **Falha transitória na mesma entidade não preserva dados com faixa `role="alert"` e indicação de desatualizado:** Caso a releitura falhe (503 ou rede), o estado é substituído por `error`, apagando o dado anteriormente visível em vez de preservá-lo com aviso de dados desatualizados e carimbo de data/hora pt-BR. | `KnowledgeWorkspace.tsx:142`, `:151`, `:163`, `:172` |

---

## 3. Escopo planejado para UX-PRO-08A

1. **Criação de `src/lib/knowledge-request.ts`:**
   - Funções `knowledgeRequest` e `knowledgeRead(url, isValid)` aditivas.
   - Diagnóstico específico `INVALID_KNOWLEDGE_RESPONSE` (`invalid_knowledge_response`), mantendo o vocabulário anti-deriva `src/lib/knowledge-vocabulary.mjs` protegido de códigos diagnósticos locais da UI.
2. **Atualização de `src/app/admin/conhecimento/KnowledgeWorkspace.tsx`:**
   - Utilização de `knowledgeRead` para exigir:
     - Na listagem: presença de array em `result.data.items`.
     - No detalhe de versão: presença de objeto em `result.data.article`.
     - No histórico: presença de array em `result.data.history`.
     - Nas ciências: presença de array em `result.data.items`.
   - Implementação do padrão de ciclo de leitura com preservação: `readAt`, `refreshing`, e `staleError` em falhas transitórias, exibindo faixa `role="alert"` com hora em pt-BR e repetição da leitura.
   - Fail-closed rigoroso para 401/403 (`denied`), descartando imediatamente o dado protegido sem reter estado desatualizado indevido.
   - Preservação por entidade: ao trocar de procedimento selecionado (`selectArticle`), o detalhe anterior é descartado.
3. **Validação e Regressão:**
   - Manutenção de todos os testes unitários (`tests/ux-knowledge-vocabulary.test.mjs`, `tests/ext08-knowledge.test.mjs`).
   - Adaptação/adição de testes de regressão no gate focal `tests/ux-knowledge-workspace.integration.test.mjs` e `scripts/qa-ux-knowledge-postgres.mjs` para validar:
     - 2xx sem corpo válido resulta em erro de resposta inválida (nunca lista vazia);
     - Releitura preserva dado com faixa `role="alert"` em falha transitória;
     - Negativa 401/403 falha fechada.
   - Evidências em `docs/ux-pro-08-conhecimento-evidencias/` (ou atualização de evidências canônicas).

---

## 4. Fora de escopo

- Qualquer modificação nos endpoints `/api/ext/knowledge/*` ou `src/server/ext-knowledge-api.mjs`.
- Alteração em migrações (001–180 permanecem imutáveis).
- Assistentes privados (`/admin/marcelo/assistente`, `/admin/rh/assistente`, `/cliente/app/assistente`) — pertencem à UX-PRO-08B.
- Aparência do site e layouts 01–10 — pertencem à UX-PRO-08C.
- Transversais E2–E9 e C11.
