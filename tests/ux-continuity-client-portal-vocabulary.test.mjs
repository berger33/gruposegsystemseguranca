// UX-11 / EXT-10 — contratos de apresentação do portal de continuidade.
//
// Este teste não substitui o gate PostgreSQL + HTTP + Chromium. Ele protege a
// fronteira que costuma sofrer erosão silenciosa: o portal não pode voltar a
// engolir erro em `fetch`, transformar uma resposta incompleta em lista vazia
// ou montar data local à meia-noite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeContinuityError,
  honestNextTest,
  honestTestDate,
} from '../src/lib/continuity-vocabulary.mjs';

const page = await readFile(new URL('../src/app/cliente/app/continuidade/page.tsx', import.meta.url), 'utf8');
const server = await readFile(new URL('../src/server/ext-continuity-api.mjs', import.meta.url), 'utf8');

function clientErrorCodes(source) {
  const clientSource = source.slice(source.indexOf('// ---- Portal do cliente'));
  return new Set([...clientSource.matchAll(/error:\"([a-z_]+)\"/g)].map(match => match[1]));
}

test('cada erro literal do portal de continuidade tem descrição e retry coerente', () => {
  const codes = clientErrorCodes(server);
  for (const code of codes) {
    assert.notEqual(describeContinuityError(code).title, 'Resposta não reconhecida', `faltou vocabulário para ${code}`);
  }

  assert.equal(describeContinuityError('forbidden', 403).kind, 'denied');
  assert.equal(describeContinuityError('forbidden', 403).canRetry, false);
  assert.equal(describeContinuityError('plan_not_found', 404).kind, 'not_found');
  assert.equal(describeContinuityError('plan_not_found', 404).canRetry, false);
  assert.equal(describeContinuityError('audit_unavailable', 503).canRetry, true);
  assert.equal(describeContinuityError(null, 0).canRetry, true);
});

test('datas e ausência permanecem honestas no fuso UTC', () => {
  assert.equal(honestTestDate('2026-03-11'), '11/03/2026');
  assert.equal(honestNextTest('2026-09-11'), '11/09/2026');
  assert.equal(honestTestDate(null), 'Simulado nunca realizado');
  assert.equal(honestNextTest(null), 'Próximo teste não agendado');
});

test('a tela usa o transporte discriminado e não devolve falha como vazio', () => {
  assert.match(page, /continuityRequest/);
  assert.doesNotMatch(page, /\bfetch\(/);
  assert.match(page, /Array\.isArray\(result\.data\.plans\)/);
  assert.match(page, /Resposta de planos incompleta/);
  assert.match(page, /data-ui-state=\{state\}/);
  assert.match(page, /error\.canRetry/);
  assert.match(page, /Atualizar lista/);
});

test('a tela reutiliza as datas honestas do vocabulário, sem construir meia-noite local', () => {
  assert.match(page, /honestTestDate\(plan\.last_tested_at\)/);
  assert.match(page, /honestNextTest\(plan\.next_test_due\)/);
  assert.doesNotMatch(page, /new Date\(/);
  assert.doesNotMatch(page, /T00:00:00/);
});
