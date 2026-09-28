import test from 'node:test';
import assert from 'node:assert/strict';
import { createCliApi } from '../src/server/cli-api.mjs';

test('PLT-AUD-004: POST de documento recusa proxy PGlite sem transação exclusiva', async () => {
  let connected = false;
  const { handleClientDocumentsV2 } = createCliApi({
    pool: { __isPGliteProxy: true, async connect() { connected = true; throw new Error('não deve conectar'); } },
    auditLog: async () => {},
    sameOrigin: () => true,
    requireSession: () => ({ role: 'ti' }),
    requireRole: (session, roles) => roles.includes(session.role),
  });
  const req = {
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({
        client_account_id: '11111111-1111-4111-8111-111111111111',
        title: 'QA sintético', file_name: 'qa.pdf', file_url: '/qa/documento', storage_key: 'qa-documento',
      }));
    },
  };
  let status, response;
  const res = {
    writeHead(value) { status = value; },
    end(value) { response = JSON.parse(value); },
  };
  await handleClientDocumentsV2(req, res);
  assert.equal(status, 503);
  assert.equal(response.error, 'audited_write_requires_transactional_pg');
  assert.equal(connected, false);
});
