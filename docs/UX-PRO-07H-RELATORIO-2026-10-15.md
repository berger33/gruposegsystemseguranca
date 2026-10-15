# UX-PRO-07H — relatório (`/admin/licitacoes`)

**Status:** relatório da subfatia UX-PRO-07H depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG. **Esta fatia não conclui a UX-PRO-07.**

## 1. O que mudou
| Defeito (escopo "antes") | Correção |
|---|---|
| H1 — 2xx malformado quebrava/vazio falso | `biddingRead` em `src/lib/bidding-request.ts` exige `notices` array (lista) e `notice.id` (dossiê); fora isso, falha `invalid_bidding_response` |
| H2 — releitura apagava o dado | Preservação por recurso e por edital: faixa `role="alert"` de desatualização, hora da última leitura concluída (pt-BR), repetição real ("Recarregar"/"Tentar a leitura de novo") |
| H3 — negativa indistinguível | 401/403 (`kind:"denied"`) falham fechado: lista/dossiê protegidos saem, sem faixa de preservação |

## 2. Preservado
Contratos, `Idempotency-Key` e prefixos `ext03-*`, papéis/`AdminGate`, condição EXT-03 `market_relevance`, migrações 001–180, `biddingRequest` e as escritas. Só um caso Chromium adicionado; nenhuma asserção existente alterada.

## 3. Verificações
- `npm run test:ux-bidding:pg`: **28/28**. `npm run typecheck`: verde.
- Evidências: `docs/ux-pro-07-licitacoes-evidencias/resumo.json`.

## 4. Não fecha
UX-PRO-07 (faltam 07I–07M), cores locais fixas desta tela (transversal), E2–E9, C11, aceite humano.
