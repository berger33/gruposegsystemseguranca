# UX-PRO-07H — escopo e medição anterior (`/admin/licitacoes`)

**Data:** 15/10/2026 · **Base:** `origin/main` com merge da PR #237 (UX-PRO-07G). Próxima fatia do mapa fatiado da UX-PRO-07: **07H — `/admin/licitacoes`**, gate focal `npm run test:ux-bidding:pg` existente (EXT-03).

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

## 1. Defeitos medidos na base

| ID | Defeito | Evidência `file:line` na base |
|---|---|---|
| H1 | 2xx malformado quebra/vazio falso: `setListing(result.data)` sem validar `notices` (a renderização lê `listing.notices.length` — corpo sem a lista quebra a tela ou finge ausência); dossiê sem validar `notice.id` | `LicitacoesWorkspace.tsx:312-315`, `:320-325`, `:424`, `:431` |
| H2 | Releitura apaga o dado: `loadNotices`/`loadDossier` zeram erro e ligam `loading`, e em falha `setListing(null)`/`setDossier(null)` — sem preservação, sem hora da última leitura | `LicitacoesWorkspace.tsx:309-325` |
| H3 | Negativa 401/403 indistinguível de falha transitória sobre o dado já lido | `LicitacoesWorkspace.tsx:313-314`, `:322-323` |

Observação de estilo: esta tela usa cores locais fixas (Tailwind `text-gray-*`/`bg-red-50`) em vez dos tokens das demais — registrado como achado transversal (família E2/E8), **fora** desta fatia.

## 2. Escopo (somente isto)

1. `src/lib/bidding-request.ts` (aditivo): `invalid_bidding_response` + `biddingRead(url, isValid)`; `biddingRequest` intacto.
2. `LicitacoesWorkspace.tsx`: lista exige `notices` array; dossiê exige `notice.id`; preservação por recurso e por edital com hora da última leitura e faixa de desatualização com repetição; 401/403 fail-closed.
3. Gate focal aditivo (2xx malformado, preservação, negativa pós-sucesso); evidências em `docs/ux-pro-07-licitacoes-evidencias/`.

## 3. Fora do escopo

Escritas, payloads, `Idempotency-Key`, endpoints, permissões, migrações 001–180, condição EXT-03 `market_relevance: indicada_nao_confirmada`, migração de estilo para tokens, E2–E9, C11.
