# Fatia 05Y — continuidade cliente e portal

**Data:** 05/11/2026. Base `1c63a82c6de3069d0ceaff72bf7a008be88f8b1b`, merge da PR #349 em `main`, conferida contra `origin/main`; branch ativa `arena/8208e8f7-gruposegsystemseguranca`. Checkout inicialmente limpo. A implementação dos wrappers, testes existentes, correção de catálogo e fontconfig já estava no merge; esta sessão acrescenta testes de regressão e reconcilia os registros, sem repetir a adoção. Sem commit, push, PR ou deploy.

**Entrega parcial da fatia 05:** matriz conferida: **57/68** runners originais adotados, **11 pendentes**. O gate negativo do supervisor é um 69º arquivo, fora do denominador. Produção **NO-GO**.

## Escopo e contratos

- `test:ux-continuity-client:pg`: PostgreSQL local descartável, migrador, HTTP e Chromium; 10 testes atuais, piso TAP herdado 10, resumo obrigatório, reprovação de falha/skip/todo/parcial, `QA_UX_CONTINUITY_CLIENT_REQUIRE_DB=1`, sem filtro por nome. Valida sessão, vínculo/conta e projeção mínima, publicação e retirada sintéticas, vazio/negado/falha distintos, recuperação e 390px. Evidência opcional `UX_CONTINUITY_CLIENT_EVIDENCE_DIR` não foi escrita nestas provas.
- `test:ux-portal:pg`: PostgreSQL local descartável UTF8, migrações, HTTP/Chromium, 60 testes; contrato legado por exit code, sem novo piso TAP. `UX_PORTAL_TEST_PATTERN` seleciona apenas subconjunto e não constitui evidência integral. Pastas opcionais `UX_PORTAL_EVIDENCE_DIR`, `UX_PORTAL_G3_EVIDENCE_DIR`, `UX_PORTAL_G4_EVIDENCE_DIR`, `UX_PORTAL_G5_EVIDENCE_DIR`, `UX_PRO_09A6_EVIDENCE_DIR`, `UX_PORTAL_09C_EVIDENCE_DIR`, `UX_PORTAL_09D_EVIDENCE_DIR` não foram utilizadas. Abrange identidades, autorização e isolamento, falhas e estados honestos, ações, auditoria e jornadas dos portais e console TI no escopo dos testes existentes.
- Ambos recusam URLs herdadas e opt-in remoto antes de criar cluster, têm worker em grupo próprio, prazos por fase e limpeza no pai. Portal também faz snapshot e restauração de `next-env.d.ts`/`tsconfig.json` no `finally` do pai; continuidade cliente mantém guarda de saída síncrona. Caminho Windows legado preservado, não homologado aqui. Restauração não garante exclusão mútua entre gates concorrentes no mesmo checkout.
- A PR #349 também alterou `IntegrationsClient.tsx`: sequência invalida resposta obsoleta e conclusão após desmontagem; regressões exercitam callbacks reais transpilados. Preservados a correção `FONTCONFIG_PATH` no sandbox e `scripts/ci/observed-shell.sh`. Workflows de continuidade cliente e portal preservam gates e typecheck, jobs de 50 e 60 minutos, padrão portal vazio no CI e filtros dos arquivos envolvidos. Capturas e CI remoto não foram executados nesta sessão.

## Resultados integrais

Ensaios em Linux, Node v22.22.3, npm 10.9.8, somente dados sintéticos e PostgreSQL 17 exclusivo. Tempos são de parede do comando completo; CPU = dois consumidores adicionais. Não se executaram os gates simultaneamente no mesmo checkout. Sem filtro, zero fail/skip/todo nas execuções supervisionadas.

| Gate | Base anterior não supervisionada `0e6456e` | Supervisionado isolado | Supervisionado sob CPU |
|---|---:|---:|---:|
| Continuidade cliente | 10/10, 77,62s | 10/10, 75,69s | 10/10, 100,92s |
| Portal | 60/60, 1023,50s | 60/60, 1009,16s | 60/60, 1568,55s |

Baseline feita em árvore extraída de `git archive`, com dependências locais compartilhadas, sem trocar branch nem alterar o checkout. Os testes são os daquela revisão; não é um benchmark controlado de desempenho. `test:ext10-continuity:pg`: 31/31, 28,51s; `test:ux-continuity:pg`: 20/20, 77,03s, ambos exit 0 e limpeza confirmada. Negativo `test:pg-supervisor:pg` sob carga: exit geral 0, 6,88s, com colisão de porta e cluster morto identificados como falhas esperadas exit 1, timeout de stop e limpeza; não são sucesso dos clusters.

Prova adicional do cliente sem `/tmp/fonts`: 10/10 em 69,98s. No baseline do cliente, no ensaio sem fonts e sob carga foi registrado `UX_CONTINUITY_CLIENT_BROWSER_RETRY tentativa=1: stale_client_list_race`; tentativas herdadas, não se omite a instabilidade nem se acrescentou retry. Os dois ensaios integrais do portal também ocorreram sem `/tmp/fonts`; o diretório preexistente foi preservado e restaurado depois. SHA-256 após ensaios: `next-env.d.ts` `1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`; `tsconfig.json` `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`.

Budgets mantidos pela #349: migração 90s, fase de teste 900s cliente e 2400s portal; teste do portal mediu 1005,19s isolado e 1561,09s sob carga, deixando cerca de 839s para o maior observado. Cliente completo sob carga 100,92s é inferior ao orçamento de teste de 900s. São limites conservadores de uma amostra, não garantia em hardware lento; não se mediu duração isolada da fase de migração, e orçamento agregado não garante todos os máximos internos simultâneos.

## Cancelamentos e regressões

Sinal enviado somente ao processo supervisor real após observar o gatilho. Os gatilhos foram banco pronto, processo de servidor local e processo Chromium; observar Chromium ativo não prova navegação concluída.

| Runner | Banco/SIGTERM | Servidor/SIGINT | Chromium/SIGTERM |
|---|---:|---:|---:|
| Continuidade cliente | 143, 0,89s | 130, 7,52s | 143, 14,11s |
| Portal | 143, 0,91s | 130, 7,54s | 143, 15,20s |

Em todos, token de limpeza confirmado, sandbox observado ausente, hashes iguais e varredura `/proc` por comandos relevantes sem processos ativos remanescentes; não foi uma prova exaustiva por ancestralidade. Portal registrou restauração no pai. Não confundir zumbis com processos ativos. SIGKILL/OOM do supervisor, filesystem/kernel travado e processo destacado/escapado não estão cobertos.

Testes adicionados em `tests/qa-pg-supervisor.test.mjs`: execução real da guarda de banco e auditor TAP negativo; timeout e SIGTERM em árvores sintéticas com escrita real dos arquivos gerados e restauração pelos dois mecanismos, verificando workers e descendentes inativos; execução do `observed-shell.sh` com saída 0 e 2, checando anotação de erro redigida (o log original espelhado continua a cargo do comando) e código preservado. Também verifica ligação dos testes de catálogo e wrapper de CI. A primeira tentativa do novo teste de banco falhou porque o filho herdou `NODE_TEST_CONTEXT`, omitindo o resumo esperado; removida essa variável do ambiente da execução aninhada, mantendo a guarda real. Tentativa inicial de medir com `/usr/bin/time` falhou por ausência do executável; medições posteriores usam relógio de parede. Logs temporários em `/tmp/f05y`, não versionados.

## Verificações finais

- Após as jornadas Next e sem concorrência de build no checkout: `npm test` **1607/1607**, exit 0, zero fail/skip/todo; focal de nove arquivos, incluindo supervisor, vocabulários, EXT-10 unitário, catálogo, guarda de leitura, higiene e package-artifacts: **154/154**, exit 0. Supervisor incluído: **66/66**. A suíte integral anterior às três regressões adicionais passou com 1604/1604.
- `npm run typecheck` e `npm run build`: exit 0; `npm run reaudit:sec`: **35/35 âncoras**, e `node scripts/qa-wave0-static.mjs`: **5/5**. Não são pentest nem aceite.
- Os geradores `requisitos-222-inventory.mjs`, `ux-pro-00-inventory.mjs` e `ux-pro-03-ti-inventory.mjs` foram executados e depois verificados com `--check`, exit 0, sem diff nos artefatos gerados. Inventários: 222 IDs, 12 a revalidar sem gate; 101 rotas; 84 componentes TI e 19 promoções registradas. Após atualização do status, `package-artifacts` e higiene: **13/13**. `git diff --check` sem erro; hashes dos dois arquivos gerados preservados. Varredura final por padrões em `/proc` sem processos de gate ativos identificados e sem sandboxes de 05Y remanescentes.

## Limitações e próximos passos

Adoção POSIX não fecha N8/client-security, SMTP real, integrações de fornecedor, UAT, aceite humano, Windows, WCAG manual ou restore operacional. Simulação e automação local não constituem aprovação ou prontidão de produção. A próxima subfatia deve ser escolhida após inventário e baseline de pequeno grupo dos 11 restantes; não antecipada aqui. A fatia 05 e N8/N9 permanecem abertos.
