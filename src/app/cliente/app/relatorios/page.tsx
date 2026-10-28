"use client";
import {workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useRef, useState } from "react";
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

// UX-PRO-ID3: a leitura alimenta a lista E os botões/observações de aceite.
// Sem o vínculo com a conta, um relatório de A continuava clicável sob B e a
// mensagem/rascunho da conta anterior sobreviviam à troca.
type ReportsRead = {
  accountId: string;
  reports: Report[];
  readAt: string;
};
type ReportsReadError = { accountId: string; message: string };

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

function readFailureMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (/^Sua sessão|^Seu acesso|^O registro|^O serviço|^Confira|^A resposta/.test(raw)) {
    return raw.replace(/\s*\(HTTP \d+, [^)]*\)$/, "");
  }
  return "Não foi possível carregar os relatórios agora. Tente novamente.";
}

function actionFailureMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (raw && !/failed to fetch|networkerror|load failed/i.test(raw)) return raw;
  return "Não foi possível conectar agora. Tente novamente em instantes.";
}

function formatReadTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "horário não informado" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ClientReportsPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [read, setRead] = useState<ReportsRead | null>(null);
  const [readError, setReadError] = useState<ReportsReadError | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const latestRequest = useRef(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "success" | "error">("idle");

  const loadReports = useCallback(async (accountId: string) => {
    const requestId = ++latestRequest.current;
    setReadLoading(true);
    setReadError(null);
    try {
      const response = await workspaceFetch(`/api/client/reports?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const data = await response.json() as { reports: Report[] };
      // Um 200 com corpo inesperado não é "nenhum relatório": é falha de leitura.
      if (!Array.isArray(data.reports)) throw new Error("A resposta não trouxe a lista de relatórios. Tente novamente.");
      if (requestId !== latestRequest.current) return;
      setRead({ accountId, reports: data.reports, readAt: new Date().toISOString() });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setReadError({ accountId, message: readFailureMessage(error) });
    } finally {
      if (requestId !== latestRequest.current) return;
      setReadLoading(false);
    }
  }, []);

  useEffect(() => {
    // Rascunhos, mensagem de aceite e operação em andamento pertencem à conta
    // anterior: nenhum deles pode sobreviver à troca.
    setNotes({});
    setMessage("");
    setState("idle");
    setBusy(null);
    if (!activeAccount || activeAccount.status !== "active") {
      latestRequest.current += 1;
      setRead(null);
      setReadError(null);
      setReadLoading(false);
      return;
    }
    void loadReports(activeAccount.id);
  }, [activeAccount, loadReports]);

  const currentRead = activeAccount?.id === read?.accountId ? read : null;
  const currentError = activeAccount?.id === readError?.accountId ? readError : null;

  async function acknowledge(report: Report) {
    if (!activeAccount) return;
    const accountId = activeAccount.id;
    // Defesa em profundidade: o servidor já valida o vínculo, mas a UI não deve
    // enviar um PATCH para um relatório que não veio da conta ativa.
    if (!currentRead || !currentRead.reports.some(item => item.id === report.id)) {
      setState("error");
      setMessage("O relatório selecionado não pertence a esta conta. Recarregue a leitura.");
      return;
    }
    setBusy(report.id);
    setMessage("");
    setState("idle");
    try {
      // fetch direto: workspaceFetch consumiria o corpo do 400/403 e o mapa de
      // mensagens nunca seria alcançado.
      const response = await fetch(`/api/client/reports/${report.id}/acknowledge`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: notes[report.id] ?? "" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; replayed?: boolean };
      if (!response.ok) {
        const messages: Record<string, string> = {
          report_not_published: "Este relatório ainda não foi publicado para aceite.",
          report_acknowledgement_too_short: "A observação deve ter pelo menos 3 caracteres ou ficar vazia.",
          report_acknowledgement_too_long: "Observação muito longa (máx. 500 caracteres).",
          invalid_report_id: "Não foi possível identificar este relatório. Recarregue a página.",
          report_not_found: "Este relatório não está mais disponível. Recarregue a página.",
          invalid_request: "Não foi possível entender a observação enviada. Revise o texto.",
          forbidden: "Seu acesso não permite registrar ciência neste relatório.",
          client_session_required: "Sua sessão expirou. Entre novamente.",
        };
        setState("error");
        setMessage(messages[payload.error ?? ""] ?? "Não foi possível registrar o aceite agora.");
        return;
      }
      setState("success");
      setMessage(payload.replayed
        ? "Aceite/ciência já estava registrado no histórico do relatório."
        : "Aceite/ciência registrado no histórico do relatório.");
      await loadReports(accountId);
    } catch (error) {
      setState("error");
      setMessage(actionFailureMessage(error));
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

  const inactive = activeAccount.status !== "active";

  return (
    <section className={appStyles.sectionCard} aria-labelledby="reports-title" aria-busy={readLoading}>
      <span className={styles.badge}>
        <ClipboardCheck size={12} aria-hidden="true" />
        {activeAccount.display_name}
      </span>
      <h2 id="reports-title" className={appStyles.sectionTitle}>Relatórios publicados</h2>
      <p className={appStyles.sectionHint}>
        Relatórios revisados e aprovados pela equipe. Rascunhos ou relatórios rejeitados não são exibidos neste portal.
      </p>
      {inactive ? (
        <div className={appStyles.suspendedNote}>
          Este cadastro não está ativo. Os relatórios não são exibidos enquanto a situação não é regularizada.
        </div>
      ) : (
        <>
          {message ? (
            <p className={`${styles.message} ${state === "success" ? styles.messageSuccess : styles.messageError}`} role="status">
              {message}
            </p>
          ) : null}
          {currentError ? (
            <p className={`${styles.message} ${styles.messageError}`} role="alert">
              <span>{currentError.message}</span>
              <button className={appStyles.retryButton} type="button" onClick={() => void loadReports(activeAccount.id)}>
                <RotateCw size={13} aria-hidden="true" />
                Tentar novamente
              </button>
            </p>
          ) : null}
          {currentError && currentRead ? (
            <p className={appStyles.sectionHint} role="status">
              Os dados abaixo são da Última leitura concluída às {formatReadTime(currentRead.readAt)}. A nova consulta falhou e nada foi apagado.
            </p>
          ) : null}
          {readLoading || !currentRead ? (
            <div className={appStyles.loadingWrapWide} role={currentError ? undefined : "status"}>
              <span className={styles.spinner} aria-hidden="true" />
              {currentError ? "Aguardando uma leitura concluída…" : "Carregando relatórios…"}
            </div>
          ) : currentRead.reports.length === 0 ? (
            <div className={appStyles.emptyState}>Nenhum relatório aprovado para este cadastro.</div>
          ) : (
            <ul className={appStyles.list}>
              {currentRead.reports.map(report => {
                const status = reportStatus[report.status] ?? { text: report.status, chip: appStyles.chipOpen };
                return (
                  <li key={report.id} className={appStyles.listItem}>
                    <div className={appStyles.listItemMain}>
                      <p className={appStyles.listItemTitle}>{report.title}</p>
                      <p className={appStyles.listItemMeta}>
                        {reportTypeLabel[report.report_type] ?? report.report_type} · publicado em {new Date(report.approved_at ?? report.created_at).toLocaleString("pt-BR")}
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
        </>
      )}
    </section>
  );
}
