"use client";
import { useCallback, useEffect, useState } from "react";

// CRM-07: notas internas dedicadas da oportunidade. Memória de trabalho do
// responsável: nunca aparece em superfície pública, do cliente ou de empresa.
// Só quem escreveu edita ou exclui a própria nota; exclusão é lógica e a
// edição exige versão otimista.

type Note = {
  id: string; body: string; version: number;
  created_at: string; updated_at: string; edited_at: string | null;
  author_name: string | null; author_email: string | null;
};

const PAGE = 10;
const errors: Record<string, string> = {
  opportunity_not_found: "Notas disponíveis apenas para o responsável por esta oportunidade.",
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Seu perfil não permite operar o funil comercial.",
  invalid_note_body: "A nota precisa ter entre 1 e 4000 caracteres (sem espaços nas pontas).",
  expected_version_required: "Atualize a lista antes de editar ou excluir.",
  note_version_conflict: "A nota foi alterada em outra janela. Atualize a lista antes de tentar novamente.",
  note_not_found: "Nota não encontrada nesta oportunidade.",
  note_author_required: "Somente quem escreveu a nota pode editá-la ou excluí-la.",
  invalid_pagination: "Paginação inválida.",
  crm_notes_unavailable: "Não foi possível salvar ou consultar as notas. Confira a lista antes de repetir.",
};

export default function OpportunityNotes({ opportunityId }: { opportunityId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const endpoint = "/api/crm/opportunities/" + opportunityId + "/notes";

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }

  const refresh = useCallback(async (nextOffset = offset) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(nextOffset) });
      const data = await request(endpoint + "?" + params.toString());
      setNotes(data.notes); setTotal(data.total); setOffset(data.offset);
    } catch (e) { setNotes([]); setTotal(0); setError(e instanceof Error ? e.message : "Falha ao consultar."); }
    finally { setLoading(false); }
  }, [endpoint, offset]);

  useEffect(() => { refresh(0); }, [endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft }) });
      setDraft(""); setNotice("Nota salva.");
      await refresh(0);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar a nota."); }
    finally { setBusy(false); }
  }

  async function save(note: Note) {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(endpoint + "/" + note.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: editing[note.id], expected_version: note.version }) });
      setNotes(items => items.map(item => item.id === note.id ? data.note : item));
      setEditing(state => { const next = { ...state }; delete next[note.id]; return next; });
      setNotice("Nota atualizada.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao atualizar a nota."); }
    finally { setBusy(false); }
  }

  async function remove(note: Note) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(endpoint + "/" + note.id, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expected_version: note.version }) });
      setNotice("Nota excluída (exclusão lógica, preservada para auditoria).");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao excluir a nota."); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="Notas internas da oportunidade" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere" }}>
      <h2>Notas internas da oportunidade</h2>
      <p>Memória de trabalho privada do responsável. Nunca exposta ao cliente ou em superfície pública; só quem escreveu edita ou exclui.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div style={{ display: "grid", gap: 8, maxWidth: 720 }}>
        <label>Nova nota (1–4000 caracteres)
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} maxLength={4000} style={{ display: "block" }} />
        </label>
        <div><button type="button" disabled={busy || !draft.trim()} onClick={create}>Salvar nota</button></div>
      </div>
      {loading ? <p role="status">Carregando notas…</p> : (
        <>
          <p>{total} nota(s) — exibindo {notes.length ? offset + 1 : 0}–{offset + notes.length}, páginas de {PAGE}.</p>
          {notes.length === 0 && <p>Nenhuma nota registrada.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {notes.map(note => <li key={note.id} style={{ marginTop: 12 }}>
              <strong>Nota {note.id.slice(0, 8)}</strong> — {note.author_name || note.author_email || "autor"} em {new Date(note.created_at).toLocaleString("pt-BR")}
              {note.edited_at && <em> (editada em {new Date(note.edited_at).toLocaleString("pt-BR")})</em>}
              {editing[note.id] === undefined
                ? <p style={{ whiteSpace: "pre-wrap" }}>{note.body}</p>
                : <label>Texto da nota<textarea value={editing[note.id]} onChange={e => setEditing(state => ({ ...state, [note.id]: e.target.value }))} rows={3} maxLength={4000} style={{ display: "block" }} /></label>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {editing[note.id] === undefined
                  ? <button type="button" disabled={busy} onClick={() => setEditing(state => ({ ...state, [note.id]: note.body }))}>Editar nota</button>
                  : <>
                      <button type="button" disabled={busy || !(editing[note.id] || "").trim()} onClick={() => save(note)}>Salvar edição</button>
                      <button type="button" disabled={busy} onClick={() => setEditing(state => { const next = { ...state }; delete next[note.id]; return next; })}>Descartar edição</button>
                    </>}
                <button type="button" disabled={busy} onClick={() => remove(note)}>Excluir nota</button>
              </div>
            </li>)}
          </ul>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy || offset === 0} onClick={() => refresh(Math.max(0, offset - PAGE))}>Página anterior</button>
            <button type="button" disabled={busy || offset + notes.length >= total} onClick={() => refresh(offset + PAGE)}>Próxima página</button>
          </div>
        </>
      )}
    </section>
  );
}
