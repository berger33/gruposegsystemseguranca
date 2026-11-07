# Equivalência de cobertura da CI — mapa reproduzível (fatias 06B/06C)

**Gerado por:** `node scripts/qa-ci-coverage-map.mjs` · **Data da reconciliação:** 07/11/2026 · **Não é aceite humano, não é UAT e não substitui o TAP de nenhum gate.**

## Como ler

Cada linha do CSV é um comando realmente executado por um passo de workflow: `tipo` diz se é `npm` (script do `package.json`), `node-test` (arquivos nomeados direto no passo) ou `runner` (`node scripts/*.mjs`). A coluna `arquivos` lista os testes alcançados por aquele comando, `casos_declarados` soma as declarações `test(` desses arquivos, `auditoria_tap` classifica estaticamente se o resumo TAP é auditado e `piso_tap` mostra o piso numérico exigido pelo runner (`MINIMUM_CASES`, `MINIMO`, `minimum:` ou `pass < n`), quando existe — piso condicional aparece pelo menor valor, porque o mapa não escolhe caminho por conta própria.

Classes de `auditoria_tap`:

- `auditado_tap`: runner captura a saída (`collectTap` ou `pipe`), audita o resumo TAP (`skip`/`fail`/`todo` recusados) e exige piso numérico positivo (`>= 1`);
- `sem_auditoria_tap`: runner de jornada, gate npm dedicado ou jornada `.integration.test.mjs` que executa `node --test` sem auditar o resumo TAP (ou admite caminho condicional com piso `< 1`) — arquivo todo `skip` sairia com código `0`. Gate novo ou recém-ligado nesta classe **reprova** o mapa; os resíduos legados ficam declarados em `scripts/ci/coverage-allowlist.mjs` com motivo e ordem de migração, e viram `staleAllowlist` assim que migrados;
- `node_test_direto`: execução direta de `node --test` sobre testes unitários/estáticos (`*.test.mjs`, inclusive `npm test` → `test:unit`), cujo código de saída falha em `not ok` mas não audita `skip`/`todo` nem piso;
- `nao_aplicavel`: comandos que não usam `node:test`/TAP (`tsc`, `next build`, `qa-migrations-postgres.mjs` em SQL/clone, `qa-backup-restore-postgres.mjs`, `qa-pglite-schema.mjs`, `test:rag` sem `--test`, guardas estáticas e inventários).

`casos_declarados` é limite superior do que o arquivo declara, **não** prova de execução: um filtro de nome executado por um runner reduz o que roda, e quem mede isso é o TAP auditado em cada gate.

## Contagens

| Medida | Valor |
|---|---:|
| Workflows lidos | 60 |
| Jobs com comando | 60 |
| Passos com comando | 237 |
| Comandos mapeados | 244 |
| Comandos com auditoria TAP (`auditado_tap`) | 44 |
| Comandos sem auditoria TAP (`sem_auditoria_tap`) | 34 |
| Comandos `node --test` diretos (`node_test_direto`) | 94 |
| Comandos sem TAP aplicável (`nao_aplicavel`) | 72 |
| Scripts npm no manifest | 113 |
| Scripts de gate (`test:*`/`qa:*`/`reaudit:*`) | 90 |
| Scripts npm alcançados | 82 |
| Runners alcançados | 78 de 115 arquivos |
| Runners alcançados com auditoria TAP | 35 |
| Runners alcançados sem auditoria TAP | 32 |
| Resíduos `sem_auditoria_tap` declarados | 34 |
| Arquivos de teste alcançados | 250 de 251 |
| Casos declarados nos arquivos de teste | 2676 |

## Por workflow

| Workflow | Comandos | Gates/runners | Sem auditoria TAP | Arquivos de teste |
|---|---:|---:|---:|---:|
| `admin-entry-delivery.yml` | 1 | 1 | 1 | 1 |
| `backup-restore-delivery.yml` | 9 | 8 | 0 | 1 |
| `ci.yml` | 20 | 17 | 2 | 21 |
| `ext02-delivery.yml` | 2 | 2 | 0 | 1 |
| `ext03-delivery.yml` | 2 | 2 | 0 | 1 |
| `ext04-delivery.yml` | 2 | 2 | 0 | 1 |
| `ext05-delivery.yml` | 2 | 2 | 0 | 1 |
| `ext06-delivery.yml` | 2 | 2 | 0 | 1 |
| `ext07-delivery.yml` | 4 | 3 | 0 | 3 |
| `ext08-delivery.yml` | 2 | 1 | 0 | 3 |
| `ext11-delivery.yml` | 2 | 1 | 0 | 3 |
| `ext12-delivery.yml` | 2 | 1 | 0 | 3 |
| `ext13-delivery.yml` | 2 | 1 | 0 | 3 |
| `ext14-delivery.yml` | 2 | 1 | 0 | 3 |
| `ext15-delivery.yml` | 2 | 1 | 0 | 3 |
| `f03-finance-lead-delivery.yml` | 3 | 2 | 2 | 3 |
| `f03-ticket-employee-delivery.yml` | 3 | 2 | 2 | 3 |
| `fech-01-rag-widget-delivery.yml` | 6 | 4 | 0 | 5 |
| `l02-l03-delivery.yml` | 3 | 2 | 2 | 4 |
| `l04-delivery.yml` | 3 | 2 | 1 | 2 |
| `l05-delivery.yml` | 3 | 2 | 1 | 2 |
| `l06-delivery.yml` | 3 | 2 | 1 | 2 |
| `l07-delivery.yml` | 3 | 2 | 1 | 2 |
| `l08-delivery.yml` | 2 | 1 | 1 | 3 |
| `pendencies-delivery.yml` | 2 | 1 | 0 | 3 |
| `plat01-dispatch.yml` | 2 | 2 | 1 | 6 |
| `plt-jornadas-delivery.yml` | 4 | 4 | 0 | 4 |
| `ux-adm-delivery.yml` | 4 | 2 | 1 | 3 |
| `ux-analytics-delivery.yml` | 5 | 2 | 1 | 4 |
| `ux-asset-delivery.yml` | 3 | 2 | 1 | 2 |
| `ux-bidding-delivery.yml` | 4 | 2 | 1 | 4 |
| `ux-client-admin-delivery.yml` | 3 | 2 | 1 | 2 |
| `ux-compliance-delivery.yml` | 5 | 2 | 1 | 5 |
| `ux-continuity-client-delivery.yml` | 7 | 5 | 0 | 7 |
| `ux-continuity-delivery.yml` | 6 | 4 | 0 | 6 |
| `ux-contract-delivery.yml` | 4 | 2 | 1 | 3 |
| `ux-crm-delivery.yml` | 4 | 2 | 1 | 3 |
| `ux-emergency-delivery.yml` | 3 | 2 | 1 | 2 |
| `ux-expansion-delivery.yml` | 5 | 3 | 1 | 5 |
| `ux-finance-delivery.yml` | 4 | 2 | 1 | 3 |
| `ux-fleet-delivery.yml` | 5 | 2 | 1 | 4 |
| `ux-hr-delivery.yml` | 4 | 2 | 1 | 3 |
| `ux-intel-delivery.yml` | 4 | 2 | 1 | 3 |
| `ux-knowledge-delivery.yml` | 5 | 2 | 1 | 4 |
| `ux-layout-previews-a11y-delivery.yml` | 9 | 4 | 0 | 5 |
| `ux-ops-delivery.yml` | 4 | 2 | 0 | 3 |
| `ux-portal-delivery.yml` | 5 | 2 | 1 | 4 |
| `ux-pro-07d2-delivery.yml` | 3 | 2 | 0 | 2 |
| `ux-pro-07e1-delivery.yml` | 3 | 2 | 0 | 2 |
| `ux-pro-07e2-alvo-delivery.yml` | 3 | 2 | 0 | 2 |
| `ux-pro-07e2-delivery.yml` | 3 | 2 | 0 | 2 |
| `ux-pro-07f1-delivery.yml` | 4 | 2 | 0 | 3 |
| `ux-pro-e6-delivery.yml` | 3 | 2 | 0 | 2 |
| `ux-public-routes-delivery.yml` | 6 | 3 | 0 | 4 |
| `ux-public-routes-group2-delivery.yml` | 6 | 3 | 0 | 4 |
| `ux-public-routes-group3-delivery.yml` | 6 | 3 | 0 | 5 |
| `ux-quality-delivery.yml` | 5 | 2 | 1 | 4 |
| `ux-satisfaction-delivery.yml` | 5 | 2 | 1 | 5 |
| `ux-supplier-delivery.yml` | 5 | 3 | 0 | 5 |
| `ux-third-party-delivery.yml` | 6 | 3 | 1 | 5 |

## Pendências que reprovam o mapa

Nenhuma. Todo gate declarado tem caminho de execução, nenhum gate novo está sem auditoria TAP em silêncio e todo resíduo está declarado com motivo.

## Resíduos declarados sem auditoria TAP (ordem de migração)

| Ordem | Alvo | Tipo | Motivo |
|---|---|---|---|
| `01-ci-yml` | `test:ux-pro-09e-pu4:browser` | script | gate de navegador do `ci.yml` invoca `node --test` direto sem auditar resumo TAP; se a guarda de ambiente for removida ou um caso virar `t.skip`, `node:test` sai 0. Migrar na fatia 06C lote 1. |
| `02-familia-l-f01` | `scripts/qa-admin-entry-postgres.mjs` | runner | runner F01 herdado propaga apenas exit code (`stdio: inherit`) no passo `node --test`; arquivo todo `skip` sairia 0. Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C. |
| `02-familia-l-f01` | `scripts/qa-l02-delivery-postgres.mjs` | runner | runner L02 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C. |
| `02-familia-l-f01` | `scripts/qa-l03-delivery-postgres.mjs` | runner | runner L03 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C. |
| `02-familia-l-f01` | `scripts/qa-l04-delivery-postgres.mjs` | runner | runner L04 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C. |
| `02-familia-l-f01` | `scripts/qa-l05-delivery-postgres.mjs` | runner | runner L05 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C. |
| `02-familia-l-f01` | `scripts/qa-l06-delivery-postgres.mjs` | runner | runner L06 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C. |
| `02-familia-l-f01` | `scripts/qa-l07-delivery-postgres.mjs` | runner | runner L07 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C. |
| `02-familia-l-f01` | `scripts/qa-l08-delivery-postgres.mjs` | runner | runner L08 herdado usa `stdio: inherit` sem auditar resumo TAP (`skip`/`fail`/`todo`/piso). Migrar para `qa-tap-summary.mjs` com piso medido na fatia 06C. |
| `03-familia-f03` | `scripts/qa-f03-client-ticket-acceptance-postgres.mjs` | runner | runner F03 (chamado→atendimento→aceite) usa `options.stdio || inherit` sem capturar nem auditar resumo TAP. Migrar com piso medido. |
| `03-familia-f03` | `scripts/qa-f03-contas-baixa-relatorio-postgres.mjs` | runner | runner F03 (contas→baixa→relatório) usa `options.stdio || inherit` sem capturar nem auditar resumo TAP. Migrar com piso medido. |
| `03-familia-f03` | `scripts/qa-f03-employee-request-rh-return-postgres.mjs` | runner | runner F03 (solicitação colaborador→retorno RH) usa `options.stdio || inherit` sem capturar nem auditar resumo TAP. Migrar com piso medido. |
| `03-familia-f03` | `scripts/qa-f03-lead-to-implementation-postgres.mjs` | runner | runner F03 (lead→implantação) usa `options.stdio || inherit` sem capturar nem auditar resumo TAP. Migrar com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-adm-postgres.mjs` | runner | runner UX administrativo usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-analytics-postgres.mjs` | runner | runner UX analytics usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-asset-postgres.mjs` | runner | runner UX patrimônio/ativos usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-bidding-postgres.mjs` | runner | runner UX licitações usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-client-admin-postgres.mjs` | runner | runner UX administração de clientes usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-compliance-postgres.mjs` | runner | runner UX compliance usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-contract-postgres.mjs` | runner | runner UX contratos usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-crm-postgres.mjs` | runner | runner UX CRM usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-emergency-postgres.mjs` | runner | auditor inline usa `minimumCases: pattern ? 0 : 21`; pelo menor valor condicional (`0`), o caminho filtrado não garante piso mínimo positivo (`>= 1`). |
| `04-familia-ux` | `scripts/qa-ux-expansion-postgres.mjs` | runner | runner UX expansão usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-finance-postgres.mjs` | runner | runner UX financeiro usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-fleet-postgres.mjs` | runner | runner UX frota usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-hr-postgres.mjs` | runner | runner UX RH usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-intel-postgres.mjs` | runner | runner UX inteligência comercial usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-knowledge-postgres.mjs` | runner | runner UX base de conhecimento usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-portal-postgres.mjs` | runner | runner UX portal/TI console usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-quality-postgres.mjs` | runner | runner UX qualidade usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-satisfaction-postgres.mjs` | runner | runner UX satisfação usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `04-familia-ux` | `scripts/qa-ux-third-party-postgres.mjs` | runner | runner UX terceiros usa `stdio: inherit` e propaga apenas exit code sem auditar resumo TAP. Migrar por lote com piso medido. |
| `05-agregadores-e-n8` | `scripts/qa-evidence-report.mjs` | runner | gerador de PDF de evidência (`plat01-dispatch.yml`) extrai TAP quando presente, mas `tapLimpo` aceita ausência de `# tests` e não impõe piso numérico por passo. |
| `05-agregadores-e-n8` | `tests/client-security.integration.test.mjs` | teste | executado direto com `node --test` no `ci.yml` (possui `skipReason` por `RUN_DATABASE_INTEGRATION`), sem runner auditor; mantido sem edição de harness para não perturbar a observação síncrona N8 em aberto. |

## Allowlist declarada (sem execução automática)

| Alvo | Tipo | Motivo |
|---|---|---|
| `tests/lead-flow.integration.test.mjs` | teste | harness opt-in herdado: exige `DATABASE_URL` do operador e `RUN_DATABASE_INTEGRATION=1`, sem cluster descartável próprio; a jornada lead→implantação é exercitada por `test:f03-lead-to-implementation:pg` (cluster descartável + HTTP real). Residual declarado, não cobertura presumida. |
| `scripts/ux-pro-04-relatorios-browser-evidence.mjs` | runner | captura de evidência (gera PNG/JSON em `docs/`), não gate com veredito: rodar em CI produziria artefato sem asserção de jornada. Permanece comando manual documentado. |
| `scripts/ux-pro-04-pendencias-browser-evidence.mjs` | runner | captura de evidência do painel de pendências; mesma razão do anterior — evidência manual, não gate com veredito de jornada. |

## Alias de conveniência (alvos já alcançados por outro caminho)

`test:ux-pro-10b-keyboard` · `test:integration` · `qa:evidence` · `test:ux-pro-09e-pu4` · `test:ux-pro-09e-pu6` · `test:ux-pro-04-reports` · `qa:ux-pro-04-reports-browser` · `qa:ux-pro-04-pendencias-browser` · `test:ux-pro-09e-7` · `test:ux-public-routes:pg` · `qa:ci-map`

## Scripts fora do mapa (nem executados por workflow, nem citados por caminho alcançado)

Não reprovam por si: são utilitários de captura, paleta, inventário ou demonstração local, normalmente acionados à mão. Ficam listados para que a ausência seja **visível** em vez de silenciosa.

- `scripts/audit-ui-inventory.mjs`
- `scripts/e18-palette-contact-sheet.mjs`
- `scripts/e18-palette-live-preview.mjs`
- `scripts/e18-palette-options.mjs`
- `scripts/e18-palette-preview.mjs`
- `scripts/local-demo-showcase.mjs`
- `scripts/qa-time-clock-local-http.mjs`
- `scripts/requisitos-sec-evidence-run.mjs`
- `scripts/reset-demo-credentials.mjs`
- `scripts/ux-pro-10b-browser-evidence.mjs`
- `scripts/ux00-inventory.mjs`

## Limites deste mapa

- Não executa nada: comando presente no workflow não é comando aprovado, e a execução remota do GitHub Actions não foi observada nesta fatia.
- Filtros por nome (`--test-name-pattern`) e guardas de ambiente reduzem o que roda dentro de um arquivo; o mapa não tenta adivinhar a seleção — o piso TAP do runner é que a audita.
- Caminhos montados dinamicamente por template string em um runner não aparecem como referência literal e, por isso, não entram na contagem de arquivos daquele runner.
- Workflows acionados só por `workflow_dispatch` contam como caminho de execução automática apenas quando o próprio workflow o declara; o mapa lê o arquivo, não o histórico de execuções.
- Nada aqui cobre Windows, UAT, aceite humano, WCAG integral ou operação real.
