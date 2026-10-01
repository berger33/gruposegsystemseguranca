import FinBudgetClient from "./FinBudgetClient";

export default function TiAdminPage() {
  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "var(--theme-fg)", background: "var(--theme-bg)", borderRadius: "var(--theme-radius)", boxShadow: "var(--theme-shadow)" }}>
      <h1 style={{ fontFamily: "var(--theme-font)", color: "var(--theme-accent)" }}>Camada 4 — Administrador de sistema / TI</h1>
      <p role="note" style={{ padding: 12, borderLeft: "4px solid #b45309", background: "#fff7ed", color: "#431407" }}><strong>Protótipo descritivo:</strong> os cartões abaixo não são funções acessíveis, não concedem poderes de TI e não comprovam autenticação ou permissões. FIN-13 é a única consulta conectada nesta página e permanece somente leitura; as ações financeiras ficam em /admin/financeiro.</p>
      <p>Capacidades previstas para a camada TI (dependem de implementação e homologação por papel):</p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginTop: 16 }}>
        {[
          { label: "RBAC completo", desc: "Criar papéis, ajustar permissões por módulo (ex: RH vê escala mas não folha)." },
          { label: "Auditoria", desc: "Consultar por período, ator, ação; retenção 12 meses; sem segredos." },
          { label: "Bot / RAG", desc: "Editor de fluxo, upload de base de conhecimento, monitoramento de token." },
          { label: "Integrações", desc: "WhatsApp API, gateway pagamento, NF-e, provedor LLM." },
          { label: "Backup / Staging", desc: "Restaurar, versionar configurações, rollback em um clique." },
          { label: "Editor tema", desc: "Criar/editar tokens das 10 interfaces; Marcelo apenas escolhe." },
          { label: "LGPD / Privacidade", desc: "Política aprovada, consentimento, retenção de CFTV (dado sensível)." },
          { label: "2FA / Rotação", desc: "Forçar 2FA para camadas superiores; rotacionar credenciais." },
          { label: "Rate limit / Anti-spam", desc: "Proteger formulários públicos de abuso de bot." },
          { label: "Manutenção / Deploy", desc: "Modo manutenção global; deploy sem quebrar site." },
        ].map((c) => (
          <article key={c.label} style={{ padding: 16, border: "1px solid currentColor", borderRadius: "var(--theme-radius)", background: "rgba(0,0,0,0.03)" }}>
            <h3 style={{ margin: 0, color: "var(--theme-accent)" }}>{c.label}</h3>
            <p style={{ fontSize: 14, margin: "8px 0 0" }}>{c.desc}</p>
          </article>
        ))}
      </section>
      <FinBudgetClient />
    </main>
  );
}
