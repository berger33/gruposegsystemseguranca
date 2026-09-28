"use client";
import { useState } from "react";

export default function ObservabilityClient() {
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [type, setType] = useState("summary");
  const [limit, setLimit] = useState("50");

  async function load() {
    setMsg("Carregando...");
    try {
      const r = await fetch(`/api/admin/observability?type=${type}&limit=${limit}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'load_failed');
      setData(j);
      setMsg(`OK ${type} — ${j.note || ''} — ${new Date().toISOString()}`);
    } catch (e: any) {
      setMsg(`Erro: ${e.message}`);
    }
  }

  async function ackAlert(id: string, action: string) {
    const r = await fetch(`/api/admin/observability/alerts/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro ack: ${j.error}`); return; }
    setMsg(`Alerta ${id} ${action} OK`);
    await load();
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>PLT-06 Observabilidade — HTTP/jobs/DB correlação request/event ID métricas alertas sem segredos</h3>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Request ID + Correlation ID (X-Request-Id/X-Correlation-Id), métricas HTTP/jobs/DB, duração, status, ip_hash/user_agent_hash, error_sanitized sem segredos, alertas acionáveis (5xx rate, slow, DB failure, job failed).</p>
      {msg && <div style={{ background: '#f3f4f6', padding: 8, borderRadius: 8, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
          <option value="summary">summary</option><option value="requests">requests</option><option value="jobs">jobs</option><option value="db">db</option><option value="alerts">alerts</option>
        </select>
        <input value={limit} onChange={e => setLimit(e.target.value)} placeholder="limit" style={{ width: 60, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
        <button onClick={load} style={{ padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12 }}>Carregar</button>
      </div>

      {data && (
        <div style={{ marginTop: 12 }}>
          {type === 'summary' && data.memory && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}><strong>HTTP total</strong><br/>{data.memory.http_requests_total} (5xx {data.memory.http_requests_5xx} 4xx {data.memory.http_requests_4xx})<br/>avg {data.memory.http_avg_duration_ms}ms</div>
                <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}><strong>DB total</strong><br/>{data.memory.db_queries_total} failed {data.memory.db_queries_failed}<br/>avg {data.memory.db_avg_duration_ms}ms</div>
                <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}><strong>Jobs total</strong><br/>{data.memory.jobs_total} failed {data.memory.jobs_failed}<br/>uptime {data.memory.uptime_seconds}s</div>
                <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}><strong>Alertas firing</strong><br/>{data.memory.alerts_firing?.length || 0}<br/>{data.db_aggregates?.alerts?.critical ? `critical ${data.db_aggregates.alerts.critical}` : ''}</div>
              </div>
              {data.db_aggregates && (
                <div style={{ marginTop: 10, padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}>
                  <strong>DB aggregates 1h</strong><br/>
                  HTTP: total {data.db_aggregates.http_1h?.total} 5xx {data.db_aggregates.http_1h?.cnt_5xx} avg {data.db_aggregates.http_1h?.avg_duration} max {data.db_aggregates.http_1h?.max_duration}<br/>
                  Jobs: total {data.db_aggregates.jobs_1h?.total} failed {data.db_aggregates.jobs_1h?.failed} avg {data.db_aggregates.jobs_1h?.avg_duration}<br/>
                  DB: total {data.db_aggregates.db_1h?.total} failed {data.db_aggregates.db_1h?.failed} avg {data.db_aggregates.db_1h?.avg_duration} max {data.db_aggregates.db_1h?.max_duration}<br/>
                  Alerts firing {data.db_aggregates.alerts?.firing} critical {data.db_aggregates.alerts?.critical}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <h4 style={{ fontSize: 12, fontWeight: 600 }}>Recent requests (memory)</h4>
                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 10, fontFamily: 'monospace' }}>
                  {(data.memory.recent_requests || []).map((r: any) => (<div key={r.request_id} style={{ padding: 2, borderBottom: '1px solid #f3f4f6' }}>{r.request_id} {r.correlation_id?.slice(0,12)} {r.method} {r.path} {r.status_code} {r.duration_ms}ms {r.user_kind || 'anon'} {r.error_sanitized ? `ERR:${r.error_sanitized.slice(0,50)}` : ''}</div>))}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <h4 style={{ fontSize: 12, fontWeight: 600 }}>Alerts firing</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {(data.memory.alerts_firing || []).map((a: any) => (<div key={a.id} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, background: a.severity === 'critical' ? '#fee2e2' : '#fef3c7' }}><div style={{ fontWeight: 600 }}>{a.alert_key} • {a.severity} • {a.metric_name} • {a.current_value} / thresh {a.threshold_value}</div><div>{a.message}</div><div style={{ color: '#6b7280' }}>{a.correlation_id || ''} • {new Date(a.created_at).toLocaleString('pt-BR')}</div></div>))}
                </div>
              </div>
            </>
          )}
          {type === 'requests' && (
            <div style={{ maxHeight: 400, overflowY: 'auto', fontSize: 11 }}>
              {(data.requests || data.memory_recent || []).map((r: any) => (<div key={r.id || r.request_id} style={{ padding: 4, borderBottom: '1px solid #f3f4f6' }}>{r.request_id} {r.method} {r.path} {r.status_code} {r.duration_ms}ms ip_hash:{r.ip_hash?.slice(0,8)} err:{r.error_sanitized?.slice(0,60) || '—'} {new Date(r.created_at).toLocaleString('pt-BR')}</div>))}
            </div>
          )}
          {type === 'alerts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data.alerts || data.memory_firing || []).map((a: any) => (
                <div key={a.id} style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11, background: a.status === 'firing' ? (a.severity === 'critical' ? '#fee2e2' : '#fef3c7') : '#f3f4f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>{a.alert_key} • {a.severity} • {a.status}</span><span>{new Date(a.created_at).toLocaleString('pt-BR')}</span></div>
                  <div>{a.message}</div>
                  <div style={{ color: '#6b7280' }}>metric {a.metric_name} cur {a.current_value} thresh {a.threshold_value} corr {a.correlation_id || '—'}</div>
                  {a.status === 'firing' && <div style={{ display: 'flex', gap: 4, marginTop: 4 }}><button onClick={() => ackAlert(a.id, 'acknowledge')} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db' }}>Ack</button><button onClick={() => ackAlert(a.id, 'resolve')} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db' }}>Resolve</button></div>}
                </div>
              ))}
            </div>
          )}
          {(type === 'jobs' || type === 'db') && (
            <div style={{ maxHeight: 400, overflowY: 'auto', fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2).slice(0, 8000)}</div>
          )}
        </div>
      )}
    </div>
  );
}
