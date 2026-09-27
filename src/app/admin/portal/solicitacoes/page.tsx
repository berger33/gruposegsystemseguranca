"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, Clock3, FileSearch, ShieldCheck, X } from "lucide-react";
import styles from "./AccessRequests.module.css";

type DecisionPreview = "approved" | "declined" | null;

export default function AccessRequestsPreviewPage() {
  const [decision, setDecision] = useState<DecisionPreview>(null);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/portal" className={styles.back}><ArrowLeft size={15} /> Configuração do portal</Link>
        <span className={styles.headerLabel}><FileSearch size={14} /> SOLICITAÇÕES DE ACESSO</span>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>PORTAL DO CLIENTE · FLUXO COM APROVAÇÃO</span><h1>Revisão por uma<br /><em>pessoa da equipe.</em></h1><p>Prévia de como uma solicitação poderia ser analisada antes de habilitar o acesso.</p></div>
          <Link className={styles.clientLink} href="/cliente">Ver página do cliente <ArrowRight size={14} /></Link>
        </div>

        <div className={styles.notice} role="note"><CircleAlert size={18} /><p><strong>Fila não conectada.</strong> Esta demonstração não recebe solicitações, não contém registros e não altera permissões. Não use dados reais; as ações abaixo apenas trocam a prévia nesta tela.</p></div>

        <section className={styles.queue} aria-labelledby="queue-title">
          <div className={styles.queueHeader}>
            <div><span className={styles.sectionLabel}>FILA DE REVISÃO</span><h2 id="queue-title">Solicitações recebidas</h2></div>
            <span className={styles.unavailable}><Clock3 size={14} /> SEM CONEXÃO</span>
          </div>
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}><FileSearch size={22} /></span>
            <strong>Nenhum registro é exibido nesta prévia</strong>
            <p>Quando o fluxo for implementado, solicitações reais deverão aparecer aqui após serem armazenadas e protegidas.</p>
          </div>
        </section>

        <section className={styles.flowSection}>
          <div className={styles.flowIntro}><span className={styles.sectionLabel}>FLUXO PROPOSTO</span><h2>Da solicitação à decisão</h2><p>O vínculo do cliente e o escopo de acesso devem ser verificados antes de qualquer liberação.</p></div>
          <div className={styles.flowSteps}>
            <article><span>01</span><strong>Receber pedido</strong><small>O cliente manifesta interesse em acessar o portal.</small></article>
            <ArrowRight className={styles.connector} size={16} />
            <article><span>02</span><strong>Verificar vínculo</strong><small>A equipe confirma a relação e o escopo permitido.</small></article>
            <ArrowRight className={styles.connector} size={16} />
            <article><span>03</span><strong>Registrar decisão</strong><small>A aprovação não concede acesso além do autorizado.</small></article>
          </div>
        </section>

        <section className={styles.decisionSection} aria-labelledby="decision-title">
          <div className={styles.decisionIntro}><span className={styles.sectionLabel}>PRÉVIA INTERATIVA · SEM REGISTRO</span><h2 id="decision-title">Veja os dois resultados possíveis</h2><p>Estas opções não analisam nem aprovam uma solicitação real.</p></div>
          <div className={styles.decisionGrid}>
            <button className={`${styles.decisionButton} ${decision === "approved" ? styles.selectedApproved : ""}`} type="button" aria-pressed={decision === "approved"} onClick={() => setDecision("approved")}>
              <span><Check size={16} /></span><strong>Pré-visualizar aprovação</strong><small>Ver mensagem de estado aprovado</small>
            </button>
            <button className={`${styles.decisionButton} ${decision === "declined" ? styles.selectedDeclined : ""}`} type="button" aria-pressed={decision === "declined"} onClick={() => setDecision("declined")}>
              <span><X size={16} /></span><strong>Pré-visualizar não aprovação</strong><small>Ver mensagem de estado não aprovado</small>
            </button>
          </div>
          {decision && (
            <div className={`${styles.outcome} ${decision === "approved" ? styles.outcomeApproved : styles.outcomeDeclined}`} role="status" aria-live="polite">
              {decision === "approved" ? <CircleCheck size={19} /> : <CircleAlert size={19} />}
              <div><strong>{decision === "approved" ? "Prévia: solicitação aprovada" : "Prévia: acesso não aprovado"}</strong><p>{decision === "approved" ? "Em uma versão real, a equipe ainda precisaria confirmar o vínculo e definir permissões no servidor antes de enviar instruções de acesso." : "Em uma versão real, a equipe registraria a decisão segundo a política aprovada. Motivos, comunicação e possibilidade de nova solicitação ainda precisam ser definidos."}</p></div>
            </div>
          )}
        </section>

        <div className={styles.securityNote}><ShieldCheck size={18} /><p>A aprovação deve ser auditável. Contratos e documentos continuam sujeitos a autorização por cliente no servidor — uma solicitação ou cadastro não libera acesso automaticamente.</p></div>
        <footer className={styles.footer}><span>Protótipo sem dados, persistência, notificações ou decisões reais.</span><Link href="/admin/portal">Voltar aos modos de acesso <ArrowLeft size={13} /></Link></footer>
      </section>
    </main>
  );
}
