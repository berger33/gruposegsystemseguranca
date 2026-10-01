# L07 — FIN-13 · orçamento gerencial e cenários com premissas explícitas, sem prometer resultado

**Sessão:** `arena/01a0f8a2-gruposegsystemseguranca`

**Base confirmada:** `origin/main` em `8f26243` (merge da PR #58, pós FIN-12), confirmado com `git log`/`git ls-remote` antes de qualquer edição. A pendência herdada da PR #57 foi verificada: L07 22/22 e L04 20/20 passaram em série no HEAD de partida antes do FIN-13 começar.

**Escopo:** somente FIN-13. FIN-01..12 foram preservados e revalidados. FIN-14..16 e ADM-01..12 **não** foram tocados (os handlers `handleExports`/`handleClosures`/`handleCommissions` de `fin-budget-api.mjs` e a migração 080 permanecem como rascunho, intocados).

## Diagnóstico da implementação preexistente

O rascunho `080-fin13-14-15-16-*.sql` já criava `fin_budgets`, `fin_budget_scenarios` e os enums `fin_budget_status`/`fin_scenario_type`, e `src/server/fin-budget-api.mjs` expunha orçamento e cenário. A auditoria encontrou:

| Área | Situação encontrada |
|---|---|
| `fin_budgets` | sem idempotência; premissa era um texto qualquer sem origem nem data-base; `status` sem máquina de estados (nenhum trigger); aprovação era só um par de colunas preenchíveis por qualquer `UPDATE`. |
| `fin_budget_scenarios` | **sem `status`**: cenário nascia sem estado e nunca podia ser aprovado/rejeitado; sem `approved_by/approved_at`; sem campos de realizado; sem `is_complete`/`incomplete_reason` — dado ausente era tratado como NULL silencioso; `UNIQUE(budget_id, scenario_type)` era a única garantia real. |
| Premissas | uma única coluna de texto livre; nada versionado; **alterar a premissa de algo aprovado mantinha a aprovação** (nenhuma derrubada). |
| Estimativa × resultado | `is_estimate`/`estimate_note` existiam com default, mas nenhuma regra impedia `is_estimate=false` em registro 100% projetado; não havia campos de realizado para comparar. |
| Handlers (435 linhas) | escrita fora de transação (`pool.query` direto); `auditLog` em `try{}catch{}` (falha silenciosa); respostas com `details: e.message` vazando mensagem do PostgreSQL; `UPDATE ... status=COALESCE($1,status)` — **qualquer status era alcançável por PATCH direto, inclusive `aprovado` sem transição**, com `approved_by/approved_at` calculados no servidor e gravados por `COALESCE`; sem validação de UUID; sem idempotência; sem histórico. |
| `server.mjs` | rotas de orçamento e cenário registradas, mas **sem rota de histórico** (não existia histórico) e sem os aliases `fin-budget-history` em `API_PATH_MATCH`. |
| Workspace financeiro | nenhuma aba de orçamento em `/admin/financeiro`; o diagnóstico de `/admin/ti` nem listava orçamento/cenário. |
| Testes e gate L07 | 22 subtestes, nenhum cobrindo FIN-13. |

## Entrega

- **Schema:** migration **exclusivamente aditiva** `132-fin13-budget-hardening.sql`. Nenhuma migração histórica tocada, nenhum `ALTER TYPE` (os enums de 080 bastavam). Constraints novas valem integralmente para toda escrita; linhas do rascunho 080 permanecem legíveis.
  - **`fin_budget_history`** (nova): histórico imutável de orçamento e cenário (`UPDATE`/`DELETE` bloqueados por trigger `fin_budget_history_immutable`), com transição `from_status → to_status`, motivo, ator, `premises_version` e payload.
  - **Orçamento:** colunas `idempotency_key` (única), `premise_source`, `premise_base_date`, `premises_version`. Trigger `trg_fin13_guard_budget_write` impõe: nascimento somente em `rascunho`; máquina de estados `rascunho → em_revisao → aprovado|rejeitado`, `aprovado|rejeitado → arquivado`, `em_revisao → rascunho` (retirada de revisão); **nenhum atalho** (por exemplo `rascunho → aprovado` direto é recusado pelo banco); identidade do criador imutável; aprovação exige aprovedor e marca `approved_at`, e **sair de `aprovado` limpa os campos de aprovação**; revisão de premissas incrementa `premises_version` e derruba a aprovação de volta a `rascunho`; `idempotency_key`/`premise_source`/`premise_base_date` imutáveis após a criação.
  - **Cenário:** colunas `status` (mesma máquina do orçamento), `approved_by_identity`, `approved_at`, `idempotency_key`, `premise_source`, `premise_base_date`, `premises_version`, **`realized_revenue_cents`/`realized_cost_cents`/`realized_margin_cents`** (margem derivada por GENERATED) e **`is_complete` GENERATED com `incomplete_reason`** (padrão FIN-09): cenário sem realizado é lacuna visível com motivo, nunca zero. CHECKs: `is_estimate=false` exige realizado registrado (`fin_scenario_estimate_only`); realizado não-negativo; completude coerente com motivo; campos de aprovação coerentes com status. Trigger guarda as mesmas regras de transição/imutabilidade/versionamento de premissas do orçamento.
- **Premissa explícita é obrigatória em dois níveis:** API e banco. Orçamento sem `premises` (10–2000), `premise_source` (10–500) e `premise_base_date` não existe; o mesmo para cenário. A data-base não pode ser futura além do fim do período.
- **Estimativa nunca se disfarça de resultado:** projetado e realizado são colunas distintas com rótulos distintos na tela; `is_estimate` é obrigatoriamente `true` enquanto não houver realizado; a margem projetada é derivada (GENERATED), nunca enviada pelo cliente.
- **Aprovar cenário não cria compromisso:** a transição toca somente `fin_budget_scenarios`/`fin_budget_history`/`audit_log`. O gate prova com contagens antes/depois idênticas em `fin_accounts_receivable`, `fin_accounts_payable`, `fin_expenses`, `fin_commission_provisions` e `adm_goals_comparison`.
- **Premissa revisada derruba aprovação:** `PATCH` de premissas em registro `aprovado` recalcula a premissa como versão `v2` e o status volta a `rascunho` — pela API e (escrita direta) pelo trigger `fin_scenario_premise_change_drops_approval`/equivalente do orçamento.
- **API:** `GET/POST/PATCH /api/fin/budgets`, `/api/fin/budget-scenarios` e `GET /api/fin/budget-history`, com os aliases históricos `/api/hr/fin-budget-*` e `/api/{admin,crm}/hr/fin-budget-*`, todos também em `API_PATH_MATCH`. Toda escrita exige sessão de papel financeiro, same-origin, UUID válido, motivo de 10–1000 caracteres e chave de idempotência única (409 `duplicate_idempotency_key` na repetição, devolvendo o registro original).
- **Transacional e fail-closed:** toda escrita usa `pool.connect()`, `BEGIN`, `FOR UPDATE`/`FOR SHARE`, grava histórico e chama `auditLog({ client })` **no mesmo cliente**; `COMMIT` só após a auditoria. Auditoria indisponível ⇒ `503 {"error":"audit_unavailable"}` com rollback integral (provado com `ALTER TABLE audit_log RENAME` no gate). `GET` de histórico também é transacional fail-closed.
- **Respostas sem detalhe SQL:** `23514` traduzido por allowlist de códigos de domínio (`invalid_budget_transition`, `invalid_scenario_transition`, `premise_change_drops_approval`…); qualquer outro erro vira `internal` sem `details`.
- **UI real:** nova aba **Orçamento / Cenários** em `/admin/financeiro` (`BudgetWorkspace.tsx`, testids `fin13-*`): cadastro de orçamento com premissa completa (texto, origem, data-base), transições com motivo, tabela com status/versão de premissas, cenário com projetado **e** realizado em blocos separados, motivo de incompletude obrigatório quando falta realizado, revisão de premissa via `prompt()` que derruba aprovação, e histórico. A tela de diagnóstico `/admin/ti` ganhou seção FIN-13 **somente leitura** apontando para o caminho canônico.
- **Gate L07:** dois subtestes novos (HTTP e Chromium) elevam o gate de 22 para **24** casos.

## Evidência reproduzível

Todos os gates PostgreSQL usam cluster embutido descartável e somente dados sintéticos; o runner recusa banco fornecido pelo ambiente. O L07 usa HTTP real, sessão/cookie real, Next local e Chromium empacotado pelo Playwright.

### Baseline antes de editar

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrations 001–131 |
| `npm test` | 196/196 |
| `npm run test:l07-delivery:pg` | 22/22, exit 0 |
| `npm run test:l04-delivery:pg` (pendência herdada da PR #57) | 20/20, exit 0 |

### Validação final

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrations 001–132 |
| `npm test` | 196/196 |
| `npm run test:l07-delivery:pg` — rodada 1 | 24/24, exit 0 |
| `npm run test:l07-delivery:pg` — rodada 2 consecutiva | 24/24, exit 0 |
| `npm run test:migrations:pg` | verde, 132/132 checksums preservados, 522 tabelas; cenário negativo de checksum (006 mutado) rejeitado e restaurado, sem rebaseline |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run build` | exit 0 |
| `git diff --check` | limpo |

Dois episódios intermediários, ambos resolvidos antes das rodadas finais: (1) o PostgreSQL inferia o parâmetro de `approved_by_identity` dentro de `CASE WHEN ... THEN $n` como `text` e recusava o `UPDATE` (erro 42804) — corrigido com cast explícito `$n::uuid` nas quatro escritas de transição (orçamento e cenário, fixos e dinâmicos); (2) uma rodada do L07 terminou 14/24 com duração 5,4× o normal e timeouts de navegador — assinatura de contenção de runner documentada no doc mestre; limpeza de `.next/integration-*` e re-rodada devolveram 24/24 sem nenhuma mudança de código. As duas rodadas finais são posteriores a tudo isso.

### O que o gate FIN-13 prova

Subteste HTTP:
- 401 sem sessão; 403 para papel não financeiro (inclusive leitura e histórico); 403 para origem externa;
- cadastro recusa título/descrição/premissa fora de faixa, **premissa sem origem (`premise_source_required`) e sem data-base (`premise_base_date_required`)**, período invertido, `is_estimate: false` sem realizado, e campos imutáveis enviados na criação;
- 201 devolve orçamento `rascunho` com `is_estimate: true`, `estimate_note`, margem **derivada** (não enviada), `premises_version: 1` e protocolo `ORC-FIN-…`;
- idempotência: chave repetida devolve 409 com o registro original;
- transições sem atalho: `rascunho → aprovado` direto é recusado; `rascunho → em_revisao → aprovado` funciona; transição para o status atual é recusada; arquivamento exige motivo;
- cenário incompleto: sem realizado, `is_complete: false` com `incomplete_reason` obrigatório e margem realizada ausente — **lacuna visível, não zero**;
- **aprovação não cria compromisso**: contagens idênticas antes/depois em recebíveis, pagáveis, despesas, provisões de comissão e metas;
- **premissa revisada derruba aprovação**: cenário `aprovado` com premissa alterada volta a `rascunho` com `premises_version: 2`;
- o banco repete as garantias para escrita direta: status inicial `rascunho` imposto, transição inválida recusada, `is_estimate=false` sem realizado recusado, premissa adulterada em aprovado recusada, campos de identidade imutáveis;
- histórico imutável a `UPDATE` e `DELETE`, com a trilha completa de transições;
- auditoria indisponível devolve 503 sem `details` e reverte orçamento, cenário e transição por completo (nenhuma linha sobra);
- ao final, nenhum orçamento/cenário aprovado gerou compromisso e nenhum registro não-estimativa existe sem realizado.

Subteste Chromium: o papel financeiro abre a aba **Orçamento / Cenários**, cadastra o orçamento com premissa completa, percorre `em_revisao → aprovado` pelos botões (testids `fin13-budget-revise/approve`), cria cenário de expansão incompleto com motivo, o aprova, e revisa a premissa via diálogo (`page.once("dialog")`) — a interface mostra o cenário de volta em `rascunho` com `premises_version: 2`. Cookie financeiro, same-origin e `data-testid` estáveis em toda a jornada.

## Limitações e fronteiras explícitas

- Orçamento e cenário são **planejamento**: nada aqui movimenta dinheiro, cria título ou compromisso — por definição da fatia. A ligação de um orçamento aprovado a execuções reais (recebível/despesa) é decisão de contrato financeiro futura.
- O `realized_*` de cenário é **digitado pelo papel financeiro** nesta fatia; não há ingestão automática a partir do contas a receber/despesas. Conciliar essa alimentação é fronteira natural de FIN-14/15.
- Os enums de 080 (`conservador`, `pessimista`…) seguem utilizáveis como tipos de cenário; a margem percentual projetada permanece opcional e nunca é calculada como promessa — o rótulo "estimativa" é permanente enquanto não houver realizado.
- A conciliação do gateway FIN-12 **continua sem dar baixa** no recebível (`fin_payment_history`) — pendência explícita registrada na entrega FIN-12, a decidir no fechamento de FIN-14/15.
- A matriz `docs/CHECKLIST-ENTREGA-LOCAL.md` continua com FIN-05..FIN-12 em `a_revalidar`; consolidá-la (com comando, número e commit por item) é tarefa do fechamento do bloco L07, junto com `docs/ESTADO-EXECUCAO-LOCAL.md`.
- O CI das PRs anteriores ficou vermelho com gates locais verdes (pendência herdada da PR #57); a PR desta fatia deve ser observada — se o CI repetir o padrão de runner lento, a evidência local desta tabela é a fonte da verdade.
