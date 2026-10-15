# UX-PRO-07F — escopo e medição anterior (`/admin/frota`)

**Data:** 15/10/2026 · **Base:** `origin/main` = `12fe34e` (merge da PR #233, UX-PRO-07E-2). Próxima fatia do mapa fatiado da UX-PRO-07 (`docs/UX-PRO-07-ESCOPO-FATIADO-E-PATRIMONIO-ANTES-2026-10-14.md`): **07F — `/admin/frota`**, com gates `ux-fleet-delivery.yml` e gate focal `npm run test:ux-fleet:pg` já existentes (UX-07/EXT-01).

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo. A PR aberta #230 (duplicata da 07D-1 já mergeada na #229) foi fechada como duplicada por decisão do proprietário nesta data, sem merge.

## 1. Defeitos medidos no código da base (classe UX-PRO: estados honestos de leitura)

A tela já distingue `loading`/`failed`/`ready` (UX-07), mas não cumpre o padrão fechado nas fatias 07A–07E:

| ID | Defeito | Evidência `file:line` na base |
|---|---|---|
| F1 | Resposta 2xx malformada vira vazio falso: `setList({phase:"ready", data: result.data \|\| {}})` e depois `vehicles = … Array.isArray(…) ? … : []`; dossiê aceita `result.data` sem validar `vehicle.id`; regras idem com `\|\| {}` | `FrotaWorkspace.tsx:247`, `:257`, `:267`, `:482` |
| F2 | Releitura descarta o dado lido: toda carga começa com `setList/setDossier/setRules({phase:"loading"})` — não há preservação, marca de "possivelmente desatualizado" nem hora da última leitura concluída | `FrotaWorkspace.tsx:239`, `:251`, `:261` (ausência total de `readAt` no arquivo) |
| F3 | Falha transitória de releitura e negativa (401/403) são indistinguíveis no efeito: ambas substituem o estado por `failed`, sem declarar a diferença entre "dado anterior preservado" e "acesso perdido — fail-closed" | `FrotaWorkspace.tsx:241-246`, `:253-256`, `:263-266` |

Vazio legítimo (2xx válido com `vehicles: []`/`fleet_registered:false`), zero real e as escritas canônicas (com `Idempotency-Key` e chave preservada na falha) já estão honestos e **não** serão alterados.

## 2. Escopo desta fatia (somente isto)

1. `src/lib/fleet-request.ts` (aditivo): descritor `invalid_fleet_response` + leitor validado `fleetRead(url, isValid)` ao lado de `fleetRequest` intacto. O código é diagnóstico desta tela e **não** entra em `fleet-vocabulary.mjs` (mesma decisão 07D-1/07E-1; anti-deriva preservado).
2. `FrotaWorkspace.tsx`: as três leituras (lista, dossiê, regras) passam a (a) exigir a forma canônica no 2xx (lista: `vehicles` array; dossiê: `vehicle.id`; regras: `rules` array); (b) preservar o dado na releitura/falha transitória com faixa `role="alert"`, hora da última leitura concluída (`readAt`, `pt-BR`) e repetição real; (c) falhar fechado em 401/403 (descritor `denied` ou status 401/403) sem manter dado protegido; (d) anunciar "atualizando" sem esconder o conteúdo.
3. Gate focal `tests/ux-fleet-workspace.integration.test.mjs` (aditivo): casos novos de 2xx malformado, preservação em falha de releitura com hora/repetição real e negativa pós-sucesso fail-closed. Nenhuma asserção existente é removida ou enfraquecida.
4. Evidências em `docs/ux-pro-07-frota-evidencias/` (capturas novas dos cenários; `resumo.json`).

## 3. Fora do escopo

- Qualquer escrita, payload, `Idempotency-Key`, endpoint, permissão, `AdminGate`, migração (001–180 intactas) ou regra EXT-01.
- Achados transversais E2–E9 e C11 (decisão separada do proprietário).
