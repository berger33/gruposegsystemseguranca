# Entrega L07 — FIN-13

## Escopo
Entrega aditiva de orçamento gerencial e cenários de expansão. Orçamentos permanecem explicitamente estimativos: premissas são obrigatórias, `is_estimate=true` é preservado e a interface informa que não há promessa de resultado financeiro.

## Alterações
- `db/migrations/132-fin13-budget-hardening.sql`: histórico imutável, transições `rascunho → em_revisao → aprovado/rejeitado → arquivado`, aprovação com identidade/data, `is_estimate=true`, avisos e tipos de cenário válidos.
- `src/server/fin-budget-api.mjs`: handlers FIN-13 transacionais com `BEGIN`/`COMMIT`, bloqueio `FOR UPDATE` nas mutações de orçamento/cenários, auditoria fail-closed com rollback total e `503 audit_unavailable`, validação allowlist sem detalhes SQL, sessão/same-origin/papéis financeiro/admin e `/admin/ti` somente leitura para orçamento/cenários.
- `server.mjs`: auditoria FIN-13 passa a aceitar o client transacional e não é silenciosamente ignorada.
- `BudgetWorkspace.tsx`: nova aba no workspace financeiro com cadastro de orçamento e cenário, premissas explícitas e aviso de estimativa sem promessa de resultado.
- `tests/l07-delivery.integration.test.mjs`: gate L07 passou de 22 para 24 subtestes, incluindo teste HTTP FIN-13 e teste Chromium da nova aba.
- Gate L07 atualizado para reportar 24 subtestes; gate estático permanece na faixa de migrações 001–132.

## Validações executadas em 2026-10-01
Observação: a primeira tentativa de `npm run typecheck` antes da instalação falhou por precondição de ambiente (`tsc: not found`). Após `npm ci`, os gates abaixo foram executados com sucesso:

- `npm ci`: OK, 82 pacotes instalados, 0 vulnerabilidades.
- `npm run typecheck`: OK.
- `node scripts/qa-wave0-static.mjs`: OK, 5/5 verificações; migrações 001–132 contínuas e registradas.
- `npm test`: OK, 196/196 testes.
- `npm run test:migrations:pg`: OK, migrações 001–132 em duas passagens idempotentes e clone/checksum preservado (o stderr de checksum mismatch em `006` é o cenário negativo esperado pelo próprio gate, com exit code 0).
- `npm run test:l07-delivery:pg`: OK na 1ª execução consecutiva, 24/24 subtestes; Chromium sem SIGSEGV.
- `npm run test:l07-delivery:pg`: OK na 2ª execução consecutiva, 24/24 subtestes; Chromium sem SIGSEGV.
- `npm run test:l03-delivery:pg`: OK, 1/1.
- `npm run test:l04-delivery:pg`: OK, 20/20.
- `npm run test:l05-delivery:pg`: OK, 1/1.
- `npm run test:l06-delivery:pg`: OK, 9/9.
- `npm run build`: OK, build Next.js concluído e 78 páginas estáticas geradas.

## Limites
Esta entrega não promete resultado financeiro, não executa pagamento ou cobrança real e não altera migrações históricas ou tipos existentes. Os dados dos testes são sintéticos e isolados em PostgreSQL descartável.
