"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Check, CircleAlert, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import styles from "./SecurityAlerts.module.css";

export default function SecurityAlertsPreviewPage() {
  const [showExample, setShowExample] = useState(false);
  const [alertStatus, setAlertStatus] = useState<"pending" | "reviewed" | "resolved">("pending");

  function resetPreview() {
    setShowExample(false);
    setAlertStatus("pending");
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
            <article className={`${styles.alertCard} ${alertStatus !== "pending" ? styles.reviewed : ""}`}>
              <div className={styles.alertIcon}>{alertStatus === "resolved" ? <Check size={18} /> : <CircleAlert size={18} />}</div>
              <div className={styles.alertBody}>
                <div className={styles.alertTop}><strong>Pedido de troca de e-mail sinalizado como não reconhecido</strong><span>{alertStatus === "resolved" ? "RESOLVIDO" : alertStatus === "reviewed" ? "EM ANÁLISE" : "PENDENTE"}</span></div>
                <p>Uma pessoa com acesso ao endereço atual sinalizou que não solicitou a alteração. Na regra definida, a solicitação pendente é cancelada e o link enviado ao novo endereço é invalidado. {alertStatus === "reviewed" ? "Um administrador autorizado marcou o alerta como analisado; ele continua pendente até a resolução explícita." : alertStatus === "resolved" ? "Um administrador autorizado registrou a resolução; na versão real, o alerta sai dos pendentes e permanece no histórico." : "O alerta pode ser tratado por qualquer administrador cuja permissão tenha sido liberada por TI."}</p>
                <dl><div><dt>Conta</dt><dd>identificador mascarado · exemplo fictício</dd></div><div><dt>Destinatários</dt><dd>Marcelo e TI</dd></div><div><dt>Canal</dt><dd><Mail size={13} /> Caixa de alertas + aviso por e-mail</dd></div></dl>
                <section className={styles.emailDraft} aria-label="Rascunho demonstrativo do e-mail de alerta">
                  <div><Mail size={14} /><strong>Rascunho de e-mail · não enviado</strong></div>
                  <span><b>Assunto:</b> Segurança do portal — alteração de e-mail sinalizada</span>
                  <p>Uma alteração de e-mail foi sinalizada como não reconhecida. A solicitação foi cancelada e o link de confirmação invalidado.</p>
                  <p>Conta: identificador mascarado. Horário: registrado pelo servidor no evento real.</p>
                  <p>Acesse o painel de segurança pelo endereço habitual para revisar os detalhes. Este aviso não inclui o novo endereço, tokens, códigos nem links de acesso.</p>
                </section>
                {alertStatus === "pending" && <button type="button" onClick={() => setAlertStatus("reviewed")}>Marcar como analisado <Check size={14} /></button>}
                {alertStatus === "reviewed" && <button type="button" onClick={() => setAlertStatus("resolved")}>Registrar resolução <Check size={14} /></button>}
                <small>Exemplo ilustrativo. Nenhum cliente, endereço, data ou evento real está associado.</small>
              </div>
            </article>
          )}
        </section>
        <div className={styles.securityNote}><ShieldCheck size={17} /><p>O e-mail contém apenas o necessário; a análise completa fica no painel protegido. Qualquer administrador com permissão liberada por TI pode analisar. Marcar como analisado não encerra o alerta: somente a resolução explícita o remove dos pendentes. Após 12 meses, excluir o alerta identificável e manter somente estatísticas agregadas anônimas. A exclusão automática ainda não está implementada; retenção dos logs de auditoria é uma política separada.</p></div>
        <footer className={styles.footer}><span>Sem persistência, envio de e-mail, dados pessoais ou log real.</span><Link href="/admin/portal">Voltar à configuração do portal</Link></footer>
      </section>
    </main>
  );
}
