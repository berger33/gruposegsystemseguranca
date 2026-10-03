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

## Reconciliação pós-PR #83 — 03/10/2026

A `main` oficial em `31834ec` já contém a PR #83 (`4a5a4a9`), posterior à PR
#80. Esse lote implementou o hardening transacional de CLI-01..05 descrito em
`ENTREGA-L08-RELATORIO-2026-10-02-ATOMICIDADE-CLI01-05.md`: auditoria
fail-closed, atomicidade, download privado antes dos bytes, idempotência
concorrente de chamados/documentos e jornada completa de acesso no gate L08.
A migração aditiva `139-l08-client-space-atomic-idempotency.sql` é a última da
sequência contínua 001–139; 001–138 permanecem imutáveis e a próxima livre é
140.

Revalidação desta base no Linux/Node 22: estático 5/5, typecheck, unitários,
build, migrações 139/139, L03, L04, L05, duas execuções L07 (43/43) e duas
execuções L08 (50/50) passaram. L06 terminou 8/9: o subteste 8 sofreu SIGSEGV no
lançamento do Chromium (`Target page, context or browser has been closed`); a
falha foi preservada, sem skip, relaxamento de assertiva ou aumento de timeout.
Nenhum requisito adicional foi promovido por esta reconciliação. CLI-06..15,
EXT-01..17, APIs v2 não promovidas, órfãos de `/admin/ti`, fornecedor restrito e
integrações externas continuam fora do escopo. O aceite humano anterior de
Marcelo e Andreia permanece; não houve novo aceite humano nem homologação
Windows.

A matriz obrigatória foi repetida após esta atualização documental e terminou
integralmente verde, inclusive L06 9/9; o SIGSEGV anterior não recorreu. L07
passou 43/43 duas vezes e L08 passou 50/50 duas vezes.

## Resiliência de Interface e Separação de Sessões pós-PR #85 — 03/10/2026

Esta fatia parte da `main` oficial em `8eae38ae7ce84b9a824a63d469d36e03a3b0a5c0`
(pós-merge da PR #85). Implementou a resiliência de interface e prova de
separação de sessões:

- `ClientSpaceProvider`: `reload()` limpa notices prévios e reseta loading;
- Telas de leitura (`/cliente/app`, `/contratos`, `/documentos`, `/chamados`, `/seguranca`):
  adicionados botões de retry explícito (`Tentar novamente`) em alertas de erro
  e tratamento distinto de falha do provedor de contas;
- `tests/client-space.integration.test.mjs`: adicionado subteste exercitando a
  rejeição cruzada de cookies (sessão staff rejeitada com 401 em rotas de cliente;
  sessão cliente rejeitada com 401 em rotas administrativas; mutações negadas
  comprovadamente sem alteração de dados; papel não autorizado rejeitado com 403).

A base continua com 139 migrações imutáveis (001–139) e a próxima livre é 140.
CLI-06..15, EXT-01..17 e componentes órfãos permanecem não promovidos.
O aceite humano local de Marcelo e Andreia sobre L07 permanece preservado;
a homologação final Windows continua pendente e adiada até o fechamento
integral do sistema.

## CLI-11 satisfação, plano de ação e risco de renovação — 03/10/2026

Fatia partindo da `main` oficial em `1024b3b` (merge da PR #90). Promove somente
**CLI-11** com jornada cliente real em `/cliente/app/satisfacao` e rota
`/api/client/satisfaction-surveys` sob sessão de cliente: leitura restrita às
pesquisas endereçadas à identidade autenticada, resposta idempotente por
identidade, autoria derivada da sessão, segunda resposta recusada com 409.

O risco de renovação é classificado apenas a partir de contagens canônicas
(`client_tickets`, `cli_charges_v2`, respostas anteriores), gravadas em
`facts_json` com fontes e data-base; quando os fatos não sustentam uma
classificação, a tela declara “não classificado”. O plano de ação só nasce com
responsável comercial real do CRM; sem ele, a pendência é registrada em
`action_plan_pending_reason`, sem nome inventado. Resposta, fatos, plano e
auditoria ocorrem na mesma transação, com rollback e 503 em falha; nada é
escrito em contratos, cobranças ou obrigações.

Migração aditiva única: `142-l08-cli11-satisfaction-portal.sql`; 001–141
permanecem imutáveis e a próxima livre passa a ser 143. Validações rápidas:
estático 5/5 (001–142), typecheck OK, `npm test` 205/205, build 83 páginas,
`tests/cli11-satisfaction-portal.test.mjs` 6/6. Os gates pesados
(L03..L08 em cascata, Chromium e PostgreSQL descartável) foram adiados por
decisão do proprietário para depois da entrega do sistema.

CLI-12..15, EXT-01..17 e os órfãos de `/admin/ti` continuam não promovidos. O
aceite humano anterior de Marcelo e Andreia sobre L07 permanece preservado; não
há novo aceite humano nesta fatia e a homologação final Windows continua
pendente e adiada até o fechamento integral do sistema. Relatório:
[`ENTREGA-L08-RELATORIO-2026-10-03-CLI11-SATISFACAO.md`](ENTREGA-L08-RELATORIO-2026-10-03-CLI11-SATISFACAO.md).

## CLI-12 renovação e comunicação contratual no portal — 03/10/2026

Fatia partindo da `main` oficial em `5cff301` (merge da PR #91, confirmado no
remoto antes de editar; divergência 0/0). Promove somente **CLI-12** com
jornada cliente real em `/cliente/app/renovacao` e rota
`/api/client/renewal-communications` sob sessão de cliente: leitura restrita a
comunicações registradas, dirigidas à própria conta e com envio local
registrado (`sent_at`); ciência/interesse em renovar/pedido de contato com
autoria derivada da sessão, idempotência por identidade (chave + fingerprint;
reuso divergente 409; manifestação duplicada 409) e histórico imutável em
`cli_renewal_comm_responses`, na mesma transação da auditoria canônica
(rollback e 503 em falha). A manifestação não renova contrato, não cria
cobrança e não altera valor.

O não bloqueio indiscriminado está provado por teste: inadimplência em
`cli_charges_v2` não participa de nenhuma decisão de acesso (CLI-12 e também
as leituras autenticadas CLI-10/CLI-11); restrição só pode vir de comunicação
`encerramento` com `is_blocking` e `block_reason` explícito (CHECK da 076),
declarada ao cliente com motivo, origem e protocolo. Vencimentos vêm somente
de `client_contracts.ends_on` e `crm_renewals.renewal_date`, com fonte e
data-base visíveis; ausência de dado é declarada, sem risco, previsão ou valor
calculado. A rota administrativa legada foi preservada sem mudança de contrato.

Migração aditiva única: `143-l08-cli12-renewal-communications-portal.sql`;
001–142 permanecem imutáveis e a próxima livre passa a ser 144. Validações
rápidas: estático 5/5 (001–143), typecheck OK, `npm test` 215/215 (teste novo
registrado em `test:unit`), build 84 páginas,
`tests/cli12-renewal-communications.test.mjs` 10/10. Os gates pesados
(L03..L08 em cascata, Chromium e PostgreSQL descartável) seguem adiados por
decisão do proprietário para depois da entrega do sistema.

CLI-13..15, EXT-01..17 e os órfãos de `/admin/ti` continuam não promovidos. O
aceite humano anterior de Marcelo e Andreia sobre L07 permanece preservado; não
há novo aceite humano nesta fatia e a homologação final Windows continua
pendente e adiada até o fechamento integral do sistema. Relatório:
[`ENTREGA-L08-RELATORIO-2026-10-03-CLI12-RENOVACAO.md`](ENTREGA-L08-RELATORIO-2026-10-03-CLI12-RENOVACAO.md).
