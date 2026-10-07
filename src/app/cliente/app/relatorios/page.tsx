"use client";
import {workspaceResponse,workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, CheckCircle2, RotateCw } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type ReportStatus = "approved" | "sent" | "acknowledged";
type ReportType = "execution" | "measurement" | "acceptance" | "other";

type Report = {
  id: string;
  report_type: ReportType;
  title: string;
  summary: string;
  period_start: string | null;
  period_end: string | null;
  status: ReportStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  created_at: string;
  updated_at: string;
};

const reportStatus: Record<ReportStatus, { text: string; chip: string }> = {
  approved: { text: "Aprovado", chip: appStyles.chipResolved },
  sent: { text: "Enviado", chip: appStyles.chipProgress },
  acknowledged: { text: "Aceito/Ciente", chip: appStyles.chipResolved },
};

const reportTypeLabel: Record<ReportType, string> = {
  execution: "Execução",
  measurement: "Medição",
  acceptance: "Aceite",
  other: "Outro",
};

const actionErrors: Record<string, string> = {
  report_not_published: "Este relatório ainda não foi publicado para aceite.",
  report_acknowledgement_too_short: "A observação deve ter pelo menos 3 caracteres ou ficar vazia.",
  report_acknowledgement_too_long: "Observação muito longa (máx. 500 caracteres).",
};

export default function ClientReportsPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "success" | "error">("idle");

  const loadReports = useCallback((accountId: string) => {
    setLoadError("");
    workspaceFetch(`/api/client/reports?account=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) await workspaceResponse(response);
        const data = (await workspaceResponse(response)) as { reports: Report[] };
        setReports(data.reports);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os relatórios agora."));
  }, []);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      setReports(null);
      return;
    }
    loadReports(activeAccount.id);
  }, [activeAccount, loadReports]);

  async function acknowledge(report: Report) {
    setBusy(report.id);
    setMessage("");
    try {
      const response = await workspaceFetch(`/api/client/reports/${report.id}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: notes[report.id] ?? "" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState("error");
        setMessage(actionErrors[payload.error ?? ""] ?? "Não foi possível registrar o aceite agora.");
        return;
      }
      setState("success");
      setMessage("Aceite/ciência registrado no histórico do relatório.");
      if (activeAccount) loadReports(activeAccount.id);
    } catch {
      setState("error");
      setMessage("Não foi possível conectar agora. Tente novamente em instantes.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className={appStyles.loadingWrapWide}>
        <span className={styles.spinner} aria-hidden="true" />
        Verificando sua sessão…
      </div>
    );
  }

  if (!activeAccount) {
    if (notice) {
      return (
        <section className={appStyles.sectionCard} aria-labelledby="reports-title">
          <h2 id="reports-title" className={appStyles.sectionTitle}>Relatórios</h2>
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <span>{notice}</span>
            <button className={appStyles.retryButton} type="button" onClick={() => reload()}>
              <RotateCw size={13} aria-hidden="true" />
              Tentar novamente
            </button>
          </p>
        </section>
      );
    }
    return <div className={appStyles.emptyState}>Sua identidade ainda não foi vinculada a um cadastro de cliente.</div>;
  }

  return (
    <section className={appStyles.sectionCard} aria-labelledby="reports-title">
      <span className={styles.badge}>
        <ClipboardCheck size={12} aria-hidden="true" />
        {activeAccount.display_name}
      </span>
      <h2 id="reports-title" className={appStyles.sectionTitle}>Relatórios publicados</h2>
      <p className={appStyles.sectionHint}>
        Relatórios revisados e aprovados pela equipe. Rascunhos ou relatórios rejeitados não são exibidos neste portal.
      </p>
      {message ? (
        <p className={`${styles.message} ${state === "success" ? styles.messageSuccess : styles.messageError}`} role="status">
          {message}
        </p>
      ) : null}
      {loadError ? (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          <span>{loadError}</span>
          <button className={appStyles.retryButton} type="button" onClick={() => loadReports(activeAccount.id)}>
            <RotateCw size={13} aria-hidden="true" />
            Tentar novamente
          </button>
        </p>
      ) : !reports ? (
        <div className={appStyles.loadingWrapWide}>
          <span className={styles.spinner} aria-hidden="true" />
          Carregando relatórios…
        </div>
      ) : reports.length === 0 ? (
        <div className={appStyles.emptyState}>Nenhum relatório aprovado para este cadastro.</div>
      ) : (
        <ul className={appStyles.list}>
          {reports.map(report => {
            const status = reportStatus[report.status];
            return (
              <li key={report.id} className={appStyles.listItem}>
                <div className={appStyles.listItemMain}>
                  <p className={appStyles.listItemTitle}>{report.title}</p>
                  <p className={appStyles.listItemMeta}>
                    {reportTypeLabel[report.report_type]} · publicado em {new Date(report.approved_at ?? report.created_at).toLocaleString("pt-BR")}
                    {report.period_start ? ` · período ${new Date(`${report.period_start}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                    {report.period_end ? ` a ${new Date(`${report.period_end}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <span className={`${appStyles.chip} ${status.chip}`}>{status.text}</span>
                <p className={appStyles.listItemDetail}>{report.summary}</p>
                {report.review_notes ? (
                  <div className={appStyles.responseBox}>
                    <strong>Revisão da equipe</strong>
                    {report.review_notes}
                  </div>
                ) : null}
                {report.acknowledged_at ? (
                  <div className={appStyles.responseBox}>
                    <strong>Ciência registrada</strong>
                    {new Date(report.acknowledged_at).toLocaleString("pt-BR")}
                    {report.acknowledgement_note ? ` · ${report.acknowledgement_note}` : ""}
                  </div>
                ) : (
                  <div className={appStyles.inlineAction}>
                    <textarea
                      className={appStyles.textarea}
                      value={notes[report.id] ?? ""}
                      maxLength={500}
                      onChange={event => setNotes(current => ({ ...current, [report.id]: event.target.value }))}
                      placeholder="Observação opcional para o aceite/ciência"
                    />
                    <button className={appStyles.retryButton} type="button" disabled={busy === report.id} onClick={() => void acknowledge(report)}>
                      <CheckCircle2 size={13} aria-hidden="true" />
                      {busy === report.id ? "Registrando…" : "Registrar aceite/ciência"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
