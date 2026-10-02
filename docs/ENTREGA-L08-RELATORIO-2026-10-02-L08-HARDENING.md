
## Série L08 hardening — 02/10/2026

- **Lote/base:** L08 hardening da primeira fatia, baseado na `main` oficial em `c16673c3c2a8f749ec476edb7a91dc62d2c1dfc`; PR #78 confirmada mergeada nesse merge commit e presente na main. Branch de trabalho: `arena/l08-hardening-20261002`.
- **Mudança:** o subteste Chromium deixou de usar apenas `setContent` sintético. Agora inicia o servidor real em loopback, navega por HTTP para `/cliente/entrar` com Chromium empacotado e verifica heading e campos reais. PostgreSQL continua descartável; não há sessão ou dado inventado no smoke.
- **Fonte/tabelas:** CLI-01..05 permanecem na fonte legada canônica: `auth_*`, `client_accounts`, `client_access_grants`, `client_contracts`, `client_documents`, `client_tickets` e auditorias. Nenhuma migração criada; 001–138 permanecem imutáveis; próxima livre: 139.
- **Prova automática L08:** 11/11 em duas execuções (segunda execução consecutiva também passou), incluindo 8 subtestes de isolamento/autorização/forged body/download/auditoria/revogação, inventário canônico e jornada Chromium real.
- **Regressões:** estático 5/5, typecheck OK, build exit 0. A execução unitária inicial no ambiente desta sessão teve falhas ambientais pré-existentes relacionadas à versão Node 20/dependências do conjunto de backup/homologação; não foram mascaradas nem alteradas. Windows não foi executado e continua pendente.
- **Classificação:** implementação local + validação automática Linux/PostgreSQL descartável. Aceite humano anterior de Marcelo e Andreia permanece preservado; isto não constitui aceite novo nem homologação Windows.
- **Não promovidos:** CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor restrito e integrações externas. Próximo passo: revisão humana da PR; merge somente após revisão, sem merge automático.
