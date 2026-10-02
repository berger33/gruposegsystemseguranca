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

## Continuação — revisão da PR #80 e hardening CLI-05 (02/10/2026)

Estado remoto confirmado antes de editar: a PR #80
(`arena/l08-hardening-20261002`, head `a95872d`, troca o smoke Chromium
sintético por navegação HTTP real) está **aberta**, não mergeada; a `main`
oficial não a contém. Nenhum merge foi feito; esta continuação não tocou a
branch da PR #80.

A revisão requisito a requisito encontrou um gap real em CLI-05: a abertura de
chamado não era idempotente sob retry de rede e a gravação em
`auth_access_audit` era melhor-esforço, sem reverter a escrita de negócio em
falha — diferente do padrão fail-closed já usado em ADM-01..12. Migração
aditiva **139** adiciona `idempotency_key`/`content_fingerprint` a
`client_tickets` (único por conta); a criação do chamado passa a ocorrer em
uma única transação com a auditoria: retry concorrente não duplica, conteúdo
divergente sob a mesma chave devolve 409, e auditoria indisponível devolve 503
revertendo tudo. Prova: novo subteste em `client-space.integration.test.mjs`,
rodado via `test:l08-delivery:pg` (11/12 em duas execuções consecutivas
idênticas; o 12º subteste, smoke Chromium pré-existente, falhou nas duas por
limitação ambiental deste sandbox, não por código).

Os mesmos gaps de auditoria melhor-esforço em conta/grant/contrato/documento
(mesmo arquivo `client-space-api.mjs`) foram identificados e **ficam como
dívida explícita**, não corrigidos nesta continuação. CLI-06..15 e EXT-01..17
continuam não promovidos. 001–139 permanecem imutáveis; a próxima migração
livre passa a ser **140**. Aceite humano de Marcelo/Andreia sobre L07
permanece preservado; isto não é aceite novo nem homologação Windows, que
segue pendente para o fechamento integral do sistema.
