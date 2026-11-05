# Fatia 05K — L06/L07: operações, patrimônio e financeiro/painel

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch e conferência de HEAD/origin-main: `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit, push, PR ou deploy.

**Entrega parcial da fatia 05:** mais dois runners sob supervisão POSIX, com provas locais. **30/68 adotados; 38 pendentes. Produção NO-GO.**

## 1. Escopo e contratos preservados

Alterados runners L06/L07, seus workflows existentes, regressões do supervisor e registros de acompanhamento. Nenhuma integração, API, página, schema, fixture, papel ou permissão foi editado.

- `test:l06-delivery:pg`: **nove testes**, mantendo HTTP/PG e Chromium, alocação escopada por contrato, cadeia cliente→posto, necessidades por turno/dimensionamento, versões de escala, habilitação/documentação/jornada/descanso, cobertura/passagem de turno/ocorrências, estoque/reserva/ativo/serial, entrega/devolução, requisição/compras sintéticas, inventário/manutenção/evidências privadas e operação avançada com conflitos/idempotência/auditoria fail-closed.
- `test:l07-delivery:pg`: **43 testes**, mantendo HTTP/PG e múltiplas jornadas Chromium, contas/recorrência/baixa/estorno, conciliação sintética, políticas/lembretes simulados, fluxo/aging, resultado gerencial, alçadas/segregação, competências/revisões/idempotência e superfícies do painel administrativo com origem/drill-down, falha/retry, relatórios/configuração/diário/auditoria.

As descrições delimitam o conteúdo dos testes existentes, não homologação integral de operações/financeiro ou cada requisito por papel. Permanecem dados sintéticos, SMTP/Ollama desativados, documentos privados dentro do sandbox, Chromium empacotado local via `AWS_EXECUTION_ENV` sem serviço AWS.

Mantidos subprocesso real/stdio herdado e contrato original de **exit code**, sem afirmar auditor TAP com piso explícito inexistente. Nenhum teste, timeout interno, negativa, asserção ou capacidade reduzido; sem retry novo. Windows conserva lifecycle anterior, não homologado nesta etapa.

## 2. Supervisor e particularidade L07

Helper compartilhado **inalterado**. Wrappers POSIX depois das guardas de URL/opt-in, antes de embedded-postgres. Pai libera handlers da guarda que competiriam pelo sinal; worker recebe sandbox/IPC, criação local limitada por Client e fases monotônicas. Remoção do sandbox e token legado PG confirmados no pai; falha de stop continua falha.

| Perfil | L06 | L07 |
|---|---:|---:|
| Migração | 90s | 90s |
| Fase de teste agregada | **600s** | **900s** |
| Soma dos limites do protocolo | 840s | 1140s |

Além das somas permanecem margens limitadas de TERM/KILL/remoção. Baselines de 48,61s e 108,53s, respectivamente; L06 tem caso individual de até 300s e L07 reúne 43 testes seriais. Os limites agregados não prometem acomodar todos os máximos individuais simultaneamente.

### DistDir L07

L07 já removia `.next/integration-l07` antes da jornada e no finally. Essa capacidade não foi retirada:

- limpeza inicial continua no worker, agora dentro da fase `initialise` limitada;
- em POSIX, limpeza final passa ao **pai, depois de `result.cleaned`**, quando o grupo supervisionado já foi encerrado;
- inclui cancelamentos que não alcançam o finally do worker;
- `cleanupNextDist()` usa o caminho fixo do L07, `rm(recursive/force)` com **deadline 10s**, timer liberado em finally;
- só emite `QA_L07_NEXT_DIST_CLEANED` depois da resolução de rm; rejeição/timeout marca falha e saída **1**, em vez de anunciar sucesso;
- se a contenção/limpeza do supervisor não for confirmada, o pai não toca o distDir;
- Windows mantém o finally original.

É um prazo adicional ao protocolo. Deadline não cancela um rm já iniciado nem resolve filesystem/kernel travado. A política já existente de diretório fixo significa que **duas instâncias L07 não devem disputar o mesmo checkout**. Não se declarou isolamento global dos gerados nem de sessões destacadas.

## 3. CI e inventários

Mantidos workflows `l06-delivery.yml` e `l07-delivery.yml`, seus filtros reconciliados, instalação, `test:migrations:pg` antes da jornada, permissão read-only e não cancelamento por concorrência. Adicionados unitários do supervisor antes de PG e `RUN_DATABASE_INTEGRATION_REMOTE: ''` explícito.

Jobs passam de 25min a **30min L06 / 35min L07**, para acomodar os novos budgets mais migrador, instalação, unitários e encerramento, sem afrouxar testes. **CI remoto não executado nem declarado verde.**

Sem arquivo fonte/workflow novo: **58 workflows / 1738 arquivos inventariados**. Inventários oficiais de requisitos e rotas regenerados e conferidos; **222 IDs**, **12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero, sem promoção de classe ou alteração de rotas.

## 4. Regressões novas

Supervisor passa a **29 testes**, dois novos:

1. Contratos L06/L07: import tardio, POSIX/handlers, criação limitada, fases, budgets próprios, arquivos privados/Chromium, contagens nove/43 preservadas, CI com migrador e unitários anteriores à jornada, filtros/env/permissão e novos tempos de job.
2. Custódia do distDir pelo pai: só limpar após confirmação do supervisor, caminho limitado, deadline e saída em falha; executa a função de limpeza isolada em VM com rm **bem-sucedido, rejeitado e pendurado**, conferindo timers e ausência de token em falhas. Os cenários de falha de rm são simulações unitárias, não filesystem real travado.

Guardas de executáveis ampliadas: **29 runners × 3 recusas + 3 recusas específicas = 90 execuções negativas**, sem criar cluster.

Na primeira execução, uma nova asserção de fonte procurou apenas `chromium.launch`; L07 usa o nome importado `playwrightChromium.launch`. Corrigida a asserção para reconhecer ambos os contratos reais, sem editar integração nem substituir navegador. Depois **29/29**.

## 5. Resultados reais

Tempos de parede do comando completo, incluindo inicialização e limpeza.

| Jornada | Antes | Depois isolado | Depois sob dois consumidores CPU |
|---|---:|---:|---:|
| L06 | **9/9**, 48,61s | **9/9**, 37,29s | **9/9**, 66,27s |
| L07 | **43/43**, 108,53s | **43/43**, 115,05s | **43/43**, 171,68s |

Todos exit 0, zero falhas/skips/todos, limpos. L07 confirmou limpeza final de Next no pai. Jornadas sequenciais no checkout; não se rodou npm test junto com Next.

Prova negativa PG sob CPU: exit 0 em **6,30s**, observando duas falhas esperadas com exit 1 e limpeza (porta ocupada e cluster morto). Não são clusters aprovados.

`npm test` depois das jornadas, ainda sob dois consumidores CPU: **1564/1564**, zero falhas/skips, exit 0, **83,54s**. A separação não resolve a corrida global de gerados registrada na 05B.

### Seis cancelamentos com gatilhos confirmados

Sinais enviados só ao supervisor. Servidor e Chromium identificados por ancestralidade em `/proc`, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| L06 | Banco pronto, SIGTERM | **143** | 0,71s |
| L06 | Servidor descendente ativo, SIGINT | **130** | 4,79s |
| L06 | Chromium descendente ativo, SIGTERM | **143** | 14,59s |
| L07 | Banco pronto, SIGTERM | **143** | 0,72s |
| L07 | Servidor descendente ativo, SIGINT | **130** | 4,84s |
| L07 | Chromium descendente ativo, SIGTERM | **143** | 9,93s |

Nos seis: sandbox observado do worker removido, limpeza confirmada, hashes de `next-env.d.ts`/`tsconfig.json` iguais aos de entrada. Servidor/browser observados não permaneceram ativos.

**Prova específica L07:** no cenário Chromium, `.next/integration-l07` **existia antes do sinal e foi removido** ao final. Nos dois gatilhos anteriores ainda não existia e continuou ausente. Isso distingue remoção efetivamente observada de simples inexistência prévia.

Browser ativo não significa navegação/assertions concluídas naquele instante. Playwright pode destacar sessões: os ensaios não cobrem browser travado, escape de sessão nem morte abrupta do supervisor.

### Verificações finais

- Focal após status/plano/matriz: **85/85**, zero falhas/skips/todos, incluindo vocabulários operações/financeiro, SEC, inventários, guarda/higiene e package-artifacts.
- TypeScript e build: exit 0.
- SEC: **35/35 âncoras** conferidas pelo reauditor; não é pentest.
- Wave0: **5/5** verificações estáticas.
- Índices requisitos/rotas e `git diff --check` OK; gerados sem diff final.
- Sem PostgreSQL/server.mjs/next-server/Chromium/consumidores CPU ativos ou sandboxes supervisionados remanescentes na checagem final.

Logs/harness sintéticos não versionados em `/tmp/f05k-*`; os resultados persistentes estão neste relatório, não dependem da retenção de `/tmp`.

## 6. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv) conferida: **68 originais, 30 adotados, 38 pendentes**. Prova negativa continua 69º runner fora do denominador. Próximo grupo proposto **05L — L08 consolidado**, inventariando contratos legados do portal, symlinks e tempos antes de definir limites.

Permanecem corrida global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, Windows, backup/restore real e UAT. Esta etapa não autoriza cobrança/emissão/compra/envio externo nem valida operação real de patrimônio/financeiro. Não fecha o gate independente client-security/N8.

**Fatia 05 e N8/N9 globais seguem abertos. Produção NO-GO. Sem commit/push/PR/deploy.**
