"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { PUBLIC_SERVICES, PROPERTY_TYPES, findPropertyType } from "@/lib/service-catalog.mjs";

// PUB-01: comparador/montador baseado somente no catálogo de seis serviços
// validados e nas regras já aprovadas — sem inventar preço "oficial" nem
// alternar modo de negócio pela tela pública (essa configuração é do
// comercial/CMS, nunca do visitante).
export default function OrcamentoPage() {
  const [propertyType, setPropertyType] = useState("Condomínio");
  const [services, setServices] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", city: "", details: "", consent: false });
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });

  const toggle = (name: string) =>
    setServices((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));

  const selectedProperty = useMemo(() => findPropertyType(propertyType), [propertyType]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ type: "loading" });
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKind: "quote",
          name: form.name,
          phone: form.phone,
          city: form.city,
          propertyType,
          services,
          details: form.details,
          consent: form.consent,
          origin: "orcamento",
          campaign: "montador-catalogo",
          channel: "site",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setStatus({
        type: "success",
        message: `Protocolo ${String(data.leadId).slice(0, 8)} registrado. Sem preço automático: nossa equipe comercial faz a qualificação e a vistoria antes de qualquer valor.`,
      });
    } catch (err: any) {
      setStatus({ type: "error", message: err.message });
    }
  }

  return (
    <main style={{ padding: 32, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28 }}>Monte sua necessidade — PUB-01</h1>
      <p style={{ opacity: 0.8, fontSize: 14 }}>
        Combine tipo de imóvel e serviços do catálogo único validado. Isto <strong>não gera preço</strong>: o
        orçamento real depende de qualificação comercial e, quando necessário, vistoria técnica. Consulte também{" "}
        <Link href="/servicos">o catálogo completo</Link> e o <Link href="/faq">FAQ</Link>.
      </p>

      <section style={{ marginTop: 16 }}>
        <strong>Tipo de imóvel</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {PROPERTY_TYPES.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setPropertyType(p.name)}
              style={{ padding: "6px 12px", border: propertyType === p.name ? "2px solid #0b5fff" : "1px solid #ccc", borderRadius: 6, background: propertyType === p.name ? "#eff6ff" : "#fff", cursor: "pointer" }}
            >
              {p.name}
            </button>
          ))}
        </div>
        {selectedProperty && <p style={{ fontSize: 13, opacity: 0.75, marginTop: 6 }}>{selectedProperty.question}</p>}
      </section>

      <section style={{ marginTop: 16 }}>
        <strong>Serviços do catálogo (selecione um ou mais)</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginTop: 8 }}>
          {PUBLIC_SERVICES.map((s) => (
            <label key={s.name} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
              <input type="checkbox" checked={services.includes(s.name)} onChange={() => toggle(s.name)} />
              <span><strong>{s.name}</strong><br /><span style={{ opacity: 0.7 }}>{s.short}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 16, padding: 12, background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
        <strong>Resumo:</strong>{" "}
        {services.length === 0
          ? "Selecione ao menos um serviço para prosseguir."
          : `${propertyType} · ${services.join(", ")}. Nenhum valor é exibido aqui — o preço depende de vistoria e parâmetros de custo/tributo/margem versionados.`}
      </section>

      <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <label>Nome<br /><input required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: 8 }} /></label>
        <label>Telefone<br /><input required maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ width: "100%", padding: 8 }} /></label>
        <label>Cidade/bairro<br /><input required maxLength={100} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={{ width: "100%", padding: 8 }} /></label>
        <label>Detalhes (opcional)<br /><textarea maxLength={1000} rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} style={{ width: "100%", padding: 8 }} /></label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
          <input type="checkbox" required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
          Concordo com o tratamento dos meus dados para atendimento (minuta de privacidade em /privacidade, pendente de aprovação formal).
        </label>
        <button type="submit" disabled={status.type === "loading" || services.length === 0} style={{ padding: "10px 16px", background: "#0b5fff", color: "#fff", border: "none", borderRadius: 6 }}>
          {status.type === "loading" ? "Enviando…" : "Solicitar orçamento (protocolo persistido)"}
        </button>
        {status.type === "success" && <p style={{ color: "#166534", background: "#ecfdf5", padding: 10, borderRadius: 6 }}>{status.message}</p>}
        {status.type === "error" && <p style={{ color: "#991b1b", background: "#fef2f2", padding: 10, borderRadius: 6 }}>Erro: {status.message}</p>}
      </form>

      <p style={{ marginTop: 20, fontSize: 12, opacity: 0.65 }}>
        Precisa de visita técnica em vez de orçamento por telefone? Use o <Link href="/contato">formulário de contato</Link>,
        que aceita a mesma API com opção de visita (estados solicitada → em agendamento → confirmada → realizada/cancelada).
      </p>
    </main>
  );
}
