"use client";

// EXT-07 — tela interna de staff. Critério: "Vencimento gera tarefa e
// documento privado". Nada aqui simula upload, bytes, checksum, malware scan,
// armazenamento verificado ou download: a referência documental é declarada.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

type Row = Record<string, unknown>;

const box: CSSProperties = { background: "white", border: "1px solid #d1d5db", borderRadius: 12, padding: 16, marginBottom: 16 };
const input: CSSProperties = { padding: 8, border: "1px solid #9ca3af", borderRadius: 6, minWidth: 200, margin: 4 };
const alertBox: CSSProperties = { ...box, borderColor: "#dc2626", background: "#fef2f2" };

async function readJson(response: Response): Promise<Row> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as Row;
  } catch {
    return { error: raw.slice(0, 200) || response.statusText };
  }
}

function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

const OBLIGATION_TYPES = ["licenca", "certidao", "seguro", "alvara", "contrato", "obrigacao_legal", "outro"];
const DOCUMENT_TYPES = ["licenca", "certidao", "seguro", "alvara", "outro"];
const REFERENCE_TYPES = ["referencia_declarada", "protocolo_interno", "registro_externo_declarado"];

export default function ComplianceWorkspace() {
  const [obligations, setObligations] = useState<Row[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Chave preservada por operação: retry do usuário não duplica registro.
  const keys = useRef<Record<string, string>>({});

  const [obligation, setObligation] = useState({
    obligation_type: "licenca", title: "", description: "", declared_source: "",
    applicability_scope: "", applicability_justification: "", validity_rule: "",
    criticality: "media", responsible_identity: "",
  });
  const [document, setDocument] = useState({
    obligation_id: "", title: "", description: "", compliance_type: "licenca",
    issue_date: "", effective_start_date: "", expiry_date: "",
    reference_type: "referencia_declarada", declared_reference: "", reference_source: "",
  });
  const [renewal, setRenewal] = useState({ document_id: "", issue_date: "", expiry_date: "", renewal_justification: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/ext/compliance/obligations", { headers: { accept: "application/json" } }),
        fetch("/api/ext/compliance/documents", { headers: { accept: "application/json" } }),
        fetch("/api/ext/compliance/tasks", { headers: { accept: "application/json" } }),
      ]);
      const [a, b, c] = await Promise.all(responses.map(readJson));
      const failed = responses.find(response => !response.ok);
      if (failed) throw new Error(asString(a.error || b.error || c.error) || `HTTP ${failed.status}`);
      setObligations((a.items as Row[]) || []);
      setDocuments((b.items as Row[]) || []);
      setTasks((c.items as Row[]) || []);
      setMeta({
        obligations_denominator: a.denominator, documents_denominator: b.denominator,
        tasks_denominator: c.denominator, base_date: a.base_date,
        file_boundary: b.file_boundary, legal_validation: a.legal_validation_note,
        projection: b.projection, continuous_monitoring: c.continuous_monitoring,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o backend canônico");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function mutate(name: string, url: string, value: unknown): Promise<Row> {
    const key = keys.current[name] || `ext07-${name}-${crypto.randomUUID()}`;
    keys.current[name] = key;
    setError("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(value),
    });
    const body = await readJson(response);
    if (!response.ok) {
      setError(`${asString(body.error) || response.status}. Chave preservada para retry seguro.`);
      throw new Error(asString(body.error));
    }
    delete keys.current[name];
    return body;
  }

  async function submitObligation(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate("obligation", "/api/ext/compliance/obligations", obligation);
      setNotice("Obrigação registrada com fonte e aplicabilidade declaradas (sem validação jurídica).");
      await load();
    } catch { /* erro já exibido */ }
  }

  async function submitDocument(event: FormEvent) {
    event.preventDefault();
    try {
      const payload = { ...document, effective_start_date: document.effective_start_date || undefined };
      await mutate("document", "/api/ext/compliance/documents", payload);
      setNotice("Referência privada registrada. Ela não é arquivo armazenado nem verificado.");
      await load();
    } catch { /* erro já exibido */ }
  }

  async function submitRenewal(event: FormEvent) {
    event.preventDefault();
    try {
      const { document_id: id, ...rest } = renewal;
      await mutate("renewal", `/api/ext/compliance/documents/${id}/renew`, rest);
      setNotice("Renovação registrada como nova versão; a versão anterior foi preservada.");
      await load();
    } catch { /* erro já exibido */ }
  }

  async function evaluate() {
    try {
      const body = await mutate("evaluate", "/api/ext/compliance/evaluate", {});
      setNotice(`Avaliação na data-base ${asString(body.base_date)} do servidor: ${asString(body.tasks_created)} tarefa(s) criada(s), ${asString(body.expired)} documento(s) vencido(s).`);
      await load();
    } catch { /* erro já exibido */ }
  }

  async function transition(id: string, action: "start" | "complete" | "cancel") {
    const extra = action === "complete"
      ? { result: window.prompt("Resultado da conclusão (mínimo 10 caracteres):") || "" }
      : action === "cancel"
        ? { justification: window.prompt("Justificativa do cancelamento (mínimo 10 caracteres):") || "" }
        : {};
    try {
      await mutate(`task-${id}-${action}`, `/api/ext/compliance/tasks/${id}/${action}`, extra);
      setNotice(`Tarefa ${action} registrada com autoria da sessão.`);
      await load();
    } catch { /* erro já exibido */ }
  }

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc" }}>
      <h1>Compliance corporativo — EXT-07</h1>
      <p><strong>Critério:</strong> vencimento gera tarefa e documento privado.</p>
      <p>
        Jornada <strong>interna de equipe</strong>. A referência documental é privada e declarada:
        não representa upload, bytes, checksum, malware scan, armazenamento verificado ou download.
        Fonte e aplicabilidade são declaradas pela equipe, sem validação jurídica e sem confirmação por órgão público.
      </p>
      {loading && <p role="status">Carregando dados reais do backend canônico…</p>}
      {error && (
        <div role="alert" style={alertBox}>
          {error} <button type="button" onClick={() => void load()}>Tentar novamente</button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}

      <section style={box}>
        <h2>Obrigação aplicável</h2>
        <form onSubmit={submitObligation}>
          <select style={input} value={obligation.obligation_type} onChange={e => setObligation({ ...obligation, obligation_type: e.target.value })}>
            {OBLIGATION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          {(["title", "description", "declared_source", "applicability_scope", "applicability_justification", "validity_rule", "responsible_identity"] as const).map(field => (
            <input key={field} required style={input} placeholder={field} value={obligation[field]}
              onChange={e => setObligation({ ...obligation, [field]: e.target.value })} />
          ))}
          <select style={input} value={obligation.criticality} onChange={e => setObligation({ ...obligation, criticality: e.target.value })}>
            {["baixa", "media", "alta", "critica"].map(level => <option key={level} value={level}>{level}</option>)}
          </select>
          <button type="submit">Registrar obrigação</button>
        </form>
        <p>Sem seed: lista vazia é ausência de registro declarado, não ausência de risco.</p>
      </section>

      <section style={box}>
        <h2>Referência documental privada</h2>
        <form onSubmit={submitDocument}>
          <select style={input} required value={document.obligation_id} onChange={e => setDocument({ ...document, obligation_id: e.target.value })}>
            <option value="">Obrigação canônica</option>
            {obligations.map(row => <option key={asString(row.id)} value={asString(row.id)}>{asString(row.title)}</option>)}
          </select>
          <select style={input} value={document.compliance_type} onChange={e => setDocument({ ...document, compliance_type: e.target.value })}>
            {DOCUMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          {(["title", "description", "declared_reference", "reference_source"] as const).map(field => (
            <input key={field} required style={input} placeholder={field} value={document[field]}
              onChange={e => setDocument({ ...document, [field]: e.target.value })} />
          ))}
          <select style={input} value={document.reference_type} onChange={e => setDocument({ ...document, reference_type: e.target.value })}>
            {REFERENCE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          {(["issue_date", "effective_start_date", "expiry_date"] as const).map(field => (
            <input key={field} required={field !== "effective_start_date"} style={input} type="date" title={field}
              value={document[field]} onChange={e => setDocument({ ...document, [field]: e.target.value })} />
          ))}
          <button type="submit">Registrar referência privada</button>
        </form>
      </section>

      <section style={box}>
        <h2>Renovação (nova versão, sem sobrescrita)</h2>
        <form onSubmit={submitRenewal}>
          <select style={input} required value={renewal.document_id} onChange={e => setRenewal({ ...renewal, document_id: e.target.value })}>
            <option value="">Documento atual</option>
            {documents.filter(row => row.is_current === true).map(row => (
              <option key={asString(row.id)} value={asString(row.id)}>{asString(row.protocol)} — v{asString(row.version_no)}</option>
            ))}
          </select>
          <input required style={input} type="date" title="issue_date" value={renewal.issue_date} onChange={e => setRenewal({ ...renewal, issue_date: e.target.value })} />
          <input required style={input} type="date" title="expiry_date" value={renewal.expiry_date} onChange={e => setRenewal({ ...renewal, expiry_date: e.target.value })} />
          <input required style={input} placeholder="renewal_justification" value={renewal.renewal_justification} onChange={e => setRenewal({ ...renewal, renewal_justification: e.target.value })} />
          <button type="submit">Registrar renovação</button>
        </form>
        <p>A versão anterior permanece intacta no histórico e recebe substituição formal.</p>
      </section>

      <section style={box}>
        <h2>Avaliação temporal</h2>
        <button type="button" onClick={() => void evaluate()}>Avaliar vencimentos na data-base do servidor</button>
        <p>{asString(meta.continuous_monitoring) || "A avaliação é uma operação administrativa explícita."}</p>
      </section>

      <section style={box}>
        <h2>Obrigações ({asString(meta.obligations_denominator)})</h2>
        {!loading && !obligations.length && <p>Nenhuma obrigação registrada no backend canônico.</p>}
        <ul>
          {obligations.map(row => (
            <li key={asString(row.id)}>
              {asString(row.title)} · {asString(row.obligation_type)} · {asString(row.criticality)} · {asString(row.status)} ·
              {" "}responsável canônico {asString(row.responsible_name) || asString(row.responsible_identity)}
            </li>
          ))}
        </ul>

        <h2>Documentos / referências ({asString(meta.documents_denominator)})</h2>
        {!loading && !documents.length && <p>Nenhuma referência canônica registrada.</p>}
        <ul>
          {documents.map(row => (
            <li key={asString(row.id)}>
              {asString(row.protocol)} — v{asString(row.version_no)} · {asString(row.status)} ·
              {" "}validade {asString(row.expiry_date) || "sem vencimento declarado"} ·
              {" "}privado {String(row.is_private)} · {row.is_current ? "versão atual" : "versão substituída"} ·
              {" "}nº {asString(row.document_number_masked) || "não informado"}
            </li>
          ))}
        </ul>

        <h2>Tarefas de vencimento ({asString(meta.tasks_denominator)})</h2>
        {!loading && !tasks.length && <p>Nenhuma tarefa gerada. Ausência de tarefa não é prova de conformidade.</p>}
        <ul>
          {tasks.map(row => (
            <li key={asString(row.id)}>
              {asString(row.rule)} · período {asString(row.validity_period)} · data-base {asString(row.evaluation_date)} ·
              {" "}vencimento {asString(row.due_date)} · {asString(row.status)}
              {" "}
              {row.status === "aberta" && <button type="button" onClick={() => void transition(asString(row.id), "start")}>Iniciar</button>}
              {(row.status === "aberta" || row.status === "em_andamento") && (
                <>
                  <button type="button" onClick={() => void transition(asString(row.id), "complete")}>Concluir</button>
                  <button type="button" onClick={() => void transition(asString(row.id), "cancel")}>Cancelar</button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section style={box}>
        <h2>Fronteiras declaradas</h2>
        <ul>
          <li>{asString(meta.file_boundary) || "Referência declarada não é arquivo verificado."}</li>
          <li>{asString(meta.legal_validation) || "Sem validação jurídica e sem confirmação por órgão público."}</li>
          <li>Projeção de listagem: {asString(meta.projection) || "minimizada"} (sem chave de armazenamento, sem URL privada, sem número documental completo).</li>
          <li>Data-base das avaliações: {asString(meta.base_date) || "definida pelo PostgreSQL"}.</li>
        </ul>
      </section>
    </main>
  );
}
