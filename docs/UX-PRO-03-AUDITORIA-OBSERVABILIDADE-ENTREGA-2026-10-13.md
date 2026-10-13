# UX-PRO-03 — Auditoria e observabilidade

Data: 13/10/2026  
Base: `main` no commit `e899245` (após PR #198).  
Escopo: telas renderizadas “Auditoria” e “Observabilidade” do console TI. A revisão limita-se à apresentação, aos estados e ao download do JSON já fornecido pela API.

## Antes e depois

| Antes | Depois |
|---|---|
| Auditoria usava cabeçalhos em inglês, campos sem rótulos persistentes, datas e categorias comprimidas e texto que confundia lista vazia com falta de permissão. | Filtros possuem rótulos e ajuda; a tabela usa termos em português, total retornado, data legível, resultado com rótulo e estado vazio separado de falha. Erros conhecidos de sessão/permissão/serviço são apresentados separadamente. |
| A ação chamada “Exportar JSON” apenas recebia e descartava a resposta JSON da API, embora o servidor registrasse o evento. | A mesma chamada auditada gera agora download local do JSON retornado. A tela confirma a quantidade informada pelo endpoint sem alegar que o servidor gravou um arquivo. |
| Observabilidade expunha rótulos técnicos em inglês, valores sem hierarquia visual, listas compactadas e JSON de jobs/DB truncado junto ao resumo. | Indicadores operacionais priorizam volume, falhas, duração e alertas; agregados da última hora têm tabela própria. Requisições e JSON de eventos ficam em diagnósticos técnicos expansíveis. |
| Cores fixas, pouca diferenciação entre carregamento, erro e ausência de dados e controles compactos dificultavam uso em tema escuro, telas estreitas e teclado. | Layout usa tokens do console (incluindo tema noite), campos/ações com alvos maiores, foco visível, estados de carregamento/erro/vazio e reorganização mobile. |

## Comportamento preservado

- Auditoria continua consultando `GET /api/admin/audit` com os mesmos parâmetros (`action`, `result`, `actorKind`, datas e limite 100) e exportando via `POST /api/admin/audit/export` com `{ filters, format: "json" }`.
- A API continua sendo a autoridade para sessão, origem, papéis, filtros, limites e registro de `audit_query`/`audit_export`; a lista permanece em até 100 eventos e a exportação segue o limite existente de até 1.000.
- Observabilidade preserva `GET /api/admin/observability?type=...&limit=...` e `POST /api/admin/observability/alerts/:id` com `acknowledge` e `resolve`. Perfis autorizados e regras de servidor não foram alterados.
- A interface não afirma que métricas em memória sejam histórico persistente: diferencia agregados do banco (última hora) dos diagnósticos do processo e sinaliza campos indisponíveis com “—”.
- Nenhum endpoint, papel, permissão, migração ou dado foi adicionado. Não foram incluídos logs reais, segredos, IPs sem hash nem identificadores reais na documentação.

## Inventário técnico observado

- `AuditClient` é montado pelo console TI no grupo “Acesso e governança”; `ObservabilityClient` é montado no grupo “Saúde e operação”.
- O console também monta saúde do sistema, incidentes, registros de integração, backup, notificações, privacidade, tema, RBAC, RAG e fontes por pasta. Essas famílias não foram redesenhadas nesta entrega.
- A busca de referências encontrou `BudgetClient`, `SeoClient`, `RetentionClient` e `FinBudgetClient` apenas em suas próprias definições, sem montagem em rotas/console. Permanecem componentes não navegáveis; esta PR não os ativa nem os apresenta como funções disponíveis.
- `TechnicalBudgetClient`, `LaborBudgetClient`, `CatalogClient` e `ReportClient` são montados em `ComercialWorkspace`, dentro da área comercial, e não no console TI. A revisão visual dessas telas permanece pendente.

## Validação

- `node --test tests/ux-pro-03-audit-observability-ui.test.mjs` — 5/5 verificações focadas de contratos, rótulos/estados, separação entre resumo e diagnóstico, tokens, responsividade e foco.
- `npm test` — 895/898 passaram; três testes preexistentes de backup/objetos falharam ao criar symlinks no Windows (`EPERM`) em `qa-backup-coverage-inventory`, `qa-cli-v2-local-provider` e `qa-cli-v2-transfer`. Não envolvem os arquivos alterados nesta PR. O CI Linux deverá confirmar esses gates na PR.
- `node scripts/ux-pro-00-inventory.mjs --check` — aprovado após regenerar os CSVs; a única diferença é o uso de `UiField` na rota `/admin/ti`.
- `npm run typecheck` — aprovado.
- `npm run build` — aprovado; 105 páginas geradas.
- `git diff --check` — aprovado.
- Desktop/mobile: revisão dos breakpoints e grades no CSS; abaixo de 650px os filtros e cartões viram uma coluna, os controles ocupam a largura disponível e as tabelas mantêm rolagem horizontal. Não houve inspeção visual autenticada em navegador nesta sessão.
- Teclado: controles nativos com rótulos associados, submissão por Enter, detalhes expansíveis via `summary` e foco `:focus-visible`; a travessia manual completa não foi executada.

## Limitações e próxima etapa

Não houve sessão administrativa disponível para validar os dados reais da tela, as mutações de alerta ou o download de ponta a ponta no navegador. Os testes cobrem estrutura e contratos preservados, não substituem o aceite operacional nem a validação manual autenticada.

Esta entrega conclui somente as famílias RAG/fontes (PR #197), RBAC/governança (PR #198) e auditoria/observabilidade desta continuação de UX-PRO-03. Permanecem: orçamento técnico/relatórios na área comercial, SEO, retenção, catálogo, backup, integrações, notificações, privacidade e outros componentes técnicos renderizados; os componentes órfãos listados acima exigem uma decisão funcional própria antes de qualquer ativação. UX-PRO-03 ainda não está concluída.
