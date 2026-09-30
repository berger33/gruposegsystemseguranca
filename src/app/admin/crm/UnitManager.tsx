"use client";

import { useEffect, useMemo, useState } from "react";

type Company = { id: string; display_name: string; type: string };
type Unit = {
  id: string;
  company_id: string;
  display_name: string;
  city: string | null;
  address: string | null;
  is_main: boolean;
  created_at: string;
};
type Draft = {
  display_name: string;
  city: string;
  address: string;
  is_main: boolean;
};

function blankDraft(): Draft {
  return {
    display_name: "",
    city: "",
    address: "",
    is_main: false,
  };
}

function draftFromUnit(unit: Unit): Draft {
  return {
    display_name: unit.display_name || "",
    city: unit.city || "",
    address: unit.address || "",
    is_main: Boolean(unit.is_main),
  };
}

function unitBody(draft: Draft) {
  return {
    display_name: draft.display_name,
    city: draft.city || null,
    address: draft.address || null,
    is_main: draft.is_main,
  };
}

export default function UnitManager({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
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
      setUnits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/crm/units?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "falha ao carregar unidades");
        if (!cancelled) setUnits(data.units || []);
      })
      .catch((reason: any) => { if (!cancelled) setError(reason?.message || "falha ao carregar unidades"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  function updateDraft(setter: React.Dispatch<React.SetStateAction<Draft>>, key: keyof Draft, value: string | boolean) {
    setter(previous => ({ ...previous, [key]: value } as Draft));
  }

  async function createUnit(event: React.FormEvent) {
    event.preventDefault();
    if (!companyId) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch("/api/crm/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, ...unitBody(draft) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "falha ao criar unidade");
      if (data.unit.is_main) {
        setUnits(previous => [data.unit, ...previous.map(u => ({ ...u, is_main: false }))]);
      } else {
        setUnits(previous => [...previous, data.unit]);
      }
      setDraft(blankDraft());
      setMessage("Unidade criada com trilha de auditoria.");
    } catch (reason: any) {
      setError(reason?.message || "falha ao criar unidade");
    } finally { setLoading(false); }
  }

  async function saveUnit(event: React.FormEvent, unitId: string) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/units/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(unitBody(editingDraft)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "falha ao editar unidade");
      setUnits(previous => {
        if (data.unit.is_main) {
          return previous.map(u => u.id === unitId ? data.unit : { ...u, is_main: false });
        }
        return previous.map(u => u.id === unitId ? data.unit : u);
      });
      setEditingId(null);
      setMessage("Unidade atualizada com trilha de auditoria.");
    } catch (reason: any) {
      setError(reason?.message || "falha ao editar unidade");
    } finally { setLoading(false); }
  }

  return (
    <section role="region" aria-labelledby="crm-01-units-title" style={{ marginTop: 16, padding: 12, border: "1px solid #fed7aa", borderRadius: 8, background: "#fff7ed" }}>
      <h2 id="crm-01-units-title" style={{ fontSize: 16, margin: 0 }}>Unidades — CRM-01</h2>
      <p style={{ fontSize: 12, margin: "6px 0", opacity: 0.8 }}>
        Cadastro central por empresa. Endereço, cidade e indicação de unidade principal são gerenciados pelo servidor com auditoria transacional.
      </p>
      <label htmlFor="crm-01-company" style={{ display: "block", fontSize: 12, marginTop: 8 }}>Empresa das unidades</label>
      <select id="crm-01-company" aria-label="Empresa das unidades" value={companyId} onChange={event => { setCompanyId(event.target.value); setEditingId(null); setMessage(""); }} style={{ display: "block", padding: 6, maxWidth: "100%" }}>
        <option value="">Escolha uma empresa</option>
        {companies.map(company => <option key={company.id} value={company.id}>{company.display_name}</option>)}
      </select>
      {!selectedCompany && <p style={{ fontSize: 12 }}>Crie ou carregue uma empresa para administrar suas unidades.</p>}

      {selectedCompany && (
        <>
          <form aria-label="Nova unidade CRM-01" onSubmit={createUnit} style={{ marginTop: 12, padding: 10, background: "#fff", border: "1px solid #ffedd5", borderRadius: 6 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>Nova unidade da empresa selecionada</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
              <label style={{ fontSize: 12 }}>Nome da unidade<input required maxLength={200} value={draft.display_name} onChange={event => updateDraft(setDraft, "display_name", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
              <label style={{ fontSize: 12 }}>Cidade<input maxLength={100} value={draft.city} onChange={event => updateDraft(setDraft, "city", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
              <label style={{ fontSize: 12 }}>Endereço<input maxLength={300} value={draft.address} onChange={event => updateDraft(setDraft, "address", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
            </div>
            <label style={{ display: "inline-block", fontSize: 12, marginTop: 8 }}><input type="checkbox" checked={draft.is_main} onChange={event => updateDraft(setDraft, "is_main", event.target.checked)} /> Unidade principal</label>
            <button type="submit" disabled={loading} style={{ display: "block", marginTop: 8, padding: "6px 12px" }}>Criar unidade</button>
          </form>

          <div style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>Unidades de {selectedCompany.display_name} ({units.length})</h3>
            {loading && <p style={{ fontSize: 12 }}>Carregando…</p>}
            {!loading && units.length === 0 && <p style={{ fontSize: 12 }}>Nenhuma unidade nesta empresa.</p>}
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {units.map(unit => editingId === unit.id ? (
                <form key={unit.id} aria-label={`Editar unidade ${unit.display_name}`} onSubmit={event => saveUnit(event, unit.id)} style={{ padding: 10, background: "#fff", border: "1px solid #fdba74", borderRadius: 6 }}>
                  <strong>Editando {unit.display_name}</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 8 }}>
                    <label style={{ fontSize: 12 }}>Nome da unidade<input required maxLength={200} value={editingDraft.display_name} onChange={event => updateDraft(setEditingDraft, "display_name", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
                    <label style={{ fontSize: 12 }}>Cidade<input maxLength={100} value={editingDraft.city} onChange={event => updateDraft(setEditingDraft, "city", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
                    <label style={{ fontSize: 12 }}>Endereço<input maxLength={300} value={editingDraft.address} onChange={event => updateDraft(setEditingDraft, "address", event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 6 }} /></label>
                  </div>
                  <label style={{ display: "inline-block", fontSize: 12, marginTop: 8 }}><input type="checkbox" checked={editingDraft.is_main} onChange={event => updateDraft(setEditingDraft, "is_main", event.target.checked)} /> Unidade principal</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}><button type="submit" disabled={loading} style={{ padding: "6px 12px" }}>Salvar unidade</button><button type="button" onClick={() => setEditingId(null)} style={{ padding: "6px 12px" }}>Cancelar edição</button></div>
                </form>
              ) : (
                <article key={unit.id} aria-label={`Unidade ${unit.display_name}`} style={{ padding: 10, background: "#fff", border: "1px solid #fed7aa", borderRadius: 6 }}>
                  <strong>{unit.display_name}</strong> {unit.is_main && <span style={{ fontSize: 12, marginLeft: 6, background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: 4 }}>Principal</span>}
                  <p style={{ fontSize: 12, margin: "4px 0" }}>Cidade: {unit.city || "-"} · Endereço: {unit.address || "-"}</p>
                  <button type="button" onClick={() => { setEditingId(unit.id); setEditingDraft(draftFromUnit(unit)); setMessage(""); }} style={{ padding: "6px 12px" }}>Editar unidade</button>
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
