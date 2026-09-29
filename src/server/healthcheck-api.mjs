// PLT-07 healthcheck/liveness/readiness degradação explícita dependências painel operacional restrito
export function createHealthcheckApi({ json, getPool, readAdminSession, sameOrigin, observability }) {
  function sanitizeError(err) {
    if (!err) return null;
    let msg = err instanceof Error ? err.message : String(err);
    msg = msg.replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');
    msg = msg.replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]');
    msg = msg.replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]');
    return msg.slice(0, 1000);
  }

  async function checkDatabase() {
    const start = Date.now();
    try {
      const pool = getPool();
      await pool.query('SELECT 1 AS ok');
      return { name: 'database', dependency: 'database', status: 'healthy', latency_ms: Date.now() - start, is_degraded: false, error: null };
    } catch (e) {
      return { name: 'database', dependency: 'database', status: 'unhealthy', latency_ms: Date.now() - start, is_degraded: true, degradation_reason: 'Database unavailable', error_sanitized: sanitizeError(e) };
    }
  }

  async function checkQueue() {
    const start = Date.now();
    try {
      const pool = getPool();
      const r = await pool.query("SELECT COUNT(*)::int AS queued FROM notification_queue WHERE status = 'queued'");
      const queued = r.rows[0]?.queued || 0;
      const isDegraded = queued > 100;
      return { name: 'queue', dependency: 'queue', status: isDegraded ? 'degraded' : 'healthy', latency_ms: Date.now() - start, is_degraded: isDegraded, degradation_reason: isDegraded ? `Fila com ${queued} pendentes` : null, metadata: { queued } };
    } catch (e) {
      return { name: 'queue', dependency: 'queue', status: 'degraded', latency_ms: Date.now() - start, is_degraded: true, degradation_reason: 'Queue check failed', error_sanitized: sanitizeError(e) };
    }
  }

  async function checkIntegrations() {
    const start = Date.now();
    try {
      const pool = getPool();
      const r = await pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'failure')::int AS failures FROM integrations");
      const failures = r.rows[0]?.failures || 0;
      const isDegraded = failures > 0;
      return { name: 'integrations', dependency: 'other', status: isDegraded ? 'degraded' : 'healthy', latency_ms: Date.now() - start, is_degraded: isDegraded, degradation_reason: isDegraded ? `${failures} integrações em falha` : null, metadata: { total: r.rows[0]?.total, failures } };
    } catch {
      return { name: 'integrations', dependency: 'other', status: 'unknown', latency_ms: Date.now() - start, is_degraded: false };
    }
  }

  async function checkObservability() {
    const start = Date.now();
    try {
      const obs = observability ? observability.getMetrics() : null;
      const has5xx = obs && obs.http_requests_5xx > 5;
      return { name: 'observability', dependency: 'other', status: has5xx ? 'degraded' : 'healthy', latency_ms: Date.now() - start, is_degraded: !!has5xx, degradation_reason: has5xx ? `5xx recentes: ${obs.http_requests_5xx}` : null, metadata: obs ? { http_5xx: obs.http_requests_5xx, jobs_failed: obs.jobs_failed } : null };
    } catch (e) {
      return { name: 'observability', dependency: 'other', status: 'unknown', latency_ms: Date.now() - start, is_degraded: false, error_sanitized: sanitizeError(e) };
    }
  }

  async function runAllChecks() {
    const checks = await Promise.all([checkDatabase(), checkQueue(), checkIntegrations(), checkObservability()]);
    const unhealthy = checks.filter(c => c.status === 'unhealthy');
    const degraded = checks.filter(c => c.is_degraded);
    let overall = 'healthy';
    if (unhealthy.length > 0) overall = 'unhealthy';
    else if (degraded.length > 0) overall = 'degraded';
    const isDegraded = degraded.length > 0 || unhealthy.length > 0;
    const degradedDeps = degraded.map(c => c.name);
    return { overall_status: overall, is_degraded: isDegraded, degraded_dependencies: degradedDeps, checks, timestamp: new Date().toISOString(), uptime_seconds: Math.round(process.uptime()) };
  }

  async function handleLive(req, res) {
    // Liveness: server is running, no dependency check
    const payload = { status: 'healthy', check: 'liveness', timestamp: new Date().toISOString(), uptime_seconds: Math.round(process.uptime()), note: 'Liveness: processo Node responde' };
    return json(res, 200, payload);
  }

  async function handleReady(req, res) {
    // Readiness: checks critical dependencies
    const result = await runAllChecks();
    const dbCheck = result.checks.find(c => c.name === 'database');
    const isReady = dbCheck && dbCheck.status === 'healthy';
    const statusCode = isReady ? (result.is_degraded ? 200 : 200) : 503;
    // Persist check
    try {
      const pool = getPool();
      for (const c of result.checks) {
        await pool.query(
          `INSERT INTO operational_health_checks (check_name, dependency_type, status, latency_ms, is_degraded, degradation_reason, error_sanitized, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [c.name, c.dependency, c.status, c.latency_ms, c.is_degraded, c.degradation_reason || null, c.error_sanitized || null, c.metadata ? JSON.stringify(c.metadata) : null]
        ).catch(() => {});
      }
      await pool.query(`INSERT INTO operational_status (overall_status, is_degraded, degraded_dependencies, checks) VALUES ($1,$2,$3,$4)`, [result.overall_status, result.is_degraded, result.degraded_dependencies, JSON.stringify(result.checks)]).catch(() => {});
    } catch {}
    return json(res, statusCode, { ...result, ready: isReady, note: isReady ? (result.is_degraded ? 'Ready com degradação explícita' : 'Ready healthy') : 'Not ready: dependência crítica falhou' });
  }

  async function handleHealth(req, res) {
    // Full health with auth for operational panel restrito
    const isOperationalPanel = req.url && (req.url.includes('/api/admin/') || req.url.includes('/operational'));
    if (isOperationalPanel) {
      if (sameOrigin && !sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
      if (readAdminSession) {
        const session = readAdminSession(req);
        if (!session) return json(res, 401, { error: 'admin_session_required' });
        if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'operational_panel_restricted_admin_ti' });
      }
    }

    const result = await runAllChecks();
    try {
      const pool = getPool();
      if (readAdminSession) {
        const session = readAdminSession(req);
        if (session) {
          await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'healthcheck_query',$3,'allowed','none')", [session.role, session.identityId || session.role, result.overall_status]).catch(() => {});
        }
      }
    } catch {}

    return json(res, 200, { ...result, note: 'Healthcheck com degradação explícita de dependências, sem segredos, painel operacional restrito admin/ti' });
  }

  async function handleOperationalHistory(req, res) {
    if (sameOrigin && !sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'operational_panel_restricted' });

    try {
      const pool = getPool();
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      const checks = await pool.query('SELECT * FROM operational_health_checks ORDER BY checked_at DESC LIMIT $1', [limit]);
      const status = await pool.query('SELECT * FROM operational_status ORDER BY created_at DESC LIMIT $1', [limit]);
      return json(res, 200, { checks: checks.rows, status_history: status.rows, note: 'Histórico healthcheck painel operacional restrito' });
    } catch (e) {
      console.error('operational history failed', e);
      return json(res, 503, { error: 'operational_history_unavailable' });
    }
  }

  return { handleLive, handleReady, handleHealth, handleOperationalHistory, runAllChecks };
}
