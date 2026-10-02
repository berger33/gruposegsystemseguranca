
## Série L08 — revisão da PR #80 e hardening CLI-05 — 02/10/2026 (continuação)

- **Lote/base:** continuação da sessão L08, base confirmada `main` oficial em
  `c16673c3c2a8f749ec476edb7a91dc62d2c1dfc9` (mesmo commit base da PR #80).
  Trabalho feito na branch fixa desta sessão Arena
  (`arena/01a0fed6-gruposegsystemseguranca`); a branch
  `arena/l08-next-<identificador>` sugerida pelo prompt não foi criada por
  restrição de plataforma (a sessão está presa a uma única branch).
- **Estado remoto da PR #80 confirmado antes de editar:** aberta, **não
  mergeada**, sem merge commit; branch `arena/l08-hardening-20261002`, head
  `a95872de2a29d9ea39773a942cd9e3f7e91bfa4d`; base `main` no mesmo commit desta
  sessão. `git merge-base --is-ancestor a95872d origin/main` confirma que a
  `main` não contém a PR. Nenhum merge foi feito; a branch da PR #80 não foi
  tocada. A PR #80 altera apenas o smoke Chromium (`tests/l08-delivery.integration.test.mjs`,
  troca `page.setContent` sintético por servidor real em loopback e navegação
  HTTP) e documentação — sem sobreposição com os arquivos desta continuação.
- **Mudança:** revisão requisito a requisito de CLI-01..05 sobre o código real
  (não apenas a passagem do gate). Encontrado gap real em CLI-05: abertura de
  chamado sem idempotência contra retry de rede e auditoria
  (`auth_access_audit`) melhor-esforço, sem reverter a escrita de negócio em
  falha — divergindo do padrão fail-closed já usado em ADM-01..12 (L07,
  migração 138). Corrigido com migração aditiva **139**
  (`client_tickets.idempotency_key`/`content_fingerprint`, único por conta,
  constraints `NOT VALID` + `VALIDATE CONSTRAINT`) e reescrita da criação de
  chamado em `src/server/client-space-api.mjs` dentro de uma única transação
  com a auditoria. Validador puro `validateIdempotencyKey` adicionado a
  `client-space-core.mjs`. Gaps equivalentes em conta/grant/contrato/documento
  (mesmo arquivo) foram identificados e **ficam como dívida explícita**, não
  corrigidos nesta continuação para manter o escopo pequeno e revisável.
- **Fonte/tabelas:** CLI-01..05 permanecem na fonte legada canônica: `auth_*`,
  `client_accounts`, `client_access_grants`, `client_contracts`,
  `client_documents`, `client_tickets` (agora com as duas colunas novas) e
  auditorias. 001–138 permanecem imutáveis; 139 é a única migração nova;
  próxima livre: **140**.
- **Prova automática:** `test:l08-delivery:pg` 11/12 em duas execuções
  consecutivas idênticas — inclui o novo subteste "ticket creation is
  idempotent under retry and the audit write is fail-closed", que prova:
  (1) corpo sem chave é recusado com 400; (2) duas requisições concorrentes
  com a mesma chave/conteúdo abrem um único chamado; (3) repetição posterior
  continua idempotente; (4) mesma chave com conteúdo diferente devolve 409;
  (5) a mesma chave em outra conta não colide; (6) auditoria indisponível
  devolve 503 e não deixa chamado meio-criado. O 12º subteste (smoke Chromium
  pré-existente, não o da PR #80) falhou nas duas execuções por limitação
  ambiental deste sandbox — ver abaixo.
- **Regressões no SHA base (`c16673c`), antes da edição:** estático 5/5,
  typecheck OK, `npm test` 196/196, build exit 0, `test:migrations:pg`
  138/138 com 524 tabelas e clone/checksum negativo OK, `test:l08-delivery:pg`
  10/11 em duas execuções idênticas. L03/L04/L05/L06/L07 executados; **toda
  falha observada em L03–L07 é a mesma limitação ambiental de Chromium**
  (biblioteca de sistema ausente no Chromium empacotado; `apt-get` e o CDN do
  Playwright estão bloqueados pela rede deste sandbox — confirmado por
  tentativas de `npx playwright install`/`install-deps` e `apt-get update`,
  todas com falha de rede, não de permissão). Os subtestes HTTP/PostgreSQL
  puros (sem Chromium) passaram normalmente; L07 reproduziu exatamente os
  mesmos 29/43 aprovados e os mesmos 14 subtestes dependentes de Chromium
  reprovados nas duas execuções — determinístico, não é instabilidade.
- **Regressões no SHA desta continuação, após o hardening:** estático 5/5
  (001–139), typecheck OK, `npm test` **197/197** (novo unitário da validação
  pura da chave de idempotência; um unitário de fail-closed pré-existente foi
  ajustado para incluir a chave na fixture sintética, sem alterar a asserção
  de 503), build exit 0, `test:migrations:pg` **139/139** com 524 tabelas e
  clone/checksum negativo OK, `test:l08-delivery:pg` **11/12** em duas
  execuções consecutivas idênticas. `git diff --check` sem erros;
  `next-env.d.ts`/`tsconfig.json` restaurados antes do commit.
- **Instabilidades observadas:** nenhuma instabilidade de concorrência; a
  única falha recorrente é a limitação ambiental de Chromium descrita acima,
  reproduzida de forma idêntica em todas as execuções (determinística, não
  intermitente). Não foi mascarada, nenhum teste foi pulado, nenhum timeout
  foi alterado e nenhuma assertiva foi enfraquecida.
- **Classificação:** implementação local + validação automática
  Linux/PostgreSQL descartável. Aceite humano anterior de Marcelo e Andreia
  (L07) permanece preservado; isto não constitui aceite novo nem homologação
  Windows, que segue pendente e adiada para o fechamento integral do sistema.
- **Não promovidos:** CLI-06..15, EXT-01..17, órfãos `/admin/ti`, fornecedor
  restrito e integrações externas. Dívida explícita nova: auditoria
  melhor-esforço (não transacional) em conta/grant/contrato/documento de
  `client-space-api.mjs`, equivalente ao gap corrigido em CLI-05 — candidata
  à próxima fatia de hardening.
- **Próximo passo:** revisão humana desta PR e acompanhamento da PR #80 (sem
  merge automático de nenhuma das duas); se aprovado, próxima fatia de
  hardening cobre o mesmo padrão fail-closed em conta/grant/contrato/documento,
  ou início de CLI-06 com prova equivalente — nunca por presunção de que o
  gate anterior bastou.

Windows continua pendente para o fechamento integral do sistema.
