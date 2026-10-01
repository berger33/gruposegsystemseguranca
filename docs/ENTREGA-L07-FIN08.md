# L07 — FIN-08 · custos por cliente, contrato e posto

**Sessão:** `arena/01a0f7c4-gruposegsystemseguranca`

**Base confirmada:** `origin/main` e HEAD inicial em `095edb5177e323e0a8f344573efd1bec7af293ad`, merge da PR #50. As PRs #49 (FIN-06) e #50 (FIN-07) estavam `MERGED` antes desta sessão; nenhum merge foi realizado aqui.

**Escopo:** somente FIN-08. FIN-01..07 foram preservados e revalidados. FIN-09..16 e ADM-01..12 não foram iniciados.

## Entrega

- **Diagnóstico do rascunho 078:** `fin_cost_imports` e `fin_costs` já existiam, mas as rotas aceitavam JSON inválido silenciosamente, não validavam referências/datas/inteiros com rigor, escreviam fora de transação, expunham detalhes SQL e não revertiam quando a auditoria falhava. Conta, contrato, posto, importação, origem e competência podiam divergir; o percentual documentado não determinava nem protegia o valor alocado.
- **Schema:** migration aditiva `127-fin08-cost-allocation-hardening.sql`:
  - registra `source_amount_cents` e `import_record_key`;
  - torna cada linha de uma importação idempotente por `(import_id, import_record_key)`;
  - mantém linhas históricas do rascunho legíveis e aplica as novas garantias às novas escritas;
  - valida em trigger conta obrigatória, contrato pertencente à conta e posto presente no escopo canônico `cli_contract_scopes`;
  - exige que origem e competência coincidam com a importação, respeita seus limites declarados e confere `amount_cents = round(source_amount_cents × rateio_percent / 100)`.
- **API:** `GET/POST /api/fin/cost-imports` e `GET/POST /api/fin/costs` validam fontes, datas ISO, centavos inteiros, UUIDs, metadados, descrições e regra/percentual de rateio. Listagens aceitam filtros validados e a importação mostra totais/registros já alocados.
- **Idempotência e referências:** `storage_key` impede importação repetida; `import_record_key` impede linha repetida. Conta, contrato, posto, colaborador opcional e importação são verificados antes da escrita; o banco repete as garantias canônicas para escrita direta.
- **Auditoria:** criações usam `pool.connect()`, `BEGIN`, o mesmo cliente em `auditLog({ client })` e `COMMIT` somente após auditoria. Falha da auditoria retorna 503 e faz rollback; respostas não expõem mensagens SQL.
- **UI real:** aba **Custos / Rateio** em `/admin/financeiro`, implementada por `CostAllocationWorkspace.tsx`, registra metadados de importação e aloca custos sintéticos de pessoal, equipamentos, materiais, supervisão ou outros por cliente/contrato/posto.
- **Fronteira explícita:** a UI e API não leem arquivos, folha, estoque ou integrações externas. URLs e nomes são somente metadados sintéticos locais.
- **Gate L07:** dois subtestes novos (HTTP e Chromium) elevam o gate de 12 para 14 casos e cobrem autorização, same-origin, idempotência, referências canônicas, cálculo protegido, filtros, trigger de banco, auditoria fail-closed/rollback e jornada visual.

## Evidência reproduzível

Todos os gates PostgreSQL usam cluster embutido descartável e somente dados sintéticos. O L07 usa HTTP real, sessão/cookie real, Next local e Chromium empacotado pelo Playwright; o runner recusa banco fornecido pelo ambiente.

### Baseline antes da alteração

O checkout iniciou sem `node_modules`; a primeira tentativa observou `tsc` e `embedded-postgres` ausentes e não foi interpretada como falha de código. Após `npm ci` pelo lockfile:

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrations 001–126 |
| `npm test` | 196/196 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run test:l07-delivery:pg` | 12/12 |

### Validação final

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `node scripts/qa-wave0-static.mjs` | 5/5, migrations 001–127 |
| `npm test` | 196/196 |
| `npm run test:l06-delivery:pg` | 9/9 |
| `npm run test:l07-delivery:pg` — rodada 1 | 14/14, exit 0 |
| `npm run test:l07-delivery:pg` — rodada 2 consecutiva | 14/14, exit 0 |
| `npm run test:migrations:pg` | verde, migrations 001–127 verificadas em dois passes e cenário negativo de checksum rejeitado/restaurado |
| `npm run build` | exit 0 |
| `git diff --check` | limpo |

Uma execução de desenvolvimento anterior terminou 13/14 porque a asserção visual leu a tabela antes do recarregamento assíncrono; o banco já continha o valor correto. O teste passou a aguardar a linha renderizada, sem mudança funcional, antes das duas rodadas finais consecutivas.

## Limitações

- Não há importação real de CSV/planilha, folha de pagamento, inventário, ERP, supervisão, banco ou gateway; são metadados e valores sintéticos digitados pelo papel financeiro.
- `source_equipment_id` e `supervision_id` permanecem referências UUID sintéticas sem catálogo canônico próprio no rascunho 078. Conta, contrato e posto são canônicos; colaborador é verificado quando informado.
- O limite da importação controla quantidade e soma dos valores **alocados**; o valor de origem e o percentual continuam disponíveis para conferência humana.
- Linhas históricas eventualmente criadas pelo rascunho 078 são preservadas. As novas restrições `NOT VALID` não reescrevem nem certificam retroativamente esses dados; todas as novas inserções são protegidas pelo `CHECK` e pelo trigger.
- Aceite humano/Windows permanece pendente.

## Continuação

O próximo trabalho possível é FIN-09, somente em nova sessão e após confirmação do estado da PR desta entrega. Não iniciar FIN-10..16 nem ADM-01..12 sem novo escopo explícito.
