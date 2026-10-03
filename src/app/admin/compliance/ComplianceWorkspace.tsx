"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Item = Record<string, any>;
const box: React.CSSProperties = { background: "white", border: "1px solid #d1d5db", borderRadius: 12, padding: 16, marginBottom: 16 };
const input: React.CSSProperties = { padding: 8, border: "1px solid #9ca3af", borderRadius: 6, minWidth: 190, margin: "2px 4px 2px 0" };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 6, border: "1px solid #111827", background: "#111827", color: "white", cursor: "pointer", margin: "2px 4px 2px 0" };
const btnAlt: React.CSSProperties = { ...btn, background: "white", color: "#111827" };
const warn: React.CSSProperties = { background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 8, padding: 10, marginBottom: 12 };

async function read(r: Response) { const t = await r.text(); try { return JSON.parse(t); } catch { return { error: t || r.statusText }; } }
const asDate = (v: any) => (v ? String(v).slice(0, 10) : "—");

export default function ComplianceWorkspace() {
  const [obligations, setObligations] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Item[]>([]);
  const [tasks, setTasks] = useState<Item[]>([]);
  const [detail, setDetail] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [meta, setMeta] = useState<Item>({});
  const keys = useRef<Record<string, string>>({});
  const [ob, setOb] = useState({ obligation_type: "licenca", title: "", description: "", declared_source: "", applicability_scope: "", applicability_justification: "", validity_rule: "", responsible_identity: "", criticality: "media" });
  const [doc, setDoc] = useState({ obligation_id: "", title: "", description: "", compliance_type: "licenca", issue_date: "", effective_start_date: "", expiry_date: "", reference_type: "referencia_declarada", declared_reference: "", reference_source: "", document_number: "", issuer: "" });
  const [ren, setRen] = useState({ id: "", issue_date: "", effective_start_date: "", expiry_date: "", reference_type: "renovacao_declarada", declared_reference: "", justification: "" });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [a, b, c] = await Promise.all([
        fetch("/api/ext/compliance/obligations"), fetch("/api/ext/compliance/documents"), fetch("/api/ext/compliance/tasks"),
      ]);
      const [x, y, z] = await Promise.all([read(a), read(b), read(c)]);
      if (!a.ok || !b.ok || !c.ok) throw Error(x.error || y.error || z.error);
      setObligations(x.items || []); setDocs(y.items || []); setTasks(z.items || []);
      setMeta({ obligations: y.denominator, absence: y.absence_is_not_zero, tasks: z.denominator });
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function mutate(op: string, url: string, value: unknown) {
    const key = keys.current[op] || `ext07-${op}-${crypto.randomUUID()}`;
    keys.current[op] = key; setError(""); setNotice("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(value) });
      const b = await read(r);
      if (!r.ok) throw Error(`${r.status}: ${b.error || "falha"}`);
      delete keys.current[op];
      return b;
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Falha"}. Chave de idempotência preservada — reenvie com segurança.`);
      throw e;
    }
  }

  async function createObligation(e: FormEvent) {
    e.preventDefault();
    try { await mutate("obligation", "/api/ext/compliance/obligations", ob); setNotice("Obrigação registrada (autoria derivada da sessão)."); await load(); } catch {}
  }
  async function createDocument(e: FormEvent) {
    e.preventDefault();
    try {
      const v = { ...doc, effective_start_date: doc.effective_start_date || undefined, document_number: doc.document_number || undefined, issuer: doc.issuer || undefined, reference_source: doc.reference_source || undefined };
      await mutate("document", "/api/ext/compliance/documents", v);
      setNotice("Versão 1 registrada. Referência privada declarada — não é arquivo verificado.");
      await load();
    } catch {}
  }
  async function renewDocument(e: FormEvent) {
    e.preventDefault();
    try {
      const v = { issue_date: ren.issue_date, effective_start_date: ren.effective_start_date || undefined, expiry_date: ren.expiry_date, reference_type: ren.reference_type, declared_reference: ren.declared_reference, justification: ren.justification };
      const b = await mutate(`renew-${ren.id}`, `/api/ext/compliance/documents/${ren.id}/renew`, v);
      setNotice(`Renovação registrada como versão ${b.version_no}; versão anterior preservada no histórico.`);
      setRen({ id: "", issue_date: "", effective_start_date: "", expiry_date: "", reference_type: "renovacao_declarada", declared_reference: "", justification: "" });
      await load();
    } catch {}
  }
  async function evaluate() {
    try { const b = await mutate("evaluate", "/api/ext/compliance/evaluate", {}); setNotice(`Avaliação na data do servidor ${b.evaluation_date}: ${b.evaluated} documento(s) vigente(s)/ponta, ${b.tasks_created} tarefa(s) nova(s), ${b.marked_expiring_soon} a vencer.`); await load(); } catch {}
  }
  async function taskAction(task: Item, action: "start" | "complete" | "cancel") {
    const op = `task-${task.id}-${action}`;
    const value = action === "complete" ? { result: window.prompt("Resultado da conclusão (obrigatório, mín. 10 caracteres):") || "" } : action === "cancel" ? { justification: window.prompt("Justificativa do cancelamento (obrigatória, mín. 10 caracteres):") || "" } : {};
    try { await mutate(op, `/api/ext/compliance/tasks/${task.id}/${action}`, value); setNotice(`Tarefa ${action === "start" ? "iniciada" : action === "complete" ? "concluída" : "cancelada"}.`); await load(); } catch {}
  }
  async function openDetail(id: string) {
    const r = await fetch(`/api/ext/compliance/documents/${id}`); const b = await read(r);
    if (r.ok) setDetail(b); else setError(b.error || "Falha ao abrir detalhe");
  }

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc" }}>
      <h1>Compliance corporativo — EXT-07</h1>
      <p><strong>Critério:</strong> vencimento gera tarefa e documento privado, sob um único escritor canônico.</p>
      <p>Jornada interna de staff (admin/ti). Documentos canônicos são <em>referências privadas declaradas e versionadas</em>: não representam upload, bytes, checksum, malware scan, armazenamento verificado ou download. Declarações de fonte são registro rastreável, não parecer jurídico nem confirmação de órgão público.</p>
      {loading && <p role="status">Carregando dados reais do backend…</p>}
      {error && <div role="alert" style={{ ...box, borderColor: "#dc2626" }}>{error} <button onClick={() => void load()}>Tentar novamente</button></div>}
      {notice && <p role="status" style={warn as React.CSSProperties}>{notice}</p>}

      <section style={box}>
        <h2>Registrar obrigação aplicável</h2>
        <form onSubmit={createObligation}>
          <select style={input} value={ob.obligation_type} onChange={e => setOb({ ...ob, obligation_type: e.target.value })}>
            {["licenca", "certidao", "seguro", "alvara", "outro"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={input} value={ob.criticality} onChange={e => setOb({ ...ob, criticality: e.target.value })}>
            {["baixa", "media", "alta", "critica"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {(["title", "description", "declared_source", "applicability_scope", "applicability_justification", "validity_rule", "responsible_identity"] as const).map(k => (
            <input key={k} required style={{ ...input, minWidth: k.includes("justification") || k === "description" ? 300 : 190 }} placeholder={k}
              value={ob[k]} onChange={e => setOb({ ...ob, [k]: e.target.value })} />
          ))}
          <button type="submit" style={btn}>Registrar obrigação</button>
        </form>
        <p><small>Sem seed institucional: lista vazia real não significa risco zero. Agregados declaram fonte, denominador e distinguem ausência de zero.</small></p>
      </section>

      <section style={box}>
        <h2>Versão 1 de documento (referência privada declarada)</h2>
        <form onSubmit={createDocument}>
          <select style={input} required value={doc.obligation_id} onChange={e => setDoc({ ...doc, obligation_id: e.target.value })}>
            <option value="">Obrigação canônica…</option>
            {obligations.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
          <select style={input} value={doc.compliance_type} onChange={e => setDoc({ ...doc, compliance_type: e.target.value })}>
            {["licenca", "certidao", "seguro", "alvara", "outro"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {(["title", "description", "declared_reference"] as const).map(k => (
            <input key={k} required style={{ ...input, minWidth: 240 }} placeholder={k} value={doc[k]} onChange={e => setDoc({ ...doc, [k]: e.target.value })} />
          ))}
          <input style={input} placeholder="issuer (opcional)" value={doc.issuer} onChange={e => setDoc({ ...doc, issuer: e.target.value })} />
          <input style={input} placeholder="document_number (opcional, parcialmente mascarado)" value={doc.document_number} onChange={e => setDoc({ ...doc, document_number: e.target.value })} />
          <input style={input} placeholder="reference_source (opcional)" value={doc.reference_source} onChange={e => setDoc({ ...doc, reference_source: e.target.value })} />
          <label>Emissão <input required type="date" style={input} value={doc.issue_date} onChange={e => setDoc({ ...doc, issue_date: e.target.value })} /></label>
          <label>Início vigência <input type="date" style={input} value={doc.effective_start_date} onChange={e => setDoc({ ...doc, effective_start_date: e.target.value })} /></label>
          <label>Vencimento <input required type="date" style={input} value={doc.expiry_date} onChange={e => setDoc({ ...doc, expiry_date: e.target.value })} /></label>
          <button type="submit" style={btn}>Registrar versão 1</button>
        </form>
      </section>

      <section style={box}>
        <h2>Avaliação temporal e renovação (nova versão vinculada)</h2>
        <button onClick={() => void evaluate()} style={btn}>Avaliar vencimentos na data do servidor</button>
        <small> A regra é explícita: <code>expiry_at_or_before_evaluation_date</code>; data-base = <code>CURRENT_DATE</code> do PostgreSQL; o relógio do cliente é rejeitado. Falha fechado sem responsável staff ativo.</small>
        <form onSubmit={renewDocument} style={{ marginTop: 10 }}>
          <select style={input} required value={ren.id} onChange={e => setRen({ ...ren, id: e.target.value })}>
            <option value="">Versão atual a renovar…</option>
            {docs.map(d => <option key={d.id} value={d.id}>{d.protocol} · v{d.version_no} · {d.title} ({d.status}, até {asDate(d.expiry_date)})</option>)}
          </select>
          <input required style={input} placeholder="declared_reference da nova versão" value={ren.declared_reference} onChange={e => setRen({ ...ren, declared_reference: e.target.value })} />
          <input required style={{ ...input, minWidth: 280 }} placeholder="justificativa formal da renovação (mín. 10)" value={ren.justification} onChange={e => setRen({ ...ren, justification: e.target.value })} />
          <label>Emissão <input required type="date" style={input} value={ren.issue_date} onChange={e => setRen({ ...ren, issue_date: e.target.value })} /></label>
          <label>Início vigência <input type="date" style={input} value={ren.effective_start_date} onChange={e => setRen({ ...ren, effective_start_date: e.target.value })} /></label>
          <label>Vencimento <input required type="date" style={input} value={ren.expiry_date} onChange={e => setRen({ ...ren, expiry_date: e.target.value })} /></label>
          <button type="submit" style={btnAlt}>Renovar como nova versão</button>
        </form>
      </section>

      <section style={box}>
        <h2>Obrigações ({obligations.length})</h2>
        {!loading && !obligations.length && <p>Nenhuma obrigação no backend canônico (ausência distinta de zero).</p>}
        <ul>
          {obligations.map(o => <li key={o.id}><strong>{o.title}</strong> · {o.obligation_type} · {o.criticality} · {o.status} · responsável canônico {o.responsible_name || o.responsible_identity} · regra: <code>{o.validity_rule}</code></li>)}
        </ul>
        <h2>Versões atuais de documentos ({docs.length})</h2>
        {!loading && !docs.length && <p>Nenhum documento canônico vigente. Linhas anteriores à 153 permanecem <code>registro_legado</code> sem prova retroativa.</p>}
        <ul>
          {docs.map(d => (
            <li key={d.id}>
              <button style={btnAlt} onClick={() => void openDetail(d.id)}>{d.protocol}</button>
              {" "}<strong>{d.title}</strong> · v{d.version_no} · {d.status} · validade {asDate(d.expiry_date)} · privado {String(d.is_private)} · {d.reference_type}
            </li>
          ))}
        </ul>
        {detail && (
          <div style={{ ...box, background: "#f1f5f9" }}>
            <h3>Detalhe autorizado (allowlist)</h3>
            <p><strong>{detail.document.protocol}</strong> · v{detail.document.version_no} · {detail.document.status}</p>
            <p>Emissão {asDate(detail.document.issue_date)} · início {asDate(detail.document.effective_start_date)} · vencimento {asDate(detail.document.expiry_date)} · avaliado em {asDate(detail.document.evaluation_date)}</p>
            <p>Número documental: {detail.document.document_number_masked ?? "não declarado"} (nunca completo)</p>
            <p>Referência: declarada ({detail.document.reference?.type}) — <em>não é arquivo</em>: {detail.file_boundary}</p>
            <p>Linhagem: anterior {detail.document.predecessor ? detail.document.predecessor.protocol : "—"} · sucessora {detail.document.successor ? detail.document.successor.protocol : "—"}</p>
            <button style={btnAlt} onClick={() => setDetail(null)}>Fechar</button>
          </div>
        )}
        <h2>Tarefas por vencimento ({tasks.length})</h2>
        {!loading && !tasks.length && <p>Nenhuma tarefa. A tarefa nasce somente da avaliação temporal — operação administrativa explícita; execução agendada futura é necessária para monitoramento contínuo.</p>}
        <ul>
          {tasks.map(t => (
            <li key={t.id}>
              <strong>{t.status}</strong> · regra <code>{t.rule}</code> · período {t.validity_period} · base {asDate(t.evaluation_date)} · vence {asDate(t.due_date)} · responsável {t.responsible_name || t.responsible_identity}
              {" "}{t.status === "aberta" && <button style={btnAlt} onClick={() => void taskAction(t, "start")}>Iniciar</button>}
              {["aberta", "em_andamento"].includes(t.status) && <>
                <button style={btnAlt} onClick={() => void taskAction(t, "complete")}>Concluir</button>
                <button style={btnAlt} onClick={() => void taskAction(t, "cancel")}>Cancelar</button>
              </>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
