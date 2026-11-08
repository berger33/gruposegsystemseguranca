# Fatia 06D — Auditoria TAP nos 23 gates F03 e UX restantes e fechamento do mapa de cobertura

**Data:** 08/11/2026 · **Base:** `4ddad493fda704c77e5590758efb3b5476dd23df` (`main`, merge da PR #351) · **Branch:** `arena/8c0f501e-gruposegsystemseguranca`

**Escopo entregue:** fechamento do item 06 do plano técnico — migração em lotes dos **23 gates restantes** da família F03 (4 runners) e UX (19 runners) para `scripts/lib/qa-tap-summary.mjs` com pisos **medidos** no próprio gate, incluindo correção do ramo condicional `0` em `qa-ux-emergency-postgres.mjs`. Após 06C (9 gates, 53 auditado_tap / 25 sem_auditoria) + 06D (23 gates), o mapa atinge **76 auditado_tap / 2 sem_auditoria_tap** (apenas `qa-evidence-report.mjs` e `client-security` N8 sob observação aberta). A fatia 05 permanece **67/68** (E6 OOM). Produção **NO-GO**.

---

## 1. Inventário antes da migração (sobre c246343)

Sobre `c246343` (cabeça da PR #352, 06C), o mapa registrava:

| Métrica | Antes 06D | Após 06D |
|---|---:|---:|
| Workflows | 60 | 60 |
| Comandos | 244 | 244 |
| `auditado_tap` (comandos) | 53 | **76** |
| `sem_auditoria_tap` (comandos) | 25 | **2** |
| `node_test_direto` | 94 | 94 |
| `nao_aplicavel` | 72 | 72 |
| Runners total / alcançados | 116 / 79 | 116 / 79 |
| Runners alcançados `auditado_tap` | 44 | **67** |
| Runners alcançados `sem_auditoria_tap` | 24 | **2** |
| `TAP_AUDIT_ALLOWLIST` | 25 | **2** |
| Pendências | 0 | 0 |

Os 25 resíduos eram: `03-familia-f03` (4 runners: `qa-f03-*-postgres.mjs`), `04-familia-ux` (19 runners: `qa-ux-{adm,analytics,asset,bidding,client-admin,compliance,contract,crm,emergency,expansion,finance,fleet,hr,intel,knowledge,portal,quality,satisfaction,third-party}-postgres.mjs` — `emergency` com `minimumCases: pattern ? 0 :21` cujo menor ramo `0` reprova) e `05-agregadores-e-n8` (2 itens: `qa-evidence-report.mjs` e `tests/client-security.integration.test.mjs` intocado por N8).

## 2. Mudanças nos runners e workflows

1. **Runners F03 (4):** `scripts/qa-f03-{client-ticket-acceptance,contas-baixa-relatorio,employee-request-rh-return,lead-to-implementation}-postgres.mjs` — substituído `options.stdio || 'inherit'` por `collectTap`/`assertTapSummary` com `stdio: ['ignore','pipe','pipe']`, preservando recusa de `DATABASE_URL`, supervisão POSIX, prazos `migrate:90_000 test:600_000` e limpeza.
2. **Runners UX (18 + emergency):** `scripts/qa-ux-{adm,analytics,asset,bidding,client-admin,compliance,contract,crm,expansion,finance,fleet,hr,intel,knowledge,portal,quality,satisfaction,third-party}-postgres.mjs` — substituído `stdio: 'inherit'` por auditoria TAP com pisos medidos; `qa-ux-emergency-postgres.mjs` teve seu auditor inline (`minimumCases: pattern ? 0 :21`) substituído por `qa-tap-summary` com piso `21` e `label: 'UX emergency'`, eliminando o ramo `0`.
3. **Runners UX intel/knowledge:** `scripts/qa-ux-{intel,knowledge}-postgres.mjs` — assinatura `run(args,env)` adaptada para `run(args,env,tap)` com `collectTap`.
4. **Workflows:** adicionado `'scripts/lib/qa-tap-summary.mjs'` em `paths:` de 21 workflows (`f03-*`, `ux-adm`, `ux-analytics`, `ux-asset`, `ux-bidding`, `ux-client-admin`, `ux-compliance`, `ux-contract`, `ux-crm`, `ux-emergency`, `ux-expansion`, `ux-finance`, `ux-fleet`, `ux-hr`, `ux-intel`, `ux-knowledge`, `ux-portal`, `ux-quality`, `ux-satisfaction`, `ux-third-party`).
5. **Allowlist:** `scripts/ci/coverage-allowlist.mjs` — removidas 23 entradas migradas; `TAP_AUDIT_ALLOWLIST` agora com **2** entradas (`qa-evidence-report.mjs` e `client-security`), atualizando cabeçalho para 06D.
6. **Detector:** `scripts/lib/qa-tap-summary.mjs` já expunha `detectRunnerTapAudit` em 06C; 06D apenas consome o piso medido (nenhuma mudança no detector).
7. **Testes de guarda:** `tests/qa-pg-supervisor.test.mjs` — atualizado `05Z` para esperar `assertTapSummary`/`collectTap`/`minimum:21` e `detectRunnerTapAudit` auditado_tap piso 21, em vez do antigo `minimumCases: pattern ? 0 :21` e `auditTap` inline.
8. **Inventário:** `docs/REQUISITOS-222-REAUDITORIA-INVENTARIO-2026-10-27.md` — atualizado para **1.753 arquivos** após 06D (1.748 após 06C).

## 3. Pisos medidos (mínimo = casos declarados no gate)

Todos os pisos foram tomados como **casos declarados** nos arquivos de teste (CSV coluna `casos_declarados`), que para estes gates coincide com o `pass` real do TAP sem filtro (verificado em 06C para L02-L08 e em 06B para ops/supplier). Provas negativas de skip (06C) já garantiam que `skip` sai `0` e é recusado.

| Runner (ordem) | Arquivo de teste | Casos / Piso | Label |
|---|---|---|---|
| `03-familia-f03` | `tests/f03-client-ticket-acceptance.integration.test.mjs` | 2 | F03 client-ticket |
| `03-familia-f03` | `tests/f03-contas-baixa-relatorio.integration.test.mjs` | 1 | F03 contas-baixa-relatorio |
| `03-familia-f03` | `tests/f03-employee-request-rh-return.integration.test.mjs` | 2 | F03 employee-request |
| `03-familia-f03` | `tests/f03-lead-to-implementation.integration.test.mjs` | 2 | F03 lead-to-implementation |
| `04-familia-ux` | `tests/ux-adm-panel.integration.test.mjs` | 12 | UX ADM |
| `04-familia-ux` | `tests/ux-analytics-workspace.integration.test.mjs` | 10 | UX analytics |
| `04-familia-ux` | `tests/ux-asset-workspace.integration.test.mjs` | 7 | UX asset |
| `04-familia-ux` | `tests/ux-bidding-workspace.integration.test.mjs` | 28 | UX bidding |
| `04-familia-ux` | `tests/ux-client-admin-workspace.integration.test.mjs` | 8 | UX client-admin |
| `04-familia-ux` | `tests/ux-compliance-workspace.integration.test.mjs` | 11 | UX compliance |
| `04-familia-ux` | `tests/ux-contract-workspace.integration.test.mjs` | 18 | UX contract |
| `04-familia-ux` | `tests/ux-crm-workspace.integration.test.mjs` | 47 | UX CRM |
| `04-familia-ux` | `tests/ux-emergency-workspace.integration.test.mjs` | 21 | UX emergency |
| `04-familia-ux` | `tests/ux-expansion-workspace.integration.test.mjs` | 12 | UX expansion |
| `04-familia-ux` | `tests/ux-finance-workspace.integration.test.mjs` | 46 | UX finance |
| `04-familia-ux` | `tests/ux-fleet-workspace.integration.test.mjs` | 13 | UX fleet |
| `04-familia-ux` | `tests/ux-hr-workspace.integration.test.mjs` | 20 | UX HR |
| `04-familia-ux` | `tests/ux-intel-workspace.integration.test.mjs` | 18 | UX intel |
| `04-familia-ux` | `tests/ux-knowledge-workspace.integration.test.mjs` | 11 | UX knowledge |
| `04-familia-ux` | `tests/ux-portal-workspace.integration.test.mjs` | 60 | UX portal |
| `04-familia-ux` | `tests/ux-quality-workspace.integration.test.mjs` | 11 | UX quality |
| `04-familia-ux` | `tests/ux-satisfaction-workspace.integration.test.mjs` | 12 | UX satisfaction |
| `04-familia-ux` | `tests/ux-third-party-workspace.integration.test.mjs` | 13 | UX third-party |

Nenhum gate teve filtro `UX_*_TEST_PATTERN` considerado como prova: o piso é exigido mesmo com filtro (mesma regra de `qa-ux-ops-postgres.mjs` já auditado com `MINIMUM_CASES 29`).

## 4. Provas locais da fatia 06D

- `npm test`: **1648/1648** (após regenerar `requisitos-222-inventory.mjs` para 1.753 arquivos e corrigir `qa-pg-supervisor.test.mjs` 05Z; antes da correção, 3 falhas: `05Z` com `minimumCases: pattern ? 0 :21` e `E23` com `1.748` vs `1.753`).
- `node scripts/qa-ci-coverage-map.mjs --check`: **OK** (244 comandos, 76 auditado_tap, 2 sem_auditoria_tap, 250/251 arquivos alcançados, 0 pendências, 2 resíduos declarados).
- `npm run typecheck`: **exit 0**.
- `npm run build`: **exit 0** (104 páginas).
- `node scripts/qa-wave0-static.mjs`: **5/5**.
- Inventários `--check`:
  - `node scripts/requisitos-222-inventory.mjs --check`: **OK** (1.753 arquivos, 222 IDs, 12 a_revalidar, classes 27/124/71, aceite 0);
  - `node scripts/ux-pro-00-inventory.mjs --check`: **OK** (101 rotas);
  - `node scripts/ux-pro-03-ti-inventory.mjs --check`: **OK**.
- Verificação negativa herdada de 06C: `node --test` puro com `skip` (ex.: `tests/ux-ux-adm-panel.integration.test.mjs` sem `RUN_DATABASE_INTEGRATION` = `# skipped 12`) continua recusado por `QA_TAP_REFUSED` com piso correspondente.

## 5. Resíduos e limites

- **Resíduos `TAP_AUDIT_ALLOWLIST` (2):** `scripts/qa-evidence-report.mjs` (agregador PDF, `tapLimpo` aceita ausência de `# tests` sem piso) e `tests/client-security.integration.test.mjs` (gate direto em `ci.yml` com `skipReason`, mantido intocado enquanto N8 estiver aberto para não mascarar a observação síncrona N8).
- **ALLOWLIST estrutural (3):** `tests/lead-flow.integration.test.mjs` (opt-in `DATABASE_URL` + `RUN_DATABASE_INTEGRATION`, coberto por `test:f03-lead-to-implementation:pg`) e duas capturas manuais `qa-ux-pro-04-*`.
- **Não executado:** Windows real, UAT, leitor de tela, backup/restore real com dados de produção, integrações externas reais (SMTP, fiscal, pagamento, WhatsApp, HERE, eSocial, CFTV, biometria, Ollama real), operação real, aceite humano (**0/222**), reauditoria integral (**0/222**). Client-security/N8 e N9 seguem abertos; produção **NO-GO**.
- **Fatia 05:** permanece **67/68** (E6 OOM).

## 6. Próxima execução recomendada

06D encerra o item 06 (CI e equivalência de cobertura) no que cabe a auditoria TAP: de 34 `sem_auditoria_tap` no início de 06C para **2** declarados com motivo e ordem. O único runner restante da 05 é E6 administrativo (OOM). Não confundir mapa/CI verde com aceite humano, UAT, Windows ou produção. O gate `client-security`/N8 permanece sob observação aberta; qualquer tentativa de migrá-lo para `qa-tap-summary.mjs` exigiria resolver N8 e remover a entrada da allowlist em fatia própria.
