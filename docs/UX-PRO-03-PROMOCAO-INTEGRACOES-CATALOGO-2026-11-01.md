# UX-PRO-03 — promoção "com prova" de `IntegrationsClient` (PLT-03)

**Data:** 2026-11-01
**Fatia:** 19ª promoção com prova do console de TI (`/admin/ti`)
**Componente promovido:** `src/app/admin/ti/IntegrationsClient.tsx` (76 → 258 linhas) + `integrations-state.ts` (232 linhas) + `IntegrationsClient.module.css` (178 linhas)
**Aba nova:** `integracao_catalogo` — "Integrações: catálogo e teste" (32ª aba)
**Grupo:** Saúde e operação
**Commit:** ver `git log --oneline -1` no ramo `arena/4eede573-gruposegsystemseguranca`

---

## 1. Por que este componente: os 27 órfãos restantes foram medidos

Depois da 18ª promoção sobravam **27 órfãos**. Cada um foi medido pelo que
**faz** — rota chamada, consumidor em `src/app` e tabela que a rota escreve — e
não pelo tamanho. Nenhum deles passou nos dois critérios da casa:

| Grupo | Quantos | Órfãos | Por que não |
|---|---|---|---|
| Borda legada de RH (`authorizeLegacyHrRequest` exige `employees.read`) | 10 | `EmpAdvanced2Client` (11 rotas), `EmpOpsClient` (8), `EmpPortalClient` (7), `EmpSelfClient` (7), `CliClient` (10 `/api/hr/cli-*`), `OpsClient` (13 `/api/hr/ops-*`), `OpsAdvancedClient` (9), `FinAdvancedClient` (9 `/api/hr/fin-*`), `FinClient` (8), `EmpProfileClient` (2) | dado de funcionário; abrir a borda para a tela de T.I. é a decisão que o dono proibiu |
| Segunda superfície viva | 17 | `FinBudgetClient`, `FinManagementClient` (`/admin/financeiro`), `AstClient`, `AstAdvancedClient` (`/admin/patrimonio`), `AdmAdvancedClient` (`/admin/marcelo` escreve as mesmas tabelas por `/api/adm/panel/*`), `PackageClient` (`/admin/publicacao`), `ExtClient` (`/admin/frota`, `/admin/terceiros`, `/admin/satisfacao`, `/admin/qualidade`), `ExtAdvancedClient` (`/admin/analytics`, `/admin/compliance`) e os **9** `Contract*` (`/admin/contratos/[id]`) | o mesmo dado já tem tela; promover criaria duas telas escrevendo a mesma tabela |
| **Sem borda de RH e sem segunda superfície** | **1** | **`IntegrationsClient`** — `/api/admin/integrations` (lista) e `/api/admin/integrations/:id/test`, mais o `PATCH` de identificação | **promovido** |

O único outro consumidor de `/api/admin/integrations` no produto é a aba viva
**"Registros de integração"** (PLT-15), e ela usa **outros** caminhos: `/jobs`,
`/logs`, `/webhooks`, `/webhooks/deliveries` e `/reconciliation`. Catálogo e
registros são dados diferentes — e é justamente essa convivência que produziu o
defeito §2.1.

O arquivo promovido foi **o próprio órfão**: órfãos **28 → 27**.

## 2. Defeitos do servidor — encontrados com sonda e corrigidos com prova

Medidos contra **PostgreSQL 17 real** e `server.mjs --dev` real, com sessões
`ti` e `rh` reais (sonda não versionada `.tmp-probe/probe-plt03.mjs`).

### 2.1 Quatro subcaminhos da aba viva respondiam 405

`routeApi` casa `/api/admin/integrations/:id` (→ `handleUpdate`, que só aceita
PUT/PATCH) **antes** dos caminhos literais de `integration-log-api.mjs`. Como
`jobs`, `logs`, `webhooks` e `reconciliation` são segmentos únicos, todos caíam
no padrão dinâmico:

* medido antes: `GET /api/admin/integrations/jobs` → **405 `method_not_allowed`**
  (idem `logs`, `webhooks`, `reconciliation`); só `/webhooks/deliveries`
  respondia 200, porque tem dois segmentos;
* efeito no produto: **quatro painéis de uma aba já montada estavam mortos** — a
  tela de registros abria com três listas vazias e uma sem dados, sem erro
  visível;
* depois: `INTEGRATION_ROUTE_SUBPATHS` exportado pelo módulo, usado no roteador
  para não capturar esses nomes, e no `handleUpdate` para recusar **400
  `invalid_integration_id`** se alguém tentar criar integração com nome de
  subcaminho. Medido: `jobs`/`logs`/`webhooks`/`reconciliation` → **200**.

### 2.2 `PATCH` em branco e `PATCH` vazio respondiam 200

`String("   ").trim()` virava `""`, o que era falsy, então o `UPDATE` não
acontecia — e a resposta era **200** com o nome antigo. O operador achava que
tinha renomeado.

* medido antes: `PATCH {name:"   "}` → **200** sem mudança; `PATCH {}` → **200**;
* depois: **400 `invalid_name`** e **400 `no_fields`**; o `id` também ganhou
  validação (`invalid_integration_id` para vazio, >100 ou reservado);
* a tela repete a validação antes do `PATCH` (o botão fica desabilitado com nome
  em branco), provado no gate.

### 2.3 `rh` testava conexão e renomeava integração

As três rotas só exigiam sessão de equipe. PLT-03 é plataforma: o `rh` disparava
teste de conexão SMTP e **criava integração nova**.

* medido antes: `rh` → **200** em `POST /smtp/test`, **200** em `PATCH {name}` e
  **200** criando `qa-rh` com `provider=sms`;
* depois: **403 `role_required`** com `allowed:["admin","ti"]` nas duas rotas de
  escrita; a **leitura continua aberta a qualquer sessão staff** (o `rh` recebe
  200 na lista), porque o catálogo não é dado de funcionário e a aba viva de
  registros é lida por staff.

## 3. Defeitos do protótipo (todos travados pelo teste focal e pelo gate)

| # | No protótipo | Efeito | Agora |
|---|---|---|---|
| 1 | `alert()` no resultado do teste | nada ficava na tela, nada era lido por leitor de tela, e o operador perdia o registro da própria ação | `plt03-ok`/`plt03-erro` com `role="status"`/`role="alert"` e `aria-live`; o texto do servidor é o texto da tela |
| 2 | `"Nenhuma integração (ou sem permissão)"` | negação e vazio no mesmo texto — exatamente o que esta casa proíbe | `classificarLista` com cinco situações; 403 vira `data-situacao="negado"` com "não é um catálogo vazio"; o gate injeta 403 e mede |
| 3 | `JSON.stringify(config_sanitized)` no cartão | ilegível em 320px e propenso a vazar o que o servidor marcou como segredo | `mascararConfig`: par chave/valor ordenado, `[redacted]` preservado, corte em 120 caracteres |
| 4 | nunca usava `?provider=` nem `?status=` | sete cartões para achar um; o servidor já filtrava desde sempre | dois `select` com os enums do servidor; validação local antes do `fetch`; filtro sem resultado é "vazio" declarado |
| 5 | o `PATCH` de identificação existia no servidor e não na tela | integração criada com nome vindo do `id` ficava assim para sempre | campo "Nome da integração" por cartão, com validação antes do pedido |
| 6 | não dizia onde ficam os registros | duas telas de "integração" sem fronteira — a receita da duplicação | rodapé declara que jobs/logs/webhooks/entregas/reconciliação moram na aba PLT-15; o teste focal **proíbe** a tela de chamar esses caminhos |
| 7 | `any` em todo lugar, `style={{…}}` em cada elemento | sem tipos, sem contrato visual | módulo puro tipado, classes por tokens, foco visível, breakpoint em 740px |

## 4. Contrato da tela (`src/app/admin/ti/integrations-state.ts`, 232 linhas)

| Export | Contrato |
|---|---|
| `PROVEDORES` / `SITUACOES_INTEGRACAO` | espelho **literal** de `ALLOWED_PROVIDERS` e `ALLOWED_STATUS` do módulo do servidor (o teste focal compara os dois `Set`) |
| `classificarLista(status, corpo)` | `ok / vazio / negado / falha / invalido`; 401/403 nunca viram lista vazia |
| `validarFiltros` / `queryDoFiltro` | só manda `provider`/`status` que o servidor aceita; filtro inválido não gera pedido |
| `filtrarIntegracoes` | espelho local do `WHERE` do servidor |
| `validarNome` | 1..100 depois do `trim` — o caso que o servidor aceitava em branco |
| `mascararConfig` | pares ordenados, `[redacted]` preservado, corte em 120 |
| `formatarQuando` | `—` para nulo/inválido; pt-BR para ISO (sem `Invalid Date`) |
| `resumo` | total, configuradas, em falha, não configuradas |
| `descreverTeste` | HTTP 200 **não** é "configurado": a situação é a do registro devolvido; erro do servidor vem traduzido |
| `podeEscrever` | `admin`/`ti`; a tela desabilita as ações e explica o papel |
| `ERROS` | **16** códigos, todos os que o módulo do servidor devolve |

## 5. Prova

### 5.1 Teste focal — `tests/ux-pro-03-ti-integrations-catalogo-ui.test.mjs` (14 testes)

**14/14** verde. Quatro mutações medidas (cada uma derruba ≥1 teste, arquivo
restaurado depois):

| Mutação | Resultado |
|---|---|
| roteador sem a guarda de subcaminho reservado | **13/14** |
| escrita liberada para qualquer papel | **13/14** |
| 403 classificado como `vazio` | **13/14** |
| teste 200 apresentado como "configurada" | **13/14** |

### 5.2 Gate de navegador — `PLT-03` (PostgreSQL 17 + Chromium real)

`UX_PORTAL_TEST_PATTERN="PLT-03" npm run test:ux-portal:pg` → `ok 1`,
`# pass 1`, `# fail 0`, `UX_PORTAL_TEST_EXIT: 0` (~50 s).

| Verificação | Resultado medido |
|---|---|
| leitura anônima | **401** |
| `ti` lê o catálogo | **200** com os sete padrões (smtp, whatsapp, payment, nfe, llm, calendar, storage) |
| `rh` lê o catálogo | **200** (a escrita é que restringe) |
| `rh` testa conexão / renomeia | **403 `role_required`** nos dois |
| filtros do servidor | `?provider=smtp` → só SMTP; `naoexiste` → **400 `invalid_provider`**; `status=quebrado` → **400 `invalid_status`** |
| teste SMTP real | **200** com `status=not_configured` e motivo escrito ("SMTP não configurado (MAIL_HOST/MAIL_FROM ausentes)"); erro **sem** credencial |
| teste de id inexistente | **404** |
| `PATCH` nome em branco / sem campos / provedor torto | **400 `invalid_name`** / **400 `no_fields`** / **400 `invalid_provider`** |
| `PATCH` renomeio | **200** e o banco confirma o nome do operador |
| `PATCH` criação com provedor válido | **200** com `provider=webhook` |
| subcaminhos da aba viva | `jobs`, `logs`, `webhooks`, `reconciliation` → **200** (eram **405**) |
| 320 / 390 / 1440 e 1440 à noite | `sobraDocumentoPx: 0` nos quatro retratos |
| filtro pela tela | 1 cartão para `smtp`; `failure` sem resultado mostra **vazio declarado**; "Limpar filtros" volta o catálogo inteiro |
| teste pela tela | `plt03-ok` com o texto do servidor e `last_check_at` gravado no banco |
| renomeio pela tela | nome em branco trava o botão; nome digitado é o que vai ao banco |
| negação injetada (403 na lista) | `data-situacao="negado"`, "não é um catálogo vazio", zero cartões e **sem** `plt03-vazio` |
| `rh` no console | `data-admin-gate="forbidden"`, nenhum `plt03` montado |

Evidências: `docs/ux-pro-03-integracacoes-catalogo-evidencias/` — **9 PNGs** +
`resumo.json` com 9 entradas, `problems: []` e `sobraDocumentoPx: 0` em todas.

### 5.3 Suíte e guardas estáticas

* `npm test`: contagem declarada em `docs/STATUS-VIGENTE.md` (linha `| Testes |`);
* `npx tsc --noEmit`: limpo; `npm run build`: limpo;
* inventário TI: **32 abas com prova**, **19 promoções**, órfãos **27**,
  `promovidosSemSairDaClassificacao: 0`, `semDispatch: 0`;
* gate completo do portal: cenários declarados em `docs/STATUS-VIGENTE.md`.

## 6. Limites declarados (não são promessas)

* **Só o SMTP tem teste que abre conexão** (`transporter.verify()`, sem enviar
  mensagem). WhatsApp, pagamento, NF-e, IA, agenda, armazenamento, SMS, push e
  webhook respondem "não configurado" **sem chamada externa** — não há
  credencial neste ambiente e nada foi simulado.
* **Segredos nunca chegam ao navegador**: o servidor manda `config_sanitized`
  com `[redacted]`; a tela só formata.
* O status é o do servidor: a tela **não** deriva "configurado" de HTTP 200.
* Jobs, logs, webhooks, entregas e reconciliação **continuam** na aba
  "Registros de integração" (PLT-15); esta tela não os duplica nem os substitui.
* Sem leitor de tela e sem Windows: teclado, foco e contraste medidos só no
  Chromium empacotado.
* **Sem aceite humano, sem homologação, sem UAT.** O retrato do inventário 222
  vai a **23/122/77**: PLT-03 passa a ser citado em documento/gate, o que **não**
  é aceite de requisito.
* **Produção: NO-GO. Aceite humano: 0/222.**
