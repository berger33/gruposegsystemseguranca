# UX-PRO-09D — contrato de erro do email-change (resíduo ID6) — escopo antes do código (16/10/2026)

**Status:** documento pré-código obrigatório da subfatia **UX-PRO-09D — identidade de conta/autenticação, continuação da UX-PRO-09C**. Nada foi alterado ainda; a base foi medida por leitura estática do código vigente e pelos contratos existentes. Esta entrega não declara aceite humano, UAT ou conformidade WCAG. Homologação e produção permanecem **NO-GO**.

## 0. Decisão do proprietário registrada nesta sessão (16/10/2026)

O proprietário decidiu, item a item, sobre os resíduos registrados após a UX-PRO-09C:

| Resíduo | Decisão |
|---|---|
| **ID6 — 409 de `handleEmailChangeRequest` colapsa em 503** | **AUTORIZADO nesta sessão** (esta subfatia): corrigir o catch para repassar `e.status`, alinhando o handler aos irmãos `setup/activate/disable/confirm`. A mudança altera **explicitamente o contrato de erro** do `POST /api/client/security/email-change` para as recusas de regra de negócio: `email_change_pending` e `email_already_in_use` passam a responder **409** de fato (antes: 503 `security_unavailable`, medido no ID1d da 09C). O teste ID1d da 09C permanece intacto (aceita 409 ou 503 com aviso apropriado ao status medido); a subfatia acrescenta o gate que mede e asseriona o novo contrato **exatamente** (409) e mantém a cobertura do caminho honesto de 503 por injeção controlada. Nenhuma asserção será afrouxada. |
| Correções do site público (09B é diagnóstico) | Autorizado para subfatia **própria, futura** (não executada aqui): overflow `/contato` (343 px) e `/faq` (347 px) a 320 px + revisão visual das 104 amostras de contraste <4,5:1 em `/contato` e `/simulador`. |
| E6 — `<main>` aninhado transversal (19 rotas, `AdminGate.tsx:115`) | Autorizado para subfatia **própria, futura** (não executada aqui). Demais E2–E9 seguem sem decisão. |
| C11 — financeiro (alvo de toque 29 px + 2 hits auditados não corrigidos) | **Ordem expressa emitida** para subfatia **própria, futura** (não executada aqui). |

Regra da família mantida: 1 subfatia pequena = 1 PR; nesta sessão só o ID6.

## 1. Base conferida antes de editar

- Branch fixa da sessão: `arena/b9dd5b57-gruposegsystemseguranca`.
- `git fetch` executado: `HEAD` = `origin/main` = **`f35e1f1445645620a1926a0d6b499679bb3a8e9c`** (merge da PR #258, UX-PRO-09C, 16/10/2026 11:49 -03), árvore limpa, sem diffs.
- Clone **shallow (profundidade 1)**: o histórico anterior a `f35e1f1` não existe localmente; os merges foram confirmados pelo lado do GitHub.
- PRs confirmadas no GitHub: **#258 MERGED** (CI do merge `success`), **#257 MERGED** (09B diagnóstico). PRs abertas: **somente #234** (UX-PRO-07F-1, `/admin/financeiro`, estado CONFLICTING) — **intocada**, conforme ordem.
- Observação de governança registrada: a branch da sessão anterior, `arena/7a374da0-gruposegsystemseguranca` (PR #258, head `4e78ca38`), **ainda existe no origin** embora o prompt da sessão a descrevesse como apagada. Não foi reutilizada, nem apagada por iniciativa própria (é branch de outra sessão); fica registrada para decisão do proprietário.
- Preservações de arquivo: `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` ✅; `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` ✅ — ambos verificados na árvore limpa; serão revalidados ao fim e `next-env.d.ts` será restaurado (`git checkout -- next-env.d.ts`) se algum gate local o reescrever.
- Gates de referência já verdes nesta base (medição anterior, não refeita cegamente): `test:ux-portal:pg` **21/21** (`UX_PORTAL_TEST_EXIT: 0`); `node --test tests/ux-portal-vocabulary.test.mjs` **17/17**; `npm run test:unit` **949/0**; `npm run typecheck` exit 0; `npm run build` exit 0; `node scripts/qa-wave0-static.mjs` **5/5**; inventário `--check` OK; CI 9/9 na PR #258.
- Chave do harness confirmada: `CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url')` em `tests/ux-portal-workspace.integration.test.mjs:183` — **mantida**.

## 2. Superfícies inventariadas (medição da base real)

| # | Superfície | Natureza | Arquivos medidos |
|---|---|---|---|
| S1 | `POST /api/client/security/email-change` — handler `handleEmailChangeRequest` | Real, exige sessão `seg_client_session` | `src/server/client-security-api.mjs` (67 linhas, 10 handlers); `server.mjs:2700-2703` (roteamento puro, sem suposição de status) |
| S2 | `/cliente/app/seguranca` — seção "Trocar e-mail" (formulário de pedido) | Real, navegador | `src/app/cliente/app/seguranca/page.tsx` (212 linhas; formulário na linha 203) |
| S3 | Transporte + vocabulário | Biblioteca compartilhada | `src/lib/portal-request.ts` (52 linhas), `src/lib/portal-vocabulary.mjs` (`email_already_in_use` :163, `email_change_pending` :168, `security_unavailable` :178, `audit_unavailable` :183) |
| S4 | Consumidores do endpoint (auditoria completa) | — | `page.tsx:203` (único consumidor de UI); `tests/ux-portal-workspace.integration.test.mjs` (G3: caminho feliz 202/PUT; ID1d 09C: aceita 409 ou 503); `tests/cli14-account-security.test.mjs` (checks estáticos de fonte); `tests/client-security-routes-fail-closed.test.mjs` (sem asserção de email-change); `scripts/qa-homologacao-local.mjs:257` (SEC-05: só recusas de guard/corpo — 401 anônimo e 400 `new_email_different_required`, ambas anteriores à transação, **não afetadas**) |

### Medição do defeito (S1)

- `handleEmailChangeRequest` (linha 62) lança dentro da transação, com status explícito:
  - `throw Object.assign(new Error('email_already_in_use'), {status: 409})` — novo e-mail já usado por outra identidade;
  - `throw Object.assign(new Error('email_change_pending'), {status: 409})` — já existe pedido pendente válido.
- O catch do handler é `catch(e){return fail(res,e);}` — **sem** o ramo `if(e?.status)`; `fail()` responde sempre **503** `{error: 'security_unavailable'}` (ou `audit_unavailable` em `AUDIT_UNAVAILABLE`). Medido na 09C (cenário ID1d, HTTP real): segundo pedido → **503**, o 409 pretendido colapsa.
- Handler com o ramo `if(e?.status)return json(res,e.status,{error:e.message});` já presente nos irmãos: `handleMfaSetup` (43), `handleMfaActivate` (48), `handleMfaDisable` (52), `handleEmailChangeConfirm` (63). O fixo é exatamente esse padrão.
- Fora das recusas de regra de negócio, todo o resto segue por `fail()`: falha de DB, falha de auditoria (`AUDIT_UNAVAILABLE` → 503 `audit_unavailable`), falha de entrega no outbox local — **comportamento preservado**.

### Medição da UI (S2) — nenhuma mudança necessária

O formulário de pedido da página já tem os ramos que o 409 acionaria (eram código morto sob o 503):

- `result.error.code === "email_change_pending"` → `"Já existe uma troca de e-mail em andamento. Aguarde a conclusão ou confirme o token atual."`
- `result.error.code === "email_already_in_use"` → `"Este novo e-mail já pertence a outra conta. Nada foi solicitado."`
- fallback → `` `Não foi possível solicitar a troca. ${explain(result.error)}` `` — no 503 real, `explain` produz "Serviço de segurança indisponível — O servidor não confirmou a operação e nada foi alterado. Tente novamente em instantes. Resposta do servidor: HTTP 503 (security_unavailable)."

`portalRequest` mapeia o corpo `{error: <code>}` para `describePortalError(code, status)`, e o vocabulário já tem as entradas (09C). Portanto: **a correção de contrato desbloqueia a UI honesta já escrita; nenhum byte da página muda.**

## 3. Lacunas numeradas

### ID6 — 409 de `handleEmailChangeRequest` colapsa em 503 (**lacuna selecionada; autorização registrada no §0**)

- **Reparo (mínimo, 1 linha):** `catch(e){return fail(res,e);}` → `catch(e){if(e?.status)return json(res,e.status,{error:e.message});return fail(res,e);}` no `handleEmailChangeRequest`.
- **Contrato alterado (autorizado):** apenas o status/código de erro das recusas de regra de negócio deste endpoint: 503 `security_unavailable` → **409 `email_change_pending` / 409 `email_already_in_use`** (mesmo formato de corpo `{error: <code>}` já usado pelos 409 dos irmãos). Recusas de guard (401/403/405), corpo inválido (400/413) e indisponibilidade real (503) **não mudam**.
- **Nada mais muda:** nenhuma URL, método, payload, sessão, cookie, política MFA, rate limit, auditoria, grant ou isolamento; `server.mjs`, `page.tsx`, `portal-request.ts` e o vocabulário ficam intactos.
- **Regressão:** o teste ID1d da 09C continua verde (aceita 409 ou 503 com aviso apropriado ao status; após o fixo ele passa pelo ramo 409, medido). O novo gate 09D asseriona o contrato **exatamente** (409 + código + mensagem nomeando o motivo + sem "conexão" + rejeição transacional comprovada no banco) e cobre o 503 de indisponível por injeção controlada em `window.fetch` (mesmo padrão declarado dos ID1a/ID1f da 09C).

### Resíduos registrados (não executados nesta subfatia)

- **ID3** (09C): mesmos padrões de `workspaceFetch` em outras 10 páginas do portal do cliente — família própria, sem misturar em PR de identidade/contrato.
- **ID4** (09C): `setup.uri` (otpauth) nunca exibido — possível postura deliberada de segurança; exige decisão de produto.
- **Site público (09B)**: correções agora autorizadas — subfatia própria futura (overflow 320 px + revisão das 104 amostras de contraste).
- **E6**: `<main>` aninhado (19 rotas) — subfatia própria futura.
- **C11**: ordem expressa emitida — subfatia própria futura.
- **E2, E3, E5, E8, E9**: seguem sem decisão do proprietário.

## 4. Plano de evidência e gates (após o código)

1. **Reprodução (RED):** bloco novo no `tests/ux-portal-workspace.integration.test.mjs` — `'browser: email-change honra os 409 do contrato e descreve o 503 sem mentir (ID6 — UX-PRO-09D)'` — com três cenários medidos:
   - **ID6a** — segundo pedido com pendente real → **409 `email_change_pending` real** (sem injeção); UI nomeia o motivo; banco confirma rejeição transacional (exatamente 1 linha pendente, sem duplicata);
   - **ID6b** — pedido para e-mail de outra conta → **409 `email_already_in_use` real** (sem injeção); e-mail do dono permanece intacto;
   - **ID6c** — indisponibilidade → **503 `security_unavailable`** com falha injetada **apenas em `window.fetch`** (declara no resumo); UI descreve indisponibilidade real sem "conexão".
   - Evidência "antes" (servidor ainda não corrigido): `UX_PORTAL_TEST_PATTERN='UX-PRO-09D' UX_PORTAL_09D_EVIDENCE_DIR='docs/UX-PRO-09D-evidencias-2026-10-16/antes' npm run test:ux-portal:pg` → saída 1, falha canônica esperada no ID6a (503 medido em vez de 409), gravada **antes** das asserções.
2. **Reparo:** a linha única do §3/ID6 em `src/server/client-security-api.mjs`.
3. **GREEN:** `UX_PORTAL_09D_EVIDENCE_DIR='docs/UX-PRO-09D-evidencias-2026-10-16' npm run test:ux-portal:pg` → **22/22** (21 existentes + 1 novo), `UX_PORTAL_TEST_EXIT: 0`.
4. **Gates locais obrigatórios:** `node --test tests/ux-portal-vocabulary.test.mjs` (17/17), `npm run test:unit` (949/0; inclui cli14 estático), `npm run typecheck` (exit 0 + restaurar `next-env.d.ts` se reescrito; MD5 `87a8bf5c65d00003ad1eba1613711943`), `node scripts/qa-wave0-static.mjs` (5/5), `node scripts/ux-pro-00-inventory.mjs --check` (OK), `git diff --check` (limpo). Build: nenhum arquivo TS/Next muda nesta subfatia (somente `.mjs` de servidor + teste); o `npm run build` roda no CI da PR — registrado, não bloqueante local.
5. **Evidências:** pasta própria `docs/UX-PRO-09D-evidencias-2026-10-16/` (+ `antes/`), `resumo.json` legível por máquina (mesmo `schemaVersion: 1` dos gates 09A/09C), capturas nomeadas **`ux-pro-09d-<scenarioId>-<viewport>.png`**; conferir byte-a-byte com `entries[].screenshot` nos dois sentidos antes de apagar qualquer PNG (nenhuma remoção é prevista aqui).
6. **PR única pequena** a partir desta branch; merge somente com **todos os checks obrigatórios SUCCESS** e base `main` confirmada (`gh pr merge <n> --merge`, sem `--auto`). Sem bypass.

## 5. Preservações e limites

- Nenhum endpoint, URL, método, payload, sessão, cookie, MFA, rate limit, auditoria, grant ou isolamento muda, **exceto** o contrato de erro das recusas de regra de negócio do `POST /api/client/security/email-change` — a alteração explicitamente autorizada no §0.
- `next-env.d.ts` e `tsconfig.json` revalidados por MD5 ao fim; chave do harness permanece `randomBytes(32).toString('base64url')`.
- Dados de teste exclusivamente sintéticos; PostgreSQL sempre descartável (`scripts/qa-ux-portal-postgres.mjs` destrói o cluster); sem credenciais ou dados pessoais em docs/capturas.
- Não inicia as subfatias autorizadas futuras (site público, E6, C11); não toca em #234 nem em branches de outras pessoas; não reimplementa trabalho já mergeado (09A/09B/09C).
- Sem declaração de aceite humano, UAT ou conformidade WCAG; capturas não medem produção; homologação e produção **NO-GO**.
