# UX-PRO-05 — Ponto e ajustes no RH e reflexo na jornada do funcionário (escopo antes)

**Data:** 2026-10-23 (UTC)  
**Base:** `main` em `9769e9c7647e712141712313e53a55cd6df8f310` (após merge da PR #294 ` chore(deps): atualizar Next.js para 16.4.2 e restaurar gate npm audit`).  
**PRs abertas na conferência:** nenhuma (`0`).  
**Superfície selecionada:** `/admin/funcionarios` → aba `Ponto e ajustes` (`src/app/admin/funcionarios/TimeCorrectionReviews.tsx`, vocabulário `src/lib/hr-vocabulary.mjs`) e rótulo de situação da jornada corrigida em `/funcionario` → aba `Jornada` (`src/lib/portal-vocabulary.mjs`).

---

## 1. Reconciliação das pendências UX contra o código montado na `main`

O documento `docs/UX-PRO-RESIDUOS-DECISOES-ESCOPO-ANTES-2026-10-21.md` (PR #284) antecede as PRs #285–#294. A reconciliação direta contra as PRs integradas e contra `src/app/` em `9769e9c7647e712141712313e53a55cd6df8f310` confirma:

- **UX-PRO-09E / contraste e crescimento textual:** entregues nas PRs #285 (`PU4`), #286 (`PU6`) e #287 (`09E-7`).
- **ID3 (`/cliente/app/*`):** auditada e entregue na PR #288 (`docs/UX-PRO-ID3-PORTAL-CLIENTE-ESCOPO-ANTES-2026-10-21.md`), cobrindo as 10 páginas restantes do portal do cliente e corrigindo `/cliente/app/cobrancas`.
- **UX-PRO-03 (`/admin/ti`):** todas as 12 abas montadas em `src/app/admin/ti/TiConsole.tsx` já possuem entregas dedicadas em `docs/UX-PRO-03-*` e suítes `tests/ux-pro-03-*.test.mjs`.
- **UX-PRO-04 (painel executivo, pendências, relatórios e analytics):** as quatro superfícies nomeadas já foram entregues separadamente — `/admin/marcelo` (`UX-PRO-04-PAINEL-MARCELO-2026-10-13.md`), `/admin/pendencias` (PR #289), `/admin/relatorios` (PR #290) e `/admin/analytics` (PR #291).
- **UX-PRO-06 (funil, comercial, carteira, clientes e contratos):** já reconciliada e entregue em `docs/UX-PRO-06-*`.
- **UX-PRO-05 (RH e portal do funcionário):**
  - `/funcionario` → `Jornada` (`EmployeeTimeClock.tsx`) foi entregue na PR #209 (`docs/UX-PRO-05-JORNADA-FUNCIONARIO-2026-10-13.md`), deixando explicitamente fora de escopo `/admin/funcionarios` e a revisão de RH;
  - `/funcionario` (`Pedidos`) ↔ `/admin/funcionarios` (`Solicitações`) foi entregue na PR #292 (`docs/UX-PRO-05-SOLICITACOES-RH-RESULTADO-2026-10-22.md`);
  - `/admin/funcionarios` (`Documentos`) ↔ `/funcionario` (`Docs`) foi entregue na PR #293 (`docs/UX-PRO-05-DOCUMENTOS-RH-RESULTADO-2026-10-22.md`);
  - `Equipe`, `Admissão e acesso`, `Escala`, `Fechamento e holerite`, `Desligamento` e o tablist de `Demais processos de RH` já usam `UiWorkspace.module.css`, `UiState`, `UiBadge`, `<label htmlFor>` explícito e cobertura em `tests/ux-hr-workspace.integration.test.mjs`;
  - **lacuna comprovada remanescente:** a aba `Ponto e ajustes` (`src/app/admin/funcionarios/TimeCorrectionReviews.tsx`), contraparte direta de RH da jornada entregue em `UX-PRO-05-JORNADA-FUNCIONARIO`, permanece sem revisão de estados honestos, associação explícita de rótulos, vocabulário canônico traduzido e gate navegador ponta a ponta.

Itens classificados em `docs/UX-PRO-RESIDUOS-DECISOES-ESCOPO-ANTES-2026-10-21.md` como dependentes de decisão do proprietário (ativação de componentes órfãos, promoção de telas legadas `HR-01..24`, mudança de arquitetura de navegação ou contratos de API) permanecem intocados.

---

## 2. Lacunas comprovadas na superfície selecionada

1. **Falha de leitura apaga a lista carregada e não usa estado honesto (`UiState`):**
   - Em `TimeCorrectionReviews.tsx`, `load()` executa `setItems([])` no bloco `catch` ao consultar `GET /api/admin/hr/l03/time-corrections`. Uma falha transitória (`HTTP 503`) após carregamento prévio descarta a fila já visível e publica apenas texto simples em `<p role="status">`, sem `UiState`, sem código/status HTTP diagnósticos e sem ação dedicada de nova tentativa no bloco de erro.
   - Em `ClockHistory`, falhas em `GET /api/admin/hr/l03/time-clock` e `GET /api/admin/hr/l03/time-punches` também caem em `<p role="status">` em vez de estado explícito de erro (`role="alert"` / `UiState`) com opção de repetição.
2. **Controles de formulário sem `<label htmlFor>` e `id` associados:**
   - Os 6 controles de `TimeCorrectionReviews.tsx` (`select` de funcionário em `ClockHistory` e `clockIn`, `clockOut`, `hours`, `reviewed` e `reason` em `Review`) envolvem inputs sem `id`/`htmlFor`, falhando no critério de rótulos explícitos já exigido nas demais abas de `/admin/funcionarios`.
3. **Tokens canônicos crus e despejo `JSON.stringify` como leitura principal:**
   - A fila de revisão exibe `Status: solicitado|em_analise|aprovado|rejeitado` cru em vez de `UiBadge` traduzido;
   - o histórico por funcionário exibe data ISO crua (`YYYY-MM-DD`) e `status` cru (`pendente`, `divergente`, `corrigido`);
   - os comprovantes geográficos exibem `kind` cru (`entrada`, `saida_intervalo`, `retorno_intervalo`, `saida`) e expõem UUID + hash SHA-256 diretamente no corpo principal, em vez de recolhê-los em `<details>` técnico como já faz `EmployeeTimeClock.tsx`;
   - a comparação entre registro original, alteração solicitada e ajuste aprovado só aparece como `<pre>{JSON.stringify(...)}</pre>` (incluindo colunas internas de `original_snapshot`), sem resumo legível em português.
4. **Estilos inline e alvos de ação fora do padrão compartilhado do RH:**
   - `Review` usa `style={{ border: ... }}` inline e botões fora de `.actions`, sem garantir altura mínima de toque (`44px`) e consistência visual com `RhWorkspace.tsx`.
5. **Rótulo de situação após aprovação do ajuste no portal do funcionário:**
   - Ao aprovar um ajuste em `PATCH /api/admin/hr/l03/time-corrections`, o servidor grava `hr_time_entries.status = 'corrigido'`. Na aba `Jornada` → seção `Jornada e correções` de `/funcionario` (`EmployeePortal.tsx`), `employeeItemStatusLabel(item.status)` não possuía mapeamento para `'corrigido'`, `'em_correcao'`, `'divergente'` e `'solicitado'`, exibindo o token cru ao titular.

---

## 3. Escopo desta PR

1. Estender de forma aditiva `src/lib/hr-vocabulary.mjs` com os conjuntos canônicos de ponto e ajustes (`TIME_PUNCH_KINDS`, `TIME_ENTRY_STATUS`, `TIME_CORRECTION_STATUS` e respectivos helpers de rótulo/tom) e mensagens em português para códigos de `employee-time-clock-api.mjs` (`competence_closed`, `correction_not_found`, `time_entry_not_found`, `invalid_correction_decision`, `invalid_time_changes`, `invalid_employee_id`, `time_clock_unavailable`), amarrados por teste às migrações `061`, `065` e `176` e aos módulos de API.
2. Estender de forma aditiva `src/lib/portal-vocabulary.mjs` (`EMPLOYEE_ITEM_STATUS_LABELS` e `employeeItemStatusTone`) para traduzir `'solicitado'`, `'em_correcao'`, `'corrigido'` e `'divergente'`, sem alterar nenhum valor enviado ou persistido.
3. Refatorar `src/app/admin/funcionarios/TimeCorrectionReviews.tsx` (com módulo CSS local mínimo `TimeCorrectionReviews.module.css`, sem editar CSS compartilhado) para:
   - preservar `UiTaskWorkspace`, `UiState`, `UiBadge` e `UiWorkspace.module.css` (mantendo intacta a assinatura de inventário da rota `/admin/funcionarios`);
   - preservar a última lista carregada de pedidos quando uma releitura de `GET /api/admin/hr/l03/time-corrections` falhar, exibindo `UiState` honesto com status HTTP, código canônico e botão de repetição;
   - exibir estados honestos de carregamento, vazio, erro e confirmação em `ClockHistory`, comprovantes e decisões de `Review`, sem apagar campos preenchidos pelo RH quando `PATCH` falhar;
   - associar todos os controles com `id` único e `<label htmlFor>` visível;
   - apresentar resumo humano do registro original, alteração solicitada e ajuste aprovado, mantendo o snapshot técnico recolhido em `<details>` e preservando integralmente as mensagens de privacidade/endereço HERE.
4. Adicionar cobertura automatizada focal (`tests/ux-pro-05-ponto-rh-ui.test.mjs`) e estender os gates PostgreSQL + Chromium (`tests/ux-hr-workspace.integration.test.mjs` e `tests/ux-portal-workspace.integration.test.mjs`) cobrindo falha de leitura sem falso vazio e o fluxo ponta a ponta funcionário → RH (`em_analise`, `aprovado`, `rejeitado`) → funcionário, com isolamento entre titulares A/B, trilha de auditoria e imutabilidade das marcações originais.

---

## 4. Riscos e controles

- **Autorização e escopo:** nenhuma mudança em `AdminGate`, `rbac.mjs`, `employee-api.mjs` ou `employee-time-clock-api.mjs`. `employees.read`, `employees.write`, bloqueio de autoaprovação (`self_approval_forbidden`) e trava de competência fechada permanecem decididos exclusivamente no servidor.
- **Privacidade e imutabilidade do ponto:** coordenadas, precisão, status HERE e `emp_time_punches` continuam somente leitura e imutáveis por trigger no banco; o RH visualiza apenas funcionários no seu escopo e cada titular vê apenas a própria jornada.
- **Contratos e banco:** zero novas rotas, métodos, colunas ou migrações; payloads de `GET/PATCH /api/admin/hr/l03/time-corrections`, `GET /api/admin/hr/l03/time-clock` e `GET /api/admin/hr/l03/time-punches` permanecem idênticos.
- **Arquivos sensíveis e gerados:** não editar `UiWorkspace.module.css`; preservar hashes SHA-256 de `next-env.d.ts` e `tsconfig.json`; confirmar `node scripts/ux-pro-00-inventory.mjs --check` sem alterar a contagem de 100 rotas.
- **Honestidade de evidência:** usar exclusivamente massa sintética em PostgreSQL descartável; separar inspeção estática, testes automatizados e capturas automatizadas de validação manual e aceite humano (não realizados).

---

## 5. Validação planejada e critério de parada

1. Criar primeiro o teste focal (`tests/ux-pro-05-ponto-rh-ui.test.mjs`) e executá-lo contra a `main` limpa para comprovar a falha antes da implementação.
2. Implementar a correção mínima e validar localmente:
   - `node --test tests/ux-pro-05-ponto-rh-ui.test.mjs tests/ux-hr-vocabulary.test.mjs tests/ux-portal-vocabulary.test.mjs`
   - `npm run test:ux-hr:pg` e `npm run test:ux-portal:pg` (PostgreSQL 17 descartável + Chromium real em 320, 390, 768 e 1440 px, temas dia/noite e navegação por teclado)
   - `npm audit --audit-level=high`, `node scripts/qa-wave0-static.mjs`, `npm run typecheck`, `npm test`, `node scripts/ux-pro-00-inventory.mjs --check`, `npm run build` e `git diff --check`.
3. Abrir PR única baseada em `main`, aguardar todos os checks obrigatórios verdes e revisão concluída antes de qualquer merge. Se qualquer gate ou check falhar ou ficar pendente, interromper, preservar o trabalho e relatar a causa verificável sem avançar para outra fatia.
