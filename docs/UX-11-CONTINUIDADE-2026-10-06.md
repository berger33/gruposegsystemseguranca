# UX-11 / EXT-10 — Continuidade de negócios — 2026-10-06

## ETAPA 0 — inventário antes da apresentação

A fonte foi `origin/main` em `49a9847f71b27d5e06dd0fe6ac296c0ba4f3051b`, após `git fetch origin main`. A rota real é `/admin/continuidade`, composta por `page.tsx` e `ContinuityWorkspace.tsx`. O `AdminGate` permanece exatamente com `admin, ti, marcelo, operacao, supervisor`; o gate de menu não concede grant.

O servidor canônico `src/server/ext-continuity-api.mjs` foi lido integralmente e não foi alterado. Sua factory exporta `createExtContinuityApi`, retornando os handlers `handle` e `handleClient`; `server.mjs` os conecta ao dispatch canônico, sem handler morto. O roteador interno é `^/api/ext/continuity/plans(?:/([^/]+))?(?:/(transition|exercises|client-visibility))?$`; fora dele responde 404 `not_found`. O portal aceita apenas `GET /api/client/continuity/plans` e `GET /api/client/continuity/plans/{id}`.

| método | URL | sucesso |
|---|---|---|
| GET | `/api/ext/continuity/plans` | 200 `{items}` |
| POST | `/api/ext/continuity/plans` | 201 `{plan}` |
| GET | `/api/ext/continuity/plans/{id}` | 200 `{plan,events,exercises}` |
| POST | `/api/ext/continuity/plans/{id}/transition` | 200 `{plan}` |
| POST | `/api/ext/continuity/plans/{id}/exercises` | 201 `{exercise}` |
| POST | `/api/ext/continuity/plans/{id}/client-visibility` | 200 `{plan}` |

Códigos literais medidos no servidor e traduzidos individualmente: `audit_unavailable`, `client_account_not_found`, `client_account_required`, `client_session_required`, `continuity_unavailable`, `forbidden`, `forbidden_account_scope`, `idempotency_conflict_payload_mismatch`, `idempotency_key_required`, `internal_error`, `invalid_account_id`, `invalid_client_account_id`, `invalid_exercise_fields`, `invalid_json`, `invalid_plan_fields`, `invalid_plan_id`, `invalid_status`, `invalid_transition`, `invalid_visible_flag`, `justification_required`, `method_not_allowed`, `not_found`, `origin_forbidden`, `plan_not_found`, `plan_not_publishable`, `unauthorized`, `visibility_note_required`.

A autorização consulta os grants `continuity.read`, `continuity.write` e `continuity.activate`. Escopos `global`/`organization` alcançam planos sem conta; escopo `account` limita à conta própria; fora do escopo é 404 para não vazar existência. A publicação requer conta, estado publicável e justificativa de 10–1000 caracteres. O portal é somente leitura, minimizado e sem publicação por padrão.

Estados: `rascunho → aprovado | arquivado`; `aprovado → em_teste | desatualizado | arquivado`; `em_teste → testado | desatualizado`; `testado → desatualizado | em_teste | arquivado`; `desatualizado → em_teste | arquivado`; `arquivado → rascunho`. Escritas exigem `Idempotency-Key` de 8–200 caracteres e fingerprint SHA-256; protocolo `CONT-EXT-AAAAMMDD-XXXX`. Datas ausentes são distintas de vencimento: “Simulado nunca realizado” e “Próximo teste não agendado”.

## Capacidades preservadas

A apresentação continua criando planos, abrindo detalhe, mostrando trilha e simulados, acionando todas as transições aceitas pelo servidor, documentando exercícios e publicando/retirando publicação no portal. URLs, métodos, corpos, cabeçalho, estados HTTP e prefixo `cont-` foram preservados. Os aliases legados continuam fora desta mudança e permanecem aposentados no servidor.

## Defeitos corrigidos

- fetch cru e JSON sem estado discriminado foram substituídos por `continuity-request.ts`;
- falha de leitura não vira lista vazia; 403 é estado **NEGADO** e 404 de escopo não é “plano removido”;
- datas ausentes não são convertidas em época, zero ou “em dia”;
- chave de idempotência é mantida durante falha e descartada somente após sucesso;
- estilos inline foram removidos; tabs têm roving tabindex e setas/Home/End;
- formulário, lista, detalhe, carregamento, vazio, erro e recusa usam a superfície UI compartilhada.

## Camadas e provas

`continuity-vocabulary.mjs` espelha códigos, estados, grants e projeção publicável. `continuity-request.ts` preserva corpo e status e transforma rede em `status: 0`. `tests/ux-continuity-vocabulary.test.mjs` extrai o servidor real e verifica ausência honesta, enum e dispatch. `tests/ux-continuity-workspace.integration.test.mjs` fixa as invariantes da apresentação. O gate PostgreSQL é `scripts/qa-ux-continuity-postgres.mjs`; workflow focal: `.github/workflows/ux-continuity-delivery.yml`.

## Achados registrados sem alterar servidor

A autorização continua deliberadamente fora do papel do `AdminGate`; grants reais precisam estar provisionados no banco de prova. O portal permanece fail-closed e não expõe trilha, justificativa interna, contatos ou resultado de simulado. Nenhum scheduler, migração, servidor canônico ou `server.mjs` foi tocado.

## O que esta fatia não prova

Não prova homologação humana, aceite de Marcelo ou Andreia, nem funcionamento operacional de alertas externos — estes não existem nesta família. Também não transforma um protótipo em produto homologado: a homologação segue pendente. O gate focal só pode ser considerado completo quando executado em ambiente com PostgreSQL/Chromium descartáveis; a massa deve ser fictícia e criada pelas APIs canônicas.

<!-- Revalidação de checks: reexecução do gate L05 após falha intermitente. -->
