# UX-PRO-07G — relatório (`/admin/terceiros`)

**Status:** relatório da subfatia UX-PRO-07G depois da implementação. Nenhuma validação manual, homologação, revisão humana ou aceite humano aconteceu; nada aqui declara conformidade WCAG. **Esta fatia não conclui a UX-PRO-07.**

## 1. O que mudou
| Defeito (escopo "antes") | Correção |
|---|---|
| G1 — 2xx malformado virava vazio falso | `thirdPartyRead` em `src/lib/third-party-request.ts` exige a forma canônica (lista: `third_parties` array; dossiê: `third_party.id`; decisão: `authorized` booleano); fora isso, falha declarada `invalid_third_party_response` (diagnóstico local, fora do vocabulário anti-deriva) |
| G2 — releitura descartava o dado, sem hora | `Load<T>` com `readAt`/`refreshing`/`staleError`; faixa `role="alert"` com hora da última leitura concluída (pt-BR) e repetição real |
| G3 — negativa indistinguível de falha transitória | 401/403 (ou `kind:"denied"`) falham fechado, sem dado protegido nem faixa de preservação |

Preservação por recurso **e por terceiro**: trocar de terceiro descarta dossiê (decisão já era anulada em `inspect`). Escopo e medição anterior: `docs/UX-PRO-07G-ESCOPO-ANTES-2026-10-15.md`.

## 2. Preservado
Métodos, URLs, corpos, `Idempotency-Key`, papéis/`AdminGate`, regras EXT-02 (janela/escopo/grants/fronteira de ator externo), migrações 001–180, `thirdPartyRequest` e as escritas. Só casos adicionados ao gate.

## 3. Verificações
- `npm run test:ux-third-party:pg`: **13/13**. `npm run typecheck`: verde.
- Evidências: `docs/ux-pro-07-terceiros-evidencias/resumo.json`.

## 4. Não fecha
UX-PRO-07 (faltam 07H–07M), E2–E9, C11, captura nova 320/768/noite, aceite humano.
