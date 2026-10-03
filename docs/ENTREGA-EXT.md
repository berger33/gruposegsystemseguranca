# Entrega EXT — expansões condicionais ligadas ao backend canônico

Este documento acompanha o lote EXT (EXT-01..17), iniciado após o fechamento
local de CLI-15 no L08. Cada fatia promove um requisito EXT de "API/tabela/
componente órfão" para jornada funcional provada; a existência de tabela ou
handler não é tratada como entrega.

## EXT-02 terceiros — 03/10/2026

Fatia partindo da `main` oficial em `48aa7a4` (merge da PR #96, confirmado
MERGED no remoto antes de editar; divergência 0/0). Promove somente **EXT-02**:
terceiros com cadastro, contrato, documentos, vencimentos, acesso temporário e
avaliação, ligados ao backend canônico real (tabelas `ext_third_part*` da 085 +
jornada da 148).

Critério do plano: **"terceiro acessa só OS/contrato autorizado e perde acesso
ao término"**.

**Fronteira declarada:** não existe hoje ator externo "terceiro" autenticado.
Nenhuma sessão, login ou canal externo de terceiro foi criado — nem simulado.
A janela de acesso e o escopo autorizado são impostos nos registros canônicos e
em toda consulta derivada do lado staff; o acesso do próprio terceiro permanece
**PENDENTE** e é declarado como tal pela API (`external_actor_boundary`, no
dossiê, nas janelas, na autorização e na listagem) e pela tela. O ponto de
imposição é consultável: `GET /api/ext/third-party/parties/<id>/authorization`.

- Migração aditiva única: `148-ext02-third-parties-canonical-journey.sql`
  (001–147 imutáveis; próxima livre 149): origem da jornada e verificação
  canônica do contrato em `ext_third_parties`; `ext_third_party_access_grants`
  (a janela que decide acesso, presa a um único escopo autorizado — contrato
  `crm_contracts` ou OS `ast_service_orders` — com término obrigatório e
  revogação declarada); `ext_third_party_evaluations` (autor, data e
  justificativa obrigatórios); `ext_third_party_document_rules` (regra explícita
  de antecedência, uma ativa por terceiro); `ext_third_party_events` (histórico
  imutável + ledger de idempotência por identidade staff); desativação declarada
  de documento. Constraints novas com `NOT VALID`; sem autoria retroativa. As
  colunas `access_start`/`access_end` da 085 ficam marcadas **LEGADO** por
  COMMENT e nenhuma derivação as lê; `ext_third_party_access_logs` é declarada
  legado e não decide acesso. Triggers recusam UPDATE/DELETE em avaliações e
  eventos, e na janela aceitam **uma única** transição: a revogação declarada.
- API canônica `src/server/ext-third-party-api.mjs` em `/api/ext/third-party/*`:
  papéis admin/marcelo/ti; anônimo 401 e papel não autorizado 403 antes de
  qualquer consulta; same-origin e `Idempotency-Key` em toda mutação (replay
  idêntico devolve o mesmo registro; reuso divergente 409); autoria derivada da
  sessão e vínculo derivado da URL — IDs/autoria/vínculos/janela/nota do corpo
  são ignorados; contrato só é vinculado após validação canônica em
  `crm_contracts`, com quem verificou, quando e a situação observada gravados;
  negócio + evento + `audit_log` na mesma transação, falha da auditoria devolve
  503 com rollback.
- "Perde acesso ao término" é derivação determinística de `access_end`
  (`vigente`/`nao_iniciado`/`expirado`/`revogado`), nunca marcação manual; a API
  recusa criar janela já vencida e encerrar o terceiro revoga as janelas vivas
  na mesma transação, com autor e motivo. Vencimento de documento é derivado só
  da data registrada; "a vencer" só existe com regra explícita, caso contrário a
  resposta declara `sem_regra_de_antecedencia`. Toda resposta derivada carrega
  fonte e data-base.
- Rotas legadas de terceiros: leitura pela mesma autorização, com fonte
  declarada e **preservando a chave `items`** que os leitores legados usavam
  (mais `canonical` apontando a rota nova); mutação aposentada com
  `410 legacy_route_retired`. Handlers de terceiros removidos de `ext-api.mjs`
  (383 → 304 linhas); o componente órfão de `/admin/ti` segue órfão e não foi
  promovido.
- UI real `/admin/terceiros`: carregamento, vazio declarado, erro com retry e
  confirmação somente após resposta real; chave de idempotência preservada em
  falha; verificador de autorização por escopo, dossiê completo e banner da
  fronteira externa declarada. Documento é registro de metadados sintéticos
  (sem upload real, declarado na tela).

Validações: estático 5/5 (001–148, guarda de manifesto e `latestMigration`
atualizados juntos com a migração), typecheck OK, teste dedicado
`tests/ext02-third-parties.test.mjs` 50/50 (registrado em `test:unit`),
`npm test` 315/315, build 87 páginas com `/admin/terceiros` listada,
`npm run test:migrations:pg` 148/148 (dois passes, replay, checksum negativo
rejeitado, clone com 539 tabelas) e — diferente da fatia anterior — um **gate
dedicado de jornada**: `npm run test:ext02-third-parties:pg` **22/22**, por HTTP
real contra PostgreSQL real descartável, com o servidor de verdade e sessão
staff canônica, provando no banco a autoria derivada, o 409 de idempotência, o
**503 com rollback sob auditoria derrubada**, o escopo autorizado, a perda de
acesso ao término, a revogação e as travas de imutabilidade. `npm run
test:l08-delivery:pg` 51/51 e `npm run test:demo-local:pg` OK aplicam 001–148,
mas **não** cobrem a jornada EXT-02 e não são apresentados como prova dela.

Classificação: implementação local + validação automática rápida + gate HTTP/DB
dedicado de EXT-02. Bateria pesada integral, cascata completa, aplicação em
destino, aceite humano e Windows permanecem pendentes; o aceite Marcelo/Andreia
preservado é somente L07. CLI-01..15 e EXT-01 preservadas; EXT-03..17 e órfãos
continuam não promovidos. Relatório:
[EXT-02](ENTREGA-RELATORIO-2026-10-03-EXT02-TERCEIROS.md).

## EXT-01 frota — 03/10/2026

Fatia partindo da `main` oficial em `3353b2f` (merge da PR #95, confirmado
MERGED no remoto antes de editar; divergência 0/0). Promove somente **EXT-01**:
frota com veículo, responsável, abastecimento, manutenção, documentos e custo,
com histórico/custo por veículo e alerta de manutenção, ligada ao backend
canônico real (tabelas `ext_fleet_*` da 085 + jornada da 147).

A condição do plano é **"se frota própria existir"**: sem registro canônico, a
listagem e a tela declaram a ausência (`fleet_registered: false`); nenhum
veículo, custo ou histórico é inventado ou estimado.

- Migração aditiva única: `147-ext01-fleet-canonical-journey.sql` (001–146
  imutáveis; próxima livre 148): origem da jornada no veículo, histórico
  imutável de responsável, regra explícita de alerta de manutenção (uma ativa
  por veículo), eventos imutáveis com ledger de idempotência por identidade
  staff, desativação declarada de documento e triggers de imutabilidade nos
  históricos. Constraints novas com `NOT VALID`; sem autoria retroativa.
- API canônica `src/server/ext-fleet-api.mjs` em `/api/ext/fleet/*`: papéis
  admin/marcelo/ti; anônimo 401 e papel não autorizado 403 antes de qualquer
  consulta; same-origin e `Idempotency-Key` em toda mutação (replay idêntico
  devolve o mesmo registro; reuso divergente 409); autoria derivada da sessão
  e vínculo derivado da URL — IDs/autoria/vínculos do corpo são ignorados;
  negócio + evento + `audit_log` na mesma transação, falha da auditoria
  devolve 503 com rollback; quilometragem não regride; datas futuras recusadas.
- Histórico/custo por veículo somente de registros canônicos, com fonte e
  data-base declaradas; alerta derivado exclusivamente de regra registrada
  (`sem_regra`/`sem_base` declarados; `em_dia`/`alerta`/`vencida` com a
  derivação exposta).
- Rotas legadas `/api/ext/fleet-*`: leitura pela mesma autorização com fonte
  declarada; mutação aposentada com `410 legacy_route_retired`. Handlers de
  frota removidos de `ext-api.mjs`; o componente órfão de `/admin/ti` segue
  órfão e não foi promovido.
- UI real `/admin/frota`: carregamento, vazio declarado, erro com retry e
  confirmação somente após resposta real; chave de idempotência preservada em
  falha. Documento é registro de metadados sintéticos (sem upload real,
  declarado na tela).

Validações: estático 5/5 (001–147, guarda de manifesto e `latestMigration`
atualizados juntos com a migração), typecheck OK, teste dedicado
`tests/ext01-fleet.test.mjs` 20/20 (registrado em `test:unit`), `npm test`
265/265, build 86 páginas com `/admin/frota` listada,
`npm run test:migrations:pg` 147/147 (dois passes, replay, checksum negativo
rejeitado, clone com 535 tabelas), `npm run test:l08-delivery:pg` 51/51
(aplica 001–147; cobre CLI-01..05, **não** a jornada EXT-01 — não é
apresentado como prova dela) e `npm run test:demo-local:pg` OK.

Classificação: implementação local + validação automática rápida. Bateria
pesada específica de EXT-01, cascata completa, aplicação em destino, aceite
humano e Windows permanecem pendentes; o aceite Marcelo/Andreia preservado é
somente L07. CLI-01..15 preservadas; EXT-02..17 e órfãos continuam não
promovidos. Relatório:
[EXT-01](ENTREGA-RELATORIO-2026-10-03-EXT01-FROTA.md).
