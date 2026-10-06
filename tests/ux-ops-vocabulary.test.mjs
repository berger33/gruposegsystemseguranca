// UX-07 (fatia A — Operação) — o vocabulário da tela de Operação não pode
// divergir dos cinco servidores que ela consome.
//
// Este teste lê `src/server/ops-api.mjs`, `ops-advanced-api.mjs`,
// `ops-advanced2-api.mjs`, `ops-advanced3-api.mjs` e `ops-pendency-api.mjs` e
// falha se a interface passar a traduzir um código que os servidores não
// devolvem mais, ou deixar sem tradução um código que eles devolvem. É a
// mesma amarração que, em UX-06, encontrou códigos sem frase.
//
// Dois códigos (`invalid_${filter}` em `readOnly()` e `invalid_${field}` em
// `history()`, ambos em ops-advanced2-api/ops-advanced3-api) são montados por
// template literal a partir do nome do parâmetro de busca. Os três valores
// realmente usados nas chamadas (`patrol_id`, `report_id`, `event_id`) são
// declarados explicitamente abaixo — não são adivinhados.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  describeOpsError,
  opsErrorFootnote,
  opsErrorVariant,
  allocationStatusLabel,
  dimensioningStatusLabel,
  coverageGapStatusLabel,
  scheduleVersionStatusLabel,
  coverageRequestStatusLabel,
  handoverStatusLabel,
  occurrenceStatusLabel,
  severityLabel,
  checklistInstanceStatusLabel,
  weekdayLabel,
} from '../src/lib/ops-vocabulary.mjs';

const FILES = [
  '../src/server/ops-api.mjs',
  '../src/server/ops-advanced-api.mjs',
  '../src/server/ops-advanced2-api.mjs',
  '../src/server/ops-advanced3-api.mjs',
  '../src/server/ops-pendency-api.mjs',
];

const sources = await Promise.all(FILES.map(f => readFile(new URL(f, import.meta.url), 'utf8')));

/**
 * Todos os códigos que um servidor de operação pode devolver em
 * `{ error: '...' }`, incluindo os montados por ternário
 * (`e.code==='23505'?'conflict':'audit_or_write_unavailable'`) e por
 * `new HttpError(status, 'code')` / `new E(status, 'code')`.
 */
function serverErrorCodes(source) {
  const codes = new Set();
  for (const match of source.matchAll(/error:\s*([^,}]{1,200})/g)) {
    for (const literal of match[1].matchAll(/[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(literal[1]);
  }
  for (const match of source.matchAll(/new (?:HttpError|E)\(\s*\d+\s*,\s*[`'"]([a-z0-9_]+)[`'"]/g)) codes.add(match[1]);
  return codes;
}

const codigosServidor = new Set();
for (const source of sources) for (const code of serverErrorCodes(source)) codigosServidor.add(code);
// `23505` é o SQLSTATE do PostgreSQL usado na condição, não um código de
// negócio devolvido ao cliente.
codigosServidor.delete('23505');
// Códigos montados por template literal em `readOnly()`/`history()`, a partir
// do nome do parâmetro de busca (ver comentário acima).
codigosServidor.add('invalid_patrol_id');
codigosServidor.add('invalid_report_id');
codigosServidor.add('invalid_event_id');

test('UX-07 operação: o levantamento encontra mais de 190 códigos distintos nos cinco servidores', () => {
  assert.ok(codigosServidor.size > 190, `esperava mais de 190 códigos, achei ${codigosServidor.size}`);
});

test('UX-07 vocabulário: todo código dos servidores de operação tem frase em português', () => {
  const semTraducao = [];
  for (const code of codigosServidor) {
    const descriptor = describeOpsError(code, 500);
    // Sem tradução dedicada o fallback devolve o texto genérico de `internal`.
    if (descriptor.title === 'Falha no servidor' && code !== 'internal') semTraducao.push(code);
  }
  assert.deepEqual(semTraducao.sort(), [],
    `códigos dos servidores de operação sem frase em português: ${semTraducao.join(', ')}`);
});

test('UX-07 vocabulário: nenhuma tradução inventa um código que os servidores não devolvem', async () => {
  // Derivado: produzido a partir de um estado sem código (`status===0`,
  // network), nunca aparece como literal `error: 'internal'`.
  const derivados = new Set(['internal']);
  const vocabulario = await readFile(new URL('../src/lib/ops-vocabulary.mjs', import.meta.url), 'utf8');
  const bloco = vocabulario.match(/const ERROR_MESSAGES = Object\.freeze\(\{([\s\S]*?)\n\}\);/)[1];
  const traduzidos = [...bloco.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map(match => match[1]);
  assert.ok(traduzidos.length > 190, 'o vocabulário deveria cobrir mais de 190 códigos');

  const inventados = traduzidos.filter(code => !codigosServidor.has(code) && !derivados.has(code));
  assert.deepEqual(inventados.sort(), [],
    `traduções para códigos inexistentes nos servidores de operação: ${inventados.join(', ')}`);
});

test('UX-07 honestidade: toda falha classificada traz código, status e indicação de nova tentativa', () => {
  for (const code of codigosServidor) {
    const descriptor = describeOpsError(code, 503);
    assert.equal(descriptor.code, code);
    assert.equal(descriptor.status, 503);
    assert.equal(typeof descriptor.canRetry, 'boolean');
    assert.ok(descriptor.title.length > 0, `código ${code} não tem título`);
    assert.ok(descriptor.detail.length > 0, `código ${code} não tem detalhe`);
    // O código canônico nunca é o título: ele só aparece no rodapé.
    assert.notEqual(descriptor.title, code);
  }
});

test('UX-07 honestidade: falha de auditoria e de leitura nunca dizem "sem registro"', () => {
  for (const code of ['audit_unavailable', 'audit_or_write_unavailable', 'read_unavailable', 'pendency_unavailable', 'employee_unavailable']) {
    const descriptor = describeOpsError(code, 503);
    const texto = `${descriptor.title} ${descriptor.detail}`.toLowerCase();
    assert.ok(!texto.includes('nenhum registro') && !texto.includes('vazio'),
      `${code} não pode soar como ausência de dado: "${texto}"`);
    assert.equal(descriptor.canRetry, true, `${code} deveria permitir nova tentativa`);
  }
});

test('UX-07 honestidade: regras de jornada, descanso e habilitação explicam a regra de negócio, não um código cru', () => {
  for (const code of [
    'overlap_detected', 'max_weekly_hours_exceeded', 'max_daily_hours_exceeded',
    'min_rest_hours_violated', 'max_consecutive_days_exceeded', 'qualification_required',
    'qualification_expired', 'mandatory_items_pending', 'version_not_published',
  ]) {
    const descriptor = describeOpsError(code, 409);
    assert.equal(descriptor.kind, 'conflict', `${code} deveria ser um conflito de regra de negócio`);
    assert.equal(descriptor.canRetry, false, `${code} não é resolvido só tentando de novo`);
  }
});

test('UX-07 rodapé: o código canônico só aparece entre parênteses, nunca como frase principal', () => {
  const descriptor = describeOpsError('overlap_detected', 409);
  const footnote = opsErrorFootnote(descriptor);
  assert.match(footnote, /\(overlap_detected\)/);
  assert.equal(opsErrorVariant(descriptor), 'error');
  const negado = describeOpsError('forbidden', 403);
  assert.equal(opsErrorVariant(negado), 'denied');
});

test('UX-07 vocabulário de situação: valor desconhecido passa cru, nunca é inventado', () => {
  assert.equal(allocationStatusLabel('planejado'), 'Planejada');
  assert.equal(allocationStatusLabel('um_valor_novo_do_banco'), 'um_valor_novo_do_banco');
  assert.equal(dimensioningStatusLabel('em_execucao'), 'Em execução');
  assert.equal(coverageGapStatusLabel('aberto'), 'Aberta');
  assert.equal(scheduleVersionStatusLabel('publicada'), 'Publicada');
  assert.equal(coverageRequestStatusLabel('candidato_encontrado'), 'Candidato encontrado');
  assert.equal(handoverStatusLabel('aceito'), 'Aceita');
  assert.equal(occurrenceStatusLabel('em_analise'), 'Em análise');
  assert.equal(severityLabel('critica'), 'Crítica');
  assert.equal(checklistInstanceStatusLabel('nao_aplicavel'), 'Não aplicável');
  assert.equal(weekdayLabel(0), 'Domingo');
  assert.equal(weekdayLabel(null), 'Sem dia específico');
  assert.equal(weekdayLabel(9), '9');
});
