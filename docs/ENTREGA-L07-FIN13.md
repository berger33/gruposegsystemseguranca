# Entrega L07 / FIN-13

**Orçamento gerencial e cenários de expansão com premissas explícitas — não prometer resultado**  
**Data:** 2026-10-01  
**Branch:** `arena/01a0f8c5-gruposegsystemseguranca`

## Escopo entregue

FIN-13 foi separado do rascunho conjunto FIN-13/14/15/16 e recebeu uma fatia aditiva, auditável e sem promessa de resultado:

- migração `132-fin13-budget-hardening.sql`;
- API canônica em `src/server/fin-management-api.mjs` e rotas FIN-13 em `server.mjs`;
- aba **Orçamento / Cenários** no workspace financeiro;
- consulta FIN-13 somente leitura em `/admin/ti`;
- dois novos subtestes L07, um HTTP/PostgreSQL e um Chromium;
- este relatório.

Nenhum resultado comercial, margem ou expansão é apresentado como garantido. Orçamentos e cenários permanecem marcados como estimativas e exibem o aviso de premissas explícitas e não promessa de resultado.

## Auditoria do rascunho

### `db/migrations/080-fin13-14-15-16-orcamento-export-fechamento-comissao.sql`

O rascunho já tinha os enums e as tabelas `fin_budgets` e `fin_budget_scenarios`, protocolo ORC-FIN, campos de premissas, `is_estimate`, aviso textual, margem em centavos e unicidade de cenário por orçamento. Porém:

- não havia trava de transição de status;
- `is_estimate` podia ser alterado para `false`;
- o aviso não era uma garantia de banco para novas escritas;
- `projected_margin_percent` podia ser informado sem conferência contra receita e custo;
- não existia histórico imutável de revisões/aprovações do orçamento;
- aprovação e data/aprovador não eram protegidos por um fluxo transacional FIN-13.

### Handlers existentes

A implementação anterior estava em `src/server/fin-budget-api.mjs`, com consultas e escritas fora de uma transação única, auditoria absorvida por `try/catch`, `UPDATE` sem `FOR UPDATE` e respostas que repassavam detalhes SQL em alguns caminhos. As rotas de FIN-13 apontavam para esse handler separado. A fatia entregue moveu os caminhos de orçamento/cenários/histórico para `fin-management-api.mjs`, mantendo FIN-14/15/16 fora do escopo desta entrega.

## Hardening de dados

A migração 132 é aditiva e não altera migrações históricas nem enums existentes.

### `fin_budgets`

- conserva o protocolo `ORC-FIN-YYYYMMDD-XXXX` do rascunho;
- adiciona checks de estimativa obrigatória e aviso explícito;
- trigger bloqueia `is_estimate=false`;
- fluxo permitido: `rascunho -> em_revisao -> aprovado | rejeitado | arquivado`, com arquivamento posterior de aprovado/rejeitado;
- aprovação exige `approved_by_identity` e `approved_at`;
- orçamento aprovado/rejeitado/arquivado não aceita edição dos campos de planejamento;
- histórico é criado automaticamente em cada criação/revisão/transição/aprovação.

Os checks novos sobre as tabelas pré-existentes são `NOT VALID`, conforme a política de preservar linhas legadas do rascunho; novas inserções e atualizações continuam sujeitas às regras, e o trigger aplica as travas de status/estimativa.

### `fin_budget_scenarios`

- mantém os cinco tipos: `conservador`, `base`, `otimista`, `expansao`, `pessimista`;
- exige vínculo ao orçamento, premissas e aviso de estimativa;
- adiciona `projected_margin_percent_calculated` como coluna gerada;
- `projected_margin_cents` continua sendo calculada pelo schema existente;
- `projected_margin_percent` é calculado pela API e o banco exige correspondência com a coluna gerada.

### `fin_budget_history`

A tabela registra snapshot anterior/seguinte, status, valores, premissas, aprovador, data, ator, motivo e número de revisão. Trigger imutável recusa `UPDATE` e `DELETE`; a FK impede apagar o orçamento enquanto houver histórico.

## API e segurança

- mutações usam `BEGIN`/`COMMIT`/`ROLLBACK` com um único client;
- revisão e criação de cenário usam `SELECT ... FOR UPDATE`;
- auditoria usa o client da transação; indisponibilidade responde `503 {"error":"audit_unavailable"}` e reverte tudo;
- erros são allowlistados (`invalid`, `duplicate`, `invalid_budget_transition`, `approval_audit_required`, entre outros códigos de domínio), sem `message`, `detail`, SQL ou stack trace;
- mutações exigem same-origin;
- sessão é obrigatória e o papel aceito é financeiro/`financeiro`, `admin` ou `ti`;
- `/admin/financeiro` é o único workspace que oferece escrita, revisão e aprovação;
- `/admin/ti` consulta orçamento e cenários, sem operações POST/PATCH de FIN-13.

Rotas canônicas adicionadas/endurecidas:

- `GET|POST|PATCH /api/fin/budgets`;
- `GET|POST /api/fin/budget-scenarios`;
- `GET /api/fin/budget-history`;
- aliases históricos `/api/admin/hr`, `/api/crm/hr` e `/api/hr` permanecem encaminhados ao mesmo handler.

## Interface

`src/app/admin/financeiro/BudgetWorkspace.tsx` oferece:

- formulário de orçamento com receita, custo, período e premissas;
- aviso persistente de estimativa sem promessa;
- lista e seleção de orçamentos;
- transições para revisão, aprovação, rejeição e arquivamento com motivo;
- criação dos cinco tipos de cenário;
- exibição da margem em centavos e percentual calculados;
- histórico imutável de revisões/aprovações.

## Gate L07

O gate passou de 22 para 24 subtestes. Os dois novos casos cobrem:

1. **HTTP/PostgreSQL:** autenticação, papel RH negado, same-origin, premissa obrigatória, estimativa fixa, protocolo, cenário/margem calculada, transições, aprovação auditada, histórico imutável e rollback quando `audit_log` fica indisponível;
2. **Chromium:** criação visual do orçamento, criação do cenário base, margem projetada e envio para revisão/aprovação no workspace financeiro.

## Validações

### Baseline executada antes da implementação

| Comando | Resultado |
| --- | --- |
| `npm ci` | OK |
| `npm run typecheck` | OK |
| `node scripts/qa-wave0-static.mjs` | 5/5 OK; migrações 001–131 |
| `npm test` | 196/196 OK |
| `npm run test:l07-delivery:pg` | 22/22 OK |

### Validação final

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `node scripts/qa-wave0-static.mjs` | **5/5 OK; migrações 001–132** |
| `npm test` | **196/196 OK** |
| `npm run test:migrations:pg` | **132/132 checksums em dois passes; clone isolado restaurado** |
| `npm run test:l07-delivery:pg` — 1ª execução | **24/24 OK** |
| `npm run test:l07-delivery:pg` — 2ª execução consecutiva | **24/24 OK** |
| `npm run test:l03-delivery:pg` | 1/1 OK |
| `npm run test:l04-delivery:pg` | 20/20 OK |
| `npm run test:l05-delivery:pg` | 1/1 OK |
| `npm run test:l06-delivery:pg` | 9/9 OK |
| `npm run build` | OK |

A mensagem de falha de checksum exibida durante `test:migrations:pg` é o ensaio negativo esperado no clone isolado; o comando terminou com exit 0 e confirmou a restauração.

## Controle de entrega

A branch foi mantida fixa em `arena/01a0f8c5-gruposegsystemseguranca`. O commit e o PR contra `main` são realizados após a revisão final deste relatório e das validações acima.
