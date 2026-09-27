"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleAlert, Mail, ShieldCheck } from "lucide-react";
import styles from "./PasswordRecovery.module.css";

export default function PasswordRecoveryPreviewPage() {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");

  function previewRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/cliente" className={styles.back}><ArrowLeft size={15} /> Área do Cliente</Link>
        <span className={styles.headerTag}><ShieldCheck size={14} /> PRÉVIA DE RECUPERAÇÃO</span>
      </header>
      <section className={styles.content}>
        <span className={styles.eyebrow}>PORTAL DO CLIENTE · FLUXO DEMONSTRATIVO</span>
        <h1>Recuperar acesso<br /><em>com segurança.</em></h1>
        <p className={styles.intro}>A regra planejada usa um link de uso único enviado ao e-mail cadastrado, válido por 1 hora. Este protótipo não envia mensagens nem altera senhas.</p>
        <div className={styles.notice} role="note"><CircleAlert size={18} /><p><strong>Use somente um e-mail fictício.</strong> O endereço fica na memória desta página e não é transmitido.</p></div>
        {!submitted ? (
          <form className={styles.card} onSubmit={previewRequest}>
            <label htmlFor="recovery-email">E-mail da conta</label>
            <input id="recovery-email" name="email" type="email" autoComplete="off" maxLength={254} required placeholder="teste@exemplo.com" value={email} onChange={event => setEmail(event.target.value)} />
            <small>Por segurança, a mensagem de resultado será igual exista ou não uma conta associada ao endereço.</small>
            <button type="submit">Pré-visualizar solicitação <ArrowRight size={15} /></button>
          </form>
        ) : (
          <section className={styles.card} aria-live="polite">
            <span className={styles.mailIcon}><Mail size={20} /></span>
            <span className={styles.eyebrow}>RESPOSTA GENÉRICA · NÃO ENVIADA</span>
            <h2>Confira seu e-mail</h2>
            <p>Se houver uma conta associada a <strong>{email}</strong>, enviaremos instruções para redefinir a senha.</p>
            <div className={styles.emailPreview}>
              <strong>Prévia de mensagem</strong>
              <span>Assunto: Redefinição de senha · Área do Cliente</span>
              <span>O link seria de uso único e expiraria em 1 hora. Nenhum link foi criado ou enviado nesta demonstração.</span>
            </div>
            <button className={styles.secondary} type="button" onClick={() => setSubmitted(false)}>Voltar <ArrowLeft size={14} /></button>
          </section>
        )}
        <footer className={styles.footer}><span>Sem conta real, envio de e-mail ou alteração de senha.</span><Link href="/cliente">Voltar ao portal <ArrowRight size={14} /></Link></footer>
      </section>
    </main>
  );
}
