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

## Série L08 aliases — 03/10/2026

- **Lote/base:** L08, hardening da primeira fatia CLI-01..05. Base confirmada:
  `main` oficial em `31834ec0983ead61ec316df90f8af958594b3c58` (merge da PR #83).
  Branch de trabalho: `arena/01a0ff2c-gruposegsystemseguranca`.
- **Correção documental obrigatória:** as seções anteriores desta série afirmam
  "nenhuma migração criada; 001–138 permanecem imutáveis; próxima livre: 139".
  Isso deixou de valer na PR #83, que criou a migração aditiva
  `139-l08-client-space-atomic-idempotency.sql`. O estado correto na base acima
  é: **139 migrações, sequência contínua 001–139, sem lacuna e sem duplicidade,
  001–139 imutáveis e próxima livre 140**. Reconfirmado nesta sessão por
  inspeção de `db/migrations` e por `npm run test:migrations:pg`
  (139/139 em dois passes).
- **Lacuna real encontrada:** o critério 7 do gate L08 ("aliases relevantes
  negam acesso inadequado") não era demonstrado pelo próprio gate. O gate
  importa apenas `client-access.integration` e `client-space.integration`;
  a prova de negação dos aliases v2 vivia em `tests/cli-v2.integration.test.mjs`,
  executada por outro runner (`test:cli-v2:pg`). Além disso, quatro aliases
  roteados sob `/api/client/` não tinham prova de negação em nenhum teste do
  repositório: `/api/client/visits`, `/api/client/service-requests`,
  `/api/client/portal-access-requests` e `/api/client/email-change-requests`.
- **Mudança:** subteste novo em `tests/client-space.integration.test.mjs`,
  portanto dentro do gate L08 — "non-promoted v2 aliases under /api/client never
  answer to a valid portal session". Ele exerce HTTP real, com a sessão do
  cliente A **ainda plenamente vinculada** (antes da revogação), contra os nove
  aliases v2 não promovidos, em GET e POST, mais o caminho anônimo. Verifica
  negação (401/403/405), ausência de vazamento de `accountId`, `documentId`,
  `ticketId` e `storage_key`, ausência de `Content-Disposition`, ausência de
  bytes privados no alias `/api/client/document-download` com cookie de A e de B,
  e ausência de escrita originada das tentativas. O inventário de aliases é
  derivado de `server.mjs`: um alias novo sob `/api/client/` reprova o gate até
  ser classificado como promovido ou provado como negado.
- **Fonte/tabelas:** inalteradas. CLI-01..05 seguem em `auth_*`,
  `client_accounts`, `client_access_grants`, `client_contracts`,
  `client_documents`, `client_tickets` e tabelas de histórico/auditoria.
  **Nenhuma migração nova nesta sessão**; 001–139 permanecem imutáveis.
- **Nenhum requisito novo promovido.** A mudança é de prova, não de
  funcionalidade: ela fecha o critério 7 dentro do gate L08 e documenta que o
  alias v2 continua **não promovido**. CLI-06..15, EXT-01..17, órfãos
  `/admin/ti`, fornecedor restrito, CLI-15 e integrações externas seguem fora.
- **Controle negativo executado:** o subteste foi deliberadamente quebrado duas
  vezes para provar que não é vacuoso. (1) Exigindo status 999 nas negações, o
  gate reprovou (exit 1, 49/51) e registrou o status real `401`. (2) Inserindo
  um alias fictício `/api/client/fake-new-alias` em `server.mjs`, a guarda de
  inventário reprovou (exit 1, 49/51) apontando o alias novo. Ambos os estados
  foram revertidos; `server.mjs` está idêntico ao da base.
- **Resultados reais nesta base (Node 22.22.3, Linux, PostgreSQL descartável):**
  estático 5/5; typecheck exit 0; unitários 196/196; build exit 0; migrações
  139/139 em dois passes com checksum negativo deliberado e limpeza confirmada;
  L07 43/43 e 43/43 consecutivos; cadeia serial L03 1/1, L04 20/20, L05 1/1,
  L06 9/9; L08 50/50 antes da mudança e 51/51 em duas execuções consecutivas
  depois dela.
- **Divergências/instabilidades observadas e registradas:** (a) a PR #83
  registrou L04 como 19/20 em duas execuções; nesta sessão L04 passou 20/20 em
  duas execuções. O resultado 19/20 da PR #83 permanece registrado como ocorreu
  e não é revogado retroativamente. (b) `test:l03-delivery:pg` **reprovou duas
  vezes** nesta sessão, com duas assinaturas distintas (`403
  /api/employee/offline` e timeout de 30s do Chromium aguardando o heading
  `Novo cadastro profissional`), e passou nas outras quatro execuções; na base
  limpa `31834ec`, sem as mudanças desta sessão, passou 3/3. Como o diff não
  toca nenhum arquivo de produção e L03 não importa o arquivo de teste
  alterado, a reprovação está classificada como instabilidade de execução e
  **fica registrada como pendência aberta**, não como aprovação. Não houve
  skip, mudança de timeout nem enfraquecimento de assertiva.
- **Classificação:** implementação local + validação automática Linux com
  PostgreSQL descartável. Não é aceite humano novo e não é homologação Windows.
  O aceite humano de Marcelo e Andreia no escopo local do L07 permanece
  preservado e inalterado.
- **Pendências reais:** a API legada canônica de CLI-05 continua sem protocolo,
  mensagem e anexo — esses objetos seguem apenas na superfície v2 não promovida
  e não são declarados comprovados. PostgreSQL e filesystem continuam sem
  transação distribuída: está provada a limpeza dos erros controlados, não a
  eliminação da janela de órfão em queda abrupta do processo. A homologação
  final Windows continua pendente e adiada até o fechamento integral do sistema.
