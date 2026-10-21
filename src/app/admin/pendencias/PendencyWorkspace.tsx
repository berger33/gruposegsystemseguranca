"use client";
// F15 — caixa interna de pendências. Pessoal por identidade staff, derivada de fontes
// internas reais. Não envia e-mail, SMS, WhatsApp, push ou webhook e não usa a fila legada.
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./PendencyWorkspace.module.css";

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

type LoadState = "loading" | "ready" | "refreshing" | "error" | "stale" | "denied";

const moduleLabel: Record<string, string> = {
  ext07_obligation: "Compliance · obrigação",
  ext07_action_plan: "Compliance · plano de ação",
  ext07_task: "Compliance · tarefa",
  ext10_continuity_plan: "Continuidade · teste",
};

const statusLabel: Record<Pendency["status"], string> = {
  nao_lida: "Não lida",
  lida: "Lida",
  arquivada: "Arquivada",
};

const criticalityLabel: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};
const priorityOrder: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };
const statusOrder: Record<Pendency["status"], number> = { nao_lida: 0, lida: 1, arquivada: 2 };

const idempotencyKey = () => `pend-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function formatDate(value: string | null, dateOnly = false): string {
  if (!value) return "Sem prazo registrado";
  const parsed = new Date(dateOnly ? `${value.slice(0, 10)}T12:00:00` : value);
  if (!Number.isFinite(parsed.getTime())) return "Data não disponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    ...(dateOnly ? {} : { timeStyle: "short" }),
    timeZone: "America/Sao_Paulo",
  }).format(parsed);
}

function errorText(payload: { error?: unknown }, fallback: string): string {
  if (typeof payload.error !== "string") return fallback;
  const known: Record<string, string> = {
    unauthorized: "Sua sessão expirou. Entre novamente para continuar.",
    forbidden: "Seu perfil não tem autorização para executar esta ação.",
    origin_forbidden: "Não foi possível confirmar a origem da solicitação. Atualize a página e tente novamente.",
    audit_unavailable: "A auditoria está indisponível; a alteração não foi registrada.",
    pendency_unavailable: "O serviço de pendências está indisponível.",
    invalid_json: "A justificativa enviada não pôde ser lida.",
    archive_note_required: "Informe uma justificativa com pelo menos 10 caracteres.",
    pendency_not_found: "Esta pendência não está mais disponível na sua caixa.",
    pendency_archived: "Esta pendência já foi arquivada e não pode ser alterada.",
  };
  return known[payload.error] || fallback;
}

export function PendencyWorkspace() {
  const [items, setItems] = useState<Pendency[]>([]);
  const [unread, setUnread] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [errorAt, setErrorAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const hasRead = useRef(false);
  const readSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++readSequence.current;
    setLoadState(hasRead.current ? "refreshing" : "loading");
    setError("");
    setErrorAt(null);
    try {
      const response = await fetch("/api/ops/pendencies", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (sequence !== readSequence.current) return false;
      if (!response.ok) {
        const denied = response.status === 401 || response.status === 403;
        if (denied) {
          // A negativa pode indicar troca/expiração da identidade: não manter dado pessoal anterior.
          setItems([]);
          setUnread(0);
          setUpdatedAt(null);
          hasRead.current = false;
          setLoadState("denied");
          setError("A sessão não pode mais consultar esta caixa. Entre novamente para confirmar o acesso.");
        } else {
          setLoadState(hasRead.current ? "stale" : "error");
          setError(errorText(payload, "Não foi possível carregar as pendências."));
        }
        setErrorAt(new Date().toISOString());
        return false;
      }
      if (!Array.isArray(payload.items) || !Number.isInteger(payload.unread) || payload.unread < 0) {
        setLoadState(hasRead.current ? "stale" : "error");
        setError("A resposta do serviço não foi reconhecida. A lista não foi substituída.");
        setErrorAt(new Date().toISOString());
        return false;
      }
      setItems(payload.items);
      setUnread(payload.unread);
      setUpdatedAt(new Date().toISOString());
      hasRead.current = true;
      setLoadState("ready");
      return true;
    } catch {
      if (sequence !== readSequence.current) return false;
      setLoadState(hasRead.current ? "stale" : "error");
      setError("Não foi possível carregar as pendências por falha de conexão. Confira a rede e tente novamente.");
      setErrorAt(new Date().toISOString());
      return false;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function sweep() {
    setBusy(true);
    setError("");
    setErrorAt(null);
    setMessage("");
    try {
      const response = await fetch("/api/ops/pendencies/sweep", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey() },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          setItems([]);
          setUnread(0);
          setUpdatedAt(null);
          hasRead.current = false;
          setLoadState("denied");
        }
        setError(errorText(payload, "Falha ao executar a varredura de pendências."));
        setErrorAt(new Date().toISOString());
        return;
      }
      setMessage(`Varredura concluída: ${payload.total} pendência(s) nova(s) registrada(s). Nenhuma mensagem foi enviada.`);
      await load();
    } catch {
      setError("A varredura não foi confirmada por falha de conexão. Tente novamente antes de considerar o resultado concluído.");
      setErrorAt(new Date().toISOString());
    } finally {
      setBusy(false);
    }
  }

  async function act(pendency: Pendency, kind: "read" | "archive") {
    const note = (notes[pendency.id] || "").trim();
    setPendingActionId(pendency.id);
    setError("");
    setErrorAt(null);
    setMessage("");
    try {
      const response = await fetch(`/api/ops/pendencies/${pendency.id}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey() },
        body: JSON.stringify(kind === "archive" ? { note } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          setItems([]);
          setUnread(0);
          setUpdatedAt(null);
          hasRead.current = false;
          setLoadState("denied");
        }
        setError(errorText(payload, "Falha ao atualizar a pendência."));
        setErrorAt(new Date().toISOString());
        return;
      }
      setMessage(kind === "read" ? "Pendência marcada como lida." : "Pendência arquivada com justificativa.");
      setNotes(current => ({ ...current, [pendency.id]: "" }));
      await load();
    } catch {
      setError("A alteração não foi confirmada por falha de conexão. Confira o estado antes de repetir a ação.");
      setErrorAt(new Date().toISOString());
    } finally {
      setPendingActionId(null);
    }
  }

  const countLabel = `${unread} não lida(s) · ${items.length} no total`;
  const sortedItems = [...items].sort((left, right) => {
    const stateDifference = statusOrder[left.status] - statusOrder[right.status];
    if (stateDifference) return stateDifference;
    const priorityDifference = (priorityOrder[left.criticality] ?? 99) - (priorityOrder[right.criticality] ?? 99);
    if (priorityDifference) return priorityDifference;
    const leftDue = left.due_date ? Date.parse(`${left.due_date.slice(0, 10)}T12:00:00`) : Number.POSITIVE_INFINITY;
    const rightDue = right.due_date ? Date.parse(`${right.due_date.slice(0, 10)}T12:00:00`) : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return Date.parse(right.created_at) - Date.parse(left.created_at);
  });

  return (
    <section className={styles.workspace} data-admin-content="true" aria-labelledby="pendency-title">
      <header className={styles.header}>
        <p className={styles.eyebrow}>F15 · PENDÊNCIAS INTERNAS</p>
        <h1 id="pendency-title">Minhas pendências</h1>
        <p className={styles.intro}>
          Caixa <strong>pessoal</strong> da sua identidade de equipe, derivada de pendências reais já registradas no
          sistema (obrigações, planos de ação e tarefas de compliance vencidos e testes de continuidade vencidos).
          Este painel é <strong>registro interno auditado</strong>: não envia e-mail, SMS, WhatsApp, push ou webhook,
          não usa a fila legada de entrega e não aciona nenhum fornecedor externo.
        </p>
      </header>

      <div className={styles.toolbar}>
        <p className={styles.count} aria-live="polite">{countLabel}</p>
        <div className={styles.toolbarActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => void load()} disabled={loadState === "loading" || loadState === "refreshing"}>
            {loadState === "refreshing" ? "Atualizando…" : "Atualizar pendências"}
          </button>
          <button className={styles.primaryButton} type="button" onClick={() => void sweep()} disabled={busy}>
            {busy ? "Varrendo…" : "Executar varredura"}
          </button>
        </div>
      </div>

      {loadState === "loading" ? (
        <p className={styles.loading} role="status" data-pendency-state="loading">Carregando suas pendências…</p>
      ) : null}
      {loadState === "refreshing" ? (
        <p className={styles.loading} role="status" data-pendency-state="refreshing">Atualizando a lista. Os dados lidos continuam visíveis.</p>
      ) : null}
      {error ? (
        <div className={styles.error} role="alert" data-pendency-state={loadState === "stale" ? "stale" : loadState === "denied" ? "denied" : "error"}>
              <strong>{loadState === "stale" ? "A atualização falhou; os dados anteriores continuam visíveis." : error}</strong>
          {loadState === "stale" ? <p>{error}</p> : null}
          {errorAt ? <p>Falha registrada em {formatDate(errorAt)}.</p> : null}
          {updatedAt ? <p>Última atualização confirmada: {formatDate(updatedAt)}.</p> : null}
          {loadState !== "denied" ? <button className={styles.secondaryButton} type="button" onClick={() => void load()}>Tentar novamente</button> : null}
        </div>
      ) : null}
      {message ? <p className={styles.success} role="status">{message}</p> : null}
      {updatedAt && !error ? <p className={styles.updatedAt}>Atualizado em {formatDate(updatedAt)}.</p> : null}

      {loadState === "ready" && items.length === 0 ? (
        <div className={styles.empty} data-pendency-state="empty">
          <h2>Nenhuma pendência registrada</h2>
          <p>Não há itens para a sua identidade neste momento. A lista usa registros das fontes internas disponíveis.</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className={styles.list} data-pendency-state={loadState === "stale" ? "stale" : "items"} aria-label="Pendências da sua identidade">
          {sortedItems.map(item => {
            const priority = criticalityLabel[item.criticality] || "Não informada";
            const status = statusLabel[item.status] || "Estado não reconhecido";
            const busyOnItem = pendingActionId === item.id;
            return (
              <article key={item.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.source}>{moduleLabel[item.source_module] || "Fonte interna"}</p>
                    <h2>{item.title}</h2>
                  </div>
                  <span className={`${styles.status} ${styles[`status_${item.status}`] || ""}`}>{status}</span>
                </div>
                <p className={styles.summary}>{item.summary}</p>
                <dl className={styles.details}>
                  <div><dt>Criticidade</dt><dd>{priority}</dd></div>
                  <div><dt>Vencimento</dt><dd>{formatDate(item.due_date, true)}</dd></div>
                  <div><dt>Registrada em</dt><dd>{formatDate(item.created_at)}</dd></div>
                </dl>
                <p className={styles.nextAction}>
                  <strong>Próxima ação:</strong>{" "}
                  {item.status === "nao_lida" ? "Marcar como lida ou arquivar com justificativa." : item.status === "lida" ? "Arquivar com justificativa quando o tratamento estiver concluído." : "Registro arquivado; nenhuma ação permanece aberta."}
                </p>
                {item.status === "arquivada" ? (
                  <p className={styles.archiveNote}><strong>Justificativa registrada:</strong> {item.archive_note || "Não informada"}</p>
                ) : (
                  <div className={styles.cardActions}>
                    {item.status === "nao_lida" ? (
                      <button className={styles.secondaryButton} type="button" onClick={() => void act(item, "read")} disabled={busyOnItem}>
                        {busyOnItem ? "Salvando…" : "Marcar como lida"}
                      </button>
                    ) : null}
                    <div className={styles.archiveField}>
                      <label htmlFor={`archive-note-${item.id}`}>Justificativa do arquivamento</label>
                      <textarea
                        id={`archive-note-${item.id}`}
                        value={notes[item.id] || ""}
                        minLength={10}
                        maxLength={1000}
                        rows={2}
                        aria-describedby={`archive-help-${item.id}`}
                        onChange={event => setNotes(current => ({ ...current, [item.id]: event.target.value }))}
                      />
                      <small id={`archive-help-${item.id}`}>Obrigatória, com pelo menos 10 caracteres.</small>
                    </div>
                    <button className={styles.secondaryButton} type="button" onClick={() => void act(item, "archive")} disabled={busyOnItem || (notes[item.id] || "").trim().length < 10}>
                      {busyOnItem ? "Salvando…" : "Arquivar com justificativa"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
