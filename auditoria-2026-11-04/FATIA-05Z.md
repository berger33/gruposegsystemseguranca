# Fatia 05Z — supervisão do gate UX emergencial

**Data:** 05/11/2026. `HEAD` e `origin/main`, após fetch: `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b` (PR #349 mesclada); branch ativa `arena/8208e8f7-gruposegsystemseguranca`. O checkout já continha alterações locais da 05Y, preservadas; não se afirma que elas estavam na PR #349. Sem commit, push, PR, deploy, mensagem externa ou dados reais.

**Fatia 05 parcial:** conferida a matriz, 57/68 antes desta etapa e **58/68 adotados / 10 pendentes** depois. O gate negativo do supervisor é arquivo adicional fora do denominador. Produção **NO-GO**.

## Inventário e escopo

Um único runner pendente: `scripts/qa-ux-emergency-postgres.mjs` (`npm run test:ux-emergency:pg`), `tests/ux-emergency-workspace.integration.test.mjs` e `.github/workflows/ux-emergency-delivery.yml`. O runner sobe PostgreSQL 17 exclusivo em loopback, aplica o migrador, inicia HTTP real e Chromium com massa sintética e desliga SMTP/Ollama. Nenhum contato ou acionamento emergencial real é executado. A suíte tem **21 testes**, com autorização e isolamento, leitura/vazio/falha/negado, transição canônica, ações, teclado, tamanhos/contrastes medidos, bloqueio de duplo envio, trilha, perda de resposta após commit e replay manual com mesma chave sem duplicar eventos. Injeções de erro de UI ocorrem em `window.fetch` nos casos previstos; testes herdados de servidor continuam independentes.

Auditor TAP existente exige no mínimo **21 aprovações** sem pattern, resumo presente e rejeita falha, skip e todo. `UX_EMERGENCY_TEST_PATTERN` seleciona casos e desativa somente o piso: o auditor continua rejeitando skip/todo. Na versão local de Node, pattern focal executou 1/1 e exit 0 sem reportar os demais como skip; **isso não é evidência integral**. Permanecem `UX_EMERGENCY_EVIDENCE_DIR` opcional (vazio nas provas) e `UX_EMERGENCY_UI_TIMEOUT`, bibliotecas nativas e comportamento de retry de browser herdado. Nenhuma asserção, caso, API, permissão ou jornada foi reduzida.

## Alteração

Wrapper POSIX depois da recusa das URLs herdadas/opt-in remoto e antes de carregar embedded-postgres ou preparar bibliotecas. Worker usa sandbox exclusivo, grupo de processos e criação local limitada via supervisor; fases initialise/start/create/migrate/test/stop/done, conclusão explícita e falha de stop preservada. Remoção e token de limpeza do supervisor são de responsabilidade do pai. No pai, snapshot/restauração de `next-env.d.ts` e `tsconfig.json` no `finally`, inclusive em sinal. O caminho Windows anterior permanece, sem homologação nesta fatia; não se alteraram o supervisor compartilhado, sua correção de `FONTCONFIG_PATH`, `observed-shell.sh` ou regras de proveniência.

Prazos: migração **90s**, teste **900s**; soma das fases **1140s**, mais margens de encerramento/remoção. O maior tempo de fase de teste medido foi **124,85s** sob dois consumidores CPU, bem abaixo de 900s; baseline integral levou 112,06s. Não foi medida isoladamente a fase de migração. São margens práticas para esta máquina e amostra, não garantia em máquinas mais lentas nem soma de todos os timeouts internos simultâneos. O workflow mantém job de 40 minutos, typecheck, execução integral e shell de observabilidade, adicionando arquivos que o acionam, teste do supervisor e ambiente local explícito.

## Provas locais

Linux, Node 22.22.3; execuções sequenciais no checkout, sem evidências versionadas, sem filtro nas três primeiras linhas:

| Ensaio | Resultado | Tempo de parede |
|---|---|---:|
| Baseline anterior à alteração | 21/21, exit 0, limpeza | 112,06s |
| Supervisionado isolado | 21/21, exit 0, limpeza/restauração | 97,28s |
| Supervisionado, dois consumidores de CPU | 21/21, exit 0, limpeza/restauração | 131,63s |
| EXT-15 herdado | 18/18, exit 0 | 13,76s |
| L06 herdado | 9/9, exit 0 | 42,01s |
| L08 herdado | 54/54, exit 0 | 29,62s |

Todos os integrais acima com zero falha/skip/todo. Não houve retry de browser nos três logs do emergencial. O negativo PG sob carga completou em 6,52s com duas falhas esperadas (colisão e cluster morto), exit interno 1/timeout-stop e limpeza, exit geral 0; não são clusters aprovados. A execução com pattern focal passou **1/1** em 9,24s e não é comparável ao gate completo.

Cancelamentos reais: o sinal foi enviado somente ao supervisor, após observar banco pronto, servidor com porta loopback aberta ou Chromium ativo. Árvore de processos amostrada via `/proc` por ancestralidade, comparando PID e instante de criação; são processos *observados*, não prova de todos os processos destacados ou nascidos entre amostras. Tempo desde o início:

| Gatilho | Sinal | Saída | Tempo |
|---|---|---:|---:|
| Banco pronto | SIGTERM | 143 | 0,82s |
| Servidor ouvindo | SIGINT | 130 | 6,49s |
| Chromium ativo | SIGTERM | 143 | 11,70s |

Nos três, sandbox observado removido, token de limpeza e restauração presentes, hashes dos gerados inalterados e nenhum processo observado ativo ao final. Zumbis não são processos ativos. Chromium ativo não comprova navegação concluída. `next-env.d.ts`: SHA-256 `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

Regressões em `tests/qa-pg-supervisor.test.mjs` exercitam as três recusas reais (exit 2), o auditor TAP real com ausência/falha/parcial/skip/todo e sua semântica com pattern, além de estrutura de protocolo, snapshot e ligação do workflow. **68/68** no supervisor; focal de supervisor, EXT-15 unitário, higiene e package-artifacts **92/92**. `npm test` **1609/1609** após os processos Next/build, zero fail/skip/todo. `npm run typecheck`, `npm run build`, `npm run reaudit:sec` (35/35 âncoras) e wave0 (5/5) passaram. Os três inventários de requisitos, rotas e TI foram regenerados e passaram `--check`, sem diff nos artefatos.

A primeira tentativa de baseline terminou exit 1 porque `node_modules` não estava disponível ao iniciar este turno (`ERR_MODULE_NOT_FOUND` para embedded-postgres); após `npm ci --no-audit --no-fund`, a baseline integral acima passou. Logs e harnesses sintéticos ficaram em `/tmp/f05z`, fora do versionamento.

## Limites e continuidade

CI remoto, Windows, UAT, WCAG integral, aceite humano e operação/integração real não foram homologados. SIGKILL/OOM do supervisor, processos destacados/escapados e travas de kernel/filesystem não são cobertos; snapshot não resolve concorrência entre gates no mesmo checkout. Client-security/N8 e N9 continuam abertos. Próxima subfatia: inventariar e medir um pequeno grupo entre os 10 restantes antes de adotar, sem antecipar mudanças de escopo.
