// UX-07 / EXT-11 / F07 — teste anti-deriva do vocabulário da família ANALYTICS.
//
// Ele lê os ARQUIVOS REAIS de servidor, extrai os códigos de erro e falha se:
//  - existir código real sem descrição no vocabulário;
//  - o vocabulário inventar um código que servidor nenhum devolve;
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
// Duas origens, ambas reais (ver cabeçalho de src/lib/analytics-vocabulary.mjs):
//  1. src/server/ext-analytics-api.mjs — servidor canônico inteiro;
//  2. o trecho `handleAnalyticsExperiments` de src/server/ext-advanced-api.mjs,
//     handler legado EXT-11 sem rota HTTP hoje. Só o trecho da família é lido:
//     o resto do arquivo é de EXT-07/08/09/10/12 e está fora deste recorte.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeAnalyticsError,
  analyticsErrorMessage,
  analyticsErrorVariant,
  analyticsErrorFootnote,
  experimentStatusLabel,
  experimentStatusTone,
  experimentOriginLabel,
  observationVariantLabel,
  observationSourceLabel,
  experimentEventLabel,
  honestDate,
  honestDateTime,
  honestNumber,
  honestPercent,
  honestText,
  count,
  ABSENT,
  PERCENT_NOT_CALCULATED,
  ERROR_MESSAGES,
} from '../src/lib/analytics-vocabulary.mjs';

const read = url => readFile(new URL(url, import.meta.url), 'utf8');

const canonical = await read('../src/server/ext-analytics-api.mjs');
const advanced = await read('../src/server/ext-advanced-api.mjs');

// Recorte declarado do handler legado da família dentro de um arquivo
// multi-família. Se os marcadores sumirem, o teste falha em vez de medir menos.
const LEGACY_START = '// EXT-11 analytics/A-B';
const LEGACY_END = '// EXT-12 editor visual avançado';
const legacyStart = advanced.indexOf(LEGACY_START);
const legacyEnd = advanced.indexOf(LEGACY_END);
const legacySlice = legacyStart >= 0 && legacyEnd > legacyStart ? advanced.slice(legacyStart, legacyEnd) : '';

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

const canonicalCodes = serverErrorCodes(canonical);
const legacyCodes = serverErrorCodes(legacySlice);
const codes = new Set([...canonicalCodes, ...legacyCodes]);

test('UX-07 analytics: o recorte legado da família realmente foi encontrado', () => {
  assert.ok(legacyStart >= 0, `marcador "${LEGACY_START}" sumiu de src/server/ext-advanced-api.mjs`);
  assert.ok(legacyEnd > legacyStart, `marcador "${LEGACY_END}" sumiu de src/server/ext-advanced-api.mjs`);
  assert.ok(legacySlice.includes('handleAnalyticsExperiments'), 'o recorte precisa conter o handler legado EXT-11');
  assert.ok(legacyCodes.size >= 10, `esperava pelo menos 10 códigos no recorte legado, achei ${legacyCodes.size}`);
});

test('UX-07 analytics: o levantamento real de códigos fica acima do limiar anti-deriva', () => {
  // Total real medido nesta fatia: 41 (37 canônicos + 4 exclusivos do legado).
  // O limiar fica logo abaixo para que a perda de um código falhe o gate.
  assert.ok(canonicalCodes.size > 35, `esperava mais de 35 códigos canônicos, achei ${canonicalCodes.size}`);
  assert.ok(codes.size > 39, `esperava mais de 39 códigos na família, achei ${codes.size}`);
});

// Título devolvido pelo vocabulário quando o código NÃO tem tradução. É o
// sentinela do teste: qualquer código real que caia nele está descoberto.
const TITULO_SEM_TRADUCAO = describeAnalyticsError('codigo_que_nenhum_servidor_devolve', 500).title;

test('UX-07 analytics: todo código real dos servidores tem descrição em português', () => {
  const faltando = [];
  for (const code of codes) {
    const item = describeAnalyticsError(code, 500);
    if (!item.title || item.title === code || item.title === TITULO_SEM_TRADUCAO) faltando.push(code);
    assert.equal(item.code, code, `o descritor precisa preservar o código canônico ${code}`);
  }
  assert.deepEqual(faltando, [], `códigos reais sem tradução: ${faltando.join(', ')}`);
});

test('UX-07 analytics: o vocabulário não inventa código que servidor nenhum devolve', () => {
  const inventados = Object.keys(ERROR_MESSAGES).filter(code => !codes.has(code));
  assert.deepEqual(inventados, [], `traduções sem código real correspondente: ${inventados.join(', ')}`);
  assert.equal(new Set(Object.keys(ERROR_MESSAGES)).size, Object.keys(ERROR_MESSAGES).length, 'nenhum código duplicado');
});

test('UX-07 analytics: código desconhecido passa cru e nunca ganha frase inventada', () => {
  const desconhecido = describeAnalyticsError('codigo_novo_do_servidor', 422);
  assert.equal(desconhecido.code, 'codigo_novo_do_servidor');
  assert.equal(desconhecido.title, 'Falha no servidor');
  assert.match(desconhecido.detail, /codigo_novo_do_servidor/);
  assert.equal(desconhecido.canRetry, false);
  // O código canônico é informação técnica, nunca o título principal.
  assert.match(analyticsErrorMessage('codigo_novo_do_servidor', 422), /\(codigo_novo_do_servidor\)$/);
  assert.match(analyticsErrorFootnote(desconhecido), /^Código técnico: \(codigo_novo_do_servidor\)$/);

  // Falha de rede e falha sem código continuam sendo estados próprios.
  const rede = describeAnalyticsError(null, 0);
  assert.equal(rede.kind, 'network');
  assert.equal(rede.code, null);
  assert.match(rede.detail, /não é uma lista vazia nem um resultado zero/i);
  const semCodigo = describeAnalyticsError(null, 502);
  assert.equal(semCodigo.code, null);
  assert.equal(semCodigo.kind, 'error');
  assert.match(semCodigo.detail, /não devolveu um código/i);
});

test('UX-07 analytics: recusa de permissão é estado próprio, distinto de falha', () => {
  const negado = describeAnalyticsError('forbidden', 403);
  assert.equal(negado.kind, 'denied');
  assert.equal(analyticsErrorVariant(negado), 'denied');
  assert.equal(analyticsErrorVariant(describeAnalyticsError('database_error', 500)), 'error');
  assert.equal(describeAnalyticsError('unauthorized', 401).kind, 'denied');
});

test('UX-07 analytics: ENUM desconhecido é preservado cru, conhecido sai em português', () => {
  assert.equal(experimentStatusLabel('em_execucao'), 'Em execução');
  assert.equal(experimentStatusTone('cancelado'), 'danger');
  assert.equal(experimentOriginLabel('ext11_canonica'), 'Jornada canônica EXT-11');
  assert.equal(observationVariantLabel('A'), 'Variante A');
  assert.equal(observationSourceLabel('internal_operational_record'), 'Registro operacional interno');
  assert.equal(experimentEventLabel('observation_recorded'), 'Observação real registrada');

  assert.equal(experimentStatusLabel('estado_novo_do_banco'), 'estado_novo_do_banco');
  assert.equal(experimentStatusTone('estado_novo_do_banco'), 'neutral');
  assert.equal(observationVariantLabel('C'), 'C');
  assert.equal(observationSourceLabel('origem_nova'), 'origem_nova');
  assert.equal(experimentEventLabel('evento_novo'), 'evento_novo');
});

test('UX-07 analytics: todo ENUM real do servidor e da migração tem rótulo', () => {
  const migracao = ['rascunho', 'em_execucao', 'concluido', 'cancelado', 'arquivado'];
  for (const status of migracao) assert.notEqual(experimentStatusLabel(status), status);
  for (const origin of ['registro_legado', 'ext11_canonica']) assert.notEqual(experimentOriginLabel(origin), origin);
  for (const source of ['internal_operational_record', 'internal_event']) assert.notEqual(observationSourceLabel(source), source);
  for (const variant of ['A', 'B']) assert.notEqual(observationVariantLabel(variant), variant);
  for (const status of migracao) assert.notEqual(experimentEventLabel(`experiment_status_${status}`), `experiment_status_${status}`);
  for (const event of ['experiment_created', 'experiment_approved', 'observation_recorded']) {
    assert.notEqual(experimentEventLabel(event), event);
  }
});

test('UX-07 analytics: ausência é honesta e nunca vira zero, 0% ou 01/01/1970', () => {
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
  assert.equal(experimentStatusLabel(null), ABSENT);

  // Zero REAL vindo do servidor continua sendo zero: o defeito era transformar
  // ausência em zero, não mostrar um zero verdadeiro.
  assert.equal(count(0), '0');
  assert.equal(honestNumber(0), '0');
  assert.equal(honestPercent(0), '0%');

  // Datas e números em pt-BR, sem espaço rígido inesperado.
  assert.equal(honestDate('2026-10-06T12:00:00.000Z'), '06/10/2026');
  assert.equal(count(1234567), '1.234.567');
  assert.doesNotMatch(count(1234567), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestDateTime('2026-10-06T12:00:00.000Z'), /[\u00a0\u202f]/);
  assert.doesNotMatch(honestPercent(0.125), /[\u00a0\u202f]/);
  // Valor que não é data continua aparecendo cru, sem virar epoch.
  assert.equal(honestDate('nao-e-data'), 'nao-e-data');
});

test('UX-07 analytics: a apresentação não tem style inline e usa o módulo compartilhado', async () => {
  const workspace = await read('../src/app/admin/analytics/AnalyticsWorkspace.tsx');
  assert.doesNotMatch(workspace, /style\s*=\s*\{/, 'zero style inline');
  assert.match(workspace, /UiWorkspace\.module\.css/);
  assert.match(workspace, /<UiState/);
  assert.match(workspace, /analyticsRequest/);
  // Nenhuma rota, método ou cabeçalho da família foi trocado pela reescrita.
  for (const contrato of [
    /\/api\/ext\/analytics\/experiments/,
    /\/approve/,
    /\/transition/,
    /"Idempotency-Key": requestKey\(\)/,
  ]) assert.match(workspace, contrato);
});

test('UX-07 analytics: as abas são tablist/tab/tabpanel reais com roving tabindex', async () => {
  const workspace = await read('../src/app/admin/analytics/AnalyticsWorkspace.tsx');
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /aria-selected=\{active === tab\.id\}/);
  assert.match(workspace, /aria-controls=\{`analytics-panel-\$\{tab\.id\}`\}/);
  assert.match(workspace, /aria-labelledby="analytics-tab-/);
  assert.match(workspace, /tabIndex=\{active === tab\.id \? 0 : -1\}/, 'roving tabindex');
  for (const tecla of ['ArrowRight', 'ArrowLeft', '"Home"', '"End"']) assert.match(workspace, new RegExp(tecla));
  assert.doesNotMatch(workspace, /aria-pressed/, 'aria-pressed não substitui tab');
});

test('UX-07 analytics: a tela não promete tráfego, conversão, vencedor ou significância', async () => {
  const workspace = await read('../src/app/admin/analytics/AnalyticsWorkspace.tsx');
  // `\s+` porque o JSX quebra linha no meio da frase; a frase é a mesma.
  assert.match(workspace, /não\s+coleta\s+tráfego/i);
  assert.match(workspace, /não\s+inventa\s+tráfego\s+nem\s+conversões/i);
  assert.match(workspace, /não\s+declara\s+vencedor\s+nem\s+significância/i);
  assert.match(workspace, /Não há dados suficientes para uma conclusão/);
  // Pendência declarada na própria tela, não escondida.
  assert.match(workspace, /pendência declarada/i);
});

test('UX-07 analytics: a página não alargou o AdminGate nem trocou de servidor', async () => {
  const page = await read('../src/app/admin/analytics/page.tsx');
  assert.match(page, /allowedRoles=\{\["admin", "ti", "marcelo"\]\}/);
  const server = await read('../src/server/ext-analytics-api.mjs');
  for (const permissao of ['analytics.read', 'analytics.write', 'analytics.approve']) {
    assert.ok(server.includes(permissao), `a permissão granular ${permissao} continua no servidor`);
  }
  assert.match(server, /hasPermission/, 'a decisão continua sendo do servidor, não do menu');
});
