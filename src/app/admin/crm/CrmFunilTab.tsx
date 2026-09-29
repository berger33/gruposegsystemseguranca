"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Badge, Notice, Section, SessionHint, apiJson, btn, btnPrimary, colors, fmtDate, fmtMoney, input, label, tableStyle, td, th,
} from "./crm-ui";

type Opportunity = {
  id: string; title: string; company_id: string; stage: string; priority: string;
  estimated_value: string | null; next_action: string | null; next_action_date: string | null;
  service_name: string | null; need_description: string | null; responsible_name: string | null;
  forecast_date: string | null; origin: string | null; campaign: string | null;
  loss_reason: string | null; is_won: boolean; is_lost: boolean; created_at: string;
};
type Company = { id: string; display_name: string };

const STAGES = ["novo", "qualificacao", "vistoria", "proposta_elaboracao", "proposta_enviada", "negociacao", "ganho", "perdido"] as const;
const STAGE_LABEL: Record<string, string> = {
  novo: "Novo", qualificacao: "Qualificação", vistoria: "Vistoria",
  proposta_elaboracao: "Proposta em elaboração", proposta_enviada: "Proposta enviada",
  negociacao: "Negociação", ganho: "Ganho", perdido: "Perdido",
};

export default function CrmFunilTab() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [view, setView] = useState<"kanban" | "tabela">("kanban");
  const [filter, setFilter] = useState({ stage: "", priority: "", search: "" });
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [detail, setDetail] = useState<{ stages: any[]; tasks: any[]; interactions: any[]; visits: any[] } | null>(null);
  const [lossReason, setLossReason] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (filter.stage) params.set("stage", filter.stage);
      if (filter.priority) params.set("priority", filter.priority);
      if (filter.search) params.set("search", filter.search);
      params.set("limit", "200");
      const data = await apiJson(`/api/crm/opportunities?${params.toString()}`);
      setOpps(data.opportunities || []);
    } catch (e: any) { setError(e.message); }
    try {
      const data = await apiJson("/api/crm/companies?limit=200");
      setCompanies((data.companies || []).map((c: any) => ({ id: c.id, display_name: c.display_name })));
    } catch { /* lista auxiliar */ }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(o: Opportunity) {
    setSelected(o);
    setDetail(null);
    setLossReason("");
    try {
      const data = await apiJson(`/api/crm/opportunities/${o.id}`);
      setSelected(data.opportunity || o);
      setDetail({ stages: data.stages || [], tasks: data.tasks || [], interactions: data.interactions || [], visits: data.visits || [] });
    } catch (e: any) { setError(e.message); }
  }

  async function createOpportunity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setError(""); setOk("");
    try {
      const payload: Record<string, unknown> = {
        company_id: fd.get("company_id"),
        title: fd.get("title"),
        service_name: fd.get("service_name") || undefined,
        need_description: fd.get("need_description") || undefined,
        forecast_date: fd.get("forecast_date") || undefined,
        estimated_value: fd.get("estimated_value") || undefined,
        next_action: fd.get("next_action") || undefined,
        next_action_date: fd.get("next_action_date") || undefined,
        origin: fd.get("origin") || undefined,
        priority: fd.get("priority"),
      };
      await apiJson("/api/crm/opportunities", { method: "POST", body: JSON.stringify(payload) });
      setOk("Oportunidade criada no estágio inicial do funil.");
      form.reset();
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function moveStage(stage: string) {
    if (!selected) return;
    setBusy(true); setError(""); setOk("");
    try {
      const body: Record<string, unknown> = { stage };
      if (stage === "perdido") body.loss_reason = lossReason;
      if (["novo", "qualificacao", "vistoria", "proposta_elaboracao", "proposta_enviada", "negociacao"].includes(stage) && (selected.is_lost || selected.is_won)) {
        body.reason = lossReason || "Reabertura registrada pelo comercial";
      }
      await apiJson(`/api/crm/opportunities/${selected.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setOk(
        selected.is_lost || selected.is_won
          ? "Oportunidade reaberta — a transição fica registrada no histórico de estágios com motivo."
          : stage === "ganho"
            ? "Estágio atualizado para ganho. Ganho não significa dinheiro recebido: o faturamento depende do contrato."
            : "Estágio atualizado e registrado no histórico."
      );
      setLossReason("");
      await load();
      await openDetail(selected);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveNextAction(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!selected) return;
    setBusy(true); setError(""); setOk("");
    try {
      await apiJson(`/api/crm/opportunities/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ next_action: fd.get("next_action"), next_action_date: fd.get("next_action_date") || undefined }),
      });
      setOk("Próxima ação registrada.");
      await load();
      await openDetail(selected);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const visible = opps;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Section
        title="Nova oportunidade (CRM-05)"
        hint="Serviço, necessidade, responsável, previsão, valor estimado, próxima ação, origem e prioridade. Valor estimado é estimativa comercial — nunca preço acordado."
      >
        <form onSubmit={createOpportunity} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <label style={label}>Empresa*
              <select required name="company_id" defaultValue="" style={input}>
                <option value="" disabled>selecione…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </label>
            <label style={label}>Título*<input required name="title" maxLength={200} style={input} /></label>
            <label style={label}>Serviço<input name="service_name" maxLength={100} style={input} /></label>
            <label style={label}>Previsão<input name="forecast_date" type="date" style={input} /></label>
            <label style={label}>Valor estimado (R$)<input name="estimated_value" type="number" min="0" step="0.01" style={input} /></label>
            <label style={label}>Prioridade
              <select name="priority" defaultValue="media" style={input}>
                <option value="baixa">baixa</option><option value="media">média</option>
                <option value="alta">alta</option><option value="critica">crítica</option>
              </select>
            </label>
            <label style={label}>Próxima ação<input name="next_action" maxLength={200} style={input} /></label>
            <label style={label}>Data da próxima ação<input name="next_action_date" type="datetime-local" style={input} /></label>
            <label style={label}>Origem<input name="origin" maxLength={100} style={input} /></label>
          </div>
          <label style={label}>Necessidade do cliente
            <textarea name="need_description" maxLength={2000} style={{ ...input, minHeight: 60, width: "100%", boxSizing: "border-box" }} />
          </label>
          <div><button type="submit" disabled={busy} style={btnPrimary}>Criar oportunidade</button></div>
        </form>
        {error && <Notice kind="erro">{error}</Notice>}
        {error && <SessionHint error={error} />}
        {ok && <Notice kind="ok">{ok}</Notice>}
      </Section>

      <Section
        title={`Funil (${visible.length}) — kanban, tabela, filtros e busca (CRM-06/07)`}
        hint="Novo → qualificação → vistoria → proposta (elaboração/enviada) → negociação → ganho/perdido. Perder exige motivo; reabrir fica registrado no histórico."
        actions={
          <>
            <button onClick={() => setView("kanban")} aria-pressed={view === "kanban"} style={view === "kanban" ? btnPrimary : btn}>Kanban</button>
            <button onClick={() => setView("tabela")} aria-pressed={view === "tabela"} style={view === "tabela" ? btnPrimary : btn}>Tabela</button>
          </>
        }
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            aria-label="Buscar oportunidade"
            placeholder="Buscar por título ou necessidade"
            style={{ ...input, minWidth: 240 }}
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          />
          <select aria-label="Filtrar por estágio" value={filter.stage} onChange={(e) => setFilter({ ...filter, stage: e.target.value })} style={input}>
            <option value="">todos os estágios</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
          <select aria-label="Filtrar por prioridade" value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })} style={input}>
            <option value="">todas as prioridades</option>
            <option value="baixa">baixa</option><option value="media">média</option>
            <option value="alta">alta</option><option value="critica">crítica</option>
          </select>
          <button onClick={load} style={btn}>Atualizar</button>
        </div>

        {view === "kanban" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
            {STAGES.map((stage) => {
              const items = visible.filter((o) => o.stage === stage);
              return (
                <div key={stage} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 8, background: "#f8fafc", minWidth: 0 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 11.5, textTransform: "uppercase", color: colors.muted }}>
                    {STAGE_LABEL[stage]} ({items.length})
                  </h3>
                  {items.map((o) => (
                    <article key={o.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 6, padding: 8, marginBottom: 8, background: "#fff", minWidth: 0 }}>
                      <button onClick={() => openDetail(o)} style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: colors.accent, cursor: "pointer", textAlign: "left", wordBreak: "break-word" }}>
                        {o.title}
                      </button>
                      <p style={{ margin: "4px 0 0", fontSize: 11.5, color: colors.muted }}>
                        {fmtMoney(o.estimated_value)} · prioridade {o.priority}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: o.next_action ? colors.muted : colors.warn }}>
                        {o.next_action ? `Próxima: ${o.next_action}` : "sem próxima ação definida"}
                      </p>
                    </article>
                  ))}
                  {items.length === 0 && <p style={{ fontSize: 11, color: colors.muted, margin: 0 }}>vazio</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Oportunidade</th><th style={th}>Estágio</th><th style={th}>Prioridade</th>
                  <th style={th}>Valor estimado</th><th style={th}>Próxima ação</th><th style={th}>Criada</th><th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.id}>
                    <td style={td}>{o.title}</td>
                    <td style={td}><Badge tone={o.is_won ? "ok" : o.is_lost ? "bad" : "neutral"}>{STAGE_LABEL[o.stage] || o.stage}</Badge></td>
                    <td style={td}>{o.priority}</td>
                    <td style={td}>{fmtMoney(o.estimated_value)}</td>
                    <td style={td}>{o.next_action || <span style={{ color: colors.warn }}>sem próxima ação</span>}</td>
                    <td style={td}>{fmtDate(o.created_at)}</td>
                    <td style={td}><button onClick={() => openDetail(o)} style={btn}>Detalhe</button></td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td style={td} colSpan={7}>Nenhuma oportunidade com esses filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {selected && (
        <Section
          title={`${selected.title} — detalhe da oportunidade`}
          hint={selected.is_lost ? "Oportunidade perdida. Reabrir gera um novo registro no histórico de estágios." : selected.is_won ? "Oportunidade ganha — ganho não é dinheiro recebido." : undefined}
          actions={<button onClick={() => { setSelected(null); setDetail(null); }} style={btn}>Fechar</button>}
        >
          <div style={{ display: "grid", gap: 14 }}>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, margin: 0, fontSize: 12.5 }}>
              <div><dt style={{ color: colors.muted, fontSize: 11 }}>Estágio</dt><dd style={{ margin: 0 }}><Badge tone={selected.is_won ? "ok" : selected.is_lost ? "bad" : "neutral"}>{STAGE_LABEL[selected.stage] || selected.stage}</Badge></dd></div>
              <div><dt style={{ color: colors.muted, fontSize: 11 }}>Serviço</dt><dd style={{ margin: 0 }}>{selected.service_name || "—"}</dd></div>
              <div><dt style={{ color: colors.muted, fontSize: 11 }}>Valor estimado</dt><dd style={{ margin: 0 }}>{fmtMoney(selected.estimated_value)}</dd></div>
              <div><dt style={{ color: colors.muted, fontSize: 11 }}>Previsão</dt><dd style={{ margin: 0 }}>{fmtDate(selected.forecast_date)}</dd></div>
              <div><dt style={{ color: colors.muted, fontSize: 11 }}>Origem</dt><dd style={{ margin: 0 }}>{selected.origin || "—"}{selected.campaign ? ` · ${selected.campaign}` : ""}</dd></div>
              <div><dt style={{ color: colors.muted, fontSize: 11 }}>Motivo da perda</dt><dd style={{ margin: 0 }}>{selected.loss_reason || "—"}</dd></div>
            </dl>

            <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12 }}>
              <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Mover no funil</h3>
              <label style={{ ...label, maxWidth: 420 }}>
                Motivo (obrigatório para perder; usado como justificativa ao reabrir)
                <input value={lossReason} onChange={(e) => setLossReason(e.target.value)} maxLength={500} style={input} />
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {STAGES.filter((s) => s !== selected.stage).map((s) => (
                  <button key={s} onClick={() => moveStage(s)} disabled={busy} style={s === "perdido" ? { ...btn, borderColor: "#f3c9c9", color: colors.bad } : btn}>
                    {STAGE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={saveNextAction} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ ...label, minWidth: 240 }}>Próxima ação<input name="next_action" defaultValue={selected.next_action || ""} maxLength={200} style={input} /></label>
              <label style={label}>Data<input name="next_action_date" type="datetime-local" style={input} /></label>
              <button type="submit" disabled={busy} style={btn}>Salvar próxima ação</button>
            </form>

            {detail && (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Histórico de estágios ({detail.stages.length})</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                    {detail.stages.map((s: any) => (
                      <li key={s.id}>
                        {s.previous_stage ? `${STAGE_LABEL[s.previous_stage] || s.previous_stage} → ` : ""}
                        {STAGE_LABEL[s.next_stage] || s.next_stage} · {fmtDate(s.created_at, true)} · {s.changed_by_role || "—"}
                        {s.reason ? ` — ${s.reason}` : ""}
                      </li>
                    ))}
                    {detail.stages.length === 0 && <li style={{ listStyle: "none", marginLeft: -18, color: colors.muted }}>Sem transições registradas.</li>}
                  </ul>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Tarefas ({detail.tasks.length})</h3>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                      {detail.tasks.slice(0, 8).map((t: any) => <li key={t.id}>{t.title} — {t.status}</li>)}
                      {detail.tasks.length === 0 && <li style={{ listStyle: "none", marginLeft: -18, color: colors.muted }}>Sem tarefas.</li>}
                    </ul>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Interações ({detail.interactions.length})</h3>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                      {detail.interactions.slice(0, 8).map((i: any) => <li key={i.id}>{i.type}: {i.title}</li>)}
                      {detail.interactions.length === 0 && <li style={{ listStyle: "none", marginLeft: -18, color: colors.muted }}>Sem interações.</li>}
                    </ul>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Visitas ({detail.visits.length})</h3>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                      {detail.visits.slice(0, 8).map((v: any) => <li key={v.id}>{v.title} — {v.status} · {fmtDate(v.scheduled_at, true)}</li>)}
                      {detail.visits.length === 0 && <li style={{ listStyle: "none", marginLeft: -18, color: colors.muted }}>Sem visitas.</li>}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
