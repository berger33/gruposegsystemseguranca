"use client";
import { THEMES, DEFAULT_THEME } from "../../../lib/themes.mjs";

export default function AdminTemaPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "var(--theme-fg)", background: "var(--theme-bg)" }}>
      <h1 style={{ fontFamily: "var(--theme-font)" }}>Painel do tema — Camada 3 / 4</h1>
      <p style={{ opacity: 0.8 }}>Apenas Marcelo (admin) ou administrador de sistema/TI pode alterar. Nenhuma mudança afeta dados de clientes.</p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginTop: 24 }}>
        {THEMES.map((t) => (
          <article key={t.id} style={{ border: "1px solid currentColor", borderRadius: "var(--theme-radius)", padding: 16, background: "var(--theme-bg)", boxShadow: "var(--theme-shadow)" }}>
            <h2 style={{ margin: "0 0 8px", fontFamily: "var(--theme-font)", color: "var(--theme-accent)" }}>{t.name}</h2>
            <p style={{ margin: "0 0 12px", fontSize: 14, opacity: 0.85 }}>{t.desc}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, padding: "2px 6px", border: "1px solid var(--theme-accent)", borderRadius: 4, color: "var(--theme-accent)" }}>{t.id}</span>
              <button style={{ padding: "6px 12px", border: "1px solid currentColor", borderRadius: "var(--theme-radius)", background: "transparent", color: "inherit", cursor: "pointer" }} onClick={() => { document.documentElement.setAttribute("data-theme", t.id); }}>Ativar</button>
            </div>
          </article>
        ))}
      </section>
      <section style={{ marginTop: 32, padding: 16, borderLeft: "4px solid var(--theme-accent)", background: "rgba(0,0,0,0.03)" }}>
        <h3>Como funciona</h3>
        <p>As 10 interfaces usam o mesmo componente base; apenas os tokens CSS (cor, fonte, raio, sombra) mudam. Marcelo seleciona uma no painel; todos os clientes veem a mudança imediatamente. Nenhum dado de cliente é alterado.</p>
        <p>Modo dia/noite é controlado separadamente (não é tema, é preferência de usuário).</p>
      </section>
      <div style={{ marginTop: 24, fontSize: 12, opacity: 0.6 }}>Máximo 10 interfaces ativas. Nenhuma interface pode ser removida do banco — apenas desativada via toggle de configuração (não implementado ainda neste stub).</div>
    </main>
  );
}
