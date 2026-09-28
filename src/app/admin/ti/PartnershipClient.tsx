"use client";
import { useEffect, useState } from "react";

export default function PartnershipClient() {
  const [partners, setPartners] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [renewals, setRenewals] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [partnerForm, setPartnerForm] = useState({ display_name: "", type: "parceiro", email: "", responsible_name: "", commission_percent: "" });
  const [referralForm, setReferralForm] = useState({ partner_id: "", title: "", referred_company_id: "", responsible_name: "" });
  const [renewalForm, setRenewalForm] = useState({ company_id: "", type: "renovacao", title: "", previous_value: "", new_value: "", renewal_date: "", responsible_name: "" });

  async function load() {
    const [p, r, ren, m] = await Promise.all([
      fetch("/api/crm/partners?limit=100").then(res => res.json()),
      fetch("/api/crm/referrals?limit=100").then(res => res.json()),
      fetch("/api/crm/renewals?limit=100").then(res => res.json()),
      fetch("/api/crm/partnership-metrics").then(res => res.json()),
    ]);
    if (p.partners) setPartners(p.partners);
    if (r.referrals) setReferrals(r.referrals);
    if (ren.renewals) setRenewals(ren.renewals);
    if (m) setMetrics(m);
  }

  useEffect(() => { load(); }, []);

  async function createPartner() {
    if (!partnerForm.display_name) { setMsg("display_name obrigatório"); return; }
    const body: any = { display_name: partnerForm.display_name, type: partnerForm.type, email: partnerForm.email || null, responsible_name: partnerForm.responsible_name || null };
    if (partnerForm.commission_percent) body.commission_percent = Number(partnerForm.commission_percent);
    const res = await fetch("/api/crm/partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro criar parceiro: ${j.error}`);
    else { setMsg(`Parceiro criado ${j.partner.id}`); load(); }
  }

  async function createReferral() {
    if (!referralForm.title) { setMsg("Título obrigatório e partner_id ou referrer"); return; }
    const body: any = { title: referralForm.title, partner_id: referralForm.partner_id || null, referred_company_id: referralForm.referred_company_id || null, responsible_name: referralForm.responsible_name || null };
    const res = await fetch("/api/crm/referrals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro criar indicação: ${j.error}`);
    else { setMsg(`Indicação criada ${j.referral.id}`); load(); }
  }

  async function createRenewal() {
    if (!renewalForm.company_id || !renewalForm.title) { setMsg("company_id e título obrigatórios"); return; }
    const body: any = { company_id: renewalForm.company_id, type: renewalForm.type, title: renewalForm.title, previous_value: renewalForm.previous_value ? Number(renewalForm.previous_value) : null, new_value: renewalForm.new_value ? Number(renewalForm.new_value) : null, renewal_date: renewalForm.renewal_date || null, responsible_name: renewalForm.responsible_name || null };
    const res = await fetch("/api/crm/renewals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro criar renovação: ${j.error}`);
    else { setMsg(`Renovação/upsell/recuperação criada ${j.renewal.id} uplift ${j.renewal.uplift_percent}%`); load(); }
  }

  async function updateReferralStatus(id: string, status: string) {
    const res = await fetch(`/api/crm/referrals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro atualizar indicação: ${j.error}`);
    else { setMsg(`Indicação ${id} status ${status}`); load(); }
  }

  async function updateRenewalStatus(id: string, status: string) {
    const res = await fetch(`/api/crm/renewals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro atualizar renovação: ${j.error}`);
    else { setMsg(`Renovação ${id} status ${status}`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-27 — Parcerias e indicações, renovação/upsell e recuperação da carteira</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Parceiros com tipo parceiro/revenda/indicador/fornecedor/outro, responsável e comissão. Indicações com partner_id ou referrer, status pendente/em_contato/qualificada/convertida/rejeitada/expirada, responsável e métricas. Renovações com tipo renovacao/upsell/cross_sell/recuperacao, previous/new value, uplift %, renewal_date, status planejada/em_negociacao/proposta_enviada/ganha/perdida/cancelada, responsável e métricas JSONB dias_desde_ultimo_contato/tentativas/motivo_perda_anterior.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div>
          <h4>Parceiros</h4>
          <input placeholder="display_name *" value={partnerForm.display_name} onChange={e => setPartnerForm({ ...partnerForm, display_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={partnerForm.type} onChange={e => setPartnerForm({ ...partnerForm, type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="parceiro">parceiro</option><option value="revenda">revenda</option><option value="indicador">indicador</option><option value="fornecedor">fornecedor</option><option value="outro">outro</option>
          </select>
          <input placeholder="email" value={partnerForm.email} onChange={e => setPartnerForm({ ...partnerForm, email: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="responsible_name" value={partnerForm.responsible_name} onChange={e => setPartnerForm({ ...partnerForm, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="commission_percent" type="number" value={partnerForm.commission_percent} onChange={e => setPartnerForm({ ...partnerForm, commission_percent: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createPartner}>Criar parceiro</button>
          <ul style={{ fontSize: 11 }}>{partners.map((p: any) => <li key={p.id}>{p.display_name} {p.type} {p.status} resp {p.responsible_name || "-"} {p.commission_percent ? `${p.commission_percent}%` : ""}</li>)}</ul>
        </div>

        <div>
          <h4>Indicações</h4>
          <input placeholder="partner_id (opcional)" value={referralForm.partner_id} onChange={e => setReferralForm({ ...referralForm, partner_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="title *" value={referralForm.title} onChange={e => setReferralForm({ ...referralForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="referred_company_id" value={referralForm.referred_company_id} onChange={e => setReferralForm({ ...referralForm, referred_company_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="responsible_name" value={referralForm.responsible_name} onChange={e => setReferralForm({ ...referralForm, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createReferral}>Criar indicação</button>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginTop: 8 }}>
            <thead><tr><th>título</th><th>status</th><th>resp</th><th>ação</th></tr></thead>
            <tbody>{referrals.map((r: any) => (
              <tr key={r.id}><td>{r.title}</td><td>{r.status}</td><td>{r.responsible_name || "-"}</td>
                <td>
                  <button onClick={() => updateReferralStatus(r.id, "convertida")}>Converter</button>
                  <button onClick={() => updateReferralStatus(r.id, "qualificada")} style={{ marginLeft: 2 }}>Qualificar</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <div>
          <h4>Renovação/Upsell/Recuperação</h4>
          <input placeholder="company_id *" value={renewalForm.company_id} onChange={e => setRenewalForm({ ...renewalForm, company_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={renewalForm.type} onChange={e => setRenewalForm({ ...renewalForm, type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="renovacao">renovacao</option><option value="upsell">upsell</option><option value="cross_sell">cross_sell</option><option value="recuperacao">recuperacao</option>
          </select>
          <input placeholder="title *" value={renewalForm.title} onChange={e => setRenewalForm({ ...renewalForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="previous_value" type="number" value={renewalForm.previous_value} onChange={e => setRenewalForm({ ...renewalForm, previous_value: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="new_value" type="number" value={renewalForm.new_value} onChange={e => setRenewalForm({ ...renewalForm, new_value: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="renewal_date YYYY-MM-DD" value={renewalForm.renewal_date} onChange={e => setRenewalForm({ ...renewalForm, renewal_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="responsible_name" value={renewalForm.responsible_name} onChange={e => setRenewalForm({ ...renewalForm, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createRenewal}>Criar renovação/upsell/recuperação</button>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginTop: 8 }}>
            <thead><tr><th>título</th><th>tipo</th><th>status</th><th>uplift</th><th>resp</th><th>ação</th></tr></thead>
            <tbody>{renewals.map((r: any) => (
              <tr key={r.id}><td>{r.title}</td><td>{r.type}</td><td>{r.status}</td><td>{r.uplift_percent ? `${r.uplift_percent}%` : "-"}</td><td>{r.responsible_name || "-"}</td>
                <td>
                  <button onClick={() => updateRenewalStatus(r.id, "ganha")}>Ganha</button>
                  <button onClick={() => updateRenewalStatus(r.id, "em_negociacao")} style={{ marginLeft: 2 }}>Negociação</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {metrics && (
        <div style={{ marginTop: 16, padding: 12, background: "#f5f5f5", borderRadius: 6, fontSize: 11 }}>
          <h4>Métricas por responsável</h4>
          <p>Parceiros: total {metrics.partners?.total_partners} ativos {metrics.partners?.active_partners}</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>Renovação tipo/status</th><th>Count</th><th>Valor total novo</th></tr></thead>
            <tbody>{(metrics.renewalsByTypeStatus || []).map((m: any, i: number) => <tr key={i}><td>{m.type} / {m.status}</td><td>{m.count}</td><td>R$ {m.total_value}</td></tr>)}</tbody>
          </table>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead><tr><th>Indicação status</th><th>Count</th></tr></thead>
            <tbody>{(metrics.referralsByStatus || []).map((m: any, i: number) => <tr key={i}><td>{m.status}</td><td>{m.count}</td></tr>)}</tbody>
          </table>
          <p>{metrics.note}</p>
        </div>
      )}

      {msg && <div style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}
    </section>
  );
}
