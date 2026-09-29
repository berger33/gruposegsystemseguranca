"use client";
import { useEffect, useState, type FormEvent } from "react";

type Attachment = { id: string; original_filename: string; content_type: string; size_bytes: number; created_at: string };
type Contact = { id: string; display_name: string };
type Interaction = {
  id: string; type: string; title: string; details: string | null; occurred_at: string;
  contact_id: string | null; contact_name: string | null; created_at: string; updated_at: string;
  version: number; attachments: Attachment[];
};
type Pagination = { limit: number; offset: number; total: number; nextOffset: number | null; previousOffset: number | null };
const types = ["ligacao", "reuniao", "email", "whatsapp", "visita", "nota", "outro"];
const typeLabels: Record<string, string> = {
  ligacao: "Ligação", reuniao: "Reunião", email: "E-mail", whatsapp: "WhatsApp", visita: "Visita", nota: "Nota", outro: "Outro",
};
const errors: Record<string, string> = {
  opportunity_not_found: "Histórico disponível apenas para o responsável por esta oportunidade.",
  interaction_not_found: "A interação não está disponível para alteração.",
  attachment_not_found: "O anexo não está disponível.",
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Seu perfil não permite registrar interações comerciais.",
  invalid_type: "Selecione um tipo de interação válido.",
  invalid_title: "Informe um título válido (até 200 caracteres).",
  invalid_details: "Detalhes inválidos (até 5000 caracteres).",
  invalid_occurred_at: "Informe uma data/hora válida, sem data futura.",
  invalid_contact_id: "O contato informado é inválido.",
  contact_not_available: "Selecione um contato ativo da empresa desta oportunidade.",
  expected_version_required: "Atualize a lista antes de alterar esta interação.",
  interaction_version_conflict: "A interação mudou em outra tela. Atualize a lista antes de tentar novamente.",
  attachment_content_invalid: "Não foi possível ler o arquivo selecionado.",
  attachment_too_large: "O anexo deve ter no máximo 5 MB.",
  attachment_filename_invalid: "Informe um nome de arquivo válido.",
  attachment_content_type_invalid: "Anexe apenas PDF, JPG, PNG ou arquivo de texto.",
  attachment_integrity_failed: "A integridade do anexo não pôde ser confirmada.",
  invalid_pagination: "A página solicitada é inválida.",
  crm_interactions_unavailable: "Não foi possível concluir a operação. Confira a lista antes de repetir.",
};

function localDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function asIso(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function humanSize(size: number) {
  return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
}
function fileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("attachment_content_invalid"));
    reader.onload = () => {
      const output = typeof reader.result === "string" ? reader.result : "";
      const comma = output.indexOf(",");
      if (comma < 0) reject(new Error("attachment_content_invalid"));
      else resolve(output.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

export default function OpportunityInteractions({ opportunityId }: { opportunityId: string }) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ limit: 25, offset: 0, total: 0, nextOffset: null, previousOffset: null });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("ligacao");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [contactId, setContactId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<Interaction | null>(null);
  const [deletePending, setDeletePending] = useState<string | null>(null);
  const endpoint = "/api/crm/opportunities/" + opportunityId + "/interactions";

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }
  async function load(offset = 0, quiet = false) {
    if (!quiet) { setLoading(true); setError(""); }
    try {
      const data = await request(`${endpoint}?limit=25&offset=${offset}`);
      setInteractions(data.interactions);
      setContacts(data.contacts);
      setPagination(data.pagination);
    } catch (cause) {
      if (!quiet) { setInteractions([]); setContacts([]); setError(cause instanceof Error ? cause.message : "Falha ao consultar."); }
    } finally { if (!quiet) setLoading(false); }
  }
  useEffect(() => { void load(0); }, [endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(interaction: Interaction, file: File) {
    const contentBase64 = await fileAsBase64(file);
    const data = await request(`${endpoint}/${interaction.id}/attachments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type, contentBase64 }),
    });
    return data.attachment as Attachment;
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const occurred = occurredAt ? asIso(occurredAt) : null;
    if (occurredAt && !occurred) { setError("Informe uma data/hora válida."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, details: details || undefined, occurred_at: occurred || undefined, contact_id: contactId || undefined }),
      });
      if (selectedFile) {
        try { await upload(data.interaction, selectedFile); }
        catch (cause) {
          await load(0, true);
          throw new Error(`Interação registrada, mas o anexo não foi salvo: ${cause instanceof Error ? cause.message : "confira a lista antes de repetir."}`);
        }
      }
      setTitle(""); setDetails(""); setOccurredAt(""); setContactId(""); setSelectedFile(null);
      await load(0, true);
      setNotice(selectedFile ? "Interação e anexo registrados." : "Interação registrada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const nextDate = String(form.get("occurredAt") || "");
    const occurred = asIso(nextDate);
    if (!occurred) { setError("Informe uma data/hora válida."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(`${endpoint}/${editing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_version: editing.version,
          type: String(form.get("type") || ""), title: String(form.get("title") || ""),
          details: String(form.get("details") || "") || null, occurred_at: occurred,
          contact_id: String(form.get("contactId") || "") || null,
        }),
      });
      setInteractions(items => items.map(item => item.id === editing.id ? data.interaction : item));
      setEditing(null); setNotice("Interação atualizada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar."); }
    finally { setBusy(false); }
  }

  async function addAttachment(interaction: Interaction, file: File | null) {
    if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const attachment = await upload(interaction, file);
      setInteractions(items => items.map(item => item.id === interaction.id ? { ...item, attachments: [...item.attachments, attachment] } : item));
      setNotice("Anexo adicionado à interação.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao anexar."); }
    finally { setBusy(false); }
  }

  async function remove(interaction: Interaction) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`${endpoint}/${interaction.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: interaction.version }),
      });
      setDeletePending(null);
      if (interactions.length === 1 && pagination.offset > 0) await load(pagination.previousOffset ?? 0, true);
      else await load(pagination.offset, true);
      setNotice("Interação removida da lista. A auditoria de acesso foi preservada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao remover."); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="Histórico de interações da oportunidade" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere" }}>
      <h2>Histórico de interações da oportunidade</h2>
      <p>Registre ligações, reuniões, e-mails, WhatsApp, visitas, notas e outros contatos. Somente o responsável desta oportunidade acessa este histórico.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p role="status">Carregando histórico…</p> : (
        <>
          <form onSubmit={create} style={{ display: "grid", gap: 12 }}>
            <label htmlFor="interaction-type">Tipo</label>
            <select id="interaction-type" value={type} onChange={event => setType(event.target.value)} style={{ display: "block", width: "100%" }}>
              {types.map(value => <option key={value} value={value}>{typeLabels[value]}</option>)}
            </select>
            <label htmlFor="interaction-title">Título</label>
            <input id="interaction-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} style={{ width: "100%", boxSizing: "border-box" }} />
            <label htmlFor="interaction-details">Detalhes (opcional)</label>
            <textarea id="interaction-details" value={details} onChange={event => setDetails(event.target.value)} maxLength={5000} style={{ display: "block", width: "100%", boxSizing: "border-box" }} />
            <label htmlFor="interaction-contact">Vincular contato (opcional)</label>
            <select id="interaction-contact" value={contactId} onChange={event => setContactId(event.target.value)} style={{ display: "block", width: "100%" }}>
              <option value="">Sem contato vinculado</option>
              {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.display_name}</option>)}
            </select>
            <label htmlFor="interaction-occurred-at">Data/hora (opcional, padrão agora)</label>
            <input id="interaction-occurred-at" type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} style={{ display: "block", maxWidth: "100%" }} />
            <label htmlFor="interaction-attachment">Anexo (opcional: PDF, JPG, PNG ou TXT; até 5 MB)</label>
            <input id="interaction-attachment" type="file" accept="application/pdf,image/jpeg,image/png,text/plain" onChange={event => setSelectedFile(event.target.files?.[0] || null)} />
            <button disabled={busy} type="submit">Registrar interação</button>
          </form>
          <div aria-label="Paginação do histórico" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <span>{pagination.total === 0 ? "Nenhuma interação" : `Exibindo ${pagination.offset + 1}–${pagination.offset + interactions.length} de ${pagination.total}`}</span>
            <button type="button" disabled={busy || pagination.previousOffset === null} onClick={() => void load(pagination.previousOffset ?? 0)}>Anterior</button>
            <button type="button" disabled={busy || pagination.nextOffset === null} onClick={() => void load(pagination.nextOffset ?? pagination.offset)}>Próxima</button>
            <button type="button" disabled={busy} onClick={() => void load(pagination.offset)}>Atualizar histórico</button>
          </div>
          {interactions.length === 0 && <p>Nenhuma interação registrada ainda.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {interactions.map(item => <li key={item.id} style={{ marginTop: 16 }}>
              <article aria-label={`Interação ${item.title}`}>
                <strong>{typeLabels[item.type] || item.type}: {item.title}</strong>
                <p>{new Date(item.occurred_at).toLocaleString("pt-BR")}{item.contact_name ? ` — Contato: ${item.contact_name}` : ""}</p>
                {item.details && <p>{item.details}</p>}
                {item.attachments.length > 0 && <ul aria-label={`Anexos de ${item.title}`}>
                  {item.attachments.map(attachment => <li key={attachment.id}>
                    <a href={`${endpoint}/${item.id}/attachments/${attachment.id}/download`}>{attachment.original_filename}</a> <small>({humanSize(attachment.size_bytes)})</small>
                  </li>)}
                </ul>}
                {editing?.id === item.id ? (
                  <form onSubmit={saveEdit} style={{ display: "grid", gap: 8, maxWidth: 680 }}>
                    <label htmlFor={`edit-type-${item.id}`}>Tipo da interação</label>
                    <select id={`edit-type-${item.id}`} name="type" defaultValue={item.type}>{types.map(value => <option key={value} value={value}>{typeLabels[value]}</option>)}</select>
                    <label htmlFor={`edit-title-${item.id}`}>Título da interação</label>
                    <input id={`edit-title-${item.id}`} name="title" defaultValue={item.title} required maxLength={200} />
                    <label htmlFor={`edit-details-${item.id}`}>Detalhes da interação</label>
                    <textarea id={`edit-details-${item.id}`} name="details" defaultValue={item.details || ""} maxLength={5000} />
                    <label htmlFor={`edit-contact-${item.id}`}>Contato vinculado</label>
                    <select id={`edit-contact-${item.id}`} name="contactId" defaultValue={item.contact_id || ""}>
                      <option value="">Sem contato vinculado</option>
                      {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.display_name}</option>)}
                    </select>
                    <label htmlFor={`edit-occurred-at-${item.id}`}>Data/hora da interação</label>
                    <input id={`edit-occurred-at-${item.id}`} name="occurredAt" type="datetime-local" defaultValue={localDateTime(item.occurred_at)} required />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button disabled={busy} type="submit">Salvar edição</button>
                      <button disabled={busy} type="button" onClick={() => setEditing(null)}>Cancelar edição</button>
                    </div>
                  </form>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button disabled={busy} type="button" onClick={() => { setEditing(item); setDeletePending(null); }}>Editar interação</button>
                    <label htmlFor={`attachment-${item.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      Anexar arquivo
                      <input id={`attachment-${item.id}`} aria-label={`Anexar arquivo a ${item.title}`} type="file" accept="application/pdf,image/jpeg,image/png,text/plain" disabled={busy} onChange={event => void addAttachment(item, event.target.files?.[0] || null)} />
                    </label>
                    {deletePending === item.id ? <>
                      <span>Remover da lista?</span>
                      <button disabled={busy} type="button" onClick={() => void remove(item)}>Confirmar exclusão</button>
                      <button disabled={busy} type="button" onClick={() => setDeletePending(null)}>Cancelar</button>
                    </> : <button disabled={busy} type="button" onClick={() => { setDeletePending(item.id); setEditing(null); }}>Excluir interação</button>}
                  </div>
                )}
              </article>
            </li>)}
          </ul>
        </>
      )}
    </section>
  );
}
