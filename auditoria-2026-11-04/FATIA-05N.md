# Fatia 05N — F03 contas/baixa/relatório e lead/implantação

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch e HEAD/origin-main conferidos em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** mais dois runners sob supervisão POSIX, com provas locais. **35/68 adotados; 33 pendentes. Produção NO-GO.**

## 1. Escopo preservado

- `test:f03-contas-baixa-relatorio:pg`: **um teste integral**, contas→baixa→relatório com escopo, idempotência, transação e UI real.
- `test:f03-lead-to-implementation:pg`: **um teste integral**, jornada canônica com bloqueios, retry funcional já existente, auditoria transacional e isolamento A/B, HTTP/PG e Chromium.

Mantidos seed canônico `seedFreshDemo`, autorização isolated-local-demo, banco exigido `seg_demo_local`, dez credenciais sintéticas com escrita/chmod **0600** no sandbox, migrador com SEG_LOCAL_DEMO_ONLY, papéis/permissões, timeouts internos **240s/180s** e bootstrap HTTP **120s**. Integrações, APIs, páginas, schema, seed, fixtures e asserções não foram editados. Não se acrescentou retry do gate nem retirou retry funcional exercitado pela jornada.

Preservado contrato de exit code/stdio herdado, sem alegar auditor TAP com mínimo explícito inexistente. SMTP/Ollama desativados, Chromium empacotado local, sem serviço AWS. Um teste integral por comando não equivale a cobertura completa de requisitos/papéis ou aceite operacional.

## 2. Implementação

Wrappers POSIX depois das guardas e antes de embedded-postgres. Pai libera handlers concorrentes da guarda; worker recebe sandbox/IPC, fases monotônicas e resultado original confirmado; limpeza/token legado somente no pai após result.cleaned. Caminho Windows preservado, sem homologação nova.

Helper compartilhado **inalterado**, ainda estrito `seg_qa_*`. Assim como na 05M, cada runner contém criação F03 restrita ao nome exato **seg_demo_local**, Client loopback/postgres com conexão/query/statement **5/5/5s**, identificador escapado, erro capturado e end no finally. Pool do seed supervisionado recebe **5/30/30s**, com erro ocioso persistindo como falha no resultado; Windows mantém configuração anterior.

Budgets em ambos: **migrate 90s**, incluindo migrador, seed e escrita/chmod de credenciais; **test 600s**, incluindo boot HTTP e teste/browser. Soma dos limites do protocolo **840s**, além das margens limitadas de encerramento/remoção existentes. Budgets agregados não prometem acomodar todos os máximos internos simultaneamente. Credenciais permanecem locais/sintéticas, sem conteúdo em logs/artefatos versionados.

## 3. CI e inventários

Os dois comandos nomeados não tinham chamadores. Criado `f03-finance-lead-delivery.yml`, com jornadas sequenciais, Node22/npm ci, unitários do supervisor antes de PG, job 40min, filtros de seed/runners/migrações/helper/guarda/focal/helpers/superfícies compartilhadas, env local/opt-in remoto/SMTP vazios, contents read e sem cancelamento por concorrência.

**CI remoto não executado nem declarado verde.** Sem nova autorização de envio, emissão, cobrança ou implantação real.

Inventários oficiais regenerados/conferidos: **60 workflows / 1740 arquivos / 222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero. E23 reconciliado. Novos chamadores não promovem classes/aceite manual.

## 4. Regressão e correções durante a edição

Supervisor agora com **36 testes**, dois novos para contratos/budgets/seed/credenciais/pool/browser/fases e ligação CI dos dois comandos. Regressão de criação F03 em VM expandida aos **quatro runners F03**: sucesso, falha connect/query, erro Client e nome recusado, conferindo prazos/loopback/identificador/end. São falhas simuladas unitárias, não ensaio de rede travada real.

Guardas reais ampliadas: **34 runners × 3 recusas + 3 recusas específicas = 105 execuções negativas**, sem cluster; piloto tenant registrado separadamente.

A primeira edição automatizada deixou uma chave de finally ausente no runner lead e mudou indevidamente seu prefixo temporário para duplo hífen; o syntax check e a guarda real acusaram falha. Corrigidos fechamento e prefixo original **antes dos ensaios pós-alteração**. Outra asserção nova procurava somente playwrightChromium.launch, mas contas importa chromium.launch; corrigida para reconhecer o import real, sem alterar integração/navegador. Depois **36/36**. Essas falhas não foram contadas como baselines verdes nem mascaradas.

## 5. Ensaios reais

Tempos de parede do comando completo, incluindo seed e limpeza.

| Jornada | Antes | Depois isolado | Depois sob dois consumidores CPU |
|---|---:|---:|---:|
| Contas/baixa/relatório | **1/1**, 24,68s | **1/1**, 17,90s | **1/1**, 28,23s |
| Lead/implantação | **1/1**, 18,76s | **1/1**, 17,95s | **1/1**, 30,65s |

Todos exit 0, zero falhas/skips/todos, limpos. Prova negativa PG sob CPU: exit 0 em **6,79s**, detectando duas falhas esperadas com exit 1 e limpeza (porta ocupada/cluster morto); não são clusters aprovados.

`npm test` depois das jornadas Next, ainda sob dois consumidores CPU: **1571/1571**, zero falhas/skips, exit 0, **84,57s**. Sequenciar não corrige a corrida global de gerados registrada na 05B.

### Oito cancelamentos confirmados

Sinais enviados só ao supervisor; servidor/Chromium identificados por ancestralidade em /proc, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Contas | Banco pronto, TERM | **143** | 0,76s |
| Contas | Servidor ativo, INT | **130** | 4,88s |
| Contas | Credenciais 0600 gravadas, INT | **130** | 4,84s |
| Contas | Chromium ativo, TERM | **143** | 9,87s |
| Lead | Banco pronto, TERM | **143** | 0,75s |
| Lead | Servidor ativo, INT | **130** | 4,90s |
| Lead | Credenciais 0600 gravadas, INT | **130** | 4,98s |
| Lead | Chromium ativo, TERM | **143** | 9,17s |

Nos oito: sandbox observado do worker removido, limpeza confirmada, hashes de next-env.d.ts/tsconfig.json iguais aos de entrada. Processos servidor/browser observados não permaneceram ativos. Nas provas de credenciais foi verificado arquivo não vazio com modo **0600**, removido com o sandbox, sem ler/registrar conteúdo. A contagem dez é verificada pelo runner nas execuções completas, não inferida pela sonda de metadados.

Processo browser ativo não implica navegação/assertions concluídas. Playwright pode destacar sessões; estes ensaios não cobrem browser travado/escapado ou morte abrupta do supervisor.

### Finais

- Focal após status/plano/matriz: **97/97**, zero falhas/skips/todos, incluindo escopo/rotas fail-closed do cliente, SEC, inventários, guarda/higiene e package-artifacts.
- TypeScript/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices requisitos/rotas e git diff --check OK; gerados sem diff final.
- Sem PostgreSQL/server.mjs/next-server/Chromium/consumidores CPU ativos ou sandboxes supervisionados remanescentes na checagem final.

Logs/harness sintéticos não versionados em `/tmp/f05n-*`; resultados persistentes consolidados neste relatório.

## 6. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **68 originais / 35 adotados / 33 pendentes**. Prova negativa é 69º arquivo fora do denominador. Próximo grupo proposto **05O — UX cadastros centrais de clientes e contratos**, inventariando estados de leitura, permissões e tempos antes de definir limites.

Permanecem corrida global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, Windows/UAT e backup/restore real. Sem dados reais, provedor/envio externo ou aceite humano. Gate independente client-security/N8 não executado/encerrado nesta etapa.

**Fatia 05 e N8/N9 globais abertos. Produção NO-GO. Sem commit/push/PR/deploy.**
