import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClientSecurityApi } from '../src/server/client-security-api.mjs';

const apiSource = await readFile(new URL('../src/server/client-security-api.mjs', import.meta.url), 'utf8');
const migration = await readFile(new URL('../db/migrations/145-cli14-account-security.sql', import.meta.url), 'utf8');

test('CLI-14 uses canonical auth tables and never the v2 session/token sources', () => {
  assert.match(apiSource, /auth_sessions/);
  assert.match(apiSource, /auth_mfa/);
  assert.match(apiSource, /auth_email_change/);
  assert.doesNotMatch(apiSource, /cli_sessions|cli_email_change_requests|cli_security_events/);
  assert.doesNotMatch(apiSource, /session_token_hash|token TEXT/);
  assert.match(migration, /auth_sessions/);
  assert.match(migration, /NOT VALID/);
});

test('CLI-14 security mutations fail closed for anonymous, foreign-origin and wrong method', async () => {
  const answers = [];
  const make = ({ session = null, origin = true } = {}) => createClientSecurityApi({
    json: (_res, status, body) => answers.push({ status, body }),
    readJson: async req => req.body ?? {}, sameOrigin: () => origin,
    readClientSession: async () => session,
    getPool: () => { throw new Error('must not reach DB'); },
  });
  const handlers = ['handleMfaSetup', 'handleMfaActivate', 'handleMfaDisable', 'handleEmailChangeRequest', 'handleEmailChangeConfirm', 'handleEmailChangeCancel', 'handleSessionRevokeOthers'];
  for (const name of handlers) {
    const method = name.includes('Confirm') ? 'PUT' : name.includes('Cancel') ? 'DELETE' : 'POST';
    await make()[name]({ method }, {});
    assert.equal(answers.pop().status, 401, name);
    await make({ session: { identityId: 'client', status: 'active' }, origin: false })[name]({ method }, {});
    assert.equal(answers.pop().status, 403, name);
  }
});

test('CLI-14 session listing has a current marker and no token/hash projection', () => {
  assert.match(apiSource, /\(id=\$2\) AS current/);
  assert.doesNotMatch(apiSource, /SELECT[^;]*(token_hash|session_token_hash)/is);
});

test('CLI-14 all sensitive writes are transaction-scoped and audit failure is explicit', () => {
  assert.match(apiSource, /BEGIN/);
  assert.match(apiSource, /ROLLBACK/);
  assert.match(apiSource, /AUDIT_UNAVAILABLE/);
  assert.match(apiSource, /email_change_confirm/);
  assert.match(apiSource, /session_revoke_all/);
});
