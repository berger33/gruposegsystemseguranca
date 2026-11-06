# Fatia 05AA — supervisor do scheduler durável

**Data:** 05/11/2026. `HEAD` e `origin/main`, conferidos após fetch: `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b`, merge da PR #349. Branch ativa `arena/8208e8f7-gruposegsystemseguranca`. As alterações locais ainda não publicadas de 05Y e 05Z foram preservadas; não pertencem necessariamente à base. Sem commit, push, PR, deploy, provedor externo ou dados reais.

**Fatia 05 parcial:** a matriz foi conferida: 58/68 antes e **59/68 adotados / 9 pendentes** depois. O gate negativo do supervisor é arquivo adicional fora do denominador. Produção **NO-GO**.

## Inventário e alteração

Escopo de um runner: `scripts/qa-durable-scheduler-postgres.mjs`, comando `npm run test:durable-scheduler:pg`, integração `tests/e16-durable-scheduler.integration.test.mjs`, unitário `tests/e16-durable-scheduler.test.mjs` e chamador `.github/workflows/ci.yml`. A prova inicia PostgreSQL 17 exclusivo em loopback, aplica migrações, usa dados sintéticos e processos filhos reais para disputar a reivindicação. Cobre transação abortada ao matar o trabalhador no lease, retomada de slot, ledger/idempotência, backoff, recuperação, concorrência e controle negativo. A integração exige banco via `QA_E16_REQUIRE_DB=1`; existem **11 testes**, mas o piso herdado do auditor TAP é **9**, mantido sem alteração. Não há filtro de teste; falha, skip, todo, mínimo não alcançado e ausência de resumo reprovam. Não se alteraram scheduler, regras de negócio, migrações ou teste de integração.

No POSIX, as recusas de URL/opt-in remoto continuam antes de criar worker ou cluster. O supervisor cria sandbox e grupo de processos, `createLocalQaDatabase` cria a base exclusiva e as fases têm limites e conclusão explícita. `releaseSignalHandlers()` evita competir pelos sinais; a guarda de gerados de saída continua. Se `postgres.stop()` rejeitar em supervisão, o gate agora falha, em vez de fingir sucesso. No caminho Windows anterior preservam-se o tratamento legado e seu token `QA_E16_PG_TEMP_CLEANED`, que não prova a limpeza; Windows não foi homologado. No caminho supervisionado, o pai confirma a remoção e emite `QA_PG_TEMP_CLEANED`. `FONTCONFIG_PATH`, supervisor compartilhado, `observed-shell.sh` e regras de proveniência não foram alterados.

Limites: migração **90s**, teste **300s**, soma das fases **540s**, mais margens limitadas de encerramento/remoção. O teste completo sob carga durou 17,43s de parede (o TAP informa 9,17s); a margem não é promessa para hardware lento, nem prova de que todos os máximos internos possam ocorrer simultaneamente. Não se mediu separadamente a fase de migração. O workflow principal já executava `npm test`, o negativo PG e este gate, em sequência e com `observed-shell.sh`; nenhuma etapa ou timeout do CI foi alterado.

## Evidências locais

Linux/Node 22.22.3, PostgreSQL local sintético; sem padrões e com zero falhas/skip/todo:

| Ensaio | Resultado | Tempo de parede |
|---|---|---:|
| Baseline antes da alteração | 11/11, exit 0 | 13,65s |
| Supervisionado isolado | 11/11, exit 0 e limpeza confirmada | 13,18s |
| Supervisionado sob dois consumidores CPU | 11/11, exit 0 e limpeza confirmada | 17,43s |

O negativo PG sob carga durou 6,81s, exit geral 0: colisão e cluster morto produziram falhas internas esperadas (exit 1, timeout de stop), com limpeza. Esses casos não são clusters bem-sucedidos.

Dois cancelamentos reais, com sinal apenas ao supervisor, após observação do gatilho:

| Gatilho | Sinal | Exit | Tempo desde início |
|---|---|---:|---:|
| Banco pronto | SIGTERM | 143 | 0,88s |
| Processo filho do harness do scheduler ativo | SIGINT | 130 | 5,25s |

O processo ativo foi identificado pela linha de comando; isso não prova que já tinha concluído o trabalho ou entrado numa fase específica do lease. Ambos os sandboxes foram removidos, token de limpeza emitido e arquivos gerados preservados. A árvore foi amostrada via `/proc` por ancestralidade, PID e instante de criação: nenhum descendente **observado** permaneceu ativo. Zumbi não é processo ativo; processos destacados, nascidos entre amostras ou escapados não são prova exaustiva. SHA-256 de `next-env.d.ts`: `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; de `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

## Regressão e higiene

- Supervisor **70/70**; novos testes executam as três recusas reais (exit 2), o auditor TAP real contra ausência/falha/parcial/skip/todo e a integração real sem banco exigido, verificando a reprovação e resumo negativo. Conferem também protocolo, parada, ausência de filtro e vínculo no CI.
- Focal de supervisor, scheduler durável e compliance, higiene e package-artifacts: **149/149**. Após build/Next, `npm test` **1611/1611**, zero fail/skip/todo. `npm run typecheck` e `npm run build` exit 0; `npm run reaudit:sec` **35/35 âncoras**, wave0 **5/5**.
- Geradores `requisitos-222-inventory.mjs`, `ux-pro-00-inventory.mjs` e `ux-pro-03-ti-inventory.mjs` executados e verificados com `--check`, sem diff nos artefatos. Logs e harness em `/tmp/f05aa`, não versionados.

## Limites

Não é teste de operação ou retomada em produção, nem homologação de CI remoto, Windows, UAT ou aceite humano. A supervisão não garante contenção sob SIGKILL/OOM do supervisor, travas do kernel/filesystem ou processos destacados/escapados. Isolamento global de arquivos gerados entre gates concorrentes não foi demonstrado. Client-security/N8 e N9 continuam abertos; próxima subfatia deve ser escolhida após inventariar os nove runners restantes.
