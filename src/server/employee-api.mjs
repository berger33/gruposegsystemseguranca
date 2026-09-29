import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeEmail, hashPassword, verifyPassword } from '../lib/client-auth-core.mjs';
import { hasPermission } from './rbac.mjs';
import { isUuid } from './employee-session.mjs';

const MAX_PRIVATE_FILE_BYTES = 5 * 1024 * 1024;
const SAFE_CONTENT_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'text/plain',
]);
const SELF_REQUEST_TYPES = new Set(['ferias','afastamento','beneficio','reembolso','outro']);
const ABSENCE_REASONS = new Set(['doenca','transporte','familiar','pessoal','acidente','condicoes_climaticas','outro']);
const OFFLINE_TYPES = new Set(['occurrence','handover','absence_notice','procedure_ack']);

function clean(value, max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function protocol(prefix) {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `${prefix}${day}-${randomBytes(3).toString('hex').toUpperCase()}`.slice(0, 20);
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function safeFilename(value) {
  return clean(value, 240).replace(/[\r\n\0]/g, '') || 'documento.bin';
}
function rows(result) { return result.rows || []; }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createEmployeeApi(ctx) {
  const db = () => ctx.getPool();

  async function audit(action, actor, target, meta = null, client = db()) {
    await client.query(
      `INSERT INTO audit_log(action,actor,target,meta) VALUES ($1,$2,$3,$4)`,
      [action, actor || null, target || null, meta ? JSON.stringify(meta) : null],
    );
  }

  async function body(req, maxBytes = 128 * 1024) {
    try { return await ctx.readJson(req, maxBytes); }
    catch (error) {
      error.httpStatus = error?.message === 'BODY_TOO_LARGE' ? 413 : 400;
      throw error;
    }
  }

  async function employee(req, res) {
    const session = await ctx.readEmployeeSession(req);
    if (!session) {
      ctx.json(res, 401, { error: 'employee_session_required' });
      return null;
    }
    return session;
  }

  async function employeeScope(client, employeeId) {
    const { rows: found } = await client.query(
      `SELECT id, identity_id, unit_id, contract_id, status
         FROM hr_employees WHERE id=$1`,
      [employeeId],
    );
    return found[0] || null;
  }

  async function hr(req, res, permission, employeeId = null) {
    const session = await ctx.readStaffSession(req);
    if (!session) {
      ctx.json(res, 401, { error: 'admin_session_required' });
      return null;
    }
    let scope = null;
    if (employeeId) {
      scope = await employeeScope(db(), employeeId);
      if (!scope) {
        ctx.json(res, 404, { error: 'employee_not_found' });
        return null;
      }
    }
    const allowed = await hasPermission(db(), {
      identityId: session.identityId,
      permission,
      resourceOwnerIdentityId: scope?.identity_id || null,
      unitId: scope?.unit_id || null,
      contractId: scope?.contract_id || null,
    });
    if (!allowed) {
      ctx.json(res, 403, { error: 'permission_scope_denied' });
      return null;
    }
    return { ...session, employeeScope: scope };
  }

  async function handleSession(req, res) {
    if (req.method === 'GET') {
      const session = await employee(req, res);
      if (!session) return;
      return ctx.json(res, 200, {
        identityId: session.identityId,
        employeeId: session.employeeId,
        displayName: session.displayName,
        mustChangePassword: session.mustChangePassword,
        expiresAt: session.expiresAt,
      });
    }
    if (req.method === 'DELETE') {
      if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
      const envelope = ctx.readEmployeeEnvelope(req);
      if (envelope) await ctx.employeeSessionStore.revoke(envelope.sid, 'logout').catch(() => {});
      return ctx.json(res, 200, { ok: true }, { 'Set-Cookie': ctx.employeeCookie(req, '', 0) });
    }
    if (req.method !== 'POST') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, DELETE' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    if (!ctx.employeeLoginAllowed(req)) return ctx.json(res, 429, { error: 'too_many_attempts' }, { 'Retry-After': '900' });

    let data;
    try { data = await body(req, 16 * 1024); }
    catch (error) { return ctx.json(res, error.httpStatus || 400, { error: 'invalid_request' }); }
    const normalized = normalizeEmail(data?.email);
    const password = typeof data?.password === 'string' ? data.password : '';
    if (normalized.error || !password) return ctx.json(res, 401, { error: 'invalid_credentials' });
    try {
      const { rows: found } = await db().query(
        `SELECT i.id AS identity_id, i.status AS identity_status, i.session_epoch,
                c.password_hash, e.id AS employee_id, e.status AS employee_status,
                e.display_name, a.must_change_password
           FROM auth_identities i
           JOIN auth_credentials c ON c.identity_id=i.id
           JOIN auth_employee_access a ON a.identity_id=i.id
           JOIN hr_employees e ON e.id=a.employee_id AND e.identity_id=i.id
          WHERE i.kind='employee' AND i.email=$1`,
        [normalized.value],
      );
      const record = found[0];
      if (!record || !(await verifyPassword(password, record.password_hash))) {
        return ctx.json(res, 401, { error: 'invalid_credentials' });
      }
      if (record.identity_status !== 'active' || !['em_admissao', 'ativo'].includes(record.employee_status)) {
        return ctx.json(res, 403, { error: 'employee_access_inactive' });
      }
      const issued = await ctx.issueEmployeeSession({
        identityId: record.identity_id,
        employeeId: record.employee_id,
        epoch: record.session_epoch,
        req,
      });
      await db().query('UPDATE auth_employee_access SET last_login_at=NOW() WHERE identity_id=$1', [record.identity_id]);
      await audit('employee_login', record.identity_id, record.employee_id);
      return ctx.json(res, 200, {
        employeeId: record.employee_id,
        displayName: record.display_name,
        mustChangePassword: record.must_change_password,
        expiresAt: issued.expiresAt,
      }, { 'Set-Cookie': ctx.employeeCookie(req, issued.value, issued.ttlSeconds) });
    } catch (error) {
      console.error('Employee login failed.', error?.message);
      return ctx.json(res, 503, { error: 'employee_auth_unavailable' });
    }
  }

  async function handlePassword(req, res) {
    if (req.method !== 'PUT') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'PUT' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const session = await employee(req, res); if (!session) return;
    let data;
    try { data = await body(req, 16 * 1024); }
    catch (error) { return ctx.json(res, error.httpStatus || 400, { error: 'invalid_request' }); }
    const currentPassword = typeof data?.currentPassword === 'string' ? data.currentPassword : '';
    const nextPassword = typeof data?.newPassword === 'string' ? data.newPassword : '';
    if (nextPassword.length < 12 || nextPassword.length > 200) return ctx.json(res, 400, { error: 'password_policy' });
    const { rows: credentials } = await db().query('SELECT password_hash FROM auth_credentials WHERE identity_id=$1', [session.identityId]);
    if (!credentials[0] || !(await verifyPassword(currentPassword, credentials[0].password_hash))) {
      return ctx.json(res, 401, { error: 'current_password_invalid' });
    }
    const nextHash = await hashPassword(nextPassword);
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE auth_credentials SET password_hash=$2,password_set_at=NOW(),updated_at=NOW() WHERE identity_id=$1`,
        [session.identityId, nextHash],
      );
      await client.query(
        `UPDATE auth_employee_access SET must_change_password=FALSE,password_changed_at=NOW() WHERE identity_id=$1`,
        [session.identityId],
      );
      // O trigger de auth_credentials avança o epoch e revoga todas as sessões
      // da identidade dentro desta mesma transação.
      await audit('employee_password_change', session.identityId, session.employeeId, null, client);
      await client.query('COMMIT');
      return ctx.json(res, 200, { ok: true, sessionRevoked: true }, { 'Set-Cookie': ctx.employeeCookie(req, '', 0) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Employee password change failed.', error?.message);
      return ctx.json(res, 503, { error: 'password_change_unavailable' });
    } finally { client.release(); }
  }

  async function handleProvisionAccess(req, res, employeeId) {
    if (req.method !== 'POST') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const staff = await hr(req, res, 'employees.write', employeeId); if (!staff) return;
    let data;
    try { data = await body(req, 16 * 1024); }
    catch (error) { return ctx.json(res, error.httpStatus || 400, { error: 'invalid_request' }); }
    const normalized = normalizeEmail(data?.email);
    if (normalized.error) return ctx.json(res, 400, { error: 'invalid_email' });
    const temporaryPassword = `Seg-${randomBytes(12).toString('base64url')}!7`;
    const passwordHash = await hashPassword(temporaryPassword);
    const identityId = randomUUID();
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const { rows: locked } = await client.query(
        `SELECT id,identity_id,display_name,status FROM hr_employees WHERE id=$1 FOR UPDATE`, [employeeId],
      );
      if (!locked[0]) { await client.query('ROLLBACK'); return ctx.json(res, 404, { error: 'employee_not_found' }); }
      if (locked[0].identity_id) { await client.query('ROLLBACK'); return ctx.json(res, 409, { error: 'employee_access_already_exists' }); }
      if (!['em_admissao','ativo'].includes(locked[0].status)) {
        await client.query('ROLLBACK'); return ctx.json(res, 409, { error: 'employee_status_blocks_access' });
      }
      await client.query(
        `INSERT INTO auth_identities(id,kind,email,display_name,status)
         VALUES ($1,'employee',$2,$3,'active')`,
        [identityId, normalized.value, locked[0].display_name],
      );
      await client.query('INSERT INTO auth_credentials(identity_id,password_hash) VALUES ($1,$2)', [identityId, passwordHash]);
      await client.query('UPDATE hr_employees SET identity_id=$2,updated_at=NOW() WHERE id=$1', [employeeId, identityId]);
      await client.query(
        `INSERT INTO auth_employee_access(identity_id,employee_id,must_change_password,provisioned_by)
         VALUES ($1,$2,TRUE,$3)`,
        [identityId, employeeId, staff.identityId],
      );
      await client.query(
        `INSERT INTO auth_permissions(id,identity_id,permission,scope_type,scope_id,granted_by,granted_by_role,reason)
         VALUES ($1,$2,'employees.self_service','own',NULL,$3,$4,'Acesso próprio criado pelo RH')`,
        [randomUUID(), identityId, staff.identityId, staff.role],
      );
      await audit('employee_access_provision', staff.identityId, employeeId, { identityId }, client);
      await client.query('COMMIT');
      return ctx.json(res, 201, {
        employeeId, identityId, email: normalized.value,
        temporaryPassword,
        warning: 'Credencial temporária exibida uma única vez. Entregue localmente ao funcionário e exija a troca no primeiro acesso.',
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.code === '23505') return ctx.json(res, 409, { error: 'email_or_access_already_exists' });
      console.error('Employee access provisioning failed.', error?.message);
      return ctx.json(res, 503, { error: 'employee_access_unavailable' });
    } finally { client.release(); }
  }

  async function handleMe(req, res) {
    if (req.method !== 'GET') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    const session = await employee(req, res); if (!session) return;
    const { rows: found } = await db().query(
      `SELECT id,matricula,display_name,status,employment_type,cargo,empregador,filial,
              lotacao,gestor_name,contact_email,contact_phone,address_city,address_state,
              admission_date,created_at,updated_at
         FROM hr_employees WHERE id=$1`,
      [session.employeeId],
    );
    if (!found[0]) return ctx.json(res, 404, { error: 'employee_not_found' });
    const { rows: requests } = await db().query(
      `SELECT id,status,requested_changes,justification,rejection_reason,created_at,reviewed_at
         FROM hr_profile_update_requests WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [session.employeeId],
    );
    return ctx.json(res, 200, { employee: found[0], updateRequests: requests, scope: 'own' });
  }

  async function handleHome(req, res) {
    if (req.method !== 'GET') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    const session = await employee(req, res); if (!session) return;
    const id = session.employeeId;
    try {
      const results = await Promise.all([
        db().query(`SELECT id,shift_date,start_time,end_time,location,function_name,supervisor_name,supervisor_contact,orientations,required_items,status,is_next_shift FROM emp_shift_assignments WHERE employee_id=$1 AND status NOT IN ('cancelado') ORDER BY is_next_shift DESC,shift_date,start_time LIMIT 20`, [id]),
        db().query(`SELECT se.id,se.entry_date,se.entry_type,se.is_day_off,se.start_time,se.end_time,se.location,se.acknowledged,se.acknowledged_at,se.change_reason,v.version,v.title FROM emp_schedule_entries se JOIN emp_schedule_versions v ON v.id=se.version_id AND v.status='publicado' WHERE se.employee_id=$1 ORDER BY se.entry_date DESC LIMIT 60`, [id]),
        db().query(`SELECT id,entry_date,clock_in,clock_out,hours_worked,source,status,divergence_reason,competence FROM hr_time_entries WHERE employee_id=$1 ORDER BY entry_date DESC LIMIT 60`, [id]),
        db().query(`SELECT id,protocol,notice_type,shift_date,expected_delay_minutes,reason_code,status,coverage_triggered,created_at FROM emp_absence_notices WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 30`, [id]),
        db().query(`SELECT id,protocol,swap_date,status,requester_ack,target_ack,created_at FROM emp_shift_swap_requests WHERE requester_employee_id=$1 OR target_employee_id=$1 ORDER BY created_at DESC LIMIT 30`, [id]),
        db().query(`SELECT id,protocol,handover_date,status,CASE WHEN from_employee_id=$1 THEN 'saida' ELSE 'entrada' END AS direction FROM emp_handover_records WHERE from_employee_id=$1 OR to_employee_id=$1 ORDER BY handover_date DESC LIMIT 30`, [id]),
        db().query(`SELECT id,protocol,category,severity,title,occurred_at,location,status FROM emp_occurrences WHERE employee_id=$1 ORDER BY occurred_at DESC LIMIT 30`, [id]),
        db().query(`SELECT p.id,p.post_location,p.title,p.version,p.content,p.category,EXISTS(SELECT 1 FROM emp_procedure_acknowledgments a WHERE a.procedure_id=p.id AND a.employee_id=$1) AS acknowledged FROM emp_post_procedures p WHERE p.status='publicado' AND p.is_active=TRUE AND (p.post_location='Geral' OR p.post_location IN (SELECT location FROM emp_shift_assignments WHERE employee_id=$1)) ORDER BY p.title LIMIT 50`, [id]),
        db().query(`SELECT id,document_kind,category,title,competence,version,status,source_label,source_authorized,original_filename,content_type,size_bytes,created_at,published_at FROM employee_private_documents WHERE employee_id=$1 AND (uploaded_by_kind='employee' OR status='published') ORDER BY created_at DESC LIMIT 50`, [id]),
        db().query(`SELECT id,protocol,request_type,category,title,status,due_date,response_deadline,created_at FROM emp_self_requests WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 40`, [id]),
        db().query(`SELECT id,protocol,request_type,size,quantity,status,created_at FROM emp_uniform_self_requests WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 30`, [id]),
        db().query(`SELECT d.id,d.delivery_date,d.quantity,d.size,d.status,d.receipt_signed,c.name AS item_name,c.type AS item_type,c.is_epi,COALESCE(r.receipt_signed,FALSE) AS employee_confirmed,r.signed_at FROM hr_uniform_deliveries d LEFT JOIN hr_uniform_catalog c ON c.id=d.uniform_id LEFT JOIN emp_uniform_receipt_confirmations r ON r.delivery_id=d.id AND r.employee_id=d.employee_id WHERE d.employee_id=$1 ORDER BY d.delivery_date DESC LIMIT 30`, [id]),
        db().query(`SELECT ce.id,ce.enrollment_date,ce.completion_date,ce.status,ce.expiry_date,tc.name AS training_name FROM emp_course_enrollments ce LEFT JOIN hr_training_catalog tc ON tc.id=ce.training_id WHERE ce.employee_id=$1 ORDER BY ce.enrollment_date DESC LIMIT 30`, [id]),
        db().query(`SELECT c.id,c.title,c.content,c.category,c.published_at,r.confirmed,r.read_at FROM emp_communications c LEFT JOIN emp_communication_reads r ON r.communication_id=c.id AND r.employee_id=$1 JOIN hr_employees e ON e.id=$1 WHERE c.status='publicado' AND c.is_active=TRUE AND (c.target_type='todos' OR c.target_employee_id=$1 OR (c.target_type='cargo' AND c.target_group=e.cargo) OR (c.target_type='lotacao' AND c.target_group=e.lotacao)) ORDER BY c.published_at DESC NULLS LAST,c.created_at DESC LIMIT 40`, [id]),
        db().query(`SELECT id,protocol,category,priority,title,status,responsible_name,due_date,created_at FROM emp_hr_tickets WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 30`, [id]),
        db().query(`SELECT id,protocol,category,title,status,created_at FROM emp_confidential_reports WHERE reporter_employee_id=$1 AND is_anonymous=FALSE ORDER BY created_at DESC LIMIT 20`, [id]),
        db().query(`SELECT id,category,question,answer FROM emp_faq_internal WHERE status='publicado' AND is_published=TRUE ORDER BY category,question LIMIT 100`),
        db().query(`SELECT prefers_keyboard,prefers_screen_reader,prefers_simple_language,prefers_low_data,font_size,high_contrast,reduced_motion FROM emp_accessibility_preferences WHERE employee_id=$1`, [id]),
        db().query(`SELECT id,type,title,message,is_read,created_at FROM emp_notifications_center WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
      ]);
      const names = ['shifts','schedule','journey','absences','swaps','handovers','occurrences','procedures','documents','requests','uniforms','uniformDeliveries','courses','communications','tickets','confidential','faq','accessibility','notifications'];
      const payload = { scope: 'own', employeeId: id };
      names.forEach((name, index) => { payload[name] = rows(results[index]); });
      return ctx.json(res, 200, payload, { 'Cache-Control': 'private, no-store' });
    } catch (error) {
      console.error('Employee home failed.', error?.message);
      return ctx.json(res, 503, { error: 'employee_home_unavailable' });
    }
  }

  async function handleProfileUpdate(req, res) {
    if (req.method !== 'POST') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const session = await employee(req, res); if (!session) return;
    const data = await body(req);
    const changes = data?.changes;
    const allowed = new Set(['contact_email','contact_phone','address_city','address_state']);
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) return ctx.json(res, 400, { error: 'invalid_changes' });
    if (Object.keys(changes).some(key => !allowed.has(key))) return ctx.json(res, 400, { error: 'field_not_editable' });
    const { rows: current } = await db().query('SELECT display_name,matricula,cargo,lotacao,contact_email,contact_phone,address_city,address_state FROM hr_employees WHERE id=$1', [session.employeeId]);
    const normalized = Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, clean(String(value || ''), 320)]));
    if (normalized.contact_email && normalizeEmail(normalized.contact_email).error) return ctx.json(res, 400, { error: 'invalid_email' });
    const { rows: created } = await db().query(
      `INSERT INTO hr_profile_update_requests(employee_id,identity_id,requested_changes,current_snapshot,justification,created_by,created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id,status,requested_changes,created_at`,
      [session.employeeId, session.identityId, JSON.stringify(normalized), JSON.stringify(current[0] || {}), clean(data?.justification, 1000) || null, session.identityId],
    );
    await audit('profile_update_request', session.identityId, created[0].id, { employeeId: session.employeeId });
    return ctx.json(res, 201, { request: created[0] });
  }

  async function handleScheduleAck(req, res, entryId) {
    if (req.method !== 'POST') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const session = await employee(req, res); if (!session) return;
    if (!isUuid(entryId)) return ctx.json(res, 400, { error: 'invalid_entry_id' });
    const { rows: updated } = await db().query(
      `UPDATE emp_schedule_entries se SET acknowledged=TRUE,acknowledged_at=NOW(),acknowledged_by=$3,updated_at=NOW()
        FROM emp_schedule_versions v
       WHERE se.id=$1 AND se.employee_id=$2 AND v.id=se.version_id AND v.status='publicado'
       RETURNING se.id,se.acknowledged,se.acknowledged_at`,
      [entryId, session.employeeId, session.identityId],
    );
    if (!updated[0]) return ctx.json(res, 404, { error: 'schedule_entry_not_found' });
    await audit('emp_schedule_ack', session.identityId, entryId);
    return ctx.json(res, 200, { entry: updated[0] });
  }

  async function handleAction(req, res, action) {
    if (req.method !== 'POST') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const session = await employee(req, res); if (!session) return;
    let data;
    try { data = await body(req); } catch (error) { return ctx.json(res, error.httpStatus || 400, { error: 'invalid_request' }); }
    const employeeId = session.employeeId;
    const actor = session.identityId;

    if (action === 'absence') {
      const noticeType = data?.noticeType === 'atraso' ? 'atraso' : 'ausencia';
      const reason = ABSENCE_REASONS.has(data?.reasonCode) ? data.reasonCode : 'outro';
      if (reason === 'outro' && clean(data?.details).length < 10) return ctx.json(res, 400, { error: 'reason_details_required' });
      const { rows: created } = await db().query(
        `INSERT INTO emp_absence_notices(protocol,employee_id,notice_type,shift_date,expected_delay_minutes,reason_code,reason_details,created_by,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,protocol,employee_id,status,coverage_triggered`,
        [protocol('ABS'), employeeId, noticeType, data?.shiftDate || null, noticeType === 'atraso' ? Number(data?.expectedDelayMinutes || 0) : null, reason, clean(data?.details, 1000) || null, actor],
      );
      await audit('emp_absence_notice_create', actor, created[0].id);
      return ctx.json(res, 201, { notice: created[0] });
    }
    if (action === 'time-correction') {
      if (!isUuid(data?.timeEntryId) || clean(data?.reason).length < 10) return ctx.json(res, 400, { error: 'invalid_time_correction' });
      const { rows: entries } = await db().query('SELECT * FROM hr_time_entries WHERE id=$1 AND employee_id=$2', [data.timeEntryId, employeeId]);
      if (!entries[0]) return ctx.json(res, 404, { error: 'time_entry_not_found' });
      const requested = data?.requestedChanges && typeof data.requestedChanges === 'object' ? data.requestedChanges : {};
      const { rows: created } = await db().query(
        `INSERT INTO emp_journey_corrections(employee_id,time_entry_id,original_snapshot,requested_changes,reason,created_by,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id,status,employee_id,time_entry_id,original_snapshot`,
        [employeeId, data.timeEntryId, JSON.stringify(entries[0]), JSON.stringify(requested), clean(data.reason, 1000), actor],
      );
      await audit('emp_journey_correction_request', actor, created[0].id);
      return ctx.json(res, 201, { correction: created[0] });
    }
    if (action === 'shift-swap') {
      if (isUuid(data?.requestId)) {
        const decision = data?.decision;
        const rejection = clean(data?.rejectionReason, 1000);
        if (!['accept','reject'].includes(decision) || (decision === 'reject' && rejection.length < 5)) return ctx.json(res, 400, { error: 'invalid_swap_response' });
        const { rows: updated } = await db().query(
          `UPDATE emp_shift_swap_requests SET target_ack=$3,target_ack_at=NOW(),status=$4,target_rejection_reason=$5,updated_at=NOW()
            WHERE id=$1 AND target_employee_id=$2 AND status IN ('solicitado','pendente_aceite')
            RETURNING id,protocol,requester_employee_id,target_employee_id,status,target_ack_at`,
          [data.requestId, employeeId, decision === 'accept', decision === 'accept' ? 'aceito' : 'rejeitado', rejection || null],
        );
        if (!updated[0]) return ctx.json(res, 404, { error: 'swap_not_found' });
        return ctx.json(res, 200, { swap: updated[0] });
      }
      const targetId = String(data?.targetEmployeeId || '');
      const reason = clean(data?.reason, 1000);
      if (!isUuid(targetId) || targetId === employeeId || reason.length < 10 || !data?.swapDate) return ctx.json(res, 400, { error: 'swap_fields_required' });
      const target = await db().query(`SELECT id FROM hr_employees WHERE id=$1 AND status='ativo' AND unit_id IS NOT DISTINCT FROM (SELECT unit_id FROM hr_employees WHERE id=$2)`, [targetId, employeeId]);
      if (!target.rows[0]) return ctx.json(res, 404, { error: 'eligible_target_not_found' });
      const { rows: created } = await db().query(
        `INSERT INTO emp_shift_swap_requests(protocol,requester_employee_id,target_employee_id,original_shift_id,requested_shift_id,swap_date,reason,status,created_by,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente_aceite',$8,$8)
         RETURNING id,protocol,requester_employee_id,target_employee_id,swap_date,status,created_at`,
        [protocol('TRC'), employeeId, targetId, isUuid(data?.originalShiftId) ? data.originalShiftId : null, isUuid(data?.requestedShiftId) ? data.requestedShiftId : null, data.swapDate, reason, actor],
      );
      await audit('emp_shift_swap_request', actor, created[0].id);
      return ctx.json(res, 201, { swap: created[0] });
    }
    if (action === 'handover') {
      if (isUuid(data?.handoverId)) {
        const decision = data?.decision;
        const rejection = clean(data?.rejectionReason, 1000);
        if (!['accept','reject'].includes(decision) || (decision === 'reject' && rejection.length < 5)) return ctx.json(res, 400, { error: 'invalid_handover_response' });
        const { rows: updated } = await db().query(
          `UPDATE emp_handover_records SET status=$3::text::emp_handover_status,accepted_at=CASE WHEN $3::text='aceito' THEN NOW() ELSE accepted_at END,accepted_by=$4,accepted_by_id=$4,rejection_reason=$5,updated_at=NOW()
            WHERE id=$1 AND to_employee_id=$2 AND status IN ('pendente','em_andamento')
            RETURNING id,protocol,from_employee_id,to_employee_id,status,accepted_at`,
          [data.handoverId, employeeId, decision === 'accept' ? 'aceito' : 'recusado', actor, rejection || null],
        );
        if (!updated[0]) return ctx.json(res, 404, { error: 'handover_not_found' });
        return ctx.json(res, 200, { handover: updated[0] });
      }
      const targetId = String(data?.toEmployeeId || '');
      if (!isUuid(targetId) || targetId === employeeId) return ctx.json(res, 400, { error: 'handover_target_required' });
      const target = await db().query(`SELECT id FROM hr_employees WHERE id=$1 AND status='ativo' AND unit_id IS NOT DISTINCT FROM (SELECT unit_id FROM hr_employees WHERE id=$2)`, [targetId, employeeId]);
      if (!target.rows[0]) return ctx.json(res, 404, { error: 'eligible_target_not_found' });
      const { rows: created } = await db().query(
        `INSERT INTO emp_handover_records(protocol,from_employee_id,to_employee_id,shift_assignment_id,pending_tasks,keys_handover,equipment_handover,occurrences_summary,status,is_private,created_by,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendente',TRUE,$9,$9)
         RETURNING id,protocol,from_employee_id,to_employee_id,status,handover_date`,
        [protocol('PSG'), employeeId, targetId, isUuid(data?.shiftAssignmentId) ? data.shiftAssignmentId : null, clean(data?.pendingTasks, 3000) || null, JSON.stringify(data?.keys || []), JSON.stringify(data?.equipment || []), clean(data?.occurrencesSummary, 3000) || null, actor],
      );
      await audit('emp_handover_create', actor, created[0].id);
      return ctx.json(res, 201, { handover: created[0] });
    }
    if (action === 'course-proof') {
      if (!isUuid(data?.enrollmentId)) return ctx.json(res, 400, { error: 'invalid_enrollment_id' });
      const enrollment = await db().query('SELECT id FROM emp_course_enrollments WHERE id=$1 AND employee_id=$2', [data.enrollmentId, employeeId]);
      if (!enrollment.rows[0]) return ctx.json(res, 404, { error: 'enrollment_not_found' });
      try {
        const document = await storeDocument({ employeeId, identityId: actor, uploaderKind: 'employee', data: { ...data, documentKind: 'course_proof', category: 'treinamento' }, sourceAuthorized: false });
        const privateFile = await db().query('SELECT storage_key FROM employee_private_documents WHERE id=$1 AND employee_id=$2', [document.id, employeeId]);
        const proofType = ['certificado','comprovante','declaracao','outro'].includes(data?.proofType) ? data.proofType : 'certificado';
        const { rows: proof } = await db().query(
          `INSERT INTO emp_course_proofs(enrollment_id,employee_id,file_name,file_url,storage_key,proof_type,status,expiry_date,created_by,created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,'em_analise',$7,$8,$8)
           RETURNING id,enrollment_id,employee_id,file_name,proof_type,status,uploaded_at`,
          [data.enrollmentId, employeeId, document.original_filename, `private://employee-document/${document.id}`, privateFile.rows[0].storage_key, proofType, data?.expiryDate || null, actor],
        );
        return ctx.json(res, 201, { proof: proof[0], document });
      } catch (error) {
        return ctx.json(res, error.status || error.httpStatus || 503, { error: error.message || 'course_proof_unavailable' });
      }
    }
    if (action === 'occurrence') {
      const title = clean(data?.title, 200), description = clean(data?.description, 4000);
      if (title.length < 5 || description.length < 10) return ctx.json(res, 400, { error: 'occurrence_fields_required' });
      const { rows: created } = await db().query(
        `INSERT INTO emp_occurrences(protocol,employee_id,category,severity,title,description,occurred_at,location,is_personal_data_restricted,reported_by,reported_by_id,created_by,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,NOW()),$8,TRUE,$9,$9,$9,$9) RETURNING id,protocol,employee_id,status`,
        [protocol('OCO'), employeeId, ['seguranca','operacional','manutencao','limpeza','comportamental','cliente','equipamento','outro'].includes(data?.category) ? data.category : 'operacional', ['baixa','media','alta','critica'].includes(data?.severity) ? data.severity : 'media', title, description, data?.occurredAt || null, clean(data?.location, 200) || null, actor],
      );
      await audit('emp_occurrence_create', actor, created[0].id);
      return ctx.json(res, 201, { occurrence: created[0] });
    }
    if (action === 'procedure-ack') {
      if (!isUuid(data?.procedureId)) return ctx.json(res, 400, { error: 'invalid_procedure_id' });
      const { rows: available } = await db().query(
        `SELECT p.id FROM emp_post_procedures p WHERE p.id=$1 AND p.status='publicado' AND p.is_active=TRUE AND (p.post_location='Geral' OR p.post_location IN (SELECT location FROM emp_shift_assignments WHERE employee_id=$2))`,
        [data.procedureId, employeeId],
      );
      if (!available[0]) return ctx.json(res, 404, { error: 'procedure_not_found' });
      const { rows: ack } = await db().query(
        `INSERT INTO emp_procedure_acknowledgments(procedure_id,employee_id,acknowledged_by,notes)
         VALUES ($1,$2,$3,$4) ON CONFLICT(procedure_id,employee_id) DO UPDATE SET acknowledged_at=NOW(),acknowledged_by=$3 RETURNING *`,
        [data.procedureId, employeeId, actor, clean(data?.notes, 500) || null],
      );
      await audit('emp_procedure_ack', actor, data.procedureId);
      return ctx.json(res, 200, { acknowledgment: ack[0] });
    }
    if (action === 'request') {
      const requestType = SELF_REQUEST_TYPES.has(data?.requestType) ? data.requestType : 'outro';
      const title = clean(data?.title, 200), description = clean(data?.description, 4000);
      if (title.length < 5 || description.length < 10) return ctx.json(res, 400, { error: 'request_fields_required' });
      const { rows: created } = await db().query(
        `INSERT INTO emp_self_requests(protocol,employee_id,request_type,category,title,description,is_restricted,created_by,created_by_id)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$7) RETURNING id,protocol,employee_id,request_type,status`,
        [protocol('SOL'), employeeId, requestType, title, description, ['afastamento','reembolso'].includes(requestType), actor],
      );
      await audit('emp_self_request_create', actor, created[0].id);
      return ctx.json(res, 201, { request: created[0] });
    }
    if (action === 'uniform') {
      const requestType = ['entrega','substituicao','devolucao','outro'].includes(data?.requestType) ? data.requestType : 'outro';
      if (clean(data?.reason).length < 10) return ctx.json(res, 400, { error: 'reason_required' });
      const { rows: created } = await db().query(
        `INSERT INTO emp_uniform_self_requests(protocol,employee_id,uniform_id,request_type,reason,size,quantity,created_by,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id,protocol,employee_id,status`,
        [protocol('UNI'), employeeId, isUuid(data?.uniformId) ? data.uniformId : null, requestType, clean(data.reason, 1000), clean(data?.size, 50) || null, Math.min(100, Math.max(1, Number(data?.quantity || 1))), actor],
      );
      await audit('emp_uniform_self_request', actor, created[0].id);
      return ctx.json(res, 201, { request: created[0] });
    }
    if (action === 'uniform-receipt') {
      if (!isUuid(data?.deliveryId)) return ctx.json(res, 400, { error: 'invalid_delivery_id' });
      const visible = await db().query(`SELECT id FROM hr_uniform_deliveries WHERE id=$1 AND employee_id=$2`, [data.deliveryId, employeeId]);
      if (!visible.rows[0]) return ctx.json(res, 404, { error: 'uniform_delivery_not_found' });
      const { rows: confirmed } = await db().query(
        `INSERT INTO emp_uniform_receipt_confirmations(delivery_id,employee_id,receipt_signed,signed_at,notes,created_by,created_by_id)
         VALUES ($1,$2,TRUE,NOW(),$3,$4,$4)
         ON CONFLICT(delivery_id,employee_id) DO UPDATE SET receipt_signed=TRUE,signed_at=COALESCE(emp_uniform_receipt_confirmations.signed_at,NOW()),notes=COALESCE(EXCLUDED.notes,emp_uniform_receipt_confirmations.notes),created_by=EXCLUDED.created_by,created_by_id=EXCLUDED.created_by_id
         RETURNING id,delivery_id,employee_id,receipt_signed,signed_at`,
        [data.deliveryId, employeeId, clean(data?.notes, 500) || 'Recebimento confirmado pelo titular no portal', actor],
      );
      await audit('emp_uniform_receipt_confirm', actor, data.deliveryId);
      return ctx.json(res, 200, { confirmation: confirmed[0], legalNotice: 'Confirmação operacional de recebimento; não é assinatura qualificada.' });
    }
    if (action === 'communication-read') {
      if (!isUuid(data?.communicationId)) return ctx.json(res, 400, { error: 'invalid_communication_id' });
      const visible = await db().query(
        `SELECT c.id FROM emp_communications c JOIN hr_employees e ON e.id=$2 WHERE c.id=$1 AND c.status='publicado' AND c.is_active=TRUE AND (c.target_type='todos' OR c.target_employee_id=$2 OR (c.target_type='cargo' AND c.target_group=e.cargo) OR (c.target_type='lotacao' AND c.target_group=e.lotacao))`,
        [data.communicationId, employeeId],
      );
      if (!visible.rows[0]) return ctx.json(res, 404, { error: 'communication_not_found' });
      const { rows: marked } = await db().query(
        `INSERT INTO emp_communication_reads(communication_id,employee_id,confirmed,confirmed_at)
         VALUES ($1,$2,TRUE,NOW()) ON CONFLICT(communication_id,employee_id) DO UPDATE SET confirmed=TRUE,confirmed_at=NOW() RETURNING *`,
        [data.communicationId, employeeId],
      );
      return ctx.json(res, 200, { read: marked[0] });
    }
    if (action === 'hr-ticket') {
      const title = clean(data?.title, 200), description = clean(data?.description, 4000);
      if (title.length < 5 || description.length < 10) return ctx.json(res, 400, { error: 'ticket_fields_required' });
      const categories = ['folha','ponto','beneficios','ferias','afastamento','documentos','uniforme','treinamento','saude','ti','operacional','rh','outro'];
      const { rows: created } = await db().query(
        `INSERT INTO emp_hr_tickets(protocol,employee_id,category,priority,title,description,is_private,created_by,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$7) RETURNING id,protocol,employee_id,status`,
        [protocol('RHT'), employeeId, categories.includes(data?.category) ? data.category : 'rh', ['baixa','media','alta','critica'].includes(data?.priority) ? data.priority : 'media', title, description, actor],
      );
      await db().query(`INSERT INTO emp_hr_messages(ticket_id,sender_id,sender_name,message,is_private,is_internal) VALUES ($1,$2,$3,$4,TRUE,FALSE)`, [created[0].id, actor, session.displayName, description]);
      await audit('emp_hr_ticket_create', actor, created[0].id);
      return ctx.json(res, 201, { ticket: created[0] });
    }
    if (action === 'hr-message') {
      if (!isUuid(data?.ticketId) || !clean(data?.message, 4000)) return ctx.json(res, 400, { error: 'message_fields_required' });
      const { rows: owned } = await db().query('SELECT id FROM emp_hr_tickets WHERE id=$1 AND employee_id=$2', [data.ticketId, employeeId]);
      if (!owned[0]) return ctx.json(res, 404, { error: 'ticket_not_found' });
      const { rows: created } = await db().query(`INSERT INTO emp_hr_messages(ticket_id,sender_id,sender_name,message,is_private,is_internal) VALUES ($1,$2,$3,$4,TRUE,FALSE) RETURNING *`, [data.ticketId, actor, session.displayName, clean(data.message, 4000)]);
      return ctx.json(res, 201, { message: created[0] });
    }
    if (action === 'confidential') {
      if (data?.anonymous === true) return ctx.json(res, 409, { error: 'anonymous_not_supported', note: 'O canal preserva sigilo, mas anonimato não está habilitado nesta instalação.' });
      const title = clean(data?.title, 200), description = clean(data?.description, 4000);
      if (title.length < 5 || description.length < 20) return ctx.json(res, 400, { error: 'report_fields_required' });
      const categories = ['assedio','discriminacao','fraude','seguranca','etica','comportamento','outro'];
      const { rows: created } = await db().query(
        `INSERT INTO emp_confidential_reports(protocol,reporter_employee_id,is_anonymous,category,title,description,is_anonymous_supported,anonymous_supported_note,is_private,created_by,created_by_id)
         VALUES ($1,$2,FALSE,$3,$4,$5,FALSE,'Anonimato não habilitado; identidade restrita aos responsáveis autorizados',TRUE,$6,$6)
         RETURNING id,protocol,category,status,is_anonymous,is_anonymous_supported`,
        [protocol('CNF'), employeeId, categories.includes(data?.category) ? data.category : 'etica', title, description, actor],
      );
      await audit('emp_confidential_report', actor, created[0].id);
      return ctx.json(res, 201, { report: created[0] });
    }
    if (action === 'accessibility') {
      const fontSize = ['pequeno','medio','grande','extra_grande'].includes(data?.fontSize) ? data.fontSize : 'medio';
      const { rows: saved } = await db().query(
        `INSERT INTO emp_accessibility_preferences(employee_id,prefers_keyboard,prefers_screen_reader,prefers_simple_language,prefers_low_data,font_size,high_contrast,reduced_motion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(employee_id) DO UPDATE SET prefers_keyboard=$2,prefers_screen_reader=$3,prefers_simple_language=$4,prefers_low_data=$5,font_size=$6,high_contrast=$7,reduced_motion=$8,updated_at=NOW()
         RETURNING *`,
        [employeeId, Boolean(data?.prefersKeyboard), Boolean(data?.prefersScreenReader), data?.prefersSimpleLanguage !== false, Boolean(data?.prefersLowData), fontSize, Boolean(data?.highContrast), Boolean(data?.reducedMotion)],
      );
      return ctx.json(res, 200, { preference: saved[0] });
    }
    return ctx.json(res, 404, { error: 'action_not_found' });
  }

  async function storeDocument({ employeeId, identityId, uploaderKind, data, sourceAuthorized = false }) {
    const content = Buffer.from(String(data?.contentBase64 || ''), 'base64');
    if (!content.length || content.length > MAX_PRIVATE_FILE_BYTES) throw Object.assign(new Error('invalid_file_size'), { status: 400 });
    const contentType = clean(data?.contentType, 120).toLowerCase();
    if (!SAFE_CONTENT_TYPES.has(contentType)) throw Object.assign(new Error('invalid_content_type'), { status: 400 });
    const title = clean(data?.title, 200), category = clean(data?.category, 100);
    if (title.length < 3 || category.length < 2) throw Object.assign(new Error('document_fields_required'), { status: 400 });
    const documentKind = ['submission','payroll','income_report','course_proof','request_attachment','general'].includes(data?.documentKind) ? data.documentKind : 'submission';
    const competence = data?.competence ? clean(data.competence, 7) : null;
    if (competence && !/^\d{4}-\d{2}$/.test(competence)) throw Object.assign(new Error('invalid_competence'), { status: 400 });
    const storageKey = randomBytes(24).toString('hex');
    const digest = sha256(content);
    await mkdir(ctx.employeeDocsDir, { recursive: true });
    const diskPath = path.join(ctx.employeeDocsDir, storageKey);
    await writeFile(diskPath, content, { flag: 'wx', mode: 0o600 });
    try {
      const { rows: versionRows } = await db().query(
        `SELECT COALESCE(MAX(version),0)+1 AS version FROM employee_private_documents WHERE employee_id=$1 AND document_kind=$2 AND category=$3 AND competence IS NOT DISTINCT FROM $4`,
        [employeeId, documentKind, category, competence],
      );
      const { rows: created } = await db().query(
        `INSERT INTO employee_private_documents(employee_id,document_kind,category,title,competence,version,status,source_label,source_authorized,storage_key,content_sha256,original_filename,content_type,size_bytes,uploaded_by_kind,uploaded_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id,employee_id,document_kind,category,title,competence,version,status,source_authorized,original_filename,content_type,size_bytes,created_at`,
        [employeeId, documentKind, category, title, competence, versionRows[0].version, clean(data?.sourceLabel, 200) || null, sourceAuthorized, storageKey, digest, safeFilename(data?.filename), contentType, content.length, uploaderKind, identityId],
      );
      await db().query(`INSERT INTO employee_private_document_access(document_id,employee_id,actor_identity_id,actor_kind,action) VALUES ($1,$2,$3,$4,'upload')`, [created[0].id, employeeId, identityId, uploaderKind]);
      return created[0];
    } catch (error) {
      await unlink(diskPath).catch(() => {});
      throw error;
    }
  }

  async function handleEmployeeDocuments(req, res) {
    const session = await employee(req, res); if (!session) return;
    if (req.method === 'GET') {
      const { rows: documents } = await db().query(`SELECT id,document_kind,category,title,competence,version,status,source_label,source_authorized,original_filename,content_type,size_bytes,created_at,published_at FROM employee_private_documents WHERE employee_id=$1 AND (uploaded_by_kind='employee' OR status='published') ORDER BY created_at DESC`, [session.employeeId]);
      return ctx.json(res, 200, { documents, scope: 'own' }, { 'Cache-Control': 'private, no-store' });
    }
    if (req.method !== 'POST') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    try {
      const data = await body(req, 7 * 1024 * 1024);
      // O employeeId eventualmente enviado é ignorado de propósito.
      const document = await storeDocument({ employeeId: session.employeeId, identityId: session.identityId, uploaderKind: 'employee', data, sourceAuthorized: false });
      return ctx.json(res, 201, { document });
    } catch (error) {
      return ctx.json(res, error.status || error.httpStatus || 503, { error: error.message || 'document_upload_unavailable' });
    }
  }

  async function sendPrivateDocument(req, res, documentId, staffMode = false) {
    let actor;
    let document;
    if (staffMode) {
      const staff = await ctx.readStaffSession(req);
      if (!staff) return ctx.json(res, 401, { error: 'admin_session_required' });
      const { rows: found } = await db().query('SELECT * FROM employee_private_documents WHERE id=$1', [documentId]);
      document = found[0];
      if (!document) return ctx.json(res, 404, { error: 'document_not_found' });
      const allowed = await hr(req, res, 'employees.read', document.employee_id); if (!allowed) return;
      actor = { identityId: staff.identityId, kind: 'staff', employeeId: document.employee_id };
    } else {
      const session = await employee(req, res); if (!session) return;
      const { rows: found } = await db().query(`SELECT * FROM employee_private_documents WHERE id=$1 AND employee_id=$2 AND (uploaded_by_kind='employee' OR status='published')`, [documentId, session.employeeId]);
      document = found[0];
      if (!document) return ctx.json(res, 404, { error: 'document_not_found' });
      actor = { identityId: session.identityId, kind: 'employee', employeeId: session.employeeId };
    }
    if (!/^[0-9a-f]{48}$/.test(document.storage_key)) return ctx.json(res, 409, { error: 'document_integrity_failed' });
    try {
      const bytes = await readFile(path.join(ctx.employeeDocsDir, document.storage_key));
      if (bytes.length !== document.size_bytes || sha256(bytes) !== document.content_sha256) {
        await db().query(`INSERT INTO employee_private_document_access(document_id,employee_id,actor_identity_id,actor_kind,action) VALUES ($1,$2,$3,$4,'integrity_denied')`, [document.id, actor.employeeId, actor.identityId, actor.kind]);
        return ctx.json(res, 409, { error: 'document_integrity_failed' });
      }
      await db().query(`INSERT INTO employee_private_document_access(document_id,employee_id,actor_identity_id,actor_kind,action) VALUES ($1,$2,$3,$4,'download')`, [document.id, actor.employeeId, actor.identityId, actor.kind]);
      res.writeHead(200, {
        'Content-Type': document.content_type,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.original_filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(bytes);
    } catch (error) {
      if (error?.code === 'ENOENT') return ctx.json(res, 409, { error: 'document_integrity_failed' });
      throw error;
    }
  }

  async function handleHrDocuments(req, res) {
    if (req.method === 'GET') {
      const staff = await hr(req, res, 'employees.read'); if (!staff) return;
      // Listagem ampla só é permitida por concessão organization/global.
      const org = await hasPermission(db(), { identityId: staff.identityId, permission: 'employees.read' });
      if (!org) return ctx.json(res, 403, { error: 'organization_scope_required_for_list' });
      const { rows: documents } = await db().query(`SELECT d.id,d.employee_id,e.display_name AS employee_name,d.document_kind,d.category,d.title,d.competence,d.version,d.status,d.source_label,d.source_authorized,d.original_filename,d.content_type,d.size_bytes,d.created_at,d.published_at FROM employee_private_documents d JOIN hr_employees e ON e.id=d.employee_id ORDER BY d.created_at DESC LIMIT 200`);
      return ctx.json(res, 200, { documents });
    }
    if (req.method === 'POST') {
      if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
      let data;
      try { data = await body(req, 7 * 1024 * 1024); } catch (error) { return ctx.json(res, error.httpStatus || 400, { error: 'invalid_request' }); }
      if (!isUuid(data?.employeeId)) return ctx.json(res, 400, { error: 'invalid_employee_id' });
      const staff = await hr(req, res, 'employees.write', data.employeeId); if (!staff) return;
      if (['payroll','income_report'].includes(data.documentKind)) {
        const compensation = await hasPermission(db(), { identityId: staff.identityId, permission: 'employees.compensation.write', resourceOwnerIdentityId: staff.employeeScope?.identity_id, unitId: staff.employeeScope?.unit_id, contractId: staff.employeeScope?.contract_id });
        if (!compensation) return ctx.json(res, 403, { error: 'compensation_permission_required' });
      }
      try {
        const document = await storeDocument({ employeeId: data.employeeId, identityId: staff.identityId, uploaderKind: 'staff', data, sourceAuthorized: data.sourceAuthorized === true });
        return ctx.json(res, 201, { document });
      } catch (error) { return ctx.json(res, error.status || 503, { error: error.message || 'document_upload_unavailable' }); }
    }
    if (req.method === 'PATCH') {
      if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
      const data = await body(req);
      if (!isUuid(data?.id)) return ctx.json(res, 400, { error: 'invalid_document_id' });
      const { rows: current } = await db().query('SELECT * FROM employee_private_documents WHERE id=$1', [data.id]);
      if (!current[0]) return ctx.json(res, 404, { error: 'document_not_found' });
      const staff = await hr(req, res, 'employees.write', current[0].employee_id); if (!staff) return;
      if (['payroll','income_report'].includes(current[0].document_kind)) {
        const compensation = await hasPermission(db(), { identityId: staff.identityId, permission: 'employees.compensation.write', resourceOwnerIdentityId: staff.employeeScope?.identity_id, unitId: staff.employeeScope?.unit_id, contractId: staff.employeeScope?.contract_id });
        if (!compensation) return ctx.json(res, 403, { error: 'compensation_permission_required' });
      }
      const status = data?.status;
      if (!['under_review','approved','published','rejected','superseded'].includes(status)) return ctx.json(res, 400, { error: 'invalid_status' });
      if (status === 'published' && !current[0].source_authorized) return ctx.json(res, 409, { error: 'authorized_source_required' });
      if (status === 'rejected' && clean(data?.rejectionReason).length < 5) return ctx.json(res, 400, { error: 'rejection_reason_required' });
      const { rows: updated } = await db().query(
        `UPDATE employee_private_documents SET status=$2,reviewed_by=$3,reviewed_at=NOW(),published_by=CASE WHEN $2='published' THEN $3 ELSE published_by END,published_at=CASE WHEN $2='published' THEN NOW() ELSE published_at END,rejection_reason=CASE WHEN $2='rejected' THEN $4 ELSE rejection_reason END WHERE id=$1 RETURNING id,employee_id,status,published_at,rejection_reason`,
        [data.id, status, staff.identityId, clean(data?.rejectionReason, 1000) || null],
      );
      await db().query(`INSERT INTO employee_private_document_access(document_id,employee_id,actor_identity_id,actor_kind,action) VALUES ($1,$2,$3,'staff',$4)`, [data.id, current[0].employee_id, staff.identityId, status === 'published' ? 'publish' : 'review']);
      return ctx.json(res, 200, { document: updated[0] });
    }
    return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, PATCH' });
  }

  async function handleOffline(req, res) {
    const session = await employee(req, res); if (!session) return;
    if (req.method === 'GET') {
      const { rows: queued } = await db().query(`SELECT id,task_type,idempotency_key,device_timestamp,server_received_at,status,conflict_details,synced_at FROM emp_offline_queue WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 100`, [session.employeeId]);
      return ctx.json(res, 200, { queue: queued, scope: 'own' });
    }
    if (req.method !== 'POST') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const data = await body(req);
    const taskType = data?.taskType;
    const key = clean(data?.idempotencyKey, 200);
    const payload = data?.payload;
    const deviceTime = new Date(data?.deviceTimestamp);
    if (!OFFLINE_TYPES.has(taskType) || key.length < 10 || !payload || typeof payload !== 'object' || Number.isNaN(deviceTime.getTime())) return ctx.json(res, 400, { error: 'invalid_offline_task' });
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT * FROM emp_offline_queue WHERE idempotency_key=$1 FOR UPDATE', [key]);
      if (existing.rows[0]) {
        if (existing.rows[0].employee_id !== session.employeeId) { await client.query('ROLLBACK'); return ctx.json(res, 409, { error: 'idempotency_key_unavailable' }); }
        if (canonicalJson(existing.rows[0].payload) !== canonicalJson(payload)) {
          await client.query(`UPDATE emp_offline_queue SET status='conflito',conflict_details=$2 WHERE id=$1`, [existing.rows[0].id, JSON.stringify({ type: 'duplicate', message: 'Mesma chave com conteúdo diferente' })]);
          await client.query(`INSERT INTO emp_offline_conflicts(queue_id,conflict_type,server_data,device_data) VALUES ($1,'duplicate',$2,$3)`, [existing.rows[0].id, existing.rows[0].payload, payload]);
          await client.query('COMMIT');
          return ctx.json(res, 409, { error: 'idempotency_conflict', queueId: existing.rows[0].id });
        }
        await client.query('COMMIT');
        return ctx.json(res, 200, { queue: existing.rows[0], deduplicated: true });
      }
      const queueId = randomUUID();
      const { rows: inserted } = await client.query(
        `INSERT INTO emp_offline_queue(id,employee_id,task_type,payload,idempotency_key,device_timestamp,device_timezone,server_received_at,status,synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),'sincronizado',NOW()) RETURNING *`,
        [queueId, session.employeeId, taskType, JSON.stringify(payload), key, deviceTime.toISOString(), clean(data?.deviceTimezone, 100) || 'America/Sao_Paulo'],
      );
      // O recebimento é atômico com o efeito mínimo aprovado. Nenhum timestamp
      // do dispositivo substitui server_received_at.
      if (taskType === 'absence_notice') {
        await client.query(`INSERT INTO emp_absence_notices(protocol,employee_id,notice_type,shift_date,reason_code,reason_details,created_by,created_by_id) VALUES ($1,$2,'ausencia',$3,$4,$5,$6,$6)`, [protocol('ABS'), session.employeeId, payload.shiftDate || null, ABSENCE_REASONS.has(payload.reasonCode) ? payload.reasonCode : 'outro', clean(payload.details, 1000) || null, session.identityId]);
      } else if (taskType === 'occurrence') {
        await client.query(`INSERT INTO emp_occurrences(protocol,employee_id,category,severity,title,description,occurred_at,location,reported_by,reported_by_id,created_by,created_by_id) VALUES ($1,$2,'operacional','media',$3,$4,$5,$6,$7,$7,$7,$7)`, [protocol('OCO'), session.employeeId, clean(payload.title, 200), clean(payload.description, 4000), payload.occurredAt || deviceTime.toISOString(), clean(payload.location, 200) || null, session.identityId]);
      } else if (taskType === 'procedure_ack') {
        const procedureId = payload.procedureId;
        if (!isUuid(procedureId)) throw new Error('invalid_procedure_id');
        const visible = await client.query(`SELECT id FROM emp_post_procedures WHERE id=$1 AND status='publicado' AND is_active=TRUE`, [procedureId]);
        if (!visible.rows[0]) throw new Error('procedure_not_found');
        await client.query(`INSERT INTO emp_procedure_acknowledgments(procedure_id,employee_id,acknowledged_by) VALUES ($1,$2,$3) ON CONFLICT(procedure_id,employee_id) DO NOTHING`, [procedureId, session.employeeId, session.identityId]);
      }
      await audit('emp_offline_sync', session.identityId, queueId, { taskType, deviceTimestamp: deviceTime.toISOString() }, client);
      await client.query('COMMIT');
      return ctx.json(res, 201, { queue: inserted[0], deduplicated: false, confirmation: 'received_by_server' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 409, { error: clean(error?.message, 100) || 'offline_sync_failed' });
    } finally { client.release(); }
  }

  async function handleHrOverview(req, res) {
    if (req.method !== 'GET') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    const staff = await hr(req, res, 'employees.read'); if (!staff) return;
    const { rows: grants } = await db().query(`SELECT scope_type,scope_id FROM auth_permissions WHERE identity_id=$1 AND permission='employees.read' AND revoked_at IS NULL`, [staff.identityId]);
    const organization = grants.some(g => ['global','organization'].includes(g.scope_type));
    const unitIds = grants.filter(g => g.scope_type === 'unit').map(g => g.scope_id);
    const contractIds = grants.filter(g => g.scope_type === 'contract').map(g => g.scope_id);
    const own = grants.some(g => g.scope_type === 'own');
    const { rows: employees } = await db().query(
      `SELECT id,matricula,display_name,status,employment_type,cargo,empregador,filial,lotacao,gestor_name,contact_email,admission_date,unit_id,contract_id,identity_id
         FROM hr_employees
        WHERE $1::boolean
           OR (cardinality($2::uuid[])>0 AND unit_id=ANY($2::uuid[]))
           OR (cardinality($3::uuid[])>0 AND contract_id=ANY($3::uuid[]))
           OR ($4::boolean AND identity_id=$5)
        ORDER BY display_name LIMIT 200`,
      [organization, unitIds, contractIds, own, staff.identityId],
    );
    const metrics = await db().query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='ativo')::int AS active,COUNT(*) FILTER(WHERE status IN ('suspenso','afastado'))::int AS unavailable,COUNT(*) FILTER(WHERE status='em_admissao')::int AS admissions FROM hr_employees WHERE id=ANY($1::uuid[])`, [employees.map(e => e.id)]);
    return ctx.json(res, 200, { employees, indicators: metrics.rows[0], formula: 'Contagem dos cadastros alcançados pelas concessões ativas; período: estado atual.', scopes: grants });
  }

  async function handle(req, res, url) {
    try {
      if (url.pathname === '/api/employee/session') return handleSession(req, res);
      if (url.pathname === '/api/employee/session/password') return handlePassword(req, res);
      if (url.pathname === '/api/employee/me') return handleMe(req, res);
      if (url.pathname === '/api/employee/home') return handleHome(req, res);
      if (url.pathname === '/api/employee/profile-updates') return handleProfileUpdate(req, res);
      if (url.pathname === '/api/employee/documents') return handleEmployeeDocuments(req, res);
      if (url.pathname === '/api/employee/offline') return handleOffline(req, res);
      const schedule = url.pathname.match(/^\/api\/employee\/schedule\/([0-9a-f-]{36})\/ack$/i);
      if (schedule) return handleScheduleAck(req, res, schedule[1]);
      const action = url.pathname.match(/^\/api\/employee\/actions\/([a-z-]+)$/);
      if (action) return handleAction(req, res, action[1]);
      const download = url.pathname.match(/^\/api\/employee\/documents\/([0-9a-f-]{36})\/download$/i);
      if (download) return sendPrivateDocument(req, res, download[1], false);
      const access = url.pathname.match(/^\/api\/admin\/hr\/employees\/([0-9a-f-]{36})\/access$/i);
      if (access) return handleProvisionAccess(req, res, access[1]);
      if (url.pathname === '/api/admin/hr/l03/overview') return handleHrOverview(req, res);
      if (url.pathname === '/api/admin/hr/l03/documents') return handleHrDocuments(req, res);
      const hrDownload = url.pathname.match(/^\/api\/admin\/hr\/l03\/documents\/([0-9a-f-]{36})\/download$/i);
      if (hrDownload) return sendPrivateDocument(req, res, hrDownload[1], true);
      return false;
    } catch (error) {
      console.error('Employee API error.', error?.message);
      return ctx.json(res, 500, { error: 'employee_api_error' });
    }
  }

  return { handle };
}
