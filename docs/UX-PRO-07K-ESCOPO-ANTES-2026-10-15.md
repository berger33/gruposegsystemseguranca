# UX-PRO-07K — escopo e medição anterior (`/admin/compliance`)

**Data:** 15/10/2026 · **Base:** `origin/main` com merge da PR #240 (UX-PRO-07J). Próxima fatia do mapa fatiado: **07K — `/admin/compliance`** (inclui documentos/obrigações, que compartilham a jornada), gate `npm run test:ux-compliance:pg` existente (EXT-07).

**Status deste documento:** registro anterior à implementação; nenhuma tela, API, regra de autorização, gate herdado ou CSV foi alterado para produzi-lo.

## 1. Defeitos medidos na base (mesma classe 07F–07J)

| ID | Defeito | Evidência `file:line` na base |
|---|---|---|
| K1 | 2xx malformado vira vazio falso nas 4 listas: `Array.isArray(result.data?.items) ? … : []`; agenda aceita corpo sem `enabled`; detalhes aceitam corpo sem `document.id`/`action_plan.id` (detalhe de documento ainda lê `result.data.document` sem validar) | `ComplianceWorkspace.tsx:318`, `:328`, `:338`, `:348`, `:351-380` |
| K2 | Releitura descarta o dado nas 7 leituras; sem `readAt` no arquivo | `ComplianceWorkspace.tsx:309-380` |
| K3 | Negativa 401/403 indistinguível de falha transitória sobre o dado lido | idem |

## 2. Escopo (somente isto, padrão 07F)

1. `src/lib/compliance-request.ts` (aditivo): `invalid_compliance_response` + `complianceRead(url, isValid)`; `complianceRequest` intacto; fora do vocabulário anti-deriva.
2. `ComplianceWorkspace.tsx`: as 7 leituras validadas no 2xx; preservação por recurso **e por registro** (documento/plano); faixas `role="alert"` com hora da última leitura e repetição; botão aditivo de releitura das obrigações; 401/403 fail-closed.
3. Gate focal aditivo (2xx malformado, preservação, negativa pós-sucesso nas obrigações); evidências em `docs/ux-pro-07-compliance-evidencias/`.

## 3. Fora do escopo

Escritas, payloads, `Idempotency-Key`, endpoints, permissões, agendador EXT-07 (3600s/identidade), planos de ação (migração 168), migrações 001–180, avaliação temporal, E2–E9, C11.
