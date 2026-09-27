"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleHelp, FileText, Headphones, ShieldCheck, TriangleAlert } from "lucide-react";
import styles from "./ClientRequests.module.css";

type PreviewRequest = {
  id: number;
  category: string;
  subject: string;
  details: string;
  stage: number;
};

const categories = [
  "Acesso ao portal",
  "Contratos ou documentos",
  "Atendimento sobre serviço",
  "Outro assunto",
];

const demoStages = [
  "Recebida na prévia",
  "Em análise · simulação",
  "Concluída · simulação",
];

export default function ClientRequestsPreview() {
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [requests, setRequests] = useState<PreviewRequest[]>([]);
  const [nextId, setNextId] = useState(1);
  const [feedback, setFeedback] = useState("");

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request: PreviewRequest = { id: nextId, category, subject: subject.trim(), details: details.trim(), stage: 0 };
    setRequests(current => [request, ...current]);
    setNextId(current => current + 1);
    setFeedback(`Solicitação DEMO-${String(nextId).padStart(3, "0")} adicionada ao histórico desta sessão. Nada foi enviado.`);
    setCategory("");
    setSubject("");
    setDetails("");
  }

  function advanceRequest(id: number) {
    setRequests(current => current.map(request => request.id === id
      ? { ...request, stage: Math.min(request.stage + 1, demoStages.length - 1) }
      : request));
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
          <div><span className={styles.eyebrow}>ATENDIMENTO</span><h1>Solicitações e<br /><em>chamados.</em></h1><p>Prévia da abertura e do acompanhamento de solicitações no portal. Este formulário não contata a equipe.</p></div>
          <div className={styles.sideNote}><span><Headphones size={18} /></span><strong>Acompanhamento demonstrativo</strong><p>Os estados abaixo são exemplos de interface, não etapas operacionais aprovadas nem atualizações de atendimento.</p></div>
        </div>

        <div className={styles.warning} role="note"><TriangleAlert size={17} /><p><strong>Use apenas conteúdo fictício.</strong> Os dados permanecem somente na memória desta página e se perdem ao sair ou recarregar. Não informe nomes, e-mails, telefones, números de contrato, dados pessoais ou informações operacionais reais.</p></div>

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
          {feedback && <p className={styles.feedback} role="status" aria-live="polite"><Check size={14} /> {feedback}</p>}
        </form>

        <section className={styles.history} aria-labelledby="history-title">
          <div className={styles.historyHeading}><div><span className={styles.eyebrow}>ACOMPANHAMENTO LOCAL</span><h2 id="history-title">Histórico desta sessão</h2></div><span className={styles.count}>{requests.length} {requests.length === 1 ? "simulação" : "simulações"}</span></div>
          <p className={styles.historyNote}>Os protocolos DEMO e as mudanças de etapa são temporários e fictícios. Avançar uma etapa não significa que uma equipe recebeu ou concluiu um chamado.</p>
          {requests.length === 0 ? (
            <div className={styles.historyEmpty}><FileText size={18} /><span>As solicitações simuladas aparecerão aqui enquanto esta página permanecer aberta.</span></div>
          ) : (
            <ul className={styles.requestList}>
              {requests.map(request => (
                <li className={styles.requestCard} key={request.id}>
                  <div className={styles.requestTop}><span className={styles.protocol}>DEMO-{String(request.id).padStart(3, "0")} · FICTÍCIO</span><span className={styles.stageBadge}>{demoStages[request.stage]}</span></div>
                  <div className={styles.requestInfo}><span>{request.category}</span><h3>{request.subject}</h3><p>{request.details}</p></div>
                  <div className={styles.requestFooter}><span>Estado ilustrativo {request.stage + 1} de {demoStages.length}</span>{request.stage < demoStages.length - 1 && <button type="button" onClick={() => advanceRequest(request.id)}>Avançar etapa demonstrativa <ArrowRight size={13} /></button>}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={styles.privacy}><ShieldCheck size={15} /><p>Na implementação real, o acesso às solicitações será validado no servidor pelo vínculo e escopo do cliente. Esta prévia não autentica usuários, não guarda histórico e não envia e-mail.</p></div>
        <footer className={styles.footer}><Link href="/cliente/painel"><ArrowLeft size={13} /> Voltar ao painel</Link><Link href="/cliente">Sobre o acesso ao portal <ArrowRight size={13} /></Link></footer>
      </section>
    </main>
  );
}
