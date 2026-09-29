"use client";
import { useEffect, useState } from "react";
import { apiFetch, Badge, card, colors, ErrorBox, fmtDate, SectionTitle, td, th } from "./crm-ui";

type Portfolio = {
  summary: {
    opportunities_without_next_action: number;
    opportunities_stalled: number;
    renewals_due: number;
    reactivation_candidates: number;
    company_groups: number;
  };
  opportunities_without_next_action: any[];
  opportunities_stalled: any[];
  renewals_due: any[];
  reactivation_candidates: any[];
  company_groups: any[];
  company_units: any[];
};

function Metric({ value, text }: { value: number; text: string }) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, background: "#f8fafc", minWidth: 0 }}>
      <strong style={{ fontSize: 24, display: "block" }}>{value}</strong>
      <span style={{ fontSize: 12, color: colors.muted }}>{text}</span>
    </div>
  );
}

export default function CrmCarteiraTab() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setData(await apiFetch("/api/crm/portfolio"));
      } catch (e: any) { setError(e.message); }
    })();
  }, []);

  return (
    <>
      <section style={card}>
        <SectionTitle title="Carteira (CRM-10)" hint="Renovação, oportunidades sem próxima ação, candidatas a reativação e relacionamentos por grupo/unidade." />
        <ErrorBox error={error} />
        {data && (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <Metric value={data.summary.opportunities_without_next_action} text="Sem próxima ação" />
            <Metric value={data.summary.opportunities_stalled} text="Próxima ação vencida" />
            <Metric value={data.summary.renewals_due} text="Renovações em 90 dias" />
            <Metric value={data.summary.reactivation_candidates} text="Candidatas a reativação" />
            <Metric value={data.summary.company_groups} text="Grupos com unidades" />
          </div>
        )}
      </section>

      {data && (
        <>
          <section style={card}>
            <SectionTitle title={`Sem próxima ação (${data.opportunities_without_next_action.length})`} hint="Oportunidades abertas que ninguém agendou — risco de esquecimento." />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead><tr><th style={th}>Oportunidade</th><th style={th}>Empresa</th><th style={th}>Estágio</th><th style={th}>Atualizada</th></tr></thead>
                <tbody>
                  {data.opportunities_without_next_action.map((o) => (
                    <tr key={o.id}><td style={td}>{o.title}</td><td style={td}>{o.company_name}</td><td style={td}><Badge tone="info">{o.stage}</Badge></td><td style={td}>{fmtDate(o.updated_at)}</td></tr>
                  ))}
                  {data.opportunities_without_next_action.length === 0 && <tr><td style={td} colSpan={4}>Nenhuma.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section style={card}>
            <SectionTitle title={`Próxima ação vencida (${data.opportunities_stalled.length})`} />
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
              {data.opportunities_stalled.map((o) => (
                <li key={o.id}>{o.title} — {o.company_name} · <Badge tone="bad">venceu {fmtDate(o.next_action_date)}</Badge> {o.next_action}</li>
              ))}
              {data.opportunities_stalled.length === 0 && <li>Nenhuma.</li>}
            </ul>
          </section>

          <section style={card}>
            <SectionTitle title={`Renovações e upsell em 90 dias (${data.renewals_due.length})`} hint="Origem: registros de renovação/upsell do comercial (CRM-26/27)." />
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
              {data.renewals_due.map((r) => (
                <li key={r.id}>{r.title} — {r.company_name} · <Badge tone="warn">{r.type}</Badge> {r.renewal_date ? `· vence ${fmtDate(r.renewal_date)}` : ""} · {r.status}</li>
              ))}
              {data.renewals_due.length === 0 && <li>Nenhuma renovação registrada para os próximos 90 dias.</li>}
            </ul>
          </section>

          <section style={card}>
            <SectionTitle title={`Candidatas a reativação (${data.reactivation_candidates.length})`} hint="Clientes inativos sem nenhuma oportunidade aberta." />
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
              {data.reactivation_candidates.map((c) => (
                <li key={c.id}>{c.display_name}{c.city ? ` — ${c.city}` : ""}{c.segment ? ` · ${c.segment}` : ""}</li>
              ))}
              {data.reactivation_candidates.length === 0 && <li>Nenhuma.</li>}
            </ul>
          </section>

          <section style={card}>
            <SectionTitle title={`Relacionamentos por grupo (${data.company_groups.length})`} hint="Matriz e unidades vinculadas pelo cadastro (CRM-01)." />
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
              {data.company_groups.map((g) => (
                <li key={g.id} style={{ marginBottom: 4 }}>
                  <strong>{g.display_name}</strong> · {g.children_count} unidade(s):{" "}
                  {(g.children || []).map((c: any) => c.display_name).join(", ")}
                </li>
              ))}
              {data.company_groups.length === 0 && <li>Nenhum grupo com unidades vinculadas.</li>}
            </ul>
            {data.company_units.length > 0 && (
              <p style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
                Unidades cadastradas: {data.company_units.map((u) => `${u.company_name} (${u.units_count})`).join(" · ")}
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
