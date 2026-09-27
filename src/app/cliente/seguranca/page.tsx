"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Mail, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import styles from "./ClientSecurity.module.css";

type MfaMethod = "authenticator" | "email";

export default function ClientSecurityPreviewPage() {
  const [method, setMethod] = useState<MfaMethod | null>(null);
  const [enabled, setEnabled] = useState(false);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/cliente" className={styles.back}><ArrowLeft size={15} /> Área do Cliente</Link>
        <span className={styles.tag}><ShieldCheck size={14} /> SEGURANÇA DA CONTA · PRÉVIA</span>
      </header>
      <section className={styles.content}>
        <span className={styles.eyebrow}>PORTAL DO CLIENTE · CONFIGURAÇÃO DEMONSTRATIVA</span>
        <h1>Uma etapa extra,<br /><em>se você quiser.</em></h1>
        <p className={styles.intro}>A autenticação em duas etapas (MFA) será opcional. O cliente poderá escolher um método, mas nenhuma ação do portal exigirá ativar essa proteção.</p>
        <div className={styles.notice} role="note"><TriangleAlert size={18} /><p><strong>Esta é só uma prévia.</strong> Não ativa MFA nem envia códigos. Não informe códigos reais ou dados de conta.</p></div>

        <section className={styles.card} aria-labelledby="methods-title">
          <div className={styles.cardHeading}><span className={styles.icon}><ShieldCheck size={20} /></span><div><span className={styles.eyebrow}>ESCOLHA UM MÉTODO</span><h2 id="methods-title">Como confirmar sua entrada?</h2></div></div>
          <div className={styles.methods} role="group" aria-label="Método de autenticação demonstrativo">
            <button type="button" className={`${styles.method} ${method === "authenticator" ? styles.selected : ""}`} aria-pressed={method === "authenticator"} onClick={() => { setMethod("authenticator"); setEnabled(false); }}>
              <Smartphone size={20} /><strong>Aplicativo autenticador</strong><small>Código temporário em um app autenticador.</small>{method === "authenticator" && <span className={styles.selectedMark}><Check size={13} /> Selecionado</span>}
            </button>
            <button type="button" className={`${styles.method} ${method === "email" ? styles.selected : ""}`} aria-pressed={method === "email"} onClick={() => { setMethod("email"); setEnabled(false); }}>
              <Mail size={20} /><strong>Código por e-mail</strong><small>Código temporário enviado ao e-mail confirmado da conta.</small>{method === "email" && <span className={styles.selectedMark}><Check size={13} /> Selecionado</span>}
            </button>
          </div>
          <div className={styles.recovery}>
            <h3><ShieldCheck size={16} /> Se perder o segundo fator</h3>
            <p>Ao configurar MFA, a versão real deverá fornecer códigos de recuperação de uso único. Guarde-os em local seguro. Se perder todos, será necessário pedir ajuda à equipe e confirmar sua identidade.</p>
          </div>
          <div className={styles.actions}>
            <button type="button" disabled={!method} onClick={() => setEnabled(value => !value)}>{enabled ? "Desativar na simulação" : "Simular ativação de MFA"}</button>
            <span role="status">{enabled ? `MFA marcada como ativada nesta prévia (${method === "authenticator" ? "aplicativo autenticador" : "código por e-mail"}). Nenhuma proteção real foi alterada.` : method ? "Método selecionado apenas para esta demonstração local." : "Escolha um método para habilitar a simulação."}</span>
          </div>
        </section>
        <footer className={styles.footer}><span>Sem autenticação, envio de códigos ou geração de códigos de recuperação.</span><Link href="/cliente">Voltar ao portal</Link></footer>
      </section>
    </main>
  );
}
