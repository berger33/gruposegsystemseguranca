# UX-PRO-07I — escopo e medição anterior (`/admin/qualidade`)

**Data:** 15/10/2026 · **Base:** `origin/main` = `3047a0c` (merge da PR #238, UX-PRO-07H; inclui também a PR #235 de sessão paralela). Próxima fatia do mapa fatiado: **07I — `/admin/qualidade`**, gate `npm run test:ux-quality:pg` existente (EXT-05).

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

## 1. Defeitos medidos na base (mesma classe 07F–07H)

| ID | Defeito | Evidência `file:line` na base |
|---|---|---|
| I1 | 2xx malformado vira vazio falso: `Array.isArray(result.data?.nonconformities) ? … : []` e idem `staff`; detalhe aceita `result.data` sem validar `nonconformity.id` | `QualidadeWorkspace.tsx:211`, `:221`, `:232` |
| I2 | Releitura descarta o dado (três leituras começam por `{phase:"loading"}`); sem `readAt` no arquivo | `QualidadeWorkspace.tsx:202-232` |
| I3 | Negativa 401/403 indistinguível de falha transitória sobre o dado lido | `QualidadeWorkspace.tsx:205-210`, `:217-220`, `:228-231` |

## 2. Escopo (somente isto, padrão 07F)

1. `src/lib/quality-request.ts` (aditivo): `invalid_quality_response` + `qualityRead(url, isValid)`; `qualityRequest` intacto; código fora do vocabulário anti-deriva.
2. `QualidadeWorkspace.tsx`: lista (`nonconformities`), referências (`staff`) e detalhe (`nonconformity.id`) validados no 2xx; preservação por recurso **e por não conformidade**; faixa `role="alert"` com hora da última leitura concluída e repetição; 401/403 fail-closed.
3. Gate focal aditivo (2xx malformado, preservação, negativa pós-sucesso); evidências em `docs/ux-pro-07-qualidade-evidencias/`.

## 3. Fora do escopo

Escritas, payloads, `Idempotency-Key`, endpoints, permissões/grants EXT-05 (incl. escopo por conta, migração 172), migrações 001–180, E2–E9, C11.
