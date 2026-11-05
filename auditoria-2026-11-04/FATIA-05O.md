# Fatia 05O — UX de cadastros centrais de clientes e contratos

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch e HEAD/origin-main conferidos em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** mais dois runners sob supervisão POSIX, com provas locais. **37/68 adotados; 31 pendentes. Produção NO-GO.**

## 1. Escopo e capacidades preservadas

- `test:ux-client-admin:pg`: **oito testes**, cadastros centrais em `/admin/clientes`, 401/403 reais, falha inicial distinta de carregamento, releitura preservando dados/hora/repetição, progresso com role=status, negativa descartando dados, seções dependentes, contraste medido e teclado em viewports 320/390/768/1440 dia/noite.
- `test:ux-contract:pg`: **18 testes**, lista/detalhe de contratos, menu não é autorização, diário restrito, respostas 2xx incompletas não apresentadas como vazio, leitura parcial, estados de releitura/negação, seis abas por teclado, vocabulário e viewports/temas existentes.

Documentação histórica dos estados foi lida para delimitar o recorte, sem reabrir implementações já entregues. Integrações, APIs, páginas, schema, fixtures, permissões, timeouts internos e asserções não foram alterados. Falhas continuam injetadas **somente em window.fetch na página**; servidor não foi enfraquecido. SMTP/Ollama desativados, Chromium empacotado local, sem serviço AWS.

Mantidos os filtros opcionais `UX_CLIENT_ADMIN_TEST_PATTERN`/`UX_CONTRACT_TEST_PATTERN`, flags --test-name-pattern e diretórios opcionais de evidência herdados. **Ensaios completos nesta etapa com ambos os filtros vazios.** Contrato legado por exit code/stdio herdado preservado, sem auditor TAP mínimo novo e sem retry. Uma execução focal filtrada não deve ser reinterpretada como cobertura integral; não se homologou cada pattern possível.

As medições automatizadas de contraste/teclado/viewport não representam WCAG integral, avaliação manual ou aceite humano global de UX.

## 2. Implementação e budgets

Wrappers POSIX depois das guardas de URL/opt-in, antes de embedded-postgres. Pai libera handlers concorrentes da guarda; worker recebe sandbox/IPC, criação local limitada pelo helper existente e fases monotônicas. Resultado original confirmado, remoção sob custódia do pai. Token genérico **QA_PG_TEMP_CLEANED** vem do supervisor somente após confirmação da remoção, sem duplicação pelo wrapper. Worker mantém limpeza/token antigo apenas no caminho não supervisionado.

**Helper compartilhado inalterado.** Windows preserva lifecycle anterior, sem homologação nova.

Clientes preserva `initdbFlags: --encoding=UTF8`, quatro sonames libpq/ICU, symlinks e LD_LIBRARY_PATH. Bootstrap nativo fica no worker, após guardas/wrapper e antes da importação dinâmica da biblioteca. Validação usa a instalação Linux disponível, não fresh install nem outras arquiteturas.

| Perfil | Clientes | Contratos |
|---|---:|---:|
| Migração | 90s | 90s |
| Fase test agregada | **600s** | **900s** |
| Soma dos limites do protocolo | 840s | 1140s |

Além das somas, margens limitadas de TERM/KILL/remoção já existentes. Bootstrap das duas suítes até **120s** preservado. Contratos também aquece três páginas com deadline individual **240s**, preservado; seu perfil maior considera dezoito testes de browser e aquecimento. Baselines completos 46,27s/82,44s e carga 62,44s/103,31s sustentam margem local. Limite agregado não promete permitir todos os máximos individuais simultaneamente nem espera infinita.

Não se introduziu política nova de remoção de diretórios Next/evidências nem se declarou isolamento global dos gerados. Capturas opcionais continuam opt-in; não foram usadas para sobrescrever evidência histórica nesta etapa.

## 3. CI e inventários

Workflows existentes `ux-client-admin-delivery.yml` e `ux-contract-delivery.yml` mantidos, incluindo typecheck, vocabulário de contratos, comandos reais, jobs de 40min/read-only/não cancelamento por concorrência. Acrescentados unitários antes de PG e filtros de supervisor/guarda/focal. Contratos também ganha filtro explícito do migrador já usado pelo runner. Opt-in remoto e pattern correspondente explicitamente vazios no CI, para executar jornada completa.

**CI remoto não executado nem declarado verde.** Não há workflow novo: **60 workflows / 1740 arquivos inventariados**. Índices oficiais regenerados/conferidos; **222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero; sem promoção de rota/classe/aceite.

## 4. Regressão acrescentada

Supervisor agora com **38 testes**, dois novos:

1. Wrappers, import tardio, guardas/POSIX/handlers, fases/criação limitada, budgets, resultado/limpeza, filtros focais preservados, contagens oito/18, browser/window.fetch, UTF8/sonames/LD e bootstrap/aquecimento preservados.
2. CI preservando typecheck/vocabulário, filtros/helper/migrador, unitários antes de PG e execução com patterns vazios/env local.

Guardas reais: **36 runners × 3 recusas + 3 recusas específicas = 111 execuções negativas**, sem cluster; piloto tenant separado. Focal inicial **38/38**, sem falhas mascaradas ou asserções removidas.

## 5. Provas reais

Tempos de parede do comando completo.

| Jornada | Antes | Depois isolado | Depois sob dois consumidores CPU |
|---|---:|---:|---:|
| Clientes admin | **8/8**, 46,27s | **8/8**, 44,03s | **8/8**, 62,44s |
| Contratos | **18/18**, 82,44s | **18/18**, 79,17s | **18/18**, 103,31s |

Todos exit 0, zero falhas/skips/todos, limpos. Prova negativa PG sob CPU: exit 0 em **6,41s**, detectando duas falhas esperadas com exit 1 e limpeza (porta ocupada/cluster morto); não são clusters aprovados.

`npm test` depois das jornadas Next, ainda sob dois consumidores CPU: **1573/1573**, zero falhas/skips, exit 0, **87,94s**. Sequenciar não corrige a corrida global de gerados registrada na 05B.

### Seis cancelamentos confirmados

Sinais só no supervisor; servidor/browser identificados por ancestralidade em /proc, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Clientes | Banco pronto, TERM | **143** | 1,01s |
| Clientes | Servidor ativo, INT | **130** | 5,36s |
| Clientes | Chromium ativo, TERM | **143** | 9,30s |
| Contratos | Banco pronto, TERM | **143** | 0,78s |
| Contratos | Servidor ativo, INT | **130** | 5,04s |
| Contratos | Chromium ativo, TERM | **143** | 12,54s |

Nos seis: sandbox observado do worker removido, limpeza confirmada e hashes de next-env.d.ts/tsconfig.json iguais aos de entrada. Servidor/browser observados não permaneceram ativos. Browser ativo não implica navegação/assertions concluídas. Playwright pode destacar sessões; não se provou contenção de browser travado/escapado, SIGKILL/OOM do supervisor ou filesystem/kernel travado.

### Finais

- Focal após status/plano/matriz: **99/99**, zero falhas/skips/todos, incluindo escopo/rotas fail-closed do cliente, SEC, inventários, guarda/higiene e package-artifacts.
- TypeScript/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices requisitos/rotas e git diff --check OK; gerados sem diff final.
- Sem PostgreSQL/server.mjs/next-server/Chromium/consumidores CPU ativos ou sandboxes supervisionados remanescentes na checagem final.

Logs/harness sintéticos não versionados em `/tmp/f05o-*`; resultados persistentes consolidados aqui.

## 6. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **68 originais / 37 adotados / 31 pendentes**. Prova negativa é 69º arquivo fora do denominador. Próximo grupo proposto **05P — UX CRM e financeiro**, após inventário de estados/permissões e baseline próprio.

Permanecem corrida global de gerados, sessões destacadas, morte abrupta do supervisor, demais jornadas, Windows/UAT e backup/restore real. Sem dados reais, provedor/envio externo, WCAG integral ou aceite humano. Gate independente client-security/N8 não executado/encerrado nesta etapa.

**Fatia 05 e N8/N9 globais abertos. Produção NO-GO. Sem commit/push/PR/deploy.**
