# UX-PRO-09D — contrato de erro do email-change (resíduo ID6) (16/10/2026)

**Status:** contrato corrigido e medido em gate; antes/depois registrados. A mudança é **exatamente** o que o proprietário autorizou nesta sessão (16/10/2026): o `POST /api/client/security/email-change` passa a honrar os 409 de regra de negócio que o próprio código já declarava (`email_change_pending`, `email_already_in_use`), em vez de colapsá-los em 503 `security_unavailable`. Nada mais mudou: nenhuma URL, método, payload, sessão, cookie, política MFA, rate limit, auditoria, grant ou isolamento foi tocado. A UI já tinha os ramos 409 escritos (código morto sob o 503) e agora os usa — **nenhum byte da página mudou**. Esta entrega não declara aceite humano, UAT ou conformidade WCAG. Homologação e produção permanecem **NO-GO**.

## Contrato antes/depois (medido, HTTP real)

| Cenário | Antes (medido na 09C e reconfirmado no RED desta fatia) | Depois (GREEN) |
|---|---|---|
| **ID6a** — segundo pedido com pendente real | `503 {error: security_unavailable}` — a UI descrevia indisponibilidade | **`409 {error: email_change_pending}`** — a UI mostra "Já existe uma troca de e-mail em andamento. Aguarde a conclusão ou confirme o token atual." |
| **ID6b** — pedido para e-mail de outra conta | `503 {error: security_unavailable}` | **`409 {error: email_already_in_use}`** — a UI mostra "Este novo e-mail já pertence a outra conta. Nada foi solicitado." |
| **ID6c** — indisponibilidade real do serviço (503 `security_unavailable`) | 503 descrito com honestidade (ID1d da 09C) | **inalterado** — 503 continua descrito sem "conexão": "Serviço de segurança indisponível — O servidor não confirmou a operação e nada foi alterado. Tente novamente em instantes. Resposta do servidor: HTTP 503 (security_unavailable)." |

Idem preservado: guard (401/403/405), corpo inválido (400/413), `new_email_different_required` (400), caminho feliz (202 + token manual/outbox), confirmação (PUT 200/400/409) e cancelamento (DELETE 200). O `SEC-05` do `scripts/qa-homologacao-local.mjs` (401 anônimo, 400 corpo vazio) não é afetado — recusas anteriores à transação.

## Reparo (1 linha)

`src/server/client-security-api.mjs` — `handleEmailChangeRequest`:

```diff
- ...}catch(e){return fail(res,e);}}
+ ...}catch(e){if(e?.status)return json(res,e.status,{error:e.message});return fail(res,e);}}
```

Padrão idêntico aos handlers irmãos `handleMfaSetup`/`handleMfaActivate`/`handleMfaDisable`/`handleEmailChangeConfirm`, que já tinham o ramo `if(e?.status)`. Somente erros com `status` explícito propagam; DB fora do ar, auditoria indisponível (`AUDIT_UNAVAILABLE`) e falha de outbox seguem por `fail()` → 503, como antes.

## Gate e regressão

- **Teste novo** em `tests/ux-portal-workspace.integration.test.mjs`: `browser: email-change honra os 409 do contrato e descreve o 503 sem mentir (ID6 — UX-PRO-09D)` — 3 cenários (ID6a/ID6b com HTTP real; ID6c com falha injetada **apenas em `window.fetch`**, declarada no resumo), provas de estado por `readState` (texto, `httpStatus`, `serverCode`, avisos, `unhandled`, `overflow`) + **prova no banco** (ID6a: exatamente 1 linha pendente — rejeição transacional; ID6b: e-mail do dono intacto e 0 linhas novas) + capturas nomeadas `ux-pro-09d-<scenarioId>-<viewport>.png`.
- **RED canônico (exato)**: `ID6a: o contrato corrigido precisa recusar o segundo pedido com pendente real com 409; veio 503` (`503 !== 409`), saída 1, gravado **antes** das asserções.
- **GREEN**: `UX_PORTAL_09D_EVIDENCE_DIR='docs/UX-PRO-09D-evidencias-2026-10-16' npm run test:ux-portal:pg` → **`UX_PORTAL_TEST_EXIT: 0`, 22/22** (21 existentes + 1 novo). O teste ID1d da 09C permanece **intacto** e passou pelo ramo 409 (aceita 409 ou 503 com aviso apropriado ao status medido; nenhuma asserção foi afrouxada — a nova asserção é **exatamente** 409 + código canônico + motivo nomeado + sem "conexão").
- **Gates desta fatia (todos nesta base `f35e1f1`)**: gate ux-portal **22/22**; `node --test tests/ux-portal-vocabulary.test.mjs` **17/17**; `npm run test:unit` **949/0**; `npm run typecheck` **exit 0**; `node scripts/qa-wave0-static.mjs` **5/5**; inventário regenerado e `node scripts/ux-pro-00-inventory.mjs --check` **OK** (o gerador atribuiu o stage `UX-PRO-09D` à rota `/cliente/app/seguranca` nos dois CSVs versionados — mudança aditiva de 1 linha em cada, conferida); `node --test tests/ux-pro-00-precision.test.mjs` **9/9**; `node --test tests/admin-navigation.test.mjs` incluso no mesmo lote; `git diff --check` limpo. Build: nenhum arquivo TS/Next muda (somente `.mjs` de servidor + teste + CSV + docs); o `npm run build` roda no CI da PR.
- **Comandos de reprodutibilidade**:
  - RED: `UX_PORTAL_TEST_PATTERN='UX-PRO-09D' UX_PORTAL_09D_EVIDENCE_DIR='docs/UX-PRO-09D-evidencias-2026-10-16/antes' npm run test:ux-portal:pg` (saída 1, ID6a, 503 medido).
  - GREEN: `UX_PORTAL_09D_EVIDENCE_DIR='docs/UX-PRO-09D-evidencias-2026-10-16' npm run test:ux-portal:pg` (**`UX_PORTAL_TEST_EXIT: 0`, 22/22**).

## Evidências

- [`UX-PRO-09D-evidencias-2026-10-16/antes/`](UX-PRO-09D-evidencias-2026-10-16/antes/) (servidor não corrigido): `resumo.json` + **3 PNGs** (390 px, altura de página inteira), todos referenciados, sem órfãos — registra o contrato antigo medido (ID6a 503/security_unavailable, ID6b 503/security_unavailable, ID6c 503 injetado).
- [`UX-PRO-09D-evidencias-2026-10-16/`](UX-PRO-09D-evidencias-2026-10-16/) (reparado): `resumo.json` + **3 PNGs** (390 px), todos referenciados, sem órfãos; 0 avisos não tratados, 0 overflows; asserção byte-a-byte dos PNGs contra `entries[].screenshot` conferida nos dois sentidos (3/3 em cada pasta, `missing=[]`, `orphans=[]`); dimensões conferidas (largura 390 px em todas as capturas).

## Observações de governança (esta sessão)

- `origin/main` conferido: `f35e1f1445645620a1926a0d6b499679bb3a8e9c` (merge da #258); #257/#258 MERGED; PR aberta somente #234 (CONFLICTING, intocada).
- A branch da sessão anterior `arena/7a374da0-gruposegsystemseguranca` (PR #258) **ainda existe no origin** (`4e78ca38`) — registrada para decisão do proprietário; não reutilizada nem apagada por iniciativa própria.
- Guardas de arquivo: `next-env.d.ts` reescrito pelos gates locais e **restaurado** com `git checkout --` (MD5 final `87a8bf5c65d00003ad1eba1613711943`); `tsconfig.json` intacto (`99f7042f814e77e67b785906e5d4df23`).
- Chave do harness permanece `randomBytes(32).toString('base64url')` (`tests/ux-portal-workspace.integration.test.mjs:183`).

## Limitações

- Capturas em Chromium headless Linux, tema claro (único suportado na área do cliente), 390 px (cenários de recusa de troca de e-mail; a matriz de 4 larguras da rota já existe nos stages 09A-4/09C).
- ID6c cobre o caminho de indisponibilidade com resposta **sintética** em `window.fetch` (sem tráfego real) — padrão declarado e reutilizado dos ID1a/ID1f da 09C; ID6a/ID6b usam HTTP real do servidor contra PostgreSQL descartável.
- Não foram avaliados leitores de tela, zoom 200%, Windows ou outros navegadores, nem produção. O contrato novo (409) não foi exercitado em nenhuma superfície além do `/cliente/app/seguranca` — único consumidor do endpoint (auditoria no escopo §2/S4).
- Sem aceite humano, UAT, certificação WCAG ou mudança de escopo público (09B permanece diagnóstico; correções públicas autorizadas para subfatia própria). **NO-GO** em homologação e produção até decisão explícita do dono.

## Resíduos numerados (desta fatia)

| # | Resíduo | Estado |
|---|---|---|
| ID6 | 409 do `handleEmailChangeRequest` colapsava em 503 | **CORRIGIDO e mergeado** (esta PR) |
| ID3 | Mesmos padrões de `workspaceFetch` nas outras 10 páginas do portal do cliente | registrado (09C); família própria |
| ID4 | `setup.uri` (otpauth) nunca exibido | registrado (09C); possível postura deliberada de segurança — decisão de produto |
| 09D-1 | Branch `arena/7a374da0-gruposegsystemseguranca` ainda no origin (duplicata da sessão encerrada, PR #258) | decisão do proprietário: apagar ou manter |
