# Fatia 05D — satisfação, compliance e conhecimento

**Data:** 04/11/2026. **Branch:** `arena/a5202d09-gruposegsystemseguranca`. HEAD/origin-main `0e6456e9d01b825a3bff4997f92506ac4ff1c633` conferidos após fetch. Trabalho anterior preservado. Sem commit/push/PR/deploy.

**Entrega parcial da fatia 05:** três runners adicionais supervisionados em Linux/POSIX. Total **14/68**, **54 ainda não migrados**. Produção **NO-GO**.

## Escopo e contratos

| Runner | Jornada preservada | Mínimo TAP | Prazo da jornada |
|---|---|---:|---:|
| `qa-ext06-satisfaction-postgres.mjs` | Satisfação/carteira, sessões staff e cliente sintético | 35 | 180s |
| `qa-ext07-compliance-postgres.mjs` | Compliance, planos de ação e avaliação por agendador com segundo servidor | 47 | **600s** |
| `qa-ext08-knowledge-postgres.mjs` | Conhecimento, versões, publicação, procedimentos e ciência | 15 | 180s |

Preservados: migrações 001–183, servidor HTTP real, RBAC/sessões, fixtures, variáveis de DB obrigatórias, recusa de URLs do operador/opt-in remoto, mínimos de casos e rejeição de falha/skip/todo. Nenhuma API, página, schema, permissão ou teste de integração foi alterado nesta etapa. Comentários antigos de migrações e o cabeçalho incorreto sobre fornecedores/28 casos em satisfação foram reconciliados com os contratos existentes.

### Perfil próprio de compliance

Não foi copiado cegamente o limite de 180s dos gates menores: a integração de compliance contém duas leituras com timeout individual de **240s**, inicializa um **segundo servidor** para avaliar o agendador e inclui espera de bootstrap/verificação periódica. O novo teto externo de jornada é **600s**, com migração separada de **90s**. É contenção finita com margem para essas etapas, não garantia de que todas as operações possam consumir simultaneamente todos os seus limites internos.

O total do protocolo desse perfil é 840s, além das margens de encerramento/remoção já documentadas no helper. Satisfação/conhecimento mantêm perfil total 420s. Os prazos de conexão/query/statement de criação continuam 5s, com fechamento finally. Não houve aumento de timeouts de negócio ou de testes internos para esconder reprovação.

### Supervisor e limpeza

Reutilizado o helper compartilhado sem alterar sua implementação. Wrapper POSIX depois das guardas e antes de importar embedded-postgres no worker; o pai libera handlers de sinal da guarda de gerados e mantém restore no exit. Worker recebe sandbox/grupo próprios e emite fases monotônicas. Criação do banco exclusivo é IPv4 loopback via Client limitado. Rejeição de stop é falha no caminho supervisionado.

Worker não remove sandbox nem declara limpeza. Tokens históricos passam ao pai, condicionados a `result.cleaned`. Limpeza não transforma teste reprovado em sucesso. O caminho Windows anterior continua preservado, **não homologado** por estes ensaios.

## CI: gate de conhecimento antes órfão

Inspeção de `.github/workflows` confirmou ausência de chamada a `test:ext08-knowledge:pg`. Criado **`ext08-delivery.yml`**, com:

- PR para main e filtros específicos de API/página/testes/runner/helper/guarda/migrações/package;
- permissão somente `contents: read`, `cancel-in-progress: false`, Node 22 e npm ci;
- envs vazios para URLs/opt-in remoto, mail e Ollama desativados;
- contratos unitários de conhecimento/supervisor **antes** da jornada HTTP real com banco descartável;
- timeout externo de job de 25 minutos.

Filtros dos workflows de satisfação/compliance acompanham supervisor/guarda/focal; seus comandos existentes e steps de ledger foram preservados. O runner de migrações chamado por esses steps legados não foi migrado nesta etapa. **CI remoto não foi executado e não foi declarado verde.** A ligação fecha uma orfandade específica, não a cobertura CI global da futura fatia 06.

Inventários regenerados por seus scripts: requisitos agora varrem **1731 arquivos**, mantendo **222 IDs**, classes **27 gate_nomeado/124 mencionado_em_gate/71 somente_documento**, **12 a revalidar sem gate** e zero aceite humano. São **51 workflows**. Nos dois CSVs de rotas, só a linha `/admin/conhecimento` ganhou o novo workflow/job; não se criaram rotas nem se promoveu classe de aceite.

## Regressão

`tests/qa-pg-supervisor.test.mjs`: **16 testes**, com tabelas estendidas aos três runners. Guardas dos executáveis reais agora abrangem **13 runners** (39 recusas de URL/opt-in, mais duas guardas específicas da CLI). Os auditores TAP originais são executados isoladamente, sem cluster, contra resumo válido e ausência/mínimo insuficiente/falha/skip/todo. Contratos de fases/budgets/protocolo/tokens são verificados por runner, incluindo 600s de compliance.

Um novo teste exige a chamada CI exata de conhecimento, env local, permissão restrita, unidade antes da jornada e preservação da integração com servidor agendador de compliance. Não houve redução de mínimos, retry ou relaxamento de asserção.

## Resultados reais

| Comando npm | Antes, exit 0 | Depois, isolado | Depois, sob carga |
|---|---:|---:|---:|
| `test:ext06-satisfaction:pg` | 17,13s | **36/36**, 11,78s | **36/36**, 29,90s |
| `test:ext07-compliance:pg` | 30,18s | **50/50**, 26,93s | **50/50**, 57,98s |
| `test:ext08-knowledge:pg` | 13,59s | **15/15**, 13,62s | **15/15**, 40,05s |

Todos exit 0, zero falhas/skips/todos e limpeza confirmada. Tempos de parede do comando completo, não benchmark de produção. Dois consumidores CPU foram mantidos durante o ensaio concorrente, com executor de até três comandos; a suíte unitária ficou em etapa **separada**, sem jornadas Next ativas, ainda sob CPU.

- Prova negativa PG real: exit 0 em **8,81s** sob carga; porta ocupada e cluster morto produziram cada qual exit 1/timeout-stop esperado e limpeza confirmada.
- Primeiro `npm test`: **1547 passaram/4 falharam**, ~80,54s. Falhas eram artefatos ainda não reconciliados com o novo workflow: uma na contagem de arquivos do relatório E23 e três no check do inventário de rotas. Atualizados o relatório e os CSVs por geração, sem alterar os testes.
- `npm test` final: **1551/1551**, zero falhas/skips, exit 0, **80,95s** sob os dois consumidores CPU.
- Focal inicial dos contratos/supervisor/agendador: **76/76**; verificação dos índices após correção: **12/12**.
- Focal final ampliado com higiene, guarda de gerados, índices e package-artifacts: **108/108**, após reconciliação do status/plano.

### Sete interrupções reais

Sinais enviados somente ao supervisor, sem remoção por nome de processo:

| Runner | SIGTERM após banco pronto | SIGINT após primeiro teste aprovado |
|---|---|---|
| Satisfação | **143**, limpo, ~0,71s | **130**, limpo, ~6,06s |
| Compliance | **143**, limpo, ~0,72s | **130**, limpo, ~6,31s |
| Conhecimento | **143**, limpo, ~0,72s | **130**, limpo, ~6,64s |

**Sétima prova:** monitor de `/proc` contou **dois `server.mjs --dev` simultâneos**, verificando ancestralidade até o supervisor daquela execução de compliance. Enviado SIGTERM nesse instante: saída **143**, limpeza confirmada, ~14,10s desde o início. Isso testa contenção com o segundo servidor já criado; não declara que ele tenha concluído todo o bootstrap nem cobre toda posição possível de cancelamento.

### Verificações finais

TypeScript/build exit 0; wave0 **5/5**; SEC **35/35** âncoras; ambos os inventários `--check` OK; `git diff --check` OK; `next-env.d.ts`/`tsconfig.json` sem diff. Checagem de processos/diretórios sem PostgreSQL, server.mjs, next-server, consumidores CPU ou sandboxes supervisionados remanescentes. Logs sintéticos fora do Git em `/tmp/f05d-*`.

## Continuidade e limites

[Matriz de adoção](ADOCAO-POSTGRES.csv): **14/68** jornadas supervisionadas em POSIX, **54 não migradas**. A prova negativa é um 69º arquivo fora desse denominador. Próximo grupo proposto: **05E — EXT-09/10/11**, após baseline/particularidades; sem migração automática de jornadas pesadas, browser, demo persistente ou backup/restore.

A corrida de arquivos gerados reproduzida na 05B continua resíduo técnico: separar unit/build/typecheck de jornadas Next no mesmo checkout **não é isolamento global resolvido**. Também permanecem os limites de SIGKILL/OOM do supervisor, kernel/filesystem travado e descendente que crie nova sessão, sujeitos a contenção externa.

Sem homologação Windows, UAT, parecer jurídico, provedor real ou aceite humano. **Fatia 05 e N8/N9 globais abertos; produção NO-GO.**
