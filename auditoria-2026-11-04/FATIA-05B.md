# Fatia 05B — adoção do supervisor nas quatro jornadas PLT

**Data:** 04/11/2026. **Branch:** `arena/a5202d09-gruposegsystemseguranca`. HEAD e origin/main conferidos em `0e6456e9d01b825a3bff4997f92506ac4ff1c633` após fetch. Alterações anteriores preservadas. Sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** quatro runners adicionais supervisionados em Linux/POSIX. Total **8/68**; **60 ainda não migrados**. Produção continua **NO-GO**.

## Escopo e contratos preservados

| Runner | Jornada | Mínimo TAP preservado |
|---|---|---:|
| `qa-plt01-access-review-coverage-postgres.mjs` | Revisão de acesso, sessões sintéticas TI/RH, RBAC e evidência | 12 |
| `qa-plt06-observability-postgres.mjs` | Observabilidade, sessões TI/RH/admin, leitura/correlação | 20 |
| `qa-plt09-privacy-postgres.mjs` | Inventário/finalidades, política, pedidos LGPD e retenção declarativa | 26 |
| `qa-plt12-incidents-postgres.mjs` | Resposta a incidente, leitura, papéis e evidência | 20 |

Continuam obrigatórios: cluster novo loopback, recusa de URLs do operador/opt-in remoto, migrador 001–183, servidor HTTP real, fixtures e sessões específicas, variáveis `QA_PLT*_REQUIRE_DB`, resumo TAP e ausência de falhas/skips/todos. A limpeza de `ACCESS_REVIEW_INTERVAL_DAYS` no ambiente da jornada de revisão foi mantida. Nenhum arquivo de teste de integração ou API de negócio foi alterado.

## Implementação

Reutilizado o supervisor e o helper de criação da etapa 05A, sem modificar sua implementação nesta etapa:

- Wrapper POSIX depois das guardas, antes do import dinâmico de embedded-postgres no worker. Pai libera somente os handlers de sinal da guarda de gerados; restore no exit permanece.
- Grupo de processos próprio, sandbox fornecido pelo pai e fases initialise/start/create/migrate/test/stop/done.
- Criação via Client IPv4 com prazos de conexão/query/statement de 5s, nomes exclusivos QA, escape de identificador e fechamento finally.
- Migração **90s**, testes **180s**. Baselines e carga medidos abaixo sustentam este perfil; ele não foi aplicado a outros runners. Demais limites permanecem os da 05A.
- No caminho supervisionado, rejeição de stop é falha. Worker não remove sandbox nem declara limpeza. Pai só emite o token histórico `QA_PLTxx_PG_TEMP_CLEANED` quando `result.cleaned` é verdadeiro.
- Caminho Windows anterior preservado, inclusive o lifecycle legado, sem alegar hardening/homologação Windows.

Workflow `plt-jornadas-delivery.yml` passou a acompanhar helper, teste de supervisor e teste de ligação CI. Também foi corrigido o path inexistente `tests/plt06-observability.integration.test.mjs` para o arquivo real `tests/plt06-observability-read-contract.integration.test.mjs`. Comandos nomeados e timeout do job foram preservados. **CI remoto não foi executado nem declarado verde.**

A guarda de ligação CI foi ajustada para aceitar tanto import por efeito colateral quanto import nomeado exato de `releaseSignalHandlers`; continua exigindo a guarda síncrona, a recusa de banco do operador e auditoria TAP.

## Regressão acrescentada

`tests/qa-pg-supervisor.test.mjs`: **13 testes**, dois adicionais nesta etapa:

1. Contrato dos quatro wrappers, limites, fases, protocolo, criação compartilhada, variáveis de DB obrigatórias, mínimos TAP, token condicionado à limpeza e paths reais do workflow.
2. Execução dos **auditores TAP originais**, extraídos e avaliados isoladamente sem iniciar cluster: aceitam resumo válido e rejeitam ausência de resumo/pass, mínimo insuficiente, falha, skip e todo nos quatro runners.

O teste já existente de recusas dos executáveis reais foi ampliado aos quatro novos runners: agora cobre sete runners, 21 recusas de URLs/opt-in, mais duas guardas específicas CLI. Não exige cluster nem acessa o host sintético.

## Resultados medidos

| Comando npm | Antes, exit 0 | Depois, isolado | Depois, sob carga |
|---|---:|---:|---:|
| `test:plt01-access-review-coverage:pg` | 24,36s | **12/12**, 21,79s | **12/12**, 69,51s |
| `test:plt06-observability:pg` | 21,59s | **24/24**, 21,65s | **24/24**, 66,43s |
| `test:plt09-privacy:pg` | 23,44s | **28/28**, 22,47s | **28/28**, 61,53s |
| `test:plt12-incidents:pg` | 21,65s | **20/20**, 20,63s | **20/20**, 57,53s |

Todos terminaram exit 0, com zero falhas/skips/todos e limpeza confirmada. Não houve aumento de mínimo permitido nem desativação de asserção. O tempo é de parede do comando inteiro, não só da fase de teste.

Carga: dois consumidores CPU mantidos durante o ensaio, executor com até três comandos simultâneos; suíte unitária em paralelo, enquanto jornadas são escalonadas. Não significa que todos os quatro gates tenham rodado simultaneamente o tempo todo.

### Falha concorrente encontrada e limite de escopo

Nesse primeiro ensaio, **a suíte unitária não passou: 1547 passaram/1 falhou** (~149s). A falha foi em `generated-files-hygiene.test.mjs`: o teste leu `next-env.d.ts` com o path temporário da jornada PLT-01 enquanto Next estava ativo. O conteúdo observado aparece no erro; ao final o arquivo estava restaurado ao conteúdo padrão, sem diff. Os quatro gates de integração passaram nesse mesmo ensaio.

Isso comprova uma fronteira da guarda existente: **restore na saída não isola arquivos gerados durante a execução**. Não se afirmou estabilidade global concorrente, nem se atribuiu essa causa a falhas históricas sem reprodução.

- O teste de higiene e suas asserções foram mantidos, sem retry ou relaxamento.
- A suíte completa foi reexecutada sem jornadas Next concorrentes, ainda com dois consumidores CPU: **1548/1548**, zero falhas/skips, exit 0, **98,26s** de parede.
- Suíte unitária, build e typecheck devem ficar separados de jornadas Next no mesmo checkout. Os steps existentes do workflow PLT são sequenciais.
- Isolamento/serialização global dos gerados é **resíduo técnico**, a resolver antes de declarar concorrência global de todos os runners; não é tarefa transferida ao proprietário e não foi silenciosamente marcada como resolvida.

### Cancelamento real e falhas do PostgreSQL

Cada um dos quatro executáveis foi interrompido duas vezes, com sinal enviado somente ao supervisor:

- **SIGTERM após QA_PG_READY:** quatro saídas **143**, limpeza confirmada; tempos totais de ~0,81–0,89s desde início do executável.
- **SIGINT após a primeira linha `ok 1` da suíte real:** quatro saídas **130**, limpeza confirmada; tempos totais de ~7,37–8,42s desde início. Exercita cancelamento com testes/servidor já em andamento, sem alegar todas as possíveis posições de interrupção.
- Gate negativo PostgreSQL real novamente exit 0 sob carga (~7,99s): porta ocupada e cluster morto geraram cada qual exit 1/timeout-stop esperado, com limpeza confirmada. Isso é detecção da falha, não sucesso do cluster defeituoso.

### Verificações finais

- Focal supervisor + ligação CI: **16/16**.
- Focal final ampliado com contratos PLT, higiene, guarda de gerados e inventário: **96/96**, sem falhas/skips, após reconciliação do status/plano.
- TypeScript: exit 0. Build: exit 0.
- Wave0: **5/5**. SEC: **35/35** âncoras.
- Inventário: **1730 arquivos/222 IDs**, 12 a revalidar sem gate, check OK; nenhuma classe de aceite promovida.
- `git diff --check`: OK. `next-env.d.ts`/`tsconfig.json`: sem diff final.
- Checagem de processos/diretórios: sem servidores PostgreSQL, `server.mjs`, next-server, consumidores CPU ou sandboxes `seg-qa-pg-supervised-*` remanescentes dos ensaios.

Logs brutos e sondas ficam fora do Git, em `/tmp/f05b-*`; somente os resultados sintéticos resumidos são versionados.

## Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): oito runners de jornada supervisionados entre 68 originais. A prova negativa é um 69º arquivo contado separadamente. Os **60 restantes** continuam não migrados; a contagem não mede cobertura de produção nem aceite dos 222 requisitos.

Próximo grupo proposto: **05C — EXT-03/04/05**, com baseline, inspeção das peculiaridades e budgets proporcionais antes da alteração. Demo persistente, backup/restore, browser e jornadas longas continuam separados. Registrar/tratar também o isolamento de gerados antes de alegar concorrência global.

Permanecem os limites de SIGKILL/OOM do supervisor, kernel/filesystem travado, descendente que se desanexe e contenção externa descritos na fatia 04. Windows, UAT, parecer jurídico, decisões operacionais e aceite humano não foram homologados por esta etapa.

**Fatia 05 ainda em execução; N8/N9 globais abertos; produção NO-GO.**
