# Entrega L08 — CLI-12 renovação e comunicação contratual no portal

Data: 03/10/2026  
Branch: `arena/01a10062-gruposegsystemseguranca`  
Base oficial: `5cff3013aa0c489d6863b2088e496e9dbd0dd4e7` (merge da PR #91)

## Sincronização e escopo

Antes de qualquer edição foi confirmado no remoto: a **PR #91 está mergeada**
(2026-10-03T06:01Z), `origin/main` aponta para `5cff3013` e a branch desta
sessão foi criada exatamente desse commit, com divergência **0/0** contra
`origin/main`. CLI-11 **não foi refeito**; a migração 142 permanece imutável,
assim como 001–141.

Este lote promove somente **CLI-12 — renovação e comunicação contratual com
registro, sem bloquear indiscriminadamente o portal por inadimplência**,
elevando a camada órfã de `cli_renewal_communications` (migração 076) a uma
jornada real e autorizada. CLI-13..15, EXT-01..17 e os órfãos de `/admin/ti`
continuam não promovidos.

A lacuna foi reproduzida por execução antes de editar: sessão de cliente
recebia **403** na rota legada (guard administrativo `admin/ti/comercial`), a
rota `/api/client/renewal-communications` não existia no `server.mjs`, não
havia tela cliente (build de partida com 83 páginas, sem
`/cliente/app/renovacao`), nenhuma tabela de ciência registrada e nenhuma prova
de não bloqueio por inadimplência.

## Implementação entregue

### Jornada cliente

- nova rota real `/cliente/app/renovacao`, integrada à navegação do portal;
- lista apenas comunicações **efetivamente registradas, dirigidas à conta
  selecionada e com envio local registrado** (`sent_at`); comunicações sem
  `sent_at` não aparecem e nada é gerado para preencher tela;
- cada comunicação exibe tipo (aviso de vencimento, proposta de renovação,
  reajuste, encerramento, outro), data de envio, conteúdo e contrato
  relacionado quando houver (com `ends_on` e fonte declarada);
- o cliente registra **ciência** e, quando o tipo permite, **interesse em
  renovar** ou **pedido de contato**, com mensagem opcional (5–1000);
- tipos e manifestações permitidas vêm do servidor
  (`allowed_response_kinds`): interesse em renovar só em aviso de vencimento e
  proposta de renovação; encerramento e reajuste aceitam ciência e pedido de
  contato; `outro` aceita apenas ciência;
- estados de carregamento, vazio, erro, retry, envio e sucesso; o retry
  preserva a chave idempotente até confirmação do servidor;
- seção de **vencimentos reais** com data-base da consulta declarada: datas de
  `client_contracts.ends_on` (respeitando o escopo de contratos do grant) e
  `crm_renewals.renewal_date` (somente quando há empresa CRM vinculada), sempre
  com a fonte visível; ausência de data é declarada em tela — nunca vira zero,
  estimativa ou “em dia”. Nenhum risco, previsão ou valor é calculado.

### Autorização e isolamento

A rota `/api/client/renewal-communications` (GET/POST) usa a sessão canônica do
cliente, nunca a administrativa. Em cada operação:

- exige sessão cliente e same-origin;
- valida UUIDs no servidor;
- revalida grant não revogado e conta ativa;
- conta sem vínculo responde 403 genérico com auditoria
  `renewal_communication_list`/`renewal_communication_respond` `denied`
  (`authorization_denied`) — isolamento A≠B;
- autoria derivada da sessão: identidade, conta ou responsável enviados no
  corpo são **ignorados** (a conta da resposta vem da própria comunicação, no
  servidor);
- comunicação não enviada (`sent_at` nulo) se comporta como inexistente no
  POST: 403 auditado, sem vazar existência.

### Ciência/resposta registrada

Nova tabela `cli_renewal_comm_responses` (migração 143): histórico **imutável**
(não há UPDATE/DELETE na jornada), idempotência por identidade em duas camadas:

- chave de retry única por identidade (`identity_id, idempotency_key`):
  replay idêntico devolve a mesma linha; chave reusada com conteúdo diferente
  (fingerprint SHA-256 divergente) é **409 idempotency_key_reused**;
- uma manifestação de cada tipo por identidade e comunicação
  (`communication_id, identity_id, response_kind` único): nova tentativa com
  chave nova é **409 response_already_registered**;
- manifestação em tipo que não a permite é **409
  response_kind_not_allowed_for_type**.

Resposta e auditoria canônica são gravadas na **mesma transação**; falha em
qualquer etapa (inclusive na auditoria) causa rollback e **503**. A
manifestação **não renova contrato, não cria cobrança e não altera valor** —
provado por teste: nenhum INSERT/UPDATE em `client_contracts`,
`cli_charges_v2`, `crm_contracts` ou `crm_renewals`.

### Não bloqueio indiscriminado

- a leitura e a decisão de acesso do CLI-12 **não consultam** `cli_charges_v2`:
  provado por teste que nenhuma instrução SQL da jornada referencia
  inadimplência;
- teste adicional confirma que as leituras autenticadas de CLI-10
  (solicitações) e CLI-11 (satisfação) também autorizam sem consultar
  `cli_charges_v2`; contratos, documentos, chamados, agenda e relatórios
  (CLI-03..08) já autorizam somente por sessão+grant+conta ativa, sem leitura
  de cobranças;
- qualquer restrição vem **somente** de comunicação `encerramento` com
  `is_blocking=true` e `block_reason` explícito (CHECK da 076) e é **declarada
  ao cliente** no payload `accessRestriction` e na tela, com motivo, origem
  (`cli_renewal_communications`) e protocolo.

### Escrita administrativa

A rota legada (`/api/hr/cli-renewal-communications` e aliases) permanece
funcionando sem alteração de contrato de API: criação com validações da 076,
autoria da sessão administrativa, `PATCH sent_at` como transição local de
envio e auditoria via `auditLog`. A promoção foi puramente aditiva: o novo
caminho `/api/client/renewal-communications` é despachado dentro do mesmo
handler quando a URL é da jornada cliente.

## Migração

Criada somente:

- `db/migrations/143-l08-cli12-renewal-communications-portal.sql`.

Aditiva, com constraints novas `NOT VALID`; inclui:

- tabela `cli_renewal_comm_responses` com CHECKs de tipo, mensagem e
  idempotência, índice único por identidade+chave e por
  comunicação+identidade+tipo;
- ações `renewal_communication_list` e `renewal_communication_respond` no CHECK
  acumulado de `auth_access_audit`;
- comentários declarando o contrato (envio como transição local; autoria da
  sessão; fingerprint contra reuso divergente).

Linhas históricas de `cli_renewal_communications` são preservadas sem autoria
ou destinatário inventados; as sem `sent_at` simplesmente não aparecem na
jornada autenticada. 001–142 não foram alteradas. O manifesto do migrador e o
QA estático foram atualizados para 001–143 (o log final do migrador, que estava
defasado em “001–140”, foi corrigido para refletir o manifesto real).

## Validações executadas (rápidas, por decisão do proprietário)

Baseline no SHA de partida, antes de editar: `npm ci` OK; estático 5/5
(001–142); typecheck OK; `npm test` 205/205; build 83 páginas.

Após a implementação:

- `node scripts/qa-wave0-static.mjs`: **5/5 OK** (001–143);
- `npm run typecheck`: OK;
- `node --test tests/cli12-renewal-communications.test.mjs`: **10/10 OK** —
  sessão obrigatória, negação/auditoria sem grant, listagem só de comunicações
  enviadas sem consultar inadimplência, restrição declarada apenas por
  encerramento bloqueante com motivo/origem, vencimentos canônicos com ausência
  preservada, ciência transacional com autoria da sessão e corpo forjado
  ignorado, tipo não permitido e duplicata 409, validação de entrada sem abrir
  transação, chave reusada divergente 409, e não consulta de `cli_charges_v2`
  na autorização de CLI-10/CLI-11;
- teste registrado em `package.json` → `test:unit`; `npm test` integral:
  **215/215 OK** (205 + 10);
- `npm run build`: OK, **84 páginas**, incluindo `/cliente/app/renovacao`.

Não foram executados nesta sessão, **por decisão do proprietário de que os
testes pesados ficam para depois da entrega do sistema**: gate
`test:l08-delivery:pg` com HTTP + PostgreSQL descartável + Chromium reais para
CLI-12, gates L03..L08 em cascata e aplicação da migração 143 em ambiente de
destino. Esta validação rápida **não** é homologação, aceite humano nem prova
operacional.

## Pendências reais

- gate `test:l08-delivery:pg` (HTTP/PostgreSQL/Chromium reais) para CLI-12 e a
  cascata L03..L08 permanecem pendentes com a bateria pesada;
- aplicar a migração 143 no ambiente de destino pelo processo autorizado;
- comunicações históricas sem `sent_at` precisam ter o envio registrado para
  aparecerem no portal;
- contas sem empresa CRM vinculada não exibem datas de `crm_renewals` (a
  ausência é declarada, nada é inventado);
- a manifestação do cliente não abre tratativa automática no CRM — a tratativa
  continua manual pela equipe (decisão de escopo desta fatia);
- CLI-13 (modos de acesso configuráveis; autocadastro nunca libera contrato
  sozinho), CLI-14 e CLI-15 continuam não promovidos;
- aceite humano da jornada CLI-12 pendente — **não** houve novo aceite de
  Marcelo ou Andreia nesta fatia;
- homologação final Windows permanece pendente e adiada até o fechamento
  integral do sistema.

“A homologação final Windows continua pendente e adiada até o fechamento integral do sistema.”
