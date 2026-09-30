# Entrega L06 — operação, patrimônio e manutenção (fatias A–I)

**Data:** 2026-09-30
**Base integrada:** `main` @ `400f079a4e1fe504b779acf83909580d9d082b76` (L05 mergeada).
**Branch de entrega:** `arena/01a0f288-gruposegsystemseguranca`.

> L06 é grande e **não é greenfield**: o schema (migrações 070–073 OPS e 083–084 AST) e as APIs (`ops-api`, `ops-advanced*`, `ast-api`, `emp-ops-api`) já existiam da fase de layout. Esta entrega conduz L06 em **fatias verificáveis**; cada fatia fecha o gate verde. Fatias entregues: **A** (estrutura de operação, alocação e contrato encerrado), **B** (cobertura, passagem de turno, livro de ocorrências e checklists operacionais), **C** (estoque, reserva, ativo/serial, custódia/termo de guarda, requisições e compras internas sintéticas), **D** (inventário físico, ordens de serviço, manutenção, evidências com escopo L02, CFTV e limpeza), **E** (opera­ção avançada OPS-09..16), **F** (OPS-04: jornada, descanso, habilitação e indisponibilidade), **G** (OPS-01: cargo/função fora da borda de RH, necessidade por turno e cadeia cliente→posto na tela) , **H** (OPS-02: aba de dimensionamento com habilitação cruzada e fórmula explícita) e **I** (OPS-03: aba de escalas com calendário por posto/equipe/pessoa e ciência pela interface). Bloco fechado em entrega técnica local.

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

### Fatia F: OPS-04 — habilitação, documentação, indisponibilidade, jornada e descanso

**Sem migração nova.** O diagnóstico confirmou que a migração `070` já criava `ops_work_rules`, `ops_employee_qualifications` e `ops_schedule_validations`; faltava **usar** essas tabelas. As migrações `001–123` permanecem intactas e nenhuma `124` foi necessária.

#### Lacunas reais encontradas (antes desta fatia)

1. **A validação de habilitação nunca bloqueava.** Em `handleAllocations`, o diagnóstico de recusa fazia `INSERT INTO ops_schedule_validations` sem `version_id` nem `entry_id`, violando o CHECK `chk_version_or_entry`. A exceção caía num `catch` que só registrava no console, então o `return send(res, 400, …)` jamais executava e a alocação era criada mesmo assim.
2. **Indisponibilidade não era verificada em alocação** e, na entrada de escala, a consulta usava `.catch(() => ({ rows: [] }))` — falhava aberto.
3. **Jornada e descanso não existiam em lugar nenhum.** `ops_work_rules` era cadastro morto: `max_daily_hours`, `min_rest_hours`, `max_weekly_hours` e `max_consecutive_days` nunca eram lidos.
4. **`is_approved` não tinha efeito.** Regra aprovada e regra rascunho valiam o mesmo: nada.
5. **Regra inconfigurável.** `Number(b.min_rest_hours || 11)` trocava `0` por `11`, e o limite da API (`min_rest > 24`) recusava as 36h que o próprio CHECK do banco (`<= 168`) admite — a regra `12x36` semeada não podia ser criada pela API.
6. **Entrada de escala sem transação nem auditoria**, e sobreposição detectada apenas quando o `shift_template_id` era idêntico.

#### Decisões e invariantes

- **Motor único** `evaluateOps04`, usado por `POST /api/ops/allocations` e `POST /api/ops/schedule-entries`, na ordem: indisponibilidade → habilitação/documentação → jornada diária → descanso mínimo → jornada semanal → dias consecutivos.
- **Nada é inferido.** Sem regra **aprovada e ativa**, jornada e descanso não são aplicados e a resposta declara `work_rule_applied: false` com a justificativa. O sistema não inventa um limite "padrão razoável".
- **Mais restritiva vence.** Com várias regras aprovadas, aplica-se `MIN(jornada)`, `MAX(descanso)`, `bool_or(requires_certification)` — leitura fail-closed.
- **Fail-closed em erro de banco.** Qualquer falha de consulta nega a operação (503), nunca libera.
- **Documentação com data alvo.** A validade é conferida contra `GREATEST(CURRENT_DATE, data pretendida)`: habilitação que vence antes do turno não autoriza o turno.
- **Recusa não deixa efeito parcial.** Negar não escreve escala; a trilha da recusa vai em `ops_schedule_validations` (quando há versão) e em `audit_log`, e sua indisponibilidade jamais converte recusa em permissão.
- **Aprovar regra é ato de governança**: `PATCH /api/ops/work-rules` grava mudança e auditoria na mesma transação.
- **Indisponibilidade explícita**: `solicitado`, `em_analise`, `aprovado` e `em_afastamento` bloqueiam (disponibilidade desconhecida não é disponibilidade); `rejeitado`, `cancelado` e `retornado` não bloqueiam.

#### Endpoints alterados

- `POST /api/ops/allocations` — motor OPS-04 + resumo `validation` na resposta.
- `POST /api/ops/schedule-entries` — posto/contrato/funcionário validados, sobreposição real de turno, motor OPS-04, escrita + validação positiva + auditoria na mesma transação.
- `POST|PATCH /api/ops/work-rules` — `0` deixa de ser tratado como ausente, limite de descanso alinhado ao CHECK (168h), validação de faixa no PATCH e auditoria transacional.
- `/admin/operacao` — aba **Jornada & Habilitação (OPS-04)** com regras (e aviso quando nenhuma está aprovada), habilitações com validade e bloqueios registrados.

#### Casos do gate (subteste `L06 OPS-04`)

| # | Caso | Resultado |
|---|---|---|
| 1 | Anônimo / papel comercial em regra e qualificação | 401 / 403 |
| 2 | Descanso de 36h (escala 12x36) | 201 — antes recusado pela API |
| 3 | `min_rest_hours: 0` | preservado, não substituído pelo padrão |
| 4 | Sem regra aprovada, 9h/dia | 201 e `work_rule_applied:false` |
| 5 | Aprovação da regra | 200 + `ops_work_rule_update` auditado |
| 6 | 4h + 5h com limite 8h/dia | 422 `max_daily_hours_exceeded` |
| 7 | 19:00 → 05:00 (10h) com mínimo 11h | 422 `min_rest_hours_violated` |
| 8 | 18h de intervalo | 201 |
| 9 | 21h na semana ISO com limite 16h | 422 `max_weekly_hours_exceeded` |
| 10 | 3º dia consecutivo com limite 2 | 422 `max_consecutive_days_exceeded` |
| 11 | Cargo sem habilitação cadastrada | 422 `qualification_required` |
| 12 | Habilitação vencida / inválida | 422 `qualification_expired` / `qualification_invalid` |
| 13 | Habilitação válida e retry | 201 e 409 sem segunda linha |
| 14 | Regra aprovada exige certificação, sem cargo | 422 `role_required_by_work_rule`; liberado ao desativar a regra |
| 15 | Afastamento aprovado / ausência rejeitada | 409 `employee_unavailable` / 201 |
| 16 | Escala: desligado, posto trocado, sobreposição, retry | 409 / 404 / 409 / 409 |
| 17 | Validação positiva e auditoria da entrada | persistidas com `entry_id` |
| 18 | Auditoria indisponível (alocação, escala e regra) | 503 sem efeito parcial |
| 19 | Chromium real em `/admin/operacao` | aba OPS-04 renderiza regra aprovada, habilitação e trilha de bloqueios |

A verificação em Chromium da aba OPS-04 reutiliza a sessão de navegador já aberta pelo subteste da Fatia B, em vez de abrir um quarto processo de navegador só para ela: mesma cobertura real, menos tempo e menos fragilidade de timeout no runner do CI.

### Fatia G: OPS-01 — borda de cargo/função, necessidade por turno e cadeia na tela

**Sem migração nova.** O schema `070` já continha `ops_post_shift_needs` e `ops_job_roles`; faltava expor, endurecer e renderizar. As migrações `001–123` permanecem intactas.

#### Lacunas reais encontradas (antes desta fatia)

1. **Dois aliases, duas autorizações para o mesmo recurso.** `/api/ops/job-roles` (canônico) autorizava por sessão de staff + papel, mas os aliases históricos `/api/hr/ops-*`, `/api/admin/hr/ops-*` e `/api/crm/hr/ops-*` caíam na borda de RH legada e exigiam `employees.read/write`. Provado por execução: admin e ti recebiam **403** no alias legado e **200** no canônico; só `rh` (com concessão automática de `employees.*`) passava nos dois.
2. **A própria tela de operação usava os aliases legados.** `OpsAdvanced2Client` e `OpsAdvanced3Client`, embutidos nas abas Supervisão/Rondas/Relatórios/Métricas/Limpeza/Monitoramento de `/admin/operacao`, buscam `/api/hr/ops-*` — para admin/ti todas essas abas renderizavam **vazio** (os 403 eram engolidos pelo `catch`).
3. **Necessidade por turno sem cobertura de teste e sem validação de cadeia.** `POST /api/ops/post-shift-needs` não conferia existência de posto/turno/cargo (troca de ID virava erro de FK/500), não bloqueava posto inativo nem contrato encerrado, e a unicidade `UNIQUE(post_id, shift_template_id, day_of_week, role_id)` é **DISTINCT** — repetição com dia/cargo ausentes (`NULL`) criava linha duplicada.
4. **Headcount zero virava um.** `Number(b.required_headcount || … || 1)` tratava `0` como ausente (o mesmo padrão que a Fatia F corrigiu em `min_rest_hours`): valor inválido era gravado como `1` silenciosamente.
5. **A tela não mostrava a cadeia.** A tabela de postos exibia apenas nome/tipo/contrato; necessidade por turno e cargo/função não existiam em `/admin/operacao`; a tabela de alocações não mostrava posto nem profissional.

#### Decisões e invariantes

- **O handler autoriza; a borda de RH não.** Os aliases `ops-*` sob os prefixos de RH saem da borda legada (`server.mjs`): cada handler de operação exige sessão de staff, papel por método e same-origin, exatamente como o caminho canônico. Paths de RH que não são de operação continuam na borda — um alias `ops-*` desconhecido não é despachado a handler algum e termina em 404.
- **Leitura devolve a cadeia com nomes canônicos** por join: cliente, unidade e contrato no posto; posto, turno e cargo na necessidade; posto e profissional na alocação. Sem entidade paralela, sem segunda consulta no cliente.
- **Escrita de necessidade segue o padrão de alocação/escala**: posto ativo, contrato operacional, turno ativo, cargo existente, valores validados, idempotência `IS NOT DISTINCT FROM` e escrita + auditoria na mesma transação (fail-closed: sem trilha, nada fica gravado).
- **Grupo de carregamento próprio na tela.** Cargos e necessidades carregam em estado separado dos 9 fetches originais, com carregamento/vazio/erro próprios — o acoplamento do `Promise.all` existente é conhecido e não foi agravado.
- **Lacuna não vira número.** Posto sem necessidade por turno cadastrada aparece com contagem zero e a seção vazia explica o pré-requisito; nada de dimensionamento automático.

#### Endpoints alterados

- `GET /api/ops/posts` — join com `crm_companies`, `crm_company_units` e `crm_contracts` (`company_name`, `unit_name`, `contract_title`).
- `GET /api/ops/post-shift-needs` — join com posto, turno e cargo (`post_name`, `shift_template_name`, `role_name`).
- `GET /api/ops/allocations` — join com posto e profissional (`post_name`, `employee_name`).
- `POST /api/ops/post-shift-needs` — validação de cadeia, idempotência NULL-safe, headcount `0` recusado (400) e auditoria transacional.
- `server.mjs` — aliases `ops-*` dos prefixos de HR isentos da borda legada de RH.

#### Casos do gate (subteste `L06 OPS-01`)

| # | Caso | Resultado |
|---|---|---|
| 1 | Anônimo no alias legado | 401 |
| 2 | Admin/ti/rh no alias legado (job-roles, posts, schedule-versions) | 200 — antes 403 para admin/ti |
| 3 | Comercial escrevendo pelo alias legado | 403 `forbidden` (handler, não borda) |
| 4 | `/api/hr/employees` sem concessão de RH | 403 — a borda segue valendo para HR |
| 5 | Necessidade: anônimo / comercial | 401 / 403 |
| 6 | Necessidade: dia 7, headcount 0, headcount 1,5 | 400 |
| 7 | Posto, turno ou cargo inexistente | 404 nomeado, sem colisão de FK |
| 8 | Posto inativo / contrato encerrado | 409 `post_inactive` / `contract_not_operational` |
| 9 | Duplicata com dia/cargo ausentes e com valores | 409 `duplicate_need`, sem segunda linha |
| 10 | Auditoria indisponível | 503 sem efeito parcial; 201 após restaurar |
| 11 | Leitura com nomes da cadeia (posto, turno, cargo, profissional) | campos presentes |
| 12 | Alocação fecha a cadeia no posto operacional | 201 com `post_name`/`employee_name` |
| 13 | Chromium real: cliente, unidade, cargo, turno, posto e profissional | renderizados da API real |

A verificação em Chromium reutiliza a sessão de navegador já aberta pelo subteste da Fatia B (aba `Postos e Alocações`, aba padrão), sem processo de navegador adicional.

### Fatia H: OPS-02 — aba de dimensionamento com habilitação cruzada

**Sem migração nova.** `ops_dimensioning`, `ops_coverage_gaps` e `ops_employee_qualifications` já existiam; faltava a tela e o cruzamento de habilitação.

#### Lacunas reais encontradas (antes desta fatia)

1. **Não existia aba de dimensionamento** em `/admin/operacao`: as APIs `/api/ops/dimensioning` e `/api/ops/coverage-gaps` estavam endurecidas, mas sem superfície — o requisito de tela não tinha entrega.
2. **A habilitação só era avaliada no momento da alocação.** O motor OPS-04 valida qualificação ao criar a alocação/entrada; nada recomputava o estado ATUAL contra as alocações existentes — qualificação vencida ou revogada depois da alocação passava despercebida no painel de cobertura.
3. **Duas regras de habilitação seriam um risco**: a tentação ao escrever o painel era duplicar o predicado. O predicado foi extraído para `QUALIFICATION_USABLE_SQL` e é o **mesmo** código usado por `evaluateOps04` e pelo painel.

#### Decisões e invariantes

- **Regra única de habilitação**: `is_valid = true` e validade ≥ `GREATEST(hoje, data da alocação)` em `ops_employee_qualifications` — um predicado, dois usos (motor por alocação; painel em forma conjuntiva).
- **O painel recomputa ao vivo**: por registro de dimensionamento, `LEFT JOIN LATERAL` sobre as alocações não canceladas dentro do período do próprio registro — `allocated_employees`, `qualified_employees`, `unqualified_employees`, `employees_without_requirement`, `allocated_hours`.
- **Sem cargo exigido não é habilitado nem inabilitado**: alocações sem `role_id` são contadas à parte (`employees_without_requirement`); nada é presumido sobre competência não declarada.
- **Alocação fora da faixa não entra na conta** — o cruzamento respeita o período do próprio registro.
- **Fórmula e período explícitos no rodapé**: cobertura % = horas realizadas ÷ horas exigidas × 100 (limitada a 100, calculada pelo banco); horas alocadas = soma dos turnos das alocações da faixa e **não substituem** as horas realizadas informadas — a divergência aparece, não é conciliada.
- **Grupo de carregamento próprio**, desacoplado dos demais fetches da tela, com estados de carregamento/vazio/erro.

#### Endpoints alterados

- `GET /api/ops/dimensioning` — nome do posto e colunas calculadas de cobertura/habilitação por registro.
- `GET /api/ops/coverage-gaps` — nome canônico do posto.
- `/admin/operacao` — aba **Dimensionamento (OPS-02)**: painel contratado × planejado × realizado por faixa de tempo, habilitação cruzada, lacunas e rodapé com fórmula.

#### Casos do gate (subteste `L06 OPS-02`, ampliado)

| # | Caso | Resultado |
|---|---|---|
| 1 | Criação válida / percentual derivado / valores inválidos / escopo | já coberto (permanece) |
| 2 | Dois alocados na faixa (um qualificado, um sem cargo) + um fora da faixa | painel: 2 alocados, 1 habilitado, 1 sem exigência; o de fora excluído |
| 3 | Horas alocadas da faixa | 16 h somadas dos turnos |
| 4 | Cobertura planejada versus realizada do registro | 372/744 = 50% |
| 5 | Qualificação revogada pela API **depois** da alocação | painel recomputa: 0 habilitados, 1 sem habilitação válida |
| 6 | Lacunas com nome canônico do posto | presente |
| 7 | Chromium real: posto, 50%, "sem habilitação válida", fórmula no rodapé, data de lacuna | renderizados da API real |

### Fatia I: OPS-03 — aba de escalas com calendário por posto/equipe/pessoa e ciência pela interface

**Sem migração nova.** `ops_schedule_versions`, `ops_schedule_entries`, `ops_schedule_acknowledgments` e `ops_schedule_history` já existiam; faltava a tela, o calendário nas três visões e a jornada de ciência.

#### Lacunas reais encontradas (antes desta fatia)

1. **Não existia aba de escalas** em `/admin/operacao`: as quatro APIs existiam e estavam endurecidas, mas calendário e ciência pela interface não existiam — o requisito de tela não tinha entrega.
2. **`/api/ops/schedule-history` não existia**: era o único endpoint de operação sem o caminho canônico — só respondia nos três aliases históricos de RH. A tela precisaria do caminho inexistente; o alias canônico foi adicionado ao roteador, no padrão de todos os demais.
3. **Ciência sem checagem de papel**: `POST /api/ops/schedule-acks` exigia sessão e same-origin, mas qualquer papel de staff (ex.: comercial) registrava ciência por qualquer profissional. Registro de ciência é escrita operacional: passou a exigir `admin`/`ti`/`rh`, como toda mutação de operação.

#### Decisões e invariantes

- **Calendário nas três visões exigidas**: por posto (profissionais escalados por dia), por equipe (profissionais distintos por unidade por dia) e por pessoa (turnos por dia). Colunas = dias da validade da versão.
- **Janela de 31 colunas com recorte declarado**: validade maior que 31 dias mostra os primeiros 31 e diz isso — o recorte é explícito, nunca oculto.
- **Célula vazia é ausência de registro, não folga confirmada** — o rodapé do calendário declara período, fonte e semântica de cada visão.
- **Ciência pela interface, idempotente**: o botão permanece após a ciência e a segunda tentativa mostra o 409 do banco ("segunda ciência não duplica efeito") — a garantia é da API, a verdade aparece na tela.
- **Histórico visível**: cada transição com autor, momento e motivo; transição de criação exibida como "criada como X".
- **Leituras com nomes canônicos** por join (empresa, unidade, posto, profissional, turno) — sem entidade paralela e sem segunda consulta no cliente.

#### Endpoints alterados

- `GET /api/ops/schedule-versions` — nomes de empresa e unidade.
- `GET /api/ops/schedule-entries` — nomes de posto, unidade, profissional e turno.
- `GET /api/ops/schedule-acks` — nome do profissional.
- `POST /api/ops/schedule-acks` — exige papel de operação (`admin`/`ti`/`rh`).
- `server.mjs` — alias canônico `/api/ops/schedule-history` no roteador.
- `/admin/operacao` — aba **Escalas (OPS-03)**.

#### Casos do gate (subteste `L06 OPS-03`, ampliado)

| # | Caso | Resultado |
|---|---|---|
| 1 | Versões: sequência, período, status, histórico, datas inválidas | já coberto (permanece) |
| 2 | Entrada em versão + retry; segunda entrada para a jornada de UI | 201 + 409; 201 |
| 3 | Ciência: anônimo / comercial | 401 / 403 — antes comercial obtinha 201 |
| 4 | UI: versões com empresa/unidade/validade/situação | renderizadas da API real |
| 5 | UI: calendário por posto / por equipe / por pessoa | posto+profissionais; unidade; turno canônico |
| 6 | UI: histórico da versão | "revisada → publicada" visível |
| 7 | UI: ciência pela interface — primeiro e segundo clique | 201 "Ciência registrada" e 409 "não duplica efeito" |
| 8 | SQL pós-jornada | exatamente 2 ciências para 2 profissionais — sem duplicação |

## Gate remoto L06

- `scripts/qa-l06-delivery-postgres.mjs` — PostgreSQL descartável (recusa banco externo), migra e roda a suíte com HTTP real e Chromium empacotado.
- `tests/l06-delivery.integration.test.mjs` — 9 subtestes integrados cobrindo Fatias A, B, C, D, E, OPS-01, OPS-02, OPS-03 e OPS-04.
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

Baseline registrado antes de qualquer alteração da Fatia F: `qa-wave0-static` 5/5, `typecheck` aprovado, `test:migrations:pg` 123/123, `test:l06-delivery:pg` 7/7, `test:l04-delivery:pg` 20/20 — nenhum gate já estava quebrado.

| Comando | Resultado |
|---|---|
| `node scripts/qa-wave0-static.mjs` | 5/5; manifesto contínuo 001–123 |
| `npm run typecheck` | aprovado |
| `npm test` | aprovado; 196/196 |
| `npm run build` | aprovado; inclui `/admin/operacao` e `/admin/patrimonio` |
| `npm run test:migrations:pg` | aprovado; 123/123 checksums, 517 tabelas, clone descartável, rejeição de mutação sintética |
| `npm run test:l04-delivery:pg` | aprovado; 20/20 (sem regressão após a Fatia F) |
| `npm run test:l05-delivery:pg` | aprovado; 1/1 (sem regressão após migrações aditivas L06 e Fatia F) |
| `npm run test:l06-delivery:pg` | aprovado; 8/8 cenários em HTTP real + PostgreSQL descartável + Chromium |

> Observação de execução: rodar um gate de entrega em paralelo com `npm run build` provoca falha por contenção de recursos e de diretório `.next`. Os gates devem ser executados em série — é exatamente o que o grupo de concorrência compartilhado dos workflows L04/L05/L06 garante no CI.

## Diferenciação de estado

- **Conclusão técnica local**: fatias A, B, C, D, E e F verificáveis pelo gate L06.
- **Aceite humano**: pendente (revisão de entrega).
- **Integração externa**: fora de escopo por política — compras externas, recebimento fiscal, gateway, GPS/presença, central 24h e despacho real permanecem bloqueados/rotulados.
- **Simulação**: compras, rondas e monitoramento são explicitamente sintéticos (`is_synthetic_flow=true` / `is_synthetic=true`).

## Marco concluído localmente

- OPS-01..16 e AST-01..12 estão `pronto_local`; aceite humano e integrações externas permanecem separados da conclusão técnica.
- **Bloco L06 fechado em entrega técnica local.** As pendências de aceite humano e fronteira externa permanecem registradas item a item na matriz: ciência da escala comprova ciência do profissional, não validação jurídica da escala; limites de jornada aplicam a regra aprovada, não julgam sua legalidade; compras, rondas e monitoramento seguem sintéticos e rotulados; o comprovante de habilitação segue `document_url` em texto (vincular ao provedor L02 exige migração aditiva, deliberadamente adiada).
- Limite honesto de OPS-04: o comprovante de habilitação ainda é `document_url` em texto. Ligá-lo ao provedor privado L02 (`client_documents`) exige coluna nova e, portanto, migração aditiva — não feita nesta fatia por decisão explícita de escopo.

