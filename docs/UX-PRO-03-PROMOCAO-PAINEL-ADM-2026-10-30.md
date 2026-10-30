# UX-PRO-03 — 11ª promoção "com prova": ADM-01..06 no console de TI

**Data:** 30/10/2026 (America/Sao_Paulo)
**Branch:** `arena/b8c5e61a-gruposegsystemseguranca` (base `a646339ea366653f537126c1ec4d60cfda757f9a`, merge da PR #309)
**Fatia:** uma família por PR — `AdmClient` deixa de ser órfão e passa a montar o
painel ADM-01..06 como aba do `TiConsole`.
**Natureza:** promoção com prova (focal RED→GREEN + cenário de navegador).
**Não** é aceite humano, **não** é homologação e **não** marca item de produção.

---

## 1. O que foi entregue

| Item | Antes | Depois |
|---|---|---|
| `AdmClient.tsx` | órfão (211 linhas, protótipo com `style` inline, `alert`, `: any` e sem estados) | aba **Pauta, retratos e aprovações** (grupo *Gestão e aprovações*), 6 painéis independentes, 6 escritas preservadas + 3 transições + histórico |
| `AdmClient.module.css` | não existia | CSS module por tokens, `:focus-visible`, 2 breakpoints, sem hex |
| `TiConsole.tsx` | 23 abas | **24 abas** (`adm`), grupo novo, sem remover aba nem grupo |
| `src/server/adm-api.mjs` | 8 classes de escrita devolvendo **500** com mensagem SQL no corpo | recusa explícita **400** com motivo traduzido; a transição de aprovação passa a funcionar |
| `tests/ux-pro-03-ti-adm-painel-ui.test.mjs` | não existia | focal **11/11** (RED 0/11 na base → GREEN 11/11) |
| `tests/ux-portal-workspace.integration.test.mjs` | 48 cenários | +1 cenário de navegador **1/1** |
| `scripts/ux-pro-03-ti-inventory.mjs` | 10 promoções | **11 promoções** com relatório |

Contratos cobertos pela tela (sete despachos, todos já existentes no servidor):

`/api/adm/my-day` · `/api/adm/commercial-snapshots` ·
`/api/adm/operational-snapshots` · `/api/adm/financial-snapshots` ·
`/api/adm/renewal-risks` · `/api/adm/approvals` · `/api/adm/approval-history`

Escritas preservadas do protótipo e exercitadas no cenário: criação de pendência
da pauta, retrato comercial, retrato operacional, retrato financeiro, risco de
renovação e aprovação unificada. Acrescidas de forma aditiva: transição de
situação da pauta, revisão do nível de risco e decisão da aprovação (com
histórico), todas já autorizadas pelo handler.

---

## 2. Auditoria antes do código: por que esta família e não outra

A regra vigente é **uma família por PR, sem inventar ordem**. A seleção partiu de
varredura automática de todos os órfãos de `src/app/admin/ti` contra todas as
rotas vivas (`src/app`), procurando o mesmo critério que tirou a família `Fin*`
da fila em 29/10: **um órfão não pode ser promovido quando seus endpoints já têm
tela em uma rota real** — isso criaria duas interfaces sobre os mesmos dados.

| Candidato | Veredito | Motivo registrado |
|---|---|---|
| `FinBudgetClient` (FIN-13..16) | **Descartado** | `/admin/financeiro` já monta `BudgetWorkspace`, `ClosureWorkspace`, `CommissionWorkspace` e `ExportWorkspace` sobre exatamente `/api/fin/budgets`, `/budget-scenarios`, `/exports`, `/competence-closures`, `/report-versions`, `/commission-provisions` |
| `FinManagementClient` | **Descartado** | `/api/fin/management-results`, `/expenses`, `/fiscal-*`, `/gateway-*` já têm tela em `/admin/financeiro` |
| `AdmAdvancedClient` (ADM-07..12) | **Descartado** | `/api/adm/panel/*`, montado em `/admin/marcelo`, escreve as **mesmas tabelas**: `adm_search_favorites`, `adm_saved_filters`, `adm_shortcuts`, `adm_reports`, `adm_report_logs`, `adm_business_configs`, `adm_management_diary_access` e lê `adm_expansion_analyses` |
| `IntegrationsClient` (PLT-03) | **Bloqueado** | `integrations-api.mjs` aceita **qualquer sessão staff** (`requireAdminSession` não nominal). Mesmo bloqueio que tirou PLT-03/PLT-05/PUB-02/05 da fila — exige decisão do proprietário |
| `CliClient`, `CliFinanceClient` | **Bloqueado** | usam os aliases `/api/hr/cli-*`, que a borda legada de RH (`server.mjs`) nega com 403 para `ti`/`admin` (achado **E26**) |
| `OriginMetricsClient`, `SeoClient` | **Descartados por decisão** | registrado em `docs/CHECKLIST-ENTREGA-LOCAL.md` |
| `CmsClient`, `PackageClient` | **Descartados** | já têm rota real em `/admin/publicacao` |
| **`AdmClient` (ADM-01..06)** | **Escolhido** | nenhuma rota viva toca `adm_my_day_items`, `adm_commercial_snapshots`, `adm_operational_snapshots`, `adm_financial_snapshots`, `adm_renewal_risks`, `adm_approvals` e `adm_approval_history`; o handler nomeia papéis (`admin`, `ti`, `marcelo`, `financeiro`) e exige mesma origem na escrita |

---

## 3. Defeitos reais encontrados e corrigidos (medidos antes e depois)

Sonda HTTP contra **PostgreSQL 17 descartável** (`embedded-postgres`) e
`server.mjs` real, na base `a646339…`, executada **antes** de escrever qualquer
linha de código.

| # | Operação | Antes (medido) | Depois (medido) |
|---|---|---|---|
| D1 | `PATCH /api/adm/approvals` com **qualquer** situação, inclusive as válidas | **500** `internal` + `details: inconsistent types deduced for parameter $1` | **200** para `pendente/aprovado/rejeitado/cancelado`; **400** `invalid_status` fora do enum |
| D2 | `POST /api/adm/approvals` com `amount_cents > threshold_cents` | **500** + `details: violates check constraint "adm_approval_scope_check"` | **400** `approver_required_above_threshold_alcada` (código que o `PATCH` já usava) |
| D3 | `PATCH /api/adm/my-day` com situação fora do enum | **500** + `details: invalid input value for enum adm_task_status` | **400** `invalid_status` |
| D4 | `PATCH /api/adm/my-day` com prioridade fora do enum | **500** + `details: invalid input value for enum adm_priority` | **400** `invalid_priority` |
| D5 | `PATCH /api/adm/renewal-risks` com nível fora do enum | **500** + `details: invalid input value for enum adm_renewal_risk_level` | **400** `invalid_risk_level` |
| D6 | `PATCH /api/adm/renewal-risks` com pontuação fora de 0..100 | **500** + `details: violates check constraint adm_renewal_risks_risk_score_check` | **400** `risk_score_0_100` |
| D7 | `POST` com identificador inexistente (violação de FK) ou tipo de aprovação inválido | **500** + SQL | **400** `invalid_reference` / `invalid_approver_or_reference` / `invalid_approval_type` |
| D8 | `POST /api/adm/renewal-risks` com `contract_id`/`client_account_id` não-UUID ou data inválida | **500** + SQL | **400** `invalid_contract_id` / `invalid_client_account_id` / `invalid_renewal_date` |

**D1 era o mais grave:** como `$1` era usado simultaneamente em `status=$1` e em
`CASE WHEN $1='aprovado'` sem molde de tipo, **nenhuma** decisão de aprovação
(ADM-06) saía — a alçada nunca era exercitada. A correção molda
`$1::adm_approval_status` no `UPDATE` e `$3::adm_approval_status` no `INSERT` do
histórico; a mesma técnica já havia sido aplicada em `cli_ticket_status` na 7ª
promoção (28/10).

**D2 não é perda de capacidade:** a combinação "valor acima da alçada na criação"
nunca existiu — sempre devolvia 500. O aprovador continua sendo registrado na
decisão, como a constraint e o `PATCH` já determinavam.

As escritas válidas permanecem idênticas: o `UPDATE` mantém os mesmos campos, a
mesma ordem de parâmetros e o mesmo `audit_log`; só mudam o molde explícito dos
enums e a validação que passa a rodar **antes** de qualquer `INSERT`/`UPDATE`.

---

## 4. O que a tela faz (e o que não faz)

- **Seis leituras independentes**, cada uma com os quatro estados honestos
  (carregando / vazio / erro / negado) e seu próprio botão de repetir. Uma falha
  em um painel não derruba os outros.
- **Sequência contra resposta fora de ordem**: cada família tem seu contador
  (`sequences`) e o histórico tem o seu (`historySequence`); resposta atrasada é
  descartada.
- **Tradução dos motivos** na tela (39 motivos mapeados); o código cru do
  servidor nunca aparece para o operador.
- **Ausência honesta**: valor nulo vira "Não informado", nunca `R$ 0,00`, `0%` ou
  `01/01/1970`. Centavos são formatados em BRL; datas `DATE` são tratadas como
  dia escrito (`parseDateOnly`), não como instante.
- **A tela é mais estreita que a API**: `marcelo` e `financeiro` recebem 200 no
  servidor, mas não entram em `/admin/ti` (gate `['ti','admin']`) e não veem a
  aba; `comercial` recebe 403 na leitura e na escrita. Nada foi feito para
  equiparar a UI ao papel que a API autoriza — isso depende da matriz de
  autorização (fatia A3).
- **Limites declarados na própria tela**: os retratos são valores **declarados
  pelo operador** (não calculados dos módulos); não há envio de e-mail, gateway,
  upload ou integração; auditoria é tentativa, não garantia transacional;
  produção **NO-GO** e **0/222** com aceite humano.

---

## 5. Verificações executadas

| Verificação | Resultado |
|---|---|
| `node --test tests/ux-pro-03-ti-adm-painel-ui.test.mjs` na base (`git stash` dos 3 arquivos) | **RED 0/11** |
| Idem com a fatia aplicada | **GREEN 11/11** |
| `UX_PORTAL_TEST_PATTERN='UX-PRO-03: ADM' npm run test:ux-portal:pg` (PostgreSQL 17 descartável + Chromium real) | **1/1** |
| Sonda HTTP na base (`probe`, não versionada) | 8 classes de 500 confirmadas |
| Sonda HTTP depois da correção | 200/400 conforme a tabela da seção 3 |
| `npm run test:ux-portal:pg` completo | ver seção 6 |
| `npm test` | ver seção 6 |
| `npm run typecheck` | **exit 0** |
| `npm run build` | ver seção 6 |
| `node scripts/ux-pro-03-ti-inventory.mjs --check` | ver seção 6 |

---

## 6. Bateria final

| # | Comando | Resultado |
|---|---|---|
| 1 | `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test` | **1226/1226 pass, 0 fail** (37,4 s) — base era 1215; +11 do teste focal |
| 2 | `npm run typecheck` | **exit 0** |
| 3 | `npm run build` | **exit 0** (rotas preservadas; `/admin/ti` compila) |
| 4 | `node scripts/qa-wave0-static.mjs` | **5/5 OK**; 0 imports ausentes; migrações 001–181 contínuas |
| 5 | `node scripts/ux-pro-00-inventory.mjs --check` | **OK** |
| 6 | `node scripts/ux-pro-03-ti-inventory.mjs --check` | **OK** (84 componentes; 24 abas; 11 promoções com relatório) |
| 7 | `node scripts/requisitos-222-inventory.mjs --check` | **OK** (222 IDs; 20 `a_revalidar` sem gate) |
| 8 | `node scripts/ux-pro-10b-contrast-inventory.mjs --check` | **OK** |
| 9 | `npm run reaudit:sec` | **SEC_REAUDIT_CHECK_OK** — 3 artefatos, 35/35 âncoras |
| 10 | `node scripts/qa-generated-files-guard.mjs --check` | **OK** |
| 11 | `npm audit --audit-level=moderate` | **0 vulnerabilities** |
| 12 | `npm run test:ux-portal:pg` (PG 17 descartável + Chromium real) | **49/49 pass, 0 fail** (573 s) — o cenário novo é o `ok 49` |
| 13 | `git status` | apenas os 10 arquivos modificados + 3 novos desta fatia; nenhuma sonda temporária |

Três guardas precisaram ser atualizadas porque a fatia **soma** uma aba e um
teste focal — nenhuma delas foi afrouxada, todas ficaram **mais** exigentes:

- `tests/ux-pro-03-ti-reaudit.test.mjs`: `EXPECTED_TABS` 23 → **24**, e o nome do
  teste passa a citar "as 24 abas"; a guarda continua exigindo teste focal e
  despacho em `server.mjs` para **toda** aba renderizada (incluindo `adm`).
- `docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.{csv,json}` regenerados (a 11ª
  promoção entra em `promocoesComProva`; o `tiConsoleSha256` muda porque o
  `TiConsole` ganhou o `dynamic import`).
- `docs/REQUISITOS-222-INVENTARIO-2026-10-27.{csv,json}` regenerados (o teste
  focal novo menciona os IDs ADM; nenhum requisito mudou de estado).

---

## 7. Preservado sem alteração

- As **23 abas anteriores** do `TiConsole` e seus grupos (`--check` do
  inventário não permite remoção silenciosa).
- O gate de `/admin/ti`: `allowedRoles={['ti','admin']}` inalterado.
- Os **sete contratos** de API, seus verbos, campos, mensagens e o `audit_log`:
  nenhum campo foi renomeado, nenhum `INSERT`/`UPDATE` perdeu coluna.
- As regras de negócio existentes: alçada, segregação
  (`requester_approver_must_differ_segregacao`), duplicidade de data/competência
  (`409`) e exigência de motivo na decisão.
- As migrações **001–181** (nenhuma migração nova nesta fatia) e as **101 rotas**.
- `/admin/marcelo` e `/api/adm/panel/*` intactos — a aba nova não toca as tabelas
  do painel.
- **0/222 requisitos com aceite humano** e **20 `a_revalidar` sem gate**: esta
  fatia não promove nenhum requisito nem altera o inventário de 222 IDs.

## 8. Limites e dívidas registradas

1. **Vazamento residual de `details`:** os demais caminhos inesperados de
   `adm-api.mjs` ainda respondem `{error:'internal', details: e.message}`. A
   fatia corrigiu os oito caminhos que a tela exercita; trocar a forma do corpo
   nos ~30 `catch` restantes mudaria o contrato observado por outros consumidores
   e fica como dívida própria, fora desta PR.
2. **ADM-07..12 seguem sem tela própria**, e agora por motivo registrado: a rota
   `/admin/marcelo` já cobre aquelas tabelas.
3. **Sem cenário de leitor de tela, sem revisão WCAG manual, sem Windows.**
4. O retrato financeiro exibe `margin_by_contract` como JSON declarado; a tela
   não edita nem recalcula a margem.
5. A decisão "aprovado" acima da alçada pela interface exige que o operador
   informe o UUID do aprovador; não há seletor de pessoas nesta fatia.
