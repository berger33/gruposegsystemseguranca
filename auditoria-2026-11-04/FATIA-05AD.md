# Fatia 05AD — supervisor do gate UX financeiro 07E-2

**Data:** 05/11/2026. `HEAD` e `origin/main` após fetch: `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b` (merge PR #349). Branch ativa `arena/8208e8f7-gruposegsystemseguranca`; mudanças locais de 05Y a 05AC preservadas. Sem commit, push, PR, deploy, provedor externo ou dados reais.

**Fatia 05 parcial:** matriz 61/68 antes e **62/68 adotados / 6 pendentes** depois. O gate negativo do supervisor é arquivo extra fora do denominador. Produção **NO-GO**.

## Inventário e alteração

O único runner desta fatia é `scripts/qa-ux-pro-07e2-postgres.mjs`, executado diretamente pelo workflow `.github/workflows/ux-pro-07e2-delivery.yml`. Executa `tests/ux-finance-workspace.integration.test.mjs` com PostgreSQL 17 local descartável, migrações, HTTP e Chromium, dados sintéticos e sem SMTP/Ollama. Suíte atual **46 casos**, piso TAP herdado **34**, nenhum filtro de nome: exige resumo completo, total igual a pass e rejeita `not ok`, skip/todo e contadores não zero. `UX_FINANCE_EVIDENCE_DIR` é opcional e ficou vazio nas provas; heap e compatibilidade nativa do Chromium foram mantidos.

A jornada mantém a leitura honesta das 18 chaves em oito superfícies financeiras, negativas, estados de vazio/falha, repetição e permissões existentes; não se alteraram aplicação, regras, APIs, migrações ou testes de integração. Os runners 07E-1, 07E-2 e `test:ux-finance:pg` executam a **mesma suíte**: não são jornadas independentes. Não foram migrados os outros runners, inclusive 07E-2 alvo e 07F-1, nem decidido C11.

No POSIX, o wrapper precede o import nativo e efeitos de cluster, após recusa de URLs herdadas e opt-in remoto. Grupo exclusivo, criação local limitada, fases e conclusão IPC; snapshot e restauração de gerados no pai em `finally`. Falha de stop reprova e marcador legado de limpeza só aparece quando o supervisor confirma remoção. Windows mantém caminho legado, não homologado. Workflow preserva `observed-shell.sh`, typecheck, gate e job de 40 minutos, acrescentando paths, ambiente local e testes de supervisor. Infraestrutura compartilhada, correção `FONTCONFIG_PATH` da PR #349 e regras de proveniência não foram alteradas.

Limites: migração **90s**, teste **1200s**, soma das fases **1440s**, além de margens de encerramento/remoção. O maior tempo de TAP foi 316,49s sob carga; casos individuais têm limites até 420s. Não se mediu a migração separadamente. São margens para esta amostra, não garantia em máquinas lentas ou de que todos os máximos internos caibam simultaneamente.

## Ensaios locais

Linux/Node 22.22.3, sem filtro, zero fail/skip/todo:

| Ensaio | Resultado | Tempo de parede |
|---|---|---:|
| Baseline anterior à alteração | 46/46, exit 0 | 289,14s |
| Supervisionado isolado | 46/46, exit 0, limpeza e restauração | 245,32s |
| Supervisionado sob dois consumidores CPU | 46/46, exit 0, limpeza e restauração | 325,79s |

O negativo PG correto, `npm run test:pg-supervisor:pg`, sob dois consumidores CPU concluiu em 7,33s, exit geral 0; colisão e cluster morto produziram falhas internas esperadas exit 1 e limpeza, não clusters aprovados. **Tentativa anterior:** foi chamado por engano o caminho inexistente `scripts/qa-pg-supervisor-negative.mjs`, resultando em `MODULE_NOT_FOUND`, exit 1, sem executar o gate; corrigido pelo comando npm acima. O gate 07E-2 sob carga já havia passado nessa mesma tentativa.

Cancelamentos reais, com sinal ao supervisor somente após observação do gatilho:

| Gatilho | Sinal | Exit | Tempo desde início |
|---|---|---:|---:|
| Banco pronto | SIGTERM | 143 | 1,21s |
| Servidor ouvindo em loopback | SIGINT | 130 | 10,05s |
| Chromium ativo | SIGTERM | 143 | 16,56s |

Nos três, sandbox observado removido, limpeza/restauração registradas e hashes de gerados intactos. Árvore amostrada via `/proc` por ancestralidade, PID e instante de criação: nenhum descendente **observado** ativo após saída. Zumbis não são processos ativos; processos destacados ou nascidos entre amostras podem escapar à medição. Chromium ativo não prova navegação concluída. SHA-256 de `next-env.d.ts`: `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; de `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

## Regressões e higiene

Supervisor **76/76**. As provas novas executam as três recusas reais (exit 2), o auditor TAP real contra ausência, parcial, falha, divergência de total e diretivas skip/todo e a suíte real sem banco: Node isoladamente retorna zero com casos pulados, mas o auditor rejeita o resultado. Também verificam protocolo e ligação do workflow. Focal de supervisor, vocabulário/datas financeiras, higiene e package-artifacts **105/105**. Após jornadas Next, `npm test` **1617/1617**, zero falhas/skip/todo; typecheck e build exit 0, executados sem concorrência com testes; SEC **35/35 âncoras**, wave0 **5/5**. Os três inventários de requisitos, rotas e TI foram regenerados e conferidos com `--check`, sem diff dos artefatos. Logs e harnesses sintéticos em `/tmp/f05ad`, não versionados. As provas 07E-1/financeiro e L07 da fatia 05AC são históricas, não reexecutadas aqui.

## Limites

Não comprova CI remoto, Windows, UAT, WCAG integral, aceite humano ou operação real. Não há garantia de contenção sob SIGKILL/OOM do supervisor, travas de kernel/filesystem ou processos destacados/escapados; restauração de gerados não prova concorrência de gates no mesmo checkout. A falha de Chromium do L06 na 05AB permanece registrada, sem causa estabelecida e não reavaliada nesta fatia. Client-security/N8 e N9 continuam abertos. Próxima subfatia deve ser escolhida após inventariar os seis restantes.
