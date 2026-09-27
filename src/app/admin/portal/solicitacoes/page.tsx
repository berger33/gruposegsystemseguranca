"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Clock3, FileSearch, ShieldCheck } from "lucide-react";
import styles from "./AccessRequests.module.css";

type RequestStatus = "pending" | "reviewing" | "approved" | "declined";
type QueueFilter = RequestStatus | "all";
type ApproverRole = "marcelo" | "ti";
type ClientScope = "contracts" | "invoices" | "tickets";
type AccessAuditEvent = {
  id: number;
  previousStatus: RequestStatus | null;
  nextStatus: RequestStatus;
  actor: string;
  scopes: string[];
  centralRecordChecked: boolean;
  localTime: string;
};
type DemoAccessRequest = {
  id: number;
  email: string;
  status: RequestStatus;
  approver: ApproverRole;
  centralRecordChecked: boolean;
  scope: ClientScope[];
  auditEvents: AccessAuditEvent[];
};

const statusOptions: Array<{ id: RequestStatus; label: string }> = [
  { id: "pending", label: "Recebida" },
  { id: "reviewing", label: "Em análise" },
  { id: "approved", label: "Aprovada" },
  { id: "declined", label: "Recusada" },
];

const scopeOptions: Array<{ id: ClientScope; label: string }> = [
  { id: "contracts", label: "Contratos autorizados" },
  { id: "invoices", label: "Faturas autorizadas" },
  { id: "tickets", label: "Chamados do cliente" },
];

export default function AccessRequestsPreviewPage() {
  const [requests, setRequests] = useState<DemoAccessRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [nextRequestId, setNextRequestId] = useState(1);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [requestEmail, setRequestEmail] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const selectedRequest = requests.find(request => request.id === selectedRequestId) ?? null;
  const requestCreated = Boolean(selectedRequest);
  const status = selectedRequest?.status ?? "pending";
  const approver = selectedRequest?.approver ?? "marcelo";
  const centralRecordChecked = selectedRequest?.centralRecordChecked ?? false;
  const scope = selectedRequest?.scope ?? [];
  const auditEvents = selectedRequest?.auditEvents ?? [];
  const visibleRequests = queueFilter === "all" ? requests : requests.filter(request => request.status === queueFilter);

  function updateSelectedRequest(update: (request: DemoAccessRequest) => DemoAccessRequest) {
    if (selectedRequestId === null) return;
    setRequests(current => current.map(request => request.id === selectedRequestId ? update(request) : request));
  }

  function createDemoRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = nextRequestId;
    const created: DemoAccessRequest = {
      id,
      email: requestEmail.trim(),
      status: "pending",
      approver: "marcelo",
      centralRecordChecked: false,
      scope: [],
      auditEvents: [{
        id: 1,
        previousStatus: null,
        nextStatus: "pending",
        actor: "Solicitante fictício",
        scopes: [],
        centralRecordChecked: false,
        localTime: new Date().toLocaleString("pt-BR"),
      }],
    };
    setRequests(current => [created, ...current]);
    setQueueFilter("all");
    setSelectedRequestId(id);
    setNextRequestId(current => current + 1);
    setRequestEmail("");
    setValidationMessage("");
  }

  function resetDemoRequest() {
    setRequests([]);
    setSelectedRequestId(null);
    setNextRequestId(1);
    setQueueFilter("all");
    setRequestEmail("");
    setValidationMessage("");
  }

  function updateStatus(nextStatus: RequestStatus) {
    if (!selectedRequest) {
      setValidationMessage("Selecione ou crie uma solicitação demonstrativa; nenhum pedido real está conectado a esta prévia.");
      return;
    }
    if (nextStatus === "approved" && (!centralRecordChecked || scope.length === 0)) {
      setValidationMessage("Para pré-visualizar uma aprovação, marque a consulta ao cadastro central e selecione pelo menos um item de escopo. Isso não concede acesso real.");
      return;
    }
    setValidationMessage("");
    if (nextStatus === selectedRequest.status) return;
    const previousStatus = selectedRequest.status;
    const auditEvent: AccessAuditEvent = {
      id: selectedRequest.auditEvents.length + 1,
      previousStatus,
      nextStatus,
      actor: approver === "marcelo" ? "Marcelo · simulado" : "TI / sistema · simulado",
      scopes: scopeOptions.filter(item => scope.includes(item.id)).map(item => item.label),
      centralRecordChecked,
      localTime: new Date().toLocaleString("pt-BR"),
    };
    updateSelectedRequest(request => ({ ...request, status: nextStatus, auditEvents: [...request.auditEvents, auditEvent] }));
    setQueueFilter("all");
  }

  function setQueueStatusFilter(filter: QueueFilter) {
    setQueueFilter(filter);
    if (filter !== "all" && selectedRequest && selectedRequest.status !== filter) setSelectedRequestId(null);
    setValidationMessage("");
  }

  function setApprover(nextApprover: ApproverRole) {
    updateSelectedRequest(request => ({ ...request, approver: nextApprover }));
  }

  function setCentralRecordChecked(checked: boolean) {
    updateSelectedRequest(request => ({ ...request, centralRecordChecked: checked }));
    setValidationMessage("");
  }

  function toggleScope(item: ClientScope) {
    if (!selectedRequest) return;
    updateSelectedRequest(request => ({
      ...request,
      scope: request.scope.includes(item) ? request.scope.filter(value => value !== item) : [...request.scope, item],
    }));
    setValidationMessage("");
  }

  function selectRequest(id: number) {
    setSelectedRequestId(id);
    setValidationMessage("");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/portal" className={styles.back}><ArrowLeft size={15} /> Configuração do portal</Link>
        <span className={styles.headerLabel}><FileSearch size={14} /> SOLICITAÇÕES DE ACESSO</span>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>PORTAL DO CLIENTE · FLUXO COM APROVAÇÃO</span><h1>Revisão por uma<br /><em>pessoa da equipe.</em></h1><p>Prévia de como uma solicitação poderia ser analisada antes de habilitar o acesso.</p></div>
          <Link className={styles.clientLink} href="/cliente">Ver página do cliente <ArrowRight size={14} /></Link>
        </div>

        <div className={styles.notice} role="note"><CircleAlert size={18} /><p><strong>Fluxo alternativo · demonstração local.</strong> O único campo definido é o e-mail que consta no cadastro central. Use exclusivamente um endereço fictício terminado em <code>.invalid</code>; nenhum pedido é enviado, verificado ou salvo.</p></div>

        <section className={styles.requesterSection} aria-labelledby="requester-title">
          <div><span className={styles.sectionLabel}>01 · VISÃO DO SOLICITANTE</span><h2 id="requester-title">Solicitar acesso ao portal</h2><p>Alternativa ao convite, sujeita à habilitação. Solicita somente o e-mail cadastrado para a equipe verificar o vínculo no cadastro central; não libera acesso automaticamente.</p></div>
          <div className={styles.requesterActions}>
            <form className={styles.requestForm} onSubmit={createDemoRequest}>
              <label htmlFor="access-request-email">E-mail do cadastro central · fictício</label>
              <input id="access-request-email" type="email" required maxLength={254} pattern="[^@\s]+@[^@\s]+\.invalid" title="Use somente um endereço fictício terminado em .invalid" placeholder="cliente-demo@example.invalid" value={requestEmail} onChange={event => setRequestEmail(event.target.value)} />
              <small>É o único dado solicitado nesta etapa. Não use e-mail real; o domínio .invalid é reservado para exemplos.</small>
              <button className={styles.createRequest} type="submit">Simular novo pedido fictício <ArrowRight size={15} /></button>
            </form>
            {requests.length > 0 && <button className={styles.clearRequests} type="button" onClick={resetDemoRequest}>Limpar pedidos desta sessão</button>}
          </div>
        </section>

        <section className={styles.queue} aria-labelledby="queue-title">
          <div className={styles.queueHeader}>
            <div><span className={styles.sectionLabel}>FILA DE REVISÃO</span><h2 id="queue-title">Solicitações recebidas</h2></div>
            <span className={styles.unavailable}><Clock3 size={14} /> {requests.length ? `${requests.length} PEDIDO${requests.length === 1 ? "" : "S"} FICTÍCIO${requests.length === 1 ? "" : "S"}` : "SEM CONEXÃO"}</span>
          </div>
          {requests.length > 0 && (
            <div className={styles.queueFilters} role="group" aria-label="Filtrar solicitações por status">
              <button type="button" className={queueFilter === "all" ? styles.queueFilterActive : ""} aria-pressed={queueFilter === "all"} onClick={() => setQueueStatusFilter("all")}>Todas <span>{requests.length}</span></button>
              {statusOptions.map(item => {
                const count = requests.filter(request => request.status === item.id).length;
                return <button key={item.id} type="button" className={queueFilter === item.id ? styles.queueFilterActive : ""} aria-pressed={queueFilter === item.id} onClick={() => setQueueStatusFilter(item.id)}>{item.label} <span>{count}</span></button>;
              })}
            </div>
          )}
          {requests.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><FileSearch size={22} /></span>
              <strong>Nenhum registro é exibido nesta prévia</strong>
              <p>Use o formulário acima para criar pedidos locais e explorar a revisão.</p>
            </div>
          ) : visibleRequests.length === 0 ? (
            <div className={styles.filterEmpty}>Nenhuma solicitação com este status nesta demonstração.</div>
          ) : (
            <div className={styles.demoRequestList}>
              {visibleRequests.map(request => (
                <article className={`${styles.demoRequest} ${selectedRequestId === request.id ? styles.demoRequestSelected : ""}`} key={request.id}>
                  <div><strong>Pedido DEMO-{String(request.id).padStart(3, "0")} · solicitante fictício</strong><span>E-mail de teste: {request.email}</span></div>
                  <span className={styles.demoRequestStatus}>{statusOptions.find(item => item.id === request.status)?.label}</span>
                  <p>Vínculo ainda não verificado nesta simulação.</p>
                  <button type="button" aria-pressed={selectedRequestId === request.id} onClick={() => selectRequest(request.id)}>{selectedRequestId === request.id ? "Selecionado para revisão" : "Selecionar para revisão"}</button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className={styles.flowSection}>
          <div className={styles.flowIntro}><span className={styles.sectionLabel}>FLUXO PROPOSTO</span><h2>Da solicitação à decisão</h2><p>O vínculo do cliente e o escopo de acesso devem ser verificados antes de qualquer liberação.</p></div>
          <div className={styles.flowSteps}>
            <article><span>01</span><strong>Receber pedido</strong><small>O cliente manifesta interesse em acessar o portal.</small></article>
            <ArrowRight className={styles.connector} size={16} />
            <article><span>02</span><strong>Verificar vínculo</strong><small>A equipe confirma a relação e o escopo permitido.</small></article>
            <ArrowRight className={styles.connector} size={16} />
            <article><span>03</span><strong>Registrar decisão</strong><small>A aprovação não concede acesso além do autorizado.</small></article>
          </div>
        </section>

        <section className={styles.decisionSection} aria-labelledby="decision-title">
          <div className={styles.decisionIntro}><span className={styles.sectionLabel}>02 · VISÃO DA EQUIPE · PRÉVIA INTERATIVA</span><h2 id="decision-title">Revisar {selectedRequest ? `DEMO-${String(selectedRequest.id).padStart(3, "0")}` : "a solicitação demonstrativa"}</h2><p>Selecione um pedido fictício na fila para revisar responsável, verificação, escopo e decisão. Nada concede acesso real.</p></div>

          <div className={styles.simulatorGrid}>
            <div className={styles.simulatorBlock}>
              <strong className={styles.controlLabel}>Responsável pela decisão</strong>
              <div className={styles.roleChoices} role="group" aria-label="Responsável demonstrativo">
                <button type="button" disabled={!requestCreated} className={approver === "marcelo" ? styles.roleSelected : ""} aria-pressed={approver === "marcelo"} onClick={() => setApprover("marcelo")}>Marcelo</button>
                <button type="button" disabled={!requestCreated} className={approver === "ti" ? styles.roleSelected : ""} aria-pressed={approver === "ti"} onClick={() => setApprover("ti")}>TI / sistema</button>
              </div>
              <label className={styles.verifyToggle}>
                <input type="checkbox" disabled={!requestCreated} checked={centralRecordChecked} onChange={event => setCentralRecordChecked(event.target.checked)} />
                <span><strong>Simular consulta ao cadastro central</strong><small>Marque apenas para demonstrar a etapa de verificação; nenhum cadastro é consultado.</small></span>
              </label>
              <strong className={styles.controlLabel}>Escopo a demonstrar</strong>
              <div className={styles.scopeChoices}>
                {scopeOptions.map(item => (
                  <label key={item.id}>
                    <input type="checkbox" disabled={!requestCreated} checked={scope.includes(item.id)} onChange={() => toggleScope(item.id)} />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.simulatorBlock}>
              <strong className={styles.controlLabel}>Estado demonstrativo</strong>
              <div className={styles.statusChoices} role="group" aria-label="Estado da solicitação">
                {statusOptions.map(item => (
                  <button key={item.id} type="button" disabled={!requestCreated} className={status === item.id ? styles.statusSelected : ""} aria-pressed={status === item.id} onClick={() => updateStatus(item.id)}>{item.label}</button>
                ))}
              </div>
              <div className={`${styles.outcome} ${status === "approved" ? styles.outcomeApproved : status === "declined" ? styles.outcomeDeclined : ""}`} role="status" aria-live="polite">
                {status === "approved" ? <CircleCheck size={19} /> : status === "declined" ? <CircleAlert size={19} /> : <Clock3 size={19} />}
                <div><strong>{statusOptions.find(item => item.id === status)?.label} · responsável: {approver === "marcelo" ? "Marcelo" : "TI / sistema"}</strong><p>{status === "approved" ? `Escopo demonstrativo: ${scopeOptions.filter(item => scope.includes(item.id)).map(item => item.label.toLowerCase()).join(", ")}. Em produção, a decisão exigirá verificação do cadastro central e autorização no servidor.` : status === "declined" ? "Prévia de recusa. Motivo, comunicação e possibilidade de nova solicitação ainda precisam de política definida." : status === "reviewing" ? "A solicitação está em análise; nenhuma permissão é concedida enquanto a verificação e a decisão não forem concluídas." : "Pedido recebido e aguardando análise. Esta mudança é somente demonstrativa."}</p></div>
              </div>
              {validationMessage && <p className={styles.validationMessage} role="alert">{validationMessage}</p>}
            </div>
          </div>
          {requestCreated && (
            <div className={styles.requesterOutcome} role="status" aria-live="polite">
              <span className={styles.sectionLabel}>VISÃO DO SOLICITANTE · RESPOSTA DEMONSTRATIVA</span>
              <strong>{status === "pending" ? "Pedido recebido" : status === "reviewing" ? "Pedido em análise" : status === "approved" ? "Pedido aprovado na simulação" : "Não foi possível aprovar o pedido neste momento"} · DEMO-{String(selectedRequest?.id ?? 0).padStart(3, "0")}</strong>
              <p>{status === "declined" ? "Mensagem genérica, sem detalhes internos. Nenhum e-mail foi enviado." : status === "approved" ? "A aprovação simulada não cria conta, não substitui a verificação do vínculo e não libera contratos ou documentos." : "Nenhum acesso é concedido antes de verificar o vínculo e concluir a decisão no servidor."}</p>
            </div>
          )}
          {requestCreated && (
            <section className={styles.auditSection} aria-labelledby="request-audit-title">
              <div className={styles.auditHeading}><div><span className={styles.sectionLabel}>TRILHA LOCAL · NÃO PERSISTIDA</span><h3 id="request-audit-title">Histórico da solicitação</h3></div><span>{auditEvents.length} {auditEvents.length === 1 ? "evento" : "eventos"}</span></div>
              <p className={styles.auditNote}>Pedido DEMO-{String(selectedRequest?.id ?? 0).padStart(3, "0")} · Registro demonstrativo em memória. O sistema real deverá gravar no servidor o estado, responsável, escopo e data/hora segundo a política aprovada.</p>
              <ol className={styles.auditList}>
                {auditEvents.map(event => (
                  <li key={event.id}>
                    <div className={styles.auditEventTop}><strong>{event.previousStatus ? `${statusOptions.find(item => item.id === event.previousStatus)?.label} → ${statusOptions.find(item => item.id === event.nextStatus)?.label}` : "Pedido recebido"}</strong><time>Horário local: {event.localTime}</time></div>
                    <p>Responsável: {event.actor} · Consulta ao cadastro central: {event.centralRecordChecked ? "simulada" : "não realizada"}</p>
                    <p>Escopo: {event.scopes.length ? event.scopes.join(", ") : "nenhum selecionado"}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </section>

        <section className={styles.notificationSection} aria-labelledby="notification-title">
          <div className={styles.decisionIntro}><span className={styles.sectionLabel}>MENSAGENS AO SOLICITANTE · PRÉVIA</span><h2 id="notification-title">Aviso por e-mail</h2><p>Canal escolhido para o fluxo. Revise os rascunhos; esta tela não envia mensagens.</p></div>
          <div className={styles.messagePreview} aria-live="polite">
            <div className={styles.messageHeader}><span className={styles.mailBadge}>E-MAIL</span><span className={styles.messageBadge}>RASCUNHO · NÃO ENVIADO</span></div>
            <strong>Assunto: {status === "declined" ? "Atualização sobre sua solicitação de acesso" : status === "approved" ? "Solicitação de acesso ao portal aprovada" : status === "reviewing" ? "Sua solicitação de acesso está em análise" : "Recebemos sua solicitação de acesso"}</strong>
            <div className={styles.messageBody}>
              {status === "declined" ? (
                <><p>Olá,</p><p>Não foi possível aprovar sua solicitação de acesso à Área do Cliente neste momento.</p><p>Para esclarecer dúvidas ou receber orientação, entre em contato com a equipe pelos canais oficiais da Grupo SEG System.</p><p>Atenciosamente,<br />Grupo SEG System</p></>
              ) : status === "approved" ? (
                <><p>Olá,</p><p>Sua solicitação de acesso à Área do Cliente foi aprovada após análise da equipe.</p><p>Esta mensagem não envia um convite nem libera contratos ou documentos. O acesso dependerá da verificação do vínculo e das permissões autorizadas.</p><p>Atenciosamente,<br />Grupo SEG System</p></>
              ) : status === "reviewing" ? (
                <><p>Olá,</p><p>Sua solicitação de acesso à Área do Cliente está em análise.</p><p>Nenhum acesso é liberado enquanto as verificações necessárias não forem concluídas.</p><p>Atenciosamente,<br />Grupo SEG System</p></>
              ) : (
                <><p>Olá,</p><p>Recebemos sua solicitação de acesso à Área do Cliente. Ela ainda aguarda análise.</p><p>Este aviso não confirma vínculo nem libera acesso.</p><p>Atenciosamente,<br />Grupo SEG System</p></>
              )}
            </div>
            <small className={styles.messageFootnote}>Conteúdo provisório para revisão. A aprovação não envia automaticamente um convite e a recusa usa texto genérico, sem expor detalhes internos.</small>
          </div>
        </section>

        <div className={styles.securityNote}><ShieldCheck size={18} /><p>A aprovação deve ser auditável. Contratos e documentos continuam sujeitos a autorização por cliente no servidor — uma solicitação ou cadastro não libera acesso automaticamente.</p></div>
        <footer className={styles.footer}><span>Protótipo sem dados, persistência, notificações ou decisões reais.</span><Link href="/admin/portal">Voltar aos modos de acesso <ArrowLeft size={13} /></Link></footer>
      </section>
    </main>
  );
}
