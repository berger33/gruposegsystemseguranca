# Fatia 05R — UX RH e painel administrativo

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch e HEAD/origin-main conferidos em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** mais dois runners sob supervisão POSIX, com provas locais. **43/68 adotados; 25 pendentes. Produção NO-GO.**

## 1. Contratos preservados

- `test:ux-hr:pg`: **20 testes**. Mantidos sessão/concessão efetiva distinta de papel no menu, retorno obrigatório de análise, rótulos/abas/teclado, confirmação explícita de desligamento, publicação de escala sem presumir ciência da pessoa, documentos sintéticos aprovados/rejeitados com motivo, fechamento sem pagamento e estados honestos de solicitações/ponto/documentos/folha, inclusive negativa fail-closed.
- `test:ux-adm:pg`: **12 testes**. Mantidos 401/403, leitura TI distinta de decisão Marcelo, motivo/chave/alçada, fonte/período/data-base do indicador, falha de fonte que não vira indicador zero, estados de carregamento/vazio/falha, abas/teclado, detalhamento contido, temas e viewports existentes.

Documentação histórica UX-04/UX-05 consultada para delimitar preservações, sem reimplementar telas já entregues. Nenhuma integração, API, página, schema, fixture, permissão, timeout interno ou asserção alterado. Falhas de interface permanecem injetadas somente no window.fetch do browser, sem enfraquecer servidor. SMTP/Ollama desativados; Chromium empacotado local, sem serviço AWS.

Mantidos filtros opcionais `UX_HR_TEST_PATTERN`/`UX_ADM_TEST_PATTERN`, --test-name-pattern e evidências opcionais herdadas. Ensaios completos com ambos os patterns vazios. Contrato legado de resultado por exit code/stdio herdado preservado, sem auditor TAP mínimo novo ou retry do gate. Uma execução filtrada não vale como cobertura integral.

Nenhuma decisão de negócio, ação real de RH, desligamento, publicação de folha real ou pagamento autorizado. Os testes não equivalem a homologação integral por requisito/papel, WCAG integral ou aceite humano.

## 2. Supervisor e budgets

Wrappers POSIX depois das guardas de URL/opt-in e antes de embedded-postgres. Pai libera handlers concorrentes da guarda; worker recebe sandbox/IPC, criação local limitada via helper e fases monotônicas. Resultado original confirmado e remoção pelo pai. Token genérico QA_PG_TEMP_CLEANED emitido pelo supervisor após confirmar remoção, sem duplicação pelo wrapper. Worker mantém remoção/token antigo só no caminho não supervisionado.

Preservados **UTF8 no RH** e **locale C + UTF8 no painel**. Helper compartilhado **inalterado**. Windows mantém lifecycle anterior e flags de initdb existentes, sem homologação nova.

| Perfil | RH | Painel |
|---|---:|---:|
| Migração | 90s | 90s |
| Fase test agregada | **900s** | **600s** |
| Soma dos limites do protocolo | 1140s | 840s |

Além das somas, margens limitadas de TERM/KILL/remoção existentes. Bootstrap até **120s** e todos os limites internos preservados. Baselines completos 90,82s/38,76s, carga 98,88s/63,57s; perfis com margem para as sequências de browser e fixtures, sem copiar perfil curto. Limite agregado não promete todos os máximos individuais simultaneamente nem espera infinita.

Não se introduziu política nova de remoção de diretórios Next/evidências nem isolamento global de gerados. Evidências opcionais não foram usadas para sobrescrever capturas históricas nesta etapa.

## 3. CI e inventários

Workflows existentes `ux-hr-delivery.yml` e `ux-adm-delivery.yml` preservados, incluindo typecheck, vocabulários, comandos reais, jobs de 30min/read-only/não cancelamento por concorrência. Adicionados unitários antes de PG, filtros de supervisor/guarda/focal/migrador e opt-in remoto/patterns explicitamente vazios.

**CI remoto não executado nem declarado verde.** Sem workflow ou arquivo fonte novo: **60 workflows / 1740 arquivos inventariados**. Índices oficiais regenerados/conferidos: **222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero; sem promoção de rota/classe/aceite.

## 4. Regressão e ensaios

Supervisor passa a **45 testes**, dois novos: contratos dos wrappers, import tardio/POSIX/handlers, fases/criação limitada/budgets, UTF8/locale, patterns, contagens 20/12 e browser; CI preservando typecheck/vocabulário, filtros/env e tempos de job. Guardas reais: **42 runners × 3 recusas + 3 recusas específicas = 129 execuções negativas**, sem cluster; piloto tenant separado. Focal inicial **45/45**, sem falhas mascaradas ou retirada de asserções.

### Jornadas completas

Tempos de parede do comando completo.

| Jornada | Antes | Depois isolado | Sob dois consumidores CPU |
|---|---:|---:|---:|
| RH | **20/20**, 90,82s | **20/20**, 77,39s | **20/20**, 98,88s |
| Painel | **12/12**, 38,76s | **12/12**, 35,61s | **12/12**, 63,57s |

Todos exit 0, zero falhas/skips/todos e limpos. Prova negativa PG sob CPU: exit 0 em **6,43s**, detectando duas falhas esperadas com exit 1 e limpeza (porta ocupada/cluster morto); não são clusters aprovados.

`npm test` depois das jornadas Next, ainda sob dois consumidores CPU: **1583/1583**, zero falhas/skips, exit 0, **90,80s**. Sequenciar não corrige a corrida global de gerados registrada na 05B. As regressões da correção de ordenação de operação da 05Q continuam na suíte, sem alteração nesta etapa.

### Seis cancelamentos com gatilhos confirmados

Sinais enviados só ao supervisor. Servidor/browser identificados por ancestralidade em /proc, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| RH | Banco pronto, TERM | **143** | 0,76s |
| RH | Servidor ativo, INT | **130** | 4,82s |
| RH | Chromium ativo, TERM | **143** | 10,33s |
| Painel | Banco pronto, TERM | **143** | 0,71s |
| Painel | Servidor ativo, INT | **130** | 5,03s |
| Painel | Chromium ativo, TERM | **143** | 11,19s |

Nos seis: sandbox observado do worker removido, limpeza confirmada e hashes de next-env.d.ts/tsconfig.json iguais aos de entrada. Processos observados não permaneceram ativos. Browser ativo não implica navegação/assertions concluídas. Playwright pode destacar sessões; estes ensaios não cobrem browser travado/escapado ou morte abrupta do supervisor.

### Finais

- Focal após status/plano/matriz: **158/158**, zero falhas/skips/todos, incluindo vocabulários RH/painel e regressões de operação, escopo/rotas fail-closed do cliente, SEC, inventários, guarda/higiene e package-artifacts.
- TypeScript/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices requisitos/rotas e git diff --check OK; gerados sem diff final.
- Sem PostgreSQL/server.mjs/next-server/Chromium/consumidores CPU ativos ou sandboxes supervisionados remanescentes na checagem final.

Logs/harness sintéticos não versionados em `/tmp/f05r-*`; resultados persistentes consolidados aqui.

## 5. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **68 originais / 43 adotados / 25 pendentes**. Prova negativa é 69º arquivo fora do denominador. Próximo grupo proposto **05S — UX frota e terceiros**, após inventário/baseline e preservando o gate EXT-02 herdado e as particularidades da frota.

Permanecem corrida global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, Windows/UAT e backup/restore real. Sem dados reais, provedor/envio externo, decisão real de negócio, WCAG integral ou aceite humano. Gate independente client-security/N8 não executado/encerrado nesta etapa.

**Fatia 05 e N8/N9 globais abertos. Produção NO-GO. Sem commit/push/PR/deploy.**
