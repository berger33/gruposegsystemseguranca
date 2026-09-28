import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupApi } from '../src/server/backup-api.mjs';

function context(role = 'ti') {
  const queries = [];
  const response = {};
  const pool = {
    async query(sql, params) {
      queries.push([sql, params]);
      if (/SELECT \* FROM backup_jobs/.test(sql)) return { rows: [{ id: '11111111-1111-4111-8111-111111111111', status: 'success', is_restore_tested: true, encryption_method: 'AES-256-GCM', storage_location: 'encrypted://backups/legacy' }] };
      if (/SELECT \* FROM backup_restores/.test(sql)) return { rows: [{ id: '22222222-2222-4222-8222-222222222222', status: 'success', verification_notes: 'simulado', is_isolated: true }] };
      if (/INSERT INTO backup_jobs/.test(sql)) return { rows: [{ id: '11111111-1111-4111-8111-111111111111', status: 'pending' }] };
      if (/INSERT INTO backup_restores/.test(sql)) return { rows: [{ id: '22222222-2222-4222-8222-222222222222', status: 'running' }] };
      return { rows: [] };
    },
  };
  const api = createBackupApi({
    json: (res, status, data) => { res.status = status; res.body = data; return data; },
    readJson: async req => req.body,
    sameOrigin: () => true,
    getPool: () => pool,
    readAdminSession: () => role ? { role } : null,
  });
  return { api, queries, response };
}

const id = '11111111-1111-4111-8111-111111111111';
const request = (method, body) => ({ method, body, headers: { host: 'localhost' }, url: '/api/admin/backups' });

test('PLT-BAK-001: API não pode criar backup/restauração simulados ou certificar metadados', async () => {
  const { api, queries, response } = context();
  await api.handleBackupJobs(request('POST', { backup_type: 'full' }), response);
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'backup_execution_unavailable');
  await api.handleRestore(request('POST', { backup_job_id: id, restore_type: 'test' }), response);
  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'restore_execution_unavailable');
  await api.handleBackupById(request('PATCH', { status: 'success' }), response, id);
  assert.equal(response.status, 503);
  await api.handleBackupById(request('DELETE'), response, id);
  assert.equal(response.status, 503);
  assert.equal(queries.filter(([sql]) => /INSERT INTO backup_jobs|INSERT INTO backup_restores|UPDATE backup_jobs|UPDATE backup_restores/.test(sql)).length, 0);
});

test('PLT-BAK-001: registros históricos de sucesso não são comprovantes de backup ou restore', async () => {
  const { api, response } = context();
  await api.handleBackupJobs(request('GET'), response);
  assert.equal(response.status, 200);
  assert.equal(response.body.backups[0].verified_artifact, false);
  assert.equal(response.body.backups[0].status, 'unverified');
  assert.equal(response.body.backups[0].recorded_status, 'success');
  assert.equal(response.body.backups[0].is_restore_tested, false);
  assert.equal(response.body.backups[0].recorded_is_restore_tested, true, 'preservar histórico sem certificar');
  assert.match(response.body.note, /não comprovam/);
  await api.handleRestore(request('GET'), response);
  assert.equal(response.status, 200);
  assert.equal(response.body.restores[0].verified_execution, false);
  assert.equal(response.body.restores[0].status, 'unverified');
  assert.equal(response.body.restores[0].recorded_status, 'success');
  assert.match(response.body.note, /não comprovam/);
  await api.handleBackupById(request('GET'), response, id);
  assert.equal(response.status, 200);
  assert.equal(response.body.backup.verified_artifact, false);
  assert.equal(response.body.backup.status, 'unverified');
  assert.equal(response.body.restores[0].verified_execution, false);
});

test('PLT-BAK-001: negação de backup permanece antes de qualquer consulta', async () => {
  for (const role of [null, 'rh']) {
    const { api, queries, response } = context(role);
    await api.handleBackupJobs(request('GET'), response);
    assert.equal(response.status, role ? 403 : 401);
    assert.equal(queries.length, 0);
  }
});
