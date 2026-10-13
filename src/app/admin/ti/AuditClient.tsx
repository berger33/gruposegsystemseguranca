"use client";

import { useEffect, useState } from "react";
import UiField from "@/components/ui/UiField";
import UiState from "@/components/ui/UiState";
import UiTableScroll from "@/components/ui/UiTableScroll";
import styles from "./TechnicalOpsClient.module.css";

type Audit = {
  id: string;
  actor_kind: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  result: string;
  detail_category: string;
  created_at: string;
};

const ERROR_LABELS: Record<string, string> = {
  admin_session_required: "Entre novamente para consultar a auditoria.",
  same_origin_required: "A solicitação foi recusada pela proteção de origem.",
  audit_unavailable: "A auditoria está temporariamente indisponível. Tente novamente.",
  audit_export_unavailable: "Não foi possível preparar a exportação. Tente novamente.",
  database_not_configured: "O banco de dados não está configurado neste ambiente.",
};

function errorLabel(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return ERROR_LABELS[code] ?? "Não foi possível concluir a operação. Tente novamente.";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR");
}

export default function AuditClient() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [filters, setFilters] = useState({ action: "", result: "", actorKind: "", from: "", to: "" });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams();
      if (filters.action) params.set("action", filters.action);
      if (filters.result) params.set("result", filters.result);
      if (filters.actorKind) params.set("actorKind", filters.actorKind);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      params.set("limit", "100");
      const res = await fetch(`/api/admin/audit?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setAudits(Array.isArray(data.audits) ? data.audits : []);
      setTotal(typeof data.total === "number" ? data.total : null);
      setLoaded(true);
    } catch (e) {
      setError(errorLabel(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function exportJson() {
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/audit/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, format: "json" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `auditoria-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice(`Arquivo JSON preparado com ${data.exported ?? 0} registro(s). A exportação foi registrada na auditoria.`);
    } catch (e) {
      setError(errorLabel(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="audit-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Acesso e governança · PLT-02</p>
          <h2 id="audit-title">Auditoria de ações</h2>
          <p>Consulte eventos por período, responsável, ação e resultado. O acesso é restrito à equipe administrativa de TI.</p>
        </div>
        <div className={styles.count} aria-label={total === null ? "Total não disponível" : `${total} registros encontrados`}>
          <strong>{total === null ? "—" : total.toLocaleString("pt-BR")}</strong>
          <span>registros encontrados</span>
        </div>
      </header>

      <form className={styles.filters} onSubmit={event => { event.preventDefault(); void load(); }} aria-label="Filtros da auditoria">
        <UiField id="audit-action" label="Ação" hint="Ex.: login, permission_grant" value={filters.action} onChange={e => setFilters({ ...filters, action: e.target.value })} />
        <label className={styles.field} htmlFor="audit-result"><span>Resultado</span>
          <select id="audit-result" value={filters.result} onChange={e => setFilters({ ...filters, result: e.target.value })}>
            <option value="">Todos os resultados</option>
            <option value="allowed">Permitido</option>
            <option value="denied">Negado</option>
            <option value="error">Erro</option>
          </select>
        </label>
        <UiField id="audit-actor" label="Tipo de responsável" hint="Ex.: staff, ti, rh" value={filters.actorKind} onChange={e => setFilters({ ...filters, actorKind: e.target.value })} />
        <UiField id="audit-from" label="Data inicial" type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} />
        <UiField id="audit-to" label="Data final" type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} />
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={loading}>{loading ? "Consultando…" : "Aplicar filtros"}</button>
          <button type="button" onClick={() => void exportJson()} disabled={exporting}>{exporting ? "Preparando…" : "Baixar JSON auditado"}</button>
        </div>
      </form>

      {error && <UiState variant="error" title="Consulta não concluída" detail={error} onRetry={() => void load()} />}
      {notice && <UiState variant="success" title="Exportação preparada" detail={notice} />}
      {loading && !loaded && <UiState variant="loading" title="Consultando eventos de auditoria" detail="A lista será atualizada após a resposta do servidor." />}
      {!loading && !error && loaded && audits.length === 0 && <UiState variant="empty" title="Nenhum evento corresponde aos filtros" detail="A consulta foi concluída sem registros. Ajuste o período ou remova alguns filtros." />}

      {audits.length > 0 && (
        <UiTableScroll>
          <table className={styles.table}>
            <caption>Até 100 eventos recentes nesta consulta. Total encontrado: {total?.toLocaleString("pt-BR") ?? "não informado"}.</caption>
            <thead><tr><th scope="col">Data e hora</th><th scope="col">Responsável</th><th scope="col">Ação</th><th scope="col">Alvo</th><th scope="col">Resultado</th><th scope="col">Categoria</th></tr></thead>
            <tbody>{audits.map(a => (
              <tr key={a.id}>
                <td>{dateLabel(a.created_at)}</td>
                <td><span className={styles.code}>{a.actor_kind}</span><span className={styles.secondary}>{a.actor_id || "Identidade não registrada"}</span></td>
                <td><span className={styles.code}>{a.action}</span></td>
                <td className={styles.target}>{a.target || "—"}</td>
                <td><span className={`${styles.badge} ${styles[`result_${a.result}`] ?? ""}`}>{a.result === "allowed" ? "Permitido" : a.result === "denied" ? "Negado" : a.result === "error" ? "Erro" : a.result}</span></td>
                <td>{a.detail_category || "Sem categoria"}</td>
              </tr>
            ))}</tbody>
          </table>
        </UiTableScroll>
      )}
      <p className={styles.footnote}>A consulta e a exportação são registradas como eventos de auditoria. A lista mostra até 100 eventos por consulta; o arquivo de exportação segue o limite da API.</p>
    </section>
  );
}
