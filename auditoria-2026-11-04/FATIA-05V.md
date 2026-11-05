# Fatia 05V — UX compliance e conhecimento

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch de main confirmado; HEAD/origin-main `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado. Sem commit/push/PR/deploy.

**Entrega parcial da fatia 05: 51/68 runners adotados; 17 pendentes. Produção NO-GO.**

## 1. Contratos e preservações

Lidos AGENTS, README, status/plano/matriz, runners, integrações/workflows e documentos históricos UX-07 de compliance/conhecimento. Não se reimplementaram capacidades já entregues.

- **Compliance `/admin/compliance`: 11 testes.** Sessão/origem/chave e legado leitura/410; menu distinto de autorização do servidor (admin/ti aceitos, Marcelo recusado com forbidden sem vazar dado); 2xx inválido não vira vazio; releitura preserva dados/hora; negativa após sucesso descarta obrigação protegida; negado/falha/vazio distintos, sem indicador zero inventado; cinco abas/teclado; português; ausência honesta no plano e vazio honesto da execução agendada; 390px.
- **Conhecimento `/admin/conhecimento`: 11 testes.** Sessão/negativa sem lista; financeiro pode ler POP publicado mas é recusado na métrica protegida de ciência; falha em ciência não apaga detalhe/histórico; abas/roving tabindex/teclado; estados reais traduzidos/ausência sem data inventada; 390px; resposta inválida/releitura com hora/negativa fail-closed; medições 320/390/768/1440, dia/noite e teclado; contraste noturno focal E8. Não é WCAG integral nem aceite humano de POP.

**Integrações, APIs, telas, schema, fixtures, scheduler e permissões inalterados nesta etapa.** Massa fictícia existente; falhas de interface restritas ao window.fetch. Versionamento/histórico/ciência por versão e fronteiras canônicas mantidos, sem publicação real de POP, ciência humana atribuída ou decisão operacional de compliance autorizada.

Gates independentes reexecutados sem edição: **EXT-07 50/50** (mínimo 47) e **EXT-08 15/15** (mínimo 15), zero fail/skip/todo e limpeza confirmada. Workflows continuam com unitários herdados e scheduler de compliance, sem acrescentar chamadas PG herdadas onde não existiam.

## 2. Mudança dos runners

`scripts/qa-ux-compliance-postgres.mjs` e `scripts/qa-ux-knowledge-postgres.mjs`: wrapper POSIX depois das guardas de URL/opt-in e antes do import de embedded-postgres/efeitos nativos. Pai libera handlers concorrentes; worker recebe sandbox/TMP/IPC, criação local limitada e fases monotônicas. Pai confirma término/remoção antes do token genérico de limpeza.

**Helper compartilhado inalterado.** Windows conserva lifecycle anterior, sem nova homologação. Preservados LD_LIBRARY_PATH/symlinks, heap 1024MB, flags nativas originais, **UTF8 + locale C de conhecimento**, Chromium local e limites internos.

Particularidades preservadas:

- Compliance mantém pattern opcional `UX_COMPLIANCE_TEST_PATTERN`, evidências opcionais e recuperação de crash do browser herdada; ERR_ASSERTION continua lançado imediatamente.
- Conhecimento **não tinha filtro de nome no runner e não ganhou um**. Mantidos executável opcional de browser e tentativas herdadas de launch (não retry novo de sessão/gate), evidências UX_KNOWLEDGE/UX_E8 e chamada do subprocesso por assinatura run(args, env).
- Ambos mantêm resultado por exit code/stdio herdado, **sem auditor TAP mínimo novo**. Ensaios completos, pattern de compliance vazio; filtro não equivale a jornada integral.
- Remoção/tokens antigos somente no caminho não supervisionado; POSIX agora depende da remoção confirmada pelo pai. Conhecimento conserva o rm.catch legado fora da supervisão; o token legado não é prova de remoção em Windows. O token genérico POSIX é emitido após verificação, sem duplicação pelo worker.

Budgets em ambos: migrate **90s**, test agregado **900s**, soma do protocolo **1140s**, além das margens limitadas de TERM/KILL/remoção existentes. Bootstrap **180s**, compilação **240s** e limites internos originais preservados. Margem para sequência de browser/medições, não garantia de todos os máximos internos simultâneos. Sem política nova de remoção de Next/evidências ou isolamento global de gerados.

SMTP/Ollama desativados; sem provedor externo/AWS operacional. Diretórios opcionais de evidências não utilizados nestes ensaios.

## 3. CI e regressões

Workflows existentes reforçados com filtros supervisor/guarda/focal/migrador, unitários antes de PG e opt-in remoto vazio; pattern de compliance vazio. Mantidos typecheck, vocabulários, testes herdados, scheduler, filtros existentes de CSS/documentação de conhecimento, jobs **40min**, contents read e não cancelamento por concorrência. **CI remoto não executado.**

Supervisor **54/54**, dois testes novos para contratos dos wrappers/limites/criação/IPC/resultado/nativo/contagens e CI. Guardas reais ampliadas: **50 × 3 recusas + 3 específicas = 153 execuções negativas**, sem cluster; piloto tenant separado.

## 4. Ensaios

Tempos de parede do comando completo; nos seis, exit 0, zero falhas/skips/todos, limpeza confirmada e sem BROWSER_RETRY observado.

| Jornada | Antes | Pós isolado | Sob dois consumidores CPU |
|---|---:|---:|---:|
| Compliance | **11/11**, 44,47s | **11/11**, 38,58s | **11/11**, 66,93s |
| Conhecimento | **11/11**, 44,70s | **11/11**, 44,15s | **11/11**, 62,60s |

- Negativo PG sob CPU: overall exit 0 em **6,19s**, reconhecendo duas falhas esperadas exit 1 com limpeza (porta ocupada/cluster morto). Não são clusters aprovados.
- `npm test` após jornadas Next, ainda sob dois consumidores CPU: **1592/1592**, zero fail/skip/todo, exit 0, **93,27s**. Sequenciar não resolve a corrida global de gerados registrada na 05B.
- EXT-07 **50/50**, **31,97s**; EXT-08 **15/15**, **14,60s**.

### Seis cancelamentos reais

Sinal único só ao supervisor após gatilho confirmado; árvore por ancestralidade /proc e sandbox identificado no worker, sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Compliance | Banco pronto / TERM | **143** | 0,88s |
| Compliance | Servidor ativo / INT | **130** | 5,16s |
| Compliance | Chromium ativo / TERM | **143** | 19,49s |
| Conhecimento | Banco pronto / TERM | **143** | 0,78s |
| Conhecimento | Servidor ativo / INT | **130** | 5,37s |
| Conhecimento | Chromium ativo / TERM | **143** | 15,84s |

Nos seis: sandbox removido, token de limpeza confirmado, hashes next-env.d.ts/tsconfig.json iguais aos de entrada, nenhum descendente observado ativo. Browser ativo não significa navegação/assertions concluídas. Sessões destacadas do Playwright, browser travado/escapado e morte abrupta do supervisor continuam fora desta prova.

### Complementares

- Focal final de 13 arquivos **180/180**, zero fail/skip/todo; supervisor, vocabulários, EXT-07/08/scheduler unitários, cliente fail-closed, SEC, índices, higiene e package-artifacts.
- Typecheck/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices oficiais regenerados/conferidos: **60 workflows / 1740 arquivos / 222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero; sem promoção por adoção de wrapper.
- Gerados sem diff; higiene e processos/sandboxes conferidos no fechamento.

Logs/harness sintéticos `/tmp/f05v-*` fora do versionamento; resultados persistentes consolidados aqui.

## 5. Continuidade e limites

[Matriz](ADOCAO-POSTGRES.csv): **51/68 adotados; 17 pendentes**. Negativo PG é 69º arquivo fora do denominador. Próximo grupo proposto **05W — UX inteligência comercial e analytics**, após inventário/baseline preservando gates herdados.

Permanecem isolamento global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, CI remoto, Windows/UAT/WCAG manual e restore real. Não declara volume real, reauditoria integral por requisito/papel ou fechamento client-security/N8.

**Fatia 05 e N8/N9 abertos. Produção NO-GO. Sem commit/push/PR/deploy, dados reais, contratação ou envio externo.**
