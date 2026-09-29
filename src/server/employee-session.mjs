// L03 — sessão própria do funcionário. O cookie é apenas um envelope assinado;
// a decisão autoritativa consulta identidade, vínculo laboral e epoch no banco.

export const EMPLOYEE_SESSION_TTL_SECONDS = 12 * 60 * 60;

// A pessoa em admissão precisa acessar o onboarding para trocar a senha e
// entregar documentos. Estados de indisponibilidade continuam fail-closed.
const ACTIVE_EMPLOYEE_STATUSES = new Set(['em_admissao', 'ativo']);

export function evaluateEmployeeSessionRow(row, now = new Date()) {
  if (!row) return { valid: false, reason: 'session_unknown' };
  if (row.revoked_at) return { valid: false, reason: 'session_revoked' };
  if (!row.expires_at || new Date(row.expires_at) <= now) return { valid: false, reason: 'session_expired' };
  if (row.identity_kind !== 'employee' || row.identity_status !== 'active') {
    return { valid: false, reason: 'identity_not_active' };
  }
  if (!ACTIVE_EMPLOYEE_STATUSES.has(row.employee_status)) {
    return { valid: false, reason: 'employee_not_active' };
  }
  if (row.linked_identity_id !== row.identity_id || row.access_employee_id !== row.employee_id) {
    return { valid: false, reason: 'employee_link_invalid' };
  }
  if (Number(row.epoch) !== Number(row.identity_epoch)) {
    return { valid: false, reason: 'session_superseded' };
  }
  return {
    valid: true,
    identityId: row.identity_id,
    employeeId: row.employee_id,
    sessionId: row.id,
    displayName: row.display_name,
    mustChangePassword: Boolean(row.must_change_password),
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

export function createEmployeeSessionStore({ getPool, randomUUID }) {
  const SELECT_SESSION = `
    SELECT s.id, s.identity_id, s.employee_id, s.epoch, s.expires_at, s.revoked_at,
           i.kind AS identity_kind, i.status AS identity_status,
           i.session_epoch AS identity_epoch,
           e.identity_id AS linked_identity_id, e.status AS employee_status,
           e.display_name,
           a.employee_id AS access_employee_id, a.must_change_password
      FROM auth_employee_sessions s
      JOIN auth_identities i ON i.id=s.identity_id
      JOIN hr_employees e ON e.id=s.employee_id
      JOIN auth_employee_access a ON a.identity_id=i.id
     WHERE s.id=$1`;

  async function create({ identityId, employeeId, epoch, ipHash, userAgent }) {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + EMPLOYEE_SESSION_TTL_SECONDS * 1000);
    await getPool().query(
      `INSERT INTO auth_employee_sessions
         (id,identity_id,employee_id,epoch,expires_at,last_seen_at,ip_hash,user_agent)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7)`,
      [id, identityId, employeeId, Number(epoch || 0), expiresAt, ipHash || null, String(userAgent || '').slice(0, 200)],
    );
    return { id, expiresAt: expiresAt.getTime(), ttlSeconds: EMPLOYEE_SESSION_TTL_SECONDS };
  }

  async function validate(sessionId) {
    if (!isUuid(sessionId)) return { valid: false, reason: 'session_unknown' };
    const { rows } = await getPool().query(SELECT_SESSION, [sessionId]);
    return evaluateEmployeeSessionRow(rows[0] || null);
  }

  async function touch(sessionId) {
    if (!isUuid(sessionId)) return;
    await getPool().query(
      'UPDATE auth_employee_sessions SET last_seen_at=NOW() WHERE id=$1 AND revoked_at IS NULL',
      [sessionId],
    );
  }

  async function revoke(sessionId, reason = 'logout') {
    if (!isUuid(sessionId)) return 0;
    const { rowCount } = await getPool().query(
      `UPDATE auth_employee_sessions
          SET revoked_at=NOW(), revoked_reason=$2
        WHERE id=$1 AND revoked_at IS NULL`,
      [sessionId, String(reason).slice(0, 80)],
    );
    return rowCount;
  }

  async function revokeAllForIdentity(identityId, reason = 'administrative') {
    if (!isUuid(identityId)) return 0;
    const { rowCount } = await getPool().query(
      `UPDATE auth_employee_sessions
          SET revoked_at=NOW(), revoked_reason=$2
        WHERE identity_id=$1 AND revoked_at IS NULL`,
      [identityId, String(reason).slice(0, 80)],
    );
    return rowCount;
  }

  async function bumpEpoch(identityId, reason = 'credentials_changed', db = getPool()) {
    if (!isUuid(identityId)) return null;
    const { rows } = await db.query(
      `UPDATE auth_identities
          SET session_epoch=session_epoch+1, updated_at=NOW()
        WHERE id=$1 AND kind='employee'
        RETURNING session_epoch`,
      [identityId],
    );
    if (!rows[0]) return null;
    await db.query(
      `UPDATE auth_employee_sessions
          SET revoked_at=NOW(), revoked_reason=$2
        WHERE identity_id=$1 AND revoked_at IS NULL`,
      [identityId, String(reason).slice(0, 80)],
    );
    return rows[0].session_epoch;
  }

  async function bumpEpochAndRevoke(employeeId, reason = 'employee_status_changed', db = getPool()) {
    if (!isUuid(employeeId)) return null;
    const { rows } = await db.query(
      `SELECT identity_id FROM auth_employee_access WHERE employee_id=$1`,
      [employeeId],
    );
    if (!rows[0]) return null;
    return bumpEpoch(rows[0].identity_id, reason, db);
  }

  return { create, validate, touch, revoke, revokeAllForIdentity, bumpEpoch, bumpEpochAndRevoke };
}

export function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
