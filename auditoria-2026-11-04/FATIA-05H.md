# Fatia 05H — entrada administrativa e pendências operacionais

**Data:** 04/11/2026. **Branch:** `arena/a5202d09-gruposegsystemseguranca`. HEAD/origin-main conferidos após fetch em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Trabalho anterior preservado; sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** dois runners adicionais com wrapper POSIX e provas locais. Total **24/68**, **44 ainda não migrados**. Produção **NO-GO**.

## 1. Escopo e preservação

### Entrada administrativa

`qa-admin-entry-postgres.mjs` mantém o comando `test:admin-entry:pg`, migrações completas, HTTP real, login/navegação, papéis distintos, RBAC do painel, revogação de sessão, redirecionamento seguro e erros compreensíveis. A jornada Chromium real permanece, inclusive dia/noite/foco no erro de credencial e a compatibilidade local do pacote Chromium via `AWS_EXECUTION_ENV`.

O gate existente usa **exit code do subprocesso** como contrato de aprovação; não tinha auditor TAP com piso explícito e não foi documentado como se tivesse. As execuções desta etapa comprovaram os **14 casos**, sem skip. Não houve redução de cobertura, troca de browser por mock ou retry novo.

### Pendências

`qa-ops-pendencies-postgres.mjs` mantém o comando original **`test:pendencies:pg`**, configuração UTF-8, piso TAP **17**, rejeição de falha/skip/todo, DB obrigatório, autoria/destinatário/isolamento e provas de varredura, leitura, arquivamento e auditoria. Os testes continuam exigindo que nenhuma notificação externa seja enfileirada nem canal acionado.

Nenhuma API, página, permissão, schema ou arquivo de teste de integração foi alterado. Dados e sessões são sintéticos e descartáveis.

**Correção de execução/contagem:** a primeira tentativa usou o nome inexistente `test:ops-pendencies:pg`; foi corrigida para o comando já declarado, sem criar alias ou renomear capacidade. O TAP válido de baseline é **17/17**, não 18/18 como citado inicialmente no comentário de andamento; os testes não foram removidos. Baseline e resultados posteriores conferem com a mesma suíte de 17 casos.

## 2. Supervisor e budgets

Helper compartilhado não foi modificado. Wrappers POSIX depois das guardas, antes de importar embedded-postgres no worker, com sandbox/grupo próprios, criação limitada via Client IPv4, fases monotônicas e limpeza confirmada no pai. Worker não remove sandbox nem declara limpeza antecipadamente. Stop rejeitado é falha no caminho supervisionado; códigos de resultado originais são preservados.

- Migração: **90s** em ambos.
- Entrada: **600s** para a sequência multipágina/browser, considerando bootstrap existente de até 120s e várias esperas/navegações de 30–90s. Baseline ~66s e carga ~93s justificam margem própria; não é promessa de que todas as operações consumam seus máximos simultaneamente.
- Pendências: **180s**, conforme baseline ~11s e carga ~20s, sem browser nessa integração.
- Total do protocolo: **840s** entrada / **420s** pendências, além das margens de encerramento/remoção já documentadas.

Tokens históricos preservados. `QA_PENDENCY_PG_TEMP_CLEANED` é emitido no pai somente com `result.cleaned`. O token comum cobre o grupo/sandbox sob custódia, não processos que criem nova sessão. Windows mantém lifecycle anterior, sem homologação nova.

## 3. CI e índices

O workflow existente `admin-entry-delivery.yml` passou a acompanhar supervisor, guarda de gerados e focal nos filtros; steps e timeout de job de 30 minutos mantidos.

O comando de pendências não tinha chamador em workflows. Criado **`pendencies-delivery.yml`**, com filtros específicos, Node 22/npm ci, unitários antes da jornada, env local descartável, permissão `contents: read`, sem cancelamento por concorrência e teto de job de 25 minutos. Nome do comando preservado.

**CI remoto não executado/não declarado verde.** Não se encerra a cobertura CI global da fatia 06.

Índices regenerados pelos scripts oficiais: **1737 arquivos/222 IDs**, **12 a revalidar sem gate**, classes **27/124/71** inalteradas e aceite humano zero. São **57 workflows**. Matriz da rota de pendências ganha o novo chamador/job, sem criação/remoção de rota ou promoção de classe/aceite.

## 4. Regressão

Supervisor focal: **23 testes**, dois novos nesta etapa:

1. Contrato dos wrappers, budgets, fases, import tardio, criação limitada, resultado IPC, UTF-8, browser/env original, variável de DB de pendências, ligação CI e comando original.
2. Execução do auditor TAP original de pendências isoladamente, sem cluster: aceita resumo completo; recusa ausência/pass ausente, mínimo insuficiente, falha, skip e todo.

Guardas dos executáveis reais agora abrangem **23 runners**: 69 recusas de URLs/opt-in, mais três recusas específicas de CLI/migrador, total **72 execuções negativas** sem cluster. Nenhuma asserção foi removida/afrouxada.

## 5. Resultados

| Comando npm | Antes, exit 0 | Depois, isolado | Depois, sob carga |
|---|---:|---:|---:|
| `test:admin-entry:pg` | **14/14**, 65,62s | **14/14**, 54,51s | **14/14**, 92,53s |
| `test:pendencies:pg` | **17/17**, 10,90s | **17/17**, 10,46s | **17/17**, 19,66s |

Ambos exit 0, sem falhas/skips/todos e limpos. Tempos de parede do comando inteiro, não benchmark de produção.

Carga: dois consumidores CPU e até três comandos simultâneos, incluindo a prova negativa PG. Unitários executados **depois**, ainda sob CPU e sem jornadas Next ativas no mesmo checkout. Isso não é conserto da corrida de gerados da 05B.

- `npm test`: **1558/1558**, zero falhas/skips, exit 0, **84,77s** sob CPU.
- Prova negativa PostgreSQL real do supervisor: exit 0 em **7,67s**, duas falhas esperadas (porta ocupada/cluster morto) detectadas com exit 1 e limpeza confirmada.
- Focal inicial: **59/59**. Final ampliado com índices/guarda/higiene/package-artifacts: **79/79**, após reconciliação do status/plano.

### Cinco interrupções reais

| Executável/cenário | Resultado | Tempo desde início |
|---|---|---:|
| Entrada, SIGTERM após banco pronto | **143**, limpo | ~0,75s |
| Entrada, SIGINT após primeiro teste aprovado | **130**, limpo | ~9,00s |
| Pendências, SIGTERM após banco pronto | **143**, limpo | ~0,65s |
| Pendências, SIGINT após primeiro teste aprovado | **130**, limpo | ~6,32s |
| Entrada, SIGTERM com Chromium descendente ativo | **143**, limpo | ~12,20s |

Na prova de browser, `/proc` confirmou executável Chromium com ancestralidade até o supervisor daquela execução. O navegador observado não permaneceu ativo após a saída. Não se afirma que toda navegação já tivesse ocorrido nem que isso cubra Chromium/driver travado ou morte abrupta de seu processo responsável. Nenhum sinal foi enviado por nome de processo externo.

Hashes de `next-env.d.ts` e `tsconfig.json` iguais aos de entrada nos **cinco** casos.

### Complementares

TypeScript/build exit 0; wave0 **5/5**; SEC **35/35**; checks dos inventários de requisitos/rotas OK; `git diff --check` OK; gerados sem diff final. Checagem de processos/diretórios sem PostgreSQL, server.mjs, next-server, Chromium, consumidores CPU ou sandboxes supervisionados remanescentes dos ensaios. Logs sintéticos fora do Git em `/tmp/f05h-*`.

## 6. Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **24/68** wrappers POSIX com provas locais, **44 pendentes**. A prova negativa é um 69º arquivo fora do denominador. Próximo grupo proposto: **05I — L02/L03**, após baseline e análise de seus contratos, sem inferir resolução do N8.

Permanecem corrida global de gerados, sessões destacadas, SIGKILL/OOM do supervisor, kernel/filesystem travado, demais jornadas, demo persistente e backup/restore real. Token de limpeza não comprova custódia de toda árvore destacada. Sem homologação Windows, UAT, provedor real ou aceite humano.

**Fatia 05 e N8/N9 globais continuam abertos. Produção NO-GO.**
