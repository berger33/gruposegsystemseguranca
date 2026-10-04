# Entrega EXT-07 — hardening de compliance corporativo

Data local: 2026-10-04.

## Base confirmada

- PR #103: `MERGED`.
- Merge commit real: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- Feature commit confirmado via commits da PR: `3cf218d949e3ce04fe49e82ce2dcd1ca6b874584`.
- `HEAD`: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- `origin/main`: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- Merge-base: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- Divergência inicial: `0 0`.
- Árvore inicial: limpa.
- Última migração inicial: 153.

## Alterações desta rodada

A migração exclusivamente aditiva `154-ext07-compliance-hardening.sql` reforça privacidade canônica, coerência entre emissão/início/vencimento, regra de validade, proprietário de tarefa, datas de tarefa, versão positiva, índice de eventos e uma única versão atual. Não altera 001–153, não cria seed e mantém documentos legados como `registro_legado`.

A fonte canônica continua `ext_compliance_documents`; a fonte de tarefas continua `ext_compliance_tasks`. Documentos são referências privadas declaradas, não arquivos armazenados: não há alegação de upload, bytes, checksum, malware scan ou download. O ator é staff autorizado `admin|ti`; a autoria é derivada da sessão. Eventos e auditoria permanecem na transação de mutação, com falha de auditoria retornando 503 e rollback.

O manifesto, o log final e `latestMigration` foram atualizados individualmente para 154. O workflow e o runner dedicado passaram a apontar para 001–154. O teste focal lê a jornada 153 juntamente com o hardening 154.

## Validação executada

- `npm ci`: sucesso; 82 pacotes adicionados, 0 vulnerabilidades.
- sintaxe `scripts/qa-ext07-compliance-postgres.mjs`: sucesso.
- sintaxe `src/server/ext-compliance-api.mjs`: sucesso.
- `node scripts/qa-wave0-static.mjs`: **5/5**, migrações 001–154.
- `npm run typecheck`: sucesso.
- teste focal EXT-07: **4/4**, 0 falhas, 0 skips, 0 todo.
- `npm run build`: sucesso, **92 páginas**, incluindo `/admin/compliance`.
- `git diff --check`: sucesso.

A execução do gate PostgreSQL completo, `npm test`, `npm run test:migrations:pg` e os gates de regressão não foi concluída nesta rodada; portanto não são apresentados como evidência. O gate dedicado existente ainda precisa da implementação HTTP real completa descrita no escopo, incluindo servidor, sessão staff, jornada de mutações e asserções PostgreSQL.

## Pendências explícitas

1. Implementar o harness HTTP real descartável e sessão staff sintética no gate, sem URLs herdadas.
2. Cobrir por HTTP e PostgreSQL 401/403, same-origin, 413/JSON inválido, retry/divergência, concorrência, renovação, rollback de auditoria, transições, legado e regressões EXT-08..12.
3. Executar e registrar a bateria integral solicitada.
4. Revisar documentação operacional individual solicitada e abrir PR somente após a bateria completa.

Não houve aceite humano, integração regulatória, armazenamento externo ou dado real inventado.
