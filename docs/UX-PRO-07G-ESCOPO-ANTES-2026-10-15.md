# UX-PRO-07G — escopo e medição anterior (`/admin/terceiros`)

**Data:** 15/10/2026 · **Base:** `origin/main` = `00142f1` (merge da PR #236, UX-PRO-07F). Próxima fatia do mapa fatiado da UX-PRO-07: **07G — `/admin/terceiros`**, com gate focal `npm run test:ux-third-party:pg` já existente (UX-07/EXT-02).

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

## 1. Defeitos medidos no código da base (mesma classe 07F)

| ID | Defeito | Evidência `file:line` na base |
|---|---|---|
| G1 | Resposta 2xx malformada vira vazio falso: `setList({phase:"ready", data: result.data \|\| {}})` e `parties = … Array.isArray(…) ? … : []`; dossiê aceita `result.data` sem validar `third_party.id`; decisão aceita corpo sem `authorized` booleano | `TerceirosWorkspace.tsx:298`, `:308`, `:511`, `:558` |
| G2 | Releitura descarta o dado lido (lista, dossiê e decisão começam por `{phase:"loading"}`); não há `readAt` no arquivo | `TerceirosWorkspace.tsx:290`, `:302`, `:500` |
| G3 | Negativa 401/403 indistinguível de falha transitória no efeito sobre o dado já lido | `TerceirosWorkspace.tsx:292-297`, `:304-307`, `:505-510` |

## 2. Escopo (somente isto, padrão 07F)

1. `src/lib/third-party-request.ts` (aditivo): descritor `invalid_third_party_response` + leitor validado `thirdPartyRead(url, isValid)`; `thirdPartyRequest` intacto. Código diagnóstico da tela, fora do vocabulário anti-deriva.
2. `TerceirosWorkspace.tsx`: as três leituras (lista `third_parties`, dossiê `third_party.id`, decisão `authorized` booleano) exigem a forma canônica no 2xx; preservação por recurso **e por terceiro** (trocar de terceiro descarta dossiê/decisão do anterior — comportamento já declarado em `inspect`); faixa `role="alert"` com hora da última leitura concluída e repetição real; 401/403 fail-closed.
3. Gate focal (aditivo): casos de 2xx malformado, preservação em releitura e negativa pós-sucesso. Nenhuma asserção existente removida/enfraquecida.
4. Evidências em `docs/ux-pro-07-terceiros-evidencias/`.

## 3. Fora do escopo

Escritas, payloads, `Idempotency-Key`, endpoints, permissões, `AdminGate`, migrações 001–180, regras EXT-02 (janela/escopo, grants, fronteira de ator externo), achados E2–E9 e C11.
