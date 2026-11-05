# Fatia 05Q — UX operação e patrimônio

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch e HEAD/origin-main conferidos em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** mais dois runners sob supervisão POSIX e uma correção compatível de ordenação da leitura inicial de operação, descoberta nas provas sob carga. **41/68 adotados; 27 pendentes. Produção NO-GO.**

## 1. Contratos e preservação

- `test:ux-ops:pg`: **29 testes**, mantendo sessão/permissões reais, menu não é autorização, 14 abas por teclado, estados honestos das leituras canônicas, idempotência da ciência, reconciliação de POST/GET, resposta atrasada por seleção, formatação de carimbos/fuso, viewports/temas e casos legados existentes.
- `test:ux-asset:pg`: **sete testes**, seis leituras com sessão/papel, carregamento versus vazio, falha inicial com repetição, releitura preservando dados/hora, negativa fail-closed, seis abas com teclado e quatro larguras/tema noturno.

Operação já tinha captura de saída e **auditor TAP com mínimo 29**: falha, parcial, skip, todo e ausência do resumo reprovam, inclusive invocação filtrada. Esse código foi preservado, não substituído por exit code puro. Patrimônio mantém contrato original por exit code/stdio herdado, sem piso TAP novo.

Filtros `UX_OPS_TEST_PATTERN`/`UX_ASSET_TEST_PATTERN` e evidências opcionais herdadas preservados. Ensaios completos com patterns vazios. Falhas de interface continuam injetadas somente em window.fetch no browser, sem enfraquecer servidor. Nenhum endpoint, schema, fixture, papel ou permissão alterado. SMTP/Ollama desativados, Chromium local empacotado. Não se introduziu retry do gate nem se removeu o retry de crash Chromium já existente na integração de operação.

A exceção à preservação de código de tela nesta etapa foi a correção pequena descrita abaixo; não se retirou nenhuma ação, rota, campo, capacidade ou asserção. As medições automatizadas não são WCAG integral, avaliação manual ou aceite operacional/global.

## 2. Supervisor e CI

Wrappers POSIX depois das guardas e antes de embedded-postgres. Pai libera handlers concorrentes da guarda; worker recebe sandbox/IPC, criação local limitada e fases monotônicas. Resultado original confirmado e remoção pelo pai. Token genérico QA_PG_TEMP_CLEANED emitido pelo supervisor após confirmar remoção, sem duplicação pelo wrapper. Worker mantém remoção/token antigo só no caminho não supervisionado.

**Helper compartilhado inalterado. Windows conserva lifecycle anterior, sem homologação nova.**

| Perfil | Operação | Patrimônio |
|---|---:|---:|
| Migração | 90s | 90s |
| Fase test agregada | **900s** | **600s** |
| Soma dos limites do protocolo | 1140s | 840s |

Além das somas, margens limitadas de TERM/KILL/remoção existentes. Bootstrap de até 120s e limites internos preservados. Budgets agregados não prometem acomodar todos os máximos individuais simultaneamente nem espera infinita.

Workflows existentes preservados, incluindo typecheck, vocabulário de operação, jobs de 40min e **workflow_dispatch de patrimônio**. Acrescentados unitários antes de PG e filtros de supervisor/guarda/focal/migrador, opt-in remoto e patterns vazios. Patrimônio ganha env local/URLs/SMTP/Ollama explícitos. **CI remoto não executado nem declarado verde.**

Sem workflow/arquivo fonte novo: **60 workflows / 1740 arquivos**. Inventários oficiais regenerados/conferidos: **222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero; sem promoção de classe/rota/aceite.

## 3. Falha sob carga, diagnóstico e correção

### Histórico que não foi descartado

Baselines: operação **29/29**, 148,91s; patrimônio **7/7**, 34,01s. Após wrapper, operação passou isolada **29/29**, 136,78s, mas sob dois consumidores CPU falhou **28/29**, exit 1 em **240,07s**. O caso 13, resposta 2xx sem lista canônica no painel inicial, expirou em **45s** aguardando as abas depois de clicar em Tentar carregar novamente. Auditor rejeitou, supervisor propagou exit 1 e limpou.

Foi acrescentado apenas diagnóstico no catch dessa espera, sem repetir asserção, aumentar timeout ou ler payload/credenciais. Uma execução completa diagnóstica sob a mesma carga voltou a falhar **28/29**, exit 1 em **232,02s**. Registro: **três chamadas/conclusões para posts e demais leituras iniciais**, regra malformedPosts já falsa, UI em error e zero tablists. Não se mascarou falha com retry.

### Mecanismo e correção compatível

O callback inicial `load` não tinha proteção contra respostas fora de ordem, ao contrário do detalhe de versão que já possui contador próprio. Leituras sobrepostas (incluindo montagem StrictMode/repetição) podiam publicar resultado antigo depois de consulta mais recente, reintroduzindo erro ou dados antigos e encerrando loading indevidamente.

Três regressões executando o **callback real**, extraído do TSX e transpilado com TypeScript em VM, controlam as nove respostas de cada chamada. **Antes da correção: três falhas novas, oito testes de vocabulário preservados passando. Depois: 11/11.** Cenários:

1. Erro antigo não sobrescreve repetição recente bem-sucedida.
2. Sucesso antigo não publica dados depois de negativa mais recente.
3. Resposta antiga não encerra loading da consulta atual; cleanup invalida pendentes.

Correção em `OperacaoWorkspace.tsx`: ref de sequência, incremento ao iniciar leitura, retorno sem publicar estado se consulta não é atual, invalidação no cleanup do efeito. Mantidos os nove endpoints, agrupamento da leitura, setters/estados e regras de falha; não se mudou contrato de API ou autorização. O callback atual ainda publica sua falha normalmente. Alteração de sete linhas no diff do componente, sem refatoração de grupos ou detalhe de versão.

O catch diagnóstico permanece aditivo: só contadores/estados/tabs, relançando o mesmo erro. Não registra payload, cookie, credencial ou conteúdo de registros. O mecanismo foi reproduzido deterministicamente; não se promete que ele explique toda falha futura de browser/carga.

## 4. Regressões e provas finais

Supervisor agora com **43 testes**, três novos: contratos dos wrappers/piso TAP; auditor TAP executado em VM contra resumo válido, parcial, falha, skip/todo e ausente; preservação CI/manual/typecheck/vocabulário/env. Guardas reais: **40 runners × 3 recusas + 3 recusas específicas = 123 execuções negativas**, sem cluster; piloto tenant separado.

As três regressões da ordenação foram acrescentadas a `ux-ops-vocabulary.test.mjs`, já executado pelo npm test e workflow de operação. Nenhuma asserção herdada removida.

### Jornadas finais completas

| Jornada | Baseline | Pós final isolado | Sob dois consumidores CPU |
|---|---:|---:|---:|
| Operação, depois da correção de ordenação | **29/29**, 148,91s | **29/29**, 134,53s | **29/29**, 193,33s |
| Patrimônio | **7/7**, 34,01s | **7/7**, 31,83s | **7/7**, 48,14s |

Finais exit 0, zero falhas/skips/todos, limpos. Tempos de parede dos comandos completos. As duas falhas de operação anteriores à correção permanecem registradas acima; não foram contadas como verdes.

Prova negativa PG sob CPU: exit 0 em **6,34s**, detectando duas falhas esperadas com exit 1 e limpeza (porta ocupada/cluster morto); não são clusters aprovados.

`npm test` depois das jornadas Next, ainda sob dois consumidores CPU: **1581/1581**, zero falhas/skips, exit 0, **90,88s**. Sequenciar não corrige a corrida global de gerados registrada na 05B.

### Seis cancelamentos reais

Sinais só ao supervisor. Servidor/Chromium identificados por ancestralidade em /proc, sem encerrar processos externos por nome. Ensaios executados depois da correção.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Operação | Banco pronto, TERM | **143** | 0,76s |
| Operação | Servidor ativo, INT | **130** | 5,01s |
| Operação | Chromium ativo, TERM | **143** | 10,47s |
| Patrimônio | Banco pronto, TERM | **143** | 0,75s |
| Patrimônio | Servidor ativo, INT | **130** | 5,07s |
| Patrimônio | Chromium ativo, TERM | **143** | 11,10s |

Nos seis: sandbox observado do worker removido, limpeza confirmada e hashes de next-env.d.ts/tsconfig.json iguais aos de entrada. Processos observados não permaneceram ativos. Browser ativo não implica navegação/assertions concluídas. Playwright pode destacar sessões; não se provou contenção de browser travado/escapado ou morte abrupta do supervisor.

### Complementares

- Focal após status/plano/matriz: **115/115**, zero falhas/skips/todos, incluindo as três regressões de ordenação, escopo/rotas fail-closed do cliente, SEC, inventários, guarda/higiene e package-artifacts.
- TypeScript/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices requisitos/rotas e git diff --check OK; gerados sem diff final.
- Sem PostgreSQL/server.mjs/next-server/Chromium/consumidores CPU ativos ou sandboxes supervisionados remanescentes na checagem final.

Logs/harness sintéticos não versionados em `/tmp/f05q-*`, incluindo histórico das falhas e regressões antes/depois; resultados persistentes consolidados aqui.

## 5. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **68 originais / 41 adotados / 27 pendentes**. Prova negativa é 69º arquivo fora do denominador. Próximo grupo proposto **05R — UX RH e painel administrativo**, após inventário/contratos e baseline próprios.

Permanecem corrida global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, Windows/UAT e backup/restore real. Sem dados reais, provedor/envio externo, operação patrimonial real, WCAG integral ou aceite humano. Gate independente client-security/N8 não executado/encerrado nesta etapa.

**Fatia 05 e N8/N9 globais abertos. Produção NO-GO. Sem commit/push/PR/deploy.**
