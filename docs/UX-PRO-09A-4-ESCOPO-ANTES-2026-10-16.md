# UX-PRO-09A-4 — G3: escopo antes da implementação (16/10/2026)

Este documento é o registro **anterior à alteração de código**, exigido pelo plano mestre. Mede a
base real, reproduz a lacuna G3 no código presente e fixa o que será e o que não será tocado.
Não contém token, cookie, senha, credencial, endereço real ou dado pessoal.

## 1. Base e reconciliação

- Repositório `berger33/gruposegsystemseguranca`; branch fixa desta sessão Arena:
  `arena/7dbaae55-gruposegsystemseguranca`.
- `git ls-remote origin refs/heads/main` e `git rev-parse HEAD`: **`e6ebe65e02e192f01054849057a4fe1da7379be8`**
  (merge da PR **#252**, UX-PRO-09A-3 / G4, `mergedAt 2026-10-16T02:44:10Z`). Árvore limpa antes
  deste documento; a única sujeira observada foi `next-env.d.ts`, reescrito pelo gate e restaurado
  ao estado versionado (comportamento já registrado em UX-PRO-09A-2 §5.6).
- Família 09A: **G1 MERGED #250**, **G2 MERGED #251**, **G4 MERGED #252**. Nenhuma será reaberta.
  A PR **#234** (financeiro) continua aberta e é inteiramente alheia: não será tocada.
- Verificações executadas nesta base, antes de qualquer edição:

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run test:unit` | **949/949**, 0 fail/skip/cancel/todo |
| `npm run test:ux-portal:pg` | **17/17**, 0 fail/skip/cancel/todo (PostgreSQL descartável + HTTP real + Chromium; `QA_PG_TEMP_CLEANED: true`) |

## 2. Decisão do proprietário que desbloqueia G3

G3 estava explicitamente bloqueada desde `docs/UX-PRO-09A-ESCOPO-ANTES-2026-10-15.md` §5 por exigir
decisão do proprietário (`AGENTS.md`: silêncio ou conveniência técnica não são aprovação). Em
16/10/2026 o proprietário escolheu, entre as três alternativas apresentadas:

> **“Corrigir só o texto de entrega”** — apontar `/cliente/app/seguranca` na mensagem da caixa de
> saída local, **sem** mudar endpoint, payload, token, sessão, cookie ou segurança.

Foram recusadas expressamente: (a) não alterar nada; (b) fazer a rota pública
`/cliente/confirmar-email` aceitar token de troca de e-mail (mudança de contrato e de modelo de
segurança — confirmação anônima de e-mail por link). Portanto **nenhum contrato muda nesta fatia**:
a confirmação continua exigindo sessão ativa + mesma origem + `PUT` autenticado.

## 3. Lacuna G3 medida no código desta base

| Elemento | Onde está | O que faz hoje |
|---|---|---|
| Emissão do pedido de troca | `src/server/client-security-api.mjs:62` (`handleEmailChangeRequest`) | `POST /api/client/security/email-change` com sessão: valida e-mail novo diferente, impede colisão (`email_already_in_use` 409) e pedido pendente anterior (`email_change_pending` 409), grava `auth_email_change` com **hash** do token e expiração de **24 h**, audita `email_change_request` na mesma transação e responde `202` |
| Entrega manual (sem SMTP) | mesma linha, `localOutbox.deliver({ template: 'client_email_change', ... })` | Grava na caixa local o corpo **`URL manual: /cliente/confirmar-email?token=<token>`** |
| Rota pública apontada | `src/app/cliente/confirmar-email/page.tsx` → `POST /api/auth/confirm-email` (`src/server/client-access-api.mjs`) | Consome **apenas** tokens `kind='confirm_email'` da tabela `auth_email_tokens`; qualquer outro hash devolve `400 confirmation_link_invalid` |
| Superfície que realmente confirma | `src/app/cliente/app/seguranca/page.tsx` (seção “Trocar e-mail”, campo rotulado **“Token da URL manual”**) → `PUT /api/client/security/email-change` (`handleEmailChangeConfirm`) | Exige sessão ativa e mesma origem; confere o hash em `auth_email_change` não usado/não cancelado/não expirado; atualiza o e-mail da mesma identidade, marca `used_at`, **revoga as sessões** (`revoke_reason='email_change'`) e audita `email_change_confirm`; token inválido/expirado → `400 invalid_or_expired_token` |

**Defeito reproduzível (antes):** a instrução entregue à pessoa aponta uma rota que não consome
aquele token. O token de troca vive em `auth_email_change`; a rota pública procura em
`auth_email_tokens` com `kind='confirm_email'`. Quem segue a instrução recebe “link inválido” e não
tem como concluir a troca pelo caminho indicado — mesmo tendo um pedido válido, com token válido,
dentro do prazo. O caminho correto existe e está montado (`PUT` autenticado em
`/cliente/app/seguranca`), mas nada na entrega o menciona.

Observação de tema/ambiente: `/cliente/app/seguranca` é superfície protegida do portal do cliente,
fora do `data-admin-theme-scope`; só oferece **tema claro**, que é o único medido nesta fatia.

## 4. Alteração prevista (mínima e aditiva)

**Único alvo de código de produto:** a string `body` da entrega local do template
`client_email_change` em `src/server/client-security-api.mjs`, que passa a nomear a superfície real
de confirmação, a seção e o campo rotulado onde o token é informado, mantendo o token disponível
uma única vez (não há SMTP; a caixa local é o canal). Nada de link para rota que recusaria o token.

Preservados literalmente: `template`, `subject`, `recipientKind/Id/Address`, `channel`,
`expiresAt`, `isSensitive`, o estado `local_outbox` (nunca `sent`/`delivered`), a resposta `202`
com `requestId`/`expiresAt`/`delivery`, o TTL de 24 h, o hash do token, o uso único, a substituição,
a revogação de sessões na confirmação, a auditoria transacional, `guard`/`sameOrigin`, MFA,
cookies, grants, rate limit, isolamento de identidades, a UI de `/cliente/app/seguranca` (rótulo
inclusive), a rota `/cliente/confirmar-email`, os endpoints `/api/auth/*` e todas as prévias.

## 5. Regressão prevista

Novo teste no gate existente `tests/ux-portal-workspace.integration.test.mjs`
(`npm run test:ux-portal:pg`), coberto em CI pelo `paths` de `.github/workflows/ux-portal-delivery.yml`
(`tests/ux-portal-workspace.integration.test.mjs`), com **identidade sintética dedicada** criada no
PostgreSQL descartável para não tocar o cliente dos demais testes:

1. `POST /api/client/security/email-change` real, com sessão e mesma origem → `202`,
   `delivery: local_outbox`.
2. Leitura da linha gravada em `local_outbox_messages` (template `client_email_change`): o corpo
   nomeia `/cliente/app/seguranca` e **não** contém `/cliente/confirmar-email`.
3. Prova do defeito antigo: o mesmo token enviado à rota pública `POST /api/auth/confirm-email`
   devolve `400` — ou seja, a instrução anterior levava a uma recusa.
4. Capturas da superfície real em **320/390/768/1440**, tema claro, com os campos **vazios**
   (nenhum token visível em PNG), transbordo horizontal medido e percurso de teclado de vários
   passos medido em cada largura.
5. Prova de que a instrução corrigida é verdadeira: `PUT /api/client/security/email-change` com o
   token e a mesma sessão → `200 { ok: true, sessionRevoked: true }`, e-mail da identidade
   atualizado no banco, token marcado como usado e sessão anterior recusada (`/api/auth/me` → 401).
6. `resumo.json` legível por máquina na pasta de evidências, com o **token redigido** e sem cookie.

Testes de G1 (#250), G2 (09A-2) e G4 (#252) permanecem intactos; o gate deve continuar passando
todos eles. Nenhum endpoint, migração, script QA ou workflow novo.

## 6. Fora de escopo, sem alteração

G5 (foco nas demais entradas — `/cliente/entrar`, `/cliente/convite`, `/admin/entrar`,
`/funcionario`), que segue em subfatia própria; 09B (site público — só diagnóstico) e 09C
(identidade); prévias (`/cliente/recuperar-senha`, `/cliente/alterar-email`, `/cliente/seguranca`,
`/admin/portal/convites`); módulo órfão `/admin/convite`; convite de staff/funcionário inexistente;
SMTP/provedor real; `noindex`; E2–E9 e C11; PR #234; aceite humano, UAT, alegação WCAG e
homologação/produção, que permanecem **NO-GO**.

## 7. Limitações conhecidas desta fatia

1. Sem SMTP configurado, a entrega continua sendo **caixa local** (`local_outbox`): nada é enviado
   de fato; a leitura do corpo na UI real é restrita a papéis administrativos e auditada. O gate lê
   a linha diretamente no banco descartável, sem versionar corpo bruto com token.
2. O rótulo do campo na UI (“Token da URL manual”) continua com a palavra “URL”, embora o canal
   manual não entregue mais uma URL clicável. Renomear rótulo de superfície protegida **não** foi
   autorizado nesta decisão e fica registrado como resíduo numerado.
3. A medição cobre tema claro, Chromium empacotado em Linux, dados sintéticos e banco descartável:
   não é aceite humano, não cobre Windows/leitores de tela/zoom 200% e não declara conformidade WCAG.
