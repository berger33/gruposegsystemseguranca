import ClientPortalNavigation from "@/components/ClientPortalNavigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bell, BriefcaseBusiness, CircleHelp, FileText, Headphones, LockKeyhole, ShieldCheck } from "lucide-react";
import styles from "./ClientDashboard.module.css";

export const metadata: Metadata = {
  title: "Prévia do portal do cliente | Grupo SEG System",
  description: "Protótipo visual da futura área reservada do cliente.",
};

const emptyModules = [
  {
    title: "Contratos e serviços",
    description: "Informações vinculadas ao relacionamento autorizado.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Documentos",
    description: "Arquivos disponibilizados somente após validação do acesso.",
    icon: FileText,
  },
  {
    title: "Solicitações e chamados",
    description: "Abertura e acompanhamento de contatos de atendimento.",
    icon: Headphones,
  },
];

export default function ClientDashboardPreviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/cliente" aria-label="Voltar à Área do Cliente">
          <span className={styles.brandMark}><ShieldCheck size={21} /></span>
          <span><strong>GRUPO SEG SYSTEM</strong><small>ÁREA DO CLIENTE</small></span>
        </Link>
        <Link className={styles.back} href="/cliente"><ArrowLeft size={15} /> Área do Cliente</Link>
      </header>

      <ClientPortalNavigation />

      <section className={styles.content}>
        <div className={styles.previewTag}><span /> PRÉVIA DE INTERFACE · SEM AUTENTICAÇÃO</div>
        <div className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>PORTAL DO CLIENTE</span>
            <h1>Um espaço claro para acompanhar <em>o que foi autorizado.</em></h1>
            <p>Esta é uma prévia da estrutura planejada. Não há sessão iniciada, cadastro consultado ou informação de cliente nesta tela.</p>
          </div>
          <div className={styles.secureCard}>
            <span className={styles.secureIcon}><LockKeyhole size={20} /></span>
            <strong>Acesso reservado</strong>
            <p>O portal real dependerá de convite, verificação do vínculo e autorização no servidor.</p>
            <Link href="/cliente/acesso">Ver prévia de acesso <ArrowRight size={14} /></Link>
          </div>
        </div>

        <div className={styles.notice} role="note">
          <CircleHelp size={18} />
          <p><strong>Somente demonstração visual.</strong> Não há contratos, documentos, chamados ou notificações reais. Os cartões abaixo são estados vazios de projeto, não representam uma conta ou cliente.</p>
        </div>

        <div className={styles.sectionTitle}>
          <div><span className={styles.eyebrow}>VISÃO GERAL</span><h2>O que ficará reunido</h2></div>
          <span className={styles.status}><i /> MÓDULOS EM PLANEJAMENTO</span>
        </div>

        <section className={styles.moduleGrid} aria-label="Módulos planejados do portal">
          {emptyModules.map(({ title, description, icon: Icon }) => (
            <article className={styles.moduleCard} key={title}>
              <span className={styles.moduleIcon}><Icon size={19} /></span>
              <span className={styles.moduleLabel}>ÁREA PLANEJADA</span>
              <h3>{title}</h3>
              <p>{description}</p>
              {title === "Solicitações e chamados" ? (
                <Link className={styles.moduleLink} href="/cliente/chamados">Abrir prévia de chamados <ArrowRight size={13} /></Link>
              ) : title === "Documentos" ? (
                <Link className={styles.moduleLink} href="/cliente/documentos">Abrir prévia de documentos <ArrowRight size={13} /></Link>
              ) : title === "Contratos e serviços" ? (
                <Link className={styles.moduleLink} href="/cliente/contratos">Abrir prévia de contratos <ArrowRight size={13} /></Link>
              ) : (
                <div className={styles.emptyState}><span>Nenhum item disponível nesta prévia</span></div>
              )}
            </article>
          ))}
        </section>

        <section className={styles.bottomPanel}>
          <div className={styles.bottomIcon}><Bell size={18} /></div>
          <div><span className={styles.eyebrow}>PRÓXIMOS FLUXOS</span><h2>Acesso e segurança</h2><p>As telas demonstrativas de convite, login, recuperação e segurança continuam disponíveis para revisão. Não use credenciais reais.</p></div>
          <div className={styles.links}>
            <Link href="/cliente/acesso">Convite e login <ArrowRight size={14} /></Link>
            <Link href="/cliente/seguranca">Opções de segurança <ArrowRight size={14} /></Link>
            <Link href="/cliente/recuperar-senha">Recuperação de senha <ArrowRight size={14} /></Link>
            <Link href="/cliente/alterar-email">Troca de e-mail <ArrowRight size={14} /></Link>
          </div>
        </section>

        <footer className={styles.footer}><span>Prévia de desenvolvimento · sem persistência ou dados reais</span><Link href="/cliente">Voltar à apresentação do portal <ArrowLeft size={13} /></Link></footer>
      </section>
    </main>
  );
}
