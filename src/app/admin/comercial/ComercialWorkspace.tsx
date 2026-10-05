"use client";

// UX-03B — comercial: vistoria → orçamento → preço → proposta → contrato.
// A tela passou a usar a moldura administrativa compartilhada (antes abria um
// segundo `main` com fundo próprio dentro do chrome do /admin). Nenhum cliente
// de API, payload, alçada ou regra de idempotência foi alterado aqui.

import { useState } from "react";
import CommercialHistory from "./CommercialHistory";
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
import UiWorkspace from "../../../components/ui/UiWorkspace";
import UiPanel from "../../../components/ui/UiPanel";
import ui from "../../../components/ui/UiWorkspace.module.css";
import styles from "./Comercial.module.css";

type View =
  | "vistoria"
  | "orcamentos"
  | "precos"
  | "propostas"
  | "contratos"
  | "catalogo"
  | "relatorios"
  | "biblioteca";

/** Etapa, rótulo e a pergunta que a pessoa responde naquela etapa. */
const TABS: { id: View; label: string; step: string; question: string }[] = [
  { id: "vistoria", label: "Vistoria", step: "Etapa 1", question: "O que foi levantado no local e o que ainda falta registrar?" },
  { id: "orcamentos", label: "Orçamentos (MO/técnico/custos)", step: "Etapa 2", question: "Quanto custa executar: mão de obra, técnico e parâmetros de custo." },
  { id: "precos", label: "Preço & descontos", step: "Etapa 3", question: "Qual cenário de preço e qual desconto está autorizado?" },
  { id: "propostas", label: "Propostas & envio", step: "Etapa 4", question: "O que foi proposto, como foi enviado e qual o aceite?" },
  { id: "contratos", label: "Contrato (idempotência)", step: "Etapa 5", question: "O aceite gerou contrato/implantação sem duplicar?" },
  { id: "catalogo", label: "Catálogo & equipamentos", step: "Apoio", question: "Quais serviços e equipamentos estão disponíveis para compor." },
  { id: "relatorios", label: "Relatórios & comissões", step: "Acompanhamento", question: "Como está o resultado comercial e a comissão apurada?" },
  { id: "biblioteca", label: "Biblioteca & parcerias", step: "Apoio", question: "Quais materiais aprovados e parcerias posso usar." },
];

export default function ComercialWorkspace() {
  const [view, setView] = useState<View>("vistoria");
  const current = TABS.find(tab => tab.id === view)!;

  return (
    <UiWorkspace
      title="Vistoria, orçamento, proposta e contrato"
      intro={
        <>
          Fluxo do lead qualificado até o aceite, em etapas. Empresas, contatos e funil ficam em{" "}
          <a href="/admin/crm">Empresas e oportunidades</a>; a fila pública em{" "}
          <a href="/admin/leads">Pedidos recebidos</a>; a continuidade do relacionamento em{" "}
          <a href="/admin/carteira">Carteira e próximos contatos</a>.
        </>
      }
    >
      <nav aria-label="Etapas comerciais" className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            aria-pressed={view === tab.id}
            aria-current={view === tab.id ? "step" : undefined}
            className={styles.tab}
          >
            <span className={styles.tabStep}>{tab.step}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <UiPanel
        id="comercial-etapa"
        eyebrow={`${current.step} de ${TABS.length} áreas`}
        title={current.label}
        description={current.question}
      >
        <div className={styles.stack}>
          {view === "vistoria" && <section className={styles.block}><InspectionClient /></section>}
          {view === "orcamentos" && (
            <>
              <section className={styles.block}><TechnicalBudgetClient /></section>
              <section className={styles.block}><LaborBudgetClient /></section>
              <section className={styles.block}><CostParameterClient /></section>
            </>
          )}
          {view === "precos" && (
            <>
              <section className={styles.block}><PriceScenarioClient /></section>
              <section className={styles.block}><DiscountClient /></section>
            </>
          )}
          {view === "propostas" && (
            <>
              <section className={styles.block}><ProposalClient /></section>
              <section className={styles.block}><ProposalDeliveryClient /></section>
              <section className={styles.block}><ProposalAcceptanceClient /></section>
            </>
          )}
          {view === "contratos" && (
            <section className={styles.block}>
              <p className={ui.fieldHint}>
                Esta tela mostra apenas o contrato/implantação mínimo criado automaticamente pelo aceite da proposta,
                de forma idempotente. O domínio completo de contratos e implantação vive em{" "}
                <a href="/admin/contratos">Contratos</a> e não é ampliado aqui.
              </p>
              <ContractClient />
            </section>
          )}
          {view === "catalogo" && (
            <>
              <section className={styles.block}><CatalogClient /></section>
              <section className={styles.block}><EquipmentClient /></section>
            </>
          )}
          {view === "relatorios" && (
            <>
              <section className={styles.block}><ReportClient /></section>
              <section className={styles.block}><CommissionClient /><CommercialHistory /></section>
            </>
          )}
          {view === "biblioteca" && (
            <>
              <section className={styles.block}><CommercialLibraryClient /></section>
              <section className={styles.block}><PartnershipClient /></section>
            </>
          )}
        </div>
      </UiPanel>
    </UiWorkspace>
  );
}
