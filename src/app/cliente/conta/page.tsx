import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AtSign, KeyRound, LockKeyhole, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import ClientPortalNavigation from "@/components/ClientPortalNavigation";
import styles from "./ClientSecurityHub.module.css";

export const metadata: Metadata = {
  title: "Conta e segurança | Grupo SEG System",
  description: "Central de navegação para as prévias de acesso e segurança do portal do cliente.",
};

const securityPreviews = [
  { title: "Convite e login", description: "Prévia do acesso por convite e das regras de entrada planejadas.", href: "/cliente/acesso", label: "Abrir prévia de acesso", icon: LockKeyhole },
  { title: "Recuperação de senha", description: "Veja a resposta genérica e o fluxo planejado de recuperação.", href: "/cliente/recuperar-senha", label: "Abrir prévia de recuperação", icon: KeyRound },
  { title: "Autenticação em duas etapas", description: "Explore as opções demonstrativas de aplicativo autenticador e código por e-mail.", href: "/cliente/seguranca", label: "Abrir prévia de segurança", icon: Smartphone },
  { title: "Troca de e-mail", description: "Prévia de confirmação do novo endereço e alerta para o endereço atual.", href: "/cliente/alterar-email", label: "Abrir prévia de troca", icon: AtSign },
];

export default function ClientSecurityHubPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/cliente/painel" aria-label="Voltar ao painel do cliente">
          <span className={styles.brandMark}><ShieldCheck size={20} /></span>
          <span><strong>GRUPO SEG SYSTEM</strong><small>ÁREA DO CLIENTE · PRÉVIA</small></span>
        </Link>
        <Link className={styles.back} href="/cliente/painel">Voltar ao painel <ArrowRight size={14} /></Link>
      </header>
      <ClientPortalNavigation />
      <section className={styles.content}>
        <div className={styles.previewTag}><span /> CENTRAL DE ACESSO · DEMONSTRAÇÕES</div>
        <div className={styles.heading}><div><span className={styles.eyebrow}>CONTA E SEGURANÇA</span><h1>Proteção da conta,<br /><em>em um só lugar.</em></h1><p>Atalhos para revisar os fluxos planejados de entrada e segurança do futuro portal.</p></div><div className={styles.secureCard}><span><ShieldCheck size={19} /></span><strong>Regras planejadas</strong><p>A autenticação real só será habilitada após implementação e revisão de segurança.</p></div></div>
        <div className={styles.notice} role="note"><TriangleAlert size={17} /><p><strong>Protótipos isolados, sem conta ativa.</strong> Estas telas não autenticam, não alteram credenciais, não enviam mensagens nem guardam dados. Use somente informações fictícias.</p></div>
        <section className={styles.cardGrid} aria-label="Prévia de acesso e segurança">
          {securityPreviews.map(({ title, description, href, label, icon: Icon }) => (
            <article className={styles.card} key={href}>
              <span className={styles.icon}><Icon size={18} /></span>
              <span className={styles.cardLabel}>FLUXO DEMONSTRATIVO</span>
              <h2>{title}</h2>
              <p>{description}</p>
              <Link href={href}>{label} <ArrowRight size={14} /></Link>
            </article>
          ))}
        </section>
        <section className={styles.alternateMode}>
          <span className={styles.cardLabel}>MODO ALTERNATIVO · NÃO É O PADRÃO</span>
          <h2>Solicitação de acesso com aprovação</h2>
          <p>Explore um pedido fictício e sua revisão na mesma demonstração local. Os campos de identificação ainda não foram definidos; por isso, não solicitamos dados pessoais.</p>
          <Link href="/admin/portal/solicitacoes">Abrir prévia integrada do pedido e da revisão <ArrowRight size={14} /></Link>
        </section>
        <footer className={styles.footer}><span>Nenhuma sessão ou conta real está ativa nesta prévia.</span><Link href="/cliente/painel">Voltar à visão geral</Link></footer>
      </section>
    </main>
  );
}
