# UX-PRO-09A-6 — G5 em /admin/entrar e /funcionario: escopo antes da implementação (16/10/2026)

Registro **anterior à alteração de código**; última lacuna numerada de G5 (família 09A).

## 1. Base e reconciliação

- `origin/main` = **`2d2c8b4`** (merge da PR **#254**, UX-PRO-09A-5), conferido por fetch. Branch
  fixa: `arena/7dbaae55-gruposegsystemseguranca`. G1 #250, G2 #251, G4 #252, G3 #253 e G5-cliente
  #254 MERGED; #234 alheia e intocada.
- Base validada nesta sessão: `test:unit` 949/949, `test:ux-portal:pg` 19/19, typecheck, wave0 5/5,
  build OK (mesma árvore da fatia anterior).

## 2. Medição do comportamento atual (“antes”)

| Superfície | Erro pós-submissão hoje | Foco após falha hoje | Tema |
|---|---|---|---|
| `/admin/entrar` (`src/app/admin/entrar/AdminLoginClient.tsx`, erro individual/MFA/legado no mesmo estado `error`) | `<p role="alert" data-login-error="true">`, sem `tabIndex`/`ref`/efeito de foco | **BODY**: o clique está no botão e `disabled={busy \|\| ...}` o remove da árvore de foco | dia e noite (`data-admin-theme-scope` + `AdminThemeToggle`) |
| `/funcionario` (`Login` em `src/app/funcionario/EmployeePortal.tsx`) | `ErrorNotice` → `UiState variant="error"` (`role="alert"`, `aria-live="assertive"`), sem foco programático | **BODY** (mesmo motivo: botão desabilitado em `busy`) | dia e noite (`data-admin-theme-scope` + `AdminThemeToggle`) |

Confirmação estática a ser repetida por percurso real no gate (a medição efetiva vai para o
`resumo.json` da execução RED, em `antes/`): nenhum `useEffect`/`ref` de foco existe nos dois
componentes para o estado de erro de submissão; `UiState` (componente compartilhado) **não** será
alterado — a correção é local à rota, envolvendo o `ErrorNotice` num elemento focável próprio.

Contornos de foco: `AdminChrome.module.css` **não** tem regra para mensagem focada (só
`.field input:focus` e variantes noturnas de `.messageError`); `EmployeePortal.module.css` tem
regras `:focus-visible` com `var(--ux-color-focus)` mas nada para o aviso de erro do login.
Portanto cada módulo recebe **uma regra local nova** de contorno para o elemento focável, sem tocar
CSS transversal nem componente compartilhado.

## 3. Alteração prevista (mínima e local)

1. `AdminLoginClient.tsx`: `errorRef` + `useEffect` de foco + `ref`/`tabIndex={-1}` no parágrafo
   `data-login-error` (único ponto de render do estado `error`, cobrindo individual, MFA e legado).
   Regra local nova em `src/app/admin/AdminChrome.module.css`: contorno para
   `.message[tabindex="-1"]:focus` no tema dia e variante noturna no bloco
   `html[data-admin-theme="night"] ... [data-admin-theme-scope="true"]` já existente.
2. `EmployeePortal.tsx` (`Login`): `errorRef` + `useEffect` de foco envolvendo o `ErrorNotice` em
   `<div ref tabIndex={-1} data-login-error-focus="true" className={styles.loginErrorFocus}>`;
   regra local nova de contorno (`:focus`) em `src/app/funcionario/EmployeePortal.module.css`.
3. Nada mais muda: mensagens, `loginErrorMessage`, contratos (`/api/admin/session`,
   `/api/admin/session/mfa`, `/api/employee/session`), RBAC, MFA, rate limit, sessão/cookie,
   política de chave legada, estados `loading/out/in/failed`, abas do portal, `UiState`, temas.

## 4. Regressão prevista

- `tests/admin-entry.integration.test.mjs` (gate `test:admin-entry:pg`): teste novo medindo, em
  320/390/768/1440 nos temas **dia e noite** (noite via `localStorage`
  `segsystem.admin.appearance.v1` em `addInitScript`), o percurso `#login-email` → Tab →
  `#login-password` → Tab → botão “Entrar” → Enter com senha errada de staff sintético → `401`
  real → `[data-login-error]`; registra alvo de foco após a falha e o passo seguinte (repetição);
  campos limpos antes de capturar; overflow medido; `resumo.json` gravado antes das asserções de
  correção (RED registra o “antes”).
- `tests/ux-portal-workspace.integration.test.mjs` (gate `test:ux-portal:pg`): teste novo idêntico
  para `/funcionario` com o funcionário sintético já provisionado pelo gate e senha errada →
  `ErrorNotice` real; mesmas larguras e temas; wrapper `[data-login-error-focus]` como alvo.
- Todos os testes anteriores dos dois gates permanecem intactos. Nenhum endpoint, migração, script
  QA ou workflow novo; nenhuma credencial em PNG/JSON.

## 5. Fora de escopo, sem alteração

09B (site público — só diagnóstico) e 09C (identidade), que seguem na fila; estados de montagem e
`checking`; prévias; módulo órfão `/admin/convite`; E2–E9/C11; #234; aceite humano/UAT/WCAG;
homologação e produção, que permanecem **NO-GO**.
