export function createReportApi({ json, sameOrigin, getPool, readAdminSession }) {

  function scopedReportingPool(session) {
    const db=getPool();
    return {query(sql,values=[]){
      if(!/^\s*SELECT/i.test(sql))return db.query(sql,values);
      const n=values.length+1;
      const scope='responsible_id=$'+n+' OR (responsible_id IS NULL AND created_by_id=$'+n+')';
      return db.query('WITH crm_opportunities AS (SELECT * FROM public.crm_opportunities WHERE '+scope+'), crm_tasks AS (SELECT * FROM public.crm_tasks WHERE '+scope+') '+sql,[...values,session.identityId]);
    }};
  }

  const bad = (res, msg) => json(res, 400, { error: msg });

  const STAGE_PROBABILITY = {
    novo: 0.1,
    qualificacao: 0.2,
    vistoria: 0.4,
    proposta_elaboracao: 0.5,
    proposta_enviada: 0.6,
    negociacao: 0.8,
    ganho: 1.0,
    perdido: 0.0,
  };

  async function handleConversion(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res, 401, { error: 'admin_session_required' });
    if (!['comercial','admin','marcelo','ti'].includes(session.role)) return json(res,403,{error:'role_required'});
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    const periodStart = url.searchParams.get('periodStart') || url.searchParams.get('start');
    const periodEnd = url.searchParams.get('periodEnd') || url.searchParams.get('end');
    const origin = url.searchParams.get('origin');

    try {
      const pool = scopedReportingPool(session);
      const conds = []; const vals = []; let idx = 1;
      if (periodStart) { conds.push(`created_at >= $${idx++}::date`); vals.push(periodStart); }
      if (periodEnd) { conds.push(`created_at < ($${idx++}::date + INTERVAL '1 day')`); vals.push(periodEnd); }
      if (origin) { conds.push(`origin = $${idx++}`); vals.push(origin); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      // Conversão por etapa
      const stageRes = await pool.query(
        `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(estimated_value),0)::numeric AS total_value FROM crm_opportunities ${where} GROUP BY stage ORDER BY count DESC`,
        vals
      );

      // Conversão por origem
      const originRes = await pool.query(
        `SELECT origin, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE stage = 'ganho')::int AS won, COUNT(*) FILTER (WHERE stage = 'perdido')::int AS lost, COALESCE(SUM(estimated_value),0)::numeric AS total_value FROM crm_opportunities ${where} GROUP BY origin ORDER BY count DESC`,
        vals
      );

      // Taxa de conversão funil
      const totalRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_opportunities ${where}`, vals);
      const total = totalRes.rows[0]?.total || 0;
      const wonRes = await pool.query(`SELECT COUNT(*)::int AS won FROM crm_opportunities ${where} ${where ? 'AND' : 'WHERE'} stage = 'ganho'`, vals);
      const won = wonRes.rows[0]?.won || 0;
      const conversionRate = total > 0 ? (won / total) : 0;

      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_report_view','conversion','allowed','none')", [session.role, session.identityId || session.role]); } catch {}

      return json(res, 200, {
        period: { start: periodStart || null, end: periodEnd || null, origin: origin || null },
        total,
        won,
        conversionRate,
        byStage: stageRes.rows,
        byOrigin: originRes.rows,
        note: 'Conversão por etapa/origem. Taxa = ganho / total no período.',
        isEstimate: false,
      });
    } catch (e) {
      console.error('report conversion failed', e);
      return json(res, 503, { error: 'report_unavailable' });
    }
  }

  async function handleSalesCycle(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res, 401, { error: 'admin_session_required' });
    if (!['comercial','admin','marcelo','ti'].includes(session.role)) return json(res,403,{error:'role_required'});
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    try {
      const pool = scopedReportingPool(session);
      // Ciclo de vendas: média dias entre criação e ganho/perdido, e tempo médio por etapa
      const cycleRes = await pool.query(`
        SELECT
          AVG(EXTRACT(EPOCH FROM (stage_changed_at - created_at))/86400)::numeric AS avg_days_to_current_stage,
          AVG(CASE WHEN stage = 'ganho' THEN EXTRACT(EPOCH FROM (stage_changed_at - created_at))/86400 END)::numeric AS avg_days_to_won,
          AVG(CASE WHEN stage = 'perdido' THEN EXTRACT(EPOCH FROM (stage_changed_at - created_at))/86400 END)::numeric AS avg_days_to_lost,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE stage = 'ganho')::int AS won,
          COUNT(*) FILTER (WHERE stage = 'perdido')::int AS lost
        FROM crm_opportunities
      `);

      const stageAvgRes = await pool.query(`
        SELECT stage, AVG(EXTRACT(EPOCH FROM (stage_changed_at - created_at))/86400)::numeric AS avg_days, COUNT(*)::int AS count
        FROM crm_opportunities GROUP BY stage ORDER BY avg_days DESC
      `);

      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_report_view','sales_cycle','allowed','none')", [session.role, session.identityId || session.role]); } catch {}

      return json(res, 200, {
        overall: cycleRes.rows[0],
        byStage: stageAvgRes.rows,
        note: 'Ciclo de vendas médio em dias desde criação até mudança de etapa. Ganho/perdido com média própria.',
        isEstimate: false,
      });
    } catch (e) {
      console.error('report sales cycle failed', e);
      return json(res, 503, { error: 'report_unavailable' });
    }
  }

  async function handleOverdueTasks(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res, 401, { error: 'admin_session_required' });
    if (!['comercial','admin','marcelo','ti'].includes(session.role)) return json(res,403,{error:'role_required'});
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
    try {
      const pool = scopedReportingPool(session);
      const overdueRes = await pool.query(
        `SELECT t.*, o.title AS opportunity_title, o.stage AS opportunity_stage, c.display_name AS company_name
         FROM crm_tasks t
         LEFT JOIN crm_opportunities o ON o.id = t.opportunity_id
         LEFT JOIN crm_companies c ON c.id = t.company_id
         WHERE t.due_date < NOW() AND t.status IN ('aberta','em_andamento')
         ORDER BY t.due_date ASC LIMIT $1`,
        [limit]
      );
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_tasks WHERE due_date < NOW() AND status IN ('aberta','em_andamento')`);

      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_report_view','overdue_tasks','allowed','none')", [session.role, session.identityId || session.role]); } catch {}

      return json(res, 200, {
        total: countRes.rows[0]?.total || 0,
        tasks: overdueRes.rows,
        note: 'Tarefas atrasadas: due_date < NOW() e status aberta/em_andamento.',
        isEstimate: false,
      });
    } catch (e) {
      console.error('report overdue tasks failed', e);
      return json(res, 503, { error: 'report_unavailable' });
    }
  }

  async function handleLossReasons(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res, 401, { error: 'admin_session_required' });
    if (!['comercial','admin','marcelo','ti'].includes(session.role)) return json(res,403,{error:'role_required'});
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    try {
      const pool = scopedReportingPool(session);
      const lossRes = await pool.query(`
        SELECT loss_reason, COUNT(*)::int AS count, COALESCE(SUM(estimated_value),0)::numeric AS total_value
        FROM crm_opportunities WHERE stage = 'perdido' AND loss_reason IS NOT NULL AND loss_reason <> ''
        GROUP BY loss_reason ORDER BY count DESC
      `);
      const totalLostRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_opportunities WHERE stage = 'perdido'`);

      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_report_view','loss_reasons','allowed','none')", [session.role, session.identityId || session.role]); } catch {}

      return json(res, 200, {
        totalLost: totalLostRes.rows[0]?.total || 0,
        byReason: lossRes.rows,
        note: 'Motivos de perda com contagem e valor estimado. Motivo obrigatório para perda (CRM-06).',
        isEstimate: false,
      });
    } catch (e) {
      console.error('report loss reasons failed', e);
      return json(res, 503, { error: 'report_unavailable' });
    }
  }

  async function handlePipeline(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res, 401, { error: 'admin_session_required' });
    if (!['comercial','admin','marcelo','ti'].includes(session.role)) return json(res,403,{error:'role_required'});
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    const periodStart = url.searchParams.get('periodStart') || url.searchParams.get('start');
    const periodEnd = url.searchParams.get('periodEnd') || url.searchParams.get('end');
    const groupBy = url.searchParams.get('groupBy') || 'stage'; // stage, period, scenario

    try {
      const pool = scopedReportingPool(session);
      const conds = ["stage NOT IN ('ganho','perdido')"];
      const vals = [];
      let idx = 1;
      if (periodStart) { conds.push(`forecast_date >= $${idx++}::date`); vals.push(periodStart); }
      if (periodEnd) { conds.push(`forecast_date <= $${idx++}::date`); vals.push(periodEnd); }
      const where = `WHERE ${conds.join(' AND ')}`;

      const pipelineRes = await pool.query(
        `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(estimated_value),0)::numeric AS total_value,
                COALESCE(AVG(estimated_value),0)::numeric AS avg_value
         FROM crm_opportunities ${where} GROUP BY stage ORDER BY total_value DESC`,
        vals
      );

      const periodRes = await pool.query(
        `SELECT date_trunc('month', forecast_date)::date AS month, COUNT(*)::int AS count, COALESCE(SUM(estimated_value),0)::numeric AS total_value
         FROM crm_opportunities ${where} AND forecast_date IS NOT NULL GROUP BY month ORDER BY month`,
        vals
      );

      // Scenarios are alternative quotations of an opportunity, not service
      // labels or additive revenue. The opportunities CTE enforces ownership.
      const scenarioRes = await pool.query(
        `SELECT s.id,s.title,s.version,s.approval_status,s.opportunity_id,
                o.title AS opportunity_title,1::int AS count,s.price_calculated AS total_value
           FROM crm_price_scenarios s JOIN crm_opportunities o ON o.id=s.opportunity_id
           ${where} ORDER BY s.created_at DESC LIMIT 200`,vals
      );

      const totalRes = await pool.query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(estimated_value),0)::numeric AS total_value FROM crm_opportunities ${where}`, vals);

      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_report_view','pipeline','allowed','none')", [session.role, session.identityId || session.role]); } catch {}

      return json(res, 200, {
        period: { start: periodStart || null, end: periodEnd || null, groupBy },
        total: totalRes.rows[0],
        byStage: pipelineRes.rows,
        byPeriod: periodRes.rows,
        byScenario: scenarioRes.rows,
        note: 'Pipeline por período e cenários de preço reais vinculados. Cenários são alternativas e não devem ser somados como receita. Exclui ganho/perdido; valores são estimativas.',
        isEstimate: true,
      });
    } catch (e) {
      console.error('report pipeline failed', e);
      return json(res, 503, { error: 'report_unavailable' });
    }
  }

  async function handleWeightedForecast(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res, 401, { error: 'admin_session_required' });
    if (!['comercial','admin','marcelo','ti'].includes(session.role)) return json(res,403,{error:'role_required'});
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    try {
      const pool = scopedReportingPool(session);
      const opportunitiesRes = await pool.query(`
        SELECT id, title, stage, estimated_value, forecast_date, origin
        FROM crm_opportunities WHERE stage NOT IN ('ganho','perdido') AND estimated_value IS NOT NULL
      `);

      let totalWeighted = 0;
      let totalEstimated = 0;
      const detailed = opportunitiesRes.rows.map(o => {
        const prob = STAGE_PROBABILITY[o.stage] ?? 0.3;
        const weighted = Number(o.estimated_value || 0) * prob;
        totalWeighted += weighted;
        totalEstimated += Number(o.estimated_value || 0);
        return {
          id: o.id,
          title: o.title,
          stage: o.stage,
          estimated_value: o.estimated_value,
          probability: prob,
          weighted_value: weighted,
          forecast_date: o.forecast_date,
          origin: o.origin,
        };
      });

      const byStageRes = await pool.query(`
        SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(estimated_value),0)::numeric AS total_estimated
        FROM crm_opportunities WHERE stage NOT IN ('ganho','perdido') GROUP BY stage
      `);

      const byStageWeighted = byStageRes.rows.map(r => {
        const prob = STAGE_PROBABILITY[r.stage] ?? 0.3;
        return {
          stage: r.stage,
          count: r.count,
          total_estimated: r.total_estimated,
          probability: prob,
          weighted: Number(r.total_estimated) * prob,
        };
      });

      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_report_view','weighted_forecast','allowed','none')", [session.role, session.identityId || session.role]); } catch {}

      return json(res, 200, {
        totalEstimated,
        totalWeighted,
        byStage: byStageWeighted,
        opportunities: detailed.slice(0, 100),
        probabilities: STAGE_PROBABILITY,
        note: 'Previsão ponderada é ESTIMATIVA identificada, não garantia. Valor = estimated_value * probabilidade da etapa. Probabilidades: novo 10%, qualificacao 20%, vistoria 40%, proposta_elaboracao 50%, proposta_enviada 60%, negociacao 80%, ganho 100%, perdido 0%.',
        isEstimate: true,
        is_estimate_identified: true,
      });
    } catch (e) {
      console.error('report weighted forecast failed', e);
      return json(res, 503, { error: 'report_unavailable' });
    }
  }

  async function handleAllReports(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res, 401, { error: 'admin_session_required' });
    if (!['comercial','admin','marcelo','ti'].includes(session.role)) return json(res,403,{error:'role_required'});
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    try {
      const pool = scopedReportingPool(session);
      // Quick summary combining all
      const totalRes = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE stage='ganho')::int AS won, COUNT(*) FILTER (WHERE stage='perdido')::int AS lost, COALESCE(SUM(estimated_value),0)::numeric AS total_value FROM crm_opportunities`);
      const overdueRes = await pool.query(`SELECT COUNT(*)::int AS overdue FROM crm_tasks WHERE due_date < NOW() AND status IN ('aberta','em_andamento')`);
      const pipelineRes = await pool.query(`SELECT COALESCE(SUM(estimated_value),0)::numeric AS pipeline_value FROM crm_opportunities WHERE stage NOT IN ('ganho','perdido')`);

      return json(res, 200, {
        summary: {
          total: totalRes.rows[0]?.total || 0,
          won: totalRes.rows[0]?.won || 0,
          lost: totalRes.rows[0]?.lost || 0,
          total_value: totalRes.rows[0]?.total_value || 0,
          overdue_tasks: overdueRes.rows[0]?.overdue || 0,
          pipeline_value: pipelineRes.rows[0]?.pipeline_value || 0,
        },
        reports: [
          { type: 'conversion', endpoint: '/api/crm/reports/conversion', description: 'Conversão por etapa/origem' },
          { type: 'sales_cycle', endpoint: '/api/crm/reports/sales-cycle', description: 'Ciclo de vendas médio' },
          { type: 'overdue_tasks', endpoint: '/api/crm/reports/overdue-tasks', description: 'Tarefas atrasadas' },
          { type: 'loss_reasons', endpoint: '/api/crm/reports/loss-reasons', description: 'Motivos de perda' },
          { type: 'pipeline', endpoint: '/api/crm/reports/pipeline', description: 'Pipeline por período e cenário' },
          { type: 'weighted_forecast', endpoint: '/api/crm/reports/weighted-forecast', description: 'Previsão ponderada (estimativa identificada)' },
        ],
        note: 'Relatórios CRM-24: conversão, ciclo, atrasadas, perda, pipeline, previsão ponderada identificada como estimativa.',
        isEstimate: false,
      });
    } catch (e) {
      console.error('report summary failed', e);
      return json(res, 503, { error: 'report_unavailable' });
    }
  }

  return {
    handleConversion,
    handleSalesCycle,
    handleOverdueTasks,
    handleLossReasons,
    handlePipeline,
    handleWeightedForecast,
    handleAllReports,
  };
}
