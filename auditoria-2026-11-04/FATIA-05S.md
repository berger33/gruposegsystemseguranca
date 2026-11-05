# Fatia 05S — UX frota e terceiros

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch de main confirmado; HEAD/origin-main `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado, sem commit/push/PR/deploy.

**Entrega parcial da fatia 05: 45/68 runners adotados; 23 pendentes. Produção NO-GO.**

## 1. Inventário e preservações

Lidos AGENTS, README, status/plano/matriz, runners, integrações, workflows e documentos históricos UX-07 de frota/terceiros. Nenhuma capacidade de produto reimplementada ou reduzida.

- **Frota `/admin/frota`: 13 casos.** Sessão/papel/origem/chave, corpo real de escrita, histórico independente de regras de manutenção, negativa distinta de vazio, resposta inválida não vira lista vazia, falha transitória preserva dados/hora/repetição, negativa após sucesso descarta dado protegido, falha de regras não contamina dossiê, sete abas/teclado, português/ausência honesta/zero real, chave preservada na recusa e 390px.
- **Terceiros `/admin/terceiros`: 13 casos.** Mesmas fronteiras de sessão/papel/origem/chave, corpos canônicos de escrita, resposta inválida/erro/releitura/negativa, português/ausência honesta/nota zero real, oito abas/teclado, falha de decisão independente do dossiê, decisão real do servidor, chave na recusa e 390px. Grant de janela de negócio não é concessão de sessão. Não se criou login/canal externo de terceiro.
- Gate **EXT-02 herdado preservado**, sem editar runner/integração/API: executado novamente, **22/22**, mínimo exigido 21, zero fail/skip/todo, limpeza confirmada. Workflow continua executando esse gate antes do focal UX. Frota preserva teste unitário EXT-01; não foi inventado gate PG herdado de frota.

Sem mudança em integrações, APIs, telas, schema, fixtures ou permissões nesta etapa. Massa fictícia criada pelas APIs canônicas existentes; leitura SQL de conferência permanece. Falhas de interface injetadas apenas no window.fetch, sem enfraquecer servidor.

Preservados padrões focais opcionais `UX_FLEET_TEST_PATTERN` e `UX_THIRD_PARTY_TEST_PATTERN`, evidências opcionais, LD_LIBRARY_PATH e symlinks de bibliotecas nativas, heap 1024MB, Chromium local e flags herdadas. Os ensaios completos usaram patterns vazios, sem diretório opcional de capturas. SMTP/Ollama desativados. Não há provedor externo/AWS operacional.

## 2. Migração dos runners

`scripts/qa-ux-fleet-postgres.mjs` e `scripts/qa-ux-third-party-postgres.mjs` agora usam wrapper POSIX antes do import de embedded-postgres e dos efeitos nativos, depois das recusas de URL/opt-in. Pai libera handlers concorrentes da guarda; worker recebe sandbox/TMP/IPC, criação local limitada pelo helper, fases monotônicas e conclusão explícita. Pai confirma término e remove sandbox antes de afirmar limpeza.

Helper compartilhado **inalterado**. Windows mantém caminho anterior, sem nova homologação. Remoção/token antigos só no caminho não supervisionado; supervisor emite token genérico uma vez após conferir remoção. O log antigo de terceiros “temporário limpo” fica restrito ao caminho legado para não anteceder a remoção do pai.

Budgets em **ambos**: migrate **90s**, test agregado **900s**. Soma do protocolo **1140s**, além das margens limitadas de TERM/KILL/remoção existentes. Mantidos bootstrap **180s**, compilação até **240s por rota** e recuperação de crash do navegador herdada (até três tentativas); asserções ERR_ASSERTION continuam lançadas imediatamente. Não houve retry novo de gate nem relaxamento de asserção/timeout. O budget agregado tem margem sobre medições e sequências existentes, não promete soma ilimitada de todos os máximos internos.

Resultado herdado continua por exit code do subprocesso/stdio, **sem auditor TAP mínimo novo**. Execução com filtro não vale como jornada completa. Diretórios Next e arquivos de evidência opcionais mantêm política anterior; não há isolamento global de gerados novo.

## 3. CI e regressão

Workflows existentes `ux-fleet-delivery.yml` e `ux-third-party-delivery.yml`: adicionados filtros de supervisor/guarda/focal/migrador, unitários antes de PG, opt-in remoto e patterns explicitamente vazios. Mantidos typecheck, vocabulários, testes EXT-01/EXT-02, gate EXT-02, jobs de **40min**, contents read e não cancelamento por concorrência. **CI remoto não executado.**

Dois testes novos de contratos no supervisor: import tardio/POSIX/handlers, fases/criação/budgets, compatibilidade nativa/heap, padrões/resultado, contagem 13/13 e limites/browser herdados; workflows e ordem do EXT-02. Guardas reais ampliadas aos dois runners: **44 × 3 recusas + 3 específicas = 135 execuções negativas**; piloto tenant separado. Supervisor **47/47**.

## 4. Provas executadas

Tentativa inicial de baseline falhou antes de abrir cluster por dependências ausentes (`embedded-postgres`). Instalado `npm ci` com sucesso, sem mudança de manifest/lock. Essa tentativa **não** é baseline aprovado. Baselines válidos abaixo foram executados antes da edição dos runners.

| Jornada | Antes | Depois isolado | Sob dois consumidores CPU |
|---|---:|---:|---:|
| Frota | **13/13**, 44,13s | **13/13**, 41,32s | **13/13**, 72,15s |
| Terceiros | **13/13**, 46,28s | **13/13**, 44,55s | **13/13**, 77,01s |

Todos exit 0, zero fail/skip/todo, limpeza confirmada. Nenhum log de recuperação BROWSER_RETRY nesses seis ensaios. Tempos de parede do comando completo. As integrações consultam a data-base do servidor, sem fixar data de calendário no teste.

Prova negativa PG sob CPU: overall exit 0 em **6,06s**, reconhecendo duas falhas esperadas exit 1 com limpeza (colisão de porta/cluster morto). Não são clusters aprovados.

Suíte completa depois das jornadas Next, ainda sob dois consumidores CPU: **1585/1585**, zero falhas/skips/todos, **89,29s**, exit 0. Isso não resolve a corrida global de gerados registrada na 05B. Gate EXT-02 novamente **22/22**, **9,08s**, exit 0.

### Cancelamentos reais

Sinal único enviado só ao supervisor após gatilho confirmado; processos acompanhados por ancestralidade /proc, sandbox observado no worker. Sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Frota | Banco pronto / TERM | **143** | 0,80s |
| Frota | Servidor ativo / INT | **130** | 5,29s |
| Frota | Chromium ativo / TERM | **143** | 19,81s |
| Terceiros | Banco pronto / TERM | **143** | 0,82s |
| Terceiros | Servidor ativo / INT | **130** | 5,27s |
| Terceiros | Chromium ativo / TERM | **143** | 18,81s |

Nos seis: sandbox removido, token de limpeza confirmado, hashes next-env.d.ts/tsconfig.json iguais aos de entrada, nenhum descendente observado ativo. Chromium ativo não implica navegação/assertions concluídas. Playwright pode destacar sessões: não é prova de browser travado/escapado nem de SIGKILL/OOM do supervisor.

### Verificações complementares

- Focal de 12 arquivos **201/201**, zero fail/skip/todo: supervisor, vocabulários, EXT-01/02 unitários, escopo/rotas cliente fail-closed, SEC, inventários, higiene e package-artifacts.
- Typecheck e build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Requisitos/rotas regenerados/conferidos: **60 workflows / 1740 arquivos / 222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero. Sem promoção de classe/rota por mera adoção de wrapper.
- Gerados sem diff final; git diff --check e checagem final de processos/sandboxes registrados na entrega.

Logs/harness sintéticos em `/tmp/f05s-*`, fora do versionamento; resultados persistentes consolidados neste relatório.

## 5. Continuidade e limites

[Matriz](ADOCAO-POSTGRES.csv): **45 adotados de 68 originais; 23 pendentes**. Negativo PG é 69º arquivo, fora do denominador. Próximo grupo proposto **05T — UX licitações e fornecedores**, depois de inventário/baseline e preservando gates herdados.

Permanecem isolamento global de gerados, sessões destacadas, morte abrupta do supervisor, filesystem/kernel travado, demais jornadas, CI remoto, Windows, UAT/WCAG manual e restore real. Sem dados reais, canal externo, decisão real de negócio, contratação, envio ou deploy. Não declara reauditoria integral por requisito/papel nem encerra client-security/N8.

**Fatia 05 e N8/N9 abertos. Produção NO-GO. Sem commit/push/PR/deploy.**
