"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Check, Clock3, History, ShieldCheck, UserRoundCog, UserRoundPlus, UserRoundX } from "lucide-react";
import styles from "./ReminderPermissions.module.css";

type PermissionAction = "grant" | "revoke";
type PermissionEvent = {
  id: number;
  targetId: string;
  targetLabel: string;
  action: PermissionAction;
  reason: string;
  createdAt: string;
};
type StatusAuditEvent = {
  id: number;
  targetId: string;
  targetLabel: string;
  previousStatus: AccountStatus;
  requestedStatus: AccountStatus;
  outcome: "concluída" | "falhou";
  failureCategory?: string;
  reasonCategory: string;
  detail: string;
  actorId: string;
  actorName: string;
  createdAt: string;
};
type PanelNotice = {
  id: number;
  message: string;
  createdAt: string;
  expiresAt: string;
};

type AccountStatus = "ativa" | "suspensa" | "desativada";

const demoAdminDirectory: Array<{ id: string; label: string; email: string; status: AccountStatus }> = [
  { id: "id-demo-admin-001", label: "Conta administrativa fictícia 01", email: "admin-demo-01@example.invalid", status: "ativa" },
  { id: "id-demo-admin-002", label: "Conta administrativa fictícia 02", email: "admin-demo-02@example.invalid", status: "suspensa" },
  { id: "id-demo-admin-003", label: "Conta administrativa fictícia 03", email: "admin-demo-03@example.invalid", status: "desativada" },
];

const manualReasonCategories = [
  "Mudança de função/vínculo",
  "Afastamento temporário",
  "Segurança",
  "Correção administrativa",
  "Decisão formal",
  "Reativação autorizada",
];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function statusLabel(status: AccountStatus) {
  return status === "ativa" ? "Ativa" : status === "suspensa" ? "Suspensa" : "Desativada";
}

export default function ReminderPermissionsPage() {
  const [target, setTarget] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<PermissionAction>("grant");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, AccountStatus>>({});
  const [events, setEvents] = useState<PermissionEvent[]>([]);
  const [statusEvents, setStatusEvents] = useState<StatusAuditEvent[]>([]);
  const [notices, setNotices] = useState<PanelNotice[]>([]);
  const [feedback, setFeedback] = useState("");
  const [statusFeedback, setStatusFeedback] = useState("");
  const [requestedStatus, setRequestedStatus] = useState<AccountStatus | "">("");
  const [statusReasonCategory, setStatusReasonCategory] = useState("");
  const [statusDetail, setStatusDetail] = useState("");
  const selectedAdminRecord = demoAdminDirectory.find(admin => admin.id === target);
  const selectedAdmin = selectedAdminRecord ? { ...selectedAdminRecord, status: statusOverrides[selectedAdminRecord.id] ?? selectedAdminRecord.status } : undefined;
  const filteredAdmins = useMemo(() => {
    const query = directorySearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return demoAdminDirectory;
    return demoAdminDirectory.filter(admin => `${admin.label} ${admin.email}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [directorySearch]);
  const hasPermission = Boolean(target && permissions[target]);
  const activePermissions = useMemo(
    () => Object.entries(permissions).filter(([, active]) => active).map(([identifier]) => identifier),
    [permissions],
  );

  function submitChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanReason = reason.trim();
    if (!selectedAdmin || !cleanReason) return;
    const key = selectedAdmin.id;
    const currentlyActive = Boolean(permissions[key]);
    if (action === "grant" && selectedAdmin.status !== "ativa") {
      setFeedback("Não é possível conceder permissão a uma conta suspensa ou desativada.");
      return;
    }
    if (action === "grant" && currentlyActive) {
      setFeedback("Este identificador já tem a permissão na demonstração.");
      return;
    }
    if (action === "revoke" && !currentlyActive) {
      setFeedback("Não há permissão ativa para revogar neste identificador de demonstração.");
      return;
    }

    const now = new Date();
    const actionText = action === "grant" ? "concedida" : "revogada";
    const auditEvent: PermissionEvent = {
      id: now.getTime(),
      targetId: selectedAdmin.id,
      targetLabel: selectedAdmin.label,
      action,
      reason: cleanReason,
      createdAt: formatDate(now),
    };
    const expires = new Date(now);
    expires.setDate(expires.getDate() + 30);
    const notice: PanelNotice = {
      id: now.getTime() + 1,
      message: `Permissão para alterar o canal dos avisos ${actionText} em ${formatDate(now)}.`,
      createdAt: formatDate(now),
      expiresAt: formatDate(expires),
    };

    setPermissions(previous => ({ ...previous, [key]: action === "grant" }));
    setEvents(previous => [auditEvent, ...previous]);
    setNotices(previous => [notice, ...previous]);
    setFeedback(action === "grant" ? "Permissão concedida nesta prévia." : "Permissão revogada nesta prévia.");
    setReason("");
    setAction(action === "grant" ? "revoke" : "grant");
  }

  function submitStatusChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAdmin || !requestedStatus || !statusReasonCategory || !statusDetail.trim()) return;

    const now = new Date();
    const isInvalid = selectedAdmin.status === requestedStatus;
    const auditEvent: StatusAuditEvent = {
      id: now.getTime() + Math.floor(Math.random() * 1000),
      targetId: selectedAdmin.id,
      targetLabel: selectedAdmin.label,
      previousStatus: selectedAdmin.status,
      requestedStatus,
      outcome: isInvalid ? "falhou" : "concluída",
      failureCategory: isInvalid ? "transição inválida" : undefined,
      reasonCategory: statusReasonCategory,
      detail: statusDetail.trim(),
      actorId: "id-demo-ti-001",
      actorName: "TI (simulado)",
      createdAt: formatDate(now),
    };
    setStatusEvents(previous => [auditEvent, ...previous]);

    if (isInvalid) {
      setStatusFeedback("Tentativa registrada como falha: transição inválida. O status não foi alterado.");
    } else {
      setStatusOverrides(previous => ({ ...previous, [selectedAdmin.id]: requestedStatus }));
      setStatusFeedback(`Status alterado para ${statusLabel(requestedStatus).toLowerCase()} nesta prévia.`);
      if (requestedStatus === "ativa" && selectedAdmin.status !== "ativa" && permissions[selectedAdmin.id]) {
        const expires = new Date(now);
        expires.setDate(expires.getDate() + 30);
        setNotices(previous => [{
          id: now.getTime() + Math.floor(Math.random() * 1000) + 1000,
          message: `Permissão para alterar o canal dos avisos voltou a estar disponível em ${formatDate(now)}.`,
          createdAt: formatDate(now),
          expiresAt: formatDate(expires),
        }, ...previous]);
      }
    }

    setRequestedStatus("");
    setStatusReasonCategory("");
    setStatusDetail("");
  }

  function resetDemo() {
    setTarget("");
    setDirectorySearch("");
    setReason("");
    setStatusReasonCategory("");
    setStatusDetail("");
    setRequestedStatus("");
    setStatusOverrides({});
    setAction("grant");
    setPermissions({});
    setEvents([]);
    setStatusEvents([]);
    setNotices([]);
    setFeedback("");
    setStatusFeedback("");
  }

  const actionIsValid = action === "grant" ? Boolean(selectedAdmin?.status === "ativa" && !hasPermission) : hasPermission;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/portal" className={styles.back}><ArrowLeft size={15} /> Configuração do portal</Link>
        <span className={styles.headerTag}><ShieldCheck size={14} /> PERMISSÕES ADMINISTRATIVAS</span>
      </header>

      <section className={styles.content}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>PORTAL DO CLIENTE · PRÉVIA ADMINISTRATIVA</span>
            <h1>Permissão para mudar<br /><em>o canal dos avisos.</em></h1>
            <p>TI concede ou revoga o acesso individualmente pelo ID interno imutável da conta, com motivo obrigatório e trilha de auditoria. Alterações no e-mail não transferem a permissão.</p>
          </div>
          {(events.length > 0 || statusEvents.length > 0 || notices.length > 0) && <button type="button" className={styles.reset} onClick={resetDemo}>Limpar demonstração</button>}
        </div>

        <div className={styles.prototypeNotice} role="note">
          <span><UserRoundCog size={18} /></span>
          <p><strong>Protótipo local, sem efeito real.</strong> A lista abaixo contém apenas três contas administrativas fictícias. Nenhuma conta real é consultada, nenhuma permissão é alterada no servidor e nada é persistido. Avisos e auditoria são apenas simulações nesta página.</p>
        </div>

        <div className={styles.policyStrip}>
          <div><ShieldCheck size={16} /><span><strong>Quem pode conceder/revogar</strong><small>TI, individualmente por administrador</small></span></div>
          <div><Clock3 size={16} /><span><strong>Validade da permissão</strong><small>Até TI revogar</small></span></div>
          <div><History size={16} /><span><strong>Trilha de auditoria</strong><small>12 meses; motivo obrigatório</small></span></div>
        </div>

        <div className={styles.workspace}>
          <section className={styles.card} aria-labelledby="change-title">
            <div className={styles.cardHeading}><span className={styles.step}>01 · AÇÃO DE TI</span><h2 id="change-title">Conceder ou revogar</h2><p>O motivo é obrigatório nas duas ações. A revogação remove a permissão imediatamente na implementação real.</p></div>
            <form className={styles.form} onSubmit={submitChange}>
              <label htmlFor="directory-search">Buscar administrador por nome ou e-mail corporativo verificado</label>
              <input id="directory-search" type="search" value={directorySearch} onChange={event => { setDirectorySearch(event.target.value); setTarget(""); setRequestedStatus(""); setStatusFeedback(""); setFeedback(""); }} placeholder="Buscar na lista demonstrativa" autoComplete="off" />
              <label htmlFor="permission-target">Selecionar conta administrativa fictícia</label>
              <select id="permission-target" required value={target} onChange={event => { setTarget(event.target.value); setRequestedStatus(""); setStatusFeedback(""); setFeedback(""); }}>
                <option value="">Escolha uma conta da lista demonstrativa</option>
                {filteredAdmins.map(admin => <option key={admin.id} value={admin.id}>{admin.label} · {admin.email} · {statusLabel(statusOverrides[admin.id] ?? admin.status)}</option>)}
              </select>
              {filteredAdmins.length === 0 && <small role="status">Nenhuma conta fictícia encontrada para essa busca.</small>}
              <small>Os e-mails exibidos usam o domínio reservado .invalid e são fictícios. Na implementação real, buscar contas administrativas existentes pelo nome ou e-mail corporativo verificado; vincular e validar a permissão pelo ID interno imutável no servidor.</small>
              {selectedAdmin && selectedAdmin.status !== "ativa" && <small className={styles.statusHint} role="status">Conta {statusLabel(selectedAdmin.status).toLowerCase()}: o status bloqueia o acesso e o uso da permissão enquanto persistir. A permissão já existente continua vinculada até TI revogá-la; novas concessões são bloqueadas e a revogação segue disponível. Se reativada, a permissão volta a valer e gera aviso genérico no painel (ação e data), sem motivo, link ou e-mail; expira em 30 dias.</small>}

              <div className={styles.actionGroup} role="group" aria-label="Ação de permissão">
                <button type="button" aria-pressed={action === "grant"} className={action === "grant" ? styles.actionSelected : ""} onClick={() => { setAction("grant"); setFeedback(""); }}><UserRoundPlus size={15} /> Conceder</button>
                <button type="button" aria-pressed={action === "revoke"} className={action === "revoke" ? styles.actionSelected : ""} onClick={() => { setAction("revoke"); setFeedback(""); }} disabled={!hasPermission}><UserRoundX size={15} /> Revogar</button>
              </div>
              <label htmlFor="permission-reason">Motivo obrigatório</label>
              <textarea id="permission-reason" required minLength={5} maxLength={400} value={reason} onChange={event => setReason(event.target.value)} placeholder="Justificativa fictícia para a concessão ou revogação" />
              <div className={styles.formFooter}><span>{reason.trim().length}/400 caracteres</span><button type="submit" disabled={!selectedAdmin || !reason.trim() || !actionIsValid}>{action === "grant" ? "Simular concessão" : "Simular revogação"} <Check size={15} /></button></div>
              {feedback && <p className={styles.feedback} role="status">{feedback}</p>}
            </form>
          </section>

          <section className={styles.card} aria-labelledby="active-title">
            <div className={styles.cardHeading}><span className={styles.step}>02 · ESTADO SIMULADO</span><h2 id="active-title">Permissões ativas</h2><p>Conceder somente a contas ativas. Suspensão/desativação bloqueia o uso, mas mantém a permissão vinculada; ao reativar, ela volta a valer e gera aviso genérico no painel, sem e-mail ou link.</p></div>
            {activePermissions.length === 0 ? (
              <div className={styles.empty}><ShieldCheck size={20} /><strong>Nenhuma permissão na prévia</strong><span>Selecione uma conta fictícia ativa para conceder a permissão.</span></div>
            ) : (
              <ul className={styles.activeList}>{activePermissions.map(identifier => { const admin = demoAdminDirectory.find(item => item.id === identifier); const currentStatus = admin ? statusOverrides[identifier] ?? admin.status : undefined; return <li key={identifier}><span className={styles.statusDot} /><span><strong>{admin?.label ?? "Conta fictícia"}</strong><small>ID interno fictício: {identifier} · conta {currentStatus ? statusLabel(currentStatus).toLowerCase() : "desconhecida"}</small></span><span className={styles.activeTag}>PERMISSÃO</span></li>; })}</ul>
            )}
          </section>
        </div>

        <section className={`${styles.card} ${styles.statusCard}`} aria-labelledby="status-change-title">
          <div className={styles.cardHeading}><span className={styles.step}>03 · STATUS DA CONTA · SIMULAÇÃO LOCAL</span><h2 id="status-change-title">Registrar suspensão, desativação ou reativação</h2><p>Selecione uma conta acima. Toda tentativa fica na auditoria demonstrativa; uma tentativa repetindo o status atual é registrada como transição inválida.</p></div>
          {!selectedAdmin ? (
            <div className={styles.empty}><ShieldCheck size={20} /><strong>Selecione uma conta administrativa</strong><span>Use a lista acima para escolher uma conta fictícia.</span></div>
          ) : (
            <form className={styles.statusForm} onSubmit={submitStatusChange}>
              <div className={styles.currentStatus}><span>Conta selecionada</span><strong>{selectedAdmin.label}</strong><small>Status atual: {statusLabel(selectedAdmin.status)} · ID fictício: {selectedAdmin.id}</small></div>
              <div className={styles.statusFields}>
                <div><label htmlFor="requested-status">Novo status</label><select id="requested-status" required value={requestedStatus} onChange={event => { setRequestedStatus(event.target.value as AccountStatus | ""); setStatusFeedback(""); }}><option value="">Escolha o novo status</option><option value="ativa">Ativa · reativar</option><option value="suspensa">Suspensa</option><option value="desativada">Desativada</option></select></div>
                <div><label htmlFor="status-reason-category">Categoria obrigatória</label><select id="status-reason-category" required value={statusReasonCategory} onChange={event => setStatusReasonCategory(event.target.value)}><option value="">Escolha uma categoria</option>{manualReasonCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></div>
              </div>
              <label htmlFor="status-detail">Detalhe obrigatório · até 500 caracteres</label>
              <textarea id="status-detail" required maxLength={500} value={statusDetail} onChange={event => setStatusDetail(event.target.value)} placeholder="Contexto breve e necessário para a decisão" />
              <small className={styles.statusPrivacy}>Não inclua senhas, tokens, códigos de verificação nem dados pessoais sensíveis ou desnecessários. O ator aparece como TI (simulado); o sistema real registrará ID interno imutável e nome exibido no momento.</small>
              <div className={styles.formFooter}><span>{statusDetail.length}/500 caracteres</span><button type="submit" disabled={!requestedStatus || !statusReasonCategory || !statusDetail.trim()}>Simular mudança de status <Check size={15} /></button></div>
              {statusFeedback && <p className={styles.feedback} role="status">{statusFeedback}</p>}
            </form>
          )}
        </section>

        <div className={styles.columns}>
          <section className={styles.subCard} aria-labelledby="notice-title">
            <div className={styles.subHeading}><Bell size={16} /><div><span className={styles.step}>03 · AVISO NO PAINEL</span><h2 id="notice-title">Administrador afetado</h2></div></div>
            <p className={styles.subIntro}>A concessão ou revogação gera uma mensagem genérica no painel, sem e-mail, motivo ou link. O aviso expira após 30 dias, tenha sido lido ou não.</p>
            {notices.length === 0 ? <div className={styles.noticeEmpty}>Os avisos simulados aparecerão aqui após uma ação.</div> : <ul className={styles.noticeList}>{notices.map(notice => <li key={notice.id}><span className={styles.noticeIcon}><Bell size={14} /></span><span><strong>{notice.message}</strong><small>Expira em {notice.expiresAt} · sem link</small></span></li>)}</ul>}
            <small className={styles.channelChangeRule}>Alterações no canal dos avisos são somente auditadas; não notificam outros administradores.</small>
          </section>

          <section className={styles.subCard} aria-labelledby="audit-title">
            <div className={styles.subHeading}><History size={16} /><div><span className={styles.step}>04 · REGISTRO SIMULADO</span><h2 id="audit-title">Auditoria</h2></div></div>
            <p className={styles.subIntro}>No sistema real, manter por 12 meses registros de concessão/revogação, mudanças de status e todas as tentativas malsucedidas. Registrar ID imutável da conta, transição solicitada e resultado; em falhas, usar categoria padronizada (autorização negada, conta não encontrada no diretório, conta suspensa/desativada (categoria combinada), transição inválida, conflito de estado ou serviço indisponível), sem texto livre, além de autor e data/hora; em rotinas automáticas, ID da conta de serviço e rotina/evento de origem. Para mudanças manuais, exigir categoria padronizada e detalhe obrigatório de até 500 caracteres, além do ID interno imutável de TI e do nome exibido no momento. Não incluir senhas, tokens, códigos de verificação nem dados pessoais sensíveis ou desnecessários. Lista comum: mudança de função/vínculo, afastamento temporário, segurança, correção administrativa, decisão formal ou reativação autorizada. Se uma rotina automática tiver iniciador humano, registrar o ID e nome desse iniciador. Esta prévia simula localmente mudanças e tentativas inválidas, sem gerar auditoria real nem persistir dados.</p>
            {events.length === 0 ? <div className={styles.noticeEmpty}>As ações de permissão demonstrativas aparecerão aqui.</div> : <ul className={styles.auditList}>{events.map(item => <li key={item.id}><div className={styles.auditTop}><strong>{item.action === "grant" ? "Permissão concedida" : "Permissão revogada"}</strong><time>{item.createdAt}</time></div><span>Administrador: {item.targetLabel} (ID {item.targetId}) · Ação por: TI (simulado)</span><p>Motivo: {item.reason}</p></li>)}</ul>}
            <h3 className={styles.statusAuditHeading}>Mudanças de status · tentativas registradas</h3>
            {statusEvents.length === 0 ? <div className={styles.noticeEmpty}>As mudanças e falhas simuladas aparecerão aqui.</div> : <ul className={styles.statusAuditList}>{statusEvents.map(item => <li key={item.id}><div className={styles.auditTop}><strong>{item.outcome === "concluída" ? "Status alterado" : `Tentativa falhou · ${item.failureCategory}`}</strong><time>{item.createdAt}</time></div><span>Conta: {item.targetLabel} (ID {item.targetId}) · Autor: {item.actorName} ({item.actorId})</span><p>Status: {statusLabel(item.previousStatus)} → {statusLabel(item.requestedStatus)} · Categoria: {item.reasonCategory}</p><p>Detalhe: {item.detail}</p></li>)}</ul>}
          </section>
        </div>

        <footer className={styles.footer}><span>Somente uma demonstração local: não autentica, não envia avisos e não salva mudanças.</span><Link href="/admin/portal/alertas">Voltar à prévia de alertas <ArrowLeft size={13} /></Link></footer>
      </section>
    </main>
  );
}
