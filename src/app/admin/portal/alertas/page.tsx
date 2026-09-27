"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Check, CircleAlert, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import styles from "./SecurityAlerts.module.css";

export default function SecurityAlertsPreviewPage() {
  const [showExample, setShowExample] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  function resetPreview() {
    setShowExample(false);
    setReviewed(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/portal" className={styles.back}><ArrowLeft size={15} /> Configuração do portal</Link>
        <span className={styles.tag}><ShieldCheck size={14} /> ALERTAS DE SEGURANÇA</span>
      </header>
      <section className={styles.content}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>PORTAL DO CLIENTE · PRÉVIA ADMINISTRATIVA</span><h1>Eventos para<br /><em>revisão da equipe.</em></h1><p>Sinalizações de risco ficam no painel e também avisam Marcelo/TI por e-mail.</p></div>
          {showExample && <button className={styles.reset} type="button" onClick={resetPreview}>Limpar demonstração</button>}
        </div>
        <div className={styles.notice} role="note"><TriangleAlert size={18} /><p><strong>Painel demonstrativo:</strong> não há eventos reais. A demonstração de exemplo é fictícia, não envia e-mail e não registra auditoria.</p></div>

        <section className={styles.queue} aria-labelledby="alerts-title">
          <div className={styles.queueHeader}><div><span className={styles.eyebrow}>CAIXA DE ALERTAS</span><h2 id="alerts-title">Trocas de e-mail sinalizadas</h2></div><span className={styles.channelPill}><Bell size={13} /> PAINEL + E-MAIL</span></div>
          {!showExample ? (
            <div className={styles.empty}><span><Bell size={21} /></span><strong>Nenhum alerta para exibir</strong><p>Em produção, o evento será registrado aqui e um aviso por e-mail será enviado aos responsáveis autorizados.</p><button type="button" onClick={() => setShowExample(true)}>Simular um alerta fictício</button></div>
          ) : (
            <article className={`${styles.alertCard} ${reviewed ? styles.reviewed : ""}`}>
              <div className={styles.alertIcon}>{reviewed ? <Check size={18} /> : <CircleAlert size={18} />}</div>
              <div className={styles.alertBody}>
                <div className={styles.alertTop}><strong>Pedido de troca de e-mail sinalizado como não reconhecido</strong><span>{reviewed ? "VISTO NA PRÉVIA" : "PENDENTE"}</span></div>
                <p>Uma pessoa com acesso ao endereço atual sinalizou que não solicitou a alteração. Na regra definida, a solicitação pendente é cancelada e o link enviado ao novo endereço é invalidado.</p>
                <dl><div><dt>Conta</dt><dd>e-mail mascarado · exemplo fictício</dd></div><div><dt>Destinatários</dt><dd>Marcelo e TI</dd></div><div><dt>Canal</dt><dd><Mail size={13} /> Caixa de alertas + aviso por e-mail</dd></div></dl>
                {!reviewed && <button type="button" onClick={() => setReviewed(true)}>Marcar como visto <Check size={14} /></button>}
                <small>Exemplo ilustrativo. Nenhum cliente, endereço, data ou evento real está associado.</small>
              </div>
            </article>
          )}
        </section>
        <div className={styles.securityNote}><ShieldCheck size={17} /><p>O e-mail de alerta deve conter apenas o necessário para identificar o evento. Não incluir senha, token, código de confirmação ou link de acesso; a análise detalhada fica no painel protegido.</p></div>
        <footer className={styles.footer}><span>Sem persistência, envio de e-mail, dados pessoais ou log real.</span><Link href="/admin/portal">Voltar à configuração do portal</Link></footer>
      </section>
    </main>
  );
}
