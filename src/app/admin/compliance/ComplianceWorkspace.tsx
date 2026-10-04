"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Item = Record<string, any>;
const box: React.CSSProperties = { background: "white", border: "1px solid #d1d5db", borderRadius: 12, padding: 16, marginBottom: 16 };
const input: React.CSSProperties = { padding: 8, border: "1px solid #9ca3af", borderRadius: 6, minWidth: 190, margin: 4 };
const note: React.CSSProperties = { color: "#334155", fontSize: 13 };

async function read(response: Response) {
  const payload = await response.text();
  try { return JSON.parse(payload); } catch { return { error: payload || response.statusText }; }
}

export default function ComplianceWorkspace() {
  const [obligations, setObligations] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Item[]>([]);
  const [tasks, setTasks] = useState<Item[]>([]);
  const [aggregates, setAggregates] = useState<Item>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const keys = useRef<Record<string, string>>({});

  const [ob, setOb] = useState({
    obligation_type: "licenca", title: "", description: "", declared_source: "",
    applicability_scope: "", applicability_justification: "", validity_rule: "", responsible_identity: "",
  });
  const [doc, setDoc] = useState({
    obligation_id: "", title: "", description: "", compliance_type: "licenca",
    issue_date: "", effective_start_date: "", expiry_date: "",
    reference_type: "referencia_declarada", declared_reference: "", reference_source: "",
  });
  const [renewal, setRenewal] = useState({ document_id: "", renewal_justification: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/ext/compliance/obligations"),
        fetch("/api/ext/compliance/documents"),
        fetch("/api/ext/compliance/tasks"),
      ]);
      const [a, b, c] = await Promise.all(responses.map(read));
      if (responses.some(response => !response.ok)) throw new Error(a.error || b.error || c.error || "Falha ao carregar");
      setObligations(a.items || []);
      setDocs(b.items || []);
      setTasks(c.items || []);
      setAggregates({
        obligations_denominator: a.denominator, documents_denominator: b.denominator,
        tasks_denominator: c.denominator, open_tasks: c.open_tasks,
        absence_is_not_zero: Boolean(a.absence_is_not_zero || b.absence_is_not_zero || c.absence_is_not_zero),
        generation: c.generation, file_boundary: b.file_boundary, evidence_boundary: a.evidence_boundary,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // A chave é preservada enquanto a mutação não confirma: o retry é idêntico e
  // não duplica entidade no backend.
  async function mutate(name: string, url: string, value: unknown) {
    const key = keys.current[name] || `ext07-${name}-${crypto.randomUUID()}`;
    keys.current[name] = key;
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify(value),
      });
      const body = await read(response);
      if (!response.ok) throw new Error(body.error || String(response.status));
      delete keys.current[name];
      return body;
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Falha"}. Chave preservada para retry seguro.`);
      throw cause;
    }
  }

  async function createOb(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate("obligation", "/api/ext/compliance/obligations", ob);
      setNotice("Obrigação registrada com fonte declarada internamente.");
      await load();
    } catch {}
  }
  async function createDoc(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate("document", "/api/ext/compliance/documents", doc);
      setNotice("Referência privada registrada. Ela não é arquivo verificado.");
      await load();
    } catch {}
  }
  async function renew(event: FormEvent) {
    event.preventDefault();
    try {
      await mutate("renewal", `/api/ext/compliance/documents/${renewal.document_id}/renew`, { ...doc, ...renewal });
      setNotice("Renovação registrada como nova versão; a anterior foi preservada.");
      await load();
    } catch {}
  }
  async function evaluate() {
    try {
      const body = await mutate("evaluate", "/api/ext/compliance/evaluate", {});
      setNotice(`Avaliação na data-base ${body.base_date}: ${body.facts?.tasks_created ?? 0} tarefa(s) criada(s), ${body.facts?.blocked_without_responsible ?? 0} bloqueada(s) sem responsável.`);
      await load();
    } catch {}
  }
  async function transition(id: string, action: "start" | "complete" | "cancel") {
    const payload: Record<string, string> = {};
    if (action === "complete") {
      const result = window.prompt("Resultado da conclusão (mínimo 10 caracteres):") || "";
      payload.result = result;
    }
    if (action === "cancel") {
      const justification = window.prompt("Justificativa do cancelamento (mínimo 10 caracteres):") || "";
      payload.justification = justification;
    }
    try {
      await mutate(`task-${id}-${action}`, `/api/ext/compliance/tasks/${id}/${action}`, payload);
      setNotice(`Tarefa ${action} confirmada pelo servidor.`);
      await load();
    } catch {}
  }

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc" }}>
      <h1>Compliance corporativo — EXT-07</h1>
      <p><strong>Critério:</strong> vencimento gera tarefa e documento privado.</p>
      <p style={note}>
        Jornada interna de staff. A referência documental é privada e declarada: não representa upload, bytes,
        checksum, malware scan, armazenamento verificado nem download. A fonte da obrigação é declarada
        internamente e não é validação jurídica nem confirmação por órgão público. A avaliação temporal é
        operação administrativa explícita: não há execução agendada contínua nesta entrega.
      </p>
      {loading && <p role="status">Carregando dados reais do backend…</p>}
      {error && (
        <div role="alert" style={{ ...box, borderColor: "#dc2626" }}>
          {error} <button onClick={() => void load()}>Tentar novamente</button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}

      <section style={box}>
        <h2>Obrigação aplicável</h2>
        <form onSubmit={createOb}>
          {(["title", "description", "declared_source", "applicability_scope", "applicability_justification", "validity_rule", "responsible_identity"] as const).map(field => (
            <input key={field} required style={input} placeholder={field} value={ob[field]} onChange={event => setOb({ ...ob, [field]: event.target.value })} />
          ))}
          <button type="submit">Registrar obrigação</button>
        </form>
        <p style={note}>Sem seed: ausência real não significa zero risco. Denominador de obrigações: {String(aggregates.obligations_denominator ?? "—")}.</p>
      </section>

      <section style={box}>
        <h2>Documento / referência privada</h2>
        <form onSubmit={createDoc}>
          <select style={input} required value={doc.obligation_id} onChange={event => setDoc({ ...doc, obligation_id: event.target.value })}>
            <option value="">Obrigação canônica</option>
            {obligations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          {(["title", "description", "issue_date", "effective_start_date", "expiry_date", "declared_reference", "reference_source"] as const).map(field => (
            <input key={field} required style={input} type={field.includes("date") ? "date" : "text"} placeholder={field} value={doc[field]} onChange={event => setDoc({ ...doc, [field]: event.target.value })} />
          ))}
          <button type="submit">Registrar referência</button>
        </form>
        <p style={note}>Estado e data-base vêm do relógio do servidor; o formulário não declara estado nem autoria.</p>
      </section>

      <section style={box}>
        <h2>Renovação (nova versão, sem sobrescrever)</h2>
        <form onSubmit={renew}>
          <select style={input} required value={renewal.document_id} onChange={event => setRenewal({ ...renewal, document_id: event.target.value })}>
            <option value="">Documento a renovar</option>
            {docs.filter(item => item.version_state === "atual").map(item => (
              <option key={item.id} value={item.id}>{item.protocol} — v{item.version_no}</option>
            ))}
          </select>
          <input style={input} required placeholder="renewal_justification" value={renewal.renewal_justification} onChange={event => setRenewal({ ...renewal, renewal_justification: event.target.value })} />
          <button type="submit">Renovar com os dados do formulário acima</button>
        </form>
        <p style={note}>A versão anterior é preservada e marcada como substituída; o histórico não é apagado.</p>
      </section>

      <section style={box}>
        <h2>Avaliação temporal</h2>
        <button onClick={() => void evaluate()}>Avaliar vencimentos na data-base do servidor</button>
        <p style={note}>Regra registrada por documento e período; a tarefa nasce na mesma transação da avaliação.</p>
      </section>

      <section style={box}>
        <h2>Obrigações</h2>
        {!loading && !obligations.length && <p>Nenhuma obrigação no backend canônico.</p>}
        <ul>
          {obligations.map(item => (
            <li key={item.id}>
              {item.title} · {item.status} · criticidade {item.criticality} · responsável canônico {item.responsible_name || item.responsible_identity}
            </li>
          ))}
        </ul>

        <h2>Documentos / referências</h2>
        {!loading && !docs.length && <p>Nenhum documento/referência canônica.</p>}
        <ul>
          {docs.map(item => (
            <li key={item.id}>
              {item.protocol} — {item.title} · {item.status} · v{item.version_no} ({item.version_state}) · validade {item.expiry_date || "sem vencimento declarado"} · privado {String(item.is_private)} · número {item.document_number_masked || "não informado"}
            </li>
          ))}
        </ul>

        <h2>Tarefas de vencimento</h2>
        {!loading && !tasks.length && <p>Nenhuma tarefa aberta. Ausência não é zero: o denominador é {String(aggregates.tasks_denominator ?? 0)}.</p>}
        <ul>
          {tasks.map(item => (
            <li key={item.id}>
              {item.status} · vence em {item.due_date} · data-base {item.base_date || item.evaluation_date} · regra {item.rule} · responsável {item.responsible_name || item.responsible_identity}
              {!["concluida", "cancelada"].includes(item.status) && (
                <>
                  {" "}
                  <button onClick={() => void transition(item.id, "start")}>Iniciar</button>
                  <button onClick={() => void transition(item.id, "complete")}>Concluir</button>
                  <button onClick={() => void transition(item.id, "cancel")}>Cancelar</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <p style={note}>
          Tarefas abertas: {String(aggregates.open_tasks ?? 0)}. Monitoramento contínuo depende de execução agendada futura, ainda não implementada.
        </p>
      </section>
    </main>
  );
}
