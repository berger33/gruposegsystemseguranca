"use client";

// CRM-03 — revisão dedicada de deduplicação.
// A decisão por linha duplicada é explícita, persistida e auditada pelo
// servidor (`PATCH /api/crm/imports/:id/rows/:n`). A tela não decide por
// ninguém: enquanto houver duplicata pendente, a confirmação fica bloqueada
// e o servidor recusa o commit com `pending_dedup_review`.

import { useCallback, useEffect, useState } from "react";

type DuplicateRow = {
  row_number: number;
  mapped_data: Record<string, unknown>;
  dedup_match_id: string | null;
  dedup_match_type: string | null;
  dedup_match_details: { id?: string; display_name?: string; document_ref?: string | null } | null;
  decision: "create" | "skip" | null;
  decision_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
};

type DuplicatesResponse = {
  batch: { id: string; file_name: string; status: string; type: string; duplicate_rows: number };
  duplicates: DuplicateRow[];
  pending_review: number;
  review_complete: boolean;
};

const DECISION_LABEL: Record<string, string> = {
  create: "importar mesmo assim",
  skip: "descartar linha",
};

export default function ImportDedupReview({ batchId, onCommitted }: { batchId: string | null; onCommitted?: () => void }) {
  const [data, setData] = useState<DuplicatesResponse | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!batchId) { setData(null); return; }
    setError("");
    try {
      const res = await fetch(`/api/crm/imports/${batchId}/duplicates`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "falha ao carregar duplicatas");
      setData(body);
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : "falha ao carregar duplicatas");
    }
  }, [batchId]);

  useEffect(() => { load(); }, [load]);

  async function decide(rowNumber: number, decision: "create" | "skip") {
    if (!batchId) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const note = (notes[rowNumber] || "").trim();
      const res = await fetch(`/api/crm/imports/${batchId}/rows/${rowNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note ? { decision, note } : { decision }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "falha ao registrar decisão");
      setMessage(`Linha ${rowNumber}: ${DECISION_LABEL[decision]} — decisão registrada e auditada.`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "falha ao registrar decisão");
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!batchId) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/crm/imports/${batchId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "falha ao confirmar importação");
      setMessage(`Importação confirmada: ${body.created} criadas, ${body.skipped} ignoradas, ${body.failed} com falha.`);
      await load();
      onCommitted?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "falha ao confirmar importação");
    } finally {
      setLoading(false);
    }
  }

  if (!batchId) return null;

  return (
    <section aria-label="Revisão de deduplicação CRM-03" style={{ marginTop: 12, padding: 12, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff" }}>
      <h3 style={{ fontSize: 14, margin: 0 }}>Revisão de deduplicação (CRM-03)</h3>
      <p style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
        Cada linha marcada como duplicada exige decisão explícita — importar mesmo assim ou descartar.
        A decisão fica registrada com autor, data e trilha de auditoria. Enquanto houver pendência,
        o servidor recusa a confirmação (nada é criado por default).
      </p>

      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>{error}</p>}
      {message && <p style={{ color: "#166534", fontSize: 12 }}>{message}</p>}

      {data && (
        <>
          <p style={{ fontSize: 12, margin: "6px 0" }}>
            Lote {data.batch.id.slice(0, 8)} — {data.batch.file_name} — situação {data.batch.status} — duplicatas pendentes de revisão: <strong>{data.pending_review}</strong>
          </p>

          {data.duplicates.length === 0 && <p style={{ fontSize: 12 }}>Nenhuma duplicata neste lote.</p>}

          {data.duplicates.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>#</th>
                    <th style={{ textAlign: "left" }}>Linha do CSV</th>
                    <th style={{ textAlign: "left" }}>Registro já existente</th>
                    <th style={{ textAlign: "left" }}>Decisão</th>
                    <th style={{ textAlign: "left" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.duplicates.map(row => (
                    <tr key={row.row_number} style={{ borderTop: "1px solid #eee", background: row.decision ? "#f0fdf4" : "#fef9c3" }}>
                      <td>{row.row_number}</td>
                      <td><code style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(row.mapped_data)}</code></td>
                      <td>
                        {row.dedup_match_details?.display_name
                          ? `${row.dedup_match_details.display_name}${row.dedup_match_details.document_ref ? ` (${row.dedup_match_details.document_ref})` : ""}`
                          : "-"}
                      </td>
                      <td>
                        {row.decision
                          ? `${DECISION_LABEL[row.decision]} — ${row.decided_by || "?"} em ${row.decided_at ? new Date(row.decided_at).toLocaleString("pt-BR") : "?"}${row.decision_note ? ` — ${row.decision_note}` : ""}`
                          : "pendente"}
                      </td>
                      <td>
                        <label htmlFor={`dedup-note-${row.row_number}`} style={{ display: "block", fontSize: 11 }}>Justificativa da linha {row.row_number}</label>
                        <input
                          id={`dedup-note-${row.row_number}`}
                          value={notes[row.row_number] || ""}
                          onChange={event => setNotes(prev => ({ ...prev, [row.row_number]: event.target.value }))}
                          style={{ padding: 4, fontSize: 11, width: 180 }}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          <button type="button" disabled={loading || data.batch.status !== "pending"} onClick={() => decide(row.row_number, "create")} style={{ padding: "4px 8px" }}>
                            Importar mesmo assim (linha {row.row_number})
                          </button>
                          <button type="button" disabled={loading || data.batch.status !== "pending"} onClick={() => decide(row.row_number, "skip")} style={{ padding: "4px 8px" }}>
                            Descartar linha {row.row_number}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={commit}
            disabled={loading || !data.review_complete || data.batch.status !== "pending"}
            style={{ marginTop: 10, padding: "6px 12px", background: data.review_complete && data.batch.status === "pending" ? "#16a34a" : "#9ca3af", color: "#fff", borderRadius: 6 }}
          >
            Confirmar importação revisada
          </button>
          {!data.review_complete && (
            <p style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
              Confirmação bloqueada: {data.pending_review} duplicata(s) sem decisão.
            </p>
          )}
        </>
      )}
    </section>
  );
}
