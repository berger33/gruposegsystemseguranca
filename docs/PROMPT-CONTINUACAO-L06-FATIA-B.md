# Continuação no Arena — L06 fatia B em diante (cobertura, estoque, OS)

## Contexto já entregue (fatia A)

Trabalhe em `berger33/gruposegsystemseguranca`. A **fatia A do L06** já está integrada/na PR da sessão anterior:

- Migração aditiva `119-l06-operacao-hardening` (`ops_posts.contract_id → crm_contracts`).
- `ops-api` endurecido em `POST /api/ops/allocations` (posto/contrato/funcionário validados, sobreposição corrigida e fail-closed, contrato encerrado bloqueia nova alocação, auditoria transacional fail-closed) e `POST /api/ops/posts` (aceita `contract_id` com coerência de empresa).
- Área `/admin/operacao`.
- Gate L06: `scripts/qa-l06-delivery-postgres.mjs`, `tests/l06-delivery.integration.test.mjs`, `npm run test:l06-delivery:pg`, workflow `.github/workflows/l06-delivery.yml`.
- Diagnóstico em `docs/DIAGNOSTICO-L06-OPERACAO-PATRIMONIO.md`; relatório em `docs/ENTREGA-L06.md`.

Leia esses arquivos e o `docs/PROMPT-CONTINUACAO-L06-OPERACAO-PATRIMONIO.md` (plano-mãe) antes de começar.

## Pré-condições (obrigatórias)

1. Confirme `main`/SHA e que a PR da fatia A foi mergeada; não parta de base antiga.
2. Baseline: `node scripts/qa-wave0-static.mjs`, `npm run typecheck`, `npm run test:migrations:pg`, `npm run test:l06-delivery:pg`.
3. Migrações 001–119 imutáveis; próxima livre é **120**. Ao criar migração, atualize o manifesto em `scripts/migrate-site-visual.mjs` (lista + `files.length`) e `latestMigration` em `scripts/qa-wave0-static.mjs`.
4. Só dados sintéticos e PostgreSQL descartável. Limites de segurança do plano-mãe continuam valendo (sem serviço/monitoramento/compra/cobrança reais; contrato ativo ≠ cobertura/faturamento; nada de acesso por ID trocado).

## Ordem sugerida das próximas fatias

- **Fatia B — OPS-05..08** (cobertura, passagem, ocorrência, checklist): ausência/cancelamento abre cobertura auditável; supervisor só substitui pessoa habilitada e sem conflito; passagem/ocorrência/checklist com escopo posto/unidade/contrato, autor e data; evidência privada reutiliza L02; usuário B e cliente B negados.
- **Fatia C — AST-01..06** (estoque, reserva, ativo, entrega, requisição): movimentos transacionais, quantidade não negativa e idempotência; reserva/liberação/baixa concorrentes não duplicam nem ultrapassam disponibilidade; autorização por almoxarifado/unidade/contrato.
- **Fatia D — AST-07..12** (inventário, OS, manutenção): OS consome material exatamente uma vez, aceita evidência privada autorizada e atualiza dossiê/custo de referência; reexecução não duplica consumo/evidência/custo.
- **Fatia E — OPS-09..16** (supervisão, ronda, chaves, limpeza, monitoramento sintético, indicadores): trilha/autorização/idempotência; monitoramento explicitamente simulado; indicadores com fonte/período/incompletude.

## Regras de execução por fatia

- Amplie `tests/l06-delivery.integration.test.mjs` com o fluxo da fatia (sem skip/mocks de banco/navegador) e mantenha o gate verde.
- Reaproveite as entidades canônicas (`crm_contracts`, `crm_company_units`, `hr_employees`, provedor privado L02); não crie contrato/portal/cliente.
- Autorize sempre na API por recurso, contrato, unidade, vínculo e papel; use `/api/ops/*` e `/api/ast/*` fora da borda de RH quando o recurso não for de RH.
- Rode e registre conforme afetado: `qa-wave0-static`, `typecheck`, `npm test`, `npm run build`, `test:migrations:pg`, `test:l06-delivery:pg` e, se tocar contratos/CRM/portal, `test:l04-delivery:pg`/`test:l05-delivery:pg`.
- Atualize a matriz OPS/AST em `docs/CHECKLIST-ENTREGA-LOCAL.md` e o relatório `docs/ENTREGA-L06.md`; diferencie conclusão técnica local, aceite humano, integração externa e simulação.
- Abra PR revisável da branch da sessão e aguarde checks verdes. Não inicie L07.
