import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientSecurityApi } from '../src/server/client-security-api.mjs';

const routes = [
  ['handleMfaActivate', 'POST', 'mfa_unavailable'],
  ['handleMfaVerify', 'POST', 'mfa_unavailable'],
  ['handleMfaDisable', 'POST', 'mfa_unavailable'],
  ['handleEmailChangeRequest', 'POST', 'email_change_unavailable'],
  ['handleEmailChangeConfirm', 'PUT', 'email_change_unavailable'],
  ['handleEmailChangeCancel', 'DELETE', 'email_change_unavailable'],
];

function setup({ authorized = false, origin = true } = {}) {
  const responses = [];
  const api = createClientSecurityApi({
    json(_res, status, body, headers) { responses.push({ status, body, headers }); },
    sameOrigin: () => origin,
    readClientSession: async () => authorized ? { identityId: 'synthetic-client' } : null,
  });
  return { api, responses };
}

for (const [handler, method, error] of routes) {
  test(`SEC-06/07 ${handler}: method/origin/session checked and unsupported mutation cannot succeed`, async () => {
    const { api, responses } = setup({ authorized: true });
    await api[handler]({ method: 'GET' }, {});
    assert.deepEqual(responses.pop(), { status: 405, body: { error: 'method_not_allowed' }, headers: { Allow: method } });
    const foreign = setup({ authorized: true, origin: false });
    await foreign.api[handler]({ method }, {});
    assert.deepEqual(foreign.responses.pop().body, { error: 'same_origin_required' });
    const anonymous = setup();
    await anonymous.api[handler]({ method }, {});
    assert.deepEqual(anonymous.responses.pop(), { status: 401, body: { error: 'client_session_required' }, headers: undefined });
    await api[handler]({ method }, {});
    assert.deepEqual(responses.pop(), { status: 503, body: { error }, headers: undefined });
  });
}
