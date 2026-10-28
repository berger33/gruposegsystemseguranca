# UX-PRO-03 — 3ª promoção "com prova": PLT-16 orçamento e uso

**Data:** 27/10/2026 · **Base:** `6b4212d` (PR #298) · **Branch:** `arena/6d37ed49-gruposegsystemseguranca`
**Fatia:** 1 família, 1 PR (escopo local, sem commit/push). Continuação de [`E17-UUID-VALIDACAO-RESULTADO-2026-10-27.md`](E17-UUID-VALIDACAO-RESULTADO-2026-10-27.md).

## 1. Por que esta família

Sem ordem de áreas declarada pelo proprietário, apliquei o critério das fatias anteriores — **menor risco com autorização já decidida no servidor** — e escolhi fechar o ciclo do E17:

| Critério | PLT-16 `BudgetClient` |
|---|---|
| Papel no servidor | **os três handlers** (`handleBudgets`, `handleMetrics`, `handleAlerts`) chamam `requireRole(sess,['admin','ti'])` |
| Contrato estável | migração `054-plt16-operational-budget.sql`; **5 orçamentos sintéticos** semeados |
| Fonte/período/data-base | `period_start`/`period_end`, `measured_at`, `created_at`, `source`, `threshold_value`/`current_value` |
| Drill-down natural | registro canônico em JSON de orçamentos, métricas e alertas |
| Fecha o E17 | `budget-api.mjs` estava entre os 7 módulos com `uuidRe` quebrado: **o PATCH de atualização de uso e o acknowledge de alerta** dependem dele. Esta fatia prova os dois pela interface |
| Ação externa | nenhuma: não contrata provedor, não envia mensagem, não executa cobrança |

**Candidata descartada nesta fatia:** `EnvClient` (PLT-17) também foi desbloqueada pelo E17, mas seu seed declara `production` com `has_real_data=true` e domínio real. Promovê-la poderia ser lido como configuração/virada de produção — fora do escopo autorizado. Fica para fatia própria, com aviso explícito de que a tela é inventário declarativo.

**Decisão de negócio preservada:** o seed cita um "teto R$200/mês" de planejamento anterior. A tela agora declara que os valores são **planejamento sintético** — não fatura, contrato, cobrança nem limite aprovado — e que o **teto de hospedagem depende de decisão do proprietário**, que segue em aberto. Nenhum valor foi promovido a decisão.

## 2. O que mudou (aditivo)

- **`src/app/admin/ti/BudgetClient.tsx`** — reescrito. O protótipo tinha hex inline, `style={{...}}`, `any`, `fetch` sem checar status, `<input>` sem rótulo e um único `<p>` para qualquer falha. Agora:
  - **quatro estados** de leitura via `UiState` (`loading`, `empty`, `error`, `denied`) com retry; mensagens/erros/rascunhos limpos na releitura manual, preservados no reload interno pós-mutação;
  - `Array.isArray` nas três listas, `sequence` descartando respostas fora de ordem, `aria-busy`, `role="status"`/`role="alert"`, `<label>` em todos os campos, `<details>` de drill-down ao JSON canônico;
  - **todos os contratos preservados**: GET nos 3 endpoints, POST de orçamento, PATCH de uso, POST de métrica e PATCH de acknowledge; tradução de `name_min_3`, `invalid_category`, `period_required`, `invalid_period`, `invalid_budgeted_amount`, `invalid_actual_amount`, `invalid_value`, `invalid_metric`, `invalid_id`, `not_found`, `no_changes`, `forbidden` etc.;
  - percentual calculado a partir de orçado × uso e aviso visual quando o limite é atingido; contador de alertas em aberto.
- **`src/app/admin/ti/BudgetClient.module.css`** (novo) — tokens `--ux-color-*`, breakpoints 900/650 px, `:focus-visible`, zero hex.
- **`src/app/admin/ti/TiConsole.tsx`** — 15ª aba `['orcamentos','Orçamento e uso']` no grupo "Saúde e operação".
- **`scripts/ux-pro-03-ti-inventory.mjs`** — terceira entrada em `PROMOCOES_COM_PROVA`; `--check` exige aba montada com `com_prova` **e** relatório no disco.
- **`tests/ux-pro-03-ti-reaudit.test.mjs`** — `EXPECTED_TABS = 15`.

**Preservado:** nenhuma migração, rota de API, RBAC, permissão, handler, segredo, dado de produção ou configuração foi alterado. Os 43 órfãos restantes continuam sem rota.

## 3. Os cinco critérios de 02/10 e suas provas

| Critério | Prova |
|---|---|
| Rota real | aba alcançável por teclado em `/admin/ti`, atrás de `AdminGate allowedRoles={['ti','admin']}` |
| Autorização decidida no servidor | `requireRole(sess,['admin','ti'])` nos 3 handlers; **HTTP real** no gate: `rh` recebe **403**, `ti` recebe **200** com as três listas |
| Fonte/período/data-base | cabeçalho nomeia `operational_budgets`, `usage_metrics`, `usage_alerts`; "Data-base: período do orçamento mais recente …; medição mais recente em …"; datas por registro |
| Drill-down ao registro canônico | `<details>` com JSON integral de cada orçamento, métrica e alerta |
| Erro de leitura com retry + subteste no gate | `503` → `data-ui-state="error"`; restauração do `fetch` real + retry → volta à leitura; `403` → `data-ui-state="denied"` distinto. Cenário no gate PostgreSQL 17 + Chromium |

## 4. Evidências

| Verificação | Resultado |
|---|---|
| Teste focal `tests/ux-pro-03-ti-budget-ui.test.mjs` | **RED 0/4 → GREEN 4/4** |
| Guarda de reauditoria (15 abas) | **3/3** — detectou a promoção e exigiu contagem/CSV |
| Cenário focal no gate | **1/1** |
| Gate completo `test:ux-portal:pg` | **39/39**, 0 falhas |
| `npm test` | **1084/1084**, 0 falhas/skips/todo (135 arquivos no `test:unit`) |
| `npm run typecheck` / `npm run build` | exit 0 / **105/105** páginas |
| `qa-wave0-static` / `ux-pro-00 --check` / `ux-pro-03 --check` | 5/5 / 100 rotas / 83 componentes, 3 promoções com relatório |
| `npm audit --audit-level=moderate` / `git diff --check` | 0 vulns / limpo |
| `next-env.d.ts` / `tsconfig.json` após o gate | SHA `1862ac4b…` / `2128c956…` intactos |

**Cenário A/B e escrita real (PostgreSQL descartável, Chromium):**
- **A** — orçamento/métrica/alerta `QA-PLT16-ALFA`; **B** — `QA-PLT16-BETA`. Em A os marcadores de B não aparecem; após trocar o banco e clicar "Atualizar leitura", os de A desaparecem — inclusive mensagens de operação e rascunhos de uso.
- **POST orçamento** e **POST métrica** pela interface → `201`; **PATCH uso** → `200` com alerta gerado pelo servidor ao atingir o limite; **PATCH acknowledge** → `200` com o alerta marcado como reconhecido. Este último é a prova ponta a ponta da correção **E17**: antes, qualquer UUID devolvia `400 invalid_id`.
- 320 / 390 / 768 / 1440 px: zero transbordo; foco na aba e ativação por `Enter`.
- `503` e `403` produzem estados distintos; retry recupera sem recarregar a página.

## 5. Limitações honestas

- O gate usa valores **sintéticos** e um cluster descartável; nenhum custo real, provedor ou fatura é consultado. A tela não coleta métricas automaticamente — todos os valores são informados pelo operador ou gerados pelo servidor a partir deles.
- A geração de alertas no servidor é uma heurística simples (comparação com `alert_threshold_percent`); não é faturamento, previsão de custo nem cotação de provedor.
- O **teto de hospedagem** e os provedores seguem como decisão pendente do proprietário; a tela declara isso explicitamente e não transforma o número do seed em verdade.
- `EnvClient` (PLT-17) continua órfão por decisão de escopo desta fatia, não por defeito técnico.
- Sem aceite humano, UAT, Windows real ou leitor de tela. **Produção: NO-GO.**

> **Atualização no mesmo dia:** a 4ª promoção (PLT-17 Ambientes e isolamento) elevou o console a **16 abas / 42 órfãos / 4 promoções**, gate **40/40** e `npm test` **1088/1088**. Ver `docs/UX-PRO-03-PROMOCAO-AMBIENTES-2026-10-27.md`.

## 6. Próxima fatia

Restam **42 órfãos** (o estado vigente após a 4ª promoção). `EnvClient` (PLT-17) foi promovido em seguida com o aviso de inventário declarativo; restam outras famílias de governança. Alternativamente, decidir o gate de papel de PLT-03 (`IntegrationsClient`), que continua aceitando qualquer sessão staff. Nenhuma ordem entre áreas foi inventada. Instrumento de estado: `docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv`/`.json`. Fila vigente: `docs/STATUS-VIGENTE.md`.
