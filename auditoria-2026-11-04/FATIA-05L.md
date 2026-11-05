# Fatia 05L — L08 consolidado: portal canônico do cliente

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch e HEAD/origin-main conferidos em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit, push, PR ou deploy.

**Entrega parcial da fatia 05:** um runner adicional sob supervisão POSIX, com provas locais. **31/68 adotados; 37 pendentes. Produção NO-GO.**

## 1. Escopo preservado

`test:l08-delivery:pg` continua executando `tests/l08-delivery.integration.test.mjs`, que importa **as duas fontes canônicas existentes**, `client-access.integration.test.mjs` e `client-space.integration.test.mjs`. Mantidos o inventário de contrato e o smoke Chromium de entrada: **quatro testes de topo e 54 testes TAP contando subtestes**. Não foi criada uma segunda implementação de portal ou suíte duplicada.

Preservados os fluxos/assertions existentes de convite, confirmação, login/sessão, recuperação/logout, falha atômica de auditoria e MFA, escopo A/B, contas/grants/contatos delegados, contratos publicados, documentos privados com auditoria antes dos headers, chamados/idempotência/atendimento/aceite e slices cliente de visitas/reagendamento/relatórios revisados. O smoke serve a entrada real com Chromium empacotado, sem desabilitar web security.

O escopo declarado do runner continua excluindo lifecycle/UI staff de CLI-06..08, CLI-09..15, extensões e APIs v2. Estas provas não são homologação integral por requisito/papel.

**Particularidade SMTP:** a suíte de acesso configura e usa captura SMTP **real em loopback 127.0.0.1**, com destinatários sintéticos, para verificar conteúdo/links dos fluxos. Isso foi preservado; não é provedor externo, entrega de e-mail real nem aprovação de SMTP de produção. Não se confundiu com a caixa local sem SMTP do L02.

Nenhuma integração, API, página, schema, fixture, permissão, timeout interno ou asserção existente foi alterado. Resultado legado por exit code/stdio herdado preservado, sem afirmar auditor TAP de piso explícito inexistente. Execuções efetivas tiveram zero falhas/skips/todos. Sem retry novo.

## 2. Supervisor, bootstrap nativo e migrações

Helper compartilhado **inalterado**. Wrapper POSIX antes de embedded-postgres e do bootstrap nativo, com liberação dos handlers concorrentes da guarda, sandbox/IPC, criação local limitada e fases monotônicas. Worker não remove sandbox supervisionado nem declara limpeza prematuramente; token legado PG no pai somente após `result.cleaned`. Stop rejeitado mantém falha.

Guardas de URL/opt-in agora ficam **antes dos symlinks**: recusa não precisa tocar `node_modules`. Bootstrap libpq/ICU, quatro links de soname e montagem de `LD_LIBRARY_PATH` preservados, executados no worker **antes da importação dinâmica da biblioteca**. Nenhuma dependência/pacote instalado ou retirado nesta etapa. Ensaios usam a instalação Linux disponível; não homologam fresh install nem outras arquiteturas. Windows mantém caminho de lifecycle anterior, sem homologação nova.

**Limite da fase test: 600s**, para duas suítes HTTP/PG mais smoke Chromium com bootstrap interno de até 180s. Soma dos limites do protocolo **840s**, além das margens de encerramento/remoção existentes. Baseline completo de 37,04s e carga de 52,93s sustentam a margem, sem prometer tempo infinito ou acomodar simultaneamente todos os máximos internos.

L08 não tinha comando externo de migração. As suítes importadas executam seus `applyMigrations()` canônicos em sequência, dentro da **fase test**. Mantida essa responsabilidade: **sem segundo migrador e sem emitir fase migrate fictícia**. O limite migrate do perfil compartilhado fica sem uso nesta jornada, embora componha a soma global do protocolo.

Arquivos privados do runner continuam no sandbox; `client-space` continua criando `seg-client-docs-*` via `os.tmpdir()`, agora aninhado no TMPDIR supervisionado. Snapshot/restore próprios das suítes e guarda dos gerados preservados. Diretórios Next específicos existentes não receberam nova política de remoção; não se declarou isolamento global de gerados.

## 3. CI e inventários

Mantido workflow `l08-delivery.yml` e seu comando único, job de 25min, Node 22/npm ci, permissão read-only e não cancelamento por concorrência. Adicionados:

- filtros de supervisor, guarda, focal, helpers e unitário de escopo do cliente;
- opt-in remoto explicitamente vazio;
- unitários de supervisor/escopo fail-closed **antes de PostgreSQL**.

Sem novo passo externo de migração ou novo workflow. **CI remoto não executado nem declarado verde.**

Inventários oficiais regenerados/conferidos: **58 workflows / 1738 arquivos**, **222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero, sem promoção de classe/rota/aceite.

## 4. Regressão acrescentada

Supervisor passa a **31 testes**, dois novos:

1. Ordem guarda→wrapper→bootstrap nativo→biblioteca, sonames/LD preservados, handlers/POSIX, sandbox/criação limitada, fases próprias sem migrador duplicado, resultado/limpeza, imports canônicos, applyMigrations e restore das duas fontes, Chromium/timeout de bootstrap, SMTP loopback e tmpdir privado.
2. Ligação CI: filtros/helper/guarda, unitários antes da jornada, ausência de segundo migrador e env/permissão/cancelamento preservados.

Guardas reais ampliadas: **30 runners × 3 recusas + 3 recusas específicas = 93 execuções negativas**, sem criar cluster. O piloto tenant e suas provas continuam registrados separadamente.

Focal inicial: **31/31**. Nenhuma falha na nova regressão foi mascarada nem asserção removida.

## 5. Ensaios reais

| Execução do comando completo | Resultado | Tempo de parede |
|---|---:|---:|
| Antes | **54/54**, exit 0 | 37,04s |
| Depois, isolado | **54/54**, exit 0 | 28,94s |
| Depois, sob dois consumidores CPU | **54/54**, exit 0 | 52,93s |

Zero falhas/skips/todos e limpeza confirmada em todas. Prova negativa PostgreSQL sob CPU: exit 0 em **6,49s**, detectando duas falhas esperadas com exit 1 e limpeza (porta ocupada/cluster morto); não são clusters aprovados.

`npm test` depois das jornadas Next, ainda sob dois consumidores CPU: **1566/1566**, zero falhas/skips, exit 0, **83,81s**. Sequenciar não corrige a corrida global de gerados registrada na 05B.

### Quatro cancelamentos com gatilhos confirmados

Sinal enviado somente ao supervisor. Servidor e Chromium identificados por ancestralidade em `/proc`, sem encerrar processos externos por nome.

| Gatilho/sinal | Saída | Tempo desde início |
|---|---:|---:|
| Banco pronto, SIGTERM | **143** | 0,71s |
| Servidor descendente ativo, SIGINT | **130** | 4,48s |
| Arquivo privado já gravado, SIGINT | **130** | 19,48s |
| Chromium descendente ativo, SIGTERM | **143** | 24,40s |

Nos quatro: sandbox observado do worker removido, limpeza confirmada, hashes de `next-env.d.ts` e `tsconfig.json` iguais aos de entrada. Servidores/browsers observados não permaneceram ativos.

Na prova privada, **um arquivo sintético** já estava no `seg-client-docs-*` aninhado ao sandbox antes do sinal. O sandbox inteiro foi removido; não se registrou conteúdo/credencial. A prova Chromium ocorre no smoke final depois das jornadas canônicas, mas gatilho de processo ativo não significa navegação/assertions do smoke já concluídas.

Playwright pode destacar sessões. Esses ensaios não provam contenção de browser travado, escape de sessão, SIGKILL/OOM do supervisor ou filesystem/kernel travado.

### Complementares finais

- Focal após status/plano/matriz: **92/92**, zero falhas/skips/todos, incluindo escopo/rotas fail-closed do cliente, SEC, inventários, guarda/higiene e package-artifacts.
- TypeScript/build: exit 0.
- SEC: **35/35 âncoras** conferidas, não pentest.
- Wave0: **5/5** verificações estáticas.
- Checks de inventários e `git diff --check` OK; gerados sem diff final.
- Sem PostgreSQL/server.mjs/next-server/Chromium/consumidores CPU ativos ou sandboxes supervisionados remanescentes na checagem final.

Logs/harness sintéticos não versionados em `/tmp/f05l-*`; resultados persistentes consolidados aqui, sem depender da retenção de `/tmp`.

## 6. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv) conferida: **68 originais / 31 adotados / 37 pendentes**. Prova negativa é um 69º runner fora do denominador. Próximo grupo proposto **05M — F03 chamado/atendimento/aceite e solicitação/retorno RH**, após inventário de seed canônico, arquivos temporários, HTTP e Chromium.

Corrida global de gerados, sessões destacadas, morte abrupta do supervisor, outras jornadas, Windows, backup/restore real e UAT permanecem. Testes unitários de rotas de segurança do cliente não equivalem ao gate independente **client-security/N8**, que **não foi executado/encerrado nesta etapa**. Também não houve envio/provedor externo, dados reais ou aceite humano.

**Fatia 05 e N8/N9 globais seguem abertos. Produção NO-GO. Sem commit/push/PR/deploy.**
