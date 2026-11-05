# Fatia 05F — editor visual, relatórios e inteligência comercial

**Data:** 04/11/2026. **Branch:** `arena/a5202d09-gruposegsystemseguranca`. HEAD/origin-main `0e6456e9d01b825a3bff4997f92506ac4ff1c633`, conferidos após fetch. Alterações anteriores preservadas. Sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** três wrappers adicionais validados em Linux/POSIX. Total **20/68** runners originais; **48 ainda não migrados**. Produção **NO-GO**.

## 1. Escopo e contratos preservados

| Runner | Jornada | Mínimo TAP | Prazo de teste |
|---|---|---:|---:|
| `qa-ext12-visual-postgres.mjs` | Editor visual canônico, tokens/layouts/prévia por API | 14 | 180s |
| `qa-ext13-reports-postgres.mjs` | Relatório periódico canônico, fontes e totais | 16 | 180s |
| `qa-ext14-intel-postgres.mjs` | Inteligência comercial, histórico/justificativa e interface em Chromium | 16 | **300s** |

Preservados: HTTP real, sessões/RBAC/fixtures, criação de negócio pelas APIs, migrações 001–183, banco exclusivo loopback, guardas de URL/opt-in remoto, rejeição de falha/skip/todo e mínimos de casos. Relatórios mantém `initdbFlags` UTF-8/locale C. Inteligência mantém Chromium, compatibilidade `AWS_EXECUTION_ENV` e o retry já existente restrito a falha de lançamento de infraestrutura — nenhum retry novo foi adicionado. Nenhum arquivo de integração, API, rota, schema ou permissão foi alterado nesta etapa.

Migração separada: **90s** nos três. Teste de inteligência tem perfil próprio de 300s, considerando sua etapa de navegador e o teste de interface com teto de 90s; editor/relatórios usam 180s. Não se aplicou perfil de browser em massa. Totais do protocolo: **540s** para inteligência, **420s** nos outros dois, além das margens de encerramento/remoção já documentadas. Comentários de ledger antigos reconciliados para 001–183, sem alteração de SQL.

## 2. Implementação e restauração de gerados

Supervisor e helper de criação compartilhados **não foram modificados** nesta etapa. Wrapper POSIX depois das guardas e antes de importar embedded-postgres no worker, grupo/sandbox próprios, fases monotônicas, criação via Client IPv4 com prazos de 5s/finally e resultado original preservado. Rejeição de stop é falha no caminho supervisionado. Worker não remove sandbox nem declara limpeza; token legado de limpeza vem do pai, condicionado a `result.cleaned`.

EXT-14 tinha uma proteção diferente dos demais: snapshot/restore assíncrono explícito, com finally interno para restaurar mesmo se stop/rm falhassem. Essa capacidade foi **mantida** no worker/caminho legado. O pai agora também captura snapshot e restaura em finally **depois** da supervisão, antes de sair, inclusive no cancelamento retornado pelo supervisor. A guarda síncrona de saída foi acrescentada; seus handlers de sinal são liberados no pai para não atropelar o shutdown supervisionado. O token `QA_EXT14_GENERATED_FILES_RESTORED` pode aparecer no worker e no pai: confirma restauração, não sucesso da jornada nem limpeza do cluster.

Windows conserva caminho anterior e sua restauração explícita, sem homologação nova. Nenhuma promessa de recuperação de SIGKILL/OOM do próprio supervisor ou de filesystem travado foi acrescentada.

**Limite de browser:** Playwright pode criar outra sessão/grupo. O token do supervisor cobre somente grupo/sandbox sob custódia, não toda árvore destacada. A prova com Chromium ativo abaixo é do encerramento normal observado; browser/driver travado, morte abrupta ou descendente que escape ainda exigem contenção externa. Não se marcou essa fronteira como resolvida.

## 3. CI e índices

Inspeção confirmou que os três comandos nomeados não eram chamados por nenhum workflow. Adicionados:

- `ext12-delivery.yml`;
- `ext13-delivery.yml`;
- `ext14-delivery.yml`.

Todos têm PR para main, filtros específicos de API/página/testes/runner/helper/migrações/package, Node 22/npm ci, unitários antes da jornada real, env local descartável, permissão `contents: read`, sem cancelamento por concorrência e teto de job de 25 minutos. Inteligência acompanha também `qa-generated-files.mjs`. Os workflows UX existentes foram preservados.

**CI remoto não foi executado nem declarado verde.** Isto liga três comandos órfãos, não encerra a cobertura CI global da fatia 06.

Índices regenerados com os scripts oficiais: **1735 arquivos**, **222 IDs**, **12 a revalidar sem gate**, classes **27/124/71** e aceite humano zero, sem promoção. São **55 workflows**. As três linhas correspondentes nos CSVs de rotas ganharam novos chamadores/jobs; não se criaram/removeram rotas nem se declarou validação manual. O índice é localização de evidência, não prova de cada papel/tela.

## 4. Regressão

`tests/qa-pg-supervisor.test.mjs`: **19 testes**. Tabelas estendidas aos três runners, preservando os auditores TAP originais (funções arrow), mínimos, protocolos, ordem de fases, budgets e ligação CI. Guardas reais agora cobrem **19 runners**: 57 recusas de URLs/opt-in mais duas específicas da CLI, antes de iniciar cluster.

Novo teste exige UTF-8 de relatórios, snapshot/finally/restore no pai de inteligência antes do exit, compatibilidade Chromium e chamadas CI exatas/env local/unitários antes da jornada nos três workflows. Os testes E9 da restauração/retry existente continuaram passando sem afrouxamento.

## 5. Resultados

| Comando npm | Antes, exit 0 | Depois, isolado | Depois, sob carga |
|---|---:|---:|---:|
| `test:ext12-visual:pg` | 8,55s | **14/14**, 7,83s | **14/14**, 19,81s |
| `test:ext13-reports:pg` | 8,75s | **17/17**, 7,94s | **17/17**, 20,82s |
| `test:ext14-intel:pg` | 18,77s | **18/18**, 15,22s | **18/18**, 34,34s |

Todos exit 0, zero falhas/skips/todos e limpeza confirmada. Tempos de parede do comando completo. Carga: dois consumidores CPU, executor de até três comandos simultâneos. A suíte unitária foi executada **depois**, sem jornadas Next ativas no mesmo checkout, ainda sob CPU; isso não corrige a corrida de gerados da 05B.

- `npm test`: **1554/1554**, zero falhas/skips, exit 0, **85,10s** de parede sob CPU.
- Gate negativo PostgreSQL real: exit 0 em **8,49s**, duas falhas esperadas (porta ocupada/cluster morto) detectadas com exit 1/timeout-stop e limpeza confirmada.
- Focal inicial: **73/73**, incluindo E9 e inventários.
- Focal final com guarda/higiene e package-artifacts: **93/93**, após reconciliação do plano/status.

### Sete interrupções reais e hashes

| Runner | SIGTERM após banco pronto | SIGINT após primeiro teste aprovado |
|---|---|---|
| Editor visual | **143**, limpo, ~0,75s | **130**, limpo, ~6,58s |
| Relatórios | **143**, limpo, ~0,74s | **130**, limpo, ~6,55s |
| Inteligência | **143**, limpo, ~0,69s | **130**, limpo, ~7,18s |

Sétima prova: monitor de `/proc` identificou executável Chromium descendente do supervisor daquela execução de inteligência. SIGTERM enviado nessa janela: **143**, limpeza confirmada; navegador observado não permaneceu ativo (~9,08s desde início do executável). Não se alega que toda a navegação já tivesse concluído nem que esse ensaio cubra browser travado.

Nos **sete casos**, hashes de `next-env.d.ts` e `tsconfig.json` depois da saída foram iguais aos respectivos hashes de entrada. Sinais foram enviados somente ao supervisor; nenhuma remoção por nome de processo.

### Complementares

TypeScript/build exit 0; wave0 **5/5**; SEC **35/35**; checks dos inventários de requisitos/rotas OK; `git diff --check` OK; gerados sem diff final. Checagem de processos/diretórios sem PostgreSQL, server.mjs, next-server, Chromium, consumidores CPU ou sandboxes supervisionados remanescentes dos ensaios. Logs sintéticos fora do Git em `/tmp/f05f-*`.

## 6. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **20/68** wrappers supervisionados POSIX e **48 pendentes**. A prova negativa é um 69º arquivo, fora do denominador de jornadas. Próximo grupo proposto: **05G — EXT-15 e gate de migrações**, após inspeção dos contratos e baselines específicos.

Continuam abertos: isolamento global dos gerados, sessões destacadas, SIGKILL/OOM do supervisor, kernel/filesystem travado, demais jornadas, backup/restore e demo persistente. Sem homologação Windows, UAT, parecer operacional, provedor real ou aceite humano.

**Fatia 05 e N8/N9 globais seguem em execução. Produção NO-GO.**
