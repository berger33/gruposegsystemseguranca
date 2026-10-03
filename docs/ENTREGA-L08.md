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
| CLI-04 | `/cliente/app/documentos`, listagem/download privado | `client_documents` (004), integridade 101, idempotência 139 | bytes, headers e A≠B | consolidado |
| CLI-05 | `/cliente/app/chamados`, `/api/client/tickets` | `client_tickets` (004), histórico/idempotência 139 e auditoria | abertura, status, resposta administrativa e isolamento | consolidado |

“Consolidado” nesta entrega significa a primeira fatia verificável localmente;
não é aceite de negócio nem homologação Windows.

## Gate

Criados `scripts/qa-l08-delivery-postgres.mjs`,
`tests/l08-delivery.integration.test.mjs`, `test:l08-delivery:pg` e
`.github/workflows/l08-delivery.yml`. O runner cria PostgreSQL descartável,
aplica 001–139, executa HTTP real e roda em série as integrações de autenticação
e espaço do cliente. Os subtestes cobrem A/B, leitura/escrita/download fora do
escopo, identidade/conta forjada, revogação, auditoria e smoke Chromium empacotado da entrada.
Não há dados reais, SMTP externo, PSP ou serviço externo.

CLI-06..15 e EXT-01..17 continuam `a_revalidar`/não promovidos. Nenhuma migração
nova foi necessária; a fonte legada continua única e explícita. Migrações 001–139
são imutáveis; a próxima livre é 140.

## Série L08 hardening — 02/10/2026

- **Lote/base:** L08 hardening da primeira fatia, baseado na `main` oficial em `c16673c3c2a8f749ec476edb7a91dc62d2c1dfc`; PR #78 confirmada mergeada nesse merge commit e presente na main. Branch de trabalho: `arena/l08-hardening-20261002`.
- **Mudança:** o subteste Chromium deixou de usar apenas `setContent` sintético. Agora inicia o servidor real em loopback, navega por HTTP para `/cliente/entrar` com Chromium empacotado e verifica heading e campos reais. PostgreSQL continua descartável; não há sessão ou dado inventado no smoke.
- **Fonte/tabelas:** CLI-01..05 permanecem na fonte legada canônica: `auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`, `client_documents`, `client_tickets` e auditorias. Nenhuma migração criada; 001–138 permanecem imutáveis; próxima livre: 139.
- **Prova automática L08:** 11/11 em duas execuções (a segunda execução deverá ser registrada no relatório final desta série), incluindo 8 subtestes de isolamento/autorização/forged body/download/auditoria/revogação, inventário canônico e jornada Chromium real.
- **Regressões:** estático 5/5, typecheck OK, build exit 0. A execução unitária inicial no ambiente desta sessão teve falhas ambientais pré-existentes relacionadas à versão Node 20/dependências do conjunto de backup/homologação; não foram mascaradas nem alteradas. Windows não foi executado e continua pendente.
- **Classificação:** implementação local + validação automática Linux/PostgreSQL descartável. Aceite humano anterior de Marcelo e Andreia permanece preservado; isto não constitui aceite novo nem homologação Windows.
- **Não promovidos:** CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor restrito e integrações externas. Próximo passo: revisão humana da PR; merge somente após revisão, sem merge automático.

## Hardening transacional CLI-01..05 após PR #80 — 02/10/2026

Esta série parte da `main` oficial em `52afebb1097d60a383c7219e7f3fe927a52ba3a6`
e não muda o limite funcional do lote. A migração aditiva
`139-l08-client-space-atomic-idempotency.sql` preserva 001–138 e acrescenta:

- chave de idempotência + fingerprint para `client_tickets` e
  `client_documents`, com unicidade por identidade autenticada;
- identidade individual no histórico de status e histórico inicial da abertura
  do chamado;
- compatibilidade das linhas legadas, sem reescrever migração anterior.

As mutações canônicas de acesso, vínculo, cadastro, contrato, documento, chamado
e MFA passam a concluir negócio/histórico/auditoria na mesma transação. Falha da
auditoria obrigatória devolve `503 audit_unavailable`, sem cookie, arquivo,
header privado ou mutação parcial. Upload que falha antes do commit remove o
arquivo recém-gravado. Como PostgreSQL e filesystem não compartilham transação
distribuída, não se declara eliminação de órfão no caso de queda abrupta do
processo entre a gravação e o rollback; o que está provado é a limpeza dos
caminhos de erro controlados.

O download privado lê e valida o buffer, conclui a auditoria e só depois envia
headers e bytes. A prova real HTTP cobre A≠B, bytes exatos, headers seguros,
falha pré-header e retry.

Chamados e documentos exigem `Idempotency-Key`: replay idêntico devolve o mesmo
ID, reuso divergente devolve `409 idempotency_conflict` e seis requisições
simultâneas deixam uma linha, um histórico/arquivo e uma auditoria. Os clientes
React mantêm a mesma chave após falha de transporte/servidor. As tabelas e APIs
v2 (`cli_tickets_v2`, mensagens e anexos v2) continuam fora desta promoção; a
API legada canônica não expõe mutações de mensagem/anexo nem protocolo e este
documento não as apresenta como comprovadas.

O gate L08 agora inclui a jornada CLI-01 inteira: convite, aceite, confirmação,
login, sessão expirada/revogada, recuperação/reset, logout e MFA. Há injeção de
falha de auditoria com PostgreSQL real para cada fluxo alterado, sempre via HTTP
real. O runner permanece descartável, com dados sintéticos, SMTP de captura
local autocontido na jornada de acesso e Chromium empacotado navegando na rota
real `/cliente/entrar`.

Permanecem fora do escopo: CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor
restrito, CLI-15, integrações externas e qualquer API v2 não provada. A
classificação continua sendo implementação local + validação automática Linux
com PostgreSQL descartável; não equivale a novo aceite humano nem homologação
Windows.

## Estados de leitura CLI-02..05 — 03/10/2026

Sobre a base oficial `31834ec`, a área cliente passou a tratar falha de
`/api/client/accounts` como barreira: nenhuma subpágina converte erro em “sem
vínculo”, e o retry recarrega sessão/contas antes de exibir conteúdo. Contratos,
documentos, chamados e resumo agora limpam estado anterior, distinguem erro de
vazio/zero, oferecem `Tentar novamente` e abortam ou ignoram respostas obsoletas
na troca de conta.

O gate L08 passa de 50 para 51 subtestes. A nova jornada Chromium usa a sessão
real criada no PostgreSQL descartável, abre `/cliente/app/contratos`, verifica o
503 controlado de contas e recupera o contrato real após retry. O inventário do
gate confere estruturalmente os estados das quatro leituras; não se afirma
jornada Chromium individual de falha para todas elas nesta série.

Nenhuma migração foi criada: 001–139 permanecem imutáveis e a próxima livre é
140. Fontes canônicas e autorização por sessão/grant permanecem inalteradas.
CLI-06..15, EXT-01..17, v2, órfãos e integrações externas seguem fora do escopo.
Esta é implementação local com validação automática Linux, não aceite humano
novo nem homologação Windows.
