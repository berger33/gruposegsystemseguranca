# UX-PRO-09A-4 — G3: relatório (16/10/2026)

**Status:** implementação e validação local concluídas nesta sessão; merge condicionado a checks
remotos verdes e revisão concluída. Homologação e produção permanecem **NO-GO**. Nada aqui declara
aceite humano, UAT ou conformidade WCAG.

## 1. Base, decisão e alteração

- Base `main`/`origin/main` = **`e6ebe65e02e192f01054849057a4fe1da7379be8`** (merge da PR **#252**,
  UX-PRO-09A-3/G4), confirmada por `git ls-remote` antes de editar. Branch fixa desta sessão:
  `arena/7dbaae55-gruposegsystemseguranca`. PR #234 permanece aberta e alheia, intocada.
- Escopo escrito antes do código: [UX-PRO-09A-4-ESCOPO-ANTES-2026-10-16.md](UX-PRO-09A-4-ESCOPO-ANTES-2026-10-16.md).
- **Decisão do proprietário (16/10/2026), entre três alternativas apresentadas:** corrigir somente o
  texto de entrega manual da troca de e-mail, apontando `/cliente/app/seguranca`; recusadas
  expressamente “não alterar nada” e “fazer a rota pública aceitar o token de troca” (mudança de
  contrato/segurança). Nenhum endpoint, payload, token, sessão, cookie, TTL, auditoria ou
  permissão mudou.
- Alteração de produto: **uma string**, em `src/server/client-security-api.mjs`
  (`handleEmailChangeRequest`, template `client_email_change` da caixa local):
  - Antes: `URL manual: /cliente/confirmar-email?token=<token>`
  - Depois: `Confirme a troca de e-mail em /cliente/app/seguranca, seção "Trocar e-mail", com a sua
    sessão ativa: informe o token abaixo no campo "Token da URL manual". Token: <token>`
- Regressão: um teste novo no gate existente `tests/ux-portal-workspace.integration.test.mjs`
  (`npm run test:ux-portal:pg`, coberto em CI pelo `paths` de `ux-portal-delivery.yml`), com
  identidade sintética dedicada criada no PostgreSQL descartável para não tocar o cliente dos
  demais testes. Os testes de G1 (#250), G2 (09A-2) e G4 (#252) permanecem literalmente intactos.

## 2. O que o novo teste prova (e como foi medido)

1. `POST /api/client/security/email-change` real (sessão + mesma origem) → `202`,
   `delivery: local_outbox`; janela medida em `auth_email_change`: **86.400 s (24 h)**, inalterada.
2. A linha gravada em `local_outbox_messages` tem `template='client_email_change'`,
   `delivery_mode='local_outbox'`, `is_sensitive=true`, e o corpo **nomeia
   `/cliente/app/seguranca`** e **não contém** `/cliente/confirmar-email`.
3. O valor persistido é hash `[0-9a-f]{64}`, diferente do token entregue.
4. **Defeito antigo reproduzido:** o mesmo token em `POST /api/auth/confirm-email` → `400
   confirmation_link_invalid`, e o pedido de troca permanece não consumido depois disso — a
   instrução anterior levava, de fato, a uma recusa.
5. Superfície real medida em **320/390/768/1440**, tema claro (único suportado ali): 4 PNGs
   fullPage com os **campos vazios** (nenhum token em captura), transbordo horizontal 0 nas quatro
   larguras, rótulos visíveis associados (`Novo e-mail`/`Token da URL manual`) e percurso de
   teclado de cinco passos por largura (`focus` → Tab → Tab → Tab → Shift+Tab), sem pressionar
   Enter (nada é submetido pelo teclado nas capturas).
6. **A instrução corrigida é verdadeira:** `PUT /api/client/security/email-change` com o mesmo token
   e a mesma sessão → `200 {ok:true, sessionRevoked:true}`; e-mail da identidade atualizado no
   banco; token marcado `used_at`; nova tentativa → `401`; `/api/auth/me` com a sessão antiga →
   `401`; auditoria com exatamente `email_change_request/allowed` e `email_change_confirm/allowed`.
7. Cleanup real no fim: outbox, pedido, auditoria, sessões, credencial e identidade sintéticos
   removidos do cluster descartável.

## 3. Verificações locais reais

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run test:ux-portal:pg` (conjunto final, com evidência G3) | **18/18**, 0 fail/skip/cancel/todo; PostgreSQL descartável + HTTP real + Chromium; `QA_PG_TEMP_CLEANED: true` |
| Execução RED pré-correção (texto antigo, mesmo teste) | **falhou** exatamente em “a entrega manual precisa nomear a superfície que realmente confirma”, com o corpo antigo na mensagem da asserção |
| `npm run test:unit` | **949/949**, 0 fail/skip/cancel/todo |
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 OK |
| `npm run build` | exit 0 |
| `node scripts/ux-pro-00-inventory.mjs` e `--check` | regenerado pelo gerador; **somente** a linha de `/cliente/app/seguranca` muda nos dois CSVs (captura `1440x900|320x844|390x844|768x900`, estágio `UX-PRO-09A-4`); `OK:` no `--check` |
| `npm run test:client-access:pg` | **27/27**, 0 fail/skip/cancel/todo; PostgreSQL descartável + HTTP; `QA_PG_TEMP_CLEANED: true` (fluxos `/api/auth/*` intocados; reexecutado por precaução) |
| `git diff --check` | exit 0 |

**Histórico de desenvolvimento, não omitido:** a primeira execução do teste novo, ainda com o texto
antigo no código, falhou na asserção de destino (RED) em ~7 s, sem chegar ao navegador. O log dessa
execução **não foi versionado**: a mensagem de asserção do Node imprime o corpo real da mensagem,
que carrega o token sintético do banco descartável, e credenciais/tokens nunca entram no
repositório. Após aplicar a correção, o gate completo passou 18/18 de primeira, incluindo os 17
testes anteriores sem alteração.

## 4. Evidências e limites de interpretação

Pasta [UX-PRO-09A-4-evidencias-2026-10-16](UX-PRO-09A-4-evidencias-2026-10-16/):

- `resumo.json`: 4 entradas (rota, papel “cliente autenticado (sessão sintética)”, viewport,
  tema claro, PNG, percurso de teclado de 5 passos, rótulos, overflow 0, HTTP 200, campos vazios) +
  blocos `delivery`, `defectReproduced`, `confirmation` e `limitations`; `tokenInEvidence`
  registrado como redigido; `simulatedFetchRejection: false`, `mockedHttp: false`.
- 4 PNGs conferidos por assinatura/IHDR: 320x1947, 390x1860, 768x1538, 1440x1455 (fullPage;
  viewport 320x844 gerar 320x1947 é conteúdo completo, não divergência de largura). Inspeção visual
  confirma a seção “Trocar e-mail” com campos vazios, a lista de sessões sem token/hash e nenhum
  valor sensível na imagem.
- Comando reproduzível sem sobrescrever G1/G2/G4:

```sh
UX_PORTAL_G3_EVIDENCE_DIR=docs/UX-PRO-09A-4-evidencias-2026-10-16 npm run test:ux-portal:pg
```

Limites: inspeção automatizada de captura não é avaliação humana; não cobre leitores de tela, zoom
200%, Windows, SMTP/provedor real, UAT ou aceite; a superfície não oferece tema noturno e nenhum
alternador foi criado. A entrega continua sendo caixa local (`local_outbox`): **nada é enviado de
fato** sem SMTP, e a leitura do corpo na UI real segue restrita a papéis administrativos e auditada.

## 5. Preservações verificadas

- Nenhum endpoint, payload, política de senha, cookie/sessão, MFA, rate limit, permissão, hash,
  expiração (24 h), uso único, substituição, revogação de sessões na confirmação ou auditoria foi
  alterado; a confirmação continua exigindo sessão ativa e mesma origem.
- A rota pública `/cliente/confirmar-email` e seu handler continuam consumindo apenas tokens
  `confirm_email`; as prévias, o módulo órfão `/admin/convite` e o site público não foram tocados.
- A UI de `/cliente/app/seguranca` permanece literalmente igual (inclusive o rótulo “Token da URL
  manual”, resíduo nº 1 abaixo).
- G1/G2/G4 intactos no gate (17 testes anteriores passando no mesmo conjunto); nenhum endpoint,
  migração, script QA ou workflow novo; CSVs regenerados só pelo gerador.

## 6. Resíduos numerados

1. **Rótulo do campo** em `/cliente/app/seguranca` continua “Token da URL manual”, embora o canal
   manual não entregue mais uma URL clicável. Renomear rótulo de superfície protegida não fazia
   parte da decisão do proprietário desta fatia; fica registrado para decisão futura.
2. **Sem SMTP:** entrega `local_outbox`; jornada de envio real continua dependente de provedor
   (bloqueio de produção já registrado no cronograma §6.3).
3. **G5** (foco nas demais entradas) segue para as subfatias UX-PRO-09A-5/6; **09B** e **09C**
   seguem na fila; E2–E9/C11 exigem autorização por item; #234 é alheia.
4. **Sem aceite humano/WCAG/homologação:** homologação e produção continuam NO-GO.

## 7. Prompt completo da próxima subfatia (UX-PRO-09A-5 — G5 nas entradas do cliente)

```text
Trabalhe no repositório berger33/gruposegsystemseguranca, partindo da main remota mais recente na
branch fixada pela sessão Arena. Leia AGENTS.md, README.md, docs/ARENA-PRESERVAR-FUNCIONALIDADES.md,
docs/PLANO-MESTRE-PROFISSIONALIZACAO-UX-2026-10-10.md,
docs/UX-PRO-09A-4-ESCOPO-ANTES-2026-10-16.md e docs/UX-PRO-09A-4-RELATORIO-2026-10-16.md. Confirme
SHA da main e reconcilie PRs/checks no GitHub; não use cópia local antiga. G1 #250, G2 #251,
G4 #252 e G3 (09A-4) estão MERGED: não reabra. #234 permanece alheia: não tocar.

Execute SOMENTE a subfatia UX-PRO-09A-5 — G5 nas entradas públicas do cliente (/cliente/entrar e
/cliente/convite): o erro após submissão recebe role="alert" mas não recebe foco; ao desabilitar o
botão em "busy", o foco cai em BODY. Antes do código, escreva o escopo "antes" medindo o
comportamento atual nas duas rotas (inclusive o caso de montagem com convite inválido em
/cliente/convite, que deve permanecer como está) e numerando o que será preservado. Aplique SOMENTE
o padrão já mergeado de G1/G2 (ref + tabIndex={-1} + focus no efeito + contorno já existente em
RealAccess.module.css), sem mudar mensagens, endpoints, payloads, contratos, MFA, rate limit,
política anti-enumeração, sessão/cookie ou CSS compartilhado além do necessário. Estenda o gate
existente tests/ux-portal-workspace.integration.test.mjs para o recorte alterado, mantendo intactos
os testes de G1, G2, G3 e G4; colete evidências em pasta própria (resumo.json + PNGs 320/390/768/1440,
tema claro, percurso de teclado de vários passos, sem credenciais). Não faça mudança transversal
em componente compartilhado: cada rota recebe sua correção local. Revalide test:unit, typecheck,
test:ux-portal:pg, build e inventário --check. Abra UMA PR pequena; só merge com todos os checks
obrigatórios realmente verdes e base main confirmada. G5 de /admin/entrar e /funcionario fica na
subfatia UX-PRO-09A-6; 09B e 09C seguem na fila; E2–E9/C11 dependem de autorização por item;
homologação e produção continuam NO-GO; não invente aceite humano nem conformidade WCAG.
```
