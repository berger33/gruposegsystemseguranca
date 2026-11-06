# Fatia 05AC — supervisor do gate UX financeiro 07E-1

**Data:** 05/11/2026. `HEAD` e `origin/main` após fetch: `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b` (merge PR #349). Branch ativa `arena/8208e8f7-gruposegsystemseguranca`; alterações locais ainda não publicadas de 05Y, 05Z, 05AA e 05AB foram preservadas. Sem commit, push, PR, deploy, provedor externo ou dados reais.

**Fatia 05 parcial:** matriz conferida: 60/68 antes e **61/68 adotados / 7 pendentes** depois. O gate negativo do supervisor é arquivo extra fora do denominador. Produção **NO-GO**.

## Inventário e alteração

O único runner desta fatia é `scripts/qa-ux-pro-07e1-postgres.mjs`, chamado diretamente pelo workflow `.github/workflows/ux-pro-07e1-delivery.yml`; não há comando npm exclusivo. Executa `tests/ux-finance-workspace.integration.test.mjs` em PostgreSQL 17 descartável, migrações, HTTP e Chromium, com dados sintéticos, sem SMTP/Ollama. A suíte contém **46 casos atuais**; este auditor conserva o piso histórico **22**. Sem filtro no runner; auditor exige resumo TAP completo, total igual a pass, e rejeita `not ok`, diretivas skip/todo e respectivos contadores. `UX_FINANCE_EVIDENCE_DIR` é opcional e ficou vazio nas provas. Heap, compatibilidade nativa e mecanismos de browser herdados foram preservados.

A jornada conserva sessão e distinção entre menu/permissão, listas canônicas, vazio legítimo, falha e repetição, valores e vocabulário, datas e medidas de responsividade, sem confundir corpo 2xx inválido com ausência. Não se alteraram aplicação, regras financeiras, APIs, permissões, migrações, testes de integração ou dados. O runner já supervisionado `test:ux-finance:pg` usa a **mesma suíte**, com contrato legado por exit code e filtro opcional; não são duas provas independentes. Este grupo não altera os outros runners 07E-2/07F-1 nem decide C11.

No POSIX, wrapper após recusa de URL/opt-in remoto e antes de import nativo; criação local limitada, sandbox/grupo exclusivo, fases e conclusão IPC. Pai restaura `next-env.d.ts`/`tsconfig.json` em `finally`; o marcador histórico de limpeza só é emitido quando o supervisor confirma remoção. Erro de stop permanece falha. Windows mantém caminho anterior, não homologado; token legado não garante remoção em falhas de máquina. O workflow mantém shell `observed-shell.sh`, typecheck, gate e limite de 40min; adiciona testes e paths do supervisor e ambiente local explícito. O supervisor compartilhado, `FONTCONFIG_PATH` e regras de proveniência não foram alterados.

Prazos: migração **90s**, teste **1200s**, soma das fases **1440s**, além de margens de encerramento/remoção. Maior tempo da suíte observado pelo TAP **286,46s** sob dois consumidores CPU; baseline integral 242,82s. Há casos com timeouts internos até 420s. Não se mediu isoladamente a migração. São margens para esta amostra, não garantia em máquinas lentas ou de que todos os máximos internos caibam simultaneamente.

## Ensaios locais

Linux/Node 22.22.3; sequenciais no checkout, sem filtro, zero fail/skip/todo:

| Ensaio | Resultado | Tempo de parede |
|---|---|---:|
| Baseline anterior à alteração | 46/46, exit 0 | 242,82s |
| Supervisionado isolado | 46/46, exit 0, limpeza e restauração | 232,05s |
| Supervisionado sob dois consumidores CPU | 46/46, exit 0, limpeza e restauração | 293,70s |
| `test:ux-finance:pg`, mesma suíte | 46/46, exit 0 | 234,64s |
| `test:l07-delivery:pg` | 43/43, exit 0 | 118,88s |

O gate negativo do supervisor sob carga concluiu em 7,01s, exit geral 0, com colisão e cluster morto reconhecidos como falhas internas esperadas exit 1 e limpeza; não são clusters aprovados. Não houve mensagens de retry nos logs das execuções citadas.

Cancelamentos reais, sinal enviado somente ao supervisor após observar o gatilho:

| Gatilho | Sinal | Exit | Tempo desde início |
|---|---|---:|---:|
| Banco pronto | SIGTERM | 143 | 0,92s |
| Servidor ouvindo em loopback | SIGINT | 130 | 7,67s |
| Chromium ativo | SIGTERM | 143 | 12,96s |

Nos três, sandbox observado removido, limpeza e restauração registradas; hashes de gerados inalterados. Árvore amostrada via `/proc` por ancestralidade, PID e instante de criação: nenhum descendente **observado** ativo após saída. Zumbis não são processos ativos; processos destacados ou nascidos entre amostras podem escapar à medição. Chromium ativo não prova navegação concluída. SHA-256 de `next-env.d.ts`: `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; de `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

## Regressões e higiene

Supervisor **74/74**. Regressões novas executam as três recusas reais (exit 2), o auditor TAP real contra ausência, parcial, falha, divergência de total e diretivas skip/todo, e a suíte real sem banco: Node isoladamente retorna zero com casos pulados, mas o auditor rejeita o resultado. Também verificam contrato e ligação de workflow. Focal de supervisor, vocabulário/datas financeiras, higiene e package-artifacts **103/103**. Após jornadas Next/build, `npm test` **1615/1615**, sem falhas/skip/todo; typecheck e build exit 0; SEC **35/35 âncoras**, wave0 **5/5**. Os três inventários de requisitos, rotas e TI foram regenerados e passaram `--check`, sem diff nos artefatos. Logs e harnesses sintéticos em `/tmp/f05ac`, não versionados.

## Limites

O resultado não comprova CI remoto, Windows, UAT, WCAG integral, aceite humano ou operação real. Não há garantia de contenção sob SIGKILL/OOM do supervisor, travas de kernel/filesystem ou processos destacados/escapados; restauração dos gerados não prova concorrência de gates no mesmo checkout. A falha de Chromium do L06 na 05AB permanece registrada e não foi reavaliada nesta fatia. Client-security/N8 e N9 continuam abertos. Próxima subfatia deve ser escolhida após inventariar os sete restantes.
