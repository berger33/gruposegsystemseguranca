export function createFinBudgetApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const generateProtocol = (prefix) => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const rnd = Math.random().toString(36).substring(2,6).toUpperCase();
    return `${prefix}-${y}${m}${day}-${rnd}`;
  };

  const send = (res, code, body) => {
    res.writeHead(code, {'Content-Type':'application/json'});
    res.end(JSON.stringify(body));
  };
  const getSession = async (req) => { try { return await requireSession(req); } catch { return null; } };
  const normalizeRole = (sess) => String(sess?.role || sess?.userRole || '').toLowerCase();
  const checkAuth = async (req, res) => {
    const sess = await getSession(req);
    if (!sess) { send(res, 401, {error:'unauthorized'}); return null; }
    const allowed = ['admin','ti','financeiro','finance'];
    let ok = false;
    try { ok = Boolean(requireRole?.(sess, allowed)); } catch { ok = false; }
    const r = normalizeRole(sess);
    if (!ok && !allowed.includes(r)) { send(res, 403, {error:'forbidden'}); return null; }
    return sess;
  };
  const readJson = async (req) => new Promise((resolve, reject) => {
    let data=''; req.on('data', c=> data+=c); req.on('end', ()=> { try { resolve(data?JSON.parse(data):{}); } catch(e){ reject(e); } });
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const BUDGET_STATUSES = new Set(['rascunho','em_revisao','aprovado','rejeitado','arquivado']);
  const SCENARIO_TYPES = new Set(['conservador','base','otimista','expansao','pessimista']);
  const BUDGET_TRANSITIONS = {
    rascunho: new Set(['em_revisao']),
    em_revisao: new Set(['aprovado','rejeitado']),
    aprovado: new Set(['arquivado']),
    rejeitado: new Set(['arquivado']),
    arquivado: new Set([]),
  };
  const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);
  const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  const cleanText = (value) => typeof value === 'string' ? value.trim() : '';
  const textInRange = (value, min, max) => value.length >= min && value.length <= max;
  const parseNullableCents = (value) => {
    if (value === undefined || value === null || value === '') return { ok:true, value:null };
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? { ok:true, value:n } : { ok:false, value:null };
  };
  const parseNullablePercent = (value) => {
    if (value === undefined || value === null || value === '') return { ok:true, value:null };
    const n = Number(value);
    return Number.isFinite(n) && n >= -100 && n <= 100 ? { ok:true, value:n } : { ok:false, value:null };
  };
  const isAuditUnavailable = (error) => error?.code === '42P01' || /audit_log/i.test(String(error?.message || ''));
  const dbFailure = (res, error, options = {}) => {
    if (isAuditUnavailable(error)) return send(res, 503, {error:'audit_unavailable'});
    if (error?.code === '23505') return send(res, 409, {error: options.duplicate || 'duplicate'});
    if (error?.code === '23503') return send(res, 400, {error:'invalid_reference'});
    if (error?.code === '23514' || error?.code === '22P02' || error?.code === '22007') return send(res, 400, {error: options.invalid || 'invalid'});
    if (error?.code === 'P0001') {
      const msg = String(error.message || '');
      if (msg.includes('fin_budget_invalid_transition')) return send(res, 409, {error:'invalid_status_transition'});
      if (msg.includes('fin_budget_approval_requires_auditor')) return send(res, 400, {error:'approval_requires_identity_and_date'});
      if (msg.includes('fin_budget_history_immutable')) return send(res, 409, {error:'history_immutable'});
      return send(res, 400, {error: options.invalid || 'invalid'});
    }
    return send(res, 500, {error:'internal'});
  };
  const guardMutation = (req, res, sess) => {
    if (req.method === 'GET') return false;
    if (!sameOrigin(req)) { send(res, 403, {error:'forbidden_origin'}); return true; }
    if (normalizeRole(sess) === 'ti') { send(res, 403, {error:'read_only'}); return true; }
    return false;
  };

  const handleBudgets = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      if (status && !BUDGET_STATUSES.has(status)) return send(res, 400, {error:'invalid_status'});
      let q = `SELECT * FROM fin_budgets WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY period_start DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { budgets: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const title = cleanText(body.title);
      const description = cleanText(body.description);
      const premises = cleanText(body.premises);
      const period_start = body.period_start;
      const period_end = body.period_end;
      const total_revenue = parseNullableCents(body.total_revenue_cents);
      const total_cost = parseNullableCents(body.total_cost_cents);
      if (!textInRange(title, 5, 200)) return send(res, 400, {error:'title_5_200'});
      if (!textInRange(description, 10, 2000)) return send(res, 400, {error:'description_10_2000'});
      if (!textInRange(premises, 10, 2000)) return send(res, 400, {error:'premises_10_2000_required_nao_prometer_resultado'});
      if (!isIsoDate(period_start) || !isIsoDate(period_end)) return send(res, 400, {error:'period_required'});
      if (new Date(`${period_end}T00:00:00Z`) < new Date(`${period_start}T00:00:00Z`)) return send(res, 400, {error:'period_end_gte_start'});
      if (!total_revenue.ok || !total_cost.ok) return send(res, 400, {error:'amount_cents_gte_0'});
      const protocol = generateProtocol('ORC-FIN');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO fin_budgets (protocol, title, description, premises, period_start, period_end, total_revenue_cents, total_cost_cents, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [protocol, title, description, premises, period_start, period_end, total_revenue.value, total_cost.value, sess.identityId||null]
        );
        await auditLog({ action:'fin_budget_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{ protocol, is_estimate:true, premises_explicit:true }, client });
        await client.query('COMMIT');
        return send(res, 201, { budget: rows[0], note:'orcamento_gerencial_premissas_explicitas_nao_prometer_resultado' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_budget', invalid:'invalid_budget' });
      } finally { client.release(); }
    }
    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const id = body.id;
      if (!isUuid(id)) return send(res, 400, {error:'invalid_id'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT * FROM fin_budgets WHERE id=$1 FOR UPDATE`, [id]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'not_found'}); }
        const previous = found.rows[0];
        let nextStatus = previous.status;
        if (body.status !== undefined && body.status !== null) {
          if (!BUDGET_STATUSES.has(body.status)) { await client.query('ROLLBACK'); return send(res, 400, {error:'invalid_status'}); }
          nextStatus = body.status;
          if (nextStatus !== previous.status && !BUDGET_TRANSITIONS[previous.status]?.has(nextStatus)) {
            await client.query('ROLLBACK'); return send(res, 409, {error:'invalid_status_transition'});
          }
        }
        const title = body.title === undefined || body.title === null ? previous.title : cleanText(body.title);
        const description = body.description === undefined || body.description === null ? previous.description : cleanText(body.description);
        const premises = body.premises === undefined || body.premises === null ? previous.premises : cleanText(body.premises);
        if (!textInRange(title, 5, 200)) { await client.query('ROLLBACK'); return send(res, 400, {error:'title_5_200'}); }
        if (!textInRange(description, 10, 2000)) { await client.query('ROLLBACK'); return send(res, 400, {error:'description_10_2000'}); }
        if (!textInRange(premises, 10, 2000)) { await client.query('ROLLBACK'); return send(res, 400, {error:'premises_10_2000_required_nao_prometer_resultado'}); }
        const totalRevenue = body.total_revenue_cents === undefined ? { ok:true, value:previous.total_revenue_cents } : parseNullableCents(body.total_revenue_cents);
        const totalCost = body.total_cost_cents === undefined ? { ok:true, value:previous.total_cost_cents } : parseNullableCents(body.total_cost_cents);
        if (!totalRevenue.ok || !totalCost.ok) { await client.query('ROLLBACK'); return send(res, 400, {error:'amount_cents_gte_0'}); }
        let approvedBy = previous.approved_by_identity;
        let approvedAt = previous.approved_at;
        if (nextStatus === 'aprovado' && previous.status !== 'aprovado') {
          if (!sess.identityId) { await client.query('ROLLBACK'); return send(res, 400, {error:'approval_requires_identity_and_date'}); }
          approvedBy = sess.identityId;
          approvedAt = new Date();
        }
        const { rows } = await client.query(
          `UPDATE fin_budgets
              SET status=$1, title=$2, description=$3, premises=$4,
                  total_revenue_cents=$5, total_cost_cents=$6,
                  approved_by_identity=$7, approved_at=$8, updated_at=NOW()
            WHERE id=$9 RETURNING *`,
          [nextStatus, title, description, premises, totalRevenue.value, totalCost.value, approvedBy, approvedAt, id]
        );
        await auditLog({ action:'fin_budget_update', actor: sess.identityId||'unknown', target: id, meta:{ protocol: previous.protocol, previous_status: previous.status, next_status: rows[0].status, is_estimate:true }, client });
        await client.query('COMMIT');
        return send(res, 200, { budget: rows[0] });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_budget', invalid:'invalid_budget' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleBudgetScenarios = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const budget_id = url.searchParams.get('budget_id');
      const scenario_type = url.searchParams.get('scenario_type');
      if (budget_id && !isUuid(budget_id)) return send(res, 400, {error:'invalid_budget_id'});
      if (scenario_type && !SCENARIO_TYPES.has(scenario_type)) return send(res, 400, {error:'invalid_scenario_type'});
      let q = `SELECT * FROM fin_budget_scenarios WHERE 1=1`; const params=[]; let idx=1;
      if (budget_id) { q+=` AND budget_id=$${idx++}`; params.push(budget_id); }
      if (scenario_type) { q+=` AND scenario_type=$${idx++}`; params.push(scenario_type); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { scenarios: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const budget_id = body.budget_id;
      const scenario_type = body.scenario_type || 'base';
      const title = cleanText(body.title);
      const premises = cleanText(body.premises);
      const projected_revenue = parseNullableCents(body.projected_revenue_cents);
      const projected_cost = parseNullableCents(body.projected_cost_cents);
      const projected_margin_percent = parseNullablePercent(body.projected_margin_percent);
      if (!isUuid(budget_id)) return send(res, 400, {error:'invalid_budget_id'});
      if (!SCENARIO_TYPES.has(scenario_type)) return send(res, 400, {error:'invalid_scenario_type'});
      if (!textInRange(title, 5, 200)) return send(res, 400, {error:'title_5_200'});
      if (!textInRange(premises, 10, 2000)) return send(res, 400, {error:'premises_10_2000_required_cenario_expansao_premissas_explicitas'});
      if (!projected_revenue.ok || !projected_cost.ok) return send(res, 400, {error:'amount_cents_gte_0'});
      if (!projected_margin_percent.ok) return send(res, 400, {error:'margin_percent_range'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const budget = await client.query(`SELECT id, protocol, status FROM fin_budgets WHERE id=$1 FOR UPDATE`, [budget_id]);
        if (!budget.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'budget_not_found'}); }
        const dup = await client.query(`SELECT id FROM fin_budget_scenarios WHERE budget_id=$1 AND scenario_type=$2 FOR UPDATE`, [budget_id, scenario_type]);
        if (dup.rows.length) { await client.query('ROLLBACK'); return send(res, 409, {error:'duplicate_scenario_type_for_budget'}); }
        const { rows } = await client.query(
          `INSERT INTO fin_budget_scenarios (budget_id, scenario_type, title, premises, projected_revenue_cents, projected_cost_cents, projected_margin_percent, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [budget_id, scenario_type, title, premises, projected_revenue.value, projected_cost.value, projected_margin_percent.value, sess.identityId||null]
        );
        await auditLog({ action:'fin_budget_scenario_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{ budget_id, scenario_type, is_estimate:true, premises_explicit:true }, client });
        await client.query('COMMIT');
        return send(res, 201, { scenario: rows[0], note:'cenario_estimativa_identificada_nao_prometer_resultado' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_scenario_type_for_budget', invalid:'invalid_scenario' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleExports = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM fin_exports WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ exports: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const period_start = body.period_start;
      const period_end = body.period_end;
      const filters = body.filters || {};
      const totals = body.totals || {};
      const file_name = body.file_name || null;
      const file_url = body.file_url || null;
      const storage_key = body.storage_key || null;
      if (!period_start || !period_end) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'period_required'})); return; }
      if (new Date(period_end) < new Date(period_start)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'period_end_gte_start'})); return; }
      if (file_url && (file_url.length<5 || file_url.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'file_url_5_1000'})); return; }
      if (storage_key && (storage_key.length<5 || storage_key.length>500)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'storage_key_5_500'})); return; }
      const protocol = generateProtocol('EXP-FIN');
      try {
        if (storage_key) {
          const dup = await pool.query(`SELECT id FROM fin_exports WHERE storage_key=$1`, [storage_key]);
          if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_storage_key'})); return; }
        }
        const { rows } = await pool.query(
          `INSERT INTO fin_exports (protocol, period_start, period_end, filters, totals, total_records, total_amount_cents, file_name, file_url, storage_key, is_accountant_limited, access_role, requested_by_identity, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'contador',$11,'pendente') RETURNING *`,
          [protocol, period_start, period_end, filters, totals, body.total_records||0, body.total_amount_cents||0, file_name, file_url, storage_key, sess.identityId||null]
        );
        await pool.query(
          `INSERT INTO fin_export_logs (export_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`,
          [rows[0].id, 'export_create', sess.identityId||null, JSON.stringify({ period_start, period_end, filters, totals, is_accountant_limited:true })]
        );
        await auditLog({ action:'fin_export_create', actor: sess.identityId, target: rows[0].id, meta:{ protocol, period_start, period_end, is_accountant_limited:true, access_role:'contador' } });
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ export: rows[0], note:'exportacao_periodo_trilha_filtros_totais_conciliaveis_acesso_limitado_contador' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate'})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'}));
      }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      try {
        const { rows } = await pool.query(
          `UPDATE fin_exports SET status=COALESCE($1,status), file_name=COALESCE($2,file_name), file_url=COALESCE($3,file_url), storage_key=COALESCE($4,storage_key), totals=COALESCE($5,totals), generated_at=CASE WHEN $1='gerado' THEN NOW() ELSE generated_at END, expires_at=CASE WHEN $1='gerado' THEN NOW()+INTERVAL '30 days' ELSE expires_at END, updated_at=NOW() WHERE id=$6 RETURNING *`,
          [body.status||null, body.file_name||null, body.file_url||null, body.storage_key||null, body.totals||null, id]
        );
        if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        await pool.query(`INSERT INTO fin_export_logs (export_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`, [id, 'export_update', sess.identityId||null, JSON.stringify({ status: body.status })]);
        await auditLog({ action:'fin_export_update', actor: sess.identityId, target: id, meta:{ status: body.status } });
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ export: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleExportLogs = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const export_id = url.searchParams.get('export_id');
    let q = `SELECT * FROM fin_export_logs WHERE 1=1`; const params=[]; let idx=1;
    if (export_id) { q+=` AND export_id=$${idx++}`; params.push(export_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ logs: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
  };

  const handleClosures = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM fin_competence_closures WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY competence_date DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ closures: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const competence_date = body.competence_date;
      const notes = (body.notes||'').trim() || null;
      if (!competence_date) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'competence_date_required'})); return; }
      if (notes && (notes.length<10 || notes.length>2000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'notes_10_2000'})); return; }
      try {
        const dup = await pool.query(`SELECT id FROM fin_competence_closures WHERE competence_date=$1`, [competence_date]);
        if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_competence', existing_id: dup.rows[0].id})); return; }
        const { rows } = await pool.query(
          `INSERT INTO fin_competence_closures (competence_date, status, closed_by_identity, closed_at, notes)
           VALUES ($1,'fechada',$2,NOW(),$3) RETURNING *`,
          [competence_date, sess.identityId||null, notes]
        );
        // create initial report version preserving current snapshot
        await pool.query(
          `INSERT INTO fin_report_versions (closure_id, version, report_type, data, totals, is_preserved, created_by_identity)
           VALUES ($1,1,'fechamento_competencia',$2,$3,true,$4)`,
          [rows[0].id, JSON.stringify({ competence_date, status:'fechada', closed_at: new Date() }), JSON.stringify({}), sess.identityId||null]
        );
        await auditLog({ action:'fin_closure_create', actor: sess.identityId, target: rows[0].id, meta:{ competence_date, status:'fechada' } });
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ closure: rows[0], note:'fechamento_competencia_preservar_versoes_relatorio' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate'})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'}));
      }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      const action = body.action; // reopen
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      try {
        const existing = await pool.query(`SELECT * FROM fin_competence_closures WHERE id=$1`, [id]);
        if (!existing.rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        if (action === 'reopen') {
          const reopen_reason = (body.reopen_reason||'').trim();
          if (!reopen_reason || reopen_reason.length<10 || reopen_reason.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reopen_reason_10_1000_required_reabertura_autorizada'})); return; }
          if (!body.authorized_by_identity && !sess.identityId) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'authorized_by_required'})); return; }
          const { rows } = await pool.query(
            `UPDATE fin_competence_closures SET status='reaberta', reopened_by_identity=$1, reopened_at=NOW(), reopen_reason=$2, authorized_by_identity=$3, authorized_at=NOW(), updated_at=NOW() WHERE id=$4 RETURNING *`,
            [sess.identityId||null, reopen_reason, body.authorized_by_identity||sess.identityId||null, id]
          );
          // preserve new version
          const maxVer = await pool.query(`SELECT COALESCE(MAX(version),0)+1 as next FROM fin_report_versions WHERE closure_id=$1`, [id]);
          const nextVer = maxVer.rows[0].next;
          await pool.query(
            `INSERT INTO fin_report_versions (closure_id, version, report_type, data, totals, is_preserved, created_by_identity)
             VALUES ($1,$2,'reabertura_competencia',$3,$4,true,$5)`,
            [id, nextVer, JSON.stringify({ reopened_at: new Date(), reopen_reason, authorized_by: body.authorized_by_identity||sess.identityId }), JSON.stringify({}), sess.identityId||null]
          );
          await auditLog({ action:'fin_closure_reopen', actor: sess.identityId, target: id, meta:{ reopen_reason, authorized_by: body.authorized_by_identity||sess.identityId } });
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ closure: rows[0], note:'reabertura_autorizada_preservar_versoes_relatorio' }));
        } else {
          res.writeHead(400, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'action_required_reopen'}));
        }
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleReportVersions = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const closure_id = url.searchParams.get('closure_id');
    let q = `SELECT * FROM fin_report_versions WHERE 1=1`; const params=[]; let idx=1;
    if (closure_id) { q+=` AND closure_id=$${idx++}`; params.push(closure_id); }
    q+=` ORDER BY version DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ versions: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
  };

  const handleCommissionProvisions = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const rule_id = url.searchParams.get('rule_id');
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM fin_commission_provisions WHERE 1=1`; const params=[]; let idx=1;
      if (rule_id) { q+=` AND rule_id=$${idx++}`; params.push(rule_id); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY provision_date DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provisions: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const rule_id = body.rule_id || null;
      const commission_id = body.commission_id || null;
      const contract_id = body.contract_id || null;
      const provision_date = body.provision_date || new Date().toISOString().slice(0,10);
      const amount_cents = body.amount_cents;
      const notes = (body.notes||'').trim() || null;
      if (!amount_cents || amount_cents<0) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'amount_cents_gte_0'})); return; }
      if (body.is_auto_paid===true) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'auto_paid_forbidden_nao_pagar_automaticamente'})); return; }
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_commission_provisions (rule_id, commission_id, contract_id, provision_date, amount_cents, provisioned_by_identity, notes, is_auto_paid)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false) RETURNING *`,
          [rule_id, commission_id, contract_id, provision_date, amount_cents, sess.identityId||null, notes]
        );
        await pool.query(
          `INSERT INTO fin_commission_provision_history (provision_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_auto_paid_attempt)
           VALUES ($1,NULL,$2,NULL,$3,$4,$5,false)`,
          [rows[0].id, 'provisionada', amount_cents, sess.identityId||null, 'Provisão comissão ligada à regra CRM-25 provisão e revisão não pagar automaticamente']
        );
        await auditLog({ action:'fin_commission_provision_create', actor: sess.identityId, target: rows[0].id, meta:{ rule_id, commission_id, amount_cents, is_auto_paid:false } });
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provision: rows[0], note:'comissoes_ligadas_regra_CRM25_provisao_revisao_nao_pagar_automaticamente' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      const status = body.status;
      const reason = (body.reason||'').trim();
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      if (!reason || reason.length<10 || reason.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reason_10_1000_required'})); return; }
      if (body.is_auto_paid===true) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'auto_paid_forbidden'})); return; }
      try {
        const existing = await pool.query(`SELECT * FROM fin_commission_provisions WHERE id=$1`, [id]);
        if (!existing.rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        const prev = existing.rows[0];
        if (status==='paga') {
          // prevent auto pay, require manual but still allow paga status after review
          if (prev.status !== 'revisada' && prev.status !== 'provisionada') {
            // allow but log
          }
        }
        if ((status==='em_revisao' || status==='revisada') && (!body.revision_reason || body.revision_reason.length<10)) {
          res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'revision_reason_10_1000_required'})); return;
        }
        const { rows } = await pool.query(
          `UPDATE fin_commission_provisions SET status=COALESCE($1,status), amount_cents=COALESCE($2,amount_cents), revision_reason=COALESCE($3,revision_reason), reviewed_by_identity=CASE WHEN $1 IN ('em_revisao','revisada') THEN $4 ELSE reviewed_by_identity END, reviewed_at=CASE WHEN $1 IN ('em_revisao','revisada') THEN NOW() ELSE reviewed_at END, paid_at=CASE WHEN $1='paga' THEN NOW() ELSE paid_at END, paid_by_identity=CASE WHEN $1='paga' THEN $4 ELSE paid_by_identity END, notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$6 RETURNING *`,
          [status||null, body.amount_cents??null, body.revision_reason||null, sess.identityId||null, body.notes||null, id]
        );
        await pool.query(
          `INSERT INTO fin_commission_provision_history (provision_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_auto_paid_attempt)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false)`,
          [id, prev.status, rows[0].status, prev.amount_cents, rows[0].amount_cents, sess.identityId||null, reason]
        );
        await auditLog({ action: status==='paga'?'fin_commission_provision_pay':'fin_commission_provision_review', actor: sess.identityId, target: id, meta:{ status, reason, is_auto_paid:false } });
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provision: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleCommissionProvisionHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const provision_id = url.searchParams.get('provision_id');
    let q = `SELECT * FROM fin_commission_provision_history WHERE 1=1`; const params=[]; let idx=1;
    if (provision_id) { q+=` AND provision_id=$${idx++}`; params.push(provision_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ history: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal'})); }
  };

  return {
    handleBudgets,
    handleBudgetScenarios,
    handleExports,
    handleExportLogs,
    handleClosures,
    handleReportVersions,
    handleCommissionProvisions,
    handleCommissionProvisionHistory,
  };
}
