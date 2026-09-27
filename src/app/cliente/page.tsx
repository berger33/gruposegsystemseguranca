import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, FileText, Headphones, KeyRound, LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react";
import styles from "./ClientPortal.module.css";

export const metadata: Metadata = {
  title: "Área do cliente | Grupo SEG System",
  description: "Informações sobre o acesso por convite à futura área do cliente do Grupo SEG System.",
};

const WHATSAPP = "551134372217";
const contactHref = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Olá! Gostaria de falar com a equipe sobre a Área do Cliente do Grupo SEG System.")}`;

export default function ClientPortalPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Grupo SEG System — início">
          <span className={styles.brandMark}><ShieldCheck size={23} /></span>
          <span><strong>GRUPO SEG SYSTEM</strong><small>SEGURANÇA INTEGRADA</small></span>
        </Link>
        <Link href="/" className={styles.backLink}><ArrowLeft size={15} /> Voltar ao site</Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><span /> ÁREA DO CLIENTE · EM DESENVOLVIMENTO</span>
          <h1>Um espaço reservado,<br /><em>acesso por convite.</em></h1>
          <p>Estamos preparando uma área para reunir informações e solicitações relacionadas aos serviços contratados. O portal ainda não está disponível nesta prévia.</p>
          <a className={styles.primaryButton} href={contactHref} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={17} /> Falar com a equipe <ArrowUpRight size={16} />
          </a>
          <small className={styles.humanNote}>A equipe poderá orientar sobre os próximos passos; este contato não cria uma conta nem libera documentos.</small>
        </div>
        <aside className={styles.accessCard} aria-label="Estado do acesso">
          <div className={styles.cardIcon}><KeyRound size={23} /></div>
          <span className={styles.cardLabel}>STATUS DO PORTAL</span>
          <strong>Convites ainda não estão ativos</strong>
          <p>Não insira senhas, códigos ou dados de contrato nesta página. A autenticação será habilitada quando o portal estiver pronto.</p>
          <Link className={styles.recoveryLink} href="/cliente/recuperar-senha">Ver prévia de recuperação de senha <ArrowRight size={13} /></Link>
          <span className={styles.status}><i /> EM PREPARAÇÃO</span>
        </aside>
      </section>

      <section className={styles.process} id="como-funciona">
        <div className={styles.sectionIntro}>
          <span className={styles.eyebrow}>ACESSO PREVISTO</span>
          <h2>Como o convite deverá funcionar</h2>
          <p>O fluxo abaixo descreve a direção planejada; nenhuma conta ou autorização é criada por esta prévia.</p>
        </div>
        <div className={styles.steps}>
          <article><span className={styles.stepNumber}>01</span><span className={styles.stepIcon}><MessageCircle size={21} /></span><h3>Converse com a equipe</h3><p>A equipe orientará sobre a disponibilidade do portal e o processo de convite.</p></article>
          <article><span className={styles.stepNumber}>02</span><span className={styles.stepIcon}><KeyRound size={21} /></span><h3>Receba um convite individual</h3><p>O modo inicial planejado é por convite, sujeito à configuração administrativa e verificação do vínculo.</p></article>
          <article><span className={styles.stepNumber}>03</span><span className={styles.stepIcon}><LockKeyhole size={21} /></span><h3>Acesse somente o autorizado</h3><p>O acesso futuro deverá limitar contratos e documentos ao cliente e às permissões confirmadas.</p></article>
        </div>
      </section>

      <section className={styles.preview}>
        <div className={styles.previewHeading}>
          <span className={styles.eyebrow}>CONTEÚDO PLANEJADO</span>
          <h2>O que poderá ficar reunido</h2>
          <p>Estes módulos ainda não estão disponíveis. Nenhum dado de cliente é exibido nesta página.</p>
        </div>
        <div className={styles.previewItems}>
          <div><FileText size={20} /><span><strong>Documentos autorizados</strong><small>Disponíveis apenas após validação de acesso.</small></span><span className={styles.planned}><Check size={12} /> PLANEJADO</span></div>
          <div><Headphones size={20} /><span><strong>Solicitações e chamados</strong><small>Acompanhamento de contatos relacionados ao atendimento.</small></span><span className={styles.planned}><Check size={12} /> PLANEJADO</span></div>
          <div><ShieldCheck size={20} /><span><strong>Informações do serviço</strong><small>Conteúdo vinculado ao relacionamento autorizado.</small></span><span className={styles.planned}><Check size={12} /> PLANEJADO</span></div>
        </div>
      </section>

      <section className={styles.closing}>
        <div><span className={styles.eyebrow}>PRECISA DE ORIENTAÇÃO?</span><h2>Fale com uma pessoa da equipe.</h2><p>O WhatsApp será aberto com uma mensagem para você revisar antes de enviar.</p></div>
        <a className={styles.secondaryButton} href={contactHref} target="_blank" rel="noopener noreferrer">Abrir WhatsApp <ArrowRight size={16} /></a>
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} Grupo SEG System · Prévia em desenvolvimento</span>
        <Link href="/">Início <ArrowUpRight size={13} /></Link>
      </footer>
    </main>
  );
}
