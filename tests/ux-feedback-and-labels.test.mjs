// UX-03B — contrato das duas peças puras que sustentam os estados honestos e
// a linguagem de negócio do CRM. Estes testes impedem duas regressões caras:
// (1) uma falha de leitura voltar a parecer “lista vazia”;
// (2) a tradução de etapas/prioridades alterar o valor canônico enviado à API.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeFailure, readJsonResult, failureFromCause, UX_ERROR_MESSAGES } from '../src/lib/ux-feedback.mjs';
import {
  CRM_STAGE_VALUES,
  CRM_PRIORITY_VALUES,
  CRM_COMPANY_TYPE_VALUES,
  CRM_OPEN_STAGE_VALUES,
  stageLabel,
  priorityLabel,
  companyTypeLabel,
  companyStatusLabel,
  importRowStatusLabel,
  stageOptions,
  priorityOptions,
  companyTypeOptions,
  outcomeNote,
  formatCurrencyBRL,
  formatDateBR,
} from '../src/lib/crm-labels.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('falha sem resposta não é tratada como lista vazia e permite nova tentativa', () => {
  const failure = describeFailure({ status: null });
  assert.equal(failure.kind, 'network');
  assert.equal(failure.canRetry, true);
  assert.match(failure.message, /não significa que a lista esteja vazia/i);
});

test('403 explica a negação, não oferece retry e não promete dado', () => {
  const failure = describeFailure({ status: 403, code: 'commercial_role_required' });
  assert.equal(failure.kind, 'forbidden');
  assert.equal(failure.canRetry, false);
  assert.match(failure.message, /não tem acesso a esta área comercial/i);
  assert.match(failure.message, /Nada foi carregado/i);
});

test('401 pede nova sessão e 5xx admite nova tentativa', () => {
  assert.equal(describeFailure({ status: 401 }).kind, 'unauthorized');
  assert.equal(describeFailure({ status: 401 }).canRetry, true);
  const server = describeFailure({ status: 503, code: 'audit_unavailable' });
  assert.equal(server.kind, 'server');
  assert.equal(server.canRetry, true);
  assert.equal(server.message, UX_ERROR_MESSAGES.audit_unavailable);
});

test('status 4xx de validação não sugere repetir sem corrigir', () => {
  const failure = describeFailure({ status: 400, code: 'invalid_stage' });
  assert.equal(failure.kind, 'invalid');
  assert.equal(failure.canRetry, false);
  assert.equal(failure.status, 400);
  assert.equal(failure.code, 'invalid_stage');
});

test('409 e 410 recebem tratamento próprio, sem virar erro genérico', () => {
  assert.equal(describeFailure({ status: 409 }).kind, 'conflict');
  assert.equal(describeFailure({ status: 410 }).kind, 'gone');
  assert.equal(describeFailure({ status: 429 }).kind, 'rate_limited');
});

test('readJsonResult devolve dados em 200 e falha classificada em erro', async () => {
  const ok = await readJsonResult(new Response(JSON.stringify({ companies: [{ id: '1' }] }), { status: 200 }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.data.companies, [{ id: '1' }]);
  assert.equal(ok.failure, null);

  const denied = await readJsonResult(new Response(JSON.stringify({ error: 'permission_scope_denied' }), { status: 403 }));
  assert.equal(denied.ok, false);
  assert.equal(denied.data, null);
  assert.equal(denied.failure.kind, 'forbidden');
  assert.equal(denied.failure.code, 'permission_scope_denied');

  const broken = await readJsonResult(new Response('não é json', { status: 500 }));
  assert.equal(broken.ok, false);
  assert.equal(broken.failure.kind, 'server');
});

test('failureFromCause sempre produz uma falha de rede legível', () => {
  const failure = failureFromCause(new Error('fetch failed'));
  assert.equal(failure.kind, 'network');
  assert.equal(failure.status, null);
});

test('as listas canônicas do CRM continuam idênticas às do servidor', async () => {
  const source = await readFile(path.join(root, 'src/server/crm-api.mjs'), 'utf8');
  const stages = source.match(/const OPP_STAGES = new Set\(\[([^\]]+)\]\)/);
  const open = source.match(/const OPP_OPEN_STAGES = new Set\(\[([^\]]+)\]\)/);
  const priorities = source.match(/const OPP_PRIORITY = new Set\(\[([^\]]+)\]\)/);
  assert.ok(stages && open && priorities, 'crm-api.mjs precisa continuar declarando as listas canônicas');
  const parse = match => [...match[1].matchAll(/"([^"]+)"/g)].map(item => item[1]);
  assert.deepEqual([...CRM_STAGE_VALUES], parse(stages), 'a UI não pode inventar nem perder etapa aceita pela API');
  assert.deepEqual([...CRM_OPEN_STAGE_VALUES], parse(open));
  assert.deepEqual([...CRM_PRIORITY_VALUES].sort(), parse(priorities).sort());
});

test('a tradução preserva o valor canônico enviado à API', () => {
  for (const option of stageOptions()) {
    assert.ok(CRM_STAGE_VALUES.includes(option.value));
    assert.notEqual(option.label, '');
  }
  for (const option of priorityOptions()) assert.ok(CRM_PRIORITY_VALUES.includes(option.value));
  for (const option of companyTypeOptions()) assert.ok(CRM_COMPANY_TYPE_VALUES.includes(option.value));
  assert.deepEqual(stageOptions().map(option => option.value), [...CRM_STAGE_VALUES]);
});

test('rótulos em português cobrem todos os valores canônicos', () => {
  assert.equal(stageLabel('proposta_elaboracao'), 'Proposta em elaboração');
  assert.equal(stageLabel('negociacao'), 'Negociação');
  assert.equal(priorityLabel('critica'), 'Crítica');
  assert.equal(priorityLabel('media'), 'Média');
  assert.equal(companyTypeLabel('prospect'), 'Potencial cliente');
  assert.equal(companyStatusLabel('active'), 'Ativa');
  assert.equal(importRowStatusLabel('duplicate'), 'Possível duplicata');
  for (const stage of CRM_STAGE_VALUES) assert.notEqual(stageLabel(stage), stage);
  for (const priority of CRM_PRIORITY_VALUES) assert.notEqual(priorityLabel(priority), priority);
});

test('valor desconhecido continua visível em vez de ser escondido', () => {
  assert.equal(stageLabel('etapa_que_o_servidor_criou'), 'etapa_que_o_servidor_criou');
  assert.equal(priorityLabel(''), '—');
  assert.equal(priorityLabel(null), '—');
});

test('ganho é estado de funil e nunca é anunciado como dinheiro recebido', () => {
  assert.match(outcomeNote({ is_won: true }), /não representa valor recebido/i);
  assert.match(outcomeNote({ is_lost: true }), /motivo obrigatório/i);
  assert.equal(outcomeNote({ is_won: false, is_lost: false }), '');
  assert.equal(outcomeNote(null), '');
});

test('formatação não inventa número nem data', () => {
  assert.equal(formatCurrencyBRL(null), 'não informado');
  assert.equal(formatCurrencyBRL(''), 'não informado');
  assert.match(formatCurrencyBRL('8900.50').replace(/\u00a0/g, ' '), /^R\$ 8\.900,50$/);
  assert.equal(formatDateBR(null), 'não informada');
  assert.equal(formatDateBR('2026-11-30'), '30/11/2026');
  assert.equal(formatDateBR('2026-11-30T12:00:00.000Z'), '30/11/2026');
});
