# Entrega L07 — FIN-13

## Escopo e estado

Esta continuação entrega somente **FIN-13 — orçamento gerencial e cenários**.
L07 como bloco inteiro continua em execução; FIN-14, FIN-15, FIN-16 e ADM-01..12
não foram iniciados nesta fatia. O aceite humano e a validação Windows continuam
separados da validação automática local/remota.

Os dados de QA são sintéticos e o gate usa PostgreSQL descartável, HTTP real e
Chromium real. Nenhuma aprovação cria cobrança, pagamento, recebível, despesa,
meta ou obrigação automaticamente.

## O que existia e o que mudou

- A migração aditiva `134-fin13-budget-revisions-idempotency-margin.sql` preserva
  001–133 e acrescenta a versão do orçamento, chave de idempotência, snapshots e
  classificação de eventos no histórico, cálculo de margem no banco e guardas
  de revisão/auditoria. Registros legados não são reescritos para fabricar
  autoria ou evidência.
- `src/server/fin-budget-api.mjs` agora normaliza datas `Date` do PostgreSQL,
  exige motivo para aprovação e revisão, recusa edição ordinária de aprovado,
  cria revisão com autor/motivo e versão nova, remove a aprovação anterior,
  mantém a transição controlada e trata retry concorrente pela inserção
  `ON CONFLICT DO NOTHING` compatível com o índice único parcial.
- Idempotência compara a chave com o conteúdo e a identidade real: retry
  equivalente retorna o mesmo orçamento, enquanto a mesma chave com conteúdo
  diferente retorna 409. O servidor não aceita margem enviada como fonte de
  verdade.
- `server.mjs` expõe `GET /api/fin/budget-history` e seus aliases canônicos;
  a leitura devolve snapshots, identidade, data, versão e motivo. A trilha é
  imutável no banco. Mutação, histórico e `auditLog({ client })` usam a mesma
  transação; auditoria indisponível retorna 503 e faz rollback.
- `BudgetWorkspace.tsx` mantém a aba navegável em `/admin/financeiro`, com
  seleção por nome/protocolo, revisão explícita, aprovação, histórico, moeda
  BRL, margem somente de servidor, estados incompleto/receita zero e erros
  visíveis. Falha de leitura não é renderizada como “Nenhum ... encontrado”.
- `src/server/pglite-pool.mjs`, manifesto PG, gate L07 e verificação estática
  registram a nova migration 134. O runner aceita `QA_TEST_NAME_PATTERN` apenas
  para diagnóstico isolado; o comando padrão executa os 28 subtestes.

## Critérios demonstrados no gate FIN-13

O subteste HTTP prova 401 anônimo, 403 para papel indevido, same-origin,
TI somente leitura, premissas obrigatórias, transição inválida, motivo de
aprovação, edição ordinária recusada, revisão com versão 2 e aprovação removida,
cenários permitidos, margem calculada ignorando percentual do cliente, lacuna
explícita, receita zero, retry concorrente idempotente, conflito da mesma chave,
histórico imutável, snapshot/autor/data/motivo, escrita direta protegida pelo
banco e rollback integral quando a auditoria falha. Também verifica que nenhum
compromisso financeiro automático aparece.

O subteste Chromium cria a estimativa e o cenário pela aba financeira, valida no
banco margem `33.33` com status `calculada`, percorre a troca de aba e força uma
falha HTTP real de leitura ao renomear temporariamente a tabela no PostgreSQL
descartável: a interface apresenta erro e não a mensagem de lista vazia. A margem não tem campo editável na interface.

## Validações executadas nesta sessão

| Verificação | Resultado observado |
|---|---|
| `npm run typecheck` | aprovado |
| `node scripts/qa-wave0-static.mjs` | 5/5; migrações 001–134 contínuas e registradas |
| `npm test` | 196/196 |
| `npm run test:migrations:pg` | 134/134; primeira aplicação/replay, checksum negativo e clone; 522 tabelas; `QA_MIGRATIONS_SECOND_EXIT=0` |
| `npm run build` | aprovado; 78 páginas geradas |
| `npm run test:l07-delivery:pg` | **28/28**, PostgreSQL descartável, HTTP real e Chromium real; `L07_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l03-delivery:pg` | 1/1; `L03_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l04-delivery:pg` | 20/20; `L04_DELIVERY_TEST_EXIT: 0` na reexecução após flutuação de Chromium |
| `npm run test:l05-delivery:pg` | 1/1; `L05_DELIVERY_TEST_EXIT: 0` |
| `npm run test:l06-delivery:pg` | 9/9; `L06_DELIVERY_TEST_EXIT: 0` |
| `git diff --check` | limpo |

A execução integral final desta sessão terminou em **28/28**, sem skips; os
logs de `HTTP_5XX ... audit_unavailable` pertencem aos cenários negativos de
rollback e foram validados como respostas 503 com estado preservado. Houve uma
execução anterior com SIGSEGV de Chromium em uma suíte de regressão; ela não foi
contabilizada, e a reexecução de L04 terminou 20/20.

## Limites honestos

Não houve aceite humano, Windows, produção, SMTP, hospedagem pública ou
transação externa real. FIN-14..16 e L08 não foram iniciados. FIN-13 está `pronto_local` no checklist técnico após o gate integral verde e
as regressões desta branch; mesmo assim o aceite humano permanecerá pendente.
