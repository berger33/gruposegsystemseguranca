# Fatia 06C — Auditoria TAP por comando no mapa de cobertura e migração dos lotes `ci.yml` + F01 + família L

**Data:** 07/11/2026 · **Base:** `4ddad493fda704c77e5590758efb3b5476dd23df` (`main`, merge da PR #351) · **Branch:** `arena/8dc827c4-gruposegsystemseguranca`

**Escopo entregue:** fechamento parcial do item 06 do plano técnico — (1) contabilidade pós-06B reconciliada antes de tocar código; (2) exposição estática de auditoria TAP por comando no mapa de cobertura (`docs/CI-MAPA-COBERTURA-2026-11-07.csv` e `docs/CI-EQUIVALENCIA-COBERTURA-2026-11-07.md`), bloqueando qualquer gate novo ou religado sem auditoria TAP e exigindo motivo + ordem de migração para cada resíduo legado em `scripts/ci/coverage-allowlist.mjs`; e (3) migração em quatro lotes pequenos (um lote por commit) dos 9 alvos prioritários (`test:ux-pro-09e-pu4:browser` em `ci.yml`, `scripts/qa-admin-entry-postgres.mjs` F01 e toda a família L `scripts/qa-l02-delivery-postgres.mjs`..`scripts/qa-l08-delivery-postgres.mjs`) para `scripts/lib/qa-tap-summary.mjs` com pisos **medidos** no próprio gate.

A fatia 05 não foi tocada e permanece em **67/68** (E6 administrativo bloqueado por OOM). As fatias 06A e 06B não foram reabertas. Produção permanece **NO-GO**.

---

## 1. Inventário medido antes da migração

A medição estática sobre `4ddad49` (`60` workflows, `244` comandos extraídos, `90` gates em `package.json`, `78` runners alcançados e `250/251` arquivos de teste alcançados) reconciliou a diferença entre ocorrências literais de `stdio: 'inherit'` e ausência real de auditoria TAP:

- **34 arquivos `scripts/qa-*.mjs`** continham a substring literal `stdio: 'inherit'`:
  - `1` apenas em comentário (`scripts/qa-tenant-postgres.mjs`), já auditando TAP;
  - `5` apenas no passo de migração SQL, já auditando TAP no passo `node --test` (`qa-staff-auth-postgres.mjs`, `qa-cli-v2-postgres.mjs`, `qa-ext02-third-parties-postgres.mjs`, `qa-ext03-biddings-postgres.mjs`, `qa-ux-public-routes-postgres.mjs`);
  - `1` runner SQL puro sem `node:test` (`qa-migrations-postgres.mjs`, `nao_aplicavel` a TAP);
  - `1` script local fora de CI (`qa-homologacao-local.mjs`);
  - `26` runners `qa-*.mjs` que realmente propagavam apenas o exit code de `node --test`.
- Além desses `26`, havia mais **6 runners alcançados** sem auditoria TAP estrita (`5` usando `options.stdio || 'inherit'` na família F03 / `qa-evidence-report.mjs`, e `1` usando `minimumCases: pattern ? 0 : 21` em `qa-ux-emergency-postgres.mjs`, cujo menor ramo condicional admite `0`) + **2 comandos diretos em `ci.yml`** sem runner TAP (`test:ux-pro-09e-pu4:browser` e `node --test tests/client-security.integration.test.mjs`, este último com `skip` condicional e sob investigação aberta de N8).

Retrato completo dos **244 comandos** antes e depois dos quatro lotes desta fatia:

| Métrica do mapa (`qa-ci-coverage-map.mjs`) | Antes da 06C (Etapa B) | Após Lote 4 |
|---|---:|---:|
| Comandos em workflows | 244 | 244 |
| `auditado_tap` (comandos) | 44 | **53** |
| `sem_auditoria_tap` (comandos, todos declarados) | 34 | **25** |
| `node_test_direto` (arquivos sem `skip` no fonte) | 94 | 94 |
| `nao_aplicavel` (build, typecheck, SQL, inventários, PGlite WASM, backup) | 72 | 72 |
| Runners em `scripts/*.mjs` (total / alcançados) | 115 / 78 | **116 / 79** |
| Runners alcançados `auditado_tap` | 35 | **44** |
| Runners alcançados `sem_auditoria_tap` | 32 | **24** |
| Entradas em `TAP_AUDIT_ALLOWLIST` | 34 | **25** |
| Pendências (`semAuditoriaTap`, `staleAllowlist`, `invalidAllowlist`, órfãos) | 0 | **0** |

---

## 2. Mudança no mapa de cobertura e detector estático

1. **`scripts/lib/qa-tap-summary.mjs`**:
   - Exportados `stripRunnerComments(source)` e `detectRunnerTapAudit(source)` para classificar runners **sem executar subprocesso algum**.
   - Comentários `//` e `/* */` são removidos antes de extrair arquivos de teste e pisos, evitando o falso positivo medido na 06B (citar `tests/x.mjs` ou `assertTapSummary` em comentário não executa teste nem audita TAP).
   - Pisos condicionais (`minimum: flag ? 27 : 25` ou `minimumCases: pattern ? 0 : 21`) são avaliados por `Math.min(...)` sobre todos os literais numéricos da expressão; se o menor valor for `< 1` (`0`), o runner cai em `sem_auditoria_tap` (preservando `floor === 0` em vez de descartá-lo por falsiness).
   - Constante `MINIMUM_CASES` isolada sem captura por pipe + verificação dos contadores (`pass`, `fail`, `skipped`, `todo`) **não** classifica como `auditado_tap`.
   - **Achado real pego pela prova negativa do Lote 1 e travado no detector:** `assertTapSummary(...)` devolve `{ ok: boolean, tests: number | null }` (objeto, sempre truthy em JavaScript). Na primeira escrita do Lote 1, `const tapOk = assertTapSummary(...); if (journey.code === 0 && tapOk)` imprimiu `QA_TAP_REFUSED` no stderr mas saiu `0` — imediatamente flagrado pela prova negativa real com arquivo all-skip. O bug foi corrigido para ler `tap.ok`, e `detectRunnerTapAudit` passou a exigir leitura explícita de `.ok` / `{ ok }` (ou `.problems` em `auditTapSummary`), classificando chamadas que descartam `.ok` como `sem_auditoria_tap`.
2. **`scripts/qa-ci-coverage-map.mjs` e `scripts/ci/coverage-allowlist.mjs`**:
   - Nova coluna `auditoria_tap` no CSV (`docs/CI-MAPA-COBERTURA-2026-11-07.csv`) e nova seção/tabela de resíduos TAP no relatório (`docs/CI-EQUIVALENCIA-COBERTURA-2026-11-07.md`).
   - Resolução transitiva de `npm run` encadeado (`npm test` → `npm run test:unit`).
   - Regra de falha fechada: qualquer comando `sem_auditoria_tap` ausente de `TAP_AUDIT_ALLOWLIST` reprova `failures.semAuditoriaTap`; entradas sem `ordem` ou com `motivo` curto (`< 20` caracteres) reprovam `failures.invalidAllowlist`; entradas cujo alvo já migrou para `auditado_tap` reprovam `failures.staleAllowlist`.
3. **`tests/qa-ci-coverage-map.test.mjs`** (`10 → 12` casos):
   - Cobertura explícita de runner só com exit code (`stdio: 'inherit'`), `MINIMUM_CASES` falso vs verdadeiro, `minimum:` condicional pelo menor valor, ramo `0` reprovado, chamada `assertTapSummary` sem `.ok` reprovada, comentários ignorados e ciclo completo de `tapAllowlist` (ausente → reprova; sem ordem/motivo → reprova; declarada → visível no CSV/relatório; migrada sem limpar allowlist → reprova como obsoleta).

---

## 3. Migração dos runners em lotes pequenos e resultados medidos

Em todos os runners PostgreSQL migrados foram preservados integralmente: recusa imediata de `DATABASE_URL`, `DATABASE_MIGRATION_URL` e `RUN_DATABASE_INTEGRATION_REMOTE=1` (exit `2` antes de criar sandbox/worker); wrapper POSIX `superviseLocalPg` antes de `import('embedded-postgres')`; `releaseSignalHandlers()` e guarda de arquivos gerados (E19); prazos por fase (`migrate: 90_000` onde aplicável e `test` original de cada gate); limpeza de diretórios temporários (incluindo `.next/integration-l07` no pai após `result.cleaned` no L07); e caminho Windows anterior preservado sem homologar. Nenhum caso foi removido, pulado, afrouxado ou teve timeout aumentado.

Para `test:ux-pro-09e-pu4:browser` (em `.github/workflows/ci.yml`), foi criado `scripts/qa-ux-pro-09e-pu4-browser.mjs` auditando o resumo TAP com piso medido `5` e preservando o contrato `UX_PU4_REQUIRE_BROWSER=1` em `package.json`. Nos workflows `admin-entry-delivery.yml`, `l02-l03-delivery.yml` e `l04-delivery.yml`..`l08-delivery.yml`, `'scripts/lib/qa-tap-summary.mjs'` foi incluído nos filtros `paths:`.

### 3.1. Tempos e pisos medidos (ambiente Linux x64, 2 vCPUs, 3,9 GiB RAM)

| Lote | Gate / Runner | Piso TAP medido | Baseline (parede) | Pós-migração isolado | Pós-migração sob 2 consumidores CPU | skip / fail / todo | Limpeza e gerados |
|---|---|---:|---:|---:|---:|---|---|
| Lote 1 | `test:ux-pro-09e-pu4:browser` (`scripts/qa-ux-pro-09e-pu4-browser.mjs`) | **5** (`5/5`) | 1,02 s | 1,35 s | 1,54 s | `0 / 0 / 0` | `next-env.d.ts` e `tsconfig.json` inalterados |
| Lote 1 | `test:admin-entry:pg` (`scripts/qa-admin-entry-postgres.mjs`) | **14** (`14/14`) | 70,30 s | 70,94 s | 89,52 s | `0 / 0 / 0` | `QA_PG_TEMP_CLEANED: true`; SHA-256 idênticos |
| Lote 2 | `test:l02-delivery:pg` (`scripts/qa-l02-delivery-postgres.mjs`) | **14** (`14/14`) | 11,62 s | 12,56 s | 17,76 s | `0 / 0 / 0` | `QA_PG_TEMP_CLEANED: true`; SHA-256 idênticos |
| Lote 2 | `test:l03-delivery:pg` (`scripts/qa-l03-delivery-postgres.mjs`) | **1** (`1/1` integral) | 49,62 s | 44,73 s | 66,41 s | `0 / 0 / 0` | `QA_L03_PG_TEMP_CLEANED: true`; SHA-256 idênticos |
| Lote 3 | `test:l04-delivery:pg` (`scripts/qa-l04-delivery-postgres.mjs`) | **20** (`20/20`) | 183,21 s | 181,93 s | 265,94 s | `0 / 0 / 0` | `QA_L04_PG_TEMP_CLEANED: true`; SHA-256 idênticos |
| Lote 3 | `test:l05-delivery:pg` (`scripts/qa-l05-delivery-postgres.mjs`) | **1** (`1/1` integral) | 21,48 s | 21,01 s | 31,99 s | `0 / 0 / 0` | `QA_L05_PG_TEMP_CLEANED: true`; SHA-256 idênticos |
| Lote 4 | `test:l06-delivery:pg` (`scripts/qa-l06-delivery-postgres.mjs`) | **9** (`9/9`) | 49,27 s | 50,14 s | 97,98 s | `0 / 0 / 0` | `QA_L06_PG_TEMP_CLEANED: true`; SHA-256 idênticos |
| Lote 4 | `test:l07-delivery:pg` (`scripts/qa-l07-delivery-postgres.mjs`) | **43** (`43/43`) | 136,29 s | 136,68 s | 240,78 s | `0 / 0 / 0` | `QA_L07_NEXT_DIST_CLEANED: true` + `QA_L07_PG_TEMP_CLEANED: true` |
| Lote 4 | `test:l08-delivery:pg` (`scripts/qa-l08-delivery-postgres.mjs`) | **54** (`54/54` em 4 subtestes) | 40,27 s | 39,75 s | 73,01 s (+ repetição isolada 43,95 s) | `0 / 0 / 0` | `QA_L08_PG_TEMP_CLEANED: true`; SHA-256 idênticos |

Nenhum skip real apareceu em nenhum dos 9 gates quando executados com seu banco descartável/navegador.

### 3.2. Provas negativas reais de skip (arquivo saindo `0` recusado pelo auditor)

Em todos os quatro lotes foi executada prova negativa **real** em subprocesso `node --test`:

- **Lote 1**: arquivo temporário real com `test(..., { skip: 'prova negativa 06C' }, ...)` saiu `0` no `node --test` puro (`# tests 1 / # pass 0 / # skipped 1`) e foi recusado por `node scripts/qa-ux-pro-09e-pu4-browser.mjs` com `QA_TAP_REFUSED` (`abaixo_do_piso, skipped, pass_diferente_de_tests`) e exit `1`; `tests/admin-entry.integration.test.mjs` sem `RUN_DATABASE_INTEGRATION` saiu `0` (`# skipped 14`) e foi recusado com exit `1`.
- **Lotes 2, 3 e 4**: cada uma das suítes `tests/l02-delivery.integration.test.mjs`..`tests/l08-delivery.integration.test.mjs` executada sem banco (`RUN_DATABASE_INTEGRATION=''`, e com `AWS_EXECUTION_ENV='AWS_Lambda_nodejs22.x'` para o caso 4 de smoke Chromium do L08) saiu **0** no `node --test` puro (`# skipped 14`, `1`, `20`, `1`, `9`, `43` e, no L08, `# tests 4 / # pass 2 / # skipped 2` vs piso `54`) — e **todas** foram recusadas pelo auditor TAP com `QA_TAP_REFUSED` e código de saída `1`.
- **Observação registrada na prova negativa direta do L08:** invocar `node --test tests/l08-delivery.integration.test.mjs` diretamente fora do runner `qa-l08-delivery-postgres.mjs` executa o 4º caso (`NEXT_DIST_DIR: '.next/l08-browser-smoke'`) sem a guarda E19 do runner e altera `next-env.d.ts`/`tsconfig.json`; quando executado pelo gate oficial `npm run test:l08-delivery:pg`, a guarda restaura `next-env.d.ts` (`1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b`) e `tsconfig.json` (`2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`), conferido em execução dedicada.

---

## 4. Fechamento local da fatia

- `npm test` integral: **1648/1648** (`0` falhas, `0` skips, `0` todo; +2 casos focais da 06C em `tests/qa-ci-coverage-map.test.mjs`; a primeira bateria do fechamento acusou falta de `import './qa-generated-files-guard.mjs'` no novo runner `scripts/qa-ux-pro-09e-pu4-browser.mjs` nas guardas E9/E19, corrigida e reexecutada até `1648/1648`).
- `node scripts/qa-ci-coverage-map.mjs --check`: **OK** (`244` comandos, `53` `auditado_tap`, `25` `sem_auditoria_tap` declarados, `250/251` arquivos de teste alcançados, `0` pendências).
- `npm run typecheck`: **exit 0**.
- `npm run build`: **exit 0** (build beta `noindex`).
- `npm run reaudit:sec`: **35/35** âncoras técnicas conferidas (não é pentest nem aceite humano).
- `node scripts/qa-wave0-static.mjs`: **5/5** verificações estáticas.
- Três inventários oficiais em `--check`:
  - `node scripts/requisitos-222-inventory.mjs --check`: **OK** (`1.748` arquivos varridos após `scripts/qa-ux-pro-09e-pu4-browser.mjs`; `222` IDs, `12` `a_revalidar` sem gate, classes `27/124/71`, aceite humano `0`);
  - `node scripts/ux-pro-00-inventory.mjs --check`: **OK** (`101` rotas distintas);
  - `node scripts/ux-pro-03-ti-inventory.mjs --check`: **OK**.
- Checagem final de higiene: `next-env.d.ts` e `tsconfig.json` nos hashes canônicos, sem sandboxes `/tmp/seg-qa-*` / `/tmp/seg-pg-*` nem processos descendentes órfãos.

### 4.1. Verificação remota na PR #352 e classificação de intermitência (commit `fc2a1f4`)

Na primeira rodada remota da PR **#352** (`head_sha` `fc2a1f47cf5f83b05596e4ba094f736c8e31cf4c`, árvore de código idêntica em todos os runs):

- **Todos os 56 workflows de `pull_request` fecharam `pass` na primeira tentativa** (`gh pr checks 352`), incluindo o `QA baseline` (`static-and-smoke`, run `42424886916`, `3m29s`), `backup-restore-postgres` (run `42424886898`, `2m34s`) e todos os gates migrados nesta fatia (`admin-entry-postgres-browser` run `42424887081` `1m34s`; `l02-l03-postgres` run `42424887056` `1m22s`; `crm-postgres-browser` L04 run `42424887115` `2m46s`; `contracts-postgres-browser` L05 run `42424887141` `1m15s`; `operations-postgres-browser` L06 run `42424887120` `1m50s`; `finance-postgres-browser` L07 run `42424887114` `3m14s`; `client-portal-postgres-browser` L08 run `42424887028` `1m20s`).
- **Ocorrência de intermitência classificada com prova (mesmo código `fc2a1f4`):** o `QA baseline` disparado pelo evento `push` na branch (run `42424842907`) aprovou os passos #1..#24 (incluindo `npm test`, `qa:ci-map:check` e o novo `test:ux-pro-09e-pu4:browser`) e falhou **apenas** no passo #25 `Client security regras 005/006 (embedded PostgreSQL, synthetic)` em **3 s** (`23:24:20Z → 23:24:23Z`), publicando o artifact `n8-client-security-trace` (`id: 13595038126`, `953 B`, `sha256:a44df4eb29f60ba91a2fe81156f53e065b441aff748a70ae8e182125ea104d3b`; download direto do ZIP bloqueado pelo allowlist de egress da sandbox). Trinta e oito segundos depois, no **mesmíssimo commit `fc2a1f4`**, o run irmão `42424886916` (`pull_request`) executou o mesmo passo #25 em **3 s** (`23:24:58Z → 23:25:01Z`) com `conclusion: success`. Classificação: ocorrência intermitente do **N8 residual** já aberto (mesma assinatura de 3–4 s observada nos runs `41552861728`, `41556745663` e `42416131441`), não causada pelas mudanças da 06C e **não encerrada**. Como o GitHub App desta sandbox não possui `actions:write` (`HTTP 403` em `/rerun`), este registro documental em `FATIA-06C.md` + `STATUS-VIGENTE.md` aciona nova rodada completa sem alterar nenhum arquivo de código.

---

## 5. Resíduos declarados para a fatia 06D e limites de honestidade

### 5.1. Resíduos declarados em `TAP_AUDIT_ALLOWLIST` (25 entradas)

Nenhum gate sem auditoria TAP está oculto; os **25 resíduos** remanescentes ficam publicados no CSV e no relatório com motivo e ordem de migração:

1. **`03-familia-f03` (4 runners)**: `scripts/qa-f03-{client-ticket-acceptance,contas-baixa-relatorio,employee-request-rh-return,lead-to-implementation}-postgres.mjs` (usam `options.stdio || 'inherit'` sem auditar resumo TAP).
2. **`04-familia-ux` (19 runners)**:
   - `scripts/qa-ux-emergency-postgres.mjs` (já audita TAP sem filtro com piso `21`, mas mantém `minimumCases: pattern ? 0 : 21`, cujo ramo filtrado tem piso `0`);
   - `18` runners `scripts/qa-ux-{adm,analytics,asset,bidding,client-admin,compliance,contract,crm,expansion,finance,fleet,hr,intel,knowledge,portal,quality,satisfaction,third-party}-postgres.mjs` (usam `stdio: 'inherit'` e suportam `UX_*_TEST_PATTERN`; `qa-ux-portal-postgres.mjs` exige cuidado adicional por memória/tempo na máquina de 3,9 GiB).
3. **`05-agregadores-e-n8` (2 itens)**:
   - `scripts/qa-evidence-report.mjs` (agregador `workflow_dispatch` de PLAT-01 em `plat01-dispatch.yml`);
   - `tests/client-security.integration.test.mjs` (executado diretamente com `node --test` em `ci.yml`, contém `skip` condicional e permanece sob investigação aberta de N8 — não tocar/mascarar sem resolver a causa raiz do N8).

Além disso, na `ALLOWLIST` estrutural da 06B continuam declarados `tests/lead-flow.integration.test.mjs` (exige `DATABASE_URL` do operador; coberto funcionalmente por `test:f03-lead-to-implementation:pg`) e os dois scripts manuais de evidência `qa:ux-pro-08d-evidence` e `ux:evidence`.

### 5.2. Limites inegociáveis

- **CI e mapa de cobertura não são aceite:** esta entrega não declara nenhum requisito ou superfície como homologado, conforme normas de acessibilidade ou aprovado por usuário.
- **Aceite humano:** permanece **0/222**; **produção permanece NO-GO**.
- **Pendências abertas:** `client-security`/N8 (incluindo a ocorrência pós-merge da PR #351 no run `42416131441`) e N9 seguem abertos; a fatia 05 permanece **67/68** (E6 administrativo bloqueado por OOM).
- **Não executado nesta sessão:** Windows real, UAT com usuários, leitor de tela, backup/restore operacional real com dados de produção, integrações externas reais (SMTP, fiscal, pagamento, WhatsApp, HERE, eSocial, CFTV, biometria, Ollama real) e operação real.
- **Precisão metodológica:** ausência literal de comando num workflow não significa orfandade quando o alvo entra por alias/runner, e arquivo de teste referenciado num gate não equivale a cenário de negócio aprovado por papel.
