# Relatório da sessão L08 — 2026-10-02

- **Lote:** L08, primeira fatia CLI-01..05.
- **Jornada:** entrada do cliente, conta, contrato, documento privado e chamados,
  com autenticação/convite/recuperação e escopo A/B.
- **Promovidos/consolidados:** CLI-01, CLI-02, CLI-03, CLI-04 e CLI-05, sobre
  tabelas legadas 003–005 e hardening 097–101.
- **Não promovidos:** CLI-06..15 e EXT-01..17; componentes órfãos continuam
  protótipos. CLI-15 não foi antecipado.
- **Migração/tabelas:** nenhuma migração nova; 001–138 preservadas e 139 segue
  livre. Fontes canônicas: `auth_*`, `client_accounts`, `client_access_grants`,
  `client_contracts`, `client_documents`, `client_tickets` e auditorias.
- **Gate:** `test:l08-delivery:pg`, com PostgreSQL descartável, HTTP real, dois
  fluxos de integração existentes consolidados e smoke Chromium empacotado da entrada.
- **Resultados reais da base:** estático 5/5; typecheck OK; unitários 196/196;
  migrações 138/138 em dois passes, 524 tabelas e clone/checksum negativo;
  L07 43/43 em duas execuções; L03 1/1, L04 20/20, L05 1/1, L06 9/9 em cadeia.
  Uma primeira execução concorrente registrou `browserType.launch ETXTBSY` em
  L03; sem mudar timeout/skip, a repetição integral serial passou 1/1. Isso foi
  instabilidade de execução e fica registrado.
- **Pendente:** executar o novo gate L08 duas vezes, concluir build e validação
  final no mesmo SHA, revisão humana da fatia e homologação Windows global.
- **Próximo passo:** executar/revisar o gate L08; depois iniciar a próxima área
  somente com prova, sem ligar órfãos em massa.

Windows continua pendente para o fechamento integral do sistema.
