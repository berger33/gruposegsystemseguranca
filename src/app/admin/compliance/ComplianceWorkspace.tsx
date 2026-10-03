"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Item = Record<string, any>;
const box: React.CSSProperties = { background: "white", border: "1px solid #d1d5db", borderRadius: 12, padding: 16, marginBottom: 16 };
const input: React.CSSProperties = { padding: 8, border: "1px solid #9ca3af", borderRadius: 6, minWidth: 190, margin: 2 };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 6, border: "1px solid #334155", background: "#1e293b", color: "white", cursor: "pointer", margin: 2 };

async function readBody(r: Response) { const t = await r.text(); try { return JSON.parse(t); } catch { return { error: t || r.statusText }; } }

export default function ComplianceWorkspace() {
  const [obligations, setObligations] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Item[]>([]);
  const [tasks, setTasks] = useState<Item[]>([]);
  const [detail, setDetail] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const keys = useRef<Record<string, string>>({});
  const [ob, setOb] = useState({ obligation_type: "licenca", title: "", description: "", declared_source: "", applicability_scope: "", applicability_justification: "", validity_rule: "", responsible_identity: "" });
  const [doc, setDoc] = useState({ obligation_id: "", title: "", description: "", compliance_type: "licenca", issue_date: "", expiry_date: "", reference_type: "referencia_declarada", declared_reference: "", reference_source: "" });
  const [renew, setRenew] = useState({ id: "", issue_date: "", expiry_date: "", declared_reference: "", renewal_justification: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [a, b, c] = await Promise.all([fetch("/api/ext/compliance/obligations"), fetch("/api/ext/compliance/documents"), fetch("/api/ext/compliance/tasks")]);
      const [x, y, z] = await Promise.all([readBody(a), readBody(b), readBody(c)]);
      if (!a.ok || !b.ok || !c.ok) throw Error(x.error || y.error || z.error);
      setObligations(x.items || []); setDocs(y.items || []); setTasks(z.items || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function mutate(name: string, url: string, value: unknown) {
    const key = keys.current[name] || `ext07-${name}-${crypto.randomUUID()}`;
    keys.current[name] = key;
    setError("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(value) });
      const b = await readBody(r);
      if (!r.ok) throw Error(b.error || String(r.status));
      delete keys.current[name];
      return b;
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Falha"}. Chave de idempotência preservada para retry seguro sem duplicação.`);
      throw e;
    }
  }

  async function createOb(e: FormEvent) { e.preventDefault(); try { await mutate("obligation", "/api/ext/compliance/obligations", ob); setNotice("Obrigação aplicável registrada com autoria derivada da sessão."); await load(); } catch {} }
  async function createDoc(e: FormEvent) { e.preventDefault(); try { await mutate("document", "/api/ext/compliance/documents", doc); setNotice("Referência privada confirmada pelo servidor; ela não é um arquivo verificado."); await load(); } catch {} }
  async function evaluate() { try { const b = await mutate("evaluate", "/api/ext/compliance/evaluate", {}); setNotice(`Avaliação na data do servidor ${b.evaluation_date}: ${b.tasks_created} tarefa(s) criada(s), ${b.blocked_without_responsible?.length ?? 0} bloqueada(s) sem responsável ativo.`); await load(); } catch {} }
  async function renewDoc(e: FormEvent) { e.preventDefault(); try { await mutate("renew", `/api/ext/compliance/documents/${renew.id}/renew`, { issue_date: renew.issue_date, expiry_date: renew.expiry_date, declared_reference: renew.declared_reference, reference_type: "referencia_declarada", renewal_justification: renew.renewal_justification }); setNotice("Renovação formal registrada como nova versão; histórico preservado."); setRenew({ id: "", issue_date: "", expiry_date: "", declared_reference: "", renewal_justification: "" }); await load(); } catch {} }
  async function taskAction(t: Item, action: "start" | "complete" | "cancel") {
    const label = action === "complete" ? "resultado (mín. 10 caracteres)" : action === "cancel" ? "justificativa (mín. 10 caracteres)" : "";
    const value = label ? window.prompt(`Informe ${label}:`) || "" : "";
    if (action === "complete" && !value) return;
    if (action === "cancel" && !value) return;
    try {
      await mutate(`task-${t.id}-${action}`, `/api/ext/compliance/tasks/${t.id}/${action}`, action === "complete" ? { result: value } : action === "cancel" ? { justification: value } : {});
      setNotice(`Tarefa ${t.document_protocol}: transição '${action}' confirmada pelo servidor.`);
      await load();
    } catch {}
  }
  async function openDetail(id: string) {
    setDetail(null);
    try {
      const r = await fetch(`/api/ext/compliance/documents/${id}`);
      const b = await readBody(r);
      if (!r.ok) throw Error(b.error || String(r.status));
      setDetail(b.document);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao abrir detalhe"); }
  }

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc" }}>
      <h1>Compliance corporativo — EXT-07</h1>
      <p><strong>Critério:</strong> vencimento gera tarefa e documento privado.</p>
      <p>Jornada exclusivamente interna de staff. A referência documental é privada e declarada: não representa upload, bytes, checksum, malware scan, armazenamento verificado ou download. A data-base de toda avaliação é exclusivamente o relógio do servidor.</p>
      {loading && <p role="status">Carregando dados reais do backend…</p>}
      {error && <div role="alert" style={{ ...box, borderColor: "#dc2626" }}>{error} <button style={btn} onClick={() => void load()}>Tentar novamente</button></div>}
      {notice && <p role="status">{notice}</p>}

      <section style={box}>
        <h2>Obrigação aplicável</h2>
        <form onSubmit={createOb}>
          {(["title", "description", "declared_source", "applicability_scope", "applicability_justification", "validity_rule", "responsible_identity"] as const).map(k => (
            <input key={k} required style={input} placeholder={k} value={ob[k]} onChange={e => setOb({ ...ob, [k]: e.target.value })} />
          ))}
          <button style={btn} type="submit">Registrar obrigação</button>
        </form>
        <p>Sem seed: vazio real não significa zero risco; listagens informam fonte, denominador e distinguem ausência de zero.</p>
      </section>

      <section style={box}>
        <h2>Documento / referência privada</h2>
        <form onSubmit={createDoc}>
          <select style={input} required value={doc.obligation_id} onChange={e => setDoc({ ...doc, obligation_id: e.target.value })}>
            <option value="">Obrigação canônica</option>
            {obligations.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
          {(["title", "description", "issue_date", "expiry_date", "declared_reference", "reference_source"] as const).map(k => (
            <input key={k} required style={input} type={k.includes("date") ? "date" : "text"} placeholder={k} value={doc[k]} onChange={e => setDoc({ ...doc, [k]: e.target.value })} />
          ))}
          <button style={btn} type="submit">Registrar referência</button>
        </form>
        <button style={btn} onClick={() => void evaluate()}>Avaliar vencimentos na data do servidor</button>
        <p>A avaliação é uma operação administrativa explícita; execução agendada futura é necessária para monitoramento contínuo.</p>
      </section>

      <section style={box}>
        <h2>Renovação formal (nova versão, sem sobrescrita)</h2>
        <form onSubmit={renewDoc}>
          <select style={input} required value={renew.id} onChange={e => setRenew({ ...renew, id: e.target.value })}>
            <option value="">Documento atual a renovar</option>
            {docs.filter(d => d.is_current).map(d => <option key={d.id} value={d.id}>{d.protocol} — {d.title}</option>)}
          </select>
          <input required style={input} type="date" value={renew.issue_date} onChange={e => setRenew({ ...renew, issue_date: e.target.value })} />
          <input required style={input} type="date" value={renew.expiry_date} onChange={e => setRenew({ ...renew, expiry_date: e.target.value })} />
          <input required style={input} placeholder="declared_reference" value={renew.declared_reference} onChange={e => setRenew({ ...renew, declared_reference: e.target.value })} />
          <input required style={input} placeholder="renewal_justification" value={renew.renewal_justification} onChange={e => setRenew({ ...renew, renewal_justification: e.target.value })} />
          <button style={btn} type="submit">Renovar como nova versão</button>
        </form>
      </section>

      <section style={box}>
        <h2>Obrigações ({obligations.length})</h2>
        {!loading && !obligations.length && <p>Nenhuma obrigação no backend canônico.</p>}
        <ul>{obligations.map(o => <li key={o.id}>{o.title} · {o.status} · responsável canônico {o.responsible_name || o.responsible_identity}</li>)}</ul>

        <h2>Documentos ({docs.length})</h2>
        {!loading && !docs.length && <p>Nenhum documento/referência canônica.</p>}
        <ul>{docs.map(d => (
          <li key={d.id}>
            {d.protocol} — {d.title} · {d.status} · validade {d.expiry_date || "sem vencimento declarado"} · v{d.version_no}{d.is_current ? " (atual)" : " (histórico)"} · privado{" "}
            <button style={btn} onClick={() => void openDetail(d.id)}>Detalhe autorizado</button>
          </li>
        ))}</ul>
        {detail && (
          <div role="dialog" aria-label="Detalhe autorizado do documento" style={{ ...box, borderColor: "#0f766e" }}>
            <h3>{detail.protocol} — detalhe autorizado</h3>
            <p>Referência declarada: {detail.declared_reference} ({detail.reference_type}) · fonte {detail.reference_source || "não declarada"} · validade {detail.issue_date} → {detail.expiry_date} · regra {detail.validity_rule}</p>
            <p>Versão {detail.version_no} · substitui {detail.replacement_of || "—"} · superada por {detail.superseded_by || "—"} · fronteira: referência declarada, não arquivo verificado.</p>
            <button style={btn} onClick={() => setDetail(null)}>Fechar</button>
          </div>
        )}

        <h2>Tarefas de vencimento ({tasks.length})</h2>
        {!loading && !tasks.length && <p>Nenhuma tarefa canônica de compliance.</p>}
        <ul>{tasks.map(t => (
          <li key={t.id}>
            {t.document_protocol} · vence {t.due_date} · {t.status} · responsável {t.responsible_name || "—"}
            {t.status === "aberta" && <button style={btn} onClick={() => void taskAction(t, "start")}>Iniciar</button>}
            {(t.status === "aberta" || t.status === "em_andamento") && <button style={btn} onClick={() => void taskAction(t, "complete")}>Concluir</button>}
            {(t.status === "aberta" || t.status === "em_andamento") && <button style={btn} onClick={() => void taskAction(t, "cancel")}>Cancelar</button>}
          </li>
        ))}</ul>
      </section>
    </main>
  );
}
