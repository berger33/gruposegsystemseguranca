# UX-07B — Família financeira: falha não vira zero, e as abas passam a existir

Data: 2026-10-05 · Branch `arena/59c7190d-gruposegsystemseguranca`
Base: `main` em `a6b5c06` (UX-06, PR #156); esta fatia segue o commit `c827f3d`
(UX-07A, operação). Migrações continuam **001–174**: nenhuma criada, nenhuma
alterada.

Fatia **B** da UX-07. Uma família por PR, sem reescrita de lógica, com teste
focal de regressão.

| Rota | Natureza | Autorização (inalterada) |
| --- | --- | --- |
| `/admin/financeiro` | **Produto.** Superfície canônica do financeiro (L07). | `AdminGate allowedRoles={['financeiro','marcelo','admin','ti']}` + sessão exigida em `fin-api.mjs`, `fin-advanced-api.mjs`, `fin-budget-api.mjs` e `f03-finance-api.mjs` (`401 unauthorized`); concessão por rota (`403 forbidden`). |

Telas tratadas: `FinanceiroWorkspace.tsx` (raiz, 16 abas), `BudgetWorkspace.tsx`
(418 l.) e `BankReconciliationWorkspace.tsx` (276 l.).

## 1. O que mudou e o que NÃO mudou

Fatia de **apresentação, vocabulário e acessibilidade**. Nenhuma rota, método,
corpo, `Idempotency-Key`, regra de sessão, escopo, `AdminGate` ou migração foi
tocado.

| Não mudou | Onde continua sendo decidido |
| --- | --- |
| Quem abre a tela | `src/app/admin/financeiro/page.tsx` (`AdminGate`) |
| Quem lê cada rota financeira | `ensureAuth(req, res, [...])` em `fin-api.mjs` e `checkAuth` em `fin-budget-api.mjs` |
| Baixa, estorno e idempotência | servidor (`Idempotency-Key`, `already_generated`, `estorno_*`) |
| Imutabilidade do histórico | `history_immutable`, no servidor |
| Orçamento aprovado só muda por revisão | `approved_budget_locked_requires_revision` |
| Auditoria fail-closed | `audit_unavailable`: sem trilha, nenhum lançamento é gravado |
| O sistema não paga automaticamente | `auto_paid_forbidden_nao_pagar_automaticamente` |

**Achado de permissão registrado, não alterado:** `handleReceivables` concede
leitura de recebíveis ao papel `comercial` (`['admin','ti','financeiro','comercial']`).
O gate documenta essa concessão real **e** prova que ela não se estende a
`/api/fin/payments`, `/api/fin/suppliers` nem `/api/fin/budgets`, que seguem
`403 forbidden` para esse papel. Nenhum acesso foi ampliado nem reduzido.

## 2. Diagnóstico das telas anteriores

| Defeito observado | Consequência |
| --- | --- |
| `if(!response.ok) throw new Error(data.error \|\| 'Erro ' + status)` nas três telas. | O status HTTP era descartado; 403 (sem concessão) e 503 (indisponível) viravam a mesma frase, com o código cru na tela. |
| `catch(e) { setError(e instanceof Error ? e.message : 'Falha inesperada') }`. | O operador financeiro lia `finance_flow_unavailable` em vez de uma instrução. |
| Tabela de recebíveis com `Nenhum recebível encontrado.` renderizado independentemente de a leitura ter ocorrido. | **Em dinheiro, a afirmação mais cara possível:** falha de leitura aparecia como ausência de cobrança. |
| `money()` local devolvia "Dado ausente" só para `null`. | Valor inválido virava `R$ NaN`. |
| 16 botões com `aria-selected` dentro de um `<nav>`, **sem** `role="tab"`, sem `tabpanel`, sem teclado. | ARIA inválido; leitor de tela não anunciava aba; setas não navegavam. |

## 3. O que foi entregue

1. **`src/lib/fin-vocabulary.mjs` (+ `.d.mts`)** — tradução dos **183 códigos**
   da união de `fin-api.mjs`, `fin-advanced-api.mjs`, `fin-budget-api.mjs` e
   `f03-finance-api.mjs`. Nem um a mais, nem um a menos (o teste de deriva
   falha nos dois sentidos). `describeFinError(code, status)`,
   `finErrorVariant`, `finErrorFootnote` — código canônico **só entre
   parênteses, no rodapé**. Rótulos de situação de conta, conciliação e
   orçamento vêm dos enums reais do banco (`fin_status`,
   `fin_conciliation_status`, `fin_budget_status`); valor desconhecido passa
   cru.
2. **`moneyLabel`** — valor ausente ou não numérico é **"Dado ausente"**;
   `0` continua sendo `R$ 0,00`. Falha nunca é formatada como saldo.
3. **`FinanceiroWorkspace.tsx`** — `api()` preserva código + status e separa
   falha de rede; `error` passou a ser descritor tipado; `UiState` em
   carregando / falha / negado / sucesso; a tabela de recebíveis só afirma
   "nenhum recebível" **depois** de uma leitura bem-sucedida (antes disso diz
   *"Recebíveis ainda não lidos — nada aqui representa saldo"*); abas
   `tablist/tab/tabpanel` com roving tabindex e ←/→/Home/End, dirigidas por
   `FINANCE_TABS`. **Todos os 14 `data-testid` foram preservados** (conjunto
   comparado por diff antes e depois).
4. **`BudgetWorkspace.tsx`** e **`BankReconciliationWorkspace.tsx`** — mesmo
   vocabulário, `UiState` dentro dos `data-testid` já existentes
   (`fin13-budgets-error`, `fin13-scenarios-error`, `fin13-history-error`,
   `fin05-error`), vazios declarando leitura concluída e rótulo de situação de
   conciliação com o valor canônico entre parênteses.
5. **Teste de deriva** `tests/ux-fin-vocabulary.test.mjs` (17 casos).
6. **Gate por domínio**: `scripts/qa-ux-fin-postgres.mjs` +
   `tests/ux-fin-workspace.integration.test.mjs` (7 casos) +
   `.github/workflows/ux-fin-delivery.yml`.

### Compatibilidade com os gates já existentes
O gate L07 verifica, no navegador, que o erro de geração duplicada contém
`already_generated` e que a conta mostra `status parcial`. Ambos continuam
verdadeiros **sem enfraquecer nada**: o código canônico aparece no rodapé
(`(already_generated)`) e a situação é exibida como
`situação Parcialmente baixada (status parcial)` — rótulo humano **mais** valor
canônico, exatamente o padrão do projeto.

## 4. Verificação executada nesta sessão (local, Node 22, Linux)

| Comando | Resultado | Natureza |
| --- | --- | --- |
| `npm run typecheck` | OK | estático |
| `node scripts/qa-wave0-static.mjs` | **5/5** | estático |
| `node --test tests/ux-fin-vocabulary.test.mjs` | **17/17** | estático (lê os quatro servidores e os enums do banco) |
| `node --test tests/ux-ops-vocabulary.test.mjs` | **18/18** | estático (regressão UX-07A) |
| `npm test` | **723/723** | estático + unidade |
| `npm run test:ux-fin:pg` | **7/7** | HTTP real + PostgreSQL real + Chromium |
| `npm run test:ux-ops:pg` | **7/7** | HTTP real + PostgreSQL real + Chromium (regressão UX-07A) |
| `npm run test:l07-delivery:pg` | **43/43** | HTTP real + PostgreSQL real + Chromium (regressão do financeiro) |
| `npm run ux:evidence -- --stage=ux-07b` | capturado | Chromium, 1440×900 e 390×844 → `docs/ux-07b-evidencias/` |
| `npm run build` | OK | build de produção |

Os gates foram rodados **localmente** porque a CI do repositório já cancelou
jobs por falta de runner, e job cancelado aparece como falha com `steps` vazio.

## 5. Regressões achadas e corrigidas durante a verificação

1. **Concessão suposta ≠ concessão real.** A primeira versão do gate assumia
   que `comercial` seria recusado em `/api/fin/receivables`; o servidor devolve
   200 por decisão explícita. O teste foi corrigido para documentar a
   concessão real e provar o limite dela — o servidor **não** foi alterado.
2. **Corrida de leitura no gate.** A asserção de "vazio" chegava antes da
   primeira leitura terminar e encontrava o estado honesto *"ainda não lidos"*.
   O gate passou a esperar a transição real, sem afrouxar a asserção.
3. **Nenhuma regressão de conteúdo no L07.** Uma execução do gate L07 falhou
   em `FIN-05` por esse mesmo lançamento de Chromium; a reexecução deu
   **43/43**. O caso é de ambiente, não da tela.
4. **Lançamento do Chromium com `--single-process`** falhava de forma
   intermitente logo após fechar o browser anterior. Os dois gates (UX-07A e
   UX-07B) passaram a tentar o lançamento até três vezes — robustez de
   ambiente, nenhuma asserção alterada.

### Evidência visual
`docs/ux-07b-evidencias/desktop-financeiro.png` e `mobile-financeiro.png`
mostram a tela com o papel `ti`, que **não tem a concessão de escopo** das
leituras financeiras: o servidor responde `403 permission_scope_denied` e a
tela exibe *"ACESSO NEGADO — Sem a concessão específica para este escopo. Seu
papel aparece no menu, mas a concessão para este conjunto de dados não foi
dada. Nada foi exibido. Resposta do servidor: HTTP 403
(permission_scope_denied)"*, **sem botão de repetir**. É exatamente o
comportamento pretendido: o menu mostra o caminho, a concessão é outra coisa.
O coletor marca `PROBLEMAS` nessas duas capturas apenas porque conta 403 no
console do navegador — o 403 aqui é o resultado correto, não um defeito.

## 6. O que esta fatia NÃO provou

- **Aceite humano: pendente, por decisão explícita.** Marcelo e Andreia não
  participam; nenhuma homologação foi simulada.
- As **13 outras telas** de `/admin/financeiro` (cobrança, fluxo de caixa,
  custos, resultado gerencial, despesas, fiscal, gateway, exportações,
  fechamento, comissões) mantêm estados próprios, ainda não migrados para
  `UiState`. Declarado, não disfarçado.
- A escrita financeira pela interface é coberta pelo gate L07 existente, não
  por este.
- Estilos inline permanecem nas telas não tratadas desta família.

## 7. Famílias da UX-07 ainda pendentes

`licitacoes` (968), `expansao` (828), `terceiros` (751), `frota` (631),
`conhecimento` (532), `compliance` (522), `patrimonio` (417) e as demais telas
de contratos/extensões — uma família por PR, no mesmo padrão.

## 8. Runbook do operador (não executado)

Nada abaixo foi executado contra banco do operador. Nenhum comando é
destrutivo; nenhum segredo aparece.

```
npm ci
npm run typecheck
node --test tests/ux-fin-vocabulary.test.mjs
npm run test:ux-fin:pg     # PostgreSQL descartável; recusa rodar se DATABASE_URL existir
npm run build
```
