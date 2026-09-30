# CRM-03 — revisão dedicada de deduplicação (política ANTES da rota)

Fatia vertical única desta sessão (`arena/01a0efec-gruposegsystemseguranca`),
partindo de `main @ c3d799c` (PR #31, CRM-01 mesclado). Este arquivo registra a
política **antes** de qualquer rota, conforme o método inegociável de L04.

## Problema honesto que a fatia fecha

A importação CSV (migração 015, `crm-api.mjs`) já detectava duplicatas na
prévia, mas **a revisão não existia de fato**:

1. A decisão por linha só podia ser enviada como um mapa solto `actions` no
   corpo do `POST /api/crm/imports/:id/commit` — não ficava persistida, não
   tinha autor, não tinha data e **não gerava trilha**. Quem decidiu manter uma
   duplicata era indistinguível de quem só apertou "confirmar".
2. Sem decisão registrada, o commit criava silenciosamente ou pulava
   silenciosamente conforme um default implícito (`action` calculado na
   prévia). Isso é o oposto de *revisável*.
3. O pré-cálculo de duplicata por nome usava `ILIKE` com o valor cru do CSV:
   uma célula com `%` ou `_` casava com empresas que não são a mesma.
4. As rotas de importação usavam o auxiliar de auditoria que engole falha
   (`try/catch` mudo): mutação sem trilha não revertia.

## Política decidida (fail-closed, sem bypass)

- **Papel:** a revisão de deduplicação é superfície comercial. Exige sessão de
  staff da família comercial (`comercial`, `admin`, `marcelo`, `ti`), igual a
  contatos/unidades. Papel fora da família recebe **403**, nunca 401. RH não é
  bypass.
- **Decisão explícita por linha:** só existem dois valores,
  `create` (importar mesmo assim, duplicata assumida) e `skip` (descartar).
  Não há "mesclar/atualizar" nesta fatia — mesclagem de registro existente é
  outra fatia e não será fingida aqui.
- **Só linha duplicada é decidível.** Linha `valid` não precisa de decisão e
  linha `invalid` **não pode** ser promovida por decisão (senão a revisão
  viraria bypass de validação): `409 row_not_duplicate`.
- **Só lote `pending` é decidível.** Lote `processing`, `completed` ou `failed`
  recusa a decisão com `409 batch_not_pending` — decisão pós-commit seria
  reescrita de história.
- **Commit fail-closed:** se existir ao menos uma linha `duplicate` sem
  decisão registrada, o commit é recusado com `409 pending_dedup_review` e o
  lote **permanece `pending`** (nada é criado). Não há default silencioso.
- **O corpo `actions` do commit deixa de ser aceito** (`400
  actions_not_accepted`): decisão só entra pela rota dedicada, que audita.
  Corpo vazio continua válido.
- **Autoria imutável:** `decided_by_id`/`decided_at` são do servidor. O cliente
  não envia autor nem data; campo desconhecido no corpo recebe
  `400 field_not_editable`. Redecidir a mesma linha enquanto o lote está
  `pending` é permitido e **re-audita** (a trilha guarda cada decisão).
- **Auditoria transacional:** a decisão grava
  `crm_import_row_decision` na mesma transação da escrita; falha de auditoria
  **reverte** a decisão e devolve **503**. O commit grava
  `crm_import_commit` também transacionalmente.
- **Curinga escapado:** o pré-cálculo por nome passa a usar
  `ILIKE ... ESCAPE '\'` com o padrão escapado, como o resto do CRM.
- **Nada de rota de exclusão de lote**, nada de edição do CSV depois da
  prévia, nada de reprocessar lote concluído: fora do escopo, declarado.

## Migração

Próxima livre: **116**, aditiva (`116-crm-03-dedup-review.sql`):

- colunas novas em `crm_import_rows`: `decision`, `decision_note`,
  `decided_by`, `decided_by_id`, `decided_at` (todas nulas por padrão — o
  passado não é reescrito);
- CHECK `NOT VALID` de coerência (`decision IN ('create','skip')` e decisão
  implica autor/data) — vale para escrita nova;
- reautorização **delimitada** da ação `crm_import_row_decision` no
  `auth_access_audit_action_check`, no mesmo padrão da 112/114/115: falha se a
  constraint pai sumir, nunca afrouxa, nunca redigita a lista.

`crm_import_create`, `crm_import_commit` e `crm_import_export` já estão
autorizadas (103); as outras 146 ações perdidas **continuam fora** por decisão
— são reautorizadas só junto do portão que as prova.

## Superfície

- `GET /api/crm/imports/:id/duplicates` — lista dedicada só das linhas
  duplicadas, com o registro casado e a decisão atual.
- `PATCH /api/crm/imports/:id/rows/:rowNumber` — grava a decisão.
- `POST /api/crm/imports/:id/commit` — passa a exigir revisão completa.
- `ImportDedupReview.tsx` em `/admin/crm`: lista as duplicatas do lote da
  prévia, mostra o registro existente casado, permite decidir linha a linha e
  só então confirmar a importação.

## Fora desta fatia (declarado)

Mesclagem/atualização do registro existente, deduplicação de contatos
(`type=contacts` continua sem criação no commit, como já era), revisão de
lotes antigos pela tela (a tela trata o lote recém-previsto), exclusão de
lote, reprocessamento e as 146 ações de auditoria restantes.
