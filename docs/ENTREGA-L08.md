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

## Série L08 hardening — 02/10/2026

- **Lote/base:** L08 hardening da primeira fatia, baseado na `main` oficial em `c16673c3c2a8f749ec476edb7a91dc62d2c1dfc`; PR #78 confirmada mergeada nesse merge commit e presente na main. Branch de trabalho: `arena/l08-hardening-20261002`.
- **Mudança:** o subteste Chromium deixou de usar apenas `setContent` sintético. Agora inicia o servidor real em loopback, navega por HTTP para `/cliente/entrar` com Chromium empacotado e verifica heading e campos reais. PostgreSQL continua descartável; não há sessão ou dado inventado no smoke.
- **Fonte/tabelas:** CLI-01..05 permanecem na fonte legada canônica: `auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`, `client_documents`, `client_tickets` e auditorias. Nenhuma migração criada; 001–138 permanecem imutáveis; próxima livre: 139.
- **Prova automática L08:** 11/11 em duas execuções (a segunda execução deverá ser registrada no relatório final desta série), incluindo 8 subtestes de isolamento/autorização/forged body/download/auditoria/revogação, inventário canônico e jornada Chromium real.
- **Regressões:** estático 5/5, typecheck OK, build exit 0. A execução unitária inicial no ambiente desta sessão teve falhas ambientais pré-existentes relacionadas à versão Node 20/dependências do conjunto de backup/homologação; não foram mascaradas nem alteradas. Windows não foi executado e continua pendente.
- **Classificação:** implementação local + validação automática Linux/PostgreSQL descartável. Aceite humano anterior de Marcelo e Andreia permanece preservado; isto não constitui aceite novo nem homologação Windows.
- **Não promovidos:** CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor restrito e integrações externas. Próximo passo: revisão humana da PR; merge somente após revisão, sem merge automático.
