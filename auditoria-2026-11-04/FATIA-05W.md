# Fatia 05W — UX inteligência comercial e analytics

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch de main confirmado; HEAD/origin-main `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado. Sem commit/push/PR/deploy.

**Entrega parcial da fatia 05: 53/68 runners adotados; 15 pendentes. Produção NO-GO.**

## 1. Contratos inventariados e preservados

Lidos AGENTS, README, status/plano/matriz, runners, integrações/workflows e documentos históricos UX-07 de inteligência comercial/analytics.

- **Inteligência `/admin/inteligencia`: 18 testes.** O comando UX executa **tests/ext14-intel.integration.test.mjs**, incluindo browser no mesmo processo/sessão autenticada. Preservados banco obrigatório, cluster limpo, RBAC granular fail-closed, origem/chave, validações de fonte/janela/justificativa, protocolo/autoria, replay/conflito, evidência contada anterior à aprovação, lead/histórico interno por HTTP, conferência SQL, identidade/justificativa de aprovação sintética, contato interno apenas após aprovação, concorrência/idempotência, append-only, auditoria/rollback, legado 410 e browser com h1 real/falha honesta/abas. `tests/ux-intel-workspace.integration.test.mjs` é contrato estático dessa ligação, **não outro browser gate**; mantido e reexecutado no focal.
- **Analytics `/admin/analytics`: 10 testes.** Sessão/origem/chave; menu distinto de autorização por analytics.approve/read; negativa sem vazamento; negado/falha/vazio distintos sem métrica zero; quatro abas/teclado; português; ausência honesta de aprovação/observação; 390px; região rolável E5 acessível por Tab; aprovação exige e registra justificativa escrita pela pessoa operadora sintética.

**Integrações, APIs, telas, schema, fixtures e permissões inalterados.** Não se atribuiu aprovação humana real, contato externo, conversão comercial ou experimento real. Falhas de browser restritas ao window.fetch; dados fictícios. Registro de aprovação nos testes é execução sintética do contrato, não aceite de produto.

Gates independentes reexecutados sem edição: **EXT-14 18/18** (mínimo 16) e **EXT-11 18/18** (mínimo 16), zero fail/skip/todo e limpeza confirmada. EXT-14 usa a mesma integração do UX intel: não contar como duas jornadas independentes. Workflows mantêm comandos anteriores; não foram acrescentadas chamadas PG herdadas.

## 2. Migração dos runners

`scripts/qa-ux-intel-postgres.mjs` e `scripts/qa-ux-analytics-postgres.mjs`: wrapper POSIX após recusas de URL/opt-in e antes do import de embedded-postgres/efeitos nativos. Pai libera handlers concorrentes da guarda; worker recebe sandbox/TMP/IPC, criação local limitada e fases monotônicas. Pai confirma término/remoção antes do token genérico de limpeza.

**Helper compartilhado inalterado.** Windows conserva caminho anterior, sem nova homologação. Mantidos LD_LIBRARY_PATH/symlinks, flags nativas e **UTF8 + locale C de analytics**, heap/flags originais de cada subprocesso. Intel não ganhou heap 1024MB nem filtro de nome que não tinha. Analytics mantém pattern e evidências opcionais, ensaios completos com pattern vazio/sem diretório opcional de capturas.

Particularidades de intel:

- Preservada a integração EXT-14 real, QA_EXT14_REQUIRE_DB=1 e recuperação herdada de launch/sessão. O código vigente **lança ERR_ASSERTION imediatamente**, apesar da frase histórica imprecisa no documento antigo; não foi alterado para repetir assertions.
- Snapshot/restauração de gerados **no pai em finally**, como já usado no gate EXT-14 independente. Protege restauração ao cancelar a árvore; não isola o checkout durante execução nem corrige a corrida global.
- Marca redigida QA_PG_READY adicionada para observação do banco pronto, sem segredo.
- Parada rejeitada agora reprova no caminho supervisionado e registra erro redigido; legado fora da supervisão continua tolerando stop/rm como antes. Token legado não prova limpeza em Windows. Token genérico POSIX só depois da remoção confirmada. Restauração de gerados é distinta de limpeza/sucesso.

Ambos mantêm resultado por exit code/stdio, **sem auditor TAP mínimo novo no wrapper UX**. Auditor dos gates independentes EXT-14/11 permanece próprio e inalterado. Nenhum retry novo de gate ou relaxamento de asserção/timeout.

Budgets: migrate **90s** em ambos; test agregado **300s intel / 900s analytics** (intel usa perfil já medido do EXT-14). Somas do protocolo **540s / 1140s**, além das margens limitadas de TERM/KILL/remoção existentes e restauração de gerados em intel. Preservados laço/fetch/timeout browser de **90s** de EXT-14 e bootstrap **180s**/compilação **240s por rota** de analytics. Margens sobre medições e sequências existentes não garantem todos os máximos individuais simultâneos.

Sem política nova de remoção de Next/evidências. SMTP/Ollama desativados; Chromium local, sem provedor externo/AWS operacional.

## 3. CI e regressão

Workflows existentes: adicionados filtros supervisor/guarda/focal/migrador (e helper de gerados para intel), unitários antes de PG, opt-in remoto vazio e pattern analytics vazio. Mantidos typecheck, vocabulários, teste EXT-11, caminhos existentes de API/server/migrações/CSS, jobs **40min**, contents read e não cancelamento. **CI remoto não executado.**

Supervisor **56/56**, dois testes novos: perfis/import tardio/IPC/criação/nativo/resultado e jornadas distintas; CI com comandos reais. Guardas reais ampliadas: **52 × 3 recusas + 3 específicas = 159 execuções negativas**, sem cluster; piloto tenant separado.

## 4. Provas

Tempos de parede do comando completo. Nos seis, exit 0, zero fail/skip/todo, limpeza confirmada e sem logs de retry de browser observados.

| Jornada | Antes | Pós isolado | Sob dois consumidores CPU |
|---|---:|---:|---:|
| Intel | **18/18**, 17,88s | **18/18**, 18,73s | **18/18**, 30,48s |
| Analytics | **10/10**, 42,59s | **10/10**, 43,96s | **10/10**, 71,86s |

- Negativo PG sob CPU: overall exit 0 em **6,43s**, reconhecendo duas falhas esperadas exit 1 com limpeza (porta ocupada/cluster morto). Não são clusters aprovados.
- `npm test` depois das jornadas Next, ainda sob dois consumidores CPU: **1594/1594**, zero fail/skip/todo, exit 0, **92,80s**. Sequenciar não resolve a corrida global de gerados registrada na 05B.
- EXT-14 **18/18**, **16,10s**; EXT-11 **18/18**, **8,33s**.

### Seis cancelamentos reais

Sinal único só ao supervisor após gatilho confirmado; árvore por ancestralidade /proc e sandbox identificado no worker, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Intel | Banco pronto / TERM | **143** | 0,86s |
| Intel | Servidor ativo / INT | **130** | 5,17s |
| Intel | Chromium ativo / TERM | **143** | 10,06s |
| Analytics | Banco pronto / TERM | **143** | 0,84s |
| Analytics | Servidor ativo / INT | **130** | 5,80s |
| Analytics | Chromium ativo / TERM | **143** | 19,68s |

Nos seis: sandbox removido, limpeza confirmada, hashes next-env.d.ts/tsconfig.json iguais aos de entrada e nenhum descendente observado ativo. Browser ativo não significa navegação/assertions concluídas; sessões destacadas do Playwright, browser travado/escapado e morte abrupta do supervisor continuam fora desta prova.

### Complementares

- Focal final de 13 arquivos **151/151**, zero fail/skip/todo: supervisor, vocabulários, contrato de ligação UX intel/EXT-14, EXT-14/11 unitários, cliente fail-closed, SEC, índices, higiene e package-artifacts.
- Typecheck/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices oficiais regenerados/conferidos: **60 workflows / 1740 arquivos / 222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero; sem promoção por adoção de wrapper.
- Gerados sem diff; higiene e processos/sandboxes conferidos no fechamento.

Logs/harness sintéticos `/tmp/f05w-*` fora do versionamento; resultados persistentes consolidados aqui.

## 5. Continuidade e limites

[Matriz](ADOCAO-POSTGRES.csv): **53/68 adotados; 15 pendentes**. Negativo PG é 69º arquivo fora do denominador. Próximo grupo proposto **05X — UX expansão e continuidade (equipe)**, após inventário/baseline preservando gates herdados e fronteiras de cliente.

Permanecem isolamento global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, CI remoto, Windows/UAT/WCAG manual e restore real. Sem reauditoria integral por requisito/papel ou fechamento client-security/N8.

**Fatia 05 e N8/N9 abertos. Produção NO-GO. Sem commit/push/PR/deploy, dados reais, contratação ou envio externo.**
