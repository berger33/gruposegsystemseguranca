// UX-07 / EXT-05 — teste anti-deriva do vocabulário da família QUALIDADE.
//
// Ele lê o ARQUIVO REAL de servidor, extrai os códigos de erro e falha se:
//  - existir código real sem descrição no vocabulário;
//  - o vocabulário inventar um código que o servidor não devolve;
//  - o levantamento cair abaixo do limiar (regressão de extração).
//
// A lição que originou este formato está registrada na seção 4 de
// docs/UX-07-CONTRATOS-2026-10-05.md e na seção 5.3 de
// docs/UX-07-FINANCEIRO-2026-10-05.md: medir apenas `error:` literal dá falsa
// segurança. Aqui o extrator casa os três formatos conhecidos
// (literal, `new HttpError()/new E()` e wrapper local `bad()/unavailable()`) e
// remove antes os operandos de `.includes('…')` e `[=!]==? '…'`, que são
// nomes de constraint e valores de ENUM — não códigos de erro.
//
// Origem única e real (ver cabeçalho de src/lib/quality-vocabulary.mjs):
// src/server/ext-quality-api.mjs — o único servidor da família religado em
// server.mjs. Os handlers antigos de qualidade foram removidos de
// src/server/ext-api.mjs, e tests/ext05-quality.test.mjs já falha se
// voltarem; não há segunda origem a recortar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeQualityError,
  qualityErrorMessage,
  qualityErrorVariant,
  qualityErrorFootnote,
  closureMissingList,
  closureRequirementLabel,
  ncStatusLabel,
  ncStatusTone,
  severityLabel,
  severityTone,
  actionStatusLabel,
  actionStatusTone,
  verificationOutcomeLabel,
  qualityOriginLabel,
  qualityEventLabel,
  honestDate,
  honestDateTime,
  honestNumber,
  honestPercent,
  honestText,
  count,
  ABSENT,
  PERCENT_NOT_CALCULATED,
  ERROR_MESSAGES,
} from '../src/lib/quality-vocabulary.mjs';

const read = url => readFile(new URL(url, import.meta.url), 'utf8');

const canonical = await read('../src/server/ext-quality-api.mjs');

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
  return codes;
}

const codes = serverErrorCodes(canonical);

test('UX-07 qualidade: o servidor canônico continua sendo o único religado', async () => {
  const server = await read('../server.mjs');
  assert.match(server, /createExtQualityApi/);
  assert.match(server, /\/api\/ext\/quality\/nonconformities/);
  // A rota real de criação de ação leva o responsável no caminho; é ela que a
  // tela chama (a antiga `/{id}/actions` sem responsável nunca existiu no
  // servidor religado).
  assert.match(server, /responsibles\\\/\(\[0-9a-f-\]\{36\}\)\\\/actions/);
  const legacy = await read('../src/server/ext-api.mjs');
  assert.doesNotMatch(legacy, /const handleQualityNonconformities/);
});

test('UX-07 qualidade: o levantamento real de códigos fica acima do limiar anti-deriva', () => {
  // Total real medido nesta fatia: 34, todos em src/server/ext-quality-api.mjs.
  // O limiar fica logo abaixo para que a perda de um código falhe o gate.
  assert.ok(codes.size > 32, `esperava mais de 32 códigos na família, achei ${codes.size}`);
});

// Título devolvido pelo vocabulário quando o código NÃO tem tradução. É o
// sentinela do teste: qualquer código real que caia nele está descoberto.
const TITULO_SEM_TRADUCAO = describeQualityError('codigo_que_o_servidor_nao_devolve', 500).title;

test('UX-07 qualidade: todo código real do servidor tem descrição em português', () => {
  const faltando = [];
  for (const code of codes) {
    const item = describeQualityError(code, 500);
    if (!item.title || item.title === code || item.title === TITULO_SEM_TRADUCAO) faltando.push(code);
    assert.equal(item.code, code, `o descritor precisa preservar o código canônico ${code}`);
  }
  assert.deepEqual(faltando, [], `códigos reais sem tradução: ${faltando.join(', ')}`);
});

test('UX-07 qualidade: o vocabulário não inventa código que o servidor não devolve', () => {
  const inventados = Object.keys(ERROR_MESSAGES).filter(code => !codes.has(code));
  assert.deepEqual(inventados, [], `traduções sem código real correspondente: ${inventados.join(', ')}`);
  assert.equal(new Set(Object.keys(ERROR_MESSAGES)).size, Object.keys(ERROR_MESSAGES).length, 'nenhum código duplicado');
});

test('UX-07 qualidade: código desconhecido passa cru e nunca ganha frase inventada', () => {
  const desconhecido = describeQualityError('codigo_novo_do_servidor', 422);
  assert.equal(desconhecido.code, 'codigo_novo_do_servidor');
  assert.equal(desconhecido.title, 'Falha no servidor');
  assert.match(desconhecido.detail, /codigo_novo_do_servidor/);
  assert.equal(desconhecido.canRetry, false);
  // O código canônico é informação técnica, nunca o título principal.
  assert.match(qualityErrorMessage('codigo_novo_do_servidor', 422), /\(codigo_novo_do_servidor\)$/);
  assert.match(qualityErrorFootnote(desconhecido), /^Código técnico: \(codigo_novo_do_servidor\)$/);

  // Falha de rede e falha sem código continuam sendo estados próprios.
  const rede = describeQualityError(null, 0);
  assert.equal(rede.kind, 'network');
  assert.equal(rede.code, null);
  assert.match(rede.detail, /não é uma lista vazia nem um resultado zero/i);
  const semCodigo = describeQualityError(null, 502);
  assert.equal(semCodigo.code, null);
  assert.equal(semCodigo.kind, 'error');
  assert.match(semCodigo.detail, /não devolveu um código/i);
});

test('UX-07 qualidade: recusa de permissão é estado próprio, distinto de falha', () => {
  for (const code of ['forbidden', 'forbidden_role', 'forbidden_account_scope']) {
    const negado = describeQualityError(code, 403);
    assert.equal(negado.kind, 'denied', `${code} precisa ser recusa, não falha`);
    assert.equal(qualityErrorVariant(negado), 'denied');
  }
  assert.equal(describeQualityError('unauthorized', 401).kind, 'denied');
  assert.equal(qualityErrorVariant(describeQualityError('quality_journey_unavailable', 503)), 'error');
  assert.equal(describeQualityError('audit_unavailable', 503).canRetry, true);
});

test('UX-07 qualidade: ENUM desconhecido é preservado cru, conhecido sai em português', () => {
  assert.equal(ncStatusLabel('em_acao_corretiva'), 'Em ação corretiva');
  assert.equal(ncStatusTone('reaberta'), 'danger');
  assert.equal(severityLabel('critica'), 'Crítica');
  assert.equal(severityTone('critica'), 'danger');
  assert.equal(actionStatusLabel('concluida'), 'Concluída');
  assert.equal(actionStatusTone('pendente'), 'warning');
  assert.equal(verificationOutcomeLabel('eficaz'), 'Eficaz');
  assert.equal(qualityOriginLabel('jornada_canonica'), 'Jornada canônica EXT-05');
  assert.equal(qualityEventLabel('nao_conformidade_encerrada'), 'Encerrada com evidência e responsável');

  assert.equal(ncStatusLabel('estado_novo_do_banco'), 'estado_novo_do_banco');
  assert.equal(ncStatusTone('estado_novo_do_banco'), 'neutral');
  assert.equal(severityLabel('gravidade_nova'), 'gravidade_nova');
  assert.equal(actionStatusLabel('situacao_nova'), 'situacao_nova');
  assert.equal(verificationOutcomeLabel('resultado_novo'), 'resultado_novo');
  assert.equal(qualityEventLabel('evento_novo'), 'evento_novo');
  assert.equal(closureRequirementLabel('pre_requisito_novo'), 'pre_requisito_novo');
});

test('UX-07 qualidade: todo ENUM real da migração e do servidor tem rótulo', () => {
  // ext_quality_status e ext_quality_severity (migração 085); constraint de
  // ext_quality_actions e outcome de ext_quality_verifications (151); origin
  // (085/151); event_type montado em src/server/ext-quality-api.mjs.
  for (const status of ['aberta', 'em_analise', 'em_acao_corretiva', 'verificacao', 'encerrada', 'reaberta']) {
    assert.notEqual(ncStatusLabel(status), status);
  }
  for (const severity of ['baixa', 'media', 'alta', 'critica']) assert.notEqual(severityLabel(severity), severity);
  for (const status of ['pendente', 'concluida', 'cancelada']) assert.notEqual(actionStatusLabel(status), status);
  for (const outcome of ['eficaz', 'ineficaz']) assert.notEqual(verificationOutcomeLabel(outcome), outcome);
  for (const origin of ['jornada_canonica', 'registro_legado']) assert.notEqual(qualityOriginLabel(origin), origin);
  for (const event of [
    'nao_conformidade_criada', 'cause_registrada', 'verification_registrada', 'acao_corretiva_criada',
    'acao_complete', 'acao_cancel', 'estado_alterado', 'nao_conformidade_encerrada',
    'nao_conformidade_reaberta', 'reincidencia_registrada',
  ]) assert.notEqual(qualityEventLabel(event), event);
  // Itens reais do array `missing` de closure_prerequisites_missing.
  for (const requirement of ['responsible', 'cause', 'completed_action', 'pending_action', 'effective_verification_evidence']) {
    assert.ok(canonical.includes(`"${requirement}"`), `o servidor ainda usa o marcador ${requirement}`);
    assert.notEqual(closureRequirementLabel(requirement), requirement);
  }
  assert.match(closureMissingList(['cause', 'pending_action']), /causa registrada; nenhuma ação corretiva pendente/);
  assert.equal(closureMissingList([]), '');
  assert.equal(closureMissingList(undefined), '');
});

test('UX-07 qualidade: ausência é honesta e nunca vira zero, 0% ou 01/01/1970', () => {
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
  assert.equal(ncStatusLabel(null), ABSENT);
  assert.equal(severityLabel(''), ABSENT);

  // Zero REAL vindo do servidor continua sendo zero: o defeito era transformar
  // ausência em zero, não mostrar um zero verdadeiro — o contador derivado de
  // reincidência devolve 0 de verdade quando não há reincidência.
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

test('UX-07 qualidade: a apresentação não tem style inline e usa o módulo compartilhado', async () => {
  const workspace = await read('../src/app/admin/qualidade/QualidadeWorkspace.tsx');
  assert.doesNotMatch(workspace, /style\s*=\s*\{/, 'zero style inline');
  assert.doesNotMatch(workspace, /CSSProperties/, 'nenhum objeto de estilo');
  assert.match(workspace, /UiWorkspace\.module\.css/);
  assert.match(workspace, /<UiState/);
  assert.match(workspace, /qualityRequest/);
  // Nenhuma rota, método ou cabeçalho da família foi trocado pela reescrita; a
  // criação de ação usa a rota REAL religada em server.mjs, com o responsável
  // no caminho.
  for (const contrato of [
    /\/api\/ext\/quality\/nonconformities/,
    /\/api\/ext\/quality\/references/,
    /responsibles\/\$\{responsible_identity\}\/actions/,
    /\/transition/,
    /\/close/,
    /\/reopen/,
    /\/recurrences/,
    /\/api\/ext\/quality\/actions\/\$\{id\}\/\$\{op\}/,
    /"idempotency-key": k/,
  ]) assert.match(workspace, contrato);
  // Contrato herdado de idempotência: chave preservada após falha.
  assert.match(workspace, /keys\.current\[op\]=k/);
  assert.match(workspace, /delete keys\.current\[op\]/);
});

test('UX-07 qualidade: as abas são tablist/tab/tabpanel reais com roving tabindex', async () => {
  const workspace = await read('../src/app/admin/qualidade/QualidadeWorkspace.tsx');
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /aria-selected=\{active === tab\.id\}/);
  assert.match(workspace, /aria-controls=\{`quality-panel-\$\{tab\.id\}`\}/);
  assert.match(workspace, /aria-labelledby="quality-tab-/);
  assert.match(workspace, /tabIndex=\{active === tab\.id \? 0 : -1\}/, 'roving tabindex');
  for (const tecla of ['ArrowRight', 'ArrowLeft', '"Home"', '"End"']) assert.match(workspace, new RegExp(tecla));
  assert.doesNotMatch(workspace, /aria-pressed/, 'aria-pressed não substitui tab');
});

test('UX-07 qualidade: a tela declara a fronteira e não promete upload nem armazenamento', async () => {
  const workspace = await read('../src/app/admin/qualidade/QualidadeWorkspace.tsx');
  // Frases herdadas, literais (tests/ext05-quality.test.mjs também as fixa).
  assert.match(workspace, /não representam upload/);
  assert.match(workspace, /Encerrar apenas com evidência e responsável/);
  // Honestidade de ausência e de derivação na própria tela.
  assert.match(workspace, /nunca\s+mostra\s+zero\s+no\s+lugar/i);
  assert.match(workspace, /derivado\s+pelo\s+servidor/i);
  assert.match(workspace, /área legada declarada/i);
});

test('UX-07 qualidade: a página não alargou o AdminGate nem trocou de servidor', async () => {
  const page = await read('../src/app/admin/qualidade/page.tsx');
  assert.match(page, /allowedRoles=\{\["marcelo", "admin", "ti"\]\}/);
  const server = await read('../src/server/ext-quality-api.mjs');
  for (const permissao of ['quality.read', 'quality.write']) {
    assert.ok(server.includes(permissao), `a permissão granular ${permissao} continua no servidor`);
  }
  assert.match(server, /hasPermission/, 'a decisão de escopo continua sendo do servidor, não do menu');
  assert.match(server, /ROLES=\["admin","marcelo","ti"\]/, 'os papéis aceitos pelo servidor não mudaram');
});
