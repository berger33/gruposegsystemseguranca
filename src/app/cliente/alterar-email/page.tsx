"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Mail, ShieldCheck } from "lucide-react";
import styles from "./ChangeEmail.module.css";

type ChangeStage = "request" | "pending" | "confirmed";

export default function ChangeEmailPreviewPage() {
  const [stage, setStage] = useState<ChangeStage>("request");
  const [currentEmail, setCurrentEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  function requestChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCurrentPassword("");
    setStage("pending");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/cliente" className={styles.back}><ArrowLeft size={15} /> Área do Cliente</Link>
        <span className={styles.tag}><ShieldCheck size={14} /> SEGURANÇA DA CONTA · PRÉVIA</span>
      </header>
      <section className={styles.content}>
        <span className={styles.eyebrow}>PORTAL DO CLIENTE · TROCA DE E-MAIL</span>
        <h1>Atualize seu<br /><em>endereço de acesso.</em></h1>
        <p className={styles.intro}>O e-mail atual continua associado à conta até que o novo endereço seja confirmado. A senha atual será solicitada para iniciar a mudança.</p>
        <div className={styles.notice} role="note"><CircleAlert size={18} /><p><strong>Prévia sem backend.</strong> Use dados fictícios. Nada será enviado, validado ou salvo; a confirmação abaixo é apenas simulada.</p></div>

        {stage === "request" ? (
          <form className={styles.card} onSubmit={requestChange}>
            <span className={styles.cardIcon}><Mail size={19} /></span>
            <h2>Solicitar mudança</h2>
            <label htmlFor="current-email">E-mail atual de demonstração</label>
            <input id="current-email" type="email" autoComplete="off" required placeholder="atual@exemplo.com" value={currentEmail} onChange={event => setCurrentEmail(event.target.value)} />
            <label htmlFor="new-email">Novo e-mail</label>
            <input id="new-email" type="email" autoComplete="off" required placeholder="novo@exemplo.com" value={newEmail} onChange={event => setNewEmail(event.target.value)} />
            <label htmlFor="current-password">Senha atual fictícia</label>
            <input id="current-password" type="password" autoComplete="new-password" required placeholder="Não use sua senha verdadeira" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
            <small>A versão real enviará confirmação ao novo endereço e um aviso ao endereço atual.</small>
            <button type="submit">Pré-visualizar solicitação <ArrowRight size={15} /></button>
          </form>
        ) : (
          <section className={styles.card} aria-live="polite">
            <span className={styles.cardIcon}>{stage === "confirmed" ? <Check size={19} /> : <Mail size={19} />}</span>
            <span className={styles.eyebrow}>{stage === "confirmed" ? "CONFIRMAÇÃO SIMULADA" : "AGUARDANDO CONFIRMAÇÃO"}</span>
            <h2>{stage === "confirmed" ? "Novo endereço confirmado" : "Verifique o novo endereço"}</h2>
            {stage === "pending" ? (
              <>
                <p>Um link de confirmação seria enviado para <strong>{newEmail}</strong>. Até confirmar, o e-mail atual <strong>{currentEmail}</strong> continua sendo o endereço da conta.</p>
                <div className={styles.noticeInline}><strong>Aviso ao endereço atual</strong><span>Prévia: foi solicitada uma alteração do e-mail da conta. Se você não reconhece o pedido, entre em contato com a equipe.</span><small>NÃO ENVIADO</small></div>
                <div className={styles.noticeInline}><strong>Confirmação para o novo endereço</strong><span>Prévia: confirme que você controla este endereço para concluir a mudança.</span><small>LINK NÃO GERADO</small></div>
                <button type="button" onClick={() => setStage("confirmed")}>Simular confirmação do novo e-mail <Check size={15} /></button>
                <p className={styles.pendingNote}>Prazo do link, reenvio e tratamento de sessões ainda precisam ser definidos. A confirmação não é real.</p>
              </>
            ) : (
              <>
                <p>Na simulação, o endereço da conta mudaria de <strong>{currentEmail}</strong> para <strong>{newEmail}</strong> após a confirmação.</p>
                <div className={styles.noticeInline}><strong>Etapa concluída apenas na prévia</strong><span>Nenhuma conta foi alterada e nenhum aviso foi enviado.</span></div>
              </>
            )}
            <button className={styles.secondary} type="button" onClick={() => setStage("request")}><ArrowLeft size={14} /> Voltar</button>
          </section>
        )}
        <footer className={styles.footer}><span>Sem confirmação de identidade, envio de e-mail ou alteração de conta.</span><Link href="/cliente">Voltar ao portal</Link></footer>
      </section>
    </main>
  );
}
