"use client";

// EXT-02 — terceiros ligados ao backend canônico real.
// Estados reais: carregamento, vazio declarado, erro com retry e confirmação
// somente após resposta do servidor. Cada mutação usa uma chave de
// idempotência própria, PRESERVADA em falha para que o retry não duplique.
// Nada é inventado: sem registro canônico, a tela declara a ausência;
// vigência de acesso, vencimento de documento e avaliação vêm somente da
// resposta do servidor, com fonte e data-base declaradas.
//
// A fronteira externa é declarada, não simulada: não existe ator externo
// "terceiro" autenticado; a tela mostra o aviso devolvido pelo servidor.

import { useCallback, useEffect, useState } from "react";

interface AccessWindow {
  status: string;
  access_start: string;
  access_end: string;
  days_to_end?: number;
  days_since_end?: number;
  days_to_start?: number;
  revoked_at?: string | null;
  revoke_reason?: string | null;
  derivation: string;
  base_date: string;
}

interface AccessSituation {
  status: string;
  third_party_status: string | null;
  grants_registered: number;
  active_windows: number;
  windows: Array<{ grant_id: string; scope_kind: string; contract_id: string | null; service_order_id: string | null; window: AccessWindow }>;
  note: string;
  source: string;
  base_date: string;
}

interface ExternalBoundary {
  authenticated_third_party_channel: boolean;
  status: string;
  note: string;
  canonical_sessions_today: string[];
  enforcement_point: string;
}

interface ThirdParty {
  id: string;
  name: string;
  document?: string | null;
  category?: string | null;
  status: string;
  contract_id?: string | null;
  contract_title?: string | null;
  contract_status?: string | null;
  contract_verified_at?: string | null;
  contract_verified_status?: string | null;
  responsible_name?: string | null;
  evaluation_score?: number | null;
  evaluation_source_id?: string | null;
  notes?: string | null;
  origin: string;
  access_situation?: AccessSituation;
}

interface PartiesResponse {
  third_parties: ThirdParty[];
  third_parties_registered: boolean;
  scope: { kind: string; roles: string[]; filters_applied: Record<string, string | null>; note: string };
  source: string[];
  base_date: string;
  external_actor_boundary: ExternalBoundary;
  note: string;
}

interface DocumentExpiry {
  status: string;
  expiry_date: string | null;
  days_overdue?: number;
  days_to_expiry?: number;
  alert_from?: string;
  alert_rule?: { id: string; alert_before_days: number; justification: string } | null;
  alert_rule_absence?: string;
  derivation: string;
  source: string | string[];
  base_date: string;
}

interface Dossier {
  third_party: ThirdParty;
  contract_link: { contract_id: string | null; title?: string | null; status_now?: string | null; verified_at?: string | null; verified_status?: string | null; note: string; source: string };
  access_grants: Array<{
    id: string; scope_kind: string; contract_id: string | null; contract_title: string | null;
    service_order_id: string | null; service_order_protocol: string | null; justification: string;
    granted_at: string; revoked_at: string | null; revoke_reason: string | null; window: AccessWindow;
  }>;
  access_situation: AccessSituation;
  documents: Array<{ id: string; document_type: string; document_number?: string | null; file_name?: string | null; expiry_date?: string | null; is_active: boolean; deactivate_reason?: string | null; expiry: DocumentExpiry }>;
  document_rule: { id: string; alert_before_days: number; justification: string } | null;
  document_rule_absence: string | null;
  evaluations: Array<{ id: string; score: number; justification: string; evaluated_on: string; created_at: string }>;
  evaluation_summary: { latest: { id: string; score: number; justification: string; evaluated_on: string } | null; registered: number; note: string; source: string; base_date: string };
  events: Array<{ id: string; event_type: string; summary: string; created_at: string }>;
  external_actor_boundary: ExternalBoundary;
  source: Record<string, string>;
  base_date: string;
}

interface AuthorizationDecision {
  authorized: boolean;
  reason: string;
  derivation: string;
  scope: { kind: string | null; id: string | null };
  window?: AccessWindow;
  grant?: { id: string; scope_kind: string; contract_id: string | null; service_order_id: string | null };
  source: string[];
  base_date: string;
  external_actor_boundary: ExternalBoundary;
}

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
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

const WINDOW_LABEL: Record<string, string> = {
  vigente: "Acesso vigente",
  expirado: "Expirado — acesso perdido ao término",
  nao_iniciado: "Janela futura",
  revogado: "Revogado",
};

const WINDOW_CLASS: Record<string, string> = {
  vigente: "bg-green-50 text-green-800 border-green-200",
  expirado: "bg-red-50 text-red-800 border-red-300",
  nao_iniciado: "bg-blue-50 text-blue-800 border-blue-200",
  revogado: "bg-gray-100 text-gray-700 border-gray-300",
};

const SITUATION_LABEL: Record<string, string> = {
  sem_janela_registrada: "Sem janela registrada",
  com_acesso_vigente: "Com acesso vigente",
  sem_acesso_vigente: "Sem acesso vigente",
  janela_futura: "Janela futura",
  revogado: "Revogado",
  bloqueado_por_situacao_do_terceiro: "Bloqueado pela situação do terceiro",
};

const EXPIRY_LABEL: Record<string, string> = {
  vigente: "Vigente",
  a_vencer: "A vencer",
  vencido: "Vencido",
  sem_data_declarada: "Sem data de validade declarada",
  desativado: "Desativado",
};

const EXPIRY_CLASS: Record<string, string> = {
  vigente: "text-green-800",
  a_vencer: "text-amber-800",
  vencido: "text-red-800",
  sem_data_declarada: "text-gray-600",
  desativado: "text-gray-500",
};

export default function TerceirosWorkspace() {
  const [listing, setListing] = useState<PartiesResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);

  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [decision, setDecision] = useState<AuthorizationDecision | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Formulários; cada um com a sua chave de idempotência preservada em falha.
  const [partyForm, setPartyForm] = useState({ name: "", document: "", category: "", responsible_name: "", notes: "" });
  const [partyKey, setPartyKey] = useState(() => newIdempotencyKey("ext02-tp"));
  const [contractForm, setContractForm] = useState({ contract_id: "", justification: "" });
  const [contractKey, setContractKey] = useState(() => newIdempotencyKey("ext02-ctr"));
  const [grantForm, setGrantForm] = useState({ scope_kind: "contrato", scope_id: "", access_start: "", access_end: "", justification: "" });
  const [grantKey, setGrantKey] = useState(() => newIdempotencyKey("ext02-grt"));
  const [docForm, setDocForm] = useState({ document_type: "", document_number: "", expiry_date: "", file_name: "" });
  const [docKey, setDocKey] = useState(() => newIdempotencyKey("ext02-doc"));
  const [ruleForm, setRuleForm] = useState({ alert_before_days: "30", justification: "" });
  const [ruleKey, setRuleKey] = useState(() => newIdempotencyKey("ext02-rul"));
  const [evalForm, setEvalForm] = useState({ score: "", justification: "", evaluated_on: "" });
  const [evalKey, setEvalKey] = useState(() => newIdempotencyKey("ext02-avl"));
  const [statusForm, setStatusForm] = useState({ status: "", reason: "" });
  const [statusKey, setStatusKey] = useState(() => newIdempotencyKey("ext02-sta"));
  const [revokeForm, setRevokeForm] = useState({ grant_id: "", reason: "" });
  const [revokeKey, setRevokeKey] = useState(() => newIdempotencyKey("ext02-rev"));
  const [deactivateForm, setDeactivateForm] = useState({ document_id: "", reason: "" });
  const [deactivateKey, setDeactivateKey] = useState(() => newIdempotencyKey("ext02-dcx"));
  const [checkForm, setCheckForm] = useState({ scope_kind: "contrato", scope_id: "" });

  const loadParties = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/ext/third-party/parties", { credentials: "same-origin" });
      if (!res.ok) throw new Error(await parseError(res));
      setListing(await res.json());
    } catch (err: unknown) {
      setListing(null);
      setListError(err instanceof Error ? err.message : "Erro ao carregar terceiros");
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDossier = useCallback(async (id: string) => {
    setDossierLoading(true);
    setDossierError(null);
    try {
      const res = await fetch(`/api/ext/third-party/parties/${id}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await parseError(res));
      setDossier(await res.json());
    } catch (err: unknown) {
      setDossier(null);
      setDossierError(err instanceof Error ? err.message : "Erro ao carregar dossiê do terceiro");
    } finally {
      setDossierLoading(false);
    }
  }, []);

  useEffect(() => { loadParties(); }, [loadParties]);
  useEffect(() => {
    if (selectedId) loadDossier(selectedId);
    else { setDossier(null); setDecision(null); }
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
    loadParties();
    if (selectedId) loadDossier(selectedId);
  }, [loadParties, loadDossier, selectedId]);

  async function checkAuthorization() {
    if (!selectedId) return;
    setDecision(null);
    setDecisionError(null);
    try {
      const query = new URLSearchParams({ scope_kind: checkForm.scope_kind, scope_id: checkForm.scope_id });
      const res = await fetch(`/api/ext/third-party/parties/${selectedId}/authorization?${query}`, { credentials: "same-origin" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ? `${res.status} ${payload.error}` : `HTTP ${res.status}`);
      setDecision(payload as AuthorizationDecision);
    } catch (err: unknown) {
      setDecisionError(err instanceof Error ? err.message : "Erro ao consultar autorização");
    }
  }

  const boundary = dossier?.external_actor_boundary ?? listing?.external_actor_boundary ?? null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Terceiros — EXT-02</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cadastro, contrato validado, documentos com vencimento, acesso temporário e avaliação, ligados ao backend canônico real.
          O terceiro só tem acesso ao contrato/OS autorizado e perde o acesso ao término, por derivação determinística da janela registrada.
        </p>
      </div>

      {boundary && (
        <div className="p-3 text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded" role="note">
          <strong>Fronteira externa declarada ({boundary.status}):</strong> {boundary.note}
          <p className="text-xs mt-1">Sessões canônicas existentes hoje: {boundary.canonical_sessions_today.join(" · ")}.</p>
          <p className="text-xs">Ponto de imposição: {boundary.enforcement_point}</p>
        </div>
      )}

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
          <h2 className="text-lg font-semibold">Terceiros registrados</h2>
          <button onClick={loadParties} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Recarregar</button>
        </div>
        {listLoading && <div className="p-4 text-sm text-gray-500">Carregando terceiros…</div>}
        {!listLoading && listError && (
          <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded">
            Erro ao carregar: {listError}{" "}
            <button onClick={loadParties} className="underline font-medium">Tentar novamente</button>
          </div>
        )}
        {!listLoading && !listError && listing && (
          <>
            <p className="text-xs text-gray-500">
              Fonte: {listing.source.join(" + ")} · data-base: {new Date(listing.base_date).toLocaleString("pt-BR")} · escopo: {listing.scope.note}
            </p>
            {!listing.third_parties_registered ? (
              <div className="p-8 text-center text-gray-600 border rounded">
                <p className="font-medium">Nenhum terceiro registrado no backend canônico.</p>
                <p className="text-sm mt-1">{listing.note}</p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Terceiro</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Categoria</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Situação</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Contrato vinculado</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Acesso derivado</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Avaliação</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Dossiê</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {listing.third_parties.map(tp => (
                      <tr key={tp.id} className={selectedId === tp.id ? "bg-blue-50" : undefined}>
                        <td className="px-4 py-3 font-medium text-gray-900">{tp.name}<span className="block text-xs text-gray-500">{tp.document || "sem documento declarado"} · origem {tp.origin}</span></td>
                        <td className="px-4 py-3 text-gray-600">{tp.category || "— não declarada"}</td>
                        <td className="px-4 py-3 text-gray-600">{tp.status}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {tp.contract_id ? (
                            <>
                              {tp.contract_title || tp.contract_id}
                              <span className="block text-xs text-gray-500">verificado em {dateOnly(tp.contract_verified_at)}</span>
                            </>
                          ) : "— nenhum contrato canônico vinculado"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {tp.access_situation ? (
                            <>
                              {SITUATION_LABEL[tp.access_situation.status] || tp.access_situation.status}
                              <span className="block text-xs text-gray-500">{tp.access_situation.active_windows} vigente(s) de {tp.access_situation.grants_registered} janela(s)</span>
                            </>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {tp.evaluation_score != null ? `${tp.evaluation_score}/10` : "— sem avaliação canônica"}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setSelectedId(tp.id)} className="text-blue-700 underline">abrir</button>
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
        <h2 className="text-lg font-semibold">Cadastrar terceiro</h2>
        <p className="text-xs text-gray-500">
          Autoria derivada da sessão no servidor; IDs e vínculos não são aceitos do navegador. Contrato, janela de acesso e avaliação têm rotas canônicas próprias.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Nome (3–200)" value={partyForm.name} onChange={e => setPartyForm({ ...partyForm, name: e.target.value })} />
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Documento (opcional, 3–30)" value={partyForm.document} onChange={e => setPartyForm({ ...partyForm, document: e.target.value })} />
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Categoria (opcional, 3–100)" value={partyForm.category} onChange={e => setPartyForm({ ...partyForm, category: e.target.value })} />
          <input className="border rounded px-2 py-1.5 text-sm" placeholder="Responsável (opcional, 2–200)" value={partyForm.responsible_name} onChange={e => setPartyForm({ ...partyForm, responsible_name: e.target.value })} />
          <input className="border rounded px-2 py-1.5 text-sm md:col-span-2" placeholder="Notas (opcional, 10–1000)" value={partyForm.notes} onChange={e => setPartyForm({ ...partyForm, notes: e.target.value })} />
        </div>
        <button
          disabled={busy}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded disabled:opacity-50"
          onClick={() => mutate("/api/ext/third-party/parties", "POST", {
            name: partyForm.name,
            document: partyForm.document || undefined,
            category: partyForm.category || undefined,
            responsible_name: partyForm.responsible_name || undefined,
            notes: partyForm.notes || undefined,
          }, partyKey, payload => {
            const tp = payload.third_party as ThirdParty | undefined;
            setConfirmation(tp ? `Terceiro ${tp.name} registrado pelo servidor${payload.replayed ? " (replay idempotente, sem duplicar)" : ""}.` : "Terceiro registrado pelo servidor.");
            setPartyForm({ name: "", document: "", category: "", responsible_name: "", notes: "" });
            setPartyKey(newIdempotencyKey("ext02-tp"));
            refreshAfterMutation();
          })}
        >
          {busy ? "Enviando…" : "Cadastrar terceiro"}
        </button>
      </section>

      {selectedId && (
        <section className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dossiê do terceiro</h2>
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
                  <p className="text-base font-semibold">{dossier.third_party.name}</p>
                  <p>Situação: <strong>{dossier.third_party.status}</strong> · Categoria: {dossier.third_party.category || "— não declarada"}</p>
                  <p>Responsável: {dossier.third_party.responsible_name || "— não declarado"}</p>
                  <p className="text-xs text-gray-500">Origem do registro: {dossier.third_party.origin} · data-base {new Date(dossier.base_date).toLocaleString("pt-BR")}</p>
                </div>
                <div className="border rounded p-3 text-sm space-y-1">
                  <p className="font-semibold">Contrato vinculado</p>
                  {dossier.contract_link.contract_id ? (
                    <>
                      <p>{dossier.contract_link.title || dossier.contract_link.contract_id}</p>
                      <p>Situação agora: <strong>{dossier.contract_link.status_now}</strong> · na verificação: {dossier.contract_link.verified_status}</p>
                      <p className="text-xs text-gray-500">Verificado em {dateOnly(dossier.contract_link.verified_at)} · {dossier.contract_link.note}</p>
                    </>
                  ) : <p className="text-gray-600">{dossier.contract_link.note}</p>}
                  <p className="text-xs text-gray-500">Fonte: {dossier.contract_link.source}</p>
                </div>
              </div>

              <div className="border rounded p-3 text-sm">
                <h3 className="font-semibold">Situação de acesso derivada</h3>
                <p className="mt-1">
                  <strong>{SITUATION_LABEL[dossier.access_situation.status] || dossier.access_situation.status}</strong> ·
                  {" "}{dossier.access_situation.active_windows} janela(s) vigente(s) de {dossier.access_situation.grants_registered} registrada(s)
                </p>
                <p className="text-xs text-gray-500 mt-1">{dossier.access_situation.note}</p>
                <p className="text-xs text-gray-500">Fonte: {dossier.access_situation.source} · data-base {dossier.access_situation.base_date}</p>
              </div>

              <div className="border rounded p-3 space-y-2">
                <h3 className="font-semibold text-sm">Janelas de acesso temporário</h3>
                {dossier.access_grants.length === 0 ? (
                  <p className="text-sm text-gray-600">Nenhuma janela de acesso canônica registrada; nenhum acesso é presumido.</p>
                ) : (
                  <ul className="space-y-2">
                    {dossier.access_grants.map(grant => (
                      <li key={grant.id} className={`border rounded p-2 text-sm ${WINDOW_CLASS[grant.window.status] || "bg-gray-50 border-gray-200"}`}>
                        <p className="font-medium">
                          {WINDOW_LABEL[grant.window.status] || grant.window.status} — escopo {grant.scope_kind}:{" "}
                          {grant.scope_kind === "contrato" ? (grant.contract_title || grant.contract_id) : (grant.service_order_protocol || grant.service_order_id)}
                        </p>
                        <p className="text-xs mt-1">Janela {grant.window.access_start} → {grant.window.access_end} · {grant.window.derivation}</p>
                        <p className="text-xs">Justificativa: {grant.justification}</p>
                        {grant.revoked_at && <p className="text-xs">Revogado em {dateOnly(grant.revoked_at)}: {grant.revoke_reason}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Vincular contrato (validado no servidor)</h3>
                  <input className="border rounded px-2 py-1.5 text-sm w-full" placeholder="UUID do contrato em crm_contracts" value={contractForm.contract_id} onChange={e => setContractForm({ ...contractForm, contract_id: e.target.value })} />
                  <input className="border rounded px-2 py-1.5 text-sm w-full" placeholder="Justificativa (5–500)" value={contractForm.justification} onChange={e => setContractForm({ ...contractForm, justification: e.target.value })} />
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/third-party/parties/${selectedId}/contract`, "POST", contractForm, contractKey, () => {
                      setConfirmation("Contrato vinculado após validação canônica no servidor.");
                      setContractForm({ contract_id: "", justification: "" });
                      setContractKey(newIdempotencyKey("ext02-ctr"));
                      refreshAfterMutation();
                    })}
                  >
                    {busy ? "Enviando…" : "Vincular contrato"}
                  </button>
                </div>

                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Conceder acesso temporário</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="border rounded px-2 py-1.5 text-sm" value={grantForm.scope_kind} onChange={e => setGrantForm({ ...grantForm, scope_kind: e.target.value })}>
                      <option value="contrato">contrato</option>
                      <option value="ordem_servico">ordem de serviço</option>
                    </select>
                    <input className="border rounded px-2 py-1.5 text-sm" placeholder="UUID do escopo" value={grantForm.scope_id} onChange={e => setGrantForm({ ...grantForm, scope_id: e.target.value })} />
                    <input type="date" className="border rounded px-2 py-1.5 text-sm" value={grantForm.access_start} onChange={e => setGrantForm({ ...grantForm, access_start: e.target.value })} />
                    <input type="date" className="border rounded px-2 py-1.5 text-sm" value={grantForm.access_end} onChange={e => setGrantForm({ ...grantForm, access_end: e.target.value })} />
                  </div>
                  <input className="border rounded px-2 py-1.5 text-sm w-full" placeholder="Justificativa (10–1000)" value={grantForm.justification} onChange={e => setGrantForm({ ...grantForm, justification: e.target.value })} />
                  <p className="text-xs text-gray-500">O término é obrigatório: a perda de acesso é derivada dele, não marcada à mão.</p>
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/third-party/parties/${selectedId}/access-grants`, "POST", grantForm, grantKey, () => {
                      setConfirmation("Janela de acesso registrada pelo servidor com escopo autorizado e término obrigatório.");
                      setGrantForm({ scope_kind: "contrato", scope_id: "", access_start: "", access_end: "", justification: "" });
                      setGrantKey(newIdempotencyKey("ext02-grt"));
                      refreshAfterMutation();
                    })}
                  >
                    {busy ? "Enviando…" : "Conceder acesso"}
                  </button>
                </div>

                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Revogar janela de acesso</h3>
                  <input className="border rounded px-2 py-1.5 text-sm w-full" placeholder="UUID da janela" value={revokeForm.grant_id} onChange={e => setRevokeForm({ ...revokeForm, grant_id: e.target.value })} />
                  <input className="border rounded px-2 py-1.5 text-sm w-full" placeholder="Motivo (5–500)" value={revokeForm.reason} onChange={e => setRevokeForm({ ...revokeForm, reason: e.target.value })} />
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/third-party/access-grants/${revokeForm.grant_id}/revoke`, "POST", { reason: revokeForm.reason }, revokeKey, () => {
                      setConfirmation("Janela revogada com autor e motivo; o histórico permanece imutável.");
                      setRevokeForm({ grant_id: "", reason: "" });
                      setRevokeKey(newIdempotencyKey("ext02-rev"));
                      refreshAfterMutation();
                    })}
                  >
                    {busy ? "Enviando…" : "Revogar acesso"}
                  </button>
                </div>

                <div className="border rounded p-3 space-y-2">
                  <h3 className="font-semibold text-sm">Atualizar situação do terceiro</h3>
                  <select className="border rounded px-2 py-1.5 text-sm w-full" value={statusForm.status} onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}>
                    <option value="">selecione a situação</option>
                    {["ativo", "inativo", "suspenso", "encerrado"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input className="border rounded px-2 py-1.5 text-sm w-full" placeholder="Motivo (5–500)" value={statusForm.reason} onChange={e => setStatusForm({ ...statusForm, reason: e.target.value })} />
                  <p className="text-xs text-gray-500">Encerrar revoga, na mesma transação, todas as janelas ainda vigentes.</p>
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/third-party/parties/${selectedId}`, "PATCH", statusForm, statusKey, payload => {
                      setConfirmation(`Situação atualizada pelo servidor; janelas revogadas: ${payload.revoked_grants ?? 0}.`);
                      setStatusForm({ status: "", reason: "" });
                      setStatusKey(newIdempotencyKey("ext02-sta"));
                      refreshAfterMutation();
                    })}
                  >
                    {busy ? "Enviando…" : "Atualizar situação"}
                  </button>
                </div>
              </div>

              <div className="border rounded p-3 space-y-2">
                <h3 className="font-semibold text-sm">Documentos e vencimentos</h3>
                {dossier.document_rule ? (
                  <p className="text-xs text-gray-600">
                    Regra de antecedência registrada: {dossier.document_rule.alert_before_days} dias — {dossier.document_rule.justification}
                  </p>
                ) : (
                  <p className="text-xs text-gray-600">{dossier.document_rule_absence}</p>
                )}
                {dossier.documents.length === 0 ? (
                  <p className="text-sm text-gray-600">Nenhum documento canônico registrado; a ausência é declarada.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {dossier.documents.map(document => (
                      <li key={document.id} className="border rounded p-2">
                        <p className="font-medium">
                          {document.document_type} {document.document_number ? `· ${document.document_number}` : ""}{" "}
                          <span className={EXPIRY_CLASS[document.expiry.status] || "text-gray-600"}>
                            [{EXPIRY_LABEL[document.expiry.status] || document.expiry.status}]
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">{document.expiry.derivation}</p>
                        {!document.is_active && <p className="text-xs text-gray-500">Desativado: {document.deactivate_reason}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                  <input className="border rounded px-2 py-1.5 text-sm" placeholder="Tipo (3–100)" value={docForm.document_type} onChange={e => setDocForm({ ...docForm, document_type: e.target.value })} />
                  <input className="border rounded px-2 py-1.5 text-sm" placeholder="Número (opcional)" value={docForm.document_number} onChange={e => setDocForm({ ...docForm, document_number: e.target.value })} />
                  <input type="date" className="border rounded px-2 py-1.5 text-sm" value={docForm.expiry_date} onChange={e => setDocForm({ ...docForm, expiry_date: e.target.value })} />
                  <input className="border rounded px-2 py-1.5 text-sm" placeholder="Nome do arquivo (opcional)" value={docForm.file_name} onChange={e => setDocForm({ ...docForm, file_name: e.target.value })} />
                </div>
                <p className="text-xs text-gray-500">Registro de metadados sintéticos: esta fatia não faz upload de arquivo real; a ausência de bytes é declarada.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
                    onClick={() => mutate(`/api/ext/third-party/parties/${selectedId}/documents`, "POST", {
                      document_type: docForm.document_type,
                      document_number: docForm.document_number || undefined,
                      expiry_date: docForm.expiry_date || undefined,
                      file_name: docForm.file_name || undefined,
                    }, docKey, () => {
                      setConfirmation("Documento registrado pelo servidor; vencimento derivado da data declarada.");
                      setDocForm({ document_type: "", document_number: "", expiry_date: "", file_name: "" });
                      setDocKey(newIdempotencyKey("ext02-doc"));
                      refreshAfterMutation();
                    })}
                  >
                    {busy ? "Enviando…" : "Registrar documento"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <input className="border rounded px-2 py-1.5 text-sm" placeholder="UUID do documento a desativar" value={deactivateForm.document_id} onChange={e => setDeactivateForm({ ...deactivateForm, document_id: e.target.value })} />
                  <input className="border rounded px-2 py-1.5 text-sm" placeholder="Motivo (5–500)" value={deactivateForm.reason} onChange={e => setDeactivateForm({ ...deactivateForm, reason: e.target.value })} />
                </div>
                <button
                  disabled={busy}
                  className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
                  onClick={() => mutate(`/api/ext/third-party/documents/${deactivateForm.document_id}/deactivate`, "POST", { reason: deactivateForm.reason }, deactivateKey, () => {
                    setConfirmation("Documento desativado com autor e motivo; o registro permanece.");
                    setDeactivateForm({ document_id: "", reason: "" });
                    setDeactivateKey(newIdempotencyKey("ext02-dcx"));
                    refreshAfterMutation();
                  })}
                >
                  {busy ? "Enviando…" : "Desativar documento"}
                </button>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t">
                  <input className="border rounded px-2 py-1.5 text-sm" placeholder="Antecedência em dias (1–365)" value={ruleForm.alert_before_days} onChange={e => setRuleForm({ ...ruleForm, alert_before_days: e.target.value })} />
                  <input className="border rounded px-2 py-1.5 text-sm" placeholder="Justificativa da regra (5–500)" value={ruleForm.justification} onChange={e => setRuleForm({ ...ruleForm, justification: e.target.value })} />
                </div>
                <button
                  disabled={busy}
                  className="px-3 py-1.5 text-sm border rounded disabled:opacity-50"
                  onClick={() => mutate(`/api/ext/third-party/parties/${selectedId}/document-rules`, "POST", {
                    alert_before_days: Number(ruleForm.alert_before_days),
                    justification: ruleForm.justification,
                  }, ruleKey, () => {
                    setConfirmation("Regra explícita de antecedência registrada; o alerta deriva somente dela.");
                    setRuleForm({ alert_before_days: "30", justification: "" });
                    setRuleKey(newIdempotencyKey("ext02-rul"));
                    refreshAfterMutation();
                  })}
                >
                  {busy ? "Enviando…" : "Registrar regra de antecedência"}
                </button>
              </div>

              <div className="border rounded p-3 space-y-2">
                <h3 className="font-semibold text-sm">Avaliação</h3>
                <p className="text-xs text-gray-500">{dossier.evaluation_summary.note} · Fonte: {dossier.evaluation_summary.source}</p>
                {dossier.evaluations.length === 0 ? (
                  <p className="text-sm text-gray-600">Nenhuma avaliação canônica registrada; nenhuma nota é inventada.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {dossier.evaluations.map(item => (
                      <li key={item.id} className="border rounded p-2">
                        <p className="font-medium">{item.score}/10 em {dateOnly(item.evaluated_on)}</p>
                        <p className="text-xs text-gray-600">{item.justification}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                  <input className="border rounded px-2 py-1.5 text-sm" placeholder="Nota 0–10 (obrigatória)" value={evalForm.score} onChange={e => setEvalForm({ ...evalForm, score: e.target.value })} />
                  <input type="date" className="border rounded px-2 py-1.5 text-sm" value={evalForm.evaluated_on} onChange={e => setEvalForm({ ...evalForm, evaluated_on: e.target.value })} />
                  <input className="border rounded px-2 py-1.5 text-sm" placeholder="Justificativa (10–1000)" value={evalForm.justification} onChange={e => setEvalForm({ ...evalForm, justification: e.target.value })} />
                </div>
                <button
                  disabled={busy}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
                  onClick={() => mutate(`/api/ext/third-party/parties/${selectedId}/evaluations`, "POST", {
                    score: evalForm.score === "" ? undefined : Number(evalForm.score),
                    evaluated_on: evalForm.evaluated_on,
                    justification: evalForm.justification,
                  }, evalKey, () => {
                    setConfirmation("Avaliação registrada com autor derivado da sessão, data e justificativa.");
                    setEvalForm({ score: "", justification: "", evaluated_on: "" });
                    setEvalKey(newIdempotencyKey("ext02-avl"));
                    refreshAfterMutation();
                  })}
                >
                  {busy ? "Enviando…" : "Registrar avaliação"}
                </button>
              </div>

              <div className="border rounded p-3 space-y-2">
                <h3 className="font-semibold text-sm">Conferir autorização por escopo (ponto de imposição)</h3>
                <div className="grid grid-cols-3 gap-2">
                  <select className="border rounded px-2 py-1.5 text-sm" value={checkForm.scope_kind} onChange={e => setCheckForm({ ...checkForm, scope_kind: e.target.value })}>
                    <option value="contrato">contrato</option>
                    <option value="ordem_servico">ordem de serviço</option>
                  </select>
                  <input className="border rounded px-2 py-1.5 text-sm col-span-2" placeholder="UUID do contrato ou da OS" value={checkForm.scope_id} onChange={e => setCheckForm({ ...checkForm, scope_id: e.target.value })} />
                </div>
                <button onClick={checkAuthorization} className="px-3 py-1.5 text-sm border rounded">Consultar decisão</button>
                {decisionError && <p className="text-sm text-red-700">Erro: {decisionError}</p>}
                {decision && (
                  <div className={`p-2 rounded border text-sm ${decision.authorized ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-900"}`}>
                    <p className="font-semibold">{decision.authorized ? "AUTORIZADO" : "NEGADO"} — {decision.reason}</p>
                    <p className="text-xs mt-1">{decision.derivation}</p>
                    <p className="text-xs">Fonte: {decision.source.join(" + ")} · data-base {decision.base_date}</p>
                  </div>
                )}
              </div>

              <div className="border rounded p-3">
                <h3 className="font-semibold text-sm">Histórico imutável de eventos</h3>
                {dossier.events.length === 0 ? (
                  <p className="text-sm text-gray-600">Nenhum evento canônico registrado.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-gray-700">
                    {dossier.events.map(event => (
                      <li key={event.id}>[{new Date(event.created_at).toLocaleString("pt-BR")}] <strong>{event.event_type}</strong> — {event.summary}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500 mt-2">Fonte: {dossier.source.events}</p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
