# UX-PRO-07J — escopo e medição anterior (`/admin/satisfacao`)

**Data:** 15/10/2026 · **Base:** `origin/main` com merge da PR #239 (UX-PRO-07I). Próxima fatia do mapa fatiado: **07J — `/admin/satisfacao`**, gate `npm run test:ux-satisfaction:pg` existente (EXT-06).

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

## 1. Defeitos medidos na base (mesma classe 07F–07I)

| ID | Defeito | Evidência `file:line` na base |
|---|---|---|
| J1 | 2xx malformado vira vazio falso: `setList({phase:"ready", data: result.data \|\| {}})` e idem referências; detalhe aceita corpo sem `survey.id` | `SatisfacaoWorkspace.tsx:226`, `:236`, `:247` |
| J2 | Releitura descarta o dado; sem `readAt` no arquivo | `SatisfacaoWorkspace.tsx:217-247` |
| J3 | Negativa 401/403 indistinguível de falha transitória sobre o dado lido | `SatisfacaoWorkspace.tsx:220-225`, `:232-235`, `:243-246` |

## 2. Escopo (somente isto, padrão 07F)

1. `src/lib/satisfaction-request.ts` (aditivo): `invalid_satisfaction_response` + `satisfactionRead(url, isValid)`; `satisfactionRequest` intacto; fora do vocabulário anti-deriva.
2. `SatisfacaoWorkspace.tsx`: lista (`surveys`), referências (`accounts`/`targets`/`staff`) e detalhe (`survey.id`) validados no 2xx; preservação por recurso **e por pesquisa**; faixa `role="alert"` com hora da última leitura e repetição; botão aditivo de releitura da lista; 401/403 fail-closed.
3. Gate focal aditivo (2xx malformado, preservação, negativa pós-sucesso); evidências em `docs/ux-pro-07-satisfacao-evidencias/`.

## 3. Fora do escopo

Escritas, payloads, `Idempotency-Key`, endpoints, permissões, portal do cliente (`/cliente/app/satisfacao`, já tratado à parte), migrações 001–180, E2–E9, C11.
