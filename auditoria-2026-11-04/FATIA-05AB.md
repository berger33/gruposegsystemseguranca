# Fatia 05AB — supervisor do gate UX operação 07D-2

**Data:** 05/11/2026. `HEAD` e `origin/main` após fetch: `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b` (merge PR #349). Branch ativa `arena/8208e8f7-gruposegsystemseguranca`; alterações locais ainda não publicadas de 05Y, 05Z e 05AA foram preservadas. Sem commit, push, PR, deploy, provedor externo ou dados reais.

**Fatia 05 parcial:** matriz conferida: 59/68 antes e **60/68 adotados / 8 pendentes** depois. O gate negativo do supervisor é arquivo extra fora do denominador. Produção **NO-GO**.

## Inventário e alteração

O único runner desta fatia é `scripts/qa-ux-pro-07d2-postgres.mjs`, chamado diretamente pelo workflow `.github/workflows/ux-pro-07d2-delivery.yml`; não há comando npm exclusivo. Executa `tests/ux-ops-workspace.integration.test.mjs` em PostgreSQL 17 descartável, migrações, HTTP e Chromium, com dados sintéticos, sem SMTP/Ollama. A suíte tem **29 casos atuais**, embora o auditor deste runner exija **mínimo 27**, mantido. Sem filtro; auditor exige resumo TAP completo, total igual a pass, e recusa `not ok`, diretivas skip/todo e respectivos contadores. Evidências opcionais `UX_OPS_EVIDENCE_DIR`, `UX_OPS_07D_EVIDENCE_DIR` e `UX_OPS_07D2_EVIDENCE_DIR` ficaram vazias nos ensaios; `UX_OPS_07D_UI_TIMEOUT` permanece da suíte. Heap, compatibilidade nativa e mecanismos de browser herdados foram preservados.

A jornada conserva sessão e distinção entre menu/permissão, leitura honesta, seleção e detalhes de escala, ciência e `duplicate_ack`, bloqueio de duplo envio, falha de leitura posterior ao POST, respostas fora de ordem, resposta perdida e reconciliação, teclado e responsividade. Não se alteraram aplicação, regras, APIs, permissões, migrações, testes de integração ou dados. O runner já supervisionado `test:ux-ops:pg` usa a **mesma suíte**, porém tem seu próprio piso 29; não são duas provas independentes de jornada.

No POSIX, wrapper após recusa de URL/opt-in remoto e antes de import nativo; criação local limitada, sandbox/grupo exclusivo, fases e conclusão IPC. Pai restaura `next-env.d.ts`/`tsconfig.json` em `finally`; o marcador histórico de limpeza só é emitido quando o supervisor confirma a remoção. Erro de stop permanece falha. Windows mantém caminho anterior, não homologado; seu token legado não prova remoção contra falhas de máquina. O workflow mantém shell `observed-shell.sh`, typecheck, gate e limite de 30min; adiciona testes e paths do supervisor e ambiente local explícito. O supervisor compartilhado, `FONTCONFIG_PATH` e regras de proveniência não foram alterados.

Prazos: migração **90s**, teste **900s**, soma das fases **1140s**, além de margens de encerramento/remoção. Maior tempo de teste observado pelo TAP **209,47s** sob dois consumidores CPU; baseline integral 157,34s. Não se mediu isoladamente a migração. São margens para esta amostra, não garantia em máquinas lentas ou de que todos os máximos internos caibam simultaneamente.

## Ensaios locais

Linux/Node 22.22.3; sequenciais no checkout, sem filtro, zero fail/skip/todo nos três primeiros:

| Ensaio | Resultado | Tempo de parede |
|---|---|---:|
| Baseline anterior à alteração | 29/29, exit 0 | 157,34s |
| Supervisionado isolado | 29/29, exit 0, limpeza e restauração | 149,13s |
| Supervisionado sob dois consumidores CPU | 29/29, exit 0, limpeza e restauração | 216,78s |
| `test:ux-ops:pg`, mesma suíte | 29/29, exit 0 | 148,22s |
| `test:l06-delivery:pg`, primeira tentativa | **8/9, exit 1** | 41,96s |
| `test:l06-delivery:pg`, repetição isolada | 9/9, exit 0 | 44,40s |

A primeira tentativa L06 falhou no caso de operação avançada ao lançar Chromium: processo terminou por **SIGSEGV**, `browserType.launch: Target page, context or browser has been closed`. O supervisor reportou falha e limpou o sandbox. A repetição passou sem mudar teste ou retry, mas **não estabelece causa nem elimina a instabilidade**. Mensagens de ausência de `audit_log` em outros casos do L06 fazem parte das provas de fail-closed; a falha registrada foi o launch do browser. O gate negativo do supervisor sob carga concluiu em 6,84s, exit geral 0, com colisão e cluster morto reconhecidos como falhas internas esperadas exit 1 e limpeza; não são clusters aprovados.

Cancelamentos reais, sinal enviado somente ao supervisor após observar o gatilho:

| Gatilho | Sinal | Exit | Tempo desde início |
|---|---|---:|---:|
| Banco pronto | SIGTERM | 143 | 0,86s |
| Servidor ouvindo em loopback | SIGINT | 130 | 7,42s |
| Chromium ativo | SIGTERM | 143 | 12,95s |

Nos três, sandbox observado removido, limpeza e restauração registradas; hashes de gerados inalterados. Árvore amostrada via `/proc` por ancestralidade, PID e instante de criação: nenhum descendente **observado** ativo após saída. Zumbis não são processos ativos; processos destacados ou nascidos entre amostras podem escapar à medição. Chromium ativo não prova navegação concluída. SHA-256 de `next-env.d.ts`: `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; de `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

## Regressões e higiene

Supervisor **72/72**. Regressões novas executam as três recusas reais (exit 2), o auditor TAP real contra ausência, parcial, falha, divergência de total e diretivas skip/todo, e a suíte real sem banco: Node isoladamente retorna zero com casos pulados, mas o auditor rejeita o resultado. Também verificam contrato e ligação de workflow. Focal de supervisor, vocabulário de operação, higiene e package-artifacts **96/96**. Após jornadas Next/build, `npm test` **1613/1613**, sem falhas/skip/todo; typecheck e build exit 0; SEC **35/35 âncoras**, wave0 **5/5**. Os três inventários de requisitos, rotas e TI foram regenerados e passaram `--check`, sem diff nos artefatos. Logs e harnesses sintéticos em `/tmp/f05ab`, não versionados.

## Limites

O resultado não comprova CI remoto, Windows, UAT, WCAG integral, aceite humano ou operação real. Não há garantia de contenção sob SIGKILL/OOM do supervisor, travas de kernel/filesystem ou processos destacados/escapados; restauração dos gerados não prova concorrência de gates no mesmo checkout. A falha de Chromium do L06 permanece uma observação a investigar se reproduzir. Client-security/N8 e N9 continuam abertos. Próxima subfatia deve ser escolhida após inventariar os oito restantes.
