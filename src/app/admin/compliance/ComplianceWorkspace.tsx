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
  const [actionPlans, setActionPlans] = useState<Item[]>([]);
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
    validity_rule: "",
    responsible_identity: "",
  });

  const [doc, setDoc] = useState({
    obligation_id: "",
    title: "",
    description: "",
    compliance_type: "licenca",
    issue_date: "",
    expiry_date: "",
    declared_reference: "",
    reference_source: "",
  });

  const [renew, setRenew] = useState({
    document_id: "",
    issue_date: "",
    expiry_date: "",
    declared_reference: "",
    justification: "",
  });

  const [planForm, setPlanForm] = useState({
    obligation_id: "",
    document_id: "",
    task_id: "",
    plan_type: "corretivo",
    title: "",
    description: "",
    root_cause: "",
    due_date: "",
    responsible_identity: "",
  });

  const [planTransitionInput, setPlanTransitionInput] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [a, b, c, d] = await Promise.all([
        fetch("/api/ext/compliance/obligations"),
        fetch("/api/ext/compliance/documents"),
        fetch("/api/ext/compliance/tasks"),
        fetch("/api/ext/compliance/action-plans"),
      ]);
      const [x, y, z, w] = await Promise.all([read(a), read(b), read(c), read(d)]);
      if (!a.ok || !b.ok || !c.ok || !d.ok) throw Error(x.error || y.error || z.error || w.error);
      setObligations(x.items || []);
      setDocs(y.items || []);
      setTasks(z.items || []);
      setActionPlans(w.items || []);
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
      if (!r.ok) throw Error(b.error || String(r.status));
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
      setNotice("Obrigação aplicável registrada (declaração interna; não é validação jurídica).");
      await load();
    } catch {}
  }

  async function createDoc(e: FormEvent) {
    e.preventDefault();
    try {
      await mutate("document", "/api/ext/compliance/documents", {
        ...doc,
        reference_type: "referencia_declarada",
      });
      setNotice("Referência privada confirmada; ela não é arquivo, bytes, checksum ou download.");
      await load();
    } catch {}
  }

  async function evaluate() {
    try {
      const b = await mutate("evaluate", "/api/ext/compliance/evaluate", {});
      setNotice(
        `Avaliação ${b.evaluation_date} (fonte ${b.source}): ${b.facts.tasks_created} tarefa(s) criada(s), ${b.facts.documents_marked_a_vencer} a vencer${
          b.facts.failed_closed?.length ? `, ${b.facts.failed_closed.length} falha(s) fechada(s) por responsável` : ""
        }.`,
      );
      await load();
    } catch {}
  }

  async function renewDoc(e: FormEvent) {
    e.preventDefault();
    try {
      const b = await mutate("renew", `/api/ext/compliance/documents/${renew.document_id}/renew`, renew);
      setNotice(`Renovação v${b.document?.version_no} registrada; versão anterior substituída e imutável.`);
      await load();
    } catch {}
  }

  async function taskAction(t: Item, action: "start" | "complete" | "cancel") {
    try {
      const value =
        action === "complete"
          ? { result: `Conclusão sintética registrada por staff para a tarefa ${t.id.slice(0, 8)}.` }
          : action === "cancel"
          ? { justification: `Cancelamento justificado por staff para a tarefa ${t.id.slice(0, 8)}.` }
          : {};
      await mutate(`task-${action}-${t.id}`, `/api/ext/compliance/tasks/${t.id}/${action}`, value);
      await load();
    } catch {}
  }

  async function createPlan(e: FormEvent) {
    e.preventDefault();
    try {
      await mutate("action-plan", "/api/ext/compliance/action-plans", {
        ...planForm,
        document_id: planForm.document_id || null,
        task_id: planForm.task_id || null,
        root_cause: planForm.root_cause || null,
      });
      setNotice("Plano de ação preventivo/corretivo registrado com sucesso (controle interno auditado).");
      await load();
    } catch {}
  }

  async function planAction(p: Item, action: "start" | "complete" | "cancel") {
    try {
      const customText = planTransitionInput[p.id] || "";
      const value =
        action === "complete"
          ? {
              result:
                customText.length >= 10
                  ? customText
                  : `Ações executadas e conformidade reestabelecida para o plano ${p.id.slice(0, 8)}.`,
            }
          : action === "cancel"
          ? {
              justification:
                customText.length >= 10
                  ? customText
                  : `Plano cancelado após reavaliação de escopo e risco pelo responsável staff.`,
            }
          : {};
      await mutate(`plan-${action}-${p.id}`, `/api/ext/compliance/action-plans/${p.id}/${action}`, value);
      setNotice(`Plano de ação ${p.id.slice(0, 8)} transicionado para ${action === "start" ? "em andamento" : action === "complete" ? "concluído" : "cancelado"}.`);
      await load();
    } catch {}
  }

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc" }}>
      <h1>Compliance corporativo — EXT-07 / F15</h1>
      <p>
        <strong>Critério:</strong> vencimento gera tarefa, obrigações vencidas/em risco geram planos de ação preventivos e corretivos, e referências documentais são privadas.
      </p>
      <p>
        Jornada interna de staff. A referência documental é privada e declarada: não representa upload, bytes, checksum, malware scan, armazenamento verificado ou download. Planos de ação e aplicabilidade são controles internos de staff, não parecer jurídico terceirizado.
      </p>
      {loading && <p role="status">Carregando dados reais do backend…</p>}
      {error && (
        <div role="alert" style={{ ...box, borderColor: "#dc2626" }}>
          {error} <button onClick={() => void load()}>Tentar novamente</button>
        </div>
      )}
      {notice && <p role="status" style={{ color: "#047857", fontWeight: 600 }}>{notice}</p>}

      <section style={box}>
        <h2>Obrigação aplicável</h2>
        <form onSubmit={createOb} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              "obligation_type",
              "title",
              "description",
              "declared_source",
              "applicability_scope",
              "applicability_justification",
              "validity_rule",
              "responsible_identity",
            ] as const
          ).map((k) => (
            <input
              key={k}
              required
              style={input}
              placeholder={k}
              value={ob[k]}
              onChange={(e) => setOb({ ...ob, [k]: e.target.value })}
            />
          ))}
          <button type="submit" style={{ padding: "8px 16px" }}>
            Registrar obrigação
          </button>
        </form>
        <p>Sem seed: vazio real não significa zero risco; agregados informam fonte e denominador.</p>
      </section>

      <section style={box}>
        <h2>Documento / referência privada</h2>
        <form onSubmit={createDoc} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            style={input}
            required
            value={doc.obligation_id}
            onChange={(e) => setDoc({ ...doc, obligation_id: e.target.value })}
          >
            <option value="">Obrigação canônica</option>
            {obligations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
          {(
            [
              "title",
              "description",
              "issue_date",
              "expiry_date",
              "declared_reference",
              "reference_source",
            ] as const
          ).map((k) => (
            <input
              key={k}
              required
              style={input}
              type={k.includes("date") ? "date" : "text"}
              placeholder={k}
              value={doc[k]}
              onChange={(e) => setDoc({ ...doc, [k]: e.target.value })}
            />
          ))}
          <button type="submit" style={{ padding: "8px 16px" }}>
            Registrar referência
          </button>
        </form>
        <button onClick={() => void evaluate()} style={{ marginTop: 8, padding: "8px 16px" }}>
          Avaliar vencimentos na data do servidor
        </button>
      </section>

      <section style={box}>
        <h2>Renovação (novo registro versionado)</h2>
        <form onSubmit={renewDoc} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            style={input}
            required
            value={renew.document_id}
            onChange={(e) => setRenew({ ...renew, document_id: e.target.value })}
          >
            <option value="">Documento corrente</option>
            {docs
              .filter((d) => ["vigente", "a_vencer", "em_renovacao", "vencida"].includes(d.status))
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.protocol} v{d.version_no} · {d.status}
                </option>
              ))}
          </select>
          {(["issue_date", "expiry_date", "declared_reference", "justification"] as const).map((k) => (
            <input
              key={k}
              required
              style={input}
              type={k.includes("date") ? "date" : "text"}
              placeholder={k}
              value={renew[k]}
              onChange={(e) => setRenew({ ...renew, [k]: e.target.value })}
            />
          ))}
          <button type="submit" style={{ padding: "8px 16px" }}>
            Renovar (substitui formalmente a versão anterior)
          </button>
        </form>
        <p>A versão anterior vira histórico imutável; nunca é sobrescrita.</p>
      </section>

      <section style={box}>
        <h2>Plano de Ação de Conformidade (Preventivo / Corretivo)</h2>
        <p>Tratamento formal para obrigações vencidas ou riscos de conformidade identificados.</p>
        <form onSubmit={createPlan} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            style={input}
            required
            value={planForm.obligation_id}
            onChange={(e) => setPlanForm({ ...planForm, obligation_id: e.target.value })}
          >
            <option value="">Obrigação vinculada *</option>
            {obligations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} ({o.status})
              </option>
            ))}
          </select>
          <select
            style={input}
            required
            value={planForm.plan_type}
            onChange={(e) => setPlanForm({ ...planForm, plan_type: e.target.value })}
          >
            <option value="corretivo">Corretivo (obrigação vencida/desvio)</option>
            <option value="preventivo">Preventivo (risco/a vencer)</option>
          </select>
          <select
            style={input}
            value={planForm.document_id}
            onChange={(e) => setPlanForm({ ...planForm, document_id: e.target.value })}
          >
            <option value="">Documento vinculado (opcional)</option>
            {docs
              .filter((d) => !planForm.obligation_id || d.obligation_id === planForm.obligation_id)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.protocol} v{d.version_no} ({d.status})
                </option>
              ))}
          </select>
          <input
            required
            style={input}
            placeholder="Título do plano (5–200 caracteres)"
            value={planForm.title}
            onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
          />
          <input
            required
            style={input}
            placeholder="Descrição das ações (10–2000 caracteres)"
            value={planForm.description}
            onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
          />
          <input
            style={input}
            placeholder="Causa raiz / Fator de risco (opcional)"
            value={planForm.root_cause}
            onChange={(e) => setPlanForm({ ...planForm, root_cause: e.target.value })}
          />
          <input
            required
            style={input}
            type="date"
            placeholder="Data limite (prazo)"
            value={planForm.due_date}
            onChange={(e) => setPlanForm({ ...planForm, due_date: e.target.value })}
          />
          <input
            style={input}
            placeholder="ID Responsável staff (opcional; herda obrigação)"
            value={planForm.responsible_identity}
            onChange={(e) => setPlanForm({ ...planForm, responsible_identity: e.target.value })}
          />
          <button type="submit" style={{ padding: "8px 16px" }}>
            Registrar plano de ação
          </button>
        </form>
      </section>

      <section style={box}>
        <h2>Planos de Ação Registrados</h2>
        {!loading && !actionPlans.length && <p>Nenhum plano de ação de compliance cadastrado.</p>}
        <ul>
          {actionPlans.map((p) => (
            <li key={p.id} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px dashed #e2e8f0" }}>
              <strong>[{p.plan_type.toUpperCase()}] {p.title}</strong> — Status: <em>{p.status}</em> · Prazo: {p.due_date} · Responsável: {p.responsible_name || p.responsible_identity}
              <br />
              <small>Obrigação: {p.obligation_title} | Descrição: {p.description}</small>
              {p.root_cause && <><br /><small>Causa raiz: {p.root_cause}</small></>}
              {p.completion_result && <><br /><small style={{ color: "#059669" }}>Resultado: {p.completion_result}</small></>}
              {p.cancellation_justification && <><br /><small style={{ color: "#dc2626" }}>Justificativa: {p.cancellation_justification}</small></>}
              <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
                {["aberto", "em_andamento"].includes(p.status) && (
                  <input
                    style={{ padding: "4px 8px", fontSize: "0.85rem", width: 260 }}
                    placeholder="Resultado (conclusão) ou justificativa (cancel)"
                    value={planTransitionInput[p.id] || ""}
                    onChange={(e) => setPlanTransitionInput({ ...planTransitionInput, [p.id]: e.target.value })}
                  />
                )}
                {p.status === "aberto" && (
                  <button style={{ padding: "4px 10px" }} onClick={() => void planAction(p, "start")}>
                    Iniciar
                  </button>
                )}
                {["aberto", "em_andamento"].includes(p.status) && (
                  <>
                    <button style={{ padding: "4px 10px" }} onClick={() => void planAction(p, "complete")}>
                      Concluir
                    </button>
                    <button style={{ padding: "4px 10px" }} onClick={() => void planAction(p, "cancel")}>
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        <h2>Obrigações</h2>
        {!loading && !obligations.length && <p>Nenhuma obrigação no backend canônico.</p>}
        <ul>
          {obligations.map((o) => (
            <li key={o.id}>
              {o.title} · <strong>{o.status}</strong> · responsável canônico {o.responsible_name || o.responsible_identity}
            </li>
          ))}
        </ul>

        <h2>Documentos</h2>
        {!loading && !docs.length && <p>Nenhum documento/referência canônica.</p>}
        <ul>
          {docs.map((d) => (
            <li key={d.id}>
              {d.protocol} v{d.version_no}
              {d.replacement_of ? " (renovação)" : ""} — {d.title} · <strong>{d.status}</strong> · validade{" "}
              {d.expiry_date || "sem vencimento declarado"} · privado {String(d.is_private)}
            </li>
          ))}
        </ul>

        <h2>Tarefas de vencimento</h2>
        {!loading && !tasks.length && <p>Nenhuma tarefa: ausência não é zero, é ausência de avaliação.</p>}
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>
              {t.rule} · período {t.validity_period} · vence {t.due_date} · {t.status}
              {t.status === "aberta" && (
                <button style={{ marginLeft: 8 }} onClick={() => void taskAction(t, "start")}>
                  Iniciar
                </button>
              )}
              {["aberta", "em_andamento"].includes(t.status) && (
                <button style={{ marginLeft: 8 }} onClick={() => void taskAction(t, "complete")}>
                  Concluir
                </button>
              )}
              {["aberta", "em_andamento"].includes(t.status) && (
                <button style={{ marginLeft: 8 }} onClick={() => void taskAction(t, "cancel")}>
                  Cancelar
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
