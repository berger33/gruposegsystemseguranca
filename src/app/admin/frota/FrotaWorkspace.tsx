"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import UiBadge from "../../../components/ui/UiBadge";
import UiState from "../../../components/ui/UiState";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  fleetRequest,
  type FleetRequestError,
} from "../../../lib/fleet-request";
import {
  alertKindLabel,
  alertStatusLabel,
  describeFleetError,
  documentTypeLabel,
  eventTypeLabel,
  fleetErrorFootnote,
  fleetErrorVariant,
  fuelTypeLabel,
  honestDate,
  honestDateTime,
  honestMoney,
  honestText,
  maintenanceTypeLabel,
  originLabel,
  vehicleStatusLabel,
} from "../../../lib/fleet-vocabulary.mjs";

type Vehicle = {
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
};
type Listing = {
  vehicles: Vehicle[];
  fleet_registered: boolean;
  source: string;
  base_date: string;
  note: string;
};
type FuelLog = {
  id: string;
  fuel_date: string;
  liters: string | number;
  cost_cents: string | number;
  mileage?: number | null;
  station?: string | null;
};
type MaintenanceLog = {
  id: string;
  maintenance_type: string;
  description: string;
  cost_cents: string | number;
  mileage?: number | null;
  performed_at: string;
  next_due_date?: string | null;
};
type Document = {
  id: string;
  document_type: string;
  document_number?: string | null;
  expiry_date?: string | null;
  file_name?: string | null;
  is_active: boolean;
  deactivate_reason?: string | null;
};
type Rule = {
  id: string;
  interval_days?: number | null;
  interval_km?: number | null;
  alert_before_days: number;
  alert_before_km: number;
  justification: string;
};
type Dossier = {
  vehicle: Vehicle;
  fuel_logs: FuelLog[];
  maintenance_logs: MaintenanceLog[];
  documents: Document[];
  responsible_history: Array<{
    id: string;
    previous_responsible_name?: string | null;
    responsible_name: string;
    reason: string;
    assigned_at: string;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    summary: string;
    created_at: string;
  }>;
  maintenance_rule: Rule | null;
  maintenance_alert: {
    status: string;
    message?: string;
    components?: Array<{
      kind: string;
      status: string;
      detail?: string;
      base_performed_at?: string;
      due_date?: string;
      alert_from?: string;
      base_mileage?: number;
      due_mileage?: number;
      remaining_km?: number;
    }>;
    source: string;
    base_date: string;
  };
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
  source: Record<string, string>;
  base_date: string;
};
type ReadState<T> = {
  phase: "loading" | "ready" | "error";
  data: T | null;
  error: FleetRequestError | null;
};
const loading = <T,>(): ReadState<T> => ({
  phase: "loading",
  data: null,
  error: null,
});
const key = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const TABS = [
  { id: "veiculos", label: "Veículos" },
  { id: "cadastro", label: "Cadastrar veículo" },
  { id: "operacoes", label: "Operações do veículo" },
  { id: "historico", label: "Histórico e custos" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
function ErrorState({
  error,
  onRetry,
  title = "Não foi possível concluir a leitura",
}: {
  error: FleetRequestError;
  onRetry?: () => void;
  title?: string;
}) {
  const item = describeFleetError(error.code, error.status);
  const payload =
    error.payload && typeof error.payload === "object"
      ? (error.payload as Record<string, unknown>)
      : null;
  const extra = [payload?.hint, payload?.detail, payload?.use]
    .filter((value) => typeof value === "string")
    .join(" · ");
  return (
    <UiState
      variant={fleetErrorVariant(item)}
      title={item.title || title}
      detail={`${item.detail}${extra ? ` ${extra}` : ""}`}
      onRetry={item.canRetry ? onRetry : undefined}
    >
      <p className={styles.footnote}>{fleetErrorFootnote(item)}</p>
    </UiState>
  );
}
function DetailRead<T>({
  state,
  emptyTitle,
  children,
  retry,
}: {
  state: ReadState<T>;
  emptyTitle: string;
  children: (data: T) => ReactNode;
  retry: () => void;
}) {
  if (state.phase === "loading")
    return (
      <UiState
        variant="loading"
        title="Lendo registros canônicos…"
        detail="Nada é exibido antes de a leitura terminar."
      />
    );
  if (state.phase === "error" && state.error)
    return <ErrorState error={state.error} onRetry={retry} />;
  if (!state.data) return <UiState variant="empty" title={emptyTitle} />;
  return <>{children(state.data)}</>;
}

export default function FrotaWorkspace() {
  const [active, setActive] = useState<TabId>("veiculos");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [list, setList] = useState<ReadState<Listing>>(loading());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<ReadState<Dossier>>({
    phase: "ready",
    data: null,
    error: null,
  });
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<{
    error: FleetRequestError;
    key: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    plate: "",
    model: "",
    manufacturer: "",
    year: "",
    fuel_type: "flex",
    mileage: "0",
    cost_center: "",
    notes: "",
  });
  const [vehicleKey, setVehicleKey] = useState(() => key("ext01-veh"));
  const [responsibleForm, setResponsibleForm] = useState({
    responsible_name: "",
    reason: "",
  });
  const [responsibleKey, setResponsibleKey] = useState(() => key("ext01-resp"));
  const [fuelForm, setFuelForm] = useState({
    fuel_date: "",
    liters: "",
    cost_cents: "",
    mileage: "",
    station: "",
  });
  const [fuelKey, setFuelKey] = useState(() => key("ext01-fuel"));
  const [maintForm, setMaintForm] = useState({
    maintenance_type: "",
    description: "",
    cost_cents: "",
    mileage: "",
    performed_at: "",
    next_due_date: "",
  });
  const [maintKey, setMaintKey] = useState(() => key("ext01-main"));
  const [docForm, setDocForm] = useState({
    document_type: "",
    document_number: "",
    expiry_date: "",
    file_name: "",
  });
  const [docKey, setDocKey] = useState(() => key("ext01-doc"));
  const [ruleForm, setRuleForm] = useState({
    interval_days: "",
    interval_km: "",
    alert_before_days: "15",
    alert_before_km: "500",
    justification: "",
  });
  const [ruleKey, setRuleKey] = useState(() => key("ext01-rule"));
  const [statusForm, setStatusForm] = useState({ status: "", mileage: "" });
  const [statusKey, setStatusKey] = useState(() => key("ext01-stat"));
  const [docReasons, setDocReasons] = useState<Record<string, string>>({});
  const [docKeys, setDocKeys] = useState<Record<string, string>>({});

  const loadVehicles = useCallback(async () => {
    setList(loading());
    const result = await fleetRequest<Listing>("/api/ext/fleet/vehicles");
    setList(
      result.ok
        ? { phase: "ready", data: result.data, error: null }
        : { phase: "error", data: null, error: result.error },
    );
  }, []);
  const loadDossier = useCallback(async (id: string) => {
    setDossier(loading());
    const result = await fleetRequest<Dossier>(`/api/ext/fleet/vehicles/${id}`);
    setDossier(
      result.ok
        ? { phase: "ready", data: result.data, error: null }
        : { phase: "error", data: null, error: result.error },
    );
  }, []);
  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);
  useEffect(() => {
    if (selectedId) void loadDossier(selectedId);
    else setDossier({ phase: "ready", data: null, error: null });
  }, [selectedId, loadDossier]);
  const refresh = useCallback(async () => {
    await loadVehicles();
    if (selectedId) await loadDossier(selectedId);
  }, [loadVehicles, loadDossier, selectedId]);
  async function mutate<T>(
    url: string,
    method: string,
    body: unknown,
    idempotencyKey: string,
    success: (data: T) => void,
  ) {
    setBusy(true);
    setConfirmation(null);
    setMutationError(null);
    const result = await fleetRequest<T>(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    if (result.ok) success(result.data);
    else setMutationError({ error: result.error, key: idempotencyKey });
    setBusy(false);
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current[next]?.focus();
  }
  const mutationDescriptor = mutationError
    ? describeFleetError(mutationError.error.code, mutationError.error.status)
    : null;
  const detailState = <T,>(pick: (value: Dossier) => T): ReadState<T> =>
    dossier.phase === "ready" && dossier.data
      ? { phase: "ready", data: pick(dossier.data), error: null }
      : dossier.phase === "error"
        ? { phase: "error", data: null, error: dossier.error }
        : loading();

  return (
    <main className={styles.workspace}>
      <p className={styles.kicker}>EXT-01 · gestão interna</p>
      <h1>Frota e histórico por veículo</h1>
      <p className={styles.lede}>
        Veículos, responsáveis, abastecimentos, manutenções, documentos, custos
        e alertas vindos somente do backend canônico. Ausência nunca é
        convertida em zero.
      </p>
      {confirmation ? <UiState variant="success" title={confirmation} /> : null}
      {mutationError && mutationDescriptor ? (
        <UiState
          variant={fleetErrorVariant(mutationDescriptor)}
          title={mutationDescriptor.title}
          detail={mutationDescriptor.detail}
        >
          <p className={styles.footnote}>
            {fleetErrorFootnote(mutationDescriptor)}
            <br />
            Chave preservada para repetição segura:{" "}
            <code>{mutationError.key}</code>
          </p>
        </UiState>
      ) : null}
      <div className={styles.tabs} role="tablist" aria-label="Áreas da frota">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`fleet-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`fleet-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            className={active === tab.id ? styles.tabActive : styles.tab}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => tabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        role="tabpanel"
        id="fleet-panel-veiculos"
        aria-labelledby="fleet-tab-veiculos"
        hidden={active !== "veiculos"}
        className={styles.tabPanel}
      >
        {list.phase === "loading" ? (
          <UiState
            variant="loading"
            title="Lendo a frota canônica…"
            detail="A tabela e os indicadores permanecem ausentes até a resposta."
          />
        ) : null}
        {list.phase === "error" && list.error ? (
          <ErrorState error={list.error} onRetry={loadVehicles} />
        ) : null}
        {list.phase === "ready" && list.data && !list.data.fleet_registered ? (
          <UiState
            variant="empty"
            title="Nenhuma frota própria registrada"
            detail={list.data.note}
          >
            <p className={styles.footnote}>
              Fonte: {list.data.source}. Data-base:{" "}
              {honestDateTime(list.data.base_date)}.
            </p>
          </UiState>
        ) : null}
        {list.phase === "ready" && list.data && list.data.fleet_registered ? (
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Veículos registrados</h2>
            <ul className={styles.metrics}>
              <li className={styles.metric}>
                <span className={styles.metricValue}>
                  {list.data.vehicles.length}
                </span>
                <span className={styles.metricLabel}>
                  veículos na resposta do servidor
                </span>
              </li>
            </ul>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption>
                  Fonte: {list.data.source}; data-base{" "}
                  {honestDateTime(list.data.base_date)}
                </caption>
                <thead>
                  <tr>
                    <th>Placa e modelo</th>
                    <th>Situação</th>
                    <th>Combustível</th>
                    <th>Responsável</th>
                    <th>Quilometragem</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.vehicles.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td>
                        <strong>{vehicle.plate}</strong>
                        <br />
                        {vehicle.model}
                      </td>
                      <td>
                        <UiBadge tone="neutral">
                          {vehicleStatusLabel(vehicle.status)}
                        </UiBadge>
                      </td>
                      <td>{fuelTypeLabel(vehicle.fuel_type)}</td>
                      <td>
                        {honestText(
                          vehicle.responsible_name,
                          "Responsável não atribuído",
                        )}
                      </td>
                      <td>{vehicle.mileage.toLocaleString("pt-BR")} km</td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(vehicle.id);
                              setActive("operacoes");
                            }}
                          >
                            Abrir veículo
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.footnote}>{list.data.note}</p>
          </div>
        ) : null}
      </section>

      <section
        role="tabpanel"
        id="fleet-panel-cadastro"
        aria-labelledby="fleet-tab-cadastro"
        hidden={active !== "cadastro"}
        className={styles.tabPanel}
      >
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Cadastrar veículo</h2>
          <p className={styles.requiredNote}>
            Os dados são registrados pela API canônica; campos opcionais
            permanecem ausentes quando vazios.
          </p>
          <div className={styles.fieldRow}>
            <Field id="fleet-plate" label="Placa">
              <input
                id="fleet-plate"
                value={vehicleForm.plate}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, plate: e.target.value })
                }
              />
            </Field>
            <Field id="fleet-model" label="Modelo">
              <input
                id="fleet-model"
                value={vehicleForm.model}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, model: e.target.value })
                }
              />
            </Field>
            <Field id="fleet-maker" label="Fabricante (opcional)">
              <input
                id="fleet-maker"
                value={vehicleForm.manufacturer}
                onChange={(e) =>
                  setVehicleForm({
                    ...vehicleForm,
                    manufacturer: e.target.value,
                  })
                }
              />
            </Field>
            <Field id="fleet-year" label="Ano (opcional)">
              <input
                id="fleet-year"
                type="number"
                value={vehicleForm.year}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, year: e.target.value })
                }
              />
            </Field>
            <Field id="fleet-fuel" label="Combustível">
              <select
                id="fleet-fuel"
                value={vehicleForm.fuel_type}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, fuel_type: e.target.value })
                }
              >
                {[
                  "gasolina",
                  "etanol",
                  "diesel",
                  "flex",
                  "eletrico",
                  "hibrido",
                  "outro",
                ].map((v) => (
                  <option key={v} value={v}>
                    {fuelTypeLabel(v)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="fleet-mileage" label="Quilometragem">
              <input
                id="fleet-mileage"
                type="number"
                min="0"
                value={vehicleForm.mileage}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, mileage: e.target.value })
                }
              />
            </Field>
            <Field id="fleet-cost-center" label="Centro de custo (opcional)">
              <input
                id="fleet-cost-center"
                value={vehicleForm.cost_center}
                onChange={(e) =>
                  setVehicleForm({
                    ...vehicleForm,
                    cost_center: e.target.value,
                  })
                }
              />
            </Field>
            <Field id="fleet-notes" label="Observações (opcional)">
              <textarea
                id="fleet-notes"
                value={vehicleForm.notes}
                onChange={(e) =>
                  setVehicleForm({ ...vehicleForm, notes: e.target.value })
                }
              />
            </Field>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={busy}
              type="button"
              onClick={() =>
                void mutate<{ vehicle: Vehicle }>(
                  "/api/ext/fleet/vehicles",
                  "POST",
                  {
                    plate: vehicleForm.plate,
                    model: vehicleForm.model,
                    manufacturer: vehicleForm.manufacturer || undefined,
                    year:
                      vehicleForm.year === ""
                        ? undefined
                        : Number(vehicleForm.year),
                    fuel_type: vehicleForm.fuel_type,
                    mileage: Number(vehicleForm.mileage),
                    cost_center: vehicleForm.cost_center || undefined,
                    notes: vehicleForm.notes || undefined,
                  },
                  vehicleKey,
                  ({ vehicle }) => {
                    setConfirmation("Veículo registrado pelo servidor.");
                    setVehicleKey(key("ext01-veh"));
                    setVehicleForm({
                      plate: "",
                      model: "",
                      manufacturer: "",
                      year: "",
                      fuel_type: "flex",
                      mileage: "0",
                      cost_center: "",
                      notes: "",
                    });
                    setSelectedId(vehicle.id);
                    void refresh();
                    setActive("operacoes");
                  },
                )
              }
            >
              Cadastrar veículo
            </button>
          </div>
        </div>
      </section>

      <section
        role="tabpanel"
        id="fleet-panel-operacoes"
        aria-labelledby="fleet-tab-operacoes"
        hidden={active !== "operacoes"}
        className={styles.tabPanel}
      >
        {!selectedId ? (
          <UiState
            variant="empty"
            title="Selecione um veículo"
            detail="Abra um veículo na primeira aba para registrar operações."
          />
        ) : (
          <DetailRead
            state={detailState((value) => value.vehicle)}
            emptyTitle="Veículo ausente"
            retry={() => selectedId && loadDossier(selectedId)}
          >
            {(vehicle) => (
              <>
                <div className={styles.panel}>
                  <h2 className={styles.panelTitle}>
                    {vehicle.plate} · {vehicle.model}
                  </h2>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Situação</dt>
                      <dd>{vehicleStatusLabel(vehicle.status)}</dd>
                    </div>
                    <div>
                      <dt>Origem</dt>
                      <dd>{originLabel(vehicle.origin)}</dd>
                    </div>
                    <div>
                      <dt>Responsável</dt>
                      <dd>
                        {honestText(
                          vehicle.responsible_name,
                          "Responsável não atribuído",
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Última manutenção</dt>
                      <dd>
                        {honestDate(
                          vehicle.last_maintenance_date,
                          "Manutenção sem data registrada",
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className={styles.layout}>
                  <fieldset className={styles.fieldset}>
                    <legend>Atualizar situação ou quilometragem</legend>
                    <div className={styles.fieldRow}>
                      <Field id="fleet-status" label="Nova situação (opcional)">
                        <select
                          id="fleet-status"
                          value={statusForm.status}
                          onChange={(e) =>
                            setStatusForm({
                              ...statusForm,
                              status: e.target.value,
                            })
                          }
                        >
                          <option value="">Não alterar</option>
                          {[
                            "disponivel",
                            "em_uso",
                            "em_manutencao",
                            "baixado",
                            "reservado",
                          ].map((v) => (
                            <option key={v} value={v}>
                              {vehicleStatusLabel(v)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        id="fleet-status-mileage"
                        label="Nova quilometragem (opcional)"
                      >
                        <input
                          id="fleet-status-mileage"
                          type="number"
                          min="0"
                          value={statusForm.mileage}
                          onChange={(e) =>
                            setStatusForm({
                              ...statusForm,
                              mileage: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className={styles.actions}>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `/api/ext/fleet/vehicles/${selectedId}`,
                            "PATCH",
                            {
                              status: statusForm.status || undefined,
                              mileage:
                                statusForm.mileage === ""
                                  ? undefined
                                  : Number(statusForm.mileage),
                            },
                            statusKey,
                            () => {
                              setConfirmation(
                                "Veículo atualizado pelo servidor.",
                              );
                              setStatusKey(key("ext01-stat"));
                              setStatusForm({ status: "", mileage: "" });
                              void refresh();
                            },
                          )
                        }
                      >
                        Atualizar veículo
                      </button>
                    </div>
                  </fieldset>
                  <fieldset className={styles.fieldset}>
                    <legend>Atribuir responsável</legend>
                    <div className={styles.fieldRow}>
                      <Field id="fleet-responsible" label="Nome do responsável">
                        <input
                          id="fleet-responsible"
                          value={responsibleForm.responsible_name}
                          onChange={(e) =>
                            setResponsibleForm({
                              ...responsibleForm,
                              responsible_name: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-responsible-reason"
                        label="Motivo da atribuição"
                      >
                        <textarea
                          id="fleet-responsible-reason"
                          value={responsibleForm.reason}
                          onChange={(e) =>
                            setResponsibleForm({
                              ...responsibleForm,
                              reason: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className={styles.actions}>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `/api/ext/fleet/vehicles/${selectedId}/responsible`,
                            "POST",
                            responsibleForm,
                            responsibleKey,
                            () => {
                              setConfirmation(
                                "Responsável atribuído pelo servidor.",
                              );
                              setResponsibleKey(key("ext01-resp"));
                              setResponsibleForm({
                                responsible_name: "",
                                reason: "",
                              });
                              void refresh();
                            },
                          )
                        }
                      >
                        Atribuir responsável
                      </button>
                    </div>
                  </fieldset>
                  <fieldset className={styles.fieldset}>
                    <legend>Registrar abastecimento</legend>
                    <div className={styles.fieldRow}>
                      <Field id="fleet-fuel-date" label="Data do abastecimento">
                        <input
                          id="fleet-fuel-date"
                          type="date"
                          value={fuelForm.fuel_date}
                          onChange={(e) =>
                            setFuelForm({
                              ...fuelForm,
                              fuel_date: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field id="fleet-liters" label="Litros">
                        <input
                          id="fleet-liters"
                          type="number"
                          step="0.001"
                          value={fuelForm.liters}
                          onChange={(e) =>
                            setFuelForm({ ...fuelForm, liters: e.target.value })
                          }
                        />
                      </Field>
                      <Field id="fleet-fuel-cost" label="Custo em centavos">
                        <input
                          id="fleet-fuel-cost"
                          type="number"
                          min="0"
                          value={fuelForm.cost_cents}
                          onChange={(e) =>
                            setFuelForm({
                              ...fuelForm,
                              cost_cents: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-fuel-mileage"
                        label="Quilometragem (opcional)"
                      >
                        <input
                          id="fleet-fuel-mileage"
                          type="number"
                          min="0"
                          value={fuelForm.mileage}
                          onChange={(e) =>
                            setFuelForm({
                              ...fuelForm,
                              mileage: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field id="fleet-station" label="Posto (opcional)">
                        <input
                          id="fleet-station"
                          value={fuelForm.station}
                          onChange={(e) =>
                            setFuelForm({
                              ...fuelForm,
                              station: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className={styles.actions}>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `/api/ext/fleet/vehicles/${selectedId}/fuel-logs`,
                            "POST",
                            {
                              ...fuelForm,
                              cost_cents: Number(fuelForm.cost_cents),
                              liters: Number(fuelForm.liters),
                              mileage:
                                fuelForm.mileage === ""
                                  ? undefined
                                  : Number(fuelForm.mileage),
                              station: fuelForm.station || undefined,
                            },
                            fuelKey,
                            () => {
                              setConfirmation(
                                "Abastecimento registrado pelo servidor.",
                              );
                              setFuelKey(key("ext01-fuel"));
                              setFuelForm({
                                fuel_date: "",
                                liters: "",
                                cost_cents: "",
                                mileage: "",
                                station: "",
                              });
                              void refresh();
                            },
                          )
                        }
                      >
                        Registrar abastecimento
                      </button>
                    </div>
                  </fieldset>
                  <fieldset className={styles.fieldset}>
                    <legend>Registrar manutenção</legend>
                    <div className={styles.fieldRow}>
                      <Field id="fleet-maint-type" label="Tipo de manutenção">
                        <input
                          id="fleet-maint-type"
                          value={maintForm.maintenance_type}
                          onChange={(e) =>
                            setMaintForm({
                              ...maintForm,
                              maintenance_type: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field id="fleet-maint-description" label="Descrição">
                        <textarea
                          id="fleet-maint-description"
                          value={maintForm.description}
                          onChange={(e) =>
                            setMaintForm({
                              ...maintForm,
                              description: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field id="fleet-maint-cost" label="Custo em centavos">
                        <input
                          id="fleet-maint-cost"
                          type="number"
                          min="0"
                          value={maintForm.cost_cents}
                          onChange={(e) =>
                            setMaintForm({
                              ...maintForm,
                              cost_cents: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-maint-mileage"
                        label="Quilometragem (opcional)"
                      >
                        <input
                          id="fleet-maint-mileage"
                          type="number"
                          min="0"
                          value={maintForm.mileage}
                          onChange={(e) =>
                            setMaintForm({
                              ...maintForm,
                              mileage: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field id="fleet-maint-date" label="Data da manutenção">
                        <input
                          id="fleet-maint-date"
                          type="date"
                          value={maintForm.performed_at}
                          onChange={(e) =>
                            setMaintForm({
                              ...maintForm,
                              performed_at: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-next-date"
                        label="Próxima manutenção declarada (opcional)"
                      >
                        <input
                          id="fleet-next-date"
                          type="date"
                          value={maintForm.next_due_date}
                          onChange={(e) =>
                            setMaintForm({
                              ...maintForm,
                              next_due_date: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className={styles.actions}>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `/api/ext/fleet/vehicles/${selectedId}/maintenance-logs`,
                            "POST",
                            {
                              ...maintForm,
                              cost_cents: Number(maintForm.cost_cents),
                              mileage:
                                maintForm.mileage === ""
                                  ? undefined
                                  : Number(maintForm.mileage),
                              next_due_date:
                                maintForm.next_due_date || undefined,
                            },
                            maintKey,
                            () => {
                              setConfirmation(
                                "Manutenção registrada pelo servidor.",
                              );
                              setMaintKey(key("ext01-main"));
                              setMaintForm({
                                maintenance_type: "",
                                description: "",
                                cost_cents: "",
                                mileage: "",
                                performed_at: "",
                                next_due_date: "",
                              });
                              void refresh();
                            },
                          )
                        }
                      >
                        Registrar manutenção
                      </button>
                    </div>
                  </fieldset>
                  <fieldset className={styles.fieldset}>
                    <legend>Registrar documento</legend>
                    <div className={styles.fieldRow}>
                      <Field id="fleet-doc-type" label="Tipo do documento">
                        <input
                          id="fleet-doc-type"
                          value={docForm.document_type}
                          onChange={(e) =>
                            setDocForm({
                              ...docForm,
                              document_type: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field id="fleet-doc-number" label="Número (opcional)">
                        <input
                          id="fleet-doc-number"
                          value={docForm.document_number}
                          onChange={(e) =>
                            setDocForm({
                              ...docForm,
                              document_number: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-doc-expiry"
                        label="Vencimento (opcional)"
                      >
                        <input
                          id="fleet-doc-expiry"
                          type="date"
                          value={docForm.expiry_date}
                          onChange={(e) =>
                            setDocForm({
                              ...docForm,
                              expiry_date: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-doc-file"
                        label="Nome do arquivo (opcional)"
                      >
                        <input
                          id="fleet-doc-file"
                          value={docForm.file_name}
                          onChange={(e) =>
                            setDocForm({
                              ...docForm,
                              file_name: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className={styles.actions}>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `/api/ext/fleet/vehicles/${selectedId}/documents`,
                            "POST",
                            {
                              document_type: docForm.document_type,
                              document_number:
                                docForm.document_number || undefined,
                              expiry_date: docForm.expiry_date || undefined,
                              file_name: docForm.file_name || undefined,
                            },
                            docKey,
                            () => {
                              setConfirmation(
                                "Documento registrado pelo servidor.",
                              );
                              setDocKey(key("ext01-doc"));
                              setDocForm({
                                document_type: "",
                                document_number: "",
                                expiry_date: "",
                                file_name: "",
                              });
                              void refresh();
                            },
                          )
                        }
                      >
                        Registrar documento
                      </button>
                    </div>
                  </fieldset>
                  <fieldset className={styles.fieldset}>
                    <legend>Regra explícita de alerta</legend>
                    <div className={styles.fieldRow}>
                      <Field
                        id="fleet-rule-days"
                        label="Intervalo em dias (opcional)"
                      >
                        <input
                          id="fleet-rule-days"
                          type="number"
                          value={ruleForm.interval_days}
                          onChange={(e) =>
                            setRuleForm({
                              ...ruleForm,
                              interval_days: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-rule-km"
                        label="Intervalo em quilômetros (opcional)"
                      >
                        <input
                          id="fleet-rule-km"
                          type="number"
                          value={ruleForm.interval_km}
                          onChange={(e) =>
                            setRuleForm({
                              ...ruleForm,
                              interval_km: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-rule-before-days"
                        label="Antecedência em dias"
                      >
                        <input
                          id="fleet-rule-before-days"
                          type="number"
                          value={ruleForm.alert_before_days}
                          onChange={(e) =>
                            setRuleForm({
                              ...ruleForm,
                              alert_before_days: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-rule-before-km"
                        label="Antecedência em quilômetros"
                      >
                        <input
                          id="fleet-rule-before-km"
                          type="number"
                          value={ruleForm.alert_before_km}
                          onChange={(e) =>
                            setRuleForm({
                              ...ruleForm,
                              alert_before_km: e.target.value,
                            })
                          }
                        />
                      </Field>
                      <Field
                        id="fleet-rule-reason"
                        label="Justificativa da regra"
                      >
                        <textarea
                          id="fleet-rule-reason"
                          value={ruleForm.justification}
                          onChange={(e) =>
                            setRuleForm({
                              ...ruleForm,
                              justification: e.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className={styles.actions}>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            `/api/ext/fleet/vehicles/${selectedId}/maintenance-rules`,
                            "POST",
                            {
                              interval_days:
                                ruleForm.interval_days === ""
                                  ? undefined
                                  : Number(ruleForm.interval_days),
                              interval_km:
                                ruleForm.interval_km === ""
                                  ? undefined
                                  : Number(ruleForm.interval_km),
                              alert_before_days: Number(
                                ruleForm.alert_before_days,
                              ),
                              alert_before_km: Number(ruleForm.alert_before_km),
                              justification: ruleForm.justification,
                            },
                            ruleKey,
                            () => {
                              setConfirmation(
                                "Regra registrada pelo servidor.",
                              );
                              setRuleKey(key("ext01-rule"));
                              setRuleForm({
                                interval_days: "",
                                interval_km: "",
                                alert_before_days: "15",
                                alert_before_km: "500",
                                justification: "",
                              });
                              void refresh();
                            },
                          )
                        }
                      >
                        Registrar regra
                      </button>
                    </div>
                  </fieldset>
                </div>
              </>
            )}
          </DetailRead>
        )}
      </section>

      <section
        role="tabpanel"
        id="fleet-panel-historico"
        aria-labelledby="fleet-tab-historico"
        hidden={active !== "historico"}
        className={styles.tabPanel}
      >
        {!selectedId ? (
          <UiState
            variant="empty"
            title="Selecione um veículo"
            detail="Abra um veículo para consultar suas leituras independentes."
          />
        ) : (
          <div className={styles.stackWide}>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Custos e dossiê</h2>
              <DetailRead
                state={detailState((value) => ({
                  cost: value.cost,
                  base_date: value.base_date,
                }))}
                emptyTitle="Dossiê ausente"
                retry={() => loadDossier(selectedId)}
              >
                {({ cost, base_date }) => (
                  <>
                    <ul className={styles.metrics}>
                      <li className={styles.metric}>
                        <span className={styles.metricValue}>
                          {honestMoney(cost.fuel_cost_cents)}
                        </span>
                        <span className={styles.metricLabel}>
                          {cost.fuel_entries} abastecimentos reais
                        </span>
                      </li>
                      <li className={styles.metric}>
                        <span className={styles.metricValue}>
                          {honestMoney(cost.maintenance_cost_cents)}
                        </span>
                        <span className={styles.metricLabel}>
                          {cost.maintenance_entries} manutenções reais
                        </span>
                      </li>
                      <li className={styles.metric}>
                        <span className={styles.metricValue}>
                          {honestMoney(cost.total_cents)}
                        </span>
                        <span className={styles.metricLabel}>
                          total canônico
                        </span>
                      </li>
                    </ul>
                    <p className={styles.footnote}>
                      {cost.note} Data-base: {honestDateTime(base_date)}.
                      Fontes: {cost.source.join("; ")}.
                    </p>
                  </>
                )}
              </DetailRead>
            </section>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Abastecimentos</h2>
              <DetailRead
                state={detailState((value) => value.fuel_logs)}
                emptyTitle="Nenhum abastecimento canônico"
                retry={() => loadDossier(selectedId)}
              >
                {(items) =>
                  items.length === 0 ? (
                    <UiState
                      variant="empty"
                      title="Nenhum abastecimento canônico registrado"
                    />
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Litros</th>
                            <th>Custo</th>
                            <th>Quilometragem</th>
                            <th>Posto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id}>
                              <td>{honestDate(item.fuel_date)}</td>
                              <td>
                                {Number(item.liters).toLocaleString("pt-BR")} L
                              </td>
                              <td>{honestMoney(item.cost_cents)}</td>
                              <td>
                                {item.mileage == null
                                  ? "Quilometragem ausente"
                                  : `${Number(item.mileage).toLocaleString("pt-BR")} km`}
                              </td>
                              <td>
                                {honestText(item.station, "Posto ausente")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </DetailRead>
            </section>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Manutenções</h2>
              <DetailRead
                state={detailState((value) => value.maintenance_logs)}
                emptyTitle="Nenhuma manutenção canônica"
                retry={() => loadDossier(selectedId)}
              >
                {(items) =>
                  items.length === 0 ? (
                    <UiState
                      variant="empty"
                      title="Nenhuma manutenção canônica registrada"
                    />
                  ) : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Descrição</th>
                            <th>Custo</th>
                            <th>Próxima data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id}>
                              <td>{honestDate(item.performed_at)}</td>
                              <td>
                                {maintenanceTypeLabel(item.maintenance_type)}
                              </td>
                              <td>{item.description}</td>
                              <td>{honestMoney(item.cost_cents)}</td>
                              <td>
                                {honestDate(
                                  item.next_due_date,
                                  "Próxima data ausente",
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </DetailRead>
            </section>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Documentos</h2>
              <DetailRead
                state={detailState((value) => value.documents)}
                emptyTitle="Nenhum documento"
                retry={() => loadDossier(selectedId)}
              >
                {(items) =>
                  items.length === 0 ? (
                    <UiState
                      variant="empty"
                      title="Nenhum documento registrado"
                    />
                  ) : (
                    <div className={styles.cards}>
                      {items.map((item) => (
                        <article className={styles.card} key={item.id}>
                          <h3 className={styles.cardTitle}>
                            {documentTypeLabel(item.document_type)}
                          </h3>
                          <dl className={styles.facts}>
                            <div>
                              <dt>Número</dt>
                              <dd>
                                {honestText(
                                  item.document_number,
                                  "Número ausente",
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Vencimento</dt>
                              <dd>
                                {honestDate(
                                  item.expiry_date,
                                  "Vencimento ausente",
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Situação</dt>
                              <dd>{item.is_active ? "Ativo" : "Desativado"}</dd>
                            </div>
                          </dl>
                          {item.is_active ? (
                            <>
                              <Field
                                id={`fleet-doc-reason-${item.id}`}
                                label="Motivo da desativação"
                              >
                                <textarea
                                  id={`fleet-doc-reason-${item.id}`}
                                  value={docReasons[item.id] || ""}
                                  onChange={(e) =>
                                    setDocReasons({
                                      ...docReasons,
                                      [item.id]: e.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <div className={styles.actions}>
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    const operationKey =
                                      docKeys[item.id] || key("ext01-docx");
                                    setDocKeys({
                                      ...docKeys,
                                      [item.id]: operationKey,
                                    });
                                    void mutate(
                                      `/api/ext/fleet/documents/${item.id}`,
                                      "PATCH",
                                      { reason: docReasons[item.id] || "" },
                                      operationKey,
                                      () => {
                                        setConfirmation(
                                          "Documento desativado pelo servidor.",
                                        );
                                        setDocReasons({
                                          ...docReasons,
                                          [item.id]: "",
                                        });
                                        setDocKeys({
                                          ...docKeys,
                                          [item.id]: key("ext01-docx"),
                                        });
                                        void refresh();
                                      },
                                    );
                                  }}
                                >
                                  Desativar documento
                                </button>
                              </div>
                            </>
                          ) : (
                            <p className={styles.hint}>
                              Motivo registrado:{" "}
                              {honestText(
                                item.deactivate_reason,
                                "Motivo ausente",
                              )}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )
                }
              </DetailRead>
            </section>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>
                Regra e alerta de manutenção
              </h2>
              <DetailRead
                state={detailState((value) => ({
                  rule: value.maintenance_rule,
                  alert: value.maintenance_alert,
                }))}
                emptyTitle="Regra ausente"
                retry={() => loadDossier(selectedId)}
              >
                {({ rule, alert }) => (
                  <>
                    <UiBadge tone="neutral">
                      {alertStatusLabel(alert.status)}
                    </UiBadge>
                    <p>
                      {honestText(alert.message, "Mensagem derivada ausente")}
                    </p>
                    {rule ? (
                      <dl className={styles.facts}>
                        <div>
                          <dt>Intervalo em dias</dt>
                          <dd>
                            {rule.interval_days == null
                              ? "Não declarado"
                              : rule.interval_days}
                          </dd>
                        </div>
                        <div>
                          <dt>Intervalo em quilômetros</dt>
                          <dd>
                            {rule.interval_km == null
                              ? "Não declarado"
                              : rule.interval_km}
                          </dd>
                        </div>
                        <div>
                          <dt>Justificativa</dt>
                          <dd>{rule.justification}</dd>
                        </div>
                      </dl>
                    ) : (
                      <UiState
                        variant="empty"
                        title="Nenhuma regra registrada"
                        detail="O servidor não infere alerta sem regra explícita."
                      />
                    )}
                    {alert.components?.map((component, index) => (
                      <div
                        className={styles.notice}
                        key={`${component.kind}-${index}`}
                      >
                        <strong>
                          {alertKindLabel(component.kind)} ·{" "}
                          {alertStatusLabel(component.status)}
                        </strong>
                        <p>
                          {honestText(
                            component.detail,
                            "Componente calculado com base canônica",
                          )}
                        </p>
                      </div>
                    ))}
                    <p className={styles.footnote}>
                      Fonte: {alert.source}. Data-base:{" "}
                      {honestDateTime(alert.base_date)}.
                    </p>
                  </>
                )}
              </DetailRead>
            </section>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>
                Responsáveis e trilha imutável
              </h2>
              <DetailRead
                state={detailState((value) => ({
                  responsible: value.responsible_history,
                  events: value.events,
                }))}
                emptyTitle="Trilha ausente"
                retry={() => loadDossier(selectedId)}
              >
                {({ responsible, events }) => (
                  <div className={styles.twoColumns}>
                    <div>
                      <h3>Histórico de responsáveis</h3>
                      {responsible.length === 0 ? (
                        <UiState
                          variant="empty"
                          title="Nenhuma atribuição registrada"
                        />
                      ) : (
                        <ul className={styles.scrollList}>
                          {responsible.map((item) => (
                            <li key={item.id}>
                              <strong>
                                {honestDateTime(item.assigned_at)}
                              </strong>{" "}
                              —{" "}
                              {honestText(
                                item.previous_responsible_name,
                                "Sem responsável anterior",
                              )}{" "}
                              → {item.responsible_name}. Motivo: {item.reason}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h3>Eventos do veículo</h3>
                      {events.length === 0 ? (
                        <UiState
                          variant="empty"
                          title="Nenhum evento registrado"
                        />
                      ) : (
                        <ul className={styles.scrollList}>
                          {events.map((item) => (
                            <li key={item.id}>
                              <strong>{eventTypeLabel(item.event_type)}</strong>{" "}
                              · {honestDateTime(item.created_at)} —{" "}
                              {item.summary}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </DetailRead>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
