"use client";

import { useEffect, useState, type FormEvent } from "react";

type Report = {
  id: string;
  protocol: string;
  title: string;
  report_type: string;
  period_start: string;
  period_end: string;
  status: string;
  totals?: Record<string, unknown> | null;
  total_records?: number | null;
  recipient_emails?: string[] | null;
  generated_at?: string | null;
  sent_at?: string | null;
};

const REPORT_TYPES = ["comercial", "operacional", "financeiro", "qualidade", "satisfacao", "compliance"];

const key = (label: string) => `ext13-ui-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function ReportsWorkspace() {
  const [reports, setReports] = useState<Report[]>([]);
  const [title, setTitle] = useState("Relatório mensal comercial");
  const [reportType, setReportType] = useState("comercial");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [recipients, setRecipients] = useState("");
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/ext/reports/periodic", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Falha ao carregar relatórios");
    setReports(data.items || []);
    if (!selected && data.items?.[0]?.id) setSelected(data.items[0].id);
  }

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao carregar relatórios"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const emails = recipients.split(",").map((item) => item.trim()).filter(Boolean);
    const response = await fetch("/api/ext/reports/periodic", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key("create") },
      body: JSON.stringify({
        title,
        report_type: reportType,
        period_start: periodStart,
        period_end: periodEnd,
        recipient_emails: emails,
        change_summary: "Definição de relatório criada pela interface EXT-13",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || "Falha ao criar relatório");
    setMessage(`Relatório ${data.report.protocol} criado em rascunho.`);
    setSelected(data.report.id);
    await load();
  }

  async function act(path: string, body: Record<string, unknown>, label: string) {
    const id = selected || reports[0]?.id;
    if (!id) return setError("Crie ou selecione um relatório antes.");
    setError("");
    setMessage("");
    const response = await fetch(`/api/ext/reports/periodic/${id}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": key(label) },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || `Falha em ${label}`);
    setMessage(data.note || `Ação ${label} registrada.`);
    await load();
    await showDetail(id);
  }

  async function showDetail(id?: string) {
    const target = id || selected || reports[0]?.id;
    if (!target) return;
    const response = await fetch(`/api/ext/reports/periodic/${target}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setDetail(data);
  }

  return (
    <main style={{ maxWidth: 1180, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p style={{ color: "#64748b", letterSpacing: 1 }}>EXT-13 · F09</p>
      <h1>Relatórios periódicos</h1>
      <p>
        Consolidação de métricas contadas de tabelas internas reais por período declarado, com aprovação humana,
        geração auditada e envio registrado. Esta tela <strong>não usa os handlers legados como cobertura</strong>,
        não envia e-mails (SMTP permanece pendente), não gera arquivos e não aciona fornecedor externo.
      </p>
      <p style={{ background: "#eff6ff", color: "#1e3a8a", padding: 12, borderRadius: 8 }}>
        O envio registrado é um registro interno autorizado: os destinatários precisam ser staff ativos e nenhuma
        mensagem externa é disparada. Todas as mutações usam Idempotency-Key e trilha imutável.
      </p>

      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {message && <p role="status" style={{ color: "#166534" }}>{message}</p>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 24 }}>
        <form onSubmit={createReport} style={{ display: "grid", gap: 10, border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
          <h2>Nova definição de relatório</h2>
          <input aria-label="Título" placeholder="Título" minLength={5} required value={title} onChange={(event) => setTitle(event.target.value)} />
          <label>
            Tipo (fontes internas fixas)
            <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
              {REPORT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Início do período
            <input aria-label="Início do período" type="date" required value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
          </label>
          <label>
            Fim do período
            <input aria-label="Fim do período" type="date" required value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </label>
          <input aria-label="Destinatários staff" placeholder="E-mails staff separados por vírgula" required value={recipients} onChange={(event) => setRecipients(event.target.value)} />
          <button type="submit">Criar definição</button>
        </form>

        <div style={{ border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
          <h2>Ciclo de vida</h2>
          <label>
            Relatório selecionado
            <select value={selected} onChange={(event) => { setSelected(event.target.value); void showDetail(event.target.value); }}>
              <option value="">Selecione</option>
              {reports.map((report) => <option key={report.id} value={report.id}>{report.protocol} · {report.status}</option>)}
            </select>
          </label>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={() => void act("/transition", { status: "em_revisao" }, "revisao")}>Enviar para revisão</button>
            <button type="button" onClick={() => void act("/transition", { status: "aprovado", approval_note: "Aprovação humana registrada pela interface EXT-13." }, "aprovacao")}>Aprovar</button>
            <button type="button" onClick={() => void act("/generate", { generation_note: "Geração contada das fontes internas pela interface EXT-13." }, "geracao")}>Gerar totais</button>
            <button type="button" onClick={() => void act("/send", { send_note: "Envio registrado internamente pela interface EXT-13; nenhum e-mail disparado." }, "envio")}>Registrar envio autorizado</button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 28, border: "1px solid #cbd5e1", padding: 16, borderRadius: 12 }}>
        <h2>Relatórios canônicos</h2>
        {reports.length === 0 ? <p>Nenhum relatório canônico registrado. Sem dados não há consolidação — nada é inventado.</p> : reports.map((report) => (
          <article key={report.id} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, marginTop: 10 }}>
            <strong>{report.protocol}</strong> · {report.title} · {report.report_type} · {report.status}
            <br /><small>Período {String(report.period_start).slice(0, 10)} a {String(report.period_end).slice(0, 10)} · {report.total_records ?? 0} registros contados · destinatários: {(report.recipient_emails || []).join(", ") || "—"}</small>
          </article>
        ))}
      </section>

      {detail && (
        <section aria-label="Detalhe do relatório" style={{ marginTop: 28, border: "1px solid #93c5fd", background: "#f8fafc", padding: 16, borderRadius: 12 }}>
          <h2>Detalhe e trilha</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>{JSON.stringify(detail, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
