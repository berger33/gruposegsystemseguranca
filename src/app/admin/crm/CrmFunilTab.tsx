"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, Badge, btn, btnPrimary, card, colors, ErrorBox, fmtDate, input, label, Notice, SectionTitle, td, th } from "./crm-ui";

type Opportunity = {
  id: string; title: string; company_id: string; stage: string; priority: string;
  estimated_value: string | null; next_action: string | null; next_action_date: string | null;
  service_name: string | null; responsible_name: string | null; loss_reason: string | null;
  origin: string | null; forecast_date: string | null; is_won: boolean; is_lost: boolean; updated_at: string;
};

const STAGES: [string, string][] = [
  ["novo", "Novo"],
  ["qualificacao", "Qualificação"],
  ["vistoria", "Vistoria"],
  ["proposta_elaboracao", "Proposta em elaboração"],
  ["proposta_enviada", "Proposta enviada"],
  ["negociacao", "Negociação"],
  ["ganho", "Ganho"],
  ["perdido", "Perdido"],
];

const STAGE_TONE: Record<string, string> = { ganho: "ok", perdido: "bad", negociacao: "warn" };

export default function CrmFunilTab() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [companies, setCompanies] = useState<{ id: string; display_name: string }[]>([]);
  const [filter, setFilter] = useState({ stage: "", priority: "", search: "" });
  const [mode, setMode] = useState<"kanban" | "tabela">("kanban");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [detail, setDetail] = useState<{ stages: any[]; tasks: any[]; interactions: any[]; visits: any[] } | null>(null);
  const [lossReason, setLossReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  // Guarda de resposta atrasada: sem isto, a busca de um filtro antigo
  // pode chegar depois e sobrescrever o resultado do filtro atual.
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;

    setError("");
    try {
      const params = new URLSearchParams();
      if (filter.stage) params.set("stage", filter.stage);
      if (filter.priority) params.set("priority", filter.priority);
      if (filter.search) params.set("search", filter.search);
      params.set("limit", "200");
      const data = await apiFetch(`/api/crm/opportunities?${params.toString()}`);
      if (seq !== requestSeq.current) return;
      setOpps(data.opportunities || []);
    } catch (e: any) { setError(e.message); }
    try {
      const data = await apiFetch("/api/crm/companies?limit=200");
      setCompanies(data.companies || []);
    } catch { /* lista auxiliar */ }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(o: Opportunity) {
    setSelected(o);
    setDetail(null);
    setLossReason("");
    setReopenReason("");
    setError("");
    try {
      const data = await apiFetch(`/api/crm/opportunities/${o.id}`);
      setSelected(data.opportunity || o);
      setDetail({
        stages: data.stages || [],
        tasks: data.tasks || [],
        interactions: data.interactions || [],
        visits: data.visits || [],
      });
    } catch (e: any) { setError(e.message); }
  }

  async function moveStage(stage: string) {
    if (!selected) return;
    setError(""); setNotice("");
    try {
      const body: Record<string, unknown> = { stage };
      if (stage === "perdido") body.loss_reason = lossReason;
      if (["novo", "qualificacao", "vistoria", "proposta_elaboracao", "proposta_enviada", "negociacao"].includes(stage) && (selected.is_lost || selected.is_won)) {
        body.reason = reopenReason || "Reabertura registrada pelo comercial";
      }
      await apiFetch(`/api/crm/opportunities/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice(
        stage === "perdido"
          ? "Perda registrada com motivo obrigatório (CRM-06)."
          : (selected.is_lost || selected.is_won)
            ? "Oportunidade reaberta — a transição fica no histórico de estágios com motivo (CRM-06)."
            : `Oportunidade movida para ${stage}.`
      );
      await load();
      await openDetail({ ...selected, stage });
    } catch (e: any) { setError(e.message); }
  }

  async function createOpportunity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(""); setNotice("");
    try {
      await apiFetch("/api/crm/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: fd.get("company_id"),
          title: fd.get("title"),
          service_name: fd.get("service_name") || undefined,
          need_description: fd.get("need_description") || undefined,
          responsible_name: fd.get("responsible_name") || undefined,
          forecast_date: fd.get("forecast_date") || undefined,
          estimated_value: fd.get("estimated_value") || undefined,
          next_action: fd.get("next_action") || undefined,
          next_action_date: fd.get("next_action_date") || undefined,
          origin: fd.get("origin") || undefined,
          priority: fd.get("priority"),
        }),
      });
      setNotice("Oportunidade criada com serviço, necessidade, previsão e próxima ação (CRM-05).");
      form.reset();
      await load();
    } catch (e: any) { setError(e.message); }
  }

  const byStage = (stage: string) => opps.filter((o) => o.stage === stage);

  return (
    <>
      <section style={card}>
        <SectionTitle title="Nova oportunidade (CRM-05)" hint="Serviço, necessidade, responsável, previsão, valor estimado, próxima ação, origem e prioridade." />
        <ErrorBox error={error} />
        <Notice>{notice}</Notice>
        <form onSubmit={createOpportunity} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={label}>Empresa*
              <select required name="company_id" style={input} defaultValue="">
                <option value="" disabled>selecione</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </label>
            <label style={label}>Título*<input required name="title" style={input} /></label>
            <label style={label}>Serviço<input name="service_name" style={input} /></label>
            <label style={label}>Necessidade<input name="need_description" style={input} /></label>
            <label style={label}>Responsável<input name="responsible_name" style={input} /></label>
            <label style={label}>Previsão<input name="forecast_date" type="date" style={input} /></label>
            <label style={label}>Valor estimado (R$)<input name="estimated_value" type="number" min="0" step="0.01" style={input} /></label>
            <label style={label}>Próxima ação<input name="next_action" style={input} /></label>
            <label style={label}>Data da próxima ação<input name="next_action_date" type="datetime-local" style={input} /></label>
            <label style={label}>Origem<input name="origin" style={input} /></label>
            <label style={label}>Prioridade
              <select name="priority" style={input} defaultValue="media">
                <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option>
              </select>
            </label>
          </div>
          <div><button type="submit" style={btnPrimary}>Criar oportunidade</button></div>
        </form>
      </section>

      <section style={card}>
        <SectionTitle title={`Funil (${opps.length})`} hint="Kanban ou tabela, com filtros por estágio/prioridade e busca por título ou necessidade (CRM-07)." />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button style={mode === "kanban" ? btnPrimary : btn} onClick={() => setMode("kanban")} aria-pressed={mode === "kanban"}>Kanban</button>
          <button style={mode === "tabela" ? btnPrimary : btn} onClick={() => setMode("tabela")} aria-pressed={mode === "tabela"}>Tabela</button>
          <input aria-label="Buscar oportunidade" placeholder="Buscar por título ou necessidade" style={{ ...input, minWidth: 220 }}
                 value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
          <select aria-label="Filtrar por estágio" style={input} value={filter.stage} onChange={(e) => setFilter({ ...filter, stage: e.target.value })}>
            <option value="">Todos os estágios</option>
            {STAGES.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
          <select aria-label="Filtrar por prioridade" style={input} value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}>
            <option value="">Todas as prioridades</option>
            <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option>
          </select>
        </div>

        {mode === "kanban" ? (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
            {STAGES.map(([id, text]) => (
              <div key={id} style={{ background: "#f8fafc", border: `1px solid ${colors.border}`, borderRadius: 8, padding: 8, minWidth: 0 }}>
                <h3 style={{ fontSize: 12, margin: "0 0 8px", textTransform: "uppercase", color: colors.muted }}>{text} ({byStage(id).length})</h3>
                {byStage(id).map((o) => (
                  <div key={o.id} style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 6, padding: 8, marginBottom: 8 }}>
                    <button onClick={() => openDetail(o)} style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: colors.accent, cursor: "pointer", textAlign: "left" }}>
                      {o.title}
                    </button>
                    <div style={{ fontSize: 11, color: colors.muted, marginTop: 4, overflowWrap: "anywhere" }}>
                      {o.service_name || "sem serviço"} · prioridade {o.priority}
                      {o.next_action ? <> · próxima: {o.next_action}</> : <> · <Badge tone="warn">sem próxima ação</Badge></>}
                    </div>
                  </div>
                ))}
                {byStage(id).length === 0 && <p style={{ fontSize: 11, color: colors.muted, margin: 0 }}>vazio</p>}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead><tr><th style={th}>Oportunidade</th><th style={th}>Estágio</th><th style={th}>Prioridade</th><th style={th}>Próxima ação</th><th style={th}>Atualizada</th><th style={th}></th></tr></thead>
              <tbody>
                {opps.map((o) => (
                  <tr key={o.id}>
                    <td style={td}><strong>{o.title}</strong></td>
                    <td style={td}><Badge tone={STAGE_TONE[o.stage] || "info"}>{o.stage}</Badge></td>
                    <td style={td}>{o.priority}</td>
                    <td style={td}>{o.next_action || "—"}{o.next_action_date ? ` (${fmtDate(o.next_action_date)})` : ""}</td>
                    <td style={td}>{fmtDate(o.updated_at)}</td>
                    <td style={td}><button style={btn} onClick={() => openDetail(o)}>Detalhe</button></td>
                  </tr>
                ))}
                {opps.length === 0 && <tr><td style={td} colSpan={6}>Nenhuma oportunidade para este filtro.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section style={card}>
          <SectionTitle title={`${selected.title} — detalhe`} hint="Transição de estágio com motivo obrigatório na perda e reabertura auditada (CRM-06)." />
          <p style={{ fontSize: 13, margin: "0 0 10px" }}>
            Estágio atual: <Badge tone={STAGE_TONE[selected.stage] || "info"}>{selected.stage}</Badge>{" "}
            {selected.loss_reason ? <>· motivo da perda: <em>{selected.loss_reason}</em></> : null}
          </p>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginBottom: 12 }}>
            <label style={label}>Motivo da perda (obrigatório para "perdido")
              <input style={input} value={lossReason} onChange={(e) => setLossReason(e.target.value)} placeholder="ex.: preço acima do orçamento do condomínio" />
            </label>
            <label style={label}>Motivo da reabertura
              <input style={input} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="ex.: síndico retomou o processo" />
            </label>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {STAGES.map(([id, text]) => (
              <button key={id} style={id === selected.stage ? btnPrimary : btn} onClick={() => moveStage(id)} disabled={id === selected.stage}>
                {text}
              </button>
            ))}
          </div>

          {detail && (
            <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <div>
                <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Histórico de estágios ({detail.stages.length})</h3>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                  {detail.stages.map((s: any) => (
                    <li key={s.id}>{s.previous_stage || "—"} → <strong>{s.next_stage}</strong> · {fmtDate(s.created_at)}{s.reason ? ` · ${s.reason}` : ""}</li>
                  ))}
                  {detail.stages.length === 0 && <li>Sem transições registradas.</li>}
                </ul>
              </div>
              <div>
                <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Tarefas ({detail.tasks.length})</h3>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                  {detail.tasks.map((t: any) => <li key={t.id}>{t.title} · {t.status}</li>)}
                  {detail.tasks.length === 0 && <li>Nenhuma tarefa.</li>}
                </ul>
                <h3 style={{ fontSize: 13, margin: "10px 0 6px" }}>Visitas ({detail.visits.length})</h3>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                  {detail.visits.map((v: any) => <li key={v.id}>{v.title} · {v.status} · {fmtDate(v.scheduled_at)}</li>)}
                  {detail.visits.length === 0 && <li>Nenhuma visita.</li>}
                </ul>
              </div>
              <div>
                <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Interações ({detail.interactions.length})</h3>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                  {detail.interactions.map((i: any) => <li key={i.id}>{i.type} · {i.title}</li>)}
                  {detail.interactions.length === 0 && <li>Nenhuma interação.</li>}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
