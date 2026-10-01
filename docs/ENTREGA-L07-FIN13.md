# L07 — FIN-13 · orçamento gerencial e cenários de expansão com premissas explícitas (não prometer resultado)

**Sessão:** `arena/01a0f8b0-gruposegsystemseguranca`

**Base confirmada:** `origin/main` e HEAD inicial em `97d4d41050d4df16267377e8af08d093a00c81b9`, merge da PR #57 (FIN-12). A confirmação foi feita com `git log` antes de qualquer edição.

**Escopo:** somente FIN-13. FIN-01..12 foram preservados e revalidados pelo gate. FIN-14..16 e ADM-01..12 **não** foram iniciados — o rascunho `080-...` continua servindo essas três fatias sem alteração de comportamento.

## Baseline executada antes de editar

| Comando | Resultado |
|---|---|
| `npm ci` | exit 0 |
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrações 001–131 |
| `npm test` | 196/196 |
| `npm run test:l07-delivery:pg` | 22/22, exit 0 |

## Diagnóstico da implementação preexistente

O rascunho `db/migrations/080-fin13-14-15-16-orcamento-export-fechamento-comissao.sql` já criava `fin_budgets` e `fin_budget_scenarios`, e os handlers viviam em `src/server/fin-budget-api.mjs` (não em `fin-management-api.mjs`, onde as fatias FIN-09..12 foram endurecidas). A auditoria encontrou:

| Área | Situação encontrada |
|---|---|
| `fin_budgets` | `protocol` já tinha o formato `ORC-FIN-*`, mas **sem idempotência**; `premises` era só texto de 10 caracteres (nenhuma premissa estruturada, nenhuma fonte); `total_revenue_cents`/`total_cost_cents` eram **opcionais** (orçamento sem número era aceito); `status` era livre — qualquer transição valia, inclusive `rascunho → aprovado`; o único guarda-corpo era "aprovado exige aprovador e data", e **nada impedia o próprio autor de aprovar**; `is_estimate` tinha `DEFAULT true` mas podia ser gravado `false`; `estimate_note` tinha default, mas qualquer texto de 10 caracteres passava. |
| Promessa de resultado | **nada no banco nem na API** impedia que título, descrição ou premissa dissessem "resultado garantido", "retorno garantido" ou "prometemos". O requisito "não prometer resultado" existia apenas como texto do `estimate_note` padrão. |
| `fin_budget_scenarios` | `premises` de 10 caracteres; **`projected_margin_percent` vinha do corpo da requisição** — o cliente declarava a margem projetada, que podia divergir de receita e custo; receita/custo opcionais; nenhum vínculo entre cenário de `expansao` e investimento; cenário podia ser criado/alterado **depois** da aprovação do orçamento. |
| Handlers (`fin-budget-api.mjs`) | escrita **fora de transação**; `status` mudava por `COALESCE($1,status)`; `approved_by`/`approved_at` eram preenchidos só quando o corpo pedia `status:'aprovado'`; `auditLog` dentro de `try{}catch{}` (falha **silenciosa**, nunca fail-closed); respostas com `details: e.message` e `details: e.detail` **expondo mensagem e detalhe do PostgreSQL**; nenhuma validação de UUID; duplicidade de cenário checada por `SELECT` fora de transação. |
| Histórico | **não existia** histórico de revisão/aprovação de orçamento (só FIN-16 tinha `fin_commission_provision_history`). |
| Interface | nenhuma aba de orçamento em `/admin/financeiro`; o único caminho era o formulário de diagnóstico `FinBudgetClient.tsx` em `/admin/ti`, que **escrevia** orçamento e cenário (inclusive a margem projetada digitada à mão). |
| Gate L07 | 22 subtestes, nenhum cobrindo FIN-13. |

## Entrega

- **Schema:** migração **exclusivamente aditiva** `132-fin13-budget-hardening.sql`. Nenhuma migração histórica foi tocada e nenhum tipo existente foi alterado (o migrador roda cada arquivo em transação, então `ALTER TYPE ... ADD VALUE` foi deliberadamente evitado; os enums `fin_budget_status` e `fin_scenario_type` de 080 já bastavam). As constraints novas são `NOT VALID`: valem integralmente para toda escrita nova e toda alteração, sem reescrever linhas antigas.
  - **`fin_budget_history`** (nova): histórico imutável de orçamento e cenário (`UPDATE`/`DELETE` bloqueados por trigger), com estado anterior, estado seguinte, autor da mudança, motivo de 10 a 1000 caracteres e metadados.
  - **`fin13_promises_result(text)`** (nova função): detector de promessa de resultado usado por orçamento e cenário — recusa "garantimos", "prometemos", "garantia de resultado", "retorno/lucro/ganho garantido", "rentabilidade/margem/receita garantida", "sem risco", "risco zero", "resultado assegurado". O texto "não prometer resultado" continua válido (é justamente o aviso exigido).
  - **Orçamento:** colunas `idempotency_key`, `assumptions` (premissas estruturadas), `submitted_at/by`, `decision_reason`, `rejected_at/by`, `archived_at/by`. Protocolo `ORC-FIN-AAAAMMDD-XXXX` reafirmado; idempotência obrigatória e única; premissas obrigatórias em **dois níveis** (texto com no mínimo 30 caracteres **e** lista `assumptions` com ao menos 2 itens, cada um com `premissa` de 10–500 e `fonte` de 3–200); receita obrigatória e positiva, custo obrigatório e não negativo (a margem continua sendo coluna gerada); `is_estimate` travado em `true` e `estimate_note` obrigado a conter **"estimativa"** e **"não prometer resultado"**.
  - **Máquina de estados no banco:** `rascunho → em_revisao | arquivado`, `em_revisao → aprovado | rejeitado`, `aprovado | rejeitado → arquivado`. Qualquer outro caminho é recusado (`fin13_budget_invalid_status_transition`), inclusive o atalho `rascunho → aprovado`. Repetir o mesmo estado não é transição.
  - **Aprovação auditada:** `aprovado` exige `approved_by_identity` **e** `approved_at` **e** motivo da decisão, e o aprovador **não pode ser o autor** (`fin13_budget_approver_must_differ_from_author`). `rejeitado` exige revisor, data e motivo, com a mesma segregação. `em_revisao` exige quem enviou e **cenários explícitos**: ao menos dois, sendo um deles o cenário `base`.
  - **Conteúdo imutável:** depois de criado, título, descrição, premissas, `assumptions`, período, valores, chave de idempotência, aviso de estimativa e autor **não mudam**; a única alteração possível é a transição de estado. Revisão e aprovação viram histórico, não sobrescrita.
  - **Cenário:** colunas `idempotency_key`, `assumptions`, `expansion_investment_cents`, `margin_formula`. Cenário só nasce enquanto o orçamento é `rascunho`, é **imutável** depois de criado (`fin13_scenario_immutable`) e só pode ser removido enquanto o orçamento continua rascunho (`fin13_scenario_locked_after_review`). Cenário de `expansao` exige investimento declarado e positivo; os demais tipos não aceitam esse campo. A **margem projetada é calculada pelo banco** — `projected_margin_percent = (receita − custo) × 100 / receita`, arredondada em duas casas, com a fórmula gravada em `margin_formula` e recusa explícita quando o resultado sai de −100..100.
- **API endurecida** (`src/server/fin-management-api.mjs`, onde já vivem FIN-09..12): `GET/POST/PATCH /api/fin/budgets`, `GET/POST /api/fin/budget-scenarios` e `GET /api/fin/budget-history`, com os aliases históricos `/api/{admin,crm}/hr/fin-budget*` e `/api/hr/fin-budget*`, todos registrados também em `API_PATH_MATCH` do `server.mjs`.
  - **Transacional:** toda escrita usa `pool.connect()`, `BEGIN`, `FOR UPDATE` no orçamento (e `FOR SHARE` na leitura dos cenários durante o envio para revisão), grava o histórico e chama `auditLog({ client })` no **mesmo** cliente; o `COMMIT` só acontece depois da auditoria.
  - **Auditoria fail-closed:** auditoria indisponível devolve `503 {"error":"audit_unavailable"}` e reverte tudo — orçamento, cenário e transição.
  - **Respostas sanitizadas:** erros `23514` passam por uma **allowlist** de 28 códigos de domínio; qualquer outra coisa vira `invalid_budget_transition` ou `internal`. Nenhuma `message`, `constraint`, `detail` ou posição vinda do PostgreSQL chega ao cliente. `23505` vira `duplicate_idempotency_key` / `duplicate_scenario_type_for_budget`.
  - **Same-origin e papel:** escrita exige `Origin` próprio (`403 forbidden_origin`) e sessão de papel financeiro/admin/ti; anônimo recebe 401 e papel indevido recebe 403, inclusive na leitura e no histórico.
  - **Recusas de borda explícitas:** `is_estimate:false` → `budget_is_always_an_estimate`; `status` de criação diferente de rascunho → `budget_starts_rascunho`; `approved_by_identity`/`approved_at`/`decision_reason` no POST → `approval_is_an_explicit_transition`; margem enviada pelo cliente → `projected_margin_is_server_side`; texto com promessa → `result_promise_refused` (a mesma expressão do banco, espelhada na borda).
  - O rascunho `fin-budget-api.mjs` **deixou de responder** por orçamento/cenário; as funções antigas foram removidas e o arquivo ficou com um comentário apontando para a borda canônica. FIN-14/15/16 continuam ali, inalterados.
- **Interface real:** nova aba **Orçamento / Cenários** em `/admin/financeiro` (`src/app/admin/financeiro/BudgetWorkspace.tsx`): cria o orçamento com premissas estruturadas (premissa + fonte), lista cenários com a **margem projetada calculada pelo servidor**, exibe o aviso permanente de estimativa/sem promessa de resultado, percorre envio para revisão, aprovação, rejeição e arquivamento com motivo obrigatório, e mostra o histórico imutável. A tela de diagnóstico `/admin/ti` (`FinBudgetClient.tsx`) deixou de escrever orçamento e cenário: ficou **somente leitura** para este domínio, apontando para o caminho canônico.
- **Gate L07:** dois subtestes novos (HTTP e Chromium) elevam o gate de 22 para **24** casos; o escopo impresso pelo runner foi corrigido para 24 (ele ainda dizia 20).

## Evidência reproduzível

Todos os gates PostgreSQL usam cluster embutido descartável e somente dados sintéticos; o runner recusa banco fornecido pelo ambiente. O L07 usa HTTP real, sessão/cookie real, Next local e Chromium empacotado pelo Playwright.

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

Durante o desenvolvimento houve duas correções registradas honestamente:

1. Uma asserção do subteste HTTP tentava provar a segregação de aprovação direto no banco usando um orçamento que **já estava aprovado** — o `UPDATE ... WHERE status='em_revisao'` não casava linha nenhuma e o teste falhava por "missing expected rejection". Em vez de afrouxar a asserção, o teste passou a criar um quarto orçamento, levá-lo a `em_revisao` e então provar as duas recusas do banco (autor aprovando a si mesmo e aprovação sem aprovador declarado).
2. O subteste Chromium abria **dois contextos simultâneos** no mesmo navegador empacotado, e o segundo `goto` morria com "target page, context or browser has been closed". O teste passou a usar o mesmo padrão do FIN-10: um único contexto, `clearCookies()` e troca de cookie para a segunda identidade.

Além disso, uma execução do L07 feita **em paralelo** com `npm run build` terminou 15/24 por contenção de recursos (304 s contra 66 s das execuções isoladas, com timeouts de Chromium). As duas rodadas consecutivas registradas acima foram executadas isoladamente.

### O que o gate FIN-13 prova

Subteste HTTP (`L07 FIN-13: orçamento é estimativa com premissas explícitas…`):
- 401 sem sessão, 403 para papel não financeiro (cenários e histórico), 403 para papel indevido na escrita e 403 para origem externa;
- criação recusa premissa curta, lista de premissas vazia, lista com um item só, item sem fonte, item cuja premissa promete retorno garantido, descrição com "resultado garantido", `is_estimate:false`, `status:'aprovado'`, `approved_by_identity` no corpo, receita zero e período invertido;
- o orçamento nasce com protocolo `ORC-FIN-AAAAMMDD-XXXX`, em `rascunho`, `is_estimate: true`, aviso contendo "estimativa" e "não prometer resultado", duas premissas estruturadas e margem de R$ 4.000,00 calculada pelo banco; a resposta traz `promises_result: false`; chave repetida devolve 409;
- `rascunho → aprovado` é recusado (409 `budget_invalid_transition`) e `rascunho → em_revisao` **sem cenários** é recusado (409 `scenarios_required_base_and_alternative`);
- cenário recusa tipo inválido, margem declarada pelo cliente, `expansao` sem investimento, investimento em cenário que não é de expansão e título com "lucro garantido";
- cenário `base` devolve margem **40,00%** e margem em centavos coerentes, com a fórmula gravada; cenário `expansao` com investimento devolve **31,25%**; tipo repetido devolve 409; cenário com custo muito acima da receita devolve `fin13_scenario_margin_out_of_range`;
- depois do envio para revisão, criar cenário é recusado (409 `budget_not_in_rascunho`); o autor aprovando a si mesmo recebe 409 `approver_must_differ_from_author`; motivo curto recebe 400; a segunda identidade aprova e a resposta traz aprovador, data e `is_estimate: true`; aprovar de novo e voltar para revisão são recusados;
- um segundo orçamento percorre revisão → rejeição (com revisor e data) → arquivamento;
- o banco repete as garantias para escrita direta: conteúdo imutável, `is_estimate=false` recusado, `rascunho → aprovado` recusado, revisão sem cenários recusada, autoaprovação recusada, aprovação sem aprovador recusada, cenário imutável e cenário de orçamento já revisado não pode ser apagado;
- o histórico do orçamento tem exatamente três movimentos (criação, envio para revisão, aprovação) e dois movimentos de cenário, e é imutável a `UPDATE` e `DELETE`;
- auditoria indisponível devolve 503 sem `details` e reverte orçamento, cenário e transição por completo (o orçamento afetado continua em `rascunho`);
- ao final, nenhum orçamento com `is_estimate = false` e nenhum orçamento aprovado sem aprovador, sem data ou aprovado pelo próprio autor.

Subteste Chromium (`L07 FIN-13: Chromium cria orçamento com premissas…`): o papel financeiro abre `/admin/financeiro`, confirma na tela o aviso de que o sistema **não promete resultado**, cria o orçamento com duas premissas estruturadas (cada uma com fonte), vê a coluna "Estimativa" marcada, cria o cenário base e lê **40,00%** calculados pelo servidor, cria o cenário de expansão com investimento declarado e lê **31,25%**, envia para revisão, **tenta aprovar o próprio orçamento e recebe a recusa na interface** (o estado permanece `em_revisao` no banco); então a segunda identidade financeira entra, aprova com motivo, e o banco confirma `aprovado`, `is_estimate = true`, aprovador diferente do autor, data preenchida e trilha `rascunho → em_revisao → aprovado`.

## Limitações e fronteiras explícitas

- **Nenhum número aqui é promessa.** O orçamento e os cenários são estimativas derivadas de premissas declaradas; o sistema recusa texto que prometa resultado, mas isso é um guarda-corpo de linguagem — **não** uma validação da qualidade das premissas. Quem avalia a premissa é o revisor humano, e é por isso que a aprovação exige identidade diferente do autor.
- O orçamento **não** é comparado com realizado: FIN-13 cobre orçar e cenarizar. A confrontação orçado × realizado depende do resultado gerencial (FIN-09) e não foi ligada nesta fatia — fica como pendência explícita.
- O conteúdo do orçamento é imutável por decisão de projeto: corrigir um número significa criar outro orçamento. Não existe "editar rascunho" nesta fatia; a alternativa seria versionar o orçamento, o que muda o contrato de dados e ficou fora do escopo.
- Cenários também são imutáveis e só existem enquanto o orçamento é rascunho. A API expõe criação e leitura; remover cenário de rascunho é possível no banco, mas **não** há rota para isso.
- A lista de expressões de "promessa de resultado" é heurística e em português; ela recusa as formulações comuns, não garante que nenhum texto possa soar como promessa.
- Linhas criadas pelo rascunho 080 continuam legíveis: as constraints novas são `NOT VALID`, de modo que valem integralmente para toda escrita nova e toda alteração, sem reescrever histórico. Em um banco com orçamentos antigos, qualquer alteração neles passará a exigir as regras novas.
- FIN-14 (exportação), FIN-15 (fechamento) e FIN-16 (comissões) continuam com os handlers de rascunho em `src/server/fin-budget-api.mjs`, com os mesmos problemas que o FIN-13 tinha (escrita fora de transação, auditoria silenciosa, `details` do PostgreSQL). Eles **não** foram tocados: endurecer cada um é a fatia correspondente.
- A matriz `docs/CHECKLIST-ENTREGA-LOCAL.md` continua com FIN-05..FIN-13 em `a_revalidar`: as entregas por fatia documentaram a evidência em `docs/ENTREGA-L07-FIN*.md`, mas ninguém consolidou a matriz. Consolidar é tarefa do fechamento do bloco L07, não desta fatia.
