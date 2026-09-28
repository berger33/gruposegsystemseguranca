export default function AdminFuncionariosPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "var(--theme-fg)", background: "var(--theme-bg)" }}>
      <h1>Funcionários / RH — Opção B (em modelagem)</h1>
      <p>Postos, escalas (12x36 / 6x1 / diarista), ponto com geolocalização, evidência, passagem de plantão.</p>
      <ul>
        <li>Migração 007 aplicada (posts, assignments, scale_rules, time_entries, handover).</li>
        <li>Administração por convite (não autocadastro).</li>
        <li>Geolocalização opcional; retenção ainda a definir.</li>
        <li>Dados de demonstração só em testes identificados.</li>
      </ul>
      <div style={{ marginTop: 16, padding: 16, borderLeft: "4px solid var(--theme-accent)", background: "rgba(0,0,0,0.03)" }}>
        <strong>Próximo:</strong> definir escala por posto, ponto por posto/pessoa, e retenção de geo. SMTP só depois.
      </div>
    </main>
  );
}
