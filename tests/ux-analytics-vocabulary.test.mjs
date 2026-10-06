import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeAnalyticsError,
  experimentStatusLabel,
  sourceTypeLabel,
  variantLabel,
  honestDate,
  honestDateTime,
  honestPercent,
  honestText,
  count,
  decimal,
  ERROR_MESSAGES,
} from '../src/lib/analytics-vocabulary.mjs';

// Servidores realmente religados da família ANALYTICS. Confirmado em
// server.mjs: /api/ext/analytics/** e as rotas legadas caem neste arquivo.
const SERVERS = ['../src/server/ext-analytics-api.mjs'];
const sources = await Promise.all(SERVERS.map(file => readFile(new URL(file, import.meta.url), 'utf8')));

function serverErrorCodes(text) {
  const codes = new Set();
  // Operandos de .includes('…') e de comparações são nomes de constraint ou de
  // estado, não códigos de erro: saem antes do levantamento.
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

const codes = new Set(sources.flatMap(source => [...serverErrorCodes(source)]));

test('UX-07 analytics: o levantamento real de códigos fica acima do limiar anti-deriva', () => {
  assert.ok(codes.size > 35, `esperava mais de 35 códigos, achei ${codes.size}`);
});

test('UX-07 analytics: todo código literal do servidor tem descrição honesta', () => {
  for (const code of codes) {
    const item = describeAnalyticsError(code, 500);
    assert.ok(item.title.length > 0, `código sem título: ${code}`);
    assert.ok(item.detail.length > 0, `código sem detalhe: ${code}`);
    assert.equal(item.code, code);
    assert.notEqual(item.title, code, `código cru como título: ${code}`);
    assert.ok(['invalid', 'conflict', 'denied', 'not_found', 'unavailable'].includes(item.kind), `kind inesperado em ${code}`);
  }
});

test('UX-07 analytics: o vocabulário não inventa código inexistente no servidor', () => {
  for (const code of Object.keys(ERROR_MESSAGES)) {
    assert.ok(codes.has(code), `vocabulário traduz código que o servidor não devolve: ${code}`);
  }
});

test('UX-07 analytics: código desconhecido passa cru e não ganha tradução inventada', () => {
  const unknown = describeAnalyticsError('codigo_novo_do_servidor', 422);
  assert.equal(unknown.code, 'codigo_novo_do_servidor');
  assert.equal(unknown.title, 'Falha no servidor');
  assert.match(unknown.detail, /codigo_novo_do_servidor/);
  const offline = describeAnalyticsError(null, 0);
  assert.equal(offline.kind, 'network');
  assert.equal(offline.canRetry, true);
});

test('UX-07 analytics: valor desconhecido de ENUM é preservado', () => {
  assert.equal(experimentStatusLabel('estado_novo'), 'estado_novo');
  assert.equal(variantLabel('C'), 'C');
  assert.equal(sourceTypeLabel('origem_nova'), 'origem_nova');
  assert.equal(experimentStatusLabel('em_execucao'), 'Em execução');
});

test('UX-07 analytics: ausência é honesta e nunca vira zero, 0% ou 01/01/1970', () => {
  for (const formatter of [honestDate, honestDateTime, count, decimal, honestText]) {
    assert.equal(formatter(null), 'Dado ausente');
    assert.equal(formatter(undefined), 'Dado ausente');
    assert.equal(formatter(''), 'Dado ausente');
  }
  assert.equal(honestPercent(null, 10), 'Dado ausente');
  assert.equal(honestPercent(3, 0), 'Dado ausente');
  assert.equal(honestPercent(3, 6), '50%');
  assert.equal(count(0), '0');
  assert.equal(count(1500), '1.500');
  assert.doesNotMatch(count(1500), /\u00a0|\u202f/);
});

test('UX-07 analytics: a apresentação não usa style inline e usa o CSS compartilhado', async () => {
  const workspace = await readFile(new URL('../src/app/admin/analytics/AnalyticsWorkspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(workspace, /style\s*=\s*\{/);
  assert.match(workspace, /UiWorkspace\.module\.css/);
  assert.match(workspace, /<UiState/);
  assert.match(workspace, /analyticsRequest/);
  assert.match(workspace, /Idempotency-Key/);
});

test('UX-07 analytics: abas reais com roving tabindex e teclado completo', async () => {
  const workspace = await readFile(new URL('../src/app/admin/analytics/AnalyticsWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tab"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.match(workspace, /aria-selected=/);
  assert.match(workspace, /aria-controls=/);
  assert.match(workspace, /tabIndex=\{active === id \? 0 : -1\}/);
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.match(workspace, new RegExp(key));
  assert.doesNotMatch(workspace, /aria-pressed/);
});

test('UX-07 analytics: a tela continua declarando que não inventa resultado', async () => {
  const workspace = await readFile(new URL('../src/app/admin/analytics/AnalyticsWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /não inventa tráfego, conversões, vencedor ou significância/);
});
