# Fatia 05C — supervisor em licitações, fornecedores e qualidade

**Data:** 04/11/2026. **Branch:** `arena/a5202d09-gruposegsystemseguranca`. Referências atualizadas por fetch, sem trocar de branch ou sobrescrever trabalho anterior. Sem commit/push/PR/deploy.

**Resultado:** três runners adicionais supervisionados e validados em Linux/POSIX. Total **11/68** originais; **57 ainda não migrados**. Fatia 05 parcialmente entregue; produção **NO-GO**.

## Escopo implementado e preservado

- `scripts/qa-ext03-biddings-postgres.mjs`: jornada de licitações. Mínimo TAP **25**; diagnóstico de boot/isolamento distDir da fatia 03 preservados, sem alteração da integração/helper.
- `scripts/qa-ext04-suppliers-postgres.mjs`: jornada interna de fornecedores. Mínimo **28**; initdb com **UTF-8 e locale C** preservado.
- `scripts/qa-ext05-quality-postgres.mjs`: jornada interna de qualidade. Mínimo **35**; apenas o comentário incorreto sobre fornecedores/28 casos foi reconciliado com o contrato já existente.

Todos mantêm migrações 001–183, HTTP real, sessões/RBAC/fixtures existentes, variáveis de DB obrigatórias, recusa de URL do operador/opt-in remoto e rejeição de falha/skip/todo no resumo TAP. Nenhuma API, página, permissão, dado persistente, schema ou teste de integração foi alterado nesta etapa.

Reutilizados o supervisor e o helper de criação local da 05A **sem mudar sua implementação**. Wrapper POSIX depois das guardas e antes de importar embedded-postgres; o pai libera handlers de sinal da guarda de gerados, mantendo restore no exit. Worker usa sandbox/grupo próprios e fases initialise/start/create/migrate/test/stop/done. Criação via Client loopback IPv4 com timeouts de 5s e finally.

Perfil deste grupo: **migração 90s, testes 180s**, sustentado pelos tempos abaixo, sem copiar esse perfil para runners pesados. Demais prazos continuam os do helper compartilhado. Rejeição de stop torna o caminho supervisionado inválido. Worker não remove sandbox nem declara limpeza; pai emite token histórico somente com `result.cleaned` confirmado. Código de falha não vira sucesso por ter limpado.

**Windows:** caminho anterior preservado, não validado/homologado nesta etapa; sem alegar contenção POSIX naquela plataforma.

## Workflows e regressão

Os três workflows correspondentes passaram a acompanhar o helper do supervisor, a guarda de gerados e o focal. Rótulos de migrações antigos em fornecedores/qualidade foram reconciliados para 001–183. Steps, comandos nomeados e timeout do job permanecem. Os steps legados de `test:migrations:pg` continuam fora da adoção deste grupo — não se declara o workflow inteiro supervisionado. CI remoto não foi executado.

Em `tests/qa-pg-supervisor.test.mjs`, agora **15 testes**:

- Novo contrato dos três wrappers: importação, liberação dos handlers, ordem monotônica das fases, budgets, criação compartilhada, protocolos, mínimos/variáveis de DB, tokens condicionados à limpeza, filtros dos workflows e configuração UTF-8 de fornecedores.
- Novo teste dos três auditores TAP **reais**, avaliados isoladamente sem importar/subir cluster: resumo válido aceita; ausência de resumo/pass, mínimo insuficiente, falha, skip e todo recusam.
- Teste de guardas reais ampliado a **dez runners**: 30 recusas de URLs/opt-in, mais duas recusas específicas da CLI. Falha ocorre antes do worker/cluster, sem devolver URL sintética no erro.

Não foram desativadas asserções, introduzidos retries ou reduzidos mínimos de casos.

## Resultados

A instalação inicial estava ausente no workspace: primeiras tentativas retornaram dependência não encontrada. Depois de `npm ci` pelo lockfile (audit sem vulnerabilidades), foram feitos os baselines válidos abaixo. Isso não é falha da jornada nem resultado verde anterior à instalação.

| Comando npm | Antes, exit 0 | Depois, isolado | Depois, sob carga |
|---|---:|---:|---:|
| `test:ext03-biddings:pg` | 8,99s | **26/26**, 9,03s | **26/26**, 25,49s |
| `test:ext04-suppliers:pg` | 16,33s | **28/28**, 11,32s | **28/28**, 32,62s |
| `test:ext05-quality:pg` | 17,93s | **38/38**, 12,94s | **38/38**, 38,02s |

Todos exit 0, zero falhas/skips/todos, limpeza confirmada. Tempos de parede do comando completo; não são benchmarks de produção.

**Carga:** dois consumidores CPU e executor de até três comandos simultâneos para as jornadas e a prova negativa. A suíte unitária foi executada **em etapa separada**, ainda sob os mesmos dois consumidores CPU, após os gates terminarem. Não foi repetida a corrida unitário/Next da 05B e não se alega que ela foi corrigida.

- `npm test`: **1.550/1.550**, zero falhas/skips, exit 0, **89,08s** de parede sob CPU.
- Focal inicial supervisor + três contratos: **138/138**.
- Focal final incluindo guarda de gerados, higiene e inventário: **154/154**, após reconciliar plano/status.
- Gate negativo PG real: exit 0 em **9,63s** sob carga; porta ocupada e cluster morto produzem cada qual exit 1/timeout-stop esperado, ambos com limpeza confirmada. É detecção de falha, não aprovação do cluster defeituoso.

### Cancelamento real

Sinal enviado ao supervisor de cada executável, não remoção manual por nome de processo:

| Runner | SIGTERM após banco pronto | SIGINT após primeiro teste aprovado |
|---|---|---|
| Licitações | **143**, limpo, ~0,77s | **130**, limpo, ~6,47s |
| Fornecedores | **143**, limpo, ~0,72s | **130**, limpo, ~6,43s |
| Qualidade | **143**, limpo, ~0,74s | **130**, limpo, ~6,58s |

Os tempos são desde o início de cada executável. A segunda interrupção acontece com a suíte real em andamento; não prova todas as posições possíveis de cancelamento.

### Verificações complementares

TypeScript/build exit 0; wave0 **5/5**; SEC **35/35** âncoras; inventário `--check` OK com **1730 arquivos/222 IDs/12 a revalidar sem gate**. Nenhuma promoção de classe/aceite. `git diff --check` OK; `next-env.d.ts` e `tsconfig.json` sem diff final. Checagem de processos/diretórios não encontrou PostgreSQL, server.mjs, next-server, consumidores CPU ou sandboxes supervisionados remanescentes dos ensaios.

Logs brutos sintéticos ficam fora do Git, em `/tmp/f05c-*`; este documento registra os resultados, não credenciais ou dados reais.

## Continuidade

A [matriz de adoção](ADOCAO-POSTGRES.csv) lista **11/68** runners de jornada supervisionados em POSIX e os **57 pendentes**. O gate negativo é um 69º arquivo, fora desse denominador. A contagem não significa requisito aceito ou cobertura integral de produção.

Próximo grupo proposto: **05D — EXT-06/07/08**, após baseline e análise de particularidades. Demo persistente, restore/backup, browser e jornadas longas continuam separados. Orquestração global dos arquivos gerados segue resíduo técnico: unit/build/typecheck não devem competir com jornadas Next no mesmo checkout; sequenciar esses comandos não equivale a isolamento global resolvido.

Permanecem os limites da fatia 04: SIGKILL/OOM do supervisor, kernel/filesystem travado e descendente que se desanexe exigem contenção externa. Sem homologação Windows, UAT, aceite humano, provedor real ou operação em produção.

**Fatia 05 e N8/N9 globais continuam abertos. Produção NO-GO.**
