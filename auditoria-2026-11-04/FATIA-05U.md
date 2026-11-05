# Fatia 05U — UX qualidade e satisfação

**Data:** 04/11/2026. Branch `arena/a5202d09-gruposegsystemseguranca`. Fetch de main confirmado; HEAD/origin-main `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado. Sem commit/push/PR/deploy.

**Entrega parcial da fatia 05: 49/68 runners adotados; 19 pendentes. Produção NO-GO.**

## 1. Inventário e contratos preservados

Lidos AGENTS, README, status/plano/matriz, runners, integrações/workflows e documentos históricos UX-07 de qualidade/satisfação. Nenhuma capacidade já entregue foi reimplementada ou reduzida.

- **Qualidade `/admin/qualidade`: 11 testes.** Sessão, origem e chave; menu distinto de autorização efetiva (revogações de quality.write e quality.read, 403 sem vazar registro); 2xx inválido não vira lista vazia; releitura preserva lista/hora; negativa após sucesso descarta NC protegida; negado/falha/vazio distintos, sem métrica zero inventada; quatro abas/teclado; português; ausência honesta de causa/ação/verificação e 390px.
- **Satisfação `/admin/satisfacao`: 12 testes.** Sessão/papel/origem/chave; leitura legada viva e escrita 410; transições com note/result/justification corretos e recusa sem mudar estado; resposta inválida/releitura/negativa fail-closed; falha não vira vazio/indicador zero; referências independentes da lista; quatro abas/teclado; português/ausência honesta; texto de quem opera e chave preservada na recusa; 390px. Autorização da equipe por sessão/papel/origem distinta da concessão ativa de acesso do cliente na conta.

**Integrações, APIs, telas, schema, fixtures e permissões inalterados nesta etapa.** Massa fictícia existente, falhas de interface injetadas apenas no window.fetch. Preservadas referências documentais sem representar upload, fronteiras de indicador sem respostas e registros canônicos. Nenhuma pesquisa enviada a cliente real, ação corretiva, conclusão de acompanhamento ou decisão de negócio real autorizada.

Gates independentes reexecutados sem edição: **EXT-05 38/38** (mínimo 35) e **EXT-06 36/36** (mínimo 35), zero fail/skip/todo e limpeza confirmada. Testes unitários EXT-05/06 e portal CLI-11 preservados nos workflows; não se acrescentou chamada PG herdada onde ela não existia.

## 2. Mudança limitada aos runners e CI

`scripts/qa-ux-quality-postgres.mjs` e `scripts/qa-ux-satisfaction-postgres.mjs`: wrapper POSIX após guardas de URL/opt-in, antes do import de embedded-postgres/efeitos nativos. Pai libera handlers concorrentes da guarda; worker recebe sandbox/TMP/IPC, criação local limitada e fases monotônicas. Pai confirma término e remoção antes de emitir token genérico de limpeza; remoção/token antigos só no caminho não supervisionado.

**Helper compartilhado inalterado.** Windows mantém caminho anterior, sem nova homologação. Preservados LD_LIBRARY_PATH/symlinks, flags nativas originais, heap 1024MB, Chromium local/flags, patterns opcionais e evidências opcionais. Ensaios integrais com patterns vazios e sem diretório opcional de capturas; SMTP/Ollama desligados. Sem serviço AWS ou provedor externo operacional.

Ambos mantêm stdio/exit code herdados: **sem auditor TAP mínimo novo**. Pattern pode selecionar subconjunto e não equivale a jornada integral. Mantida recuperação de crash de browser existente, sem retry novo de gate e sem relaxar ERR_ASSERTION.

Budgets em ambos: migrate **90s**, test agregado **900s**, soma do protocolo **1140s**, além das margens limitadas de TERM/KILL/remoção existentes. Mantidos bootstrap **180s**, compilação **240s por rota** e limites internos originais. Margem sobre baselines/carga e sequência de browser, não promessa de todos os máximos internos simultâneos. Nenhuma política nova de remoção de Next/evidências ou isolamento global de gerados.

Workflows existentes `ux-quality-delivery.yml` e `ux-satisfaction-delivery.yml`: filtros supervisor/guarda/focal/migrador, unitários antes de PG e patterns/opt-in remoto vazios adicionados. Typecheck, vocabulários, testes herdados e CLI-11, jobs **40min**, contents read e não cancelamento por concorrência preservados. **CI remoto não executado.**

## 3. Regressão e ensaios

Supervisor **52/52**: dois testes novos de contratos dos wrappers, fases/limites/criação/import tardio, padrões/contagens/resultado/nativo/browser e CI. Guardas reais ampliadas: **48 × 3 recusas + 3 específicas = 147 execuções negativas**, sem cluster; piloto tenant separado.

Tempos de parede do comando completo:

| Jornada | Antes | Pós isolado | Sob dois consumidores CPU |
|---|---:|---:|---:|
| Qualidade | **11/11**, 42,41s | **11/11**, 39,85s | **11/11**, 64,32s |
| Satisfação | **12/12**, 44,41s | **12/12**, 42,04s | **12/12**, 68,51s |

Nos seis: exit 0, zero falhas/skips/todos, patterns vazios, limpeza confirmada; sem BROWSER_RETRY observado.

- Negativo PG sob CPU: overall exit 0 em **6,41s**, detectando duas falhas esperadas exit 1 com limpeza (porta ocupada/cluster morto). Não são clusters aprovados.
- `npm test` após jornadas Next, ainda sob dois consumidores CPU: **1590/1590**, zero fail/skip/todo, exit 0, **87,42s**. Sequenciar não resolve a corrida global de gerados registrada na 05B.
- EXT-05 **38/38**, **18,14s**; EXT-06 **36/36**, **17,05s**.

### Cancelamentos reais

Sinal único somente ao supervisor depois do gatilho confirmado; árvore observada por ancestralidade /proc e sandbox identificado no worker. Sem encerrar processos externos por nome.

| Runner | Gatilho/sinal | Saída | Tempo desde início |
|---|---|---:|---:|
| Qualidade | Banco pronto / TERM | **143** | 0,83s |
| Qualidade | Servidor ativo / INT | **130** | 5,73s |
| Qualidade | Chromium ativo / TERM | **143** | 20,40s |
| Satisfação | Banco pronto / TERM | **143** | 0,82s |
| Satisfação | Servidor ativo / INT | **130** | 5,65s |
| Satisfação | Chromium ativo / TERM | **143** | 20,32s |

Nos seis: sandbox removido, limpeza confirmada, hashes next-env.d.ts/tsconfig.json iguais aos de entrada, nenhum descendente observado ativo. Browser ativo não significa navegação/assertions concluídas; sessões destacadas do Playwright, browser travado/escapado e morte abrupta do supervisor continuam fora desta prova.

### Complementares e índices

- Focal final de 13 arquivos: **156/156**, zero fail/skip/todo; supervisor, vocabulários, EXT-05/06 e CLI-11 unitários, cliente fail-closed, SEC, índices, higiene e package-artifacts.
- Typecheck/build exit 0; SEC **35/35 âncoras**, wave0 **5/5**, sem equivaler a pentest.
- Índices oficiais regenerados/conferidos: **60 workflows / 1740 arquivos / 222 IDs / 12 a revalidar sem gate**, classes **27/124/71**, aceite humano zero. Sem promoção de classe/rota por mera adoção de wrapper.
- Gerados sem diff; higiene e processos/sandboxes conferidos no fechamento.

Logs/harness sintéticos `/tmp/f05u-*` fora do versionamento; resultados persistentes consolidados aqui.

## 4. Continuidade e limites

[Matriz](ADOCAO-POSTGRES.csv): **49/68 adotados; 19 pendentes**. Prova negativa é 69º arquivo, fora do denominador. Próximo grupo proposto **05V — UX compliance e conhecimento**, após inventário/baseline preservando gates herdados.

Permanecem isolamento global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, filesystem/kernel travado, demais jornadas, CI remoto, Windows/UAT/WCAG manual e restore real. Não declara volume real, homologação integral por requisito/papel ou fechamento client-security/N8.

**Fatia 05 e N8/N9 abertos. Produção NO-GO. Sem commit/push/PR/deploy, dados reais, contratação ou envio externo.**
