"use client";
import { useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  short: string;
  description: string;
  audience: string;
  questions: string[];
  isPublished: boolean;
  isValidated: boolean;
  validationNote?: string;
  serviceType?: string;
  billingUnit?: string;
  scope?: string;
  exclusions?: string;
  resources?: string;
  validityDays?: number;
  approvalStatus?: string;
  isRecurring?: boolean;
  version?: number;
  cost?: number | null;
  price?: number | null;
  currency?: string;
};

export default function CatalogClient() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterType, setFilterType] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("includeUnpublished", "false");
      if (filterType) params.set("serviceType", filterType);
      const res = await fetch(`/api/catalog?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setServices(data.services || []);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterType]);

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ margin: 0 }}>Catálogo — PUB-01 + CRM-11 (seis serviços validados + tipo recorrente/avulso/instalação/manutenção/venda/locação/comodato, unidade cobrança, escopo, exclusões, recursos, custo, preço, vigência, aprovação)</h2>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Fonte única: tabela service_catalog (DB) com fallback para src/lib/service-catalog.mjs. Cerca elétrica ou novos serviços só após validação comercial. CRM-11 separa serviços por tipo (recorrente, avulso, instalação, manutenção, venda, locação, comodato) com unidade cobrança, escopo, exclusões, recursos, custo, preço, vigência (validityDays) e aprovação (rascunho/em_revisao/aprovado/arquivado). API pública GET /api/catalog?serviceType=&approvalStatus=, detalhe /api/catalog/:id.</p>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{ padding: 6 }}>
          <option value="">todos tipos</option>
          <option value="recorrente">recorrente</option>
          <option value="avulso">avulso</option>
          <option value="instalacao">instalacao</option>
          <option value="manutencao">manutencao</option>
          <option value="venda">venda</option>
          <option value="locacao">locacao</option>
          <option value="comodato">comodato</option>
          <option value="outro">outro</option>
        </select>
        <button onClick={load} disabled={loading} style={{ padding: "6px 12px" }}>{loading ? "Carregando..." : "Recarregar catálogo"}</button>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {services.map(s=>(
          <article key={s.id} style={{ border: "1px solid #ccc", borderRadius: 6, padding: 12, background: s.isPublished ? "#fff" : "#fef3c7" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>{s.name} <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: s.isValidated ? "#dcfce7" : "#fee2e2" }}>{s.isValidated ? "validado" : "não validado"}</span> <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: s.isPublished ? "#dbeafe" : "#fef3c7" }}>{s.isPublished ? "publicado" : "rascunho"}</span> <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#e0e7ff" }}>{s.serviceType || "recorrente"}</span> <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: s.approvalStatus==="aprovado" ? "#dcfce7" : "#fef9c3" }}>{s.approvalStatus || "aprovado"}</span></h3>
            <p style={{ margin: 0, fontSize: 12 }}><strong>Tipo:</strong> {s.serviceType} | <strong>Unidade cobrança:</strong> {s.billingUnit || "-"} | <strong>Recorrente:</strong> {s.isRecurring ? "sim" : "não"} | <strong>Vigência:</strong> {s.validityDays ? `${s.validityDays}d` : "-"} | <strong>Versão:</strong> {s.version || 1}</p>
            <p style={{ margin: "4px 0 0", fontSize: 12 }}><strong>Descrição curta:</strong> {s.short}</p>
            <p style={{ margin: "6px 0 0", fontSize: 12 }}><strong>Descrição completa:</strong> {s.description}</p>
            <p style={{ margin: "6px 0 0", fontSize: 12 }}><strong>Público:</strong> {s.audience}</p>
            <p style={{ margin: "6px 0 0", fontSize: 11 }}><strong>Escopo:</strong> {s.scope || "-"}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11 }}><strong>Exclusões:</strong> {s.exclusions || "-"}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11 }}><strong>Recursos:</strong> {s.resources || "-"}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11 }}><strong>Custo:</strong> {s.cost != null ? `R$ ${s.cost}` : "-"} | <strong>Preço:</strong> {s.price != null ? `R$ ${s.price}` : "-"} | <strong>Moeda:</strong> {s.currency || "BRL"}</p>
            <div style={{ margin: "6px 0 0", fontSize: 11 }}>
              <strong>Perguntas qualificação:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                {s.questions.map((q,i)=><li key={i}>{q}</li>)}
              </ul>
            </div>
            {s.validationNote && <p style={{ margin: "6px 0 0", fontSize: 10, opacity: 0.7 }}>Nota validação: {s.validationNote}</p>}
          </article>
        ))}
      </div>
      <p style={{ fontSize: 11, opacity: 0.6, marginTop: 12 }}>Total: {services.length} serviços. Esperado 6 validados recorrente/instalacao + 2 exemplos rascunho (manutencao, locacao) aguardando validação comercial (D-02, CRM-11). Novos serviços só entram após validação comercial.</p>
    </section>
  );
}
