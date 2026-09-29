export function createObservabilityApi({ json, sameOrigin, getPool, readAdminSession, observability }) {
  async function handleMetrics(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'observability_restricted_admin_ti' });

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const type = url.searchParams.get('type') || 'summary';

    try {
      const pool = getPool();
      if (type === 'summary') {
        const mem = observability.getMetrics();
        // DB aggregates last 1h
        let dbAgg = null;
        try {
          const httpAgg = await pool.query(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE status_code >= 500)::int AS cnt_5xx,
                   COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::int AS cnt_4xx,
                   AVG(duration_ms)::int AS avg_duration,
                   MAX(duration_ms)::int AS max_duration
            FROM observability_http_requests WHERE created_at > NOW() - INTERVAL '1 hour'
          `);
          const jobAgg = await pool.query(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE status IN ('failed','dead'))::int AS failed,
                   AVG(duration_ms)::int AS avg_duration
            FROM observability_job_executions WHERE created_at > NOW() - INTERVAL '1 hour'
          `);
          const dbMetricsAgg = await pool.query(`
            SELECT COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE success = false)::int AS failed,
                   AVG(duration_ms)::int AS avg_duration,
                   MAX(duration_ms)::int AS max_duration
            FROM observability_db_metrics WHERE created_at > NOW() - INTERVAL '1 hour'
          `);
          const alertsAgg = await pool.query(`
            SELECT COUNT(*)::int AS firing,
                   COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical
            FROM observability_alerts WHERE status = 'firing'
          `);
          dbAgg = {
            http_1h: httpAgg.rows[0],
            jobs_1h: jobAgg.rows[0],
            db_1h: dbMetricsAgg.rows[0],
            alerts: alertsAgg.rows[0],
          };
        } catch {}

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'observability_query',$3,'allowed','none')", [session.role, session.identityId || session.role, 'summary']); } catch {}

        return json(res, 200, { memory: mem, db_aggregates: dbAgg, note: 'Métricas HTTP/jobs/DB com correlação request/event ID, sem segredos' });
      }

      if (type === 'requests') {
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        const pathFilter = url.searchParams.get('path');
        let q = 'SELECT * FROM observability_http_requests ORDER BY created_at DESC LIMIT $1';
        let vals = [limit];
        if (pathFilter) {
          q = 'SELECT * FROM observability_http_requests WHERE path ILIKE $2 ORDER BY created_at DESC LIMIT $1';
          vals = [limit, `%${pathFilter}%`];
        }
        const r = await pool.query(q, vals);
        return json(res, 200, { requests: r.rows, memory_recent: observability.getRecentRequests().slice(0, limit) });
      }

      if (type === 'jobs') {
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        const r = await pool.query('SELECT * FROM observability_job_executions ORDER BY created_at DESC LIMIT $1', [limit]);
        return json(res, 200, { jobs: r.rows, memory_recent: observability.getRecentJobs().slice(0, limit) });
      }

      if (type === 'db') {
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        const r = await pool.query('SELECT * FROM observability_db_metrics ORDER BY created_at DESC LIMIT $1', [limit]);
        return json(res, 200, { db_metrics: r.rows, memory_recent: observability.getRecentDb().slice(0, limit) });
      }

      if (type === 'alerts') {
        const status = url.searchParams.get('status') || 'firing';
        const r = await pool.query('SELECT * FROM observability_alerts WHERE status = $1 ORDER BY created_at DESC LIMIT 200', [status]);
        return json(res, 200, { alerts: r.rows, memory_firing: observability.getAlerts().filter(a => a.status === status).slice(0, 50) });
      }

      return json(res, 400, { error: 'invalid_type' });
    } catch (e) {
      console.error('observability metrics failed', e);
      return json(res, 503, { error: 'observability_unavailable' });
    }
  }

  async function handleAlertAction(req, res, alertId) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'observability_restricted' });

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(alertId)) return json(res, 400, { error: 'invalid_alert_id' });

    if (req.method !== 'POST' && req.method !== 'PATCH') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST, PATCH' });

    let body = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString('utf8');
      if (text) body = JSON.parse(text);
    } catch {}

    const action = body?.action || 'acknowledge';
    try {
      const pool = getPool();
      if (action === 'acknowledge') {
        const upd = await pool.query(`UPDATE observability_alerts SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`, [alertId, session.role]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'observability_alert_ack',$3,'allowed','none')", [session.role, session.identityId || session.role, alertId]); } catch {}
        // also update memory
        const memAlerts = observability.getAlerts();
        const mem = memAlerts.find(a => a.id === alertId);
        if (mem) { mem.status = 'acknowledged'; mem.acknowledged_by = session.role; }
        return json(res, 200, { alert: upd.rows[0] });
      }
      if (action === 'resolve') {
        const upd = await pool.query(`UPDATE observability_alerts SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`, [alertId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'observability_alert_resolve',$3,'allowed','none')", [session.role, session.identityId || session.role, alertId]); } catch {}
        const memAlerts = observability.getAlerts();
        const mem = memAlerts.find(a => a.id === alertId);
        if (mem) mem.status = 'resolved';
        return json(res, 200, { alert: upd.rows[0] });
      }
      return json(res, 400, { error: 'invalid_action' });
    } catch (e) {
      console.error('alert action failed', e);
      return json(res, 503, { error: 'alert_action_failed' });
    }
  }

  return { handleMetrics, handleAlertAction };
}
