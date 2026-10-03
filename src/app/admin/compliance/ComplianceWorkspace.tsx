"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Item = Record<string, any>;
const box: React.CSSProperties = { background: "white", border: "1px solid #d1d5db", borderRadius: 12, padding: 16, marginBottom: 16 };
const input: React.CSSProperties = { padding: 8, border: "1px solid #9ca3af", borderRadius: 6, minWidth: 190, margin: 3 };
async function read(response: Response) { const text = await response.text(); try { return JSON.parse(text); } catch { return { error: text || response.statusText }; } }
const initialDocument = { obligation_id: "", title: "", description: "", compliance_type: "licenca", document_number: "", issuer: "", issue_date: "", effective_start_date: "", expiry_date: "", reference_type: "referencia_declarada", declared_reference: "", reference_source: "" };

export default function ComplianceWorkspace() {
  const [obligations, setObligations] = useState<Item[]>([]);
  const [documents, setDocuments] = useState<Item[]>([]);
  const [tasks, setTasks] = useState<Item[]>([]);
  const [detail, setDetail] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const keys = useRef<Record<string, string>>({});
  const [obligation, setObligation] = useState({ obligation_type: "licenca", title: "", description: "", declared_source: "", applicability_scope: "", applicability_justification: "", validity_rule: "", renewal_lead_days: 30, criticality: "media", responsible_identity: "" });
  const [document, setDocument] = useState(initialDocument);
  const [renewalOf, setRenewalOf] = useState("");
  const [renewalJustification, setRenewalJustification] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/ext/compliance/obligations"),
        fetch("/api/ext/compliance/documents"),
        fetch("/api/ext/compliance/tasks"),
      ]);
      const bodies = await Promise.all(responses.map(read));
      const failed = responses.findIndex(response => !response.ok);
      if (failed >= 0) throw Error(bodies[failed].error || `HTTP ${responses[failed].status}`);
      setObligations(bodies[0].items || []); setDocuments(bodies[1].items || []); setTasks(bodies[2].items || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function mutate(operation: string, url: string, value: unknown) {
    const key = keys.current[operation] || `ext07-${operation}-${crypto.randomUUID()}`;
    keys.current[operation] = key; setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(value) });
      const body = await read(response);
      if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
      delete keys.current[operation];
      return body;
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Falha"}. A chave foi preservada para retry idêntico.`);
      throw cause;
    }
  }
  async function createObligation(event: FormEvent) {
    event.preventDefault();
    try { await mutate("obligation", "/api/ext/compliance/obligations", obligation); setNotice("Registro interno da obrigação declarado; isto não é validação jurídica nem confirmação de órgão público."); await load(); } catch {}
  }
  async function submitDocument(event: FormEvent) {
    event.preventDefault();
    const renewal = Boolean(renewalOf);
    const url = renewal ? `/api/ext/compliance/documents/${renewalOf}/renew` : "/api/ext/compliance/documents";
    const body = renewal ? { ...document, obligation_id: undefined, justification: renewalJustification } : document;
    try {
      await mutate(renewal ? `renew-${renewalOf}` : "document", url, body);
      setNotice(renewal ? "Nova versão registrada; a versão anterior foi formalmente substituída e preservada." : "Referência privada registrada; ela não é um arquivo verificado.");
      setDocument(initialDocument); setRenewalOf(""); setRenewalJustification(""); await load();
    } catch {}
  }
  async function evaluate() {
    try { const body = await mutate("evaluate", "/api/ext/compliance/evaluate", {}); setNotice(`Avaliação na data-base do servidor ${body.date_base}: ${body.tasks_created} tarefa(s) criada(s), denominador ${body.denominator}.`); await load(); } catch {}
  }
  async function transition(task: Item, operation: "start" | "complete" | "cancel") {
    const result = operation === "complete" ? window.prompt("Resultado da conclusão (mínimo 10 caracteres):") : null;
    const justification = operation === "cancel" ? window.prompt("Justificativa do cancelamento (mínimo 10 caracteres):") : null;
    if (operation === "complete" && !result) return;
    if (operation === "cancel" && !justification) return;
    try { await mutate(`task-${task.id}-${operation}`, `/api/ext/compliance/tasks/${task.id}/${operation}`, { result, justification }); setNotice("Transição da tarefa registrada com autoria e horário do servidor."); await load(); } catch {}
  }
  async function showDetail(id: string) {
    setError(""); const response = await fetch(`/api/ext/compliance/documents/${id}`); const body = await read(response);
    if (!response.ok) return setError(body.error || `HTTP ${response.status}`); setDetail(body);
  }

  return <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc" }}>
    <h1>Compliance corporativo — EXT-07</h1>
    <p><strong>Critério:</strong> vencimento gera tarefa e documento privado.</p>
    <p>Jornada interna de staff. A referência documental é privada e declarada: não representa upload, bytes, checksum, malware scan, armazenamento verificado ou download.</p>
    <p>A avaliação temporal é uma operação administrativa explícita; monitoramento contínuo ainda exige execução agendada futura.</p>
    {loading && <p role="status">Carregando dados reais do backend…</p>}
    {error && <div role="alert" style={{ ...box, borderColor: "#dc2626" }}>{error} <button onClick={() => void load()}>Tentar novamente</button></div>}
    {notice && <p role="status">{notice}</p>}

    <section style={box}><h2>Obrigação aplicável declarada</h2>
      <form onSubmit={createObligation}>
        <input required style={input} placeholder="tipo" value={obligation.obligation_type} onChange={e => setObligation({ ...obligation, obligation_type: e.target.value })} />
        {(["title", "description", "declared_source", "applicability_scope", "applicability_justification", "validity_rule", "responsible_identity"] as const).map(key => <input key={key} required style={input} placeholder={key} value={obligation[key]} onChange={e => setObligation({ ...obligation, [key]: e.target.value })} />)}
        <input required style={input} type="number" min={0} max={3650} value={obligation.renewal_lead_days} onChange={e => setObligation({ ...obligation, renewal_lead_days: Number(e.target.value) })} />
        <select style={input} value={obligation.criticality} onChange={e => setObligation({ ...obligation, criticality: e.target.value })}><option>baixa</option><option>media</option><option>alta</option><option>critica</option></select>
        <button type="submit">Registrar obrigação</button>
      </form>
      <p>Sem seed: ausência é exibida separadamente de zero. Fonte e aplicabilidade são declarações internas rastreáveis, não parecer jurídico.</p>
    </section>

    <section style={box}><h2>Documento / referência privada</h2>
      <form onSubmit={submitDocument}>
        <select style={input} value={renewalOf} onChange={e => setRenewalOf(e.target.value)}><option value="">Registro inicial</option>{documents.filter(item => item.is_current).map(item => <option key={item.id} value={item.id}>Renovar {item.protocol}</option>)}</select>
        {!renewalOf && <select style={input} required value={document.obligation_id} onChange={e => setDocument({ ...document, obligation_id: e.target.value })}><option value="">Obrigação canônica</option>{obligations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>}
        {(["title", "description", "document_number", "issuer", "declared_reference", "reference_source"] as const).map(key => <input key={key} required={!(["document_number", "issuer"] as string[]).includes(key)} style={input} placeholder={key} value={document[key]} onChange={e => setDocument({ ...document, [key]: e.target.value })} />)}
        {(["issue_date", "effective_start_date", "expiry_date"] as const).map(key => <input key={key} required style={input} type="date" value={document[key]} onChange={e => setDocument({ ...document, [key]: e.target.value })} />)}
        {renewalOf && <input required style={input} placeholder="justificativa da renovação" value={renewalJustification} onChange={e => setRenewalJustification(e.target.value)} />}
        <button type="submit">{renewalOf ? "Criar nova versão" : "Registrar referência"}</button>
      </form>
      <button onClick={() => void evaluate()}>Avaliar vencimentos na data do servidor</button>
    </section>

    <section style={box}><h2>Obrigações</h2>
      {!loading && !obligations.length && <p>Nenhuma obrigação declarada no backend canônico.</p>}
      <ul>{obligations.map(item => <li key={item.id}>{item.title} · {item.status} · fonte: {item.declared_source} · responsável {item.responsible_name || item.responsible_identity}</li>)}</ul>
      <h2>Documentos — projeção minimizada</h2>
      {!loading && !documents.length && <p>Nenhuma referência canônica.</p>}
      <ul>{documents.map(item => <li key={item.id}>{item.protocol} — {item.title} · {item.status} · versão {item.version_no} · atual {String(item.is_current)} · validade {item.expiry_date} · privado {String(item.is_private)} <button onClick={() => void showDetail(item.id)}>Detalhe autorizado</button></li>)}</ul>
      {detail && <div style={{ ...box, background: "#f1f5f9" }}><h3>Detalhe autorizado</h3><p>{detail.document.protocol} · referência declarada: {detail.document.declared_reference} · fonte: {detail.document.reference_source}</p><p>Este detalhe não contém storage_key, URL privada, download nem alegação de bytes.</p><button onClick={() => setDetail(null)}>Fechar</button></div>}
    </section>

    <section style={box}><h2>Tarefas de compliance</h2>
      {!loading && !tasks.length && <p>Nenhuma tarefa; ausência não significa zero risco.</p>}
      <ul>{tasks.map(task => <li key={task.id}>{task.status} · vencimento {task.due_date} · regra {task.rule} · data-base {task.evaluation_date} {task.status === "aberta" && <><button onClick={() => void transition(task, "start")}>Iniciar</button><button onClick={() => void transition(task, "cancel")}>Cancelar</button></>} {task.status === "em_andamento" && <><button onClick={() => void transition(task, "complete")}>Concluir</button><button onClick={() => void transition(task, "cancel")}>Cancelar</button></>}</li>)}</ul>
    </section>
  </main>;
}
