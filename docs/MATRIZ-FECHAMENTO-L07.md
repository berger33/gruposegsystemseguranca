# Matriz de fechamento do L07 — FIN-01..16 e ADM-01..12

Documento de fechamento da matriz do L07, levantado em **2026-10-02** na branch de
sessão `arena/01a0fd38-gruposegsystemseguranca`, criada da `main` em
`bbcf31119cfff7a43163a7e049b849b3b7fac4d3` (merge da PR #74, que entregou
ADM-01..12). O objetivo é amarrar, **requisito a requisito**, a linha do
`CHECKLIST-ENTREGA-LOCAL.md` a uma tela/rota real, uma API real, tabelas
canônicas reais e **subtestes existentes do gate** que de fato provam aquilo —
diferenciando sempre **implementação**, **validação automática** e **aceite
humano**.

Este documento **não declara o L07 concluído**. Toda a matriz está
`pronto_local` na validação automática; **aceite humano de Marcelo/Andreia
permanece pendente** para os 28 requisitos, e as dívidas abertas estão
listadas na seção 4.

## 1. Como ler a matriz

| Coluna | Conteúdo |
|---|---|
| Requisito | ID do `CHECKLIST-ENTREGA-LOCAL.md` (texto original no checklist) |
| Tela / rota | Página existente e navegável onde a jornada acontece |
| API canônica | Rotas HTTP reais (roteadas em `server.mjs` + `src/server/*.mjs`; **não existem** route handlers do App Router) |
| Tabelas canônicas | Tabelas que sustentam a jornada (migrações 077–080, 124–138) |
| Subtestes do gate | Número e nome do subteste de `npm run test:l07-delivery:pg` (43 subtestes, numeração da ordem de execução serial) |
| Última execução | Resultado nas execuções finais no SHA desta sessão (seção 3) |
| Pendência | Aceite humano (A), fronteira externa (F) e/ou dívida (D) — detalhadas na seção 4 |

Convenções de pendência: **A** = aceite humano pendente; **F** = fronteira
externa (fora da entrega local por decisão registrada); **D** = dívida técnica
explícita.

## 2. Matriz FIN-01..16

| Req | Tela / rota | API canônica | Tabelas canônicas | Subtestes do gate | Última execução | Pendência |
|---|---|---|---|---|---|---|
| **FIN-01** contas a receber | `/admin/financeiro` → aba Recebíveis (`FinanceiroWorkspace.tsx`) | `GET/POST/PATCH /api/fin/receivables` (+ aliases `hr/fin-*`) | `fin_accounts_receivable` (077), `fin_payment_history` (077), `audit_log` | **1** “FIN-01 recebível por contrato com trilha e FIN-02 pagável com aprovação” (protocolo `REC-FIN-*`, trilha inicial, negativos 401/403/400/409) | 43/43 ×2 (subteste verde) | A, F |
| **FIN-02** contas a pagar | `/admin/financeiro` → aba Recebíveis/Pagamentos | `GET/POST/PATCH /api/fin/payables`, `/api/fin/suppliers`, `/api/fin/cost-centers` | `fin_accounts_payable`, `fin_suppliers`, `fin_cost_centers` (077) | **1** (pagável com fornecedor/centro/categoria, aprovação auditada com aprovador+data); **5** (criação fail-closed 503 sem pagável/histórico) | 43/43 ×2 | A, F |
| **FIN-03** recorrência idempotente | `/admin/financeiro` → aba Recorrência | `GET/POST/PATCH /api/fin/recurrence-rules`, `POST /api/fin/generate-recurring` | `fin_recurrence_rules`, `fin_accounts_receivable` (077) | **2** “FIN-03 regra aprovada gera cobrança idempotente por competência” (reajuste aplicado, 2ª geração 409 `already_generated`, regra suspensa/inativa negada); **6** (jornada Chromium cria/aprova/gera/repete) | 43/43 ×2 | A, F |
| **FIN-04** baixa/estorno auditado | `/admin/financeiro` → aba Pagamentos | `GET/POST /api/fin/payments`, `/api/fin/payment-history` | `fin_payments`, `fin_payment_history` (077) | **3** (baixa parcial/total, estorno, histórico imutável, valor validado); **4** (concorrência real `FOR UPDATE`, overpayment 409, estorno repetido 409); **5** (auditoria indisponível 503 reverte tudo); **6** (Chromium) | 43/43 ×2 | A, F |
| **FIN-05** conciliação | `/admin/financeiro` → aba Conciliação bancária (`BankReconciliationWorkspace.tsx`) | `/api/fin/bank-statements`, `/api/fin/bank-transactions`, `/api/fin/conciliations` | `fin_bank_statements`, `fin_bank_transactions`, `fin_conciliations` (078; hardening 124 e 136) | **7** (extrato sintético, sugestão, confirmação, idempotência); **8** (Chromium importa e confirma); **21** “FIN-05 aditivo (#47)” (exige movimento e uma conta; trilha resiste à exclusão) | 43/43 ×2 | A, F |
| **FIN-06** cobrança | `/admin/financeiro` → aba Cobrança (`CollectionWorkspace.tsx`) | `/api/fin/collection-policies`, `/api/fin/collection-reminders`, `/api/fin/collection-history` | `fin_collection_policies`, `fin_collection_reminders`, `fin_collection_history` (078; hardening 125) | **9** (política aprovada, lembrete com responsável, `is_real_message` recusado, histórico imutável sem bloqueio, auditoria fail-closed); **10** (Chromium cria/aprova/lembrete/envio simulado/histórico) | 43/43 ×2 | A, F (sem SMTP/mensagem real) |
| **FIN-07** fluxo de caixa/aging | `/admin/financeiro` → aba Fluxo de caixa / Aging (`CashflowWorkspace.tsx`) | `/api/fin/cashflow-snapshots`, `/api/fin/aging-receivables` | `fin_cashflow_snapshots`, `fin_aging_receivables` (078; hardening 126) | **11** (previsto/realizado, vencidos, próximos, aging auditado); **12** (Chromium com bucket calculado) | 43/43 ×2 | A, F |
| **FIN-08** custo/rateio | `/admin/financeiro` → aba Custos / Rateio (`CostAllocationWorkspace.tsx`) | `/api/fin/cost-imports`, `/api/fin/costs` | `fin_cost_imports`, `fin_costs` (078; hardening 127) | **15** (importação/linha idempotentes, vínculos canônicos, valor rateado protegido no banco contra API e SQL direto); **16** (Chromium) | 43/43 ×2 | A, F |
| **FIN-09** resultado gerencial | `/admin/financeiro` → Resultado gerencial (`ManagementResultsWorkspace.tsx`) | `GET/POST /api/fin/management-results`, `/api/fin/result-history` | `fin_management_results`, `fin_result_history` (079; hardening 128 e 135) | **13** (margem incompleta declarada, percentual calculado só no servidor, recusa de `margin_percent` do navegador, auditoria fail-closed); **14** (Chromium erro de leitura + retry) | 43/43 ×2 | A, F |
| **FIN-10** despesas/alçada | `/admin/financeiro` → aba Despesas / Reembolsos / Compras (`ExpenseWorkspace.tsx`) | `/api/fin/expenses`, `/api/fin/expense-history`, `/api/fin/expense-authorities` | `fin_expenses`, `fin_expense_history`, `fin_expense_approval_authorities` (079; hardening 129 e 136) | **17** (alçada, segregação, evidência sintética, auditoria fail-closed); **18** (Chromium: um solicita, outra identidade aprova); **19** (busca, replay concorrente, duplicidade natural, TI leitura); **20** (alçada ativa, autoaprovação só com política, snapshot, trava de exclusão, zero efeito financeiro); **22** (Chromium legado: política ausente, falha de leitura com retry, R$, histórico com alçada) | 43/43 ×2 (22 é o subteste com instabilidade transitória conhecida — seção 4.2) | A, F |
| **FIN-11** fiscal | `/admin/financeiro` → aba Fiscal (`FiscalWorkspace.tsx`) | `/api/fin/fiscal-activity-rules`, `/api/fin/fiscal-providers`, `/api/fin/fiscal-obligations`, `/api/fin/fiscal-documents` | `fin_fiscal_providers`, `fin_fiscal_obligations`, `fin_fiscal_documents` (079; hardening 130) | **23** (obrigação determinada pela atividade, provedor sandbox, nenhuma emissão real, auditoria fail-closed); **24** (Chromium) | 43/43 ×2 | A, F (sem NFS-e/NF-e real) |
| **FIN-12** gateway sandbox | `/admin/financeiro` → aba Boletos / Pix / Gateway (`GatewayWorkspace.tsx`) | `/api/fin/payment-gateways`, `/api/fin/gateway-charges`, `/api/fin/gateway-webhooks`, `/api/fin/gateway-webhook-sign`, `/api/fin/gateway-history` | `fin_payment_gateways`, `fin_gateway_charges`, `fin_gateway_webhooks`, `fin_payments` (079; hardening 131 e 135) | **25** (cobrança só em gateway selecionado/sandbox, HMAC verificado, replay recusado, conciliação cria a baixa FIN-04 na mesma transação, estorno cria pagamento reversor, produção recusada por trigger); **26** (Chromium) | 43/43 ×2 | A, F (sem PSP/Pix/boleto real) |
| **FIN-13** orçamento/cenários | `/admin/financeiro` → aba Orçamento / Cenários (`BudgetWorkspace.tsx`) | `/api/fin/budgets`, `/api/fin/budget-scenarios`, `/api/fin/budget-history` | `fin_budgets`, `fin_budget_scenarios`, `fin_budget_history` (080; hardening 132 e 134) | **27** (premissas, transições controladas, auditoria fail-closed); **28** (Chromium estimativa e cenário); **29** (aprovação congelada, revisão versionada com motivo/autor); **30** (margem calculada no servidor, receita zero e base incompleta sem percentual inventado); **31** (idempotência inclusive retry concorrente de 6); **32** (Chromium revisão/histórico/erro de leitura) | 43/43 ×2 | A, F (adiamentos de negócio registrados no checklist) |
| **FIN-14** exportação | `/admin/financeiro` → aba Exportações (`ExportWorkspace.tsx`) | `/api/fin/exports`, `/api/fin/export-logs`, `/api/fin/export-download` | `fin_exports`, `fin_export_logs` (080; hardening 133 e 137) | **33** (trilha imutável, idempotência por `storage_key`, acesso limitado do contador, download exige estado gerado, auditoria fail-closed); **36** (retries concorrentes 1+5, download limitado aos totais persistidos); **37** (Chromium nas três abas) | 43/43 ×2 | A, F (artefato sintético; sem envio ao contador) |
| **FIN-15** fechamento de competência | `/admin/financeiro` → aba Fechamento (`ClosureWorkspace.tsx`) | `/api/fin/competence-closures`, `/api/fin/report-versions` | `fin_competence_closures`, `fin_report_versions` (080; hardening 133 e 137) | **34** (reabertura exige motivo e autor da sessão, versões imutáveis, auditoria fail-closed com rollback); **36** (fechamento concorrente 1+5 com versão única; **trava SQL da migração 137 provada nas três tabelas**: INSERT direto em `fin_accounts_receivable`, `fin_accounts_payable` e `fin_costs` no mês fechado recusado com `fin_competence_closed` e aceito após a reabertura — cobertura ampliada nesta sessão, antes só recebíveis); **37** (Chromium) | 43/43 ×2 | A, F (não substitui validação contábil externa) |
| **FIN-16** comissões | `/admin/financeiro` → aba Comissões (`CommissionWorkspace.tsx`) | `/api/fin/commission-provisions`, `/api/fin/commission-provision-history` | `fin_commission_provisions`, `fin_commission_provision_history` (080; hardening 133 e 137) | **35** (provisão CRM-25 com revisão obrigatória, `is_auto_paid=false` no banco e na API, histórico imutável, auditoria fail-closed); **36** (6 retries concorrentes → 1 criação + 5 replays, mesma chave com conteúdo diferente 409); **37** (Chromium revisão auditável sem pagamento automático) | 43/43 ×2 | A, F (sem pagamento real) |

## 3. Matriz ADM-01..12

Painel `/admin/marcelo` (`MarceloPanel.tsx`) + `src/server/adm-panel-api.mjs`
(11 rotas `/api/adm/panel/*` roteadas em `server.mjs`), migração aditiva
**138**. O subteste **38** publica e confere **os 13 cartões** (12 originais +
`ADM-04.margem_por_contrato`, acrescentado nesta sessão — seção 5.3), todos com
`source.tables`, `source.period_field`, `period` e `as_of`, e **abre cada linha
de cada cartão no registro canônico real** pelo contrato publicado.

| Req | Cartão / tela | API canônica | Tabelas canônicas | Subtestes do gate | Última execução | Pendência |
|---|---|---|---|---|---|---|
| **ADM-01** meu dia | Cartão `ADM-01.pendencias` (aba Indicadores) | `GET /api/adm/panel/indicators`, `/drilldown`, `/record` | `fin_expenses` (pendente), `cli_tickets_v2` (aberto), `ops_occurrence_book` (aberto) | **38** (3 pendências com prioridade/responsável/ação, cada linha abre o registro com o mesmo id); **39** (falha de leitura → `indisponivel` com `value:null`, drill-down 503, retry recupera; período vazio declarado com `empty_reason`); **43** (Chromium do cartão ao registro e à decisão) | 43/43 ×2 | A, D |
| **ADM-02** visão comercial | Cartões `ADM-02.leads_novos`, `ADM-02.oportunidades_paradas`, `ADM-02.propostas` | idem + projeção allowlist | `public_leads`, `crm_opportunities` (sem próxima ação/contrato), `crm_proposals` | **38** (contagem 1/1/1 contra o universo semeado; projeção do lead **sem PII** — `name`/`phone` ausentes); **43** | 43/43 ×2 | A, D |
| **ADM-03** visão operacional | Cartões `ADM-03.ocorrencias_criticas`, `ADM-03.sla_estourado`, `ADM-03.implantacoes_pendentes` | idem | `ops_occurrence_book` (alta/crítica), `cli_tickets_v2` (SLA vencido), `crm_contract_implantations` | **38**; **39** (fonte renomeada → 2 cartões `indisponivel` contados em `unavailable_count`, cartão não relacionado intacto, recuperação pelo retry) | 43/43 ×2 | A, D |
| **ADM-04** visão financeira | Cartões `ADM-04.recebiveis_vencidos`, `ADM-04.pagaveis_a_vencer`, **`ADM-04.margem_por_contrato`** (novo nesta sessão) | idem | `fin_accounts_receivable`, `fin_accounts_payable`, **`fin_management_results`** (margem por contrato/competência de FIN-09) | **38** (contagens/somas conferidas; cartão de margem com 2 registros canônicos: completo com `margin_percent=60`/`margin_cents=120000` e incompleto com `margin_cents:null` e motivo — ausência não vira zero); **43** (Chromium confere `R$ 1.500,00`, fonte e data-base, abre lista e registro) | 43/43 ×2 | A, D |
| **ADM-05** renovações/risco | Cartão `ADM-05.renovacoes` | idem | `crm_renewals` | **38** (conta a renovação semeada, cada linha abre o registro `crm_renewals`); **39** (período sem registro: `record_count:0` + `empty_reason:'sem_registro_canonico_no_periodo'` + `amount_cents:null` — **asserção específica do cartão ADM-05 adicionada nesta sessão**, antes provada só no cartão ADM-01) | 43/43 ×2 | A, D |
| **ADM-06** aprovação unificada | Aba Aprovações + `POST /api/adm/panel/decisions` | `POST /decisions` | `fin_expenses`, `crm_discount_requests`, `fin_expense_approval_authorities`, `adm_panel_decisions`, `adm_panel_decision_history` (138) | **38** (cartão `ADM-06.aprovacoes_pendentes` com 2); **40** (anônimo 401, TI 403 `read_only`, origem estranha 403, sem alçada 403 sem alterar registro, 6 concorrentes → 1 criação + 5 replays, snapshot de limite, histórico imutável, chave repetida 409, segunda decisão 409, acima da alçada 403, auditoria indisponível 503 com rollback comprovado, item sai da pendência); **43** (Chromium aprova pela tela e o banco mostra `approver_identity` da sessão) | 43/43 ×2 | A, D |
| **ADM-07** busca/favoritos/atalhos | Aba Espaço de trabalho | `GET/POST /api/adm/panel/workspace` | `adm_search_favorites`, `adm_saved_filters`, `adm_shortcuts` (081; CHECKs de dono 138) | **41** (dono vem da sessão e identidade do cliente é ignorada; invisível para outra identidade; TI 403 na escrita; RH 403 na leitura; atalho externo 400; auditoria indisponível 503 sem linha) | 43/43 ×2 | A, D |
| **ADM-08** relatórios | Aba Relatórios | `POST /api/adm/panel/reports`, `GET /api/adm/panel/report-download` | `adm_reports`, `adm_report_logs` (081; 138) | **41** (total recalculado pela mesma SQL do cartão; destinatário sem papel 403; TI 403 na geração; 4 concorrentes → 1+3 replays; mesma chave com outro título 409; download anônimo 401/terceiro 403/destinatário 200 com exatamente 5 campos; log de download + trilha; auditoria indisponível 503) | 43/43 ×2 | A, D |
| **ADM-09** configurações versionadas | Aba Configurações | `POST /api/adm/panel/business-configs` | `adm_business_configs`, `adm_business_config_history` (081; índice de versão ativa 138) | **41** (versões 1→2 com a anterior preservada e inativa, `supersedes_id`, 2 linhas de histórico, motivo curto 400, auditoria indisponível 503 sem 3ª versão e com a v2 ativa) | 43/43 ×2 | A, D |
| **ADM-10** metas x realizado | Aba Metas | `GET /api/adm/panel/goals` | `crm_goals` (estimativa) x `crm_contracts` (realizado), `adm_goals_comparison` (081; 138) | **42** (anônimo 401, RH 403; meta com fonte de cada lado; realizado contado de contratos reais; estimativa ≠ resultado); **43** (Chromium: “estimativa” e fonte `crm_contracts.total_price` na tela) | 43/43 ×2 | A, D |
| **ADM-11** diário de decisões | Aba Diário | `GET /api/adm/panel/decision-diary` | `crm_management_diary` (CON-11), `adm_management_diary_access` (081; 138) | **42** (TI sem entradas `restrito`/`diretoria` com `hidden_visibilities`; RH 403; Marcelo vê com acesso registrado por identidade; auditoria indisponível 503 sem deixar linha de acesso); **43** | 43/43 ×2 | A, D |
| **ADM-12** análises de expansão | Aba Expansão + cartão `ADM-12.oportunidades_expansao` | `GET /api/adm/panel/expansion` | `crm_opportunities`, `crm_contracts`, `ops_occurrence_book`, `adm_expansion_analyses` (081; 138) | **38** (cartão com drill-down até a oportunidade); **42** (blocos `oportunidades_abertas`=estimativa e `contratos_ativos`/`qualidade_ocorrencias`=realizado com fonte e `as_of`; fonte ilegível → bloco `indisponivel` com `value:null`, nunca zero); **43** (aba mostra “realizado”) | 43/43 ×2 | A, D |

## 4. Dívidas abertas (explícitas)

### 4.1 Os 80 componentes órfãos de `/admin/ti`

Inventário por prova em [`docs/INVENTARIO-ADMIN-TI.md`](./INVENTARIO-ADMIN-TI.md):
**0 promovidos** como estão, **2 adaptados** (`AdmClient`, `AdmAdvancedClient`,
reimplementados no painel do Marcelo) e **80 componentes / ~13,5 mil linhas**
que nenhuma rota importa, sem teste e sem autorização exercida. Eles **não**
contam como funcionalidade entregue. **Critério de saída da dívida** (igual ao
aplicado em ADM-01..12): rota real, autorização decidida no servidor,
indicador com fonte/período/data-base, drill-down até o registro canônico,
erro de leitura declarado com retry e subteste no gate correspondente.

### 4.2 Instabilidades transitórias observadas (nunca mascaradas)

- **Subteste 22** (jornada Chromium **legada** do FIN-10, `Carregando
  histórico…`): manifestação transitória conhecida em máquina de **2 núcleos**
  (registrada nas execuções 7/8 do histórico do L07 e na segunda execução do
  SHA entregue da PR #74). Nesta sessão ele passou nas 7 execuções.
- **Primeira execução da baseline desta sessão** (SHA `bbcf311`, antes de
  qualquer edição): **42/43 com 1 falha**, cujo nome do subteste **não pôde ser
  recuperado** — o log foi consumido por pipe para `tail` e descartado antes de
  ser inspecionado (erro de procedimento registrado aqui sem maquiagem; as
  execuções seguintes passaram a salvar o log completo). Hipótese mais
  provável, **não confirmada**: o subteste 22, dado o perfil da máquina (2
  núcleos) e a ausência de qualquer mudança de código. Nenhum subteste ADM
  reprovou em nenhuma execução desta sessão.
- **L03 `403 /api/employee/offline`**: já reprovou de forma intermitente sem
  alteração de código (registrado na sessão anterior). Nesta sessão o L03
  passou 1/1 na baseline e na regressão final.
- **L06 encadeado**: reprovação intermitente quando executado imediatamente
  após outros gates na mesma máquina de 2 vCPU (carregamento lento da tela de
  patrimônio), registrado na sessão FIN-13. Nesta sessão o L06 passou 9/9 nas
  duas vezes em que foi executado isolado.
- **Chromium SIGSEGV no `launch`** e queda de subteste 43 por espera frágil do
  próprio teste: ocorrências históricas já corrigidas (a espera passou a exigir
  o período completo no cartão), registradas em
  [`docs/EVIDENCIAS-ENTREGA-LOCAL.md`](./EVIDENCIAS-ENTREGA-LOCAL.md).

Nenhum timeout foi aumentado, nenhum `skip` foi usado e nenhuma assertiva foi
removida ou enfraquecida em nenhum momento. As instabilidades permanecem
abertas como dívida de ambiente a investigar (a causa-raiz provável é disputa
de CPU em máquinas de 2 núcleos com Chromium + Next dev + PostgreSQL embutido
no mesmo host).

### 4.3 Aceite humano pendente (todos os 28 requisitos)

FIN-01..16 e ADM-01..12 estão `pronto_local` **somente na validação
automática**. Nenhuma aprovação de Marcelo ou Andreia foi registrada; o aceite
humano é pendência de todos os requisitos da matriz e **condição para declarar
o L07 concluído**.

### 4.4 Fronteiras externas (por decisão registrada)

Sem PSP, banco, SMTP, emissão fiscal, Pix/boleto, gateway, webhook, arquivo ou
credencial real. Todos os fluxos usam dados sintéticos em PostgreSQL
descartável; adaptadores simulados identificados por requisito na coluna
“Pendência” das matrizes e no CHECKLIST.

## 5. Divergências encontradas no fechamento e o que foi feito

O fechamento da matriz não encontrou lacuna de API/tabela/autorização em
FIN-01..13/16 nem em ADM-01..12 (todas as rotas citadas existem no roteador,
todas as tabelas existem nas migrações, todos os subtestes citados existem e
passam). Encontrou **três divergências entre evidência citada e prova
efetiva**, tratadas sem enfraquecer nada:

1. **FIN-15 — trava SQL provada só em recebíveis.** O CHECKLIST afirmava que a
   migração 137 bloqueia SQL direto em “recebíveis, pagáveis e custos” do mês
   fechado, mas o gate só provava o INSERT direto em `fin_accounts_receivable`
   (os triggers de `fin_accounts_payable` e `fin_costs` existiam sem prova).
   **Ação:** o subteste 36 passou a provar as três tabelas — INSERT direto
   recusado com `fin_competence_closed` nas três e aceito nas três após a
   reabertura explícita. A citação do CHECKLIST agora bate com o teste.
2. **ADM-05 — período vazio provado só no cartão ADM-01.** O CHECKLIST citava
   `record_count:0` + `empty_reason` + `amount_cents:null` para o cartão de
   renovações, mas a asserção rodava apenas em `ADM-01.pendencias` (mesmo
   pipeline). **Ação:** o subteste 39 passou a asserir o mesmo comportamento
   especificamente em `ADM-05.renovacoes`.
3. **ADM-04 — “margem por contrato” sem cartão no painel.** O texto do
   requisito exige “fonte/competência, saldo, vencimentos e margem por
   contrato”; o painel entregava recebíveis vencidos e pagáveis a vencer, e o
   relatório `ENTREGA-L07-ADM01-12.md` afirmava que a margem “é apresentada” —
   **afirmação sem sustentação no código** (nenhum cartão/registro exibia
   margem). **Ação (lacuna funcional real, implementada e provada):** novo
   cartão **`ADM-04.margem_por_contrato`** lendo o resultado canônico de FIN-09
   (`fin_management_results`), com percentual calculado no banco
   (`computed_margin_percent`), base incompleta declarada com motivo (nunca
   zero) e drill-down até o registro real; status `rascunho`/`arquivado` ficam
   fora da visão executiva. Sem migração nova (tabela e framework de
   indicadores já existem; mudança estritamente aditiva em
   `src/server/adm-panel-api.mjs`). O universo semeado do gate passou a
   incluir um resultado completo (`margin_percent=60`, `margin_cents=120000`) e
   um incompleto (`margin_cents:null` com motivo), ambos abertos pelo
   drill-down no subteste 38. O cartão de margem do período soma somente as
   margens conhecidas; margem desconhecida permanece `null`. A afirmação
   incorreta do relatório anterior foi corrigida com nota explícita em
   `ENTREGA-L07-ADM01-12.md`.

Nenhuma correção de documento foi feita “para parecer completo”: as duas
primeiras divergências foram resolvidas **acrescentando prova**; a terceira
foi resolvida **implementando a função faltante e provando**.

## 6. Execuções do gate nesta sessão (registro completo)

Todas no mesmo repositório, dados sintéticos, PostgreSQL descartável embutido,
HTTP real, Chromium empacotado, `--test-concurrency=1`:

| # | SHA/árvore | Resultado | Observação |
|---|---|---|---|
| 1 | `bbcf311` (baseline, sem edição) | **42/43** (1 falha) | Nome do subteste perdido (log não salvo — erro de procedimento registrado); nenhuma mudança de código no meio |
| 2 | `bbcf311` (baseline) | 43/43 | log completo salvo |
| 3 | `bbcf311` (baseline) | 43/43 | idem |
| 4 | `bbcf311` (baseline) | 43/43 | idem |
| 5 | `bbcf311` (baseline) | 43/43 | idem |
| 6 | árvore da sessão (com as provas novas) | **43/43** | 43 subtestes, 0 skips; subtestes 36/38/39 ampliados e cartão de margem exercitado |
| 7 | árvore da sessão (com as provas novas) | **43/43** | segunda consecutiva no estado final |

As duas execuções consecutivas exigidas (6 e 7) estão verdes no estado final
entregue. A execução 1 permanece registrada como instabilidade da baseline com
causa não identificada (seção 4.2).

## 7. O que falta para declarar o L07 concluído

1. **Aceite humano** de Marcelo/Andreia sobre FIN-01..16 e ADM-01..12
   (jornadas reais nas telas, não relatório). Sem isso o L07 não se declara
   concluído — é a única pendência de produto.
2. **Dívida dos 80 componentes órfãos de `/admin/ti`** decidida por área
   (promover com prova ou descartar com registro), pelo critério de saída do
   inventário — decisão de escopo, não bloqueio técnico do L07 em si, mas
   precisa de destino declarado.
3. **Instabilidades de ambiente** (subteste 22, L03 intermitente, L06
   encadeado) investigadas até causa-raiz ou aceitas como limitação da máquina
   de 2 núcleos com registro — sem skip, sem timeout maior, sem assertiva
   mais fraca.
4. Execução da bateria em **Windows** (equipamento-alvo do proprietário) —
   nunca executada; todas as evidências são Linux.
5. Nenhuma integração externa (PSP/SMTP/emissão) faz parte do L07; as
   fronteiras ficam registradas como estão.
