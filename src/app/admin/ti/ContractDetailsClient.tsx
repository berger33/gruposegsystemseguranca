"use client";
import { useState } from "react";

export default function ContractDetailsClient() {
  const [contractId, setContractId] = useState("");
  const [posts, setPosts] = useState<any[]>([]);
  const [sla, setSla] = useState<any[]>([]);
  const [obligations, setObligations] = useState<any[]>([]);
  const [exclusions, setExclusions] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [postForm, setPostForm] = useState({ title: "", shift: "comercial", quantity: "1", location: "", recurrence_type: "recorrente" });
  const [slaForm, setSlaForm] = useState({ service_type: "vigilancia", description: "", response_time_minutes: "", availability_percent: "" });
  const [obForm, setObForm] = useState({ party: "contratada", title: "", description: "", due_date: "" });
  const [exForm, setExForm] = useState({ description: "", category: "" });
  const [schedForm, setSchedForm] = useState({ milestone: "", planned_date: "", responsible_name: "" });

  async function load() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    const id = contractId.trim();
    const [p, s, o, e, sc] = await Promise.all([
      fetch(`/api/crm/contracts/${id}/posts`).then(r => r.json()),
      fetch(`/api/crm/contracts/${id}/sla`).then(r => r.json()),
      fetch(`/api/crm/contracts/${id}/obligations`).then(r => r.json()),
      fetch(`/api/crm/contracts/${id}/exclusions`).then(r => r.json()),
      fetch(`/api/crm/contracts/${id}/schedule`).then(r => r.json()),
    ]);
    if (p.posts) setPosts(p.posts);
    if (s.sla) setSla(s.sla);
    if (o.obligations) setObligations(o.obligations);
    if (e.exclusions) setExclusions(e.exclusions);
    if (sc.schedule) setSchedule(sc.schedule);
    setMsg(`Carregado contrato ${id}`);
  }

  async function createPost() {
    if (!postForm.title.trim()) { setMsg("title posto obrigatório"); return; }
    const body = { title: postForm.title.trim(), shift: postForm.shift, quantity: Number(postForm.quantity), location: postForm.location || null, recurrence_type: postForm.recurrence_type };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar posto: ${j.error}`);
    else { setMsg(`Posto criado ${j.post.id}`); load(); }
  }

  async function createSla() {
    if (!slaForm.description.trim()) { setMsg("description SLA obrigatório"); return; }
    const body = { service_type: slaForm.service_type, description: slaForm.description.trim(), response_time_minutes: slaForm.response_time_minutes ? Number(slaForm.response_time_minutes) : null, availability_percent: slaForm.availability_percent ? Number(slaForm.availability_percent) : null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/sla`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar SLA: ${j.error}`);
    else { setMsg(`SLA criado ${j.sla.id}`); load(); }
  }

  async function createObligation() {
    if (!obForm.title.trim() || !obForm.description.trim()) { setMsg("title e description obrigação obrigatórios"); return; }
    const body = { party: obForm.party, title: obForm.title.trim(), description: obForm.description.trim(), due_date: obForm.due_date || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/obligations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar obrigação: ${j.error}`);
    else { setMsg(`Obrigação criada ${j.obligation.id}`); load(); }
  }

  async function createExclusion() {
    if (!exForm.description.trim()) { setMsg("description exclusão obrigatório"); return; }
    const body = { description: exForm.description.trim(), category: exForm.category || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/exclusions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar exclusão: ${j.error}`);
    else { setMsg(`Exclusão criada ${j.exclusion.id}`); load(); }
  }

  async function createSchedule() {
    if (!schedForm.milestone.trim() || !schedForm.planned_date.trim()) { setMsg("milestone e planned_date obrigatórios"); return; }
    const body = { milestone: schedForm.milestone.trim(), planned_date: schedForm.planned_date.trim(), responsible_name: schedForm.responsible_name || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar cronograma: ${j.error}`);
    else { setMsg(`Cronograma criado ${j.item.id}`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CON-02 — Itens recorrentes/avulsos, postos/turnos, SLA, obrigações, exclusões, cronograma</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Postos/turnos contratados com shift diurno/noturno/12x36/24x48/comercial/madrugada, quantidade, schedule JSONB, location, recurrence_type recorrente/avulso/implantacao/outro. SLA com service_type, response/resolution, availability %. Obrigações por parte contratante/contratada/ambas. Exclusões. Cronograma com milestone, planned_date, status.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder="contract_id *" value={contractId} onChange={e => setContractId(e.target.value)} style={{ width: 360 }} />
        <button onClick={load}>Carregar detalhes CON-02</button>
      </div>

      {msg && <div style={{ fontSize: 12, marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h4>Postos/Turnos ({posts.length})</h4>
          <input placeholder="title *" value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={postForm.shift} onChange={e => setPostForm({ ...postForm, shift: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="diurno">diurno</option><option value="noturno">noturno</option><option value="12x36_dia">12x36_dia</option><option value="12x36_noite">12x36_noite</option><option value="24x48">24x48</option><option value="comercial">comercial</option><option value="madrugada">madrugada</option><option value="outro">outro</option>
          </select>
          <input placeholder="quantity" type="number" value={postForm.quantity} onChange={e => setPostForm({ ...postForm, quantity: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="location" value={postForm.location} onChange={e => setPostForm({ ...postForm, location: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={postForm.recurrence_type} onChange={e => setPostForm({ ...postForm, recurrence_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="recorrente">recorrente</option><option value="avulso">avulso</option><option value="implantacao">implantacao</option><option value="outro">outro</option>
          </select>
          <button onClick={createPost}>Criar posto/turno</button>
          <ul style={{ fontSize: 11 }}>{posts.map((p: any) => <li key={p.id}>{p.title} {p.shift} qtd {p.quantity} {p.location || ""} rec {p.recurrence_type} {p.is_24h ? "24h" : ""}</li>)}</ul>
        </div>

        <div>
          <h4>SLA ({sla.length})</h4>
          <select value={slaForm.service_type} onChange={e => setSlaForm({ ...slaForm, service_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="vigilancia">vigilancia</option><option value="portaria">portaria</option><option value="limpeza">limpeza</option><option value="monitoramento">monitoramento</option><option value="manutencao">manutencao</option><option value="atendimento">atendimento</option><option value="outro">outro</option>
          </select>
          <textarea placeholder="description *" value={slaForm.description} onChange={e => setSlaForm({ ...slaForm, description: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 4 }} />
          <input placeholder="response_time_minutes" type="number" value={slaForm.response_time_minutes} onChange={e => setSlaForm({ ...slaForm, response_time_minutes: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="availability_percent" type="number" value={slaForm.availability_percent} onChange={e => setSlaForm({ ...slaForm, availability_percent: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createSla}>Criar SLA</button>
          <ul style={{ fontSize: 11 }}>{sla.map((s: any) => <li key={s.id}>{s.service_type} {s.description.slice(0,80)} resp {s.response_time_minutes || "-"}m disp {s.availability_percent || "-"}%</li>)}</ul>
        </div>

        <div>
          <h4>Obrigações ({obligations.length})</h4>
          <select value={obForm.party} onChange={e => setObForm({ ...obForm, party: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="contratante">contratante</option><option value="contratada">contratada</option><option value="ambas">ambas</option>
          </select>
          <input placeholder="title *" value={obForm.title} onChange={e => setObForm({ ...obForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="description *" value={obForm.description} onChange={e => setObForm({ ...obForm, description: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 4 }} />
          <input placeholder="due_date YYYY-MM-DD" value={obForm.due_date} onChange={e => setObForm({ ...obForm, due_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createObligation}>Criar obrigação</button>
          <ul style={{ fontSize: 11 }}>{obligations.map((o: any) => <li key={o.id}>{o.party} {o.title} {o.status} {o.due_date || ""}</li>)}</ul>
        </div>

        <div>
          <h4>Exclusões ({exclusions.length}) + Cronograma ({schedule.length})</h4>
          <input placeholder="exclusão description *" value={exForm.description} onChange={e => setExForm({ ...exForm, description: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="categoria exclusão" value={exForm.category} onChange={e => setExForm({ ...exForm, category: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createExclusion}>Criar exclusão</button>
          <ul style={{ fontSize: 11 }}>{exclusions.map((ex: any) => <li key={ex.id}>{ex.description.slice(0,80)} cat {ex.category || "-"}</li>)}</ul>

          <div style={{ marginTop: 12 }}>
            <input placeholder="milestone *" value={schedForm.milestone} onChange={e => setSchedForm({ ...schedForm, milestone: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
            <input placeholder="planned_date YYYY-MM-DD *" value={schedForm.planned_date} onChange={e => setSchedForm({ ...schedForm, planned_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
            <input placeholder="responsible_name" value={schedForm.responsible_name} onChange={e => setSchedForm({ ...schedForm, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
            <button onClick={createSchedule}>Criar cronograma</button>
            <ul style={{ fontSize: 11 }}>{schedule.map((s: any) => <li key={s.id}>{s.milestone} {s.planned_date} {s.status} {s.responsible_name || ""}</li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}
