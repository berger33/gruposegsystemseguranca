# Entrega L06 — operação, patrimônio e manutenção (fatias A, B, C e D)

**Data:** 2026-09-30
**Base integrada:** `main` @ `400f079a4e1fe504b779acf83909580d9d082b76` (L05 mergeada).
**Branch de entrega:** `arena/01a0f288-gruposegsystemseguranca`.

> L06 é grande e **não é greenfield**: o schema (migrações 070–073 OPS e 083–084 AST) e as APIs (`ops-api`, `ops-advanced*`, `ast-api`, `emp-ops-api`) já existiam da fase de layout. Esta entrega conduz L06 em **fatias verificáveis**; cada fatia fecha o gate verde. Esta entrega inclui **Fatia A: estrutura de operação, alocação e contrato encerrado**, **Fatia B: cobertura, passagem de turno, livro de ocorrências e checklists operacionais**, **Fatia C: estoque, reserva, ativo/serial, custódia/termo de guarda, requisições e compras internas sintéticas** e **Fatia D: inventário físico com divergências, ordens de serviço e consumo de peças, evidências antes/depois com escopo L02, planos e execuções de manutenção preventiva/corretiva periódica, dossiê técnico CFTV seguro sem senhas em texto puro e controle de materiais de limpeza**.

## Resultado técnico local

### Fatia A: Alocação e Contrato Encerrado
- **Migração aditiva `119-l06-operacao-hardening`**: cria o vínculo explícito e opcional `ops_posts.contract_id → crm_contracts` + índice.
- **`src/server/ops-api.mjs` endurecido:**
  - `POST /api/ops/posts` aceita `contract_id`, validando que o contrato canônico existe e pertence à mesma empresa.
  - `POST /api/ops/allocations` valida posto ativo, contrato operacional, funcionário ativo, duplicidade exata e sobreposição de turno fail-closed.
  - **Auditoria fail-closed**: alocação e auditoria na mesma transação.

### Fatia B: Cobertura, Passagem de Turno, Ocorrências e Checklists (OPS-05..08)
- **Migração aditiva `120-l06-fatia-b-operacao.sql`**: adiciona colunas auditáveis e chaves estrangeiras (`contract_id`, `unit_id`, `shift_template_id`, `client_document_id`, `is_retification`, `reason`) com índices nas tabelas `ops_coverage_requests`, `ops_substitution_candidates`, `ops_handovers`, `ops_handover_escalations`, `ops_occurrence_book`, `ops_occurrence_history`, `ops_occurrence_evidences`, `ops_checklist_runs` e `ops_checklist_answers`.
- **`src/server/ops-advanced-api.mjs` reescrito e endurecido:**
  - **OPS-05 Cobertura:** validação de posto ativo, contrato operacional, candidato ativo, qualificado para o cargo (`ops_employee_qualifications`), sem conflito de turno no mesmo dia/horário (`checkCandidateConflict`). Decisão humana auditada para aceitar candidato.
  - **OPS-06 Passagem de Turno:** obrigatoriedade de funcionários de origem e destino distintos e ativos, posto operacional, geração de protocolo único (`HND-OPS-...`), registro de itens de guarda/chaves, aceite idempotente e escalonamento auditado com motivo obrigatório.
  - **OPS-07 Livro de Ocorrências:** protocolo único (`OCC-OPS-...`), retificação com motivo obrigatório que preserva versão original em `ops_occurrence_history` com flag imutável e auditoria fail-closed, vínculo de evidências com validação de escopo multi-tenant do L02 (`client_documents`).
  - **OPS-08 Checklists:** modelo e execução vinculados a posto e contrato operacional, validação fail-closed de itens obrigatórios (`is_required=true`) antes da finalização, registro idempotente de respostas e retry sem duplicação de dados.
- **Interface de negócio `/admin/operacao`:** adicionadas abas funcionais para Postos & Alocações, Cobertura, Passagem de Turno, Livro de Ocorrências e Checklists com carregamento dinâmico via API real e formulários operacionais.

### Fatia C: Estoque, Reservas, Ativos Serializados e Requisições (AST-01..06)
- **Migração aditiva `121-l06-fatia-c-patrimonio.sql`**: adiciona trava de saldo não-negativo em banco (`CHECK (stock_current >= 0)` em `ast_products`), colunas de escopo (`contract_id`, `client_account_id`, `unit_id`, `post_id`) com índices e flags de fluxo sintético (`is_synthetic_flow=true`).
- **`src/server/ast-api.mjs` reescrito e endurecido:**
  - **AST-01 Fornecedores e Produtos:** validação estrita de SKU único (409), dados de contato, unidade de medida, custos e estoques mínimos com auditoria transacional.
  - **AST-02 Movimentos de Estoque:** bloqueio pessimista (`FOR UPDATE`), validação de escopo contratual e bloqueio fail-closed de saídas/ajustes que excedam o saldo disponível (`400 insufficient_stock`), garantindo que o saldo nunca fique negativo.
  - **AST-03 Reservas Operacionais:** cálculo atômico de saldo disponível unreserved (`stock_current - reservas ativas`), índice único contra reservas ativas duplicadas, ações de liberação (recompõe disponibilidade sem afetar estoque físico) e conversão (baixa efetiva em estoque via `movement_type='saida'`), com proteção contra múltiplas liberações.
  - **AST-04 Ativos Serializados:** número de série único (`serial_number`), garantias, vínculos a contratos e postos operacionais sem colisão cross-tenant.
  - **AST-05 Entregas e Custódia (Termo de Guarda):** conferência antes/depois, fotos e notas; bloqueio contra dupla entrega ativa de ativo já em uso (`409 asset_already_in_use`) sem prévia devolução, recomposição de status na devolução.
  - **AST-06 Requisições e Compras Internas Sintéticas:** geração de protocolos (`REQ-AST-...`, `PED-AST-...`), aprovação com responsável auditado, cotações com fornecedores ativos, pedidos sintéticos rotulados e recebimento total gerando entrada atômica no estoque.
  - **Auditoria fail-closed**: todas as mutações de estoque, ativos e requisições ocorrem na mesma transação que a gravação do log de auditoria.
- **Interface de negócio `/admin/patrimonio`:** nova área dedicada para gestão de almoxarifado, reservas operacionais, equipamentos serializados e requisições internas sintéticas com consumo direto de APIs reais.

### Fatia D: Inventários, Ordens de Serviço, Manutenção, Evidências, CFTV e Limpeza (AST-07..12)
- **Migração aditiva `122-l06-fatia-d-manutencao.sql`**: adiciona colunas auditáveis e chaves estrangeiras (`client_document_id`, `contract_id`, `post_id`, `unit_id`, `password_reference`, `password_storage_hint`) com índices nas tabelas `ast_inventories`, `ast_service_orders`, `ast_service_order_evidences`, `ast_maintenance_plans`, `ast_maintenance_executions`, `ast_cftv_dossiers` e `ast_cleaning_materials`.
- **`src/server/ast-advanced-api.mjs` reescrito e endurecido:**
  - **AST-07 Inventário Físico:** contagem com quantidade esperada e contada, cálculo de divergência (`adjustment_quantity`), protocolo (`INV-AST-...`), histórico imutável e ajuste atômico em estoque com concorrência segura (`FOR UPDATE`) executado exclusivamente na aprovação formal do inventário (`status='aprovado'`), bloqueando re-aprovação redundante.
  - **AST-08 Ordens de Serviço (OS):** protocolo (`OS-AST-...`), escopo de contrato e cliente validados, obrigatoriedade de notas de execução e identificação do técnico para conclusão (`status='concluida'`), consumo atômico de materiais/peças vinculadas exatamente uma vez, bloqueio de re-execução e cancelamento atômico sem efeito parcial em caso de saldo insuficiente.
  - **AST-09 Evidências Privadas com Escopo L02:** integração com `client_documents`, validação multi-tenant contra vínculos cruzados de outros clientes/contratos (`document_scope_violation` 403), tipo de evidência antes/depois, garantia e liberação de visibilidade para o cliente (`is_client_visible=true`) somente após aprovação formal (`is_approved=true`).
  - **AST-10 Manutenção Preventiva/Corretiva Periódica:** planos vinculados a ativo (`asset_id`), periodicidade em dias, alerta preventivo e registro de execuções técnicas com avanço automático da data de próxima visita (`next_due_date`).
  - **AST-11 Dossiê Técnico de CFTV Seguro:** modelos, números de série, localização autorizada e proibição estrita de armazenamento de senhas em texto puro (`plaintext_password_prohibited` 400), exigindo referência a cofre corporativo de credenciais (`password_reference`).
  - **AST-12 Materiais de Limpeza:** controle de consumo previsto vs real por local/posto, cálculo automático da razão de consumo (`consumption_ratio`), variância e acionamento automático de necessidade de reposição (`needs_replacement=true`) quando o consumo exceder o esperado.
- **Interface `/admin/patrimonio`:** inclusão de abas completas para Ordens de Serviço (OS) e Inventários Físicos com formulários de abertura, conferência e filtros.

### Fatia E: Operação Avançada (OPS-09..16)
- **Migração aditiva `123-l06-fatia-e-operacao-avancada.sql`:** adiciona escopo canônico de contrato/unidade/documento, idempotência de leituras de ronda, trava de custódia ativa, completude de métricas, inspeção de limpeza e restrições SQL obrigatórias `is_synthetic=true` para rondas e monitoramento.
- **APIs endurecidas:** `ops-advanced2-api.mjs` e `ops-advanced3-api.mjs` exigem sessão e papel, validam posto/contrato/funcionário ativos e executam mutação com auditoria fail-closed. Incluem supervisão/planos; replay `duplicate_qr`, `too_fast` e `gps_jump`; claviculário 409; relatório com máquina de estados; métricas sem zero implícito; escalas com conflitos; limpeza com executor/inspeção/NC; e monitoramento exclusivamente sintético.
- **Interface `/admin/operacao`:** seis abas novas — `Supervisão`, `Rondas & Claviculário`, `Relatórios`, `Métricas & Escalas`, `Limpeza` e `Monitoramento Sintético` — com avisos explícitos sobre incompletude, decisão humana e ausência de GPS, central 24h ou despacho real.
- **Subtest 5:** cobre OPS-09..16 por HTTP/PostgreSQL reais, autorização negativa, idempotência, conflitos, cadeia de custódia, status formais, auditoria indisponível sem escrita parcial e navegação Chromium real.

## Gate remoto L06

- `scripts/qa-l06-delivery-postgres.mjs` — PostgreSQL descartável (recusa banco externo), migra e roda a suíte com HTTP real e Chromium empacotado.
- `tests/l06-delivery.integration.test.mjs` — 5 subtestes integrados cobrindo Fatias A, B, C, D e E.
- `npm run test:l06-delivery:pg` e workflow `.github/workflows/l06-delivery.yml`.

### Fluxo verificado (sem skip, sem mock de banco/navegador)

1. Contrato/unidade/posto sintéticos e turno válidos.
2. Anônimo negado (401) e papel indevido negado (403) em todas as rotas operacionais e de patrimônio.
3. Vínculo posto→contrato de outra empresa negado (409).
4. Troca de ID: posto, contrato e funcionário inexistentes negados (404).
5. Funcionário desligado não assume alocação nem cobertura (409).
6. Alocação e cobertura validam sobreposição de turno e falta de qualificação (409).
7. Contrato encerrado bloqueia alocação, cobertura, passagem, ocorrência e checklist (409) preservando histórico.
8. Retificação de ocorrência exige motivo e mantém histórico imutável versionado.
9. Evidências privadas vinculam apenas documentos no mesmo escopo de cliente/contrato do L02 (documento cruzado negado 403).
10. Finalização de checklist bloqueia quando há item obrigatório sem resposta (422).
11. Saldo de estoque nunca fica negativo sob concorrência e movimentos excessivos são bloqueados (400 `insufficient_stock`).
12. Reservas reduzem disponibilidade uma vez, sobre-reserva é rejeitada, liberação recompõe saldo e conversão gera baixa física exata.
13. Serial duplicado rejeitado (409) e dupla entrega de ativo já em uso rejeitada (409 `asset_already_in_use`).
14. Requisição interna aprovada, cotação selecionada, pedido sintético recebido gera entrada automática de estoque (+10).
15. Inventário com divergência física deduz saldo em estoque atomicamente uma única vez na aprovação formal.
16. Ordem de serviço com peças deduz estoque atomicamente na conclusão, bloqueando re-conclusão e exigindo técnico e notas de execução.
17. Evidências privadas de OS validam escopo multi-tenant do L02 e bloqueiam visibilidade ao cliente sem aprovação.
18. Execução de plano de manutenção avança a próxima data de vencimento atomicamente.
19. Cadastro de dossiê CFTV rejeita senhas em texto puro e exige apontador para cofre seguro de credenciais.
20. Consumo de produtos de limpeza calcula variância e sinaliza necessidade de reposição.
21. Transações e trilhas de auditoria são fail-closed (503 sem escrita parcial).
22. Chromium real carrega `/admin/operacao` e `/admin/patrimonio` autenticado e renderiza abas e dados reais vindos da API.
23. Supervisão exige posto/contrato e supervisor ativos; score fora de 0–100 e verificação anônima são rejeitados.
24. Ronda sintética trata localização indisponível, replay de QR e retry idempotente sem alegar presença real.
25. Claviculário bloqueia segunda retirada ativa com 409 e preserva retirada/devolução.
26. Relatório só é enviado após revisão e aprovação formais.
27. Métrica não aceita valor ausente como zero e registra fonte, janela, fórmula e incompletude.
28. Escala assistida materializa sobreposição/interjornada/qualificação e bloqueia publicação com conflito.
29. Limpeza registra ambiente, periodicidade, executor, inspeção e não conformidade com severidade.
30. Monitoramento rejeita evento não sintético e registra reconhecimento, tratamento e encerramento sem despacho real.

## Evidência executada no Arena remoto

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5; manifesto contínuo 001–123 |
| `npm run typecheck` | aprovado |
| `npm test` | aprovado; 196/196 |
| `npm run build` | aprovado; inclui `/admin/operacao` e `/admin/patrimonio` |
| `npm run test:migrations:pg` | aprovado; 123/123 checksums, 517 tabelas, clone descartável, rejeição de mutação sintética |
| `npm run test:l05-delivery:pg` | aprovado (sem regressão após migrações aditivas L06) |
| `npm run test:l06-delivery:pg` | aprovado; 5 cenários completos em HTTP real + PostgreSQL descartável + Chromium |

## Diferenciação de estado

- **Conclusão técnica local**: fatias A, B, C, D e E verificáveis pelo gate L06.
- **Aceite humano**: pendente (revisão de entrega).
- **Integração externa**: fora de escopo por política — compras externas, recebimento fiscal, gateway, GPS/presença, central 24h e despacho real permanecem bloqueados/rotulados.
- **Simulação**: compras, rondas e monitoramento são explicitamente sintéticos (`is_synthetic_flow=true` / `is_synthetic=true`).

## Marco concluído localmente

- OPS-01..16 e AST-01..12 estão `pronto_local`; aceite humano e integrações externas permanecem separados da conclusão técnica.

