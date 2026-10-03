# Relatório de entrega — EXT-07 Compliance hardening — 2026-10-03

## Base e decisão
- PR #103: **MERGED**, `https://github.com/berger33/gruposegsystemseguranca/pull/103`.
- Merge commit descoberto por execução: `eff0bbddb5d5681d2612010e4349cfb9ff61234b` (mergedAt 2026-10-03T20:48:13Z).
- Trabalho exclusivamente na branch da sessão; nenhum merge foi autorizado nem executado.

## O que a sondagem/gate endurecido reproduziu antes de editar
1. **Namespace canônico morto**: `/api/ext/compliance/*` não constava no `API_PATH_MATCH` de `server.mjs` — todo o namespace respondia 404 via Next.
2. **Guarda temporal com fronteira errada** (154 em rascunho de sessão): `vencida` exigia `expiry < CURRENT_DATE`, mas a avaliação classifica vencimento como `expiry <= data-base`; documento vencendo "hoje" explodia a avaliação inteira em 503. Sonda direta em PG17 embutido confirmou aceitação/rejeição caso a caso.
3. **Aliases legados sob RH negados**: `/api/admin/hr/ext-compliance-documents` e `/api/crm/hr/ext-compliance-documents` caíam na borda granular de RH (403) enquanto o alias canônico servia 200 — duas autorizações conflitantes para o mesmo recurso.
4. **EXT-10 matava o servidor**: erro de coluna inexistente (`ca.name`) em `handleContinuityPlans` virava `unhandledRejection`; a requisição nunca respondia (timeout de 15 s no cliente) e o processo ficava comprometido — capturado no log do servidor que o gate passou a preservar (`QA_EXT07_SERVER_LOG`).
5. Regressão colateral tolerada pelo gate antigo: projeção da continuidade referenciava coluna inexistente em `client_accounts`.

## Implementação (hardening, aditiva)
- `server.mjs`: `API_PATH_MATCH` passa a incluir `pathname.startsWith("/api/ext/compliance/")`; isenção dedicada e comentada para os três aliases históricos de compliance na borda de RH (mesmo precedente dos aliases `ops-*`); rota de continuidade envolvida em falha fechada com resposta 500 explícita (`continuity_unavailable`) em vez de rejeição não tratada.
- `db/migrations/154-ext07-compliance-hardening.sql`: migração exclusivamente aditiva — guarda de cadeia (uma raiz ativa por obrigação, renovação só da ponta, `version_no+1`, sem ciclo, cancelada não renova), guarda temporal (datas obrigatórias/coerentes, referência declarada obrigatória, `vencida` exige validade já encerrada na data-base — fronteira alinhada com a avaliação: rejeita apenas validade futura), guarda de imutabilidade (protocolo, datas, referência, cadeia, versão, autoria; transições de status conforme matriz; cancelada é terminal), guarda de tarefa/obrigação (transições e campos históricos imutáveis), trigger `documents_touch`. Migrações 001–153 intactas; 154 registrada no migrador e no estático.
- `src/server/ext-compliance-api.mjs`: API canônica completa — sessão staff `admin|ti` (401≠403), same-origin só em mutações, chave de idempotência obrigatória com fingerprint profundo (replay idêntico 200, divergente 409 inclusive aninhado), limite de corpo 128 KiB (413), JSON inválido/raiz não-objeto 400, UUID malformado 400 (inclui rotas de detalhe/renovação/transição), responsável staff ativo obrigatório (fail-closed na avaliação), data-base exclusivamente do servidor (`postgres_current_date`), avaliação com `ON CONFLICT` (uma tarefa por documento/período/regra), tarefa inicia/conclui/cancela com justificativa e sem reabertura, renovação gera versão nova preservando a anterior byte a byte, eventos imutáveis expostos sem payload, escrita de negócio + evento + `audit_log` na mesma transação (falha de auditoria → 503 e rollback), projeções de listagem minimizadas e fronteira declarada (sem upload/bytes/checksum/malware/storage verificado/download).
- `src/server/ext-advanced-api.mjs`: legado compliance apenas GET com projeção minimizada; escritor dormente removido (410 `legacy_writer_retired`); continuidade com projeção corrigida (`ca.display_name`).
- `src/app/admin/compliance/ComplianceWorkspace.tsx`: UI real `/admin/compliance` (obrigação, documento reference-only, renovar, avaliar, tarefa iniciar/concluir/cancelar; chaves de idempotência por operação preservadas em falha; texto de fronteira explícito). `ExtAdvancedClient.tsx` preservado sem alteração.

## Gate endurecido (transformado, não mantido)
- `scripts/qa-ext07-compliance-postgres.mjs`: cluster PostgreSQL 17 embutido em loopback com porta aleatória; **recusa** `DATABASE_URL`/`DATABASE_MIGRATION_URL`/`RUN_DATABASE_INTEGRATION_REMOTE=1` herdados (exit 2); aplica migrações 001–154; sobe servidor HTTP real com sessão staff real provisionada pela suíte; executa `tests/ext07-compliance.integration.test.mjs` (47 cenários); auditoria TAP exige `pass ≥ 46` e **rejeita qualquer fail/skip/todo**; limpa cluster, servidor e `.next/integration-ext07`; preserva log do servidor em `QA_EXT07_SERVER_LOG`. Sem banco de verdade, o gate falha — nunca cai para simulado.
- `.github/workflows/ext07-delivery.yml`: gate de PR no modelo EXT-06 — typecheck+unit → ledger de migrações → gate EXT-07.

## Validação observada (esta sessão, executada)
- Sonda direta PG17 (descartável, apagada após uso): cadeia version_no/tip/ciclo âncora -> rejeições CORRETAS; fronteira temporal "vencida hoje" reproduzida e corrigida no arquivo da 154.
- `node --test tests/ext07-compliance.test.mjs`: **13/13**.
- `node --check` em todos os arquivos novos/alterados: OK.
- `node scripts/qa-wave0-static.mjs`: **5/5** (migrações 001–154 contínuas e registradas).
- `npm run typecheck`: OK.
- `npm run test:migrations:pg`: **EXIT 0** — apply 001–154, replay idempotente, 154/154 checksums, auditoria de amostra, clone com checksum adulterado rejeitado sem rebaseline, 561 tabelas estáveis.
- `npm run test:ext07-compliance:pg`: regressão intermediária visível (34→43→46) e fechamento **47/47, 0 fail/skip/todo, EXIT 0** com cluster temporário limpo.

## Incidentes reais encontrados pelo gate endurecido e corrigidos
Fronteira temporal da 154 (era a causa do 503 na avaliação); rota legacy sob RH (403 duplicado); EXT-10 derrubando o processo (projeção com coluna inexistente + ausência de falha fechada); UUID malformado 405→400; categoria curta no fixture EXT-12; três bugs de autoria do próprio teste (formato de data `Date` vs ISO; fixture de cancelada sem obrigação; UPDATE no-op que não exercitava imutabilidade de cadeia — corrigido para sobrescrita real de linhagem).

## Fronteiras preservadas
Sem dados reais, sem SMTP real, sem storage externo, sem ator externo ou integração regulatória inventada; fixtures 100% sintéticas em domínios `.invalid`; nenhum aceite humano declarado; nenhuma migração 001–153 alterada; nenhuma remoção de `ExtAdvancedClient.tsx` nem de handlers EXT-08..12; nenhum merge executado.

## Pendências honestas
Bateria pesada/fora de escopo (homologação Windows, destino, aceite humano) permanece fora desta entrega. A chave canônica do namespace público de compliance continua inexistente por desenho (não há rota pública).
