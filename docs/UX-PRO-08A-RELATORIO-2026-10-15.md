# UX-PRO-08A — relatório (`/admin/conhecimento`)

**Status:** relatório da subfatia UX-PRO-08A após a implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG. **Esta fatia inicia a família UX-PRO-08 e não a encerra.**

## 1. O que mudou

| Defeito (escopo "antes") | Correção |
|---|---|
| A1 — Transporte embutido localmente | Extraído para `src/lib/knowledge-request.ts` com discriminador de resultado `KnowledgeResult<T>` padrão |
| A2 — 2xx malformado virava vazio falso | `knowledgeRead` exige a chave canônica (`items` na lista e ciências, `article` no detalhe, `history` no histórico); fora disso, falha `invalid_knowledge_response` |
| A3/A4 — Releitura descartava o dado sem hora nem faixa | `Load<T>` com `readAt`/`refreshing`/`staleError`; falha transitória de releitura preserva a lista/detalhe com faixa `role="alert"`, hora pt-BR e repetição |
| Negativa pós-sucesso | 401/403 (`isDenied`) falha fechado imediatamente, descartando o dado do DOM |

Preservação é **por procedimento**: selecionar outro artigo descarta o detalhe/histórico anterior. Escopo medido previamente registrado em `docs/UX-PRO-08A-ESCOPO-ANTES-2026-10-15.md`.

## 2. Preservado (sem alteração)

Rotas e endpoints de `/api/ext/knowledge/*`, autorização e papéis em `src/server/ext-knowledge-api.mjs`, migrações 001–180, `Idempotency-Key` e mutações, vocabulário anti-deriva `src/lib/knowledge-vocabulary.mjs`, tabs acessíveis e roving tabindex.

## 3. Verificações

- `npm run test:ux-knowledge:pg`: **9/9** testes aprovados (0 falhas, 0 pulados).
- `node --test tests/ux-knowledge-vocabulary.test.mjs`: **5/5** aprovados.
- `node --test tests/ext08-knowledge.test.mjs`: **10/10** aprovados.
- `npx tsc --noEmit`: verificação de tipos aprovada.
- Evidências geradas: `docs/ux-pro-08-conhecimento-evidencias/` (`resumo.json` e 3 PNGs de 1440px capturados pelo Chromium Playwright real).

## 4. O que segue pendente

- Subfatias restantes da UX-PRO-08: **UX-PRO-08B** (assistentes de área e portal), **UX-PRO-08C** (aparência do site e prévias) e **UX-PRO-08D** (medições).
- Transversais E2–E9, C11, UAT e aceite humano.
