# UX-PRO-05 — Escopo Antes da Implementação: `/admin/funcionarios` (`Fechamento e holerite` — leitura e releitura de `Publicações de folha já registradas`)

Data: 2026-10-23 (America/Sao_Paulo)  
Branch ativa da sessão: `arena/015f8ffb-gruposegsystemseguranca`  
Base em `main`: `5f1d5a713f665b1cea3886ebeabfac1df30d3517` (PR #296)  
Fatia do plano mestre: `UX-PRO-05` — RH administrativo (`/admin/funcionarios`)  
Superfície única desta entrega: `/admin/funcionarios` → aba `Fechamento e holerite` (`Payroll` em `src/app/admin/funcionarios/RhWorkspace.tsx`)

---

## 1. Confirmação de branch, árvore, PRs e workflows em `main`

- Branch confirmada: `arena/015f8ffb-gruposegsystemseguranca` (árvore limpa, `0/0` com `origin/main` em `5f1d5a713f665b1cea3886ebeabfac1df30d3517`).
- PRs abertas: nenhuma. PRs anteriores #282 a #296 encontram-se `MERGED` em `main`.
- Workflows pós-merge de `5f1d5a713f665b1cea3886ebeabfac1df30d3517` em `main`:
  - `QA baseline`: run `39897971613` — `completed` / `success`.
  - `PostgreSQL 17 backup and restore gates`: run `39897971621` — `completed` / `success`.
- Hashes protegidos verificados antes de qualquer alteração:
  - `next-env.d.ts`: `18b697c4794f97edd5aed1537bf1d1882597f545881dfcba7fc8c659075f11a2`
  - `tsconfig.json`: `2128c956b8c75820bc217c00557346befa1e687565d2d8a0bb970faadb7a8d65`

---

## 2. Reconciliação da matriz com o código montado e exclusões respeitadas

Na matriz `docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv`:

| Rota | Evidência na matriz | Componentes montados hoje | Situação verificada no código atual |
| --- | --- | --- | --- |
| `/admin/funcionarios` | `parcial_real` (`UX-PRO-05`) | `src/app/admin/funcionarios/page.tsx` → `RhWorkspace.tsx` (`Team`, `Admission`, `Schedule`, `TimeCorrectionReviews`, `RequestReviews`, `Documents`, `Payroll`, `Termination`, `HrProcesses`) | As abas `Solicitações` (#292), `Documentos` (#293 e #296) e `Ponto e ajustes` (#295) já receberam tratamento de estados de leitura/vocabulário. Na PR #296 (`docs/UX-PRO-05-DOCUMENTOS-LEITURA-RH-ESCOPO-ANTES-2026-10-23.md`), a aba `Fechamento e holerite` (`Payroll`) foi explicitamente mantida fora de escopo para preservar a atomicidade daquela entrega (`"Payroll também recebe docs; sua interface e regras não serão alteradas"`). |

Exclusões obrigatórias respeitadas:
- Componentes legados/órfãos (`src/app/admin/ti/HrClient.tsx`, `src/app/admin/ti/HrRecruitmentClient.tsx`, `src/app/admin/ti/HrBenefitsClient.tsx`) permanecem fora de escopo, conforme `docs/UX-PRO-RESIDUOS-DECISOES-ESCOPO-ANTES-2026-10-21.md`.
- Nenhuma entrega anterior (#284–#296) será retrabalhada.
- `/funcionario` permanece fora do escopo desta fatia atômica.

---

## 3. Defeito comprovado no código atual

Arquivo: `src/app/admin/funcionarios/RhWorkspace.tsx`

### 3.1. Evidência por inspeção estática (`RhWorkspace.tsx:333` e `1035–1160`)

1. Na linha `333`, `RhWorkspace` instancia `Payroll` apenas com `employees`, `docs` e `run`:
   ```tsx
   {tab === 'folha' ? <Payroll employees={employees} docs={docs} run={run} /> : null}
   ```
   Os estados já mantidos por `RhWorkspace` para `GET /api/admin/hr/l03/documents` (`docsLoaded`, `docsLoading`, `docsError` e `onRetry={() => { void refresh('silent'); }}`) não são repassados a `Payroll`.

2. Nas linhas `1035–1160`, `Payroll` filtra `const payrollDocs = docs.filter(doc => doc.document_kind === 'payroll')` e, na seção `Publicações de folha já registradas` (`aria-labelledby="rh-publicacoes-titulo"`, linhas `1138–1158`), renderiza apenas dois ramos:
   ```tsx
   <section className={`${styles.panel} ${styles.full}`} aria-labelledby="rh-publicacoes-titulo">
     <h3 id="rh-publicacoes-titulo" className={styles.panelTitle}>Publicações de folha já registradas</h3>
     {payrollDocs.length ? (
       <div className={styles.badgeRow}>
         {payrollDocs.map(doc => (
           <UiBadge key={doc.id} tone={documentStatusTone(doc.status)} srPrefix="Publicação">
             {doc.employee_name} — {doc.competence || 'sem competência'} — {documentStatusLabel(doc.status)}
           </UiBadge>
         ))}
       </div>
     ) : (
       <p className={styles.hint}>
         Nenhuma publicação de folha visível para a sua sessão. Isto pode significar que não há nenhuma ou
         que a sua conta não tem a concessão de leitura de remuneração.
       </p>
     )}
   </section>
   ```

### 3.2. Consequências observáveis no navegador

1. **Falha transitória na leitura inicial (`503` em `GET /api/admin/hr/l03/documents`):**
   - `docs` é `[]` e `payrollDocs` é `[]`.
   - A seção `Publicações de folha já registradas` exibe `"Nenhuma publicação de folha visível para a sua sessão..."` como se a consulta tivesse respondido vazia ou sem concessão, sem `UiState` de erro (`[data-ui-state="error"]`), sem código/status HTTP (`HTTP 503 (document_list_unavailable)`) e sem botão `Tentar carregar novamente`.
2. **Carregamento inicial ou releitura em andamento (`loading || !loaded`):**
   - A seção `#rh-publicacoes-titulo` não expõe `aria-busy={loading}` nem `UiState` de carregamento (`[data-ui-state="loading"]`).
   - Antes da primeira resposta do servidor, se `docs` ainda está vazio, a seção já exibe o texto de ausência de publicações.
3. **Falha transitória na releitura (`503` em `GET /api/admin/hr/l03/documents` após lista carregada ou após ação confirmada na aba):**
   - Quando já existem selos em `payrollDocs` e uma releitura subsequente falha (por exemplo, após `POST /api/hr/dp-closures` fechar período ou `POST` + `PATCH /api/admin/hr/l03/documents` publicar novo holerite), os selos anteriores permanecem visíveis por conta da preservação de `docs` em `RhWorkspace`, porém a seção `Publicações de folha já registradas` não exibe nenhum `UiState` de erro (`[data-ui-state="error"]`), não avisa que a lista exibida é a anterior preservada e pode estar desatualizada, não esclarece que a falha na releitura não desfaz uma ação já confirmada e não oferece botão `Tentar carregar novamente`.
   - Além disso, quando a primeira publicação de holerite é confirmada (`POST 201` + `PATCH 200` em `/api/admin/hr/l03/documents`) a partir de uma lista inicialmente vazia e o `GET /api/admin/hr/l03/documents` subsequente falha com `503`, a seção continua mostrando `"Nenhuma publicação de folha visível para a sua sessão..."` logo abaixo do aviso de publicação confirmada, contradizendo a gravação recém-confirmada.
   - A mensagem genérica de `describeHrError` para `retry` (`"Nada foi carregado nem gravado"`) também seria enganosa após mutação confirmada, exigindo texto específico de consulta/releitura em `Payroll`.
4. **Perda de concessão ou sessão (`401/403` em `GET /api/admin/hr/l03/documents`):**
   - `RhWorkspace` limpa `docs` em modo fail-closed (`setDocs([])`), removendo os selos sensíveis de folha da tela, mas `Payroll` recai no `<p className={styles.hint}>Nenhuma publicação de folha visível...</p>` em vez de renderizar `UiState` de `denied`/`auth` com diagnóstico `HTTP 403 (...)` e `canRetry === false` (sem botão de repetição).
5. **Ausência confirmada (`200` vazio):**
   - Somente quando `loaded && !loading && !readError && !payrollDocs.length` a ausência de publicações de folha foi confirmada pelo servidor e deve ser apresentada em `UiState` com `variant="empty"` (`[data-ui-state="empty"]`).
6. **Transbordo horizontal em `320px` nos selos de publicação (`61px`):**
   - Ao concatenar `${doc.employee_name} — ${doc.competence} — ${documentStatusLabel(doc.status)}` dentro de um único `<UiBadge>` (`white-space: nowrap`), qualquer publicação excede a largura útil do painel em `320px` (`overflow = 61px`). Estruturar os itens em `<ul className={styles.knowledgeList}>` + `<li className={styles.knowledgeListItem}>` + `<div className={styles.rowWrap}>`, mantendo `<UiBadge>` exclusivamente para o rótulo de situação (`Publicado ao titular`), elimina o transbordo (`overflow = 0px` em `320`, `390`, `768` e `1440`) sem usar `style` inline e sem tocar em `src/components/ui/**`.

---

## 4. Contratos e garantias a preservar

- Nenhuma alteração em rotas, métodos HTTP, payloads, cabeçalhos, cookies, `Idempotency-Key`, RBAC, concessões finas (`employees.read`, `employees.write`, `employees.compensation.read`, `employees.compensation.write`), `sourceAuthorized`, isolamento de conta/titular, armazenamento privado, `audit_log` ou migrações SQL `001–180`.
- Os dois formulários de mutação de `Payroll` (`Fechar período demonstrativo` → `POST /api/hr/dp-closures` e `Publicar holerite` → `POST` + `PATCH /api/admin/hr/l03/documents`) mantêm seus campos, rótulos, validações, travas de submissão (`useSubmitLock`) e contratos HTTP inalterados.
- `RhWorkspace.refresh` permanece sem alteração nos contratos de busca de `employees`, `docs`, `requests` e `processes`.
- Em `401/403` na leitura de `/api/admin/hr/l03/documents`, `docs` continua sendo limpo imediatamente (`setDocs([])`, fail-closed), ocultando selos de publicações anteriores e exibindo `UiState` de negativa/autenticação sem botão de repetição para `403`.
- Em falha transitória (`5xx` / rede) na releitura de `/api/admin/hr/l03/documents`, os selos anteriores de `payrollDocs` permanecem visíveis junto ao `UiState` de erro (`[data-ui-state="error"]`), com texto explícito de que a falha na consulta/releitura não desfaz uma ação já confirmada e com botão `Tentar carregar novamente`.
- Preservar integralmente os hashes SHA-256 de `next-env.d.ts` e `tsconfig.json`.

---

## 5. Riscos e mitigação

- **Risco:** Regressão nos testes existentes de RH (`tests/ux-hr-workspace.integration.test.mjs`, `tests/l03-delivery.integration.test.mjs`, `tests/ux-hr-vocabulary.test.mjs`).
  - **Mitigação:** Manter intactos todos os rótulos de campos, botões e selos (`Publicação: ...`), preservando o título da seção `Publicações de folha já registradas` e adicionando apenas os estados `UiState` (`loading`, `error`, `denied`, `empty`) e `aria-busy={loading}` na seção `#rh-publicacoes-titulo`.
- **Risco:** Mensagem de erro de releitura contradizer fechamento de período ou publicação de holerite recém-confirmados.
  - **Mitigação:** Substituir o detalhe genérico de `retry` (`"Nada foi carregado nem gravado"`) por detalhe específico de leitura das publicações de folha e afirmar explicitamente que a falha na consulta/releitura não desfaz uma ação já confirmada.

---

## 6. Arquivos previstos

- `docs/UX-PRO-05-FOLHA-HOLERITE-LEITURA-RH-ESCOPO-ANTES-2026-10-23.md` (este documento de escopo antes da implementação)
- `src/app/admin/funcionarios/RhWorkspace.tsx` (passagem de `loaded`, `loading`, `error`, `onRetry` a `Payroll` e tratamento explícito de `loading`, `error`, `denied` e `empty` na seção `Publicações de folha já registradas`)
- `tests/ux-pro-05-folha-holerite-leitura-rh-ui.test.mjs` (teste unitário/contrato da seção `Publicações de folha já registradas` em `Payroll`)
- `tests/ux-hr-vocabulary.test.mjs` (importação do novo teste unitário/contrato para execução automática no gate `UX RH delivery`)
- `tests/ux-hr-workspace.integration.test.mjs` (teste em PostgreSQL 17 descartável + Chromium real exercitando `Fechamento e holerite` em falha inicial `503`, lista vazia confirmada `200`, publicação real de holerite com concessão `employees.compensation.write`, falha `503` na releitura com preservação da lista anterior, recuperação na nova tentativa e limpeza fail-closed em `403` sem botão de repetição)
- `docs/evidencias/ux-pro-05-folha-holerite-leitura-2026-10-23/` (capturas reais antes/depois e `resumo.json`)
- `docs/UX-PRO-05-FOLHA-HOLERITE-LEITURA-RH-RESULTADO-2026-10-23.md` (relatório final da entrega)

---

## 7. Plano de validação e critérios de parada

1. **Prova RED antes da implementação:**
   - Criar `tests/ux-pro-05-folha-holerite-leitura-rh-ui.test.mjs` e o caso de integração em `tests/ux-hr-workspace.integration.test.mjs` com `src/` intacto.
   - Executar ambos para comprovar a falha esperada (RED) e capturar a evidência visual `antes-ux-pro-05-folha-holerite-leitura-erro-inicial-390-day.png`.
2. **Implementação mínima e aditiva:**
   - Atualizar apenas `src/app/admin/funcionarios/RhWorkspace.tsx` (`Payroll`).
3. **Validação completa pós-implementação (GREEN):**
   - Testes unitários/contrato (`node --test tests/ux-pro-05-folha-holerite-leitura-rh-ui.test.mjs`, `node --test tests/ux-hr-vocabulary.test.mjs`).
   - Integração PostgreSQL 17 descartável + Chromium real (`npm run test:ux-hr:pg` e `node --test tests/l03-delivery.integration.test.mjs`), validando viewports `320`, `390`, `768` e `1440` (`overflow <= 1`), temas `day` e `night`, operação por teclado e inspeção individual de cada captura antes/depois.
   - Gates completos da repositório e CI (`node scripts/qa-wave0-static.mjs`, `npm audit --audit-level=high`, `npm run typecheck`, `npm test`, `node scripts/ux-pro-00-inventory.mjs --check`, `node --test tests/ux-pro-00-precision.test.mjs tests/admin-navigation.test.mjs`, `npm run build`, `npm run test:rag`, `npm run test:tenant:pg`, `npm run test:demo-local:pg`, `npm run test:cli-v2:pg`, `git diff --check` e verificação de `sha256sum next-env.d.ts tsconfig.json`).
4. **Critérios de parada:**
   - Parar imediatamente e relatar se qualquer gate, teste, check de CI ou review obrigatória falhar ou ficar pendente.
   - Nunca registrar aceite humano como realizado (registrar explicitamente como **não realizado**).
