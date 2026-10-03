"use client";

// EXT-01 — frota ligada ao backend canônico real.
// Estados reais: carregamento, vazio declarado, erro com retry e confirmação
// somente após resposta do servidor. Cada mutação usa uma chave de
// idempotência própria, preservada em falha de transporte/servidor para que o
// retry não duplique. Nada é inventado: sem registro canônico de frota, a
// tela declara a ausência; custo e histórico vêm somente da resposta do
// servidor, com fonte e data-base declaradas.

import { useCallback, useEffect, useState } from "react";

interface Vehicle {
  id: string;
  plate: string;
  model: string;
  manufacturer?: string | null;
  year?: number | null;
  fuel_type: string;
  status: string;
  responsible_name?: string | null;
  mileage: number;
  last_maintenance_date?: string | null;
  next_maintenance_date?: string | null;
  cost_center?: string | null;
  notes?: string | null;
  origin: string;
}

interface VehiclesResponse {
  vehicles: Vehicle[];
  fleet_registered: boolean;
  source: string;
  base_date: string;
  note: string;
}

interface AlertComponent {
  kind: string;
  status: string;
  detail?: string;
  base_performed_at?: string;
  due_date?: string;
  alert_from?: string;
  base_mileage?: number;
  due_mileage?: number;
  remaining_km?: number;
}

interface MaintenanceAlert {
  status: string;
  message?: string;
  rule?: {
    id: string;
    interval_days?: number | null;
    interval_km?: number | null;
    alert_before_days?: number;
    alert_before_km?: number;
    justification?: string;
  };
  components?: AlertComponent[];
  source: string;
  base_date: string;
}

interface Dossier {
  vehicle: Vehicle;
  fuel_logs: Array<{ id: string; fuel_date: string; liters: string | number; cost_cents: string | number; mileage?: number | null; station?: string | null }>;
  maintenance_logs: Array<{ id: string; maintenance_type: string; description: string; cost_cents: string | number; mileage?: number | null; performed_at: string; next_due_date?: string | null }>;
  documents: Array<{ id: string; document_type: string; document_number?: string | null; expiry_date?: string | null; file_name?: string | null; is_active: boolean; deactivate_reason?: string | null }>;
  responsible_history: Array<{ id: string; previous_responsible_name?: string | null; responsible_name: string; reason: string; assigned_at: string }>;
  events: Array<{ id: string; event_type: string; summary: string; created_at: string }>;
  maintenance_rule: { id: string; interval_days?: number | null; interval_km?: number | null; alert_before_days: number; alert_before_km: number; justification: string } | null;
  maintenance_alert: MaintenanceAlert;
  cost: {
    fuel_cost_cents: number;
    fuel_entries: number;
    maintenance_cost_cents: number;
    maintenance_entries: number;
    total_cents: number;
    source: string[];
    base_date: string;
    note: string;
  };
  base_date: string;
}

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : "—";
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error ? `${res.status} ${body.error}` : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

const ALERT_LABEL: Record<string, string> = {
  em_dia: "Em dia",
  alerta: "Alerta de manutenção",
  vencida: "Manutenção vencida",
  sem_base: "Sem base canônica",
  sem_regra: "Sem regra registrada",
};

const ALERT_CLASS: Record<string, string> = {
  em_dia: "bg-green-50 text-green-800 border-green-200",
  alerta: "bg-amber-50 text-amber-800 border-amber-300",
  vencida: "bg-red-50 text-red-800 border-red-300",
  sem_base: "bg-gray-50 text-gray-700 border-gray-300",
  sem_regra: "bg-gray-50 text-gray-700 border-gray-300",
};

export default function FrotaWorkspace() {
  const [listing, setListing] = useState<VehiclesResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);

  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Formulários; cada um com a sua chave de idempotência preservada em falha.
  const [vehicleForm, setVehicleForm] = useState({ plate: "", model: "", manufacturer: "", year: "", fuel_type: "flex", mileage: "0", cost_center: "", notes: "" });
  const [vehicleKey, setVehicleKey] = useState(() => newIdempotencyKey("ext01-veh"));
  const [responsibleForm, setResponsibleForm] = useState({ responsible_name: "", reason: "" });
  const [responsibleKey, setResponsibleKey] = useState(() => newIdempotencyKey("ext01-resp"));
  const [fuelForm, setFuelForm] = useState({ fuel_date: "", liters: "", cost_cents: "", mileage: "", station: "" });
  const [fuelKey, setFuelKey] = useState(() => newIdempotencyKey("ext01-fuel"));
  const [maintForm, setMaintForm] = useState({ maintenance_type: "", description: "", cost_cents: "", mileage: "", performed_at: "", next_due_date: "" });
  const [maintKey, setMaintKey] = useState(() => newIdempotencyKey("ext01-main"));
  const [docForm, setDocForm] = useState({ document_type: "", document_number: "", expiry_date: "", file_name: "" });
  const [docKey, setDocKey] = useState(() => newIdempotencyKey("ext01-doc"));
  const [ruleForm, setRuleForm] = useState({ interval_days: "", interval_km: "", alert_before_days: "15", alert_before_km: "500", justification: "" });
  const [ruleKey, setRuleKey] = useState(() => newIdempotencyKey("ext01-rule"));
  const [statusForm, setStatusForm] = useState({ status: "", mileage: "" });
  const [statusKey, setStatusKey] = useState(() => newIdempotencyKey("ext01-stat"));
  const [docDeactivateReason, setDocDeactivateReason] = useState("");
  const [docDeactivateKey, setDocDeactivateKey] = useState(() => newIdempotencyKey("ext01-docx"));

  const loadVehicles = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/ext/fleet/vehicles", { credentials: "same-origin" });
      if (!res.ok) throw new Error(await parseError(res));
      setListing(await res.json());
    } catch (err: unknown) {
      setListing(null);
      setListError(err instanceof Error ? err.message : "Erro ao carregar frota");
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDossier = useCallback(async (id: string) => {
    setDossierLoading(true);
    setDossierError(null);
    try {
      const res = await fetch(`/api/ext/fleet/vehicles/${id}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await parseError(res));
      setDossier(await res.json());
    } catch (err: unknown) {
      setDossier(null);
      setDossierError(err instanceof Error ? err.message : "Erro ao carregar dossiê do veículo");
    } finally {
      setDossierLoading(false);
    }
  }, []);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);
  useEffect(() => {
    if (selectedId) loadDossier(selectedId);
    else setDossier(null);
  }, [selectedId, loadDossier]);

  // Mutação genérica: confirmação apenas com resposta real; em falha a chave
  // de idempotência É PRESERVADA para o retry não duplicar.
  async function mutate(url: string, method: string, body: unknown, key: string, onSuccess: (payload: Record<string, unknown>) => void) {
    setBusy(true);
    setMutationError(null);
    setConfirmation(null);
    try {
      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ? `${res.status} ${payload.error}` : `HTTP ${res.status}`);
      onSuccess(payload as Record<string, unknown>);
    } catch (err: unknown) {
      setMutationError(err instanceof Error ? err.message : "Falha na operação; a chave de idempotência foi preservada para o retry.");
    } finally {
      setBusy(false);
    }
  }

  const refreshAfterMutation = useCallback(() => {
    loadVehicles();
    if (selectedId) loadDossier(selectedId);
  }, [loadVehicles, loadDossier, selectedId]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Frota — EXT-01</h1>
        <p className="text-sm text-gray-500 mt-1">
          Veículo, responsável, abastecimento, manutenção, documentos e custo, ligados ao backend canônico real.
          Histórico e custo por veículo vêm somente de registros canônicos; o alerta de manutenção deriva apenas de regra explícita registrada.
        </p>
      </div>

      {confirmation && (
        <div className="p-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded" role="status">{confirmation}</div>
      )}
      {mutationError && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded" role="alert">
          Erro: {mutationError} — a chave de idempotência foi preservada; repetir não duplica.
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Veículos registrados</h2>
          <button onClick={loadVehicles} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Recarregar</button>
        </div>
        {listLoading && <div className="p-4 text-sm text-gray-500">Carregando frota…</div>}
        {!listLoading && listError && (
          <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
            Erro ao carregar: {listError}{" "}
            <button onClick={loadVehicles} className="underline font-medium">Tentar novamente</button>
          </div>
        )}
        {!listLoading && !listError && listing && (
          <>
            <p className="text-xs text-gray-500">
              Fonte: {listing.source} · data-base: {new Date(listing.base_date).toLocaleString("pt-BR")}
            </p>
            {!listing.fleet_registered ? (
              <div className="p-8 text-center text-gray-600 border rounded">
                <p className="font-medium">Nenhum registro canônico de frota própria.</p>
                <p className="text-sm mt-1">{listing.note}</p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Placa</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Modelo</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Situação</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Responsável</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Km</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Origem</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Dossiê</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {listing.vehicles.map(v => (
                      <tr key={v.id} className={selectedId === v.id ? "bg-blue-50" : undefined}>
                        <td className="px-4 py-3 font-mono font-medium text-gray-900">{v.plate}</td>
                        <td className="px-4 py-3 text-gray-800">{v.model}{v.manufacturer ? ` (${v.manufacturer})` : ""}</td>
                        <td className="px-4 py-3 text-gray-600">{v.status}</td>
                        <td className="px-4 py-3 text-gray-600">{v.responsible_name || "— sem responsável registrado"}</td>
                        <td className="px-4 py-3 text-gray-600">{v.mileage}</td>
                        <td className="px-4 py-3 text-gray-500">{v.origin}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => setSelectedId(v.id)} className="text-blue-700 underline">abrir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-semibold">Registrar veículo</h2>
        <p className="text-xs text-gray-500">Autoria derivada da sessão no servidor; IDs e vínculos não são aceitos do navegador.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Placa (3–20)" value={vehicleForm.plate} onChange={e => setVehicleForm({ ...vehicleForm, plate: e.target.value })} />
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Modelo (3–200)" value={vehicleForm.model} onChange={e => setVehicleForm({ ...vehicleForm, model: e.target.value })} />
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Fabricante (opcional)" value={vehicleForm.manufacturer} onChange={e => setVehicleForm({ ...vehicleForm, manufacturer: e.target.value })} />
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Ano (opcional)" value={vehicleForm.year} onChange={e => setVehicleForm({ ...vehicleForm, year: e.target.value })} />
          <select className="border rounded px-2 py-1.5 text-sm" value={vehicleForm.fuel_type} onChange={e => setVehicleForm({ ...vehicleForm, fuel_type: e.target.value })}>
            {["flex", "gasolina", "etanol", "diesel", "eletrico", "hibrido", "outro"].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Km atual" value={vehicleForm.mileage} onChange={e => setVehicleForm({ ...vehicleForm, mileage: e.target.value })} />
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Centro de custo (opcional)" value={vehicleForm.cost_center} onChange={e => setVehicleForm({ ...vehicleForm, cost_center: e.target.value })} />
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Notas (opcional, 10–1000)" value={vehicleForm.notes} onChange={e => setVehicleForm({ ...vehicleForm, notes: e.target.value })} />
        </div>
        <button
          disabled={busy}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded disabled:opacity-50"
          onClick={() => mutate("/api/ext/fleet/vehicles", "POST", {
            plate: vehicleForm.plate,
            model: vehicleForm.model,
            manufacturer: vehicleForm.manufacturer || undefined,
            year: vehicleForm.year || undefined,
            fuel_type: vehicleForm.fuel_type,
            mileage: vehicleForm.mileage === "" ? undefined : Number(vehicleForm.mileage),
            cost_center: vehicleForm.cost_center || undefined,
            notes: vehicleForm.notes || undefined,
          }, vehicleKey, payload => {
            const vehicle = payload.vehicle as Vehicle | undefined;
            setConfirmation(vehicle ? `Veículo ${vehicle.plate} registrado pelo servidor${payload.replayed ? " (replay idempotente, sem duplicar)" : ""}.` : "Veículo registrado pelo servidor.");
            setVehicleForm({ plate: "", model: "", manufacturer: "", year: "", fuel_type: "flex", mileage: "0", cost_center: "", notes: "" });
            setVehicleKey(newIdempotencyKey("ext01-veh"));
            refreshAfterMutation();
          })}
        >
          {busy ? "Enviando…" : "Registrar veículo"}
        </button>
      </section>

      {selectedId && (
        <section className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dossiê do veículo</h2>
            <button onClick={() => setSelectedId(null)} className="text-sm text-gray-500 underline">fechar</button>
          </div>
          {dossierLoading && <div className="p-4 text-sm text-gray-500">Carregando dossiê…</div>}
          {!dossierLoading && dossierError && (
            <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
              Erro ao carregar: {dossierError}{" "}
              <button onClick={() => selectedId && loadDossier(selectedId)} className="underline font-medium">Tentar novamente</button>
            </div>
          )}
          {!dossierLoading && !dossierError && dossier && (
            <div className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded p-3 text-sm space-y-1">
                  <p className="font-mono text-base font-semibold">{dossier.vehicle.plate} — {dossier.vehicle.model}</p>
                  <p>Situação: <strong>{dossier.vehicle.status}</strong> · Km: <strong>{dossier.vehicle.mileage}</strong></p>
                  <p>Responsável: {dossier.vehicle.responsible_name || "— sem responsável registrado"}</p>
                  <p>Última manutenção: {dateOnly(dossier.vehicle.last_maintenance_date)} · Próxima declarada: {dateOnly(dossier.vehicle.next_maintenance_date)}</p>
                  <p className="text-xs text-gray-500">Origem do registro: {dossier.vehicle.origin} · data-base {new Date(dossier.base_date).toLocaleString("pt-BR")}</p>
                </div>
                <div className={`border rounded p-3 text-sm ${ALERT_CLASS[dossier.maintenance_alert.status] || ALERT_CLASS.sem_regra}`}>
                  <p className="font-semibold">{ALERT_LABEL[dossier.maintenance_alert.status] || dossier.maintenance_alert.status}</p>
                  {dossier.maintenance_alert.message && <p className="mt-1">{dossier.maintenance_alert.message}</p>}
                  {dossier.maintenance_alert.rule && (
                    <p className="mt-1 text-xs">
                      Regra registrada: {dossier.maintenance_alert.rule.interval_days != null ? `${dossier.maintenance_alert.rule.interval_days} dias` : ""}
                      {dossier.maintenance_alert.rule.interval_days != null && dossier.maintenance_alert.rule.interval_km != null ? " / " : ""}
                      {dossier.maintenance_alert.rule.interval_km != null ? `${dossier.maintenance_alert.rule.interval_km} km` : ""} — {dossier.maintenance_alert.rule.justification}
                    </p>
                  )}
                  {(dossier.maintenance_alert.components || []).map((c, i) => (
                    <p key={i} className="mt-1 text-xs">
                      [{c.kind}] {c.status}
                      {c.due_date ? ` · vence em ${c.due_date} (base ${c.base_performed_at})` : ""}
                      {c.due_mileage != null ? ` · vence aos ${c.due_mileage} km (restam ${c.remaining_km} km)` : ""}
                      {c.detail ? ` · ${c.detail}` : ""}
                    </p>
                  ))}
                  <p className="mt-2 text-xs opacity-80">Fonte: {dossier.maintenance_alert.source} · data-base {dossier.maintenance_alert.base_date}</p>
                </div>
              </div>

              <div className="border rounded p-3 text-sm">
                <h3 className="font-semibold">Custo por veículo</h3>
                <p className="mt-1">
                  Abastecimento: <strong>{brl(dossier.cost.fuel_cost_cents)}</strong> ({dossier.cost.fuel_entries} registros) ·
                  Manutenção: <strong>{brl(dossier.cost.maintenance_cost_cents)}</strong> ({dossier.cost.maintenance_entries} registros) ·
                  Total: <strong>{brl(dossier.cost.total_cents)}</strong>
                </p>
                <p className="text-xs text-gray-500 mt-1">{dossier.cost.note}</p>
                <p className="text-xs text-gray-500">Fonte: {dossier.cost.source.join(" + ")} · data-base {new Date(dossier.cost.base_date).toLocaleString("pt-BR")}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Atualizar situação / km</h3>
                  <div className="flex gap-2">
                    <select className="border rounded px-2 py-1.5 text-sm" value={statusForm.status} onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}>
                      <option value="">manter situação</option>
                      {["disponivel", "em_uso", "em_manutencao", "baixado", "reservado"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input className="border rounded px-2 py-1.5 text-sm w-28" placeholder="Km (≥ atual)" value={statusForm.mileage} onChange={e => setStatusForm({ ...statusForm, mileage: e.target.value })} />
                    <button
                      disabled={busy}
                      className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
                      onClick={() => mutate(`/api/ext/fleet/vehicles/${selectedId}`, "PATCH", {
                        ...(statusForm.status ? { status: statusForm.status } : {}),
                        ...(statusForm.mileage !== "" ? { mileage: Number(statusForm.mileage) } : {}),
                      }, statusKey, () => {
                        setConfirmation("Situação/quilometragem atualizada pelo servidor.");
                        setStatusForm({ status: "", mileage: "" });
                        setStatusKey(newIdempotencyKey("ext01-stat"));
                        refreshAfterMutation();
                      })}
                    >Atualizar</button>
                  </div>
                </div>

                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Atribuir responsável (com histórico imutável)</h3>
                  <input className="border rounded px-2 py-1.5 text-sm w-full" placeholder="Nome do responsável (2–200)" value={responsibleForm.responsible_name} onChange={e => setResponsibleForm({ ...responsibleForm, responsible_name: e.target.value })} />
                  <input className="border rounded px-2 py-1.5 text-sm w-full" placeholder="Motivo (5–500)" value={responsibleForm.reason} onChange={e => setResponsibleForm({ ...responsibleForm, reason: e.target.value })} />
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/fleet/vehicles/${selectedId}/responsible`, "POST", responsibleForm, responsibleKey, () => {
                      setConfirmation("Responsável atribuído pelo servidor, com histórico imutável.");
                      setResponsibleForm({ responsible_name: "", reason: "" });
                      setResponsibleKey(newIdempotencyKey("ext01-resp"));
                      refreshAfterMutation();
                    })}
                  >Atribuir</button>
                </div>

                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Registrar abastecimento</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border rounded px-2 py-1.5 text-sm" type="date" value={fuelForm.fuel_date} onChange={e => setFuelForm({ ...fuelForm, fuel_date: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Litros" value={fuelForm.liters} onChange={e => setFuelForm({ ...fuelForm, liters: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Custo (centavos)" value={fuelForm.cost_cents} onChange={e => setFuelForm({ ...fuelForm, cost_cents: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Km (opcional)" value={fuelForm.mileage} onChange={e => setFuelForm({ ...fuelForm, mileage: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm col-span-2" placeholder="Posto (opcional)" value={fuelForm.station} onChange={e => setFuelForm({ ...fuelForm, station: e.target.value })} />
                  </div>
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/fleet/vehicles/${selectedId}/fuel-logs`, "POST", {
                      fuel_date: fuelForm.fuel_date,
                      liters: fuelForm.liters === "" ? undefined : Number(fuelForm.liters),
                      cost_cents: fuelForm.cost_cents === "" ? undefined : Number(fuelForm.cost_cents),
                      mileage: fuelForm.mileage === "" ? undefined : Number(fuelForm.mileage),
                      station: fuelForm.station || undefined,
                    }, fuelKey, () => {
                      setConfirmation("Abastecimento registrado pelo servidor.");
                      setFuelForm({ fuel_date: "", liters: "", cost_cents: "", mileage: "", station: "" });
                      setFuelKey(newIdempotencyKey("ext01-fuel"));
                      refreshAfterMutation();
                    })}
                  >Registrar abastecimento</button>
                </div>

                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Registrar manutenção</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Tipo (3–100)" value={maintForm.maintenance_type} onChange={e => setMaintForm({ ...maintForm, maintenance_type: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Custo (centavos)" value={maintForm.cost_cents} onChange={e => setMaintForm({ ...maintForm, cost_cents: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm col-span-2" placeholder="Descrição (10–2000)" value={maintForm.description} onChange={e => setMaintForm({ ...maintForm, description: e.target.value })} />
                    <label className="text-xs text-gray-500 col-span-2">Realizada em / próxima prevista (opcional):</label>
                    <input className="border rounded px-2 py-1.5 text-sm" type="date" value={maintForm.performed_at} onChange={e => setMaintForm({ ...maintForm, performed_at: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" type="date" value={maintForm.next_due_date} onChange={e => setMaintForm({ ...maintForm, next_due_date: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Km na manutenção (opcional)" value={maintForm.mileage} onChange={e => setMaintForm({ ...maintForm, mileage: e.target.value })} />
                  </div>
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/fleet/vehicles/${selectedId}/maintenance-logs`, "POST", {
                      maintenance_type: maintForm.maintenance_type,
                      description: maintForm.description,
                      cost_cents: maintForm.cost_cents === "" ? undefined : Number(maintForm.cost_cents),
                      mileage: maintForm.mileage === "" ? undefined : Number(maintForm.mileage),
                      performed_at: maintForm.performed_at,
                      next_due_date: maintForm.next_due_date || undefined,
                    }, maintKey, () => {
                      setConfirmation("Manutenção registrada pelo servidor na mesma transação do veículo.");
                      setMaintForm({ maintenance_type: "", description: "", cost_cents: "", mileage: "", performed_at: "", next_due_date: "" });
                      setMaintKey(newIdempotencyKey("ext01-main"));
                      refreshAfterMutation();
                    })}
                  >Registrar manutenção</button>
                </div>

                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Registrar documento (metadados; sem arquivo real nesta fatia)</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Tipo (3–100)" value={docForm.document_type} onChange={e => setDocForm({ ...docForm, document_type: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Número (opcional)" value={docForm.document_number} onChange={e => setDocForm({ ...docForm, document_number: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" type="date" value={docForm.expiry_date} onChange={e => setDocForm({ ...docForm, expiry_date: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Nome do arquivo (opcional)" value={docForm.file_name} onChange={e => setDocForm({ ...docForm, file_name: e.target.value })} />
                  </div>
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/fleet/vehicles/${selectedId}/documents`, "POST", {
                      document_type: docForm.document_type,
                      document_number: docForm.document_number || undefined,
                      expiry_date: docForm.expiry_date || undefined,
                      file_name: docForm.file_name || undefined,
                    }, docKey, () => {
                      setConfirmation("Documento registrado pelo servidor.");
                      setDocForm({ document_type: "", document_number: "", expiry_date: "", file_name: "" });
                      setDocKey(newIdempotencyKey("ext01-doc"));
                      refreshAfterMutation();
                    })}
                  >Registrar documento</button>
                </div>

                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Regra explícita do alerta de manutenção</h3>
                  <p className="text-xs text-gray-500">O alerta deriva somente desta regra registrada; sem regra, a tela declara a ausência.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Intervalo em dias (opcional)" value={ruleForm.interval_days} onChange={e => setRuleForm({ ...ruleForm, interval_days: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Intervalo em km (opcional)" value={ruleForm.interval_km} onChange={e => setRuleForm({ ...ruleForm, interval_km: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Antecedência (dias)" value={ruleForm.alert_before_days} onChange={e => setRuleForm({ ...ruleForm, alert_before_days: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="Antecedência (km)" value={ruleForm.alert_before_km} onChange={e => setRuleForm({ ...ruleForm, alert_before_km: e.target.value })} />
                    <input className="border rounded px-2 py-1.5 text-sm col-span-2" placeholder="Justificativa (5–500)" value={ruleForm.justification} onChange={e => setRuleForm({ ...ruleForm, justification: e.target.value })} />
                  </div>
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/fleet/vehicles/${selectedId}/maintenance-rules`, "POST", {
                      interval_days: ruleForm.interval_days === "" ? undefined : Number(ruleForm.interval_days),
                      interval_km: ruleForm.interval_km === "" ? undefined : Number(ruleForm.interval_km),
                      alert_before_days: ruleForm.alert_before_days === "" ? undefined : Number(ruleForm.alert_before_days),
                      alert_before_km: ruleForm.alert_before_km === "" ? undefined : Number(ruleForm.alert_before_km),
                      justification: ruleForm.justification,
                    }, ruleKey, () => {
                      setConfirmation("Regra de manutenção registrada pelo servidor; regra anterior desativada na mesma transação.");
                      setRuleForm({ interval_days: "", interval_km: "", alert_before_days: "15", alert_before_km: "500", justification: "" });
                      setRuleKey(newIdempotencyKey("ext01-rule"));
                      refreshAfterMutation();
                    })}
                  >Registrar regra</button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded p-3">
                  <h3 className="font-semibold text-sm">Abastecimentos (fonte: ext_fleet_fuel_logs)</h3>
                  {dossier.fuel_logs.length === 0 ? (
                    <p className="text-sm text-gray-500 mt-2">Nenhum abastecimento canônico registrado.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {dossier.fuel_logs.map(f => (
                        <li key={f.id}>{dateOnly(f.fuel_date)} — {Number(f.liters)} L · {brl(Number(f.cost_cents))}{f.mileage != null ? ` · ${f.mileage} km` : ""}{f.station ? ` · ${f.station}` : ""}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="border rounded p-3">
                  <h3 className="font-semibold text-sm">Manutenções (fonte: ext_fleet_maintenance_logs)</h3>
                  {dossier.maintenance_logs.length === 0 ? (
                    <p className="text-sm text-gray-500 mt-2">Nenhuma manutenção canônica registrada.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {dossier.maintenance_logs.map(m => (
                        <li key={m.id}>{dateOnly(m.performed_at)} — {m.maintenance_type} · {brl(Number(m.cost_cents))}{m.next_due_date ? ` · próxima declarada ${dateOnly(m.next_due_date)}` : ""}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="border rounded p-3">
                  <h3 className="font-semibold text-sm">Documentos (fonte: ext_fleet_documents)</h3>
                  {dossier.documents.length === 0 ? (
                    <p className="text-sm text-gray-500 mt-2">Nenhum documento registrado.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm">
                      {dossier.documents.map(d => (
                        <li key={d.id} className={d.is_active ? "" : "text-gray-400"}>
                          {d.document_type}{d.document_number ? ` nº ${d.document_number}` : ""}{d.expiry_date ? ` · vence ${dateOnly(d.expiry_date)}` : ""} — {d.is_active ? "ativo" : `desativado (${d.deactivate_reason || "motivo registrado"})`}
                          {d.is_active && (
                            <span className="ml-2">
                              <input className="border rounded px-1 py-0.5 text-xs w-44" placeholder="motivo da desativação" value={docDeactivateReason} onChange={e => setDocDeactivateReason(e.target.value)} />
                              <button
                                disabled={busy}
                                className="ml-1 text-xs underline text-red-700 disabled:opacity-50"
                                onClick={() => mutate(`/api/ext/fleet/documents/${d.id}`, "PATCH", { reason: docDeactivateReason }, docDeactivateKey, () => {
                                  setConfirmation("Documento desativado pelo servidor, com autor e motivo registrados.");
                                  setDocDeactivateReason("");
                                  setDocDeactivateKey(newIdempotencyKey("ext01-docx"));
                                  refreshAfterMutation();
                                })}
                              >desativar</button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="border rounded p-3">
                  <h3 className="font-semibold text-sm">Responsáveis (fonte: ext_fleet_responsible_history)</h3>
                  {dossier.responsible_history.length === 0 ? (
                    <p className="text-sm text-gray-500 mt-2">Nenhuma atribuição registrada pela jornada canônica.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {dossier.responsible_history.map(r => (
                        <li key={r.id}>{new Date(r.assigned_at).toLocaleString("pt-BR")} — {r.previous_responsible_name ? `${r.previous_responsible_name} → ` : ""}{r.responsible_name} · {r.reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="border rounded p-3">
                <h3 className="font-semibold text-sm">Eventos do veículo (fonte: ext_fleet_vehicle_events, imutável)</h3>
                {dossier.events.length === 0 ? (
                  <p className="text-sm text-gray-500 mt-2">Nenhum evento da jornada canônica registrado.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {dossier.events.map(ev => (
                      <li key={ev.id}>{new Date(ev.created_at).toLocaleString("pt-BR")} — [{ev.event_type}] {ev.summary}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
