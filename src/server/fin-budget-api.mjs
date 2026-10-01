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
  // FIN-14/15/16 — allowlists e transições controladas espelhando as guardas
  // de banco acrescentadas pela migração 133 (aditiva).
  const EXPORT_STATUSES = new Set(['pendente','gerando','gerado','falhou','expirado']);
  const EXPORT_TRANSITIONS = {
    pendente: new Set(['gerando','falhou']),
    gerando: new Set(['gerado','falhou']),
    gerado: new Set(['expirado']),
    falhou: new Set(['pendente']),
    expirado: new Set([]),
  };
  const CLOSURE_STATUSES = new Set(['aberta','fechada','reaberta','bloqueada']);
  const CLOSURE_ACTIONS = new Set(['reopen','close']);
  const CLOSURE_TRANSITIONS = {
    aberta: new Set(['fechada']),
    fechada: new Set(['reaberta']),
    reaberta: new Set(['fechada']),
    bloqueada: new Set([]),
  };
  const PROVISION_STATUSES = new Set(['provisionada','em_revisao','revisada','paga','cancelada']);
  const PROVISION_TRANSITIONS = {
    provisionada: new Set(['em_revisao','cancelada']),
    em_revisao: new Set(['revisada','cancelada']),
    revisada: new Set(['em_revisao','paga','cancelada']),
    paga: new Set([]),
    cancelada: new Set([]),
  };
  const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);
  const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  const cleanText = (value) => typeof value === 'string' ? value.trim() : '';
  const textInRange = (value, min, max) => value.length >= min && value.length <= max;
  // Campo textual opcional: ausente vira null; presente precisa caber na faixa
  // do CHECK correspondente, para a resposta HTTP nunca vazar detalhe SQL.
  const optionalText = (value, min, max) => {
    if (value === undefined || value === null) return { ok:true, value:null };
    if (typeof value !== 'string') return { ok:false, value:null };
    const text = value.trim();
    if (!text) return { ok:true, value:null };
    return textInRange(text, min, max) ? { ok:true, value:text } : { ok:false, value:null };
  };
  const parseNullableCents = (value) => {
    if (value === undefined || value === null || value === '') return { ok:true, value:null };
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? { ok:true, value:n } : { ok:false, value:null };
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
      if (msg.includes('fin_budget_approved_requires_revision')) return send(res, 409, {error:'approved_budget_requires_revision'});
      if (msg.includes('fin_budget_idempotency_key_immutable')) return send(res, 409, {error:'idempotency_key_immutable'});
      if (msg.includes('fin_budget_revision_requires_approved_source')) return send(res, 409, {error:'revision_requires_approved_budget'});
      if (msg.includes('fin_budget_version_must_increment')) return send(res, 409, {error:'budget_version_must_increment'});
      if (msg.includes('fin_budget_audit_actor_required')) return send(res, 400, {error:'audit_actor_required'});
      if (msg.includes('fin_budget_audit_reason_required')) return send(res, 400, {error:'reason_10_1000_required'});
      if (msg.includes('fin_export_invalid_transition')) return send(res, 409, {error:'invalid_status_transition'});
      if (msg.includes('fin_export_generated_requires_storage_key')) return send(res, 400, {error:'storage_key_required_for_gerado'});
      if (msg.includes('fin_export_log_immutable')) return send(res, 409, {error:'history_immutable'});
      if (msg.includes('fin_closure_invalid_transition')) return send(res, 409, {error:'invalid_status_transition'});
      if (msg.includes('fin_closure_reopen_requires_authorization')) return send(res, 400, {error:'authorized_by_required'});
      if (msg.includes('fin_report_version_immutable')) return send(res, 409, {error:'history_immutable'});
      if (msg.includes('fin_commission_auto_pay_forbidden')) return send(res, 400, {error:'auto_paid_forbidden_nao_pagar_automaticamente'});
      if (msg.includes('fin_commission_invalid_transition')) return send(res, 409, {error:'invalid_status_transition'});
      if (msg.includes('fin_commission_payment_requires_review')) return send(res, 409, {error:'payment_requires_review'});
      if (msg.includes('fin_commission_provision_history is immutable')) return send(res, 409, {error:'history_immutable'});
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

  const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,200}$/;
  const setBudgetContext = async (client, sess, reason, revision = false) => {
    if (!isUuid(sess?.identityId)) throw Object.assign(new Error('fin_budget_audit_actor_required'), { code: 'P0001' });
    await client.query(`SELECT set_config('fin.budget_actor',$1,true), set_config('fin.budget_reason',$2,true), set_config('fin.budget_revision',$3,true)`, [sess.identityId, reason, revision ? 'on' : 'off']);
  };
  const budgetContent = (body, previous = null) => ({
    title: body.title === undefined || body.title === null ? previous?.title : cleanText(body.title),
    description: body.description === undefined || body.description === null ? previous?.description : cleanText(body.description),
    premises: body.premises === undefined || body.premises === null ? previous?.premises : cleanText(body.premises),
    period_start: body.period_start === undefined || body.period_start === null
      ? (previous?.period_start instanceof Date ? previous.period_start.toISOString().slice(0, 10) : previous?.period_start)
      : body.period_start,
    period_end: body.period_end === undefined || body.period_end === null
      ? (previous?.period_end instanceof Date ? previous.period_end.toISOString().slice(0, 10) : previous?.period_end)
      : body.period_end,
    total_revenue_cents: body.total_revenue_cents === undefined ? previous?.total_revenue_cents : parseNullableCents(body.total_revenue_cents).value,
    total_cost_cents: body.total_cost_cents === undefined ? previous?.total_cost_cents : parseNullableCents(body.total_cost_cents).value,
  });
  const budgetDateText = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10);
  const budgetContentChanged = (previous, next) => [
    'title', 'description', 'premises', 'period_start', 'period_end', 'total_revenue_cents', 'total_cost_cents',
  ].some(key => key === 'period_start' || key === 'period_end'
    ? budgetDateText(previous?.[key]) !== budgetDateText(next?.[key])
    : String(previous?.[key] ?? '') !== String(next?.[key] ?? ''));
  const sameBudgetCreation = (row, content, sess) => {
    const same = (left, right) => String(left ?? '') === String(right ?? '');
    const sameDate = (left, right) => budgetDateText(left) === budgetDateText(right);
    return same(row.created_by_identity, sess.identityId) &&
      same(row.title, content.title) && same(row.description, content.description) && same(row.premises, content.premises) &&
      sameDate(row.period_start, content.period_start) && sameDate(row.period_end, content.period_end) &&
      same(row.total_revenue_cents, content.total_revenue_cents) && same(row.total_cost_cents, content.total_cost_cents);
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
      q+=` ORDER BY period_start DESC, created_at DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { budgets: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const key = cleanText(body.idempotency_key);
      const content = budgetContent(body);
      const revenue = parseNullableCents(body.total_revenue_cents);
      const cost = parseNullableCents(body.total_cost_cents);
      if (!IDEMPOTENCY_KEY_RE.test(key)) return send(res, 400, {error:'idempotency_key_required_or_invalid'});
      if (!textInRange(content.title || '', 5, 200)) return send(res, 400, {error:'title_5_200'});
      if (!textInRange(content.description || '', 10, 2000)) return send(res, 400, {error:'description_10_2000'});
      if (!textInRange(content.premises || '', 10, 2000)) return send(res, 400, {error:'premises_10_2000_required_nao_prometer_resultado'});
      if (!isIsoDate(content.period_start) || !isIsoDate(content.period_end)) return send(res, 400, {error:'period_required'});
      if (new Date(`${content.period_end}T00:00:00Z`) < new Date(`${content.period_start}T00:00:00Z`)) return send(res, 400, {error:'period_end_gte_start'});
      if (!revenue.ok || !cost.ok) return send(res, 400, {error:'amount_cents_gte_0'});
      const protocol = generateProtocol('ORC-FIN');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await setBudgetContext(client, sess, 'Criação do orçamento com premissas explícitas; estimativa sem promessa de resultado.');
        const existing = await client.query(`SELECT * FROM fin_budgets WHERE idempotency_key=$1 FOR UPDATE`, [key]);
        if (existing.rows.length) {
          const row = existing.rows[0];
          if (!sameBudgetCreation(row, content, sess)) {
            await client.query('ROLLBACK');
            return send(res, 409, {error:'idempotency_key_conflict'});
          }
          await client.query('COMMIT');
          return send(res, 200, { budget: row, replayed: true, note:'retry_idempotente_sem_novo_orcamento' });
        }
        const inserted = await client.query(
          `INSERT INTO fin_budgets (protocol, idempotency_key, title, description, premises, period_start, period_end, total_revenue_cents, total_cost_cents, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT DO NOTHING RETURNING *`,
          [protocol, key, content.title, content.description, content.premises, content.period_start, content.period_end, revenue.value, cost.value, sess.identityId]
        );
        if (!inserted.rows.length) {
          const replay = await client.query(`SELECT * FROM fin_budgets WHERE idempotency_key=$1 FOR UPDATE`, [key]);
          if (!replay.rows.length || !sameBudgetCreation(replay.rows[0], content, sess)) {
            await client.query('ROLLBACK');
            return send(res, 409, {error:'idempotency_key_conflict'});
          }
          await client.query('COMMIT');
          return send(res, 200, { budget: replay.rows[0], replayed: true, note:'retry_idempotente_sem_novo_orcamento' });
        }
        const rows = inserted.rows;
        await auditLog({ action:'fin_budget_create', actor: sess.identityId, target: rows[0].id, meta:{ protocol, idempotency_key:key, is_estimate:true, premises_explicit:true }, client });
        await client.query('COMMIT');
        return send(res, 201, { budget: rows[0], note:'orcamento_gerencial_premissas_explicitas_nao_prometer_resultado' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        if (e?.code === '23505') {
          try {
            const replay = await pool.query(`SELECT * FROM fin_budgets WHERE idempotency_key=$1`, [key]);
            if (replay.rows.length) {
              if (sameBudgetCreation(replay.rows[0], content, sess)) return send(res, 200, { budget: replay.rows[0], replayed: true, note:'retry_idempotente_sem_novo_orcamento' });
              return send(res, 409, {error:'idempotency_key_conflict'});
            }
          } catch {}
        }
        return dbFailure(res, e, { duplicate:'idempotency_key_conflict', invalid:'invalid_budget' });
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
        const next = budgetContent(body, previous);
        const revenue = body.total_revenue_cents === undefined ? { ok:true, value:previous.total_revenue_cents } : parseNullableCents(body.total_revenue_cents);
        const cost = body.total_cost_cents === undefined ? { ok:true, value:previous.total_cost_cents } : parseNullableCents(body.total_cost_cents);
        if (!textInRange(next.title || '', 5, 200)) { await client.query('ROLLBACK'); return send(res, 400, {error:'title_5_200'}); }
        if (!textInRange(next.description || '', 10, 2000)) { await client.query('ROLLBACK'); return send(res, 400, {error:'description_10_2000'}); }
        if (!textInRange(next.premises || '', 10, 2000)) { await client.query('ROLLBACK'); return send(res, 400, {error:'premises_10_2000_required_nao_prometer_resultado'}); }
        if (!isIsoDate(next.period_start) || !isIsoDate(next.period_end)) { await client.query('ROLLBACK'); return send(res, 400, {error:'period_required'}); }
        if (new Date(`${next.period_end}T00:00:00Z`) < new Date(`${next.period_start}T00:00:00Z`)) { await client.query('ROLLBACK'); return send(res, 400, {error:'period_end_gte_start'}); }
        if (!revenue.ok || !cost.ok) { await client.query('ROLLBACK'); return send(res, 400, {error:'amount_cents_gte_0'}); }
        next.total_revenue_cents = revenue.value;
        next.total_cost_cents = cost.value;
        const contentChanged = budgetContentChanged(previous, next);
        const revision = body.revision === true;
        const reason = cleanText(body.reason ?? body.revision_reason);
        if (reason && !textInRange(reason, 10, 1000)) { await client.query('ROLLBACK'); return send(res, 400, {error:'reason_10_1000_required'}); }
        if (revision) {
          if (previous.status !== 'aprovado') { await client.query('ROLLBACK'); return send(res, 409, {error:'revision_requires_approved_budget'}); }
          if (!contentChanged) { await client.query('ROLLBACK'); return send(res, 400, {error:'revision_changes_required'}); }
          if (!textInRange(reason, 10, 1000)) { await client.query('ROLLBACK'); return send(res, 400, {error:'revision_reason_10_1000_required'}); }
        } else if (previous.status === 'aprovado' && contentChanged) {
          await client.query('ROLLBACK');
          return send(res, 409, {error:'approved_budget_requires_revision'});
        }
        let nextStatus = previous.status;
        if (body.status !== undefined && body.status !== null) {
          if (!BUDGET_STATUSES.has(body.status)) { await client.query('ROLLBACK'); return send(res, 400, {error:'invalid_status'}); }
          nextStatus = body.status;
        }
        if (revision) {
          if (body.status !== undefined && body.status !== 'em_revisao') { await client.query('ROLLBACK'); return send(res, 409, {error:'revision_status_is_em_revisao'}); }
          nextStatus = 'em_revisao';
        } else if (nextStatus !== previous.status && !BUDGET_TRANSITIONS[previous.status]?.has(nextStatus)) {
          await client.query('ROLLBACK'); return send(res, 409, {error:'invalid_status_transition'});
        }
        if (nextStatus === 'aprovado' && previous.status !== 'aprovado' && !textInRange(reason, 10, 1000)) {
          await client.query('ROLLBACK'); return send(res, 400, {error:'approval_reason_10_1000_required'});
        }
        const nextVersion = contentChanged ? Number(previous.budget_version || 1) + 1 : Number(previous.budget_version || 1);
        const actorReason = reason || (nextStatus !== previous.status
          ? `Transição de orçamento ${previous.status} para ${nextStatus} solicitada pela sessão autenticada.`
          : 'Edição do orçamento em estado não aprovado solicitada pela sessão autenticada.');
        await setBudgetContext(client, sess, actorReason, revision);
        let approvedBy = previous.approved_by_identity;
        let approvedAt = previous.approved_at;
        if (nextStatus === 'aprovado' && previous.status !== 'aprovado') {
          approvedBy = sess.identityId;
          approvedAt = new Date();
        } else if (nextStatus === 'em_revisao' || nextStatus === 'rejeitado') {
          approvedBy = null;
          approvedAt = null;
        }
        const { rows } = await client.query(
          `UPDATE fin_budgets
              SET status=$1, title=$2, description=$3, premises=$4, period_start=$5, period_end=$6,
                  total_revenue_cents=$7, total_cost_cents=$8, budget_version=$9,
                  approved_by_identity=$10, approved_at=$11, updated_at=NOW()
            WHERE id=$12 RETURNING *`,
          [nextStatus, next.title, next.description, next.premises, next.period_start, next.period_end,
            next.total_revenue_cents, next.total_cost_cents, nextVersion, approvedBy, approvedAt, id]
        );
        await auditLog({
          action: revision ? 'fin_budget_revision' : 'fin_budget_update',
          actor: sess.identityId,
          target: id,
          meta:{ protocol: previous.protocol, previous_status: previous.status, next_status: rows[0].status, previous_version: previous.budget_version, next_version: rows[0].budget_version, revision, reason: actorReason, is_estimate:true },
          client,
        });
        await client.query('COMMIT');
        return send(res, 200, { budget: rows[0], revised: revision });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'idempotency_key_conflict', invalid:'invalid_budget' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleBudgetHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const budgetId = url.searchParams.get('budget_id');
    if (!isUuid(budgetId)) return send(res, 400, {error:'invalid_budget_id'});
    try {
      const { rows } = await pool.query(
        `SELECT h.*, b.protocol, b.title FROM fin_budget_history h
         JOIN fin_budgets b ON b.id=h.budget_id
         WHERE h.budget_id=$1 ORDER BY h.changed_at ASC, h.id ASC LIMIT 200`, [budgetId]
      );
      return send(res, 200, { history: rows });
    } catch { return send(res, 500, {error:'internal'}); }
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
      // A client may send an old margin field, but it is deliberately ignored.
      // The database trigger derives the value from the two cents columns.
      if (!isUuid(budget_id)) return send(res, 400, {error:'invalid_budget_id'});
      if (!SCENARIO_TYPES.has(scenario_type)) return send(res, 400, {error:'invalid_scenario_type'});
      if (!textInRange(title, 5, 200)) return send(res, 400, {error:'title_5_200'});
      if (!textInRange(premises, 10, 2000)) return send(res, 400, {error:'premises_10_2000_required_cenario_expansao_premissas_explicitas'});
      if (!projected_revenue.ok || !projected_cost.ok) return send(res, 400, {error:'amount_cents_gte_0'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await setBudgetContext(client, sess, `Criação do cenário ${scenario_type}; estimativa sem promessa de resultado.`);
        const budget = await client.query(`SELECT id, protocol, status FROM fin_budgets WHERE id=$1 FOR UPDATE`, [budget_id]);
        if (!budget.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'budget_not_found'}); }
        const dup = await client.query(`SELECT id FROM fin_budget_scenarios WHERE budget_id=$1 AND scenario_type=$2 FOR UPDATE`, [budget_id, scenario_type]);
        if (dup.rows.length) { await client.query('ROLLBACK'); return send(res, 409, {error:'duplicate_scenario_type_for_budget'}); }
        const { rows } = await client.query(
          `INSERT INTO fin_budget_scenarios (budget_id, scenario_type, title, premises, projected_revenue_cents, projected_cost_cents, projected_margin_percent, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,NULL,$7) RETURNING *`,
          [budget_id, scenario_type, title, premises, projected_revenue.value, projected_cost.value, sess.identityId]
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
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      if (status && !EXPORT_STATUSES.has(status)) return send(res, 400, {error:'invalid_status'});
      let q = `SELECT * FROM fin_exports WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { exports: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const period_start = body.period_start;
      const period_end = body.period_end;
      if (!isIsoDate(period_start) || !isIsoDate(period_end)) return send(res, 400, {error:'period_required'});
      if (new Date(`${period_end}T00:00:00Z`) < new Date(`${period_start}T00:00:00Z`)) return send(res, 400, {error:'period_end_gte_start'});
      if (!isPlainObject(body.filters ?? {})) return send(res, 400, {error:'filters_object_required'});
      if (!isPlainObject(body.totals ?? {})) return send(res, 400, {error:'totals_object_required'});
      const filters = body.filters ?? {};
      const totals = body.totals ?? {};
      const file_name = optionalText(body.file_name, 1, 500);
      const file_url = optionalText(body.file_url, 5, 1000);
      const storage_key = optionalText(body.storage_key, 5, 500);
      if (!file_name.ok) return send(res, 400, {error:'file_name_1_500'});
      if (!file_url.ok) return send(res, 400, {error:'file_url_5_1000'});
      if (!storage_key.ok) return send(res, 400, {error:'storage_key_5_500'});
      const totalRecords = parseNullableCents(body.total_records);
      const totalAmount = parseNullableCents(body.total_amount_cents);
      if (!totalRecords.ok || !totalAmount.ok) return send(res, 400, {error:'totals_gte_0'});
      if (body.is_accountant_limited === false) return send(res, 400, {error:'accountant_limited_required'});
      const protocol = generateProtocol('EXP-FIN');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (storage_key.value) {
          // Chave de armazenamento é a chave de idempotência da exportação: a
          // duplicidade é recusada sob bloqueio, não apenas pelo índice único.
          const dup = await client.query(`SELECT id, protocol FROM fin_exports WHERE storage_key=$1 FOR UPDATE`, [storage_key.value]);
          if (dup.rows.length) { await client.query('ROLLBACK'); return send(res, 409, {error:'duplicate_storage_key'}); }
        }
        const { rows } = await client.query(
          `INSERT INTO fin_exports (protocol, period_start, period_end, filters, totals, total_records, total_amount_cents, file_name, file_url, storage_key, is_accountant_limited, access_role, requested_by_identity, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'contador',$11,'pendente') RETURNING *`,
          [protocol, period_start, period_end, JSON.stringify(filters), JSON.stringify(totals), totalRecords.value ?? 0, totalAmount.value ?? 0, file_name.value, file_url.value, storage_key.value, sess.identityId||null]
        );
        await client.query(
          `INSERT INTO fin_export_logs (export_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`,
          [rows[0].id, 'export_create', sess.identityId||null, JSON.stringify({ period_start, period_end, filters, totals, is_accountant_limited:true })]
        );
        await auditLog({ action:'fin_export_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{ protocol, period_start, period_end, is_accountant_limited:true, access_role:'contador' }, client });
        await client.query('COMMIT');
        return send(res, 201, { export: rows[0], note:'exportacao_periodo_trilha_filtros_totais_conciliaveis_acesso_limitado_contador' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_storage_key', invalid:'invalid_export' });
      } finally { client.release(); }
    }
    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const id = body.id;
      if (!isUuid(id)) return send(res, 400, {error:'invalid_id'});
      if (body.is_accountant_limited === false) return send(res, 400, {error:'accountant_limited_required'});
      const file_name = optionalText(body.file_name, 1, 500);
      const file_url = optionalText(body.file_url, 5, 1000);
      const storage_key = optionalText(body.storage_key, 5, 500);
      if (!file_name.ok) return send(res, 400, {error:'file_name_1_500'});
      if (!file_url.ok) return send(res, 400, {error:'file_url_5_1000'});
      if (!storage_key.ok) return send(res, 400, {error:'storage_key_5_500'});
      if (body.totals !== undefined && body.totals !== null && !isPlainObject(body.totals)) return send(res, 400, {error:'totals_object_required'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT * FROM fin_exports WHERE id=$1 FOR UPDATE`, [id]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'not_found'}); }
        const previous = found.rows[0];
        let nextStatus = previous.status;
        if (body.status !== undefined && body.status !== null) {
          if (!EXPORT_STATUSES.has(body.status)) { await client.query('ROLLBACK'); return send(res, 400, {error:'invalid_status'}); }
          nextStatus = body.status;
          if (nextStatus !== previous.status && !EXPORT_TRANSITIONS[previous.status]?.has(nextStatus)) {
            await client.query('ROLLBACK'); return send(res, 409, {error:'invalid_status_transition'});
          }
        }
        const nextStorageKey = storage_key.value ?? previous.storage_key;
        if (nextStatus === 'gerado' && !nextStorageKey) {
          await client.query('ROLLBACK'); return send(res, 400, {error:'storage_key_required_for_gerado'});
        }
        if (storage_key.value && storage_key.value !== previous.storage_key) {
          const dup = await client.query(`SELECT id FROM fin_exports WHERE storage_key=$1 AND id<>$2 FOR UPDATE`, [storage_key.value, id]);
          if (dup.rows.length) { await client.query('ROLLBACK'); return send(res, 409, {error:'duplicate_storage_key'}); }
        }
        const { rows } = await client.query(
          `UPDATE fin_exports
              SET status=$1::fin_export_status, file_name=COALESCE($2,file_name), file_url=COALESCE($3,file_url), storage_key=COALESCE($4,storage_key),
                  totals=COALESCE($5::jsonb,totals),
                  generated_at=CASE WHEN $1::text='gerado' THEN COALESCE(generated_at, NOW()) ELSE generated_at END,
                  expires_at=CASE WHEN $1::text='gerado' THEN COALESCE(expires_at, NOW()+INTERVAL '30 days') ELSE expires_at END,
                  updated_at=NOW()
            WHERE id=$6 RETURNING *`,
          [nextStatus, file_name.value, file_url.value, storage_key.value, body.totals === undefined || body.totals === null ? null : JSON.stringify(body.totals), id]
        );
        await client.query(
          `INSERT INTO fin_export_logs (export_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`,
          [id, 'export_update', sess.identityId||null, JSON.stringify({ previous_status: previous.status, next_status: rows[0].status })]
        );
        await auditLog({ action:'fin_export_update', actor: sess.identityId||'unknown', target: id, meta:{ protocol: previous.protocol, previous_status: previous.status, next_status: rows[0].status, is_accountant_limited:true }, client });
        await client.query('COMMIT');
        return send(res, 200, { export: rows[0] });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_storage_key', invalid:'invalid_export' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleExportLogs = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const export_id = url.searchParams.get('export_id');
    if (export_id && !isUuid(export_id)) return send(res, 400, {error:'invalid_export_id'});
    let q = `SELECT * FROM fin_export_logs WHERE 1=1`; const params=[]; let idx=1;
    if (export_id) { q+=` AND export_id=$${idx++}`; params.push(export_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try { const { rows } = await pool.query(q, params); return send(res, 200, { logs: rows }); }
    catch { return send(res, 500, {error:'internal'}); }
  };

  const handleClosures = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      if (status && !CLOSURE_STATUSES.has(status)) return send(res, 400, {error:'invalid_status'});
      let q = `SELECT * FROM fin_competence_closures WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY competence_date DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { closures: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const competence_date = body.competence_date;
      if (!isIsoDate(competence_date)) return send(res, 400, {error:'competence_date_required'});
      const notes = optionalText(body.notes, 10, 2000);
      if (!notes.ok) return send(res, 400, {error:'notes_10_2000'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const dup = await client.query(`SELECT id FROM fin_competence_closures WHERE competence_date=$1 FOR UPDATE`, [competence_date]);
        if (dup.rows.length) { await client.query('ROLLBACK'); return send(res, 409, {error:'duplicate_competence'}); }
        const { rows } = await client.query(
          `INSERT INTO fin_competence_closures (competence_date, status, closed_by_identity, closed_at, notes)
           VALUES ($1,'fechada',$2,NOW(),$3) RETURNING *`,
          [competence_date, sess.identityId||null, notes.value]
        );
        await client.query(
          `INSERT INTO fin_report_versions (closure_id, version, report_type, data, totals, is_preserved, created_by_identity)
           VALUES ($1,1,'fechamento_competencia',$2,$3,true,$4)`,
          [rows[0].id, JSON.stringify({ competence_date, status:'fechada', closed_by: sess.identityId||null }), JSON.stringify(isPlainObject(body.totals) ? body.totals : {}), sess.identityId||null]
        );
        await auditLog({ action:'fin_closure_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{ competence_date, status:'fechada', version:1 }, client });
        await client.query('COMMIT');
        return send(res, 201, { closure: rows[0], note:'fechamento_competencia_preservar_versoes_relatorio' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_competence', invalid:'invalid_closure' });
      } finally { client.release(); }
    }
    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const id = body.id;
      const action = body.action;
      if (!isUuid(id)) return send(res, 400, {error:'invalid_id'});
      if (!CLOSURE_ACTIONS.has(action)) return send(res, 400, {error:'invalid_action'});
      const reason = cleanText(action === 'reopen' ? body.reopen_reason : body.close_reason);
      if (!textInRange(reason, 10, 1000)) {
        return send(res, 400, {error: action === 'reopen' ? 'reopen_reason_10_1000_required_reabertura_autorizada' : 'close_reason_10_1000_required'});
      }
      const authorizedBy = action === 'reopen' ? (body.authorized_by_identity ?? sess.identityId ?? null) : null;
      if (action === 'reopen') {
        if (!authorizedBy) return send(res, 400, {error:'authorized_by_required'});
        if (!isUuid(authorizedBy)) return send(res, 400, {error:'invalid_authorized_by_identity'});
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT * FROM fin_competence_closures WHERE id=$1 FOR UPDATE`, [id]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'not_found'}); }
        const previous = found.rows[0];
        const nextStatus = action === 'reopen' ? 'reaberta' : 'fechada';
        if (!CLOSURE_TRANSITIONS[previous.status]?.has(nextStatus)) {
          await client.query('ROLLBACK'); return send(res, 409, {error:'invalid_status_transition'});
        }
        const updated = action === 'reopen'
          ? await client.query(
              `UPDATE fin_competence_closures
                  SET status='reaberta', reopened_by_identity=$1, reopened_at=NOW(), reopen_reason=$2,
                      authorized_by_identity=$3, authorized_at=NOW(), updated_at=NOW()
                WHERE id=$4 RETURNING *`,
              [sess.identityId||null, reason, authorizedBy, id]
            )
          : await client.query(
              `UPDATE fin_competence_closures
                  SET status='fechada', closed_by_identity=$1, closed_at=NOW(), updated_at=NOW()
                WHERE id=$2 RETURNING *`,
              [sess.identityId||null, id]
            );
        const maxVer = await client.query(`SELECT COALESCE(MAX(version),0)+1 AS next FROM fin_report_versions WHERE closure_id=$1`, [id]);
        const nextVersion = maxVer.rows[0].next;
        await client.query(
          `INSERT INTO fin_report_versions (closure_id, version, report_type, data, totals, is_preserved, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,true,$6)`,
          [
            id,
            nextVersion,
            action === 'reopen' ? 'reabertura_competencia' : 'fechamento_competencia',
            JSON.stringify({ previous_status: previous.status, next_status: nextStatus, reason, authorized_by: authorizedBy }),
            JSON.stringify(isPlainObject(body.totals) ? body.totals : {}),
            sess.identityId||null,
          ]
        );
        await auditLog({
          action: action === 'reopen' ? 'fin_closure_reopen' : 'fin_closure_close',
          actor: sess.identityId||'unknown',
          target: id,
          meta:{ previous_status: previous.status, next_status: nextStatus, reason, authorized_by: authorizedBy, version: nextVersion },
          client,
        });
        await client.query('COMMIT');
        return send(res, 200, { closure: updated.rows[0], version: nextVersion, note:'reabertura_autorizada_preservar_versoes_relatorio' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_competence', invalid:'invalid_closure' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleReportVersions = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const closure_id = url.searchParams.get('closure_id');
    if (closure_id && !isUuid(closure_id)) return send(res, 400, {error:'invalid_closure_id'});
    let q = `SELECT * FROM fin_report_versions WHERE 1=1`; const params=[]; let idx=1;
    if (closure_id) { q+=` AND closure_id=$${idx++}`; params.push(closure_id); }
    q+=` ORDER BY version DESC LIMIT 200`;
    try { const { rows } = await pool.query(q, params); return send(res, 200, { versions: rows }); }
    catch { return send(res, 500, {error:'internal'}); }
  };

  const handleCommissionProvisions = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (guardMutation(req, res, sess)) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const rule_id = url.searchParams.get('rule_id');
      const status = url.searchParams.get('status');
      if (rule_id && !isUuid(rule_id)) return send(res, 400, {error:'invalid_rule_id'});
      if (status && !PROVISION_STATUSES.has(status)) return send(res, 400, {error:'invalid_status'});
      let q = `SELECT * FROM fin_commission_provisions WHERE 1=1`; const params=[]; let idx=1;
      if (rule_id) { q+=` AND rule_id=$${idx++}`; params.push(rule_id); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY provision_date DESC LIMIT 200`;
      try { const { rows } = await pool.query(q, params); return send(res, 200, { provisions: rows }); }
      catch { return send(res, 500, {error:'internal'}); }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      if (body.is_auto_paid === true) return send(res, 400, {error:'auto_paid_forbidden_nao_pagar_automaticamente'});
      if (body.status !== undefined && body.status !== null && body.status !== 'provisionada') return send(res, 400, {error:'initial_status_must_be_provisionada'});
      const optionalIds = { rule_id: body.rule_id ?? null, commission_id: body.commission_id ?? null, contract_id: body.contract_id ?? null };
      for (const [key, value] of Object.entries(optionalIds)) {
        if (value !== null && !isUuid(value)) return send(res, 400, {error:`invalid_${key}`});
      }
      const provision_date = body.provision_date ?? new Date().toISOString().slice(0,10);
      if (!isIsoDate(provision_date)) return send(res, 400, {error:'invalid_provision_date'});
      const amount = parseNullableCents(body.amount_cents);
      if (!amount.ok || amount.value === null) return send(res, 400, {error:'amount_cents_gte_0'});
      const notes = optionalText(body.notes, 10, 2000);
      if (!notes.ok) return send(res, 400, {error:'notes_10_2000'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO fin_commission_provisions (rule_id, commission_id, contract_id, provision_date, amount_cents, provisioned_by_identity, notes, is_auto_paid, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false,'provisionada') RETURNING *`,
          [optionalIds.rule_id, optionalIds.commission_id, optionalIds.contract_id, provision_date, amount.value, sess.identityId||null, notes.value]
        );
        await client.query(
          `INSERT INTO fin_commission_provision_history (provision_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_auto_paid_attempt)
           VALUES ($1,NULL,'provisionada',NULL,$2,$3,$4,false)`,
          [rows[0].id, amount.value, sess.identityId||null, 'Provisão de comissão ligada à regra CRM-25; revisão manual obrigatória, sem pagamento automático']
        );
        await auditLog({ action:'fin_commission_provision_create', actor: sess.identityId||'unknown', target: rows[0].id, meta:{ rule_id: optionalIds.rule_id, commission_id: optionalIds.commission_id, amount_cents: amount.value, is_auto_paid:false }, client });
        await client.query('COMMIT');
        return send(res, 201, { provision: rows[0], note:'comissoes_ligadas_regra_CRM25_provisao_revisao_nao_pagar_automaticamente' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_provision', invalid:'invalid_provision' });
      } finally { client.release(); }
    }
    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req); } catch { return send(res, 400, {error:'invalid_json'}); }
      const id = body.id;
      if (!isUuid(id)) return send(res, 400, {error:'invalid_id'});
      if (body.is_auto_paid === true) return send(res, 400, {error:'auto_paid_forbidden_nao_pagar_automaticamente'});
      const reason = cleanText(body.reason);
      if (!textInRange(reason, 10, 1000)) return send(res, 400, {error:'reason_10_1000_required'});
      if (body.status === undefined || body.status === null) return send(res, 400, {error:'status_required'});
      if (!PROVISION_STATUSES.has(body.status)) return send(res, 400, {error:'invalid_status'});
      const nextStatus = body.status;
      const revisionReason = optionalText(body.revision_reason, 10, 1000);
      if (!revisionReason.ok) return send(res, 400, {error:'revision_reason_10_1000_required'});
      if ((nextStatus === 'em_revisao' || nextStatus === 'revisada') && !revisionReason.value) {
        return send(res, 400, {error:'revision_reason_10_1000_required'});
      }
      if (nextStatus === 'paga' && body.manual_payment_confirmation !== true) {
        return send(res, 400, {error:'manual_payment_confirmation_required_nao_pagar_automaticamente'});
      }
      const amount = body.amount_cents === undefined || body.amount_cents === null ? { ok:true, value:null } : parseNullableCents(body.amount_cents);
      if (!amount.ok) return send(res, 400, {error:'amount_cents_gte_0'});
      const notes = optionalText(body.notes, 10, 2000);
      if (!notes.ok) return send(res, 400, {error:'notes_10_2000'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query(`SELECT * FROM fin_commission_provisions WHERE id=$1 FOR UPDATE`, [id]);
        if (!found.rows.length) { await client.query('ROLLBACK'); return send(res, 404, {error:'not_found'}); }
        const previous = found.rows[0];
        if (nextStatus !== previous.status && !PROVISION_TRANSITIONS[previous.status]?.has(nextStatus)) {
          await client.query('ROLLBACK');
          return send(res, 409, {error: nextStatus === 'paga' ? 'payment_requires_review' : 'invalid_status_transition'});
        }
        if (nextStatus === 'paga' && previous.status !== 'revisada') {
          await client.query('ROLLBACK'); return send(res, 409, {error:'payment_requires_review'});
        }
        if (previous.status === 'paga' && nextStatus !== 'paga') {
          await client.query('ROLLBACK'); return send(res, 409, {error:'invalid_status_transition'});
        }
        const { rows } = await client.query(
          `UPDATE fin_commission_provisions
              SET status=$1::fin_commission_provision_status,
                  amount_cents=COALESCE($2::bigint,amount_cents),
                  revision_reason=COALESCE($3::text,revision_reason),
                  reviewed_by_identity=CASE WHEN $1::text IN ('em_revisao','revisada') THEN $4::uuid ELSE reviewed_by_identity END,
                  reviewed_at=CASE WHEN $1::text IN ('em_revisao','revisada') THEN NOW() ELSE reviewed_at END,
                  paid_at=CASE WHEN $1::text='paga' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
                  paid_by_identity=CASE WHEN $1::text='paga' THEN $4::uuid ELSE paid_by_identity END,
                  notes=COALESCE($5::text,notes),
                  is_auto_paid=false,
                  updated_at=NOW()
            WHERE id=$6 RETURNING *`,
          [nextStatus, amount.value, revisionReason.value, sess.identityId||null, notes.value, id]
        );
        await client.query(
          `INSERT INTO fin_commission_provision_history (provision_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_auto_paid_attempt)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false)`,
          [id, previous.status, rows[0].status, previous.amount_cents, rows[0].amount_cents, sess.identityId||null, reason]
        );
        await auditLog({
          action: nextStatus === 'paga' ? 'fin_commission_provision_pay' : 'fin_commission_provision_review',
          actor: sess.identityId||'unknown',
          target: id,
          meta:{ previous_status: previous.status, next_status: rows[0].status, reason, is_auto_paid:false, manual_payment_confirmation: nextStatus === 'paga' },
          client,
        });
        await client.query('COMMIT');
        return send(res, 200, { provision: rows[0], note:'registro_manual_de_baixa_sem_pagamento_automatico_nem_gateway_real' });
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        return dbFailure(res, e, { duplicate:'duplicate_provision', invalid:'invalid_provision' });
      } finally { client.release(); }
    }
    return send(res, 405, {error:'method_not_allowed'});
  };

  const handleCommissionProvisionHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res, 405, {error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const provision_id = url.searchParams.get('provision_id');
    if (provision_id && !isUuid(provision_id)) return send(res, 400, {error:'invalid_provision_id'});
    let q = `SELECT * FROM fin_commission_provision_history WHERE 1=1`; const params=[]; let idx=1;
    if (provision_id) { q+=` AND provision_id=$${idx++}`; params.push(provision_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try { const { rows } = await pool.query(q, params); return send(res, 200, { history: rows }); }
    catch { return send(res, 500, {error:'internal'}); }
  };

  return {
    handleBudgets,
    handleBudgetHistory,
    handleBudgetScenarios,
    handleExports,
    handleExportLogs,
    handleClosures,
    handleReportVersions,
    handleCommissionProvisions,
    handleCommissionProvisionHistory,
  };
}
