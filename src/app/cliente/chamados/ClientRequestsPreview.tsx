"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleHelp, FileText, Headphones, ShieldCheck, TriangleAlert } from "lucide-react";
import styles from "./ClientRequests.module.css";

const categories = [
  "Acesso ao portal",
  "Contratos ou documentos",
  "Atendimento sobre serviço",
  "Outro assunto",
];

export default function ClientRequestsPreview() {
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  function resetForm() {
    setCategory("");
    setSubject("");
    setDetails("");
    setSubmitted(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/cliente/painel" aria-label="Voltar ao painel do cliente">
          <span className={styles.brandMark}><ShieldCheck size={20} /></span>
          <span><strong>GRUPO SEG SYSTEM</strong><small>ÁREA DO CLIENTE · PRÉVIA</small></span>
        </Link>
        <Link className={styles.back} href="/cliente/painel"><ArrowLeft size={14} /> Painel do cliente</Link>
      </header>

      <section className={styles.content}>
        <div className={styles.previewTag}><span /> FLUXO DEMONSTRATIVO · SEM ENVIO</div>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>ATENDIMENTO</span><h1>Solicitações e<br /><em>chamados.</em></h1><p>Prévia da abertura de uma solicitação no portal. Este formulário não contata a equipe.</p></div>
          <div className={styles.sideNote}><span><Headphones size={18} /></span><strong>Atendimento acompanhado</strong><p>O portal real deverá mostrar atualizações somente para pessoas autorizadas no vínculo do cliente.</p></div>
        </div>

        <div className={styles.warning} role="note"><TriangleAlert size={17} /><p><strong>Use apenas conteúdo fictício.</strong> O formulário não é enviado nem salvo. Não informe nomes, e-mails, telefones, números de contrato, dados pessoais ou informações operacionais reais.</p></div>

        {!submitted ? (
          <form className={styles.form} onSubmit={submitRequest}>
            <div className={styles.formHeading}><span className={styles.formIcon}><CircleHelp size={18} /></span><div><span className={styles.eyebrow}>NOVA SOLICITAÇÃO · EXEMPLO LOCAL</span><h2>Como podemos ajudar?</h2></div></div>
            <label htmlFor="request-category">Assunto</label>
            <select id="request-category" required value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">Selecione um assunto demonstrativo</option>
              {categories.map(item => <option value={item} key={item}>{item}</option>)}
            </select>
            <label htmlFor="request-subject">Título curto</label>
            <input id="request-subject" required maxLength={100} value={subject} onChange={event => setSubject(event.target.value)} placeholder="Ex.: dúvida demonstrativa sobre um documento" />
            <div className={styles.labelRow}><label htmlFor="request-details">Descrição</label><span>{details.length}/500</span></div>
            <textarea id="request-details" required maxLength={500} minLength={5} value={details} onChange={event => setDetails(event.target.value)} placeholder="Descreva uma situação fictícia, sem dados reais." />
            <div className={styles.formFooter}><small><FileText size={13} /> Anexos não estão disponíveis nesta prévia.</small><button type="submit">Simular solicitação <ArrowRight size={15} /></button></div>
          </form>
        ) : (
          <section className={styles.result} role="status" aria-live="polite">
            <span className={styles.resultIcon}><Check size={20} /></span>
            <div className={styles.resultContent}>
              <span className={styles.eyebrow}>SIMULAÇÃO CONCLUÍDA · NÃO ENVIADA</span>
              <h2>Solicitação demonstrativa criada nesta tela.</h2>
              <p>Este exemplo existe apenas enquanto esta página está aberta. Não foi encaminhado à equipe e não há número real de chamado.</p>
              <dl><div><dt>Assunto</dt><dd>{category}</dd></div><div><dt>Título</dt><dd>{subject}</dd></div><div><dt>Descrição fictícia</dt><dd>{details}</dd></div><div><dt>Estado demonstrativo</dt><dd>Recebida na prévia · sem atendimento real</dd></div></dl>
              <button type="button" onClick={resetForm}>Criar outra simulação</button>
            </div>
          </section>
        )}

        <div className={styles.privacy}><ShieldCheck size={15} /><p>Na implementação real, o acesso às solicitações será validado no servidor pelo vínculo e escopo do cliente. Esta prévia não autentica usuários, não guarda histórico e não envia e-mail.</p></div>
        <footer className={styles.footer}><Link href="/cliente/painel"><ArrowLeft size={13} /> Voltar ao painel</Link><Link href="/cliente">Sobre o acesso ao portal <ArrowRight size={13} /></Link></footer>
      </section>
    </main>
  );
}
