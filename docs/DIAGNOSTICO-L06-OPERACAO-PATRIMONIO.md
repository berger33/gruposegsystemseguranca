# Diagnóstico L06 — operação, patrimônio e manutenção

**Data:** 2026-09-30
**Base integrada:** `main` @ `400f079a4e1fe504b779acf83909580d9d082b76` (PR #34 L05 mergeada).
**Branch de sessão:** `arena/01a0f25e-gruposegsystemseguranca`.
**Baseline registrado neste diagnóstico:**

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5; manifesto 001–118 contínuo |
| `npm run typecheck` | aprovado |
| `npm run test:migrations:pg` | aprovado; 118/118 checksums, 517 tabelas, clone descartável, rejeição de mutação sintética |

## 1. Situação encontrada (não é greenfield)

Ao contrário do que o nome "L06" sugere, o schema e boa parte das APIs de OPS/AST **já existem** — foram criados na fase de layout em lote. O trabalho de L06 é **consolidar, canonizar contra o contrato L05 e endurecer autorização/idempotência/auditoria**, além de criar o **gate remoto L06** que hoje não existe.

### 1.1 Migrações já integradas (imutáveis 001–118)

- **OPS**: `070-ops01-02-03-04` (estrutura/dimensionamento/escala/validação), `071-ops05-06-07-08` (cobertura/passagem/ocorrência/checklist), `072-ops09-10-11-12` (supervisão/ronda/chaves/relatório), `073-ops13-14-15-16` (métricas/escalas/limpeza/monitoramento).
- **AST**: `083-ast01-06` (estoque/reserva/ativo/entrega/requisição), `084-ast07-12` (inventário/OS/manutenção/CFTV/limpeza).
- Contrato canônico L05: `118-l05-contract-canonicalization` — `crm_contracts` é a fonte; `client_contracts` é projeção do portal ligada só por `crm_contract_portal_links`; encerramento revoga apenas o contrato de portal associado.

Próxima numeração livre: **119**. O migrador (`scripts/migrate-site-visual.mjs`) tem manifesto fixo com `files.length === 118`; qualquer migração nova exige atualizar essa lista e o `latestMigration` de `scripts/qa-wave0-static.mjs`.

### 1.2 Entidades canônicas (pontes)

- Empresa/unidade: `crm_companies` → `crm_company_units`.
- Contrato: `crm_contracts` (enum `crm_contract_status`: `rascunho, em_revisao, aguardando_assinatura, ativo, suspenso, encerrado, cancelado`).
- Funcionário: `hr_employees` (enum `hr_employee_status`: `em_admissao, ativo, afastado, suspenso, desligado, arquivado`).
- OPS liga-se a `crm_companies`/`crm_company_units`; a ponte posto→contrato só existia via `ops_dimensioning.contract_id`. **Não havia** vínculo direto posto→contrato para bloquear alocação em contrato encerrado.
- Evidência privada: reusa o provedor L02 (`client_documents`) — URL/`storage_key` isolados não são prova, como já consolidado em L05.

### 1.3 APIs já existentes e como estão montadas

- `src/server/ops-api.mjs` (888 l.), `ops-advanced-api`, `ops-advanced2-api`, `ops-advanced3-api`, `emp-ops-api`, `ast-api` (560 l.), `ast-advanced-api` — todas registradas em `server.mjs` sob `/api/admin/hr/ops-*`, `/api/ops/*`, `/api/admin/ast/*` etc.
- Autorização atual: `requireSession` (sessão de staff com estado no servidor, SEC-04/05) + `requireRole(sess, [...])`. `sameOrigin` exigido nas mutações.
- Auditoria OPS/AST: grava em `audit_log (action, actor, target, meta)` — tabela livre (sem CHECK de ação). **Porém a chamada é best-effort (`try{…}catch{}`)**, ao contrário de L05, onde falha de auditoria reverte a escrita.

## 2. Lacunas priorizadas (o que L06 precisa endurecer)

1. **Escopo por contrato/unidade ausente na alocação.** `handleAllocations` autoriza só por papel (`admin/ti/rh`) e insere direto; não valida existência do posto, não bloqueia contrato encerrado/cancelado/suspenso, e um `post_id`/`employee_id` inexistente cai em `500` (erro de FK) em vez de `404/409`. Um contrato encerrado ainda aceitaria nova alocação. **(gate passo 3 e 7)**
2. **Funcionário não validado.** Alocação não confere `hr_employees.status = 'ativo'`; funcionário desligado poderia ser escalado. **(OPS-04)**
3. **Auditoria não fail-closed.** Mutações OPS/AST perdem trilha silenciosamente se `audit_log` estiver indisponível — viola o passo 8 do gate ("auditoria indisponível deve falhar sem efeito parcial").
4. **Idempotência/concorrência de estoque a verificar** em `ast-api` (reserva/baixa não podem ficar negativas nem duplicar sob concorrência) — **(gate passo 5)**.
5. **OS deve consumir material exatamente uma vez** e aceitar evidência privada autorizada, sem duplicar consumo/custo em reexecução — **(gate passo 6)**.
6. **Gate L06 inexistente.** Não há `scripts/qa-l06-delivery-postgres.mjs`, `tests/l06-delivery.integration.test.mjs`, script npm nem workflow — enquanto L04/L05 têm.

## 3. Limites de segurança reafirmados

- Nada de serviço público/emergencial, central 24h, monitoramento real, GPS/despacho externo, SMS/WhatsApp/SMTP real, pagamento/cobrança/NF/compra real. Monitoramento só simulado e rotulado como sintético.
- Contrato ativo ≠ equipe alocada ≠ cobertura concluída ≠ faturamento.
- Cliente/funcionário/terceiro nunca acessam por ID trocado: a API autoriza recurso, contrato, unidade, vínculo e papel; React não é fronteira.
- Migrações 001–118 imutáveis; sem seed demonstrativo persistente; sem base externa/produção. Dados só sintéticos e PostgreSQL descartável.

## 4. Plano de fatias (incrementos verificáveis, cada um fecha verde)

- **Fatia A (esta entrega): alocação + contrato encerrado + escopo/auditoria.**
  - Migração aditiva `119`: `ops_posts.contract_id → crm_contracts` (nullable) + índice.
  - `handleAllocations` POST: valida posto existente/ativo; bloqueia contrato `encerrado/cancelado/suspenso`; exige funcionário `ativo`; insere alocação + auditoria na **mesma transação (fail-closed)**.
  - Gate L06 v1 (`scripts/qa-l06-delivery-postgres.mjs` + `tests/l06-delivery.integration.test.mjs` + `npm run test:l06-delivery:pg` + workflow): PostgreSQL descartável, HTTP real e Chromium; cobre anônimo negado, papel indevido negado, posto/funcionário inexistente (ID trocado) negado, alocação válida (uma vez), sobreposição negada, contrato encerrado bloqueando nova alocação e **auditoria indisponível falhando sem efeito parcial**.
- **Fatia B: cobertura/passagem/ocorrência/checklist (OPS-05..08)** com escopo de posto/unidade/contrato e evidência privada L02.
- **Fatia C: estoque/reserva/ativo (AST-01..06)** — movimentos transacionais, não negativos, idempotentes sob concorrência.
- **Fatia D: inventário/OS/manutenção (AST-07..12)** — consumo único, evidência privada, dossiê/custo de referência.
- **Fatia E: supervisão/ronda/limpeza/monitoramento sintético (OPS-09..16)** e indicadores com fonte/período/incompletude.
- Cada fatia amplia o gate L06 e atualiza a matriz OPS/AST em `docs/CHECKLIST-ENTREGA-LOCAL.md`.

## 5. Diferenciação de estado

- **Conclusão técnica local**: verificável pelo gate L06 (HTTP + PG descartável + Chromium).
- **Aceite humano**: pendente do usuário/PR.
- **Integração externa**: fora de escopo por política (monitoramento, despacho, compra reais permanecem bloqueados e rotulados).
- **Simulação**: monitoramento é explicitamente sintético.
