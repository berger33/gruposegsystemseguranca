# Matriz de fechamento — L07 (FIN-01..16 e ADM-01..12)

Data: 2026-10-02. Base: `main` `bbcf311` (merge da PR #74, que entregou ADM-01..12).
Branch de sessão: `arena/01a0fd4f-gruposegsystemseguranca`. Próxima migração livre: **139**.

Este documento liga, requisito a requisito, **o que existe de verdade** (tela, rota,
API, tabelas canônicas), **o que o gate prova** (subtestes existentes e vigentes do
`npm run test:l07-delivery:pg`, 43 subtestes) e **o que ainda falta** (aceite humano,
fronteira externa, dívida). Ele foi construído conferindo cada linha contra o código
(`src/app/admin/**`, `server.mjs`, `src/server/*.mjs`, `db/migrations/*.sql`) e contra
o corpo de cada subteste citado — nenhuma linha foi preenchida "para parecer completa".

**Como ler as colunas de pendência:**

- **Aceite humano**: Marcelo/Andreia **não validaram** nenhuma entrega L07. Todos os
  28 requisitos estão `pronto_local` apenas na validação automática. Nenhum aceite
  foi inventado nem presumido.
- **Fronteira externa**: o que deliberadamente **não** existe (PSP, banco, SMTP,
  emissão fiscal, webhook real, dados de cliente). Tudo é sintético, local, com
  PostgreSQL descartável.
- **Dívida**: trabalho registrado e não feito (ver seção 6).

## 1. FIN-01..16 — financeiro

Tela-base: `/admin/financeiro` (`src/app/admin/financeiro/page.tsx` →
`FinanceiroWorkspace.tsx`, 15 abas com `data-testid="finance-tab-*"`). As jornadas
Chromium do gate navegam por essas abas reais.

| Req. | Tela / aba | API canônica (módulo servidor) | Tabelas canônicas (migrações) | Subtestes do gate | Última execução | Pendência |
|---|---|---|---|---|---|---|
| FIN-01 | Aba **Recebíveis** | `GET/POST/PATCH /api/fin/receivables` (`fin-api.mjs` `handleReceivables`) | `fin_accounts_receivable`, `fin_payment_history` (077) | **1** (criação com contrato/competência/vencimento, protocolo `REC-FIN-*`, trilha `Criação inicial`, auditoria, validações 400, listagem por contrato; anônimo 401, `rh` 403, origem estranha 403), **6** (jornada Chromium) | 43/43 (2× consecutivas; ver §5) | Aceite humano; dados sintéticos |
| FIN-02 | Aba **Recebíveis** (pagáveis/fornecedores/centros pelo mesmo workspace) | `GET/POST/PATCH /api/fin/payables`, `/api/fin/suppliers`, `/api/fin/cost-centers` (`fin-api.mjs` `handlePayables` etc.) | `fin_accounts_payable`, `fin_suppliers`, `fin_cost_centers` (077) | **1** (pagável com fornecedor/categoria/centro, aprovação com motivo ≥10, aprovador+data gravados, auditoria; fornecedor duplicado 409; `rh` 403 leitura/escrita) | 43/43 (2×; §5) | Aceite humano; anexos e pagamentos externos sintéticos. Papel `ti` tem leitura na borda do servidor (`ensureAuth([admin,ti,financeiro])`), mas o gate não tem asserção dedicada de TI lendo pagáveis — a prova de TI-leitura do domínio FIN está em FIN-10 (subteste 19) e FIN-14 (subteste 33) |
| FIN-03 | Aba **Recorrência** | `GET/POST/PATCH /api/fin/recurrence-rules`, `POST /api/fin/generate-recurring` (`fin-api.mjs`) | `fin_recurrence_rules`, `fin_accounts_receivable` (077) | **2** (regra nasce não aprovada; geração antes de aprovação 400 `rule_not_approved`; aprovação + geração com reajuste 10% aplicado; `last_generated_competence` e aprovador registrados; regeneração 409 `already_generated`; exatamente 1 recebível por contrato/competência), **6** (Chromium cria/aprova/gera/repete) | 43/43 (2×; §5) | Aceite humano; cobrança externa inexistente (conta sintética explícita) |
| FIN-04 | Aba **Pagamentos** | `GET/POST /api/fin/payments`, `/api/fin/payment-history` (`fin-api.mjs` `handlePayments`) | `fin_payments`, `fin_payment_history`, `fin_accounts_receivable` (077; vínculos gateway 135) | **3** (baixa parcial, conclusão, estorno com histórico imutável e valor validado), **4** (baixas concorrentes → 201+409 `overpayment` sem efeito; estorno repetido 409 `estorno_already_exists`; estorno acima da origem 400; estorno em conta trocada 400 `estorno_account_mismatch`; sem pagamento órfão), **5** (auditoria indisponível → 503 e rollback integral da baixa), **6** (Chromium baixa/estorno) | 43/43 (2×; §5) | Aceite humano; sem gateway/banco reais (baixa de gateway é prova dos subtestes 25/26) |
| FIN-05 | Aba **Conciliação bancária** (`BankReconciliationWorkspace.tsx`) | `/api/fin/bank-statements`, `/api/fin/bank-transactions`, `/api/fin/conciliations` (`fin-advanced-api.mjs`) | `fin_bank_statements`, `fin_bank_transactions`, `fin_conciliations` (078; endurecimento 124; FKs RESTRICT e CHECK movimento–uma conta em 136) | **7** (extrato sintético, sugestão, confirmação, idempotência; duplicidades `storage_key`/`bank_ref`; anônimo/RH/origem negados), **8** (Chromium importa e confirma), **21** (conciliação exige movimento e exatamente uma conta; trilha resiste à exclusão da transação) | 43/43 (2×; §5) | Aceite humano; sem banco/provedor/arquivo/credencial de produção |
| FIN-06 | Aba **Cobrança** (`CollectionWorkspace.tsx`) | `/api/fin/collection-policies`, `/api/fin/collection-reminders`, `/api/fin/collection-history` (`fin-advanced-api.mjs`) | `fin_collection_policies`, `fin_collection_reminders`, `fin_collection_history` (078; 125) | **9** (política aprovada, lembrete com responsável, histórico imutável, `is_real_message=true` 400, auditoria fail-closed 503), **10** (Chromium cria/aprova/lembrete/envio simulado/histórico sem bloqueio) | 43/43 (2×; §5) | Aceite humano; envio é sempre transição local simulada (sem e-mail/WhatsApp/SMS) |
| FIN-07 | Aba **Fluxo de caixa / Aging** (`CashflowWorkspace.tsx`) | `/api/fin/cashflow-snapshots`, `/api/fin/aging-receivables` (`fin-advanced-api.mjs`) | `fin_cashflow_snapshots`, `fin_aging_receivables` (078; 126) | **11** (previsto/realizado, vencidos, próximos pagamentos, aging auditado), **12** (Chromium registra fluxo e aging com bucket calculado) | 43/43 (2×; §5) | Aceite humano; não integra banco real nem baixa recebíveis |
| FIN-08 | Aba **Custos / Rateio** (`CostAllocationWorkspace.tsx`) | `/api/fin/cost-imports`, `/api/fin/costs` (`fin-advanced-api.mjs`) | `fin_cost_imports`, `fin_costs` (078; 127) | **15** (custos por cliente/contrato/posto, importação idempotente, vínculos canônicos, valor rateado protegido no banco contra adulteração em API e SQL), **16** (Chromium registra importação e custo rateado) | 43/43 (2×; §5) | Aceite humano; só metadados/valores sintéticos; UUIDs opcionais de equipamento/supervisão sem catálogo canônico no rascunho (pendência registrada, não corrigida por decisão documentada) |
| FIN-09 | Aba **Resultado gerencial** (`ManagementResultsWorkspace.tsx`) | `/api/fin/management-results`, `/api/fin/result-history` (`fin-management-api.mjs`) | `fin_management_results`, `fin_result_history` (079; margem legada bloqueada em 135) | **13** (margem incompleta declarada, cálculo somente no servidor, auditoria transacional), **14** (Chromium declara base incompleta, mostra falha de leitura e retry) | 43/43 (2×; §5) | Aceite humano; resultado é dado sintético local |
| FIN-10 | Aba **Despesas / Compras** (`ExpenseWorkspace.tsx`; tipos despesa/reembolso/compra) | `/api/fin/expenses`, `/api/fin/expense-history`, `/api/fin/expense-authorities` (`fin-management-api.mjs`) | `fin_expenses`, `fin_expense_history`, `fin_expense_approval_authorities` (079; 129; snapshot de alçada/segregação/trava de exclusão em 136) | **17** (alçada, segregação, evidência sintética, auditoria fail-closed), **18** (Chromium: solicita e outra identidade aprova), **19** (busca textual, replay idempotente concorrente, duplicidade natural pendente, TI somente leitura), **20** (alçada ativa obrigatória, autoaprovação só com política, snapshot `authority_limit_cents` no histórico, `fin_expense_no_delete`, zero efeito financeiro), **22** (Chromium: política ausente, falha de leitura com retry, busca, valor em R$ pt-BR, histórico com "Alçada aplicada") | 43/43 (2×; §5) | Aceite humano; política padrão vazia (ausência nunca aprova); sem emissão fiscal/Pix/boleto/pagamento real |
| FIN-11 | Aba **Fiscal / Obrigações** (`FiscalWorkspace.tsx`) | `/api/fin/fiscal-activity-rules`, `/api/fin/fiscal-providers`, `/api/fin/fiscal-obligations`, `/api/fin/fiscal-documents`, `/api/fin/fiscal-history` (`fin-management-api.mjs`) | `fin_fiscal_activity_rules`, `fin_fiscal_providers`, `fin_fiscal_obligations`, `fin_fiscal_documents`, `fin_fiscal_history` (079; 130) | **23** (provedor e obrigação separados, obrigação determinada pela atividade — vigilância→NFS-e, venda→NF-e —, documento só sandbox sintético, auditoria fail-closed), **24** (Chromium determina obrigação pela atividade e registra documento sintético) | 43/43 (2×; §5) | Aceite humano; sem NFS-e/NF-e/certificado/ERP/transmissão reais |
| FIN-12 | Aba **Boletos / Pix / Gateway** (`GatewayWorkspace.tsx`) | `/api/fin/payment-gateways`, `/api/fin/gateway-charges`, `/api/fin/gateway-webhooks`, `/api/fin/gateway-history`, `/api/fin/gateway-webhook-sign` (`fin-management-api.mjs`) | `fin_payment_gateways`, `fin_gateway_charges`, `fin_gateway_webhooks` (079; 131; vínculos baixa/estorno em 135) | **25** (cobrança só após seleção+sandbox, HMAC verificado no servidor, payload divergente recusado, replay recusado, conciliação explícita cria a baixa FIN-04 na mesma transação, estorno reversor, auditoria fail-closed), **26** (Chromium seleciona, homologa sandbox, cria cobrança e concilia webhook assinado) | 43/43 (2×; §5) | Aceite humano; gateway/assinatura/pagamentos são simuladores locais (sem PSP/banco/adquirente/valor real) |
| FIN-13 | Aba **Orçamento / Cenários** (`BudgetWorkspace.tsx`) | `/api/fin/budgets`, `/api/fin/budget-scenarios`, `/api/fin/budget-history` (`fin-budget-api.mjs`) | `fin_budgets`, `fin_budget_scenarios`, `fin_budget_history` (080; 132; revisão/margem/idempotência em 134) | **27** (premissas, transições controladas, cenários permitidos, auditoria fail-closed), **28** (Chromium cadastra estimativa e cenário), **29** (aprovação congelada 409, revisão versionada com motivo/autor, nova aprovação obrigatória), **30** (margem calculada no servidor, receita zero e incompletude sem inventar percentual), **31** (idempotência por chave inclusive 6 chamadas concorrentes → 1 registro; conteúdo diferente 409), **32** (Chromium seleção/revisão/aprovação/histórico e erro de leitura em vez de lista vazia) | 43/43 (2×; §5) | Aceite humano; adiados por decisão de negócio: origem do número/data-base por cenário (#62), premissas estruturadas/aprovador distinto/mínimo 2 cenários (#59). Orçamento permanece estimativo |
| FIN-14 | Aba **Exportações** (`ExportWorkspace.tsx`) | `/api/fin/exports`, `/api/fin/export-logs`, `/api/fin/export-download` (`fin-budget-api.mjs`) | `fin_exports`, `fin_export_logs` (080; 133; idempotência concorrente em 137) | **33** (trilha imutável, idempotência por `storage_key`, acesso limitado do contador `is_accountant_limited`, transições controladas, TI leitura/escrita-negada), **36** (6 retries concorrentes → 1 criação + 5 replays; download anônimo 401/terceiro 403; artefato persistido com total exato; log de download), **37** (Chromium nas três abas) | 43/43 (2×; §5) | Aceite humano; artefato sintético, sem envio ao contador/storage externo |
| FIN-15 | Aba **Fechamento** (`ClosureWorkspace.tsx`) | `/api/fin/competence-closures`, `/api/fin/report-versions` (`fin-budget-api.mjs`) | `fin_competence_closures`, `fin_report_versions` (080; 133; trava SQL de competência em 137) | **34** (fechamento de competência, reabertura autorizada com motivo, versões preservadas, auditoria fail-closed), **36** (retry concorrente preserva uma única versão inicial; trava SQL bloqueia lançamento direto no mês fechado), **37** (Chromium) | 43/43 (2×; §5) | Aceite humano; fechamento não substitui validação contábil externa |
| FIN-16 | Aba **Comissões** (`CommissionWorkspace.tsx`) | `/api/fin/commission-provisions`, `/api/fin/commission-provision-history` (`fin-budget-api.mjs`) | `fin_commission_provisions`, `fin_commission_provision_history` (080; 133; `idempotency_key`+fingerprint em 137) | **35** (provisão CRM-25 com revisão obrigatória, sem pagamento automático, histórico imutável, auditoria fail-closed), **36** (6 retries concorrentes → 1 registro; `is_auto_paid=false` em todos; conflito de conteúdo 409), **37** (Chromium com revisão auditável) | 43/43 (2×; §5) | Aceite humano; baixa é registro manual após revisão (sem banco/PSP/Pix/boleto) |

## 2. ADM-01..12 — painel do Marcelo

Tela-base: `/admin/marcelo` (`src/app/admin/marcelo/page.tsx` → `MarceloPanel.tsx`,
abas Indicadores / Aprovações / Espaço de trabalho / Relatórios / Configurações /
Metas / Diário / Expansão). Papéis com acesso ao painel: `admin|marcelo|ti`
(TI estritamente leitura, `scope.can_decide=false` decidido no servidor); demais
papéis 403; anônimo 401.

| Req. | Tela | API canônica (`src/server/adm-panel-api.mjs`) | Tabelas canônicas (migrações) | Subtestes do gate | Última execução | Pendência |
|---|---|---|---|---|---|---|
| ADM-01 | Aba Indicadores, cartão `ADM-01.pendencias` | `GET /api/adm/panel/indicators`, `/drilldown`, `/record` | Fontes: `fin_expenses` (pendente), `cli_tickets_v2` (aberto), `ops_occurrence_book` (aberto) | **38** (3 pendências canônicas contadas; cada linha abre o mesmo `record_id` no registro canônico), **39** (fonte indisponível → `status:'indisponivel'`, `value:null`, drill-down 503; retry recupera), **43** (Chromium cartão→registro) | 43/43 (2×; §5) | Aceite humano; dívida §6 |
| ADM-02 | Cartões `ADM-02.leads_novos` / `oportunidades_paradas` / `propostas` | idem indicadores/drilldown/record | `public_leads`, `crm_opportunities`, `crm_proposals` | **38** (contagem 1/1/1 contra o universo semeado; origem declarada por cartão; projeção do lead **sem PII** — `name`/`phone` ausentes), **43** | 43/43 (2×; §5) | Aceite humano; dívida §6 |
| ADM-03 | Cartões `ADM-03.ocorrencias_criticas` / `sla_estourado` / `implantacoes_pendentes` | idem | `ops_occurrence_book`, `cli_tickets_v2`, `crm_contract_implantations` | **38** (contagens canônicas e drill-down), **39** (fonte ilegível → 2 cartões `indisponivel` com `value:null`, cartão não relacionado intacto, `unavailable_count:2`), **43** | 43/43 (2×; §5) | Aceite humano; dívida §6 |
| ADM-04 | Cartões `ADM-04.recebiveis_vencidos` / `pagaveis_a_vencer` (R$ pt-BR) | idem | `fin_accounts_receivable`, `fin_accounts_payable` | **38** (contagem e soma conferidas; competência/vencimento como campo de período), **43** (Chromium confere `R$ 1.500,00`, fonte `fin_accounts_receivable` e data-base no cartão) | 43/43 (2×; §5) | Aceite humano; dívida §6 |
| ADM-05 | Cartão `ADM-05.renovacoes` | idem | `crm_renewals` | **38** (renovação contada; linha abre registro `crm_renewals`; período sem registro → `record_count:0` com `empty_reason:'sem_registro_canonico_no_periodo'` e `amount_cents:null` — ausência não vira zero), **43** | 43/43 (2×; §5) | Aceite humano; risco só aparece com registro canônico que o justifique; reclamações reincidentes dependem de fonte canônica futura; dívida §6 |
| ADM-06 | Aba Aprovações | `POST /api/adm/panel/decisions` | `fin_expenses` + `fin_expense_history` + `crm_discount_requests` + `adm_panel_decisions` + `adm_panel_decision_history` (138) | **40** (anônimo 401; TI 403 `read_only`; origem estranha 403; sem alçada 403 sem alterar registro; 6 concorrentes → 1 criação + 5 replays do mesmo id; `authority_limit_cents` gravado; histórico imutável por gatilho; chave repetida com outro conteúdo 409; segunda decisão 409; acima da alçada 403; auditoria indisponível → 503 com rollback comprovado em banco; decidido sai do cartão), **43** (Chromium aprova pela tela; banco mostra `approver_identity` da sessão) | 43/43 (2×; §5) | Aceite humano; dívida §6 |
| ADM-07 | Aba Espaço de trabalho | `GET/POST /api/adm/panel/workspace` | `adm_search_favorites`, `adm_saved_filters`, `adm_shortcuts` (082; CHECK de dono em 138) | **41** (favorito nasce com `user_identity` da sessão mesmo com outra identidade no corpo; invisível para terceiros; TI 403 escrita; RH 403 leitura; atalho externo 400; auditoria indisponível → 503 sem linha) | 43/43 (2×; §5) | Aceite humano; dívida §6 |
| ADM-08 | Aba Relatórios | `POST /api/adm/panel/reports`, `GET /api/adm/panel/report-download` | `adm_reports`, `adm_report_logs` (082; idempotência/fingerprint em 138) | **41** (total recalculado igual ao cartão; destinatário sem papel 403; TI 403; 4 concorrentes → 1 criação + 3 replays; mesma chave com outro título 409; download anônimo 401/terceiro 403/destinatário 200 com exatamente 5 campos limitados; log de download + auditoria; 503 com rollback) | 43/43 (2×; §5) | Aceite humano; relatório é sintético, sem agendamento real nem envio; dívida §6 |
| ADM-09 | Aba Configurações | `POST /api/adm/panel/business-configs` | `adm_business_configs`, `adm_business_config_history` (082; índice de versão única ativa em 138) | **41** (versões 1→2 com anterior preservada e inativa; `supersedes_id`; 2 linhas de histórico; motivo curto 400; auditoria indisponível → 503 sem 3ª versão e com a 2ª ainda ativa) | 43/43 (2×; §5) | Aceite humano; dívida §6 |
| ADM-10 | Aba Metas | `GET /api/adm/panel/goals` | `adm_goals_comparison`; estimativa `crm_goals.target_value`, realizado `crm_contracts.total_price` (082; 138) | **42** (anônimo 401; RH 403; meta com fonte de cada lado; realizado contado de contratos reais; estimativa ≠ resultado), **43** (Chromium mostra "estimativa" e a fonte do realizado) | 43/43 (2×; §5) | Aceite humano; dívida §6 |
| ADM-11 | Aba Diário | `GET /api/adm/panel/decision-diary` | `crm_management_diary` (CON-11) + `adm_management_diary_access` (082; 138) | **42** (TI não vê entrada `restrito` (`restricted_visible:false`, `hidden_visibilities`) e vê a de equipe; RH 403; Marcelo vê a restrita com acesso registrado; auditoria indisponível → 503 sem linha de acesso) | 43/43 (2×; §5) | Aceite humano; dívida §6 |
| ADM-12 | Aba Expansão, cartão `ADM-12.oportunidades_expansao` | `GET /api/adm/panel/expansion` | `adm_expansion_analyses`; blocos de `crm_opportunities`/`crm_contracts`/`ops_occurrence_book` (082; 138) | **38** (cartão conta oportunidade e abre registro), **42** (blocos com tipo e fonte; `crm_opportunities` ilegível → bloco `indisponivel` com `value:null`, nunca zero; `analyses_empty_reason` quando vazio), **43** (Chromium exibe "realizado") | 43/43 (2×; §5) | Aceite humano; dívida §6 |

## 3. Cobertura integral do gate L07 (43 subtestes vigentes)

Mapeamento subteste → requisito, conferido no corpo de cada teste
(`tests/l07-delivery.integration.test.mjs`, ordem serial):

| # | Subteste (resumo) | Requisito(s) |
|---|---|---|
| 1 | Recebível com trilha + pagável com aprovação; negativos padrão | FIN-01, FIN-02 |
| 2 | Regra aprovada gera cobrança idempotente por competência | FIN-03 |
| 3 | Baixa parcial, conclusão e estorno com histórico imutável | FIN-04 |
| 4 | Concorrência, sobre-pagamento e estornos atômicos | FIN-04 |
| 5 | Auditoria indisponível → 503 reverte a baixa inteira | FIN-04 |
| 6 | Chromium: recorrência, duplicidade, baixa parcial e estorno | FIN-01..04 |
| 7 | Extrato sintético, sugestão, confirmação e idempotência | FIN-05 |
| 8 | Chromium importa e confirma conciliação | FIN-05 |
| 9 | Política de cobrança, lembretes, histórico imutável, fail-closed | FIN-06 |
| 10 | Chromium cria política, lembrete, envio simulado | FIN-06 |
| 11 | Fluxo previsto/realizado, vencidos, aging auditado | FIN-07 |
| 12 | Chromium registra fluxo e aging com bucket | FIN-07 |
| 13 | Resultado gerencial: margem incompleta, cálculo no servidor | FIN-09 |
| 14 | Chromium declara base incompleta, falha de leitura + retry | FIN-09 |
| 15 | Custos por cliente/contrato/posto e importação com rateio | FIN-08 |
| 16 | Chromium registra importação sintética e custo rateado | FIN-08 |
| 17 | Despesas com alçada, segregação, evidência, fail-closed | FIN-10 |
| 18 | Chromium solicita e outra identidade aprova | FIN-10 |
| 19 | Busca textual, replay concorrente, duplicidade natural, TI leitura | FIN-10 |
| 20 | Alçada ativa, autoaprovação configurada, snapshot, trava de exclusão | FIN-10 |
| 21 | Conciliação exige movimento e uma conta; trilha resiste à exclusão | FIN-05 |
| 22 | Chromium FIN-10: política ausente, retry, busca, R$, histórico | FIN-10 |
| 23 | Provedor/obrigação separados, obrigação pela atividade | FIN-11 |
| 24 | Chromium determina obrigação e registra documento sintético | FIN-11 |
| 25 | Gateway: seleção+sandbox, HMAC, replay, conciliação, fail-closed | FIN-12 (→ FIN-04) |
| 26 | Chromium seleciona, homologa, cobra e concilia webhook | FIN-12 (→ FIN-04) |
| 27 | Orçamento: premissas, transições, cenários, fail-closed | FIN-13 |
| 28 | Chromium cadastra estimativa e cenário | FIN-13 |
| 29 | Aprovação congelada, revisão versionada, nova aprovação | FIN-13 |
| 30 | Margem no servidor; receita zero/incompletude sem inventar | FIN-13 |
| 31 | Idempotência por chave, inclusive concorrente | FIN-13 |
| 32 | Chromium seleção, revisão, aprovação, histórico, erro de leitura | FIN-13 |
| 33 | Exportação: trilha, idempotência, contador limitado | FIN-14 |
| 34 | Fechamento de competência, reabertura, versões | FIN-15 |
| 35 | Provisão de comissão, revisão, sem pagamento automático | FIN-16 |
| 36 | Retries concorrentes, download limitado, trava SQL competência | FIN-14/15/16 |
| 37 | Chromium nas três abas (exportação/fechamento/comissão) | FIN-14/15/16 |
| 38 | Papéis, origem declarada e drill-down de cada indicador | ADM-01..05, ADM-12 |
| 39 | Falha de leitura não vira zero nem lista vazia; retry | ADM-01, ADM-03 |
| 40 | Decisão unificada: alçada, segregação, idempotência, fail-closed | ADM-06 |
| 41 | Escopo por identidade, relatório limitado, configuração versionada | ADM-07/08/09 |
| 42 | Meta × realizado, diário por permissão, análises dos módulos | ADM-10/11/12 |
| 43 | Chromium: do cartão ao registro e à decisão | ADM-01..12 |

Todo requisito FIN-01..16 e ADM-01..12 tem **pelo menos um subteste vigente**
que exercita tela/API/dados/autorização por HTTP real (e jornada Chromium onde
aplicável). Nenhum requisito ficou sem prova; nenhum subteste foi adicionado
apenas para constar.

## 4. Regras transversais comprovadas em todo o domínio

- **Autorização decidida no servidor**: anônimo 401, papel indevido 403,
  same-origin nas mutações (subtestes 1, 9, 11, 15, 17, 23, 25, 33, 38, 40, 41).
- **Auditoria na mesma transação, fail-closed**: `audit_log` indisponível →
  503 `audit_unavailable` com rollback completo, provado por HTTP e consulta
  direta ao banco (subtestes 5, 9, 17, 23, 25, 27, 33, 34, 35, 40, 41, 42).
- **Idempotência/concorrência**: retries sequenciais e concorrentes devolvem o
  mesmo registro e nunca criam duplicata (subtestes 4, 7, 19, 25, 31, 36, 40, 41).
- **Autoria derivada da sessão**: solicitante/aprovador/decisor/leitor sempre da
  identidade autenticada; identidade enviada pelo cliente é ignorada (subtestes
  1, 18, 36, 40, 41, 42, 43).
- **Ausência de dado nunca vira zero**: fonte ilegível → `indisponivel` com
  `value:null`/`amount_cents:null` + motivo; leitura falha na tela mostra erro
  com retry, nunca lista vazia (subtestes 13, 14, 22, 32, 37, 39, 42, 43).
- **Indicadores com período/fonte/data-base**: cada cartão publica
  `source.tables`, `source.period_field`, `period` e `as_of` (subtestes 38, 42, 43).
- **Migrações somente aditivas**: 077–080 (rascunho), 124–138 (endurecimento),
  constraints novas `NOT VALID`, nenhuma migração anterior reescrita.

## 5. Execuções desta sessão (mesmo SHA, mesmo ambiente)

Ambiente: Linux x86_64, 2 vCPU, 3,8 GiB RAM, Node v22.22.3, PostgreSQL 17.9
(`embedded-postgres`, cluster temporário por execução), Chromium empacotado.
Dados exclusivamente sintéticos. **O equipamento-alvo é Windows; nada aqui
comprova execução em Windows.**

Resultados consolidados no SHA entregue desta sessão estão registrados em
[`EVIDENCIAS-ENTREGA-LOCAL.md`](EVIDENCIAS-ENTREGA-LOCAL.md) (seção vigente) e no
relatório [`ENTREGA-L07-MATRIZ-FECHAMENTO.md`](ENTREGA-L07-MATRIZ-FECHAMENTO.md).

## 6. Dívidas abertas explícitas

1. **80 componentes órfãos de `/admin/ti`** (82 levantados, 2 adaptados para
   `/admin/marcelo`). Sem rota, sem teste, sem autorização exercida. Critério de
   saída já definido em [`INVENTARIO-ADMIN-TI.md`](INVENTARIO-ADMIN-TI.md):
   rota real, autorização no servidor, indicador com fonte/período/data-base,
   drill-down até o registro canônico, erro de leitura declarado com retry e
   subteste no gate correspondente. Enquanto não houver, permanecem protótipo e
   **não contam como funcionalidade entregue**. Nenhum arquivo foi apagado.
2. **Instabilidades de execução em máquina de 2 núcleos** (família
   "carregamento lento sob carga"):
   - L03 — `403 /api/employee/offline` intermitente: **não reapareceu** nas
     execuções desta sessão (1/1). Permanece registrada como instabilidade
     pré-existente a monitorar.
   - L07 subteste 22 (jornada Chromium legada do FIN-10, `Carregando histórico…`):
     **não reapareceu** (43/43 em todas as execuções desta sessão).
   - L06 subteste 9 (`Carregando operação…`): **reapareceu** nesta sessão quando
     encadeado após outros gates (8/9). Causa raiz investigada e corrigida nesta
     sessão: o subteste clicava/lia antes de o bootstrap do workspace concluir
     (as abas existem desde o SSR, o conteúdo só renderiza com `!loading`);
     os subtestes 1–8 do mesmo arquivo já esperavam seletores de conteúdo e o 9
     não esperava. Correção **do teste** (esperar `#posts-title` antes do clique
     e a seção alvo depois), no padrão do próprio arquivo: **nenhum timeout
     aumentado, nenhum skip, nenhuma assertiva removida ou enfraquecida** — a
     assertiva final permanece idêntica. Validação: L06 9/9 isolado e 9/9
     encadeado após os demais gates na mesma sequência que antes reprovava.
3. **Adiamentos de negócio registrados** (não são defeitos): FIN-13 origem do
   número/data-base por cenário e premissas estruturadas (#62/#59); FIN-08 UUIDs
   opcionais de equipamento/supervisão sem catálogo canônico; ADM-08 relatórios
   sem agendamento real nem envio (geração/download auditados apenas).

## 7. O que falta para declarar o L07 concluído

1. **Aceite humano** de FIN-01..16 e ADM-01..12 por Marcelo/Andreia (jornadas
   reais de negócio, inclusive em Windows). Hoje só existe validação automática.
2. Decisão sobre o **destino da dívida dos 80 órfãos** de `/admin/ti`
   (promover por área com prova, ou manter como protótipo documentado) — o
   critério de saída já está definido e não exige mudança técnica do L07.
3. Fechamento formal das **instabilidades residuais** de execução (L03 403 e
   L07-22 não reapareceram nesta sessão; L06-9 teve causa raiz corrigida;
   monitorar as próximas execuções).
4. Com 1–3 satisfeitos, o L07 pode ser declarado concluído e o **L08 (cliente e
   expansões)** iniciado conforme o roteiro de
   [`EXECUCAO-ENTREGA-LOCAL.md`](EXECUCAO-ENTREGA-LOCAL.md).

**Estado declarado: L07 NÃO está concluído. L08 NÃO foi iniciado.**
