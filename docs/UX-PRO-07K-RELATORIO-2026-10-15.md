# UX-PRO-07K — relatório (`/admin/compliance`)

**Status:** relatório da subfatia UX-PRO-07K depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG. **Esta fatia não conclui a UX-PRO-07.**

## 1. O que mudou
| Defeito (escopo "antes") | Correção |
|---|---|
| K1 — 2xx malformado virava vazio falso nas 4 listas e detalhes sem validação | `complianceRead` exige `items` (obrigações/documentos/tarefas/planos), `enabled` booleano (agenda), `document.id` e `action_plan.id`; fora isso, falha `invalid_compliance_response` |
| K2 — releitura descartava o dado, sem hora | `Load<T>` com `readAt`/`refreshing`/`staleError` nas 7 leituras, faixa `role="alert"` pt-BR com repetição; botão aditivo "Reler as obrigações" |
| K3 — negativa indistinguível | 401/403 (`kind:"denied"`) falham fechado |

Preservação por recurso **e por registro**. Escopo: `docs/UX-PRO-07K-ESCOPO-ANTES-2026-10-15.md`.

## 2. Preservado
Contratos, `Idempotency-Key`, papéis/grants, agendador EXT-07, planos de ação, migrações 001–180, `complianceRequest` e as escritas. Só casos adicionados ao gate (a negativa usa o código canônico `forbidden` desta família).

## 3. Verificações
- `npm run test:ux-compliance:pg`: **11/11**. `npm run typecheck`: verde.
- Evidências: `docs/ux-pro-07-compliance-evidencias/resumo.json`.

## 4. Não fecha
UX-PRO-07 (faltam 07L e 07M), E2–E9, C11, aceite humano.
