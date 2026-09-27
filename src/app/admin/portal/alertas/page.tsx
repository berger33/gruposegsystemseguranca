"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Check, CircleAlert, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import styles from "./SecurityAlerts.module.css";

export default function SecurityAlertsPreviewPage() {
  const [showExample, setShowExample] = useState(false);
  const [alertStatus, setAlertStatus] = useState<"pending" | "reviewed" | "resolved">("pending");
  const [holdSubmitted, setHoldSubmitted] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [holdReference, setHoldReference] = useState("");
  const [holdReviewDate, setHoldReviewDate] = useState("");
  const [holdReminderChannel, setHoldReminderChannel] = useState<"panel" | "email" | "both">("panel");
  const [marceloApproved, setMarceloApproved] = useState(false);
  const [tiApproved, setTiApproved] = useState(false);

  function submitHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHoldSubmitted(true);
  }

  function resetPreview() {
    setShowExample(false);
    setAlertStatus("pending");
    setHoldSubmitted(false);
    setHoldReason("");
    setHoldReference("");
    setHoldReviewDate("");
    setHoldReminderChannel("panel");
    setMarceloApproved(false);
    setTiApproved(false);
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
        <section className={styles.holdSection} aria-labelledby="hold-title">
          <div className={styles.holdHeader}><div><span className={styles.eyebrow}>EXCEÇÃO DE RETENÇÃO · PRÉVIA DE PROCESSO</span><h2 id="hold-title">Solicitar extensão temporária</h2></div><span className={styles.channelPill}><ShieldCheck size={13} /> DUPLA APROVAÇÃO</span></div>
          <p className={styles.holdIntro}>Uma obrigação legal ou investigação formal pode exigir prazo diferente. A exceção precisa de motivo, referência do caso, aprovação de Marcelo e TI e data de revisão/fim. Avisos previstos: 30 e 7 dias antes; se aprovada com menos de 30 dias, aviso imediato e lembrete de 7 dias se faltarem mais de 7 dias (com 7 dias ou menos, somente imediato). Sem nova aprovação conjunta até a data, a exceção termina e o descarte normal é aplicado. Use apenas dados fictícios.</p>
          <div className={styles.reminderSettings}>
            <strong>Canal dos avisos de vencimento · configuração demonstrativa</strong>
            <div role="group" aria-label="Canal dos avisos de vencimento">
              <button type="button" aria-pressed={holdReminderChannel === "panel"} className={holdReminderChannel === "panel" ? styles.reminderSelected : ""} onClick={() => setHoldReminderChannel("panel")}>Somente painel</button>
              <button type="button" aria-pressed={holdReminderChannel === "email"} className={holdReminderChannel === "email" ? styles.reminderSelected : ""} onClick={() => setHoldReminderChannel("email")}>Somente e-mail</button>
              <button type="button" aria-pressed={holdReminderChannel === "both"} className={holdReminderChannel === "both" ? styles.reminderSelected : ""} onClick={() => setHoldReminderChannel("both")}>Painel + e-mail</button>
            </div>
            <small>Padrão inicial: somente painel. Na versão real, TI concede ou revoga a permissão individualmente para cada administrador; ela permanece ativa até revogação. Cada concessão ou revogação exigirá motivo e será auditada. O administrador afetado receberá aviso genérico no painel, apenas com a ação e a data, sem link; o motivo fica restrito à auditoria. Sem e-mail; mudanças de canal também serão auditadas. Aqui, a alteração é temporária e não é salva.</small>
          </div>
          {!holdSubmitted ? (
            <form className={styles.holdForm} onSubmit={submitHold}>
              <label htmlFor="hold-reason">Motivo da exceção</label>
              <textarea id="hold-reason" required maxLength={500} value={holdReason} onChange={event => setHoldReason(event.target.value)} placeholder="Justificativa fictícia, sem dados pessoais reais" />
              <div className={styles.holdFields}>
                <div><label htmlFor="hold-reference">Referência do caso</label><input id="hold-reference" required maxLength={80} value={holdReference} onChange={event => setHoldReference(event.target.value)} placeholder="REF-DEMO-001" /></div>
                <div><label htmlFor="hold-review-date">Data de revisão/fim</label><input id="hold-review-date" type="date" required value={holdReviewDate} onChange={event => setHoldReviewDate(event.target.value)} /></div>
              </div>
              <div className={styles.approvals}>
                <strong>Aprovações exigidas conjuntamente</strong>
                <label><input type="checkbox" required checked={marceloApproved} onChange={event => setMarceloApproved(event.target.checked)} /> Simular aprovação de Marcelo</label>
                <label><input type="checkbox" required checked={tiApproved} onChange={event => setTiApproved(event.target.checked)} /> Simular aprovação de TI</label>
              </div>
              <small className={styles.holdWarning}>Na versão real, a aprovação e a trilha de auditoria serão registradas no servidor. Esta prévia não altera prazos nem mantém dados.</small>
              <button type="submit">Pré-visualizar exceção aprovada <Check size={14} /></button>
            </form>
          ) : (
            <div className={styles.holdResult} role="status" aria-live="polite">
              <span className={styles.resultIcon}><Check size={17} /></span>
              <div><strong>Exceção aprovada na demonstração</strong><p><b>Motivo:</b> {holdReason}</p><p><b>Referência:</b> {holdReference} · <b>Revisão/fim:</b> {holdReviewDate}</p><p><b>Aprovadores simulados:</b> Marcelo + TI · <b>Data/hora:</b> registrada pelo servidor na implementação real.</p><p><b>Lembretes:</b> 30 e 7 dias antes; para aprovação com menos de 30 dias, aviso imediato e lembrete de 7 dias se faltarem mais de 7 dias · <b>Canal:</b> {holdReminderChannel === "panel" ? "somente painel" : holdReminderChannel === "email" ? "somente e-mail" : "painel + e-mail"}.</p><small>Sem renovação automática: se não houver nova aprovação conjunta até o prazo, a exceção termina e aplica-se o descarte normal. Esta prévia não salvou, auditou nem prorrogou dados.</small></div>
              <button type="button" className={styles.holdReset} onClick={() => setHoldSubmitted(false)}>Editar demonstração</button>
            </div>
          )}
        </section>
        <div className={styles.securityNote}><ShieldCheck size={17} /><p>O e-mail contém apenas o necessário; a análise completa fica no painel protegido. Qualquer administrador com permissão liberada por TI pode analisar. Marcar como analisado não encerra o alerta: somente a resolução explícita o remove dos pendentes. Alertas identificáveis: 12 meses, depois exclusão e apenas estatísticas anônimas. Logs de auditoria separados: 12 meses, sem senhas, tokens ou códigos; depois, excluir os registros detalhados e manter métricas anônimas apenas se necessárias. Exceções legais ou investigações formais precisam de justificativa e prazo próprio. Exclusão automática ainda não está implementada.</p></div>
        <footer className={styles.footer}><span>Sem persistência, envio de e-mail, dados pessoais ou log real.</span><Link href="/admin/portal">Voltar à configuração do portal</Link></footer>
      </section>
    </main>
  );
}
