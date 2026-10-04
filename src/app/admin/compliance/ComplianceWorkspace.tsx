"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Item = Record<string, any>;

const box: React.CSSProperties = {
  background: "white",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const input: React.CSSProperties = {
  padding: 8,
  border: "1px solid #9ca3af",
  borderRadius: 6,
  minWidth: 190,
  marginRight: 8,
  marginBottom: 8,
};

async function read(r: Response) {
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    return { error: t || r.statusText };
  }
}

export default function ComplianceWorkspace() {
  const [obligations, setObligations] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Item[]>([]);
  const [tasks, setTasks] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const keys = useRef<Record<string, string>>({});

  const [ob, setOb] = useState({
    obligation_type: "licenca",
    title: "",
    description: "",
    declared_source: "",
    applicability_scope: "",
    applicability_justification: "",
    validity_rule: "validade_anual",
    responsible_identity: "",
  });

  const [doc, setDoc] = useState({
    obligation_id: "",
    title: "",
    description: "",
    compliance_type: "licenca",
    issue_date: "",
    expiry_date: "",
    reference_type: "referencia_declarada",
    declared_reference: "",
    reference_source: "",
  });

  const [renewDocId, setRenewDocId] = useState("");
  const [renewForm, setRenewForm] = useState({
    title: "",
    description: "",
    compliance_type: "licenca",
    issue_date: "",
    expiry_date: "",
    reference_type: "referencia_declarada",
    declared_reference: "",
    reference_source: "",
    justification: "Renovação periódica de conformidade.",
  });

  const [completeTaskId, setCompleteTaskId] = useState("");
  const [taskResult, setTaskResult] = useState("");
  const [cancelTaskId, setCancelTaskId] = useState("");
  const [taskCancelJustification, setTaskCancelJustification] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b, c] = await Promise.all([
        fetch("/api/ext/compliance/obligations"),
        fetch("/api/ext/compliance/documents"),
        fetch("/api/ext/compliance/tasks"),
      ]);
      const [x, y, z] = await Promise.all([read(a), read(b), read(c)]);
      if (!a.ok || !b.ok || !c.ok) {
        throw new Error(x.error || y.error || z.error || "Erro ao carregar dados de compliance");
      }
      setObligations(x.obligations || x.items || []);
      setDocs(y.documents || y.items || []);
      setTasks(z.tasks || z.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(name: string, url: string, value: unknown) {
    const key = keys.current[name] || `ext07-${name}-${crypto.randomUUID()}`;
    keys.current[name] = key;
    setError("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify(value),
      });
      const b = await read(r);
      if (!r.ok) throw new Error(b.error || String(r.status));
      delete keys.current[name];
      return b;
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "Falha"}. Chave preservada para retry seguro.`);
      throw e;
    }
  }

  async function createOb(e: FormEvent) {
    e.preventDefault();
    try {
      await mutate("obligation", "/api/ext/compliance/obligations", ob);
      setNotice("Obrigação aplicável confirmada pelo servidor.");
      setOb({
        obligation_type: "licenca",
        title: "",
        description: "",
        declared_source: "",
        applicability_scope: "",
        applicability_justification: "",
        validity_rule: "validade_anual",
        responsible_identity: "",
      });
      await load();
    } catch {}
  }

  async function createDoc(e: FormEvent) {
    e.preventDefault();
    try {
      await mutate("document", "/api/ext/compliance/documents", doc);
      setNotice("Referência privada confirmada; ela não é um arquivo verificado.");
      setDoc({
        obligation_id: "",
        title: "",
        description: "",
        compliance_type: "licenca",
        issue_date: "",
        expiry_date: "",
        reference_type: "referencia_declarada",
        declared_reference: "",
        reference_source: "",
      });
      await load();
    } catch {}
  }

  async function renewDoc(e: FormEvent) {
    e.preventDefault();
    if (!renewDocId) return;
    try {
      await mutate(`renew-${renewDocId}`, `/api/ext/compliance/documents/${renewDocId}/renew`, renewForm);
      setNotice("Documento renovado com sucesso; nova versão criada e versão anterior arquivada.");
      setRenewDocId("");
      await load();
    } catch {}
  }

  async function evaluate() {
    try {
      const b = await mutate("evaluate", "/api/ext/compliance/evaluate", {});
      setNotice(`Avaliação ${b.evaluation_date} concluída: ${b.tasks_created} tarefa(s) criada(s).`);
      await load();
    } catch {}
  }

  async function startTask(id: string) {
    try {
      await mutate(`task-start-${id}`, `/api/ext/compliance/tasks/${id}/start`, {});
      setNotice("Tarefa iniciada (em andamento).");
      await load();
    } catch {}
  }

  async function completeTask(e: FormEvent) {
    e.preventDefault();
    if (!completeTaskId) return;
    try {
      await mutate(`task-complete-${completeTaskId}`, `/api/ext/compliance/tasks/${completeTaskId}/complete`, {
        result: taskResult,
      });
      setNotice("Tarefa concluída com resultado registrado.");
      setCompleteTaskId("");
      setTaskResult("");
      await load();
    } catch {}
  }

  async function cancelTask(e: FormEvent) {
    e.preventDefault();
    if (!cancelTaskId) return;
    try {
      await mutate(`task-cancel-${cancelTaskId}`, `/api/ext/compliance/tasks/${cancelTaskId}/cancel`, {
        justification: taskCancelJustification,
      });
      setNotice("Tarefa cancelada com justificativa.");
      setCancelTaskId("");
      setTaskCancelJustification("");
      await load();
    } catch {}
  }

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc" }}>
      <h1>Compliance corporativo — EXT-07</h1>
      <p>
        <strong>Critério:</strong> vencimento gera tarefa e documento privado.
      </p>
      <p>
        Jornada interna de staff. A referência documental é privada e declarada: não representa upload, bytes, checksum,
        malware scan, armazenamento verificado ou download.
      </p>

      {loading && <p role="status">Carregando dados reais do backend…</p>}
      {error && (
        <div role="alert" style={{ ...box, borderColor: "#dc2626", color: "#b91c1c" }}>
          {error} <button onClick={() => void load()}>Tentar novamente</button>
        </div>
      )}
      {notice && (
        <div role="status" style={{ ...box, borderColor: "#16a34a", background: "#f0fdf4", color: "#15803d" }}>
          {notice}
        </div>
      )}

      <section style={box}>
        <h2>Cadastrar obrigação aplicável</h2>
        <form onSubmit={createOb}>
          {(["title", "description", "declared_source", "applicability_scope", "applicability_justification", "validity_rule", "responsible_identity"] as const).map(
            (k) => (
              <input
                key={k}
                required
                style={input}
                placeholder={k}
                value={ob[k]}
                onChange={(e) => setOb({ ...ob, [k]: e.target.value })}
              />
            )
          )}
          <button type="submit">Registrar obrigação</button>
        </form>
        <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          Sem seed: vazio real não significa zero risco; agregados informam fonte e denominador.
        </p>
      </section>

      <section style={box}>
        <h2>Cadastrar documento / referência privada</h2>
        <form onSubmit={createDoc}>
          <select
            style={input}
            required
            value={doc.obligation_id}
            onChange={(e) => setDoc({ ...doc, obligation_id: e.target.value })}
          >
            <option value="">Selecione a obrigação canônica</option>
            {obligations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} ({o.status})
              </option>
            ))}
          </select>
          {(["title", "description", "issue_date", "expiry_date", "declared_reference", "reference_source"] as const).map(
            (k) => (
              <input
                key={k}
                required={!k.includes("source")}
                style={input}
                type={k.includes("date") ? "date" : "text"}
                placeholder={k}
                value={doc[k]}
                onChange={(e) => setDoc({ ...doc, [k]: e.target.value })}
              />
            )
          )}
          <button type="submit">Registrar referência privada</button>
        </form>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => void evaluate()}>Avaliar vencimentos na data do servidor</button>
        </div>
      </section>

      {renewDocId && (
        <section style={{ ...box, borderColor: "#2563eb", background: "#eff6ff" }}>
          <h3>Renovar documento (versão sequencial)</h3>
          <p>O documento anterior será arquivado como substituído e uma nova versão será gerada.</p>
          <form onSubmit={renewDoc}>
            {(["title", "description", "issue_date", "expiry_date", "declared_reference", "reference_source", "justification"] as const).map(
              (k) => (
                <input
                  key={k}
                  required
                  style={input}
                  type={k.includes("date") ? "date" : "text"}
                  placeholder={k}
                  value={renewForm[k]}
                  onChange={(e) => setRenewForm({ ...renewForm, [k]: e.target.value })}
                />
              )
            )}
            <button type="submit">Confirmar renovação</button>{" "}
            <button type="button" onClick={() => setRenewDocId("")}>
              Cancelar
            </button>
          </form>
        </section>
      )}

      {completeTaskId && (
        <section style={{ ...box, borderColor: "#16a34a", background: "#f0fdf4" }}>
          <h3>Concluir tarefa de compliance</h3>
          <form onSubmit={completeTask}>
            <input
              required
              style={{ ...input, width: "60%" }}
              placeholder="Resultado da conclusão (mínimo 10 caracteres)"
              value={taskResult}
              onChange={(e) => setTaskResult(e.target.value)}
            />
            <button type="submit">Concluir tarefa</button>{" "}
            <button type="button" onClick={() => setCompleteTaskId("")}>
              Voltar
            </button>
          </form>
        </section>
      )}

      {cancelTaskId && (
        <section style={{ ...box, borderColor: "#dc2626", background: "#fef2f2" }}>
          <h3>Cancelar tarefa de compliance</h3>
          <form onSubmit={cancelTask}>
            <input
              required
              style={{ ...input, width: "60%" }}
              placeholder="Justificativa do cancelamento (mínimo 10 caracteres)"
              value={taskCancelJustification}
              onChange={(e) => setTaskCancelJustification(e.target.value)}
            />
            <button type="submit">Confirmar cancelamento</button>{" "}
            <button type="button" onClick={() => setCancelTaskId("")}>
              Voltar
            </button>
          </form>
        </section>
      )}

      <section style={box}>
        <h2>Obrigações cadastradas ({obligations.length})</h2>
        {!loading && !obligations.length && <p>Nenhuma obrigação no backend canônico.</p>}
        <ul>
          {obligations.map((o) => (
            <li key={o.id} style={{ marginBottom: 8 }}>
              <strong>{o.title}</strong> · Tipo: {o.obligation_type} · Estado: <em>{o.status}</em> · Criticidade:{" "}
              {o.criticality} · Responsável: {o.responsible_name || o.responsible_identity}
            </li>
          ))}
        </ul>

        <h2>Documentos e referências privadas ({docs.length})</h2>
        {!loading && !docs.length && <p>Nenhum documento/referência canônica.</p>}
        <ul>
          {docs.map((d) => (
            <li key={d.id} style={{ marginBottom: 8 }}>
              <strong>{d.protocol}</strong> — {d.title} (v{d.version_no}) · Estado: <em>{d.status}</em> · Vencimento:{" "}
              {d.expiry_date || "sem vencimento declarado"} · Privado: {String(d.is_private)}{" "}
              {d.status !== "cancelada" && d.status !== "substituida" && (
                <button
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    setRenewDocId(d.id);
                    setRenewForm({
                      title: d.title,
                      description: d.description,
                      compliance_type: d.compliance_type || "licenca",
                      issue_date: "",
                      expiry_date: "",
                      reference_type: d.reference_type || "referencia_declarada",
                      declared_reference: "",
                      reference_source: d.reference_source || "",
                      justification: "Renovação de conformidade.",
                    });
                  }}
                >
                  Renovar
                </button>
              )}
            </li>
          ))}
        </ul>

        <h2>Tarefas de vencimento / compliance ({tasks.length})</h2>
        {!loading && !tasks.length && <p>Nenhuma tarefa de compliance gerada.</p>}
        <ul>
          {tasks.map((t) => (
            <li key={t.id} style={{ marginBottom: 8 }}>
              Tarefa <strong>{t.rule}</strong> (Vencimento: {t.due_date}) · Estado: <em>{t.status}</em> · Responsável:{" "}
              {t.responsible_name || t.responsible_identity}{" "}
              {t.status === "aberta" && (
                <button style={{ marginLeft: 8 }} onClick={() => void startTask(t.id)}>
                  Iniciar
                </button>
              )}
              {["aberta", "em_andamento"].includes(t.status) && (
                <>
                  <button style={{ marginLeft: 8 }} onClick={() => setCompleteTaskId(t.id)}>
                    Concluir
                  </button>
                  <button style={{ marginLeft: 8 }} onClick={() => setCancelTaskId(t.id)}>
                    Cancelar
                  </button>
                </>
              )}
              {t.completion_result && <div>Resultado: {t.completion_result}</div>}
              {t.cancellation_justification && <div>Cancelamento: {t.cancellation_justification}</div>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
