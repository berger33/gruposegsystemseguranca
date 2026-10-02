import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientSpaceApi } from '../src/server/client-space-api.mjs';

// TENANT-SEG-002: injeção de erros em memória. Nenhum servidor ou banco é aberto.
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const IDENTITY = '22222222-2222-4222-8222-222222222222';
const GRANT = '33333333-3333-4333-8333-333333333333';
const UNIT = '44444444-4444-4444-8444-444444444444';
const CONTRACT = '55555555-5555-4555-8555-555555555555';
const DOCUMENT = '66666666-6666-4666-8666-666666666666';

function fixture({ fault, unit = UNIT, unitAllowed = true, grantExists = true, unitRowExists = true,
  scope = 'all', allowed = [], scopeExists = true, session = true } = {}) {
  const calls = [];
  const db = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('INSERT INTO auth_access_audit')) return { rows: [] };
      if (sql.includes('FROM client_access_grants g') && sql.includes('JOIN client_accounts a')) {
        if (fault === 'grant') throw Object.assign(new Error('synthetic database failure'), { code: '57P01' });
        return { rows: grantExists ? [{ id: GRANT, unit_account_id: unit }] : [] };
      }
      // O checkout original consulta a unidade em uma segunda leitura do grant.
      if (sql.includes('SELECT g.unit_account_id FROM client_access_grants')) {
        if (fault === 'unit_grant') throw new Error('synthetic unit grant failure');
        return { rows: unitRowExists ? [{ unit_account_id: unit }] : [] };
      }
      if (sql.includes('FROM client_accounts WHERE id = $1 AND')) {
        if (fault === 'unit_check') throw new Error('synthetic unit check failure');
        return { rows: unitAllowed ? [{ id: ACCOUNT }] : [] };
      }
      if (sql.includes('SELECT contract_scope_mode, allowed_contract_ids FROM client_access_grants')) {
        if (fault === 'allowlist') throw new Error('synthetic allowlist failure');
        return { rows: scopeExists ? [{ contract_scope_mode: scope, allowed_contract_ids: allowed }] : [] };
      }
      if (sql.includes('FROM client_contracts WHERE')) return { rows: [{ id: CONTRACT, title: 'SYNTHETIC-CONTRACT-DO-NOT-DISCLOSE' }] };
      if (sql.includes('FROM client_documents WHERE id =')) return { rows: [{ id: DOCUMENT, client_account_id: ACCOUNT, storage_key: 'a'.repeat(48), original_filename: 'qa.txt' }] };
      if (sql.includes('FROM client_documents WHERE')) return { rows: [{ id: DOCUMENT, title: 'SYNTHETIC-DOCUMENT-DO-NOT-DISCLOSE' }] };
      if (sql.includes('FROM client_tickets WHERE')) return { rows: [{ id: DOCUMENT, title: 'SYNTHETIC-TICKET-DO-NOT-DISCLOSE' }] };
      if (sql.includes('INSERT INTO client_tickets')) throw new Error('unauthorized ticket mutation reached');
      throw new Error(`Unexpected SQL in test: ${sql.slice(0, 100)}`);
    },
  };
  const api = createClientSpaceApi({
    getPool: () => db, docsDir: '/tmp',
    readClientSession: async () => session ? { identityId: IDENTITY } : null,
    sameOrigin: () => true,
    readJson: async () => ({ accountId: ACCOUNT, category: 'Outro assunto', title: 'QA synthetic ticket', details: 'No real client details.', idempotencyKey: 'qa-synthetic-fail-closed-fixture' }),
    json: (res, status, body) => { if (res.status) throw new Error('duplicate response'); res.status = status; res.body = body; return body; },
  });
  const res = {};
  const url = new URL(`http://local.invalid/api/client/contracts?account=${ACCOUNT}`);
  return { api, calls, res, url, req: { method: 'GET' },
    protectedReads() { return calls.filter(c => /FROM client_(contracts|documents|tickets) WHERE/.test(c.sql)); },
    mutations() { return calls.filter(c => c.sql.includes('INSERT INTO client_tickets')); },
  };
}

for (const [fault, label] of [['grant', 'initial grant query'], ['unit_grant', 'unit grant query'], ['unit_check', 'unit membership query'], ['allowlist', 'contract allowlist query']]) {
  test(`TENANT-SEG-002 ${label} failure denies contracts without reading data`, async () => {
    const t = fixture({ fault });
    await t.api.handleClientContracts(t.req, t.res, t.url);
    assert.equal(t.res.status, 503, 'DB failure must fail closed, not list contracts');
    assert.equal(t.res.body.error, 'client_space_unavailable');
    assert.equal(t.protectedReads().length, 0);
  });
}

test('TENANT-SEG-002 missing grant and invalid unit both deny with no data', async () => {
  for (const config of [{ grantExists: false }, { unitAllowed: false }]) {
    const t = fixture(config);
    await t.api.handleClientContracts(t.req, t.res, t.url);
    assert.equal(t.res.status, 403);
    assert.equal(t.res.body.error, 'forbidden');
    assert.equal(t.protectedReads().length, 0);
  }
});

test('TENANT-SEG-002 disappeared unit grant cannot be treated as unrestricted', async () => {
  const t = fixture({ unitRowExists: false });
  await t.api.handleClientContracts(t.req, t.res, t.url);
  assert.equal(t.res.status, 403);
  assert.equal(t.protectedReads().length, 0);
});

test('TENANT-SEG-002 grant revoked before contract scope read cannot list contracts', async () => {
  const t = fixture({ scopeExists: false });
  await t.api.handleClientContracts(t.req, t.res, t.url);
  assert.equal(t.res.status, 403);
  assert.equal(t.protectedReads().length, 0);
});

test('TENANT-SEG-002 selected empty allowlist reads no contracts', async () => {
  const t = fixture({ unit: null, scope: 'selected', allowed: [] });
  await t.api.handleClientContracts(t.req, t.res, t.url);
  assert.equal(t.res.status, 200);
  assert.deepEqual(t.res.body, { contracts: [] });
  assert.equal(t.protectedReads().length, 0);
});

test('TENANT-SEG-002 selected allowlist is applied inside account-scoped SQL', async () => {
  const t = fixture({ unit: null, scope: 'selected', allowed: [CONTRACT] });
  await t.api.handleClientContracts(t.req, t.res, t.url);
  assert.equal(t.res.status, 200);
  const reads = t.protectedReads();
  assert.equal(reads.length, 1);
  assert.match(reads[0].sql, /client_account_id = \$1 AND id = ANY\(\$2\)/);
  assert.deepEqual(reads[0].values, [ACCOUNT, [CONTRACT]]);
});

for (const [name, invoke] of [
  ['documents', t => t.api.handleClientDocuments(t.req, t.res, t.url)],
  ['tickets', t => t.api.handleClientTickets(t.req, t.res, t.url)],
  ['document download', t => t.api.handleClientDocumentDownload(t.req, t.res, DOCUMENT)],
]) {
  test(`TENANT-SEG-002 unit lookup failure blocks ${name}`, async () => {
    const t = fixture({ fault: 'unit_check' });
    await invoke(t);
    assert.equal(t.res.status, 503);
    assert.equal(t.protectedReads().filter(c => !c.sql.includes('FROM client_documents WHERE id =')).length, 0);
  });
}

test('TENANT-SEG-002 unit lookup failure blocks ticket creation', async () => {
  const t = fixture({ fault: 'unit_check' });
  t.req.method = 'POST';
  await t.api.handleClientTickets(t.req, t.res, t.url);
  assert.equal(t.res.status, 503);
  assert.equal(t.mutations().length, 0);
});

test('TENANT-SEG-002 no client session never queries the database', async () => {
  const t = fixture({ session: false });
  await t.api.handleClientContracts(t.req, t.res, t.url);
  assert.equal(t.res.status, 401);
  assert.equal(t.calls.length, 0);
});
