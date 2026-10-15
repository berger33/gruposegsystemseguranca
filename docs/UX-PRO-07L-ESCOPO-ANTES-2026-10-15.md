# UX-PRO-07L — escopo e medição anterior (`/admin/continuidade`)

**Data:** 15/10/2026 · **Base:** `origin/main` com merge da PR #241 (UX-PRO-07K). Próxima fatia do mapa fatiado: **07L — `/admin/continuidade`**, gates `ux-continuity`/`ux-continuity-client` existentes (EXT-10).

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

## 1. Defeitos medidos na base (mesma classe 07F–07K)

| ID | Defeito | Evidência em `ContinuityWorkspace.tsx` na base |
|---|---|---|
| L1 | 2xx malformado vira vazio falso: `setList({phase:'ready', data: Array.isArray(r.data.items)?r.data.items:[]})`; detalhe aceita corpo sem `plan.id` | função `load` e `detailLoad` (arquivo compacto, 34 linhas) |
| L2 | Releitura descarta o dado (`setList({phase:'loading'})` / `setDetail({phase:'loading'})`); sem hora da última leitura | idem |
| L3 | Negativa 401/403 indistinguível de falha transitória sobre o dado lido | idem |

## 2. Escopo (somente isto, padrão 07F)

1. `src/lib/continuity-request.ts` (aditivo): `invalid_continuity_response` + `continuityRead(url, isValid)`; `continuityRequest` intacto; fora do vocabulário anti-deriva.
2. `ContinuityWorkspace.tsx`: lista exige `items`; detalhe exige `plan.id`; preservação por recurso **e por plano** com hora da última leitura e faixa de desatualização com repetição (o botão "Atualizar lista" já existe); 401/403 fail-closed.
3. Gate focal aditivo (2xx malformado, preservação, negativa pós-sucesso); evidências em `docs/ux-pro-07-continuidade-evidencias/`.

## 3. Fora do escopo

Escritas, payloads, `Idempotency-Key`, endpoints, permissões/grants EXT-10 (isolamento `client_account_id`), portal do cliente `/cliente/app/continuidade`, migrações 001–180, E2–E9, C11.
