# L07 — FIN-07 · fluxo de caixa previsto/realizado e aging de recebíveis

**Sessão:** `arena/01a0f7a6-gruposegsystemseguranca`

**Base confirmada:** `origin/main` em `f4dfc21e1253e65ed85e58be6b035aed291e2ffe`, contendo o merge da PR #49. A PR #49 está `MERGED` e FIN-06 já está em `main`; nenhuma operação de merge foi feita nesta sessão.

**Escopo:** somente FIN-07. FIN-01..06 foram preservados e revalidados. FIN-08..16 e ADM-01..12 não foram iniciados.

## Entrega

- **Diagnóstico do rascunho 078:** as tabelas `fin_cashflow_snapshots` e `fin_aging_receivables` existiam, mas as rotas aceitavam valores sem validação suficiente, escreviam fora de transação auditada, retornavam `detail` de erro e não protegiam o vínculo canônico do aging. O aging também permitia apenas uma linha por recebível, não uma fotografia por competência, e não tinha valor pago/restante estruturado.
- **Schema:** migration aditiva `db/migrations/126-fin07-cashflow-aging-hardening.sql`:
  - adiciona `contract_id`, `amount_paid_cents` e `amount_remaining_cents` gerado ao aging;
  - substitui a unicidade antiga por `(receivable_id, competence_date)`;
  - faz backfill do contrato a partir de `fin_accounts_receivable`;
  - valida por trigger que conta, contrato, vencimento e bucket correspondem ao recebível e à competência canônicos.
- **Fluxo de caixa:** `POST/GET /api/fin/cashflow-snapshots` aceita somente `previsto`/`realizado`, datas ISO válidas, centavos inteiros não negativos e notas de 10–1000 caracteres quando fornecidas. `balance_cents` continua gerado pelo banco; competência/tipo duplicados retornam 409.
- **Aging:** `POST/GET /api/fin/aging-receivables` valida UUIDs, competência, vencimento canônico, conta do cliente, valores e pagamento. O servidor calcula `days_overdue`/bucket (`a_vencer`, `vencido_0_30`, `vencido_31_60`, `vencido_61_90`, `vencido_90_plus`) e o banco impede falsificação direta.
- **Auditoria:** toda criação FIN-07 usa `pool.connect()`, `BEGIN`, o mesmo cliente em `auditLog({ client })`, `COMMIT` somente após auditoria e rollback em qualquer falha. Auditoria indisponível retorna 503 sem linha parcial; respostas não expõem detalhes SQL.
- **UI real:** nova aba **Fluxo de caixa / Aging** no `/admin/financeiro`, em `CashflowWorkspace.tsx`, com snapshots previsto/realizado, vencidos, próximos pagamentos, saldo gerado e aging por recebível/competência. A tela declara dados sintéticos, sem integração bancária ou baixa automática.
- **Gate L07:** dois novos subtestes (HTTP real + Chromium) cobrem autorização, previsto/realizado, saldo, duplicidade, buckets, valor restante, vínculo canônico, filtros, auditoria fail-closed e jornada visual.

## Evidência reproduzível

Todos os gates PostgreSQL desta entrega usam cluster embutido descartável, dados sintéticos, HTTP real, sessão/cookie real e Chromium empacotado via Playwright. O runner recusa URLs de banco fornecidas pelo ambiente e limpa o cluster temporário e o diretório `.next/integration-l07`.

### Baseline antes da alteração

Após `npm ci` para instalar o lockfile (o checkout inicial não tinha `node_modules`), a baseline foi:

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrations 001–125 |
| `npm test` | 196/196 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run test:l07-delivery:pg` | 10/10 |

A tentativa anterior ao `npm ci` não foi tratada como falha de código: `tsc` e `embedded-postgres` estavam ausentes (`ERR_MODULE_NOT_FOUND`).

### Resultado final

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrations 001–126 |
| `npm test` | 196/196 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run test:l07-delivery:pg` — rodada 1 | **12/12**, exit 0 |
| `npm run test:l07-delivery:pg` — rodada 2 consecutiva | **12/12**, exit 0 |
| `npm run test:migrations:pg` | **verde**, exit 0; pass 1 e pass 2: 126/126 checksums, 517→517 tabelas; o cenário negativo clonado rejeitou a migration 006 como esperado e o clone foi restaurado |
| `git diff --check` | sem problemas de whitespace |

Os dez casos anteriores do L07 permaneceram verdes em ambas as rodadas. Os casos 11–12 são FIN-07 (HTTP + Chromium).

## Limitações

- Snapshots de fluxo e aging são registros sintéticos informados pelo papel financeiro; não há cálculo a partir de banco, gateway ou provedor externo.
- Não há cobrança, e-mail, WhatsApp, SMS, baixa ou atualização automática de recebíveis; `balance_cents` e `amount_remaining_cents` são derivados pelo PostgreSQL, mas o snapshot é explicitamente manual/auditado.
- `npm run test:migrations:pg` possui um cenário negativo deliberado que prova rejeição de checksum adulterado. Na execução final, os logs mostraram os dois passes completos, a rejeição esperada, a restauração do clone e exit 0 do wrapper.
- `npm run test:l06-delivery:pg` imprime erros de `audit_log` nos cenários que deliberadamente derrubam a auditoria; os 9 subtestes terminam PASS.
- Não foi feita alteração em FIN-01..06 além da exposição da nova aba FIN-07 no workspace comum; PR #49 não foi mergeada nesta sessão porque já estava mergeada em `main` antes do início.

## Continuação

O próximo trabalho autorizado é FIN-08, em sessão nova e somente após confirmação do estado da PR desta sessão. Não iniciar FIN-09..16 nem ADM-01..12.
