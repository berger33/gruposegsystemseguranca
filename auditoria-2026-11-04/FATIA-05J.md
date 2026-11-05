# Fatia 05J — L04/L05: CRM público/comercial e contratos

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch e conferência de HEAD/origin-main: `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Alterações anteriores preservadas. Sem commit, push, PR, deploy, contratação ou dados reais.

**Entrega parcial da fatia 05:** mais dois runners com supervisão POSIX e provas locais. **28/68 adotados; 40 pendentes. Produção NO-GO.**

## 1. Escopo e preservação

Alterados somente runners L04/L05, regressão do supervisor, workflows já existentes e registros de acompanhamento. Integrações, APIs, páginas, schemas, papéis e fixtures não foram editados.

- **L04:** mantidos os **20 testes seriais**, HTTP/PG e diversos lançamentos Chromium. Exercitam visitante público, comercial e aprovador com escopos/alçadas distintos; catálogo→aceite; tarefas/interações/anexos privados; agenda e cadências; cadastro/contatos/unidades/deduplicação; origem/conversão e SEO; CMS versionado/rollback, temas, pacotes de catálogo e superfícies comerciais adicionais. É evidência das asserções presentes, não homologação integral do domínio CRM/CMS.
- **L05:** mantido **um teste integral**, com múltiplas asserções de contrato canônico manual/proposta, idempotência, composição/implantação, ciclo de estados, anexos/obrigações, aditivos, alerta local, encerramento e diário restrito. Negativas de anônimo/comercial e Chromium reais preservados. **1/1 não significa um caso por requisito nem aceite global de contratos.**

Comandos originais: `test:l04-delivery:pg` e `test:l05-delivery:pg`. Mantidos resultado por exit code do subprocesso, stdio herdado e falha de stop como falha. Não se declarou auditor TAP/piso explícito inexistente nesses dois runners. As execuções reais tiveram zero falhas/skips/todos.

Compatibilidade Chromium local via `AWS_EXECUTION_ENV` preservada, sem serviço AWS. Sem SMTP/Ollama. L04 mantém `CLIENT_DOCS_DIR` em `private-documents` dentro do sandbox do runner; o servidor herda o ambiente. L05 mantém diretório de documentos dentro do workDir criado por tmpdir na integração; o TMPDIR do worker agora o aninha no sandbox do pai. Restauração própria dos gerados em L04 também foi preservada.

## 2. Contenção e limites próprios

Wrappers POSIX antes de importar embedded-postgres, depois das guardas de URL/opt-in. Pai libera handlers concorrentes da guarda, worker usa sandbox/IPC, criação local limitada via Client e fases monotônicas. Remoção do sandbox e emissão de token legado de limpeza pelo pai somente depois de `result.cleaned`.

Helper compartilhado **inalterado**. Windows preserva lifecycle anterior, sem homologação nova.

| Limite | L04 | L05 |
|---|---:|---:|
| Migração | 90s | 90s |
| Fase de teste | **900s** | **300s** |
| Soma dos limites do protocolo | 1140s | 540s |

Além da soma, permanecem as margens limitadas de TERM/KILL/remoção do helper. L04 tem vinte testes, inclusive casos com timeout individual de 300s e bootstrap até 90s; seu baseline completo foi 173,44s e carga 242,27s. O limite é da **fase agregada**, não promessa de permitir que todos os vinte casos consumam seus máximos individuais. L05 mantém timeout interno de 180s e bootstrap existente, com baseline completo de 20,33s. Nenhum timeout interno, capacidade, caso ou asserção foi reduzido; nenhum retry foi introduzido.

## 3. CI e índices

Os dois comandos já eram chamados por `l04-delivery.yml` e `l05-delivery.yml`. Preservados passos de instalação, `test:migrations:pg`, jornada real, tempos de job, filtros e permissão `contents: read`. Acrescentados:

- unitários do supervisor **antes de criar PostgreSQL**;
- `RUN_DATABASE_INTEGRATION_REMOTE: ''` explícito em ambos.

Filtros de supervisor/guarda/focal já reconciliados na 05G, mantidos. Sem novo workflow: **58 workflows**, **1738 arquivos inventariados**. **CI remoto não executado nem declarado verde.**

Regenerados e conferidos inventários oficiais de requisitos/rotas. Permanecem **222 IDs**, **12 a revalidar sem gate**, classes de evidência **27/124/71**, aceite humano zero; sem promoção de classe, nova rota ou aceite manual.

## 4. Regressões acrescentadas

Supervisor agora com **27 testes**, dois novos:

1. Wrappers L04/L05: import tardio, POSIX, liberação de handlers, fases, criação limitada, budgets separados, resultado/limpeza IPC, contrato de browser e custódia de documentos. Confere os vinte testes L04 e timeout individual de 300s preservados. L04 herda `CLIENT_DOCS_DIR` do runner; L05 define o diretório na integração.
2. CI: dependências/filtros, unitários antes de PG, migrador antes da jornada e ambiente/permissões locais preservados.

Guardas reais ampliadas para os dois executáveis: **27 runners × 3 recusas + 3 recusas específicas = 84 execuções negativas**, sem cluster.

A primeira execução focal marcou uma falha na **nova asserção de fonte**, que procurava `CLIENT_DOCS_DIR:` na integração L04. O contrato real já define o diretório no runner e o herda no servidor. Corrigida a asserção para verificar esse mecanismo, sem alterar implementação/integração. Depois **27/27**.

## 5. Ensaios reais

Tempos de parede do comando completo, incluindo inicialização e limpeza.

| Jornada | Baseline | Depois isolado | Depois sob dois consumidores CPU |
|---|---:|---:|---:|
| L04 | **20/20**, 173,44s | **20/20**, 164,39s | **20/20**, 242,27s |
| L05 | **1/1 integral**, 20,33s | **1/1 integral**, 17,87s | **1/1 integral**, 28,53s |

Todos exit 0, sem falhas/skips/todos e limpos. Jornadas sequenciais no mesmo checkout. Prova negativa PG sob CPU: exit 0 em **6,35s**, detectando duas falhas esperadas com exit 1 e limpeza (porta ocupada/cluster morto); não são dois clusters aprovados.

`npm test` executado depois das jornadas Next, sob dois consumidores CPU: **1562/1562**, zero falhas/skips, exit 0, **87,84s**. Essa separação não corrige a corrida global de gerados registrada na 05B.

### Cancelamentos com gatilhos confirmados

Sinal enviado ao supervisor; servidor/browser identificados por ancestralidade em `/proc`, nunca encerrando processos externos por nome.

| Runner | Gatilho/sinal | Código | Tempo desde início |
|---|---|---:|---:|
| L04 | Banco pronto, SIGTERM | **143** | 0,79s |
| L04 | Servidor descendente ativo, SIGINT | **130** | 5,08s |
| L04 | Chromium descendente ativo, SIGTERM | **143** | 8,33s |
| L05 | Banco pronto, SIGTERM | **143** | 0,79s |
| L05 | Servidor descendente ativo, SIGINT | **130** | 5,34s |
| L05 | Chromium descendente ativo, SIGTERM | **143** | 9,89s |

Nos **seis casos**: limpeza confirmada, sandbox observado do worker removido e hashes de `next-env.d.ts`/`tsconfig.json` iguais aos de entrada. Servidores/browsers observados não permaneceram ativos após saída. O gatilho browser confirma processo ativo, não conclusão de navegação/assertions naquele instante.

**Sonda inicial não contada como prova Chromium:** procurava caminho fixo `/tmp/chromium`, mas o worker usa TMPDIR aninhado. A observação expirou aos 140s e o harness enviou SIGTERM; runner retornou **143**, limpo, sandbox removido e hashes iguais, porém **sem gatilho browser confirmado**. Corrigido detector do harness descartável para reconhecer o executável no TMPDIR efetivo, ainda exigindo ancestralidade; ensaio Chromium L04 acima repetido com processo real observado. Não houve relaxamento de teste do produto ou declaração de sucesso dessa sonda incompleta.

Playwright pode destacar sessões. Os testes observados não provam contenção de browser travado, escape de sessão ou morte abrupta do supervisor.

### Verificações finais

- Focal final, após reconciliação de docs/plano/matriz, incluindo vocabulário CRM/contratos, SEC, índices, guarda/higiene e package-artifacts: **82/82**, zero falhas/skips/todos.
- TypeScript e build: exit 0.
- SEC: **35/35 âncoras** conferidas pelo `reaudit:sec`; teste de regressão do reauditor **6/6**. Não equivale a pentest.
- Wave0: **5/5** verificações estáticas.
- Checks de inventários OK; `git diff --check` OK; gerados sem diff.
- Sem PostgreSQL/server.mjs/next-server/Chromium/consumidores CPU ativos ou sandboxes supervisionados remanescentes na checagem final.

Logs sintéticos não versionados: `/tmp/f05j-*`. Resultados consolidados neste documento porque `/tmp` não é entrega persistente.

## 6. Continuidade

[Matriz de adoção](ADOCAO-POSTGRES.csv) conferida: **68 originais, 28 adotados e 40 pendentes**. A prova negativa é um 69º runner fora desse denominador. Próximo grupo proposto **05K — L06/L07**, medindo a jornada financeira pesada e preservando limpeza própria do distDir L07 antes de definir budgets.

Permanecem isolamento global de gerados, processos destacados, SIGKILL/OOM do supervisor, kernel/filesystem travado, jornadas não migradas, backup/restore real, Windows e UAT. Nenhum verde desta etapa fecha o gate independente client-security/N8, SMTP/entrega externa real ou aceite operacional de CRM/contratos.

**Fatia 05 e N8/N9 globais abertos. Produção NO-GO.**
