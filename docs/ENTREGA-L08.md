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

## L08 — revisão da PR #80 e hardening CLI-04/CLI-05 (02/10/2026)

Base `main` `c16673c3c2a8f749ec476edb7a91dc62d2c1dfc9`. PR #80 revisada:
**OPEN**, sem merge, head `a95872de2a29d9ea39773a942cd9e3f7e91bfa4d`; validada
nesta sessão em worktree com L08 11/11 em duas execuções consecutivas. Nenhum
merge automático — decisão humana.

Sessão `arena/01a0fea1-gruposegsystemseguranca`. A revisão requisito por
requisito encontrou, na primeira fatia, escrita de chamado fora de transação
com auditoria fail-open, sem idempotência, log de download após os bytes,
auditoria de status admin após o COMMIT e a UI de chamados exibindo sucesso
como erro (campo `ok` inexistente). Hardening aditivo aplicado:

| Item | Antes | Depois |
|---|---|---|
| `POST /api/client/tickets` | INSERT e depois auditoria (falha engolida), sem idempotência | escrita + auditoria na MESMA transação; falha de auditoria → ROLLBACK → 503; `idempotency_key` opcional (8–200) com replay 200 mesmo `ticketId`, conflito 409 `idempotency_key_conflict`, corrida resolvida por UNIQUE (23505 → relê a linha vencedora) |
| Download privado (`/api/client/documents/:id/download`) | log gravado depois dos bytes | log ANTES de qualquer byte; falha de auditoria → 503 e zero bytes |
| `PATCH /api/admin/tickets/:id` | auditoria após o COMMIT | auditoria dentro da mesma transação da escrita |
| UI `/cliente/app/chamados` | sucesso exibido como erro (esperava `payload.ok`) | reconhece `ok`/`ticketId`, envia `idempotency_key` por tentativa, retry de rede reutiliza a mesma chave, replay/409 com mensagens honestas |

Migração aditiva **139** criada (tabela canônica `client_tickets`; CHECKs NOT
VALID + VALIDATE; índice único parcial por conta+autor+chave). 001–138
imutáveis; próxima livre: **140**. Migrações legadas 003–005 continuam a fonte
canônica de CLI-01..05.

Gate `test:l08-delivery:pg`: 11→**12 subtestes** (novo: duas requisições
simultâneas com a mesma chave → mesmo protocolo, 1 linha, 1 auditoria; replay;
409; escopo B negado com a mesma chave; contrato sem chave preservado), em
**duas execuções consecutivas 12/12**. Novo unitário com injeção de falha
(atomicidade, 503+rollback, replay, 409, corrida, log-antes-dos-bytes):
205/205 na suíte. Regressões no mesmo conteúdo: estático 5/5 (001–139),
typecheck 0, build 0, migrações 139/139 (524 tabelas, clone/checksum negativo),
L07 43/43 duas vezes consecutivas (uma execução anterior 42/43, transitória,
registrada), L03 1/1, L04 20/20, L05 1/1, L06 9/9 em série. Uma falha
intermediária desta sessão (fixture de integração sem a 139) foi corrigida sem
mascarar assertivas.

Classificação: implementação local + validação automática Linux/PostgreSQL
descartável; não é aceite humano nem homologação Windows. CLI-06..15 e
EXT-01..17 continuam `a_revalidar`/não promovidos; órfãos seguem protótipos.
Escritas administrativas do espaço do cliente com auditoria sequencial
fail-open permanecem pendência explícita para a próxima fatia.
