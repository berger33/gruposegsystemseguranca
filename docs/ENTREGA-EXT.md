# Entrega EXT — expansões condicionais ligadas ao backend canônico

Este documento acompanha o lote EXT (EXT-01..17), iniciado após o fechamento
local de CLI-15 no L08. Cada fatia promove um requisito EXT de "API/tabela/
componente órfão" para jornada funcional provada; a existência de tabela ou
handler não é tratada como entrega.

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
