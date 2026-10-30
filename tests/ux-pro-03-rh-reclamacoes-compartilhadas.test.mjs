import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEmployeeComplaintApi } from '../src/server/employee-complaint-api.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const protocol = 'CLI-COMP-20261029-ABCD';
const sensitive = {
  id, protocol, category: 'outro', severity: 'alta', status: 'pendente',
  is_restricted: true, minimal_share: true, is_shared_with_hr: true,
  shared_with_hr_at: '2026-10-29T10:00:00.000Z', created_at: '2026-10-29T09:00:00.000Z',
  description: 'RELATO-INTEGRAL-SIGILOSO', title: 'TITULO-NAO-COMPARTILHADO',
  employee_reference: 'REFERENCIA-RESTRITA', employee_reference_hash: 'HASH-RESTRITO',
  client_account_id: 'CONTA-RESTRITA', created_by_identity: 'IDENTIDADE-RESTRITA',
};

function response() {
  return { status: 0, payload: null, writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } };
}
function request(method, url, body) {
  return {
    method, url,
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); },
  };
}
function setup({ role = 'rh', shared = true, failAudit = false, authenticated = true, sameOrigin = true } = {}) {
  const events = [];
  const state = { status: 'pendente', history: [], audit: [], committed: false };
  const client = {
    async query(sql, params = []) {
      const text = sql.replace(/\s+/g, ' ').trim();
      events.push({ sql: text, params });
      if (text === 'BEGIN') { state.transactionStatus = state.status; state.historyLength = state.history.length; state.auditLength = state.audit.length; return { rows: [] }; }
      if (text === 'COMMIT') { state.committed = true; return { rows: [] }; }
      if (text === 'ROLLBACK') { state.status = state.transactionStatus; state.history.length = state.historyLength; state.audit.length = state.auditLength; return { rows: [] }; }
      if (text.startsWith('SELECT') && text.includes('FROM cli_employee_complaints')) {
        return { rows: shared ? [{ ...sensitive, status: state.status }] : [] };
      }
      if (text.startsWith('SELECT') && text.includes('FROM cli_employee_complaint_hr_shares')) {
        return { rows: [
          { shared_field: 'title', shared_value: 'TITULO-EXPRESSAMENTE-COMPARTILHADO' },
          { shared_field: 'minimal_description', shared_value: 'RESUMO-MINIMO-EXPRESSAMENTE-COMPARTILHADO' },
          { shared_field: 'employee_reference', shared_value: 'NAO-PERMITIDO' },
        ] };
      }
      if (text.startsWith('UPDATE cli_employee_complaints')) {
        state.status = params[1];
        return { rows: [{ ...sensitive, status: state.status }] };
      }
      if (text.startsWith('INSERT INTO cli_employee_complaint_history')) { state.history.push(params); return { rows: [] }; }
      if (text.startsWith('INSERT INTO audit_log')) {
        if (failAudit) throw new Error('synthetic audit write failure');
        state.audit.push(params); return { rows: [] };
      }
      throw new Error(`Unexpected SQL in test: ${text}`);
    },
    release() { events.push({ sql: 'RELEASE', params: [] }); },
  };
  const pool = { async query(sql, params) { return client.query(sql, params); }, async connect() { return client; } };
  const api = createEmployeeComplaintApi({
    pool,
    auditLog: async () => { throw new Error('new HR flow must write audit in its transaction'); },
    sameOrigin: () => sameOrigin,
    requireSession: async () => authenticated ? ({ role, identityId: id }) : null,
    requireRole: (session, roles) => roles.includes(session.role),
  });
  return { api, events, state };
}

test('RH: existe fluxo aditivo isolado, sem alterar consumidores do PATCH legado', async () => {
  const [component, css, workspace, server, unitCommand] = await Promise.all([
    readFile(new URL('../src/app/admin/funcionarios/SharedEmployeeComplaints.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/admin/funcionarios/SharedEmployeeComplaints.module.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/admin/funcionarios/RhWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  assert.match(workspace, /SharedEmployeeComplaints/);
  assert.match(workspace, /Reclamações compartilhadas/);
  assert.match(server, /\/api\/admin\/hr\/employee-complaints/);
  assert.match(unitCommand, /ux-pro-03-rh-reclamacoes-compartilhadas\.test\.mjs/);
  assert.match(component, /loading|Carregando/i);
  assert.match(component, /retry|Tentar novamente/i);
  assert.match(component, /Array\.isArray/);
  assert.match(component, /sequence|Sequence/);
  assert.match(component, /htmlFor=/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 650px\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});

test('RH: lista/detalhe só retornam projeção mínima e valores expressamente compartilhados', async () => {
  const { api, events } = setup();
  const list = response();
  await api.handleHrWorkspace(request('GET', '/api/admin/hr/employee-complaints'), list);
  assert.equal(list.status, 200);
  assert.equal(list.payload.items.length, 1);
  const exposed = JSON.stringify(list.payload);
  for (const forbidden of ['RELATO-INTEGRAL-SIGILOSO', 'TITULO-NAO-COMPARTILHADO', 'REFERENCIA-RESTRITA', 'HASH-RESTRITO', 'CONTA-RESTRITA', 'IDENTIDADE-RESTRITA']) assert.equal(exposed.includes(forbidden), false);

  const detail = response();
  await api.handleHrWorkspace(request('GET', `/api/admin/hr/employee-complaints/${id}`), detail);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.payload.sharedFields, [
    { field: 'title', value: 'TITULO-EXPRESSAMENTE-COMPARTILHADO' },
    { field: 'minimal_description', value: 'RESUMO-MINIMO-EXPRESSAMENTE-COMPARTILHADO' },
  ]);
  assert.equal(JSON.stringify(detail.payload).includes('NAO-PERMITIDO'), false);
  assert.ok(events.every(({ sql }) => !/SELECT\s+\*/i.test(sql)), 'nenhuma query de projeção RH usa SELECT *');
});

test('RH: atualiza compartilhada com motivo, lock, histórico e auditoria atômicos; rejeita não compartilhada e conflito', async () => {
  const { api, events, state } = setup();
  const res = response();
  await api.handleHrWorkspace(request('PATCH', `/api/admin/hr/employee-complaints/${id}`, {
    status: 'em_analise', expected_status: 'pendente', reason: 'Iniciada a análise pelo RH.',
  }), res);
  assert.equal(res.status, 200);
  assert.equal(res.payload.item.status, 'em_analise');
  assert.equal(JSON.stringify(res.payload).includes('RELATO-INTEGRAL-SIGILOSO'), false);
  assert.equal(state.status, 'em_analise');
  assert.equal(state.history.length, 1);
  assert.equal(state.audit.length, 1);
  assert.ok(state.committed);
  assert.ok(events.findIndex(event => event.sql === 'BEGIN') < events.findIndex(event => /FOR UPDATE/.test(event.sql)));
  assert.ok(events.findIndex(event => /INSERT INTO cli_employee_complaint_history/.test(event.sql)) < events.findIndex(event => event.sql === 'COMMIT'));
  assert.ok(events.findIndex(event => /INSERT INTO audit_log/.test(event.sql)) < events.findIndex(event => event.sql === 'COMMIT'));
  assert.ok(events.some(event => /RETURNING\s+id,\s*protocol,\s*category,\s*severity,\s*status/i.test(event.sql)));
  assert.ok(events.every(event => !/RETURNING\s+\*/i.test(event.sql)));

  const denied = setup({ shared: false });
  const notShared = response();
  await denied.api.handleHrWorkspace(request('PATCH', `/api/admin/hr/employee-complaints/${id}`, {
    status: 'em_analise', expected_status: 'pendente', reason: 'Tentativa não compartilhada.',
  }), notShared);
  assert.equal(notShared.status, 404);
  assert.equal(denied.state.status, 'pendente');
  assert.equal(denied.state.history.length, 0);

  const conflict = response();
  await api.handleHrWorkspace(request('PATCH', `/api/admin/hr/employee-complaints/${id}`, {
    status: 'resolvida', expected_status: 'pendente', reason: 'Atualização desatualizada.',
  }), conflict);
  assert.equal(conflict.status, 409);
  assert.equal(state.status, 'em_analise');
});

test('RH: mesma origem e sessão válidas são exigidas; papel comercial é negado e falha de auditoria reverte situação e histórico', async () => {
  const crossOrigin = setup({ sameOrigin: false });
  const originResponse = response();
  await crossOrigin.api.handleHrWorkspace(request('GET', '/api/admin/hr/employee-complaints'), originResponse);
  assert.equal(originResponse.status, 403);
  assert.equal(crossOrigin.events.length, 0);
  const anonymous = setup({ authenticated: false });
  const anonymousResponse = response();
  await anonymous.api.handleHrWorkspace(request('GET', '/api/admin/hr/employee-complaints'), anonymousResponse);
  assert.equal(anonymousResponse.status, 401);
  assert.equal(anonymous.events.length, 0);

  const commercial = setup({ role: 'comercial' });
  const denied = response();
  await commercial.api.handleHrWorkspace(request('GET', '/api/admin/hr/employee-complaints'), denied);
  assert.equal(denied.status, 403);
  assert.equal(commercial.events.filter(event => /FROM cli_employee_complaints/.test(event.sql)).length, 0);

  const failing = setup({ failAudit: true });
  const res = response();
  await failing.api.handleHrWorkspace(request('PATCH', `/api/admin/hr/employee-complaints/${id}`, {
    status: 'em_apuracao', expected_status: 'pendente', reason: 'Falha sintética de auditoria.',
  }), res);
  assert.equal(res.status, 503);
  assert.equal(failing.state.status, 'pendente');
  assert.equal(failing.state.history.length, 0);
  assert.equal(failing.state.audit.length, 0);
  assert.ok(failing.events.some(event => event.sql === 'ROLLBACK'));
  assert.equal(failing.state.committed, false);
});
