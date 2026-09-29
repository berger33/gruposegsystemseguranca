import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientAccessApi } from '../src/server/client-access-api.mjs';

const target = '11111111-1111-4111-8111-111111111111';
function fixture(role, identityId, origin = true) {
  const replies = [];
  let mutations = 0;
  const api = createClientAccessApi({
    json(_res, code, body) { replies.push({ code, body }); },
    sameOrigin: () => origin,
    readAdminSession: () => role ? { role, identityId } : null,
    getPool: () => ({ async query(sql) {
      if (!sql.includes('SELECT i.id, i.email, c.password_hash')) mutations++;
      return { rows: [{ id: identityId, email: 'ti.qa@example.invalid', password_hash: 'unused' }] };
    } }),
  });
  return { api, replies, mutations: () => mutations };
}
test('QA-HOM-007: manual approval requires method/origin and individual current TI identity', async () => {
  const staff = fixture('ti', '22222222-2222-4222-8222-222222222222');
  await staff.api.handleManualVerificationApprove({ method: 'GET' }, {}, target);
  assert.equal(staff.replies.pop().code, 405);
  const foreign = fixture('ti', '22222222-2222-4222-8222-222222222222', false);
  await foreign.api.handleManualVerificationApprove({ method: 'POST' }, {}, target);
  assert.equal(foreign.replies.pop().code, 403);
  for (const [role, id, expected] of [[null, null, 401], ['ti', null, 403], ['rh', target, 403], ['marcelo', null, 403]]) {
    const t = fixture(role, id);
    await t.api.handleManualVerificationApprove({ method: 'POST' }, {}, target);
    assert.equal(t.replies.pop().code, expected);
    assert.equal(t.mutations(), 0);
  }
});
test('QA-HOM-007: enabling SMTP disables temporary manual approval after verifying staff', async () => {
  const prior = process.env.MAIL_HOST;
  try {
    process.env.MAIL_HOST = 'smtp.example.invalid';
    const t = fixture('ti', '22222222-2222-4222-8222-222222222222');
    await t.api.handleManualVerificationApprove({ method: 'POST' }, {}, target);
    assert.deepEqual(t.replies.pop(), { code: 409, body: { error: 'manual_verification_disabled_with_smtp' } });
    assert.equal(t.mutations(), 0);
  } finally {
    if (prior === undefined) delete process.env.MAIL_HOST;
    else process.env.MAIL_HOST = prior;
  }
});
