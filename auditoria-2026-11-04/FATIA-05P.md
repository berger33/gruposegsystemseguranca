# Fatia 05P — UX CRM e financeiro

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch e HEAD/origin-main conferidos em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** mais dois runners sob supervisão POSIX, com provas locais. **39/68 adotados; 29 pendentes. Produção NO-GO.**

## 1. Contratos preservados

- `test:ux-crm:pg`: **47 testes**, incluindo HTTP/RBAC/isolamento pessoal e superfícies de funil, carteira, fila, comercial e métricas. Mantidos foco, abas/ações por teclado, leitura inicial versus releitura, dados desatualizados com repetição/hora, negativas fail-closed, ausência de dados distinta de falha, temas e viewports existentes.
- `test:ux-finance:pg`: **46 testes**, incluindo sessão, menu não é autorização, TI read-only decidido pelo servidor, estados honestos de leitura, 16 abas por teclado, vocabulário/valores, falhas das áreas legadas, datas pt-BR preservando ISO no contrato JSON, consistência de carimbo entre fusos, alvos de toque e repetição funcional.

Documentação histórica de funil/carteira foi consultada para delimitar a preservação, sem reimplementar superfícies já entregues. Não foram editados integrações, APIs, páginas, schema, fixtures, papéis, permissões, timeouts internos ou asserções. Falhas de interface continuam injetadas somente no window.fetch da página, sem enfraquecer servidor. SMTP/Ollama desativados; Chromium empacotado local, sem serviço AWS.

Mantidos filtros opcionais `UX_CRM_TEST_PATTERN`/`UX_FINANCE_TEST_PATTERN`, --test-name-pattern, diretórios opcionais de evidência herdados e snapshot/restore próprio do CRM. **Todos os ensaios completos desta etapa usaram patterns vazios.** Não se reinterpretou execução filtrada como cobertura integral. Contrato de resultado legado por exit code/stdio herdado, sem auditor TAP mínimo novo e sem retry do gate.

Estes verdes não são aceite global de CRM/financeiro, validação de cada requisito por papel, WCAG integral ou avaliação manual de acessibilidade.

## 2. Supervisor e perfis medidos

Wrappers POSIX depois das guardas, antes de embedded-postgres. Pai libera handlers concorrentes da guarda; worker recebe sandbox/IPC, criação local limitada via helper e fases monotônicas. Resultado original confirmado e remoção sob custódia do pai. Token genérico QA_PG_TEMP_CLEANED é emitido pelo supervisor após confirmar remoção, sem duplicação pelo wrapper; worker conserva remoção/token antigo só no caminho não supervisionado.

**Helper compartilhado inalterado.** Windows mantém lifecycle anterior, sem homologação nova.

| Perfil | CRM | Financeiro |
|---|---:|---:|
| Migração | 90s | 90s |
| Fase test agregada | **1200s** | **900s** |
| Soma dos limites do protocolo | 1440s | 1140s |

Além das somas, margens limitadas de TERM/KILL/remoção existentes. Baselines completos **299,64s/232,99s**, depois sob CPU **404,55s/285,80s**. São suítes extensas, não jornadas curtas de um browser: budgets próprios, sem copiar perfil 180s. Bootstrap até **120s** e todos os limites internos preservados, inclusive teste financeiro de **420s** e outro de 240s. Limites agregados não prometem acomodar todos os máximos individuais simultaneamente nem espera infinita.

Não se introduziu remoção nova de diretórios Next/evidências ou isolamento global de gerados. Evidências opcionais não foram usadas para sobrescrever capturas históricas nesta etapa.

## 3. CI e índices

Workflows existentes `ux-crm-delivery.yml` e `ux-finance-delivery.yml` preservados, incluindo typecheck, testes de vocabulário e comandos reais, read-only e não cancelamento por concorrência. Adicionados unitários antes de PG, filtros de supervisor/guarda/focal/migrador e opt-in remoto/pattern explicitamente vazios.

Job CRM passa de **30 a 40min**, para acomodar protocolo 1440s mais instalação/typecheck/unitários/encerramento. Financeiro mantém **40min**, para protocolo 1140s e demais passos. Não se afrouxou teste para obter verde.

**CI remoto não executado nem declarado verde.** Sem workflow novo: **60 workflows / 1740 arquivos inventariados**. Índices oficiais regenerados/conferidos: **222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero; sem promoção de classe/rota/aceite.

## 4. Regressão nova

Supervisor passa a **40 testes**, dois novos:

1. Wrappers, import tardio/handlers/POSIX, fases/criação limitada, budgets distintos, resultado/limpeza, filters preservados, contagens 47/46, browser/window.fetch, bootstrap/timeout financeiro 420s e restore próprio CRM.
2. CI preservando typecheck/vocabulário, filtros/helper/migrador, unitários antes de PG, patterns vazios/env local, permissões e tempos de job.

Guardas reais ampliadas: **38 runners × 3 recusas + 3 recusas específicas = 117 execuções negativas**, sem cluster; piloto tenant separado. Focal inicial **40/40**, sem falhas mascaradas nem retirada de asserções.

## 5. Ensaios reais

Tempos de parede do comando completo.

| Jornada | Antes | Depois isolado | Depois sob dois consumidores CPU |
|---|---:|---:|---:|
| CRM | **47/47**, 299,64s | **47/47**, 274,34s | **47/47**, 404,55s |
| Financeiro | **46/46**, 232,99s | **46/46**, 230,94s | **46/46**, 285,80s |

Todos exit 0, zero falhas/skips/todos e limpos. Prova negativa PG sob CPU: exit 0 em **6,77s**, detectando duas falhas esperadas com exit 1 e limpeza (porta ocupada/cluster morto), não clusters aprovados.

`npm test` depois das jornadas Next, ainda sob dois consumidores CPU: **1575/1575**, zero falhas/skips, exit 0, **91,50s**. Sequenciar não corrige a corrida global de gerados registrada na 05B.

### Seis cancelamentos com gatilhos confirmados

Sinais enviados só ao supervisor. Servidor/browser identificados por ancestralidade em /proc, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| CRM | Banco pronto, TERM | **143** | 0,79s |
| CRM | Servidor ativo, INT | **130** | 5,87s |
| CRM | Chromium ativo, TERM | **143** | 9,70s |
| Financeiro | Banco pronto, TERM | **143** | 0,82s |
| Financeiro | Servidor ativo, INT | **130** | 5,39s |
| Financeiro | Chromium ativo, TERM | **143** | 11,83s |

Nos seis: sandbox observado do worker removido, limpeza confirmada e hashes de next-env.d.ts/tsconfig.json iguais aos de entrada. Servidor/browser observados não permaneceram ativos. Browser ativo não implica navegação/assertions concluídas. Playwright pode destacar sessões; estes ensaios não cobrem browser travado/escapado ou morte abrupta do supervisor.

### Finais

- Focal após status/plano/matriz: **101/101**, zero falhas/skips/todos, incluindo escopo/rotas fail-closed do cliente, SEC, inventários, guarda/higiene e package-artifacts.
- TypeScript/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices requisitos/rotas e git diff --check OK; gerados sem diff final.
- Sem PostgreSQL/server.mjs/next-server/Chromium/consumidores CPU ativos ou sandboxes supervisionados remanescentes na checagem final.

Logs/harness sintéticos não versionados em `/tmp/f05p-*`; resultados persistentes consolidados aqui.

## 6. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **68 originais / 39 adotados / 29 pendentes**. Prova negativa é 69º arquivo fora do denominador. Próximo grupo proposto **05Q — UX operação e patrimônio**, após inventário/contratos e baseline próprios.

Permanecem corrida global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, Windows/UAT e backup/restore real. Sem dados reais, provedor/envio externo, cobrança/emissão real, WCAG integral ou aceite humano. Gate independente client-security/N8 não executado/encerrado nesta etapa.

**Fatia 05 e N8/N9 globais abertos. Produção NO-GO. Sem commit/push/PR/deploy.**
