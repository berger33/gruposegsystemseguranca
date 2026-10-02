# L07 — FIN-10 · despesas, reembolsos e compras com alçada, evidência e segregação

**Sessão:** `arena/01a0fa9e-gruposegsystemseguranca`

**Base confirmada:** `origin/main` e HEAD inicial em `bd794dc99bfc12a7e8a811783bda1234aeb4fe6b`, merge da PR #69 (revalidação FIN-09/FIN-11/FIN-12 e vínculo FIN-12 → FIN-04). Nenhum merge foi realizado nesta sessão.

**Escopo:** somente FIN-10 e a avaliação adaptativa dos resíduos úteis de #47 (conciliação) e #53 (despesas/alçadas). FIN-01..09, FIN-11..13 foram preservados e revalidados pelo mesmo gate. FIN-14..16, ADM-01..12 e L08 não foram iniciados. Nenhuma PR de referência foi integrada em bloco, copiada ou fechada.

## Diagnóstico antes da correção

- O rascunho 079 e a blindagem 129 já entregavam a entidade de despesas com alçada, mas: a CHECK de segregação 079 era rígida e impossível de diferenciar "aprovador distinto" de exceção política; não existia busca textual, formato R$ pt-BR, estado explícito de erro/vazio/política-pendente na UI, replay idempotente clasificado por constraint, snapshot permanente da alçada aplicada no histórico, trava de exclusão, duplicidade natural pendente, nem autoria derivada da sessão (o PATCH aceitava `approver_name` livre no body). As garantias de conciliação da #47 (FKs RESTRICT + exigência de movimento–conta) e de limite/exclusão/duplicidade da #53 estavam ausentes da main.
- Os testes novos foram escritos **antes** da implementação; executados contra a base intacta, o gate registrou 31/35 com falhas concentradas nos subtestes 17 (colisão de payload pré-existente com o novo índice natural), 19, 21 e 22. Nenhuma assertiva foi removida; apenas o payload senso-rígido do subteste 17 ganhou descrição própria e os fills do subteste 18 migraram de "75000" para "750,00" (formato obrigatório da UI, mesmos 75 000 centavos).

## Entrega

### Schema — migration aditiva `136-fin10-fin05-policy-history-locks.sql` (preserva 001–135; constraints novas `NOT VALID`; FKs da 136 recriadas com commit interno de idempotência para não prenderem retry do migrador)

- `fin_expenses.approval_limit_cents` e `fin_expense_history.authority_limit_cents`: o state machine grava, na decisão, o limite vigente da alçada aplicada (snapshot imutável no histórico).
- `fin_expense_approval_authorities.allow_self_approval BOOLEAN NOT NULL DEFAULT false` e segregação migrada da CHECK para o trigger `fin10-b5-expense-state-machine`: por padrão o solicitante não decide a própria despesa; a exceção só é válida quando a política do aprovador está ativa+aprovada e tem a flag explícita. Escrita SQL direta de autoaprovação devolve `fin_expense_segregation`.
- `CREATE UNIQUE INDEX fin_expenses_pending_natural_key` (parcial, só `pendente`): mesmo solicitante, tipo, categoria, valor, descrição e evidência de uma pendência não duplicam; após rejeição/cancelamento, um novo pedido pode ser criado.
- `fin_expense_no_delete`: delete de despesa é bloqueado no banco.
- Hardening FIN-05 (#47): FKs de `fin_conciliations` passam a `ON DELETE RESTRICT` (23503 ao tentar apagar movimento/recebível conciliados) e `fin05_conciliation_requires_movement_and_one_account` exige movimento bancário e no máximo uma conta efetiva (pagável opcional) — a CHECK original da 078 gerava falso positivo com contrato nulo.

### API — `src/server/fin-management-api.mjs` (rotas `/api/fin/expenses`, `:id` via PATCH em `/api/fin/expenses`, `/api/fin/expense-history`, `/api/fin/expense-authorities`)

- GET com busca `?q=` (mínimo 2 caracteres, escape de `%`/`_`, ILike em nome, protocolo, referência da evidência, categoria e descrição) preservando `status`/`expense_type`/`contract_id`.
- POST com replay idempotente sob concorrência: qualquer 23505 dos índices de idempotência, duplicidade natural ou evidência cai no braço de replay — releitura na **mesma conexão** pós-ROLLBACK (não esgota `DATABASE_POOL_SIZE=5`), comparação de conteúdo; igual → 200 `idempotent_replay`, diferente → 409 com o código da restrição.
- PATCH derivando `approver_name` de `auth_identities.display_name` da sessão (sem `COALESCE` externo), alçada `FOR UPDATE`, 403 `requester_cannot_decide` / `approval_self_not_allowed` / `approval_authority_exceeded`, e histórico com a alçada aplicada.
- `GET /api/fin/expense-authorities`: devolve a alçada, se houver, do chamador — a tela declara política ausente/inativa ou "decide até R$ X", nunca promete aprovação automática.
- TI permanece somente leitura; anônimo 401; mesma origem; mutação + histórico + auditoria na mesma transação (`audit_unavailable` 503 com rollback integral).

### UI — `src/app/admin/financeiro/ExpenseWorkspace.tsx` (aba canônica `expenses` de `/admin/financeiro`)

- Loading, `fin10-error` + `fin10-retry` (falha de leitura nunca é confundida com lista vazia), `fin10-empty`, banner `fin10-policy`, busca `fin10-search`+`fin10-search-apply`, histórico expansível `fin10-history-toggle-<id>`/`fin10-history-<id>` com "Alçada aplicada".

## Testes

- `tests/l07-delivery.integration.test.mjs`: subtestes 19–22 novos (35 no total, 0 skips): busca/replay/duplicidade/TI, política/segredação/snapshot/travas/efeito-financeiro-zero, garantias FIN-05 #47, e jornada Chromium ponta a ponta (política ausente, falha de leitura + retry, R$ "750,50", decisão por identidade distinta, histórico, asserts no banco).
- Regressões no mesmo SHA: `node --check` nos arquivos tocados, `node scripts/qa-wave0-static.mjs` 5/5, `npm run typecheck` 0 erros, `npm test` 196/196, `npm run build` verde, `npm run test:migrations:pg` 136/136 em dois passes + clone/checksum negativo, `npm run test:l07-delivery:pg` **35/35 em duas execuções consecutivas** (runs 9/10, mais uma terceira confirmação pós-limpeza, run 11), e `npm run test:l06-delivery:pg` **EXIT 0** (regressão L06 íntegra no mesmo SHA).
- Transparência: entre a primeira e a segunda execuções íntegras, dois runs intermediários reprovaram só o subteste 19 por `testTimeoutFailure` (120 s) — a causa (starvation do pool de 5 conexões no replay concorrente) foi eliminada pela releitura na mesma conexão; timeout, skips e assertivas não foram tocados.

## Avaliação adaptativa #47/#53

Tabela decisória completa (origem → destino → aproveitada/adaptada/adiada/descartada + motivo) em [`docs/CONSOLIDACAO-L07-PRS-PENDENTES.md`](./CONSOLIDACAO-L07-PRS-PENDENTES.md). Resumo: nenhum handler/migração/tela foi copiado; as garantias ausentes e compatíveis foram reimplementadas na migração e no handler atuais; o que dependia de política empresarial não decidida (aprovador automático por faixa) foi rejeitado e o mecanismo configurável fica vazio por padrão; o que já estava entregue na main (unicidade, fluxo de gateway, abas) foi preservado com prova, não reimplementado.

## Limitações

- Policy vazia por padrão: sem alçada ativa nenhuma despesa é aprovada (não há fallback); os textos da tela denunciam a pendência na workspace em vez de prometer resultado.
- Evidências = metadados sintéticos (`name/url/storage_key` validados), sem upload real; não há emissão fiscal, PSP, Pix/boleto, banco nem credencial real em nenhuma rota desta fatia.
- Aceite humano/Windows e ensaio executivo no equipamento-alvo permanecem pendentes. **L07 não está concluído e L08 não foi iniciado.**
