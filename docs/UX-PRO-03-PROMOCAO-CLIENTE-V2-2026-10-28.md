# UX-PRO-03 — 7ª promoção "com prova": CLI-05/06/07/08 lado administrativo (v2)

**Data:** 28/10/2026 · **Base:** `cd3a4cfd806e660573f03427e5e1db2192b7a4ce` (`main`) ·
**Branch:** `arena/c0d2c555-gruposegsystemseguranca`
**Fatia:** 1 família coerente, 1 PR. Continuação de
[`UX-PRO-03-PROMOCAO-CONFIGURACOES-ROLLOUT-2026-10-27.md`](UX-PRO-03-PROMOCAO-CONFIGURACOES-ROLLOUT-2026-10-27.md).
**Natureza:** promoção de superfície com prova. **Não** é homologação, não promove
aceite humano e **não** altera a fila P0.

---

## 1. Como a família foi escolhida (e o que foi descartado antes)

A fila P1 pede "próxima família de órfãos **com prova**", sem ordem de áreas
inventada. Antes de escolher, os **40 órfãos** de
`docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.csv` foram triados contra três
critérios, e **quatro famílias foram descartadas com motivo registrado** — não
por dificuldade, mas por bloqueio real:

| Família candidata | Situação encontrada | Decisão |
|---|---|---|
| `OriginMetricsClient` (PUB-10) | `docs/CHECKLIST-ENTREGA-LOCAL.md` §PUB-10: componente **descartado por decisão registrada** ("CRUD onde um humano digitaria `total_leads`… seria métrica inventada com cara de relatório"); A/B seguem sem tela | **não promovido** |
| `SeoClient` (PUB-08) | `§PUB-08`: **descartado por decisão registrada** ("permite digitar qualquer URL no sitemap, `robots` livre e 'Marcar verificado' com um clique") | **não promovido** |
| `NotificationPreferencesClient` (PLT-05) | `notification-preferences-api.mjs` exige **apenas `readAdminSession`** (qualquer sessão staff) — mesma classe de bloqueio do `IntegrationsClient`/PLT-03 | **aguarda decisão de RBAC** |
| `PubFaqAssistedClient` (PUB-02/05) | `handleHandoff` GET/POST aceitam **qualquer sessão staff** (`if (!sess)`), embora o PATCH seja admin/ti; expõe sessões de visitantes (dado pessoal) | **aguarda decisão de RBAC + privacidade** |
| `CmsClient` / `PackageClient` / `ThemeClient` | já têm rota real em `/admin/publicacao` (`PublicationClient`) usando os mesmos contratos — promover criaria **segunda tela** do mesmo recurso | **não promovido** |
| `Contract*Client` (10 arquivos) | RBAC granular (`marcelo`/`admin`/`comercial`), mas já cobertos por `/admin/contratos` (`contract-l05-api`) — e o papel não é `ti`/`admin` | **não promovido** |
| **`CliAdvancedClient` (CLI-05/06/07/08)** | `cli-advanced-api.mjs` → `ensureAuth` exige **`requireRole(session,["admin","ti"])`**; nenhuma outra tela consome os nove endpoints v2; a auditoria registra "Componente v2 órfão; falta … UI" (CLI-05) e "Órfão/não provado" (CLI-06..08) | **promovido nesta fatia** |

Isso responde também à pergunta "por que não o próximo da lista": o inventário
não tem ordem, e três dos candidatos mais óbvios estão **bloqueados por decisão
do proprietário ou por autorização de servidor**, não por falta de trabalho.

## 2. Por que esta família — e os limites que ela declara na própria tela

`ensureAuth` (linhas 13–22 de `src/server/cli-advanced-api.mjs`) faz três coisas
antes de qualquer `SELECT`:

1. `requireSession` → **401** sem sessão;
2. `requireRole(session, ["admin","ti"])` **e** `requireRole(session, roles)` →
   **403** para RH e comercial, com o comentário de projeto: *"Sessão de staff não
   comprova vínculo a uma conta cliente. Até existir autorização por escopo em
   cada recurso v2, negar RH/comercial aqui."*;
3. `sameOrigin` → **403** cross-origin.

Ou seja: o papel é decidido no servidor, granular, e o conjunto efetivo é
`admin`/`ti` — exatamente o gate da aba (`AdminGate allowedRoles={['ti','admin']}`).

Três limites ficam **escritos na interface**, não escondidos:

- **não há upload real**: `cli_ticket_attachments` recebe apenas metadados; a tela
  diz que nenhum byte é enviado e que a decisão de armazenamento está pendente;
- **não há escopo por conta (A3)**: a leitura lista registros de **todas** as
  contas; o servidor não prova vínculo e a tela declara isso antes de qualquer
  dado;
- **não há envio ao cliente**: sem SMTP, "enviado" é estado no banco, não entrega.

### 2.1. Relação com `/admin/clientes` (para não alegar novidade indevida)

`/admin/clientes` já tem `TicketsSection`, `VisitsSection` e `ReportsSection`, mas
elas operam nas tabelas **`client_visits` / `client_reports`** pelos contratos
`/api/admin/client-visits` e `/api/admin/client-reports`. Os recursos v2 desta
fatia são **outro conjunto**: `cli_tickets_v2`, `cli_visits`,
`cli_client_reports_v2` e seus históricos (migração 075), até hoje sem nenhuma
tela. Nada foi duplicado e nada do que existe em `/admin/clientes` foi alterado.

### 2.2. Achado do gate: os aliases `/api/hr/cli-*` estão mortos para `ti` (E26)

A primeira execução do cenário de navegador **não foi verde** e não foi por
estética: `ti` recebeu **403** em `/api/hr/cli-tickets-v2`, um endpoint que
`ensureAuth` autoriza explicitamente para `ti`. A causa é a ordem do roteador de
`server.mjs`:

1. a borda legada de RH roda **antes** do despacho dos recursos CLI-05..08
   (`if (!(await authorizeLegacyHrRequest(req, res, url))) return;`) e cobre
   **todo** caminho que comece com `/api/hr/`, `/api/admin/hr/`, `/api/crm/hr/`;
2. essa borda exige a permissão granular `employees.read|write`
   (`authorizeLegacyHrRequest` → `hasPermission`), que `ti` não tem — só os
   aliases `ops-`/`fin-`/`adm-` estão isentos;
3. portanto `/api/hr/cli-*` nega exatamente os papéis (`admin`/`ti`) que o handler
   do recurso autoriza. A tela nasceria **morta para o papel que a hospeda**.

Prova real, na mesma execução do gate (PostgreSQL descartável, sessões por
login de e-mail/senha):

| chamada | sessão `ti` | sessão `rh` | sem sessão |
|---|---|---|---|
| `/api/hr/cli-tickets-v2` (antes) | **403** | 403 | 401 |
| `/api/cli/tickets-v2` (canônico, agora) | **200** | 403 (negado de propósito) | 401 |

Correção desta fatia, mínima e aditiva: a tela passou a usar o **alias canônico
`/api/cli/*`** (o mesmo handler, sem tocar em `server.mjs`). Os aliases
`/api/hr/*` continuam existindo e não foram alterados — a pergunta "isento ou
não o prefixo `cli-` na borda de RH?" fica registrada como **E26 em aberto**
(decisão de servidor, não desta fatia). Um quinto bloco de teste focal impede a
regressão: nenhum endpoint da tela pode voltar para `/api/hr/`.

## 3. O que mudou (aditivo)

- **`src/app/admin/ti/CliAdvancedClient.tsx`** — reescrito. O protótipo tinha hex
  inline, `any`, `fetch` sem checar status, campos sem rótulo, ids digitados à mão
  e um único `<p>` para qualquer falha. Agora:
  - **quatro estados** de leitura (`loading`/`empty`/`error`/`denied`) via
    `UiState`, com retry; mensagens limpas na releitura manual e preservadas no
    reload interno pós-mutação;
  - `records()` valida `Array.isArray` item a item (sem `any`), `sequence`
    descarta resposta fora de ordem (lista **e** detalhe), `aria-busy`,
    `role="status"`/`role="alert"`;
  - **mapa de 30 motivos de erro** do módulo traduzidos (`title_3_200`,
    `reopen_reason_10_1000_required`, `already_paused`, `not_paused`,
    `review_required_before_approve`, `must_be_approved_before_send`,
    `reschedule_reason_10_1000`, `duplicate_storage_key` etc.);
  - `<label>` em todos os campos (componente `Field`), seleção por `<select>` em
    vez de id digitado, datas convertidas para ISO antes do `POST`;
  - drill-down ao registro canônico em JSON de chamado, anexo, visita e
    relatório, mais histórico de estados, pausas de SLA e histórico de
    visita/relatório (lidos por GET);
  - **as nove ações de escrita preservadas**: criar chamado, transicionar estado
    com motivo/reabertura, mensagem, metadado de anexo, pausar/retomar SLA,
    agendar visita, confirmar/reagendar, criar relatório, revisar/aprovar/rejeitar/
    enviar;
  - validação client-side espelhando o banco (título 3–200 / 5–200, descrição
    10–5000, conteúdo 20–10000, motivo ≥10, período fim ≥ início), para o
    operador não receber um 500 de CHECK em vez de uma mensagem.
- **`src/app/admin/ti/CliAdvancedClient.module.css`** (novo) — tokens
  `--ux-color-*`, breakpoints 900/650 px, `:focus-visible`, zero hex.
- **`src/app/admin/ti/TiConsole.tsx`** — **19ª aba** `['cliente','Portal do
  cliente v2']` no grupo **Experiência e comunicação** (era o grupo com menos
  itens: 2).
- **`scripts/ux-pro-03-ti-inventory.mjs`** — 7ª entrada em `PROMOCOES_COM_PROVA`;
  `--check` exige aba montada com `com_prova` **e** este relatório no disco.
- **`tests/ux-pro-03-ti-reaudit.test.mjs`** — `EXPECTED_TABS = 19`.
- **`tests/ux-pro-03-ti-cli-v2-ui.test.mjs`** (novo) — guarda focal no `test:unit`.
- **`tests/ux-portal-workspace.integration.test.mjs`** — cenário novo no gate
  PostgreSQL 17 + Chromium.

**Preservado:** nenhuma migração (001–181 intactas), rota de API, handler, RBAC,
contrato, campo, permissão ou dado foi alterado. Nenhum endpoint v2 foi
despachado de forma diferente. Os 39 órfãos restantes continuam sem rota.

## 4. Os critérios de 02/10 e suas provas

| Critério | Prova |
|---|---|
| Rota real | aba alcançável por teclado em `/admin/ti`, atrás de `AdminGate allowedRoles={['ti','admin']}` |
| Autorização no servidor | `ensureAuth`: `requireRole(session,["admin","ti"])`; **HTTP real** (PostgreSQL descartável): `ti` → **200** e `rh` → **403** nos cinco `GET` do grupo, anônimo → **401**, nos **aliases canônicos `/api/cli/*`** (ver §2.2) |
| Fonte/data-base | cabeçalho nomeia as nove tabelas da migração 075 e mostra a data mais recente de chamado, visita e relatório |
| Drill-down ao registro canônico | `<details>` com JSON integral de chamado, anexo, visita e relatório + históricos |
| Erro de leitura com retry + subteste no gate | `503` → `data-ui-state="error"`; retry → volta à leitura; `403` → `denied` distinto de `error` e de `empty` |
| Alias que não mata o papel dono | 5º bloco focal: a tela só pode usar `/api/cli/*`; RED provado devolvendo dois endpoints para `/api/hr/` (0 esperado → 2 falhas), GREEN 5/5 depois |

## 5. Evidências

| Verificação | Resultado |
|---|---|
| Teste focal `tests/ux-pro-03-ti-cli-v2-ui.test.mjs` | **RED 0/4 → GREEN 4/4** (RED provado restaurando o protótipo do `HEAD`); com o bloco do alias, **5/5** |
| `npm run typecheck` | **0 erro** |
| `npm run build` | **106/106** páginas |
| `npm test` | **1183 asserções: 1181 passam, 2 falham** — exatamente o par do **E22** (`libnspr4.so` ausente: `ux-pro-09e-pu4`, navegador), não regressão desta fatia |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `ux-pro-03-ti-inventory.mjs --check` | **83 componentes, 7 promoções com relatório** |
| `ux-pro-00-inventory.mjs --check` | **101 rotas** |
| `requisitos-222-inventory.mjs --check` | regenerado nesta fatia: **1603 arquivos varridos**, 222 IDs, **21 `a_revalidar` sem gate** (inalterado); CLI-05..08 ganharam `arquivos_codigo` com o componente e `arquivos_gate` com o teste focal |
| `requisitos-sec-reaudit.mjs --check` | **35/35 âncoras** |
| `git diff --check` | limpo |

## 6. Limitações honestas

- **O cenário de navegador roda até onde a sandbox permite.** O gate foi
  executado de verdade (`scripts/qa-ux-portal-postgres.mjs`, cluster descartável
  com as 181 migrações aplicadas): a **metade HTTP passou** — é ela que produziu
  a prova de papel da tabela do §2.2 —, e a metade de navegador **para no
  `launch`** com `libnspr4.so: cannot open shared object file`. Instalar a
  biblioteca também não é possível daqui (`apt-get update` não alcança
  `deb.debian.org`), o que fixa a mesma restrição do **E22** e do relatório da
  CLI-03 UI. Prova pendente: quem rodar `npm run test:ux-portal:pg` numa máquina
  com as libs do Chromium confirma o subteste de larguras/teclado/erro.
- **Sem escopo por conta (A3)**: a leitura v2 é global. O cenário A/B prova que
  o registro de B não aparece antes de existir, mas **não** prova isolamento por
  conta — porque ele não existe neste desenho. Isso está escrito na tela e aqui.
- **Anexo não é upload**: registrar `file_url`/`storage_key` grava metadados
  declarados. A decisão de armazenamento (A1/dono dos bytes) continua pendente
  com o proprietário; a tela não afirma o contrário em nenhum ponto.
- Os quatro IDs **continuam `a_revalidar`** e com `aceite_humano=nao_registrado`:
  a promoção prova superfície, papel, escrita real e erro traduzido — não a
  jornada inteira por papel, nem UAT, nem Windows, nem leitor de tela.
- **Produção segue NO-GO** (10 itens em `docs/PRODUCAO-GATE.md`).

## 7. Próxima fatia

Restam **39 órfãos**. As três decisões que destravam as próximas famílias, e que
**não** podem ser inferidas por agente, são:

1. **RBAC de `notification-preferences-api.mjs`, `pub-faq-assisted-api.mjs`
   (handoff) e `integrations`** — hoje aceitam qualquer sessão staff. Sem uma
   matriz `papel × ação` (a mesma pendência da CLI-02) essas três famílias não
   podem ser promovidas com prova.
2. **Dono dos bytes / armazenamento** (A1) — sem isso, qualquer tela de anexo ou
   download continua sendo metadado declarado.
3. **CLI-02 matriz papel × ação × escopo** — é o que permite tirar os recursos v2
   de `admin`/`ti` e provar isolamento por conta (fecha também a limitação do §6).

Instrumento de estado: `docs/UX-PRO-03-INVENTARIO-TI-2026-10-27.{csv,json}`.
Fila vigente: [`STATUS-VIGENTE.md`](STATUS-VIGENTE.md).
