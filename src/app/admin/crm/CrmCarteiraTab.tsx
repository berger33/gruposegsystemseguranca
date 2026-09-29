"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Badge, Notice, Section, SessionHint, apiJson, btn, colors, fmtDate, fmtMoney, tableStyle, td, th,
} from "./crm-ui";

type Portfolio = {
  summary: {
    without_next_action: number; stalled: number; renewals_due: number;
    reactivation_candidates: number; company_groups: number; open_referrals: number;
  };
  opportunities_without_next_action: any[];
  opportunities_stalled: any[];
  renewals_due: any[];
  reactivation_candidates: any[];
  company_groups: any[];
};

function Metric({ label, value, tone }: { label: string; value: number; tone?: "warn" | "ok" }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, background: tone === "warn" && value > 0 ? "#fff8f8" : "#f8fafc", minWidth: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: colors.muted }}>{label}</div>
    </div>
  );
}

export default function CrmCarteiraTab() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiJson("/api/crm/portfolio"));
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Section
        title="Carteira e relacionamento (CRM-10)"
        hint="Renovação, oportunidades sem próxima ação, clientes inativos candidatos a reativação e vínculo por grupo/unidade. Nada aqui promete receita: são sinais operacionais para trabalho humano."
        actions={<button onClick={load} style={btn}>Atualizar</button>}
      >
        {error && <Notice kind="erro">{error}</Notice>}
        {error && <SessionHint error={error} />}
        {!data && !error && <p style={{ fontSize: 12.5, color: colors.muted }}>Carregando carteira…</p>}
        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <Metric label="Sem próxima ação" value={data.summary.without_next_action} tone="warn" />
            <Metric label="Próxima ação atrasada" value={data.summary.stalled} tone="warn" />
            <Metric label="Renovações em 90 dias" value={data.summary.renewals_due} />
            <Metric label="Candidatas a reativação" value={data.summary.reactivation_candidates} />
            <Metric label="Grupos com filiais/unidades" value={data.summary.company_groups} />
            <Metric label="Indicações em aberto" value={data.summary.open_referrals} />
          </div>
        )}
      </Section>

      {data && (
        <>
          <Section title={`Oportunidades sem próxima ação (${data.opportunities_without_next_action.length})`} hint="Oportunidade aberta sem próximo passo definido é risco de esquecimento — defina a ação na aba Funil.">
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Oportunidade</th><th style={th}>Empresa</th><th style={th}>Estágio</th><th style={th}>Valor estimado</th><th style={th}>Atualizada</th></tr></thead>
                <tbody>
                  {data.opportunities_without_next_action.map((o) => (
                    <tr key={o.id}>
                      <td style={td}>{o.title}</td><td style={td}>{o.company_name}</td>
                      <td style={td}><Badge>{o.stage}</Badge></td>
                      <td style={td}>{fmtMoney(o.estimated_value)}</td><td style={td}>{fmtDate(o.updated_at)}</td>
                    </tr>
                  ))}
                  {data.opportunities_without_next_action.length === 0 && <tr><td style={td} colSpan={5}>Nenhuma — toda oportunidade aberta tem próximo passo.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Próxima ação atrasada (${data.opportunities_stalled.length})`} hint="A data combinada já passou e a ação continua registrada como pendente.">
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Oportunidade</th><th style={th}>Empresa</th><th style={th}>Ação combinada</th><th style={th}>Desde</th></tr></thead>
                <tbody>
                  {data.opportunities_stalled.map((o) => (
                    <tr key={o.id}>
                      <td style={td}>{o.title}</td><td style={td}>{o.company_name}</td>
                      <td style={td}>{o.next_action}</td><td style={td}>{fmtDate(o.next_action_date, true)}</td>
                    </tr>
                  ))}
                  {data.opportunities_stalled.length === 0 && <tr><td style={td} colSpan={4}>Nenhuma ação atrasada.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Renovações nos próximos 90 dias (${data.renewals_due.length})`} hint="Renovação, upsell, cross-sell e recuperação registradas no CRM-27. Valor novo é proposta, não receita confirmada.">
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Registro</th><th style={th}>Empresa</th><th style={th}>Tipo</th><th style={th}>Situação</th><th style={th}>Data</th><th style={th}>Valor anterior → novo</th></tr></thead>
                <tbody>
                  {data.renewals_due.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{r.title}</td><td style={td}>{r.company_name}</td>
                      <td style={td}>{r.type}</td><td style={td}><Badge tone="warn">{r.status}</Badge></td>
                      <td style={td}>{fmtDate(r.renewal_date)}</td>
                      <td style={td}>{fmtMoney(r.previous_value)} → {fmtMoney(r.new_value)}</td>
                    </tr>
                  ))}
                  {data.renewals_due.length === 0 && <tr><td style={td} colSpan={6}>Nenhuma renovação no horizonte de 90 dias.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Candidatas a reativação (${data.reactivation_candidates.length})`} hint="Clientes marcados como inativos e sem nenhuma oportunidade aberta. A cadência 'Reativação de carteira' existe na aba Tarefas.">
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr><th style={th}>Empresa</th><th style={th}>Cidade</th><th style={th}>Segmento</th><th style={th}>Inativa desde</th></tr></thead>
                <tbody>
                  {data.reactivation_candidates.map((c) => (
                    <tr key={c.id}>
                      <td style={td}>{c.display_name}</td><td style={td}>{c.city || "—"}</td>
                      <td style={td}>{c.segment || "—"}</td><td style={td}>{fmtDate(c.updated_at)}</td>
                    </tr>
                  ))}
                  {data.reactivation_candidates.length === 0 && <tr><td style={td} colSpan={4}>Nenhum cliente inativo sem oportunidade aberta.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={`Relacionamento por grupo e unidade (${data.company_groups.length})`} hint="Matriz, filiais e unidades da mesma empresa aparecem juntas para evitar abordagem duplicada.">
            <div style={{ display: "grid", gap: 10 }}>
              {data.company_groups.map((g) => (
                <div key={g.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12 }}>
                  <strong>{g.display_name}</strong>{" "}
                  <Badge>{g.children_count} filiais</Badge> <Badge>{g.units_count} unidades</Badge>
                  {Array.isArray(g.children) && g.children.length > 0 && (
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5 }}>
                      {g.children.map((ch: any) => <li key={ch.id}>{ch.display_name} ({ch.type})</li>)}
                    </ul>
                  )}
                </div>
              ))}
              {data.company_groups.length === 0 && <p style={{ fontSize: 12.5, color: colors.muted }}>Nenhum grupo com filiais ou unidades cadastradas.</p>}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
