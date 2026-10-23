# UX-PRO-05 — Relatório de Resultado: `/admin/funcionarios` (`Fechamento e holerite` — leitura e releitura de `Publicações de folha já registradas`)

Data: 2026-10-23 (America/Sao_Paulo)  
Branch ativa: `arena/015f8ffb-gruposegsystemseguranca`  
Base em `main`: `5f1d5a713f665b1cea3886ebeabfac1df30d3517` (PR #296)  
Escopo documentado antes da implementação: `docs/UX-PRO-05-FOLHA-HOLERITE-LEITURA-RH-ESCOPO-ANTES-2026-10-23.md`  
Superfície única alterada: `/admin/funcionarios` → aba `Fechamento e holerite` (`Payroll` em `src/app/admin/funcionarios/RhWorkspace.tsx`)

---

## Resumo da Entrega

Na entrega anterior de `UX-PRO-05` (PR #296), `RhWorkspace` passou a manter `docsLoaded`, `docsLoading` e `docsError` para `GET /api/admin/hr/l03/documents`, porém repassou esses estados exclusivamente para a aba `Documentos`, mantendo a aba `Fechamento e holerite` (`Payroll`) fora de escopo para preservar a atomicidade daquela PR.

Como resultado, na aba `Fechamento e holerite` (`src/app/admin/funcionarios/RhWorkspace.tsx`), a seção `Publicações de folha já registradas` (`aria-labelledby="rh-publicacoes-titulo"`):
1. Não recebia `loaded`, `loading`, `error` nem `onRetry`, exibindo o parágrafo `"Nenhuma publicação de folha visível para a sua sessão..."` tanto quando `GET /api/admin/hr/l03/documents` falhava com `503` quanto quando retornava `403` ou ainda estava carregando.
2. Não expunha `aria-busy={loading}` nem `UiState` (`loading`, `error`, `denied`, `empty`).
3. Em falha transitória de releitura (`503`) após lista de holerites já carregada ou após ação confirmada na aba (`POST /api/hr/dp-closures` ou publicação de holerite via `POST` + `PATCH /api/admin/hr/l03/documents`), mantinha os itens anteriores sem nenhum alerta `[data-ui-state="error"]` sobre possível desatualização, sem esclarecer que a falha na releitura não desfaz uma ação já confirmada e sem botão `Tentar carregar novamente`.
4. Em `320px`, concatenava `${doc.employee_name} — ${doc.competence} — ${documentStatusLabel(doc.status)}` dentro de um único `<UiBadge>` (`white-space: nowrap`), causando transbordo horizontal de `61px`.

### Correção mínima e aditiva aplicada (`src/app/admin/funcionarios/RhWorkspace.tsx`)

- `RhWorkspace` passa `loaded={docsLoaded}`, `loading={docsLoading}`, `error={docsError}` e `onRetry={() => { void refresh('silent'); }}` a `<Payroll ... />`.
- `Payroll` adiciona `aria-busy={loading}` na seção `Publicações de folha já registradas`, apresenta contagem no título quando há holerites carregados (`Publicações de folha já registradas (${payrollDocs.length})`) e distingue explicitamente:
  - `readError`: `UiState` com `variant={hrErrorVariant(readError)}`, detalhe específico de leitura para `retry` (`"O servidor não concluiu esta consulta das publicações de folha. Isto não é a mesma coisa que não haver registros."`), aviso explícito de lista anterior preservada (quando `payrollDocs.length > 0`) ou de ausência não confirmada (quando `payrollDocs.length === 0`), garantia de que a falha na consulta/releitura não desfaz uma ação já confirmada, rodapé `hrErrorFootnote(readError)` (`HTTP <status> (<code>)`) e botão `Tentar carregar novamente` apenas quando `readError.canRetry === true`.
  - `loading || !loaded`: `UiState` com `variant="loading"`, diferenciando leitura inicial e atualização com preservação da lista anterior.
  - `loaded && !loading && !readError && !payrollDocs.length`: `UiState` com `variant="empty"` somente após resposta `200` sem holerites no escopo.
- As publicações de folha são renderizadas em `<ul className={styles.knowledgeList}>` + `<li className={styles.knowledgeListItem}>` + `<div className={styles.rowWrap}>`, mantendo `<UiBadge tone={documentStatusTone(doc.status)} srPrefix="Publicação">` exclusivamente para a situação traduzida (`Publicado ao titular`), eliminando o transbordo em `320px` (`overflow = 0px`) sem estilo inline e sem alterar `src/components/ui/**`.

Nenhuma rota, método HTTP, payload, cabeçalho, cookie, `Idempotency-Key`, regra de RBAC/concessão (`employees.read`, `employees.write`, `employees.compensation.read`, `employees.compensation.write`), `sourceAuthorized`, isolamento de conta/titular, armazenamento privado, `audit_log` ou migração SQL (`001–180`) foi alterado.

---

## 1. Inspeção Estática

- `node scripts/qa-wave0-static.mjs`: **PASS** (`5/5 verificações estáticas OK; 0 imports ausentes; 0 migrações ausentes`).
- `npm audit --audit-level=high`: **PASS** (`found 0 vulnerabilities`).
- `npm run typecheck`: **PASS** (`tsc --noEmit` sem erros).
- `node scripts/ux-pro-00-inventory.mjs --check`: **PASS** (`100` entradas de rota, `100` rotas distintas; `docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-13.csv` e `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv` conferem com o código atual).
- `git diff --check`: **PASS** (sem erros de whitespace ou marcadores).
- Verificação de hashes SHA-256 protegidos:
  - `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`
  - `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`

---

## 2. Testes Unitários e de Contrato

### 2.1. Prova RED (antes de alterar `src/`)

Com `src/app/admin/funcionarios/RhWorkspace.tsx` intacto:
- `node --test tests/ux-pro-05-folha-holerite-leitura-rh-ui.test.mjs`: **FAIL esperado (RED)** (`0 pass, 2 fail`), comprovando que `RhWorkspace` não repassava `loaded`, `loading`, `error` e `onRetry` a `Payroll` e que `Payroll` não declarava `aria-busy={loading}` nem `UiState` para `loading`, `error`, `denied` e `empty`.

### 2.2. Prova GREEN (após a correção mínima em `src/`)

- `node --test tests/ux-pro-05-folha-holerite-leitura-rh-ui.test.mjs`: **PASS** (`2/2`).
- `node --test tests/ux-hr-vocabulary.test.mjs`: **PASS** (`24/24`).
- `node --test tests/ux-pro-00-precision.test.mjs tests/admin-navigation.test.mjs`: **PASS** (`10/10`).
- `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm test`: **PASS** (`1003/1003`).
  - *Nota de ambiente local:* conforme diretriz operacional, `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x` foi utilizado localmente para que `@sparticuz/chromium` carregue as bibliotecas AL2023 empacotadas (`libnspr4.so`/NSS) sem instalar pacotes fora do lockfile e sem pular nenhum teste.
- `npm run build`: **PASS** (`105/105` páginas geradas sem erro).

---

## 3. PostgreSQL 17 Descartável + Chromium Real

### 3.1. Prova RED no navegador real (antes de alterar `src/`)

Comando executado contra `src/` intacto:
```bash
UX_HR_TEST_PATTERN="Fechamento e holerite" \
UX_HR_EVIDENCE_DIR="docs/evidencias/ux-pro-05-folha-holerite-leitura-2026-10-23" \
UX_HR_EVIDENCE_PREFIX="antes-ux-pro-05-folha-holerite-leitura" \
node scripts/qa-ux-hr-postgres.mjs
```
- Resultado: **FAIL esperado (RED)** (`0 pass, 2 fail`, `UX_HR_TEST_EXIT: 1`):
  - Em falha `503` (`document_list_unavailable`) de `GET /api/admin/hr/l03/documents`, `section[aria-labelledby="rh-publicacoes-titulo"]` tinha `0` elementos `[data-ui-state="error"]` e exibia apenas o parágrafo `"Nenhuma publicação de folha visível para a sua sessão..."` (registrado em `antes-ux-pro-05-folha-holerite-leitura-erro-inicial-390-day.png`).
  - Em negativa `403` (`permission_scope_denied`) na releitura de `GET /api/admin/hr/l03/documents`, `section[aria-labelledby="rh-publicacoes-titulo"]` limpava os itens mas tinha `0` elementos `[data-ui-state="denied"]` (registrado em `antes-ux-pro-05-folha-holerite-leitura-denied-390-day.png`).

### 3.2. Prova GREEN no navegador real e suítes PostgreSQL 17

- `npm run test:ux-hr:pg`: **PASS** (`20/20` testes em PostgreSQL 17 descartável + migrações `001–180` + Chromium real, `UX_HR_TEST_EXIT: 0`), cobrindo na aba `Fechamento e holerite`:
  1. Falha inicial `503` com `[data-ui-state="error"]`, código `HTTP 503 (document_list_unavailable)`, ausência de `[data-ui-state="empty"]` e mensagem que não contradiz ações confirmadas.
  2. Nova tentativa acionada por teclado (`focus()` + `Enter`) levando a `200` vazio com `[data-ui-state="empty"]` confirmado pelo servidor.
  3. Publicação real de holerite (`POST` + `PATCH /api/admin/hr/l03/documents` com concessão `employees.compensation.write`), persistida como `published` em `employee_private_documents` no PostgreSQL 17 e exibida em `Publicações de folha já registradas (1)`.
  4. Fechamento demonstrativo de competência (`POST /api/hr/dp-closures`) seguido de falha `503` na releitura de `/api/admin/hr/l03/documents`, preservando a publicação anterior na tela junto ao alerta `[data-ui-state="error"]` (`"A lista anterior foi preservada e pode estar desatualizada; a falha nesta releitura não desfaz uma ação já confirmada"`).
  5. Estado `loading` (`[data-ui-state="loading"]`, `aria-busy="true"`, `"Atualizando as publicações de folha…"`) durante a releitura mantendo a publicação anterior visível até a conclusão `200`.
  6. Negativa `403` (`permission_scope_denied`) na releitura limpando imediatamente as publicações sensíveis da tela (fail-closed) e renderizando `[data-ui-state="denied"]` sem botão de repetição e sem `[data-ui-state="empty"]`.
- `AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x npm run test:l03-delivery:pg`: **PASS** (`1/1`, `L03_DELIVERY_TEST_EXIT: 0`).
- `npm run test:rag`: **PASS**.
- `npm run test:tenant:pg`: **PASS** (`22/22`, `TENANT_SEG_001_TEST_EXIT: 0`).
- `npm run test:demo-local:pg`: **PASS** (`QA-HOM-008/009_TEMP_CLEANED: true`).
- `npm run test:cli-v2:pg`: **PASS** (`11/11`, `QA_CLI_V2_TEST_EXIT: 0`).

---

## 4. Medidas de Layout e Inspeção Individual de Capturas

Diretório de evidências: `docs/evidencias/ux-pro-05-folha-holerite-leitura-2026-10-23/`

### 4.1. Medidas de transbordo horizontal (`scrollWidth - clientWidth`)

| Viewport | Tema | `clientWidth` | `overflow` (`scrollWidth - clientWidth`) | Critério (`<= 1px`) |
| --- | --- | --- | --- | --- |
| `320x844` | `day` | `320px` | `0px` | PASS |
| `390x844` | `day` | `390px` | `0px` | PASS |
| `768x900` | `day` | `768px` | `0px` | PASS |
| `1440x900` | `day` | `1440px` | `0px` | PASS |
| `390x844` | `night` | `390px` | `0px` | PASS |

### 4.2. Inspeção visual individual das capturas antes/depois

1. `antes-ux-pro-05-folha-holerite-leitura-erro-inicial-390-day.png`: evidencia o defeito antes da correção em `390x844` (`day`); com `GET /api/admin/hr/l03/documents` retornando `503`, a seção `Publicações de folha já registradas` exibe apenas o texto `"Nenhuma publicação de folha visível para a sua sessão..."`, sem estado de erro e sem ação de nova tentativa.
2. `antes-ux-pro-05-folha-holerite-leitura-denied-390-day.png`: evidencia o defeito antes da correção em `390x844` (`day`); após resposta `403`, a lista é limpa mas a seção exibe o mesmo parágrafo genérico de ausência em vez de `Acesso negado`.
3. `depois-ux-pro-05-folha-holerite-leitura-erro-inicial-390-day.png`: comprova o `UiState` de erro (`FALHA NA CONSULTA — Falha no servidor`), com explicação de que a falha não significa ausência de holerites e não desfaz ação confirmada, diagnóstico `HTTP 503 (document_list_unavailable)` e botão `Tentar carregar novamente`.
4. `depois-ux-pro-05-folha-holerite-leitura-vazio-390-day.png`: comprova o `UiState` de vazio (`NENHUM REGISTRO — Nenhuma publicação de folha visível para a sua sessão`) exibido somente após resposta `200` sem holerites.
5. `depois-ux-pro-05-folha-holerite-leitura-preservado-320-day.png`: comprova em `320x844` (`day`) a preservação do item `Pessoa FolhaLeitura — 2026-10` com selo `Publicado ao titular` abaixo do alerta `FALHA NA CONSULTA` na releitura falha pós-fechamento, com quebra limpa e `0px` de transbordo horizontal.
6. `depois-ux-pro-05-folha-holerite-leitura-preservado-390-day.png`: comprova em `390x844` (`day`) o alerta de releitura falha junto à publicação preservada, sem sobreposição ou corte.
7. `depois-ux-pro-05-folha-holerite-leitura-preservado-768-day.png`: comprova em `768x900` (`day`) o alinhamento da seção `Publicações de folha já registradas (1)` com o alerta e o item preservado em linha.
8. `depois-ux-pro-05-folha-holerite-leitura-preservado-1440-day.png`: comprova em `1440x900` (`day`) o layout de duas colunas para os formulários superiores e largura total (`styles.full`) para `Publicações de folha já registradas (1)` com o item preservado.
9. `depois-ux-pro-05-folha-holerite-leitura-preservado-390-night.png`: comprova em `390x844` (`night`) o contraste, as bordas semânticas e a legibilidade do alerta de erro e do selo `Publicado ao titular` no tema noturno administrativo (`overflow = 0px`).
10. `depois-ux-pro-05-folha-holerite-leitura-loading-390-day.png`: comprova em `390x844` (`day`) o estado `CARREGANDO — Atualizando as publicações de folha…` durante a nova tentativa, mantendo `Pessoa FolhaLeitura — 2026-10` (`Publicado ao titular`) visível enquanto o servidor responde.
11. `depois-ux-pro-05-folha-holerite-leitura-denied-390-day.png`: comprova em `390x844` (`day`) que a resposta `403` remove imediatamente o item sensível da tela (fail-closed) e apresenta `ACESSO NEGADO — Sem a concessão necessária` com `HTTP 403 (permission_scope_denied)` e sem botão de repetição.

---

## 5. Aceite Humano Operacional

- **Status:** **Não realizado.**
- Nenhuma verificação automatizada, teste em PostgreSQL + Chromium ou inspeção visual de captura substitui o aceite humano operacional pelos responsáveis do negócio (Marcelo / Andreia / operação de RH).
