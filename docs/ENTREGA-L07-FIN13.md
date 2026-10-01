# Entrega L07 — FIN-13

## Escopo
Entrega aditiva de orçamento gerencial e cenários de expansão. Orçamentos permanecem explicitamente estimativos: premissas são obrigatórias e a interface informa que não há promessa de resultado.

## Alterações
- `db/migrations/132-fin13-budget-hardening.sql`: histórico imutável, transições `rascunho → em_revisao → aprovado/rejeitado → arquivado`, aprovação com identidade/data, `is_estimate=true`, avisos e tipos de cenário válidos.
- `src/server/fin-budget-api.mjs`: proteção same-origin, sessão financeira/admin/ti e modo somente leitura para TI; auditoria não é silenciosamente ignorada.
- `BudgetWorkspace.tsx`: nova aba no workspace financeiro para cadastro de estimativas com premissas explícitas.
- Gate estático atualizado para a faixa 001–132.

## Validações executadas
- Baseline: `npm ci`, typecheck, static 5/5, unitários e L07 PG: verdes (baseline registrava 22 subtestes).
- Pós-entrega: `npm run typecheck` e `node scripts/qa-wave0-static.mjs`: verdes (5/5, 001–132).

## Limites
Esta entrega não promete resultado financeiro, não executa pagamento automático e não altera migrações históricas ou tipos existentes. Validações PostgreSQL dependentes de ambiente devem ser executadas no CI/ambiente com `DATABASE_MIGRATION_URL`.
