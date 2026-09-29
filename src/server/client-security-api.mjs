// SEC-06/SEC-07: these routes were wired to an incompatible Express-like API.
// Do not expose fake MFA, issue an unverifiable e-mail change, or let a caller
// interpret a 200 response as protection. Re-enable only together with a real
// login challenge, verified delivery channel, recovery and integration tests.
export function createClientSecurityApi({ json, sameOrigin, readClientSession }) {
  async function unavailable(req, res, method, error) {
    if (req.method !== method) {
      return json(res, 405, { error: 'method_not_allowed' }, { Allow: method });
    }
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readClientSession(req);
    if (!session) return json(res, 401, { error: 'client_session_required' });
    return json(res, 503, { error });
  }

  return {
    handleMfaActivate: (req, res) => unavailable(req, res, 'POST', 'mfa_unavailable'),
    handleMfaVerify: (req, res) => unavailable(req, res, 'POST', 'mfa_unavailable'),
    handleMfaDisable: (req, res) => unavailable(req, res, 'POST', 'mfa_unavailable'),
    handleEmailChangeRequest: (req, res) => unavailable(req, res, 'POST', 'email_change_unavailable'),
    handleEmailChangeConfirm: (req, res) => unavailable(req, res, 'PUT', 'email_change_unavailable'),
    handleEmailChangeCancel: (req, res) => unavailable(req, res, 'DELETE', 'email_change_unavailable'),
  };
}
