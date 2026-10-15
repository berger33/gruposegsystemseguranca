# UX-PRO-07I — relatório (`/admin/qualidade`)

**Status:** relatório da subfatia UX-PRO-07I depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG. **Esta fatia não conclui a UX-PRO-07.**

## 1. O que mudou
| Defeito (escopo "antes") | Correção |
|---|---|
| I1 — 2xx malformado virava vazio falso (`… ? … : []`) | `qualityRead` exige `nonconformities`/`staff` arrays e `nonconformity.id` no detalhe; fora isso, falha `invalid_quality_response` |
| I2 — releitura descartava o dado, sem hora | `Load<T>` com `readAt`/`refreshing`/`staleError`, faixa `role="alert"` com hora pt-BR e repetição; botão aditivo "Reler as não conformidades" (a rota não tinha releitura explícita fora das mutações) |
| I3 — negativa indistinguível | 401/403 (`kind:"denied"`) falham fechado |

Preservação por recurso **e por não conformidade**. Escopo: `docs/UX-PRO-07I-ESCOPO-ANTES-2026-10-15.md`.

## 2. Preservado
Contratos, `Idempotency-Key`, grants EXT-05 (incl. escopo por conta), migrações 001–180, `qualityRequest` e as escritas. Só casos adicionados ao gate.

## 3. Verificações
- `npm run test:ux-quality:pg`: **11/11** (1ª execução 9/11 por cenário com cookie de escopo insuficiente — corrigido o cenário, não a asserção). `npm run typecheck`: verde.
- Evidências: `docs/ux-pro-07-qualidade-evidencias/resumo.json`.

## 4. Não fecha
UX-PRO-07 (faltam 07J–07M), E2–E9, C11, aceite humano.
