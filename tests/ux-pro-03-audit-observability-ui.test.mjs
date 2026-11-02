import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminAuditApi } from '../src/server/admin-audit-api.mjs';

const base = new URL('../src/app/admin/ti/', import.meta.url);
const audit = await readFile(new URL('AuditClient.tsx', base), 'utf8');
const observability = await readFile(new URL('ObservabilityClient.tsx', base), 'utf8');
const styles = await readFile(new URL('TechnicalOpsClient.module.css', base), 'utf8');

test('UX-PRO-03 audit: retains query and audited export API contracts', () => {
  assert.match(audit, /fetch\(`\/api\/admin\/audit\?\$\{params\.toString\(\)\}`/);
  assert.match(audit, /fetch\("\/api\/admin\/audit\/export", \{/);
  assert.match(audit, /JSON\.stringify\(\{ filters, format: "json" \}\)/);
  assert.match(audit, /audit_export/);
  assert.match(audit, /data\.total/);
  assert.match(audit, /params\.set\("actorId", filters\.actorId\)/);
  assert.match(audit, /params\.set\("target", filters\.target\)/);
  assert.match(audit, /label="ID do responsável"/);
  assert.match(audit, /label="Objeto \/ alvo"/);
  assert.match(audit, /JSON\.stringify\(\{ filters, format: "json" \}\)/);
});

test('PLT-02 audit: applies responsible identity and object filters to both list and export', async () => {
  const calls = [];
  let output;
  const body = { filters: { actorKind: 'staff', actorId: 'synthetic-author-id', action: 'audit_query', target: 'synthetic-object-42', result: 'allowed' }, format: 'json' };
  const api = createAdminAuditApi({
    json: (_res, status, payload) => { output = { status, payload }; return output; },
    readJson: async () => body,
    sameOrigin: () => true,
    getPool: () => ({ query: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 1 }] };
      if (sql.startsWith('SELECT id, actor_kind')) return { rows: [{ id: 'synthetic-row' }] };
      return { rows: [] };
    } }),
    readAdminSession: async () => ({ role: 'ti', identityId: 'synthetic-ti' }),
    clientIp: () => '127.0.0.1',
  });
  const listUrl = new URL('http://example.test/api/admin/audit?actorKind=staff&actorId=synthetic-author-id&action=audit_query&target=synthetic-object-42&result=allowed');
  await api.handleAuditList({ method: 'GET', url: listUrl.toString() }, {}, listUrl);
  assert.equal(output.status, 200);
  const listQuery = calls.find(call => call.sql.startsWith('SELECT id, actor_kind'));
  assert.match(listQuery.sql, /actor_id = \$2/);
  assert.match(listQuery.sql, /target = \$4/);
  assert.deepEqual(listQuery.values.slice(0, 5), ['staff', 'synthetic-author-id', 'audit_query', 'synthetic-object-42', 'allowed']);

  calls.length = 0;
  output = undefined;
  await api.handleAuditExport({ method: 'POST', url: '/api/admin/audit/export' }, {}, body);
  assert.equal(output.status, 200);
  const exportQuery = calls.find(call => call.sql.startsWith('SELECT id, actor_kind'));
  assert.match(exportQuery.sql, /actor_id = \$2/);
  assert.match(exportQuery.sql, /target = \$4/);
  assert.deepEqual(exportQuery.values, ['staff', 'synthetic-author-id', 'audit_query', 'synthetic-object-42', 'allowed']);

  calls.length = 0;
  body.filters.actorId = 'x'.repeat(201);
  await api.handleAuditExport({ method: 'POST', url: '/api/admin/audit/export' }, {}, body);
  assert.equal(output.status, 400);
  assert.equal(output.payload.error, 'invalid_actor_id');
  assert.equal(calls.length, 0, 'invalid export filters must be rejected before database access');
  body.filters.actorId = 'synthetic-author-id';
  body.filters.target = 'x'.repeat(501);
  await api.handleAuditExport({ method: 'POST', url: '/api/admin/audit/export' }, {}, body);
  assert.equal(output.status, 400);
  assert.equal(output.payload.error, 'invalid_target');
  assert.equal(calls.length, 0, 'invalid target must also be rejected before database access');
});

test('PLT-02 audit: operational queries and export are restricted to admin and ti', async () => {
  let output;
  let databaseCalls = 0;
  let sessionRole = null;
  const api = createAdminAuditApi({
    json: (_res, status, payload) => { output = { status, payload }; return output; },
    readJson: async () => ({ filters: {}, format: 'json' }),
    sameOrigin: () => true,
    getPool: () => ({ query: async sql => {
      databaseCalls += 1;
      return { rows: sql.includes('COUNT(*)') ? [{ total: 0 }] : [] };
    } }),
    readAdminSession: async () => sessionRole ? { role: sessionRole, identityId: 'synthetic-identity' } : null,
    clientIp: () => '127.0.0.1',
  });
  const url = new URL('http://example.test/api/admin/audit');
  for (const [role, expected] of [[null, 401], ['rh', 403]]) {
    sessionRole = role;
    await api.handleAuditList({ method: 'GET', url: url.toString() }, {}, url);
    assert.equal(output.status, expected, `${role || 'anonymous'} cannot query audit`);
    await api.handleAuditExport({ method: 'POST', url: '/api/admin/audit/export' }, {}, {});
    assert.equal(output.status, expected, `${role || 'anonymous'} cannot export audit`);
    assert.equal(databaseCalls, 0, 'denied requests must not touch audit storage');
  }
  for (const role of ['ti', 'admin']) {
    sessionRole = role;
    await api.handleAuditList({ method: 'GET', url: url.toString() }, {}, url);
    assert.equal(output.status, 200);
    await api.handleAuditExport({ method: 'POST', url: '/api/admin/audit/export' }, {}, {});
    assert.equal(output.status, 200);
  }
});

test('UX-PRO-03 audit: labels data states and identifies the returned count limit', () => {
  assert.match(audit, /audit_access_restricted/);
  for (const text of ['Data e hora', 'Responsável', 'Resultado', 'Categoria', 'Nenhum evento corresponde aos filtros', 'Até 100 eventos recentes']) {
    assert.ok(audit.includes(text), `expected audit UI text: ${text}`);
  }
  assert.match(audit, /<UiState variant="error"/);
  assert.match(audit, /<UiState variant="empty"/);
});

test('UX-PRO-03 observability: retains summary query and alert action contracts', () => {
  assert.match(observability, /fetch\(`\/api\/admin\/observability\?type=\$\{selectedType\}&limit=\$\{safeLimit\}`/);
  assert.match(observability, /fetch\(`\/api\/admin\/observability\/alerts\/\$\{id\}`/);
  assert.match(observability, /JSON\.stringify\(\{ action \}\)/);
  assert.match(observability, /"acknowledge" \| "resolve"/);
});

test('UX-PRO-03 observability: keeps operational metrics apart from expandable diagnostics', () => {
  assert.match(observability, /className=\{styles\.metrics\}/);
  assert.match(observability, /<summary>Diagnóstico técnico:/);
  assert.match(observability, /r\.error_sanitized/);
  assert.match(observability, /Eventos técnicos detalhados/);
  assert.match(observability, /<UiState variant="loading"/);
  assert.match(observability, /<UiState variant="error"/);
  assert.match(observability, /<UiState variant="empty"/);
});

test('UX-PRO-03 technical screens: responsive layout and keyboard focus use semantic tokens', () => {
  assert.match(styles, /@media\(max-width:650px\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /var\(--ux-color-surface\)/);
  assert.match(styles, /var\(--ux-color-text\)/);
});
