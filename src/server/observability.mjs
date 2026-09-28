export function createObservability({ getPool } = {}) {
  const metrics = {
    http_requests_total: 0,
    http_requests_5xx: 0,
    http_requests_4xx: 0,
    http_duration_sum: 0,
    http_duration_count: 0,
    db_queries_total: 0,
    db_queries_failed: 0,
    db_duration_sum: 0,
    jobs_total: 0,
    jobs_failed: 0,
    uptime_start: Date.now(),
  };
  const recentRequests = [];
  const recentJobs = [];
  const recentDb = [];
  const alerts = [];

  function sanitizeError(err) {
    if (!err) return null;
    const s = String(err).slice(0, 500);
    return s.replace(/password|secret|token|key/gi, '[redacted]');
  }
  function parseQueryType(q) {
    if (!q) return 'unknown';
    const m = String(q).trim().match(/^\s*(\w+)/);
    return m ? m[1].toLowerCase() : 'unknown';
  }
  function parseTableName(q) {
    if (!q) return null;
    const m = String(q).match(/from\s+([a-zA-Z0-9_\.]+)/i) || String(q).match(/into\s+([a-zA-Z0-9_\.]+)/i) || String(q).match(/update\s+([a-zA-Z0-9_\.]+)/i);
    return m ? m[1] : null;
  }

  function shouldSkipDb(pool) {
    if (!pool) return true;
    if (pool.__isPGlite || pool.__isPGliteProxy) return true;
    return false;
  }

  function recordHttp({ method, path, status_code, duration_ms, user_kind, user_id, ip, user_agent, error, correlation_id, request_id }) {
    metrics.http_requests_total++;
    if (status_code >= 500) metrics.http_requests_5xx++;
    if (status_code >= 400 && status_code < 500) metrics.http_requests_4xx++;
    if (duration_ms != null) {
      metrics.http_duration_sum += duration_ms;
      metrics.http_duration_count++;
    }
    const entry = {
      request_id: request_id || crypto.randomUUID(),
      correlation_id: correlation_id || null,
      method, path, status_code, duration_ms,
      user_kind: user_kind || null,
      user_id: user_id || null,
      ip_hash: ip ? 'hash' : null,
      user_agent_hash: user_agent ? 'hash' : null,
      error_sanitized: sanitizeError(error),
      created_at: new Date().toISOString(),
    };
    recentRequests.unshift(entry);
    if (recentRequests.length > 100) recentRequests.pop();
    if (getPool) {
      try {
        const pool = getPool();
        if (shouldSkipDb(pool)) {
          // skip for PGlite beta lite
        } else {
          pool.query(
            `INSERT INTO observability_http_requests (request_id, correlation_id, method, path, status_code, duration_ms, user_kind, user_id, ip_hash, user_agent_hash, error_sanitized) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [entry.request_id, entry.correlation_id, entry.method, entry.path, entry.status_code, entry.duration_ms, entry.user_kind, entry.user_id, entry.ip_hash, entry.user_agent_hash, entry.error_sanitized]
          ).catch(() => {});
        }
      } catch {}
    }
    evaluateAlerts(entry, null, null);
  }

  function recordJob({ job_name, correlation_id, request_id, status, duration_ms, attempts, error, metadata }) {
    metrics.jobs_total++;
    if (status === 'failed' || status === 'dead') metrics.jobs_failed++;
    const entry = {
      job_name,
      correlation_id: correlation_id || null,
      request_id: request_id || null,
      status,
      duration_ms: duration_ms || null,
      attempts: attempts || null,
      error_sanitized: sanitizeError(error),
      metadata: metadata || null,
      created_at: new Date().toISOString(),
    };
    recentJobs.unshift(entry);
    if (recentJobs.length > 100) recentJobs.pop();
    if (getPool) {
      try {
        const pool = getPool();
        if (shouldSkipDb(pool)) {
        } else {
          pool.query(
            `INSERT INTO observability_job_executions (job_name, correlation_id, request_id, status, duration_ms, attempts, error_sanitized, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [job_name, entry.correlation_id, entry.request_id, status, entry.duration_ms, entry.attempts, entry.error_sanitized, entry.metadata ? JSON.stringify(entry.metadata) : null]
          ).catch(() => {});
        }
      } catch {}
    }
    evaluateAlerts(null, entry, null);
  }

  function recordDb({ query, duration_ms, success, error, correlation_id, request_id }) {
    metrics.db_queries_total++;
    if (!success) metrics.db_queries_failed++;
    if (duration_ms != null) metrics.db_duration_sum += duration_ms;
    const entry = {
      query_type: parseQueryType(query),
      table_name: parseTableName(query),
      duration_ms: duration_ms || null,
      success: !!success,
      error_sanitized: sanitizeError(error),
      correlation_id: correlation_id || null,
      request_id: request_id || null,
      created_at: new Date().toISOString(),
    };
    recentDb.unshift(entry);
    if (recentDb.length > 100) recentDb.pop();
    if (getPool) {
      try {
        const pool = getPool();
        if (shouldSkipDb(pool)) {
        } else {
          pool.query(
            `INSERT INTO observability_db_metrics (query_type, table_name, duration_ms, success, error_sanitized, correlation_id, request_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [entry.query_type, entry.table_name, entry.duration_ms, entry.success, entry.error_sanitized, entry.correlation_id, entry.request_id]
          ).catch(() => {});
        }
      } catch {}
    }
    evaluateAlerts(null, null, entry);
  }

  function wrapPool(pool) {
    if (!pool || pool.__observabilityWrapped) return pool;
    const originalQuery = pool.query.bind(pool);
    pool.query = async function(...args) {
      // Telemetria grava no mesmo pool. Instrumentar a própria gravação gera
      // uma nova gravação de métrica recursivamente e esgota o pool PostgreSQL.
      const sql = typeof args[0] === 'string' ? args[0] : args[0]?.text;
      if (/^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+observability_[a-z_]+\b/i.test(sql || '')) {
        return originalQuery(...args);
      }
      const start = Date.now();
      let success = true;
      let error = null;
      try {
        const res = await originalQuery(...args);
        return res;
      } catch (e) {
        success = false;
        error = e;
        throw e;
      } finally {
        const duration = Date.now() - start;
        const corr = globalThis.__currentCorrelationId || null;
        const reqId = globalThis.__currentRequestId || null;
        recordDb({ query: args[0], duration_ms: duration, success, error, correlation_id: corr, request_id: reqId });
      }
    };
    pool.__observabilityWrapped = true;
    return pool;
  }

  function evaluateAlerts(httpEntry, jobEntry, dbEntry) {
    if (metrics.http_requests_total > 10 && metrics.http_requests_5xx / metrics.http_requests_total > 0.1) {
      triggerAlert({ key: 'http_5xx_rate', metric: 'http_5xx_rate', severity: 'critical', threshold: 0.1, current: metrics.http_requests_5xx / metrics.http_requests_total, message: `Taxa 5xx alta: ${(metrics.http_requests_5xx / metrics.http_requests_total * 100).toFixed(1)}% (${metrics.http_requests_5xx}/${metrics.http_requests_total})` });
    }
    if (httpEntry && httpEntry.duration_ms > 3000) {
      triggerAlert({ key: `http_slow_${httpEntry.path}`, metric: 'http_duration_ms', severity: 'warning', threshold: 3000, current: httpEntry.duration_ms, message: `Requisição lenta ${httpEntry.method} ${httpEntry.path}: ${httpEntry.duration_ms}ms req_id=${httpEntry.request_id}` });
    }
    if (metrics.db_queries_total > 10 && metrics.db_queries_failed / metrics.db_queries_total > 0.05) {
      triggerAlert({ key: 'db_failure_rate', metric: 'db_failure_rate', severity: 'critical', threshold: 0.05, current: metrics.db_queries_failed / metrics.db_queries_total, message: `Taxa falha DB alta: ${(metrics.db_queries_failed / metrics.db_queries_total * 100).toFixed(1)}%` });
    }
    if (jobEntry && (jobEntry.status === 'failed' || jobEntry.status === 'dead')) {
      triggerAlert({ key: `job_failed_${jobEntry.job_name}`, metric: 'job_failure', severity: jobEntry.status === 'dead' ? 'critical' : 'warning', threshold: 1, current: 1, message: `Job ${jobEntry.job_name} falhou: ${jobEntry.error_sanitized || 'sem detalhe'} corr=${jobEntry.correlation_id}` });
    }
    if (dbEntry && dbEntry.duration_ms > 2000) {
      triggerAlert({ key: `db_slow_${dbEntry.table_name || 'unknown'}`, metric: 'db_duration_ms', severity: 'warning', threshold: 2000, current: dbEntry.duration_ms, message: `Query lenta ${dbEntry.query_type} ${dbEntry.table_name || ''}: ${dbEntry.duration_ms}ms` });
    }
  }

  function triggerAlert({ key, metric, severity, threshold, current, message }) {
    const existing = alerts.find(a => a.alert_key === key && a.status === 'firing');
    if (existing && Date.now() - new Date(existing.created_at).getTime() < 60000) {
      return;
    }
    const alert = {
      id: crypto.randomUUID(),
      alert_key: key,
      metric_name: metric,
      severity,
      status: 'firing',
      threshold_value: threshold,
      current_value: current,
      message: sanitizeError(message),
      correlation_id: globalThis.__currentCorrelationId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    alerts.unshift(alert);
    if (alerts.length > 200) alerts.pop();
    if (getPool) {
      try {
        const pool = getPool();
        if (shouldSkipDb(pool)) {
        } else {
          pool.query(
            `INSERT INTO observability_alerts (alert_key, metric_name, severity, status, threshold_value, current_value, message, correlation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [key, metric, severity, 'firing', threshold, current, alert.message, alert.correlation_id]
          ).catch(() => {});
        }
      } catch {}
    }
  }

  function generateRequestId() {
    try { return crypto.randomUUID(); } catch { return `req-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
  }
  function generateCorrelationId(requestId) {
    return requestId ? `corr-${requestId.slice(0,8)}` : `corr-${Date.now()}`;
  }
  function getMetrics() {
    const avgDuration = metrics.http_duration_count ? metrics.http_duration_sum / metrics.http_duration_count : 0;
    const avgDbDuration = metrics.db_queries_total ? metrics.db_duration_sum / metrics.db_queries_total : 0;
    return {
      ...metrics,
      http_avg_duration_ms: Math.round(avgDuration),
      db_avg_duration_ms: Math.round(avgDbDuration),
      recent_requests: recentRequests.slice(0, 20),
      recent_jobs: recentJobs.slice(0, 20),
      recent_db: recentDb.slice(0, 20),
      alerts_firing: alerts.filter(a => a.status === 'firing').slice(0, 20),
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      note: 'Observabilidade HTTP/jobs/DB com correlação request/event ID, métricas e alertas acionáveis, sem segredos',
    };
  }
  function getRecentRequests() { return recentRequests; }
  function getRecentJobs() { return recentJobs; }
  function getRecentDb() { return recentDb; }
  function getAlerts() { return alerts; }

  return {
    recordHttp,
    recordJob,
    recordDb,
    wrapPool,
    getMetrics,
    getRecentRequests,
    getRecentJobs,
    getRecentDb,
    getAlerts,
    generateRequestId,
    generateCorrelationId,
  };
}
