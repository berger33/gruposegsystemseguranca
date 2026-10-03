# EXT-01 — frota ligada ao backend canônico real

Data: 2026-10-03. Base confirmada: `main` e PR #95 (`3353b2f013b7c51e74e50460ce62c1fa243c460f`), estado `MERGED`, divergência inicial 0/0. Branch desta sessão: `arena/01a1023b-gruposegsystemseguranca`.

## Lacunas reproduzidas antes de implementar

A migração 085 criou as tabelas (`ext_fleet_vehicles`, `ext_fleet_fuel_logs`, `ext_fleet_maintenance_logs`, `ext_fleet_documents`) e `src/server/ext-api.mjs` expunha handlers em `/api/ext/fleet-*`, mas não havia jornada funcional — o componente `ExtClient.tsx` em `/admin/ti` é órfão (nenhuma página o renderiza) e a API administrativa não foi classificada como jornada sem prova:

- autorização misturava os códigos: anônimo **e** papel staff não autorizado recebiam o mesmo `401`; não existia `403` por papel;
- `auditLog` era envelopado em `try/catch {}` no `server.mjs`: falha da auditoria **não** devolvia 503 nem revertia nada, e a escrita de negócio ficava fora de transação (o POST de manutenção fazia `INSERT` + `UPDATE` do veículo em duas escritas separadas);
- nenhuma idempotência: retry de POST duplicava abastecimento, manutenção e documento;
- o PATCH de veículo confiava no `id` do corpo sem validação de formato e aceitava `next_maintenance_date` arbitrário — o "alerta" era um campo livre, não derivado de regra;
- `vehicle_id` de fuel/maintenance/documents vinha do corpo sem validação (inexistente estourava erro de FK não tratado);
- não existia histórico/custo por veículo, nem fonte/data-base declaradas (a "nota" do GET era uma string fixa), nem histórico de responsável, nem imutabilidade dos logs no banco.

## Implementação

- **Migração aditiva `147-ext01-fleet-canonical-journey.sql`** (001–146 imutáveis; próxima livre 148): `origin` em `ext_fleet_vehicles` (`registro_legado`/`jornada_frota`, CHECKs `NOT VALID`, sem autoria retroativa); `ext_fleet_responsible_history` (histórico imutável de responsável); `ext_fleet_maintenance_rules` (regra explícita do alerta: intervalo em dias e/ou km, antecedência declarada, justificativa, uma ativa por veículo); `ext_fleet_vehicle_events` (eventos imutáveis por veículo, ledger da idempotência por identidade staff: chave + fingerprint com unicidade parcial); desativação declarada de documento (autor/motivo/data, CHECK `NOT VALID`); triggers de imutabilidade (`UPDATE`/`DELETE` proibidos) em fuel logs, maintenance logs, histórico de responsável e eventos.
- **API canônica nova `src/server/ext-fleet-api.mjs`** montada em `/api/ext/fleet/*`: papéis autorizados **admin/marcelo/ti** (leitura e escrita); anônimo 401, papel não autorizado 403 antes de qualquer consulta; same-origin exigido nas mutações; `Idempotency-Key` obrigatória em toda mutação — replay idêntico devolve o mesmo registro (`replayed: true`), reuso divergente devolve `409 idempotency_key_reused`. Autoria sempre derivada da sessão; vínculo do veículo sempre derivado da URL; `id`, `created_by_identity`, `responsible_identity`, `vehicle_id` e `origin` enviados no corpo são ignorados. Toda mutação é **uma transação**: negócio + evento imutável + `audit_log`; falha da auditoria devolve `503 audit_unavailable` com rollback. Quilometragem canônica não regride; datas de abastecimento/manutenção no futuro são recusadas.
- **Histórico/custo por veículo**: `GET /api/ext/fleet/vehicles/<uuid>` devolve o dossiê — veículo, abastecimentos, manutenções, documentos, histórico de responsável, eventos — com custo somado exclusivamente dos registros canônicos e **fonte + data-base declaradas**; zero registros é declarado ("nenhum custo canônico registrado"), nunca estimado.
- **Alerta de manutenção por regra explícita**: `deriveMaintenanceAlert` é determinística sobre a regra ativa registrada e a última manutenção canônica; sem regra → `sem_regra` declarado; regra sem base canônica → `sem_base` declarado; com base → `em_dia`/`alerta`/`vencida` com derivação exposta (datas-limite, km restantes, regra e fonte). Nada é inferido.
- **"Se frota própria existir"**: a listagem devolve `fleet_registered` e, vazia, declara "Nenhum registro canônico de frota própria"; nenhum veículo, custo ou histórico é inventado.
- **Rotas legadas `/api/ext/fleet-*`** deixaram de ser atalho: leitura passa pela mesma autorização e declara fonte/data-base; mutação responde `410 legacy_route_retired` apontando a rota canônica. Os handlers antigos foram removidos de `ext-api.mjs`.
- **UI real `/admin/frota`** (`FrotaWorkspace.tsx`): carregamento, vazio declarado, erro com retry, confirmação somente após resposta real do servidor; cada formulário mantém a própria chave de idempotência e a **preserva em falha** para que o retry não duplique; dossiê exibe custo com fonte/data-base, alerta com regra/derivação e os quatro históricos. O registro de documento é de **metadados sintéticos** (sem upload de arquivo real nesta fatia, declarado na tela).

## Validação automática executada

- `npm ci`: OK.
- `node scripts/qa-wave0-static.mjs`: **5/5** (001–147). A lista e a guarda de manifesto de `scripts/migrate-site-visual.mjs` (contagem 147 e log final "001–147") e o `latestMigration` de `scripts/qa-wave0-static.mjs` foram atualizados **juntos** com a migração, evitando a defasagem que derrubou a primeira rodada de CI da PR #95.
- `npm run typecheck`: OK (0 erros).
- `node --test tests/ext01-fleet.test.mjs`: **20/20** (registrado em `test:unit`).
- `npm test`: **265/265**.
- `npm run build`: exit 0, **86 páginas**, rota `/admin/frota` listada.
- `npm run test:migrations:pg`: **147/147** em PostgreSQL descartável, dois passes (replay integral "Already applied"), checksum negativo deliberado rejeitado e clone TEMPLATE preservado (535 tabelas).
- `npm run test:l08-delivery:pg`: **51/51** em PostgreSQL descartável — aplica as migrações 001–147 (prova que a 147 aplica limpa com o servidor real) e preserva CLI-01..05; **este gate não cobre a jornada EXT-01 e não é apresentado como prova dela**.
- `npm run test:demo-local:pg` (QA-HOM-008/009): passou — exercita a guarda de manifesto atualizada no caminho que falhou na CI da fatia anterior.

O teste dedicado prova, no contrato implementado: anônimo 401 e papel não autorizado 403 sem tocar o banco; same-origin antes de qualquer query; ausência de frota declarada com fonte e data-base; `Idempotency-Key` obrigatória (400 sem ela); transação única na ordem BEGIN → negócio → evento imutável → auditoria → COMMIT; corpo forjado ignorado (ID gerado no servidor, autoria da sessão, origem fixada); replay sem duplicação; 409 em reuso divergente; 503 + rollback em falha da auditoria; vínculo do abastecimento pela URL com `vehicle_id` forjado ignorado e km atualizado na mesma transação; 404 + rollback em veículo inexistente; data futura recusada; manutenção atualizando o veículo na mesma transação; regressão de km recusada; logs apenas-acréscimo na API (405 em PUT/DELETE); custo somado só de registros canônicos com fonte/data-base; derivação do alerta em todos os estados (`sem_regra`, `sem_base`, `em_dia`, `alerta`, `vencida`); rota legada 410 com ponteiro canônico e leitura legada com papel e fonte; desativação de documento com autor derivado e DELETE 405. Sem skip, sem assert enfraquecido, sem timeout aumentado, sem dados reais e sem SMTP real.

## Fronteiras e aceite

Classificação: **implementação local + validação automática rápida** (estática, unitária, build, gate de migrações e gates legados em PostgreSQL descartável). Não é a bateria pesada HTTP/DB dedicada de EXT-01, não é aplicação em destino, não é aceite humano e não é homologação Windows — todos permanecem pendentes por decisão do proprietário. O aceite humano anterior de Marcelo e Andreia refere-se somente ao L07 e não é renovado aqui. CLI-01..15 foram preservadas (CLI-15 não foi reaberta; `auth_sessions` continua a única sessão de cliente, as tabelas v2 não autenticam e o RH segue recebendo só o envelope mínimo de `cli_employee_complaint_hr_shares`). EXT-02..17 e os demais órfãos continuam não promovidos. Após EXT-01 permanecem pendentes EXT-02..17, a bateria pesada integral, a aplicação final em destino e a homologação Windows.
