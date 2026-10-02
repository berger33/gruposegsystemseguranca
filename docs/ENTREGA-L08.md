# Entrega L08 — primeira fatia CLI-01..05

Data: 2026-10-02. Lote: L08/CLI-01..05. Base: PR #77 mergeada em `06be226`.

## Limite e decisão

L07 está encerrado no escopo local e aceito humanamente por Marcelo e Andreia.
Isso não é homologação Windows: Windows permanece pendente e foi adiado pelo
proprietário para o fechamento integral do sistema. Os 80 órfãos continuam
protótipos e só podem ser promovidos por área com prova.

## Requisitos da fatia

| Requisito | Rota/API | Fonte canônica | Prova | Resultado |
|---|---|---|---|---|
| CLI-01 | `/cliente/entrar`, convite, recuperação, `/api/auth/*` | `auth_*` (003, 097–101) | client-access PG/HTTP | consolidado |
| CLI-02 | `/cliente/app/conta`, `/api/client/accounts` | `client_accounts`, `client_access_grants` (003) | client-space PG, A≠B e revogação | consolidado |
| CLI-03 | `/cliente/app/contratos`, `/api/client/contracts` | `client_contracts` (004) | escopo derivado da sessão | consolidado |
| CLI-04 | `/cliente/app/documentos`, listagem/download privado | `client_documents` (004), integridade 101 | bytes, headers e A≠B | consolidado |
| CLI-05 | `/cliente/app/chamados`, `/api/client/tickets` | `client_tickets` (004) e auditoria | protocolo, status, mensagens e isolamento | consolidado |

“Consolidado” nesta entrega significa a primeira fatia verificável localmente;
não é aceite de negócio nem homologação Windows.

## Gate

Criados `scripts/qa-l08-delivery-postgres.mjs`,
`tests/l08-delivery.integration.test.mjs`, `test:l08-delivery:pg` e
`.github/workflows/l08-delivery.yml`. O runner cria PostgreSQL descartável,
aplica 001–138, executa HTTP real e roda em série as integrações de autenticação
e espaço do cliente. Os subtestes cobrem A/B, leitura/escrita/download fora do
escopo, identidade/conta forjada, revogação, auditoria e smoke Chromium empacotado da entrada.
Não há dados reais, SMTP externo, PSP ou serviço externo.

CLI-06..15 e EXT-01..17 continuam `a_revalidar`/não promovidos. Nenhuma migração
nova foi necessária; a fonte legada continua única e explícita. Migrações 001–138
são imutáveis; a próxima livre continua sendo 139.

## Hardening da primeira fatia — sessão de continuação (02/10/2026)

Base confirmada nesta sessão: PR **#78 mergeada**, merge commit
**`c16673c3c2a8f749ec476edb7a91dc62d2c1dfc9`**, igual ao HEAD de `origin/main`.
“Consolidado” na tabela acima **não** virou aceite: a fatia foi revisada e
endurecida porque o gate passava sem provar os critérios do L08.

Correções desta sessão (detalhe em
[ENTREGA-L08-HARDENING-RELATORIO-2026-10-02.md](ENTREGA-L08-HARDENING-RELATORIO-2026-10-02.md)):

- auditoria dos fluxos sensíveis deixou de ser tolerante a falha: abertura de
  chamado e mudança de status gravam escrita + histórico + auditoria na **mesma
  transação**; falha devolve **503** e reverte tudo (sem sucesso parcial);
- abertura de chamado passou a ter **chave de idempotência, fingerprint e
  protocolo único**: cinco retries concorrentes produzem um chamado e um
  protocolo; a mesma chave com conteúdo diferente devolve **409**;
- download de documento privado grava `client_document_access_log` + auditoria
  na mesma transação **antes do primeiro byte**; falha no registro devolve 503
  sem entregar bytes;
- falha de leitura devolve 503 `retryable`; ausência de dado e escopo restrito
  são declarados (`dataAvailable`, `empty`, `emptyReason`) — nunca “zero”;
- a tela de chamados deixou de exibir erro em cima de um chamado criado com
  sucesso e passou a mostrar o protocolo;
- o smoke estático do Chromium foi substituído por **jornada real autenticada**:
  entrada, conta, contrato, documento privado baixado pela sessão do navegador e
  chamado aberto pela interface.

Migração **aditiva 139** (`139-cli04-05-idempotencia-protocolo-download-log.sql`)
com índices únicos parciais e CHECKs novas em `NOT VALID`. Migrações **001–138
continuam imutáveis**; a próxima livre passa a ser **140**. Fonte canônica única
mantida (`auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`,
`client_documents`, `client_tickets`, `client_document_access_log` e auditorias).

Gate `test:l08-delivery:pg`: PostgreSQL descartável com **001–139** aplicadas
pelo migrador oficial, HTTP real, Chromium empacotado, **24/24 em duas execuções
consecutivas**. Regressões no mesmo SHA: estático 5/5, typecheck OK, unitários
196/196, build exit 0, migrações 139/139 em dois passes (525 tabelas), L07 43/43
duas vezes, L03 1/1, L04 20/20, L05 1/1, L06 9/9.

CLI-06..15, EXT-01..17, fornecedor restrito, CLI-15 e os 80 órfãos de
`/admin/ti` **não foram promovidos**. Os aliases v2 sob `/api/client/*`
continuam staff-only e o gate prova que negam sessão de cliente.

Aceite humano da fatia: **pendente**. Homologação **Windows: pendente**, adiada
para o fechamento integral do sistema.
