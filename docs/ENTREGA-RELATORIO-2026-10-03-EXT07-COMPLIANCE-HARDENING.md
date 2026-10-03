# Relatório de entrega — EXT-07 Compliance corporativo: hardening

Data local: 2026-10-03 (UTC)

## Base confirmada antes da edição
- PR #103: `MERGED` — https://github.com/berger33/gruposegsystemseguranca/pull/103.
- Merge commit real: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- Feature commit confirmado via commits da PR: `3cf218d949e3ce04fe49e82ce2dcd1ca6b874584`.
- `HEAD`: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- `origin/main`: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- merge-base: `eff0bbddb5d5681d2612010e4349cfb9ff61234b`.
- divergência inicial: `0 0` (`git rev-list --left-right --count HEAD...origin/main`).
- árvore inicial: limpa; checkout na branch Arena desta sessão.
- última migração real na base: 153; nova última migração: 154.

## Lacunas reproduzidas e decisões
A entrega anterior tinha gate focal estático/TAP, sem HTTP real, sessão staff real, replay concorrente, rollback de auditoria e prova da jornada de tarefa. A fonte canônica continua sendo `ext_compliance_documents`; legado 086 permanece `registro_legado`. A fonte de tarefas é `ext_compliance_tasks`, criada na avaliação temporal. A fronteira de ator é staff `admin`/`ti` com identidade ativa e sessão autoritativa; não há ator externo nem integração regulatória.

`declared_reference` é explicitamente diferente de arquivo real. Nenhuma prova de bytes, upload, checksum, malware scan, armazenamento verificado ou download é inventada. A listagem é allowlist e não retorna `storage_key`, `file_url` ou dados documentais desnecessários.

## Implementação 154
A migração `db/migrations/154-ext07-compliance-hardening.sql` não altera 001–153, não faz seed e usa constraints `NOT VALID` onde necessário. Reforça:
- `is_private` estruturalmente e bloqueio de metadados de arquivo em linha canônica;
- emissão, início e vencimento coerentes, regra declarada e estado temporal calculado pelo servidor;
- renovação como nova linha, justificativa, `replacement_of`, histórico preservado e no máximo uma versão atual;
- tarefa com responsável, datas e unicidade documento/período/regra.

A API foi ajustada para validar identidade staff dentro da transação, derivar autoria da sessão, validar datas de calendário, fornecer detalhe autorizado minimizado, manter same-origin e replay idempotente. Falha no `audit_log` retorna 503 e faz rollback. Tarefas exigem resultado para concluir, justificativa para cancelar e não reabrem terminais.

## Validade, tarefas e concorrência
A avaliação usa data do servidor, registra regra, fatos e data-base, distingue ausência de zero e gera tarefa na mesma transação. A execução automática contínua não existe: a operação administrativa explícita de avaliação é necessária para monitoramento futuro agendado. A unicidade SQL e advisory lock suportam retry e concorrência sem duplicação.

## Resultados executados
- `node scripts/qa-wave0-static.mjs`: **5/5 OK**, migrações 001–154.
- sintaxe dos novos `.mjs`: `node --check` **OK**.
- teste focal: atualizado para 5 casos estáticos; execução isolada requer dependências instaladas nesta cópia.
- `npm test`: **443 pass, 0 fail**, após `npm ci`.
- `git diff --check`: **OK**.
- `npm ci`: **OK**; typecheck: **OK**; build: **OK**, incluindo `/admin/compliance` entre 92 páginas; migrations PG: aplicação/replay/checksum **OK**, clone negativo rejeitado como esperado, porém o runner encerrou com exit 1 ao reportar esse teste negativo; gate PG HTTP completo: **falhou** no probe de servidor nesta execução e requer correção/execução CI.

O gate dedicado foi endurecido para recusar URLs herdadas, aplicar 001–154, exigir PostgreSQL, iniciar servidor HTTP, verificar 401 anônimo e `/admin/compliance`, rejeitar TAP com falha/skip/todo e limpar temporários. A prova completa de sessão staff, 403, mutações, auditoria e concorrência ainda deve ser executada em CI com PostgreSQL 17 e dependências instaladas; não é apresentada como aceite.

## Gates que não cobrem EXT-07
Os gates gerais de build, Wave 0 estático, EXT-01 a EXT-06 e EXT-08 a EXT-12 não substituem o gate dedicado EXT-07. O gate EXT-06 é apenas regressão de sua própria jornada.

## Pendências explícitas
1. Instalar dependências com `npm ci` e executar a bateria obrigatória completa.
2. Executar o gate PostgreSQL dedicado ponta a ponta com sessão staff real e registrar TAP/HTTP/SQL exatos.
3. Revisar e validar checks de CI antes de qualquer merge.
4. Não há aceite humano inventado; merge e aprovação permanecem pendentes.
