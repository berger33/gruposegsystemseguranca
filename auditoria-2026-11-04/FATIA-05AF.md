# Fatia 05AF — supervisor do gate financeiro 07F-1

**Data:** 05/11/2026. `HEAD` e `origin/main` após fetch: `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b` (merge PR #349). Branch ativa `arena/8208e8f7-gruposegsystemseguranca`; mudanças locais de 05Y a 05AE preservadas. Sem commit, push, PR, deploy, provedor externo ou dados reais.

**Fatia 05 parcial:** matriz 63/68 antes e **64/68 adotados / 4 pendentes** depois. O gate negativo do supervisor é arquivo extra fora do denominador. Produção **NO-GO**.

## Inventário e alteração

O único runner desta fatia é `scripts/qa-ux-pro-07f1-postgres.mjs`, executado diretamente pelo workflow `.github/workflows/ux-pro-07f1-delivery.yml`. Executa `tests/ux-finance-workspace.integration.test.mjs` com PostgreSQL 17 local descartável, migrações, HTTP e Chromium, dados sintéticos e sem SMTP/Ollama. Suíte atual **46 casos**, piso TAP herdado **44**, nenhum filtro de nome: exige resumo completo, total igual a pass e rejeita `not ok`, skip/todo e contadores não zero. `UX_FINANCE_EVIDENCE_DIR` é opcional e ficou vazio nas provas; heap, variáveis e compatibilidade nativa do Chromium foram mantidos.

A jornada conserva os casos de datas de calendário pt-BR, competência, carimbos em UTC declarado, ausências, formatos inesperados, fusos São Paulo/Tóquio e payload ISO, além dos demais casos herdados. Não se alteraram aplicação, auxiliares de data, regras, APIs, permissões, migrações ou testes de integração. Os runners 07E-1, 07E-2, 07E-2-ALVO, 07F-1 e `test:ux-finance:pg` executam a **mesma suíte**, não são jornadas independentes. Não foram migrados os outros runners nem decidido C11.

No POSIX, o wrapper precede o import nativo e efeitos de cluster, após recusa de URLs herdadas e opt-in remoto. Grupo exclusivo, criação local limitada, fases e conclusão IPC; snapshot e restauração de gerados no pai em `finally`. Falha de stop reprova e marcador legado de limpeza só aparece quando o supervisor confirma remoção. Windows mantém caminho legado, não homologado. Workflow preserva `observed-shell.sh`, typecheck, unitário de datas, gate e job de 40 minutos, acrescentando paths, ambiente local e testes de supervisor. Infraestrutura compartilhada, correção `FONTCONFIG_PATH` da PR #349 e regras de proveniência não foram alteradas.

Limites: migração **90s**, teste **1200s**, soma das fases **1440s**, além de margens de encerramento/remoção. O maior tempo de TAP foi 313,80s sob carga; casos individuais têm limites até 420s. Não se mediu a migração separadamente. São margens para esta amostra, não garantia em máquinas lentas ou de que todos os máximos internos caibam simultaneamente.

## Ensaios locais

Linux/Node 22.22.3, sem filtro, zero fail/skip/todo:

| Ensaio | Resultado | Tempo de parede |
|---|---|---:|
| Baseline anterior à alteração | 46/46, exit 0 | 248,22s |
| Supervisionado isolado | 46/46, exit 0, limpeza e restauração | 237,49s |
| Supervisionado sob dois consumidores CPU | 46/46, exit 0, limpeza e restauração | 321,86s |

O negativo PG `npm run test:pg-supervisor:pg` sob dois consumidores CPU concluiu em 6,70s, exit geral 0; colisão e cluster morto produziram falhas internas esperadas exit 1 e limpeza, não clusters aprovados.

Cancelamentos reais, com sinal ao supervisor somente após observação do gatilho:

| Gatilho | Sinal | Exit | Tempo desde início |
|---|---|---:|---:|
| Banco pronto | SIGTERM | 143 | 0,95s |
| Servidor ouvindo em loopback | SIGINT | 130 | 8,37s |
| Chromium ativo | SIGTERM | 143 | 13,73s |

Nos três, sandbox observado removido, limpeza/restauração registradas e hashes de gerados intactos. Árvore amostrada via `/proc` por ancestralidade, PID e instante de criação: nenhum descendente **observado** ativo após saída. Zumbis não são processos ativos; processos destacados ou nascidos entre amostras podem escapar à medição. Chromium ativo não prova navegação concluída. SHA-256 de `next-env.d.ts`: `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; de `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

**Tentativas e ambiente:** a sondagem inicial de `embedded-postgres` falhou porque `node_modules` não persistiu; `npm ci --no-audit --no-fund` restaurou dependências antes do baseline. A primeira tentativa de reutilizar o harness de cancelamento em `/tmp/f05ae` falhou porque o arquivo temporário não persistiu; a pipeline executou um arquivo vazio e retornou zero indevidamente, sem realizar ensaio algum. Harness recriado e executado efetivamente, com `pipefail`, nos três resultados acima.

## Regressões e higiene

Supervisor **80/80**. As provas novas executam as três recusas reais (exit 2), o auditor TAP real contra ausência, parcial abaixo de 44, falha, divergência de total e diretivas skip/todo e a suíte real sem banco: Node isoladamente retorna zero com casos pulados, mas o auditor rejeita o resultado. Também verificam protocolo, ligação do workflow e manutenção do unitário de datas. Focal de supervisor, vocabulário/datas financeiras, higiene e package-artifacts **109/109**. Após jornadas Next, `npm test` **1621/1621**, zero falhas/skip/todo; typecheck e build exit 0, executados sem concorrência com testes; SEC **35/35 âncoras**, wave0 **5/5**. Os três inventários de requisitos, rotas e TI foram regenerados e conferidos com `--check`, sem diff dos artefatos. Logs e harness sintéticos em `/tmp/f05af`, não versionados. As provas financeiras de 05AC–05AE são históricas, não reexecutadas aqui como jornadas adicionais.

## Limites

Não comprova CI remoto, Windows, UAT, WCAG integral, aceite humano ou operação real. Não há garantia de contenção sob SIGKILL/OOM do supervisor, travas de kernel/filesystem ou processos destacados/escapados; restauração de gerados não prova concorrência de gates no mesmo checkout. A falha de Chromium do L06 na 05AB permanece registrada, sem causa estabelecida e não reavaliada nesta fatia. Client-security/N8 e N9 continuam abertos. Próxima subfatia deve ser escolhida após inventariar os quatro restantes.
