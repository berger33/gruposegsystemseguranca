# UX-PRO-09A-2 — escopo antes da implementação (16/10/2026)

Registro **anterior a qualquer alteração de código** desta subfatia: contrato real da superfície, gates
existentes e a lacuna reproduzível. Nenhum aceite humano, validação manual, conformidade WCAG ou
prontidão de produção é declarado aqui.

## 1. Base e reconciliação

- Repositório: `berger33/gruposegsystemseguranca`.
- Branch fixa desta sessão Arena: `arena/ccb60b64-gruposegsystemseguranca`.
- `git fetch origin main` + `git ls-remote origin refs/heads/main`: `origin/main` = **`c6682c11dd51fd98ceb480e59a2f8b5beafa5cfe`**; `HEAD` da sessão parte do mesmo SHA, árvore limpa antes deste documento.
- `gh pr view 250`: **MERGED** em 15/10/2026 (“UX-PRO-09A: tratar falhas no pedido manual de recuperação”), merge commit `c6682c11dd51fd98ceb480e59a2f8b5beafa5cfe`. É a subfatia que corrigiu **G1** (`/cliente/redefinir-senha`) e estendeu o gate `ux-portal`.
- `gh pr list --state open`: somente a **PR #234** (financeiro/datas), alheia a esta subfatia; não será tocada nem mesclada.
- `docs/UX-PRO-09A-ESCOPO-ANTES-2026-10-15.md` §5 registrou G1 (escolhida), **G2 (reenvio de confirmação, “deixar separado”)**, G3, G4 e G5. Esta subfatia é exatamente **G2**; G3–G5 permanecem abertos e numerados.
- Observação de ambiente: rodar os gates reescreve `next-env.d.ts` (referência ao `NEXT_DIST_DIR` do gate). O arquivo será restaurado ao estado versionado antes de cada commit; não é alteração de produto.

## 2. Contrato real da superfície (medido no código, antes do código)

### 2.1 Rota e componente

| Item | Estado real encontrado |
|---|---|
| Rota | `/cliente/confirmar-email` — `src/app/cliente/confirmar-email/page.tsx` (150 linhas, `"use client"`, `Suspense` + `useSearchParams`, casca `RealAccessShell`, estilos `RealAccess.module.css`). |
| Classificação | **Canônica** (mesma classificação dada em `docs/UX-PRO-09A-ESCOPO-ANTES-2026-10-15.md` §2). Não é prévia. |
| Sessão/papel | Rota **pública**: não exige cookie, não cria sessão, não depende de papel. Confirmação de e-mail não autentica ninguém. |
| Dois comportamentos na mesma rota | (a) com `?token=`: `ConfirmEmailInner` faz `POST /api/auth/confirm-email` e mostra `working`/`ok`/`failed`; (b) sem token **ou** com token recusado: estado `failed` + `ConfirmResendForm` (o alvo desta subfatia). |
| Tema | Fora do escopo do tema administrativo: a casca não tem alternador dia/noite nem `data-admin-theme`; só existe o tema claro que o código suporta. |
| Entrega de mensagem | O gate roda com `MAIL_HOST=''`: nenhuma mensagem é entregue (`trySendAuthEmail` devolve estado interno de entrega, nunca `sent` sem envio real). O status HTTP público não depende disso. |

### 2.2 `POST /api/auth/confirm-email/resend` (a preservar integralmente)

Implementação: `createLinkResendHandler("confirm_email", "/cliente/confirmar-email", CONFIRM_EMAIL_TTL_MS, "email_confirm_resend", …)` em `src/server/client-access-api.mjs:695` e `:773`; despacho em `:1167`.

| Aspecto | Valor real no código |
|---|---|
| Método | Somente `POST`; outro método → `405 method_not_allowed`. |
| Origem | `requireSameOrigin` → `403 same_origin_required` fora da mesma origem. |
| Payload | `{ "email": string }` em JSON. Corpo ilegível → `400 invalid_request`; acima do limite → `413`. **Nenhum outro campo é aceito ou necessário.** |
| Resposta pública | Sempre `202 { "ok": true }` para: e-mail inválido (`normalizeEmail`), endereço desconhecido, identidade não elegível, reenvio dentro do limite/intervalo (throttled) e reenvio aceito. **Anti-enumeração: o corpo não distingue os casos.** |
| Falha real de serviço | `databaseFailure` → **`503`** com `{ "error": "auth_unavailable" \| "audit_unavailable" \| "database_not_configured" \| "migration_required" }`. É o único caminho em que o pedido **não** foi registrado. |
| Elegibilidade | `auth_identities.kind='client'`, `status='pending_email'` e `status <> 'disabled'`. |
| Limites de reenvio | `RESEND_MAX_PER_ADDRESS_24H = 5` por endereço em 24 h e `RESEND_MIN_INTERVAL_MS = 2 min` (`src/lib/client-auth-core.mjs:32-33`, `resendPolicyAllows` `:149`). Throttle responde `202` genérico e audita `denied/throttled`. |
| Tokens | `auth_email_tokens` com `kind='confirm_email'`, hash no banco (`hashToken`), `expires_at = now + CONFIRM_EMAIL_TTL_MS` (**7 dias**), uso único; cada nova emissão marca as anteriores como `superseded_at`. Link gerado: `/cliente/confirmar-email?token=…`. |
| Auditoria | `email_confirm_resend` gravada **na mesma transação** do token (`allowed`) ou como `denied/throttled`; falha de auditoria → rollback → `503 audit_unavailable`. |
| Sessões/cookies | O endpoint **não** emite, lê ou revoga sessão. Nada de cookie `seg_client_session` neste fluxo. |

### 2.3 Comportamento atual do formulário de reenvio (`ConfirmResendForm`, linhas 82-131)

| Passo | Código atual |
|---|---|
| Estado local | `email`, `sent`, `busy`. **Não existe estado de erro.** |
| Submissão | `try { await fetch(…) } finally { setSent(true); setBusy(false); }` (linhas 89-100). A resposta **não é lida**: nem `response.ok`, nem `status`, nem corpo. |
| Renderização | `if (sent)` substitui o formulário por um `role="status"` informativo (linhas 102-111); não há botão de repetição nem caminho de volta após `sent`. |
| Validação | Nativa do campo (`type="email"` + `required`, `id="resendEmail"`, rótulo associado “Seu e-mail”). |
| Rótulo do botão | `Enviando…` durante o pedido; `Pedir novo link de confirmação` em repouso. |

## 3. Gates existentes que alcançam esta superfície (antes do código)

| Gate/workflow | O que já cobre | O que **não** cobre neste recorte |
|---|---|---|
| `npm run test:ux-portal:pg` (`scripts/qa-ux-portal-postgres.mjs` → `tests/ux-portal-workspace.integration.test.mjs`, Chromium + PostgreSQL descartável) e `.github/workflows/ux-portal-delivery.yml` (dispara em `src/app/cliente/**`, no teste e no script; CI roda ainda `typecheck` e vocabulário) | Contrato 401/ isolamento dos portais, estados honestos de leitura, tablist por teclado, rótulos, 390px sem transbordo e — desde a PR #250 — **G1**: `503` real por trigger no banco, rejeição de `fetch` declarada simulação, `202` genérico para endereço elegível e desconhecido, foco no erro, repetição e 320/390/768/1440 em `/cliente/redefinir-senha`. | Não abre `/cliente/confirmar-email`, não exerce `POST /api/auth/confirm-email/resend` e não distingue `503`/rejeição de rede do falso “pedido recebido” neste formulário. |
| `npm run test:client-access:pg` (`scripts/qa-tenant-postgres.mjs --client-access` → `tests/client-access.integration.test.mjs`) | Ciclo real de convite → aceite → confirmação: link `/cliente/confirmar-email?token=…` extraído da mensagem, `POST /api/auth/confirm-email` com uso único, `400 confirmation_link_invalid`, throttle de reenvio silencioso (`/api/auth/recover`) e rollback `503 audit_unavailable` quando a auditoria obrigatória falha (padrão `qa_l08_access_audit_failure`). | É HTTP puro: não abre a página, não mede foco/teclado/viewport e **não chama `/api/auth/confirm-email/resend`** (o throttle testado é o do endpoint de recuperação). |
| `npm run test:unit` → `tests/client-auth-core.test.mjs` | Regra pura `resendPolicyAllows`: 5 por endereço em 24 h, intervalo de 2 min, entradas antigas não contam. | Não exercita HTTP, UI nem o `503`. |
| `npm run test:integration`, `npm run typecheck`, `npm run build`, `scripts/qa-wave0-static.mjs`, `tests/ux-pro-00-inventory.test.mjs`, `tests/ux-pro-00-precision.test.mjs` | Compilação, tipos, guardas estáticas e inventário/matriz de cobertura gerados a partir do código e dos `resumo.json` de capturas. | Sozinhos não reproduzem resposta HTTP/rede nem foco/overflow em navegador; o inventário só **credita** captura que já exista em `docs/<stage>-evidencias/resumo.json`. |

Decisão de cobertura pré-código: **estender o gate já existente** (`tests/ux-portal-workspace.integration.test.mjs`, executado por `npm run test:ux-portal:pg` e pelo workflow `ux-portal-delivery.yml`), sem criar endpoint, migração, script de QA ou workflow novos.

## 4. Lacuna reproduzível — G2: falha real do reenvio aparece como sucesso

- Arquivo único: `src/app/cliente/confirmar-email/page.tsx`, `ConfirmResendForm` (linhas 82-131), em especial o `try/finally` das linhas 89-100.
- Mecanismo: `await fetch(...)` é executado sem inspeção de `response.ok`/`status`; o `finally` define `sent = true` em **qualquer** desfecho, inclusive `503` e exceção de rede (`TypeError: Failed to fetch` também cai no `finally` porque não há `catch`).
- Consequência: com `503 auth_unavailable`/`audit_unavailable` (pedido **não** registrado, nenhum link emitido) ou com falha de transporte, a tela troca o formulário pela mensagem informativa `role="status"` (“Se houver um cadastro aguardando confirmação, a equipe poderá orientar sobre o acesso…”). A pessoa lê um pedido recebido que não existe, sem erro, sem foco e **sem botão para repetir** — o formulário foi substituído.
- Reprodução (sem dados reais, em banco descartável): abrir `/cliente/confirmar-email` **sem** `?token` (estado `failed` imediato, sem HTTP); informar um endereço sintético `@example.invalid`; fazer `POST /api/auth/confirm-email/resend` falhar de verdade (falha de auditoria obrigatória no PostgreSQL descartável → `503 audit_unavailable`, padrão já usado em `tests/client-access.integration.test.mjs`) ou rejeitar no navegador; submeter. Estado atual: mensagem de pedido recebido.
- Diferença para G1 (já corrigido na PR #250): outro formulário, outra rota, outro endpoint, outro texto — mesma classe de defeito. G1 não cobre G2 e não pode ser apresentado como cobertura dele.

## 5. Escopo escolhido e exclusões expressas

**Único alvo de código de produto:** `ConfirmResendForm` em `/cliente/confirmar-email` — sucesso genérico apenas com resposta 2xx; falha de serviço/rede explícita, sem corpo interno nem enumeração; formulário preservado para repetição; foco útil no erro.

**Preservar sem alteração (verificação por asserção no gate):** `POST /api/auth/confirm-email/resend`, endpoint e rota, payload `{email}`, `202` genérico anti-enumeração, limites de reenvio (5/24 h e 2 min), tokens `confirm_email` (7 dias, hash, uso único, substituição do anterior), auditoria transacional, `POST /api/auth/confirm-email`, ausência de sessão/cookie, `RealAccessShell`, rótulos, validação nativa e os demais estados da página (`working`/`ok`/`failed`).

**Fora de escopo, sem alteração:** G3 (confirmação da troca de e-mail em `/cliente/app/seguranca` vs. rota pública), G4 (duração exibida no erro de redefinição), G5 (foco nas demais superfícies), qualquer mudança de API, política de senha, expiração/uso único/revogação, rate limit, MFA, grants/papéis, cookies, SMTP/provedor real, migrações, prévias (`/cliente/recuperar-senha`, `/cliente/alterar-email`, `/cliente/seguranca`, `/admin/portal/convites`), módulo órfão `/admin/convite`, PR #234, E2–E9/C11, site público, `noindex`, aceite humano/UAT, alegação WCAG e homologação/produção (que permanecem **NO-GO**).

## 6. Critérios de prova do gate estendido (definidos antes do código)

1. **`503` real em PostgreSQL descartável** — falha injetada no banco do cluster temporário (auditoria obrigatória recusada por trigger, padrão já existente no repositório), com servidor, rota, HTTP e Chromium reais. Sem `mock` da resposta HTTP e sem enfraquecer o servidor.
2. **Rejeição de `fetch` claramente identificada como simulação** — registrada no `resumo.json` com `simulatedFetchRejection: true`, `httpStatus: null` e `httpRequestIssued: false`, e descrita como limitação (“não equivale a interromper o transporte real”).
3. **`202` genérico para endereço elegível e desconhecido** — identidade sintética `pending_email` e endereço inexistente, ambos `@example.invalid`; corpos comparados entre si (iguais) e sem endereço na tela; também exercitado por HTTP fora do navegador.
4. **Foco, repetição, teclado e viewports** — erro recebe foco programático com contorno visível; o valor digitado e o formulário permanecem para nova tentativa; percurso por `Tab`/`Enter` medido em vários passos (não só o primeiro `Tab`); overflow horizontal medido em 320/390/768/1440 no único tema suportado.
5. **Sem dados reais** — somente massa sintética criada pelo próprio gate em cluster descartável; nenhum token, cookie, senha ou endereço real em código, log, captura ou documento; capturas só com `UX_PORTAL_EVIDENCE_DIR` definido.
6. **Preservação do limite de reenvio** — repetir o pedido logo após um reenvio aceito continua respondendo `202` genérico e **não** cria segundo token dentro do intervalo mínimo (verificado por contagem no banco), provando que a correção de UI não afrouxou a política.

Se qualquer item não puder ser executado neste ambiente, o fato será registrado como limitação na entrega, sem substituir a prova por alegação.
