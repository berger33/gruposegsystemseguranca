// L01 / SEC-04, SEC-05, SEC-06 — núcleo de sessão administrativa (staff).
//
// Regras que este módulo garante, e que o código anterior NÃO garantia:
//   * Identidade sem perfil em auth_staff_profiles NÃO recebe papel. Não existe
//     mais o fallback `rec.role || "admin"`.
//   * Somente status 'active' autentica. 'pending_email', 'suspended',
//     'disabled' e qualquer valor desconhecido são negados (fail-closed).
//   * A sessão tem estado no servidor: assinatura válida não basta. É preciso
//     uma linha viva em auth_staff_sessions com epoch igual ao da identidade.
//   * Tokens compartilhados são recusados por padrão e sempre que já existir
//     pelo menos uma identidade de staff provisionada.
//
// As funções puras ficam separadas do acesso a banco para poderem ser testadas
// sem PostgreSQL; a validação real continua consultando o banco.

export const STAFF_ROLES = Object.freeze(["admin", "ti", "rh", "marcelo"]);
export const STAFF_SESSION_TTL_SECONDS = 8 * 60 * 60;
// Sessão privilegiada sem MFA vive menos: reduz a janela enquanto o operador
// ainda não cadastrou o autenticador. Não é substituto de MFA.
export const STAFF_SESSION_TTL_NO_MFA_SECONDS = 60 * 60;

/**
 * Decide se um par (status, role) pode originar sessão administrativa.
 * Fail-closed: qualquer entrada não reconhecida nega.
 * @returns {{allowed:true, role:string} | {allowed:false, reason:string, status:number}}
 */
export function evaluateStaffLogin({ status, role, hasProfile }) {
  if (status !== "active") {
    // pending_email NÃO autentica: antes de L01 ele emitia sessão privilegiada.
    return { allowed: false, reason: "identity_not_active", status: 401 };
  }
  if (!hasProfile) {
    // Antes de L01 isto caía em `|| "admin"` e concedia o papel mais alto.
    return { allowed: false, reason: "staff_profile_missing", status: 403 };
  }
  if (typeof role !== "string" || !STAFF_ROLES.includes(role)) {
    return { allowed: false, reason: "role_not_allowed", status: 403 };
  }
  return { allowed: true, role };
}

/**
 * Política dos tokens compartilhados legados (SITE_ADMIN_TOKEN_*).
 * Recusa por padrão. Só permanece disponível durante a migração, quando:
 *   - o operador liga SITE_ADMIN_LEGACY_TOKENS=true de forma explícita, E
 *   - ainda não existe nenhuma identidade de staff provisionada.
 * Assim que a primeira conta individual existe, o token compartilhado morre
 * sozinho, sem depender de o operador lembrar de desligá-lo.
 */
export function evaluateLegacyTokenPolicy({ enabledFlag, provisionedStaffCount, tokensConfigured }) {
  // Somente o literal "true" liga o bootstrap. O trim existe porque o .env é
  // editado à mão no Windows; "1", "yes" e "on" continuam NÃO ligando.
  if (String(enabledFlag ?? "").trim().toLowerCase() !== "true") {
    return { allowed: false, reason: "legacy_admin_tokens_disabled" };
  }
  if (!tokensConfigured) {
    return { allowed: false, reason: "admin_auth_not_configured" };
  }
  if (Number(provisionedStaffCount) > 0) {
    return { allowed: false, reason: "legacy_admin_tokens_superseded" };
  }
  return { allowed: true, reason: "legacy_bootstrap" };
}

/**
 * Valida o resultado da consulta de sessão. Separado para teste sem banco.
 * `row` vem de auth_staff_sessions JOIN auth_identities JOIN auth_staff_profiles.
 */
export function evaluateStaffSessionRow(row, now = new Date()) {
  if (!row) return { valid: false, reason: "session_unknown" };
  if (row.revoked_at) return { valid: false, reason: "session_revoked" };
  if (!row.expires_at || new Date(row.expires_at) <= now) return { valid: false, reason: "session_expired" };
  if (row.identity_status !== "active") return { valid: false, reason: "identity_not_active" };
  // Perfil removido ou papel rebaixado depois da emissão: a sessão morre.
  if (!row.profile_role || !STAFF_ROLES.includes(row.profile_role)) {
    return { valid: false, reason: "staff_profile_missing" };
  }
  if (row.role !== row.profile_role) return { valid: false, reason: "role_changed" };
  // Troca de senha / suspensão / mudança de permissão incrementam session_epoch.
  if (Number(row.epoch) !== Number(row.identity_epoch)) {
    return { valid: false, reason: "session_superseded" };
  }
  return { valid: true, role: row.profile_role, identityId: row.identity_id, sessionId: row.id,
    mfaVerifiedAt: row.mfa_verified_at || null, expiresAt: new Date(row.expires_at).getTime() };
}

/**
 * Cria o acesso a banco das sessões de staff.
 * `getPool` é injetado para manter o módulo testável e sem estado global.
 */
export function createStaffSessionStore({ getPool, randomUUID }) {
  const SELECT_SESSION = `
    SELECT s.id, s.identity_id, s.role, s.epoch, s.mfa_verified_at,
           s.expires_at, s.revoked_at,
           i.status AS identity_status, i.session_epoch AS identity_epoch,
           p.role AS profile_role
      FROM auth_staff_sessions s
      JOIN auth_identities i ON i.id = s.identity_id AND i.kind = 'staff'
      LEFT JOIN auth_staff_profiles p ON p.identity_id = i.id
     WHERE s.id = $1`;

  async function create({ identityId, role, epoch, mfaVerified, ipHash, userAgent, ttlSeconds }) {
    const db = getPool();
    const id = randomUUID();
    const seconds = ttlSeconds ?? (mfaVerified ? STAFF_SESSION_TTL_SECONDS : STAFF_SESSION_TTL_NO_MFA_SECONDS);
    const expiresAt = new Date(Date.now() + seconds * 1000);
    await db.query(
      `INSERT INTO auth_staff_sessions
         (id, identity_id, role, epoch, mfa_verified_at, expires_at, ip_hash, user_agent, last_seen_at)
       VALUES ($1,$2,$3,$4,${mfaVerified ? "NOW()" : "NULL"},$5,$6,$7,NOW())`,
      [id, identityId, role, epoch ?? 0, expiresAt, ipHash || null, String(userAgent || "").slice(0, 200)],
    );
    return { id, expiresAt: expiresAt.getTime(), ttlSeconds: seconds };
  }

  /** Validação autoritativa: consulta o banco a cada requisição. */
  async function validate(sessionId) {
    if (!isUuid(sessionId)) return { valid: false, reason: "session_unknown" };
    const db = getPool();
    const { rows } = await db.query(SELECT_SESSION, [sessionId]);
    return evaluateStaffSessionRow(rows[0] || null);
  }

  async function touch(sessionId) {
    try {
      await getPool().query("UPDATE auth_staff_sessions SET last_seen_at = NOW() WHERE id = $1", [sessionId]);
    } catch { /* telemetria não pode derrubar a requisição */ }
  }

  async function revoke(sessionId, reason = "logout") {
    if (!isUuid(sessionId)) return 0;
    const { rowCount } = await getPool().query(
      "UPDATE auth_staff_sessions SET revoked_at = NOW(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL",
      [sessionId, String(reason).slice(0, 80)],
    );
    return rowCount;
  }

  async function revokeAllForIdentity(identityId, reason = "administrative") {
    if (!isUuid(identityId)) return 0;
    const { rowCount } = await getPool().query(
      "UPDATE auth_staff_sessions SET revoked_at = NOW(), revoked_reason = $2 WHERE identity_id = $1 AND revoked_at IS NULL",
      [identityId, String(reason).slice(0, 80)],
    );
    return rowCount;
  }

  /**
   * Incrementa o epoch da identidade. Qualquer sessão emitida antes deixa de
   * validar na requisição seguinte, sem precisar enumerá-las.
   */
  async function bumpEpoch(identityId, reason = "credentials_changed") {
    if (!isUuid(identityId)) return null;
    const { rows } = await getPool().query(
      "UPDATE auth_identities SET session_epoch = session_epoch + 1 WHERE id = $1 RETURNING session_epoch",
      [identityId],
    );
    if (!rows[0]) return null;
    await revokeAllForIdentity(identityId, reason);
    return rows[0].session_epoch;
  }

  /**
   * Conta apenas contas individuais REAIS. O perfil criado pelo bootstrap por
   * token compartilhado é excluído de propósito: se contasse, o primeiro uso do
   * token desligaria o próprio bootstrap e travaria a instalação inicial.
   */
  async function countProvisionedStaff() {
    const { rows } = await getPool().query(
      `SELECT COUNT(*)::int AS total
         FROM auth_identities i
         JOIN auth_staff_profiles p ON p.identity_id = i.id
         JOIN auth_credentials c ON c.identity_id = i.id
        WHERE i.kind = 'staff' AND i.status = 'active' AND p.is_bootstrap = FALSE`,
    );
    return rows[0]?.total ?? 0;
  }

  return { create, validate, touch, revoke, revokeAllForIdentity, bumpEpoch, countProvisionedStaff };
}

export function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
