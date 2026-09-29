import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClientSecurityApi } from '../src/server/client-security-api.mjs';
import { encryptMfaSecret, decryptMfaSecret, mfaKey, newMfaSetup, verifyMfaCode, newRecoveryCodes, hashRecoveryCode } from '../src/lib/client-mfa.mjs';
import { generate } from 'otplib';

const routes = [
  ['handleMfaSetup', 'POST'], ['handleMfaActivate', 'POST'], ['handleMfaVerify', 'POST'],
  ['handleMfaDisable', 'POST'], ['handleEmailChangeRequest', 'POST'],
  ['handleEmailChangeConfirm', 'PUT'], ['handleEmailChangeCancel', 'DELETE'],
];
function setup({ authorized = false, origin = true } = {}) {
  const responses = [];
  const api = createClientSecurityApi({
    json(_res, status, body, headers) { responses.push({ status, body, headers }); },
    readJson: async req => req.body ?? {},
    sameOrigin: () => origin,
    readClientSession: async () => authorized ? { identityId: 'synthetic-client', status: 'active' } : null,
    getPool: () => { throw new Error('db_must_not_be_used_in_guard_tests'); },
  });
  return { api, responses };
}
for (const [handler, method] of routes) {
  test(`SEC-06/07 ${handler}: rejects method, origin, anonymous`, async () => {
    const t = setup({ authorized: true });
    await t.api[handler]({ method: 'GET' }, {});
    assert.deepEqual(t.responses.pop(), { status: 405, body: { error: 'method_not_allowed' }, headers: { Allow: method } });
    const foreign = setup({ authorized: true, origin: false });
    await foreign.api[handler]({ method }, {});
    assert.equal(foreign.responses.pop().status, 403);
    const anonymous = setup();
    await anonymous.api[handler]({ method }, {});
    assert.equal(anonymous.responses.pop().status, 401);
  });
}
test('SEC-07 e-mail change never claims success without verified delivery', async () => {
  const t = setup({ authorized: true });
  for (const [handler, method] of routes.filter(([name]) => name.startsWith('handleEmailChange'))) {
    await t.api[handler]({ method }, {});
    assert.deepEqual(t.responses.pop().body, { error: 'email_change_unavailable' });
  }
});
test('SEC-06 TOTP secret encrypts with per-identity AAD, verifies code and rejects replay', async () => {
  const before = process.env.CLIENT_MFA_ENCRYPTION_KEY;
  try {
    delete process.env.CLIENT_MFA_ENCRYPTION_KEY;
    assert.throws(() => mfaKey(), /MFA_KEY_NOT_CONFIGURED/);
    process.env.CLIENT_MFA_ENCRYPTION_KEY = randomBytes(32).toString('base64url');
    const { secret, uri } = newMfaSetup('sample@example.invalid');
    assert.match(uri, /^otpauth:\/\/totp\//);
    const encrypted = encryptMfaSecret(secret, 'identity-A');
    assert.ok(!encrypted.includes(secret));
    assert.equal(decryptMfaSecret(encrypted, 'identity-A'), secret);
    assert.throws(() => decryptMfaSecret(encrypted, 'identity-B'));
    const code = await generate({ secret });
    const first = await verifyMfaCode(encrypted, 'identity-A', code);
    assert.equal(first.valid, true);
    assert.equal((await verifyMfaCode(encrypted, 'identity-A', code, first.timeStep)).valid, false);
    const { codes, hashes } = newRecoveryCodes();
    assert.equal(new Set(codes).size, 8);
    assert.deepEqual(codes.map(hashRecoveryCode), hashes);
  } finally {
    if (before === undefined) delete process.env.CLIENT_MFA_ENCRYPTION_KEY;
    else process.env.CLIENT_MFA_ENCRYPTION_KEY = before;
  }
});
