"use client";
import { useState } from "react";
import CrmEmpresasTab from "./CrmEmpresasTab";
import CrmFunilTab from "./CrmFunilTab";
import CrmTarefasTab from "./CrmTarefasTab";
import CrmAgendaTab from "./CrmAgendaTab";
import CrmHistoricoTab from "./CrmHistoricoTab";
import CrmCarteiraTab from "./CrmCarteiraTab";

type View = "empresas" | "funil" | "tarefas" | "agenda" | "historico" | "carteira";

const TABS: [View, string][] = [
  ["empresas", "Empresas & contatos"],
  ["funil", "Funil & oportunidades"],
  ["tarefas", "Tarefas & cadências"],
  ["agenda", "Agenda de visitas"],
  ["historico", "Histórico & anexos"],
  ["carteira", "Carteira & renovação"],
];

export default function CrmWorkspace() {
  const [view, setView] = useState<View>("empresas");

  return (
    <main style={{ minHeight: "100vh", background: "#f3f6fa", fontFamily: "system-ui, sans-serif", color: "#17253b", overflowX: "hidden" }}>
      <header style={{ padding: "20px 24px", background: "#fff", borderBottom: "1px solid #dce4ee" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "#42699f", textTransform: "uppercase" }}>SEG System · CRM</span>
        <h1 style={{ margin: "6px 0 4px", fontSize: 28 }}>Empresas, funil, tarefas e carteira</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7b90" }}>
          Cadastro central, funil, tarefas com cadência, agenda de visitas e histórico com anexos. A jornada de vistoria a
          contrato fica em <a href="/admin/comercial">Comercial</a>; a fila pública em <a href="/admin/leads">Pedidos recebidos</a>.
        </p>
      </header>

      <nav aria-label="Áreas do CRM" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 24px 0" }}>
        {TABS.map(([id, text]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            aria-pressed={view === id}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: view === id ? "2px solid #0b5fff" : "1px solid #ccd7e4",
              background: view === id ? "#eff6ff" : "#fff",
              color: "#17253b",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {text}
          </button>
        ))}
      </nav>

      <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: "100%" }}>
        {view === "empresas" && <CrmEmpresasTab />}
        {view === "funil" && <CrmFunilTab />}
        {view === "tarefas" && <CrmTarefasTab />}
        {view === "agenda" && <CrmAgendaTab />}
        {view === "historico" && <CrmHistoricoTab />}
        {view === "carteira" && <CrmCarteiraTab />}
      </div>
    </main>
  );
}
