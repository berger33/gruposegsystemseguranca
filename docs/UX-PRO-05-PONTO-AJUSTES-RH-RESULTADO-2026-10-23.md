# UX-PRO-05 — Ponto e ajustes (RH) ↔ Jornada (Funcionário): resultado e evidências (2026-10-23)

## 1. Resumo executivo

Esta entrega conclui a profissionalização de UX, acessibilidade, linguagem operacional e honestidade de estado da aba **Ponto e ajustes** em `/admin/funcionarios` (`src/app/admin/funcionarios/TimeCorrectionReviews.tsx`) e fecha o reflexo de vocabulário na aba **Jornada** do portal do funcionário (`/funcionario` → `src/lib/portal-vocabulary.mjs`), sucedendo a entrega de PR #294 (segurança de dependências Next.js `16.4.2` no `main`).

Nenhum endpoint, método HTTP, payload, cabeçalho, regra de autorização (`employees.read` / `employees.write`), trava transacional, fechamento de competência, imutabilidade de `emp_time_punches`, consentimento HERE ou registro de auditoria (`emp_journey_correction_request`, `emp_journey_correction_em_analise`, `emp_journey_correction_aprovado`, `emp_journey_correction_rejeitado`) foi alterado.

---

## 2. Antes × Depois verificável

| Dimensão | Antes (reproduzido em `docs/UX-PRO-05-PONTO-AJUSTES-RH-ESCOPO-ANTES-2026-10-23.md`) | Depois |
|---|---|---|
| **Falha na leitura da fila (`GET /api/admin/hr/l03/time-corrections`)** | `fetch` direto zerava `setItems([])` no `catch` e misturava erro e sucesso num único `<p role="status">`, apagando a fila previamente carregada. | `hrRequest` + `UiState` com `hrErrorVariant(readError)`, rodapé `hrErrorFootnote` (`HTTP 503 (time_clock_unavailable)` ou `HTTP 403 (permission_scope_denied)`), botão `Tentar carregar novamente` apenas quando `canRetry === true`, e **preservação integral dos cartões já carregados** em falhas posteriores. |
| **Consulta de ponto e marcações por funcionário (`ClockHistory` / `PunchProofList`)** | `fetch` direto sem `UiState` de carregamento/erro/vazio; tokens crus de `kind` (`saida_intervalo`, `retorno_intervalo`) e `status` (`em_correcao`, `corrigido`, `divergente`); hash SHA-256 exposto diretamente na linha principal. | `hrRequest` + `UiState` (`loading`, `error`/`denied`, `empty`), `UiBadge` traduzido (`Pendente`, `Em correção`, `Corrigido`, `Divergente`, `Aprovado`, `Rejeitado`), tipos de marcação traduzidos (`Entrada`, `Início do intervalo`, `Fim do intervalo`, `Saída`), status transparente do HERE preservado e código/hash recolhidos em `<details>`. |
| **Acessibilidade e controles de formulário (`TimeCorrectionReviews`)** | 6 controles (`<select>`, 2 `<input type="time">`, `<input type="number">`, `<input type="checkbox">`, `<textarea>`) sem `id` nem `<label htmlFor>`, dependendo de wrappers implícitos ou `placeholder`; checkbox herdava `width: 100%; min-height: 44px` de `.workspace input`; 5 blocos `style={{...}}` inline. | Todos os controles possuem `id` determinístico e `<label htmlFor>` explícito; decisão agrupada em `<fieldset><legend>Decisão do RH</legend></fieldset>`; zero estilos inline; `.checkRow input.checkboxControl` com `20×20px` dentro de linha clicável `>= 44px`. |
| **Contraste no modo noite administrativo** | Em `html[data-admin-theme="night"]`, `--ux-color-brand` passa a `#92bdf2` enquanto `.actions .primary` mantinha `color: #fff` (baixo contraste sobre fundo azul-claro). | `TimeCorrectionReviews.module.css` aplica `color: var(--ux-color-canvas)` (`#111b2b`) ao botão primário `Aprovar ajuste` no escopo noturno, alinhado ao contraste AA das abas ativas. |
| **Reflexo no portal do titular (`/funcionario` → `Jornada`)** | `EMPLOYEE_ITEM_STATUS_LABELS` não possuía `solicitado`, `em_correcao`, `corrigido` nem `divergente`, exibindo `8.00 h • corrigido` com token cru após aprovação do RH. | `portal-vocabulary.mjs` traduz `solicitado` (`Aguardando análise`), `em_correcao` (`Em correção`), `corrigido` (`Corrigido`) e `divergente` (`Divergente`) com tons semânticos em `employeeItemStatusTone`. |

---

## 3. Arquivos alterados nesta fatia

- `src/lib/hr-vocabulary.mjs` e `src/lib/hr-vocabulary.d.mts` — catálogos `TIME_PUNCH_KINDS`, `TIME_ENTRY_STATUS`, `TIME_CORRECTION_STATUS`, helpers de rótulo/tom, `hrErrorFootnote`, cobertura dos códigos canônicos de `employee-time-clock-api.mjs` / `time-clock-core.mjs`, `canRetry` habilitado para `kind === 'retry'` e remoção da chave duplicada `rejection_reason_required`.
- `src/lib/portal-vocabulary.mjs` — tradução e tom para `solicitado`, `em_correcao`, `corrigido` e `divergente`.
- `src/app/admin/funcionarios/TimeCorrectionReviews.module.css` — layout em CSS Modules tokenizado, linha de confirmação `.checkRow input.checkboxControl`, detalhes técnicos recolhíveis e contraste noturno de botão primário.
- `src/app/admin/funcionarios/TimeCorrectionReviews.tsx` — refatoração completa preservando 100% dos contratos HTTP e regras de negócio.
- `tests/ux-pro-05-ponto-rh-ui.test.mjs`, `tests/ux-hr-vocabulary.test.mjs`, `tests/ux-portal-vocabulary.test.mjs` — suíte unitária focal (criada e provada falhando antes da edição de `src/`).
- `tests/ux-hr-workspace.integration.test.mjs` e `tests/ux-portal-workspace.integration.test.mjs` — testes ponta a ponta em PostgreSQL 17 descartável + Chromium real cobrindo negativa `403`, falha `503` com preservação de fila e nova tentativa, transições `solicitado` → `em_analise` → `aprovado` e `rejeitado` com motivo obrigatório, imutabilidade de `emp_time_punches`, auditoria em `audit_log`, isolamento entre funcionários A e B, responsividade `320`/`390`/`768`/`1440` (`overflow = 0`) e temas dia/noite.
- `docs/UX-PRO-05-PONTO-AJUSTES-RH-ESCOPO-ANTES-2026-10-23.md`, `docs/UX-PRO-05-PONTO-AJUSTES-RH-RESULTADO-2026-10-23.md` e `docs/evidencias/ux-pro-05-ponto-ajustes-rh-2026-10-23/*`.

---

## 4. Separação estrita das classes de validação

1. **Inspeção estática**:
   - reconciliação de código contra os PRs #284–#294, migrações `061`, `065`, `176`, `178` e inventário de 100 rotas (`node scripts/ux-pro-00-inventory.mjs --check`).
2. **Testes automatizados unitários e de contrato**:
   - `tests/ux-pro-05-ponto-rh-ui.test.mjs` (falhou antes com `fail 3` sobre `src/` intacto; passa `4/4` após a implementação),
   - `tests/ux-hr-vocabulary.test.mjs`, `tests/ux-portal-vocabulary.test.mjs`, `tests/employee-time-clock.focal.test.mjs`, `npm run typecheck`, `npm test` e `npm run build`.
3. **Testes automatizados integrados (PostgreSQL 17 real descartável + Chromium headless)**:
   - `npm run test:ux-hr:pg` (`scripts/qa-ux-hr-postgres.mjs`),
   - `npm run test:ux-portal:pg` (`scripts/qa-ux-portal-postgres.mjs`).
4. **Inspeção visual por capturas reais**:
   - 14 capturas em `docs/evidencias/ux-pro-05-ponto-ajustes-rh-2026-10-23/` inspecionadas individualmente (`320`, `390`, `768`, `1440` em modo dia, `390` em modo noite no RH e no portal, estado de erro `503` inicial e preservação de fila após `503`).
5. **Aceite humano operacional (Marcelo / Andreia / titular em dispositivo real)**:
   - **Não executado nesta sessão automatizada**. Permanece separado de testes automatizados e capturas visuais.

---

## 5. Resíduos conhecidos fora do escopo desta fatia

- `src/app/admin/funcionarios/RhWorkspace.tsx` (linha 156): quando `GET /api/admin/hr/l03/documents` falha isoladamente durante o carregamento inicial, `setDocs([])` ainda substitui a lista de documentos por array vazio com aviso textual. Mantido fora desta fatia para preservar escopo único e atômico em `Ponto e ajustes`.
