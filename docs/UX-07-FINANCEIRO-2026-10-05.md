# UX-07 (fatia B) — Financeiro

Data: 2026-10-05 · Branch `arena/daead24f-gruposegsystemseguranca`
Base: `main` em `139372082c7fa2d7ef9d7feae53e866d46a79b86` (commit de partida
desta sessão; UX-07 fatia A — Operação, PR #158).

Esta é a **fatia B** de UX-07 — a família **Financeiro** apenas
(`/admin/financeiro`). As demais famílias do roteiro de UX-07 (contratos,
compliance, patrimônio, frota, terceiros, qualidade, apoio emergencial,
licitações, fornecedores, satisfação, conhecimento, carteira, pedidos do site,
inteligência comercial, expansão, analytics, relatórios periódicos, painel do
Marcelo, continuidade) e as etapas UX-08/UX-09 **não foram iniciadas** nesta
sessão; ficam para sessões seguintes, por decisão explícita de escopo.

Telas tratadas:

| Rota | Natureza | Autorização |
| --- | --- | --- |
| `/admin/financeiro` — abas **Contas a receber**, **Recorrência**, **Pagamentos e baixas**, **Relatório de baixas (F03)** (`FinanceiroWorkspace.tsx`) | **Produto.** Painel próprio da fatia, reescrito por completo. | `AdminGate` (`financeiro`, `marcelo`, `admin`, `ti`); leitura exige sessão de staff; escrita é decidida em `src/server/fin-api.mjs`, `f03-finance-api.mjs`, `fin-budget-api.mjs` e `fin-management-api.mjs` — nunca pela interface. |
| Abas **Conciliação (FIN-05)**, **Cobrança (FIN-06)**, **Fluxo de caixa (FIN-07)**, **Custos (FIN-08)**, **Resultados (FIN-09)**, **Despesas (FIN-10)**, **Fiscal (FIN-11)**, **Gateway (FIN-12)**, **Orçamento (FIN-13)**, **Exportações (FIN-14)**, **Fechamentos (FIN-15)**, **Comissões (FIN-16)** | **Protótipos legados**, com correção pontual nesta fatia (seção 4). | Mesmo `AdminGate`; leitura e escrita decididas em `fin-advanced-api.mjs`, `fin-budget-api.mjs`, `fin-management-api.mjs` e `commission-api.mjs`. |

A distinção acima é explícita e **não foi apagada**: as doze áreas legadas não
foram promovidas a "pronto" por cosmética. Ver seção 6.

## 1. O que esta fatia mudou e o que NÃO mudou

Fatia de **apresentação, vocabulário e acessibilidade**, com uma correção
pontual e documentada nas áreas legadas (seção 4). Nenhuma rota de API, nenhum
método, corpo, cabeçalho, nenhuma regra de alçada, idempotência, conciliação,
baixa, estorno, margem, fechamento ou comissão foi alterada. O banco continua
em **001–174**; nenhuma migração nova foi criada.

| Não mudou | Onde continua sendo decidido |
| --- | --- |
| Quem lê e quem escreve em cada endpoint financeiro | `fin-api.mjs`, `fin-advanced-api.mjs`, `fin-budget-api.mjs`, `fin-management-api.mjs`, `f03-finance-api.mjs`, `commission-api.mjs` |
| Situação da conta (`pendente`/`parcial`/`pago`/`vencido`/`cancelado`) | calculada no banco a partir das baixas; a tela só exibe |
| Alçada de despesa, segregação solicitante ≠ decisor | `fin-advanced-api.mjs` (FIN-10) |
| Separação criação × aprovação de regra, política e orçamento | servidores; a tela nunca gera cobrança de regra não aprovada |
| Assinatura de webhook, recusa de replay, conciliação explícita | `fin-advanced-api.mjs` (FIN-12); a interface apenas simula o emissor |
| Margem de resultado gerencial calculada no servidor | `fin-management-api.mjs` (FIN-09) — base incompleta continua sendo um estado próprio, nunca `0,00%` |
| Idempotência (`duplicate_*`, `already_generated`, `Idempotency-Key`) | `UNIQUE` no banco + checagem prévia no servidor |
| Auditoria fail-closed (`audit_unavailable`) | servidor; continua sendo um estado próprio, nunca convertido em "zero" |

## 2. O diagnóstico honesto da tela anterior

| Defeito observado | Consequência |
| --- | --- |
| `FinanceiroWorkspace.tsx` e as doze áreas somavam **39 `style={{...}}`** inline e nenhuma classe compartilhada. | Inconsistência visual com o restante do admin; nada reaproveitável. |
| Dezesseis `<button>` de aba dentro de um `<nav>`, sem `role="tablist"`/`role="tab"`/`tabindex` coordenado. | ARIA inválido; leitor de tela não anunciava "aba N de 16"; sem navegação por ←/→/Home/End. |
| Todos os treze helpers `api()` faziam `throw new Error(data.error || \`Erro ${status}\`)`, e o `catch` exibia esse texto. | A pessoa que opera o financeiro via **o código cru do servidor em inglês** na tela: `already_generated`, `overpayment`, `webhook_signature_invalid`, `approval_authority_exceeded`, `read_only`, `audit_unavailable` — 319 códigos possíveis. |
| Nenhum `UiState`: leitura em curso, lista vazia, falha e recusa usavam marcação ad hoc, cada área de um jeito. | Quatro significados diferentes com a mesma aparência. |
| Situações eram impressas com o valor cru do banco (`parcial`, `conciliado_divergente`, `lembrete_enviado`, `nao_configurado`, `provisionada`...). | Jargão de coluna de banco exposto a quem opera. |

**O que já estava correto e foi preservado:** nenhuma das áreas financeiras
engolia falha de leitura como lista vazia (defeito-raiz encontrado em UX-06 e
na fatia A). Todas já exibiam um estado de erro — o defeito aqui era a
**mensagem**, não o silêncio. Isto está registrado para não inflar o que esta
fatia corrigiu.

## 3. O que foi entregue

1. **`src/lib/finance-vocabulary.mjs` (+ `.d.mts`)** — tradução dos **319
   códigos** de erro que `fin-api.mjs`, `fin-advanced-api.mjs`,
   `fin-budget-api.mjs`, `fin-management-api.mjs`, `f03-finance-api.mjs` e
   `commission-api.mjs` podem devolver (incluindo os montados por ternário, por
   `new HttpError()`/`new E()` e os seis montados por template literal
   `invalid_${campo}`). O código continua canônico; valor desconhecido **passa
   cru**, nunca inventado.
   `describeFinanceError(code, status) -> { kind, title, detail, status, canRetry, code }`,
   `financeErrorVariant`, `financeErrorFootnote` e `financeErrorMessage`
   (código canônico só entre parênteses, nunca como frase principal). Além
   disso, **vinte pares `label`/`tone`** para os ENUMs das migrações 077–080
   (situação de conta, aprovação, conciliação, cobrança, aging, fluxo, resultado
   gerencial, despesa, provedor/obrigação/documento fiscal, gateway, webhook,
   cobrança de gateway, cenário de orçamento, exportação, fechamento, comissão)
   e `money()`, que devolve **"Dado ausente"** para valor ausente — nunca
   `R$ 0,00`.
2. **`src/lib/finance-request.ts`** — `financeRequest()` devolvendo resultado
   discriminado (`{ ok: true, status, data }` ou `{ ok: false, status, error }`)
   com o descritor já classificado; falha de rede vira `status: 0` e um estado
   próprio, em vez de exceção solta.
3. **`src/app/admin/financeiro/FinanceiroWorkspace.tsx`** — reescrito: zero
   `style` inline; `tablist/tab/tabpanel` real com roving tabindex e
   ←/→/Home/End sobre as 16 abas; `UiState` em cada grupo de leitura
   independente (carregando / vazio / falha com código canônico e opção de
   repetir); `UiBadge` com `srPrefix` em toda situação exibida; valores sempre
   por `money()`. As áreas legadas continuam montadas dentro de
   `<div className={styles.legacy}>` — ver seção 4 e seção 6.
4. **Correção pontual nas doze áreas legadas** — seção 4.
5. **`src/components/ui/UiWorkspace.module.css`** — dezesseis utilitários de
   layout generalizados a partir dos 39 `style` inline desta fatia
   (`.stack`, `.stackTight`, `.stackWide`, `.rowWrap`, `.grow`, `.twoColumns`,
   `.padded`, `.spacedTop`, `.spacedTopWide`, `.spacedBelow`, `.dividedTop`,
   `.dividedItem`, `.metaLine`, `.metaBlock`, `.scrollList`). Só posicionam;
   nenhuma altera dado, permissão ou API.

## 4. Correção pontual nas áreas legadas (não é reescrita)

As doze áreas FIN-05..FIN-16 tinham, cada uma, o padrão:

```js
if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
```

O `catch` do chamador exibia esse texto — ou seja, o **código cru do servidor**
("`already_generated`", "`approval_authority_exceeded`") aparecia na tela.

A correção, mínima e sem tocar URL, método ou payload algum: o `throw` passou a
usar `financeErrorMessage(code, status)`, que devolve a frase em português com
o código canônico entre parênteses. As demais linhas de cada arquivo ficaram
intactas.

Duas exceções, ambas deliberadas e documentadas:

- **`GatewayWorkspace.tsx` (FIN-12)** decide o texto de recusa comparando o
  código (`webhook_signature_invalid`, `replay_detected`). Traduzir a mensagem
  sem preservar o código quebraria essa decisão — e quebrou, na primeira
  execução do gate herdado. A correção foi introduzir `FinanceApiError`, que
  carrega frase **e** código, e passar a comparar `error.code`. O
  comportamento visível é idêntico ao anterior.
- **`ExpenseWorkspace.tsx` (FIN-10)** descartava o status real da leitura
  (`Promise.reject(new Error("expenses"))`). Agora preserva código e status
  reais do servidor na falha de leitura; o estado de erro continua existindo,
  só deixou de ser genérico.

**O que não foi tocado nestas doze áreas** (pendência explícita, não dívida
escondida): campos sem `<label>` associado, ausência de `UiState`/`UiBadge`,
tabelas sem cabeçalho de escopo e a organização geral de cada formulário.
Reescrevê-las é trabalho de fatia própria, fora do escopo desta sessão.

## 5. Validação executada

Ambiente: Linux, Node 22, PostgreSQL **embutido e descartável**
(`embedded-postgres`), Chromium `@sparticuz/chromium` em `--single-process`.
Nenhum banco do operador foi tocado; o gate recusa rodar com `DATABASE_URL`,
`DATABASE_MIGRATION_URL` ou `RUN_DATABASE_INTEGRATION_REMOTE` definidos.

| Verificação | Natureza | Resultado |
| --- | --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | estática | exit 0 |
| `node --test tests/ux-finance-vocabulary.test.mjs` | estática (anti-deriva: lê os seis arquivos de API e falha se a interface traduzir código inexistente ou deixar código sem frase) | **10/10** |
| `npm run test:ux-finance:pg` | HTTP real + PostgreSQL real + Chromium | **8/8**, exit 0 |
| `npm run test:unit` (inclui o teste novo) | estática | ver seção 5.2 |
| `npm run test:l07-delivery:pg` (gate herdado da família) | HTTP real + PostgreSQL real + Chromium | **43/43** após o reparo da seção 5.1 |
| Aceite humano | — | **PENDENTE.** Marcelo e Andreia não participaram e não foram solicitados. Nada aqui é homologação. |

O que o gate `test:ux-finance:pg` prova, teste a teste:

1. As rotas financeiras continuam exigindo sessão (401 sem cookie, sem vazar
   campo algum na negativa).
2. **"Menu não é autorização"**: o papel `ti` abre `/admin/financeiro` (está em
   `allowedRoles` do `AdminGate`) e, mesmo assim, uma escrita continua sendo
   recusada com `403 read_only` pelo próprio servidor — enquanto o papel
   `financeiro` segue autorizado (`201`). A tela nunca finge uma permissão que
   o servidor nega, nem remove uma que ele concede.
3. Massa fictícia criada pelas próprias APIs financeiras (conta, contrato,
   recebível, baixa parcial via F03) confirma que a situação `parcial` e o
   valor baixado são calculados pelo banco, nunca pela tela.
4. **Falha de leitura não vira lista vazia**: simulando um 503
   (`audit_unavailable`) em `/api/fin/payments`, a tela mostra
   `data-ui-state="error"` com o código canônico disponível e oferece repetir;
   as abas de trabalho e a tabela não aparecem sem leitura completa.
5. As dezesseis abas são um `tablist` de verdade: roving tabindex (1 com
   `tabindex=0`, 15 com `-1`), ←/→ movendo foco e seleção juntos, Home/End indo
   para a primeira/última, só o painel ativo montado.
6. A situação da conta aparece como **"Baixa parcial"** (tom `info`, com
   prefixo para leitor de tela) e o valor como **R$ 1.000,00** — não `parcial`
   nem `100000`.
7. **A correção da seção 4 funciona de ponta a ponta**: simulando um 500
   (`internal`) em `/api/fin/exports`, a aba Exportações mostra a frase em
   português com `(internal)` no rodapé, em vez do antigo "Erro 500".
8. 390×844 sem transbordo horizontal; alvos de toque das abas ≥ 32px.

A falha é injetada **apenas em `window.fetch`, dentro da página**
(`addInitScript`): o servidor nunca é enfraquecido para o teste passar.

### 5.1 Reparo do gate herdado `tests/l07-delivery.integration.test.mjs`

Duas asserções da jornada FIN-01..04 no navegador esperavam o texto cru
`'status parcial'` e `'status pendente'` no corpo da página — exatamente o
jargão de banco que esta fatia eliminou. Reparadas, **não enfraquecidas**:
passaram a casar `/Situação da conta:\s*Baixa parcial/i` e
`/Situação da conta:\s*Pendente/i`, mantendo intactas as asserções de valor
(`R$ 40,00` e `R$ 0,00`) que acompanham cada uma. A cobertura é a mesma: a
transição de situação visível na tela **e** o valor baixado em reais.

Uma terceira asserção (`includes('aprovada')`, após aprovar a regra de
recorrência) foi preservada sem tocar no teste: o rótulo da interface é
"Regra aprovada", que contém a mesma palavra.

Observação sobre `money()`: `Intl.NumberFormat('pt-BR', { currency: 'BRL' })`
separa `R$` do número com **U+00A0** (espaço rígido). Como várias asserções
herdadas buscam literalmente `'R$ 120,00'` e `'R$ 40,00'`, `money()` normaliza
esse caractere para espaço comum. É a interface se adequando ao contrato de
teste existente, não o contrário.

### 5.2 Execuções registradas

As execuções completas estão nos logs desta sessão. A primeira rodada do gate
herdado falhou **1 de 43** (FIN-12 Chromium), pela comparação por mensagem
descrita na seção 4; após a introdução de `FinanceApiError`, a rodada seguinte
passou integralmente.

### 5.3 Correção posterior: o levantamento de códigos estava incompleto

Registrado depois da abertura da PR #159, na fatia C (Contratos) da mesma
sessão, e corrigido no **mesmo PR** em commit próprio. Fica escrito aqui em vez
de consertado em silêncio.

O extrator usado para levantar os códigos de erro do financeiro casava apenas
`{ error: '...' }` literal e `new HttpError(..., '...')`, e **ignorava os
wrappers locais** que cada servidor define:

```js
const bad = (res, msg) => json(res, 400, { error: msg });
const unavailable = (res, msg) => json(res, 503, { error: msg });
```

Por isso a seção 3 falava em **319 códigos**: o número real é **342**. Faltavam
**23 traduções** — `invalid_name`, `invalid_title`, `invalid_percent`,
`invalid_base_type`, `invalid_base_value`, `invalid_cancel_rule`,
`invalid_period_type`, `invalid_period_start`, `invalid_period_end`,
`invalid_period_range`, `invalid_goal_id`, `invalid_company_id`,
`invalid_opportunity_id`, `invalid_responsible_id`, `invalid_target_type`,
`invalid_target_value`, `no_fields`, `above_rule_maximum`,
`below_rule_minimum`, `approve_in_separate_request`, `cancel_reason_required`,
`payment_evidence_note_required` e `payment_status_conflict`. Esses códigos
chegariam crus à tela — exatamente o defeito que a fatia se propôs a corrigir.

Pior do que o número: `tests/ux-finance-vocabulary.test.mjs` afirmava cobertura
total porque media a coisa errada, com um limiar (`> 300`) baixo demais para
expor o buraco.

Correção aplicada:

- extrator do teste passou a casar `\b(?:bad|unavailable)\(\s*res\s*,\s*'código'`;
- limiares subidos de `> 300` para `> 340`;
- as 23 traduções acrescentadas a `src/lib/finance-vocabulary.mjs` (agora
  **342 códigos, zero duplicado**);
- `node --test tests/ux-finance-vocabulary.test.mjs` → **10/10** depois da
  correção.

Nenhum comportamento de servidor foi alterado: a correção só amplia o que a
interface sabe traduzir. O detalhamento do método e o procedimento para as
próximas fatias estão na seção 4 de `docs/UX-07-CONTRATOS-2026-10-05.md`.

## 6. O que NÃO foi feito (pendências declaradas)

1. **As doze áreas FIN-05..FIN-16 não foram reescritas.** Receberam apenas a
   correção pontual da seção 4 e a substituição dos `style` inline por classes
   do módulo compartilhado. Continuam sem `UiState`/`UiBadge`, com campos sem
   `<label>` associado. É dívida explícita, não escondida.
2. **Demais famílias de UX-07** não foram iniciadas nesta sessão.
3. **UX-08** (console de TI/RAG, mensagens públicas, polimento global) e
   **UX-09** (auditoria cruzada e aceite) não foram iniciadas.
4. **Aceite humano**: pendente, por decisão explícita. Marcelo e Andreia não
   participaram desta sessão e não foram solicitados.
5. **Evidência visual** (`npm run ux:evidence -- --stage=ux-07-financeiro`)
   cobre apenas `/admin/financeiro` como papel `financeiro`, em 1440×900 e
   390×844. **Não cobre** os demais papéis do `AdminGate` (`marcelo`, `admin`,
   `ti`) nem viewports intermediários — cobertura parcial declarada.
6. **Nenhuma migração nova.** Nada nesta fatia exigiu mudança de banco, e
   mudança de banco por UX continua proibida.

## 7. Arquivos

Novos:

- `src/lib/finance-vocabulary.mjs`, `src/lib/finance-vocabulary.d.mts`
- `src/lib/finance-request.ts`
- `tests/ux-finance-vocabulary.test.mjs`
- `tests/ux-finance-workspace.integration.test.mjs`
- `scripts/qa-ux-finance-postgres.mjs`
- `.github/workflows/ux-finance-delivery.yml`
- `docs/UX-07-FINANCEIRO-2026-10-05.md` (este arquivo)

Alterados:

- `src/app/admin/financeiro/FinanceiroWorkspace.tsx` (reescrito)
- As doze áreas legadas `src/app/admin/financeiro/*Workspace.tsx` (correção
  pontual + classes no lugar de `style` inline)
- `src/components/ui/UiWorkspace.module.css` (utilitários de layout)
- `scripts/ux-evidence-capture.mjs` (etapa `ux-07-financeiro`)
- `tests/l07-delivery.integration.test.mjs` (reparo da seção 5.1)
- `package.json` (`test:ux-finance:pg`; teste de vocabulário no `test:unit`)
- `tsconfig.json` (tipos de `.next/integration-ux-finance`)
