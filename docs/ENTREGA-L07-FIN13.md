# Entrega L07 — FIN-13

## Escopo
Entrega aditiva de orçamento gerencial e cenários de expansão. Orçamentos permanecem explicitamente estimativos: premissas são obrigatórias, `is_estimate=true` é preservado e a interface informa que não há promessa de resultado financeiro.

## Alterações
- `db/migrations/132-fin13-budget-hardening.sql`: histórico imutável, transições `rascunho → em_revisao → aprovado/rejeitado → arquivado`, aprovação com identidade/data, `is_estimate=true`, avisos e tipos de cenário válidos.
- `src/server/fin-budget-api.mjs`: handlers FIN-13 transacionais com `BEGIN`/`COMMIT`, bloqueio `FOR UPDATE` nas mutações de orçamento/cenários, auditoria fail-closed com rollback total e `503 audit_unavailable`, validação allowlist sem detalhes SQL, sessão/same-origin/papéis financeiro/admin e `/admin/ti` somente leitura para orçamento/cenários.
- `server.mjs`: auditoria FIN-13 passa a aceitar o client transacional e não é silenciosamente ignorada.
- `BudgetWorkspace.tsx`: nova aba no workspace financeiro com cadastro de orçamento e cenário, premissas explícitas e aviso de estimativa sem promessa de resultado.
- `tests/l07-delivery.integration.test.mjs`: gate L07 passou de 22 para 24 subtestes, incluindo teste HTTP FIN-13 e teste Chromium da nova aba.
- Gate L07 atualizado para reportar 24 subtestes; gate estático permanece na faixa de migrações 001–132.

## Validações executadas em 2026-10-01
Observação: a primeira tentativa de `npm run typecheck` antes da instalação falhou por precondição de ambiente (`tsc: not found`). Após `npm ci`, os gates abaixo foram executados com sucesso:

- `npm ci`: OK, 82 pacotes instalados, 0 vulnerabilidades.
- `npm run typecheck`: OK.
- `node scripts/qa-wave0-static.mjs`: OK, 5/5 verificações; migrações 001–132 contínuas e registradas.
- `npm test`: OK, 196/196 testes.
- `npm run test:migrations:pg`: OK, migrações 001–132 em duas passagens idempotentes e clone/checksum preservado (o stderr de checksum mismatch em `006` é o cenário negativo esperado pelo próprio gate, com exit code 0).
- `npm run test:l07-delivery:pg`: OK na 1ª execução consecutiva, 24/24 subtestes; Chromium sem SIGSEGV.
- `npm run test:l07-delivery:pg`: OK na 2ª execução consecutiva, 24/24 subtestes; Chromium sem SIGSEGV.
- `npm run test:l03-delivery:pg`: OK, 1/1.
- `npm run test:l04-delivery:pg`: OK, 20/20.
- `npm run test:l05-delivery:pg`: OK, 1/1.
- `npm run test:l06-delivery:pg`: OK, 9/9.
- `npm run build`: OK, build Next.js concluído e 78 páginas estáticas geradas.

## Limites
Esta entrega não promete resultado financeiro, não executa pagamento ou cobrança real e não altera migrações históricas ou tipos existentes. Os dados dos testes são sintéticos e isolados em PostgreSQL descartável.

---

# Fatia aditiva de correção — FIN-13 (2026-10-01)

Base confirmada antes de escrever: `4ea35780bacc80bd228f6a970949a52e6f9504ba` (merge do PR #66), sem commits posteriores na main no momento da leitura. Branch de trabalho: `arena/01a0f9da-gruposegsystemseguranca`. Ambiente remoto Arena; a cópia local do proprietário não foi usada nem alterada.

## 1. Baseline reconfirmado na base atual
Resultados históricos do PR #65 não valem como prova do commit novo, então o baseline foi reexecutado em `4ea3578` **antes** de qualquer alteração: `node scripts/qa-wave0-static.mjs` 5/5 (001–133), `npm run typecheck` sem erros, `npm test` 196/196 e `npm run test:l07-delivery:pg` **27/27, exit 0, zero skips**.

## 2. Lacunas reproduzidas antes de corrigir
Os seis achados estáticos de [CONSOLIDACAO-L07-PRS-PENDENTES.md](CONSOLIDACAO-L07-PRS-PENDENTES.md) foram confirmados no código e convertidos em testes reais executados contra a base **sem correção**: 31 subtestes, **27 aprovados e 4 reprovados**, cada reprovação correspondendo a um achado (log de reprodução resumido em [EVIDENCIAS-ENTREGA-LOCAL.md](EVIDENCIAS-ENTREGA-LOCAL.md)).

| Achado | Confirmado em | Como foi reproduzido | Situação |
|---|---|---|---|
| 1. Edição de orçamento aprovado preservando a aprovação | `fin-budget-api.mjs` PATCH; gatilho da 132 só conferia transição | PATCH alterando premissas/receita de orçamento aprovado era aceito; `version` inexistente (`NaN`) | Corrigido |
| 2. Margem do cenário vinda do navegador | `handleBudgetScenarios` POST validava só a faixa −100..100 | cenário com `projected_margin_percent: 95` sobre receita 200000/custo 150000 era aceito | Corrigido |
| 3. Criação sem idempotência própria | POST `/api/fin/budgets` sem chave | criação sem `idempotency_key` retornava 201 (esperado 400); reenvio duplicava | Corrigido |
| 4. Histórico insuficiente para reconstruir revisões | 132 gravava só transição de status, com `changed_by_identity = approved_by_identity` | histórico sem snapshot, sem versão e sem autor do editor | Corrigido |
| 5. Erro de leitura virando lista vazia | `BudgetWorkspace.tsx` com `.catch(() => ({ budgets: [] }))` | GET 500 injetado no navegador exibia “Nenhum orçamento encontrado” | Corrigido |
| 6. UI sem jornada de revisão/aprovação/histórico | `BudgetWorkspace.tsx` só tinha dois formulários de cadastro | não havia seleção, ação nem histórico navegável | Corrigido |

## 3. Implementação
- **Migração aditiva `134-fin13-budget-revision-margin-idempotency.sql`** (próximo número livre; 001–133 intactas, a 132 **não** foi reescrita):
  - `fin_budgets`: `version`, `idempotency_key` (índice único parcial), `content_fingerprint`, `revision_reason`, `revised_by_identity`, `revised_at`, além de `total_margin_percent` e `margin_basis` **gerados** no banco;
  - `fin_budget_scenarios`: `computed_margin_percent` e `margin_basis` gerados, `margin_source` e a constraint `fin_scenario_margin_percent_matches_base`, que recusa percentual divergente de receita e custo;
  - `fin_budget_history`: `event_type`, `snapshot_before`, `snapshot_after`, `version_before`, `version_after`;
  - `fin_budget_guard()` substituída por `CREATE OR REPLACE`: congela conteúdo aprovado (`fin_budget_approved_content_locked`), admite `aprovado → em_revisao` apenas como revisão disciplinada (`fin_budget_revision_requires_reason_author_and_version`), impede renumerar versão e impede que rascunho/revisão carreguem aprovação antiga;
  - `fin_budget_history_capture()` substituída: passa a disparar também em alteração de conteúdo e grava snapshot, versões, motivo e **autor real**, recebido por GUC transacional (`seg.fin_budget_actor/event/reason`) na mesma transação da escrita.
  - Linhas antigas são tratadas explicitamente: orçamentos herdados ficam em `version=1` sem chave de idempotência; cenários herdados são marcados `margin_source='legado_informado'` conservando o número já gravado; histórico legado fica com `event_type`/snapshot nulos. As constraints novas entram `NOT VALID` justamente para **não** fingir validação retroativa.
- **`src/server/fin-budget-api.mjs`**:
  - criação exige `idempotency_key` (8–200) e grava a impressão do conteúdo; retry igual devolve **200 com `idempotent_replay: true`**, retry concorrente é resolvido pelo índice único (relê a linha vencedora) e a mesma chave com conteúdo diferente devolve **409 `idempotency_key_conflict`**;
  - edição ordinária de orçamento aprovado devolve **409 `approved_budget_locked_requires_revision`**;
  - `action: "revise"` exige `revision_reason` e identidade de sessão, incrementa a versão, retira `approved_by_identity`/`approved_at` e devolve o orçamento para `em_revisao`;
  - toda mutação exige `reason` (10–1000), que vai para o histórico imutável;
  - cenário recusa qualquer percentual vindo do cliente (**400 `margin_percent_not_accepted_calculated_from_revenue_and_cost`**) e grava o percentual calculado pelo próprio banco; receita zero e base incompleta ficam **sem percentual**, com `margin_basis` explicando, preservando os valores conhecidos;
  - novo `GET /api/fin/budget-history` (com os aliases `/api/{admin,crm}/hr/fin-budget-history`), sessão + papel financeiro/admin, TI somente leitura;
  - escrita sensível, histórico e auditoria permanecem na mesma transação, com rollback e `503 audit_unavailable` quando a auditoria falha.
- **`src/app/admin/financeiro/BudgetWorkspace.tsx`** reescrito: seleção por nome/protocolo, valores em R$ (`Intl.NumberFormat pt-BR`), detalhe com situação/versão/margem e base do cálculo, ações de envio à revisão, aprovação, rejeição, arquivamento e revisão com motivo, histórico navegável com autor/data/motivo/versões, erro de leitura visível com nova tentativa (sem mascarar como lista vazia) e campo de margem **removido** — a tela só mostra a pré-visualização do cálculo do servidor.
- **`server.mjs`**: rota e allowlist do histórico.

## 4. O que foi aproveitado dos PRs de referência
Nenhum PR foi mesclado, fechado ou teve branch apagada. O registro de aproveitamento está em [CONSOLIDACAO-L07-PRS-PENDENTES.md](CONSOLIDACAO-L07-PRS-PENDENTES.md), seção “Aproveitamento efetivo nesta fatia”.

## 5. Validações executadas em 2026-10-01 (ambiente remoto, dados sintéticos)
| Comando | Resultado |
|---|---|
| `npm ci` | 82 pacotes, 0 vulnerabilidades |
| `node scripts/qa-wave0-static.mjs` | 5/5; migrações 001–134 contínuas e registradas |
| `npm run typecheck` | 0 erros |
| `npm test` | 196/196, 0 skips |
| `npm run build` | sucesso |
| `npm run test:migrations:pg` | **134/134**, replay idempotente, clone e checksum negativo (`006` recusado, exit 1 tratado), 522 tabelas |
| `npm run test:l07-delivery:pg` (antes da correção) | 31 subtestes: 27 aprovados, **4 reprovados** — reprodução dos achados |
| `npm run test:l07-delivery:pg` (depois) | **31/31**, exit 0, zero skips, em duas execuções aprovadas. Entre elas houve uma execução 30/31 reprovada no subteste 18 (FIN-10, fora desta fatia) por queda do Chromium no `launch` (`signal=SIGSEGV`), sem asserção reprovada — ruído da máquina de 2 vCPU, detalhado em EVIDENCIAS-ENTREGA-LOCAL.md |
| GitHub Actions na PR #68 (`e729311`) | **5/5 workflows verdes**, incluindo `finance-postgres-browser`, que roda `test:migrations:pg` e `test:l07-delivery:pg` em runner limpo; o gate completo passou sem o ruído de Chromium observado na máquina de 2 vCPU |
| `npm run test:l03-delivery:pg` | 1/1 |
| `npm run test:l04-delivery:pg` | 20/20 |
| `npm run test:l05-delivery:pg` | 1/1 |
| `npm run test:l06-delivery:pg` | 9/9 |

Subtestes novos do gate L07 (4): aprovação congelada + revisão versionada + nova aprovação + histórico com snapshot + rollback de auditoria + papel indevido + ausência de obrigação financeira; margem calculada com receita zero e dados incompletos + trava equivalente no banco; idempotência sequencial, conflito de conteúdo e **retry concorrente de 6 requisições** com exatamente uma criação; jornada de navegador com erro de leitura visível, seleção por protocolo, revisão, nova aprovação, histórico e cenário sem campo de margem.

## 6. Diferenciação de estados
- **Implementação:** concluída nesta fatia.
- **Validação automática:** concluída, nos comandos acima, em PostgreSQL descartável, HTTP real e Chromium real, sem skips, sem remoção de asserção e sem aumento indiscriminado de timeout.
- **Aceite humano:** **pendente**. Nenhuma aprovação de Marcelo ou Andreia foi registrada.
- **Validação em Windows:** pendente. O ambiente desta sessão é Linux.

## 7. Limites desta fatia
Aprovar orçamento continua sendo decisão gerencial: não cria recebível, pagável, cobrança nem obrigação — isso é asserido por teste. Não foi iniciado L08, não foram fechadas as jornadas FIN-14..16 e o painel ADM-01..12 continua pendente. SMTP, hospedagem pública e transações externas reais seguem fora do escopo. A regra de “aprovador diferente do autor” e a exigência de dois cenários, presentes no PR #59, **não** foram adotadas: são política de negócio ainda não decidida pelo proprietário.
