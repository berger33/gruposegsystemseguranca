"use client";
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
import styles from "../../../components/ui/UiWorkspace.module.css";

// UX-03B: a sequência comercial passa a ser lida como etapas, com a pergunta
// que cada área responde e o próximo passo explícito. Os rótulos dos botões
// e todos os componentes de domínio permanecem inalterados — nenhuma regra,
// rota ou alçada foi tocada aqui.

type View =
  | "vistoria"
  | "orcamentos"
  | "precos"
  | "propostas"
  | "contratos"
  | "catalogo"
  | "relatorios"
  | "biblioteca";

type Area = {
  id: View;
  label: string;
  pergunta: string;
  proximo: string;
};

const TABS: Area[] = [
  { id: "vistoria", label: "Vistoria", pergunta: "O que existe no local e o que o cliente precisa?", proximo: "Com a vistoria registrada, siga para os orçamentos." },
  { id: "orcamentos", label: "Orçamentos (MO/técnico/custos)", pergunta: "Quanto custa entregar esse serviço?", proximo: "Com os custos fechados, defina preço e desconto." },
  { id: "precos", label: "Preço & descontos", pergunta: "Qual preço será praticado e com qual alçada de desconto?", proximo: "Com o preço aprovado, monte a proposta." },
  { id: "propostas", label: "Propostas & envio", pergunta: "O que o cliente recebe, como recebe e o que ele respondeu?", proximo: "Com o aceite registrado, confira o contrato criado." },
  { id: "contratos", label: "Contrato (idempotência)", pergunta: "O aceite gerou contrato/implantação sem duplicar?", proximo: "A gestão completa do contrato fica em Contratos." },
  { id: "catalogo", label: "Catálogo & equipamentos", pergunta: "O que pode ser vendido e com quais equipamentos?", proximo: "Mantenha o catálogo antes de orçar." },
  { id: "relatorios", label: "Relatórios & comissões", pergunta: "Como está o resultado e o que foi apurado em comissão?", proximo: "Comissão apurada não é comissão paga." },
  { id: "biblioteca", label: "Biblioteca & parcerias", pergunta: "Quais materiais e parceiros apoiam a venda?", proximo: "Use a biblioteca para padronizar a abordagem." },
];

export default function ComercialWorkspace() {
  const [view, setView] = useState<View>("vistoria");
  const area = TABS.find(item => item.id === view) as Area;

  return (
    <main className={styles.workspace}>
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Comercial</span>
      </nav>
      <h1>Vistoria, orçamento, proposta e contrato</h1>
      <p className={styles.lede}>
        Do lead qualificado até o aceite, na ordem em que o trabalho acontece. Empresas, contatos e funil ficam em{" "}
        <a href="/admin/crm">Empresas e funil</a>; a fila pública em <a href="/admin/leads">Pedidos recebidos</a>;
        a sua carteira em <a href="/admin/carteira">Carteira e próximos contatos</a>.
      </p>

      <nav aria-label="Etapas comerciais" className={styles.tabs}>
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            aria-pressed={view === item.id}
            className={view === item.id ? styles.tabActive : styles.tab}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className={styles.tabPanel}>
        <section className={styles.panel} aria-labelledby="comercial-contexto">
          <h2 id="comercial-contexto" className={styles.panelTitle}>{area.label}</h2>
          <p className={styles.hint}><strong>Pergunta desta etapa:</strong> {area.pergunta}</p>
          <p className={styles.hint}><strong>Próximo passo:</strong> {area.proximo}</p>
        </section>

        {view === "vistoria" && (
          <section className={styles.sectionCard}><InspectionClient /></section>
        )}
        {view === "orcamentos" && (
          <>
            <section className={styles.sectionCard}><TechnicalBudgetClient /></section>
            <section className={styles.sectionCard}><LaborBudgetClient /></section>
            <section className={styles.sectionCard}><CostParameterClient /></section>
          </>
        )}
        {view === "precos" && (
          <>
            <section className={styles.sectionCard}><PriceScenarioClient /></section>
            <section className={styles.sectionCard}><DiscountClient /></section>
          </>
        )}
        {view === "propostas" && (
          <>
            <section className={styles.sectionCard}><ProposalClient /></section>
            <section className={styles.sectionCard}><ProposalDeliveryClient /></section>
            <section className={styles.sectionCard}><ProposalAcceptanceClient /></section>
          </>
        )}
        {view === "contratos" && (
          <section className={styles.sectionCard}>
            <div style={{ padding: 16 }}>
              <p className={styles.hint}>
                Esta tela só confere o que o aceite da proposta já criou automaticamente: a entidade mínima de
                contrato/implantação, sem duplicar quando a confirmação é repetida (CRM-23). A gestão completa de
                contratos e implantação é feita em <a href="/admin/contratos">Contratos</a>; nada é ampliado aqui.
              </p>
            </div>
            <ContractClient />
          </section>
        )}
        {view === "catalogo" && (
          <>
            <section className={styles.sectionCard}><CatalogClient /></section>
            <section className={styles.sectionCard}><EquipmentClient /></section>
          </>
        )}
        {view === "relatorios" && (
          <>
            <section className={styles.sectionCard}><ReportClient /></section>
            <section className={styles.sectionCard}><CommissionClient /><CommercialHistory /></section>
          </>
        )}
        {view === "biblioteca" && (
          <>
            <section className={styles.sectionCard}><CommercialLibraryClient /></section>
            <section className={styles.sectionCard}><PartnershipClient /></section>
          </>
        )}
      </div>
    </main>
  );
}
