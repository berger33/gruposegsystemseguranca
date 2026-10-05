"use client";

import { useEffect, useState, type FormEvent } from "react";

type Suggestion = {
  id: string;
  protocol: string;
  title: string;
  intel_type: string;
  status: string;
  history_start: string;
  history_end: string;
  evidence?: Record<string, unknown> | null;
  evidence_built_at?: string | null;
  is_human_approved?: boolean;
  approved_at?: string | null;
  contact_registered_at?: string | null;
};

const INTEL_TYPES = ["indicacao", "reativacao", "upsell", "cross_sell", "risco", "oportunidade"];

const key = (label: string) => `ext14-ui-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function IntelWorkspace() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [title, setTitle] = useState("Reativação de clientes com histórico recente");
  const [intelType, setIntelType] = useState("indicacao");
  const [description, setDescription] = useState("");
  const [justification, setJustification] = useState("");
  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/ext/intel/suggestions", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Falha ao carregar sugestões");
    setSuggestions(data.items || []);
    if (!selected && data.items?.[0]?.id) setSelected(data.items[0].id);
  }

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao carregar sugestões"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const response = await fetch("/api/ext/intel/suggestions", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key("create") },
      body: JSON.stringify({
        title,
        intel_type: intelType,
        description,
        justification,
        history_start: historyStart,
        history_end: historyEnd,
        source_module: "historico_interno",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || "Falha ao criar sugestão");
    setMessage(`Sugestão ${data.intel.protocol} registrada como sugerida.`);
    setSelected(data.intel.id);
    await load();
  }

  async function act(path: string, body: Record<string, unknown>, label: string) {
    const id = selected || suggestions[0]?.id;
    if (!id) return setError("Crie ou selecione uma sugestão antes.");
    setError("");
    setMessage("");
    const response = await fetch(`/api/ext/intel/suggestions/${id}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key(label) },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || `Falha em ${label}`);
    setMessage(data.note || `Ação ${label} registrada.`);
    await load();
    await showDetail(id);
  }

  async function showDetail(id?: string) {
    const target = id || selected || suggestions[0]?.id;
    if (!target) return;
    const response = await fetch(`/api/ext/intel/suggestions/${target}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setDetail(data);
  }

  return (
    <main style={{ maxWidth: 1180, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p style={{ color: "#64748b", letterSpacing: 1 }}>EXT-14 · F10</p>
      <h1>Inteligência comercial</h1>
      <p>
        Indicações, reativações e recomendações explicadas com evidência contada de tabelas internas reais dentro de
        uma janela de histórico declarada. Esta tela <strong>não usa os handlers legados como cobertura</strong>,
        não dispara e-mails, telefonemas ou mensagens externas e não aciona fornecedor externo.
      </p>
      <p style={{ background: "#eff6ff", color: "#1e3a8a", padding: 12, borderRadius: 8 }}>
        O contato é um registro interno autorizado: só pode ser registrado após aprovação humana explícita e nenhuma
        mensagem externa é disparada. Todas as mutações usam Idempotency-Key e trilha imutável.
      </p>

      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {message && <p role="status" style={{ color: "#166534" }}>{message}</p>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 24 }}>
        <form onSubmit={createSuggestion} style={{ display: "grid", gap: 10, border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
          <h2>Nova sugestão explicada</h2>
          <input aria-label="Título" placeholder="Título" minLength={5} required value={title} onChange={(event) => setTitle(event.target.value)} />
          <label>
            Tipo (fontes internas fixas)
            <select value={intelType} onChange={(event) => setIntelType(event.target.value)}>
              {INTEL_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <textarea aria-label="Descrição" placeholder="Descrição da recomendação (mínimo 10 caracteres)" minLength={10} required value={description} onChange={(event) => setDescription(event.target.value)} />
          <textarea aria-label="Justificativa" placeholder="Justificativa obrigatória baseada no histórico interno" minLength={10} required value={justification} onChange={(event) => setJustification(event.target.value)} />
          <label>
            Início da janela de histórico
            <input aria-label="Início da janela" type="date" required value={historyStart} onChange={(event) => setHistoryStart(event.target.value)} />
          </label>
          <label>
            Fim da janela de histórico
            <input aria-label="Fim da janela" type="date" required value={historyEnd} onChange={(event) => setHistoryEnd(event.target.value)} />
          </label>
          <button type="submit">Registrar sugestão</button>
        </form>

        <div style={{ border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
          <h2>Ciclo de vida</h2>
          <label>
            Sugestão selecionada
            <select value={selected} onChange={(event) => { setSelected(event.target.value); void showDetail(event.target.value); }}>
              <option value="">Selecione</option>
              {suggestions.map((item) => <option key={item.id} value={item.id}>{item.protocol} · {item.status}</option>)}
            </select>
          </label>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => void act("/transition", { status: "em_analise" }, "analise")}>Enviar para análise</button>
            <button type="button" onClick={() => void act("/evidence", { evidence_note: "Evidência contada do histórico interno pela interface EXT-14." }, "evidencia")}>Construir evidência contada</button>
            <button type="button" onClick={() => void act("/transition", { status: "aprovada", decision_note: "Aprovação humana registrada pela interface EXT-14." }, "aprovacao")}>Aprovar (humano)</button>
            <button type="button" onClick={() => void act("/transition", { status: "rejeitada", decision_note: "Rejeição humana registrada pela interface EXT-14." }, "rejeicao")}>Rejeitar</button>
            <button type="button" onClick={() => void act("/contact", { contact_note: "Contato registrado internamente pela interface EXT-14; nenhuma mensagem externa disparada." }, "contato")}>Registrar contato autorizado</button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 28, border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
        <h2>Sugestões canônicas</h2>
        {suggestions.length === 0 ? <p>Nenhuma sugestão canônica registrada. Sem histórico interno não há recomendação — nada é inventado.</p> : suggestions.map((item) => (
          <article key={item.id} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, marginTop: 10 }}>
            <strong>{item.protocol}</strong> · {item.title} · {item.intel_type} · {item.status}
            <br /><small>Janela {String(item.history_start).slice(0, 10)} a {String(item.history_end).slice(0, 10)} · evidência {item.evidence_built_at ? "contada" : "pendente"} · aprovação humana {item.is_human_approved ? "registrada" : "pendente"} · contato {item.contact_registered_at ? "registrado internamente" : "não registrado"}</small>
          </article>
        ))}
      </section>

      {detail && (
        <section aria-label="Detalhe da sugestão" style={{ marginTop: 28, border: "1px solid #93c5fd", background: "#f8fafc", padding: 16, borderRadius: 12 }}>
          <h2>Detalhe e trilha</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>{JSON.stringify(detail, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
