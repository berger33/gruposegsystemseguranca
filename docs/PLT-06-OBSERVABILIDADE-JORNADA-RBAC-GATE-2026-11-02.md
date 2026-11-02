# PLT-06 — jornada, RBAC e evidência de gate da observabilidade

**Data:** 02/11/2026 (America/Sao_Paulo)  
**Base:** `5fde81d21a77b85a7f66ee664c889b04cb9a1f67` (`main`, merge da PR #328, 45/45 checks)  
**Branch da sessão:** `arena/f9020140-gruposegsystemseguranca`  
**Natureza:** fatia aditiva de jornada/RBAC/evidência de gate. **Não** é promoção de tela, **não** fecha PLT-06, **não** registra aceite humano, UAT, homologação ou reauditoria integral. **Produção continua NO-GO.**

---

## 1. Motivo e fronteira

A decisão do proprietário registrada em [`STATUS-VIGENTE.md`](STATUS-VIGENTE.md) declarou o console de TI **esgotado** para “promoção de tela”. A aba `observacao` (`ObservabilityClient.tsx`) já estava montada como uma das 32 abas; os 10 candidatos remanescentes da borda legada de RH (`authorizeLegacyHrRequest` / `employees.read`) e os 17 com segunda superfície viva continuam fora de questão. A frente elegível é trabalho próprio de **jornada, RBAC e evidência de gate**, como feito em PLT-01.

A auditoria de 28/10, §4.2 item B10, apontava o núcleo duro de IDs `a_revalidar` sem gate nomeado: entre eles `PLT-06`. O requisito pede observabilidade de HTTP/jobs/DB, correlação por request/event ID, métricas e alertas acionáveis, sem segredos. O código já tinha as cinco leituras (`summary|requests|jobs|db|alerts`), o ciclo de alerta e a telemetria, mas **não havia gate nomeado que provasse a jornada em HTTP real** e havia escritas/validações incompatíveis com “leitura de estado”.

PLT-02 **não** foi tratado como fechado: continua `a_revalidar`, produção NO-GO, sem aceite humano, UAT ou reauditoria integral.

## 2. RED medido antes das correções

Sonda descartável (sem editar o repositório) sobre `createObservabilityApi`: `GET ?type=summary` devolvia 200 **e emitia** `INSERT INTO auth_access_audit ... 'observability_query'`; `POST ?type=summary` devolvia **200**; `status=status-invalido` virava **503 `observability_unavailable`**; e nenhuma resposta 503 tinha `error_sanitized`.

Com os testes escritos e **sem** as correções de produção:

- focal `node --test tests/plt06-observability-read-contract.test.mjs`: **6/12**, exit **1** — falhavam: leitura com INSERT de auditoria, método não GET em 200, status inválido em 503, 503 sem `error_sanitized`, telemetria persistindo senha de URI, e a guarda estática de superfície;
- gate `npm run test:plt06-observability:pg`: **20/23**, exit **1** — falhavam: método não GET em 200, status inválido em 503 e id inválido respondendo 404 genérico em vez de 400 `invalid_alert_id`; resumo TAP autoauditado rejeitou o placar (`PLT06_GATE_REJECTED`).

O gate também mediu uma **dívida anterior, preservada**: o handler de alertas ainda tenta gravar `observability_alert_ack` / `observability_alert_resolve` em `auth_access_audit`, mas o `CHECK` vigente das migrações 001–181 (reescrito na 103) não aceita essas ações e o `.catch()` as descarta em silêncio. **Não foi criada migração 182** nem alterado o nome das ações: a fatia prova o estado real do alerta e declara a dívida, sem afirmar trilha gravada.

## 3. Entregue (aditivo e pontual)

### 3.1 Módulo puro `src/server/observability-read-contract.mjs`

Contrato determinístico, sem banco, sessão, relógio ou rede: cinco tipos de leitura, quatro estados do enum da migração 044, duas ações de alerta, fronteira explícita (`leitura_grava_auditoria:false`, `leitura_altera_alertas:false`, `abre_borda_rh_legada:false`, `substitui_superficie_existente:false`, `promocao_de_tela:false`), parsers que preservam os padrões históricos (`summary`, `firing`, `acknowledge`) e recusam valores inventados, guarda de método `GET`, e `sanitizeDependencyError` no mesmo formato do readiness (PLT-07): credenciais de URI, query, chave-valor e Bearer são mascaradas, com limite de 1000 caracteres.

### 3.2 API — rota e contratos existentes preservados

`src/server/observability-api.mjs` passou a usar o módulo puro sem criar rota nova:

- `same_origin_required` continua anterior à sessão nas escritas; anônimo **401 `admin_session_required`**, `rh` **403 `observability_restricted_admin_ti`**, `admin`/`ti` continuam autorizados; GET seguro não exige `Origin`, como antes;
- método não GET nas rotas de leitura (incluindo `/api/admin/observability/metrics` e o alias `/api/crm/observability`) agora é **405 `method_not_allowed`** com `Allow: GET`, sem consultar banco;
- `type` desconhecido continua **400 `invalid_type`**; `status` fora de `firing|acknowledged|resolved|suppressed` passa a ser **400 `invalid_status`** antes do PostgreSQL, em vez de `22P02`/503;
- o `summary` **não emite mais** `INSERT INTO auth_access_audit`; as cinco leituras executam apenas `SELECT`;
- falhas de dependência mantêm **503 `observability_unavailable`** / **503 `alert_action_failed`** e agora devolvem `error_sanitized` sanitizado; o `console.error` também deixou de logar o erro cru;
- `handleAlertAction` preserva `POST`/`PATCH`, UUID canônico (E17), **400 `invalid_alert_id`**, **404 `not_found`**, **400 `invalid_action`**, **403 `observability_restricted`** para `rh`, `Allow: POST, PATCH`, a atualização de estado/memória e a tentativa de auditoria já existente;
- `server.mjs` mudou **apenas** o casamento do segmento do alerta de `([0-9a-f-]{36})` para `([^/]+)`: um id torto agora chega ao handler e recebe 400 em vez de cair no 404 genérico do roteador. Nenhum padrão de rota novo, nenhuma alteração na borda legada de RH.

### 3.3 Telemetria

`src/server/observability.mjs` recebeu **uma importação e uma substituição de corpo**: `sanitizeError` delega ao módulo puro. A Telemetria HTTP/jobs/DB/alertas continua gravando as mesmas tabelas e colunas, mas `error_sanitized` não deixa mais senha de URI ou token de query escapar da máscara por troca de palavras soltas. Não houve refatoração do módulo nem mudança de contrato de `recordHttp`/`wrapPool`.

### 3.4 O que **não** mudou

`TiConsole.tsx`, `ObservabilityClient.tsx`, CSS, aba `observacao`, 32 abas, 19 promoções, 27 órfãos, papéis/permissões, tabelas, migrações 001–181 e mensagens de erro existentes permanecem intactos. Nenhuma superfície foi substituída e nenhum componente órfão foi montado.

## 4. Prova

### 4.1 Focal no `test:unit`

`tests/plt06-observability-read-contract.test.mjs` — **12/12, exit 0**, comentário de invariante no cabeçalho. Cobre contrato puro, sanitização, RBAC/same-origin, as cinco leituras só com `SELECT`, 405, `invalid_status`, 503 sanitizado, telemetria persistida com segredo sintético mascarado, ciclo acknowledge/resolve, 400/404/405 do alerta e guarda estática de superfície.

**RED → GREEN:** 6/12 → **12/12**. **Seis mutações, todas detectadas e revertidas** (focal exit 1 em cada uma; após restauração, 12/12):

| Mutação | Subtestes reprovados |
|---|---|
| guarda de 405 removida | 2 (método + superfície) |
| `INSERT INTO auth_access_audit` de volta no `summary` | 2 (só SELECT + superfície) |
| `status` cru de volta no SQL | 2 (400 + superfície) |
| `error_sanitized` removido dos 503 | 2 (sanitização + superfície) |
| `sanitizeError` antigo de volta na telemetria | 1 (persistência sanitizada) |
| roteador de alerta de volta ao UUID de 36 caracteres | 1 (superfície/id inválido) |

### 4.2 Gate dedicado

`scripts/qa-plt06-observability-postgres.mjs` + `npm run test:plt06-observability:pg`: cluster PostgreSQL 17 descartável (`embedded-postgres`), **001–181 conferidas no ledger**, `server.mjs --dev` real com `NEXT_DIST_DIR` próprio, segredo de sessão compartilhado, sessões reais `ti`/`rh`/`admin`, TAP autoauditado com `MINIMUM_CASES=20`, **zero skip/todo**.

**RED 20/23, exit 1 → GREEN 23/23, exit 0.** Casos: anônimo 401 e `rh` 403 nos cinco tipos; `ti`/`admin` 200 com as chaves preservadas; `same_origin_required` nas escritas cross-site e GET seguro; 405 sem auditoria; correlação gerada, `x-correlation-id` do cliente e truncamento de 100 caracteres com o **mesmo** `request_id`/`correlation_id` no cabeçalho e em `observability_http_requests`; `invalid_status` 400 e quatro filtros válidos; dez leituras sem criar `auth_access_audit` nem alterar `observability_alerts` (a telemetria da própria requisição continua registrada); acknowledge/resolve com estado lido do banco; `rh` barrado; id inválido 400; inexistente 404; ação inválida 400; PATCH preservado; aliases preservados; `/admin/ti` servido; e a dívida do `CHECK` de auditoria declarada sem promoção.

### 4.3 Bateria e estáticos

- `npm test`: **1398/1398, exit 0** (174 arquivos no `test:unit`, 0 skip/todo).
- `npm run typecheck`: **exit 0**.
- `npm run build`: **exit 0**, **106 páginas**.
- Inventários regenerados pelos scripts oficiais: `node scripts/ux-pro-00-inventory.mjs`, `node scripts/ux-pro-03-ti-inventory.mjs`, `node scripts/requisitos-222-inventory.mjs` (nunca editados à mão), com `--check` verde nos três. O retrato 222 passa a **25 `gate_nomeado` / 124 `mencionado_em_gate` / 73 `somente_documento`**, **14** `a_revalidar` sem gate e **1.695** arquivos varridos; `PLT-06` sai de `somente_documento` para `gate_nomeado`, mas continua `a_revalidar`. `scripts/audit-ui-inventory.mjs` **não** foi executado.

## 5. Comportamento preservado

- As cinco leituras, o alias `/metrics`, o alias `/api/crm/observability`, as chaves de resposta e as mensagens de erro permanecem como estavam, exceto pelos novos códigos explicitamente medidos (`405` na leitura, `invalid_status`).
- O ciclo de alerta continua com `POST`/`PATCH`, `acknowledge`/`resolve`, atualização de memória e tentativa de auditoria; `rh` continua negado.
- A borda legada de RH (`authorizeLegacyHrRequest` / `employees.read`) não foi aberta, enfraquecida ou reutilizada por esta fatia.
- Nenhuma migração, permissão, papel, tabela, coluna, campo de tela ou componente foi removido. `server.mjs` teve uma única alteração de roteamento estritamente necessária para o 400 de id inválido.
- PLT-01, PLT-02, PLT-07 e os demais requisitos do núcleo duro seguem `a_revalidar`; **0/222 aceite humano** e nenhuma reauditoria integral.

## 6. Limitações declaradas

- **Não** houve aceite humano, UAT, Chromium/leitor de tela, revisão WCAG manual, homologação Windows, banco de destino, reauditoria integral ou produção. PLT-06 permanece `a_revalidar`.
- O gate é HTTP + PostgreSQL; a aba `observacao` já montada foi preservada e conferida por guarda estática/HTML, **não** foi exercitada em navegador nesta fatia.
- A telemetria continua necessariamente escrevendo em `observability_http_requests` e `observability_db_metrics` para registrar a própria requisição. “Leitura de estado” significa nenhum evento de `auth_access_audit` e nenhuma alteração em `observability_alerts`, não ausência de telemetria.
- Ações de auditoria do ciclo de alerta seguem recusadas em silêncio pelo `CHECK` atual de `auth_access_audit` (medido no gate). Corrigir isso exigiria migração 182 e decisão de contrato; ficou fora desta fatia.
- `x-correlation-id` enviado pelo cliente continua limitado pelo `CHECK` de 8..100 caracteres do banco e pelo truncamento de 100 do servidor; o gate prova valor válido e valor longo truncado, mas não introduz nova validação para valores curtos.
- Não foi simulado disparo real de alertas por taxa 5xx, lentidão ou falha de job, nem worker/scheduler durável, provedor externo, e-mail, SMTP ou dados reais.

## 7. Arquivos alterados

- `src/server/observability-read-contract.mjs` (novo, puro).
- `src/server/observability-api.mjs` (guardas, validação, remoção da escrita de auditoria na leitura, `error_sanitized`).
- `src/server/observability.mjs` (sanitização compartilhada, sem refatoração).
- `server.mjs` (apenas o casamento do id do alerta).
- `tests/plt06-observability-read-contract.test.mjs` (focal no `test:unit`).
- `tests/plt06-observability-read-contract.integration.test.mjs` (gate HTTP/PostgreSQL).
- `scripts/qa-plt06-observability-postgres.mjs` e `package.json` (gate + script npm).
- `docs/PLT-06-OBSERVABILIDADE-JORNADA-RBAC-GATE-2026-11-02.md`, `docs/STATUS-VIGENTE.md`, `docs/CHECKLIST-ENTREGA-LOCAL.md`, `docs/REQUISITOS-222-REAUDITORIA-INVENTARIO-2026-10-27.md`, `tests/requisitos-222-inventory.test.mjs` e artefatos regenerados pelos três geradores oficiais.
