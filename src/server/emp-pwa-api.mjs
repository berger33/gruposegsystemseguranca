import { createHash } from 'node:crypto';

/**
 * EMP-18/19 — PWA instalável, fila offline limitada, FAQ interna acessível
 * EMP-18: PWA config, offline queue com idempotência, conflito explícito, device_timestamp vs server_received_at separados, não cachear médicos/salariais por padrão
 * EMP-19: FAQ interna linguagem simples baixo consumo, acessibilidade teclado/leitor, logs acesso, preferências acessibilidade
 */

function sha256Hex(str) {
  return createHash('sha256').update(String(str)).digest('hex');
}

function validateUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function createEmpPwaApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

  function sendJson(res, status, data) {
    res.writeHead(status, jsonHeaders);
    res.end(JSON.stringify(data));
  }

  async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return null; }
  }

  function clientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim().slice(0,100);
    return req.socket?.remoteAddress || 'unknown';
  }

  // ---- PWA Configs ----
  async function handlePwaConfigs(req, res) {
    const session = await requireSession(req);
    if (!session) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM emp_pwa_configs ORDER BY is_active DESC, version DESC LIMIT 20`);
        return sendJson(res, 200, { configs: rows });
      } catch (e) {
        console.error('pwaConfigs GET', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'same_origin_required' });
      if (!requireRole(session, ['admin','ti'])) return sendJson(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid_json' });
      const name = String(body.name || '').trim();
      const short_name = String(body.short_name || body.shortName || '').trim();
      const description = String(body.description || '').trim();
      if (name.length < 3 || name.length > 100) return sendJson(res, 400, { error: 'invalid_name', detail: '3-100' });
      if (short_name.length < 2 || short_name.length > 20) return sendJson(res, 400, { error: 'invalid_short_name' });
      if (description.length < 10 || description.length > 500) return sendJson(res, 400, { error: 'invalid_description', detail: '10-500' });
      const theme_color = String(body.theme_color || body.themeColor || '#0f172a').trim();
      const background_color = String(body.background_color || body.backgroundColor || '#ffffff').trim();
      if (!/^#[0-9a-f]{6}$/i.test(theme_color)) return sendJson(res, 400, { error: 'invalid_theme_color' });
      if (!/^#[0-9a-f]{6}$/i.test(background_color)) return sendJson(res, 400, { error: 'invalid_background_color' });
      const display = body.display || 'standalone';
      if (!['standalone','minimal-ui','browser','fullscreen'].includes(display)) return sendJson(res, 400, { error: 'invalid_display' });
      const scope = String(body.scope || '/').trim().slice(0,200) || '/';
      const start_url = String(body.start_url || body.startUrl || '/').trim().slice(0,500) || '/';
      const approved = Array.isArray(body.approved_offline_tasks || body.approvedOfflineTasks) ? body.approved_offline_tasks : ['occurrence','handover','absence_notice','procedure_ack'];
      const max_queue = Number(body.max_queue_size || body.maxQueueSize || 50);
      if (!Number.isInteger(max_queue) || max_queue < 1 || max_queue > 200) return sendJson(res, 400, { error: 'invalid_max_queue_size' });
      const max_retries = Number(body.max_retries || body.maxRetries || 5);
      if (!Number.isInteger(max_retries) || max_retries < 1 || max_retries > 20) return sendJson(res, 400, { error: 'invalid_max_retries' });
      const do_not_cache = Array.isArray(body.do_not_cache_patterns || body.doNotCachePatterns) ? body.do_not_cache_patterns : ['/api/hr/payroll-documents','/api/hr/own-doc-access-logs','medical','salary','holerite'];
      const icons = body.icons || [];
      const is_active = body.is_active !== undefined ? !!body.is_active : true;
      try {
        const verRes = await pool.query(`SELECT COALESCE(MAX(version),0)+1 AS v FROM emp_pwa_configs`);
        const version = verRes.rows[0].v;
        const { rows } = await pool.query(
          `INSERT INTO emp_pwa_configs (name, short_name, description, theme_color, background_color, display, scope, start_url, icons, approved_offline_tasks, max_queue_size, max_retries, do_not_cache_patterns, is_active, version, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [name, short_name, description, theme_color, background_color, display, scope, start_url, JSON.stringify(icons), approved, max_queue, max_retries, do_not_cache, is_active, version, session.role]
        );
        try { await auditLog({ action: 'emp_pwa_config_create', actor: session.role, target: rows[0].id, meta: { name } }); } catch {}
        return sendJson(res, 201, { config: rows[0] });
      } catch (e) {
        console.error('pwaConfigs POST', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'same_origin_required' });
      if (!requireRole(session, ['admin','ti'])) return sendJson(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid_json' });
      const id = body.id;
      if (!validateUuid(id)) return sendJson(res, 400, { error: 'invalid_id' });
      const fields = [];
      const vals = [];
      let idx = 1;
      if (body.name !== undefined) { fields.push(`name=$${idx++}`); vals.push(String(body.name).trim()); }
      if (body.short_name !== undefined || body.shortName !== undefined) { fields.push(`short_name=$${idx++}`); vals.push(String(body.short_name || body.shortName).trim()); }
      if (body.description !== undefined) { fields.push(`description=$${idx++}`); vals.push(String(body.description).trim()); }
      if (body.is_active !== undefined) { fields.push(`is_active=$${idx++}`); vals.push(!!body.is_active); }
      if (body.approved_offline_tasks !== undefined || body.approvedOfflineTasks !== undefined) { fields.push(`approved_offline_tasks=$${idx++}`); vals.push(body.approved_offline_tasks || body.approvedOfflineTasks); }
      if (body.max_queue_size !== undefined || body.maxQueueSize !== undefined) { fields.push(`max_queue_size=$${idx++}`); vals.push(Number(body.max_queue_size || body.maxQueueSize)); }
      if (body.do_not_cache_patterns !== undefined || body.doNotCachePatterns !== undefined) { fields.push(`do_not_cache_patterns=$${idx++}`); vals.push(body.do_not_cache_patterns || body.doNotCachePatterns); }
      if (fields.length === 0) return sendJson(res, 400, { error: 'no_fields' });
      vals.push(id);
      try {
        const { rows } = await pool.query(`UPDATE emp_pwa_configs SET ${fields.join(', ')}, updated_by=$${idx+1}, updated_at=NOW() WHERE id=$${idx} RETURNING *`, [...vals, session.role]);
        if (!rows[0]) return sendJson(res, 404, { error: 'not_found' });
        try { await auditLog({ action: 'emp_pwa_config_update', actor: session.role, target: id, meta: { fields } }); } catch {}
        return sendJson(res, 200, { config: rows[0] });
      } catch (e) {
        console.error('pwaConfigs PATCH', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  // ---- Manifest (public, no auth required for PWA install) ----
  async function handleManifest(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    try {
      const { rows } = await pool.query(`SELECT * FROM emp_pwa_configs WHERE is_active=true ORDER BY version DESC LIMIT 1`);
      const cfg = rows[0] || {
        name: 'Grupo SEG System - Portal Funcionário',
        short_name: 'SEG Func',
        description: 'Portal do funcionário Grupo SEG System',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [{ src: '/brand/grupo-seg-system-original.jpg', sizes: '345x345', type: 'image/jpeg' }],
      };
      const manifest = {
        name: cfg.name,
        short_name: cfg.short_name,
        description: cfg.description,
        theme_color: cfg.theme_color,
        background_color: cfg.background_color,
        display: cfg.display,
        scope: cfg.scope,
        start_url: cfg.start_url,
        icons: typeof cfg.icons === 'string' ? JSON.parse(cfg.icons) : cfg.icons,
        shortcuts: cfg.shortcuts ? (typeof cfg.shortcuts === 'string' ? JSON.parse(cfg.shortcuts) : cfg.shortcuts) : [],
        screenshots: cfg.screenshots ? (typeof cfg.screenshots === 'string' ? JSON.parse(cfg.screenshots) : cfg.screenshots) : [],
        categories: ['business','productivity'],
        orientation: 'any',
        lang: 'pt-BR',
        dir: 'ltr',
        prefer_related_applications: false,
      };
      res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      res.end(JSON.stringify(manifest, null, 2));
    } catch (e) {
      console.error('manifest', e.message);
      return sendJson(res, 500, { error: 'internal_error' });
    }
  }

  // ---- Offline Queue ----
  async function handleOfflineQueue(req, res) {
    const session = await requireSession(req);
    if (!session) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const employee_id = url.searchParams.get('employee_id');
      const status = url.searchParams.get('status');
      const task_type = url.searchParams.get('task_type');
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
      const where = [];
      const vals = [];
      let i = 1;
      if (employee_id) { if (!validateUuid(employee_id)) return sendJson(res, 400, { error: 'invalid_employee_id' }); where.push(`employee_id=$${i++}`); vals.push(employee_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      if (task_type) { where.push(`task_type=$${i++}`); vals.push(task_type); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM emp_offline_queue ${whereSql} ORDER BY created_at DESC LIMIT $${i}`, [...vals, limit]);
        return sendJson(res, 200, { queues: rows });
      } catch (e) {
        console.error('offlineQueue GET', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'same_origin_required' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid_json' });
      const employee_id = body.employee_id || body.employeeId;
      if (!validateUuid(employee_id)) return sendJson(res, 400, { error: 'invalid_employee_id' });
      const task_type = body.task_type || body.taskType;
      const allowedTypes = ['occurrence','handover','absence_notice','shift_swap','procedure_ack','journey_proof','absence_followup','occurrence_action'];
      if (!allowedTypes.includes(task_type)) return sendJson(res, 400, { error: 'invalid_task_type', allowed: allowedTypes });
      const payload = body.payload;
      if (!payload || typeof payload !== 'object') return sendJson(res, 400, { error: 'invalid_payload' });
      const idempotency_key = String(body.idempotency_key || body.idempotencyKey || '').trim();
      if (idempotency_key.length < 10 || idempotency_key.length > 200) return sendJson(res, 400, { error: 'invalid_idempotency_key', detail: '10-200' });
      const device_timestamp_raw = body.device_timestamp || body.deviceTimestamp;
      if (!device_timestamp_raw) return sendJson(res, 400, { error: 'device_timestamp_required', detail: 'horário do dispositivo separado do servidor' });
      const device_timestamp = new Date(device_timestamp_raw);
      if (isNaN(device_timestamp.getTime())) return sendJson(res, 400, { error: 'invalid_device_timestamp' });
      const device_timezone = String(body.device_timezone || body.deviceTimezone || 'America/Sao_Paulo').trim().slice(0,100);
      // Check approved tasks
      try {
        const cfgRes = await pool.query(`SELECT approved_offline_tasks, max_queue_size FROM emp_pwa_configs WHERE is_active=true ORDER BY version DESC LIMIT 1`);
        const cfg = cfgRes.rows[0];
        if (cfg && cfg.approved_offline_tasks && !cfg.approved_offline_tasks.includes(task_type)) {
          return sendJson(res, 400, { error: 'task_not_approved_offline', approved: cfg.approved_offline_tasks });
        }
        if (cfg) {
          const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM emp_offline_queue WHERE employee_id=$1 AND status IN ('pendente','sincronizando','conflito','falha')`, [employee_id]);
          if (countRes.rows[0].c >= cfg.max_queue_size) {
            return sendJson(res, 429, { error: 'queue_limit_exceeded', max: cfg.max_queue_size, current: countRes.rows[0].c });
          }
        }
      } catch {}
      // Idempotência: se já existe mesma key, retorna existente (não duplica)
      try {
        const existing = await pool.query(`SELECT * FROM emp_offline_queue WHERE idempotency_key=$1`, [idempotency_key]);
        if (existing.rows[0]) {
          // Conflito explícito se payload diferente?
          const existingPayloadStr = JSON.stringify(existing.rows[0].payload);
          const newPayloadStr = JSON.stringify(payload);
          if (existingPayloadStr !== newPayloadStr) {
            // Marca conflito
            await pool.query(`UPDATE emp_offline_queue SET conflict_details=$2, status='conflito', updated_at=NOW() WHERE id=$1`, [existing.rows[0].id, JSON.stringify({ type: 'duplicate', message: 'Idempotency key reused with different payload', server_payload: existing.rows[0].payload, device_payload: payload })]);
            await pool.query(`INSERT INTO emp_offline_conflicts (queue_id, conflict_type, server_data, device_data, resolution) VALUES ($1,'duplicate',$2,$3,'pendente')`, [existing.rows[0].id, existing.rows[0].payload, payload]);
            const updated = await pool.query(`SELECT * FROM emp_offline_queue WHERE id=$1`, [existing.rows[0].id]);
            try { await auditLog({ action: 'emp_offline_conflict', actor: session.role, target: existing.rows[0].id, meta: { idempotency_key, conflict: 'duplicate' } }); } catch {}
            return sendJson(res, 409, { error: 'idempotency_conflict', existing: updated.rows[0], conflict: 'duplicate payload differs, explicit conflict' });
          }
          return sendJson(res, 200, { queue: existing.rows[0], dedup: true, message: 'idempotent replay, already received' });
        }
      } catch {}
      // Verifica employee existe
      try {
        const emp = await pool.query(`SELECT id FROM hr_employees WHERE id=$1`, [employee_id]);
        if (!emp.rows[0]) return sendJson(res, 404, { error: 'employee_not_found' });
      } catch {}
      // Server received at separado de device timestamp
      const server_received_at = new Date();
      try {
        const { rows } = await pool.query(
          `INSERT INTO emp_offline_queue (employee_id, task_type, payload, idempotency_key, device_timestamp, device_timezone, server_received_at, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente') RETURNING *`,
          [employee_id, task_type, JSON.stringify(payload), idempotency_key, device_timestamp.toISOString(), device_timezone, server_received_at.toISOString()]
        );
        try { await auditLog({ action: 'emp_offline_queue_create', actor: session.role, target: rows[0].id, meta: { task_type, idempotency_key, device_timestamp: device_timestamp.toISOString(), server_received_at: server_received_at.toISOString() } }); } catch {}
        return sendJson(res, 201, { queue: rows[0], device_timestamp: device_timestamp.toISOString(), server_received_at: server_received_at.toISOString(), note: 'horário dispositivo e recebimento servidor separados' });
      } catch (e) {
        if (e.code === '23505') return sendJson(res, 409, { error: 'duplicate_idempotency_key' });
        console.error('offlineQueue POST', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'same_origin_required' });
      if (!requireRole(session, ['admin','ti','rh'])) return sendJson(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid_json' });
      const id = body.id;
      if (!validateUuid(id)) return sendJson(res, 400, { error: 'invalid_id' });
      const status = body.status;
      const allowedStatus = ['pendente','sincronizando','sincronizado','conflito','falha','cancelado'];
      if (status && !allowedStatus.includes(status)) return sendJson(res, 400, { error: 'invalid_status', allowed: allowedStatus });
      const last_error = body.last_error || body.lastError;
      const retry_count = body.retry_count !== undefined ? Number(body.retry_count) : undefined;
      try {
        const fields = [];
        const vals = [];
        let idx = 1;
        if (status) { fields.push(`status=$${idx++}`); vals.push(status); if (status === 'sincronizado') fields.push(`synced_at=NOW()`); }
        if (last_error !== undefined) { fields.push(`last_error=$${idx++}`); vals.push(String(last_error).slice(0,2000)); }
        if (retry_count !== undefined) { fields.push(`retry_count=$${idx++}`); vals.push(retry_count); }
        if (status === 'sincronizado' && !fields.includes('server_received_at')) { /* already set on create, keep */ }
        if (fields.length === 0) return sendJson(res, 400, { error: 'no_fields' });
        vals.push(id);
        const { rows } = await pool.query(`UPDATE emp_offline_queue SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`, vals);
        if (!rows[0]) return sendJson(res, 404, { error: 'not_found' });
        try { await auditLog({ action: 'emp_offline_queue_update', actor: session.role, target: id, meta: { status } }); } catch {}
        return sendJson(res, 200, { queue: rows[0] });
      } catch (e) {
        console.error('offlineQueue PATCH', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  async function handleOfflineConflicts(req, res) {
    const session = await requireSession(req);
    if (!session) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const queue_id = url.searchParams.get('queue_id');
      const resolution = url.searchParams.get('resolution');
      const where = [];
      const vals = [];
      let i = 1;
      if (queue_id) { if (!validateUuid(queue_id)) return sendJson(res, 400, { error: 'invalid_queue_id' }); where.push(`queue_id=$${i++}`); vals.push(queue_id); }
      if (resolution) { where.push(`resolution=$${i++}`); vals.push(resolution); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM emp_offline_conflicts ${whereSql} ORDER BY created_at DESC LIMIT 100`, vals);
        return sendJson(res, 200, { conflicts: rows });
      } catch (e) {
        console.error('offlineConflicts GET', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'same_origin_required' });
      if (!requireRole(session, ['admin','ti','rh'])) return sendJson(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid_json' });
      const id = body.id;
      if (!validateUuid(id)) return sendJson(res, 400, { error: 'invalid_id' });
      const resolution = body.resolution;
      if (!['pendente','manual_resolvido','auto_resolvido','ignorado'].includes(resolution)) return sendJson(res, 400, { error: 'invalid_resolution' });
      const notes = body.notes ? String(body.notes).slice(0,2000) : null;
      try {
        const { rows } = await pool.query(`UPDATE emp_offline_conflicts SET resolution=$1, resolved_by=$2, resolved_at=NOW(), notes=COALESCE($3, notes) WHERE id=$4 RETURNING *`, [resolution, session.role, notes, id]);
        if (!rows[0]) return sendJson(res, 404, { error: 'not_found' });
        // Se resolvido, atualizar queue status se necessário
        if (resolution === 'manual_resolvido' || resolution === 'auto_resolvido') {
          await pool.query(`UPDATE emp_offline_queue SET status='sincronizado', synced_at=NOW(), updated_at=NOW() WHERE id=$1 AND status='conflito'`, [rows[0].queue_id]);
        }
        try { await auditLog({ action: 'emp_offline_conflict_resolve', actor: session.role, target: id, meta: { resolution } }); } catch {}
        return sendJson(res, 200, { conflict: rows[0] });
      } catch (e) {
        console.error('offlineConflicts PATCH', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  // ---- FAQ Interna ----
  async function handleFaqInternal(req, res) {
    const session = await requireSession(req);
    if (!session) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const category = url.searchParams.get('category');
      const status = url.searchParams.get('status');
      const is_published = url.searchParams.get('is_published');
      const is_simple = url.searchParams.get('is_simple_language');
      const search = url.searchParams.get('search');
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
      const where = [];
      const vals = [];
      let i = 1;
      if (category) { where.push(`category=$${i++}`); vals.push(category); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      if (is_published !== null && is_published !== '') { where.push(`is_published=$${i++}`); vals.push(is_published === 'true'); }
      if (is_simple !== null && is_simple !== '') { where.push(`is_simple_language=$${i++}`); vals.push(is_simple === 'true'); }
      if (search) { where.push(`(question ILIKE $${i} OR answer ILIKE $${i})`); vals.push(`%${search}%`); i++; }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM emp_faq_internal ${whereSql} ORDER BY is_published DESC, category, question LIMIT $${i}`, [...vals, limit]);
        return sendJson(res, 200, { faqs: rows });
      } catch (e) {
        console.error('faqInternal GET', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'same_origin_required' });
      if (!requireRole(session, ['admin','ti','rh'])) return sendJson(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid_json' });
      const question = String(body.question || '').trim();
      const answer = String(body.answer || '').trim();
      if (question.length < 10 || question.length > 500) return sendJson(res, 400, { error: 'invalid_question', detail: '10-500' });
      if (answer.length < 20 || answer.length > 5000) return sendJson(res, 400, { error: 'invalid_answer', detail: '20-5000' });
      const category = body.category || 'geral';
      if (!['geral','escala','ponto','beneficios','uniformes','seguranca','procedimentos','rh','tecnico','outro'].includes(category)) return sendJson(res, 400, { error: 'invalid_category' });
      const status = body.status || 'rascunho';
      if (!['rascunho','em_revisao','publicado','arquivado'].includes(status)) return sendJson(res, 400, { error: 'invalid_status' });
      const is_simple_language = body.is_simple_language !== undefined ? !!body.is_simple_language : true;
      const reading_level = body.reading_level || 'simples';
      if (!['simples','medio','tecnico'].includes(reading_level)) return sendJson(res, 400, { error: 'invalid_reading_level' });
      const is_low_data = body.is_low_data !== undefined ? !!body.is_low_data : true;
      const has_keyboard_support = body.has_keyboard_support !== undefined ? !!body.has_keyboard_support : true;
      const has_screen_reader_support = body.has_screen_reader_support !== undefined ? !!body.has_screen_reader_support : true;
      const tags = Array.isArray(body.tags) ? body.tags.slice(0,20).map(t=>String(t).slice(0,50)) : [];
      const is_published = status === 'publicado';
      try {
        const { rows } = await pool.query(
          `INSERT INTO emp_faq_internal (category, question, answer, status, is_simple_language, reading_level, is_low_data, has_keyboard_support, has_screen_reader_support, tags, is_published, published_at, published_by, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [category, question, answer, status, is_simple_language, reading_level, is_low_data, has_keyboard_support, has_screen_reader_support, tags, is_published, is_published ? new Date().toISOString() : null, is_published ? session.role : null, session.role]
        );
        try { await auditLog({ action: 'emp_faq_internal_create', actor: session.role, target: rows[0].id, meta: { category, is_simple_language, is_low_data } }); } catch {}
        return sendJson(res, 201, { faq: rows[0] });
      } catch (e) {
        console.error('faqInternal POST', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'same_origin_required' });
      if (!requireRole(session, ['admin','ti','rh'])) return sendJson(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid_json' });
      const id = body.id;
      if (!validateUuid(id)) return sendJson(res, 400, { error: 'invalid_id' });
      const fields = [];
      const vals = [];
      let idx = 1;
      if (body.question !== undefined) { const q = String(body.question).trim(); if (q.length < 10 || q.length > 500) return sendJson(res, 400, { error: 'invalid_question' }); fields.push(`question=$${idx++}`); vals.push(q); }
      if (body.answer !== undefined) { const a = String(body.answer).trim(); if (a.length < 20 || a.length > 5000) return sendJson(res, 400, { error: 'invalid_answer' }); fields.push(`answer=$${idx++}`); vals.push(a); }
      if (body.category !== undefined) { fields.push(`category=$${idx++}`); vals.push(body.category); }
      if (body.status !== undefined) {
        if (!['rascunho','em_revisao','publicado','arquivado'].includes(body.status)) return sendJson(res, 400, { error: 'invalid_status' });
        fields.push(`status=$${idx++}`); vals.push(body.status);
        if (body.status === 'publicado') { fields.push(`is_published=$${idx++}`); vals.push(true); fields.push(`published_at=$${idx++}`); vals.push(new Date().toISOString()); fields.push(`published_by=$${idx++}`); vals.push(session.role); }
        else { fields.push(`is_published=$${idx++}`); vals.push(false); }
      }
      if (body.is_simple_language !== undefined) { fields.push(`is_simple_language=$${idx++}`); vals.push(!!body.is_simple_language); }
      if (body.reading_level !== undefined) { fields.push(`reading_level=$${idx++}`); vals.push(body.reading_level); }
      if (body.is_low_data !== undefined) { fields.push(`is_low_data=$${idx++}`); vals.push(!!body.is_low_data); }
      if (body.has_keyboard_support !== undefined) { fields.push(`has_keyboard_support=$${idx++}`); vals.push(!!body.has_keyboard_support); }
      if (body.has_screen_reader_support !== undefined) { fields.push(`has_screen_reader_support=$${idx++}`); vals.push(!!body.has_screen_reader_support); }
      if (body.tags !== undefined) { fields.push(`tags=$${idx++}`); vals.push(body.tags); }
      if (fields.length === 0) return sendJson(res, 400, { error: 'no_fields' });
      vals.push(id);
      try {
        const { rows } = await pool.query(`UPDATE emp_faq_internal SET ${fields.join(', ')}, updated_by=$${idx+1}, updated_at=NOW() WHERE id=$${idx} RETURNING *`, [...vals, session.role]);
        if (!rows[0]) return sendJson(res, 404, { error: 'not_found' });
        try { await auditLog({ action: 'emp_faq_internal_update', actor: session.role, target: id, meta: { status: body.status } }); } catch {}
        return sendJson(res, 200, { faq: rows[0] });
      } catch (e) {
        console.error('faqInternal PATCH', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  async function handleFaqAccessLogs(req, res) {
    const session = await requireSession(req);
    if (!session) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const faq_id = url.searchParams.get('faq_id');
      const where = [];
      const vals = [];
      let i = 1;
      if (faq_id) { if (!validateUuid(faq_id)) return sendJson(res, 400, { error: 'invalid_faq_id' }); where.push(`faq_id=$${i++}`); vals.push(faq_id); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM emp_faq_access_logs ${whereSql} ORDER BY accessed_at DESC LIMIT 100`, vals);
        return sendJson(res, 200, { logs: rows });
      } catch (e) {
        console.error('faqAccessLogs GET', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'same_origin_required' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid_json' });
      const faq_id = body.faq_id || body.faqId;
      if (!validateUuid(faq_id)) return sendJson(res, 400, { error: 'invalid_faq_id' });
      const employee_id = body.employee_id || body.employeeId;
      if (employee_id && !validateUuid(employee_id)) return sendJson(res, 400, { error: 'invalid_employee_id' });
      const device_type = body.device_type || body.deviceType || 'mobile';
      if (!['mobile','desktop','tablet','outro'].includes(device_type)) return sendJson(res, 400, { error: 'invalid_device_type' });
      const is_keyboard_navigation = !!body.is_keyboard_navigation || !!body.isKeyboardNavigation;
      const is_screen_reader = !!body.is_screen_reader || !!body.isScreenReader;
      const data_saver = !!body.data_saver || !!body.dataSaver;
      const ip_hash = sha256Hex(clientIp(req)).slice(0,32);
      try {
        const { rows } = await pool.query(
          `INSERT INTO emp_faq_access_logs (faq_id, employee_id, device_type, is_keyboard_navigation, is_screen_reader, data_saver, ip_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [faq_id, employee_id || null, device_type, is_keyboard_navigation, is_screen_reader, data_saver, ip_hash]
        );
        await pool.query(`UPDATE emp_faq_internal SET view_count=view_count+1, updated_at=updated_at WHERE id=$1`, [faq_id]);
        try { await auditLog({ action: 'emp_faq_access', actor: session.role, target: faq_id, meta: { is_keyboard_navigation, is_screen_reader, data_saver } }); } catch {}
        return sendJson(res, 201, { log: rows[0] });
      } catch (e) {
        console.error('faqAccessLogs POST', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  async function handleAccessibilityPreferences(req, res) {
    const session = await requireSession(req);
    if (!session) return sendJson(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const employee_id = url.searchParams.get('employee_id');
      const where = [];
      const vals = [];
      let i = 1;
      if (employee_id) { if (!validateUuid(employee_id)) return sendJson(res, 400, { error: 'invalid_employee_id' }); where.push(`employee_id=$${i++}`); vals.push(employee_id); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM emp_accessibility_preferences ${whereSql} ORDER BY updated_at DESC LIMIT 100`, vals);
        return sendJson(res, 200, { preferences: rows });
      } catch (e) {
        console.error('accessPrefs GET', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'same_origin_required' });
      const body = await readBody(req);
      if (!body) return sendJson(res, 400, { error: 'invalid_json' });
      const employee_id = body.employee_id || body.employeeId;
      if (!validateUuid(employee_id)) return sendJson(res, 400, { error: 'invalid_employee_id' });
      const prefers_keyboard = !!body.prefers_keyboard || !!body.prefersKeyboard;
      const prefers_screen_reader = !!body.prefers_screen_reader || !!body.prefersScreenReader;
      const prefers_simple_language = body.prefers_simple_language !== undefined ? !!body.prefers_simple_language : (body.prefersSimpleLanguage !== undefined ? !!body.prefersSimpleLanguage : true);
      const prefers_low_data = !!body.prefers_low_data || !!body.prefersLowData;
      const font_size = body.font_size || body.fontSize || 'medio';
      if (!['pequeno','medio','grande','extra_grande'].includes(font_size)) return sendJson(res, 400, { error: 'invalid_font_size' });
      const high_contrast = !!body.high_contrast || !!body.highContrast;
      const reduced_motion = !!body.reduced_motion || !!body.reducedMotion;
      try {
        const { rows } = await pool.query(
          `INSERT INTO emp_accessibility_preferences (employee_id, prefers_keyboard, prefers_screen_reader, prefers_simple_language, prefers_low_data, font_size, high_contrast, reduced_motion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (employee_id) DO UPDATE SET prefers_keyboard=$2, prefers_screen_reader=$3, prefers_simple_language=$4, prefers_low_data=$5, font_size=$6, high_contrast=$7, reduced_motion=$8, updated_at=NOW()
           RETURNING *`,
          [employee_id, prefers_keyboard, prefers_screen_reader, prefers_simple_language, prefers_low_data, font_size, high_contrast, reduced_motion]
        );
        try { await auditLog({ action: 'emp_accessibility_pref_update', actor: session.role, target: employee_id, meta: { prefers_keyboard, prefers_screen_reader, prefers_simple_language, prefers_low_data } }); } catch {}
        return sendJson(res, 201, { preference: rows[0] });
      } catch (e) {
        console.error('accessPrefs POST', e.message);
        return sendJson(res, 500, { error: 'internal_error' });
      }
    }
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }

  // Service worker content (dynamic to include do_not_cache_patterns)
  async function handleServiceWorker(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    const mandatoryPrivatePatterns = [
      '/api/employee/', '/api/hr/', '/funcionario',
      'payroll', 'payslip', 'holerite', 'medical', 'salary', 'employee-documents',
    ];
    let configuredPatterns = [];
    try {
      const { rows } = await pool.query(`SELECT do_not_cache_patterns FROM emp_pwa_configs WHERE is_active=true ORDER BY version DESC LIMIT 1`);
      if (Array.isArray(rows[0]?.do_not_cache_patterns)) configuredPatterns = rows[0].do_not_cache_patterns;
    } catch {}
    // Configuração administrativa pode ampliar, nunca remover a proteção mínima.
    const doNotCache = [...new Set([...mandatoryPrivatePatterns, ...configuredPatterns])];
    const swContent = `
// EMP-18 Service Worker - PWA instalável, fila offline limitada, não cachear médicos/salariais por padrão
const CACHE_NAME = 'seg-system-v2';
const OFFLINE_URL = '/offline.html';
const DEV_MODE = ${process.env.NODE_ENV !== 'production' ? 'true' : 'false'};
const DO_NOT_CACHE = ${JSON.stringify(doNotCache)};

function shouldNotCache(url) {
  return DO_NOT_CACHE.some(pattern => url.includes(pattern));
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(['/', '/offline.html']).catch(()=>{});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Next.js dev assets are mutable at stable URLs; bypass all service-worker
  // strategies in development so hot reload and session checks see live code.
  if (DEV_MODE) return;

  const req = event.request;
  const url = req.url;

  // Não cachear documentos médicos/salariais por padrão (EMP-18)
  if (shouldNotCache(url)) {
    return event.respondWith(fetch(req).catch(()=> new Response('Documento restrito não disponível offline', { status: 403 })));
  }

  // API offline queue - network first, fallback to queue
  if (url.includes('/api/hr/offline-queue') && req.method === 'POST') {
    return event.respondWith(
      fetch(req).then(res => res).catch(async () => {
        // Se offline, tenta salvar em IndexedDB local (cliente faz), retorna 202 queued
        return new Response(JSON.stringify({ queued_offline: true, device_timestamp: new Date().toISOString(), note: 'horário dispositivo separado do servidor, será sincronizado quando online' }), { status: 202, headers: { 'Content-Type': 'application/json' } });
      })
    );
  }

  // APIs (especially session checks) must bypass the service worker. Keeping
  // them network-only avoids stale responses and lets auth failures resolve
  // promptly while the app is served locally through a development tunnel.
  if (new URL(url).origin === self.location.origin && new URL(url).pathname.startsWith('/api/')) {
    return;
  }

  // Estratégia network_first para navegação, cache_first para assets
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req).then(cached => cached || caches.match(OFFLINE_URL)))
    );
    return;
  }

  if (req.destination === 'image' || req.destination === 'style' || req.destination === 'script') {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res.ok && !shouldNotCache(url)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
          }
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(fetch(req).catch(() => caches.match(req)));
});

self.addEventListener('sync', event => {
  if (event.tag === 'offline-queue-sync') {
    event.waitUntil(
      // Cliente deve implementar sync via IndexedDB -> POST /api/hr/offline-queue com idempotency_key
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_OFFLINE_QUEUE', device_timestamp: new Date().toISOString(), server_received_will_be_set: true }));
      })
    );
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
`;
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Service-Worker-Allowed': '/' });
    res.end(swContent);
  }

  async function handleOfflinePage(req, res) {
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline - SEG System</title><style>body{font-family:system-ui,sans-serif;padding:24px;max-width:600px;margin:0 auto}h1{color:#0f172a}a{color:#0f172a}</style></head><body><h1>Você está offline</h1><p>Algumas tarefas operacionais aprovadas ficam em fila e serão sincronizadas quando voltar a conexão.</p><ul><li>Horário do dispositivo e recebimento no servidor são separados e registrados.</li><li>Idempotência por chave evita duplicidade.</li><li>Conflitos são mostrados explicitamente para resolução.</li><li>Documentos médicos/salariais não são cacheados por padrão.</li></ul><p><a href="/">Voltar ao início</a></p></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  }

  return {
    handlePwaConfigs,
    handleManifest,
    handleServiceWorker,
    handleOfflinePage,
    handleOfflineQueue,
    handleOfflineConflicts,
    handleFaqInternal,
    handleFaqAccessLogs,
    handleAccessibilityPreferences,
  };
}
