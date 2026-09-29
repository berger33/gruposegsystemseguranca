"use client";
import { useEffect, useState } from "react";

type Param = {
  id: string;
  category: string;
  param_key: string;
  param_value: string;
  value_type: string;
  unit: string | null;
  validity_start: string | null;
  validity_end: string | null;
  source: string | null;
  is_essential: boolean;
  approval_status: string;
  version: number;
  notes: string | null;
};

export default function CostParameterClient() {
  const [params, setParams] = useState<Param[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [keyFilter, setKeyFilter] = useState("");
  const [essentialOnly, setEssentialOnly] = useState(false);
  const [form, setForm] = useState({ param_key: "", category: "tributo", param_value: "0", value_type: "percentual", unit: "%", source: "", validity_start: "", validity_end: "", is_essential: true, notes: "" });
  const [msg, setMsg] = useState("");
  const [essentialCheck, setEssentialCheck] = useState<{ can_price_official: boolean; missing_essential: any[]; count_missing: number } | null>(null);

  async function load() {
    const q = new URLSearchParams();
    if (category) q.set("category", category);
    if (status) q.set("status", status);
    if (keyFilter) q.set("key", keyFilter);
    if (essentialOnly) q.set("essential", "true");
    q.set("limit", "100");
    const r = await fetch(`/api/crm/cost-parameters?${q.toString()}`);
    const j = await r.json();
    if (r.ok) { setParams(j.params || []); setTotal(j.total || 0); }
    else setMsg(`Erro listar: ${j.error || r.status}`);
  }

  async function loadEssentialCheck() {
    const r = await fetch(`/api/crm/cost-parameters/essential-check`);
    const j = await r.json();
    if (r.ok) setEssentialCheck(j);
  }

  useEffect(() => { load(); loadEssentialCheck(); }, []);

  async function create() {
    setMsg("");
    if (!form.param_key.trim()) { setMsg("param_key obrigatório"); return; }
    const body = {
      param_key: form.param_key.trim(),
      category: form.category,
      param_value: Number(form.param_value),
      value_type: form.value_type,
      unit: form.unit || null,
      source: form.source || null,
      validity_start: form.validity_start || null,
      validity_end: form.validity_end || null,
      is_essential: form.is_essential,
      notes: form.notes || null,
    };
    const r = await fetch(`/api/crm/cost-parameters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro criar: ${j.error || r.status}`); return; }
    setMsg(`Criado ${j.param.id}`);
    setForm({ param_key: "", category: "tributo", param_value: "0", value_type: "percentual", unit: "%", source: "", validity_start: "", validity_end: "", is_essential: true, notes: "" });
    load(); loadEssentialCheck();
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-16 — Parâmetros tributos/custos/jornada versionados</h2>
      <p style={{ fontSize: 13, color: "#555" }}>Sem alíquota inventada. Fonte obrigatória para aprovação. Essenciais bloqueiam preço oficial se não aprovados. Validade, fonte, aprovador, versão.</p>

      {essentialCheck && (
        <div style={{ padding: 12, background: essentialCheck.can_price_official ? "#e6ffe6" : "#ffe6e6", borderRadius: 6, marginBottom: 12 }}>
          <strong>Check preço oficial:</strong> {essentialCheck.can_price_official ? "Liberado (todos essenciais aprovados)" : `Bloqueado — ${essentialCheck.count_missing} essenciais pendentes`}
          {!essentialCheck.can_price_official && (
            <ul style={{ margin: "8px 0 0", fontSize: 12 }}>
              {essentialCheck.missing_essential.map((m: any, i: number) => (
                <li key={i}>{m.category} / {m.param_key} — {m.approval_status}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Todas categorias</option>
          <option value="tributo">tributo</option>
          <option value="custo">custo</option>
          <option value="jornada">jornada</option>
          <option value="beneficio">beneficio</option>
          <option value="provisao">provisao</option>
          <option value="outro">outro</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos status</option>
          <option value="rascunho">rascunho</option>
          <option value="em_revisao">em_revisao</option>
          <option value="aprovado">aprovado</option>
          <option value="arquivado">arquivado</option>
        </select>
        <input placeholder="chave" value={keyFilter} onChange={e => setKeyFilter(e.target.value)} style={{ width: 140 }} />
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={essentialOnly} onChange={e => setEssentialOnly(e.target.checked)} /> só essenciais</label>
        <button onClick={() => { load(); loadEssentialCheck(); }}>Filtrar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 12 }}>
        <input placeholder="param_key ex: INSS_PATRONAL" value={form.param_key} onChange={e => setForm({ ...form, param_key: e.target.value })} />
        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          <option value="tributo">tributo</option>
          <option value="custo">custo</option>
          <option value="jornada">jornada</option>
          <option value="beneficio">beneficio</option>
          <option value="provisao">provisao</option>
          <option value="outro">outro</option>
        </select>
        <input type="number" step="0.000001" placeholder="valor" value={form.param_value} onChange={e => setForm({ ...form, param_value: e.target.value })} />
        <select value={form.value_type} onChange={e => setForm({ ...form, value_type: e.target.value })}>
          <option value="percentual">percentual</option>
          <option value="valor">valor</option>
          <option value="json">json</option>
        </select>
        <input placeholder="unidade %" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
        <input placeholder="fonte ex: CLT art, convenção" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} />
        <input type="date" value={form.validity_start} onChange={e => setForm({ ...form, validity_start: e.target.value })} />
        <input type="date" value={form.validity_end} onChange={e => setForm({ ...form, validity_end: e.target.value })} />
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={form.is_essential} onChange={e => setForm({ ...form, is_essential: e.target.checked })} /> essencial (bloqueia preço oficial)</label>
        <input placeholder="notas" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
      </div>
      <button onClick={create}>Criar parâmetro</button>
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: "#333" }}>{msg}</div>}

      <h3 style={{ marginTop: 16 }}>Parâmetros ({total})</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr><th style={{ borderBottom: "1px solid #ccc" }}>categoria</th><th>chave</th><th>valor</th><th>tipo</th><th>un</th><th>essencial</th><th>status</th><th>versão</th><th>validade</th><th>fonte</th></tr></thead>
        <tbody>
          {params.map(p => (
            <tr key={p.id}>
              <td>{p.category}</td>
              <td>{p.param_key}</td>
              <td>{p.param_value}</td>
              <td>{p.value_type}</td>
              <td>{p.unit || "-"}</td>
              <td>{p.is_essential ? "sim" : "não"}</td>
              <td>{p.approval_status}</td>
              <td>{p.version}</td>
              <td>{p.validity_start || "-"} → {p.validity_end || "-"}</td>
              <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{p.source || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
