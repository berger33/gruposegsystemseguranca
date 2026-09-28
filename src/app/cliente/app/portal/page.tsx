export default function ClientePortalPage() {
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "var(--theme-font)", color: "var(--theme-fg)", background: "var(--theme-bg)", borderRadius: "var(--theme-radius)", boxShadow: "var(--theme-shadow)" }}>
      <h1 style={{ color: "var(--theme-accent)" }}>Portal do Cliente — Camada 1</h1>
      <p>Vínculo verificado no servidor (sessão + grant + conta ativa). Acesso restrito por contrato e/ou unidade conforme configuração do administrador.</p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginTop: 16 }}>
        {[
          { label: "Contratos", desc: "Lista de contratos ativos com escopo selecionado (all/selected)." },
          { label: "Documentos", desc: "Download auditado; cada acesso gera linha de auditoria." },
          { label: "Chamados", desc: "Abrir chamado técnico; resposta da equipe no portal." },
          { label: "Segurança", desc: "MFA opcional, troca de e-mail confirmada, sessões revogáveis." },
        ].map((c) => (
          <article key={c.label} style={{ padding: 16, border: "1px solid currentColor", borderRadius: "var(--theme-radius)", background: "rgba(255,255,255,0.3)" }}>
            <h3 style={{ margin: 0, color: "var(--theme-accent)" }}>{c.label}</h3>
            <p style={{ fontSize: 14, margin: "8px 0 0" }}>{c.desc}</p>
          </article>
        ))}
      </section>
      <div style={{ marginTop: 24, padding: 12, borderLeft: "4px solid var(--theme-accent)", background: "rgba(0,0,0,0.03)" }}>
        <strong>Regra de ouro aplicada:</strong> o servidor nunca confia em identificadores do navegador; cada consulta exige sessão válida + vínculo ativo + cadastro ativo. Qualquer desvio responde 403 genérico com auditoria <code>authorization_denied</code>.
      </div>
    </main>
  );
}
