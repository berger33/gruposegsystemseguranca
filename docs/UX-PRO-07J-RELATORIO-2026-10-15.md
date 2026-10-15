# UX-PRO-07J — relatório (`/admin/satisfacao`)

**Status:** relatório da subfatia UX-PRO-07J depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG. **Esta fatia não conclui a UX-PRO-07.**

## 1. O que mudou
| Defeito (escopo "antes") | Correção |
|---|---|
| J1 — 2xx malformado virava vazio falso (`data \|\| {}`) | `satisfactionRead` exige `surveys`, `accounts`/`targets`/`staff` e `survey.id`; fora isso, falha `invalid_satisfaction_response` |
| J2 — releitura descartava o dado, sem hora | `Load<T>` com `readAt`/`refreshing`/`staleError`, faixa `role="alert"` pt-BR com repetição; botão aditivo "Reler as pesquisas" |
| J3 — negativa indistinguível | 401/403 (`kind:"denied"`) falham fechado |

Preservação por recurso **e por pesquisa**. Escopo: `docs/UX-PRO-07J-ESCOPO-ANTES-2026-10-15.md`.

## 2. Preservado
Contratos, `Idempotency-Key`, papéis, portal do cliente, migrações 001–180, `satisfactionRequest` e as escritas. Só casos adicionados ao gate.

## 3. Verificações
- `npm run test:ux-satisfaction:pg`: **12/12**. `npm run typecheck`: verde.
- Evidências: `docs/ux-pro-07-satisfacao-evidencias/resumo.json`.

## 4. Não fecha
UX-PRO-07 (faltam 07K–07M), E2–E9, C11, aceite humano.
