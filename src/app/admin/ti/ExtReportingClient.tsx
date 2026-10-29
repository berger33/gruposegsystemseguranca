"use client";
// UX-PRO-03 — promoção "com prova": monitoramento e automação determinística.
//
// A área deixa de ser órfã e passa a ser aba real do TiConsole. O protótipo
// antigo chamava oito coleções; a auditoria antes de codar mostrou que três
// delas (relatórios programados, inteligência comercial e apoio emergencial)
// estão APOSENTADAS no servidor — `ext-reports-api.handleLegacy`,
// `ext-intel-api.handleLegacy` e `ext-emergency-api.handleLegacy` respondem 410
// e apontam para `/api/ext/reports/*`, `/api/ext/intel/*` e
// `/api/ext/emergency/*`, que têm matriz de permissão granular própria
// (`reports.*`, `intel.*`, `emergency.*`). Montar aqueles formulários aqui
// entregaria botão que não grava nada, então esta aba cobre apenas as três
// famílias cujo contrato legado continua vivo e com papel nomeado
// (`admin|ti`) no servidor: central/vídeo, biometria e automações
// determinísticas. Nenhuma rota, permissão, migração ou contrato foi alterada.
//
// O que a tela NÃO faz, dito na própria tela: não coleta biometria, não
// implanta central de vídeo, não executa job de automação, não substitui
// parecer jurídico/LGPD e não prova disponibilidade externa. Produção: NO-GO.
import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./ExtReportingClient.module.css";

type Row = Record<string, unknown>;
type Area = "central" | "biometry" | "automation";
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };
type LogState = { kind: "idle" } | { kind: "loading" } | { kind: "ready" } | { kind: "error"; detail: string };

const ENDPOINTS = {
  central: "/api/ext/central-projects",
  biometry: "/api/ext/biometry-projects",
  automations: "/api/ext/ai-automations",
  logs: "/api/ext/ai-automation-logs",
} as const;

// Enums reais da migração 087. A tela não inventa estado que o banco não
// guarda: `ext_central_projects` nem tem coluna de status (só as aprovações),
// `ext_biometry_status`/`ai_automation_status`/`ai_automation_type` são os
// valores abaixo e `ai_deterministic_automations` não tem agendamento.
const BIOMETRY_TYPES = ["facial", "digital", "iris", "voz", "outro"] as const;
const BIOMETRY_STATUSES = ["rascunho", "em_avaliacao", "aprovado", "rejeitado", "em_implementacao", "ativo", "desativado"] as const;
const AUTOMATION_TYPES = ["vencimento", "distribuicao_tarefa", "cobranca_interna", "escalonamento", "outro"] as const;
const AUTOMATION_STATUSES = ["rascunho", "ativa", "pausada", "desativada", "falha"] as const;

// Motivos devolvidos por `ext-reporting-api.mjs`, traduzidos para o operador.
// O servidor nunca é reescrito: a tela apenas explica o que ele decidiu.
const ERROR_LABELS: Record<string, string> = {
  forbidden: "A requisição precisa partir do próprio site (mesma origem). Recarregue a página e tente novamente.",
  unauthorized: "Esta superfície é restrita a contas individuais de administração ou TI. Nenhum dado foi exposto.",
  invalid_json: "O corpo enviado não é um JSON válido. Revise os campos e tente novamente.",
  invalid_title: "O título precisa ter entre 5 e 200 caracteres.",
  invalid_description: "A descrição precisa ter entre 10 e 2000 caracteres.",
  invalid_scope: "O escopo do projeto precisa ter entre 10 e 2000 caracteres.",
  invalid_target_type: "O tipo de alvo, quando informado, precisa ter entre 3 e 100 caracteres.",
  invalid_target_id: "O identificador do alvo, quando informado, precisa ter entre 3 e 200 caracteres.",
  invalid_provider: "O fornecedor, quando informado, precisa ter entre 3 e 200 caracteres.",
  invalid_privacy_assessment: "A avaliação de privacidade é obrigatória neste recurso e precisa ter entre 20 e 2000 caracteres.",
  invalid_biometry_type: "Selecione um tipo de biometria válido (facial, digital, íris, voz ou outro).",
  invalid_necessity: "A necessidade da biometria precisa ter pelo menos 20 caracteres.",
  invalid_impact_assessment: "O relatório de impacto precisa ter entre 20 e 2000 caracteres.",
  invalid_legal_basis: "A base legal precisa ter entre 10 e 1000 caracteres.",
  invalid_name: "O nome da automação precisa ter entre 3 e 200 caracteres.",
  invalid_automation_type: "Selecione um tipo de automação determinística válido (vencimento, distribuição de tarefa, cobrança interna, escalonamento ou outro).",

  invalid_status: "O status informado não é aceito pelo servidor para este recurso.",
  privacy_approval_required_projeto_separado_privacidade_aprovada:
    "Aprovar o projeto exige aprovação de privacidade registrada. Marque a aprovação de privacidade antes da aprovação geral.",
  collection_requires_approval_nao_coletar_biometria_por_padrao:
    "Biometria não coleta por padrão: ativar a coleta exige aprovação registrada do projeto.",
  approval_required_biometria_projeto_separado_privacidade_aprovada:
    "Projeto de biometria só fica ativo com aprovação registrada.",
  missing_id: "Nenhum registro selecionado. Escolha um item da lista.",
  missing_automation_id: "Selecione a automação antes de registrar a execução.",
  invalid_action: "A ação registrada precisa ter entre 3 e 200 caracteres.",
  invalid_result: "O resultado da execução é obrigatório e precisa ter entre 10 e 1000 caracteres.",
  invalid_duration: "A duração precisa ser um número de milissegundos maior ou igual a zero.",
  not_found: "O registro não foi localizado. Recarregue a leitura.",
  method_not_allowed: "Esta operação não é permitida pelo servidor para este recurso.",
  internal: "O servidor não conseguiu concluir a operação. Confira os dados e tente novamente.",
};

function translate(code: unknown, status?: number) {
  const key = typeof code === "string" ? code : "";
  if (ERROR_LABELS[key]) return ERROR_LABELS[key];
  if (status === 401) return ERROR_LABELS.unauthorized;
  if (status === 403) return ERROR_LABELS.forbidden;
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}

/** Payload só é aceito quando é, de fato, uma lista de objetos. */
function records(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}
const s = (value: unknown) => (typeof value === "string" ? value : "");
const n = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const b = (value: unknown) => value === true;

function dateTime(value: unknown) {
  const raw = s(value);
  if (!raw) return "não informada";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? "data indisponível" : parsed.toLocaleString("pt-BR");
}
function shortId(value: unknown) {
  const raw = s(value);
  return raw ? raw.slice(0, 8) : "—";
}
/** `rules` chega como objeto JSONB; a tela mostra o texto canônico e nunca `[object Object]`. */
function jsonText(value: unknown) {
  if (value === null || value === undefined) return "{}";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O texto de ajuda NÃO mora dentro do <label>: ele entraria no nome acessível
// do controle e o leitor de tela anunciaria a frase inteira como rótulo.
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { id, "aria-describedby": helpId })
    : children;
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {control}
      {help && <small id={helpId}>{help}</small>}
    </div>
  );
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as Row;
  return { response, data };
}

export default function ExtReportingClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [central, setCentral] = useState<Row[]>([]);
  const [biometry, setBiometry] = useState<Row[]>([]);
  const [automations, setAutomations] = useState<Row[]>([]);
  const [selected, setSelected] = useState<{ area: Area; id: string } | null>(null);
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [logs, setLogs] = useState<Row[]>([]);
  const [logState, setLogState] = useState<LogState>({ kind: "idle" });
  const [logTick, setLogTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");

  const [centralForm, setCentralForm] = useState({
    title: "", description: "", scope: "", provider: "", privacy_assessment: "",
  });
  const [biometryForm, setBiometryForm] = useState({
    title: "", description: "", biometry_type: "facial", necessity: "", impact_assessment: "", legal_basis: "",
  });
  const [automationForm, setAutomationForm] = useState({
    name: "", description: "", automation_type: "vencimento", rules: "{}",
  });
  const [centralTransition, setCentralTransition] = useState({ is_privacy_approved: false, is_approved: false });
  const [biometryTransition, setBiometryTransition] = useState({ status: "", is_approved: false, collection_active: false });
  const [automationTransition, setAutomationTransition] = useState({ status: "" });
  const [logForm, setLogForm] = useState({ automation_id: "", action: "", result: "", success: true, target_type: "" });

  const sequence = useRef(0);
  const logSequence = useRef(0);
  const operation = useRef(false);
  const mounted = useRef(false);

  const load = useCallback(async (clearFeedback = true) => {
    const current = ++sequence.current;
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    setReadState({ kind: "loading" });
    try {
      const [centralRead, biometryRead, automationRead] = await Promise.all([
        requestJson(ENDPOINTS.central),
        requestJson(ENDPOINTS.biometry),
        requestJson(ENDPOINTS.automations),
      ]);
      // Resposta fora de ordem: descarta e mantém a leitura mais recente.
      if (current !== sequence.current) return;
      const all = [centralRead, biometryRead, automationRead];
      if (all.some(item => item.response.status === 401 || item.response.status === 403)) {
        setCentral([]); setBiometry([]); setAutomations([]);
        setSelected(null); setSelectedRow(null); setLogs([]); setLogState({ kind: "idle" });
        setReadState({ kind: "denied" });
        return;
      }
      const failed = all.find(item => !item.response.ok);
      if (failed) {
        setCentral([]); setBiometry([]); setAutomations([]);
        setSelected(null); setSelectedRow(null); setLogs([]); setLogState({ kind: "idle" });
        setReadState({ kind: "error", detail: translate(failed.data.error, failed.response.status) });
        return;
      }
      const centralRows = records(centralRead.data.items);
      const biometryRows = records(biometryRead.data.items);
      const automationRows = records(automationRead.data.items);
      setCentral(centralRows);
      setBiometry(biometryRows);
      setAutomations(automationRows);
      // O registro aberto só sai da tela quando deixa a leitura: reler depois
      // de uma transição não pode fechar o item em análise.
      setSelected(previous => {
        if (!previous) return null;
        const pool = previous.area === "central" ? centralRows
          : previous.area === "biometry" ? biometryRows : automationRows;
        return pool.some(row => s(row.id) === previous.id) ? previous : null;
      });
      setReadState({ kind: "ready" });
    } catch {
      if (current !== sequence.current) return;
      setCentral([]); setBiometry([]); setAutomations([]);
      setSelected(null); setSelectedRow(null); setLogs([]); setLogState({ kind: "idle" });
      setReadState({ kind: "error", detail: "Falha de rede ao consultar a área de monitoramento. Verifique a conexão e tente novamente." });
    }
  }, []);

  // A leitura inicial acontece uma única vez: digitar em um formulário não pode
  // disparar consulta por tecla — quem relê é o botão da própria área.
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    void load();
  }, [load]);

  // Histórico de execução da automação selecionada. Fica preso ao id escolhido
  // e descarta resposta fora de ordem, como a leitura principal.
  useEffect(() => {
    if (!selected || selected.area !== "automation") {
      logSequence.current += 1;
      setLogs([]); setLogState({ kind: "idle" });
      return;
    }
    const current = ++logSequence.current;
    setLogState({ kind: "loading" });
    requestJson(`${ENDPOINTS.logs}?automation_id=${encodeURIComponent(selected.id)}`)
      .then(({ response, data }) => {
        if (current !== logSequence.current) return;
        if (!response.ok) {
          setLogs([]);
          setLogState({ kind: "error", detail: translate(data.error, response.status) });
          return;
        }
        setLogs(records(data.items).filter(row => s(row.automation_id) === selected.id));
        setLogState({ kind: "ready" });
      })
      .catch(() => {
        if (current !== logSequence.current) return;
        setLogs([]);
        setLogState({ kind: "error", detail: "Falha de rede ao consultar o histórico de execução desta automação." });
      });
  }, [selected, logTick]);

  const openRecord = useCallback((area: Area, row: Row) => {
    const id = s(row.id);
    if (!UUID_RE.test(id)) return;
    setSelected({ area, id });
    setSelectedRow(row);
    setMessage("");
    setOperationError("");
    if (area === "central") {
      setCentralTransition({
        is_privacy_approved: b(row.is_privacy_approved), is_approved: b(row.is_approved),
      });
    }
    if (area === "biometry") {
      setBiometryTransition({
        status: s(row.status), is_approved: b(row.is_approved), collection_active: b(row.collection_active),
      });
    }
    if (area === "automation") {
      setAutomationTransition({ status: s(row.status) });
      setLogForm(previous => ({ ...previous, automation_id: id }));
    }
  }, []);

  async function mutate(path: string, method: "POST" | "PATCH", body: unknown, success: string, reset?: () => void) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setOperationError(""); setMessage("");
    try {
      const { response, data } = await requestJson(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) { setOperationError(translate(data.error, response.status)); return; }
      setMessage(success);
      reset?.();
      await load(false);
      setLogTick(tick => tick + 1);
    } catch {
      setOperationError("Não foi possível concluir a operação. Confira a conexão e tente novamente.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  /** `rules` é JSON livre no formulário; erro de sintaxe é explicado, não estourado. */
  function parseRules(): { ok: true; value: Record<string, unknown> } | { ok: false } {
    const raw = automationForm.rules.trim();
    if (!raw) return { ok: true, value: {} };
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
      return { ok: true, value: parsed as Record<string, unknown> };
    } catch {
      return { ok: false };
    }
  }

  function createAutomation() {
    const rules = parseRules();
    if (!rules.ok) {
      setOperationError("As regras da automação precisam ser um objeto JSON válido. Exemplo: {\"dias_antes\": 5}.");
      return;
    }
    void mutate(ENDPOINTS.automations, "POST", {
      name: automationForm.name.trim(),
      description: automationForm.description.trim(),
      automation_type: automationForm.automation_type,
      rules: rules.value,
    }, "Automação determinística criada. Ela não é executada por esta tela.", () =>
      setAutomationForm({ name: "", description: "", automation_type: "vencimento", rules: "{}" }));
  }

  const total = central.length + biometry.length + automations.length;
  const pendingPrivacy = central.filter(row => !b(row.is_privacy_approved)).length;
  const collecting = biometry.filter(row => b(row.collection_active)).length;
  const activeAutomations = automations.filter(row => s(row.status) === "ativa").length;
  const selectedArea = selected?.area ?? null;

  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando central, biometria e automações" detail="Consultando projetos de central/vídeo, projetos de biometria e automações determinísticas." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Esta superfície é restrita às contas individuais de administração ou TI. Nenhum projeto ou automação foi exposto." onRetry={() => load()} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={() => load()} retryLabel="Tentar novamente" />
        : total === 0
          ? <UiState variant="empty" title="Nenhum registro nesta área" detail="As três consultas terminaram sem registros. Isso é diferente de falha: nada foi apagado e nenhum estado foi presumido." onRetry={() => load()} retryLabel="Atualizar" />
          : null;

  return (
    <section className={styles.workspace} aria-labelledby="mon-geral-title" aria-busy={readState.kind === "loading" || busy}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Console de TI</p>
          <h2 id="mon-geral-title">Central, biometria e automações</h2>
          <p>Central de monitoramento/vídeo, biometria e automações determinísticas de vencimento, distribuição de tarefa e cobrança interna. Cada área declara o que a tela faz e o que continua fora dela.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => load()} disabled={readState.kind === "loading" || busy}>Carregar monitoramento</button>
        </div>
      </header>

      <p className={styles.source}>
        Fonte: tabelas <code>ext_central_projects</code>, <code>ext_biometry_projects</code>, <code>ext_ai_deterministic_automations</code> e <code>ext_ai_automation_logs</code> (migração 087). Data-base: {dateTime(new Date().toISOString())} (leitura feita neste instante).
      </p>

      <div className={styles.actions} aria-live="polite">
        <span className={styles.count}>{central.length} projeto(s) de central</span>
        <span className={styles.count}>{pendingPrivacy} sem aprovação de privacidade</span>
        <span className={styles.count}>{biometry.length} projeto(s) de biometria</span>
        <span className={styles.count}>{collecting} com coleta ativa</span>
        <span className={styles.count}>{automations.length} automação(ões)</span>
        <span className={styles.count}>{activeAutomations} ativa(s)</span>
      </div>

      {message && <p className={styles.success} role="status">{message}</p>}
      {operationError && <p className={styles.error} role="alert">{operationError}</p>}
      {feedback}

      {readState.kind === "ready" && total > 0 && (
        <div className={styles.split}>
          <section className={styles.panel} aria-labelledby="mon-central-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="mon-central-title">Central de monitoramento e vídeo</h3>
                <p>Projeto separado: só entra em implantação com aprovação de privacidade registrada. A tela não instala câmera, não conecta fornecedor e não grava imagem.</p>
              </div>
              <span className={styles.count}>{central.length}</span>
            </div>
            {central.length === 0
              ? <p className={styles.note}>Nenhum projeto de central registrado nesta leitura.</p>
              : <ul className={styles.recordList}>
                {central.map(row => <li key={s(row.id)} aria-current={selected?.id === s(row.id)}>
                  <strong>{s(row.protocol) || "sem protocolo"} · {s(row.title) || "sem título"}</strong>
                  <span>status {s(row.status) || "não informado"} · privacidade {b(row.is_privacy_approved) ? "aprovada" : "não aprovada"} · aprovação geral {b(row.is_approved) ? "registrada" : "não registrada"} · criado em {dateTime(row.created_at)}</span>
                  <div className={styles.actions}>
                    <button type="button" onClick={() => openRecord("central", row)} aria-label={`Abrir registro ${s(row.protocol) || shortId(row.id)} da central`}>Abrir registro</button>
                  </div>
                </li>)}
              </ul>}
          </section>

          <section className={styles.panel} aria-labelledby="mon-biometria-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="mon-biometria-title">Biometria e reconhecimento</h3>
                <p>Biometria não coleta por padrão: ativar a coleta ou o status ativo exige aprovação registrada no projeto. A tela não captura, não armazena e não compara biometria.</p>
              </div>
              <span className={styles.count}>{biometry.length}</span>
            </div>
            {biometry.length === 0
              ? <p className={styles.note}>Nenhum projeto de biometria registrado nesta leitura.</p>
              : <ul className={styles.recordList}>
                {biometry.map(row => <li key={s(row.id)} aria-current={selected?.id === s(row.id)}>
                  <strong>{s(row.protocol) || "sem protocolo"} · {s(row.title) || "sem título"}</strong>
                  <span>tipo {s(row.biometry_type) || "não informado"} · status {s(row.status) || "não informado"} · aprovado {b(row.is_approved) ? "sim" : "não"} · coleta ativa {b(row.collection_active) ? "sim" : "não"} · criado em {dateTime(row.created_at)}</span>
                  <div className={styles.actions}>
                    <button type="button" onClick={() => openRecord("biometry", row)} aria-label={`Abrir registro ${s(row.protocol) || shortId(row.id)} da biometria`}>Abrir registro</button>
                  </div>
                </li>)}
              </ul>}
          </section>

          <section className={styles.panel} aria-labelledby="mon-automacoes-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="mon-automacoes-title">Automações determinísticas</h3>
                <p>Regras determinísticas de vencimento, distribuição de tarefa e cobrança interna. A tela não executa job: o histórico de execução é registro manual e auditável.</p>
              </div>
              <span className={styles.count}>{automations.length}</span>
            </div>
            {automations.length === 0
              ? <p className={styles.note}>Nenhuma automação registrada nesta leitura.</p>
              : <ul className={styles.recordList}>
                {automations.map(row => <li key={s(row.id)} aria-current={selected?.id === s(row.id)}>
                  <strong>{s(row.name) || "sem nome"}</strong>
                  <span>tipo {s(row.automation_type) || "não informado"} · status {s(row.status) || "não informado"} · determinística {b(row.is_deterministic) ? "sim" : "não"} · execuções {n(row.run_count)} · erros {n(row.error_count)} · último em {dateTime(row.last_run_at)}</span>
                  <div className={styles.actions}>
                    <button type="button" onClick={() => openRecord("automation", row)} aria-label={`Abrir registro ${s(row.name) || shortId(row.id)} da automação`}>Abrir registro</button>
                  </div>
                </li>)}
              </ul>}
          </section>
        </div>
      )}

      {readState.kind === "ready" && total > 0 && (
        <div className={styles.split}>
          <section className={styles.panel} aria-labelledby="mon-detail-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="mon-detail-title">Registro selecionado</h3>
                <p>Registro canônico devolvido pelo servidor, com o histórico de execução quando a área é automação.</p>
              </div>
            </div>
            {!selected || !selectedRow
              ? <p className={styles.note}>Nenhum registro aberto. Escolha um item da lista para ver o JSON canônico, o histórico de execução e as transições que a área permite.</p>
              : <>
                <p><strong>{s(selectedRow.protocol) || s(selectedRow.name) || shortId(selectedRow.id)}</strong> · {selectedArea === "central" ? "central/vídeo" : selectedArea === "biometry" ? "biometria" : "automação"} · id {s(selectedRow.id)}</p>
                <details className={styles.subsection} open>
                  <summary>Registro canônico (JSON)</summary>
                  <pre className={styles.pre}>{JSON.stringify(selectedRow, null, 2)}</pre>
                </details>
                {selectedArea === "automation" && <details className={styles.subsection} open>
                  <summary>Histórico de execução ({logs.length})</summary>
                  {logState.kind === "loading" && <UiState variant="loading" title="Consultando execuções" detail="Lendo o histórico desta automação." />}
                  {logState.kind === "error" && <UiState variant="error" title="Falha ao consultar execuções" detail={logState.detail} onRetry={() => setLogTick(tick => tick + 1)} retryLabel="Tentar novamente" />}
                  {logState.kind === "ready" && (logs.length === 0
                    ? <p className={styles.note}>Nenhuma execução registrada para esta automação. Ausência de execução não é sucesso.</p>
                    : <ul className={styles.historyList}>
                      {logs.map(item => <li key={s(item.id)}>
                        {dateTime(item.created_at)} — {s(item.action)} · {b(item.is_error) ? "falha declarada" : "sucesso declarado"}{s(item.target_type) ? ` · alvo ${s(item.target_type)}` : ""}{s(item.result) ? ` · ${s(item.result)}` : ""}
                      </li>)}
                    </ul>)}
                </details>}
                {selectedArea === "automation" && <p className={styles.note}>As regras vigentes são <code>{jsonText(selectedRow.rules)}</code>. Não existe coluna de agendamento nem worker durável nesta entrega: nada é executado em horário algum.</p>}
              </>}
          </section>

          <section className={styles.panel} aria-labelledby="mon-transicao-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="mon-transicao-title">Transição de estado</h3>
                <p>Quem decide é o servidor: aprovação de privacidade, coleta de biometria e status têm regras próprias e recusam com motivo.</p>
              </div>
            </div>
            {!selected || !selectedRow
              ? <p className={styles.note}>Escolha um registro para ver as opções de transição desta área.</p>
              : <>
                {selectedArea === "central" && <>
                  <div className={styles.checkRow}>
                    <label><input type="checkbox" checked={centralTransition.is_privacy_approved} onChange={event => setCentralTransition({ ...centralTransition, is_privacy_approved: event.target.checked })} /> aprovação de privacidade registrada</label>
                    <label><input type="checkbox" checked={centralTransition.is_approved} onChange={event => setCentralTransition({ ...centralTransition, is_approved: event.target.checked })} /> aprovação geral registrada</label>
                  </div>
                  <p className={styles.note}>Aprovar privacidade aqui é <strong>declaração do operador</strong>, não parecer jurídico. O servidor recusa aprovação geral sem aprovação de privacidade, e o projeto não tem coluna de status: o registro são as duas aprovações.</p>
                  <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
                    ENDPOINTS.central, "PATCH",
                    { id: s(selectedRow.id), is_privacy_approved: centralTransition.is_privacy_approved, is_approved: centralTransition.is_approved },
                    "Projeto de central atualizado. O servidor registrou as aprovações.",
                  )}>Atualizar projeto de central</button>
                </>}
                {selectedArea === "biometry" && <>
                  <div className={styles.formGrid}>
                    <Field label="Status do projeto de biometria">
                      <select value={biometryTransition.status} onChange={event => setBiometryTransition({ ...biometryTransition, status: event.target.value })}>
                        {BIOMETRY_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className={styles.checkRow}>
                    <label><input type="checkbox" checked={biometryTransition.is_approved} onChange={event => setBiometryTransition({ ...biometryTransition, is_approved: event.target.checked })} /> projeto aprovado</label>
                    <label><input type="checkbox" checked={biometryTransition.collection_active} onChange={event => setBiometryTransition({ ...biometryTransition, collection_active: event.target.checked })} /> coleta ativa</label>
                  </div>
                  <p className={styles.note}>Ativar coleta sem projeto aprovado é recusado pelo servidor. Nenhum dado biométrico é coletado por esta tela.</p>
                  <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
                    ENDPOINTS.biometry, "PATCH",
                    { id: s(selectedRow.id), status: biometryTransition.status, is_approved: biometryTransition.is_approved, collection_active: biometryTransition.collection_active },
                    "Projeto de biometria atualizado. O servidor registrou a transição.",
                  )}>Atualizar projeto de biometria</button>
                </>}
                {selectedArea === "automation" && <>
                  <div className={styles.formGrid}>
                    <Field label="Status da automação">
                      <select value={automationTransition.status} onChange={event => setAutomationTransition({ status: event.target.value })}>
                        {AUTOMATION_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </Field>
                  </div>
                  <p className={styles.note}>Mudar o status não executa a automação: apenas registra a intenção de operação.</p>
                  <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
                    ENDPOINTS.automations, "PATCH",
                    { id: s(selectedRow.id), status: automationTransition.status },
                    "Automação atualizada. O servidor registrou o novo status.",
                  )}>Atualizar automação</button>
                </>}
              </>}
          </section>
        </div>
      )}

      {readState.kind === "ready" && (
        <div className={styles.split}>
          <section className={styles.panel} aria-labelledby="mon-novo-central-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="mon-novo-central-title">Novo projeto de central/vídeo</h3>
                <p>Cadastro de projeto separado. O projeto nasce sem aprovação e não implanta nada; a tabela não guarda conta do cliente.</p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <Field label="Título do projeto de central" help="Entre 5 e 200 caracteres."><input value={centralForm.title} onChange={event => setCentralForm({ ...centralForm, title: event.target.value })} /></Field>
              <Field label="Escopo do projeto de central" help="Entre 10 e 2000 caracteres: o que será monitorado."><input value={centralForm.scope} onChange={event => setCentralForm({ ...centralForm, scope: event.target.value })} /></Field>
              <div className={styles.full}><Field label="Descrição do projeto de central" help="Mínimo de 10 caracteres."><textarea rows={3} value={centralForm.description} onChange={event => setCentralForm({ ...centralForm, description: event.target.value })} /></Field></div>
              <Field label="Fornecedor do projeto de central" help="Opcional; entre 3 e 200 caracteres."><input value={centralForm.provider} onChange={event => setCentralForm({ ...centralForm, provider: event.target.value })} /></Field>
              <div className={styles.full}><Field label="Avaliação de privacidade do projeto de central" help="Opcional; quando informada, mínimo de 10 caracteres."><textarea rows={3} value={centralForm.privacy_assessment} onChange={event => setCentralForm({ ...centralForm, privacy_assessment: event.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              ENDPOINTS.central, "POST",
              {
                title: centralForm.title.trim(),
                description: centralForm.description.trim(),
                scope: centralForm.scope.trim(),
                provider: centralForm.provider.trim() || null,
                privacy_assessment: centralForm.privacy_assessment.trim() || null,
              },
              "Projeto de central criado em rascunho. Nada foi implantado.",
              () => setCentralForm({ title: "", description: "", scope: "", provider: "", privacy_assessment: "" }),
            )}>Criar projeto de central</button>
          </section>

          <section className={styles.panel} aria-labelledby="mon-novo-biometria-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="mon-novo-biometria-title">Novo projeto de biometria</h3>
                <p>Registro de projeto. Nenhuma biometria é coletada, armazenada ou comparada por esta tela, e a tabela não guarda conta do cliente: o vínculo fica no contrato.</p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <Field label="Título do projeto de biometria" help="Entre 5 e 200 caracteres."><input value={biometryForm.title} onChange={event => setBiometryForm({ ...biometryForm, title: event.target.value })} /></Field>
              <Field label="Tipo de biometria">
                <select value={biometryForm.biometry_type} onChange={event => setBiometryForm({ ...biometryForm, biometry_type: event.target.value })}>
                  {BIOMETRY_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <div className={styles.full}><Field label="Descrição do projeto de biometria" help="Mínimo de 10 caracteres."><textarea rows={2} value={biometryForm.description} onChange={event => setBiometryForm({ ...biometryForm, description: event.target.value })} /></Field></div>
              <div className={styles.full}><Field label="Necessidade da biometria" help="Mínimo de 20 caracteres: por que a biometria é necessária."><textarea rows={2} value={biometryForm.necessity} onChange={event => setBiometryForm({ ...biometryForm, necessity: event.target.value })} /></Field></div>
              <div className={styles.full}><Field label="Relatório de impacto da biometria" help="Mínimo de 20 caracteres (LGPD, art. 38)."><textarea rows={2} value={biometryForm.impact_assessment} onChange={event => setBiometryForm({ ...biometryForm, impact_assessment: event.target.value })} /></Field></div>
              <Field label="Base legal da biometria" help="Mínimo de 10 caracteres."><input value={biometryForm.legal_basis} onChange={event => setBiometryForm({ ...biometryForm, legal_basis: event.target.value })} /></Field>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              ENDPOINTS.biometry, "POST",
              {
                title: biometryForm.title.trim(),
                description: biometryForm.description.trim(),
                biometry_type: biometryForm.biometry_type,
                necessity: biometryForm.necessity.trim(),
                impact_assessment: biometryForm.impact_assessment.trim(),
                legal_basis: biometryForm.legal_basis.trim(),
              },
              "Projeto de biometria criado em rascunho. Coleta segue desativada por padrão.",
              () => setBiometryForm({ title: "", description: "", biometry_type: "facial", necessity: "", impact_assessment: "", legal_basis: "" }),
            )}>Criar projeto de biometria</button>
          </section>
        </div>
      )}

      {readState.kind === "ready" && (
        <div className={styles.split}>
          <section className={styles.panel} aria-labelledby="mon-nova-automacao-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="mon-nova-automacao-title">Nova automação determinística</h3>
                <p>Regra determinística (sem agente autônomo). O cadastro não agenda execução real.</p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <Field label="Nome da automação" help="Entre 3 e 200 caracteres."><input value={automationForm.name} onChange={event => setAutomationForm({ ...automationForm, name: event.target.value })} /></Field>
              <Field label="Tipo de automação">
                <select value={automationForm.automation_type} onChange={event => setAutomationForm({ ...automationForm, automation_type: event.target.value })}>
                  {AUTOMATION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </Field>
              <div className={styles.full}><Field label="Descrição da automação" help="Mínimo de 10 caracteres."><textarea rows={2} value={automationForm.description} onChange={event => setAutomationForm({ ...automationForm, description: event.target.value })} /></Field></div>
              <div className={styles.full}><Field label="Regras da automação (JSON)" help="Objeto JSON; vazio vira {}. Exemplo: {&quot;dias_antes&quot;: 5}."><textarea rows={3} value={automationForm.rules} onChange={event => setAutomationForm({ ...automationForm, rules: event.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={createAutomation}>Criar automação</button>
          </section>

          <section className={styles.panel} aria-labelledby="mon-execucao-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="mon-execucao-title">Registrar execução (manual)</h3>
                <p>O histórico de execução é registro declarado e auditável. A tela não executa a automação; atualiza contadores no servidor.</p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <Field label="Automação da execução" help="Escolha a automação a que a execução se refere.">
                <select value={logForm.automation_id} onChange={event => setLogForm({ ...logForm, automation_id: event.target.value })}>
                  <option value="">selecione</option>
                  {automations.map(row => <option key={s(row.id)} value={s(row.id)}>{s(row.name) || shortId(row.id)}</option>)}
                </select>
              </Field>
              <Field label="Ação registrada na execução" help="Entre 3 e 200 caracteres."><input value={logForm.action} onChange={event => setLogForm({ ...logForm, action: event.target.value })} /></Field>
              <Field label="Tipo de alvo da execução" help="Opcional; entre 3 e 100 caracteres (ex.: contrato)."><input value={logForm.target_type} onChange={event => setLogForm({ ...logForm, target_type: event.target.value })} /></Field>
              <div className={styles.full}><Field label="Resultado da execução" help="Obrigatório; entre 10 e 1000 caracteres."><textarea rows={2} value={logForm.result} onChange={event => setLogForm({ ...logForm, result: event.target.value })} /></Field></div>
            </div>
            <div className={styles.checkRow}>
              <label><input type="checkbox" checked={logForm.success} onChange={event => setLogForm({ ...logForm, success: event.target.checked })} /> execução declarada como sucesso</label>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              ENDPOINTS.logs, "POST",
              {
                automation_id: logForm.automation_id,
                action: logForm.action.trim(),
                result: logForm.result.trim(),
                success: logForm.success,
                target_type: logForm.target_type.trim() || null,
              },
              "Execução registrada no histórico. Isso declara o resultado; não prova execução real do job.",
              () => setLogForm({ automation_id: logForm.automation_id, action: "", result: "", success: true, target_type: "" }),
            )}>Registrar execução</button>
          </section>
        </div>
      )}

      <section className={styles.panel} aria-labelledby="mon-limites-title">
        <h3 id="mon-limites-title">Limites e decisões pendentes</h3>
        <p className={styles.note}>
          Esta aba cobre <strong>três</strong> famílias cujo contrato legado continua vivo e com papel nomeado (<code>admin|ti</code>) no servidor. Ela <strong>não coleta biometria</strong>, <strong>não implanta</strong> central de vídeo, <strong>não conecta</strong> fornecedor de câmera ou de reconhecimento e <strong>não executa</strong> job de automação: o histórico de execução é declaração manual, e não existe worker/scheduler durável nesta entrega. Aprovar privacidade e ativar coleta são <strong>declarações do operador</strong> — e a tela só oferece o que o banco da migração 087 guarda: o projeto de central <strong>não tem coluna de status</strong> (registra as duas aprovações) e a automação <strong>não tem coluna de agendamento</strong>, então nenhum horário é prometido — não substituem parecer jurídico/LGPD, relatório de impacto aprovado, base legal revisada ou decisão do proprietário sobre biometria de colaboradores. As jornadas de <em>relatórios programados</em>, <em>inteligência comercial</em> e <em>apoio emergencial</em> têm rota canônica própria (<code>/api/ext/reports/*</code>, <code>/api/ext/intel/*</code>, <code>/api/ext/emergency/*</code>) com matriz granular (<code>reports.*</code>, <code>intel.*</code>, <code>emergency.*</code>); as rotas legadas que o protótipo antigo chamava foram aposentadas pelo servidor e esta tela não as monta — promovê-las exige fatia própria. <strong>0/222 requisitos com aceite humano</strong>. <strong>Produção: NO-GO.</strong>
        </p>
      </section>
    </section>
  );
}
