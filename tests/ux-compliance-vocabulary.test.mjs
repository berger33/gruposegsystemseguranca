// UX-07 / EXT-07 — teste anti-deriva do vocabulário da família COMPLIANCE.
//
// Ele lê os ARQUIVOS REAIS de servidor, extrai os códigos de erro e falha se:
//  - existir código real sem descrição no vocabulário;
//  - o vocabulário inventar um código que o servidor não devolve;
//  - o levantamento cair abaixo do limiar (regressão de extração);
//  - os marcadores que delimitam o recorte legado sumirem.
//
// A lição que originou este formato está registrada na seção 4 de
// docs/UX-07-CONTRATOS-2026-10-05.md e na seção 5.3 de
// docs/UX-07-FINANCEIRO-2026-10-05.md: medir apenas `error:` literal dá falsa
// segurança. Aqui o extrator casa os formatos conhecidos (literal,
// `new HttpError()/new E()`, wrapper local `bad()/unavailable()` e, nesta
// família, a exceção `new Error('codigo')` que `mutate()` converte em
// resposta) e remove antes os operandos de `.includes('…')` e `[=!]==? '…'`,
// que são nomes de constraint e valores de ENUM — não códigos de erro.
//
// DUAS origens reais (ver cabeçalho de src/lib/compliance-vocabulary.mjs):
//  1. src/server/ext-compliance-api.mjs — servidor canônico, dispatch único de
//     /api/ext/compliance/* em server.mjs;
//  2. o recorte "// EXT-07 compliance" … "// EXT-08 base conhecimento" de
//     src/server/ext-advanced-api.mjs (handleComplianceDocuments), rota legada
//     de leitura que CONTINUA RELIGADA em server.mjs — origem viva, não
//     preventiva.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeComplianceError,
  complianceErrorMessage,
  complianceErrorVariant,
  complianceErrorFootnote,
  failedClosedList,
  failedClosedReasonLabel,
  documentStatusLabel,
  documentStatusTone,
  complianceTypeLabel,
  obligationStatusLabel,
  obligationStatusTone,
  criticalityLabel,
  criticalityTone,
  taskStatusLabel,
  taskStatusTone,
  planStatusLabel,
  planStatusTone,
  planTypeLabel,
  referenceTypeLabel,
  complianceOriginLabel,
  runStatusLabel,
  runOriginLabel,
  complianceEventLabel,
  honestDate,
  honestDateTime,
  honestNumber,
  honestPercent,
  honestText,
  count,
  ABSENT,
  PERCENT_NOT_CALCULATED,
  ERROR_MESSAGES,
} from '../src/lib/compliance-vocabulary.mjs';

const read = url => readFile(new URL(url, import.meta.url), 'utf8');

const canonical = await read('../src/server/ext-compliance-api.mjs');
const advanced = await read('../src/server/ext-advanced-api.mjs');

// Marcadores reais do recorte legado. Se um deles sumir, o teste falha em vez
// de medir um pedaço errado (ou nenhum pedaço) do arquivo.
const LEGACY_START = '// EXT-07 compliance';
const LEGACY_END = '// EXT-08 base conhecimento';
const startIndex = advanced.indexOf(LEGACY_START);
const endIndex = advanced.indexOf(LEGACY_END);
const legacy = startIndex >= 0 && endIndex > startIndex ? advanced.slice(startIndex, endIndex) : '';

function serverErrorCodes(text) {
  const codes = new Set();
  // Operandos de comparação e de `.includes()` são nomes de constraint, de
  // ENUM e de método HTTP; retirá-los antes evita contar o que não é código.
  const cleaned = text
    .replace(/\.includes\(\s*[`'"][^`'"]*[`'"]\s*\)/g, '')
    .replace(/[=!]==?\s*[`'"][^`'"]*[`'"]/g, '');
  for (const match of cleaned.matchAll(/error:\s*([^,}\n]{1,200})/g)) {
    for (const literal of match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(literal[1]);
  }
  for (const match of cleaned.matchAll(/new (?:HttpError|E)\(\s*\d+\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  for (const match of cleaned.matchAll(/\b(?:bad|unavailable)\(\s*res\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  // Quarta regra, específica desta família: `readBody()` lança
  // `Object.assign(new Error('codigo'), { status })` e `mutate()` responde com
  // `{ error: error.message }`. São códigos REAIS do contrato HTTP, exercitados
  // pelo gate herdado (400 e 413); medir só `error:` literal os perderia.
  for (const match of cleaned.matchAll(/new Error\(\s*[`'"]([a-z0-9_]+)[`'"]\s*\)\s*,\s*\{\s*status/g)) codes.add(match[1]);
  return codes;
}

const canonicalCodes = serverErrorCodes(canonical);
const legacyCodes = serverErrorCodes(legacy);
const codes = new Set([...canonicalCodes, ...legacyCodes]);

test('UX-07 compliance: as duas origens reais da família continuam religadas', async () => {
  const server = await read('../server.mjs');
  // Dispatch único do servidor canônico.
  assert.match(server, /createExtComplianceApi/);
  assert.match(server, /extComplianceApi\.handle\(req, res\)/);
  assert.match(server, /startsWith\("\/api\/ext\/compliance\/"\)/);
  // A rota legada de leitura ESTÁ religada (diferente do caso de analytics):
  // é por isso que o recorte entra no vocabulário como origem viva.
  assert.match(server, /extAdvancedApi\.handleComplianceDocuments\(req, res\)/);
  assert.match(server, /legacy_writer_retired/);
  // Os marcadores que delimitam o recorte precisam existir, senão o
  // levantamento mediria o arquivo errado.
  assert.ok(startIndex >= 0, `o marcador inicial ${LEGACY_START} sumiu de ext-advanced-api.mjs`);
  assert.ok(endIndex > startIndex, `o marcador final ${LEGACY_END} sumiu de ext-advanced-api.mjs`);
  assert.match(legacy, /handleComplianceDocuments/);
});

test('UX-07 compliance: a família não tem wrapper local de erro', () => {
  // Fato verificado nesta fatia e registrado no documento: tudo sai por
  // `json(res, status, { error: '...' })`. O extrator continua casando os
  // outros formatos justamente para que a introdução de um wrapper amanhã não
  // passe despercebida.
  assert.doesNotMatch(canonical, /\b(?:bad|unavailable)\(\s*res\s*,/);
  assert.doesNotMatch(canonical, /new (?:HttpError|E)\(\s*\d+\s*,/);
});

test('UX-07 compliance: o levantamento real de códigos fica acima do limiar anti-deriva', () => {
  // Total real medido nesta fatia: 37 — 33 por `error:` literal no servidor
  // canônico, 3 por exceção convertida (`body_too_large`, `invalid_json`,
  // `object_required`) e 1 exclusivo do recorte legado religado
  // (`legacy_writer_retired`). O limiar fica logo abaixo para que a perda de
  // um código falhe o gate.
  assert.ok(codes.size > 35, `esperava mais de 35 códigos na família, achei ${codes.size}`);
  assert.ok(canonicalCodes.size >= 33, `o servidor canônico precisa manter ao menos 33 códigos, achei ${canonicalCodes.size}`);
  // A segunda origem não pode ser medida como vazia por engano.
  assert.ok(legacyCodes.has('legacy_writer_retired'), 'o recorte legado religado precisa entrar no levantamento');
  for (const exception of ['body_too_large', 'invalid_json', 'object_required']) {
    assert.ok(codes.has(exception), `o código ${exception} sai por exceção e precisa ser medido`);
  }
});

// Título devolvido pelo vocabulário quando o código NÃO tem tradução. É o
// sentinela do teste: qualquer código real que caia nele está descoberto.
const TITULO_SEM_TRADUCAO = describeComplianceError('codigo_que_o_servidor_nao_devolve', 500).title;

test('UX-07 compliance: todo código real das duas origens tem descrição em português', () => {
  const faltando = [];
  for (const code of codes) {
    const item = describeComplianceError(code, 500);
    if (!item.title || item.title === code || item.title === TITULO_SEM_TRADUCAO) faltando.push(code);
    assert.equal(item.code, code, `o descritor precisa preservar o código canônico ${code}`);
  }
  assert.deepEqual(faltando, [], `códigos reais sem tradução: ${faltando.join(', ')}`);
});

test('UX-07 compliance: o vocabulário não inventa código que o servidor não devolve', () => {
  const inventados = Object.keys(ERROR_MESSAGES).filter(code => !codes.has(code));
  assert.deepEqual(inventados, [], `traduções sem código real correspondente: ${inventados.join(', ')}`);
  assert.equal(new Set(Object.keys(ERROR_MESSAGES)).size, Object.keys(ERROR_MESSAGES).length, 'nenhum código duplicado');
});

test('UX-07 compliance: código desconhecido passa cru e nunca ganha frase inventada', () => {
  const desconhecido = describeComplianceError('codigo_novo_do_servidor', 422);
  assert.equal(desconhecido.code, 'codigo_novo_do_servidor');
  assert.equal(desconhecido.title, 'Falha no servidor');
  assert.match(desconhecido.detail, /codigo_novo_do_servidor/);
  assert.equal(desconhecido.canRetry, false);
  // O código canônico é informação técnica, nunca o título principal.
  assert.match(complianceErrorMessage('codigo_novo_do_servidor', 422), /\(codigo_novo_do_servidor\)$/);
  assert.match(complianceErrorFootnote(desconhecido), /^Código técnico: \(codigo_novo_do_servidor\)$/);

  // Falha de rede e falha sem código continuam sendo estados próprios.
  const rede = describeComplianceError(null, 0);
  assert.equal(rede.kind, 'network');
  assert.equal(rede.code, null);
  assert.match(rede.detail, /não é uma lista vazia nem um resultado zero/i);
  const semCodigo = describeComplianceError(null, 502);
  assert.equal(semCodigo.code, null);
  assert.equal(semCodigo.kind, 'error');
  assert.match(semCodigo.detail, /não devolveu um código/i);
});

test('UX-07 compliance: recusa de permissão é estado próprio, distinto de falha', () => {
  // EXT-07 decide por sessão (401) e papel (403) no próprio servidor canônico;
  // não há permissão granular por grant nesta família.
  const negado = describeComplianceError('forbidden', 403);
  assert.equal(negado.kind, 'denied');
  assert.equal(complianceErrorVariant(negado), 'denied');
  assert.equal(describeComplianceError('unauthorized', 401).kind, 'denied');
  assert.equal(complianceErrorVariant(describeComplianceError('compliance_journey_unavailable', 503)), 'error');
  assert.equal(describeComplianceError('compliance_journey_unavailable', 503).canRetry, true);
  assert.equal(describeComplianceError('audit_unavailable', 503).canRetry, true);
  assert.equal(describeComplianceError('invalid_transition', 409).canRetry, false);
});

test('UX-07 compliance: ENUM desconhecido é preservado cru, conhecido sai em português', () => {
  assert.equal(documentStatusLabel('a_vencer'), 'A vencer');
  assert.equal(documentStatusTone('vencida'), 'danger');
  assert.equal(obligationStatusLabel('nao_aplicavel'), 'Declarada não aplicável');
  assert.equal(obligationStatusTone('vencida'), 'danger');
  assert.equal(criticalityLabel('critica'), 'Crítica');
  assert.equal(criticalityTone('critica'), 'danger');
  assert.equal(taskStatusLabel('em_andamento'), 'Em andamento');
  assert.equal(taskStatusTone('aberta'), 'warning');
  assert.equal(planStatusLabel('concluido'), 'Concluído');
  assert.equal(planStatusTone('cancelado'), 'neutral');
  assert.equal(planTypeLabel('preventivo'), 'Preventivo');
  assert.equal(referenceTypeLabel('registro_publico_declarado'), 'Registro público declarado');
  assert.equal(complianceOriginLabel('ext07_canonica'), 'Jornada canônica EXT-07');
  assert.equal(complianceEventLabel('document_renewed'), 'Renovação registrada como nova versão');
  assert.equal(runStatusLabel('falha'), 'Falha');
  assert.equal(runOriginLabel('agendada'), 'Execução agendada');

  assert.equal(documentStatusLabel('estado_novo_do_banco'), 'estado_novo_do_banco');
  assert.equal(documentStatusTone('estado_novo_do_banco'), 'neutral');
  assert.equal(obligationStatusLabel('situacao_nova'), 'situacao_nova');
  assert.equal(criticalityLabel('criticidade_nova'), 'criticidade_nova');
  assert.equal(taskStatusLabel('situacao_nova'), 'situacao_nova');
  assert.equal(planStatusLabel('situacao_nova'), 'situacao_nova');
  assert.equal(planTypeLabel('tipo_novo'), 'tipo_novo');
  assert.equal(referenceTypeLabel('referencia_nova'), 'referencia_nova');
  assert.equal(complianceEventLabel('evento_novo'), 'evento_novo');
  assert.equal(runStatusLabel('resultado_novo'), 'resultado_novo');
  assert.equal(failedClosedReasonLabel('motivo_novo'), 'motivo_novo');
});

test('UX-07 compliance: todo ENUM real das migrações e do servidor tem rótulo', () => {
  // ext_compliance_status (086 + `substituida` na 155).
  for (const status of ['vigente', 'a_vencer', 'vencida', 'em_renovacao', 'cancelada', 'substituida']) {
    assert.notEqual(documentStatusLabel(status), status, `documentStatus ${status}`);
  }
  // ext_compliance_type (086).
  for (const type of ['licenca', 'certidao', 'seguro', 'alvara', 'outro']) {
    assert.notEqual(complianceTypeLabel(type), type, `complianceType ${type}`);
  }
  // constraint de status de ext_compliance_obligations (153).
  for (const status of ['pendente', 'vigente', 'a_vencer', 'vencida', 'em_renovacao', 'nao_aplicavel', 'encerrada']) {
    assert.notEqual(obligationStatusLabel(status), status, `obligationStatus ${status}`);
  }
  // criticality (153) e status de ext_compliance_tasks (153).
  for (const value of ['baixa', 'media', 'alta', 'critica']) assert.notEqual(criticalityLabel(value), value);
  for (const value of ['aberta', 'em_andamento', 'concluida', 'cancelada']) assert.notEqual(taskStatusLabel(value), value);
  // ext_compliance_action_plans (168).
  for (const value of ['aberto', 'em_andamento', 'concluido', 'cancelado']) assert.notEqual(planStatusLabel(value), value);
  for (const value of ['corretivo', 'preventivo']) assert.notEqual(planTypeLabel(value), value);
  // REFERENCE_TYPES e origin, lidos do próprio servidor canônico.
  for (const value of ['referencia_declarada', 'numero_declarado', 'registro_publico_declarado', 'outro_declarado']) {
    assert.ok(canonical.includes(`"${value}"`), `o servidor ainda aceita o tipo de referência ${value}`);
    assert.notEqual(referenceTypeLabel(value), value);
  }
  for (const value of ['ext07_canonica', 'registro_legado']) assert.notEqual(complianceOriginLabel(value), value);
  // ext_compliance_evaluation_runs (156): a execução agendada é observada, não
  // comandada, por esta tela.
  for (const value of ['concluida', 'falha']) assert.notEqual(runStatusLabel(value), value);
  assert.notEqual(runOriginLabel('agendada'), 'agendada');
  // event_type realmente gravado pelo servidor canônico.
  for (const event of [
    'obligation_created', 'document_created', 'document_renewed', 'expiry_evaluated',
    'task_start', 'task_complete', 'task_cancel',
    'action_plan_created', 'action_plan_start', 'action_plan_complete', 'action_plan_cancel',
  ]) assert.notEqual(complianceEventLabel(event), event, `event_type ${event}`);
  // Motivo real do array `failed_closed` da avaliação temporal.
  assert.ok(canonical.includes('"responsible_staff_missing"'), 'o servidor ainda usa o motivo responsible_staff_missing');
  assert.match(failedClosedList([{ document_id: 'x', reason: 'responsible_staff_missing' }]), /sem responsável de equipe ativo/);
  assert.equal(failedClosedList([]), '');
  assert.equal(failedClosedList(undefined), '');
});

test('UX-07 compliance: ausência é honesta e nunca vira zero, 0% ou 01/01/1970', () => {
  for (const vazio of [null, undefined, '']) {
    assert.equal(honestDate(vazio), ABSENT);
    assert.equal(honestDateTime(vazio), ABSENT);
    assert.equal(count(vazio), ABSENT);
    assert.equal(honestNumber(vazio), ABSENT);
    assert.equal(honestText(vazio), ABSENT);
    assert.equal(honestPercent(vazio), PERCENT_NOT_CALCULATED);
  }
  assert.notEqual(honestDate(null), '01/01/1970');
  assert.notEqual(count(null), '0');
  assert.notEqual(honestPercent(null), '0%');
  assert.equal(documentStatusLabel(null), ABSENT);
  assert.equal(criticalityLabel(''), ABSENT);

  // Zero REAL vindo do servidor continua sendo zero: o defeito era transformar
  // ausência em zero, não mostrar um zero verdadeiro — a avaliação temporal
  // devolve contadores verdadeiros, inclusive zero.
  assert.equal(count(0), '0');
  assert.equal(honestNumber(0), '0');
  assert.equal(honestPercent(0), '0%');

  // Datas e números em pt-BR, sem espaço rígido inesperado.
  assert.equal(honestDate('2026-10-06'), '06/10/2026');
  assert.equal(count(1234567), '1.234.567');
  assert.doesNotMatch(count(1234567), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestDateTime('2026-10-06T12:00:00.000Z'), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestPercent(0.125), /[\u00a0\u202f]/);
  // Valor que não é data continua aparecendo cru, sem virar epoch.
  assert.equal(honestDate('nao-e-data'), 'nao-e-data');
});

test('UX-07 compliance: a apresentação não tem style inline e usa o módulo compartilhado', async () => {
  const workspace = await read('../src/app/admin/compliance/ComplianceWorkspace.tsx');
  assert.doesNotMatch(workspace, /style\s*=\s*\{/, 'zero style inline');
  assert.doesNotMatch(workspace, /CSSProperties/, 'nenhum objeto de estilo');
  assert.match(workspace, /UiWorkspace\.module\.css/);
  assert.match(workspace, /<UiState/);
  assert.match(workspace, /complianceRequest/);
  // Nenhuma rota, método ou cabeçalho da família foi trocado pela reescrita.
  // Todas as sub-rotas abaixo saem do dispatch real de handle().
  for (const contrato of [
    /"\/api\/ext\/compliance\/obligations"/,
    /"\/api\/ext\/compliance\/documents"/,
    /"\/api\/ext\/compliance\/tasks"/,
    /"\/api\/ext\/compliance\/action-plans"/,
    /"\/api\/ext\/compliance\/schedule"/,
    /"\/api\/ext\/compliance\/evaluate"/,
    /`\/api\/ext\/compliance\/documents\/\$\{id\}`/,
    /`\/api\/ext\/compliance\/documents\/\$\{document_id\}\/renew`/,
    /`\/api\/ext\/compliance\/action-plans\/\$\{id\}`/,
    /`\/api\/ext\/compliance\/tasks\/\$\{id\}\/\$\{op\}`/,
    /`\/api\/ext\/compliance\/action-plans\/\$\{id\}\/\$\{op\}`/,
    /"idempotency-key": k/,
  ]) assert.match(workspace, contrato, `contrato preservado: ${contrato}`);
  // Contrato herdado de idempotência: chave preservada após falha.
  assert.match(workspace, /keys\.current\[op\]=k/);
  assert.match(workspace, /delete keys\.current\[op\]/);
  assert.match(workspace, /`ext07-\$\{op\}-\$\{crypto\.randomUUID\(\)\}`/);
  // Toda URL de API chamada pela tela precisa ser do namespace canônico; a
  // leitura legada religada NÃO é consumida aqui.
  for (const [, url] of workspace.matchAll(/["'`](\/api\/[^"'`]+)["'`]/g)) {
    assert.ok(url.startsWith('/api/ext/compliance/'), `URL fora do namespace canônico: ${url}`);
  }
});

test('UX-07 compliance: as abas são tablist/tab/tabpanel reais com roving tabindex', async () => {
  const workspace = await read('../src/app/admin/compliance/ComplianceWorkspace.tsx');
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /aria-selected=\{active === tab\.id\}/);
  assert.match(workspace, /aria-controls=\{`compliance-panel-\$\{tab\.id\}`\}/);
  assert.match(workspace, /aria-labelledby="compliance-tab-/);
  assert.match(workspace, /tabIndex=\{active === tab\.id \? 0 : -1\}/, 'roving tabindex');
  for (const tecla of ['ArrowRight', 'ArrowLeft', '"Home"', '"End"']) assert.match(workspace, new RegExp(tecla));
  assert.doesNotMatch(workspace, /aria-pressed/, 'aria-pressed não substitui tab');
});

test('UX-07 compliance: a tela declara a fronteira documental e não promete conformidade', async () => {
  const workspace = await read('../src/app/admin/compliance/ComplianceWorkspace.tsx');
  // Fronteira documental fixada pelo servidor.
  assert.match(workspace, /não representam upload/);
  assert.match(workspace, /referencia_declarada_nao_arquivo_verificado/);
  assert.match(workspace, /armazenamento confirmado/);
  // Honestidade de ausência e de autoria na própria tela.
  assert.match(workspace, /nunca\s+mostra\s+zero\s+no\s+lugar/i);
  assert.match(workspace, /não inventa prazo, avaliação nem conformidade/i);
  assert.match(workspace, /não é validação jurídica/i);
  assert.match(workspace, /área[s]? legada[s]? declarada[s]?/i);
  // O servidor realmente fixa a fronteira que a tela declara.
  assert.match(canonical, /file_boundary: "referencia_declarada_nao_arquivo_verificado"/);
});

test('UX-07 compliance: a página não alargou o AdminGate nem trocou de servidor', async () => {
  const page = await read('../src/app/admin/compliance/page.tsx');
  assert.match(page, /allowedRoles=\{\["marcelo", "admin", "ti"\]\}/);
  // Quem decide é o servidor: sessão de equipe + papel, dentro do canônico.
  assert.match(canonical, /json\(res, 401, \{ error: "unauthorized" \}\)/);
  assert.match(canonical, /\["admin", "ti"\]\.includes\(role\)/, 'os papéis aceitos pelo servidor não mudaram');
  assert.match(canonical, /json\(res, 403, \{ error: "forbidden" \}\)/);
  // Isolamento de origem e idempotência seguem no servidor, intocados.
  assert.match(canonical, /sameOrigin\(req\)/);
  assert.match(canonical, /idempotency_key_required/);
  assert.match(canonical, /audit_unavailable/);
});

test('UX-07 compliance: o scheduler de fundo continua sem código HTTP e intocado', async () => {
  const scheduler = await read('../src/server/ext-compliance-scheduler.mjs');
  // Processo de fundo: nenhuma resposta HTTP sai dele, então ele não entra no
  // levantamento de códigos. Se um `error:` literal aparecer aqui, o
  // levantamento desta fatia passou a estar incompleto.
  assert.doesNotMatch(scheduler, /error:\s*[`'"][a-z0-9_]+[`'"]/, 'o scheduler não devolve código HTTP próprio');
  assert.match(scheduler, /runExpiryEvaluation/, 'o scheduler continua delegando ao núcleo compartilhado');
});
