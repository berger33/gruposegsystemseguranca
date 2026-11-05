# Fatia 05E — expansão, continuidade e analytics

**Data:** 04/11/2026. **Branch:** `arena/a5202d09-gruposegsystemseguranca`. HEAD/origin-main conferidos após fetch em `0e6456e9d01b825a3bff4997f92506ac4ff1c633`. Alterações anteriores preservadas; sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** três runners adicionais com wrapper supervisionado em Linux/POSIX e provas locais. Total **17/68**; **51 ainda não migrados**. Produção **NO-GO**.

## 1. Escopo e preservação

| Runner | Jornada preservada | Mínimo TAP | Prazo de teste |
|---|---|---:|---:|
| `qa-ext09-expansion-postgres.mjs` | Expansão, capacidade, cenários financeiros, RBAC e auditoria | 16 | 180s |
| `qa-ext10-continuity-postgres.mjs` | Continuidade, isolamento por conta, portal somente leitura, Chromium e reinício HTTP | 31 | **300s** |
| `qa-ext11-analytics-postgres.mjs` | Experimentos, aprovações, observações e minimização | 16 | 180s |

Todos preservam migrações 001–183, HTTP real, sessões sintéticas, fixtures, guardas de URL/opt-in remoto, banco exclusivo loopback e rejeição de falha/skip/todo. Nenhuma API, rota, permissão, schema ou teste de integração foi alterado.

Continuidade recebeu perfil próprio: além de chamadas HTTP, extrai/inicia Chromium, navega pela UI real e reinicia o servidor para testar persistência. Mantido `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x` no ambiente específico da integração, necessário às bibliotecas do Chromium empacotado. Não foi substituído browser por mock nem removida a etapa de reinício. O perfil de 300s considera essa sequência e os baselines; não é garantia de que todas as operações possam consumir seus limites internos máximos simultaneamente.

Migração separada: **90s** nos três. Outros prazos permanecem os do helper; total do protocolo **540s** para continuidade e **420s** para expansão/analytics, além das margens de encerramento/remoção já documentadas. Comentários de ledger antigos foram reconciliados para 001–183, sem alterar migrações.

## 2. Implementação e fronteira de contenção

Reutilizados supervisor e criação limitada, sem modificar o helper compartilhado nesta etapa:

- Wrapper POSIX depois das guardas e antes do import dinâmico de embedded-postgres; pai libera handlers de sinal da guarda de gerados, mantendo restore no exit.
- Worker usa sandbox e grupo próprios, fases monotônicas e criação via Client IPv4 com prazos de 5s/finally.
- Resultados originais preservados, inclusive `exitCode` de continuidade/analytics. Stop rejeitado é falha no caminho supervisionado.
- Worker não remove sandbox nem declara limpeza; pai emite token legado somente com `result.cleaned` verdadeiro. Limpeza não converte reprovação em sucesso.
- Windows mantém caminho anterior, sem homologação nova.

**Fronteira de browser:** Playwright pode criar processos destacados em outro grupo/sessão. O supervisor não passou a assumir custódia genérica desses grupos. O token de limpeza confirma seu grupo e sandbox, **não atesta sozinho toda árvore Chromium**. A prova adicional abaixo verificou o encerramento normal observado com browser ativo; não cobre Playwright/Chromium travado, morte abrupta do processo que fecha o browser ou descendente que escape ao grupo. Essa contenção continua dependente de fronteira externa e não foi marcada como resolvida.

## 3. CI e inventários

- Expansão já era chamada por `ux-expansion-delivery.yml`; filtros agora incluem a API, integração, runner, supervisor, guarda de gerados, focal e o próprio workflow.
- Continuidade já era chamada por dois workflows UX; ambos acompanham API, servidor e helper/guarda/focal. Nenhum step UX/evidência foi removido e nenhum runner UX adicional foi migrado nesta etapa.
- O comando nomeado de analytics não tinha chamador. Criado **`ext11-delivery.yml`**, seguindo o contrato descartável da 05D: Node 22, npm ci, unitários antes da jornada real, env de URLs/opt-in remoto vazio, mail/Ollama desativados, permissão `contents: read`, filtros precisos e sem cancelamento por concorrência.

**CI remoto não executado/não declarado verde.** Isto fecha uma orfandade específica e corrige disparos de três chamadores existentes, não a cobertura CI global da fatia 06.

Índices regenerados com os scripts oficiais: **1732 arquivos/222 IDs**, **12 a revalidar sem gate**, classes **27/124/71** inalteradas e zero aceite humano. Workflows: **52**. Na alteração desta etapa dos CSVs de rotas, somente `/admin/analytics` ganha o novo chamador/job; `/admin/conhecimento` já mudara na 05D. Não houve criação/remoção de rota nem promoção de classe de evidência/aceite.

## 4. Regressão

Supervisor focal agora tem **18 testes**. Dois novos verificam:

1. Ordem das fases, importação, budgets por runner, criação compartilhada, resultado do protocolo, tokens, mínimos, guardas de DB, ligação aos quatro chamadores CI, Chromium e reinício HTTP preservados.
2. Auditores TAP originais, incluindo funções arrow com pisos inline de continuidade/analytics: aceitam resumo válido e recusam ausência/pass ausente, mínimo insuficiente, falha, skip e todo.

Guardas dos executáveis reais ampliadas a **16 runners**: 48 recusas de URLs/opt-in mais duas específicas da CLI. Não sobem cluster nem acessam o host sintético.

A primeira versão do teste novo de extração do auditor arrow encontrou um `const port` anterior à função e falhou com `auditTap is not defined`. Corrigida a busca do delimitador **depois** do início do auditor. Nenhum código de negócio/assertion foi relaxado para corrigir essa fixture. Focal após correção **73/73**.

## 5. Resultados

| Comando npm | Antes, exit 0 | Depois, isolado | Depois, sob carga |
|---|---:|---:|---:|
| `test:ext09-expansion:pg` | 13,70s | **16/16**, 13,88s | **16/16**, 41,53s |
| `test:ext10-continuity:pg` | 24,11s | **31/31**, 22,64s | **31/31**, 48,74s |
| `test:ext11-analytics:pg` | 7,16s | **18/18**, 7,77s | **18/18**, 19,80s |

Todos exit 0, sem falhas/skips/todos, limpeza confirmada. Tempos de parede do comando completo. Carga: dois consumidores CPU e executor de até três comandos simultâneos. Unitários em etapa separada, sem jornadas Next ativas, ainda sob CPU.

- `npm test`: **1553/1553**, zero falhas/skips, exit 0, **83,78s** sob carga CPU.
- Prova negativa PG real: exit 0 em **9,45s**, duas falhas esperadas (porta ocupada/cluster morto) detectadas com exit 1/timeout-stop e limpeza confirmada.
- Focal final com contratos, supervisor, índices, guarda/higiene e package-artifacts: **93/93**, após reconciliação do plano/status.

### Sete interrupções reais

| Runner | SIGTERM após banco pronto | SIGINT após primeiro teste aprovado |
|---|---|---|
| Expansão | **143**, limpo, ~0,79s | **130**, limpo, ~6,70s |
| Continuidade | **143**, limpo, ~0,76s | **130**, limpo, ~6,96s |
| Analytics | **143**, limpo, ~0,68s | **130**, limpo, ~6,36s |

**Sétima prova:** monitor de `/proc` identificou executável Chromium com ancestralidade até o supervisor daquela execução de continuidade. Enviado SIGTERM ao supervisor durante essa janela: **143**, limpeza confirmada; o navegador observado não permaneceu ativo após a saída (~9,26s desde início do executável). Não se alega que já tivesse concluído todo o bootstrap/navegação nem que esse teste cubra todas as posições possíveis de cancelamento.

Verificações complementares: TypeScript/build exit 0; wave0 **5/5**; SEC **35/35**; inventários de requisitos e rotas `--check` OK; `git diff --check` OK; `next-env.d.ts`/`tsconfig.json` sem diff final. Checagem final sem PostgreSQL, server.mjs, next-server, Chromium, consumidores CPU ou sandboxes supervisionados ativos/remanescentes dos ensaios. Logs sintéticos não versionados em `/tmp/f05e-*`.

## 6. Continuidade

[Matriz de adoção](ADOCAO-POSTGRES.csv): **17/68** wrappers supervisionados POSIX, **51 pendentes**. A prova negativa é um 69º arquivo fora desse denominador. Próximo grupo proposto: **05F — EXT-12/13/14**, após baseline e análise de particularidades.

Permanecem: isolamento global de gerados (separar unit/build/typecheck de jornadas Next não resolve a corrida da 05B), sessões destacadas, SIGKILL/OOM do supervisor, kernel/filesystem travado, demo persistente/backup/restore e demais jornadas não migradas. Sem homologação Windows, UAT, provedor real, significância estatística real ou aceite humano.

**Fatia 05 e N8/N9 globais continuam abertos. Produção NO-GO.**
