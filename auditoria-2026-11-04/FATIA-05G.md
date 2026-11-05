# Fatia 05G — apoio emergencial e gate de migrações

**Data:** 04/11/2026. **Branch:** `arena/a5202d09-gruposegsystemseguranca`. HEAD/origin-main `0e6456e9d01b825a3bff4997f92506ac4ff1c633` conferidos após fetch. Trabalho anterior preservado. Sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** dois runners adicionais com wrapper supervisionado e provas locais em Linux/POSIX. Total **22/68**; **46 ainda não migrados**. Produção **NO-GO**.

## 1. Contratos preservados

### Apoio emergencial

`qa-ext15-emergency-postgres.mjs` mantém HTTP real, RBAC/sessões/fixtures sintéticas, banco exclusivo, migrações completas, mínimo TAP **16** e rejeição de falha/skip/todo. Continuam os testes de prontidão de recebimento/atendimento declarativos e ativação humana sintética. Não houve acionamento de canal, contato externo ou envio real. Nenhum arquivo de integração, API, rota, permissão ou schema foi alterado.

### Migrações — contrato próprio, não uma suíte TAP

`qa-migrations-postgres.mjs` mantém:

- quantidade esperada derivada do disco, sem trocar a contagem por constante;
- primeiro passe com ledger e checksums completos;
- retenção legada e novo schema UUID preservados, regras de trabalho ainda não aprovadas/ativadas e seeds sensíveis sem promoção automática;
- amostra de auditoria operacional persistida, chave inválida recusada e evento legado de autenticação aceito;
- segundo passe idempotente, sem perda da amostra auditável nem mudança no número de tabelas;
- clone QA via `CREATE DATABASE ... TEMPLATE`, mutação sintética e divergência de checksum deliberada no clone;
- divergência da 006 recusada com exit 1, **sem rebaseline**;
- recriação do clone com ledger, contagens e dados originais restaurados.

O clone permanece **dentro do cluster descartável**. Não é pg_dump/pg_restore, recuperação de desastre, ensaio de produção ou prova de RPO/RTO. Nenhum banco do operador é usado.

## 2. Implementação

Supervisor/helper compartilhados não foram modificados. Ambos os runners passam pelo wrapper POSIX antes de importar embedded-postgres no worker, usam sandbox/grupo próprios, criação local via Client limitada e fases monotônicas. Migração **90s**, testes/verificações **180s**; total do protocolo **420s**, além das margens já documentadas. Baselines e carga abaixo sustentam esse perfil, sem aplicá-lo aos runners pesados restantes.

No gate de migrações, fase `migrate` cobre o primeiro passe; fase `test` cobre as conferências, segundo passe e clone/checksum negativo. A fase `stop` começa antes de fechar o pool, para o fechamento também ficar sob o teto externo.

As conexões/pools **das verificações SQL do runner** e do clone receberam, no caminho supervisionado:

- conexão **10s**;
- query/statement **30s**;
- erro ocioso registrado como falha do gate, sem imprimir URL/segredo;
- fechamento do Client administrativo em finally também se a conexão falhar.

Essas opções não alteram o migrador SQL compartilhado nem os timeouts de cada DDL: o subprocesso migrador continua contido pelo prazo da fase/grupo. A API legada de criação sem limites é evitada no caminho supervisionado. Workers não removem sandbox nem declaram limpeza antecipadamente; tokens vêm do pai após confirmação. Limpeza não transforma reprovação em sucesso.

Guardas de URLs e `ALLOW_REMOTE_MIGRATIONS=true` preservadas; `RUN_DATABASE_INTEGRATION_REMOTE=1` passa a ser recusado explicitamente pelo runner de migrações também antes do fork. Windows mantém lifecycle anterior, com essa recusa local conservadora adicional, sem homologação nova.

## 3. CI e inventários

O comando de emergência não tinha chamador em workflow. Criado **`ext15-delivery.yml`**, com filtros precisos, Node 22/npm ci, unitários antes da jornada real, envs locais descartáveis, `contents: read`, sem cancelamento por concorrência e job de 25 minutos.

Os **dez chamadores existentes** de `test:migrations:pg` (EXT-02 a EXT-07 e L04 a L07) agora acompanham runner, supervisor, guarda de gerados e focal nos filtros. Steps e jornadas originais permanecem; os outros runners L04–L07 não foram migrados por esta alteração. Não se declara o workflow inteiro supervisionado.

**CI remoto não executado/não declarado verde.** A cobertura CI global da fatia 06 continua aberta.

Inventários regenerados pelos scripts oficiais: **1736 arquivos/222 IDs**, **12 a revalidar sem gate**, classes **27/124/71** e zero aceite humano, sem promoção. São **56 workflows**. A matriz da rota emergencial ganha seu chamador específico; nenhuma rota criada/removida e nenhuma aprovação manual inferida.

## 4. Regressão

Supervisor focal: **21 testes**, dois novos nesta etapa. Contratos de EXT-15 foram acrescentados às tabelas existentes de lifecycle/auditor TAP/CI. As guardas reais agora cobrem **21 runners**, com 63 recusas de URLs/opt-in, mais duas específicas da CLI e uma de ALLOW_REMOTE do migrador: **66 execuções negativas sem cluster**.

Novos testes exigem os dois passes, clone, rejeição de checksum, provas de retenção/auditoria/seeds, limites SQL/erro ocioso, protocolo/fases e filtros de todos os dez chamadores. Nenhum mínimo reduzido, retry acrescentado ou asserção removida.

## 5. Resultados medidos

| Comando | Antes, exit 0 | Depois, isolado | Depois, sob carga |
|---|---:|---:|---:|
| `test:ext15-emergency:pg` | 22,70s | **18/18**, 13,46s | **18/18**, 26,00s |
| `test:migrations:pg` | 6,47s | **183/183 em dois passes**, 6,03s | **183/183 em dois passes**, 13,23s |

Ambos exit 0, limpos. EXT-15 sem falha/skip/todo. Migrações não é TAP: o gate é aprovado pelas verificações próprias, não por contagem de testes inventada.

Nos dois ensaios posteriores de migrações:

- primeiro/segundo passe exit 0, checksums **183/183**;
- tabelas **582→582**, amostra de auditoria **1**;
- checksum adulterado da 006 rejeitado com exit **1** esperado;
- clone recriado: **183/183 checksums**, retenção legada **2→3**, mutação sintética **1→0**, **582 tabelas**, apenas TEMPLATE.

Carga: dois consumidores CPU e até três comandos simultâneos para os gates e prova negativa PG. Unitários executados em etapa separada, sem Next concorrente, ainda sob CPU. Não se alega correção da corrida de gerados da 05B.

- `npm test`: **1556/1556**, zero falhas/skips, exit 0, **84,35s** sob CPU.
- Prova negativa PG do supervisor: exit 0 em **7,65s**, duas falhas esperadas (porta ocupada/cluster morto) detectadas com exit 1 e limpeza confirmada.
- Focal inicial: **44/44**. Focal final incluindo índices/guarda/higiene/package-artifacts: **64/64**, após reconciliação de plano/status.

### Cancelamento e morte real do cluster

| Executável/cenário | Resultado | Tempo desde início |
|---|---|---:|
| EXT-15, SIGTERM após banco pronto | **143**, limpo | ~0,69s |
| EXT-15, SIGINT após primeiro teste aprovado | **130**, limpo | ~6,19s |
| Migrações, SIGTERM após banco pronto | **143**, limpo | ~0,75s |
| Migrações, SIGINT após primeiro passe verificado | **130**, limpo | ~4,44s |
| Migrações, SIGKILL somente no postmaster próprio após primeiro passe | **1**, limpo | ~3,28s |

Na quinta prova, o postmaster foi identificado por executável/argumento de data dir e ancestralidade até o supervisor daquela execução. Nenhum processo externo foi alvo. A interrupção do banco provocou reprovação em uma asserção subsequente e o wrapper propagou **exit 1**, em vez de aprovar o gate ou pendurar. A mensagem de asserção nesse ensaio não é atribuída a um defeito real do schema: o cluster havia sido morto deliberadamente; o contrato passou nas execuções íntegras.

Hashes de `next-env.d.ts`/`tsconfig.json` foram iguais aos de entrada nos cinco ensaios. Nenhum teste de morte abrupta do próprio supervisor foi alegado.

### Complementares

TypeScript/build exit 0; wave0 **5/5**; SEC **35/35**; inventários de requisitos/rotas `--check` OK; `git diff --check` OK; gerados sem diff. Checagem de processos/diretórios sem PostgreSQL, server.mjs, next-server, Chromium, consumidores CPU ou sandboxes supervisionados remanescentes. Logs sintéticos fora do Git em `/tmp/f05g-*`.

## 6. Continuidade

[Matriz de adoção](ADOCAO-POSTGRES.csv): **22/68** wrappers POSIX com provas locais, **46 não migrados**. A prova negativa é um 69º arquivo, fora do denominador de jornadas. Próximo grupo proposto: **05H — entrada administrativa e pendências operacionais**, após baseline/contratos específicos.

Permanecem isolamento global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, demo persistente e backup/restore real. Sem homologação Windows, UAT, provedor real ou aceite humano.

**Fatia 05 e N8/N9 globais abertos. Produção NO-GO.**
