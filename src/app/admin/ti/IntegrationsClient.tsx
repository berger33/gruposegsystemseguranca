"use client";
import { useEffect, useState } from "react";

type Integration = {
  id: string;
  provider: string;
  name: string;
  status: string;
  config_sanitized: any;
  last_check_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_sanitized: string | null;
  last_processed_at: string | null;
};

export default function IntegrationsClient() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/integrations", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setIntegrations(data.integrations || []);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function test(id: string) {
    try {
      const res = await fetch(`/api/admin/integrations/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha teste");
      await load();
      alert(`Teste ${id}: status ${data.integration.status} ${data.integration.last_error_sanitized ? `erro: ${data.integration.last_error_sanitized}` : ""}`);
    } catch (e:any) {
      alert(`Erro teste: ${e.message}`);
    }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ margin: 0 }}>Integrações — PLT-03 (status configurado/não configurado/falha, último processamento, erros sanitizados, teste conexão)</h2>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Acesso restrito admin/ti, mesma origem. Erros sanitizados sem segredos. Teste de conexão não envia dados reais quando provedor não configurado. Status baseado em env (MAIL_HOST etc) e verificação real.</p>
      <button onClick={load} disabled={loading} style={{ marginTop: 8, padding: "6px 12px" }}>{loading ? "Carregando..." : "Recarregar"}</button>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {integrations.map(i=>(
          <article key={i.id} style={{ border: "1px solid #ccc", borderRadius: 6, padding: 12, background: i.status==="configured" ? "#ecfdf5" : i.status==="failure" ? "#fef2f2" : "#fffbeb" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>{i.name} <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "#eee" }}>{i.id}</span></h3>
            <p style={{ margin: 0, fontSize: 12 }}>Provider: {i.provider} | Status: <strong>{i.status}</strong></p>
            <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.8 }}>Config sanitizada: {JSON.stringify(i.config_sanitized)}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11 }}>Último check: {i.last_check_at ? new Date(i.last_check_at).toLocaleString("pt-BR") : "-"}</p>
            <p style={{ margin: "2px 0 0", fontSize: 11 }}>Último sucesso: {i.last_success_at ? new Date(i.last_success_at).toLocaleString("pt-BR") : "-"}</p>
            <p style={{ margin: "2px 0 0", fontSize: 11 }}>Última falha: {i.last_failure_at ? new Date(i.last_failure_at).toLocaleString("pt-BR") : "-"}</p>
            {i.last_error_sanitized && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#991b1b", background: "#fee2e2", padding: "4px 6px", borderRadius: 4 }}>Erro sanitizado: {i.last_error_sanitized}</p>}
            <p style={{ margin: "4px 0 0", fontSize: 11 }}>Último processamento: {i.last_processed_at ? new Date(i.last_processed_at).toLocaleString("pt-BR") : "-"}</p>
            <button onClick={()=>test(i.id)} style={{ marginTop: 8, padding: "4px 10px", fontSize: 12 }}>Testar conexão (sanitizado)</button>
          </article>
        ))}
      </div>
      {integrations.length===0 && <p style={{ fontSize: 13, opacity: 0.7, marginTop: 12 }}>Nenhuma integração (ou sem permissão). Faça login como admin/ti.</p>}
    </section>
  );
}
