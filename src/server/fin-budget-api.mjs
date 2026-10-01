export function createFinBudgetApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const generateProtocol = (prefix) => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const rnd = Math.random().toString(36).substring(2,6).toUpperCase();
    return `${prefix}-${y}${m}${day}-${rnd}`;
  };
  const getSession = async (req) => { try { return await requireSession(req); } catch { return null; } };
  const checkAuth = async (req, res) => {
    const sess = await getSession(req);
    if (!sess) { res.writeHead(401, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return null; }
    const r = (sess.role||'').toLowerCase();
    if (!['admin','ti','financeiro','finance'].includes(r)) {
      res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return null;
    }
    return sess;
  };
  const readJson = async (req) => new Promise((resolve, reject) => {
    let data=''; req.on('data', c=> data+=c); req.on('end', ()=> { try { resolve(data?JSON.parse(data):{}); } catch(e){ reject(e); } });
  });

  // FIN-13 orçamento gerencial e cenários de expansão: premissas explícitas
  // (texto com faixa mínima, ORIGEM do número e DATA-BASE), estimativa que
  // nunca se disfarça de resultado (projetado e realizado são campos
  // distintos), completude calculada pelo banco, premissas versionadas cuja
  // alteração derruba aprovação e aprovação que não cria compromisso nenhum.
  // Nada aqui promete resultado.
  const BUDGET_STATUSES = new Set(['rascunho','em_revisao','aprovado','rejeitado','arquivado']);
  const BUDGET_TRANSITIONS = new Set(['rascunho','em_revisao','aprovado','rejeitado','arquivado']);
  const SCENARIO_TYPES = new Set(['conservador','base','otimista','expansao','pessimista']);
  const BUDGET_ENTITIES = new Set(['budget','scenario']);
  const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const isoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  const cents = v => v == null ? null : (Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null);
  const send = (res, code, body) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(body)); };
  const isAuditUnavailable = e => e?.code === '42P01' || /audit_log/i.test(String(e?.message || ''));
  const FIN13_GUARD_CODES = new Set([
    'fin_budget_initial_status_must_be_rascunho',
    'fin_budget_initial_fields_invalid',
    'fin_budget_identity_fields_immutable',
    'fin_budget_invalid_status_transition',
    'fin_budget_premise_change_drops_approval',
    'fin_budget_revision_must_not_change_status',
    'fin_budget_premises_version_must_increment',
    'fin_budget_premises_version_immutable_without_change',
    'fin_scenario_initial_status_must_be_rascunho',
    'fin_scenario_initial_fields_invalid',
    'fin_scenario_identity_fields_immutable',
    'fin_scenario_invalid_status_transition',
    'fin_scenario_premise_change_drops_approval',
    'fin_scenario_revision_must_not_change_status',
    'fin_scenario_premises_version_must_increment',
    'fin_scenario_premises_version_immutable_without_change',
  ]);
  const budgetFailure = (res, e) => {
    if (isAuditUnavailable(e)) return send(res,503,{error:'audit_unavailable'});
    if (e?.code === '23505') {
      const key = String(e.constraint||'');
      return send(res,409,{error:key.includes('idempotency')?'duplicate_idempotency_key':(key.includes('scenario_type')||key.includes('budget_id'))?'duplicate_scenario_type_for_budget':'duplicate'});
    }
    if (e?.code === '23503') return send(res,400,{error:'invalid_reference'});
    if (e?.code === '23514') {
      const message = String(e.message||'');
      const known = [...FIN13_GUARD_CODES].find(code => message === code);
      return send(res,400,{error:known||'invalid_budget_transition'});
    }
    if (e?.code === '22P02' || e?.code === '22007') return send(res,400,{error:'invalid'});
    return send(res,500,{error:'internal'});
  };
  const insertBudgetHistory = (client, entity_type, entity_id, previous_status, next_status, actor, reason, metadata) =>
    client.query(
      'INSERT INTO fin_budget_history (entity_type,entity_id,previous_status,next_status,changed_by_identity,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [entity_type, entity_id, previous_status, next_status, actor, reason, JSON.stringify(metadata||{})]
    );

  const handleBudgets = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
      let q = 'SELECT * FROM fin_budgets WHERE 1=1';
      const status = url.searchParams.get('status');
      if (status) { if (!BUDGET_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q += ` AND status=$${params.length}`; }
      q += ' ORDER BY period_start DESC, created_at DESC LIMIT 200';
      try { return send(res,200,{budgets:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const premises = typeof body.premises === 'string' ? body.premises.trim() : '';
      const premise_source = typeof body.premise_source === 'string' ? body.premise_source.trim() : '';
      const premise_base_date = body.premise_base_date;
      const period_start = body.period_start, period_end = body.period_end;
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      const total_revenue_cents = cents(body.total_revenue_cents);
      const total_cost_cents = cents(body.total_cost_cents);
      if (body.status != null) return send(res,400,{error:'budget_starts_rascunho_status_is_a_transition'});
      if (body.is_estimate === false) return send(res,400,{error:'estimate_is_permanent_nao_prometer_resultado'});
      if (body.approved_by_identity != null || body.approved_at != null || body.premises_version != null) return send(res,400,{error:'budget_client_fields_refused'});
      if (title.length < 5 || title.length > 200) return send(res,400,{error:'title_5_200'});
      if (description.length < 10 || description.length > 2000) return send(res,400,{error:'description_10_2000'});
      if (premises.length < 10 || premises.length > 2000) return send(res,400,{error:'premises_10_2000_required'});
      if (premise_source.length < 5 || premise_source.length > 200) return send(res,400,{error:'premise_source_5_200_required'});
      if (!isoDate(premise_base_date)) return send(res,400,{error:'premise_base_date_required'});
      if (!isoDate(period_start) || !isoDate(period_end)) return send(res,400,{error:'period_required'});
      if (period_end < period_start) return send(res,400,{error:'period_end_gte_start'});
      if (idempotency_key.length < 8 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_8_200'});
      if (body.total_revenue_cents != null && total_revenue_cents === null) return send(res,400,{error:'invalid_total_revenue_cents'});
      if (body.total_cost_cents != null && total_cost_cents === null) return send(res,400,{error:'invalid_total_cost_cents'});
      const protocol = generateProtocol('ORC-FIN');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const created = await client.query(
          `INSERT INTO fin_budgets (protocol,title,description,premises,premise_source,premise_base_date,period_start,period_end,total_revenue_cents,total_cost_cents,status,is_estimate,idempotency_key,created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'rascunho',true,$11,$12) RETURNING *`,
          [protocol,title,description,premises,premise_source,premise_base_date,period_start,period_end,total_revenue_cents,total_cost_cents,idempotency_key,actor]
        );
        const budget = created.rows[0];
        await insertBudgetHistory(client,'budget',budget.id,null,'rascunho',actor,'Orçamento cadastrado com premissas explícitas: projeção, nunca resultado',{protocol,premises_version:1,is_estimate:true});
        await auditLog({action:'fin_budget_create',actor,target:budget.id,meta:{protocol,premise_base_date,premises_version:1,is_estimate:true},client});
        await client.query('COMMIT');
        return send(res,201,{budget,is_estimate:true,note:'orcamento_gerencial_premissas_explicitas_nao_prometer_resultado'});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return budgetFailure(res,e); }
      finally { client.release(); }
    }

    // PATCH: transição de status OU revisão de premissas — nunca os dois juntos.
    const id = body.id, status = body.status;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    if (body.premises_version != null || body.approved_by_identity != null || body.approved_at != null) return send(res,400,{error:'budget_client_fields_refused'});
    const hasPremiseEdit = ['premises','premise_source','premise_base_date','period_start','period_end','total_revenue_cents','total_cost_cents'].some(key => body[key] !== undefined);
    if (status !== undefined && hasPremiseEdit) return send(res,400,{error:'status_transition_and_premise_revision_are_separate'});

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_budgets WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous = found.rows[0];

      if (status !== undefined) {
        if (!BUDGET_TRANSITIONS.has(status)) { await client.query('ROLLBACK'); return send(res,400,{error:'invalid_transition'}); }
        if (previous.status === status) { await client.query('ROLLBACK'); return send(res,409,{error:'budget_already_in_status'}); }
        const updated = await client.query(
          `UPDATE fin_budgets
              SET status=$1::fin_budget_status,
                  approved_by_identity=CASE WHEN $1::text='aprovado' THEN $2::uuid ELSE NULL END,
                  approved_at=CASE WHEN $1::text='aprovado' THEN NOW() ELSE NULL END
            WHERE id=$3 RETURNING *`,
          [status, actor, id]
        );
        await insertBudgetHistory(client,'budget',id,previous.status,status,actor,reason,{premises_version:previous.premises_version});
        await auditLog({action:'fin_budget_transition',actor,target:id,meta:{previous_status:previous.status,next_status:status,reason,premises_version:previous.premises_version},client});
        await client.query('COMMIT');
        // Aprovar orçamento não cria compromisso: nenhum recebível, pagável,
        // despesa, meta ou provisão nasce desta transição.
        return send(res,200,{budget:updated.rows[0],is_estimate:true,note:'aprovacao_de_orcamento_nao_cria_compromisso'});
      }

      // Revisão de premissas: versiona e, se o orçamento estava aprovado,
      // retira a aprovação (a decisão foi tomada sobre outras premissas).
      const revision = {};
      if (body.premises !== undefined) { const v = String(body.premises).trim(); if (v.length < 10 || v.length > 2000) { await client.query('ROLLBACK'); return send(res,400,{error:'premises_10_2000_required'}); } revision.premises = v; }
      if (body.premise_source !== undefined) { const v = String(body.premise_source).trim(); if (v.length < 5 || v.length > 200) { await client.query('ROLLBACK'); return send(res,400,{error:'premise_source_5_200_required'}); } revision.premise_source = v; }
      if (body.premise_base_date !== undefined) { if (!isoDate(body.premise_base_date)) { await client.query('ROLLBACK'); return send(res,400,{error:'premise_base_date_required'}); } revision.premise_base_date = body.premise_base_date; }
      if (body.period_start !== undefined) { if (!isoDate(body.period_start)) { await client.query('ROLLBACK'); return send(res,400,{error:'period_required'}); } revision.period_start = body.period_start; }
      if (body.period_end !== undefined) { if (!isoDate(body.period_end)) { await client.query('ROLLBACK'); return send(res,400,{error:'period_required'}); } revision.period_end = body.period_end; }
      if (revision.period_start !== undefined || revision.period_end !== undefined) {
        const start = revision.period_start !== undefined ? revision.period_start : previous.period_start;
        const end = revision.period_end !== undefined ? revision.period_end : previous.period_end;
        if (end < start) { await client.query('ROLLBACK'); return send(res,400,{error:'period_end_gte_start'}); }
      }
      if (body.total_revenue_cents !== undefined) { const v = cents(body.total_revenue_cents); if (body.total_revenue_cents !== null && v === null) { await client.query('ROLLBACK'); return send(res,400,{error:'invalid_total_revenue_cents'}); } revision.total_revenue_cents = v; }
      if (body.total_cost_cents !== undefined) { const v = cents(body.total_cost_cents); if (body.total_cost_cents !== null && v === null) { await client.query('ROLLBACK'); return send(res,400,{error:'invalid_total_cost_cents'}); } revision.total_cost_cents = v; }
      const keys = Object.keys(revision);
      if (!keys.length) { await client.query('ROLLBACK'); return send(res,400,{error:'nothing_to_revise_premise_fields_required'}); }
      const next_status = previous.status === 'aprovado' ? 'rascunho' : previous.status;
      const setClauses = keys.map((key, i) => `${key}=$${i+1}`);
      setClauses.push(`status=$${keys.length+1}::fin_budget_status`);
      setClauses.push(`premises_version=$${keys.length+2}`);
      setClauses.push(`approved_by_identity=CASE WHEN $${keys.length+1}::text='aprovado' THEN $${keys.length+3}::uuid ELSE NULL END`);
      setClauses.push(`approved_at=CASE WHEN $${keys.length+1}::text='aprovado' THEN NOW() ELSE NULL END`);
      const updated = await client.query(
        `UPDATE fin_budgets SET ${setClauses.join(', ')} WHERE id=$${keys.length+4} RETURNING *`,
        [...keys.map(key => revision[key]), next_status, previous.premises_version+1, actor, id]
      );
      await insertBudgetHistory(client,'budget',id,previous.status,next_status,actor,reason,{revised_fields:keys,premises_version:previous.premises_version+1});
      await auditLog({action:'fin_budget_revision',actor,target:id,meta:{previous_status:previous.status,next_status,reason,revised_fields:keys,premises_version:previous.premises_version+1},client});
      await client.query('COMMIT');
      return send(res,200,{budget:updated.rows[0],is_estimate:true,note:'premissas_revisadas_versao_incrementada'});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return budgetFailure(res,e); }
    finally { client.release(); }
  };

  const handleBudgetScenarios = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
      let q = 'SELECT * FROM fin_budget_scenarios WHERE 1=1';
      const budget_id = url.searchParams.get('budget_id');
      if (budget_id) { if (!uuid(budget_id)) return send(res,400,{error:'invalid_budget_id'}); params.push(budget_id); q += ` AND budget_id=$${params.length}`; }
      const status = url.searchParams.get('status');
      if (status) { if (!BUDGET_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q += ` AND status=$${params.length}`; }
      q += ' ORDER BY created_at DESC LIMIT 200';
      try { return send(res,200,{scenarios:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const budget_id = body.budget_id;
      const scenario_type = typeof body.scenario_type === 'string' ? body.scenario_type.trim() : '';
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const premises = typeof body.premises === 'string' ? body.premises.trim() : '';
      const premise_source = typeof body.premise_source === 'string' ? body.premise_source.trim() : '';
      const premise_base_date = body.premise_base_date;
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      const projected_revenue_cents = cents(body.projected_revenue_cents);
      const projected_cost_cents = cents(body.projected_cost_cents);
      const projected_margin_percent = body.projected_margin_percent == null ? null : Number(body.projected_margin_percent);
      const realized_revenue_cents = cents(body.realized_revenue_cents);
      const realized_cost_cents = cents(body.realized_cost_cents);
      const incomplete_reason = typeof body.incomplete_reason === 'string' ? body.incomplete_reason.trim() : '';
      if (body.status != null) return send(res,400,{error:'scenario_starts_rascunho_status_is_a_transition'});
      if (body.is_estimate === false) return send(res,400,{error:'estimate_is_permanent_nao_prometer_resultado'});
      if (body.is_complete !== undefined) return send(res,400,{error:'scenario_completeness_is_server_side'});
      if (body.approved_by_identity != null || body.approved_at != null || body.premises_version != null) return send(res,400,{error:'scenario_client_fields_refused'});
      if (!uuid(budget_id)) return send(res,400,{error:'budget_id_required'});
      if (!SCENARIO_TYPES.has(scenario_type)) return send(res,400,{error:'invalid_scenario_type_conservador_base_otimista_expansao_pessimista'});
      if (title.length < 5 || title.length > 200) return send(res,400,{error:'title_5_200'});
      if (premises.length < 10 || premises.length > 2000) return send(res,400,{error:'premises_10_2000_required'});
      if (premise_source.length < 5 || premise_source.length > 200) return send(res,400,{error:'premise_source_5_200_required'});
      if (!isoDate(premise_base_date)) return send(res,400,{error:'premise_base_date_required'});
      if (idempotency_key.length < 8 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_8_200'});
      if (body.projected_revenue_cents != null && projected_revenue_cents === null) return send(res,400,{error:'invalid_projected_revenue_cents'});
      if (body.projected_cost_cents != null && projected_cost_cents === null) return send(res,400,{error:'invalid_projected_cost_cents'});
      if (body.projected_margin_percent != null && (projected_margin_percent === null || Number.isNaN(projected_margin_percent) || projected_margin_percent < -100 || projected_margin_percent > 100)) return send(res,400,{error:'margin_percent_range'});
      if (body.realized_revenue_cents != null && realized_revenue_cents === null) return send(res,400,{error:'invalid_realized_revenue_cents'});
      if (body.realized_cost_cents != null && realized_cost_cents === null) return send(res,400,{error:'invalid_realized_cost_cents'});
      // Completude é veredito do banco: sem os dois valores realizados, a
      // lacuna precisa de motivo explícito — dado ausente não vira zero.
      const will_be_complete = realized_revenue_cents !== null && realized_cost_cents !== null;
      if (!will_be_complete && (incomplete_reason.length < 10 || incomplete_reason.length > 1000)) return send(res,400,{error:'incomplete_reason_required_when_realized_missing'});
      if (will_be_complete && incomplete_reason) return send(res,400,{error:'incomplete_reason_must_be_null_when_complete'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const budget = await client.query('SELECT id FROM fin_budgets WHERE id=$1 FOR SHARE',[budget_id]);
        if (!budget.rows.length) { await client.query('ROLLBACK'); return send(res,400,{error:'invalid_reference'}); }
        const created = await client.query(
          `INSERT INTO fin_budget_scenarios (budget_id,scenario_type,title,premises,premise_source,premise_base_date,projected_revenue_cents,projected_cost_cents,projected_margin_percent,realized_revenue_cents,realized_cost_cents,incomplete_reason,is_estimate,status,idempotency_key,created_by_identity)
           VALUES ($1,$2::fin_scenario_type,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,'rascunho',$13,$14) RETURNING *`,
          [budget_id,scenario_type,title,premises,premise_source,premise_base_date,projected_revenue_cents,projected_cost_cents,projected_margin_percent,realized_revenue_cents,realized_cost_cents,will_be_complete?null:incomplete_reason,idempotency_key,actor]
        );
        const scenario = created.rows[0];
        await insertBudgetHistory(client,'scenario',scenario.id,null,'rascunho',actor,'Cenário registrado com premissas explícitas: projeção não é resultado',{scenario_type,premises_version:1,is_complete:scenario.is_complete});
        await auditLog({action:'fin_budget_scenario_create',actor,target:scenario.id,meta:{budget_id,scenario_type,premises_version:1,is_complete:scenario.is_complete},client});
        await client.query('COMMIT');
        return send(res,201,{scenario,is_estimate:true,note:'cenario_estimativa_identificada_nao_prometer_resultado'});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return budgetFailure(res,e); }
      finally { client.release(); }
    }

    // PATCH: transição, revisão de premissas ou registro de realizado — um por vez.
    const id = body.id, status = body.status;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    if (body.is_complete !== undefined) return send(res,400,{error:'scenario_completeness_is_server_side'});
    if (body.premises_version != null || body.approved_by_identity != null || body.approved_at != null) return send(res,400,{error:'scenario_client_fields_refused'});
    const hasPremiseEdit = ['premises','premise_source','premise_base_date','projected_revenue_cents','projected_cost_cents','projected_margin_percent'].some(key => body[key] !== undefined);
    const hasRealizedEdit = ['realized_revenue_cents','realized_cost_cents','incomplete_reason'].some(key => body[key] !== undefined);
    if (status !== undefined && (hasPremiseEdit || hasRealizedEdit)) return send(res,400,{error:'status_transition_and_revision_are_separate'});
    if (hasPremiseEdit && hasRealizedEdit) return send(res,400,{error:'premise_revision_and_realized_update_are_separate'});

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_budget_scenarios WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous = found.rows[0];

      if (status !== undefined) {
        if (!BUDGET_TRANSITIONS.has(status)) { await client.query('ROLLBACK'); return send(res,400,{error:'invalid_transition'}); }
        if (previous.status === status) { await client.query('ROLLBACK'); return send(res,409,{error:'scenario_already_in_status'}); }
        const updated = await client.query(
          `UPDATE fin_budget_scenarios
              SET status=$1::fin_budget_status,
                  approved_by_identity=CASE WHEN $1::text='aprovado' THEN $2::uuid ELSE NULL END,
                  approved_at=CASE WHEN $1::text='aprovado' THEN NOW() ELSE NULL END
            WHERE id=$3 RETURNING *`,
          [status, actor, id]
        );
        await insertBudgetHistory(client,'scenario',id,previous.status,status,actor,reason,{premises_version:previous.premises_version});
        await auditLog({action:'fin_budget_scenario_transition',actor,target:id,meta:{previous_status:previous.status,next_status:status,reason,premises_version:previous.premises_version},client});
        await client.query('COMMIT');
        // Aprovar cenário não cria compromisso: nenhum recebível, pagável,
        // despesa, meta ou provisão nasce desta transição.
        return send(res,200,{scenario:updated.rows[0],is_estimate:true,note:'aprovacao_de_cenario_nao_cria_compromisso'});
      }

      if (hasPremiseEdit) {
        // Revisão de premissas: versiona e retira aprovação se houver.
        const revision = {};
        if (body.premises !== undefined) { const v = String(body.premises).trim(); if (v.length < 10 || v.length > 2000) { await client.query('ROLLBACK'); return send(res,400,{error:'premises_10_2000_required'}); } revision.premises = v; }
        if (body.premise_source !== undefined) { const v = String(body.premise_source).trim(); if (v.length < 5 || v.length > 200) { await client.query('ROLLBACK'); return send(res,400,{error:'premise_source_5_200_required'}); } revision.premise_source = v; }
        if (body.premise_base_date !== undefined) { if (!isoDate(body.premise_base_date)) { await client.query('ROLLBACK'); return send(res,400,{error:'premise_base_date_required'}); } revision.premise_base_date = body.premise_base_date; }
        if (body.projected_revenue_cents !== undefined) { const v = cents(body.projected_revenue_cents); if (body.projected_revenue_cents !== null && v === null) { await client.query('ROLLBACK'); return send(res,400,{error:'invalid_projected_revenue_cents'}); } revision.projected_revenue_cents = v; }
        if (body.projected_cost_cents !== undefined) { const v = cents(body.projected_cost_cents); if (body.projected_cost_cents !== null && v === null) { await client.query('ROLLBACK'); return send(res,400,{error:'invalid_projected_cost_cents'}); } revision.projected_cost_cents = v; }
        if (body.projected_margin_percent !== undefined) { const v = body.projected_margin_percent == null ? null : Number(body.projected_margin_percent); if (body.projected_margin_percent !== null && (v === null || Number.isNaN(v) || v < -100 || v > 100)) { await client.query('ROLLBACK'); return send(res,400,{error:'margin_percent_range'}); } revision.projected_margin_percent = v; }
        const keys = Object.keys(revision);
        if (!keys.length) { await client.query('ROLLBACK'); return send(res,400,{error:'nothing_to_revise_premise_fields_required'}); }
        const next_status = previous.status === 'aprovado' ? 'rascunho' : previous.status;
        const setClauses = keys.map((key, i) => `${key}=$${i+1}`);
        setClauses.push(`status=$${keys.length+1}::fin_budget_status`);
        setClauses.push(`premises_version=$${keys.length+2}`);
        setClauses.push(`approved_by_identity=CASE WHEN $${keys.length+1}::text='aprovado' THEN $${keys.length+3}::uuid ELSE NULL END`);
        setClauses.push(`approved_at=CASE WHEN $${keys.length+1}::text='aprovado' THEN NOW() ELSE NULL END`);
        const updated = await client.query(
          `UPDATE fin_budget_scenarios SET ${setClauses.join(', ')} WHERE id=$${keys.length+4} RETURNING *`,
          [...keys.map(key => revision[key]), next_status, previous.premises_version+1, actor, id]
        );
        await insertBudgetHistory(client,'scenario',id,previous.status,next_status,actor,reason,{revised_fields:keys,premises_version:previous.premises_version+1});
        await auditLog({action:'fin_budget_scenario_revision',actor,target:id,meta:{previous_status:previous.status,next_status,reason,revised_fields:keys,premises_version:previous.premises_version+1},client});
        await client.query('COMMIT');
        return send(res,200,{scenario:updated.rows[0],is_estimate:true,note:'premissas_revisadas_versao_incrementada'});
      }

      // Registro de realizado: fato observado — não altera premissas, versão
      // nem aprovação. A completude é recalculada pelo banco.
      const nextRevenue = body.realized_revenue_cents !== undefined ? cents(body.realized_revenue_cents) : previous.realized_revenue_cents;
      const nextCost = body.realized_cost_cents !== undefined ? cents(body.realized_cost_cents) : previous.realized_cost_cents;
      if (body.realized_revenue_cents !== undefined && body.realized_revenue_cents !== null && nextRevenue === null) { await client.query('ROLLBACK'); return send(res,400,{error:'invalid_realized_revenue_cents'}); }
      if (body.realized_cost_cents !== undefined && body.realized_cost_cents !== null && nextCost === null) { await client.query('ROLLBACK'); return send(res,400,{error:'invalid_realized_cost_cents'}); }
      let nextReason = body.incomplete_reason !== undefined ? (typeof body.incomplete_reason === 'string' ? body.incomplete_reason.trim() : '') : (previous.incomplete_reason || '');
      const nextComplete = nextRevenue !== null && nextCost !== null;
      if (nextComplete) nextReason = '';
      if (!nextComplete && (nextReason.length < 10 || nextReason.length > 1000)) { await client.query('ROLLBACK'); return send(res,400,{error:'incomplete_reason_required_when_realized_missing'}); }
      const updated = await client.query(
        `UPDATE fin_budget_scenarios
            SET realized_revenue_cents=$1, realized_cost_cents=$2, incomplete_reason=$3
          WHERE id=$4 RETURNING *`,
        [nextRevenue, nextCost, nextComplete ? null : nextReason, id]
      );
      await insertBudgetHistory(client,'scenario',id,previous.status,previous.status,actor,reason,{realized_update:true,is_complete:updated.rows[0].is_complete});
      await auditLog({action:'fin_budget_scenario_realized_update',actor,target:id,meta:{reason,is_complete:updated.rows[0].is_complete},client});
      await client.query('COMMIT');
      return send(res,200,{scenario:updated.rows[0],is_estimate:true,note:'realizado_registrado_completude_recalculada_pelo_banco'});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return budgetFailure(res,e); }
    finally { client.release(); }
  };

  const handleBudgetHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
    let q = 'SELECT * FROM fin_budget_history WHERE 1=1';
    const entity_type = url.searchParams.get('entity_type');
    if (entity_type) { if (!BUDGET_ENTITIES.has(entity_type)) return send(res,400,{error:'invalid_entity_type'}); params.push(entity_type); q += ` AND entity_type=$${params.length}`; }
    const entity_id = url.searchParams.get('entity_id');
    if (entity_id) { if (!uuid(entity_id)) return send(res,400,{error:'invalid_entity_id'}); params.push(entity_id); q += ` AND entity_id=$${params.length}`; }
    q += ' ORDER BY created_at DESC LIMIT 500';
    try { return send(res,200,{history:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
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
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
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
        try { await auditLog({ action:'fin_export_create', actor: sess.identityId, target: rows[0].id, meta:{ protocol, period_start, period_end, is_accountant_limited:true, access_role:'contador' } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ export: rows[0], note:'exportacao_periodo_trilha_filtros_totais_conciliaveis_acesso_limitado_contador' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate', details:e.detail})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message}));
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
        try { await auditLog({ action:'fin_export_update', actor: sess.identityId, target: id, meta:{ status: body.status } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ export: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
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
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
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
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
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
        try { await auditLog({ action:'fin_closure_create', actor: sess.identityId, target: rows[0].id, meta:{ competence_date, status:'fechada' } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ closure: rows[0], note:'fechamento_competencia_preservar_versoes_relatorio' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate', details:e.detail})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message}));
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
          try { await auditLog({ action:'fin_closure_reopen', actor: sess.identityId, target: id, meta:{ reopen_reason, authorized_by: body.authorized_by_identity||sess.identityId } }); } catch {}
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ closure: rows[0], note:'reabertura_autorizada_preservar_versoes_relatorio' }));
        } else {
          res.writeHead(400, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'action_required_reopen'}));
        }
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
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
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
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
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
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
        try { await auditLog({ action:'fin_commission_provision_create', actor: sess.identityId, target: rows[0].id, meta:{ rule_id, commission_id, amount_cents, is_auto_paid:false } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provision: rows[0], note:'comissoes_ligadas_regra_CRM25_provisao_revisao_nao_pagar_automaticamente' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
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
        try { await auditLog({ action: status==='paga'?'fin_commission_provision_pay':'fin_commission_provision_review', actor: sess.identityId, target: id, meta:{ status, reason, is_auto_paid:false } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provision: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
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
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
  };

  return {
    handleBudgets,
    handleBudgetScenarios,
    handleBudgetHistory,
    handleExports,
    handleExportLogs,
    handleClosures,
    handleReportVersions,
    handleCommissionProvisions,
    handleCommissionProvisionHistory,
  };
}
