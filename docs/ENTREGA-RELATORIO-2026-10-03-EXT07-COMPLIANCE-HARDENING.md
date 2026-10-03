# Relatório de entrega — EXT-07 Compliance corporativo — hardening do gate real — 2026-10-03

## Base e decisão
- Continuação do EXT-07 original (PR #101 **MERGED**; migração `153-ext07-compliance-journey.sql`; relatório `ENTREGA-RELATORIO-2026-10-03-EXT07-COMPLIANCE.md`).
- O relatório original declarava como pendência: *executar o gate real com PostgreSQL 17, servidor HTTP, sessão staff e fixtures `.invalid`; validar replay/concorrência, rollback de auditoria e rota no navegador nesse ambiente*. Este pacote atende essa pendência de ponta a ponta.
- Nenhuma asserção foi reduzida para fazer o gate passar; falhas reveladas pelo próprio gate foram diagnosticadas e corrigidas na fonte.

## Implementação
**Migração `154-ext07-compliance-hardening.sql` (exclusivamente aditiva, 001–154 verificadas, checksum imutável):**
- FK `superseded_by` do versionamento documental passa a `DEFERRABLE INITIALLY DEFERRED`: a renovação em cadeia grava a nova versão e a referência de superação na mesma transação sem violar a FK (validado: renew → 201, `version_no=2`, `replaced_document_id`; re-renovar o superado → 409 `already_superseded`).
- Trava de aceite consultável `ext_migration_locks`: attach idempotente com pid vivo (mesmas rows, sem duplicar), `attach_conflict` quando o pid vivo não é o do processo, lock estável no `pg_locks` (ClassID A), corrupção de slot → 409 na consulta de idempotência.
- Integridade "ausência nunca é zero" trancada nas consultas de atividade: assertivas Órfão/Stale/Fantasma contra `pg_stat_activity`.

**API (`src/server/ext-compliance-api.mjs`):**
- Idempotência consultável com detecção de divergência (replay → 200; mesmo key com corpo divergente → 409).
- 24 classes de xpath/expressão maliciosa falham fechado com 400 nas 4 rotas expostas; normalização de whitespace por token canônico (split/filter/join) — indentação legítima de 2 espaços não colide mais com a classe tabulação-sobre-xpath.
- Rotas de ataque resistem: escape de tipo e SQLi em método → 364/400/405 conforme domínio.
- `UnauthorizedError` do PG → 401 JSON `unauthorized`; erro real ≠ credencial → 403-ausência (com auditoria); denegações terminais C1–C4 geram trilha.
- `x-ext07-actor` / `x-ext07-protocol` nunca derivam autoridade; segredo ausente → 401 `unauthorized`.
- `assertProductionLockAcceptance`: produção (`NODE_ENV=production`, sem `QA_ENV`) faz fail-fast sem segredo; staging tolera e registra observação sem reprovar.
- Handlers da factory passíveis de chamada direta (`handleX(req,res,sess=session)`) — roteador e teste focal convergem para o mesmo contrato.

**Infraestrutura do servidor (`server.mjs`):**
- Guarda-chuva no dispatcher: `try/catch` em torno de `await routeApi(req,res)`. Os ramos retornam a promise dos handlers (`return extXApi.handleY(...)`) e um `try/catch` interno ao `routeApi` não enxerga rejeição assíncrona com `return promise`; sem o guarda-chuva, erro de handler virava `unhandledRejection` e a requisição ficava pendurada até timeout. Contrato agora: ausência/erro interno → **500 genérico `internal_error`**, nunca silêncio.
- `adminCapabilities` honra `freeNext` antes de exigir segredo.
- Manifest do migrador (`scripts/migrate-site-visual.mjs`) e gate estático (`scripts/qa-wave0-static.mjs`) atualizados para 001–154.

**Bug latente revelado pelo gate (não-regressão EXT-08..12) e corrigido:**
- `handleContinuityPlans` (EXT-10) fazia join usando `ca.name`, coluna inexistente — o nome real em `client_accounts` é `display_name`. O erro virava `unhandledRejection` e a requisição **pendurava** o cliente (o que motivou o guarda-chuva acima); detectado de forma determinística com diagnóstico `pg_stat_activity`/estado de processo/probe TCP no modo falha do caso de não-regressão.

**UI e rotas legadas:**
- `/admin/compliance` (ComplianceWorkspace) responde 200 com marca própria em servidor real; `ExtAdvancedClient.tsx` preservado.
- `/api/ext/compliance-documents` (086) preservada: leitura autorizada com `items`; mutações 410.

## Testes e gates
- `tests/ext07-compliance.test.mjs` — focal, 71 casos com pool falso: 401/403/400 sem banco; INSERT de obrigação ancorado com autoria da sessão (`params[9]=responsible`, `params[10]=created_by`); replay 200 / divergente 409; documento com pai inexistente 404; datas não-ISO e validade incoerente 400 `invalid_validity`; avaliação com `CURRENT_DATE::text` do servidor (sem data do cliente); falha de auditoria → ROLLBACK pós `INSERT audit_log`; constantes `COMPLIANCE_*`; wiring estático servidor/UI/workflow.
- `tests/ext07-compliance.integration.test.mjs` — 61 casos TAP contra PostgreSQL 17 real descartável + servidor HTTP real (custom server Next dev, fixtures `.invalid` apenas): fronteira de ator e guardas HTTP; claims e persistência de lock; reattach idempotente; `attach_conflict`; 24 classes xpath em 4 rotas; perda de conexão → 503 `lock_unavailable` + `absence_is_not_zero`; ausência/integridade nunca zero; rotas de ataque 364/400/405; idempotência, avaliação temporal, renovação/anulação terminal, agregados; não-regressão EXT-08..12; tela `/admin/compliance`.
- `scripts/qa-ext07-compliance-postgres.mjs` — runner do gate: EmbeddedPostgres descartável com recusa de `DATABASE_URL` externa, migrações 001–154 via `QA_MIGRATION_ONLY`, `QA_EXT07_REQUIRE_DB=1`, corte automatizado (`fail` se `pass < max(55, ceil(total×0,85))`, mínimo declarado 55), auditTap sem segredos no log, cleanup garantido.
- `.github/workflows/ext07-delivery.yml` — gate obrigatório em PRs que toquem EXT-07/migrações/server: `services: postgres:17` com health check, `npm ci`, `test:migrations:pg`, `test:ext07-compliance:pg`.

## Validação observada nesta sessão
- `node --test tests/ext07-compliance.test.mjs`: **71/71**, 0 falhas, 0 skips (duas corridas).
- `npm run test:ext07-compliance:pg`: **61/61**, 0 falhas, em ~14 s; **duas corridas consecutivas verdes** após as correções (primeira corrida da série diagnosticou e fixou 5 defeitos + o hang acima).
- `npm run test:migrations:pg`: **154/154** verificadas, tamper no clone rejeitado sem rebaseline automático, exit 0.
- Diagnósticos executáveis anteriores às correções permanecem reproduzíveis pelos logs `/tmp/ext07-gate-*.log` da sessão (não versionados).

## Fronteiras
- Nenhum aceite humano, bateria em destino ou homologação Windows foi inventado; permanecem fora do escopo.
- O workflow de CI foi validado estaticamente e por reprodução local dos mesmos comandos; a prova no GitHub Actions ocorre após push/PR.

## Gates que não cobrem EXT-07
Estático, typecheck, unit, build e gates antigos EXT-01..06/CLI não substituem `npm run test:ext07-compliance:pg`; este relatório não declara cobertura daqueles gates para esta feature.
