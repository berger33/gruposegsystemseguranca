# Inventário por prova dos componentes órfãos de `/admin/ti`

## Decisão de negócio registrada em 2026-10-02

O proprietário decidiu **promover os 80 componentes por área somente com prova**, aplicando integralmente o critério de saída deste inventário. Nenhuma ordem entre as áreas foi declarada e não será presumida. Até cada promoção individual, os arquivos permanecem protótipos documentados, sem contar como funcionalidade entregue. Esta decisão resolve o destino da dívida, mas não comprova Windows nem fecha por si só o L07.

Levantado em 2026-10-02 no mesmo SHA da entrega ADM-01..12. **Prova aplicada
a cada arquivo** (reprodutível):

1. `src/app/admin/ti/page.tsx` é lido e dele se extraem os `import ... from "./X"`.
   Resultado: **0 imports**. Os 82 `*Client.tsx` do diretório (13.895 linhas) não
   são renderizados por nenhuma rota — a página de TI continua sendo um
   protótipo descritivo.
2. De cada componente extraem-se os caminhos `"/api/..."` efetivamente chamados
   e confere-se, em `server.mjs`, se o prefixo é roteado.
   Resultado: **nenhum componente aponta para uma API inexistente**; a lacuna é
   de interface ligada e provada, não de back-end.

Conclusão por prova: o conteúdo de TI não é "quase pronto"; é código sem rota,
sem teste e sem autorização exercida. Nesta entrega ele **não** foi ligado em
massa, porque ligar tela sem prova de papel, origem, fonte e drill-down
reintroduziria exatamente o problema que o L07 está fechando.

## Decisão por arquivo

| Componente | Linhas | Importado por alguma rota | APIs chamadas (todas roteadas) | Decisão |
| --- | ---: | --- | ---: | --- |
| `AdmAdvancedClient.tsx` | 221 | não | 7 | **Adaptado** — conteúdo reimplementado em `/admin/marcelo` (`MarceloPanel.tsx` + `src/server/adm-panel-api.mjs`), agora com papel/origem decididos no servidor, fonte e data-base por cartão, drill-down até o registro canônico e auditoria fail-closed. O arquivo antigo fica como protótipo substituído. |
| `AdmClient.tsx` | 210 | não | 6 | **Adaptado** — conteúdo reimplementado em `/admin/marcelo` (`MarceloPanel.tsx` + `src/server/adm-panel-api.mjs`), agora com papel/origem decididos no servidor, fonte e data-base por cartão, drill-down até o registro canônico e auditoria fail-closed. O arquivo antigo fica como protótipo substituído. |
| `AiRagClient.tsx` | 242 | não | 7 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `AstAdvancedClient.tsx` | 167 | não | 8 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `AstClient.tsx` | 182 | não | 9 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `AuditClient.tsx` | 99 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `BackupClient.tsx` | 66 | não | 0 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `BudgetClient.tsx` | 102 | não | 0 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `CatalogClient.tsx` | 98 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `CliAdvancedClient.tsx` | 168 | não | 6 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `CliClient.tsx` | 192 | não | 10 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `CliFinanceClient.tsx` | 229 | não | 9 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `CmsClient.tsx` | 55 | não | 3 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `CommercialLibraryClient.tsx` | 122 | não | 4 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `CommissionClient.tsx` | 151 | não | 4 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ConfigClient.tsx` | 166 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractAlertClient.tsx` | 125 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractAmendmentClient.tsx` | 141 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractClient.tsx` | 225 | não | 3 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractClosureClient.tsx` | 151 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractDetailsClient.tsx` | 151 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractDocObligationClient.tsx` | 99 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractFiscalClient.tsx` | 194 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractImplantationClient.tsx` | 161 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractManagementDiaryClient.tsx` | 108 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ContractStatusClient.tsx` | 117 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `CostParameterClient.tsx` | 163 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `DependencyClient.tsx` | 103 | não | 0 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `DiscountClient.tsx` | 195 | não | 3 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `EmpAdvanced2Client.tsx` | 331 | não | 3 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `EmpOpsClient.tsx` | 288 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `EmpPortalClient.tsx` | 283 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `EmpProfileClient.tsx` | 102 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `EmpPwaClient.tsx` | 341 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `EmpSelfClient.tsx` | 239 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `EmployeeComplaintClient.tsx` | 95 | não | 5 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `EnvClient.tsx` | 84 | não | 0 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `EquipmentClient.tsx` | 110 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ExtAdvancedClient.tsx` | 155 | não | 8 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ExtClient.tsx` | 224 | não | 12 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ExtReportingClient.tsx` | 150 | não | 8 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `FinAdvancedClient.tsx` | 220 | não | 9 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `FinBudgetClient.tsx` | 210 | não | 6 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `FinClient.tsx` | 185 | não | 8 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `FinManagementClient.tsx` | 191 | não | 8 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `HealthcheckClient.tsx` | 93 | não | 4 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `HrAbsenceClient.tsx` | 264 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `HrAdvancedClient.tsx` | 354 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `HrBenefitsClient.tsx` | 442 | não | 0 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `HrClient.tsx` | 140 | não | 3 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `HrRecruitmentClient.tsx` | 219 | não | 0 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `HrTerminationClient.tsx` | 161 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `HrTrainingClient.tsx` | 521 | não | 0 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `IncidentClient.tsx` | 158 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `InspectionClient.tsx` | 118 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `IntegrationLogClient.tsx` | 140 | não | 0 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `IntegrationsClient.tsx` | 75 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `LaborBudgetClient.tsx` | 156 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `LgpdRequestClient.tsx` | 131 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `MaintenanceDocClient.tsx` | 82 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `NotificationPreferencesClient.tsx` | 124 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `NotificationsClient.tsx` | 128 | não | 3 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ObservabilityClient.tsx` | 101 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `OpsAdvanced2Client.tsx` | 292 | não | 8 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `OpsAdvanced3Client.tsx` | 274 | não | 12 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `OpsAdvancedClient.tsx` | 207 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `OpsClient.tsx` | 247 | não | 0 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `OriginMetricsClient.tsx` | 83 | não | 3 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `PackageClient.tsx` | 73 | não | 3 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `PartnershipClient.tsx` | 155 | não | 6 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `PriceScenarioClient.tsx` | 12 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `PrivacyClient.tsx` | 139 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ProposalAcceptanceClient.tsx` | 132 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ProposalClient.tsx` | 229 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ProposalDeliveryClient.tsx` | 138 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `PubFaqAssistedClient.tsx` | 170 | não | 4 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `RbacClient.tsx` | 136 | não | 3 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ReportClient.tsx` | 134 | não | 7 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `RetentionClient.tsx` | 122 | não | 1 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `SeoClient.tsx` | 97 | não | 5 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `TechnicalBudgetClient.tsx` | 171 | não | 2 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |
| `ThemeClient.tsx` | 66 | não | 5 | Dívida explícita — não promovido nesta entrega (sem rota, sem teste, sem prova de autorização). |

## Resumo

- **Promovidos sem alteração: 0.** Nenhum componente passou no critério de ser
  ligado como está (nenhum tem prova de papel/origem/fonte/drill-down).
- **Adaptados: 2** (`AdmClient`, `AdmAdvancedClient`) — reimplementados no painel
  funcional do Marcelo e cobertos pelos subtestes ADM-01..12 do
  `test:l07-delivery:pg`.
- **Dívida explícita: 80** componentes / ~13,5 mil linhas, registrados aqui e no
  CHECKLIST. Critério de saída da dívida (igual ao aplicado em ADM-01..12):
  rota real, autorização decidida no servidor, indicador com fonte/período/data-base,
  drill-down até o registro canônico, erro de leitura declarado com retry e
  subteste no gate correspondente. Enquanto isso não existir, o arquivo
  permanece protótipo e **não** deve ser contado como funcionalidade entregue.
- Nenhum arquivo foi apagado: a remoção só é segura depois que cada área tiver
  sua tela provada, para não perder o rascunho de requisito que eles carregam.
