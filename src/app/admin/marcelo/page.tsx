export default function MarceloDashboardPage() {
  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "var(--theme-fg)", background: "var(--theme-bg)", borderRadius: "var(--theme-radius)", boxShadow: "var(--theme-shadow)" }}>
      <h1 style={{ fontFamily: "var(--theme-font)", color: "var(--theme-accent)" }}>Camada 3 — Marcelo (dono / admin)</h1>
      <p role="note" style={{ padding: 12, borderLeft: "4px solid #b45309", background: "#fff7ed", color: "#431407" }}><strong>Protótipo descritivo:</strong> esta página não é um dashboard funcional, não comprova login nem concede acesso. Os cartões abaixo apresentam capacidades previstas, ainda não homologadas.</p>
      <p>Visão planejada para a administração (sem liberar programação/TI avançado):</p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginTop: 16 }}>
        {[
          { label: "Dashboard executivo", desc: "Faturamento por posto/cliente, inadimplência, contratos a vencer." },
          { label: "Gestão de contratos", desc: "Vigência, reajuste anual, SLA por cliente." },
          { label: "CRM / Propostas", desc: "Funil de leads do site, follow-up." },
          { label: "Financeiro", desc: "Contas a pagar/receber; NF-e." },
          { label: "Aprovações", desc: "Despesas RH, descontos, contratos especiais." },
          { label: "Tema / Marca", desc: "Escolher entre 10 interfaces; logo, cores, textos." },
          { label: "Bot RAG", desc: "Curadoria: revisar respostas, adicionar documentos." },
          { label: "Notificações", desc: "Contratos vencendo, CNV vencida, meta não batida." },
        ].map((c) => (
          <article key={c.label} style={{ padding: 16, border: "1px solid currentColor", borderRadius: "var(--theme-radius)", background: "rgba(0,0,0,0.03)" }}>
            <h3 style={{ margin: 0, color: "var(--theme-accent)" }}>{c.label}</h3>
            <p style={{ fontSize: 14, margin: "8px 0 0" }}>{c.desc}</p>
          </article>
        ))}
      </section>
      <div style={{ marginTop: 20, padding: 12, borderLeft: "4px solid var(--theme-accent)", background: "rgba(255,255,255,0.2)" }}>
        <strong>Modo dia/noite:</strong> controle global de preferencia do usuário; pode ser configurado como padrão para operadores de monitoramento.
      </div>
    </main>
  );
}
