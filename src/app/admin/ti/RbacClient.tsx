"use client";
import { useEffect, useMemo, useState } from "react";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import UiTableScroll from "@/components/ui/UiTableScroll";
import UiState from "@/components/ui/UiState";
import styles from "./RbacClient.module.css";

type Permission = {
  id: string; identity_id: string; email: string; kind: string; permission: string;
  scope_type: string; scope_id: string | null; reason: string; granted_by_role: string | null; created_at: string;
};
type Notice = { kind: "success" | "error"; text: string } | null;
type AccessReview = { id: string; target_identity_id: string; target_email: string; reviewer_email: string; decision: "keep" | "revoke" | "adjust"; notes: string | null; created_at: string };
const REVIEW_DECISIONS: Record<AccessReview["decision"], string> = { keep: "Manter", revoke: "Reavaliar revogação", adjust: "Ajustar" };

type CoverageSituation = "em_dia" | "vencida" | "nunca_revisada" | "revisado_sem_regra";
type CoverageRow = {
  identity_id: string; email: string | null; status: string | null; papel: string | null;
  ultima_revisao_em: string | null; dias_desde_ultima_revisao: number | null;
  revisoes_registradas: number; situacao: CoverageSituation; pendente: boolean;
};
type Coverage = {
  regra: { declarada: boolean; intervalo_dias: number | null; fonte: string; motivo: string | null; variavel: string; limite_maximo_dias: number };
  as_of: string; escopo: string; limite: number; truncado: boolean;
  resumo: { total: number; em_dia: number; vencida: number; nunca_revisada: number; revisado_sem_regra: number; pendentes: number };
  identidades: CoverageRow[];
};
const COVERAGE_SITUATIONS: Record<CoverageSituation, string> = {
  em_dia: "Em dia", vencida: "Revisão vencida", nunca_revisada: "Nunca revisada", revisado_sem_regra: "Revisada sem regra",
};
const COVERAGE_RULE_PROBLEMS: Record<string, string> = {
  nao_informada: "variável ausente", nao_inteira: "valor não inteiro", fora_do_limite: "valor fora do intervalo aceito",
};

const PERMISSION_AREAS: Record<string, string> = {
  admin: "Administração e acessos", client: "Clientes e portal", leads: "Comercial",
  site: "Aparência do site", employees: "Funcionários", proposals: "Propostas",
  documents: "Documentos", payroll: "Folha de pagamento", financeiro: "Financeiro",
  quality: "Qualidade", knowledge: "Conhecimento", expansion: "Expansão",
  analytics: "Indicadores", visual_editor: "Editor visual", reports: "Relatórios",
  intel: "Inteligência", emergency: "Emergencial",
};
const ACTIONS: Record<string, string> = { read: "Consultar", write: "Gerenciar", approve: "Aprovar", publish: "Publicar", review: "Revisar", send: "Enviar", download: "Baixar", export: "Exportar", issue: "Conceder", revoke: "Revogar", grant: "Conceder", execute: "Executar", contact: "Contatar", activate: "Ativar", test: "Testar", acknowledge: "Confirmar leitura", access_review: "Revisar acessos", self_service: "Autoatendimento" };
const SCOPES: Record<string, string> = { global: "Global", own: "Próprios registros", team: "Equipe", unit: "Unidade", account: "Conta de cliente", contract: "Contrato", organization: "Organização" };
const API_ERRORS: Record<string, string> = {
  admin_session_required: "Sua sessão expirou. Entre novamente para continuar.", permission_required: "Seu perfil não tem autorização para administrar estas permissões.",
  invalid_identity_id: "Informe um identificador de identidade válido.", invalid_permission: "Selecione uma permissão disponível.",
  invalid_scope_type: "Selecione um escopo válido.", invalid_scope_id: "O identificador do escopo deve ser um UUID válido.",
  reason_required: "Informe o motivo obrigatório (até 500 caracteres).", identity_not_found: "Identidade não encontrada.",
  identity_disabled: "Esta identidade está desativada e não pode receber uma permissão.", permission_exists: "Esta permissão já está ativa para a identidade e o escopo informados.",
  permission_not_found: "A permissão não foi encontrada ou já foi alterada.", database_not_configured: "O banco de dados não está configurado neste ambiente.",
  migration_required: "É necessário aplicar a migração de permissões antes de usar este painel.", rbac_unavailable: "O serviço de permissões está indisponível. Tente novamente mais tarde.",
};

function permissionName(value: string) {
  const [area, ...actionParts] = value.split(".");
  const action = actionParts.join(".");
  return `${PERMISSION_AREAS[area] || area} · ${ACTIONS[action] || action}`;
}
function errorMessage(value: unknown) {
  const code = typeof value === "string" ? value : "";
  return API_ERRORS[code] || "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}
function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Data não informada" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function RbacClient() {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ identityId: "", permission: "leads.read", scopeType: "global", scopeId: "", reason: "" });
  const [session, setSession] = useState<{ role: string; identityId?: string } | null>(null);
  const [reviews, setReviews] = useState<AccessReview[]>([]);
  const [reviewForm, setReviewForm] = useState({ targetIdentityId: "", decision: "keep" as AccessReview["decision"], notes: "" });
  const [reviewQuery, setReviewQuery] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState("");
  const scopeNeedsId = ["unit", "account", "contract"].includes(form.scopeType);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/permissions");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "rbac_unavailable");
      setPerms(data.permissions || []); setKnown(data.knownPermissions || []);
    } catch (cause) { setError(errorMessage(cause instanceof Error ? cause.message : "")); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    fetch("/api/admin/session").then(response => response.json()).then(data => { if (data.role) setSession(data); }).catch(() => {});
    void load();
  }, []);

  async function loadReviews() {
    setReviewLoading(true); setReviewError("");
    try {
      const response = await fetch("/api/admin/access-reviews");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "rbac_unavailable");
      setReviews(data.reviews || []);
    } catch (cause) { setReviewError(errorMessage(cause instanceof Error ? cause.message : "")); }
    finally { setReviewLoading(false); }
  }

  async function loadCoverage() {
    setCoverageLoading(true); setCoverageError("");
    try {
      const response = await fetch("/api/admin/access-reviews?view=coverage");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "rbac_unavailable");
      setCoverage(data as Coverage);
    } catch (cause) {
      setCoverageError(errorMessage(cause instanceof Error ? cause.message : ""));
      setCoverage(null);
    } finally { setCoverageLoading(false); }
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/access-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetIdentityId: reviewForm.targetIdentityId.trim(), decision: reviewForm.decision, notes: reviewForm.notes.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "rbac_unavailable");
      setReviewForm({ targetIdentityId: "", decision: "keep", notes: "" });
      setNotice({ kind: "success", text: "Decisão de revisão registrada. Ela não altera nem revoga permissões automaticamente; faça a mudança necessária separadamente no painel de acessos ativos." });
      await loadReviews();
    } catch (cause) { setNotice({ kind: "error", text: errorMessage(cause instanceof Error ? cause.message : "") }); }
    finally { setBusy(false); }
  }

  useEffect(() => { if (session?.role) void loadReviews(); }, [session]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return perms;
    return perms.filter(permission => [permission.email, permission.kind, permissionName(permission.permission), permission.permission, SCOPES[permission.scope_type] || permission.scope_type, permission.reason].some(value => value.toLocaleLowerCase("pt-BR").includes(normalized)));
  }, [perms, query]);

  const filteredReviews = useMemo(() => {
    const normalized = reviewQuery.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return reviews;
    return reviews.filter(review => [review.target_email, review.target_identity_id, review.reviewer_email, REVIEW_DECISIONS[review.decision] || review.decision, review.notes || ""].some(value => value.toLocaleLowerCase("pt-BR").includes(normalized)));
  }, [reviews, reviewQuery]);

  async function grant(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setNotice(null); setError("");
    try {
      const response = await fetch("/api/admin/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identityId: form.identityId.trim(), permission: form.permission, scopeType: form.scopeType, scopeId: form.scopeId.trim() || null, reason: form.reason.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "rbac_unavailable");
      setForm({ identityId: "", permission: "leads.read", scopeType: "global", scopeId: "", reason: "" });
      setNotice({ kind: "success", text: "Permissão concedida. As sessões atuais da identidade foram invalidadas; a pessoa precisará entrar novamente." });
      await load();
    } catch (cause) { setNotice({ kind: "error", text: errorMessage(cause instanceof Error ? cause.message : "") }); }
    finally { setBusy(false); }
  }

  async function revoke(permission: Permission) {
    const reason = window.prompt("Informe o motivo da revogação (obrigatório, até 500 caracteres):");
    if (!reason?.trim()) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/admin/permissions/${permission.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "rbac_unavailable");
      setNotice({ kind: "success", text: "Permissão revogada. As sessões atuais da identidade foram invalidadas; a pessoa precisará entrar novamente." });
      await load();
    } catch (cause) { setNotice({ kind: "error", text: errorMessage(cause instanceof Error ? cause.message : "") }); }
    finally { setBusy(false); }
  }

  return <UiTaskWorkspace className={styles.workspace} aria-busy={busy || loading}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Acesso e governança</p><h2>Permissões detalhadas</h2>
        <p>Conceda somente o acesso necessário para uma pessoa, em uma área e um escopo definidos. Cada alteração exige justificativa, gera auditoria e invalida as sessões existentes da identidade.</p></div>
      <div className={styles.session}>{session ? <>Sessão atual<strong>{session.role}</strong></> : <>Sessão atual<strong>Não confirmada</strong></>}</div>
    </header>

    <aside className={styles.warning}><strong>Entenda os escopos antes de conceder acesso</strong><p>“Global” pode valer para todos os registros daquela permissão. Unidade, conta e contrato dependem de um identificador válido. “Próprios registros” só se aplica quando o recurso informa sua autoria. O código aceita o escopo “Equipe”, mas o avaliador atual não concede acesso efetivo para ele; confirme a regra antes de usá-lo. A autorização final continua sendo feita pela API em cada operação.</p></aside>

    <form className={styles.form} onSubmit={grant}>
      <div className={styles.sectionTitle}><h3>Conceder permissão</h3><p>Use o UUID da identidade existente. Este painel não cria usuários nem amplia papéis.</p></div>
      <div className={styles.fields}>
        <label>Identidade da pessoa <span className={styles.required}>Obrigatório</span><input value={form.identityId} onChange={event => setForm({ ...form, identityId: event.target.value })} required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" title="Informe o UUID completo da identidade." autoComplete="off" /><small>UUID completo da conta de equipe ou cliente. O e-mail não é aceito neste campo.</small></label>
        <label>Acesso que será concedido <span className={styles.required}>Obrigatório</span><select value={form.permission} onChange={event => setForm({ ...form, permission: event.target.value })} required>{known.map(permission => <option key={permission} value={permission}>{permissionName(permission)} — {permission}</option>)}</select><small>O código técnico entre parênteses identifica exatamente a regra que a API verificará.</small></label>
        <label>Escopo dos registros <select value={form.scopeType} onChange={event => setForm({ ...form, scopeType: event.target.value, scopeId: "" })}>{Object.entries(SCOPES).map(([value, label]) => <option key={value} value={value}>{label}{value === "team" ? " — sem suporte efetivo no avaliador atual" : ""}</option>)}</select><small>Define em quais registros a permissão pode valer; o menu, sozinho, não concede acesso.</small></label>
        <label>Identificador do escopo {scopeNeedsId ? <span className={styles.required}>Obrigatório para este escopo</span> : <span className={styles.optional}>Opcional</span>}<input value={form.scopeId} onChange={event => setForm({ ...form, scopeId: event.target.value })} required={scopeNeedsId} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" title="Informe um UUID válido ou deixe vazio quando o escopo permitir." autoComplete="off" /><small>Preencha com o UUID exato da unidade, conta ou contrato quando aplicável.</small></label>
        <label className={styles.full}>Motivo da concessão <span className={styles.required}>Obrigatório · até 500 caracteres</span><textarea value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} required minLength={1} maxLength={500} rows={3} /><small>Explique a necessidade do acesso. O motivo integra o registro auditável.</small></label>
      </div>
      <button type="submit" disabled={busy || loading || !known.length}>{busy ? "Salvando…" : "Conceder acesso"}</button>
    </form>

    {notice && <p className={`${styles.notice} ${notice.kind === "error" ? styles.error : styles.success}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}

    <section className={styles.list} aria-labelledby="access-review-title">
      <div className={styles.sectionTitle}><div><h3 id="access-review-title">Revisão periódica de acessos</h3><p>Registre a decisão e a justificativa para uma identidade; isso cria um registro de revisão, mas não muda permissões.</p></div><button type="button" className={styles.secondary} disabled={reviewLoading} onClick={() => void loadReviews()}>Atualizar revisões</button></div>
      <aside className={styles.warning}><strong>A decisão não executa a mudança</strong><p>“Reavaliar revogação” e “Ajustar” são registros de decisão, não comandos. Para revogar, use a ação correspondente em Acessos ativos; alterações continuam sujeitas às verificações e auditoria próprias.</p></aside>
      <form className={styles.form} onSubmit={submitReview}>
        <div className={styles.fields}>
          <label>UUID da identidade revisada <span className={styles.required}>Obrigatório</span><input value={reviewForm.targetIdentityId} onChange={event => setReviewForm({ ...reviewForm, targetIdentityId: event.target.value })} required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" title="Informe o UUID completo da identidade." autoComplete="off" /></label>
          <label>Decisão <select value={reviewForm.decision} onChange={event => setReviewForm({ ...reviewForm, decision: event.target.value as AccessReview["decision"] })}>{Object.entries(REVIEW_DECISIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={styles.full}>Notas da revisão <span className={styles.optional}>Opcional · até 1000 caracteres</span><textarea value={reviewForm.notes} onChange={event => setReviewForm({ ...reviewForm, notes: event.target.value })} maxLength={1000} rows={3} /></label>
        </div>
        <button type="submit" disabled={busy}>Registrar decisão</button>
      </form>
      <label className={styles.filter}>Filtrar revisões carregadas por identidade, revisor, decisão ou notas<input type="search" value={reviewQuery} onChange={event => setReviewQuery(event.target.value)} placeholder="Digite para filtrar até 100 revisões recentes" /></label>
      {reviewLoading ? <UiState variant="loading" title="Carregando revisões" /> : reviewError ? <UiState variant="error" title="Não foi possível consultar as revisões" detail={reviewError} onRetry={() => void loadReviews()} retryLabel="Tentar novamente" /> : filteredReviews.length === 0 ? <UiState variant="empty" title={reviews.length ? "Nenhuma revisão corresponde ao filtro" : "Nenhuma revisão registrada"} detail={reviews.length ? "Altere ou limpe o termo para ver outras revisões carregadas." : "As últimas 100 decisões registradas aparecerão aqui."} /> : <UiTableScroll><table className={styles.table}><thead><tr><th scope="col">Identidade revisada</th><th scope="col">Decisão</th><th scope="col">Notas</th><th scope="col">Revisor</th><th scope="col">Data</th></tr></thead><tbody>{filteredReviews.map(review => <tr key={review.id}><td><strong>{review.target_email}</strong><small><code>{review.target_identity_id}</code></small></td><td>{REVIEW_DECISIONS[review.decision] || review.decision}</td><td className={styles.reason}>{review.notes || "Sem notas"}</td><td>{review.reviewer_email}</td><td>{dateTime(review.created_at)}</td></tr>)}</tbody></table></UiTableScroll>}
    </section>
    <section className={styles.list} aria-labelledby="access-coverage-title" aria-busy={coverageLoading}>
      <div className={styles.sectionTitle}><div><h3 id="access-coverage-title">Cobertura da revisão periódica</h3><p>Somente leitura: derivada das decisões registradas em <code>auth_access_reviews</code> para as identidades de equipe ativas. Não altera permissões nem substitui a revisão humana.</p></div><button type="button" className={styles.secondary} disabled={coverageLoading} onClick={() => void loadCoverage()}>{coverageLoading ? "Consultando…" : "Consultar cobertura"}</button></div>
      <aside className={styles.warning}><strong>Sem regra declarada não existe atraso</strong><p>O atraso só é calculado quando a periodicidade é declarada explicitamente em <code>{coverage?.regra.variavel || "ACCESS_REVIEW_INTERVAL_DAYS"}</code> (inteiro de 1 a {coverage?.regra.limite_maximo_dias || 730} dias). Sem essa declaração, o relatório mostra apenas o fato registrado e não classifica ninguém como vencido.</p></aside>
      {coverageLoading && !coverage ? <UiState variant="loading" title="Calculando a cobertura da revisão" /> : coverageError ? <UiState variant="error" title="Não foi possível calcular a cobertura" detail={coverageError} onRetry={() => void loadCoverage()} retryLabel="Tentar novamente" /> : !coverage ? <UiState variant="empty" title="Cobertura ainda não consultada" detail="Use “Consultar cobertura” para derivar a situação de cada identidade de equipe ativa." /> : <>
        <p className={styles.notice} role="status">{coverage.regra.declarada
          ? `Regra declarada: revisar a cada ${coverage.regra.intervalo_dias} dias (fonte ${coverage.regra.fonte}). Situação em ${dateTime(coverage.as_of)}.`
          : `Regra de periodicidade não declarada (${COVERAGE_RULE_PROBLEMS[coverage.regra.motivo || ""] || "motivo não informado"}). Situação em ${dateTime(coverage.as_of)}; nenhum atraso é calculado.`}</p>
        <p className={styles.coverageSummary}>Identidades ativas: <strong>{coverage.resumo.total}</strong> · Em dia: <strong>{coverage.resumo.em_dia}</strong> · Vencidas: <strong>{coverage.resumo.vencida}</strong> · Nunca revisadas: <strong>{coverage.resumo.nunca_revisada}</strong> · Revisadas sem regra: <strong>{coverage.resumo.revisado_sem_regra}</strong> · Pendentes: <strong>{coverage.resumo.pendentes}</strong>{coverage.truncado ? ` · Exibindo as ${coverage.limite} primeiras` : ""}</p>
        {coverage.identidades.length === 0 ? <UiState variant="empty" title="Nenhuma identidade de equipe ativa" detail="Cadastre ou reative uma conta de equipe para acompanhar a revisão periódica." /> : <UiTableScroll><table className={styles.table}><thead><tr><th scope="col">Identidade</th><th scope="col">Papel</th><th scope="col">Última revisão</th><th scope="col">Dias</th><th scope="col">Situação</th></tr></thead><tbody>{coverage.identidades.map(row => <tr key={row.identity_id}>
          <td><strong>{row.email || "E-mail não informado"}</strong><small><code>{row.identity_id}</code></small></td>
          <td>{row.papel || "Sem perfil de equipe"}</td>
          <td>{row.ultima_revisao_em ? dateTime(row.ultima_revisao_em) : "Sem revisão registrada"}{row.revisoes_registradas > 0 && <small>{row.revisoes_registradas} revisão(ões) registrada(s)</small>}</td>
          <td>{row.dias_desde_ultima_revisao === null ? "—" : row.dias_desde_ultima_revisao}</td>
          <td><span className={row.pendente ? styles.coveragePendente : styles.coverageNeutra}>{COVERAGE_SITUATIONS[row.situacao] || row.situacao}</span></td>
        </tr>)}</tbody></table></UiTableScroll>}
      </>}
    </section>

    {error && <UiState variant="error" title="Não foi possível consultar as permissões" detail={error} onRetry={() => void load()} retryLabel="Tentar novamente" />}

    <section className={styles.list} aria-labelledby="active-permissions-title">
      <div className={styles.sectionTitle}><div><h3 id="active-permissions-title">Acessos ativos <span className={styles.count}>{loading ? "…" : filtered.length}</span></h3><p>Lista limitada a até 200 concessões ativas, conforme retorno do servidor. Filtre os resultados visíveis.</p></div><button type="button" className={styles.secondary} disabled={loading || busy} onClick={() => void load()}>Atualizar lista</button></div>
      <label className={styles.filter}>Filtrar por pessoa, área, escopo ou motivo<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Digite para filtrar os resultados carregados" /></label>
      {loading ? <UiState variant="loading" title="Carregando permissões ativas" /> : !error && filtered.length === 0 ? <UiState variant="empty" title={perms.length ? "Nenhum resultado para esse filtro" : "Nenhuma permissão ativa encontrada"} detail={perms.length ? "Altere o termo de busca ou limpe o filtro." : "Quando existirem concessões, elas aparecerão aqui."} /> : !error && <UiTableScroll><table className={styles.table}>
        <thead><tr><th scope="col">Pessoa</th><th scope="col">Acesso concedido</th><th scope="col">Escopo</th><th scope="col">Motivo</th><th scope="col">Concedido em</th><th scope="col">Ação</th></tr></thead>
        <tbody>{filtered.map(permission => <tr key={permission.id}>
          <td><strong>{permission.email}</strong><small>{permission.kind === "staff" ? "Equipe" : permission.kind === "client" ? "Cliente" : permission.kind}</small><details><summary>Identificadores técnicos</summary><code>Identidade: {permission.identity_id}</code><code>Permissão: {permission.permission}</code><code>Escopo: {permission.scope_id || "Sem identificador específico"}</code></details></td>
          <td><strong>{permissionName(permission.permission)}</strong><small><code>{permission.permission}</code></small></td>
          <td>{SCOPES[permission.scope_type] || permission.scope_type}{permission.scope_type === "team" && <small className={styles.scopeWarning}>Não efetivo no avaliador atual</small>}</td>
          <td className={styles.reason}>{permission.reason}</td><td>{dateTime(permission.created_at)}{permission.granted_by_role && <small>Perfil que concedeu: {permission.granted_by_role}</small>}</td>
          <td><button type="button" className={styles.danger} disabled={busy} onClick={() => void revoke(permission)}>Revogar</button></td>
        </tr>)}</tbody>
      </table></UiTableScroll>}
    </section>
    <p className={styles.auditNote}>Toda concessão e revogação exige motivo. A API tenta registrar o evento em <code>auth_access_audit</code>, mas a resposta da operação não depende de confirmar essa escrita auxiliar. A verificação de permissão é feita no servidor e nega acesso por padrão quando falha. O comportamento efetivo deve ser conferido na operação protegida, não apenas nesta lista.</p>
  </UiTaskWorkspace>;
}
