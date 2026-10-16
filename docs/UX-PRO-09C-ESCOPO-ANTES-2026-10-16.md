# UX-PRO-09C — escopo antes do código (16/10/2026)

**Status:** documento pré-código obrigatório da subfatia **UX-PRO-09C — identidade de conta/autenticação**. Nada foi alterado ainda; a base foi medida por leitura estática e pelos contratos existentes. Esta entrega não declara aceite humano, UAT ou conformidade WCAG. Homologação e produção permanecem **NO-GO**.

## 1. Base conferida antes de editar

- Branch fixa da sessão: `arena/7a374da0-gruposegsystemseguranca`. (Observação de governança: o prompt da sessão citou `arena/3fa8fdb9-gruposegsystemseguranca`, que foi a branch da PR #257 — já mergeada e removida; esta sessão permanece na branch fixa que o Arena rastreia.)
- `git fetch` executado: `HEAD` = `origin/main` = **`024c73e403a272737cbbfa1bc973390858358041`** (merge da PR #257, UX-PRO-09B), árvore limpa, sem diffs.
- PRs confirmadas no GitHub: **#257 MERGED** (base `main`, merge `024c73e`), **#255 MERGED**. PR #234 e demais branches alheias: **intocadas**.
- Preservações de arquivo: `next-env.d.ts` MD5 `87a8bf5c65d00003ad1eba1613711943` (confere com o valor esperado); `tsconfig.json` MD5 `99f7042f814e77e67b785906e5d4df23` — ambos rastreados e não modificados; serão revalidados ao fim e restaurados se algum gate local os reescrever.
- Decisão do proprietário registrada nesta sessão (16/10/2026): escopo 09C = **identidade de conta/autenticação** — superfícies autenticadas de identidade (`/cliente/app/seguranca`: MFA, sessões, troca de e-mail; provisão de acesso; convites administrativos), com **auditoria antes/depois e menor lacuna reproduzida**; contratos de API/sessão intactos. Correções públicas (site 09B) continuam **fora de escopo** sem autorização nova.

## 2. Superfícies inventariadas (medição da base real)

| # | Superfície | Natureza | Arquivos medidos | Gate existente |
|---|---|---|---|---|
| S1 | `/cliente/app/seguranca` — MFA, sessões da conta, troca de e-mail | **Real**, exige sessão `seg_client_session` | `src/app/cliente/app/seguranca/page.tsx` (151 linhas); `src/server/client-security-api.mjs` (66 linhas, 10 handlers); `src/lib/portal-request.ts`; `src/lib/portal-vocabulary.mjs` | `npm run test:ux-portal:pg` (18 testes), `tests/cli14-account-security.test.mjs`, vocabulário (`node --test tests/ux-portal-vocabulary.test.mjs`) |
| S2 | `/admin/clientes` → `InvitesSection` — emissão de convite de cliente | **Real** (`POST /api/admin/invites`; comentário no código: "Real invite endpoint, not the historical /admin/portal/convites mock") | `src/app/admin/clientes/InvitesSection.tsx` (51 linhas) | `npm run test:ux-client-admin:pg` |
| S3 | `/admin/funcionarios` → `Admission` — credencial temporária de acesso de funcionário | **Real** (`POST /api/admin/hr/employees/:id/access`) | `src/app/admin/funcionarios/RhWorkspace.tsx` (1.222 linhas; provisão nas linhas 441–452, credencial única com `role="alert"` nas linhas 214–218) | `npm run test:ux-hr:pg`, `npm run test:admin-entry:pg` |

Contratos medidos em S1 (a preservar integralmente): mesmas URLs e métodos (`POST mfa/setup|activate|disable`, `GET/POST sessions`, `DELETE sessions/:id`, `POST|PUT|DELETE email-change`); mesma exigência de sessão + mesma origem; TTL de troca de e-mail 24 h e uso único; revogação de sessões **somente** em `mfa/disable` (revoke + cookie limpo) e em `email-change` PUT (`revoke_reason='email_change'`); auditoria `auth_access_audit`; códigos de erro canônicos do servidor. Nenhum endpoint, payload, política de senha/MFA/rate limit, grant ou isolamento será alterado.

Fora de escopo desta subfatia (registrado, não executado): prévias de identidade (`/cliente/recuperar-senha`, `/cliente/alterar-email`, `/cliente/seguranca`, `/cliente/conta`, `/admin/portal/convites`); módulo órfão `/admin/convite`; site público (regra da família: 09B só diagnóstico; correções públicas exigem autorização nova); E2–E9/C11; PR #234; UX-PRO-10.

## 3. Lacunas numeradas

### ID1 — ramos de erro `!ok` inalcançáveis em `/cliente/app/seguranca` (**lacuna selecionada**)

`workspaceFetch` (`src/lib/workspace-response.ts:9-13`) **lança exceção** em qualquer resposta não-2xx. Na página, todo ramo `!ok`/`d.error` escrito depois dele é, portanto, **código morto**, e a falha vira mentira, mensagem errada ou **silêncio**:

| Item | Linha (page.tsx) | Gatilho real | Comportamento observado (antes) | Mensagem pretendida (morta) |
|---|---|---|---|---|
| ID1a | 40–48 (`begin`) | senha errada → `403 invalid_credentials` | "Erro de conexão ao iniciar o MFA." (**mentira**: houve conexão; a senha foi recusada) | "Não foi possível configurar. Confira a senha; …" |
| ID1b | 51–61 (`activate`) | código TOTP errado → `403 mfa_code_invalid` | "Não foi possível ativar o MFA agora." (indisponibilidade alegada sem prova) | "Código incorreto ou configuração indisponível. Confira seu autenticador." |
| ID1c | 63–69 (`disable`) | senha/código errados → `403 invalid_credentials` | "Não foi possível desativar o MFA agora." (idem) | "Não foi possível desativar. Confira sua senha e o código ainda não usado." |
| ID1d | 143 (POST troca de e-mail) | segundo pedido com pendente real → recusa do servidor | "Erro de conexão." (**mentira**: houve conexão; o servidor recusou). Nota da medição: o 409 intocado (`email_change_pending`) **colapsa em 503 `security_unavailable`** (catch de `handleEmailChangeRequest` sem o ramo `e.status` dos handlers irmãos) — ver resíduo ID6 | `(d.error \|\| "Não foi possível solicitar.")` |
| ID1e | 146 (PUT confirmar troca) | token inválido/expirado → `400 invalid_or_expired_token` (ou 401/403/503) | **silêncio total**: sem `try/catch`, rejeição não tratada, nenhum aviso aparece; campo token também não é limpo no sucesso e o PUT não tem `disabled={busy}` | "Token inválido ou expirado." |
| ID1f | 137–138 (revogar sessão / demais sessões) | `401/403/500/503` em `DELETE`/`POST` | **silêncio total** + sem estado ocupado (duplo clique possível) + falha no refresh da lista também não tratada | — (não havia mensagem escrita) |

**Retratação registrada (ID1g) — a reprodução corrigiu a leitura estática:** o item original ID1g alegava que o aviso "Esta sessão antiga foi bloqueada" era falso, porque `handleMfaActivate` não altera `auth_sessions`. A reprodução com servidor real **desmentiu** a alegação: `readClientSession` (`src/server/client-access-api.mjs:242-247`) exige que `mfa_verified_at` postdate `activated_at` — toda sessão criada antes da ativação fica inoperante (`/api/auth/me` responde **401**, medido no cenário ID1g do teste). O aviso da interface é verdadeiro e o comportamento de servidor é o pretendido ("MFA proof belongs to THIS session…"). **Nenhuma correção de texto é aplicada em ID1g**, e a divergência `loginRequired` registrada inicialmente como **ID2 é retratada junto** (não há divergência: o bloqueio existe e foi medido).

Causa estrutural: S1 é a única superfície de identidade que **não** passa pelo mecanismo honesto já estabelecido para os portais (`portalRequest` + `describePortalError` + vocabulário — UX-06), e `tests/ux-portal-vocabulary.test.mjs` lê `employee-api`, `employee-time-clock-api`, `client-space-api` e `client-access-api`, mas **não** `client-security-api.mjs` — os 11 códigos abaixo ficam sem amarração:

`mfa_already_active`, `mfa_setup_required`, `mfa_verify_only_during_login`, `invalid_session`, `new_email_different_required`, `email_already_in_use`, `email_change_pending`, `invalid_or_expired_token`, `security_unavailable`, `audit_unavailable`, `client_confirmation_required`.

**Reparo selecionado (menor lacuna coesa, um único módulo de página):** trocar os manuseadores da página para `portalRequest` (não lança; devolve `{ok, status, error}`), tornar alcançáveis as mensagens honestas já escritas, mapear os códigos novos no vocabulário (adição pura), e acrescentar guarda de ocupado/refresh tratado em ID1f. Somente apresentação no cliente — **nenhum** contrato muda. (Item ID1g: **sem alteração de texto**, conforme a retratação acima; a frase original permanece porque o bloqueio no servidor é real.)

### ID2 — ~~`loginRequired:true` sem fim de sessão~~ (**RETRATADA pela medição**)

A hipótese original de ID2 dependia de ID1g e caiu com ele: o servidor **já bloqueia**
a sessão antiga na ativação (`readClientSession`, `client-access-api.mjs:242-247` —
`mfa_verified_at` deve postdatar `activated_at`; medido como `401` no cenário ID1g).
Não há divergência a corrigir e nenhuma mudança de semântica de sessão será feita.

### ID3 — mesmos padrões de `workspaceFetch` em outras 10 páginas do portal do cliente (registrada)

`agenda`, `chamados`, `cobrancas`, `contratos`, `documentos`, `reclamacoes-colaborador`, `relatorios`, `renovacao`, `satisfacao`, `solicitacoes` — fora do escopo de identidade de 09C; deixa-se para família própria, sem misturar numa PR de identidade.

### ID4 — `setup.uri` (otpauth) nunca exibido (registrada)

`page.tsx:15` guarda `uri` mas nunca a mostra (QR/cópia). Pode ser postura deliberada de segurança; exige decisão de produto. Sem reprodução de defeito → sem alteração.

### ID5 — S2 e S3 sem lacuna reproduzida (auditoria concluída sem número de defeito)

`InvitesSection` usa `fetch` cru com mapeamento honesto de `identity_exists`/`demo_synthetic_address_required`, `disabled={busy}` e `role="status"`; `Admission` tem `useId`, locks de submissão, rótulos e credencial única em `role="alert"`. Nenhuma alteração programada; as superfícies entram apenas na conferência estática registrada acima.

### ID6 — 409 de `handleEmailChangeRequest` colapsa em 503 (registrada; **não executada**)

Medido durante a reprodução do ID1d: `src/server/client-security-api.mjs:62` lança
`email_change_pending`/`email_already_in_use` com `status: 409` dentro da transação, mas o
`catch(e){return fail(res,e);}` **não repassa `e.status`** (diferente dos handlers `setup` e
`confirm`, que têm `if(e?.status)`), então a pessoa vê `503 security_unavailable` no lugar do
409 previsto — inclusive no corpo interno que a UI leria. Corrigir isso **altera o contrato de
erro do endpoint** (409 passaria a sair de fato), portanto fica registrado para decisão
explícita do proprietário; nesta subfatia a interface apenas descreve honestamente o 503 que o
servidor realmente envia, e o vocabulário já traduz os códigos 409 para quando/if o servidor
honrar os status.

## 4. Plano de evidência e gates (após o código)

1. **Reprodução (RED):** teste novo em `tests/ux-portal-workspace.integration.test.mjs` (mesmo harness: PostgreSQL descartável, Chromium real, falha injetada só em `window.fetch`) provando ID1a/ID1b/ID1c/ID1d/ID1e/ID1f com capturas "antes" e medindo (não supondo) o bloqueio de sessão da ativação em ID1g.
2. **Reparo + regressão (GREEN):** página via `portalRequest`; traduções aditivas no vocabulário; `tests/ux-portal-vocabulary.test.mjs` estendido para ler `client-security-api.mjs` nas duas direções (código sem frase falha; frase sem código falha).
3. **Gates locais obrigatórios:** `npm run test:ux-portal:pg`, `node --test tests/ux-portal-vocabulary.test.mjs`, `npm run test:unit`, `npm run typecheck`, `node scripts/qa-wave0-static.mjs`, `node scripts/ux-pro-00-inventory.mjs --check`, `node --check scripts/…` quando tocar scripts, `git diff --check`.
4. **Evidências:** `docs/UX-PRO-09C-evidencias-2026-10-16/` com PNGs antes/depois em 320/390/768/1440 (tema claro — único suportado na área do cliente) e `resumo.json` legível por máquina (mesmo `schemaVersion: 1` dos gates 09A).
5. **PR única pequena** a partir desta branch; merge somente com **todos os checks obrigatórios SUCCESS** e base `main` confirmada. Sem bypass.

## 5. Preservações e limites

- Nenhuma rota, endpoint, payload, sessão, cookie, MFA, rate limit, auditoria, grant, isolamento, mensagem anti-enumeração de login ou índice público muda. `next-env.d.ts` e `tsconfig.json` serão revalidados (MD5) ao fim.
- Dados de teste exclusivamente sintéticos; PostgreSQL sempre descartável (`scripts/qa-ux-portal-postgres.mjs` destrói o cluster); sem credenciais ou dados pessoais em docs/capturas.
- Não inicia UX-PRO-10 nem correções públicas; não reabre #257/#255; não toca em #234.
- Sem declaração de aceite humano, UAT ou conformidade WCAG; capturas não medem produção; homologação e produção **NO-GO**.
