"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Item = Record<string, any>;
const box: React.CSSProperties = { background: "white", border: "1px solid #d1d5db", borderRadius: 12, padding: 16, marginBottom: 16 };
const input: React.CSSProperties = { padding: 8, border: "1px solid #9ca3af", borderRadius: 6, minWidth: 190 };

async function read(r: Response) {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { error: t || r.statusText }; }
}

export default function ComplianceWorkspace() {
  const [obligations, setObligations] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Item[]>([]);
  const [tasks, setTasks] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const keys = useRef<Record<string, string>>({});
  const [ob, setOb] = useState({ obligation_type: "licenca", title: "", description: "", declared_source: "", applicability_scope: "", applicability_justification: "", validity_rule: "", responsible_identity: "" });
  const [doc, setDoc] = useState({ obligation_id: "", title: "", description: "", compliance_type: "licenca", issue_date: "", expiry_date: "", declared_reference: "", reference_source: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [a, b, c] = await Promise.all([
        fetch("/api/ext/compliance/obligations"),
        fetch("/api/ext/compliance/documents"),
        fetch("/api/ext/compliance/tasks"),
      ]);
      const [x, y, z] = await Promise.all([read(a), read(b), read(c)]);
      if (!a.ok || !b.ok || !c.ok) throw new Error(x.error || y.error || z.error);
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
      const b = await read(r);
      if (!r.ok) throw new Error(b.error || String(r.status));
      delete keys.current[name];
      return b;
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Falha"}. Chave de idempotência preservada para retry seguro.`);
      throw e;
    }
  }

  async function createOb(e: FormEvent) { e.preventDefault(); try { await mutate("obligation", "/api/ext/compliance/obligations", ob); setNotice("Obrigação aplicável registrada pelo servidor."); await load(); } catch { } }
  async function createDoc(e: FormEvent) { e.preventDefault(); try { await mutate("document", "/api/ext/compliance/documents", { ...doc, reference_type: "referencia_declarada" }); setNotice("Referência privada registrada; não representa arquivo verificado."); await load(); } catch { } }
  async function evaluate() { try { const b = await mutate("evaluate", "/api/ext/compliance/evaluate", {}); setNotice(`Avaliação ${b.evaluation_date} (data do servidor): ${b.tasks_created} tarefa(s) criada(s); ${b.blocked_missing_responsible || 0} bloqueada(s) por falta de responsável ativo.`); await load(); } catch { } }
  async function taskAction(id: string, action: "start" | "complete" | "cancel") {
    const body = action === "complete" ? { result: window.prompt("Resultado da conclusão (mínimo 10 caracteres):") || "" } : action === "cancel" ? { justification: window.prompt("Justificativa do cancelamento (mínimo 10 caracteres):") || "" } : {};
    try { await mutate(`task-${action}-${id}`, `/api/ext/compliance/tasks/${id}/${action}`, body); setNotice(`Tarefa ${action === "start" ? "iniciada" : action === "complete" ? "concluída" : "cancelada"}.`); await load(); } catch { }
  }

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc" }}>
      <h1>Compliance corporativo — EXT-07</h1>
      <p><strong>Critério:</strong> vencimento gera tarefa e documento privado.</p>
      <p>Jornada interna de staff. A referência documental é privada e declarada: não representa upload, bytes, checksum, varredura de malware, armazenamento verificado ou download.</p>
      {loading && <p role="status">Carregando dados reais do backend…</p>}
      {error && <div role="alert" style={{ ...box, borderColor: "#dc2626" }}>{error} <button onClick={() => void load()}>Tentar novamente</button></div>}
      {notice && <p role="status">{notice}</p>}

      <section style={box}>
        <h2>Obrigação aplicável</h2>
        <form onSubmit={createOb}>
          {(["title", "description", "declared_source", "applicability_scope", "applicability_justification", "validity_rule", "responsible_identity"] as const).map(k => (
            <input key={k} required style={input} placeholder={k} value={(ob as any)[k]} onChange={e => setOb({ ...ob, [k]: e.target.value })} />
          ))}
          <button type="submit">Registrar obrigação</button>
        </form>
        <p>Sem seed: lista vazia não significa zero risco; agregados declaram fonte e denominador.</p>
      </section>

      <section style={box}>
        <h2>Documento / referência privada</h2>
        <form onSubmit={createDoc}>
          <select style={input} required value={doc.obligation_id} onChange={e => setDoc({ ...doc, obligation_id: e.target.value })}>
            <option value="">Obrigação canônica</option>
            {obligations.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
          {(["title", "description", "issue_date", "expiry_date", "declared_reference", "reference_source"] as const).map(k => (
            <input key={k} required={k !== "reference_source"} style={input} type={k.includes("date") ? "date" : "text"} placeholder={k} value={(doc as any)[k]} onChange={e => setDoc({ ...doc, [k]: e.target.value })} />
          ))}
          <button type="submit">Registrar referência</button>
        </form>
        <button onClick={() => void evaluate()}>Avaliar vencimentos na data do servidor</button>
        <p>A avaliação usa exclusivamente a data do banco de dados; o relógio do navegador nunca decide o estado de uma obrigação.</p>
      </section>

      <section style={box}>
        <h2>Obrigações</h2>
        {!loading && !obligations.length && <p>Nenhuma obrigação no backend canônico.</p>}
        <ul>{obligations.map(o => <li key={o.id}>{o.title} · {o.status} · responsável canônico {o.responsible_name || o.responsible_identity}</li>)}</ul>
        <h2>Documentos (versão corrente)</h2>
        {!loading && !docs.length && <p>Nenhum documento/referência canônica.</p>}
        <ul>{docs.map(d => <li key={d.id}>{d.protocol} — {d.title} · {d.status} · validade {d.expiry_date || "sem vencimento declarado"} · privado {String(d.is_private)} · versão {d.version_no}{d.superseded_at ? " (substituído)" : ""}</li>)}</ul>
        <h2>Tarefas de vencimento</h2>
        {!loading && !tasks.length && <p>Nenhuma tarefa gerada; execute a avaliação de vencimentos para tornar isso verificável.</p>}
        <ul>
          {tasks.map(t => (
            <li key={t.id}>
              {t.rule} · venc. {t.due_date} · {t.status}
              {t.status === "aberta" && <button onClick={() => void taskAction(t.id, "start")}>Iniciar</button>}
              {["aberta", "em_andamento"].includes(t.status) && <button onClick={() => void taskAction(t.id, "complete")}>Concluir</button>}
              {["aberta", "em_andamento"].includes(t.status) && <button onClick={() => void taskAction(t.id, "cancel")}>Cancelar</button>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
