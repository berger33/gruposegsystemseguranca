# Fatia 05AG — supervisão do gate RAG/widget

**Data:** 05/11/2026. `HEAD` e `origin/main` após fetch: `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b` (merge PR #349). Branch ativa `arena/8208e8f7-gruposegsystemseguranca`; mudanças locais 05Y–05AF preservadas. Sem commit, push, PR, deploy, provedor externo ou dados reais.

**Fatia 05 parcial:** matriz 64/68 antes e **65/68 adotados / 3 pendentes** depois. Gate negativo do supervisor é arquivo extra fora do denominador. Produção **NO-GO**.

## Inventário e alteração

`npm run test:ai-rag-widget:pg` executa `scripts/qa-ai-rag-widget-postgres.mjs`, chamado também pelo workflow `fech-01-rag-widget-delivery.yml`: PostgreSQL 17 descartável local, migrações, HTTP real, sessões sintéticas, Chromium e **provedor determinístico stub em loopback**, não Ollama real. A suíte cobre corpus público e privado, escopo de contas/RH/gestão, vínculo revogado, guardas/aliases HTTP, falhas e estados do widget, teclado e medições visuais. Não se alteraram aplicação, teste de integração, dados ou regras de acesso. Documentos e identidades são sintéticos.

O runner conserva `FECH01_TEST_PATTERN`, `QA_AI_RAG_WIDGET_REQUIRE_DB=1`, evidências opcionais `FECH01_EVIDENCE_DIR`, heap 1536 e compatibilidade Chromium. Auditor **legado** exige resumo de `pass`/`fail`, mínimo 20 e rejeita contadores fail/skipped/todo não zero quando presentes. **Limite:** não exige presença dos contadores skipped/todo/total nem analisa diretamente diretivas TAP; não garante por si só integralidade quando um filtro produz pelo menos 20 aprovações. A evidência integral nesta fatia usa explicitamente pattern vazio e todos os 28 casos. O filtro real para teclado executou 1/1 e foi rejeitado pelo piso (exit 1), não é evidência integral. Não se alterou o auditor ou adicionou retry ao gate; o teste conserva sua recuperação herdada para certas falhas de navegador.

No POSIX, wrapper após recusa de URLs herdadas/opt-in remoto e antes do import nativo; grupo exclusivo, criação local limitada, fases e conclusão IPC. O pai restaura gerados em `finally` e só emite o marcador legado se o supervisor confirmar remoção. Uma falha de stop agora reprova no caminho supervisionado; caminho Windows preserva tratamento anterior, sem homologação. Workflow mantém shell `observed-shell.sh`, typecheck, contratos, build, smoke, gate, npm audit e job de 50 minutos; adiciona paths, variáveis locais e testes do supervisor. A infraestrutura compartilhada, correção `FONTCONFIG_PATH` da PR #349 e as regras de proveniência não foram alteradas. CI remoto e npm audit remoto não foram executados nesta etapa.

Prazos: migração **90s**, teste **1200s**, soma das fases **1440s**, além de margens de encerramento/remoção. TAP mais longo entre as rodadas aprovadas **137,13s** sob dois consumidores CPU; há espera de startup de até 300s e timeouts internos. Não se mediu migração separadamente. São margens para esta amostra, não garantia em máquina lenta nem de acomodar todos os máximos internos simultaneamente.

## Ensaios locais

Linux/Node 22.22.3, pattern vazio e evidências desativadas:

| Ensaio | Resultado | Tempo de parede |
|---|---|---:|
| Baseline anterior à alteração | 28/28, exit 0 | 115,82s |
| Primeira execução supervisionada isolada | **26/28, exit 1**, Chromium SIGSEGV em dois launches | 104,09s |
| Repetição supervisionada isolada | 28/28, exit 0 | 95,85s |
| Supervisionado sob dois consumidores CPU | 28/28, exit 0 | 146,03s |

Na falha supervisionada, os casos de teclado e recusa do provedor falharam ao iniciar Chromium (`SIGSEGV`); o kernel registrou falhas em threads de Chromium. Supervisor informou `worker-failed`, exit 1, sandbox removido e gerados restaurados. Repetição integral passou sem alteração; **causa não estabelecida**, não equivale a correção nem comprova relação com o SIGSEGV de L06 da 05AB. A recuperação herdada de navegador não foi alterada. A sondagem de logs das rodadas aprovadas não encontrou marcador `FECH01_BROWSER_RETRY`.

O negativo PG `npm run test:pg-supervisor:pg` sob dois consumidores CPU concluiu em 7,05s, exit geral 0; colisão e cluster morto produziram falhas internas esperadas exit 1 e limpeza, não clusters aprovados.

Cancelamentos reais, com sinal ao supervisor somente após observação do gatilho:

| Gatilho | Sinal | Exit | Tempo desde início |
|---|---|---:|---:|
| Banco pronto | SIGTERM | 143 | 1,06s |
| Servidor ouvindo em loopback | SIGINT | 130 | 10,52s |
| Chromium ativo | SIGTERM | 143 | 21,93s |

Nos três, sandbox observado removido, limpeza/restauração registradas e hashes de gerados intactos. Árvore amostrada via `/proc` por ancestralidade, PID e instante de criação: nenhum descendente **observado** ativo após saída. Zumbis não são ativos; processos destacados ou nascidos entre amostras podem escapar à medição. Chromium ativo não prova navegação concluída. SHA-256 de `next-env.d.ts`: `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; de `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

## Regressões e histórico de tentativas

Supervisor **82/82**; novas provas executam recusas reais exit 2, auditor herdado, guarda real de banco obrigatório e contrato/ligação do workflow. Focal supervisor, contratos/escopos RAG, E3/E4, higiene e package-artifacts **148/148**; `npm test` **1623/1623** sem fail/skip/todo; typecheck e build exit 0, sequenciais. Smoke `npm run test:rag` aprovado com PGlite sintético local e Ollama desativado; não substitui o PostgreSQL do gate principal. SEC **35/35 âncoras**, wave0 **5/5**, três inventários regenerados e conferidos `--check`, sem diff dos artefatos.

**Tentativa descartada de smoke:** foi definido `TEST_PORT` aleatório sem `TEST_BASE_URL`; o teste fixa base padrão em porta 3002, enquanto o filho ouviu outra porta. Timeout de startup, exit 1. Repetido com porta padrão livre, sem `TEST_BASE_URL`/`TEST_PORT`, exit 0; diretórios sintéticos criados pelas duas tentativas foram removidos após encerramento. Não se alterou o teste para passar.

**E6 permanece pendente:** antes de selecionar RAG, baseline integral `qa-ux-pro-e6-postgres.mjs` falhou **1/5**, servidor SIGKILL e kernel registrando global OOM em máquina com 3,8 GiB sem swap. Runner E6 não foi editado nem migrado; relato e limites em `FATIA-05AG-E6-BASELINE-BLOQUEADO.md`. Logs e harnesses em `/tmp/f05ag-rag` e `/tmp/f05ag`, temporários e não versionados.

## Limites

O stub não prova Ollama real, modelo, qualidade ou desempenho; não comprova CI remoto, Windows, UAT, WCAG integral, aceite humano ou operação real. Não há garantia de contenção sob SIGKILL/OOM do supervisor, travas de kernel/filesystem ou processos destacados/escapados; restauração de gerados não prova concorrência de gates no mesmo checkout. A falha L06 de 05AB continua sem causa estabelecida. Client-security/N8 e N9 continuam abertos; escolher próxima subfatia após inventariar os três restantes e tratar o bloqueio E6 separadamente.
