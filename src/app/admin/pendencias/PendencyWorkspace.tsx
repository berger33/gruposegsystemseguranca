"use client";
// F15 — caixa interna de pendências. Pessoal por identidade staff, derivada de fontes
// internas reais. Não envia e-mail, SMS, WhatsApp, push ou webhook e não usa a fila legada.
import { useCallback, useEffect, useState } from "react";

type Pendency = {
  id: string;
  source_module: string;
  source_id: string;
  title: string;
  summary: string;
  criticality: string;
  due_date: string | null;
  status: "nao_lida" | "lida" | "arquivada";
  archive_note: string | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
};

const moduleLabel: Record<string, string> = {
  ext07_obligation: "Compliance · obrigação",
  ext07_action_plan: "Compliance · plano de ação",
  ext07_task: "Compliance · tarefa",
  ext10_continuity_plan: "Continuidade · teste",
};

const idempotencyKey = () => `pend-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function PendencyWorkspace() {
  const [items, setItems] = useState<Pendency[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/ops/pendencies", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Falha ao carregar as pendências"); return; }
    setError("");
    setItems(payload.items || []);
    setUnread(payload.unread || 0);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function sweep() {
    setBusy(true);
    try {
      const response = await fetch("/api/ops/pendencies/sweep", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey() },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || "Falha ao executar a varredura"); return; }
      setError("");
      setMessage(`Varredura concluída: ${payload.total} pendência(s) nova(s) registrada(s). Nenhuma mensagem foi enviada.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function act(pendency: Pendency, kind: "read" | "archive") {
    const note = (notes[pendency.id] || "").trim();
    const response = await fetch(`/api/ops/pendencies/${pendency.id}/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey() },
      body: JSON.stringify(kind === "archive" ? { note } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setError(payload.error || "Falha ao atualizar a pendência"); return; }
    setError("");
    setMessage("");
    setNotes(current => ({ ...current, [pendency.id]: "" }));
    await load();
  }

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <p style={{ color: "#64748b", letterSpacing: 1 }}>F15 · PENDÊNCIAS INTERNAS</p>
      <h1>Minhas pendências</h1>
      <p>
        Caixa <strong>pessoal</strong> da sua identidade de equipe, derivada de pendências reais já registradas no
        sistema (obrigações, planos de ação e tarefas de compliance vencidos e testes de continuidade vencidos).
        Este painel é <strong>registro interno auditado</strong>: não envia e-mail, SMS, WhatsApp, push ou webhook,
        não usa a fila legada de entrega e não aciona nenhum fornecedor externo.
      </p>
      {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
      {message ? <p role="status" style={{ color: "#15803d" }}>{message}</p> : null}
      <p>
        <button type="button" onClick={() => void sweep()} disabled={busy}>
          {busy ? "Varrendo…" : "Executar varredura de pendências"}
        </button>
        <span style={{ marginLeft: 12 }}>{unread} não lida(s) · {items.length} no total</span>
      </p>
      {items.length === 0 ? (
        <p>Nenhuma pendência registrada para a sua identidade.</p>
      ) : (
        items.map(item => (
          <article key={item.id} style={{ border: "1px solid #cbd5e1", padding: 14, marginBottom: 10 }}>
            <div><small>{moduleLabel[item.source_module] || item.source_module}</small></div>
            <strong>{item.title}</strong>
            <p>{item.summary}</p>
            <div>
              <small>
                criticidade {item.criticality}
                {item.due_date ? ` · vencimento ${item.due_date}` : ""} · <b>{item.status}</b>
              </small>
            </div>
            {item.status === "arquivada" ? (
              <div><small>Arquivada: {item.archive_note}</small></div>
            ) : (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {item.status === "nao_lida" ? (
                  <button type="button" onClick={() => void act(item, "read")}>Marcar como lida</button>
                ) : null}
                <input
                  placeholder="Justificativa do arquivamento (mín. 10 caracteres)"
                  value={notes[item.id] || ""}
                  onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))}
                />
                <button type="button" onClick={() => void act(item, "archive")}>Arquivar com justificativa</button>
              </div>
            )}
          </article>
        ))
      )}
    </main>
  );
}
