# L07 — FIN-06 · cobrança com responsável, lembretes, histórico e política aprovada

**Sessão:** `arena/01a0f795-gruposegsystemseguranca`
**Base confirmada:** `main`/`origin/main` @ `9de7c5ac6dea9b6822e3e4050519ff4048432f77`, merge da PR #48 (FIN-05).
**Escopo:** somente FIN-06. FIN-01..05 foram preservados (regressão L07 e L06 verdes); FIN-07..16 e ADM-01..12 não foram iniciados nesta sessão.

## Diagnóstico antes de escrever código

A migração `078-fin05-06-07-08-conciliacao-cobranca-fluxo-custo.sql` já continha as tabelas `fin_collection_policies`, `fin_collection_reminders` e `fin_collection_history`, e `src/server/fin-advanced-api.mjs` já expunha `handleCollectionPolicies`, `handleCollectionReminders` e `handleCollectionHistory`. Essa implementação era um rascunho de layout, não uma entrega endurecida:

- A auditoria era feita com `pool.query` solto, fora de transação. O wrapper de `auditLog` em `server.mjs` só é fail-closed quando recebe o `client` da transação (`if (client) return query();`); sem `client`, falhas de auditoria eram silenciosamente engolidas (`try { await query(); } catch {}`), quebrando a garantia fail-closed usada em FIN-01..05.
- Não havia validação de formato de UUID para `receivable_id`/`policy_id`/`id`; uma referência malformada caía em erro genérico de banco.
- A política de cobrança não tinha campos estruturados para tipo de lembrete, dias antes do vencimento e nível de escalonamento (citados explicitamente no escopo funcional); existia apenas um campo `rules JSONB` livre.
- Nada no schema garantia, por constraint de banco, que nenhuma ação de histórico pudesse bloquear o portal automaticamente (`is_blocking_action` não existia).
- O papel `comercial` tinha acesso de escrita a lembretes, fora do conjunto `financeiro`/`admin`/`ti` usado pelo restante do módulo financeiro.
- A criação de lembrete aceitava `policy_id` opcional e não validava a existência do recebível antes de inserir.

Por isso a implementação foi reescrita no mesmo arquivo (não um novo módulo), preservando as tabelas existentes e adicionando apenas as colunas comprovadamente necessárias.

## Entrega

- **Schema:** migração aditiva `db/migrations/125-fin06-collection-hardening.sql`:
  - `fin_collection_policies` ganha `reminder_type` (`fin_reminder_type`, obrigatório), `days_before` (0–365) e `escalation_level` (0–5), seguindo o mesmo padrão de `days_before`/`escalation_level` já usado em outros módulos (`036-con05-contract-alerts.sql`, `071/073-ops*`).
  - `fin_collection_history` ganha `is_blocking_action BOOLEAN NOT NULL DEFAULT false CHECK (is_blocking_action = false)`, no mesmo padrão de defesa em profundidade já usado para `is_real_message` em `fin_collection_reminders` (migration 078): o banco nunca aceita uma linha de histórico marcada como bloqueio, mesmo que a API tente.
  - Nenhuma tabela nova foi criada; nenhuma coluna existente foi removida ou teve seu tipo alterado.
- **API canônica:** `/api/fin/collection-policies`, `/api/fin/collection-reminders` e `/api/fin/collection-history`, com sessão de staff, papéis `admin`/`ti`/`financeiro` e same-origin (o papel `comercial`, que tinha acesso de escrita no rascunho, foi removido — fora do conjunto financeiro usado pelo resto do módulo).
  - **Política:** criação separada de aprovação. `POST` cria sempre com `is_approved=false`/`is_active=true`; `PATCH {id, is_approved:true}` aprova e grava `approved_by_identity`/`approved_at`; `PATCH {id, is_active}` liga/desliga. Nome é único (`409 duplicate_name`); aprovação repetida é `409 already_approved`.
  - **Lembrete:** exige `receivable_id` e `policy_id` válidos (UUID validado no servidor; `400` se malformado, `404` se inexistente), política precisa estar aprovada e ativa (`400 policy_not_approved` / `policy_inactive`), `responsible_name` (2–200), `due_date` válida, `reminder_type` dentre o enum e `content` (20–2000). `is_real_message=true` enviado pelo cliente é rejeitado explicitamente com `400 real_message_forbidden` — nunca é silenciosamente aceito como `true`. O recebível, quando encontrado, resolve `client_account_id`/`contract_id` por `JOIN` com `fin_accounts_receivable` (sem duplicar essas colunas na tabela de lembretes).
  - **Envio simulado:** `PATCH {id, status, reason}` move o lembrete para `lembrete_enviado`/`em_negociacao`/`acordado`/`cancelado` com motivo auditado (10–1000 caracteres); `sent_at` só é gravado quando o novo estado é `lembrete_enviado` (constraint já existente); repetir o mesmo estado é `409 already_in_status`.
  - **Histórico:** somente leitura por `receivable_id` (UUID validado). Toda escrita de política/lembrete grava uma linha de histórico na mesma transação; a tabela é imutável por trigger (`prevent_fin_collection_history_update_delete`, já existente desde 078) e `is_blocking_action` é sempre `false`.
- **Auditoria/falha:** toda escrita (criação/aprovação de política, criação/envio de lembrete) agora abre `pool.connect()`, usa o mesmo cliente para a escrita de negócio, o histórico e `auditLog({ client })`, e só faz `COMMIT` depois da auditoria. Se `audit_log` estiver indisponível, a resposta é `503 {"error":"audit_unavailable"}` e a transação inteira é revertida (nenhuma política, lembrete ou histórico parcial fica persistido).
- **UI real:** `/admin/financeiro` ganhou a aba **Cobrança** (`CollectionWorkspace.tsx`), com `data-testid` estáveis (`fin06-*`): criação de política (rascunho, não aprovada), aprovação, ativação/desativação, criação de lembrete vinculado a recebível + política aprovada, lista de lembretes mostrando "simulado/local" e nunca "mensagem real", envio simulado com motivo, e consulta de histórico por recebível mostrando "sem bloqueio automático" para cada entrada. O texto da tela declara explicitamente que não há e-mail, WhatsApp, SMS ou gateway reais, e que nenhuma ação bloqueia o portal automaticamente.

## Evidência reproduzível

Tudo foi executado no ambiente remoto Arena, com PostgreSQL embutido descartável, dados sintéticos, HTTP real e Chromium empacotado/Playwright real. O runner L07 recusa `DATABASE_URL` recebido, usa banco `seg_qa_l07` temporário e limpa o cluster e `.next/integration-l07` ao final.

### Baseline (antes de qualquer alteração)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 |
| `npm test` | 196/196 |
| `npm run test:l06-delivery:pg` | 9/9, exit 0 |
| `npm run test:l07-delivery:pg` | **8/8**, exit 0 |

A baseline estava verde; nenhuma falha foi mascarada ou ignorada.

### Depois da implementação

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5 (migrações 001–125) |
| `npm test` | 196/196 |
| `npm run test:migrations:pg` | exit 0; `125/125` migrações aplicadas/checksummed; o cenário negativo de checksum adulterado da migration 006 rejeita corretamente (`QA_CLONE_CHECKSUM_MISMATCH: 006 rejected (exit 1)`) dentro do runner — esse é o comportamento **esperado** do subteste negativo, e o processo externo termina com exit 0 |
| `npm run test:l06-delivery:pg` | 9/9, exit 0 (regressão FIN-01..05/OPS preservada) |
| `npm run test:l07-delivery:pg` (1ª rodada) | **10/10**, exit 0 |
| `npm run test:l07-delivery:pg` (2ª rodada) | **10/10**, exit 0 |
| `npm run build` | exit 0 |
| `git diff --check` | sem problemas de whitespace |

Os dois novos subtestes do gate L07 cobrem:

1. **`L07 FIN-06: política de cobrança aprovada, lembretes com responsável, histórico imutável e auditoria fail-closed`** (HTTP real): anônimo negado, papel fora de financeiro/admin/ti negado, origem externa negada, criação de política válida, duplicidade de nome rejeitada, tentativa de aprovação sem autorização rejeitada, aprovação válida e auditada (com dupla aprovação rejeitada), referências inválidas (UUID malformado é `400`, UUID inexistente é `404`), lembrete sobre política não aprovada rejeitado, conteúdo inválido rejeitado, responsável inválido rejeitado, `is_real_message=true` rejeitado, criação de lembrete válido com resolução de cliente/contrato via recebível, envio simulado (com motivo curto rejeitado e reenvio do mesmo estado rejeitado), histórico persistido e comprovadamente imutável (tentativa direta de `UPDATE`/`DELETE` no banco falha pelo trigger), ausência de bloqueio automático (`is_blocking_action=false` em 100% das linhas) e auditoria indisponível com `503`/rollback total (política, aprovação e lembrete).
2. **`L07 FIN-06: Chromium cria política, aprova, cria lembrete, envia simulado e mostra histórico sem bloqueio`**: jornada real na aba Cobrança — cria política, aprova, cria lembrete vinculado a recebível e política aprovada, confirma rótulo "simulado/local" na lista, registra envio simulado com motivo, e consulta o histórico confirmando o texto "sem bloqueio automático" (e a ausência do texto de alerta de bloqueio).

Os oito subtestes anteriores (FIN-01..05) permaneceram verdes nas duas rodadas, sem nenhuma alteração de asserção.

## Fronteiras e segurança

Não foram usados banco, credenciais, arquivos ou integrações de produção. Não há e-mail, WhatsApp, SMS, gateway, webhook ou qualquer mensagem real — `is_real_message` é sempre `false`, garantido por `CHECK` de banco desde a migration 078 e reforçado na validação de entrada da API. Não há bloqueio automático de portal — `is_blocking_action` é sempre `false`, agora também garantido por `CHECK` de banco (migration 125). Autorização e auditoria continuam decididas e aplicadas no servidor; sessão de staff, papel e same-origin são obrigatórios; a auditoria é fail-closed com rollback transacional. Aceite humano/Windows permanece pendente. Nenhuma PR foi mergeada nesta sessão. FIN-07..16 e ADM-01..12 continuam fora do escopo.

## Limitações conhecidas

- A UI de cobrança não envia nada externamente; "enviar" é apenas uma transição de estado local simulada.
- O gate não cobre todos os enums de `reminder_type`/escalonamento em combinação; cobre o fluxo funcional mínimo descrito no escopo do FIN-06.
- O wrapper `npm run test:migrations:pg` tem um subteste interno negativo (checksum adulterado da migration 006) que **deve** falhar para provar que a proteção funciona; isso é diferente de uma falha real do runner, e o processo externo termina com exit 0 quando esse comportamento ocorre como esperado.
