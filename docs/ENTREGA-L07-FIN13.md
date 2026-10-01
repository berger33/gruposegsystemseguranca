# L07 — FIN-13 · orçamento gerencial e cenários de expansão com premissas explícitas; não prometer resultado

**Sessão:** `arena/01a0f8e7-gruposegsystemseguranca`

**Base confirmada:** `origin/main` e HEAD inicial em `8f2624344581da8c73d6b12144eb599ff5e59611`, merge da PR #58 (docs do prompt FIN-13, que inclui o merge da PR #57/FIN-12 em `97d4d41`). Confirmação por `git log`/`git ls-remote` antes de qualquer edição.

**Escopo:** somente FIN-13. FIN-01..12 foram preservados e revalidados. FIN-14, FIN-15, FIN-16 e ADM-01..12 **não** foram tocados — as rotas e handlers do rascunho dessas fatias seguem exatamente como estavam.

## Pendência herdada (CI vermelho na PR #57)

Antes de editar, os dois gates apontados como suspeitos rodaram em série no HEAD atual: `test:l07-delivery:pg` **22/22** e `test:l04-delivery:pg` **20/20**, ambos exit 0. A falha dos jobs `finance-postgres-browser`/`crm-postgres-browser` na PR #57 não se reproduz localmente — compatível com a assinatura de runner lento já documentada. A PR desta fatia serve como re-rodada limpa de CI para fechar a dúvida.

## Diagnóstico da implementação preexistente

O rascunho `080-fin13-14-15-16-orcamento-export-fechamento-comissao.sql` já criava `fin_budgets` e `fin_budget_scenarios` (com protocolo `ORC-FIN-*`, premissas NOT NULL, margem gerada e `UNIQUE(budget_id, scenario_type)`), e `src/server/fin-budget-api.mjs` expunha `/api/fin/budgets` e `/api/fin/budget-scenarios`. A auditoria encontrou:

| Área | Situação encontrada |
|---|---|
| `fin_budgets` | `status` mudava por `COALESCE($1,status)`: **qualquer salto de estado era aceito**, inclusive `rascunho → aprovado` direto e `arquivado → aprovado`; sem idempotência; sem versão de premissas; `is_estimate` era editável — a trava "não prometer resultado" era só um default. |
| Aprovação | o PATCH preenchia `approved_by_identity`/`approved_at` automaticamente quando o cliente mandava `status:"aprovado"` — a "auditoria" da aprovação era um efeito colateral, não uma transição controlada; alterar premissas de um orçamento aprovado **não** revogava a aprovação. |
| `fin_budget_scenarios` | `projected_margin_percent` vinha **do corpo da requisição**: o cliente declarava a própria margem projetada, sem nenhuma conferência contra receita/custo; premissa era texto livre sem origem do número nem data-base; não existia o conceito de cenário incompleto — base ausente virava `NULL` silencioso sem motivo. |
| Histórico | nenhum: nem criação, nem transição, nem revisão de premissas deixavam trilha própria. |
| Handlers | escrita fora de transação, `auditLog` em `try{}catch{}` (falha silenciosa), respostas com `details: e.message` expondo o PostgreSQL, duplicidade de cenário checada por `SELECT` prévio (corrida), sem validação de UUID. |
| Telas | nenhuma aba de orçamento em `/admin/financeiro`; o diagnóstico `/admin/ti` (`FinBudgetClient`) criava orçamento e cenário direto, inclusive com `projected_margin_percent` digitado à mão. |
| Gate L07 | 22 subtestes, nenhum cobrindo FIN-13. |

## Entrega

- **Schema:** migração **exclusivamente aditiva** `132-fin13-budget-hardening.sql`. Nenhuma migração histórica foi tocada e nenhum tipo existente foi alterado (os enums `fin_budget_status` e `fin_scenario_type` de 080 já bastavam). Constraints novas em `NOT VALID` preservam as linhas do rascunho; triggers valem para toda escrita nova.
  - **`fin_budget_history`** (nova): histórico imutável de orçamento e cenário (`UPDATE`/`DELETE` bloqueados por trigger).
  - **Orçamento:** colunas `idempotency_key` (única), `premises_version`, `submitted_at`. Trigger com máquina de estados `rascunho → em_revisao → aprovado | rejeitado | arquivado` (com `em_revisao → rascunho` para devolução e `aprovado → rascunho` **somente** via revisão de premissas); nasce obrigatoriamente em `rascunho`; **`aprovado` exige aprovador e data**; campos de identidade imutáveis (protocolo, período, criador, chave); conteúdo só muda em `rascunho`; **`is_estimate` travado em `true` pelo banco** (`fin_budget_estimate_flag_locked`); premissa nova exige `premises_version + 1`, e sair de `aprovado` exige premissa alterada e aprovação zerada.
  - **Cenário:** colunas `idempotency_key` (única), `premise_source`, `premise_base_date`, `premises_version`, `is_complete`, `incomplete_reason`, `is_approved`, `approved_by_identity`, `approved_at`. Premissa explícita completa (texto + **origem do número** + **data-base**) obrigatória; padrão FIN-09 de lacuna visível: **incompleto exige motivo e proíbe projeção; completo exige receita positiva, custo e margem** — e a margem projetada é **recalculada pelo trigger**: qualquer divergência entre `projected_margin_percent` e `round((receita-custo)*100/receita, 2)` é recusada (`fin_scenario_margin_mismatch`); aprovação exige base completa, aprovador e data; **premissa nova revoga a aprovação** e incrementa a versão, também para escrita direta no banco; números de cenário aprovado são congelados.
- **Estimativa nunca se disfarça de resultado:** `is_estimate` é travado em `true` nas duas tabelas (banco e API), `estimate_note` é gravada pelo servidor, toda resposta de escrita carrega `is_estimate: true` e `no_result_promise: true`, e o cliente **não pode** declarar margem (`400 projected_margin_is_server_side`) nem desligar a trava (`400 estimate_flag_locked_nao_prometer_resultado`). Valor projetado e valor realizado nunca dividem campo: esta fatia só tem campos `projected_*`/`total_*` previstos, rotulados "(estimativa)" na tela — o realizado continua sendo domínio do FIN-09.
- **Aprovação não cria compromisso:** aprovar orçamento ou cenário não escreve em `fin_accounts_receivable`, `fin_accounts_payable`, `fin_expenses`, `fin_gateway_charges` nem `fin_commission_provisions` — provado no gate com contagem antes/depois.
- **API:** bloco FIN-13 endurecido em `src/server/fin-management-api.mjs` (`handleFinBudgets`, `handleFinBudgetScenarios`, `handleFinBudgetHistory`), no padrão literal do FIN-12: `pool.connect()`, `BEGIN`, `FOR UPDATE`, histórico e `auditLog({ client })` no mesmo cliente, `COMMIT` só depois da auditoria; auditoria indisponível ⇒ `503 {"error":"audit_unavailable"}` com rollback integral. Erros `23514` traduzidos por **allowlist** de códigos de domínio; nenhuma mensagem/constraint/detail do PostgreSQL chega ao cliente. Toda escrita exige sessão com papel financeiro/admin/ti, same-origin, UUIDs válidos, motivo de 10 a 1000 caracteres e chave de idempotência. As rotas `/api/fin/budgets` e `/api/fin/budget-scenarios` passaram a apontar para os handlers endurecidos e nasceu `GET /api/fin/budget-history` (com os aliases históricos `/api/*/hr/fin-budget-history`, registrados também em `API_PATH_MATCH`). Os handlers do rascunho em `fin-budget-api.mjs` continuam existindo apenas para FIN-14/15/16, que não são desta fatia.
- **UI real:** nova aba **Orçamento / Cenários** em `/admin/financeiro` (`BudgetWorkspace.tsx`), com aviso permanente de estimativa ("não constitui promessa de resultado"), criação em rascunho, envio para revisão, aprovação/rejeição com motivo, revisão de premissas que mostra a revogação da aprovação, cenário incompleto exibindo a lacuna com motivo (nunca zero), completude com margem calculada pelo servidor rotulada "(estimativa)" e aprovação rotulada "não cria compromisso". O diagnóstico `/admin/ti` (`FinBudgetClient`) **deixou de escrever orçamento e cenário** e passou a ser somente leitura para este domínio, apontando para o caminho canônico (FIN-14/15/16 seguem como estavam).
- **Gate L07:** dois subtestes novos (HTTP e Chromium) elevam o gate de 22 para **24** casos.

## Evidência reproduzível

Todos os gates PostgreSQL usam cluster embutido descartável e somente dados sintéticos. O L07 usa HTTP real, sessão/cookie real, Next local e Chromium empacotado pelo Playwright. Tudo rodou **em série, nunca em paralelo**.

### Baseline antes de editar (HEAD `8f26243`)

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrações 001–131 |
| `npm test` | 196/196 |
| `npm run test:l07-delivery:pg` | 22/22, exit 0 |
| `npm run test:l04-delivery:pg` (pendência herdada) | 20/20, exit 0 |

### Validação final

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrações 001–132 |
| `npm test` | 196/196 |
| `npm run test:migrations:pg` | verde, 132/132 checksums em dois passes, 522 tabelas; cenário negativo de checksum rejeitado e restaurado |
| `npm run test:l07-delivery:pg` — rodada 1 | 24/24, exit 0 |
| `npm run test:l07-delivery:pg` — rodada 2 consecutiva | 24/24, exit 0 |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run build` | exit 0 |
| `git diff --check` | limpo |

### O que o gate FIN-13 prova

Subteste HTTP:
- 401 sem sessão; 403 para papel não financeiro (orçamento, cenário e histórico); 403 para origem externa;
- premissa é obrigatória (`premises_required_10_2000`), e no cenário a origem do número e a data-base também (`premise_source_required_5_200`, `premise_base_date_required`);
- `is_estimate:false` é recusado na criação e na alteração; `status:"aprovado"` e `approved_by_identity` no POST são recusados — aprovação é transição explícita;
- o orçamento nasce `rascunho` com `ORC-FIN-*`, `is_estimate=true`, versão de premissas 1 e **margem nula quando não há base** (lacuna, não zero); chave repetida devolve `409 duplicate_idempotency_key`;
- aprovar direto do rascunho devolve `400 fin_budget_invalid_status_transition` (recusa do banco, não só da API); repetir o mesmo estado devolve 409; editar premissas fora do rascunho devolve `409 budget_edit_requires_rascunho`;
- a aprovação registra aprovador (identidade da sessão) e data, e a contagem de recebíveis, pagáveis, despesas, cobranças e provisões fica **idêntica** antes e depois — aprovar não cria compromisso;
- o cliente não declara margem (`projected_margin_is_server_side`); cenário sem base exige motivo e recusa projeção parcial; cenário completo exige receita positiva e custo; a margem volta calculada pelo servidor (25,00% para 400000/300000);
- cenário incompleto não aprova (`incomplete_scenario_cannot_be_approved`); aprovar duas vezes é recusado; tipo repetido no mesmo orçamento devolve `409 duplicate_scenario_type_for_budget`;
- **revisar premissas derruba a aprovação**: no cenário (`approval_revoked: true`, `is_approved=false`, versão 2) e no orçamento (volta a `rascunho`, aprovação zerada, versão 2);
- o banco repete as garantias para escrita direta: `is_estimate=false` recusado nas duas tabelas, salto de estado recusado, premissa sem incremento de versão recusada, INSERT já aprovado recusado, margem adulterada recusada (`fin_scenario_margin_mismatch`);
- o histórico tem exatamente 4 movimentos por entidade (criação, envio, aprovação, revisão) e é imutável a `UPDATE` e `DELETE`;
- auditoria indisponível devolve `503 {"error":"audit_unavailable"}` sem `details` e reverte por completo criação de orçamento, criação de cenário e transição.

Subteste Chromium: o papel financeiro vê o aviso "não constitui promessa de resultado", cria o orçamento pela interface (margem exibida como "Dado ausente"), envia para revisão e aprova (banco confirma aprovador e data), cria o cenário de expansão **incompleto** (lacuna exibida com o motivo), completa a base (margem 25,00% calculada pelo servidor e rotulada "(estimativa)"), aprova — a contagem de recebíveis+despesas não muda — e revisa as premissas: a interface mostra a aprovação caindo para "não" e o banco confirma `is_approved=false`, aprovador nulo e `premises_version=2`.

## Limitações e fronteiras explícitas

- **Nada aqui é resultado.** Os campos `total_*`/`projected_*` desta fatia são projeções rotuladas; o realizado continua em FIN-09 (`fin_management_results`) e não há comparativo previsto×realizado automático nesta fatia — ligar orçamento a resultado gerencial é decisão de contrato posterior.
- Aprovação de orçamento/cenário não exige segregação criador≠aprovador (o FIN-10 exige para despesas); o requisito desta fatia era aprovação auditada com aprovador e data, e foi isso que o banco passou a exigir. Endurecer segregação aqui é decisão aberta.
- Linhas criadas pelo rascunho 080 continuam legíveis: as constraints novas são `NOT VALID` e os triggers só governam escrita nova; registros antigos sem `idempotency_key`/`premise_source` aparecem com lacuna visível.
- Os handlers de rascunho de FIN-14/15/16 em `fin-budget-api.mjs` continuam ativos e **não** foram endurecidos — são as próximas fatias. Os handlers de orçamento do mesmo arquivo ficaram órfãos de rota (as rotas apontam para o bloco endurecido) e serão removidos quando aquele arquivo for refeito pelas fatias seguintes.
- A matriz `docs/CHECKLIST-ENTREGA-LOCAL.md` continua com FIN-05..FIN-13 documentados apenas por `docs/ENTREGA-L07-FIN*.md`; consolidar a matriz é tarefa do fechamento do bloco L07, não desta fatia.
- A dúvida do CI da PR #57 só fecha de vez com o CI desta PR verde para o mesmo código que passou localmente.
