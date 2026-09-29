export function createPriceScenarioApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const VALID_FORMULA = new Set(['margem_receita','markup_custo','custom','outro']);
  const VALID_STATUS = new Set(['rascunho','em_revisao','aprovado','arquivado']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = v => typeof v === 'string' && UUID_RE.test(v);
  const bad = (res, msg) => json(res, 400, { error: msg });

  function calcPrices({ base_cost, tax_rate, margin_percent, markup_percent, formula_type, tax_is_proportional, margin_is_on_revenue }) {
    const cost = Number(base_cost) || 0;
    const tax = Number(tax_rate) || 0;
    const marginDec = (Number(margin_percent) || 0) / 100;
    const markupDec = (Number(markup_percent) || 0) / 100;
    let price_by_margin = null;
    let price_by_markup = null;
    let denominator = null;
    let denominator_valid = false;
    price_by_markup = cost * (1 + markupDec);
    if (formula_type === 'margem_receita') {
      denominator = 1 - tax - marginDec;
      denominator_valid = denominator > 0.000001;
      if (denominator_valid) price_by_margin = cost / denominator;
    }
    let price_calculated = 0;
    if (formula_type === 'margem_receita' && price_by_margin !== null) price_calculated = price_by_margin;
    else if (formula_type === 'markup_custo' && price_by_markup !== null) price_calculated = price_by_markup;
    else if (price_by_margin !== null) price_calculated = price_by_margin;
    else if (price_by_markup !== null) price_calculated = price_by_markup;
    else price_calculated = cost;
    return { price_by_margin, price_by_markup, price_calculated, denominator, denominator_valid };
  }

  async function handleScenarios(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method === 'GET') {
      const companyId = url.searchParams.get('companyId') || url.searchParams.get('company_id');
      const opportunityId = url.searchParams.get('opportunityId') || url.searchParams.get('opportunity_id');
      const techBudgetId = url.searchParams.get('technicalBudgetId') || url.searchParams.get('technical_budget_id');
      const laborBudgetId = url.searchParams.get('laborBudgetId') || url.searchParams.get('labor_budget_id');
      const status = url.searchParams.get('status');
      const formula = url.searchParams.get('formula_type') || url.searchParams.get('formula');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      if (companyId && !isUuid(companyId)) return bad(res, 'invalid_company_id');
      if (opportunityId && !isUuid(opportunityId)) return bad(res, 'invalid_opportunity_id');
      if (techBudgetId && !isUuid(techBudgetId)) return bad(res, 'invalid_technical_budget_id');
      if (laborBudgetId && !isUuid(laborBudgetId)) return bad(res, 'invalid_labor_budget_id');
      if (status && !VALID_STATUS.has(status)) return bad(res, 'invalid_status');
      if (formula && !VALID_FORMULA.has(formula)) return bad(res, 'invalid_formula_type');
      const conds = []; const vals = []; let idx = 1;
      if (companyId) { conds.push(`company_id = $${idx++}`); vals.push(companyId); }
      if (opportunityId) { conds.push(`opportunity_id = $${idx++}`); vals.push(opportunityId); }
      if (techBudgetId) { conds.push(`technical_budget_id = $${idx++}`); vals.push(techBudgetId); }
      if (laborBudgetId) { conds.push(`labor_budget_id = $${idx++}`); vals.push(laborBudgetId); }
      if (status) { conds.push(`approval_status = $${idx++}`); vals.push(status); }
      if (formula) { conds.push(`formula_type = $${idx++}`); vals.push(formula); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_price_scenarios ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_price_scenarios ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, scenarios: listRes.rows, limit, offset });
      } catch (e) {
        const unconfigured = e.message === 'DATABASE_NOT_CONFIGURED';
        if (!unconfigured) console.error('price scenarios list failed', e);
        return json(res, 503, { error: unconfigured ? 'database_not_configured' : 'price_scenarios_unavailable' });
      }
    }
    if (req.method === 'POST') {
      let body; try { body = await readJson(req); } catch { return bad(res, 'invalid_json'); }
      const company_id = body?.company_id ? String(body.company_id).trim() : null;
      const opportunity_id = body?.opportunity_id ? String(body.opportunity_id).trim() : null;
      const technical_budget_id = body?.technical_budget_id ? String(body.technical_budget_id).trim() : null;
      const labor_budget_id = body?.labor_budget_id ? String(body.labor_budget_id).trim() : null;
      const title = String(body?.title || '').trim();
      const description = body?.description ? String(body.description).trim().slice(0,2000) : null;
      const base_cost = Number(body?.base_cost ?? body?.cost ?? 0);
      const tax_rate_input = body?.tax_rate ?? 0;
      const margin_percent = Number(body?.margin_percent ?? 0);
      const markup_percent = Number(body?.markup_percent ?? 0);
      const formula_type = String(body?.formula_type || 'outro').trim().toLowerCase();
      const premises = body?.premises ? String(body.premises).trim().slice(0,2000) : null;
      const tax_is_proportional = !!body?.tax_is_proportional_to_revenue;
      const margin_is_on_revenue = !!body?.margin_is_on_revenue;
      const notes = body?.notes ? String(body.notes).trim().slice(0,2000) : null;
      if (title.length < 1 || title.length > 200) return bad(res, 'invalid_title');
      if (!Number.isFinite(base_cost) || base_cost < 0) return bad(res, 'invalid_base_cost');
      if (!VALID_FORMULA.has(formula_type)) return bad(res, 'invalid_formula_type');
      if (company_id && !isUuid(company_id)) return bad(res, 'invalid_company_id');
      if (opportunity_id && !isUuid(opportunity_id)) return bad(res, 'invalid_opportunity_id');
      if (technical_budget_id && !isUuid(technical_budget_id)) return bad(res, 'invalid_technical_budget_id');
      if (labor_budget_id && !isUuid(labor_budget_id)) return bad(res, 'invalid_labor_budget_id');
      if (margin_percent < -100 || margin_percent > 100) return bad(res, 'invalid_margin_percent');
      if (markup_percent < -100 || markup_percent > 500) return bad(res, 'invalid_markup_percent');
      let tax_rate = Number(tax_rate_input);
      if (!Number.isFinite(tax_rate) || tax_rate < 0) return bad(res, 'invalid_tax_rate');
      if (tax_rate > 1) { if (tax_rate > 100) return bad(res, 'invalid_tax_rate'); tax_rate = tax_rate / 100; }
      if (formula_type === 'margem_receita') { if (!premises || premises.length < 10) return bad(res, 'premises_required_for_margin_formula'); }
      const calc = calcPrices({ base_cost, tax_rate, margin_percent, markup_percent, formula_type, tax_is_proportional, margin_is_on_revenue });
      if (formula_type === 'margem_receita' && !calc.denominator_valid) return bad(res, 'invalid_denominator_for_margin_formula');
      try {
        const pool = getPool();
        const ins = await pool.query(`INSERT INTO crm_price_scenarios (company_id, opportunity_id, technical_budget_id, labor_budget_id, title, description, base_cost, tax_rate, margin_percent, markup_percent, price_calculated, price_by_margin_formula, price_by_markup, formula_type, premises, denominator_valid, denominator_value, tax_is_proportional_to_revenue, margin_is_on_revenue, approval_status, version, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'rascunho',1,$20,$21,$22) RETURNING *`, [company_id, opportunity_id, technical_budget_id, labor_budget_id, title, description, base_cost, tax_rate, margin_percent, markup_percent, calc.price_calculated, calc.price_by_margin, calc.price_by_markup, formula_type, premises, calc.denominator_valid, calc.denominator, tax_is_proportional, margin_is_on_revenue, notes, session.role, session.identityId || null]);
        const row = ins.rows[0];
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_price_scenario_create',$3,'allowed','none')", [session.role, session.identityId || session.role, row.id]); } catch {}
        return json(res, 201, { scenario: row, calc });
      } catch (e) { console.error('price scenario create failed', e); return json(res, 503, { error: 'price_scenario_create_failed' }); }
    }
    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleScenarioById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method === 'GET') {
      try { const pool = getPool(); const r = await pool.query('SELECT * FROM crm_price_scenarios WHERE id = $1', [id]); if (!r.rows[0]) return json(res, 404, { error: 'not_found' }); return json(res, 200, { scenario: r.rows[0] }); } catch (e) { return json(res, 503, { error: 'price_scenario_unavailable' }); }
    }
    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      let current = null;
      try { const pool = getPool(); const curRes = await pool.query('SELECT * FROM crm_price_scenarios WHERE id = $1', [id]); current = curRes.rows[0]; if (!current) return json(res, 404, { error: 'not_found' }); } catch (e) { return json(res, 503, { error: 'price_scenario_unavailable' }); }
      let base_cost = current.base_cost; let tax_rate = Number(current.tax_rate); let margin_percent = Number(current.margin_percent); let markup_percent = Number(current.markup_percent); let formula_type = current.formula_type; let premises = current.premises; let tax_is_proportional = current.tax_is_proportional_to_revenue; let margin_is_on_revenue = current.margin_is_on_revenue; let title = current.title; let description = current.description; let notes = current.notes;
      if (body?.title !== undefined) { const t = String(body.title).trim(); if (t.length < 1 || t.length > 200) return bad(res, 'invalid_title'); title = t; fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.description !== undefined) { const d = body.description ? String(body.description).trim().slice(0,2000) : null; description = d; fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.base_cost !== undefined) { const bc = Number(body.base_cost); if (!Number.isFinite(bc) || bc < 0) return bad(res, 'invalid_base_cost'); base_cost = bc; fields.push(`base_cost = $${idx++}`); vals.push(bc); }
      if (body?.tax_rate !== undefined) { let tr = Number(body.tax_rate); if (!Number.isFinite(tr) || tr < 0) return bad(res, 'invalid_tax_rate'); if (tr > 1) { if (tr > 100) return bad(res, 'invalid_tax_rate'); tr = tr / 100; } tax_rate = tr; fields.push(`tax_rate = $${idx++}`); vals.push(tr); }
      if (body?.margin_percent !== undefined) { const mp = Number(body.margin_percent); if (!Number.isFinite(mp) || mp < -100 || mp > 100) return bad(res, 'invalid_margin_percent'); margin_percent = mp; fields.push(`margin_percent = $${idx++}`); vals.push(mp); }
      if (body?.markup_percent !== undefined) { const mk = Number(body.markup_percent); if (!Number.isFinite(mk) || mk < -100 || mk > 500) return bad(res, 'invalid_markup_percent'); markup_percent = mk; fields.push(`markup_percent = $${idx++}`); vals.push(mk); }
      if (body?.formula_type !== undefined) { const ft = String(body.formula_type).trim().toLowerCase(); if (!VALID_FORMULA.has(ft)) return bad(res, 'invalid_formula_type'); formula_type = ft; fields.push(`formula_type = $${idx++}`); vals.push(ft); }
      if (body?.premises !== undefined) { const pr = body.premises ? String(body.premises).trim().slice(0,2000) : null; premises = pr; fields.push(`premises = $${idx++}`); vals.push(pr); }
      if (body?.tax_is_proportional_to_revenue !== undefined) { tax_is_proportional = !!body.tax_is_proportional_to_revenue; fields.push(`tax_is_proportional_to_revenue = $${idx++}`); vals.push(tax_is_proportional); }
      if (body?.margin_is_on_revenue !== undefined) { margin_is_on_revenue = !!body.margin_is_on_revenue; fields.push(`margin_is_on_revenue = $${idx++}`); vals.push(margin_is_on_revenue); }
      if (body?.notes !== undefined) { const n = body.notes ? String(body.notes).trim().slice(0,2000) : null; notes = n; fields.push(`notes = $${idx++}`); vals.push(n); }
      const calc = calcPrices({ base_cost, tax_rate, margin_percent, markup_percent, formula_type, tax_is_proportional, margin_is_on_revenue });
      if (formula_type === 'margem_receita') { if (!premises || premises.length < 10) return bad(res, 'premises_required_for_margin_formula'); if (!calc.denominator_valid) return bad(res, 'invalid_denominator_for_margin_formula'); }
      fields.push(`price_calculated = $${idx++}`); vals.push(calc.price_calculated);
      fields.push(`price_by_margin_formula = $${idx++}`); vals.push(calc.price_by_margin);
      fields.push(`price_by_markup = $${idx++}`); vals.push(calc.price_by_markup);
      fields.push(`denominator_valid = $${idx++}`); vals.push(calc.denominator_valid);
      fields.push(`denominator_value = $${idx++}`); vals.push(calc.denominator);
      if (body?.approval_status !== undefined || body?.status !== undefined) {
        const st = String(body.approval_status || body.status).trim().toLowerCase();
        if (!VALID_STATUS.has(st)) return bad(res, 'invalid_status');
        if (st === 'aprovado') {
          try { const pool = getPool(); const essentialMissing = await pool.query(`SELECT COUNT(*)::int AS cnt FROM crm_cost_parameters WHERE is_essential = true AND approval_status != 'aprovado'`); if ((essentialMissing.rows[0]?.cnt || 0) > 0) return json(res, 409, { error: 'essential_params_missing_cannot_approve_official_price', missing_count: essentialMissing.rows[0].cnt }); } catch {}
          if (formula_type === 'margem_receita' && current.requires_accounting_approval) { const accountingNote = body?.accounting_approval_note ? String(body.accounting_approval_note).trim() : null; if (!accountingNote || accountingNote.length < 10) return bad(res, 'accounting_approval_required_for_margin_formula'); fields.push(`accounting_approved_by = $${idx++}`); vals.push(session.identityId || null); fields.push(`accounting_approved_at = NOW()`); fields.push(`accounting_approval_note = $${idx++}`); vals.push(accountingNote); }
          fields.push(`approved_by = $${idx++}`); vals.push(session.identityId || null); fields.push(`approved_at = NOW()`); fields.push(`approved_by_role = $${idx++}`); vals.push(session.role);
        }
        fields.push(`approval_status = $${idx++}`); vals.push(st);
      }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`version = version + 1`); fields.push(`updated_at = NOW()`);
      try { const pool = getPool(); const upd = await pool.query(`UPDATE crm_price_scenarios SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]); const row = upd.rows[0];
        // CRM-18: alteração de cenário após aprovação reabre descontos
        try {
          if (row) {
            await pool.query(`UPDATE crm_discount_requests SET reapproval_required = true, reapproval_reason = 'Cenário preço alterado após aprovação', status = CASE WHEN status = 'aprovado' THEN 'em_analise' ELSE status END, updated_at = NOW() WHERE price_scenario_id = $1 AND status = 'aprovado'`, [id]);
          }
        } catch {}
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, row.approval_status === 'aprovado' ? 'crm_price_scenario_status_aprovado' : 'crm_price_scenario_update', row.id]); } catch {} return json(res, 200, { scenario: row, calc }); } catch (e) { console.error('price scenario update failed', e); return json(res, 503, { error: 'price_scenario_update_failed' }); }
    }
    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }
  return { handleScenarios, handleScenarioById };
}
