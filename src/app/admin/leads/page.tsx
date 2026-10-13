"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, LogOut, Mail, MessageCircle, RefreshCw, Shield, UserRound } from "lucide-react";
import AdminGate from "../AdminGate";
import OriginMetricsPanel from "./OriginMetricsPanel";
import styles from "./LeadAdmin.module.css";

type AdminRole = "marcelo" | "ti" | "comercial" | "admin";
type LeadStatus = "solicitada" | "em_agendamento" | "confirmada" | "realizada" | "cancelada" | "new" | "contacted" | "closed";
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
  // Campos que GET /api/admin/leads já devolvia e que a tela ainda não
  // apresentava. Nenhum contrato mudou: apenas leitura do que já existe.
  origin?: string | null;
  campaign?: string | null;
  channel?: string | null;
  responsible?: string | null;
  updated_at?: string | null;
};

const roleNames: Record<AdminRole, string> = { marcelo: "Marcelo · administração", ti: "TI · sistema", comercial: "Comercial", admin: "Administração" };
const statusLabels: Record<LeadStatus, string> = {
  solicitada: "Solicitada",
  em_agendamento: "Em agendamento",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  // Compatibilidade com registros antigos (pré PUB-04).
  new: "Novo",
  contacted: "Em contato",
  closed: "Concluído",
};
const statusStyleKey: Record<LeadStatus, "new" | "contacted" | "closed"> = {
  solicitada: "new",
  em_agendamento: "contacted",
  confirmada: "contacted",
  realizada: "closed",
  cancelada: "closed",
  new: "new",
  contacted: "contacted",
  closed: "closed",
};

// --- Organização da fila (UX-PRO-06) -----------------------------------------
// Tudo neste bloco é DERIVADO de registros canônicos que a API já devolve:
// `status`, `created_at`, `updated_at`, `origin`, `campaign`, `channel` e
// `responsible`. Nada aqui grava campo novo, estima valor ou simula dado: quando
// a informação não existe no registro, a tela diz que não existe.
const ATTENTION_DAYS = 3;

const NEXT_ACTION: Record<LeadStatus, string> = {
  solicitada: "Definir quem atende e fazer o primeiro contato.",
  em_agendamento: "Combinar data e horário da visita com a pessoa.",
  confirmada: "Realizar a visita e registrar o resultado.",
  realizada: "Converter em oportunidade no CRM ou encerrar o pedido.",
  cancelada: "Nenhuma: o pedido está encerrado.",
  new: "Definir quem atende e fazer o primeiro contato.",
  contacted: "Combinar data e horário da visita com a pessoa.",
  closed: "Nenhuma: o pedido está encerrado.",
};

function isClosedStatus(status: LeadStatus) {
  return status === "realizada" || status === "cancelada" || status === "closed";
}

/** Espera calculada a partir do `created_at` canônico, nunca estimada. */
function formatWaiting(createdAt: string, now: number) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return null;
  const minutes = Math.max(0, Math.round((now - created) / 60_000));
  if (minutes < 2) return { text: "recebido agora", days: 0 };
  if (minutes < 60) return { text: `há ${minutes} min`, days: 0 };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { text: `há ${hours} h`, days: 0 };
  const days = Math.floor(hours / 24);
  if (days === 1) return { text: "há 1 dia", days };
  if (days < 45) return { text: `há ${days} dias`, days };
  const months = Math.floor(days / 30);
  return { text: months === 1 ? "há 1 mês" : `há ${months} meses`, days };
}

/**
 * Fonte do pedido. Cada parte é nomeada porque os três campos são opcionais e
 * um valor solto não diria a qual deles pertence. O que não existe no registro
 * é declarado como ausente, em vez de desaparecer ou virar zero.
 */
function sourceLabel(lead: Lead) {
  const campos = [
    { rotulo: "origem", valor: lead.origin },
    { rotulo: "campanha", valor: lead.campaign },
    { rotulo: "canal", valor: lead.channel },
  ];
  const presentes = campos
    .filter((campo): campo is { rotulo: string; valor: string } => typeof campo.valor === "string" && campo.valor.trim().length > 0)
    .map(campo => ({ rotulo: campo.rotulo, valor: campo.valor.trim() }));
  const ausentes = campos
    .filter(campo => !presentes.some(item => item.rotulo === campo.rotulo))
    .map(campo => campo.rotulo);
  return {
    texto: presentes.length > 0 ? presentes.map(item => `${item.rotulo}: ${item.valor}`).join(" · ") : null,
    ausentes,
  };
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function explainApiError(code: string) {
  if (code === "database_not_configured") return "O PostgreSQL ainda não está configurado no servidor.";
  if (code === "migration_required") return "A estrutura do banco ainda não foi migrada. Execute npm run db:migrate no servidor.";
  if (code === "admin_session_required") return "Sua sessão expirou. Entre novamente.";
  return "Não foi possível carregar os pedidos. Tente novamente mais tarde.";
}

function LeadAdminContent() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | LeadStatus>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Instante da última leitura concluída com sucesso. É o que permite dizer
  // "atualizado em" e separar dado antigo de falha de leitura.
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  // Verdadeiro quando uma nova leitura falhou mas ainda há dados da leitura
  // anterior. A lista continua visível, marcada como desatualizada.
  const [stale, setStale] = useState(false);
  // Ação em andamento por pedido: trava o duplo envio do pedido afetado sem
  // congelar a fila inteira.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [order, setOrder] = useState<"recentes" | "espera">("recentes");
  const hasLoadedRef = useRef(false);

  const loadLeads = useCallback(async (selectedFilter: "all" | LeadStatus = filter) => {
    setLoading(true);
    setError("");
    try {
      const [sessionResponse, leadsResponse] = await Promise.all([
        fetch("/api/admin/session", { cache: "no-store" }),
        fetch(`/api/admin/leads?limit=100${selectedFilter === "all" ? "" : `&status=${selectedFilter}`}`, { cache: "no-store" }),
      ]);
      const sessionData = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || !["marcelo", "ti", "comercial", "admin"].includes(sessionData.role)) {
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
      hasLoadedRef.current = true;
      setLoadedAt(Date.now());
      setStale(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar os pedidos.");
      // Só marca desatualização se já havia uma leitura anterior bem-sucedida:
      // sem dados na tela o estado correto é "nunca carregou", não "antigo".
      setStale(hasLoadedRef.current);
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
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.mfaRequired) throw new Error("Esta conta exige verificação MFA; entre pelo fluxo com segundo fator.");
        if (data.error === "admin_auth_not_configured") throw new Error("A autenticação administrativa ainda não está configurada no servidor.");
        if (data.error === "too_many_attempts") throw new Error("Muitas tentativas. Aguarde antes de tentar novamente.");
        throw new Error("Credencial inválida ou indisponível.");
      }
      if (!["marcelo", "ti", "comercial", "admin"].includes(data.role)) {
        throw new Error("Esta conta não tem acesso à fila de atendimento.");
      }
      setRole(data.role);
      setPassword("");
      setNotice("Acesso autenticado.");
      await loadLeads(filter);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao autenticar.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(lead: Lead, status: LeadStatus) {
    setPendingId(lead.id);
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
      setPendingId(null);
    }
  }

  async function convertLead(lead: Lead) {
    setPendingId(lead.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/crm/leads/${lead.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create_company: true, company_name: lead.name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(explainApiError(data.error));
      setNotice(
        data.dedup
          ? `Lead de ${lead.name} já tinha sido convertido — oportunidade ${String(data.opportunityId).slice(0, 8)} reaproveitada (sem duplicar).`
          : `Lead de ${lead.name} convertido em oportunidade ${String(data.opportunityId).slice(0, 8)}. Continue em Empresas & funil (CRM).`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível converter o lead.");
    } finally {
      setPendingId(null);
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

  // Contagens e ordenação derivadas. O instante de referência é o da última
  // leitura bem-sucedida, para que a espera não mude a cada render.
  const queue = useMemo(() => {
    const now = loadedAt ?? Date.now();
    const items = leads.map(lead => {
      const waiting = formatWaiting(lead.created_at, now);
      return { lead, waiting, attention: !isClosedStatus(lead.status) && (waiting?.days ?? 0) > ATTENTION_DAYS };
    });
    const ordered = order === "espera"
      ? [...items].sort((a, b) => {
        const abertos = Number(isClosedStatus(a.lead.status)) - Number(isClosedStatus(b.lead.status));
        if (abertos !== 0) return abertos;
        return new Date(a.lead.created_at).getTime() - new Date(b.lead.created_at).getTime();
      })
      : items;
    return {
      items: ordered,
      abertos: items.filter(item => !isClosedStatus(item.lead.status)).length,
      atencao: items.filter(item => item.attention).length,
    };
  }, [leads, order, loadedAt]);

  const loadedAtLabel = loadedAt === null
    ? "—"
    : new Date(loadedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return (
    <UiTaskWorkspace className={styles.page}>
      <header className={styles.topbar}>
        <a className={styles.back} href="/"><ArrowLeft size={16} /> Voltar ao site</a>
        <nav className={styles.topLinks} aria-label="Atalhos administrativos">
          <a className={styles.visualLink} href="/admin/crm">Empresas &amp; funil (CRM)</a>
          <a className={styles.visualLink} href="/admin/comercial">Workspace comercial</a>
          <a className={styles.visualLink} href="/admin/portal">Prévia da configuração do portal</a>
          <a className={styles.visualLink} href="/admin/aparencia">Aparência do site <ArrowLeft size={13} /></a>
        </nav>
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
            <p>Entre com sua conta individual de staff (marcelo, ti, admin ou comercial) para consultar os pedidos.</p>
            <form onSubmit={login}>
              <label htmlFor="leads-email">E-mail</label>
              <input id="leads-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
              <label htmlFor="leads-password">Senha</label>
              <input id="leads-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
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
                  <option value="all">Todos</option>
                  <option value="solicitada">Solicitada</option>
                  <option value="em_agendamento">Em agendamento</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="realizada">Realizada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
                <button className={styles.refresh} type="button" onClick={() => void loadLeads(filter)} disabled={loading} aria-label="Atualizar pedidos"><RefreshCw size={16} /></button>
              </div>
            </div>
            <div className={styles.controlsSecondary}>
              <label htmlFor="lead-order">Ordenar a fila</label>
              <select id="lead-order" value={order} onChange={event => setOrder(event.target.value as "recentes" | "espera")}>
                <option value="recentes">Mais recentes primeiro (ordem da API)</option>
                <option value="espera">Sem retorno há mais tempo primeiro</option>
              </select>
              {loading && <span className={styles.updating} role="status">Atualizando a fila…</span>}
            </div>

            <section className={styles.queueSummary} aria-labelledby="lead-queue-summary-title" data-testid="lead-queue-summary">
              <h2 id="lead-queue-summary-title" className={styles.queueSummaryTitle}>Resumo da fila</h2>
              <dl className={styles.queueSummaryGrid}>
                <div>
                  <dt>Aguardando retorno</dt>
                  <dd data-testid="lead-queue-open">{queue.abertos}</dd>
                  <span className={styles.queueNote}>de {leads.length} {leads.length === 1 ? "pedido carregado" : "pedidos carregados"} nesta página</span>
                </div>
                <div>
                  <dt>Sem retorno há mais de {ATTENTION_DAYS} dias</dt>
                  <dd data-testid="lead-queue-attention">{queue.atencao}</dd>
                  <span className={styles.queueNote}>classificação derivada de status + data de recebimento</span>
                </div>
                <div>
                  <dt>Atualizado em</dt>
                  <dd data-testid="lead-queue-updated">{loadedAtLabel}</dd>
                  <span className={styles.queueNote}>{stale ? "a última atualização falhou: os dados abaixo podem estar defasados" : "hora da última leitura concluída"}</span>
                </div>
              </dl>
              <p className={styles.queueHint}>
                A contagem total do filtro é a do servidor, mostrada acima. As contagens deste resumo e a
                ordenação são derivadas apenas dos pedidos já carregados nesta página (a API devolve no
                máximo 100 por vez); nenhum campo novo é gravado e nenhum valor é estimado.
              </p>
            </section>

            {stale && (
              <p className={styles.stale} role="alert" data-testid="lead-queue-stale">
                A última atualização falhou. Os pedidos abaixo são os da leitura de {loadedAtLabel} e podem
                estar desatualizados — isto não significa que a fila esteja vazia.
              </p>
            )}

            {loading && loadedAt === null ? (
              <div className={styles.empty} role="status" aria-busy="true" data-testid="lead-queue-loading"><strong>Carregando pedidos…</strong><span>Ainda não há dados desta leitura.</span></div>
            ) : loadedAt === null ? (
              <div className={styles.empty} data-testid="lead-queue-never-loaded"><Mail size={24} /><strong>A fila ainda não foi carregada</strong><span>Não há pedidos para mostrar nem informação de ausência: a leitura não foi concluída. Use o botão de atualizar para tentar de novo.</span></div>
            ) : leads.length === 0 ? (
              <div className={styles.empty} data-testid="lead-queue-empty"><Mail size={24} />
                <strong>{filter === "all" ? "Nenhum pedido recebido até agora" : `Nenhum pedido com o status “${statusLabels[filter]}”`}</strong>
                <span>
                  {filter === "all"
                    ? "Isto é ausência de dados, não falha de leitura: quando alguém enviar o formulário público, o pedido aparece aqui."
                    : "O filtro está ativo e não há pedidos neste estado. Os demais pedidos continuam no sistema."}
                </span>
                {filter !== "all" && (
                  <button type="button" className={styles.clearFilter} onClick={() => setSelectedFilter("all")}>Ver todos os pedidos</button>
                )}
              </div>
            ) : (
              <div className={styles.list} aria-busy={loading || undefined} data-testid="lead-queue-list">
                {queue.items.map(({ lead, waiting, attention }) => {
                  const message = [
                    `Olá ${lead.name}, recebemos seu pedido de ${lead.request_kind === "visit" ? "visita técnica" : "orçamento"} pelo site do Grupo SEG System.`,
                    lead.request_kind === "visit" ? "A visita ainda depende de confirmação da equipe." : "Vamos conversar sobre sua necessidade.",
                  ].join(" ");
                  const origem = sourceLabel(lead);
                  const responsavel = typeof lead.responsible === "string" && lead.responsible.trim() ? lead.responsible.trim() : null;
                  const alteradoEm = formatUpdatedAt(lead.updated_at);
                  const acaoPendente = pendingId === lead.id;
                  return (
                    <article className={styles.card} key={lead.id} data-lead-id={lead.id} data-testid={`lead-card-${lead.id.slice(0, 8)}`}>
                      <div className={styles.cardTop}>
                        <div>
                          <span className={styles.kind}>{lead.request_kind === "visit" ? "Solicitação de visita" : "Pedido de orçamento"}</span>
                          <h2>{lead.name}</h2>
                          <p className={styles.protocol}><span>PROTOCOLO</span> {lead.id.slice(0, 8)}</p>
                        </div>
                        <div className={styles.cardBadges}>
                          <span className={`${styles.status} ${styles[`status_${statusStyleKey[lead.status] ?? "new"}`]}`}>{statusLabels[lead.status] ?? lead.status}</span>
                          {attention && <span className={styles.attention} data-testid={`lead-attention-${lead.id.slice(0, 8)}`}>Atenção: {waiting?.text ?? "sem retorno"}</span>}
                        </div>
                      </div>
                      <p className={styles.date}>
                        Recebido em {new Date(lead.created_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })}
                        {waiting ? <> · <strong>{waiting.text}</strong></> : null}
                      </p>
                      <div className={styles.detailsGrid}>
                        <div><small>CONTATO</small><a href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>{lead.phone}</a></div>
                        <div><small>LOCAL</small><strong>{lead.city} · {lead.property_type}</strong></div>
                        <div>
                          <small>FONTE DO PEDIDO</small>
                          <strong>{origem.texto ?? "Não informada no registro"}</strong>
                          {origem.texto && origem.ausentes.length > 0 && (
                            <span className={styles.muted}>Sem {origem.ausentes.join(" nem ")} no registro.</span>
                          )}
                        </div>
                        <div><small>RESPONSÁVEL PELO ATENDIMENTO</small><strong>{responsavel ?? "Não atribuído"}</strong></div>
                        {lead.services.length > 0 && <div className={styles.wide}><small>SERVIÇOS DE INTERESSE</small><strong>{lead.services.join(" · ")}</strong></div>}
                        {lead.visit_preference && <div className={styles.wide}><small>PREFERÊNCIA DE VISITA</small><strong>{lead.visit_preference}</strong><em>Aguardando confirmação humana da equipe.</em></div>}
                        {lead.details && <div className={styles.wide}><small>DETALHES</small><p>{lead.details}</p></div>}
                      </div>
                      <p className={styles.nextAction}><span>PRÓXIMA AÇÃO</span> {NEXT_ACTION[lead.status] ?? "Não definida para este estado."}</p>
                      <div className={styles.cardBottom}>
                        <span className={`${styles.emailStatus} ${styles[`email_${lead.email_status}`]}`}><Mail size={14} /> E-mail: {lead.email_status === "sent" ? "enviado" : lead.email_status === "failed" ? "falhou" : "não configurado"}{alteradoEm ? <> · registro alterado em {alteradoEm}</> : null}</span>
                        <div className={styles.actions}>
                          <a className={styles.whatsapp} href={`https://wa.me/${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp</a>
                          <button type="button" className={styles.whatsapp} disabled={busy || acaoPendente} aria-busy={acaoPendente || undefined} onClick={() => void convertLead(lead)}>{acaoPendente ? "Convertendo…" : "Converter em oportunidade (CRM-04)"}</button>
                          <select aria-label={`Alterar status do pedido de ${lead.name}`} value={lead.status} onChange={event => void updateStatus(lead, event.target.value as LeadStatus)} disabled={busy || acaoPendente}>
                            <option value="solicitada">Solicitada</option>
                            <option value="em_agendamento">Em agendamento</option>
                            <option value="confirmada">Confirmada</option>
                            <option value="realizada">Realizada</option>
                            <option value="cancelada">Cancelada</option>
                          </select>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <OriginMetricsPanel />
          </>
        )}
        {notice && <p className={styles.notice} role="status"><Check size={15} /> {notice}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    </UiTaskWorkspace>
  );
}

// F01: gate central por fora — anônimo vai ao login canônico e retorna aqui.
// O estado de sessão local continua lendo a mesma sessão staff; o formulário
// local só apareceria se a sessão expirasse em pleno uso, momento em que o
// gate central já teria redirecionado à entrada.
export default function LeadAdminPage() {
  return (
    <AdminGate allowedRoles={["comercial", "marcelo", "admin", "ti"]}>
      <LeadAdminContent />
    </AdminGate>
  );
}
