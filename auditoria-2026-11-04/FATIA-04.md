# Fatia 04 — piloto de lifecycle PostgreSQL de QA

**Data:** 04/11/2026. **Base:** `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. **Branch:** `arena/a5202d09-gruposegsystemseguranca`.
**Resultado:** piloto implementado/validado em Linux/POSIX em um runner (`qa-tenant-postgres.mjs`), usado por tenant e client-access. Outros runners não foram migrados. Sem commit/push/PR/deploy nesta entrega.

## 1. Defeitos reproduzidos

Inspeção de `embedded-postgres@17.9.0-beta.17` confirmou:

- `start()` rejeita sem Error quando o postmaster termina antes da prontidão.
- `stop()` espera um novo evento `exit` mesmo quando o filho já morreu; o evento não é redisparado.
- `createDatabase()` usa pg.Client sem prazo explícito de conexão/query e sem finally em todo caminho de erro.
- A dependência registra hooks de encerramento; colocar apenas um Promise.race no mesmo processo não garante saída, cancelamento da operação original nem limpeza de seus filhos.

**Reprodução com PostgreSQL 17.9 real e descartável:**

1. Porta IPv4 ocupada por listener sintético: start rejeitou `undefined`; stop ficou pendurado.
2. Cluster iniciado e depois morto com SIGKILL: stop ficou pendurado.

As sondas iniciais, já contidas pelo novo supervisor, terminaram com `timeout-stop`, exit 1 e limpeza confirmada em ~1,64s e ~1,69s, usando prazo reduzido de stop apenas para a falha controlada. Não há prova de que essas sejam todas as causas de instabilidade do CI, e N8 não foi encerrado.

## 2. Arquitetura do piloto

### Supervisor separado

`scripts/lib/qa-pg-supervisor.mjs` cria um worker POSIX em grupo de processos exclusivo e um sandbox com mkdtemp. O supervisor **não importa embedded-postgres**, portanto não fica dependente dos hooks ou promessas penduradas da biblioteca.

- Recusa URLs herdadas/opt-in remoto antes de criar worker/sandbox.
- Aceita progresso somente por fases conhecidas e em ordem crescente. Repetir fase não renova o prazo; há teto total adicional.
- Sucesso exige protocolo completo (`done` + mensagem complete=0 + exit 0). Saída zero sem protocolo é falha; códigos de saída não zero são preservados quando disponíveis.
- Observa erro/saída do worker e captura SIGINT/SIGTERM no supervisor.
- Na finalização, sinaliza **somente o grupo do worker criado por ele**, aguarda saída, escala SIGTERM → SIGKILL quando necessário, e só então remove **o sandbox criado por ele**.
- Diretório temporário do worker (`TMPDIR`, `TMP`, `TEMP`) também é o sandbox: inclui o arquivo temporário de senha do initdb em caso de interrupção.
- Limpeza não comprovada retorna falha e nunca imprime `QA_PG_TEMP_CLEANED: true`.
- Logs próprios contêm categorias/fase/código, não URL/senha/env. O stdout/TAP dos testes continua sendo produzido pelo caminho já existente; não foi substituído por sucesso fictício.

### Limites do piloto

| Etapa | Prazo padrão |
|---|---:|
| Boot/importação do worker | 30s |
| initialise | 60s |
| start | 30s |
| create | 15s |
| Jornada de teste | 180s |
| stop | 10s |
| done/saída | 5s |
| Encerramento do grupo | até 2s após TERM + 2s após KILL |
| Remoção do sandbox | 10s de espera máxima |

Teto adicional de processamento: soma dos limites de fases (330s). Timers dependem do agendamento do sistema, não são garantia de tempo real. Timeout da remoção não cancela uma operação de filesystem já iniciada: nesse caso a limpeza fica **não verificada** e o resultado é vermelho.

Os 180s de teste são do **piloto tenant**, não um valor a copiar cegamente para jornadas pesadas. L04/L07, por exemplo, tiveram tempos maiores em medições anteriores; a fatia 05 deve escolher limites proporcionais por grupo.

### Runner adaptado

`scripts/qa-tenant-postgres.mjs`:

- Mantém nomes dos comandos, opção `--client-access`, testes exercitados e guardas local-only.
- Em POSIX, libera somente os handlers de sinal do guard de arquivos gerados antes de entregar o lifecycle ao supervisor. A restauração síncrona dos arquivos no exit permanece.
- Importa a biblioteca apenas dentro do worker.
- Na criação do banco supervisionado usa Client IPv4 com `connectionTimeoutMillis`, `query_timeout` e `statement_timeout` de 5s, fechamento em finally e erro ocioso tratado como falha.
- O supervisor assume a limpeza do sandbox; o worker não a declara antecipadamente.
- **Windows preserva o caminho anterior.** Não foi removida a capacidade existente, mas o hardening POSIX não foi implantado/validado nesse caminho.

## 3. Regressão e CI

- `tests/qa-pg-supervisor.test.mjs`: oito testes unitários herméticos, sem exigir cluster real. Cobrem URL herdada recusada, sucesso com protocolo, saída zero falsa, falha/código não zero, fases penduradas, repetição sem renovação, rejeição undefined, escalonamento de sinal, isolamento de processo externo, cancelamento 143/130 e contrato do runner.
- `scripts/qa-pg-supervisor-postgres.mjs` / `npm run test:pg-supervisor:pg`: reproduz os **dois defeitos reais**. O gate só passa se o supervisor retornar exit 1 esperado e limpeza confirmada para cada falha. Se a biblioteca deixar de apresentar o defeito, o contrato do ensaio deverá ser revisto, não inventado.
- `.github/workflows/ci.yml`: acrescenta o gate negativo depois do tenant, sem remover ou afrouxar steps existentes. Execução remota do CI não foi realizada nesta entrega.
- `package.json`: novo gate real e novo arquivo na lista unitária (180 → 181). Sem nova dependência; lockfile não precisou mudar.

## 4. Resultados medidos

| Verificação | Resultado |
|---|---|
| Focal do supervisor | **8/8**, 0 falhas/skips no Linux |
| Suíte completa final | **1.543/1.543**, zero falhas/skips, ~45s |
| Tenant positivo inicial | **25/25**, exit 0, sandbox limpo |
| Tenant + dois consumidores CPU, simultâneo a client-access e gate negativo | **25/25**, exit 0, ~33,4s de parede |
| Client-access no mesmo ensaio | **27/27**, exit 0, ~46,3s de parede |
| Gate negativo real sem carga adicional | Porta ocupada e cluster morto: ambos exit 1 esperado com `timeout-stop` e limpeza confirmada; gate exit 0 |
| Gate negativo real sob carga, concorrente às duas jornadas | Mesmos dois resultados esperados; gate exit 0 em ~8,5s |
| SIGTERM no runner real após QA_PG_READY | **143**, limpeza confirmada, ~0,91s total desde o início |
| SIGINT no runner real após QA_PG_READY | **130**, limpeza confirmada, ~1,07s total desde o início |
| TypeScript/build | OK |
| Wave0 | **5/5** |
| Mapa SEC | **35/35** âncoras |
| Índice de requisitos `--check` | OK: 222 IDs, 12 a revalidar sem gate |
| `git diff --check` | OK |

Os números das falhas induzidas não são falhas funcionais omitidas da suíte: os testes negativos exigem que a falha seja detectada. Nunca se apresentou cluster quebrado como saudável.

Durante desenvolvimento, o teste de sinais inicialmente reenviava o sinal a cada novo chunk de stdout por reutilizar o marcador já acumulado. Foi corrigida a fixture para enviar uma única vez; o supervisor não teve o resultado afrouxado. Os resultados acima são posteriores a essa correção.

Checagem final não encontrou processos dos ensaios ou sandboxes `seg-qa-pg-supervised-*` remanescentes. O teste de isolamento também confirmou que o supervisor não matou um processo externo ao grupo dele.

## 5. Documentação e preservação

Ledger/plano atualizados; contagem explícita de arquivos unitários reconciliada para 181. Índice dos requisitos regenerado: **1.730 arquivos varridos**, sem promover classe de evidência/aceite. Entradas das fatias anteriores preservadas.

Nenhum arquivo de runtime de produção, handler, rota, papel, permissão, dado de negócio ou migração foi alterado nesta fatia. Não houve conexão a banco do operador, contratação, mensagem externa ou operação de produção. Não é solução de backup/restore de produção.

## 6. Resíduos e fronteiras para a próxima fatia

1. Migrar os demais runners em grupos pequenos, com provas negativas e limites medidos por jornada; não marcar N9 global como encerrado pelo piloto.
2. Windows permanece não validado e com lifecycle anterior; exige implementação/ensaio compatível, sem usar grupos POSIX.
3. O supervisor só pode limpar quando permanece vivo e agendável. SIGKILL/OOM do próprio supervisor, crash de kernel, filesystem travado ou descendente que crie uma sessão independente exigem contenção externa (job/container/operador); não são cobertos pelas provas de SIGTERM/SIGINT. Esse limite precisa ser tratado na estratégia de execução da adoção, não ocultado.
4. Prova de remoção depende do grupo próprio encerrar e filesystem responder; falha fica vermelha, sem remoção indiscriminada por nome de processo ou diretório alheio.
5. Disputa TOCTOU da porta e outras falhas de inicialização ainda podem acontecer; agora o piloto tem limite de espera, não promessa de que nunca falhará.

**Próxima fatia:** 05 — adoção por grupos de runners PostgreSQL, preservando contratos e particularidades. **Produção: NO-GO**, aceite humano e gate operacional continuam pendentes.
