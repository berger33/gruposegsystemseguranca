"use client";

import { useEffect, useState } from "react";

type Experiment = {
  id: string;
  protocol: string;
  hypothesis: string;
  description: string;
  variant_a: string;
  variant_b: string;
  metric_name: string;
  status: string;
  approved_at?: string | null;
  observations_count?: number;
  events_count?: number;
};

type Detail = { experiment: Experiment; observations: any[]; events: any[]; result: { sufficient_for_descriptive_view: boolean; conclusion: string; by_variant: any[] } };

const requestKey = () => `ext11-${crypto.randomUUID()}`;

export function AnalyticsWorkspace() {
  const [items, setItems] = useState<Experiment[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    hypothesis: "",
    description: "",
    variant_a: "",
    variant_b: "",
    metric_name: "",
    privacy_note: "Experimento interno, sem identificadores diretos e com minimização de dados.",
  });

  const load = async () => {
    const response = await fetch("/api/ext/analytics/experiments", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Falha ao carregar experimentos");
    setItems(body.items || []);
  };

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/ext/analytics/experiments", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": requestKey() },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao criar experimento");
      setMessage("Rascunho criado. Uma pessoa autorizada precisa aprovar antes da execução.");
      setForm({ ...form, hypothesis: "", description: "", variant_a: "", variant_b: "", metric_name: "" });
      await load();
    } catch (error: any) {
      setMessage(error.message || "Falha ao criar experimento");
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    const response = await fetch(`/api/ext/analytics/experiments/${id}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error || "Falha ao carregar detalhe");
    setSelected(body);
  };

  const approve = async (id: string) => {
    const response = await fetch(`/api/ext/analytics/experiments/${id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": requestKey() },
      body: JSON.stringify({ approval_note: "Aprovação humana registrada após revisão da hipótese, variantes, métrica e minimização." }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error || "Aprovação recusada");
    setMessage("Aprovação humana registrada; a execução continua sendo uma transição separada.");
    await load();
    await open(id);
  };

  const change = async (id: string, status: string, extra: Record<string, string> = {}) => {
    const response = await fetch(`/api/ext/analytics/experiments/${id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": requestKey() },
      body: JSON.stringify({ status, ...extra }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error || "Transição recusada");
    setMessage(`Estado alterado para ${status}.`);
    await load();
    await open(id);
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "36px 24px", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ color: "#64748b", letterSpacing: 1 }}>EXT-11 · F07</p>
      <h1>Analytics e experimentos A/B controlados</h1>
      <p>
        Registre uma hipótese explícita, duas variantes e uma métrica declarada. Esta tela não executa teste externo,
        não inventa tráfego ou conversões e não declara vencedor nem significância. Observações só entram com origem
        operacional interna e são agregadas para minimizar dados.
      </p>
      {message && <p role="alert" style={{ color: "#9f1239" }}>{message}</p>}
      <section style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)", gap: 24 }}>
        <form onSubmit={create} style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <h2>Novo rascunho</h2>
          <textarea required minLength={20} placeholder="Hipótese explícita" value={form.hypothesis} onChange={(e) => setForm({ ...form, hypothesis: e.target.value })} />
          <textarea required minLength={10} placeholder="Descrição e escopo" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input required minLength={3} placeholder="Variante A" value={form.variant_a} onChange={(e) => setForm({ ...form, variant_a: e.target.value })} />
          <input required minLength={3} placeholder="Variante B" value={form.variant_b} onChange={(e) => setForm({ ...form, variant_b: e.target.value })} />
          <input required minLength={3} placeholder="Métrica declarada" value={form.metric_name} onChange={(e) => setForm({ ...form, metric_name: e.target.value })} />
          <textarea required minLength={10} placeholder="Nota de privacidade e minimização" value={form.privacy_note} onChange={(e) => setForm({ ...form, privacy_note: e.target.value })} />
          <button type="submit" disabled={busy}>{busy ? "Registrando…" : "Registrar rascunho"}</button>
          <small>O rascunho não executa nada. A aprovação humana é uma ação separada.</small>
        </form>
        <div>
          <h2>Experimentos canônicos</h2>
          {items.length === 0 ? <p>Nenhum experimento canônico registrado.</p> : items.map((item) => (
            <article key={item.id} style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 14, marginBottom: 10 }}>
              <button type="button" onClick={() => open(item.id)}><strong>{item.protocol}</strong></button>
              <div><b>{item.status}</b> · métrica: {item.metric_name}</div>
              <div>A: {item.variant_a} · B: {item.variant_b}</div>
              <small>{item.observations_count || 0} observação(ões) · aprovação: {item.approved_at ? "registrada" : "pendente"}</small>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {item.status === "rascunho" && !item.approved_at && <button type="button" onClick={() => approve(item.id)}>Registrar aprovação humana</button>}
                {item.status === "rascunho" && item.approved_at && <button type="button" onClick={() => change(item.id, "em_execucao")}>Iniciar após aprovação</button>}
                {item.status === "em_execucao" && <button type="button" onClick={() => change(item.id, "rascunho", { justification: "Execução revertida para revisão humana." })}>Reverter para rascunho</button>}
                {item.status !== "arquivado" && item.status !== "concluido" && <button type="button" onClick={() => change(item.id, "cancelado", { justification: "Execução cancelada por decisão operacional." })}>Cancelar</button>}
              </div>
            </article>
          ))}
        </div>
      </section>
      {selected && (
        <section style={{ marginTop: 24, borderTop: "2px solid #334155", paddingTop: 18 }}>
          <h2>{selected.experiment.protocol} · trilha operacional</h2>
          <p>{selected.experiment.hypothesis}</p>
          <p><strong>{selected.result.conclusion}</strong></p>
          {!selected.result.sufficient_for_descriptive_view && <p role="status">Não há dados suficientes para uma conclusão: falta pelo menos uma observação real de cada variante.</p>}
          {selected.result.by_variant.map((row) => <p key={row.variant}>Variante {row.variant}: {row.observation_count} observação(ões), amostra agregada {row.sample_size}.</p>)}
          <p>{selected.events.length} evento(s) imutável(is) · {selected.observations.length} observação(ões) de origem interna.</p>
          <small>O sistema não exibe nem aceita vencedor ou significância estatística sem uma metodologia e dados reais devidamente registrados.</small>
        </section>
      )}
    </main>
  );
}
