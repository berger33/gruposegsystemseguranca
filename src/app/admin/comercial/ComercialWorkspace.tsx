"use client";
import { useState } from "react";
import CatalogClient from "../ti/CatalogClient";
import EquipmentClient from "../ti/EquipmentClient";
import InspectionClient from "../ti/InspectionClient";
import LaborBudgetClient from "../ti/LaborBudgetClient";
import TechnicalBudgetClient from "../ti/TechnicalBudgetClient";
import CostParameterClient from "../ti/CostParameterClient";
import PriceScenarioClient from "../ti/PriceScenarioClient";
import DiscountClient from "../ti/DiscountClient";
import ProposalClient from "../ti/ProposalClient";
import ProposalDeliveryClient from "../ti/ProposalDeliveryClient";
import ProposalAcceptanceClient from "../ti/ProposalAcceptanceClient";
import ContractClient from "../ti/ContractClient";
import ReportClient from "../ti/ReportClient";
import CommissionClient from "../ti/CommissionClient";
import CommercialLibraryClient from "../ti/CommercialLibraryClient";
import PartnershipClient from "../ti/PartnershipClient";

type View =
  | "vistoria"
  | "orcamentos"
  | "precos"
  | "propostas"
  | "contratos"
  | "catalogo"
  | "relatorios"
  | "biblioteca";

const TABS: [View, string][] = [
  ["vistoria", "Vistoria"],
  ["orcamentos", "Orçamentos (MO/técnico/custos)"],
  ["precos", "Preço & descontos"],
  ["propostas", "Propostas & envio"],
  ["contratos", "Contrato (idempotência)"],
  ["catalogo", "Catálogo & equipamentos"],
  ["relatorios", "Relatórios & comissões"],
  ["biblioteca", "Biblioteca & parcerias"],
];

const card: React.CSSProperties = { border: "1px solid #dce4ee", borderRadius: 10, background: "#fff" };

export default function ComercialWorkspace() {
  const [view, setView] = useState<View>("vistoria");

  return (
    <main style={{ minHeight: "100vh", background: "#f3f6fa", fontFamily: "system-ui, sans-serif", color: "#17253b" }}>
      <header style={{ padding: "20px 24px", background: "#fff", borderBottom: "1px solid #dce4ee", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "#42699f", textTransform: "uppercase" }}>SEG System · Comercial</span>
          <h1 style={{ margin: "6px 0 4px", fontSize: 28 }}>Vistoria, orçamento, proposta e contrato</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7b90" }}>
            Fluxo do lead qualificado até o aceite. Empresas, contatos e funil ficam em{" "}
            <a href="/admin/crm">Empresas &amp; funil (CRM)</a>; a fila pública em{" "}
            <a href="/admin/leads">Pedidos recebidos</a>.
          </p>
        </div>
      </header>

      <nav aria-label="Áreas comerciais" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 24px 0" }}>
        {TABS.map(([id, label]) => (
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
            {label}
          </button>
        ))}
      </nav>

      <div style={{ padding: 24, display: "grid", gap: 16 }}>
        {view === "vistoria" && (
          <section style={card}><InspectionClient /></section>
        )}
        {view === "orcamentos" && (
          <>
            <section style={card}><TechnicalBudgetClient /></section>
            <section style={card}><LaborBudgetClient /></section>
            <section style={card}><CostParameterClient /></section>
          </>
        )}
        {view === "precos" && (
          <>
            <section style={card}><PriceScenarioClient /></section>
            <section style={card}><DiscountClient /></section>
          </>
        )}
        {view === "propostas" && (
          <>
            <section style={card}><ProposalClient /></section>
            <section style={card}><ProposalDeliveryClient /></section>
            <section style={card}><ProposalAcceptanceClient /></section>
          </>
        )}
        {view === "contratos" && (
          <section style={card}>
            <div style={{ padding: 16 }}>
              <p style={{ fontSize: 12, color: "#6b7b90" }}>
                CRM-23 exige apenas a prova de que o aceite cria a entidade mínima de contrato/implantação de forma
                idempotente — o domínio completo de contratos e implantação pertence ao L05. Esta tela consulta o que
                já foi criado automaticamente pelo aceite da proposta, sem expandir o escopo aqui.
              </p>
            </div>
            <ContractClient />
          </section>
        )}
        {view === "catalogo" && (
          <>
            <section style={card}><CatalogClient /></section>
            <section style={card}><EquipmentClient /></section>
          </>
        )}
        {view === "relatorios" && (
          <>
            <section style={card}><ReportClient /></section>
            <section style={card}><CommissionClient /></section>
          </>
        )}
        {view === "biblioteca" && (
          <>
            <section style={card}><CommercialLibraryClient /></section>
            <section style={card}><PartnershipClient /></section>
          </>
        )}
      </div>
    </main>
  );
}
