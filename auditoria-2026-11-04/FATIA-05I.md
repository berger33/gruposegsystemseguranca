# Fatia 05I — L02/L03: arquivos privados, caixa local e funcionário

**Data:** 04/11/2026. **Branch:** `arena/a5202d09-gruposegsystemseguranca`. HEAD/origin-main conferidos após fetch em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** dois runners adicionais com wrapper POSIX e provas locais. Total **26/68**, **42 ainda não migrados**. Produção **NO-GO**.

## 1. Contratos preservados

### L02 — arquivos privados, fila e caixa local

`qa-l02-delivery-postgres.mjs` mantém o comando `test:l02-delivery:pg`, migrações completas e **14 testes reais** por HTTP/PG. Permanecem upload com bytes em disco/hash, nome privado gerado pelo servidor, prevenção de travessia, download autenticado, detecção de adulteração, isolamento por conta, deduplicação/concorrência de fila e caixa local sem SMTP. Nenhum envio externo foi autorizado ou realizado.

O diretório de arquivos da integração continua criado por `mkdtemp(tmpdir())`. Com o ambiente do worker supervisionado, ele fica aninhado no sandbox sob custódia do pai; a prova de cancelamento confirmou isso com um arquivo já gravado.

### L03 — duas identidades de funcionário e browser

`qa-l03-delivery-postgres.mjs` mantém o comando `test:l03-delivery:pg` e o **teste integral único**, com várias asserções de identidade/isolamento, documentos, escala, folha, revogação e Chromium real. O resultado **1/1** não foi reinterpretado como cobertura integral de RH/portal nem como aceite humano.

Preservados o timeout interno de **180s** desse teste e a compatibilidade local das bibliotecas Chromium via `AWS_EXECUTION_ENV`. Os arquivos privados da integração também continuam sob tmpdir, herdado do sandbox supervisionado. Não se substituiu browser por mock nem se acrescentou retry.

Ambos os runners mantêm seu contrato legado de resultado pelo **exit code do subprocesso**, sem alegar auditoria TAP com mínimo explícito que eles não possuem. As execuções reais registraram zero falhas/skips. Nenhum arquivo de integração, API, página, permissão, schema ou dado persistente foi alterado.

## 2. Supervisor e budgets

Helper compartilhado inalterado. Wrappers POSIX depois das guardas e antes de importar embedded-postgres no worker. Mantidos sandbox/grupo próprios, criação local via Client IPv4 com prazos/finally, fases monotônicas e resultado original.

- Migração: **90s** em ambos.
- L02: **180s** para testes, baseline ~16s/carga ~22s.
- L03: **300s** para a sequência de bootstrap/browser/teste integral; bootstrap existente de até 90s e teste interno de 180s preservados. Baseline ~44s/carga ~69s sustentam margem própria; não se promete que toda operação consuma seu limite interno máximo simultaneamente.
- Totais do protocolo: **420s** L02 / **540s** L03, além das margens de encerramento/remoção já documentadas.

Worker não remove sandbox nem declara limpeza antecipadamente; token legado L03 é emitido no pai somente com `result.cleaned`. Stop rejeitado propaga falha. O código de cancelamento não é substituído por sucesso por ter limpado. Windows mantém caminho anterior, sem homologação nova.

A custódia do supervisor continua limitada ao seu grupo/sandbox. Playwright pode destacar processos: a prova de encerramento observada abaixo não cobre browser/driver travado, escape de sessão ou morte abrupta do supervisor.

## 3. CI e inventários

Nenhum workflow chamava os dois comandos nomeados. Criado **`l02-l03-delivery.yml`**, com:

- filtros para backend/lib/componentes compartilhados, rotas de funcionários, testes/helpers, runners/supervisor/guarda e migrações;
- Node 22/npm ci, unitários de segurança do funcionário e supervisor antes das jornadas;
- L02 e L03 **sequenciais**, para não disputar gerados no mesmo checkout;
- envs de URL/opt-in remoto vazios, SMTP/Ollama desativados, permissão `contents: read`, sem cancelamento por concorrência e job de 30 minutos.

**CI remoto não foi executado nem declarado verde.** É ligação dos comandos antes órfãos, não fechamento da cobertura CI global da fatia 06.

Índices regenerados pelos scripts oficiais: **1738 arquivos/222 IDs**, **12 a revalidar sem gate**, classes **27/124/71** e aceite humano zero, sem promoção. São **58 workflows**. A matriz de rotas registra o chamador nas superfícies de funcionários/portal, sem criar/remover rota ou inferir validação manual.

## 4. Regressão

Supervisor focal: **25 testes**, dois novos nesta etapa:

1. Contratos dos dois wrappers: import tardio, handlers, budgets/fases/criação limitada, resultado IPC, restauração de custódia, fixtures em tmpdir e preservação de Chromium/env/timeout interno de L03.
2. Ligação CI dos dois comandos exatos, ordem sequencial, unitários antes das jornadas, filtros e env local/permissão restrita.

Guardas dos executáveis reais agora abrangem **25 runners**: 75 recusas de URLs/opt-in, mais três recusas específicas de CLI/migrador, total **78 execuções negativas sem cluster**. Nenhuma asserção ou capacidade foi retirada.

## 5. Resultados

| Comando | Antes, exit 0 | Depois, isolado | Depois, sob carga |
|---|---:|---:|---:|
| `test:l02-delivery:pg` | **14/14**, 16,22s | **14/14**, 9,81s | **14/14**, 22,01s |
| `test:l03-delivery:pg` | **1/1 integral**, 43,56s | **1/1 integral**, 43,09s | **1/1 integral**, 69,26s |

Todos exit 0, sem falhas/skips/todos, limpos. Tempos de parede do comando completo. Dois consumidores CPU mantidos durante o ensaio de até três comandos concorrentes. Unitários executados depois, ainda sob CPU, sem jornadas Next ativas. Sequenciar a suíte não significa corrigir a corrida global de gerados da 05B.

- `npm test`: **1560/1560**, zero falhas/skips, exit 0, **88,58s** sob CPU.
- Prova negativa PostgreSQL real: exit 0 em **7,58s**; duas falhas esperadas (porta ocupada/cluster morto) detectadas com exit 1 e limpeza confirmada.
- Focal inicial: **40/40**. Final com índices/guarda/higiene/package-artifacts: **60/60**, após reconciliação do status/plano.

### Cinco interrupções reais

| Executável/cenário | Resultado | Tempo desde início |
|---|---|---:|
| L02, SIGTERM após banco pronto | **143**, limpo | ~0,77s |
| L02, SIGINT após primeiro teste gravar bytes privados | **130**, limpo | ~6,93s |
| L03, SIGTERM após banco pronto | **143**, limpo | ~0,83s |
| L03, SIGINT com servidor descendente ativo | **130**, limpo | ~5,29s |
| L03, SIGTERM com Chromium descendente ativo | **143**, limpo | ~10,23s |

Na segunda prova, o worker próprio foi identificado por filiação ao supervisor, e seu `QA_PG_DIRECTORY` foi usado para verificar o diretório temporário L02: **um arquivo privado sintético já existia** antes do sinal. Depois da saída, o **sandbox inteiro não existia mais**. Nenhum conteúdo de arquivo/credencial foi registrado no relatório.

Nos cenários L03, `/proc` confirmou servidor/Chromium com ancestralidade até o supervisor daquela execução; os processos observados não permaneceram ativos. Não se afirma que todo bootstrap/navegação já tivesse concluído nem que essas janelas cubram todas as posições possíveis de cancelamento. Sinais foram enviados somente ao supervisor, sem remoção por nome de processo externo.

Hashes de `next-env.d.ts`/`tsconfig.json` iguais aos de entrada nos **cinco casos**.

### Complementares

TypeScript/build exit 0; wave0 **5/5**; SEC **35/35**; checks dos inventários de requisitos/rotas OK; `git diff --check` OK; gerados sem diff final. Checagem de processos/diretórios sem PostgreSQL, server.mjs, next-server, Chromium, consumidores CPU ou sandboxes supervisionados remanescentes. Logs sintéticos não versionados em `/tmp/f05i-*`.

## 6. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **26/68** wrappers POSIX com provas locais; **42 pendentes**. A prova negativa é um 69º arquivo fora do denominador de jornadas. Próximo grupo proposto: **05J — L04/L05**, começando por contratos e tempos de jornadas pesadas; não copiar o perfil curto de L02.

Permanecem corrida global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, kernel/filesystem travado, demais jornadas, demo persistente e backup/restore real. Os verdes de L02/L03 **não resolvem o gate independente client-security/N8**, nem provam SMTP real, entrega da fila de produção ou validação operacional. Sem homologação Windows, UAT, provedor real ou aceite humano.

**Fatia 05 e N8/N9 globais seguem abertos. Produção NO-GO.**
