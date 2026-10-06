"use client";

// UX-07 / EXT-01 — apresentação da jornada canônica real de FROTA.
//
// Esta reescrita é de APRESENTAÇÃO. Nenhuma URL, método, corpo, cabeçalho,
// chave de idempotência ou regra de servidor foi alterada. As rotas abaixo
// foram conferidas uma a uma contra o dispatch real de server.mjs
// (~linhas 4210–4226) e contra cada `handle*()` de
// `src/server/ext-fleet-api.mjs`:
//
//   GET   /api/ext/fleet/vehicles
//   POST  /api/ext/fleet/vehicles                               (Idempotency-Key)
//   GET   /api/ext/fleet/vehicles/{id}
//   PATCH /api/ext/fleet/vehicles/{id}                          (Idempotency-Key)
//   POST  /api/ext/fleet/vehicles/{id}/responsible              (Idempotency-Key)
//   POST  /api/ext/fleet/vehicles/{id}/fuel-logs                (Idempotency-Key)
//   POST  /api/ext/fleet/vehicles/{id}/maintenance-logs         (Idempotency-Key)
//   POST  /api/ext/fleet/vehicles/{id}/documents                (Idempotency-Key)
//   PATCH /api/ext/fleet/documents/{id}                         (Idempotency-Key)
//   GET   /api/ext/fleet/vehicles/{id}/maintenance-rules
//   POST  /api/ext/fleet/vehicles/{id}/maintenance-rules        (Idempotency-Key)
//
// Nenhum endpoint foi inventado, e nenhuma rota legada é consumida por esta
// tela: os aliases (`/api/admin/hr/ext-fleet-*`, `/api/crm/hr/ext-fleet-*`,
// `/api/hr/ext-fleet-*`, `/api/ext/fleet-*`) continuam religados no servidor,
// respondendo 200 na leitura e 410 `legacy_route_retired` na mutação, sem
// participar daqui.
//
// LACUNA DE CHAMADA CORRIGIDA, COM EVIDÊNCIA NO SERVIDOR: o protótipo só
// usava o POST de `maintenance-rules`. O ramo GET do MESMO handler
// (`handleVehicleMaintenanceRules`, `if (req.method === "GET")`) está
// dispatchado em server.mjs e devolve `{ rules, source, base_date }` com o
// histórico — inclusive as regras que o próprio servidor desativa ao
// registrar uma nova. Sem essa leitura, quem opera registrava uma regra nova
// sem nunca ver qual regra foi desativada no lugar. A leitura foi ligada como
// LEITURA INDEPENDENTE, sem alterar a rota, e é provada no gate.
//
// DEFEITO DE ESTADO CORRIGIDO: o motivo de desativação de documento e a sua
// chave de idempotência eram UM estado único compartilhado por todos os
// documentos da lista — digitar o motivo de um documento preenchia o campo de
// todos. Agora cada documento tem campo rotulado e chave próprios.
//
// Quem autoriza continua sendo o servidor: `guard()` exige sessão de equipe
// (401 `unauthorized`), papel aceito (403 `forbidden_role`), origem própria na
// escrita (403 `origin_forbidden`) e identidade em UUID real. O AdminGate da
// página não foi alargado: continua ["marcelo","admin","ti"], a mesma lista
// que o servidor aplica — e o menu não é autorização.
//
// A chave de idempotência de cada operação é criada por operação, PRESERVADA
// após falha (e mostrada a quem opera, para repetição segura) e descartada
// apenas no sucesso — contrato herdado do protótipo, com os MESMOS prefixos
// (`ext01-veh`, `ext01-stat`, `ext01-resp`, `ext01-fuel`, `ext01-main`,
// `ext01-doc`, `ext01-docx`, `ext01-rule`).

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  fleetErrorFootnote,
  fleetErrorVariant,
  vehicleStatusLabel,
  vehicleStatusTone,
  fuelTypeLabel,
  fuelTypeTone,
  vehicleOriginLabel,
  vehicleOriginTone,
  alertStatusLabel,
  alertStatusTone,
  alertComponentSummary,
  fleetEventLabel,
  fleetEventTone,
  documentStateLabel,
  documentStateTone,
  ruleSummary,
  honestDate,
  honestDateTime,
  honestText,
  honestMileage,
  honestMoneyFromCents,
  honestLiters,
  responsibleLabel,
  count,
  ABSENT,
  type FleetErrorDescriptor,
} from "../../../lib/fleet-vocabulary.mjs";
import { fleetRequest } from "../../../lib/fleet-request";

type Vehicle = {
  id: string;
  plate: string;
  model: string;
  manufacturer?: string | null;
  year?: number | null;
  fuel_type: string;
  status: string;
  responsible_name?: string | null;
  mileage?: number | null;
  last_maintenance_date?: string | null;
  next_maintenance_date?: string | null;
  cost_center?: string | null;
  notes?: string | null;
  origin: string;
};

type VehiclesResponse = {
  vehicles?: Vehicle[];
  fleet_registered?: boolean;
  source?: string | null;
  base_date?: string | null;
  note?: string | null;
};

type AlertComponent = {
  kind?: string;
  status?: string;
  detail?: string;
  base_performed_at?: string;
  due_date?: string;
  alert_from?: string;
  base_mileage?: number;
  due_mileage?: number;
  remaining_km?: number;
};

type MaintenanceRule = {
  id: string;
  interval_days?: number | null;
  interval_km?: number | null;
  alert_before_days?: number | null;
  alert_before_km?: number | null;
  justification?: string | null;
  is_active?: boolean;
  created_at?: string | null;
  deactivated_at?: string | null;
};

type MaintenanceAlert = {
  status?: string;
  message?: string | null;
  rule?: MaintenanceRule | null;
  components?: AlertComponent[];
  source?: string | null;
  base_date?: string | null;
};

type FuelLog = { id: string; fuel_date?: string | null; liters?: string | number | null; cost_cents?: string | number | null; mileage?: number | null; station?: string | null; created_at?: string | null };
type MaintenanceLog = { id: string; maintenance_type?: string | null; description?: string | null; cost_cents?: string | number | null; mileage?: number | null; performed_at?: string | null; next_due_date?: string | null };
type FleetDocument = { id: string; document_type?: string | null; document_number?: string | null; expiry_date?: string | null; file_name?: string | null; is_active?: boolean; deactivated_at?: string | null; deactivate_reason?: string | null };
type ResponsibleEntry = { id: string; previous_responsible_name?: string | null; responsible_name?: string | null; reason?: string | null; assigned_at?: string | null };
type FleetEvent = { id: string; event_type?: string | null; summary?: string | null; created_at?: string | null };

type Dossier = {
  vehicle: Vehicle;
  fuel_logs?: FuelLog[];
  maintenance_logs?: MaintenanceLog[];
  documents?: FleetDocument[];
  responsible_history?: ResponsibleEntry[];
  events?: FleetEvent[];
  maintenance_rule?: MaintenanceRule | null;
  maintenance_alert?: MaintenanceAlert | null;
  cost?: {
    fuel_cost_cents?: number | null;
    fuel_entries?: number | null;
    maintenance_cost_cents?: number | null;
    maintenance_entries?: number | null;
    total_cents?: number | null;
    source?: string[] | null;
    base_date?: string | null;
    note?: string | null;
  } | null;
  source?: Record<string, string> | null;
  base_date?: string | null;
};

type RulesResponse = { rules?: MaintenanceRule[]; source?: string | null; base_date?: string | null };

/** Estado honesto de uma leitura independente: nunca confunde os quatro casos. */
type Load<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "failed"; error: FleetErrorDescriptor };

const TABS = [
  { id: "frota", label: "Frota registrada" },
  { id: "cadastro", label: "Registrar veículo" },
  { id: "dossie", label: "Dossiê e alerta" },
  { id: "abastecimentos", label: "Abastecimentos" },
  { id: "manutencoes", label: "Manutenções" },
  { id: "documentos", label: "Documentos" },
  { id: "regras", label: "Regra de manutenção" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Listas do PRÓPRIO servidor: FUEL_TYPES e VEHICLE_STATUSES de
// src/server/ext-fleet-api.mjs. A tela não acrescenta nem remove opção.
const FUEL_TYPES = ["gasolina", "etanol", "diesel", "flex", "eletrico", "hibrido", "outro"] as const;
const VEHICLE_STATUSES = ["disponivel", "em_uso", "em_manutencao", "baixado", "reservado"] as const;

const EMPTY_VEHICLE = { plate: "", model: "", manufacturer: "", year: "", fuel_type: "flex", mileage: "0", cost_center: "", notes: "" };
const EMPTY_STATUS = { status: "", mileage: "" };
const EMPTY_RESPONSIBLE = { responsible_name: "", reason: "" };
const EMPTY_FUEL = { fuel_date: "", liters: "", cost_cents: "", mileage: "", station: "" };
const EMPTY_MAINTENANCE = { maintenance_type: "", description: "", cost_cents: "", mileage: "", performed_at: "", next_due_date: "" };
const EMPTY_DOCUMENT = { document_type: "", document_number: "", expiry_date: "", file_name: "" };
const EMPTY_RULE = { interval_days: "", interval_km: "", alert_before_days: "15", alert_before_km: "500", justification: "" };

export default function FrotaWorkspace() {
  const [active, setActive] = useState<TabId>("frota");

  // Três LEITURAS INDEPENDENTES. Cada uma tem o seu próprio estado: a falha de
  // uma nunca apaga nem zera a outra, e nenhuma falha vira lista vazia.
  const [list, setList] = useState<Load<VehiclesResponse>>({ phase: "loading" });
  const [dossier, setDossier] = useState<Load<Dossier> | null>(null);
  const [rules, setRules] = useState<Load<RulesResponse> | null>(null);

  const [selectedId, setSelectedId] = useState("");
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE);
  const [statusForm, setStatusForm] = useState(EMPTY_STATUS);
  const [responsibleForm, setResponsibleForm] = useState(EMPTY_RESPONSIBLE);
  const [fuelForm, setFuelForm] = useState(EMPTY_FUEL);
  const [maintenanceForm, setMaintenanceForm] = useState(EMPTY_MAINTENANCE);
  const [documentForm, setDocumentForm] = useState(EMPTY_DOCUMENT);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE);
  // Motivo de desativação POR DOCUMENTO: um campo rotulado para cada um.
  const [deactivateReason, setDeactivateReason] = useState<Record<string, string>>({});

  const [actionError, setActionError] = useState<FleetErrorDescriptor | null>(null);
  const [preservedKey, setPreservedKey] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Contrato herdado: a chave de idempotência de cada operação é preservada
  // após falha, para a repetição ser segura, e só é descartada após sucesso.
  const keys = useRef<Record<string, string>>({});

  const loadList = useCallback(async () => {
    setList({ phase: "loading" });
    const result = await fleetRequest<VehiclesResponse>("/api/ext/fleet/vehicles");
    if (!result.ok) {
      // Falha de leitura é estado próprio. A lista anterior NÃO é mantida nem
      // substituída por uma lista vazia, e nenhum indicador é renderizado.
      setList({ phase: "failed", error: result.error });
      return;
    }
    setList({ phase: "ready", data: result.data || {} });
  }, []);

  const loadDossier = useCallback(async (id: string) => {
    setDossier({ phase: "loading" });
    const result = await fleetRequest<Dossier>(`/api/ext/fleet/vehicles/${id}`);
    if (!result.ok) {
      setDossier({ phase: "failed", error: result.error });
      return;
    }
    setDossier({ phase: "ready", data: result.data });
  }, []);

  const loadRules = useCallback(async (id: string) => {
    setRules({ phase: "loading" });
    const result = await fleetRequest<RulesResponse>(`/api/ext/fleet/vehicles/${id}/maintenance-rules`);
    if (!result.ok) {
      setRules({ phase: "failed", error: result.error });
      return;
    }
    setRules({ phase: "ready", data: result.data || {} });
  }, []);

  const inspect = useCallback(async (id: string) => {
    setSelectedId(id);
    // As duas leituras do veículo são disparadas juntas, mas continuam
    // independentes: uma falhar não apaga a outra.
    await Promise.all([loadDossier(id), loadRules(id)]);
  }, [loadDossier, loadRules]);

  useEffect(() => { void loadList(); }, [loadList]);

  /**
   * Toda escrita passa aqui. A URL, o método, o corpo e o cabeçalho
   * `Idempotency-Key` são exatamente os do servidor; em falha a chave é
   * PRESERVADA (`keys.current[op]` permanece) e mostrada a quem opera, e a
   * repetição reaproveita a mesma chave — o servidor devolve replay em vez de
   * duplicar efeito.
   */
  const mutate = async <T,>(op: string, prefix: string, url: string, method: string, payload: unknown): Promise<T | null> => {
    const key = keys.current[op] || `${prefix}-${crypto.randomUUID()}`;
    keys.current[op] = key;
    setBusy(true);
    setActionError(null);
    setPreservedKey("");
    setNotice("");
    const result = await fleetRequest<T>(url, {
      method,
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!result.ok) {
      // O servidor acrescenta informação estruturada junto do código em alguns
      // casos (`use` em `legacy_route_retired`). O código canônico NÃO é
      // alterado: o complemento só se soma ao detalhe.
      const extra =
        result.payload && typeof result.payload === "object"
          ? (result.payload as { use?: unknown; hint?: unknown; detail?: unknown })
          : {};
      const complement = [extra.hint, extra.detail, extra.use]
        .filter(value => typeof value === "string")
        .join(" ");
      setActionError(complement ? { ...result.error, detail: `${result.error.detail} ${complement}` } : result.error);
      setPreservedKey(key);
      return null;
    }
    delete keys.current[op];
    return result.data;
  };

  const refreshSelected = useCallback(async () => {
    await loadList();
    if (selectedId) await Promise.all([loadDossier(selectedId), loadRules(selectedId)]);
  }, [loadList, loadDossier, loadRules, selectedId]);

  const createVehicle = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate<{ vehicle?: Vehicle; replayed?: boolean }>("vehicle", "ext01-veh", "/api/ext/fleet/vehicles", "POST", {
      plate: vehicleForm.plate,
      model: vehicleForm.model,
      manufacturer: vehicleForm.manufacturer || undefined,
      year: vehicleForm.year || undefined,
      fuel_type: vehicleForm.fuel_type,
      mileage: vehicleForm.mileage === "" ? undefined : Number(vehicleForm.mileage),
      cost_center: vehicleForm.cost_center || undefined,
      notes: vehicleForm.notes || undefined,
    });
    if (!data?.vehicle) return;
    setVehicleForm(EMPTY_VEHICLE);
    setNotice(`Veículo ${honestText(data.vehicle.plate)} confirmado pelo servidor${data.replayed ? " (replay idempotente, sem duplicar)" : ""}. Nada aparece aqui antes da confirmação canônica.`);
    await loadList();
    await inspect(data.vehicle.id);
    setActive("dossie");
  };

  const updateStatus = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate("status", "ext01-stat", `/api/ext/fleet/vehicles/${selectedId}`, "PATCH", {
      ...(statusForm.status ? { status: statusForm.status } : {}),
      ...(statusForm.mileage !== "" ? { mileage: Number(statusForm.mileage) } : {}),
    });
    if (!data) return;
    setStatusForm(EMPTY_STATUS);
    setNotice("Situação e quilometragem alteradas somente após confirmação do servidor.");
    await refreshSelected();
  };

  const assignResponsible = async (event: FormEvent) => {
    event.preventDefault();
    // O motivo vem do campo rotulado preenchido por quem opera. A tela não
    // escreve motivo no lugar de ninguém: sem texto, o servidor recusa com
    // `invalid_reason`, e a recusa é mostrada como veio.
    const data = await mutate("responsible", "ext01-resp", `/api/ext/fleet/vehicles/${selectedId}/responsible`, "POST", {
      responsible_name: responsibleForm.responsible_name,
      reason: responsibleForm.reason,
    });
    if (!data) return;
    setResponsibleForm(EMPTY_RESPONSIBLE);
    setNotice("Responsável atribuído pelo servidor, com histórico imutável e autor derivado da sessão.");
    await refreshSelected();
  };

  const createFuelLog = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate("fuel", "ext01-fuel", `/api/ext/fleet/vehicles/${selectedId}/fuel-logs`, "POST", {
      fuel_date: fuelForm.fuel_date,
      liters: fuelForm.liters === "" ? undefined : Number(fuelForm.liters),
      cost_cents: fuelForm.cost_cents === "" ? undefined : Number(fuelForm.cost_cents),
      mileage: fuelForm.mileage === "" ? undefined : Number(fuelForm.mileage),
      station: fuelForm.station || undefined,
    });
    if (!data) return;
    setFuelForm(EMPTY_FUEL);
    setNotice("Abastecimento canônico registrado; o custo por veículo soma apenas registros assim.");
    await refreshSelected();
  };

  const createMaintenanceLog = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate("maintenance", "ext01-main", `/api/ext/fleet/vehicles/${selectedId}/maintenance-logs`, "POST", {
      maintenance_type: maintenanceForm.maintenance_type,
      description: maintenanceForm.description,
      cost_cents: maintenanceForm.cost_cents === "" ? undefined : Number(maintenanceForm.cost_cents),
      mileage: maintenanceForm.mileage === "" ? undefined : Number(maintenanceForm.mileage),
      performed_at: maintenanceForm.performed_at,
      next_due_date: maintenanceForm.next_due_date || undefined,
    });
    if (!data) return;
    setMaintenanceForm(EMPTY_MAINTENANCE);
    setNotice("Manutenção canônica registrada; o veículo foi atualizado na mesma transação do servidor.");
    await refreshSelected();
  };

  const createDocument = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate("document", "ext01-doc", `/api/ext/fleet/vehicles/${selectedId}/documents`, "POST", {
      document_type: documentForm.document_type,
      document_number: documentForm.document_number || undefined,
      expiry_date: documentForm.expiry_date || undefined,
      file_name: documentForm.file_name || undefined,
    });
    if (!data) return;
    setDocumentForm(EMPTY_DOCUMENT);
    setNotice("Metadados do documento registrados pelo servidor. Nenhum arquivo real é armazenado nesta fatia.");
    await refreshSelected();
  };

  const deactivateDocument = async (documentId: string) => {
    // Motivo escrito por quem opera, em campo rotulado próprio deste
    // documento. A tela não inventa motivo de desativação.
    const typed = deactivateReason[documentId] || "";
    const data = await mutate(`doc-${documentId}`, "ext01-docx", `/api/ext/fleet/documents/${documentId}`, "PATCH", { reason: typed });
    if (!data) return;
    setDeactivateReason(current => ({ ...current, [documentId]: "" }));
    setNotice("Documento desativado pelo servidor, com autor e motivo registrados. O registro permanece para histórico.");
    await refreshSelected();
  };

  const createRule = async (event: FormEvent) => {
    event.preventDefault();
    // A justificativa vem do campo rotulado preenchido por quem opera; sem
    // ela o servidor recusa com `invalid_justification`.
    const data = await mutate("rule", "ext01-rule", `/api/ext/fleet/vehicles/${selectedId}/maintenance-rules`, "POST", {
      interval_days: ruleForm.interval_days === "" ? undefined : Number(ruleForm.interval_days),
      interval_km: ruleForm.interval_km === "" ? undefined : Number(ruleForm.interval_km),
      alert_before_days: ruleForm.alert_before_days === "" ? undefined : Number(ruleForm.alert_before_days),
      alert_before_km: ruleForm.alert_before_km === "" ? undefined : Number(ruleForm.alert_before_km),
      justification: ruleForm.justification,
    });
    if (!data) return;
    setRuleForm(EMPTY_RULE);
    setNotice("Regra explícita registrada pelo servidor; a regra anterior foi desativada na mesma transação.");
    await refreshSelected();
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + last) % TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const renderReadFailure = (
    error: FleetErrorDescriptor,
    retry: () => void,
    testId: string,
    negacao: string,
  ) => (
    <div data-testid={testId}>
      <UiState
        variant={fleetErrorVariant(error)}
        title={error.title}
        detail={`${error.detail} ${negacao} Menu não é autorização: abrir esta tela não substitui a decisão do servidor. ${fleetErrorFootnote(error)}`}
        onRetry={error.canRetry ? retry : undefined}
        retryLabel="Tentar a leitura de novo"
      />
    </div>
  );

  const semVeiculo = (
    <UiState
      variant="empty"
      title="Nenhum veículo selecionado."
      detail="Escolha um veículo na aba Frota registrada para o servidor devolver o dossiê canônico. Esta tela não escolhe veículo por conta própria."
    />
  );

  const vehicles = list.phase === "ready" && Array.isArray(list.data.vehicles) ? list.data.vehicles : [];
  const fleetRegistered = list.phase === "ready" ? list.data.fleet_registered === true : false;
  const dossierData = dossier?.phase === "ready" ? dossier.data : null;
  const alerta = dossierData?.maintenance_alert || null;
  const custo = dossierData?.cost || null;

  const renderDossierState = (testId: string) => {
    if (!selectedId) return semVeiculo;
    if (!dossier || dossier.phase === "loading") {
      return <UiState variant="loading" title="Lendo o dossiê canônico do veículo…" detail="Nada é exibido antes de a leitura terminar." />;
    }
    if (dossier.phase === "failed") {
      return renderReadFailure(
        dossier.error,
        () => void loadDossier(selectedId),
        testId,
        "Isto não significa que o veículo não tenha histórico, custo ou documento registrado.",
      );
    }
    return null;
  };

  return (
    <main className={styles.workspace} data-testid="frota-workspace">
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Frota</span>
      </nav>
      <p className={styles.kicker}>EXT-01</p>
      <h1>Frota própria, custo por veículo e alerta de manutenção</h1>
      <p className={styles.lede} data-testid="frota-honesty">
        Jornada interna de equipe regida pelo critério do servidor:{" "}
        <strong>se frota própria existir</strong>. Sem registro canônico, a tela declara a
        ausência — não mostra frota vazia como se fosse frota zerada. Histórico e custo por
        veículo vêm exclusivamente de registros canônicos, e o alerta de manutenção deriva
        apenas de regra explícita registrada: sem regra, a tela diz que não há regra, nunca
        que está tudo em dia.
      </p>
      <p className={styles.hint}>
        Quem pode ler e escrever é decidido pelo servidor: sessão de equipe válida, papel
        autorizado e origem própria, conferidos em <code>src/server/ext-fleet-api.mjs</code>{" "}
        antes de qualquer resposta. Abrir esta tela pelo menu não concede acesso nenhum. Cada
        escrita leva uma chave de idempotência própria: repetir a operação depois de uma falha
        reaproveita a mesma chave e não duplica efeito.
      </p>

      {notice ? <UiState variant="success" title={notice} /> : null}
      {actionError ? (
        <div data-testid="frota-action-error">
          <UiState
            variant={fleetErrorVariant(actionError)}
            title={actionError.title}
            detail={`${actionError.detail} ${fleetErrorFootnote(actionError)}`}
          >
            {preservedKey ? (
              <p className={styles.footnote}>
                Chave preservada para repetição segura: <code>{preservedKey}</code>. Repetir a
                mesma operação reaproveita a chave e não duplica efeito.
              </p>
            ) : null}
          </UiState>
        </div>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Jornada canônica de frota">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`frota-tab-${tab.id}`}
            ref={node => { tabRefs.current[index] = node; }}
            type="button"
            role="tab"
            className={active === tab.id ? styles.tabActive : styles.tab}
            aria-selected={active === tab.id}
            aria-controls={`frota-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={event => onTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {active === "frota" ? (
          <section
            id="frota-panel-frota"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="frota-tab-frota"
            className={styles.panel}
            data-testid="frota-lista"
          >
            <h2 className={styles.panelTitle}>Veículos registrados no backend canônico</h2>
            {list.phase === "loading" ? (
              <UiState variant="loading" title="Lendo a frota canônica…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {list.phase === "failed"
              ? renderReadFailure(
                  list.error,
                  () => void loadList(),
                  "frota-lista-erro",
                  "Isto não significa que não existam veículos registrados.",
                )
              : null}
            {list.phase === "ready" && !fleetRegistered ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhum veículo canônico está registrado."
                detail={honestText(list.data.note)}
              />
            ) : null}
            {list.phase === "ready" && fleetRegistered ? (
              <>
                {/* Indicadores só existem depois da leitura concluída: nunca
                    aparecem como zero durante carregamento ou falha. */}
                <ul className={styles.metrics} data-testid="frota-metricas">
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(vehicles.length)}</span>
                    <span className={styles.metricLabel}>Veículos lidos nesta consulta</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(vehicles.filter(item => item.status === "em_manutencao").length)}</span>
                    <span className={styles.metricLabel}>Declarados em manutenção pelo servidor</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(vehicles.filter(item => !item.responsible_name).length)}</span>
                    <span className={styles.metricLabel}>Sem responsável canônico registrado</span>
                  </li>
                </ul>
                <div className={styles.tableWrap}>
                  <table className={styles.table} data-testid="frota-tabela">
                    <caption>
                      Veículos da jornada canônica, em ordem de placa. Situação, quilometragem e
                      origem vêm do servidor; nada é calculado nesta tela.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Placa</th>
                        <th scope="col">Modelo</th>
                        <th scope="col">Combustível</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Responsável</th>
                        <th scope="col">Quilometragem</th>
                        <th scope="col">Origem do registro</th>
                        <th scope="col">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map(item => (
                        <tr key={item.id}>
                          <th scope="row">{honestText(item.plate)}</th>
                          <td>{honestText(item.model)}</td>
                          <td>
                            <UiBadge tone={fuelTypeTone(item.fuel_type)} srPrefix="Combustível">
                              {fuelTypeLabel(item.fuel_type)}
                            </UiBadge>
                          </td>
                          <td>
                            <UiBadge tone={vehicleStatusTone(item.status)} srPrefix="Situação do veículo">
                              {vehicleStatusLabel(item.status)}
                            </UiBadge>
                          </td>
                          <td>{responsibleLabel(item.responsible_name)}</td>
                          <td>{honestMileage(item.mileage)}</td>
                          <td>
                            <UiBadge tone={vehicleOriginTone(item.origin)} srPrefix="Origem do registro">
                              {vehicleOriginLabel(item.origin)}
                            </UiBadge>
                          </td>
                          <td>
                            <button type="button" onClick={() => { setActive("dossie"); void inspect(item.id); }}>
                              Ver dossiê canônico
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={styles.footnote} data-testid="frota-fonte">
                  Fonte declarada pelo servidor: {honestText(list.data.source)}. Data-base:{" "}
                  {honestDateTime(list.data.base_date)}. {honestText(list.data.note)}
                </p>
              </>
            ) : null}
            <div className={styles.actions}>
              <button type="button" onClick={() => void loadList()}>Reler a frota canônica</button>
            </div>
          </section>
        ) : null}

        {active === "cadastro" ? (
          <section
            id="frota-panel-cadastro"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="frota-tab-cadastro"
            className={styles.panel}
            data-testid="frota-cadastro"
          >
            <h2 className={styles.panelTitle}>Registrar veículo na jornada canônica</h2>
            <p className={styles.hint}>
              Autoria e origem são derivadas da sessão pelo servidor: identificadores e vínculos
              enviados pelo navegador são ignorados. O veículo só aparece na lista depois da
              confirmação canônica.
            </p>
            <form onSubmit={createVehicle}>
              <fieldset className={styles.fieldset}>
                <legend>Dados do veículo</legend>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label htmlFor="frota-placa">Placa do veículo (3 a 20 caracteres)</label>
                    <input id="frota-placa" name="plate" required value={vehicleForm.plate} onChange={event => setVehicleForm({ ...vehicleForm, plate: event.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="frota-modelo">Modelo (3 a 200 caracteres)</label>
                    <input id="frota-modelo" name="model" required value={vehicleForm.model} onChange={event => setVehicleForm({ ...vehicleForm, model: event.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="frota-fabricante">Fabricante (opcional)</label>
                    <input id="frota-fabricante" name="manufacturer" value={vehicleForm.manufacturer} onChange={event => setVehicleForm({ ...vehicleForm, manufacturer: event.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="frota-ano">Ano de fabricação (opcional)</label>
                    <input id="frota-ano" name="year" inputMode="numeric" value={vehicleForm.year} onChange={event => setVehicleForm({ ...vehicleForm, year: event.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="frota-combustivel">Combustível declarado</label>
                    <select id="frota-combustivel" name="fuel_type" value={vehicleForm.fuel_type} onChange={event => setVehicleForm({ ...vehicleForm, fuel_type: event.target.value })}>
                      {FUEL_TYPES.map(value => <option key={value} value={value}>{fuelTypeLabel(value)}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="frota-km">Quilometragem atual do odômetro</label>
                    <input id="frota-km" name="mileage" inputMode="numeric" value={vehicleForm.mileage} onChange={event => setVehicleForm({ ...vehicleForm, mileage: event.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="frota-centro-custo">Centro de custo (opcional)</label>
                    <input id="frota-centro-custo" name="cost_center" value={vehicleForm.cost_center} onChange={event => setVehicleForm({ ...vehicleForm, cost_center: event.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="frota-observacoes">Observações do veículo (opcional, 10 a 1000 caracteres)</label>
                    <textarea id="frota-observacoes" name="notes" rows={3} value={vehicleForm.notes} onChange={event => setVehicleForm({ ...vehicleForm, notes: event.target.value })} />
                  </div>
                </div>
              </fieldset>
              <div className={styles.actions}>
                <button type="submit" className={styles.primary} disabled={busy}>Registrar veículo</button>
              </div>
            </form>
          </section>
        ) : null}

        {active === "dossie" ? (
          <section
            id="frota-panel-dossie"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="frota-tab-dossie"
            className={styles.panel}
            data-testid="frota-dossie"
          >
            <h2 className={styles.panelTitle}>Dossiê canônico, alerta e custo por veículo</h2>
            {renderDossierState("frota-dossie-erro")}
            {dossierData ? (
              <>
                <div className={styles.cards} data-testid="frota-dossie-fatos">
                  <article className={styles.card}>
                    <h3 className={styles.cardTitle}>
                      {honestText(dossierData.vehicle.plate)} — {honestText(dossierData.vehicle.model)}
                    </h3>
                    <dl className={styles.facts}>
                      <div><dt>Situação</dt><dd><UiBadge tone={vehicleStatusTone(dossierData.vehicle.status)} srPrefix="Situação do veículo">{vehicleStatusLabel(dossierData.vehicle.status)}</UiBadge></dd></div>
                      <div><dt>Combustível</dt><dd>{fuelTypeLabel(dossierData.vehicle.fuel_type)}</dd></div>
                      <div><dt>Quilometragem canônica</dt><dd>{honestMileage(dossierData.vehicle.mileage)}</dd></div>
                      <div><dt>Responsável</dt><dd>{responsibleLabel(dossierData.vehicle.responsible_name)}</dd></div>
                      <div><dt>Fabricante</dt><dd>{honestText(dossierData.vehicle.manufacturer)}</dd></div>
                      <div><dt>Ano</dt><dd>{dossierData.vehicle.year == null ? ABSENT : count(dossierData.vehicle.year)}</dd></div>
                      <div><dt>Centro de custo</dt><dd>{honestText(dossierData.vehicle.cost_center)}</dd></div>
                      <div><dt>Última manutenção registrada</dt><dd>{honestDate(dossierData.vehicle.last_maintenance_date)}</dd></div>
                      <div><dt>Próxima manutenção declarada</dt><dd>{honestDate(dossierData.vehicle.next_maintenance_date)}</dd></div>
                      <div><dt>Origem do registro</dt><dd><UiBadge tone={vehicleOriginTone(dossierData.vehicle.origin)} srPrefix="Origem do registro">{vehicleOriginLabel(dossierData.vehicle.origin)}</UiBadge></dd></div>
                    </dl>
                    <p className={styles.metaBlock}>
                      Observações registradas: {honestText(dossierData.vehicle.notes)}
                    </p>
                  </article>

                  <article className={styles.card} data-testid="frota-alerta" data-alert={alerta?.status === "alerta" || alerta?.status === "vencida" ? "true" : "false"}>
                    <h3 className={styles.cardTitle}>Alerta de manutenção derivado de regra explícita</h3>
                    <p>
                      <UiBadge tone={alertStatusTone(alerta?.status)} srPrefix="Situação do alerta">
                        {alertStatusLabel(alerta?.status)}
                      </UiBadge>
                    </p>
                    {alerta?.message ? <p className={styles.metaBlock}>{honestText(alerta.message)}</p> : null}
                    <p className={styles.metaBlock}>{ruleSummary(alerta?.rule)}</p>
                    {alerta?.rule?.justification ? (
                      <p className={styles.metaBlock}>Justificativa registrada da regra: {honestText(alerta.rule.justification)}</p>
                    ) : null}
                    {Array.isArray(alerta?.components) && alerta.components.length > 0 ? (
                      <ul className={styles.scrollList}>
                        {alerta.components.map((component, index) => (
                          <li key={`${component.kind}-${index}`} className={styles.dividedItem}>
                            {alertComponentSummary(component)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.metaBlock}>
                        Nenhum critério foi calculado pelo servidor; nada é estimado aqui.
                      </p>
                    )}
                    <p className={styles.footnote}>
                      Fonte: {honestText(alerta?.source)}. Data-base: {honestDate(alerta?.base_date)}.
                    </p>
                  </article>
                </div>

                <h3 className={styles.panelTitle}>Custo canônico por veículo</h3>
                <ul className={styles.metrics} data-testid="frota-custo">
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{honestMoneyFromCents(custo?.fuel_cost_cents)}</span>
                    <span className={styles.metricLabel}>Abastecimento somado ({count(custo?.fuel_entries)} registro(s))</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{honestMoneyFromCents(custo?.maintenance_cost_cents)}</span>
                    <span className={styles.metricLabel}>Manutenção somada ({count(custo?.maintenance_entries)} registro(s))</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{honestMoneyFromCents(custo?.total_cents)}</span>
                    <span className={styles.metricLabel}>Total canônico do veículo</span>
                  </li>
                </ul>
                <p className={styles.footnote}>
                  {honestText(custo?.note)} Fonte: {Array.isArray(custo?.source) ? custo.source.join(" + ") : honestText(custo?.source)}.
                  Data-base: {honestDateTime(custo?.base_date)}.
                </p>

                <div className={styles.twoColumns}>
                  <form onSubmit={updateStatus}>
                    <fieldset className={styles.fieldset}>
                      <legend>Atualizar situação e quilometragem</legend>
                      <div className={styles.field}>
                        <label htmlFor="frota-status">Nova situação declarada pelo servidor</label>
                        <select id="frota-status" name="status" value={statusForm.status} onChange={event => setStatusForm({ ...statusForm, status: event.target.value })}>
                          <option value="">Manter a situação atual</option>
                          {VEHICLE_STATUSES.map(value => <option key={value} value={value}>{vehicleStatusLabel(value)}</option>)}
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-status-km">Nova quilometragem (o servidor recusa valor menor que o registrado)</label>
                        <input id="frota-status-km" name="mileage" inputMode="numeric" value={statusForm.mileage} onChange={event => setStatusForm({ ...statusForm, mileage: event.target.value })} />
                      </div>
                      <div className={styles.actions}>
                        <button type="submit" disabled={busy}>Atualizar pelo servidor</button>
                      </div>
                    </fieldset>
                  </form>

                  <form onSubmit={assignResponsible}>
                    <fieldset className={styles.fieldset}>
                      <legend>Atribuir responsável, com histórico imutável</legend>
                      <div className={styles.field}>
                        <label htmlFor="frota-responsavel">Nome do responsável (2 a 200 caracteres)</label>
                        <input id="frota-responsavel" name="responsible_name" value={responsibleForm.responsible_name} onChange={event => setResponsibleForm({ ...responsibleForm, responsible_name: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-responsavel-motivo">Motivo da atribuição, escrito por quem opera (5 a 500 caracteres)</label>
                        <textarea id="frota-responsavel-motivo" name="reason" rows={3} value={responsibleForm.reason} onChange={event => setResponsibleForm({ ...responsibleForm, reason: event.target.value })} />
                      </div>
                      <div className={styles.actions}>
                        <button type="submit" disabled={busy}>Atribuir responsável</button>
                      </div>
                    </fieldset>
                  </form>
                </div>

                <h3 className={styles.panelTitle}>Histórico de responsáveis</h3>
                {Array.isArray(dossierData.responsible_history) && dossierData.responsible_history.length > 0 ? (
                  <ul className={styles.scrollList} data-testid="frota-responsaveis">
                    {dossierData.responsible_history.map(entry => (
                      <li key={entry.id} className={styles.dividedItem}>
                        <span>{honestDateTime(entry.assigned_at)} — {responsibleLabel(entry.previous_responsible_name)} para {responsibleLabel(entry.responsible_name)}</span>
                        <span className={styles.metaLine}>Motivo registrado: {honestText(entry.reason)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div data-testid="frota-responsaveis-vazio">
                    <UiState
                      variant="empty"
                      title="A leitura funcionou e nenhuma atribuição de responsável foi registrada pela jornada canônica."
                      detail="Ausência de histórico não é prova de que o veículo não tenha dono: é ausência de registro canônico."
                    />
                  </div>
                )}

                <h3 className={styles.panelTitle}>Trilha imutável do veículo</h3>
                {Array.isArray(dossierData.events) && dossierData.events.length > 0 ? (
                  <ul className={styles.scrollList} data-testid="frota-eventos">
                    {dossierData.events.map(event => (
                      <li key={event.id} className={styles.dividedItem}>
                        <UiBadge tone={fleetEventTone(event.event_type)} srPrefix="Tipo de evento">
                          {fleetEventLabel(event.event_type)}
                        </UiBadge>
                        <span className={styles.metaLine}>{honestDateTime(event.created_at)} — {honestText(event.summary)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <UiState variant="empty" title="A leitura funcionou e a trilha canônica deste veículo está vazia." detail="Nenhum evento da jornada canônica foi registrado até agora." />
                )}
              </>
            ) : null}
          </section>
        ) : null}

        {active === "abastecimentos" ? (
          <section
            id="frota-panel-abastecimentos"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="frota-tab-abastecimentos"
            className={styles.panel}
            data-testid="frota-abastecimentos"
          >
            <h2 className={styles.panelTitle}>Abastecimentos canônicos</h2>
            {renderDossierState("frota-abastecimentos-erro")}
            {dossierData ? (
              <>
                {Array.isArray(dossierData.fuel_logs) && dossierData.fuel_logs.length > 0 ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.table} data-testid="frota-abastecimentos-tabela">
                      <caption>
                        Abastecimentos registrados para este veículo, do mais recente ao mais
                        antigo. Fonte: {honestText(dossierData.source?.fuel_logs)}.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Data</th>
                          <th scope="col">Litros</th>
                          <th scope="col">Custo</th>
                          <th scope="col">Odômetro</th>
                          <th scope="col">Posto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossierData.fuel_logs.map(item => (
                          <tr key={item.id}>
                            <th scope="row">{honestDate(item.fuel_date)}</th>
                            <td>{honestLiters(item.liters)}</td>
                            <td>{honestMoneyFromCents(item.cost_cents)}</td>
                            <td>{honestMileage(item.mileage)}</td>
                            <td>{honestText(item.station)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div data-testid="frota-abastecimentos-vazio">
                    <UiState
                      variant="empty"
                      title="A leitura funcionou e nenhum abastecimento canônico está registrado para este veículo."
                      detail="Ausência de abastecimento não é custo zero: o custo só soma registros canônicos."
                    />
                  </div>
                )}
                <form onSubmit={createFuelLog}>
                  <fieldset className={styles.fieldset}>
                    <legend>Registrar abastecimento</legend>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="frota-abast-data">Data do abastecimento (não pode ser futura)</label>
                        <input id="frota-abast-data" name="fuel_date" type="date" value={fuelForm.fuel_date} onChange={event => setFuelForm({ ...fuelForm, fuel_date: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-abast-litros">Litros abastecidos</label>
                        <input id="frota-abast-litros" name="liters" inputMode="decimal" value={fuelForm.liters} onChange={event => setFuelForm({ ...fuelForm, liters: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-abast-custo">Custo total em centavos</label>
                        <input id="frota-abast-custo" name="cost_cents" inputMode="numeric" value={fuelForm.cost_cents} onChange={event => setFuelForm({ ...fuelForm, cost_cents: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-abast-km">Odômetro no abastecimento (opcional)</label>
                        <input id="frota-abast-km" name="mileage" inputMode="numeric" value={fuelForm.mileage} onChange={event => setFuelForm({ ...fuelForm, mileage: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-abast-posto">Posto declarado (opcional)</label>
                        <input id="frota-abast-posto" name="station" value={fuelForm.station} onChange={event => setFuelForm({ ...fuelForm, station: event.target.value })} />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Registrar abastecimento</button>
                    </div>
                  </fieldset>
                </form>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "manutencoes" ? (
          <section
            id="frota-panel-manutencoes"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="frota-tab-manutencoes"
            className={styles.panel}
            data-testid="frota-manutencoes"
          >
            <h2 className={styles.panelTitle}>Manutenções canônicas</h2>
            {renderDossierState("frota-manutencoes-erro")}
            {dossierData ? (
              <>
                {Array.isArray(dossierData.maintenance_logs) && dossierData.maintenance_logs.length > 0 ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.table} data-testid="frota-manutencoes-tabela">
                      <caption>
                        Manutenções registradas para este veículo, da mais recente à mais antiga.
                        Fonte: {honestText(dossierData.source?.maintenance_logs)}.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Realizada em</th>
                          <th scope="col">Tipo declarado</th>
                          <th scope="col">Custo</th>
                          <th scope="col">Odômetro</th>
                          <th scope="col">Próxima prevista</th>
                          <th scope="col">Descrição</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossierData.maintenance_logs.map(item => (
                          <tr key={item.id}>
                            <th scope="row">{honestDate(item.performed_at)}</th>
                            <td>{honestText(item.maintenance_type)}</td>
                            <td>{honestMoneyFromCents(item.cost_cents)}</td>
                            <td>{honestMileage(item.mileage)}</td>
                            <td>{honestDate(item.next_due_date)}</td>
                            <td>{honestText(item.description)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div data-testid="frota-manutencoes-vazio">
                    <UiState
                      variant="empty"
                      title="A leitura funcionou e nenhuma manutenção canônica está registrada para este veículo."
                      detail="Ausência de manutenção registrada não é prova de veículo em dia: o alerta depende de regra explícita e de base canônica."
                    />
                  </div>
                )}
                <form onSubmit={createMaintenanceLog}>
                  <fieldset className={styles.fieldset}>
                    <legend>Registrar manutenção</legend>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="frota-manut-tipo">Tipo da manutenção (3 a 100 caracteres)</label>
                        <input id="frota-manut-tipo" name="maintenance_type" value={maintenanceForm.maintenance_type} onChange={event => setMaintenanceForm({ ...maintenanceForm, maintenance_type: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-manut-custo">Custo total em centavos</label>
                        <input id="frota-manut-custo" name="cost_cents" inputMode="numeric" value={maintenanceForm.cost_cents} onChange={event => setMaintenanceForm({ ...maintenanceForm, cost_cents: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-manut-data">Data em que foi realizada (não pode ser futura)</label>
                        <input id="frota-manut-data" name="performed_at" type="date" value={maintenanceForm.performed_at} onChange={event => setMaintenanceForm({ ...maintenanceForm, performed_at: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-manut-proxima">Próxima manutenção prevista (opcional)</label>
                        <input id="frota-manut-proxima" name="next_due_date" type="date" value={maintenanceForm.next_due_date} onChange={event => setMaintenanceForm({ ...maintenanceForm, next_due_date: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-manut-km">Odômetro na manutenção (opcional)</label>
                        <input id="frota-manut-km" name="mileage" inputMode="numeric" value={maintenanceForm.mileage} onChange={event => setMaintenanceForm({ ...maintenanceForm, mileage: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-manut-descricao">Descrição do serviço, escrita por quem opera (10 a 2000 caracteres)</label>
                        <textarea id="frota-manut-descricao" name="description" rows={3} value={maintenanceForm.description} onChange={event => setMaintenanceForm({ ...maintenanceForm, description: event.target.value })} />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Registrar manutenção</button>
                    </div>
                  </fieldset>
                </form>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "documentos" ? (
          <section
            id="frota-panel-documentos"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="frota-tab-documentos"
            className={styles.panel}
            data-testid="frota-documentos"
          >
            <h2 className={styles.panelTitle}>Documentos do veículo</h2>
            <p className={styles.hint}>
              Nesta fatia o servidor guarda apenas metadados: nenhum arquivo real é armazenado, e
              a ausência de bytes é declarada. Documento não é apagado — é desativado com autor e
              motivo, e o registro permanece para histórico.
            </p>
            {renderDossierState("frota-documentos-erro")}
            {dossierData ? (
              <>
                {Array.isArray(dossierData.documents) && dossierData.documents.length > 0 ? (
                  <ul className={styles.cards} data-testid="frota-documentos-lista">
                    {dossierData.documents.map(item => (
                      <li key={item.id} className={styles.card}>
                        <h3 className={styles.cardTitle}>{honestText(item.document_type)}</h3>
                        <dl className={styles.facts}>
                          <div><dt>Situação</dt><dd><UiBadge tone={documentStateTone(item.is_active ? "ativo" : "desativado")} srPrefix="Situação do documento">{documentStateLabel(item.is_active ? "ativo" : "desativado")}</UiBadge></dd></div>
                          <div><dt>Número</dt><dd>{honestText(item.document_number)}</dd></div>
                          <div><dt>Vencimento</dt><dd>{honestDate(item.expiry_date)}</dd></div>
                          <div><dt>Arquivo declarado</dt><dd>{honestText(item.file_name)}</dd></div>
                          {item.is_active ? null : (
                            <>
                              <div><dt>Desativado em</dt><dd>{honestDateTime(item.deactivated_at)}</dd></div>
                              <div><dt>Motivo registrado</dt><dd>{honestText(item.deactivate_reason)}</dd></div>
                            </>
                          )}
                        </dl>
                        {item.is_active ? (
                          <div className={styles.stack}>
                            <div className={styles.field}>
                              <label htmlFor={`frota-doc-motivo-${item.id}`}>
                                Motivo da desativação deste documento, escrito por quem opera (5 a 500 caracteres)
                              </label>
                              <textarea
                                id={`frota-doc-motivo-${item.id}`}
                                name="reason"
                                rows={2}
                                value={deactivateReason[item.id] || ""}
                                onChange={event => setDeactivateReason(current => ({ ...current, [item.id]: event.target.value }))}
                              />
                            </div>
                            <div className={styles.actions}>
                              <button type="button" disabled={busy} onClick={() => void deactivateDocument(item.id)}>
                                Desativar documento com motivo registrado
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div data-testid="frota-documentos-vazio">
                    <UiState
                      variant="empty"
                      title="A leitura funcionou e nenhum documento está registrado para este veículo."
                      detail="Ausência de documento registrado não é prova de documentação em dia."
                    />
                  </div>
                )}
                <form onSubmit={createDocument}>
                  <fieldset className={styles.fieldset}>
                    <legend>Registrar documento (apenas metadados)</legend>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="frota-doc-tipo">Tipo do documento (3 a 100 caracteres)</label>
                        <input id="frota-doc-tipo" name="document_type" value={documentForm.document_type} onChange={event => setDocumentForm({ ...documentForm, document_type: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-doc-numero">Número do documento (opcional)</label>
                        <input id="frota-doc-numero" name="document_number" value={documentForm.document_number} onChange={event => setDocumentForm({ ...documentForm, document_number: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-doc-vencimento">Data de vencimento (opcional)</label>
                        <input id="frota-doc-vencimento" name="expiry_date" type="date" value={documentForm.expiry_date} onChange={event => setDocumentForm({ ...documentForm, expiry_date: event.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="frota-doc-arquivo">Nome do arquivo declarado (opcional)</label>
                        <input id="frota-doc-arquivo" name="file_name" value={documentForm.file_name} onChange={event => setDocumentForm({ ...documentForm, file_name: event.target.value })} />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Registrar documento</button>
                    </div>
                  </fieldset>
                </form>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "regras" ? (
          <section
            id="frota-panel-regras"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="frota-tab-regras"
            className={styles.panel}
            data-testid="frota-regras"
          >
            <h2 className={styles.panelTitle}>Regra explícita que gera o alerta</h2>
            <p className={styles.hint}>
              O alerta deriva somente desta regra registrada e da base canônica. Sem regra, o
              servidor declara a ausência e a tela a repete — nenhum alerta é estimado. Registrar
              uma regra nova desativa a anterior na MESMA transação do servidor.
            </p>
            {/* LEITURA INDEPENDENTE: o histórico de regras vem do GET da rota
                de regras, não do dossiê. Falhar aqui não apaga o dossiê. */}
            {!selectedId ? semVeiculo : null}
            {selectedId && (!rules || rules.phase === "loading") ? (
              <UiState variant="loading" title="Lendo as regras registradas deste veículo…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {selectedId && rules?.phase === "failed"
              ? renderReadFailure(
                  rules.error,
                  () => void loadRules(selectedId),
                  "frota-regras-erro",
                  "Isto não significa que o veículo esteja sem regra de manutenção registrada.",
                )
              : null}
            {selectedId && rules?.phase === "ready" ? (
              Array.isArray(rules.data.rules) && rules.data.rules.length > 0 ? (
                <>
                  <ul className={styles.cards} data-testid="frota-regras-lista">
                    {rules.data.rules.map(rule => (
                      <li key={rule.id} className={styles.card}>
                        <h3 className={styles.cardTitle}>{rule.is_active ? "Regra vigente" : "Regra desativada pelo servidor"}</h3>
                        <p>{ruleSummary(rule)}</p>
                        <dl className={styles.facts}>
                          <div><dt>Justificativa registrada</dt><dd>{honestText(rule.justification)}</dd></div>
                          <div><dt>Registrada em</dt><dd>{honestDateTime(rule.created_at)}</dd></div>
                          <div><dt>Desativada em</dt><dd>{honestDateTime(rule.deactivated_at)}</dd></div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.footnote}>
                    Fonte: {honestText(rules.data.source)}. Data-base: {honestDateTime(rules.data.base_date)}.
                  </p>
                </>
              ) : (
                <div data-testid="frota-regras-vazio">
                  <UiState
                    variant="empty"
                    title="A leitura funcionou e nenhuma regra de manutenção está registrada para este veículo."
                    detail="Sem regra explícita o servidor não infere alerta algum, e esta tela não inventa um."
                  />
                </div>
              )
            ) : null}
            {selectedId ? (
              <form onSubmit={createRule}>
                <fieldset className={styles.fieldset}>
                  <legend>Registrar regra de manutenção</legend>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor="frota-regra-dias">Intervalo em dias (opcional se houver intervalo em km)</label>
                      <input id="frota-regra-dias" name="interval_days" inputMode="numeric" value={ruleForm.interval_days} onChange={event => setRuleForm({ ...ruleForm, interval_days: event.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="frota-regra-km">Intervalo em quilômetros (opcional se houver intervalo em dias)</label>
                      <input id="frota-regra-km" name="interval_km" inputMode="numeric" value={ruleForm.interval_km} onChange={event => setRuleForm({ ...ruleForm, interval_km: event.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="frota-regra-aviso-dias">Antecedência do aviso, em dias</label>
                      <input id="frota-regra-aviso-dias" name="alert_before_days" inputMode="numeric" value={ruleForm.alert_before_days} onChange={event => setRuleForm({ ...ruleForm, alert_before_days: event.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="frota-regra-aviso-km">Antecedência do aviso, em quilômetros</label>
                      <input id="frota-regra-aviso-km" name="alert_before_km" inputMode="numeric" value={ruleForm.alert_before_km} onChange={event => setRuleForm({ ...ruleForm, alert_before_km: event.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="frota-regra-justificativa">Justificativa da regra, escrita por quem opera (5 a 500 caracteres)</label>
                      <textarea id="frota-regra-justificativa" name="justification" rows={3} value={ruleForm.justification} onChange={event => setRuleForm({ ...ruleForm, justification: event.target.value })} />
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <button type="submit" disabled={busy}>Registrar regra de manutenção</button>
                  </div>
                </fieldset>
              </form>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
