# UX-PRO-09C — identidade autenticada (16/10/2026)

**Status:** correções de superfície aplicadas e verificadas em gate; auditoria antes/depois com a menor lacuna reproduzida (ID1a). Contratos de API/session intactos: nenhum endpoint, resposta, sessão ou banco foi alterado — somente mensagens e estados da UI do portal do cliente, o módulo de vocabulário e testes. Esta entrega não declara aceite humano, UAT ou conformidade WCAG. Homologação e produção permanecem **NO-GO**.

Escopo autorizado (verbatim do dono): "Auditoria antes/depois + menor lacuna reproduzida; contratos de API/session intactos." Superfícies: `/cliente/app/seguranca` (MFA, sessões, troca de e-mail), provisionamento de acesso (`/admin/funcionarios` + `PUT /api/admin/hr/employees/:id/access`) e convites administrativos (`InvitesSection` em `/admin/clientes`).

## Escopo por medição (retrações)

O registro completo está em [`UX-PRO-09C-ESCOPO-ANTES-2026-10-16.md`](UX-PRO-09C-ESCOPO-ANTES-2026-10-16.md). Em resumo:

- **ID1g retraída como lacuna**: ao ativar o MFA o servidor derruba a sessão anterior (`serverBlocksSessionOnMfaActivation: true` no resumo; `GET /api/client/me` da sessão antiga responde **401**). A premissa original (sessão pré-ativação viva) foi refutada por medição; o cenário ID1g permanece no gate apenas como evidência do comportamento medido e da mensagem honesta de sucesso.
- **ID2 retraída (401 comprovado)**.
- **ID1 = ID1a–ID1f**, com ID1g como evidência.
- **ID6 registrada, não executada** (ver abaixo): alterar o contrato do endpoint exige autorização explícita do dono.

## Lacunas corrigidas — antes/depois (ID1)

Medições do gate `test:ux-portal:pg` com Chromium headless, PostgreSQL temporário descartável e servidor local real (recusas reais) mais injeção controlada de `window.fetch` apenas onde o cenário pede falha isolada.

| Cenário | Medição | Antes | Depois |
|---|---|---|---|
| ID1a — senha recusada no preparo do MFA (403 injetado, `invalid_credentials`) | **menor lacuna reproduzida** | "Erro de conexão ao iniciar o MFA." (mentia: houve conexão e o servidor recusou a senha) | "Não foi possível configurar. Confira a senha; se o MFA já estiver ativo, entre novamente para gerenciá-lo." |
| ID1b — código TOTP errado (403 `mfa_code_invalid` real) | falha genérica sem orientação | "Não foi possível ativar o MFA agora." | "Código incorreto ou configuração indisponível. Confira seu autenticador." |
| ID1c — desativação com senha/código recusados (403 real) | falha genérica | "Não foi possível desativar o MFA agora." | "Não foi possível desativar. Confira sua senha e o código ainda não usado." |
| ID1d — segundo pedido de troca de e-mail recusado (HTTP **503** real, ver ID6) | mentira de conexão | "Erro de conexão." | "Não foi possível solicitar a troca. Serviço de segurança indisponível — o servidor não confirmou a operação e nada foi alterado. Tente novamente em instantes. Resposta do servidor: HTTP 503 (security_unavailable)." |
| ID1e — token de troca inválido no PUT (400 `invalid_or_expired_token` real) em 320/390/768/1440 px | mensagem genérica sem ação | "Confira os dados informados. (HTTP 400, invalid_or_expired_token)" | "Token inválido ou expirado. Solicite a troca de e-mail novamente." |
| ID1f — revogação de sessão recusada (503 injetado, `security_unavailable`) | genérica, sem dizer o que ficou pendente | "O serviço está indisponível. Tente novamente. (HTTP 503, security_unavailable)" | "Não foi possível revogar esta sessão. Serviço de segurança indisponível — nada foi alterado. Resposta do servidor: HTTP 503 (security_unavailable)." |
| ID1g — ativação do MFA (comportamento medido; lacuna retraída) | — | "MFA ativado. Esta sessão antiga foi bloqueada; guarde os códigos e entre novamente." | idem (sem mudança; a mensagem já era verdadeira e o servidor de fato bloqueia a sessão antiga) |

Sucessos acompanhados no mesmo gate: ativação/desativação de MFA, "Sessão revogada.", "As demais sessões foram revogadas." e o estado "Revogando…". **Nenhum cenário DEPOIS terminou com aviso não tratado ou overflow horizontal** (0/10 nas duas pontas, exceto as mensagens antigas classificadas como não tratadas no ANTES, que são justamente a evidência do defeito).

## Resíduo ID6 — registrado, NÃO executado

`src/app/api/client/security/client-security-api.mjs` — `handleEmailChangeRequest` (linha 62) colapsa os 409 pretendidos (`email_change_pending`, `email_already_in_use`) em **503 `security_unavailable`**: o `catch` do caminho de requisição usa `catch (e) { return fail(res, e); }` sem o ramo `if (e?.status)` que os handlers de setup/confirm possuem (`if (e?.status)` aparece 2× no arquivo contra 5 desse formato). Confirmado por medição no gate: o segundo `POST /api/client/security/email-change` responde 503 (ID1d). **Corrigir isso altera o contrato de erro do endpoint e portanto exige autorização explícita do dono**; enquanto isso, a UI descreve o 503 medido com honestidade e o teste ID1d aceita 409 ou 503 com aviso apropriado ao status medido. Os 409 do caminho de confirmação não são afetados (esses handlers têm o ramo de status).

## Sem lacuna reproduzida (nota de auditoria)

- **Provisionamento de acesso**: `/admin/funcionarios` + `PUT /api/admin/hr/employees/:id/access` — comportamento e mensagens verificados sem lacuna reproduzida nesta fatia.
- **Convites administrativos**: `InvitesSection` em `/admin/clientes` — sem lacuna reproduzida.

## Vocabulário e testes

- `src/lib/portal-vocabulary.mjs`: +11 entradas do bloco UX-PRO-09C (`mfa_already_active`, `mfa_setup_required`, `mfa_verify_only_during_login`, `invalid_session`, `new_email_different_required`, `email_already_in_use`, `email_change_pending`, `invalid_or_expired_token`, `security_unavailable`, `audit_unavailable`, `client_confirmation_required`).
- `tests/ux-portal-vocabulary.test.mjs`: extração dos códigos de `client-security-api.mjs` (ambas as direturas, literais e `new Error`) somada a `codigosServidor`; `security_unavailable`/`audit_unavailable` cobertos em `falhas` — **17/17**.
- `tests/ux-portal-workspace.integration.test.mjs`: cenário ID1 com provas de estado por `readState` (texto, `httpStatus`, avisos, `unhandled`, `overflow`), injeções documentadas e capturas nomeadas `ux-pro-09c-<cenario>-<viewport>.png`.
- **Correção de harness (infraestrutura de teste)**: a chave `CLIENT_MFA_ENCRYPTION_KEY` deste gate era gerada por `Buffer.from(randomUUID()).toString('base64url').slice(0, 43)`, que falha no roundtrip exigido por `mfaKey()` em ~38% das execuções (77/200 medidos), derrubando qualquer preparo de MFA com 503 intermitente. Os gates que já exercitam MFA usavam `randomBytes(32)` ou bytes fixos; a fórmula deste gate foi alinhada (`randomBytes(32).toString('base64url')`). Nenhum comportamento de produto foi alterado por isso.

## Evidências e reprodutibilidade

- [`UX-PRO-09C-evidencias-2026-10-16/antes/`](UX-PRO-09C-evidencias-2026-10-16/antes/) (página original): `resumo.json` + **10 PNGs**, todos referenciados, sem órfãos. Falha RED canônica exata: `ID1a: senha recusada não pode aparecer como erro de conexão; veio "Erro de conexão ao iniciar o MFA."`
- [`UX-PRO-09C-evidencias-2026-10-16/`](UX-PRO-09C-evidencias-2026-10-16/) (página corrigida): `resumo.json` + **10 PNGs**, todos referenciados, sem órfãos; 0 avisos não tratados e 0 overflows.
- Comandos:
  - RED: `UX_PORTAL_TEST_PATTERN='UX-PRO-09C' UX_PORTAL_09C_EVIDENCE_DIR='docs/UX-PRO-09C-evidencias-2026-10-16/antes' npm run test:ux-portal:pg` (saída 1, ID1a).
  - GREEN: `UX_PORTAL_09C_EVIDENCE_DIR='docs/UX-PRO-09C-evidencias-2026-10-16' npm run test:ux-portal:pg` (**`UX_PORTAL_TEST_EXIT: 0`, 21/21**).
- Gates desta fatia: gate ux-portal **21/21**; `node --test tests/ux-portal-vocabulary.test.mjs` **17/17**; `npm run test:unit` **949/0**; `npm run typecheck` **exit 0**; `npm run build` **exit 0**; `node scripts/qa-wave0-static.mjs` **5/5**; inventário regenerado e `node scripts/ux-pro-00-inventory.mjs --check` **OK** (100 rotas; CSVs de 13/10 versionados); `git diff --check` limpo; `next-env.d.ts` restaurado (MD5 `87a8bf5c65d00003ad1eba1613711943`) e `tsconfig.json` intacto (`99f7042f814e77e67b785906e5d4df23`).

## Limitações

Capturas em Chromium headless Linux, tema claro (único suportado na área do cliente), larguras 320/390/768/1440 px conforme o cenário. Identidades, sessões, senhas e códigos sintéticos em PostgreSQL descartável; nada sensível versionado. Injeções de falha usam apenas `window.fetch` no navegador, declaradas nos resumos; todo o resto é servidor real. Não foram avaliados leitores de tela, zoom 200%, Windows ou outros navegadores, nem produção. Sem aceite humano, UAT, certificação WCAG ou mudança de escopo público (09B permanece diagnóstico; correções públicas não autorizadas). **NO-GO** em homologação e produção até decisão explícita do dono.
