// RBAC granular: domain.action com escopo (global, own, team, unit, account, contract, organization)
// Implementa verificação no servidor, negação por padrão.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Permissões conhecidas (lista inicial, pode expandir)
export const KNOWN_PERMISSIONS = Object.freeze([
  "admin.users.read",
  "admin.users.write",
  "admin.invites.issue",
  "admin.invites.revoke",
  "admin.audit.read",
  "admin.permissions.grant",
  "admin.permissions.revoke",
  "admin.access_review",
  "client.accounts.read",
  "client.accounts.write",
  "client.contracts.read",
  "client.contracts.write",
  "client.documents.read",
  "client.documents.write",
  "client.documents.download",
  "client.tickets.read",
  "client.tickets.write",
  "client.grants.issue",
  "client.grants.revoke",
  "leads.read",
  "leads.write",
  "site.visual.read",
  "site.visual.write",
  "employees.read",
  "employees.write",
  "employees.health.read",
  "employees.health.write",
  "employees.compensation.read",
  "employees.compensation.write",
  "employees.self_service",
  "proposals.approve_discount",
  "documents.download",
  "payroll.export",
]);

export function isValidPermission(p) {
  return typeof p === "string" && /^[a-z_]+\.[a-z_\.]+$/.test(p);
}

export function isValidScopeType(t) {
  return ["global","own","team","unit","account","contract","organization"].includes(t);
}

export async function hasPermission(db, {
  identityId,
  permission,
  resourceOwnerIdentityId = null,
  unitId = null,
  accountId = null,
  contractId = null,
  allowOrganization = true,
}) {
  if (!identityId || !permission || !UUID_PATTERN.test(identityId)) return false;
  if (!isValidPermission(permission)) return false;
  try {
    const { rows } = await db.query(
      `SELECT scope_type, scope_id
         FROM auth_permissions
        WHERE identity_id=$1 AND permission=$2 AND revoked_at IS NULL`,
      [identityId, permission],
    );
    return rows.some(row => {
      if (row.scope_type === 'global') return true;
      if (row.scope_type === 'organization') return allowOrganization;
      if (row.scope_type === 'own') {
        return Boolean(resourceOwnerIdentityId) && resourceOwnerIdentityId === identityId;
      }
      if (row.scope_type === 'unit') return Boolean(unitId) && row.scope_id === unitId;
      if (row.scope_type === 'account') return Boolean(accountId) && row.scope_id === accountId;
      if (row.scope_type === 'contract') return Boolean(contractId) && row.scope_id === contractId;
      return false;
    });
  } catch {
    // Falha de banco/consulta de escopo nunca mantém acesso amplo.
    return false;
  }
}

export async function grantPermission(db, { identityId, permission, scopeType = "global", scopeId = null, grantedBy, grantedByRole, reason }) {
  if (!isValidPermission(permission)) throw new Error("invalid_permission");
  if (!isValidScopeType(scopeType)) throw new Error("invalid_scope_type");
  if (scopeId && !UUID_PATTERN.test(scopeId)) throw new Error("invalid_scope_id");
  if (!reason || reason.length < 1 || reason.length > 500) throw new Error("reason_required");
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  await db.query(
    `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, identityId, permission, scopeType, scopeId, grantedBy, grantedByRole, reason]
  );
  await db.query(
    `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ('staff',$1,'permission_grant',$2,'allowed','none')`,
    [grantedBy, id]
  ).catch(()=>{});
  return id;
}

export async function revokePermission(db, { permissionId, revokedBy, revokeReason }) {
  if (!UUID_PATTERN.test(permissionId)) throw new Error("invalid_permission_id");
  if (!revokeReason || revokeReason.length < 1 || revokeReason.length > 500) throw new Error("revoke_reason_required");
  const updated = await db.query(
    `UPDATE auth_permissions SET revoked_at = NOW(), revoked_by = $2, revoke_reason = $3 WHERE id = $1 AND revoked_at IS NULL RETURNING id, identity_id`,
    [permissionId, revokedBy, revokeReason]
  );
  if (!updated.rows[0]) {
    const exists = await db.query(`SELECT revoked_at, identity_id FROM auth_permissions WHERE id = $1`, [permissionId]);
    if (!exists.rows[0]) throw new Error("permission_not_found");
    return { outcome: "already_revoked", identityId: exists.rows[0].identity_id };
  }
  await db.query(
    `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ('staff',$1,'permission_revoke',$2,'allowed','none')`,
    [revokedBy, permissionId]
  ).catch(()=>{});
  return { outcome: "revoked", identityId: updated.rows[0].identity_id };
}
