"use client";
import { useState } from "react";

export default function OrcamentoPage() {
  const [modo, setModo] = useState<"lead" | "preco">("lead");
  const [tipo, setTipo] = useState("comercial");
  const [servicos, setServicos] = useState<string[]>([]);
  const [enviado, setEnviado] = useState(false);

  const toggle = (s: string) =>
    setServicos((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <main style={{ padding: 32, maxWidth: 900, margin: "0 auto", fontFamily: "var(--theme-font)", color: "var(--theme-fg)", background: "var(--theme-bg)", borderRadius: "var(--theme-radius)", boxShadow: "var(--theme-shadow)" }}>
      <h1 style={{ fontSize: "2rem", color: "var(--theme-accent)" }}>Simulador de orçamento — Grupo Seg System</h1>
      <p>Selecione o tipo de imóvel e os serviços desejados. O administrador pode alternar entre <strong>captar lead qualificado</strong> ou <strong>mostrar faixa de preço</strong> pelo painel.</p>

      <div style={{ marginBottom: 16 }}>
        <label><strong>Tipo de imóvel:</strong></label><br />
        {["comercial", "condominio", "industria"].map((t) => (
          <button key={t} onClick={() => setTipo(t)} style={{ marginRight: 8, padding: "6px 12px", border: tipo === t ? "2px solid var(--theme-accent)" : "1px solid currentColor", borderRadius: "var(--theme-radius)", background: tipo === t ? "rgba(0,0,0,0.05)" : "transparent", color: "inherit", cursor: "pointer" }}>{t}</button>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <strong>Serviços:</strong><br />
        {[
          { id: "portaria", label: "Portaria" },
          { id: "monitoramento", label: "Monitoramento" },
          { id: "cftv", label: "CFTV" },
          { id: "cerca", label: "Cerca elétrica" },
          { id: "limpeza", label: "Limpeza" },
        ].map((s) => (
          <button key={s.id} onClick={() => toggle(s.id)} style={{ marginRight: 6, marginBottom: 6, padding: "6px 10px", border: servicos.includes(s.id) ? "2px solid var(--theme-accent)" : "1px solid currentColor", borderRadius: "var(--theme-radius)", background: servicos.includes(s.id) ? "rgba(0,0,0,0.05)" : "transparent", color: "inherit", cursor: "pointer" }}>{s.label}</button>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        <strong>Modo do site (toggle de negócio):</strong>{" "}
        <button onClick={() => setModo("lead")} style={{ marginRight: 6, padding: "6px 10px", border: modo === "lead" ? "2px solid var(--theme-accent)" : "1px solid currentColor", borderRadius: "var(--theme-radius)", background: modo === "lead" ? "rgba(0,0,0,0.05)" : "transparent", color: "inherit", cursor: "pointer" }}>Captar lead qualificado</button>
        <button onClick={() => setModo("preco")} style={{ padding: "6px 10px", border: modo === "preco" ? "2px solid var(--theme-accent)" : "1px solid currentColor", borderRadius: "var(--theme-radius)", background: modo === "preco" ? "rgba(0,0,0,0.05)" : "transparent", color: "inherit", cursor: "pointer" }}>Informar faixa de preço</button>
      </div>

      <div style={{ padding: 12, background: "rgba(0,0,0,0.04)", borderRadius: "var(--theme-radius)", marginBottom: 16 }}>
        <strong>Resultado:</strong>{" "}
        {modo === "preco" ? (
          <span>Faixa estimada: R$ {servicos.length * 1200 + 800},00 / mês (preço ilustrativo de teste; não usar como proposta real).</span>
        ) : (
          <span>Lead qualificado capturado. A equipe de vendas entrará em contato após verificação do vínculo.</span>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setEnviado(true); }} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <div>
          <label>Nome: </label>
          <input required placeholder="Seu nome" style={{ padding: 8, borderRadius: "var(--theme-radius)", border: "1px solid currentColor", background: "var(--theme-bg)", color: "inherit" }} />
        </div>
        <div>
          <label>E-mail: </label>
          <input type="email" required placeholder="email@exemplo.com" style={{ padding: 8, borderRadius: "var(--theme-radius)", border: "1px solid currentColor", background: "var(--theme-bg)", color: "inherit" }} />
        </div>
        <button type="submit" style={{ padding: "8px 16px", borderRadius: "var(--theme-radius)", background: "var(--theme-accent)", color: "#fff", border: "none", cursor: "pointer" }}>{modo === "preco" ? "Solicitar proposta" : "Quero ser atendido"}</button>
      </form>
      {enviado && <p style={{ marginTop: 12, color: "var(--theme-accent)" }}>Simulação registrada para testes (não envia e-mail real até SMTP ser configurado). Obrigado.</p>}
    </main>
  );
}
