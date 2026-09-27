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
  const [resendCount, setResendCount] = useState(0);
  const [reportedUnexpected, setReportedUnexpected] = useState(false);

  function requestChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCurrentPassword("");
    setResendCount(0);
    setReportedUnexpected(false);
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
            <span className={styles.eyebrow}>{stage === "confirmed" ? "CONFIRMAÇÃO SIMULADA" : reportedUnexpected ? "PEDIDO SINALIZADO · PRÉVIA" : "AGUARDANDO CONFIRMAÇÃO"}</span>
            <h2>{stage === "confirmed" ? "Novo endereço confirmado" : reportedUnexpected ? "Troca cancelada na prévia" : "Verifique o novo endereço"}</h2>
            {stage === "pending" ? (
              <>
                <p>Um link de confirmação seria enviado para <strong>{newEmail}</strong>. Até confirmar, o e-mail atual <strong>{currentEmail}</strong> continua sendo o endereço da conta.</p>
                <div className={styles.noticeInline}>
                  <strong>Aviso para o e-mail atual · rascunho</strong>
                  <span><b>Assunto:</b> Solicitação de alteração do e-mail da Área do Cliente</span>
                  <span>Foi solicitada a alteração do e-mail de acesso da sua conta para <strong>{newEmail}</strong>. Seu endereço atual continuará ativo até a confirmação do novo. Se você não fez este pedido, use o botão abaixo para cancelar a troca e avisar a equipe. Este aviso não contém link de confirmação.</span>
                  <small>RASCUNHO · NÃO ENVIADO</small>
                  <button className={styles.reportButton} type="button" disabled={reportedUnexpected} onClick={() => setReportedUnexpected(true)}>{reportedUnexpected ? "Pedido sinalizado nesta prévia" : "Simular “Não fui eu”"}</button>
                </div>
                <div className={styles.noticeInline}>
                  <strong>Confirmação para o novo e-mail · rascunho</strong>
                  <span><b>Assunto:</b> Confirme o novo e-mail da Área do Cliente</span>
                  <span>{reportedUnexpected ? "A troca foi cancelada na simulação. O link enviado a este endereço seria invalidado e não poderia concluir a alteração." : "Se você solicitou esta mudança, confirme que controla este endereço pelo link de uso único, válido por 1 hora. Se pedir um novo link, o anterior será invalidado. O e-mail atual continua sendo seu login até a confirmação."}</span>
                  <small>{reportedUnexpected ? "CANCELADO NA PRÉVIA · LINK INVÁLIDO" : "RASCUNHO · LINK NÃO GERADO"}</small>
                </div>
                <button type="button" disabled={reportedUnexpected} onClick={() => setStage("confirmed")}>{reportedUnexpected ? "Confirmação bloqueada após sinalização" : "Simular confirmação do novo e-mail"} {!reportedUnexpected && <Check size={15} />}</button>
                {reportedUnexpected ? (
                  <p className={styles.pendingNote}>A solicitação seria cancelada, o link invalidado e Marcelo/TI notificados para análise. Nenhuma ação real foi executada.</p>
                ) : (
                  <>
                    <p className={styles.pendingNote}>Link válido por 1 hora. Até 5 reenvios por endereço em 24 horas, com intervalo mínimo de 2 minutos; cada novo link invalida o anterior. Simulações de reenvio: {resendCount}/5. Nenhuma mensagem foi enviada.</p>
                    <button className={styles.resend} type="button" disabled={resendCount >= 5} onClick={() => setResendCount(count => Math.min(5, count + 1))}>{resendCount >= 5 ? "Limite demonstrativo atingido" : "Simular reenvio do link"}</button>
                  </>
                )}
              </>
            ) : (
              <>
                <p>Na simulação, o endereço da conta mudaria de <strong>{currentEmail}</strong> para <strong>{newEmail}</strong> após a confirmação.</p>
                <div className={styles.noticeInline}><strong>Sessões existentes</strong><span>Na regra planejada, todas as sessões ativas serão encerradas; será necessário entrar novamente com o novo e-mail.</span></div>
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
