"use client";
import { useCallback, useEffect, useState } from "react";

// CRM-05/06: painel de detalhe e manutenção da oportunidade selecionada —
// todos os campos do requisito, movimentação de funil com motivo de perda
// obrigatório e reabertura auditada. Origem/campanha e responsável são
// atribuição imutável (política desta fatia); "ganho" segue sendo estado de
// funil, nunca dinheiro recebido.

type Opportunity = {
  id: string; company_id: string; title: string; stage: string; priority: string;
  service_name: string | null; need_description: string | null;
  responsible_name: string | null; unit_id: string | null; unit_name: string | null;
  forecast_date: string | null; estimated_value: string | null;
  next_action: string | null; next_action_date: string | null;
  origin: string | null; campaign: string | null; loss_reason: string | null;
  is_won: boolean; is_lost: boolean;
};
type Unit = { id: string; display_name: string };

const STAGES = ["novo", "qualificacao", "vistoria", "proposta_elaboracao", "proposta_enviada", "negociacao", "ganho", "perdido"] as const;
const OPEN_STAGES = new Set(["novo", "qualificacao", "vistoria", "proposta_elaboracao", "proposta_enviada", "negociacao"]);
const PRIORITIES = ["baixa", "media", "alta", "critica"] as const;

const errors: Record<string, string> = {
  opportunity_not_found: "Oportunidade disponível apenas para o responsável atual.",
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Seu perfil não permite operar o funil comercial.",
  loss_reason_required: "Motivo de perda obrigatório para mover para perdido.",
  reopen_reason_required: "Reabertura exige motivo registrado (auditado).",
  invalid_terminal_transition: "Para trocar entre ganho e perdido, reabra a oportunidade passando por um estágio aberto.",
  field_not_editable: "Origem, campanha e responsável são atribuição imutável depois de criada a oportunidade.",
  server_managed_fields: "O vínculo com lead público é definido pelo servidor na conversão do lead.",
  invalid_priority: "Prioridade inválida.",
  invalid_forecast_date: "Previsão deve ser uma data (AAAA-MM-DD).",
  invalid_estimated_value: "Valor estimado deve ser um número maior ou igual a zero.",
  invalid_next_action_date: "Data da próxima ação inválida.",
  invalid_unit_id: "Unidade inválida.",
  unit_not_available: "A unidade precisa pertencer à mesma empresa da oportunidade.",
  invalid_need_description: "Necessidade inválida (texto de até 2000 caracteres).",
  invalid_service_name: "Serviço inválido (texto de até 100 caracteres).",
  crm_unavailable: "Não foi possível carregar a oportunidade.",
  update_failed: "Não foi possível salvar. Verifique os campos e tente novamente.",
};

export default function OpportunitySummary({ opportunityId }: { opportunityId: string }) {
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ service_name: "", need_description: "", priority: "media", forecast_date: "", estimated_value: "", next_action: "", next_action_date: "", unit_id: "" });
  const [moveStage, setMoveStage] = useState("");
  const [moveReason, setMoveReason] = useState("");

  const endpoint = "/api/crm/opportunities/" + opportunityId;

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await request(endpoint);
      const opportunity: Opportunity = data.opportunity;
      setOpp(opportunity);
      setForm({
        service_name: opportunity.service_name || "",
        need_description: opportunity.need_description || "",
        priority: opportunity.priority,
        forecast_date: opportunity.forecast_date ? String(opportunity.forecast_date).slice(0, 10) : "",
        estimated_value: opportunity.estimated_value ?? "",
        next_action: opportunity.next_action || "",
        next_action_date: opportunity.next_action_date ? new Date(opportunity.next_action_date).toISOString().slice(0, 16) : "",
        unit_id: opportunity.unit_id || "",
      });
    } catch (e) {
      setOpp(null);
      setError(e instanceof Error ? e.message : "Falha ao consultar.");
    } finally { setLoading(false); }
  }, [endpoint]);

  useEffect(() => { refresh(); setMoveStage(""); setMoveReason(""); }, [endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  // A lista de unidades da mesma empresa alimenta o seletor de CRM-05.
  async function loadUnits(companyId: string) {
    try {
      const data = await request("/api/crm/companies/" + companyId);
      setUnits(data.units || []);
    } catch { setUnits([]); }
  }

  useEffect(() => { if (opp?.company_id) loadUnits(opp.company_id); }, [opp]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const body: Record<string, unknown> = {
        service_name: form.service_name,
        need_description: form.need_description,
        priority: form.priority,
        forecast_date: form.forecast_date || null,
        estimated_value: form.estimated_value === "" ? null : Number(form.estimated_value),
        next_action: form.next_action,
        next_action_date: form.next_action_date ? new Date(form.next_action_date).toISOString() : null,
        unit_id: form.unit_id || null,
      };
      const data = await request(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setOpp(data.opportunity);
      setNotice("Campos da oportunidade atualizados.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }

  const needsLossReason = moveStage === "perdido";
  const needsReopenReason = Boolean(moveStage && OPEN_STAGES.has(moveStage) && opp && (opp.stage === "perdido" || opp.stage === "ganho"));

  async function move() {
    if (!moveStage) { setError("Escolha o próximo estágio."); return; }
    if ((needsLossReason || needsReopenReason) && !moveReason.trim()) {
      setError(needsLossReason ? errors.loss_reason_required : errors.reopen_reason_required);
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const body: Record<string, unknown> = { stage: moveStage };
      if (needsLossReason) body.loss_reason = moveReason.trim();
      if (needsReopenReason) body.reason = moveReason.trim();
      const data = await request(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setOpp(data.opportunity);
      setMoveStage(""); setMoveReason("");
      setNotice(needsReopenReason ? "Oportunidade reaberta com motivo auditado." : "Estágio atualizado no funil.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao mover estágio."); }
    finally { setBusy(false); }
  }

  if (loading) return <section aria-label="Detalhe da oportunidade" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16 }}><p role="status">Carregando oportunidade…</p></section>;
  if (!opp) return <section aria-label="Detalhe da oportunidade" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16 }}><h2>Oportunidade</h2>{error && <p role="alert">{error}</p>}</section>;

  return (
    <section aria-label="Detalhe da oportunidade" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere" }}>
      <h2>Oportunidade — {opp.title}</h2>
      <p>Estágio atual: <strong>{opp.stage}</strong>. {opp.is_won && <strong> ganho é estado de funil — não é dinheiro recebido.</strong>}{opp.is_lost && <strong> perdido — motivo: {opp.loss_reason}</strong>}</p>
      <p>Responsável: {opp.responsible_name || "—"} | Origem (imutável): {opp.origin || "—"}{opp.campaign ? ` | Campanha (imutável): ${opp.campaign}` : ""} | Unidade: {opp.unit_name || "—"} | Previsão: {opp.forecast_date ? String(opp.forecast_date).slice(0, 10) : "—"}</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <h3 style={{ fontSize: 14 }}>Manutenção dos campos (CRM-05)</h3>
      <div style={{ display: "grid", gap: 10, maxWidth: 720 }}>
        <label>Serviço<input value={form.service_name} onChange={e => setForm({ ...form, service_name: e.target.value })} maxLength={100} style={{ display: "block" }} /></label>
        <label>Necessidade<textarea value={form.need_description} onChange={e => setForm({ ...form, need_description: e.target.value })} maxLength={2000} rows={3} style={{ display: "block" }} /></label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div>
            <label htmlFor="opp-summary-priority">Prioridade</label>
            <select id="opp-summary-priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={{ display: "block" }}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label>Previsão (fechamento)<input type="date" value={form.forecast_date} onChange={e => setForm({ ...form, forecast_date: e.target.value })} style={{ display: "block" }} /></label>
          <label>Valor estimado<input type="number" min={0} step="0.01" value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: e.target.value })} style={{ display: "block", width: 140 }} /></label>
          <div>
            <label htmlFor="opp-summary-unit">Unidade</label>
            <select id="opp-summary-unit" value={form.unit_id} onChange={e => setForm({ ...form, unit_id: e.target.value })} style={{ display: "block" }}>
              <option value="">sem unidade</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label>Próxima ação<input value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })} maxLength={200} style={{ display: "block" }} /></label>
          <label>Data da próxima ação<input type="datetime-local" value={form.next_action_date} onChange={e => setForm({ ...form, next_action_date: e.target.value })} style={{ display: "block" }} /></label>
        </div>
        <div><button type="button" disabled={busy} onClick={save}>Salvar campos da oportunidade</button></div>
      </div>
      <h3 style={{ fontSize: 14, marginTop: 16 }}>Movimentar no funil (CRM-06)</h3>
      <p style={{ fontSize: 12, opacity: 0.75 }}>Perda exige motivo obrigatório. Sair de ganho/perdido é reabertura auditada com motivo. Não é possível trocar diretamente entre ganho e perdido.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label htmlFor="opp-summary-stage">Próximo estágio</label>
          <select id="opp-summary-stage" value={moveStage} onChange={e => setMoveStage(e.target.value)} style={{ display: "block" }}>
            <option value="">escolher estágio</option>
            {STAGES.filter(s => s !== opp.stage).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {(needsLossReason || needsReopenReason) && (
          <label>{needsLossReason ? "Motivo da perda (obrigatório)" : "Motivo da reabertura (obrigatório, auditado)"}
            <input value={moveReason} onChange={e => setMoveReason(e.target.value)} maxLength={500} style={{ display: "block", minWidth: 260 }} />
          </label>
        )}
        <button type="button" disabled={busy || !moveStage} onClick={move}>Mover estágio</button>
      </div>
    </section>
  );
}
