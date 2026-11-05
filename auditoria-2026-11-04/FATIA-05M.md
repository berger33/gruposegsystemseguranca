# Fatia 05M — F03 chamado/atendimento/aceite e solicitação/retorno RH

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch e HEAD/origin-main conferidos em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** mais dois runners sob supervisão POSIX, com provas locais. **33/68 adotados; 35 pendentes. Produção NO-GO.**

## 1. Preservação e escopo

Comandos mantidos:

- `test:f03-client-ticket-acceptance:pg`: **um teste integral**, com HTTP/PG e Chromium, cliente abre chamado, staff atende dentro do escopo, cliente aceita, idempotência e auditoria.
- `test:f03-employee-request-rh-return:pg`: **um teste integral**, funcionário solicita, RH analisa e retorna, com negativas de acesso, idempotência/auditoria e browser real.

Mantidos seed canônico `seedFreshDemo`, suas dez identidades/credenciais sintéticas, nome exigido `seg_demo_local`, autorização `isolated-local-demo` e migrador com `SEG_LOCAL_DEMO_ONLY`. Integrações, seed, APIs, páginas, schema, fixtures, papéis e permissões não foram editados. Preservados timeouts internos **240s/180s**, bootstrap HTTP **120s**, stdio herdado e resultado original por exit code. Não se introduziu retry, auditor TAP de mínimo explícito inexistente ou redução de asserções/capacidades.

`credentials.json` continua gravado no sandbox com modo **0600** e chmod explícito, usado apenas pela jornada sintética. SMTP/Ollama desativados; Chromium empacotado local via AWS_EXECUTION_ENV sem serviço AWS. Um teste integral por comando não representa cobertura completa dos domínios por requisito/papel nem aceite humano.

## 2. Supervisor e exceção estrita de banco

Wrapper POSIX antes de embedded-postgres, depois das guardas de URLs/opt-in. Pai libera handlers concorrentes da guarda; worker usa sandbox/IPC/fases e resultado confirmado. Remoção do sandbox/token legado de limpeza ficam no pai após `result.cleaned`. Stop/pool rejeitados continuam falha. Windows mantém caminho anterior, sem homologação nova.

**Helper compartilhado inalterado:** `createLocalQaDatabase` só permite `seg_qa_*`. Não foi ampliado para acomodar F03. Os dois runners usam função local `createF03Database`, que aceita **somente `seg_demo_local`**, conecta em **127.0.0.1/postgres**, user `seg_demo`, porta do cluster efêmero e senha gerada, com conexão/query/statement **5/5/5s**, identificador escapado, Client.end no finally e erro ocioso capturado. Nome recusado falha antes de construir Client.

Pool do seed no caminho supervisionado: conexão **5s**, query/statement **30s** e erro ocioso marca falha persistente. Caminho legado Windows não recebeu novos prazos. Falha/timeout de stop segue limitada pelo supervisor, sem aguardar indefinidamente pool/cluster.

**Budgets por runner:** migrate **90s**, incluindo migrador, seed e escrita/chmod das credenciais; test **600s**, incluindo bootstrap HTTP e teste/browser integral. Soma do protocolo **840s**, além das margens de encerramento/remoção existentes. Os budgets agregados não prometem que todos os máximos internos possam ocorrer simultaneamente.

## 3. CI e inventários

Não havia chamador dos dois comandos nomeados. Criado `f03-ticket-employee-delivery.yml`: Node22/npm ci, unitários do supervisor antes de PG, jornadas **sequenciais**, job 40min, env local/URLs/opt-in/SMTP vazios, contents read e sem cancelamento por concorrência. Filtros incluem seed canônico, runners, migrações, supervisor/guarda/focal, helpers e superfícies compartilhadas.

**CI remoto não executado nem declarado verde.** Novo chamador não fecha a cobertura global de CI.

Inventários oficiais regenerados/conferidos: **59 workflows / 1739 arquivos / 222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero. E23 reconciliado. Matriz de rotas pode registrar os novos chamadores, sem promoção de classe ou aceite manual.

## 4. Regressão

Supervisor passa a **34 testes**, três novos:

1. Contratos dos dois wrappers, ordem de importação, fases, seed/autorização, credenciais 0600, prazos/pool, boot/test/browser originais e resultado/limpeza.
2. Funções locais de criação executadas em VM com Client simulado: sucesso, falha de connect, falha de query, erro Client e nome recusado; verifica prazos/loopback/identificador e finally/end. São falhas unitárias simuladas, não ensaio de rede real travada.
3. CI com dois comandos exatos sequenciais, filtros/seed e env/permissão restritos.

Guardas reais: **32 runners × 3 recusas + 3 recusas específicas = 99 execuções negativas**, sem cluster. Piloto tenant registrado separadamente. Focal inicial **34/34**, sem falhas mascaradas.

## 5. Provas reais

Tempos de parede do comando completo, incluindo seed/limpeza.

| Jornada | Antes | Depois isolado | Depois sob dois consumidores CPU |
|---|---:|---:|---:|
| Chamado/aceite | **1/1**, 39,68s | **1/1**, 28,81s | **1/1**, 46,23s |
| Solicitação/RH | **1/1**, 27,72s | **1/1**, 26,86s | **1/1**, 39,82s |

Todos exit 0, zero falhas/skips/todos, limpos. Prova negativa PG sob CPU: exit 0 em **6,40s**, detectando duas falhas esperadas com exit 1 e limpeza (porta ocupada/cluster morto), não clusters aprovados.

`npm test` depois das jornadas Next, ainda sob dois consumidores CPU: **1569/1569**, zero falhas/skips, exit 0, **85,96s**. Sequenciar não corrige a corrida global de gerados registrada na 05B.

### Oito interrupções com gatilhos confirmados

Sinais só no supervisor. Servidor/browser identificados por ancestralidade em `/proc`, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Chamado | Banco pronto, TERM | **143** | 0,75s |
| Chamado | Servidor ativo, INT | **130** | 4,77s |
| Chamado | Credenciais gravadas 0600, INT | **130** | 4,95s |
| Chamado | Chromium ativo, TERM | **143** | 9,40s |
| RH | Banco pronto, TERM | **143** | 0,78s |
| RH | Servidor ativo, INT | **130** | 4,66s |
| RH | Credenciais gravadas 0600, INT | **130** | 4,63s |
| RH | Chromium ativo, TERM | **143** | 9,16s |

Nos oito: sandbox observado do worker removido, limpeza confirmada e hashes de next-env.d.ts/tsconfig.json iguais aos de entrada. Servidor/browser observados não permaneceram ativos. Nos dois gatilhos de credenciais foi observado arquivo não vazio com modo **0600**, removido junto com o sandbox; **não foi lido ou registrado conteúdo**. Não se inferiu a contagem de credenciais por essa sonda: a contagem dez é verificada pelo runner nas execuções completas.

Browser ativo não implica navegação/assertions já concluídas. Playwright pode destacar sessões; os ensaios não cobrem browser travado, escape de sessão ou SIGKILL/OOM do supervisor.

### Complementares finais

- Focal após status/plano/matriz: **95/95**, zero falhas/skips/todos, incluindo escopo do cliente/rotas fail-closed, SEC, inventários, guarda/higiene e package-artifacts.
- TypeScript/build exit 0.
- SEC **35/35 âncoras**; wave0 **5/5** verificações estáticas; não é pentest.
- Checks de requisitos/rotas e git diff --check OK; gerados sem diff final.
- Sem PostgreSQL/server.mjs/next-server/Chromium/consumidores CPU ativos ou sandboxes supervisionados remanescentes na checagem final.

Logs/harness sintéticos não versionados em `/tmp/f05m-*`; evidências persistentes consolidadas aqui.

## 6. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **68 originais / 33 adotados / 35 pendentes**. Prova negativa é 69º arquivo fora do denominador. Próximo grupo proposto **05N — F03 contas/baixa/relatório e lead/implantação**, medindo contratos/tempos próprios e preservando seed canônico.

Continuam corrida global de gerados, sessões destacadas, morte abrupta do supervisor, filesystem/kernel travado, Windows/UAT, backup/restore real e demais jornadas. Não houve provedor/envio externo, dados reais ou aceite humano. O gate independente client-security/N8 não foi executado/encerrado nesta etapa.

**Fatia 05 e N8/N9 globais abertos. Produção NO-GO. Sem commit/push/PR/deploy.**
