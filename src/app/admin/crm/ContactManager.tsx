"use client";

import { useEffect, useMemo, useState } from "react";

type Company = { id: string; display_name: string; type: string };
type Contact = {
  id: string;
  company_id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  buying_role: string | null;
  preferences: { channels?: string[]; best_time?: string | null } | null;
  restrictions: string | null;
  origin: string | null;
  is_primary: boolean;
  status: "active" | "inactive";
};
type Draft = {
  display_name: string;
  email: string;
  phone: string;
  role: string;
  buying_role: string;
  origin: string;
  channels: string[];
  best_time: string;
  restrictions: string;
  is_primary: boolean;
  status: "active" | "inactive";
};

const roles = ["decisor", "influenciador", "usuario", "financeiro", "outro"];
const origins = ["manual", "consentimento_formulario", "indicacao", "evento", "importacao", "lead_publico", "site", "contato", "outro"];
const channels = [
  ["email", "E-mail"],
  ["phone", "Telefone"],
  ["whatsapp", "WhatsApp"],
  ["meeting", "Reunião"],
] as const;

function blankDraft(): Draft {
  return {
    display_name: "",
    email: "",
    phone: "",
    role: "",
    buying_role: "",
    origin: "manual",
    channels: [],
    best_time: "",
    restrictions: "",
    is_primary: false,
    status: "active",
  };
}

function draftFromContact(contact: Contact): Draft {
  return {
    display_name: contact.display_name || "",
    email: contact.email || "",
    phone: contact.phone || "",
    role: contact.role || "",
    buying_role: contact.buying_role || "",
    origin: contact.origin || "manual",
    channels: Array.isArray(contact.preferences?.channels) ? contact.preferences.channels : [],
    best_time: contact.preferences?.best_time || "",
    restrictions: contact.restrictions || "",
    is_primary: Boolean(contact.is_primary),
    status: contact.status === "inactive" ? "inactive" : "active",
  };
}

function contactBody(draft: Draft) {
  return {
    display_name: draft.display_name,
    email: draft.email || null,
    phone: draft.phone || null,
    role: draft.role || null,
    buying_role: draft.buying_role || null,
    origin: draft.origin || null,
    preferences: { channels: draft.channels, best_time: draft.best_time || null },
    restrictions: draft.restrictions || null,
    is_primary: draft.is_primary,
    status: draft.status,
  };
}

export default function ContactManager({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<Draft>(blankDraft);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedCompany = useMemo(() => companies.find(company => company.id === companyId), [companies, companyId]);

  useEffect(() => {
    if (!companyId && companies.length > 0) setCompanyId(companies[0].id);
    if (companyId && !companies.some(company => company.id === companyId)) setCompanyId("");
  }, [companies, companyId]);

  useEffect(() => {
    if (!companyId) {
      setContacts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/crm/contacts?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "falha ao carregar contatos");
        if (!cancelled) setContacts(data.contacts || []);
      })
      .catch((reason: any) => { if (!cancelled) setError(reason?.message || "falha ao carregar contatos"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  function updateDraft(setter: React.Dispatch<React.SetStateAction<Draft>>, key: keyof Draft, value: string | boolean | string[]) {
    setter(previous => ({ ...previous, [key]: value } as Draft));
  }

  function toggleChannel(setter: React.Dispatch<React.SetStateAction<Draft>>, channel: string) {
    setter(previous => ({
      ...previous,
      channels: previous.channels.includes(channel)
        ? previous.channels.filter(item => item !== channel)
        : [...previous.channels, channel],
    }));
  }

  async function createContact(event: React.FormEvent) {
    event.preventDefault();
    if (!companyId) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, ...contactBody(draft) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "falha ao criar contato");
      setContacts(previous => [data.contact, ...previous]);
      setDraft(blankDraft());
      setMessage("Contato criado com trilha de auditoria.");
    } catch (reason: any) {
      setError(reason?.message || "falha ao criar contato");
    } finally { setLoading(false); }
  }

  async function saveContact(event: React.FormEvent, contactId: string) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactBody(editingDraft)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "falha ao editar contato");
      setContacts(previous => previous.map(contact => contact.id === contactId ? data.contact : contact));
      setEditingId(null);
      setMessage("Contato atualizado com trilha de auditoria.");
    } catch (reason: any) {
      setError(reason?.message || "falha ao editar contato");
    } finally { setLoading(false); }
  }

  return (
    <section role="region" aria-labelledby="crm-02-contacts-title" style={{ marginTop: 16, padding: 12, border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff" }}>
      <h2 id="crm-02-contacts-title" style={{ fontSize: 16, margin: 0 }}>Contatos da empresa <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>· referência interna CRM-02</span></h2>
      <p style={{ fontSize: 12, margin: "6px 0", opacity: 0.8 }}>
        Cadastro central por empresa. Função, preferências, restrições, origem controlada e estado do contato são editados pelo servidor com auditoria transacional.
      </p>
      <label htmlFor="crm-02-company" style={{ display: "block", fontSize: 12, marginTop: 8 }}>Empresa dos contatos</label>
      <select id="crm-02-company" aria-label="Empresa dos contatos" value={companyId} onChange={event => { setCompanyId(event.target.value); setEditingId(null); setMessage(""); }} style={{ display: "block", padding: 6, maxWidth: "100%" }}>
        <option value="">Escolha uma empresa</option>
        {companies.map(company => <option key={company.id} value={company.id}>{company.display_name}</option>)}
      </select>
      {!selectedCompany && <p style={{ fontSize: 12 }}>Crie ou carregue uma empresa para administrar seus contatos.</p>}

      {selectedCompany && (
        <>
          <form aria-label="Novo contato CRM-02" onSubmit={createContact} style={{ marginTop: 12, padding: 10, background: "#fff", border: "1px solid #dbeafe", borderRadius: 6 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>Novo contato da empresa selecionada</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12 }}>Nome do contato<input required maxLength={200} value={draft.display_name} onChange={event => updateDraft(setDraft, "display_name", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
              <label style={{ fontSize: 12 }}>E-mail<input type="email" maxLength={254} value={draft.email} onChange={event => updateDraft(setDraft, "email", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
              <label style={{ fontSize: 12 }}>Telefone<input maxLength={30} value={draft.phone} onChange={event => updateDraft(setDraft, "phone", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
              <label style={{ fontSize: 12 }}>Função<select required aria-label="Função do contato" value={draft.role} onChange={event => updateDraft(setDraft, "role", event.target.value)} style={{ display: "block", width: "100%", padding: 6 }}><option value="">Escolha</option>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
              <label style={{ fontSize: 12 }}>Papel de compra<select aria-label="Papel de compra" value={draft.buying_role} onChange={event => updateDraft(setDraft, "buying_role", event.target.value)} style={{ display: "block", width: "100%", padding: 6 }}><option value="">Não informado</option>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
              <label style={{ fontSize: 12 }}>Origem legítima<select required aria-label="Origem legítima" value={draft.origin} onChange={event => updateDraft(setDraft, "origin", event.target.value)} style={{ display: "block", width: "100%", padding: 6 }}>{origins.map(origin => <option key={origin} value={origin}>{origin}</option>)}</select></label>
              <label style={{ fontSize: 12 }}>Melhor horário<input maxLength={100} value={draft.best_time} onChange={event => updateDraft(setDraft, "best_time", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
            </div>
            <fieldset style={{ margin: "8px 0", padding: 6, border: "1px solid #dbeafe" }}><legend style={{ fontSize: 12 }}>Preferências de abordagem</legend><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{channels.map(([value, label]) => <label key={value} style={{ fontSize: 12 }}><input type="checkbox" checked={draft.channels.includes(value)} onChange={() => toggleChannel(setDraft, value)} /> {label}</label>)}</div></fieldset>
            <label style={{ display: "block", fontSize: 12 }}>Restrições de abordagem<textarea maxLength={500} value={draft.restrictions} onChange={event => updateDraft(setDraft, "restrictions", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", minHeight: 56, padding: 6 }} /></label>
            <label style={{ display: "inline-block", fontSize: 12, marginTop: 6 }}><input type="checkbox" checked={draft.is_primary} onChange={event => updateDraft(setDraft, "is_primary", event.target.checked)} /> Contato principal</label>
            <button type="submit" disabled={loading} style={{ display: "block", marginTop: 8, padding: "6px 12px" }}>Criar contato</button>
          </form>

          <div style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>Contatos de {selectedCompany.display_name} ({contacts.length})</h3>
            {loading && <p style={{ fontSize: 12 }}>Carregando…</p>}
            {!loading && contacts.length === 0 && <p style={{ fontSize: 12 }}>Nenhum contato nesta empresa.</p>}
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {contacts.map(contact => editingId === contact.id ? (
                <form key={contact.id} aria-label={`Editar contato ${contact.display_name}`} onSubmit={event => saveContact(event, contact.id)} style={{ padding: 10, background: "#fff", border: "1px solid #93c5fd", borderRadius: 6 }}>
                  <strong>Editando {contact.display_name}</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
                    <label style={{ fontSize: 12 }}>Nome do contato<input required maxLength={200} value={editingDraft.display_name} onChange={event => updateDraft(setEditingDraft, "display_name", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
                    <label style={{ fontSize: 12 }}>E-mail<input type="email" maxLength={254} value={editingDraft.email} onChange={event => updateDraft(setEditingDraft, "email", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
                    <label style={{ fontSize: 12 }}>Telefone<input maxLength={30} value={editingDraft.phone} onChange={event => updateDraft(setEditingDraft, "phone", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
                    <label style={{ fontSize: 12 }}>Função<select required aria-label="Função do contato" value={editingDraft.role} onChange={event => updateDraft(setEditingDraft, "role", event.target.value)} style={{ display: "block", width: "100%", padding: 6 }}><option value="">Escolha</option>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
                    <label style={{ fontSize: 12 }}>Papel de compra<select aria-label="Papel de compra" value={editingDraft.buying_role} onChange={event => updateDraft(setEditingDraft, "buying_role", event.target.value)} style={{ display: "block", width: "100%", padding: 6 }}><option value="">Não informado</option>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
                    <label style={{ fontSize: 12 }}>Origem legítima<select required aria-label="Origem legítima" value={editingDraft.origin} onChange={event => updateDraft(setEditingDraft, "origin", event.target.value)} style={{ display: "block", width: "100%", padding: 6 }}>{origins.map(origin => <option key={origin} value={origin}>{origin}</option>)}</select></label>
                    <label style={{ fontSize: 12 }}>Melhor horário<input maxLength={100} value={editingDraft.best_time} onChange={event => updateDraft(setEditingDraft, "best_time", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
                  </div>
                  <fieldset style={{ margin: "8px 0", padding: 6, border: "1px solid #dbeafe" }}><legend style={{ fontSize: 12 }}>Preferências de abordagem</legend><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{channels.map(([value, label]) => <label key={value} style={{ fontSize: 12 }}><input type="checkbox" checked={editingDraft.channels.includes(value)} onChange={() => toggleChannel(setEditingDraft, value)} /> {label}</label>)}</div></fieldset>
                  <label style={{ display: "block", fontSize: 12 }}>Restrições de abordagem<textarea maxLength={500} value={editingDraft.restrictions} onChange={event => updateDraft(setEditingDraft, "restrictions", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", minHeight: 56, padding: 6 }} /></label>
                  <label style={{ display: "inline-block", fontSize: 12, marginTop: 6 }}><input type="checkbox" checked={editingDraft.status === "active"} onChange={event => updateDraft(setEditingDraft, "status", event.target.checked ? "active" : "inactive")} /> Contato ativo</label>
                  <label style={{ display: "inline-block", fontSize: 12, margin: "6px 0 0 10px" }}><input type="checkbox" checked={editingDraft.is_primary} onChange={event => updateDraft(setEditingDraft, "is_primary", event.target.checked)} /> Contato principal</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}><button type="submit" disabled={loading} style={{ padding: "6px 12px" }}>Salvar contato</button><button type="button" onClick={() => setEditingId(null)} style={{ padding: "6px 12px" }}>Cancelar edição</button></div>
                </form>
              ) : (
                <article key={contact.id} aria-label={`Contato ${contact.display_name}`} style={{ padding: 10, background: "#fff", border: "1px solid #dbeafe", borderRadius: 6 }}>
                  <strong>{contact.display_name}</strong> <span style={{ fontSize: 12 }}>({contact.status === "active" ? "ativo" : "inativo"})</span>
                  <p style={{ fontSize: 12, margin: "4px 0" }}>Função: {contact.role || "não informada"} · Papel: {contact.buying_role || "não informado"} · Origem: {contact.origin || "não informada"}</p>
                  <p style={{ fontSize: 12, margin: "4px 0" }}>Preferências: {(contact.preferences?.channels || []).join(", ") || "não informadas"}{contact.preferences?.best_time ? ` · ${contact.preferences.best_time}` : ""} · Restrições: {contact.restrictions || "nenhuma"}</p>
                  <button type="button" onClick={() => { setEditingId(contact.id); setEditingDraft(draftFromContact(contact)); setMessage(""); }} style={{ padding: "6px 12px" }}>Editar contato</button>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>{error}</p>}
      {message && <p role="status" style={{ color: "#166534", fontSize: 12 }}>{message}</p>}
    </section>
  );
}
