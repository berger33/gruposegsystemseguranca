# Equivalência de cobertura da CI — mapa reproduzível (fatia 06B)

**Gerado por:** `node scripts/qa-ci-coverage-map.mjs` · **Data da reconciliação:** 07/11/2026 · **Não é aceite humano, não é UAT e não substitui o TAP de nenhum gate.**

## Como ler

Cada linha do CSV é um comando realmente executado por um passo de workflow: `tipo` diz se é `npm` (script do `package.json`), `node-test` (arquivos nomeados direto no passo) ou `runner` (`node scripts/*.mjs`). A coluna `arquivos` lista os testes alcançados por aquele comando, `casos_declarados` soma as declarações `test(` desses arquivos e `piso_tap` mostra o piso que o runner audita (`MINIMUM_CASES` ou `minimum: …`), quando existe — piso condicional aparece pelo menor valor, porque o mapa não escolhe caminho por conta própria.

`casos_declarados` é limite superior do que o arquivo declara, **não** prova de execução: um filtro de nome executado por um runner reduz o que roda, e quem mede isso é o TAP auditado na fatia 06A.

## Contagens

| Medida | Valor |
|---|---:|
| Workflows lidos | 60 |
| Jobs com comando | 60 |
| Passos com comando | 237 |
| Comandos mapeados | 244 |
| Scripts npm no manifest | 113 |
| Scripts de gate (`test:*`/`qa:*`/`reaudit:*`) | 90 |
| Scripts npm alcançados | 82 |
| Runners alcançados | 78 de 115 arquivos |
| Arquivos de teste alcançados | 250 de 251 |
| Casos declarados nos arquivos de teste | 2674 |

## Por workflow

| Workflow | Comandos | Gates/runners | Arquivos de teste |
|---|---:|---:|---:|
| `admin-entry-delivery.yml` | 1 | 1 | 1 |
| `backup-restore-delivery.yml` | 9 | 8 | 1 |
| `ci.yml` | 20 | 17 | 21 |
| `ext02-delivery.yml` | 2 | 2 | 1 |
| `ext03-delivery.yml` | 2 | 2 | 1 |
| `ext04-delivery.yml` | 2 | 2 | 1 |
| `ext05-delivery.yml` | 2 | 2 | 1 |
| `ext06-delivery.yml` | 2 | 2 | 1 |
| `ext07-delivery.yml` | 4 | 3 | 3 |
| `ext08-delivery.yml` | 2 | 1 | 3 |
| `ext11-delivery.yml` | 2 | 1 | 3 |
| `ext12-delivery.yml` | 2 | 1 | 3 |
| `ext13-delivery.yml` | 2 | 1 | 3 |
| `ext14-delivery.yml` | 2 | 1 | 3 |
| `ext15-delivery.yml` | 2 | 1 | 3 |
| `f03-finance-lead-delivery.yml` | 3 | 2 | 3 |
| `f03-ticket-employee-delivery.yml` | 3 | 2 | 3 |
| `fech-01-rag-widget-delivery.yml` | 6 | 4 | 5 |
| `l02-l03-delivery.yml` | 3 | 2 | 4 |
| `l04-delivery.yml` | 3 | 2 | 2 |
| `l05-delivery.yml` | 3 | 2 | 2 |
| `l06-delivery.yml` | 3 | 2 | 2 |
| `l07-delivery.yml` | 3 | 2 | 2 |
| `l08-delivery.yml` | 2 | 1 | 3 |
| `pendencies-delivery.yml` | 2 | 1 | 3 |
| `plat01-dispatch.yml` | 2 | 2 | 6 |
| `plt-jornadas-delivery.yml` | 4 | 4 | 4 |
| `ux-adm-delivery.yml` | 4 | 2 | 3 |
| `ux-analytics-delivery.yml` | 5 | 2 | 4 |
| `ux-asset-delivery.yml` | 3 | 2 | 2 |
| `ux-bidding-delivery.yml` | 4 | 2 | 4 |
| `ux-client-admin-delivery.yml` | 3 | 2 | 2 |
| `ux-compliance-delivery.yml` | 5 | 2 | 5 |
| `ux-continuity-client-delivery.yml` | 7 | 5 | 7 |
| `ux-continuity-delivery.yml` | 6 | 4 | 6 |
| `ux-contract-delivery.yml` | 4 | 2 | 3 |
| `ux-crm-delivery.yml` | 4 | 2 | 3 |
| `ux-emergency-delivery.yml` | 3 | 2 | 2 |
| `ux-expansion-delivery.yml` | 5 | 3 | 5 |
| `ux-finance-delivery.yml` | 4 | 2 | 3 |
| `ux-fleet-delivery.yml` | 5 | 2 | 4 |
| `ux-hr-delivery.yml` | 4 | 2 | 3 |
| `ux-intel-delivery.yml` | 4 | 2 | 3 |
| `ux-knowledge-delivery.yml` | 5 | 2 | 4 |
| `ux-layout-previews-a11y-delivery.yml` | 9 | 4 | 5 |
| `ux-ops-delivery.yml` | 4 | 2 | 3 |
| `ux-portal-delivery.yml` | 5 | 2 | 4 |
| `ux-pro-07d2-delivery.yml` | 3 | 2 | 2 |
| `ux-pro-07e1-delivery.yml` | 3 | 2 | 2 |
| `ux-pro-07e2-alvo-delivery.yml` | 3 | 2 | 2 |
| `ux-pro-07e2-delivery.yml` | 3 | 2 | 2 |
| `ux-pro-07f1-delivery.yml` | 4 | 2 | 3 |
| `ux-pro-e6-delivery.yml` | 3 | 2 | 2 |
| `ux-public-routes-delivery.yml` | 6 | 3 | 4 |
| `ux-public-routes-group2-delivery.yml` | 6 | 3 | 4 |
| `ux-public-routes-group3-delivery.yml` | 6 | 3 | 5 |
| `ux-quality-delivery.yml` | 5 | 2 | 4 |
| `ux-satisfaction-delivery.yml` | 5 | 2 | 5 |
| `ux-supplier-delivery.yml` | 5 | 3 | 5 |
| `ux-third-party-delivery.yml` | 6 | 3 | 5 |

## Pendências que reprovam o mapa

Nenhuma. Todo gate declarado tem caminho de execução e todo arquivo de teste é alcançado ou está na allowlist com motivo.

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
