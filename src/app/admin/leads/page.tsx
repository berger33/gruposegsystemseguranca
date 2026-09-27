"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, LogOut, Mail, MessageCircle, RefreshCw, Shield, UserRound } from "lucide-react";
import styles from "./LeadAdmin.module.css";

type AdminRole = "marcelo" | "ti";
type LeadStatus = "new" | "contacted" | "closed";
type Lead = {
  id: string;
  request_kind: "quote" | "visit";
  name: string;
  phone: string;
  city: string;
  property_type: string;
  services: string[];
  visit_preference: string | null;
  details: string | null;
  status: LeadStatus;
  email_status: "not_configured" | "sent" | "failed";
  created_at: string;
};

const roleNames: Record<AdminRole, string> = { marcelo: "Marcelo · administração", ti: "TI · sistema" };
const statusLabels: Record<LeadStatus, string> = { new: "Novo", contacted: "Em contato", closed: "Concluído" };

function explainApiError(code: string) {
  if (code === "database_not_configured") return "O PostgreSQL ainda não está configurado no servidor.";
  if (code === "migration_required") return "A estrutura do banco ainda não foi migrada. Execute npm run db:migrate no servidor.";
  if (code === "admin_session_required") return "Sua sessão expirou. Entre novamente.";
  return "Não foi possível carregar os pedidos. Tente novamente mais tarde.";
}

export default function LeadAdminPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [token, setToken] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | LeadStatus>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadLeads = useCallback(async (selectedFilter: "all" | LeadStatus = filter) => {
    setLoading(true);
    setError("");
    try {
      const [sessionResponse, leadsResponse] = await Promise.all([
        fetch("/api/admin/session", { cache: "no-store" }),
        fetch(`/api/admin/leads?limit=100${selectedFilter === "all" ? "" : `&status=${selectedFilter}`}`, { cache: "no-store" }),
      ]);
      const sessionData = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || (sessionData.role !== "marcelo" && sessionData.role !== "ti")) {
        setRole(null);
        setLeads([]);
        setLoading(false);
        return;
      }
      setRole(sessionData.role);
      const data = await leadsResponse.json().catch(() => ({}));
      if (!leadsResponse.ok) throw new Error(explainApiError(data.error));
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setTotal(Number(data.total) || 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar os pedidos.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void loadLeads("all"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.error === "admin_auth_not_configured") throw new Error("A autenticação administrativa ainda não está configurada no servidor.");
        if (data.error === "too_many_attempts") throw new Error("Muitas tentativas. Aguarde antes de tentar novamente.");
        throw new Error("Chave administrativa inválida ou indisponível.");
      }
      setRole(data.role);
      setToken("");
      setNotice("Acesso autenticado.");
      await loadLeads(filter);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao autenticar.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(lead: Lead, status: LeadStatus) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(explainApiError(data.error));
      setNotice(`Pedido de ${lead.name}: status alterado para “${statusLabels[status]}”.`);
      await loadLeads(filter);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o pedido.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
      setRole(null);
      setLeads([]);
      setNotice("Sessão encerrada.");
    } finally {
      setBusy(false);
    }
  }

  function setSelectedFilter(value: "all" | LeadStatus) {
    setFilter(value);
    void loadLeads(value);
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <a className={styles.back} href="/"><ArrowLeft size={16} /> Voltar ao site</a>
        <a className={styles.visualLink} href="/admin/visual">Administração visual <ArrowLeft size={13} /></a>
      </header>
      <section className={styles.content}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}><Shield size={14} /> PAINEL ADMINISTRATIVO · ATENDIMENTO</span><h1>Pedidos recebidos</h1><p>Orçamentos e solicitações de visita registrados pelo formulário público.</p></div>
          {role && <div className={styles.session}><UserRound size={16} /><span>{roleNames[role]}</span><button type="button" onClick={() => void logout()} disabled={busy} aria-label="Encerrar sessão"><LogOut size={16} /></button></div>}
        </div>

        {!role ? (
          <section className={styles.loginCard}>
            <span className={styles.loginIcon}><Shield size={24} /></span>
            <h2>Acesso restrito</h2>
            <p>Entre com sua credencial administrativa para consultar os pedidos.</p>
            <form onSubmit={login}>
              <label htmlFor="leads-token">Chave administrativa</label>
              <input id="leads-token" type="password" autoComplete="current-password" minLength={32} required value={token} onChange={event => setToken(event.target.value)} />
              <button type="submit" disabled={busy}>{busy ? "Verificando…" : "Entrar no painel"}</button>
            </form>
          </section>
        ) : (
          <>
            <div className={styles.toolbar}>
              <div className={styles.summary}><strong>{total}</strong><span>{total === 1 ? "pedido" : "pedidos"}{filter === "all" ? " no total" : ` · ${statusLabels[filter].toLowerCase()}`}</span></div>
              <div className={styles.controls}>
                <label htmlFor="lead-filter">Filtrar</label>
                <select id="lead-filter" value={filter} onChange={event => setSelectedFilter(event.target.value as "all" | LeadStatus)}>
                  <option value="all">Todos</option><option value="new">Novos</option><option value="contacted">Em contato</option><option value="closed">Concluídos</option>
                </select>
                <button className={styles.refresh} type="button" onClick={() => void loadLeads(filter)} disabled={loading} aria-label="Atualizar pedidos"><RefreshCw size={16} /></button>
              </div>
            </div>
            {loading ? <div className={styles.empty}>Carregando pedidos…</div> : leads.length === 0 ? <div className={styles.empty}><Mail size={24} /><strong>Nenhum pedido neste filtro</strong><span>Os novos envios aparecerão aqui após a migração do banco e o envio do formulário.</span></div> : (
              <div className={styles.list}>
                {leads.map(lead => {
                  const message = [
                    `Olá ${lead.name}, recebemos seu pedido de ${lead.request_kind === "visit" ? "visita técnica" : "orçamento"} pelo site do Grupo SEG System.`,
                    lead.request_kind === "visit" ? "A visita ainda depende de confirmação da equipe." : "Vamos conversar sobre sua necessidade.",
                  ].join(" ");
                  return (
                    <article className={styles.card} key={lead.id}>
                      <div className={styles.cardTop}>
                        <div><span className={styles.kind}>{lead.request_kind === "visit" ? "Solicitação de visita" : "Pedido de orçamento"}</span><h2>{lead.name}</h2></div>
                        <span className={`${styles.status} ${styles[`status_${lead.status}`]}`}>{statusLabels[lead.status]}</span>
                      </div>
                      <p className={styles.date}>{new Date(lead.created_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}</p>
                      <div className={styles.detailsGrid}>
                        <div><small>CONTATO</small><a href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>{lead.phone}</a></div>
                        <div><small>LOCAL</small><strong>{lead.city} · {lead.property_type}</strong></div>
                        {lead.services.length > 0 && <div className={styles.wide}><small>SERVIÇOS DE INTERESSE</small><strong>{lead.services.join(" · ")}</strong></div>}
                        {lead.visit_preference && <div className={styles.wide}><small>PREFERÊNCIA DE VISITA</small><strong>{lead.visit_preference}</strong><em>Aguardando confirmação humana da equipe.</em></div>}
                        {lead.details && <div className={styles.wide}><small>DETALHES</small><p>{lead.details}</p></div>}
                      </div>
                      <div className={styles.cardBottom}>
                        <span className={`${styles.emailStatus} ${styles[`email_${lead.email_status}`]}`}><Mail size={14} /> E-mail: {lead.email_status === "sent" ? "enviado" : lead.email_status === "failed" ? "falhou" : "não configurado"}</span>
                        <div className={styles.actions}>
                          <a className={styles.whatsapp} href={`https://wa.me/${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp</a>
                          <select aria-label={`Alterar status do pedido de ${lead.name}`} value={lead.status} onChange={event => void updateStatus(lead, event.target.value as LeadStatus)} disabled={busy}>
                            <option value="new">Novo</option><option value="contacted">Em contato</option><option value="closed">Concluído</option>
                          </select>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
        {notice && <p className={styles.notice} role="status"><Check size={15} /> {notice}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    </main>
  );
}
