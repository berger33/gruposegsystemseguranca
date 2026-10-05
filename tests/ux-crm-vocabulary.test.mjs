import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COMPANY_STATUS,
  COMPANY_TYPES,
  OPEN_OPPORTUNITY_STAGES,
  OPPORTUNITY_PRIORITIES,
  OPPORTUNITY_STAGES,
  companyStatusLabel,
  companyTypeLabel,
  describeCrmError,
  isOpenStage,
  isRetryable,
  priorityLabel,
  stageLabel,
} from '../src/lib/crm-vocabulary.mjs';

const apiSource = await readFile(new URL('../src/server/crm-api.mjs', import.meta.url), 'utf8');

function canonicalSet(name) {
  const match = apiSource.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`));
  assert.ok(match, `${name} must still be declared in src/server/crm-api.mjs`);
  return match[1]
    .split(',')
    .map(item => item.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .sort();
}

test('presentation vocabulary keeps the canonical values the CRM API accepts', () => {
  assert.deepEqual(OPPORTUNITY_STAGES.map(o => o.value).sort(), canonicalSet('OPP_STAGES'));
  assert.deepEqual([...OPEN_OPPORTUNITY_STAGES].sort(), canonicalSet('OPP_OPEN_STAGES'));
  assert.deepEqual(OPPORTUNITY_PRIORITIES.map(o => o.value).sort(), canonicalSet('OPP_PRIORITY'));
  assert.deepEqual(COMPANY_TYPES.map(o => o.value).sort(), canonicalSet('COMPANY_TYPES'));
  assert.deepEqual(COMPANY_STATUS.map(o => o.value).sort(), canonicalSet('COMPANY_STATUS'));
});

test('labels are human readable, unique and never replace the canonical value', () => {
  for (const list of [OPPORTUNITY_STAGES, OPPORTUNITY_PRIORITIES, COMPANY_TYPES, COMPANY_STATUS]) {
    const labels = list.map(option => option.label);
    assert.equal(new Set(labels).size, labels.length, 'labels must be distinct');
    for (const option of list) {
      assert.ok(option.label.trim().length > 1);
      assert.notEqual(option.label, option.value, 'the label must be translated, not the raw token');
    }
  }
  assert.equal(stageLabel('proposta_elaboracao'), 'Proposta em elaboração');
  assert.equal(priorityLabel('media'), 'Média');
  assert.equal(companyTypeLabel('prospect'), 'Potencial cliente');
  assert.equal(companyStatusLabel('active'), 'Ativa');
  assert.equal(stageLabel(null), '—');
  // Valor desconhecido nunca vira uma tradução inventada.
  assert.equal(stageLabel('estagio_novo_do_servidor'), 'estagio_novo_do_servidor');
  assert.equal(isOpenStage('negociacao'), true);
  assert.equal(isOpenStage('ganho'), false);
});

test('read failures are described honestly and only retryable ones offer retry', () => {
  const denied = describeCrmError('commercial_role_required', 403);
  assert.equal(denied.kind, 'denied');
  assert.equal(isRetryable(denied), false);

  const unavailable = describeCrmError('crm_unavailable', 503);
  assert.equal(unavailable.kind, 'retry');
  assert.equal(isRetryable(unavailable), true);

  assert.equal(describeCrmError(null, 401).kind, 'auth');
  assert.equal(describeCrmError(null, 403).kind, 'denied');
  assert.equal(describeCrmError(null, 404).kind, 'denied');
  assert.equal(describeCrmError(null, 500).kind, 'retry');
  assert.equal(describeCrmError('network', 0).kind, 'retry');

  // Um código desconhecido não pode virar sucesso nem lista vazia silenciosa.
  const unknown = describeCrmError('codigo_que_nao_existe', 400);
  assert.equal(unknown.code, 'codigo_que_nao_existe');
  assert.ok(unknown.title.length > 0 && unknown.detail.length > 0);
});

test('denied messages never expose the protected payload or the raw error token', () => {
  for (const code of ['commercial_role_required', 'opportunity_not_found', 'company_not_found']) {
    const described = describeCrmError(code, 403);
    assert.ok(!described.title.includes('_'), 'title must be business language');
    assert.ok(!described.detail.includes(code));
  }
});

test('the CRM workspace no longer swallows read failures', async () => {
  const page = await readFile(new URL('../src/app/admin/crm/page.tsx', import.meta.url), 'utf8');
  assert.equal(/catch\s*\{\s*\}/.test(page), false, 'silent catch hides failures as empty lists');
  assert.ok(page.includes('variant="loading"'), 'loading must be distinguishable from empty');
  assert.ok(page.includes('variant="empty"'));
  assert.ok(page.includes('setOppsError'), 'the funnel read must keep its failure state');
  // Perder o motivo da perda ou o aviso de "ganho" seria regressão de negócio.
  assert.ok(page.includes('não é dinheiro recebido'));
  assert.ok(page.includes('loss_reason'));
});
