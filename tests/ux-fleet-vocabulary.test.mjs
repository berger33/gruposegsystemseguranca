// UX-07 / EXT-01 — teste anti-deriva do vocabulário da família FROTA.
//
// Ele lê os ARQUIVOS REAIS de servidor, extrai os códigos de erro e falha se:
//  - existir código real sem descrição no vocabulário;
//  - o vocabulário inventar um código que o servidor não devolve;
//  - o levantamento cair abaixo do limiar (regressão de extração);
//  - a rota legada VIVA sair do dispatch sem refazer o levantamento;
//  - algum handler exportado pelo servidor canônico sair do dispatch (origem
//    morta nova, que obrigaria a rever a decisão registrada).
//
// A lição que originou este formato está registrada na seção 4 de
// docs/UX-07-CONTRATOS-2026-10-05.md, na seção 5.3 de
// docs/UX-07-FINANCEIRO-2026-10-05.md e na seção 3.2 de
// docs/UX-07-COMPLIANCE-2026-10-06.md: medir apenas `error:` literal dá falsa
// segurança. Aqui o extrator casa os quatro formatos conhecidos (literal,
// `new HttpError()/new E()`, wrapper local `bad()/unavailable()` e a exceção
// `new Error('codigo')` convertida em resposta) e remove antes os operandos de
// `.includes('…')` e `[=!]==? '…'`, que são valores de ENUM e nomes de método
// HTTP — não códigos de erro. Nesta família isso importa duas vezes:
// `duplicate_plate` só aparece dentro de um TERNÁRIO (`onConflict`) e cinco
// códigos só aparecem dentro de `{ deny: { code, body: { error: … } } }`.
//
// ORIGENS, e a decisão registrada sobre cada uma:
//  1. src/server/ext-fleet-api.mjs — servidor canônico, dispatch de
//     /api/ext/fleet/* em server.mjs (~4210–4226). Única origem VIVA.
//  2. O recorte legado (`handleLegacyVehicles` + `legacyCollectionHandler`)
//     mora no MESMO arquivo canônico e continua RELIGADO (~4229–4240 e
//     ~5937–5953). Por ser rota VIVA, `legacy_route_retired` e
//     `invalid_vehicle_id` ENTRAM no vocabulário — mesmo critério aplicado a
//     `legacy_mutation_retired` em EXT-06.
//  3. NÃO há handler morto nesta família: os doze handlers exportados por
//     `createExtFleetApi()` estão todos no dispatch. Este teste fixa a
//     decisão: se algum sair do dispatch, o levantamento precisa ser refeito.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeFleetError,
  fleetErrorMessage,
  fleetErrorVariant,
  fleetErrorFootnote,
  vehicleStatusLabel,
  vehicleStatusTone,
  fuelTypeLabel,
  vehicleOriginLabel,
  alertStatusLabel,
  alertStatusTone,
  alertKindLabel,
  alertComponentSummary,
  fleetEventLabel,
  documentStateLabel,
  ruleSummary,
  honestDate,
  honestDateTime,
  honestNumber,
  honestMoneyFromCents,
  honestMileage,
  honestLiters,
  honestText,
  responsibleLabel,
  count,
  ABSENT,
  NO_RESPONSIBLE,
  FLEET_NOT_REGISTERED,
  ERROR_MESSAGES,
} from '../src/lib/fleet-vocabulary.mjs';

const read = url => readFile(new URL(url, import.meta.url), 'utf8');

const canonical = await read('../src/server/ext-fleet-api.mjs');
const server = await read('../server.mjs');
const workspace = await read('../src/app/admin/frota/FrotaWorkspace.tsx');
const migration147 = await read('../db/migrations/147-ext01-fleet-canonical-journey.sql');

function serverErrorCodes(text) {
  const codes = new Set();
  // Operandos de comparação e de `.includes()` são valores de ENUM, nomes de
  // método HTTP e constantes de negócio; retirá-los antes evita contar o que
  // não é código de erro.
  const cleaned = text
    .replace(/\.includes\(\s*[`'"][^`'"]*[`'"]\s*\)/g, '')
    .replace(/[=!]==?\s*[`'"][^`'"]*[`'"]/g, '');
  for (const match of cleaned.matchAll(/error:\s*([^,}\n]{1,200})/g)) {
    for (const literal of match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(literal[1]);
  }
  for (const match of cleaned.matchAll(/new (?:HttpError|E)\(\s*\d+\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  for (const match of cleaned.matchAll(/\b(?:bad|unavailable)\(\s*res\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  for (const match of cleaned.matchAll(/new Error\(\s*[`'"]([a-z0-9_]+)[`'"]\s*\)\s*,\s*\{\s*status/g)) codes.add(match[1]);
  return codes;
}

const codes = serverErrorCodes(canonical);

test('UX-07 frota: o servidor canônico continua religado rota a rota', () => {
  // Dispatch real do servidor canônico, conferido URL a URL contra server.mjs.
  assert.match(server, /createExtFleetApi/);
  assert.match(server, /url\.pathname === "\/api\/ext\/fleet\/vehicles"/);
  assert.match(server, /extFleetApi\.handleVehicleById\(req, res, fleetVehicleMatch\[1\]\)/);
  assert.match(server, /extFleetApi\.handleVehicleResponsible\(req, res, fleetResponsibleMatch\[1\]\)/);
  assert.match(server, /extFleetApi\.handleVehicleFuelLogs\(req, res, fleetFuelMatch\[1\]\)/);
  assert.match(server, /extFleetApi\.handleVehicleMaintenanceLogs\(req, res, fleetMaintenanceMatch\[1\]\)/);
  assert.match(server, /extFleetApi\.handleVehicleDocuments\(req, res, fleetVehicleDocumentsMatch\[1\]\)/);
  assert.match(server, /extFleetApi\.handleVehicleMaintenanceRules\(req, res, fleetRulesMatch\[1\]\)/);
  assert.match(server, /extFleetApi\.handleDocumentById\(req, res, fleetDocumentMatch\[1\]\)/);
  // Nenhum handler exportado pode sair do dispatch sem refazer o levantamento.
  for (const handler of [
    'handleVehicles', 'handleVehicleById', 'handleVehicleResponsible', 'handleVehicleFuelLogs',
    'handleVehicleMaintenanceLogs', 'handleVehicleDocuments', 'handleDocumentById',
    'handleVehicleMaintenanceRules', 'handleLegacyVehicles', 'handleLegacyFuelLogs',
    'handleLegacyMaintenanceLogs', 'handleLegacyDocuments',
  ]) {
    assert.ok(canonical.includes(handler), `o servidor canônico ainda exporta ${handler}`);
    assert.match(server, new RegExp(`extFleetApi\\.${handler}`), `${handler} precisa continuar no dispatch`);
  }
});

test('UX-07 frota: a rota legada continua VIVA e por isso entra no vocabulário', () => {
  // Decisão registrada: a rota antiga responde 200 em leitura e 410
  // `legacy_route_retired` em mutação, e os aliases continuam religados. Por
  // ser VIVA, os seus códigos entram no vocabulário. Se os aliases saírem do
  // dispatch, este teste falha e o levantamento precisa ser refeito.
  for (const alias of [
    '/api/admin/hr/ext-fleet-vehicles',
    '/api/crm/hr/ext-fleet-vehicles',
    '/api/hr/ext-fleet-vehicles',
    '/api/ext/fleet-vehicles',
    '/api/admin/hr/ext-fleet-fuel-logs',
    '/api/ext/fleet-fuel-logs',
    '/api/admin/hr/ext-fleet-maintenance-logs',
    '/api/ext/fleet-maintenance-logs',
    '/api/admin/hr/ext-fleet-documents',
    '/api/ext/fleet-documents',
  ]) {
    assert.ok(server.includes(`"${alias}"`), `o alias legado ${alias} continua religado em server.mjs`);
  }
  assert.match(canonical, /legacy_route_retired/);
  assert.match(canonical, /use: config\.canonical/);
  assert.ok(codes.has('legacy_route_retired'), 'a rota legada religada precisa entrar no levantamento');
  assert.ok(codes.has('invalid_vehicle_id'), 'o filtro exclusivo da rota legada precisa entrar no levantamento');
  assert.ok('legacy_route_retired' in ERROR_MESSAGES);
  assert.ok('invalid_vehicle_id' in ERROR_MESSAGES);
});

test('UX-07 frota: a família não tem wrapper local nem exceção convertida', () => {
  // Fato verificado nesta fatia e registrado no documento: tudo sai por
  // `json(res, status, { error: '...' })`, inclusive os `deny` montados em
  // `work()` e devolvidos por `runMutation()`. `readBody()` responde via quem
  // chama, sem lançar. O extrator continua casando os outros formatos
  // justamente para que um wrapper futuro não passe despercebido.
  assert.doesNotMatch(canonical, /\b(?:bad|unavailable)\(\s*res\s*,/);
  assert.doesNotMatch(canonical, /new (?:HttpError|E)\(\s*\d+\s*,/);
  assert.doesNotMatch(canonical, /new Error\(\s*[`'"][a-z0-9_]+[`'"]\s*\)\s*,\s*\{\s*status/);
  assert.doesNotMatch(canonical, /\bthrow new\b/);
});

test('UX-07 frota: o levantamento real de códigos fica acima do limiar anti-deriva', () => {
  // Total real medido nesta fatia: 50 códigos, todos no servidor canônico.
  assert.ok(codes.size >= 50, `esperava ao menos 50 códigos na família, achei ${codes.size}`);
  // `duplicate_plate` SÓ existe dentro do ternário de `onConflict`.
  assert.match(canonical, /onConflict: error => \(\/plate\/i\.test/);
  assert.ok(codes.has('duplicate_plate'), 'o código do ternário precisa ser medido');
  // Estes cinco só existem dentro de `{ deny: { code, body: { error } } }`.
  for (const negado of ['vehicle_not_found', 'mileage_regression', 'document_not_found', 'document_already_inactive']) {
    assert.ok(codes.has(negado), `o código ${negado} sai de um deny e precisa ser medido`);
  }
  assert.match(canonical, /return \{ deny: \{ code: 404, body: \{ error: "vehicle_not_found" \} \} \}/);
  // Guardas de sessão, papel, origem e idempotência.
  for (const guarda of ['unauthorized', 'forbidden_role', 'origin_forbidden', 'idempotency_key_required', 'idempotency_key_reused', 'audit_unavailable', 'fleet_unavailable']) {
    assert.ok(codes.has(guarda), `o código de guarda ${guarda} precisa ser medido`);
  }
});

// Título devolvido pelo vocabulário quando o código NÃO tem tradução. É o
// sentinela do teste: qualquer código real que caia nele está descoberto.
const TITULO_SEM_TRADUCAO = describeFleetError('codigo_que_o_servidor_nao_devolve', 500).title;

test('UX-07 frota: todo código real do servidor tem descrição em português', () => {
  const faltando = [];
  for (const code of codes) {
    const item = describeFleetError(code, 500);
    if (!item.title || item.title === code || item.title === TITULO_SEM_TRADUCAO) faltando.push(code);
    assert.equal(item.code, code, `o descritor precisa preservar o código canônico ${code}`);
  }
  assert.deepEqual(faltando, [], `códigos reais sem tradução: ${faltando.join(', ')}`);
});

test('UX-07 frota: o vocabulário não inventa código que o servidor não devolve', () => {
  const inventados = Object.keys(ERROR_MESSAGES).filter(code => !codes.has(code));
  assert.deepEqual(inventados, [], `traduções sem código real correspondente: ${inventados.join(', ')}`);
  assert.equal(new Set(Object.keys(ERROR_MESSAGES)).size, Object.keys(ERROR_MESSAGES).length, 'nenhum código duplicado');
});

test('UX-07 frota: código desconhecido passa cru e nunca ganha frase inventada', () => {
  const desconhecido = describeFleetError('codigo_novo_do_servidor', 422);
  assert.equal(desconhecido.code, 'codigo_novo_do_servidor');
  assert.equal(desconhecido.title, 'Falha no servidor');
  assert.match(desconhecido.detail, /codigo_novo_do_servidor/);
  assert.equal(desconhecido.canRetry, false);
  // O código canônico é informação técnica, nunca o título principal.
  assert.match(fleetErrorMessage('codigo_novo_do_servidor', 422), /\(codigo_novo_do_servidor\)$/);
  assert.match(fleetErrorFootnote(desconhecido), /^Código técnico: \(codigo_novo_do_servidor\)$/);

  // Falha de rede e falha sem código continuam sendo estados próprios.
  const rede = describeFleetError(null, 0);
  assert.equal(rede.kind, 'network');
  assert.equal(rede.code, null);
  assert.match(rede.detail, /não é uma frota vazia nem um custo zero/i);
  assert.equal(fleetErrorFootnote(rede), 'Código técnico: indisponível');
  const semCodigo = describeFleetError(null, 500);
  assert.equal(semCodigo.kind, 'error');
  assert.equal(semCodigo.code, null);
  assert.equal(semCodigo.canRetry, true);

  // Recusa de papel é estado NEGADO, distinto de falha de leitura.
  assert.equal(fleetErrorVariant(describeFleetError('forbidden_role', 403)), 'denied');
  assert.equal(fleetErrorVariant(describeFleetError('unauthorized', 401)), 'denied');
  assert.equal(fleetErrorVariant(describeFleetError('origin_forbidden', 403)), 'denied');
  assert.equal(fleetErrorVariant(describeFleetError('fleet_unavailable', 503)), 'error');
});

test('UX-07 frota: os ENUMs reais do servidor e das migrações saem em português', () => {
  // VEHICLE_STATUSES do servidor e tipo ext_fleet_status (migração 085).
  for (const value of ['disponivel', 'em_uso', 'em_manutencao', 'baixado', 'reservado']) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda usa a situação ${value}`);
    assert.notEqual(vehicleStatusLabel(value), value, `vehicleStatus ${value}`);
  }
  // FUEL_TYPES do servidor e tipo ext_fuel_type (migração 085).
  for (const value of ['gasolina', 'etanol', 'diesel', 'flex', 'eletrico', 'hibrido', 'outro']) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda aceita o combustível ${value}`);
    assert.notEqual(fuelTypeLabel(value), value, `fuelType ${value}`);
  }
  // Constraint ext_fleet_vehicles_origin_check (migração 147).
  for (const value of ['registro_legado', 'jornada_frota']) {
    assert.ok(migration147.includes(`'${value}'`), `a migração 147 ainda declara a origem ${value}`);
    assert.notEqual(vehicleOriginLabel(value), value, `vehicleOrigin ${value}`);
  }
  assert.ok(canonical.includes("'jornada_frota'"), 'o servidor ainda grava a origem canônica');
  // Status do alerta derivado por deriveMaintenanceAlert().
  for (const value of ['em_dia', 'alerta', 'vencida', 'sem_base', 'sem_regra']) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda deriva o alerta ${value}`);
    assert.notEqual(alertStatusLabel(value), value, `alertStatus ${value}`);
  }
  for (const value of ['dias', 'km']) {
    assert.ok(canonical.includes(`kind: "${value}"`), `o servidor ainda monta o critério ${value}`);
    assert.notEqual(alertKindLabel(value), value, `alertKind ${value}`);
  }
  // event_type: constraint da 147 e os oito valores que insertEvent() grava.
  for (const value of [
    'veiculo_criado', 'situacao_atualizada', 'responsavel_atribuido', 'abastecimento_registrado',
    'manutencao_registrada', 'documento_registrado', 'documento_desativado', 'regra_manutencao_registrada',
  ]) {
    assert.ok(migration147.includes(`'${value}'`), `a migração 147 ainda permite o evento ${value}`);
    assert.ok(canonical.includes(`eventType: "${value}"`), `o servidor ainda grava o evento ${value}`);
    assert.notEqual(fleetEventLabel(value), value, `fleetEvent ${value}`);
  }
  for (const value of ['ativo', 'desativado']) assert.notEqual(documentStateLabel(value), value);
  // Ausência NOMEADA pelo servidor: fleet_registered, source, base_date, note.
  for (const campo of ['fleet_registered', 'source', 'base_date', 'note']) {
    assert.ok(canonical.includes(campo), `o servidor ainda declara o campo de ausência ${campo}`);
  }
  // Valor desconhecido PASSA CRU: nada é inventado para ele.
  assert.equal(vehicleStatusLabel('situacao_que_nao_existe'), 'situacao_que_nao_existe');
  assert.equal(fuelTypeLabel('hidrogenio'), 'hidrogenio');
  assert.equal(alertStatusLabel('status_novo'), 'status_novo');
  assert.equal(fleetEventLabel('evento_novo'), 'evento_novo');
  assert.equal(vehicleStatusTone('situacao_que_nao_existe'), 'neutral');
  assert.equal(alertStatusTone('status_novo'), 'neutral');
});

test('UX-07 frota: ausência é honesta e nunca vira 0, 0 km, R$ 0,00 ou 01/01/1970', () => {
  for (const vazio of [null, undefined, '']) {
    assert.equal(honestDate(vazio), ABSENT);
    assert.equal(honestDateTime(vazio), ABSENT);
    assert.equal(count(vazio), ABSENT);
    assert.equal(honestNumber(vazio), ABSENT);
    assert.equal(honestText(vazio), ABSENT);
    assert.equal(honestMoneyFromCents(vazio), ABSENT);
    assert.equal(honestMileage(vazio), ABSENT);
    assert.equal(honestLiters(vazio), ABSENT);
    assert.equal(responsibleLabel(vazio), NO_RESPONSIBLE);
  }
  assert.notEqual(honestDate(null), '01/01/1970');
  assert.notEqual(count(null), '0');
  assert.notEqual(honestMileage(null), '0 km');
  assert.doesNotMatch(honestMoneyFromCents(null), /0,00/);
  assert.equal(vehicleStatusLabel(null), ABSENT);
  assert.equal(fuelTypeLabel(''), ABSENT);
  assert.equal(ruleSummary(null), ABSENT);
  assert.equal(ruleSummary({}), ABSENT);
  assert.equal(alertComponentSummary(undefined), ABSENT);
  assert.notEqual(FLEET_NOT_REGISTERED, '0');

  // Zero REAL vindo do servidor continua sendo zero: o defeito era transformar
  // AUSÊNCIA em zero, não mostrar um zero verdadeiro. Odômetro zerado, custo
  // zero e zero registros são fatos canônicos desta família.
  assert.equal(count(0), '0');
  assert.equal(honestNumber(0), '0');
  assert.equal(honestMileage(0), '0 km');
  assert.equal(honestLiters(0), '0 L');
  assert.match(honestMoneyFromCents(0), /R\$\s?0,00/);

  // Regra e componentes do alerta saem em português, preservando o número real.
  assert.match(ruleSummary({ interval_days: 180, alert_before_days: 15 }), /a cada 180 dia\(s\), avisando 15 dia\(s\) antes/);
  assert.match(ruleSummary({ interval_km: 10000, alert_before_km: 500 }), /a cada 10\.000 km, avisando 500 km antes/);
  assert.match(
    alertComponentSummary({ kind: 'km', status: 'alerta', base_mileage: 10000, due_mileage: 20000, remaining_km: 300 }),
    /Critério por quilometragem: Dentro da antecedência da regra/,
  );
  assert.match(
    alertComponentSummary({ kind: 'dias', status: 'sem_base', detail: 'Regra por dias exige manutenção canônica registrada como base; nenhuma existe.' }),
    /Sem base canônica para calcular\. Regra por dias exige/,
  );

  // Datas e números em pt-BR, sem espaço rígido inesperado.
  assert.equal(honestDate('2026-10-06'), '06/10/2026');
  assert.equal(count(1234567), '1.234.567');
  assert.doesNotMatch(count(1234567), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestMoneyFromCents(1234567), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestDateTime('2026-10-06T12:00:00.000Z'), /[\u00a0\u202f]/);
  // Valor que não é data continua aparecendo cru, sem virar epoch.
  assert.equal(honestDate('nao-e-data'), 'nao-e-data');
});

test('UX-07 frota: a apresentação não tem style inline nem classe utilitária avulsa', () => {
  assert.doesNotMatch(workspace, /style\s*=\s*\{/, 'zero style inline');
  assert.doesNotMatch(workspace, /CSSProperties/, 'nenhum objeto de estilo');
  assert.match(workspace, /UiWorkspace\.module\.css/);
  assert.match(workspace, /<UiState/);
  assert.match(workspace, /fleetRequest/);
  // TODA className precisa ser uma expressão de módulo CSS: nenhuma string
  // literal com utilitários soltos ("border rounded px-2 py-1.5 text-sm" x26,
  // "px-4 py-3 text-left font-medium text-gray-500" x7, e assim por diante).
  const classNames = [...workspace.matchAll(/className=(\{[^}]*\}|"[^"]*")/g)].map(match => match[1]);
  assert.ok(classNames.length > 0, 'a tela precisa aplicar classes do módulo compartilhado');
  for (const expression of classNames) {
    assert.ok(expression.startsWith('{'), `className literal encontrada: ${expression}`);
    assert.match(expression, /styles\./, `className sem o módulo compartilhado: ${expression}`);
  }
  // Nenhum utilitário do protótipo sobrou no arquivo.
  for (const utilitario of [
    'border rounded px-2 py-1.5 text-sm',
    'px-4 py-3 text-left font-medium text-gray-500',
    'text-xs text-gray-500',
    'bg-blue-600',
    'divide-y divide-gray-200',
  ]) {
    assert.ok(!workspace.includes(utilitario), `utilitário avulso remanescente: ${utilitario}`);
  }
  // TODO campo tem rótulo de verdade: nenhum `placeholder` no lugar de label.
  assert.doesNotMatch(workspace, /placeholder=/, 'placeholder nunca substitui rótulo');
  const labels = (workspace.match(/<label htmlFor=/g) || []).length;
  const controls = (workspace.match(/<(input|select|textarea)\b/g) || []).length;
  assert.ok(labels >= controls, `cada controle precisa de um <label>: ${labels} rótulos para ${controls} controles`);
});

test('UX-07 frota: a reescrita preservou URL, método, cabeçalho e chave', () => {
  for (const contrato of [
    /"\/api\/ext\/fleet\/vehicles"/,
    /`\/api\/ext\/fleet\/vehicles\/\$\{id\}`/,
    /`\/api\/ext\/fleet\/vehicles\/\$\{id\}\/maintenance-rules`/,
    /`\/api\/ext\/fleet\/vehicles\/\$\{selectedId\}\/responsible`/,
    /`\/api\/ext\/fleet\/vehicles\/\$\{selectedId\}\/fuel-logs`/,
    /`\/api\/ext\/fleet\/vehicles\/\$\{selectedId\}\/maintenance-logs`/,
    /`\/api\/ext\/fleet\/vehicles\/\$\{selectedId\}\/documents`/,
    /`\/api\/ext\/fleet\/documents\/\$\{documentId\}`/,
    /`\/api\/ext\/fleet\/vehicles\/\$\{selectedId\}\/maintenance-rules`/,
    /"Idempotency-Key": key/,
  ]) assert.match(workspace, contrato, `contrato preservado: ${contrato}`);
  // Métodos exatamente como o servidor os aceita.
  assert.match(workspace, /"\/api\/ext\/fleet\/vehicles", "POST"/);
  assert.match(workspace, /`\/api\/ext\/fleet\/vehicles\/\$\{selectedId\}`, "PATCH"/);
  assert.match(workspace, /`\/api\/ext\/fleet\/documents\/\$\{documentId\}`, "PATCH"/);
  // Formato REAL da chave do protótipo, prefixo a prefixo.
  assert.match(workspace, /`\$\{prefix\}-\$\{crypto\.randomUUID\(\)\}`/);
  for (const prefixo of ['ext01-veh', 'ext01-stat', 'ext01-resp', 'ext01-fuel', 'ext01-main', 'ext01-doc', 'ext01-docx', 'ext01-rule']) {
    assert.ok(workspace.includes(`"${prefixo}"`), `o prefixo de chave ${prefixo} foi preservado`);
  }
  // Contrato herdado de idempotência: chave criada por operação, preservada
  // após falha e descartada só no sucesso, e VISÍVEL junto do erro.
  assert.match(workspace, /keys\.current\[op\] = key/);
  assert.match(workspace, /delete keys\.current\[op\]/);
  assert.match(workspace, /setPreservedKey\(key\)/, 'a chave preservada é mostrada a quem opera');
  assert.match(workspace, /Chave preservada para repetição segura/);
  // Toda URL de API chamada pela tela precisa ser do namespace canônico; a
  // leitura legada religada NÃO é consumida aqui. Comentários são removidos
  // antes: eles citam os aliases legados justamente para registrar isso.
  const semComentarios = workspace.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const urls = [...semComentarios.matchAll(/["'`](\/api\/[^"'`]+)[\s"'`]/g)].map(match => match[1]);
  assert.ok(urls.length >= 8, `esperava as URLs canônicas no código, achei ${urls.length}`);
  for (const url of urls) {
    assert.ok(url.startsWith('/api/ext/fleet/'), `URL fora do namespace canônico: ${url}`);
  }
  for (const alias of ['/api/ext/fleet-', '/api/hr/ext-fleet', '/api/crm/hr/ext-fleet', '/api/admin/hr/ext-fleet']) {
    assert.ok(!semComentarios.includes(alias), `a tela não consome o alias legado ${alias}`);
  }
});

test('UX-07 frota: a tela não escreve justificativa nem motivo no lugar de quem opera', () => {
  assert.doesNotMatch(workspace, /justification:\s*[^}\n]*\|\|/, 'nenhuma justificativa padrão substitui quem opera');
  assert.doesNotMatch(workspace, /reason:\s*[^}\n,]*\|\|/, 'nenhum motivo padrão substitui quem opera');
  // Os três textos obrigatórios vêm de campos rotulados.
  assert.match(workspace, /reason: responsibleForm\.reason/);
  assert.match(workspace, /justification: ruleForm\.justification/);
  assert.match(workspace, /const typed = deactivateReason\[documentId\] \|\| "";/);
  assert.match(workspace, /\{ reason: typed \}/);
  // Defeito de estado corrigido: o motivo e a chave de desativação eram um
  // estado único compartilhado por todos os documentos.
  assert.match(workspace, /setDeactivateReason/);
  assert.match(workspace, /mutate\(`doc-\$\{documentId\}`/, 'cada documento tem a sua própria chave');
  // Lacuna de leitura corrigida: o GET de maintenance-rules passou a ser lido.
  assert.match(workspace, /const loadRules = useCallback/);
  assert.match(canonical, /if \(req\.method === "GET"\) \{[\s\S]{0,400}ext_fleet_maintenance_rules WHERE vehicle_id=\$1 ORDER BY created_at DESC/);
});

test('UX-07 frota: as abas são tablist/tab/tabpanel reais com roving tabindex', () => {
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /aria-selected=\{active === tab\.id\}/);
  assert.match(workspace, /aria-controls=\{`frota-panel-\$\{tab\.id\}`\}/);
  assert.match(workspace, /aria-labelledby="frota-tab-/);
  assert.match(workspace, /tabIndex=\{active === tab\.id \? 0 : -1\}/, 'roving tabindex');
  for (const tecla of ['ArrowRight', 'ArrowLeft', '"Home"', '"End"']) assert.match(workspace, new RegExp(tecla));
  assert.doesNotMatch(workspace, /aria-pressed/, 'aria-pressed não substitui tab');
});

test('UX-07 frota: a tela declara a condição do plano e não promete veículo em dia', () => {
  assert.match(workspace, /se frota própria existir/i);
  assert.match(workspace, /não mostra frota vazia como se fosse frota zerada/i);
  assert.match(workspace, /sem regra, a tela diz que não há regra, nunca\s*\n?\s*que está tudo em dia/i);
  assert.match(workspace, /Menu não é autorização/);
  assert.match(workspace, /Ausência de manutenção registrada não é prova de veículo em dia/i);
  assert.match(workspace, /Ausência de documento registrado não é prova de documentação em dia/i);
  assert.match(workspace, /Ausência de abastecimento não é custo zero/i);
  assert.match(workspace, /Nenhum arquivo real é armazenado nesta fatia/i);
});

test('UX-07 frota: a página não alargou o AdminGate nem trocou de servidor', async () => {
  const page = await read('../src/app/admin/frota/page.tsx');
  assert.match(page, /allowedRoles=\{\["marcelo", "admin", "ti"\]\}/);
  // Quem decide é o servidor: sessão de equipe, papel, origem e identidade.
  assert.match(canonical, /export const FLEET_READ_ROLES = Object\.freeze\(\["admin", "marcelo", "ti"\]\)/);
  assert.match(canonical, /export const FLEET_WRITE_ROLES = Object\.freeze\(\["admin", "marcelo", "ti"\]\)/);
  assert.match(canonical, /json\(res, 401, \{ error: "unauthorized" \}\)/);
  assert.match(canonical, /json\(res, 403, \{ error: "forbidden_role" \}\)/);
  assert.match(canonical, /sameOrigin\(req\)/);
  assert.match(canonical, /idempotency_key_required/);
  assert.match(canonical, /audit_unavailable/);
  // Derivação determinística do alerta continua exportada e sem estimativa.
  assert.match(canonical, /export function deriveMaintenanceAlert/);
  assert.match(canonical, /status: "sem_regra"/);
});
