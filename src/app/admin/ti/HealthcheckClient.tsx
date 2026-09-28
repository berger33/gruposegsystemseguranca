"use client";
import { useState } from "react";

export default function HealthcheckClient() {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [type, setType] = useState("health");

  async function load() {
    setMsg("Carregando...");
    try {
      let url = "/api/health";
      if (type === "live") url = "/api/health/live";
      if (type === "ready") url = "/api/health/ready";
      if (type === "operational") url = "/api/admin/operational";
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok && r.status !== 503) throw new Error(j.error || 'load_failed');
      setData(j);
      setMsg(`OK ${type} overall=${j.overall_status || j.status} degraded=${j.is_degraded} ready=${j.ready ?? 'n/a'} uptime=${j.uptime_seconds}s`);
    } catch (e: any) {
      setMsg(`Erro: ${e.message}`);
    }
  }

  async function loadHistory() {
    setMsg("Carregando histórico...");
    try {
      const r = await fetch('/api/admin/operational/history?limit=50');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'history_failed');
      setHistory(j);
      setMsg(`Histórico ${j.checks?.length || 0} checks, ${j.status_history?.length || 0} status`);
    } catch (e: any) {
      setMsg(`Erro hist: ${e.message}`);
    }
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>PLT-07 Healthcheck / Liveness / Readiness — degradação explícita dependências painel operacional restrito</h3>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Endpoints: /api/health/live (liveness processo), /api/health/ready (readiness DB crítico 503 se não ready), /api/health (full checks DB/queue/integrations/observability), /api/admin/operational (painel restrito admin/ti). Degradação explícita: overall healthy/degraded/unhealthy, is_degraded, degraded_dependencies, checks com latency_ms, degradation_reason, error_sanitized sem segredos.</p>
      {msg && <div style={{ background: '#f3f4f6', padding: 8, borderRadius: 8, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
          <option value="health">health</option><option value="live">live</option><option value="ready">ready</option><option value="operational">operational (restrito)</option>
        </select>
        <button onClick={load} style={{ padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12 }}>Carregar</button>
        <button onClick={loadHistory} style={{ padding: '6px 12px', borderRadius: 6, background: '#374151', color: '#fff', fontSize: 12 }}>Histórico</button>
      </div>

      {data && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', background: data.overall_status === 'healthy' ? '#dcfce7' : data.overall_status === 'degraded' ? '#fef3c7' : '#fee2e2', fontSize: 12 }}>
              <strong>Overall:</strong> {data.overall_status || data.status} {data.is_degraded ? '(DEGRADED)' : ''} {data.ready !== undefined ? (data.ready ? 'READY' : 'NOT READY') : ''}
            </div>
            <div style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 11 }}>Uptime {data.uptime_seconds}s<br/>Timestamp {data.timestamp}</div>
            {data.degraded_dependencies && data.degraded_dependencies.length > 0 && <div style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fef3c7', fontSize: 11 }}>Degraded deps: {data.degraded_dependencies.join(', ')}</div>}
          </div>
          {data.checks && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 10 }}>
              {data.checks.map((c: any) => (
                <div key={c.name} style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', background: c.status === 'healthy' ? '#f0fdf4' : c.status === 'degraded' ? '#fffbeb' : '#fef2f2', fontSize: 11 }}>
                  <div style={{ fontWeight: 600 }}>{c.name} • {c.dependency} • {c.status} {c.is_degraded ? '(degraded)' : ''}</div>
                  <div>latency {c.latency_ms}ms</div>
                  {c.degradation_reason && <div style={{ color: '#92400e' }}>degradação: {c.degradation_reason}</div>}
                  {c.error_sanitized && <div style={{ color: '#991b1b' }}>err: {c.error_sanitized.slice(0,100)}</div>}
                  {c.metadata && <div style={{ color: '#6b7280', fontSize: 10 }}>meta: {JSON.stringify(c.metadata).slice(0,120)}</div>}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: '#f9fafb', padding: 8, borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>{JSON.stringify(data, null, 2).slice(0, 5000)}</div>
        </div>
      )}

      {history && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 12, fontWeight: 600 }}>Histórico checks ({history.checks?.length || 0})</h4>
          <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 10, fontFamily: 'monospace' }}>
            {(history.checks || []).map((c: any) => (<div key={c.id} style={{ padding: 2, borderBottom: '1px solid #f3f4f6' }}>{new Date(c.checked_at).toLocaleString('pt-BR')} {c.check_name} {c.dependency_type} {c.status} {c.is_degraded ? 'DEGRADED' : ''} {c.latency_ms}ms {c.degradation_reason || ''}</div>))}
          </div>
          <h4 style={{ fontSize: 12, fontWeight: 600, marginTop: 10 }}>Histórico status ({history.status_history?.length || 0})</h4>
          <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 10, fontFamily: 'monospace' }}>
            {(history.status_history || []).map((s: any) => (<div key={s.id} style={{ padding: 2, borderBottom: '1px solid #f3f4f6' }}>{new Date(s.created_at).toLocaleString('pt-BR')} overall {s.overall_status} degraded {String(s.is_degraded)} deps {s.degraded_dependencies?.join(',') || '—'}</div>))}
          </div>
        </div>
      )}
    </div>
  );
}
