# UX-PRO-07L — relatório (`/admin/continuidade`)

**Status:** relatório da subfatia UX-PRO-07L depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG. **Esta fatia não conclui a UX-PRO-07.**

## 1. O que mudou
| Defeito (escopo "antes") | Correção |
|---|---|
| L1 — 2xx malformado virava vazio falso | `continuityRead` exige `items` (lista) e `plan.id` (detalhe); fora isso, falha `invalid_continuity_response` |
| L2 — releitura descartava o dado, sem hora | `Load<T>` com `readAt`/`refreshing`/`staleError`, faixa `role="alert"` com hora pt-BR e repetição (botão "Atualizar lista" já existia) |
| L3 — negativa indistinguível | 401/403 (`kind:"denied"`) falham fechado |

Preservação por recurso **e por plano**. Escopo: `docs/UX-PRO-07L-ESCOPO-ANTES-2026-10-15.md`.

## 2. Preservado e asserção adaptada (declarado)
Contratos, `Idempotency-Key`, grants EXT-10, portal do cliente, migrações 001–180, `continuityRequest` e as escritas. **Uma** asserção herdada foi adaptada com justificativa no próprio teste: o caso "queda do servidor" exigia 0 cartões após falha de releitura; o padrão UX-PRO-07 aprovado nas fatias 07A–07K (preservar o dado lido declarando desatualização) passa a valer aqui — a asserção nova exige cartões preservados == antes da queda + faixa presente (nem apaga, nem inventa). É uma troca de comportamento declarada, não um enfraquecimento silencioso.

## 3. Verificações
- `npm run test:ux-continuity:pg`: **20/20**; `npm run test:ux-continuity-client:pg`: **10/10**. `npm run typecheck`: verde.
- Evidências: `docs/ux-pro-07-continuidade-evidencias/resumo.json`.

## 4. Não fecha
UX-PRO-07 (falta 07M), E2–E9, C11, aceite humano.
