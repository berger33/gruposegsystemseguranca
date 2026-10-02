# Entrega L08 — revisão da PR #80 e hardening CLI-04/CLI-05 — 2026-10-02

Lote: L08 (nova rodada) — revisão e acompanhamento da PR #80 + hardening da
primeira fatia do espaço do cliente.

Base confirmada: `main` oficial `c16673c3c2a8f749ec476edb7a91dc62d2c1dfc9`
(merge da PR #78). Branch de trabalho: `arena/01a0fea1-gruposegsystemseguranca`
— a plataforma desta sessão vincula o trabalho a esta branch fixa, criada
sobre a main atual, cumprindo o papel do nome `arena/l08-next-*` sugerido no
briefing (a equivalência é esta: branch arena da sessão, sobre a main
confirmada, PR aberta daí para `main`).

Estado remoto confirmado da PR #80: ABERTA, não draft, sem merge commit; HEAD
`arena/l08-hardening-20261002` apontando
`a95872de2a29d9ea39773a942cd9e3f7e91bfa4d` (filho direto de `c16673c`); a main
não contém a PR (`git merge-base --is-ancestor` negativo sobre a referência
remota). Validação independente desta sessão: worktree em `a95872d`,
`npm run test:l08-delivery:pg` 11/11 em duas execuções consecutivas, inclusive
a jornada Chromium real. Nenhum merge foi feito — a decisão continua humana.

Mudanças desta sessão (todas aditivas; migrações 001–138 imutáveis):

1. Migração **139** `139-cli05-client-ticket-idempotency.sql`: em
   `client_tickets`, colunas `idempotency_key` (VARCHAR(200); CHECK 8–200) e
   `content_fingerprint` (CHECK hexadecimal de 64) adicionadas com NOT VALID +
   VALIDATE CONSTRAINT (padrão da 134) e índice único parcial
   `client_tickets_idempotency_uidx` sobre
   `(client_account_id, opened_by_identity, idempotency_key)`. Próxima migração
   livre: **140**.
2. `src/server/client-space-api.mjs`: `POST /api/client/tickets` passa a gravar
   o chamado e a auditoria na MESMA transação — falha de auditoria devolve 503
   e reverte tudo; retry concorrente com a mesma chave não duplica protocolo
   (replay 200 com o mesmo `ticketId`; conteúdo diferente sob a mesma chave →
   409 `idempotency_key_conflict`; corrida resolvida pelo UNIQUE com releitura
   da linha vencedora); log de download privado gravado ANTES de qualquer byte
   (falha de auditoria → 503 e zero bytes servidos); auditoria da transição de
   status do chamado (admin) movida para dentro da transação da escrita.
3. UI `src/app/cliente/app/chamados/page.tsx`: envia `idempotency_key` por
   tentativa de envio (mantida em erro de rede, renovada após sucesso),
   reconhece sucesso por `ok`/`ticketId` e trata replay/409 com mensagens
   honestas. Corrige o problema real de a tela exibir sucesso como erro e
   incentivar reenvio — o contrato sem chave continua compatível.
4. Testes: novo `tests/client-ticket-write-hardening.test.mjs` (9 subtestes com
   injeção de falha: atomicidade, 503+rollback, replay, 409, corrida,
   log-antes-dos-bytes); suíte de testes 196→**205**. Novo subteste em
   `client-space.integration` (8→9; gate L08 11→**12**) provando com
   PostgreSQL real: duas requisições simultâneas com a mesma chave → mesmo
   `ticketId`, contagem exata de 1 linha em `client_tickets` e 1 em
   `auth_access_audit`; replay sequencial 200; conflito 409 sem segunda linha;
   identidade B com a mesma chave 403; chave curta 400; dois POSTs sem chave
   seguem criando dois chamados.
5. Documentação: bloco desta série em `AUDITORIA-TERRENO-L08.md`,
   `ENTREGA-L08.md`, `CONTROLE-IMPLEMENTACAO.md`, `CHECKLIST-ENTREGA-LOCAL.md`,
   `ESTADO-EXECUCAO-LOCAL.md`, `EXECUCAO-ENTREGA-LOCAL.md`,
   `EVIDENCIAS-ENTREGA-LOCAL.md`.

Requisitos promovidos/não promovidos: CLI-01..05 permanecem a primeira fatia
consolidada, agora com hardening aditivo de write-path — **estado:
implementação local + validação automática Linux/PostgreSQL descartável; não é
aceite humano nem homologação Windows**. Não promovidos: CLI-06..15,
EXT-01..17, órfãos `/admin/ti` (80), fornecedor restrito, integrações externas.

Migração criada: 139 (acima). Tabelas canônicas relevantes:
`client_tickets` (legada, endurecida por 139 + NOT VALID/VALIDATE),
`client_ticket_status_audit`, `auth_access_audit`; a v2 permanece fora de
escopo canônico.

Gate e subtestes: `npm run test:l08-delivery:pg` — 12 subtestes (o subteste 2
faz o inventário de contrato e conta 12 no gate; 8 subtestes HTTP/DB em
`client-space.integration`, incluindo o novo de concorrência; 3 em
`l08-delivery.integration`, incluindo a jornada Chromium real).

Resultados reais:

- Baseline `c16673c` (antes de qualquer edição): estático 5/5; typecheck exit
  0; `npm test` 196/196; build exit 0; migrações 138/138 ×2 passes, 524
  tabelas, clone/checksum negativo rejeitado; L07 43/43 em duas execuções
  consecutivas; L03 1/1; L04 20/20; L05 1/1; L06 9/9 em cadeia; L08 11/11
  (formulação da main — a PR #80 não estava na base).
- PR #80 em worktree: L08 11/11 em duas execuções consecutivas.
- Código final desta branch: estático 5/5 (001–139); typecheck exit 0; `npm
  test` **205/205**; build exit 0; migrações **139/139** ×2 passes, 524
  tabelas, clone/checksum negativo; L07 43/43 em duas execuções consecutivas;
  L03 1/1; L04 20/20; L05 1/1; L06 9/9 em cadeia serial; L08 **12/12 em duas
  execuções consecutivas**.

Instabilidades e falhas registradas (sem mascaramento):

- Bateria do código final: uma execução do `test:l07-delivery:pg` registrou
  42/43 (1 subteste reprovado; log detalhado não preservado para identificar o
  subteste); as duas execuções seguintes, sem qualquer mudança de código,
  passaram 43/43 — classificada como instabilidade transitória, sob
  observação; nenhum skip, timeout ou assertiva alterado.
- Falha intermediária desta sessão (implementação, não ambiente): a primeira
  execução do gate L08 com o hardening reprovou 3 subtestes porque a lista de
  migrações do fixture de `client-space.integration` não aplicava a 139;
  corrigida a lista (única alteração), o gate passou.
- As falhas ambientais do Node/dependências relatadas no briefing anterior
  (EADDRINUSE, CLI-10 timeout, Chromium sandbox/ETXTBSY) **não** se
  reproduziram neste ambiente (Node 22.22.3); as instabilidades históricas
  L03-403 e L07-22 tampouco reapareceram na baseline.

Commit: REGISTRADO_NO_FECHAMENTO

PR: REGISTRADA_NO_FECHAMENTO

Pendências reais:

1. PR #80 segue aberta aguardando decisão humana (nenhum merge automático).
2. Escritas administrativas do espaço do cliente (contas, grants, contratos,
   upload de documento) mantêm auditoria sequencial fail-open — candidatas à
   próxima fatia de hardening (esta sessão cobriu o write-path do cliente e o
   PATCH admin de status de chamado).
3. Gate L08 consolidado ainda não incorpora `client-access.integration`
   (jornada profunda de autenticação CLI-01, hoje em `test:integration`) —
   candidato a consolidação futura.
4. Documentos da série da PR #80 mantêm o placeholder "(a segunda execução
   deverá ser registrada…)" (em 7 de 8 arquivos) e o SHA base truncado em 39
   caracteres — corrigível na branch da PR ou na próxima série.
5. Aceite humano por Marcelo/Andreia desta fatia: pendente (o aceite anterior
   permanece preservado e intocado).
6. Mensagens/anexos de chamados seguem v2 não promovidos.

Próximo passo sugerido: revisão humana desta PR e da PR #80; em seguida, a
fatia de hardening das escritas administrativas do espaço do cliente (item 2)
e/ou a consolidação da jornada CLI-01 no gate L08 (item 3).

Windows não foi homologado nesta sessão e continua pendente — adiado até o
fechamento integral do sistema.