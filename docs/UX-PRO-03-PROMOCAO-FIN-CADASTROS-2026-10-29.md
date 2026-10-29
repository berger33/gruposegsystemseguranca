# UX-PRO-03 — 8ª aba com prova: FIN cadastros de apoio (fornecedores, centros de custo e histórico de baixa)

**Data:** 29/10/2026 · **Base:** `d83f07e5162058142286524721592c9697fa4d5a` (`main`, merge da PR #303) ·
**Branch:** `arena/4f36e28b-gruposegsystemseguranca` ·
**Natureza:** entrega local com prova estática e HTTP/PostgreSQL. **Não** é aceite humano, homologação
nem autorização de produção (`NO-GO`).

---

## 1. O que foi pedido e o que a auditoria encontrou

O proprietário escolheu a **8ª promoção UX-PRO-03**, família **financeiro** (`FinClient`, `FinAdvancedClient`,
`FinBudgetClient`, `FinManagementClient`). Antes de escrever código, a família foi auditada contra o grafo real
de rotas. O resultado impediu a promoção como ela estava proposta.

### 1.1 Achado A — a família já tem rota real (81% de sobreposição)

`src/app/admin/financeiro/` é rota real (`AdminGate` `financeiro|marcelo|admin|ti`), com **13 workspaces** e
**2.953 linhas**, e exercita **26 dos 32 endpoints** que os quatro protótipos chamam:

| Órfão | Endpoints chamados | Já cobertos por `/admin/financeiro` |
|---|---|---|
| `FinClient.tsx` (FIN-01..04) | suppliers, cost-centers, recurrence-rules, receivables, payables, payments, payment-history, generate-recurring | receivables, payables, payments, recurrence-rules, generate-recurring |
| `FinAdvancedClient.tsx` | bank-statements/transactions, conciliations, collection-policies/reminders, cashflow-snapshots, aging-receivables, cost-imports, costs | **todos os 9** |
| `FinBudgetClient.tsx` | budgets, budget-scenarios, exports, commission-provisions, competence-closures, report-versions | **todos os 6** |
| `FinManagementClient.tsx` | management-results, expenses, fiscal-providers/obligations/documents, payment-gateways, gateway-webhooks/charges | **todos os 8** |

O critério de 02/10 já havia descartado `Cms`/`Package`/`Theme` por "já existir rota real em `/admin/publicacao`".
Aplicado o mesmo critério, montar os quatro no `TiConsole` criaria **duas UIs de escrita concorrentes** sobre
os mesmos dados (baixa, estorno, orçamento, fiscal, gateway) — o oposto de uma mudança aditiva.

**Decisão do proprietário (29/10, explícita):** promover **apenas a lacuna real**. Os quatro `Fin*` continuam
órfãos; nada foi removido, renomeado ou desativado.

### 1.2 O que realmente não existia

| Recurso | Endpoint | Superfície viva antes desta fatia |
|---|---|---|
| Cadastro de fornecedores | `/api/fin/suppliers` (GET/POST) | nenhuma (`/admin/fornecedores` é o portal EXT de fornecedor, outro contrato e outro papel) |
| Cadastro de centros de custo | `/api/fin/cost-centers` (GET/POST) | nenhuma (`ExpenseWorkspace` só digita o UUID do centro de custo) |
| Histórico de baixa (trilha imutável) | `/api/fin/payment-history` (GET) | nenhuma leitura dedicada |

---

## 2. O que mudou

| Arquivo | Mudança |
|---|---|
| `src/app/admin/ti/FinRegistryClient.tsx` (novo) | Aba de cadastros: 4 estados + retry, `records()` sem `any`, guarda de sequência, 24 motivos de erro traduzidos, rótulo em todo campo (`htmlFor` + `aria-describedby`), fonte/data-base, drill-down `<details>` com JSON canônico, limites declarados |
| `src/app/admin/ti/FinRegistryClient.module.css` (novo) | Todo por token `--ux-color-*`, zero hex, `:focus-visible`, dois breakpoints |
| `src/app/admin/ti/TiConsole.tsx` | **19 → 20 abas**: `['financeiro_cadastros','Cadastros financeiros']`, novo grupo de navegação `Financeiro e cadastros`, `dynamic()` + render. Nenhuma aba existente tocada |
| `tests/ux-pro-03-fin-cadastros-ui.test.mjs` (novo) | Teste focal 6/6, incluindo a guarda anti-duplicação (27 endpoints proibidos) |
| `tests/ux-pro-03-ti-reaudit.test.mjs` | `EXPECTED_TABS` **19 → 20**, com o motivo registrado no comentário |
| `tests/ux-portal-workspace.integration.test.mjs` | Cenário de navegador: papel no servidor, POST real medido em status e corpo, histórico real, 503/403 distintos, 390/768/1440 sem transbordo |
| `package.json` | Teste focal entra no `test:unit` |
| `docs/STATUS-VIGENTE.md` | Base `d83f07e5`, #303 mergeada, 20 abas, 84 componentes, 8ª aba |

### 2.1 Contratos preservados

As duas escritas de cadastro que existiam nos protótipos (`POST /api/fin/suppliers`, `POST /api/fin/cost-centers`)
e os campos de cada uma foram **preservados**. O protótipo chamava `/api/hr/fin-*`; a tela usa o **alias canônico
`/api/fin/*`** — ver achado B.

Nada foi removido: nenhuma rota, papel, permissão, campo, aba ou contrato. `/admin/financeiro` continua dono de
todas as escritas financeiras e a nova aba **aponta para ela** na interface e no aviso de limites.

---

## 3. Achados da fatia

| # | Achado | Evidência | Situação |
|---|---|---|---|
| A | Família `Fin*` é duplicata funcional de `/admin/financeiro` (26/32 endpoints, 2.953 linhas vivas) | comparação endpoint a endpoint entre `src/app/admin/financeiro/*.tsx` e `src/app/admin/ti/Fin*.tsx` | **decidido**: órfãos NÃO promovidos; guarda de teste impede que a nova aba chame os 27 endpoints já atendidos |
| B | O protótipo escrevia baixa em `/api/hr/fin-payments`, que responde **410 `legacy_finance_settlement_write_retired`** | sonda PostgreSQL: `POST /api/hr/fin-payments` → **410**; `POST /api/fin/payments` → **201**; o 410 devolve `canonical_endpoint: /api/admin/finance/f03/receivables/:id/settlements` | corrigido na tela: alias canônico |
| C | Os aliases `/api/hr/fin-*` **não** são vítimas do E26: a isenção `legacyOpsAlias = .../(?:ops|fin\|adm)-/` já os retira da borda legada de RH | sonda: `GET /api/hr/fin-suppliers` com `ti` → **200** (contraste com `/api/hr/cli-*` → 403 do E26) | documentado; o comentário do `server.mjs` só cita `ops-` — divergência de comentário, sem efeito funcional |
| D | `GET /api/fin/payment-history` sem `receivable_id`/`payable_id` devolve **400 `missing_id`** | sonda PostgreSQL | traduzido na tela (o operador vê "Escolha uma conta…", não o código cru) |
| E | `POST /api/fin/receivables` com `client_account_id` inexistente devolve **500 `internal`** (violação de FK) em vez de 400/409 | sonda PostgreSQL: `null value`/FK → 500 `internal` | **não corrigido** nesta fatia (rota fora do escopo da aba, que só lê essas contas); registrado como dívida, exige decisão de contrato |
| F | `GET /api/fin/receivables` autoriza `comercial`, mas `GET /api/fin/payment-history` não | sonda: `comercial` → 200 em receivables, **403** em payment-history | declarado como limite: a seleção da conta aparece para papéis que o histórico nega; a tela mostra estado **negado**, não erro nem lista vazia |

---

## 4. Evidências

### 4.1 RED → GREEN focal

```
node --test tests/ux-pro-03-fin-cadastros-ui.test.mjs
  (antes)  # tests 6 · pass 0 · fail 6   ← RED: componente e aba inexistentes
  (depois) # tests 6 · pass 6 · fail 0   ← GREEN
```

A guarda de reauditoria também foi para 20 abas: `tests/ux-pro-03-ti-reaudit.test.mjs` **3/3**.

### 4.2 Sonda HTTP contra PostgreSQL 17 descartável (23/23)

Script temporário (não versionado), cluster `embedded-postgres` + `server.mjs` real + staff sintético:

| Verificação | Resultado |
|---|---|
| `GET /api/fin/suppliers` anônimo / `ti` / `rh` / `financeiro` | 401 / **200** / **403** / 200 |
| `GET /api/fin/cost-centers` `ti` | 200 |
| `GET /api/hr/fin-suppliers` `ti` × `rh` | 200 × 403 (isenção OPS-01, sem E26) |
| `POST /api/fin/suppliers` `ti` · nome curto · origem estrangeira | **201** · 400 `name_3_200` · **403** `origin_forbidden` |
| `POST /api/fin/cost-centers` `ti` · duplicado | **201** · 409 `duplicate_name` |
| `GET /api/fin/payment-history` sem id | 400 `missing_id` |
| `POST /api/fin/receivables` (financeiro) · `POST /api/fin/payments` (canônico) | 201 · **201** |
| `POST /api/hr/fin-payments` (legado) | **410** + `canonical_endpoint` |
| `GET /api/fin/payment-history?receivable_id=…` `ti` | **200**, 2 registros (criação + baixa), motivo da baixa presente |
| `GET /api/fin/payment-history` `comercial` · `GET /api/fin/receivables` `comercial` | 403 · 200 |

### 4.3 Cenário de navegador (roda só no CI — E22 nesta sandbox)

`browser UX-PRO-03: FIN cadastros de apoio` em `tests/ux-portal-workspace.integration.test.mjs`:
papel decidido no servidor (rh 403 × ti 200), teclado na aba em 390/768/1440, duas escritas com
`waitForResponse` medindo **status e corpo** (201 e nome criado), histórico real da conta baixada,
recusa de nome curto traduzida sem segundo "sucesso", 503 com retry sem recarregar e 403 como estado
**negado** (nunca vazio). Localmente validado por `node --check` e pelos gates HTTP/PostgreSQL acima
— nesta sandbox falta `libnspr4.so` (E22), então o Chromium só executa no runner.

### 4.3.1 O gate do CI achou um defeito no próprio teste (corrigido)

Na PR #304 o job *UX portais* executou o cenário com Chromium real e reprovou:

```
locator.waitFor: strict mode violation: getByRole('region', { name: /^Histórico de baixa/ })
  .getByText(/Baixa sintética do gate UX-PRO-03 FIN cadastros/) resolved to 2 elements:
  1) <span> aka getByText('saldo R$ 0,00 → R$ 12.345,00')
  2) <pre class="FinRegistryClient_pre__lzISe">{ "id": ...
```

O motivo da baixa aparece **duas vezes de propósito**: no cartão (texto para o operador) e no JSON canônico
do drill-down. A asserção foi reescrita para escopar o **cartão** (`li` filtrado pelo motivo) e medir o
`→ recebido` nele — mesma lição do gate anterior: escopar por região, não por texto solto. A tela não mudou;
o defeito era do teste.

O job *UX-PRO-10B prévias* (workflow independente, 5 cenários de layout) reprovou no mesmo push com
`server_did_not_start` nos **cinco** subtestes — falha de boot do `server.mjs --dev` após as migrações, sem
erro de compilação (`npm run build` **106/106** e `typecheck` 0 na mesma árvore). Registrado como falha de
infraestrutura do runner, não atribuída a esta fatia.

### 4.4 Gates locais

| Gate | Resultado |
|---|---|
| `npm run typecheck` | **0** |
| `npm test` | **1194** asserções: **1192 passam**, 2 falhas = **E22** (`libnspr4.so`), sem regressão |
| `npm run build` | **106/106** páginas |
| `node scripts/qa-wave0-static.mjs` | **5/5** |
| `node scripts/ux-pro-00-inventory.mjs --check` | OK |
| `node scripts/ux-pro-03-ti-inventory.mjs --check` | OK — **84 componentes, 20 abas, 39 órfãos, 7 promoções** |
| `node scripts/requisitos-222-inventory.mjs --check` | OK — 222 IDs, 21 `a_revalidar` sem gate |
| `node scripts/requisitos-sec-reaudit.mjs --check` | **35/35** âncoras |

---

## 5. Limitações honestas

1. **Os quatro `Fin*` continuam órfãos** (39 → 39). Esta fatia **não** reduz a fila de órfãos: ela entrega a
   lacuna que não tinha tela. Promovê-los exigiria apagar `/admin/financeiro` ou assumir duplicação — decisão
   que não é minha.
2. **É uma aba nova, não uma promoção de órfão.** Por isso o registro `PROMOCOES_COM_PROVA` do inventário
   continua com **7** entradas, enquanto as abas vão a **20** e os componentes a **84**.
3. **O cenário de navegador não rodou nesta sandbox** (E22). A prova local é estática + HTTP/PostgreSQL real.
4. **Achado E** (FK inexistente → 500) segue aberto; a aba não escreve nessas contas, então não há guarda aqui.
5. **Achado F** (papel `comercial` lê a lista e não lê o histórico) gera estado "negado" na seleção; é limite
   do servidor atual, não da tela.
6. **Sem upload, sem provedores**: nenhum byte de documento fiscal é armazenado; não há SMTP, gateway de
   pagamento ou emissor fiscal reais ligados.
7. **Aceite humano: 0/222.** `reauditoria_integral` segue 0/222. **Produção: NO-GO.**
