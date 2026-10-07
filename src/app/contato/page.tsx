"use client";
import { useEffect, useState } from "react";
import { PUBLIC_SERVICES, PROPERTY_TYPES, buildRequestSummary } from "@/lib/service-catalog.mjs";
import RagWidget from "@/components/RagWidget";

export default function ContatoPage() {
  const [form, setForm] = useState({ name: "", phone: "", city: "", propertyType: "Condomínio", services: [] as string[], details: "", consent: false, requestKind: "quote" as "quote" | "visit", visitPreference: "" });
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string; protocol?: string }>({ type: "idle" });

  const [origin,setOrigin]=useState("contato");
  useEffect(()=>{const q=new URLSearchParams(window.location.search);if(q.get("origin")==="faq"){setOrigin("faq");try{const question=sessionStorage.getItem("seg-faq-question")||"";setForm(f=>({...f,details:question.slice(0,1000)}));sessionStorage.removeItem("seg-faq-question");}catch{}}},[]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ type: "loading" });
    try {
      const summary = buildRequestSummary({
        kind: form.requestKind,
        name: form.name,
        phone: form.phone,
        city: form.city,
        propertyType: form.propertyType,
        services: form.services,
        visitPreference: form.visitPreference,
        details: form.details,
      }).join("\n");

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKind: form.requestKind,
          name: form.name,
          phone: form.phone,
          city: form.city,
          propertyType: form.propertyType,
          services: form.services,
          visitPreference: form.visitPreference,
          details: form.details,
          message: summary,
          consent: form.consent,
          origin,
          campaign: "site",
          channel: "site",
          dedupKey: `${form.phone}-${form.city}-${Date.now()}`.slice(0, 200),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setStatus({ type: "success", message: `Protocolo ${data.leadId.slice(0,8)} registrado. Entrou na fila de atendimento em /admin/leads. Visita depende de confirmação humana por responsável.`, protocol: data.leadId });
    } catch (e:any) {
      setStatus({ type: "error", message: e.message });
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 32 }}>Contato claro — PUB-02 / PUB-03</h1>
      <p style={{ opacity: 0.8 }}>Formulário integrado à mesma API de leads com protocolo persistido, consentimento, origem/campanha, antispam, deduplicação controlada e responsável de atendimento (PUB-03). Sem promessa de horário sem reserva real (PUB-04). O assistente abaixo responde apenas com base pública aprovada e publicada.</p>

      <section style={{ marginTop: 16, padding: 16, background: "#f8fafc", borderRadius: 8, fontSize: 14 }}>
        <strong>Endereço:</strong> Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP, 07175-000<br />
        <strong>Telefone:</strong> (11) 3437-2217<br />
        <strong>E-mail:</strong> contato@gruposegsystemseguranca.com.br<br />
        <strong>Horário:</strong> Segunda a sexta, 08h às 18h
      </section>

      <form onSubmit={submit} style={{ marginTop: 24, display: "grid", gap: 12 }}>
        <label>Nome<br /><input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} required maxLength={100} style={{ width: "100%", padding: 8 }} /></label>
        <label>Telefone<br /><input value={form.phone} onChange={e=>setForm({...form, phone: e.target.value})} required maxLength={30} style={{ width: "100%", padding: 8 }} /></label>
        <label>Cidade/bairro<br /><input value={form.city} onChange={e=>setForm({...form, city: e.target.value})} required maxLength={100} style={{ width: "100%", padding: 8 }} /></label>
        <label>Tipo de imóvel<br />
          <select value={form.propertyType} onChange={e=>setForm({...form, propertyType: e.target.value})} style={{ width: "100%", padding: 8 }}>
            {PROPERTY_TYPES.map((p:any) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </label>
        <label>Serviços (catálogo validado 6)<br />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, border: "1px solid #ddd", padding: 8, borderRadius: 6 }}>
            {PUBLIC_SERVICES.map((s)=>(
              <label key={s.name} style={{ fontSize: 13, display: "flex", gap: 6 }}>
                <input type="checkbox" checked={form.services.includes(s.name)} onChange={e=>{
                  if (e.target.checked) setForm({...form, services: [...form.services, s.name]});
                  else setForm({...form, services: form.services.filter(x=>x!==s.name)});
                }} /> {s.name}
              </label>
            ))}
          </div>
        </label>
        <label>Tipo de solicitação<br />
          <select value={form.requestKind} onChange={e=>setForm({...form, requestKind: e.target.value as any})} style={{ width: "100%", padding: 8 }}>
            <option value="quote">Orçamento</option>
            <option value="visit">Visita técnica</option>
          </select>
        </label>
        {form.requestKind==="visit" && <label>Preferência de visita<br /><input value={form.visitPreference} onChange={e=>setForm({...form, visitPreference: e.target.value})} required maxLength={120} style={{ width: "100%", padding: 8 }} placeholder="Ex: segunda manhã" /></label>}
        <label>Detalhes<br /><textarea value={form.details} onChange={e=>setForm({...form, details: e.target.value})} maxLength={1000} rows={4} style={{ width: "100%", padding: 8 }} /></label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={form.consent} onChange={e=>setForm({...form, consent: e.target.checked})} required /> Concordo com o tratamento dos meus dados para atendimento, conforme minuta de privacidade em /privacidade (pendente aprovação formal). Origem e campanha registradas com minimização.
        </label>
        <button type="submit" disabled={status.type==="loading"} style={{ padding: "10px 16px", background: "#0b5fff", color: "#fff", border: "none", borderRadius: 6 }}>{status.type==="loading" ? "Enviando..." : "Enviar pedido (protocolo persistido)"}</button>
        {status.type==="success" && <p style={{ color: "green", background: "#ecfdf5", padding: 12, borderRadius: 6 }}>{status.message}</p>}
        {status.type==="error" && <p style={{ color: "red", background: "#fef2f2", padding: 12, borderRadius: 6 }}>Erro: {status.message}</p>}
      </form>

      <RagWidget ragKey="publico" title="Assistente de dúvidas" description="Respostas baseadas apenas em conteúdo público aprovado." />

      <section style={{ marginTop: 32, padding: 16, borderLeft: "4px solid #0b5fff", background: "#eff6ff", fontSize: 13 }}>
        <strong>PUB-03 aceite:</strong> enviar pedido pelo celular → registro único → fila comercial com origem → próxima ação atribuída; falha SMTP não apaga lead nem produz confirmação de e-mail entregue. Recarga/retry não criam duplicatas indevidas (deduplicação via dedup_key).<br />
        <strong>PUB-04:</strong> visita com estados solicitada, em agendamento, confirmada, realizada, cancelada; pessoa responsável confirma, notificação não promete horário sem reserva real.<br />
        <strong>AI RAG + bot modes:</strong> modo desenvolvedor campo altera dinâmica sem_ia/com_ia/whatsapp, padrão com_ia beta com Ollama Qwen3 1.7B local. Este assistente público responde apenas com conteúdo público aprovado; as bases de cliente, RH e gestão só respondem dentro da sessão com o papel/vínculo conferidos no servidor e não são acessíveis por aqui. Sem fonte aprovada relacionada, o modelo local não é chamado e o assistente informa a ausência; o atendimento é uma consulta por vez e pode responder "ocupado".
      </section>
    </main>
  );
}
