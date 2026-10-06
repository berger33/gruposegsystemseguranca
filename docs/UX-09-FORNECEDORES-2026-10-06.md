# UX-09 — Fornecedores (EXT-04)

**Rota:** `/admin/fornecedores`  
**Servidor canônico:** `src/server/ext-supplier-api.mjs`  
**Data:** 2026-10-06  
**Aceite humano:** **PENDENTE**. Marcelo e Andreia não participaram; nada é homologação.

## 0. ETAPA 0 — inventário antes da edição

A leitura local foi atualizada com `git fetch origin main`; `origin/main` está no merge da PR #175 (`d166b858499379e4e4ef7fc4e069c9ae2d618794`). Não havia alteração local a descartar. A rota administrativa real é `/admin/fornecedores`, montada por `FornecedoresWorkspace` sob `AdminGate` com `admin`, `marcelo` e `ti`.

`server.mjs` importa `createExtSupplierApi` de `./src/server/ext-supplier-api.mjs` e o constrói com `pool: getPool()`, `sameOrigin` e `requireSession: readSession`. O dispatch confirmado é:

- `GET /api/ext/supplier/references` → `handleReferences`;
- `GET /api/ext/supplier/quotations` → `handleQuotations`;
- `POST /api/ext/supplier/suppliers/{supplierId}/products/{productId}/quotations` → `handleCreateQuotation` (201);
- `GET /api/ext/supplier/quotations/{id}` → `handleQuotationById`;
- `POST /api/ext/supplier/quotations/{id}/status` → `handleQuotationStatus` (200);
- `POST /api/ext/supplier/quotations/{id}/decision` → `handleQuotationDecision` (200);
- `GET/POST /api/ext/supplier/quotations/{id}/validities` → `handleQuotationValidities` (GET 200, POST 201);
- `POST /api/ext/supplier/validities/{id}/supersede` → `handleValiditySupersede` (201);
- `GET/POST /api/ext/supplier/quotations/{id}/alert-rules` → `handleAlertRules` (GET 200, POST 201);
- `GET/POST /api/ext/supplier/quotations/{id}/documents` → `handleDocuments` (GET 200, POST 201);
- `POST /api/ext/supplier/documents/{id}/versions` → `handleDocumentVersion` (201);
- `POST /api/ext/supplier/documents/{id}/deactivate` → `handleDocumentDeactivate` (200);
- `GET /api/ext/supplier/orders` → `handleOrders`;
- `POST /api/ext/supplier/quotations/{id}/orders` → `handleCreateOrder` (201);
- `POST /api/ext/supplier/orders/{id}/status` → `handleOrderStatus` (200);
- `GET/POST /api/ext/supplier/orders/{id}/deadlines` → `handleOrderDeadlines` (GET 200, POST 201);
- `POST /api/ext/supplier/order-deadlines/{id}/supersede` → `handleOrderDeadlineSupersede` (201);
- quatro aliases legados de `/api/admin/hr/ext-supplier-portal-quotations`, `/api/crm/hr/...`, `/api/hr/...` e `/api/ext/supplier-portal-quotations` → `handleLegacyQuotations` (leitura viva; mutação 410).

Os 18 handlers exportados aparecem no dispatch; não há handler morto. Sucesso de leitura é 200; criações são 201, alterações 200 e substituições 201. A extração anti-deriva encontrou **54 códigos literais**: `alert_rule_already_registered`, `approved_quotation_required`, `audit_unavailable`, `body_too_large`, `deadline_already_registered`, `deadline_already_superseded`, `deadline_not_found`, `decision_already_recorded`, `decision_endpoint_required`, `document_already_deactivated`, `document_already_superseded`, `document_deactivated`, `document_not_found`, `duplicate_storage_key`, `forbidden_role`, `idempotency_key_required`, `idempotency_key_reused`, `invalid_days_before`, `invalid_decision`, `invalid_document_type`, `invalid_due_date`, `invalid_file_name`, `invalid_file_url`, `invalid_justification`, `invalid_notes`, `invalid_quantity`, `invalid_reason`, `invalid_reference`, `invalid_request`, `invalid_source`, `invalid_source_reference`, `invalid_status`, `invalid_status_transition`, `invalid_storage_key`, `invalid_total_price_cents`, `invalid_unit_price_cents`, `invalid_valid_until`, `legacy_mutation_retired`, `method_not_allowed`, `order_already_exists`, `order_closed`, `order_not_found`, `origin_forbidden`, `product_not_linked_to_supplier`, `quotation_closed`, `quotation_not_found`, `quotation_not_in_analysis`, `supplier_journey_unavailable`, `supplier_or_product_inactive`, `supplier_or_product_not_found`, `unauthorized`, `validity_already_registered`, `validity_already_superseded`, `validity_not_found`.

Papéis de leitura e escrita são `admin`, `marcelo`, `ti`. Estados de cotação: `rascunho → enviado → em_analise → aprovado|rejeitado`, com `cancelado` nas transições permitidas; terminais: aprovado, rejeitado, cancelado. Pedido: `rascunho → emitido → em_entrega → recebido → fechado`, com cancelamento; fechados/cancelados são terminais. Validade e prazo derivam situação a partir da data-base do servidor e regra explícita; ausência não vira zero. Fontes: documento declarado, e-mail declarado, registro interno; prazo de pedido: cotação aprovada, pedido emitido, registro interno. Fontes canônicas estão nas nove tabelas declaradas por `SUPPLIER_SOURCES`. A idempotência usa `(created_by_identity, idempotency_key)` e impressão digital; o protótipo preserva prefixo `ext04-`.

Origens vivas: servidor canônico, aliases legados de leitura e os componentes administrativos. Origem morta: nenhuma das 18 exportações. A fronteira externa permanece declarada: não existe login, sessão, grant, canal externo, upload ou aceite de fornecedor; `file_url` e `storage_key` são referências. A condição de volume do plano permanece `sem_evidencia`.

## 1. Capacidades registradas antes do redesenho

O protótipo já permitia referências, criação de cotação com fornecedor-produto, seleção e detalhe, transição, decisão, validade, alerta, referências documentais, pedido derivado, transições de pedido e prazo. A reescrita preserva cada uma dessas operações e seus corpos, métodos, cabeçalhos e chaves de idempotência. A tela mantém vazio honesto, fronteira externa e mensagens de autoria canônica.

## 2. Apresentação e camadas

`src/lib/supplier-vocabulary.mjs` e `.d.mts` descrevem individualmente os 54 códigos. `supplier-request.ts` retorna `{ok,data} | {ok,error}`, mantém o payload cru e distingue rede, falha, negativa e conflito. O workspace usa o wrapper, apresenta NEGADO separado para `unauthorized`/`forbidden_role`, e mantém estados de carregamento, vazio e falha sem converter falha em lista vazia. O tablist declara as cinco etapas administrativas. O gate focal usa cluster PostgreSQL descartável, servidor de teste e prova Chromium; falha de navegador deve ser injetada por `page.addInitScript`.

## 3. Provas e arquivos

- `tests/ux-supplier-vocabulary.test.mjs` — anti-deriva servidor/dispatch;
- `tests/ux-supplier-workspace.integration.test.mjs` — contrato focal do workspace;
- `scripts/qa-ux-supplier-postgres.mjs` — cluster descartável, migrações, limpeza em `finally` e marcas `UX_SUPPLIER_SETUP`;
- `test:ux-supplier:pg` no `package.json`, vocabulário em `test:unit`;
- `.github/workflows/ux-supplier-delivery.yml`;
- etapa `ux-09-fornecedores` em `scripts/ux-evidence-capture.mjs`;
- evidências desktop 1440×900 e mobile 390×844 em `docs/ux-09-fornecedores-evidencias/`.

## 4. Aceite

Aceite humano continua pendente. Esta fatia não fecha PR #170, não remove a branch ligada à PR #167, não faz merge e não afirma volume real nem ator externo.
