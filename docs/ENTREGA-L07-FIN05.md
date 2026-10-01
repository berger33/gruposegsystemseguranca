# L07 — FIN-05 · conciliação bancária sintética

**Sessão:** `arena/01a0f77c-gruposegsystemseguranca`
**Base confirmada:** `main`/`origin/main` @ `588b48f12b85fd07e2ca575e56f9b11ba97a1d67`, merge da PR #46.
**Escopo:** somente FIN-05. FIN-01..04 foram preservados; FIN-06..16 e ADM-01..12 não foram iniciados nesta sessão.

## Entrega

- **Schema:** migração aditiva `db/migrations/124-fin05-conciliation-hardening.sql`. `storage_key` do extrato e `bank_ref` da transação já eram únicos; a migração também torna `bank_transaction_id` único entre conciliações e impede valores conciliados negativos em escrita direta.
- **API canônica:** `/api/fin/bank-statements`, `/api/fin/bank-transactions` e `/api/fin/conciliations`, com sessão de staff, papéis `admin`/`ti`/`financeiro` e same-origin. Não foi ampliado acesso para cliente, RH ou aliases históricos.
- **Extrato/transação:** importação apenas de metadados e dados sintéticos; protocolo `EXT-FIN-*`; duplicidade de `storage_key` e `bank_ref` retorna 409; a inclusão da transação atualiza os totais do extrato na mesma transação.
- **Conciliação:** exige exatamente um recebível ou pagável e uma transação bancária existente. Cria `sugerida` com fonte, motivo e valor; confirmação `conciliada` marca a transação com `is_conciliated` e data; divergência exige justificativa; resultado final não pode ser confirmado duas vezes.
- **Auditoria/falha:** extrato, transação e sugestão/confirmação auditam pelo mesmo cliente PostgreSQL antes do commit. Se `audit_log` ficar indisponível, respondem `503 {"error":"audit_unavailable"}` e revertem todos os efeitos parciais.
- **UI real:** `/admin/financeiro` ganhou a aba **Conciliação bancária**, com importação sintética de extrato, inclusão de transação, seleção de conta/transação, sugestão e confirmação/divergência. A tela declara que não usa banco, provedor, gateway ou arquivo de produção.

## Evidência reproduzível

Tudo foi executado no ambiente remoto Arena, com PostgreSQL embutido descartável, dados sintéticos, HTTP real e Chromium empacotado/Playwright real. O runner recusa `DATABASE_URL` recebido, usa banco `seg_qa_l07` temporário e limpa o cluster e `.next/integration-l07` ao final.

| Comando | Resultado |
|---|---|
| `npm run test:l07-delivery:pg` | **8/8, exit 0** |
| `npm run test:l07-delivery:pg` novamente | **8/8, exit 0** |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | 196/196 |
| `node --test tests/l07-delivery.integration.test.mjs` sem banco | 8 testes reconhecidos, pulados por ausência deliberada de `RUN_DATABASE_INTEGRATION` |

Os dois novos subtestes FIN-05 cobrem autorização negativa, importação, duplicidade, referências inválidas, sugestão, confirmação, repetição de confirmação, rollback por auditoria indisponível e a jornada completa no Chromium. Os seis subtestes anteriores permaneceram verdes nas duas rodadas.

## Fronteiras e segurança

Não foram usados banco, credenciais, arquivos ou integrações de produção. Não há upload real, conexão bancária, provedor, gateway, webhook, cobrança automática ou mensagem externa. Aceite humano/Windows permanece pendente. Nenhuma PR foi mergeada.
