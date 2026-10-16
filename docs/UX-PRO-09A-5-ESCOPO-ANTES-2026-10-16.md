# UX-PRO-09A-5 — G5 nas entradas públicas do cliente: escopo antes da implementação (16/10/2026)

Registro **anterior à alteração de código**. G5 está numerada desde
`docs/UX-PRO-09A-ESCOPO-ANTES-2026-10-15.md` §5 como “medição pendente, sem correção transversal”:
cada rota recebe sua correção local, sem componente compartilhado novo.

## 1. Base e reconciliação

- `origin/main` = **`5909e227b8ed015863dea00e2df23f63397cde3d`** (merge da PR **#253**,
  UX-PRO-09A-4/G3), conferido por fetch antes de editar. Branch fixa:
  `arena/7dbaae55-gruposegsystemseguranca`. G1 #250, G2 #251, G4 #252 e G3 #253 MERGED; #234 alheia.
- Verificações de base desta sessão (já executadas na fatia anterior, mesma árvore): `test:unit`
  949/949, `test:ux-portal:pg` 18/18, `test:client-access:pg` 27/27, typecheck, wave0 5/5, build OK.

## 2. Medição do comportamento atual (“antes”)

Leitura estática do código presente na base, a ser confirmada por percurso real de teclado no gate
(a coluna “medido” é preenchida pelo `resumo.json` da execução RED, que registra o alvo de foco
efetivo após a submissão com falha):

| Superfície | Erro pós-submissão hoje | Foco após a falha hoje | Por quê |
|---|---|---|---|
| `/cliente/entrar` (formulário de credenciais, `src/app/cliente/entrar/page.tsx`) | `<p role="alert">` sem `tabIndex`, sem `ref`, sem efeito de foco | **BODY** (o clique está no botão; `disabled={busy}` o remove da árvore de foco; nada move o foco para o erro) | Ausência do padrão já mergeado em G1/G2 |
| `/cliente/entrar` (etapa MFA, mesmo componente) | Mesmo `role="alert"`, mesma ausência | idem | idem (mesmo estado `error`, um único formulário visível por vez) |
| `/cliente/convite` (aceite, `src/app/cliente/convite/page.tsx`) | `<p role="alert">` sem `tabIndex`/`ref`/efeito | **BODY** | idem |
| `/cliente/convite` (montagem com convite usado/expirado/revogado/inexistente) | `<p role="alert">` estático, sem ação do usuário | não se aplica (estado de montagem, não transição) | **permanece como está** nesta fatia |
| `/admin/entrar` e `/funcionario` | medidos e corrigidos na subfatia UX-PRO-09A-6 | — | fora deste escopo por coesão |

O contorno de foco visível para mensagens focáveis **já existe** e não precisa ser criado:
`src/app/cliente/RealAccess.module.css` linha 207 (`.message[tabindex="-1"]:focus`).

## 3. Alteração prevista (mínima, local e aditiva)

Em cada uma das duas rotas, aplicar exatamente o padrão já mergeado em G1 (`/cliente/redefinir-senha`)
e G2 (`/cliente/confirmar-email`):

1. `errorRef = useRef<HTMLParagraphElement>(null)` + `useEffect(() => { if (error) errorRef.current?.focus(); }, [error])`;
2. `ref={errorRef}` e `tabIndex={-1}` nos parágrafos de erro **pós-submissão** (no `/cliente/entrar`,
   nos dois ramos que compartilham o mesmo estado `error`: credenciais e MFA);
3. nenhuma outra mudança: mensagens, endpoints, payloads, contratos, throttle, política
   anti-enumeração, MFA, sessão/cookie, CSS compartilhado, estados de montagem e prévias intactos.

O erro fica fora da ordem sequencial do `Tab` (`tabIndex={-1}`), como no padrão G1/G2 já aceito; a
repetição continua alcançável por teclado e isso será medido (passo seguinte ao erro).

## 4. Regressão prevista

Teste novo em `tests/ux-portal-workspace.integration.test.mjs` (`npm run test:ux-portal:pg`), sem
tocar os testes de G1, G2, G3 e G4:

- `/cliente/entrar`: e-mail inexistente sintético + senha sintética → `401` genérico real; mede,
  em 320/390/768/1440 (tema claro), o percurso campo → Tab → campo → Tab → botão → Enter → erro;
  registra o alvo de foco após a falha e o passo seguinte (repetição alcançável); campos limpos
  antes de capturar (senha nunca aparece em PNG).
- `/cliente/convite`: convite **pendente real** criado no PostgreSQL descartável (via
  `/api/admin/invites` com sessão de RH, como o gate já faz para outros fluxos); senha comum de 12
  caracteres (`password1234`, da lista pública `COMMON_PASSWORDS`) → `400 password_common` real, sem
  consumir o convite; mesmo percurso e mesmas medições; convite revogado/limpo no `finally`.
- O `resumo.json` é gravado **antes** das asserções que exigem o comportamento corrigido, para que a
  execução RED (código ainda sem o foco) deixe registrada a medição “antes” em pasta `antes/`.
- Nenhuma credencial, token de convite, cookie ou senha em PNG/JSON versionado.

## 5. Fora de escopo, sem alteração

G5 de `/admin/entrar` e `/funcionario` (subfatia 09A-6); estados de montagem de convite inválido;
09B e 09C; prévias; módulo órfão `/admin/convite`; E2–E9/C11; #234; SMTP real; aceite humano/UAT/
WCAG; homologação e produção, que permanecem **NO-GO**. Nenhum endpoint, migração, script QA ou
workflow novo.
