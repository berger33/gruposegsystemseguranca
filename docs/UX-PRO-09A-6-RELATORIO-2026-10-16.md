# UX-PRO-09A-6 — G5 em /admin/entrar e /funcionario: relatório (16/10/2026)

**Status:** implementação e validação local concluídas; merge condicionado a checks remotos verdes e
revisão concluída. Homologação e produção permanecem **NO-GO**; nada aqui declara aceite humano,
UAT ou conformidade WCAG. Última lacuna numerada de G5: com esta fatia, **G5 fica fechada nas cinco
superfícies de entrada** (cliente ×2 na 09A-5, equipe e funcionário aqui).

## 1. Base, problema e alteração

- Base `main`/`origin/main` = **`2d2c8b4`** (merge da PR **#254**, UX-PRO-09A-5). Branch fixa:
  `arena/7dbaae55-gruposegsystemseguranca`. #234 alheia e intocada.
- Escopo antes do código: [UX-PRO-09A-6-ESCOPO-ANTES-2026-10-16.md](UX-PRO-09A-6-ESCOPO-ANTES-2026-10-16.md).
- Problema medido na execução RED (8 percursos por rota, dia e noite): após falha de submissão, o
  foco caía em **BODY** nas duas entradas — `/admin/entrar` (parágrafo `role="alert"
  data-login-error`) e `/funcionario` (`ErrorNotice`/`UiState`, `role="alert"`), porque o botão é
  desabilitado em `busy` e nada movia o foco para o erro.
- Alterações locais, sem componente compartilhado novo:
  - `src/app/admin/entrar/AdminLoginClient.tsx`: `errorRef` + `tabIndex={-1}` + `useEffect` de foco
    no parágrafo `data-login-error` (cobre individual, MFA e legado, que compartilham `error`).
  - `src/app/admin/AdminChrome.module.css`: contorno novo e local para
    `.message[tabindex="-1"]:focus`, com variante noturna no bloco de tema já existente.
  - `src/app/funcionario/EmployeePortal.tsx` (`Login`): invólucro focável local
    (`ref` + `tabIndex={-1}` + `data-login-error-focus`) em volta do `ErrorNotice`; **`UiState`
    compartilhado intacto**.
  - `src/app/funcionario/EmployeePortal.module.css`: contorno novo e local `.loginErrorFocus:focus`.
- Nenhum contrato, mensagem, RBAC, MFA, rate limit, sessão/cookie, política de chave legada, estado
  `loading/out/in/failed` ou aba do portal mudou.

## 2. Regressão e medição

- `tests/admin-entry.integration.test.mjs` (gate `test:admin-entry:pg`): teste novo em
  320/390/768/1440 × **dia e noite** (noite via `localStorage` `segsystem.admin.appearance.v1`),
  com `401` real de `/api/admin/session` para staff sintético; percurso focar e-mail → Tab → senha →
  Tab → botão → Enter → erro; foco pós-falha e percurso de repetição medidos; campos limpos antes de
  capturar; overflow 0 em todas as combinações.
- `tests/ux-portal-workspace.integration.test.mjs` (gate `test:ux-portal:pg`): teste novo idêntico
  para `/funcionario`, com o funcionário sintético do gate e senha errada (`401`; `429` aceito sob
  limite); espera o estado `[data-ui-state="error"]`, que existe antes e depois da correção.
- **Descoberta de percurso registrada como medição, não como defeito novo:** a entrada da equipe
  limpa a senha após a falha (comportamento existente) e o botão só habilita com e-mail e senha
  preenchidos; portanto a repetição por teclado medida é `Shift+Tab` (volta à senha) → redigitar →
  `Tab` até o botão habilitado. Em `/funcionario` o aviso fica antes do formulário, e a repetição é
  alcançada em percurso limitado de `Tab` até “Entrar com segurança”. Ambos os percursos estão no
  `resumo.json`.
- `resumo.json` gravado antes das asserções de correção: a execução RED deixou o “antes” (foco em
  BODY, 8 entradas por rota) em `antes/admin/` e `antes/funcionario/`.

## 3. Verificações locais reais

| Comando | Resultado |
|---|---|
| `npm run test:admin-entry:pg` (RED) | **13/14**: falha somente no teste novo, foco `BODY` |
| `npm run test:ux-portal:pg` (RED, recorte novo) | **0/1**: falha somente no teste novo, foco `BODY` |
| `npm run test:admin-entry:pg` (conjunto final) | **14/14**, 0 fail/skip/cancel/todo; cleanup true |
| `npm run test:ux-portal:pg` (conjunto final) | **20/20**, 0 fail/skip/cancel/todo; cleanup true |
| `npm run test:unit` | **949/949** |
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 OK |
| `npm run build` | exit 0 |
| `npm run test:client-access:pg` | reexecutado por precaução (servidor intocado): ver resultado no fim da cadeia |
| Inventário UX-PRO-00 + `--check` | regenerado pelo gerador; só `/admin/entrar` e `/funcionario` mudam nos CSVs; `OK:` |
| `git diff --check` | exit 0 |

**Histórico de desenvolvimento, não omitido:** (i) duas execuções intermediárias falharam por
**crash ambiental de lançamento** do Chromium empacotado (SIGSEGV antes de navegar, ~30 ms), sem
qualquer asserção envolvida; para que infra não mascare nem interrompa a medição, `launchBrowser`
dos dois gates passou a ter **até duas tentativas extras de lançamento** — nenhuma asserção foi
afrouxada e o comportamento medido não muda; (ii) a primeira versão do percurso de repetição em
`/admin/entrar` supôs `Tab` à frente e foi corrigida para o percurso real descrito na seção 2,
depois de ler a medição do próprio resumo; (iii) a espera do teste de `/funcionario` foi trocada de
um atributo que só existiria após a correção para `[data-ui-state="error"]`, para que o RED meça em
vez de travar.

## 4. Evidências e limites de interpretação

Pasta [UX-PRO-09A-6-evidencias-2026-10-16](UX-PRO-09A-6-evidencias-2026-10-16/): `admin/` e
`funcionario/` com 8 PNGs cada (320/390/768/1440 × dia/noite) + `resumo.json`; `antes/admin/` e
`antes/funcionario/` com o mesmo conjunto da execução RED. Campos limpos antes de capturar (nenhuma
credencial em PNG/JSON); overflow 0 em todas as combinações; foco pós-falha no erro e repetição
alcançável em 16/16 percursos pós-correção (contra 0/16 antes).

Limites: inspeção automatizada não substitui avaliação humana; não cobre leitores de tela, zoom 200%
ou Windows; o erro focável fica fora da ordem sequencial do `Tab` (`tabIndex={-1}`), como no padrão
G1/G2; dados sintéticos em PostgreSQL descartável.

## 5. Preservações verificadas

- `UiState`, `AdminChrome` além das duas regras locais de contorno, temas dia/noite, navegação
  administrativa, RBAC, MFA, política de chave legada, contratos de sessão e auditoria: intactos.
- Comportamento existente de limpar a senha após falha: **preservado** (medido, não alterado).
- Testes anteriores dos dois gates intactos (13 + 19 anteriores passando nos conjuntos finais).
- Nenhum endpoint, migração, script QA ou workflow novo; CSVs só pelo gerador.

## 6. Resíduos numerados

1. **UX-PRO-09B** (site público/home): diagnóstico somente, sem alteração além do logo (autorizado
   apenas se houver defeito reproduzido); melhorias de conteúdo/estrutura viram sugestão documentada.
2. **UX-PRO-09C** (identidade): escopo e menor lacuna reproduzida após o diagnóstico.
3. Crash ambiental intermitente de lançamento do Chromium empacotado: mitigado com retry de
   lançamento nos dois gates; se reaparecer em CI, tratar como infra sem afrouxar asserções.
4. Sem aceite humano/UAT/WCAG; homologação e produção **NO-GO**.

## 7. Prompt completo da próxima subfatia (UX-PRO-09B — site público, só diagnóstico)

```text
Trabalhe no repositório berger33/gruposegsystemseguranca, partindo da main remota mais recente na
branch fixada pela sessão Arena. Leia AGENTS.md, README.md, docs/ARENA-PRESERVAR-FUNCIONALIDADES.md,
docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md e docs/UX-PRO-09A-6-RELATORIO-2026-10-16.md.
Confirme SHA da main e reconcilie PRs/checks; G1 #250, G2 #251, G4 #252, G3 #253, G5-cliente #254 e
G5-staff/funcionário (09A-6) MERGED: não reabra. #234 alheia: não tocar.

Execute SOMENTE a subfatia UX-PRO-09B — diagnóstico do site público/home, conforme o plano mestre:
"Nenhuma alteração além do logo; melhorias de conteúdo ou estrutura pública ficam documentadas como
sugestão e não devem ser executadas". Estenda o gerador de capturas existente
(scripts/ux-evidence-capture.mjs) com uma etapa nova de alvos PÚBLICOS (sem cookie), medindo em
320/390/768/1440 e nos modos claro/escuro que o site realmente suporta (PublishedTheme/seg-color-mode):
transbordo horizontal, erros de console, 5xx, recursos externos bloqueados como campo separado,
percurso de teclado da home e contraste amostral. Escreva docs/UX-PRO-09B-*.md com (a) medição por
rota, (b) lista de sugestões NÃO executadas e (c) veredito do logo: só altere BrandLogo se houver
defeito reproduzido com evidência antes/depois e registre a autorização do proprietário; caso
contrário, nenhuma linha de produto muda. Revalide test:unit, typecheck, build, inventário --check e
o gate que a etapa usar. Abra UMA PR pequena (docs + evidências + eventual estágio do gerador); só
merge com todos os checks obrigatórios realmente verdes. Depois dela resta UX-PRO-09C (identidade).
E2–E9/C11 dependem de autorização por item; homologação e produção continuam NO-GO; não invente
aceite humano nem conformidade WCAG.
```
