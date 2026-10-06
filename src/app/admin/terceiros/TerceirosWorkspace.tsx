"use client";

// UX-07 / EXT-02 — apresentação da jornada canônica real de TERCEIROS.
//
// Esta reescrita é de APRESENTAÇÃO. Nenhuma URL, método, corpo, cabeçalho,
// chave de idempotência ou regra de servidor foi alterada. As rotas abaixo
// foram conferidas uma a uma contra o dispatch real de server.mjs
// (~linhas 4245–4266) e contra cada `handle*()` de
// `src/server/ext-third-party-api.mjs`:
//
//   GET   /api/ext/third-party/parties
//   POST  /api/ext/third-party/parties                              (Idempotency-Key)
//   GET   /api/ext/third-party/parties/{id}
//   PATCH /api/ext/third-party/parties/{id}                         (Idempotency-Key)
//   POST  /api/ext/third-party/parties/{id}/contract                (Idempotency-Key)
//   POST  /api/ext/third-party/parties/{id}/access-grants           (Idempotency-Key)
//   GET   /api/ext/third-party/parties/{id}/authorization?scope_kind&scope_id
//   POST  /api/ext/third-party/access-grants/{id}/revoke            (Idempotency-Key)
//   POST  /api/ext/third-party/parties/{id}/documents               (Idempotency-Key)
//   POST  /api/ext/third-party/documents/{id}/deactivate            (Idempotency-Key)
//   POST  /api/ext/third-party/parties/{id}/document-rules          (Idempotency-Key)
//   POST  /api/ext/third-party/parties/{id}/evaluations             (Idempotency-Key)
//
// Nenhum endpoint foi inventado, e nenhuma rota legada é consumida por esta
// tela: os aliases (`/api/admin/hr/ext-third-parties`,
// `/api/crm/hr/ext-third-parties`, `/api/hr/ext-third-parties`,
// `/api/ext/third-parties` e os quatro equivalentes de
// `*-third-party-documents`) continuam religados no servidor, respondendo 200
// na leitura e 410 `legacy_route_retired` na mutação, sem participar daqui.
//
// FRONTEIRA EXTERNA DECLARADA, NUNCA SIMULADA: não existe hoje ator externo
// "terceiro" autenticado. Esta tela não cria sessão, login nem canal externo
// de terceiro; ela mostra o aviso que o próprio servidor devolve em
// `external_actor_boundary` e nomeia o ponto de imposição real
// (`GET …/authorization`). O acesso do terceiro permanece PENDENTE.
//
// DEFEITOS DE ESTADO CORRIGIDOS (todos medidos no protótipo):
//  - falha de leitura caía num texto único e a tabela continuava sendo
//    renderizada vazia; agora cada leitura tem estado próprio e, em falha, a
//    tabela e os contadores ficam AUSENTES do DOM;
//  - recusa de papel (`forbidden_role`/`unauthorized`) era erro genérico;
//    agora é estado NEGADO, distinto de falha, com o código no rodapé técnico;
//  - o motivo de desativação de documento e a sua chave de idempotência eram
//    UM estado único compartilhado por todos os documentos da lista; agora
//    cada documento tem campo rotulado e chave próprios — o mesmo vale para a
//    revogação de cada janela de acesso;
//  - a chave de idempotência preservada em falha não era mostrada; agora ela
//    aparece junto do erro, na íntegra, para repetição segura.
//
// Quem autoriza continua sendo o servidor: `guard()` exige sessão de equipe
// (401 `unauthorized`), papel aceito (403 `forbidden_role`), origem própria na
// escrita (403 `origin_forbidden`) e identidade em UUID real. O AdminGate da
// página não foi alargado: continua ["marcelo","admin","ti"], a mesma lista
// que o servidor aplica — e o menu não é autorização.
//
// A chave de idempotência de cada operação é criada por operação, PRESERVADA
// após falha e descartada apenas no sucesso — contrato herdado do protótipo,
// com os MESMOS prefixos (`ext02-tp`, `ext02-ctr`, `ext02-grt`, `ext02-rev`,
// `ext02-sta`, `ext02-doc`, `ext02-dcx`, `ext02-rul`, `ext02-avl`).

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  thirdPartyErrorFootnote,
  thirdPartyErrorVariant,
  thirdPartyStatusLabel,
  thirdPartyStatusTone,
  scopeKindLabel,
  windowStatusLabel,
  windowStatusTone,
  accessSituationLabel,
  accessSituationTone,
  decisionReasonLabel,
  decisionReasonTone,
  documentExpiryLabel,
  documentExpiryTone,
  documentRuleAbsenceLabel,
  thirdPartyEventLabel,
  thirdPartyEventTone,
  honestDate,
  honestDateTime,
  honestText,
  responsibleLabel,
  evaluationScoreLabel,
  windowSummary,
  expirySummary,
  count,
  ABSENT,
  NO_CONTRACT,
  NO_EVALUATION,
  EXTERNAL_BOUNDARY,
  type ThirdPartyErrorDescriptor,
} from "../../../lib/third-party-vocabulary.mjs";
import { thirdPartyRequest } from "../../../lib/third-party-request";

type AccessWindow = {
  status?: string;
  access_start?: string | null;
  access_end?: string | null;
  days_to_end?: number;
  days_since_end?: number;
  days_to_start?: number;
  revoked_at?: string | null;
  revoke_reason?: string | null;
  derivation?: string | null;
  base_date?: string | null;
};

type AccessSituation = {
  status?: string;
  third_party_status?: string | null;
  grants_registered?: number | null;
  active_windows?: number | null;
  note?: string | null;
  source?: string | null;
  base_date?: string | null;
};

type ExternalBoundary = {
  authenticated_third_party_channel?: boolean;
  status?: string;
  note?: string;
  canonical_sessions_today?: string[];
  enforcement_point?: string;
};

type ThirdParty = {
  id: string;
  name: string;
  document?: string | null;
  category?: string | null;
  status: string;
  contract_id?: string | null;
  contract_title?: string | null;
  contract_verified_at?: string | null;
  contract_verified_status?: string | null;
  responsible_name?: string | null;
  evaluation_score?: number | string | null;
  notes?: string | null;
  origin?: string | null;
  access_situation?: AccessSituation;
};

type PartiesResponse = {
  third_parties?: ThirdParty[];
  third_parties_registered?: boolean;
  scope?: { note?: string | null } | null;
  source?: string[] | null;
  base_date?: string | null;
  external_actor_boundary?: ExternalBoundary | null;
  note?: string | null;
};

type DocumentExpiry = {
  status?: string;
  expiry_date?: string | null;
  alert_rule?: { id: string; alert_before_days: number; justification: string } | null;
  alert_rule_absence?: string | null;
  derivation?: string | null;
};

type ThirdPartyDocument = {
  id: string;
  document_type?: string | null;
  document_number?: string | null;
  file_name?: string | null;
  expiry_date?: string | null;
  is_active?: boolean;
  deactivate_reason?: string | null;
  expiry?: DocumentExpiry;
};

type AccessGrant = {
  id: string;
  scope_kind?: string;
  contract_id?: string | null;
  contract_title?: string | null;
  service_order_id?: string | null;
  service_order_protocol?: string | null;
  justification?: string | null;
  granted_at?: string | null;
  revoked_at?: string | null;
  revoke_reason?: string | null;
  window?: AccessWindow;
};

type Evaluation = { id: string; score?: number | string | null; justification?: string | null; evaluated_on?: string | null; created_at?: string | null };
type ThirdPartyEvent = { id: string; event_type?: string | null; summary?: string | null; created_at?: string | null };

type Dossier = {
  third_party: ThirdParty;
  contract_link?: { contract_id?: string | null; title?: string | null; status_now?: string | null; verified_at?: string | null; verified_status?: string | null; note?: string | null; source?: string | null } | null;
  access_grants?: AccessGrant[];
  access_situation?: AccessSituation;
  documents?: ThirdPartyDocument[];
  document_rule?: { id: string; alert_before_days: number; justification: string } | null;
  document_rule_absence?: string | null;
  evaluations?: Evaluation[];
  evaluation_summary?: { registered?: number | null; note?: string | null; source?: string | null } | null;
  events?: ThirdPartyEvent[];
  external_actor_boundary?: ExternalBoundary | null;
  source?: Record<string, string> | null;
  base_date?: string | null;
};

type AuthorizationDecision = {
  authorized?: boolean;
  reason?: string;
  derivation?: string | null;
  scope?: { kind?: string | null; id?: string | null } | null;
  window?: AccessWindow;
  grant?: { id: string } | null;
  source?: string[] | null;
  base_date?: string | null;
  external_actor_boundary?: ExternalBoundary | null;
};

/** Estado honesto de uma leitura independente: nunca confunde os quatro casos. */
type Load<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "failed"; error: ThirdPartyErrorDescriptor };

const TABS = [
  { id: "terceiros", label: "Terceiros registrados" },
  { id: "cadastro", label: "Registrar terceiro" },
  { id: "dossie", label: "Dossiê e contrato" },
  { id: "acessos", label: "Janelas de acesso" },
  { id: "autorizacao", label: "Decisão de autorização" },
  { id: "documentos", label: "Documentos e regra" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "eventos", label: "Trilha de eventos" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Listas do PRÓPRIO servidor: THIRD_PARTY_STATUSES e ACCESS_SCOPE_KINDS de
// src/server/ext-third-party-api.mjs. A tela não acrescenta nem remove opção.
const THIRD_PARTY_STATUSES = ["ativo", "inativo", "suspenso", "encerrado"] as const;
const ACCESS_SCOPE_KINDS = ["contrato", "ordem_servico"] as const;

const EMPTY_PARTY = { name: "", document: "", category: "", responsible_name: "", notes: "" };
const EMPTY_CONTRACT = { contract_id: "", justification: "" };
const EMPTY_GRANT = { scope_kind: "contrato", scope_id: "", access_start: "", access_end: "", justification: "" };
const EMPTY_STATUS = { status: "", reason: "" };
const EMPTY_DOCUMENT = { document_type: "", document_number: "", expiry_date: "", file_name: "" };
const EMPTY_RULE = { alert_before_days: "30", justification: "" };
const EMPTY_EVALUATION = { score: "", evaluated_on: "", justification: "" };
const EMPTY_CHECK = { scope_kind: "contrato", scope_id: "" };

export default function TerceirosWorkspace() {
  const [active, setActive] = useState<TabId>("terceiros");

  // TRÊS LEITURAS INDEPENDENTES, cada uma com o seu estado: a falha de uma
  // nunca apaga nem zera a outra, e nenhuma falha vira lista vazia.
  //  - lista de terceiros            → GET /parties
  //  - dossiê (traz, numa única resposta canônica, janelas, documentos,
  //    regra, avaliações e trilha)   → GET /parties/{id}
  //  - decisão de autorização        → GET /parties/{id}/authorization
  const [list, setList] = useState<Load<PartiesResponse>>({ phase: "loading" });
  const [dossier, setDossier] = useState<Load<Dossier> | null>(null);
  const [decision, setDecision] = useState<Load<AuthorizationDecision> | null>(null);

  const [selectedId, setSelectedId] = useState("");
  const [partyForm, setPartyForm] = useState(EMPTY_PARTY);
  const [contractForm, setContractForm] = useState(EMPTY_CONTRACT);
  const [grantForm, setGrantForm] = useState(EMPTY_GRANT);
  const [statusForm, setStatusForm] = useState(EMPTY_STATUS);
  const [documentForm, setDocumentForm] = useState(EMPTY_DOCUMENT);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE);
  const [evaluationForm, setEvaluationForm] = useState(EMPTY_EVALUATION);
  const [checkForm, setCheckForm] = useState(EMPTY_CHECK);
  // Motivo POR REGISTRO: um campo rotulado para cada documento e para cada
  // janela de acesso. Nada é compartilhado entre linhas.
  const [deactivateReason, setDeactivateReason] = useState<Record<string, string>>({});
  const [revokeReason, setRevokeReason] = useState<Record<string, string>>({});

  const [actionError, setActionError] = useState<ThirdPartyErrorDescriptor | null>(null);
  const [preservedKey, setPreservedKey] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Contrato herdado: a chave de idempotência de cada operação é preservada
  // após falha, para a repetição ser segura, e só é descartada após sucesso.
  const keys = useRef<Record<string, string>>({});

  const loadList = useCallback(async () => {
    setList({ phase: "loading" });
    const result = await thirdPartyRequest<PartiesResponse>("/api/ext/third-party/parties");
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
    const result = await thirdPartyRequest<Dossier>(`/api/ext/third-party/parties/${id}`);
    if (!result.ok) {
      setDossier({ phase: "failed", error: result.error });
      return;
    }
    setDossier({ phase: "ready", data: result.data });
  }, []);

  const inspect = useCallback(async (id: string) => {
    setSelectedId(id);
    // Trocar de terceiro invalida a decisão anterior: ela pertence a outro
    // identificador e a outro escopo. Nada é reaproveitado.
    setDecision(null);
    await loadDossier(id);
  }, [loadDossier]);

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
    const result = await thirdPartyRequest<T>(url, {
      method,
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!result.ok) {
      // O servidor acrescenta informação estruturada junto do código em
      // vários casos (`use`, `note`, `grant_id`, `status`, `contract_status`,
      // `service_order_status`, `blocking_statuses`). O código canônico NÃO é
      // alterado: o complemento só se soma ao detalhe, como veio.
      const extra =
        result.payload && typeof result.payload === "object"
          ? (result.payload as {
              use?: unknown; hint?: unknown; detail?: unknown; note?: unknown;
              grant_id?: unknown; status?: unknown; contract_status?: unknown;
              service_order_status?: unknown; blocking_statuses?: unknown;
            })
          : {};
      const complement = [
        extra.hint, extra.detail, extra.note, extra.use,
        typeof extra.grant_id === "string" ? `Janela ativa: ${extra.grant_id}.` : null,
        typeof extra.status === "string" ? `Situação atual: ${extra.status}.` : null,
        typeof extra.contract_status === "string" ? `Situação do contrato: ${extra.contract_status}.` : null,
        typeof extra.service_order_status === "string" ? `Situação da ordem de serviço: ${extra.service_order_status}.` : null,
        Array.isArray(extra.blocking_statuses) ? `Situações bloqueantes declaradas pelo servidor: ${extra.blocking_statuses.join(", ")}.` : null,
      ]
        .filter(value => typeof value === "string" && value.length > 0)
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
    if (selectedId) await loadDossier(selectedId);
  }, [loadList, loadDossier, selectedId]);

  const createParty = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate<{ third_party?: ThirdParty; replayed?: boolean }>(
      "party", "ext02-tp", "/api/ext/third-party/parties", "POST",
      {
        name: partyForm.name,
        document: partyForm.document || undefined,
        category: partyForm.category || undefined,
        responsible_name: partyForm.responsible_name || undefined,
        notes: partyForm.notes || undefined,
      },
    );
    if (!data?.third_party) return;
    setPartyForm(EMPTY_PARTY);
    setNotice(`Terceiro ${honestText(data.third_party.name)} confirmado pelo servidor${data.replayed ? " (replay idempotente, sem duplicar)" : ""}. Nada aparece aqui antes da confirmação canônica.`);
    await loadList();
    await inspect(data.third_party.id);
    setActive("dossie");
  };

  const bindContract = async (event: FormEvent) => {
    event.preventDefault();
    // A justificativa vem do campo rotulado preenchido por quem opera; sem
    // ela o servidor recusa com `invalid_justification`.
    const data = await mutate("contract", "ext02-ctr", `/api/ext/third-party/parties/${selectedId}/contract`, "POST", {
      contract_id: contractForm.contract_id,
      justification: contractForm.justification,
    });
    if (!data) return;
    setContractForm(EMPTY_CONTRACT);
    setNotice("Contrato vinculado somente após validação canônica no servidor, com quem verificou e quando registrados.");
    await refreshSelected();
  };

  const grantAccess = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate("grant", "ext02-grt", `/api/ext/third-party/parties/${selectedId}/access-grants`, "POST", {
      scope_kind: grantForm.scope_kind,
      scope_id: grantForm.scope_id,
      access_start: grantForm.access_start,
      access_end: grantForm.access_end,
      justification: grantForm.justification,
    });
    if (!data) return;
    setGrantForm(EMPTY_GRANT);
    setNotice("Janela registrada pelo servidor com escopo autorizado e término obrigatório. A perda de acesso é derivada do término, nunca marcada à mão.");
    await refreshSelected();
  };

  const revokeGrant = async (grantId: string) => {
    // Motivo escrito por quem opera, em campo rotulado próprio desta janela.
    const typed = revokeReason[grantId] || "";
    const data = await mutate(`grant-${grantId}`, "ext02-rev", `/api/ext/third-party/access-grants/${grantId}/revoke`, "POST", { reason: typed });
    if (!data) return;
    setRevokeReason(current => ({ ...current, [grantId]: "" }));
    setNotice("Janela revogada pelo servidor, com autor e motivo registrados. O histórico permanece imutável.");
    await refreshSelected();
  };

  const updateStatus = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate<{ revoked_grants?: number }>("status", "ext02-sta", `/api/ext/third-party/parties/${selectedId}`, "PATCH", {
      status: statusForm.status,
      reason: statusForm.reason,
    });
    if (!data) return;
    setStatusForm(EMPTY_STATUS);
    setNotice(`Situação atualizada pelo servidor. Janelas revogadas na mesma transação: ${count(data.revoked_grants)}.`);
    await refreshSelected();
  };

  const createDocument = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate("document", "ext02-doc", `/api/ext/third-party/parties/${selectedId}/documents`, "POST", {
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
    const data = await mutate(`doc-${documentId}`, "ext02-dcx", `/api/ext/third-party/documents/${documentId}/deactivate`, "POST", { reason: typed });
    if (!data) return;
    setDeactivateReason(current => ({ ...current, [documentId]: "" }));
    setNotice("Documento desativado pelo servidor, com autor e motivo registrados. O registro permanece para histórico.");
    await refreshSelected();
  };

  const createRule = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate("rule", "ext02-rul", `/api/ext/third-party/parties/${selectedId}/document-rules`, "POST", {
      alert_before_days: ruleForm.alert_before_days === "" ? undefined : Number(ruleForm.alert_before_days),
      justification: ruleForm.justification,
    });
    if (!data) return;
    setRuleForm(EMPTY_RULE);
    setNotice("Regra explícita de antecedência registrada. O alerta “a vencer” deriva somente dela.");
    await refreshSelected();
  };

  const createEvaluation = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate("evaluation", "ext02-avl", `/api/ext/third-party/parties/${selectedId}/evaluations`, "POST", {
      score: evaluationForm.score === "" ? undefined : Number(evaluationForm.score),
      evaluated_on: evaluationForm.evaluated_on,
      justification: evaluationForm.justification,
    });
    if (!data) return;
    setEvaluationForm(EMPTY_EVALUATION);
    setNotice("Avaliação registrada com autor derivado da sessão, data e justificativa escritas por quem opera.");
    await refreshSelected();
  };

  const runAuthorizationCheck = useCallback(async (id: string, scopeKind: string, scopeId: string) => {
    if (!id) return;
    setDecision({ phase: "loading" });
    const query = new URLSearchParams({ scope_kind: scopeKind, scope_id: scopeId });
    const result = await thirdPartyRequest<AuthorizationDecision>(
      `/api/ext/third-party/parties/${id}/authorization?${query.toString()}`,
    );
    if (!result.ok) {
      // A falha da consulta de autorização NÃO contamina o dossiê e nunca é
      // lida como "não autorizado": são estados diferentes.
      setDecision({ phase: "failed", error: result.error });
      return;
    }
    setDecision({ phase: "ready", data: result.data });
  }, []);

  const checkAuthorization = (event: FormEvent) => {
    event.preventDefault();
    void runAuthorizationCheck(selectedId, checkForm.scope_kind, checkForm.scope_id);
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
    error: ThirdPartyErrorDescriptor,
    retry: () => void,
    testId: string,
    negacao: string,
  ) => (
    <div data-testid={testId}>
      <UiState
        variant={thirdPartyErrorVariant(error)}
        title={error.title}
        detail={`${error.detail} ${negacao} Menu não é autorização: abrir esta tela não substitui a decisão do servidor. ${thirdPartyErrorFootnote(error)}`}
        onRetry={error.canRetry ? retry : undefined}
        retryLabel="Tentar a leitura de novo"
      />
    </div>
  );

  const semTerceiro = (
    <UiState
      variant="empty"
      title="Nenhum terceiro selecionado."
      detail="Escolha um terceiro na aba Terceiros registrados para o servidor devolver o dossiê canônico. Esta tela não escolhe terceiro por conta própria."
    />
  );

  const parties = list.phase === "ready" && Array.isArray(list.data.third_parties) ? list.data.third_parties : [];
  const partiesRegistered = list.phase === "ready" ? list.data.third_parties_registered === true : false;
  const dossierData = dossier?.phase === "ready" ? dossier.data : null;
  const boundary = dossierData?.external_actor_boundary
    ?? (list.phase === "ready" ? list.data.external_actor_boundary : null)
    ?? null;

  /**
   * Estado do dossiê, reusado por todas as abas que dependem dele. O servidor
   * devolve janelas, documentos, regra, avaliações e trilha numa ÚNICA
   * resposta canônica (`GET /parties/{id}`): cada aba mostra o seu próprio
   * estado dessa leitura, e nenhuma delas transforma falha em lista vazia.
   */
  const renderDossierState = (testId: string, negacao: string) => {
    if (!selectedId) return semTerceiro;
    if (!dossier || dossier.phase === "loading") {
      return <UiState variant="loading" title="Lendo o dossiê canônico do terceiro…" detail="Nada é exibido antes de a leitura terminar." />;
    }
    if (dossier.phase === "failed") {
      return renderReadFailure(dossier.error, () => void loadDossier(selectedId), testId, negacao);
    }
    return null;
  };

  const painel = (id: TabId) => ({
    id: `terceiros-panel-${id}`,
    role: "tabpanel" as const,
    tabIndex: 0,
    "aria-labelledby": `terceiros-tab-${id}`,
    className: styles.panel,
  });

  return (
    <main className={styles.workspace} data-testid="terceiros-workspace">
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Terceiros</span>
      </nav>
      <p className={styles.kicker}>EXT-02</p>
      <h1>Terceiros, acesso por escopo autorizado e perda de acesso ao término</h1>
      <p className={styles.lede} data-testid="terceiros-honesty">
        Jornada interna de equipe. Vínculo de contrato, vencimento de documento, janela de
        acesso e avaliação vêm exclusivamente de registros canônicos do servidor, com fonte e
        data-base declaradas. Sem registro, a tela declara a ausência — nunca mostra nota zero,
        acesso liberado nem documento em dia por falta de dado.
      </p>
      <p className={styles.hint} data-testid="terceiros-fronteira">
        <strong>Fronteira externa declarada:</strong> {EXTERNAL_BOUNDARY}
      </p>
      {boundary ? (
        <p className={styles.footnote} data-testid="terceiros-fronteira-servidor">
          Declaração do servidor ({honestText(boundary.status)}): {honestText(boundary.note)} Sessões
          canônicas existentes hoje: {Array.isArray(boundary.canonical_sessions_today) && boundary.canonical_sessions_today.length > 0
            ? boundary.canonical_sessions_today.join(" · ")
            : ABSENT}. Ponto de imposição: {honestText(boundary.enforcement_point)}
        </p>
      ) : null}
      <p className={styles.hint}>
        Quem pode ler e escrever é decidido pelo servidor: sessão de equipe válida, papel
        autorizado e origem própria, conferidos em <code>src/server/ext-third-party-api.mjs</code>{" "}
        antes de qualquer resposta. Abrir esta tela pelo menu não concede acesso nenhum. Cada
        escrita leva uma chave de idempotência própria: repetir a operação depois de uma falha
        reaproveita a mesma chave e não duplica efeito.
      </p>

      {notice ? <UiState variant="success" title={notice} /> : null}
      {actionError ? (
        <div data-testid="terceiros-action-error">
          <UiState
            variant={thirdPartyErrorVariant(actionError)}
            title={actionError.title}
            detail={`${actionError.detail} ${thirdPartyErrorFootnote(actionError)}`}
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

      <div className={styles.tabs} role="tablist" aria-label="Jornada canônica de terceiros">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`terceiros-tab-${tab.id}`}
            ref={node => { tabRefs.current[index] = node; }}
            type="button"
            role="tab"
            className={active === tab.id ? styles.tabActive : styles.tab}
            aria-selected={active === tab.id}
            aria-controls={`terceiros-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={event => onTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {active === "terceiros" ? (
          <section {...painel("terceiros")} data-testid="terceiros-lista">
            <h2 className={styles.panelTitle}>Terceiros registrados no backend canônico</h2>
            {list.phase === "loading" ? (
              <UiState variant="loading" title="Lendo os terceiros canônicos…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {list.phase === "failed"
              ? renderReadFailure(
                  list.error,
                  () => void loadList(),
                  "terceiros-lista-erro",
                  "Isto não significa que não existam terceiros registrados.",
                )
              : null}
            {list.phase === "ready" && !partiesRegistered ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhum terceiro canônico está registrado."
                detail={honestText(list.data.note)}
              />
            ) : null}
            {list.phase === "ready" && partiesRegistered ? (
              <>
                {/* Indicadores só existem depois da leitura concluída: nunca
                    aparecem como zero durante carregamento ou falha. */}
                <ul className={styles.metrics} data-testid="terceiros-metricas">
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(parties.length)}</span>
                    <span className={styles.metricLabel}>Terceiros lidos nesta consulta</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(parties.filter(item => item.access_situation?.status === "com_acesso_vigente").length)}</span>
                    <span className={styles.metricLabel}>Com acesso vigente, pela derivação do servidor</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(parties.filter(item => !item.contract_id).length)}</span>
                    <span className={styles.metricLabel}>Sem contrato canônico vinculado</span>
                  </li>
                </ul>
                <div className={styles.tableWrap}>
                  <table className={styles.table} data-testid="terceiros-tabela">
                    <caption>
                      Terceiros da jornada canônica. Situação, vínculo de contrato, acesso derivado
                      e avaliação vêm do servidor; nada é calculado nesta tela.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Terceiro</th>
                        <th scope="col">Categoria</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Contrato vinculado</th>
                        <th scope="col">Acesso derivado</th>
                        <th scope="col">Avaliação</th>
                        <th scope="col">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parties.map(item => (
                        <tr key={item.id}>
                          <th scope="row">{honestText(item.name)}</th>
                          <td>{honestText(item.category)}</td>
                          <td>
                            <UiBadge tone={thirdPartyStatusTone(item.status)} srPrefix="Situação do terceiro">
                              {thirdPartyStatusLabel(item.status)}
                            </UiBadge>
                          </td>
                          <td>{item.contract_id ? honestText(item.contract_title || item.contract_id) : NO_CONTRACT}</td>
                          <td>
                            <UiBadge tone={accessSituationTone(item.access_situation?.status)} srPrefix="Acesso derivado">
                              {accessSituationLabel(item.access_situation?.status)}
                            </UiBadge>
                          </td>
                          <td>{evaluationScoreLabel(item.evaluation_score)}</td>
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
                <p className={styles.footnote} data-testid="terceiros-fonte">
                  Fonte declarada pelo servidor: {Array.isArray(list.data.source) && list.data.source.length > 0 ? list.data.source.join(" + ") : ABSENT}.
                  Data-base: {honestDateTime(list.data.base_date)}. {honestText(list.data.note)}
                </p>
              </>
            ) : null}
            <div className={styles.actions}>
              <button type="button" onClick={() => void loadList()}>Reler os terceiros canônicos</button>
            </div>
          </section>
        ) : null}

        {active === "cadastro" ? (
          <section {...painel("cadastro")} data-testid="terceiros-cadastro">
            <h2 className={styles.panelTitle}>Registrar terceiro na jornada canônica</h2>
            <p className={styles.hint}>
              Autoria e origem são derivadas da sessão pelo servidor: identificadores e vínculos
              enviados pelo navegador são ignorados. Contrato, janela de acesso e avaliação têm
              rotas canônicas próprias e não são aceitos neste cadastro.
            </p>
            <form onSubmit={createParty}>
              <fieldset className={styles.fieldset}>
                <legend>Dados declarados do terceiro</legend>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label htmlFor="terceiros-nome">Nome do terceiro (3 a 200 caracteres)</label>
                    <input id="terceiros-nome" name="name" required value={partyForm.name} onChange={event => setPartyForm({ ...partyForm, name: event.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="terceiros-documento">Documento do terceiro (opcional, 3 a 30 caracteres)</label>
                    <input id="terceiros-documento" name="document" value={partyForm.document} onChange={event => setPartyForm({ ...partyForm, document: event.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="terceiros-categoria">Categoria (opcional, 3 a 100 caracteres)</label>
                    <input id="terceiros-categoria" name="category" value={partyForm.category} onChange={event => setPartyForm({ ...partyForm, category: event.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="terceiros-responsavel">Responsável declarado (opcional, 2 a 200 caracteres)</label>
                    <input id="terceiros-responsavel" name="responsible_name" value={partyForm.responsible_name} onChange={event => setPartyForm({ ...partyForm, responsible_name: event.target.value })} />
                  </div>
                  <div className={`${styles.field} ${styles.full}`}>
                    <label htmlFor="terceiros-notas">Observações escritas por quem opera (opcional, 10 a 1000 caracteres)</label>
                    <textarea id="terceiros-notas" name="notes" rows={3} value={partyForm.notes} onChange={event => setPartyForm({ ...partyForm, notes: event.target.value })} />
                  </div>
                </div>
              </fieldset>
              <div className={styles.actions}>
                <button type="submit" disabled={busy}>{busy ? "Enviando ao servidor…" : "Registrar terceiro"}</button>
              </div>
            </form>
          </section>
        ) : null}

        {active === "dossie" ? (
          <section {...painel("dossie")} data-testid="terceiros-dossie">
            <h2 className={styles.panelTitle}>Dossiê canônico e vínculo de contrato</h2>
            {renderDossierState("terceiros-dossie-erro", "Isto não significa que o terceiro não tenha contrato, documento ou janela registrada.")}
            {dossierData ? (
              <>
                <div className={styles.facts} data-testid="terceiros-dossie-fatos">
                  <p>
                    <strong>{honestText(dossierData.third_party?.name)}</strong>{" "}
                    <UiBadge tone={thirdPartyStatusTone(dossierData.third_party?.status)} srPrefix="Situação do terceiro">
                      {thirdPartyStatusLabel(dossierData.third_party?.status)}
                    </UiBadge>
                  </p>
                  <p>Categoria: {honestText(dossierData.third_party?.category)}</p>
                  <p>Documento declarado: {honestText(dossierData.third_party?.document)}</p>
                  <p>Responsável: {responsibleLabel(dossierData.third_party?.responsible_name)}</p>
                  <p>Observações: {honestText(dossierData.third_party?.notes)}</p>
                  <p>
                    Situação de acesso derivada:{" "}
                    <UiBadge tone={accessSituationTone(dossierData.access_situation?.status)} srPrefix="Situação de acesso">
                      {accessSituationLabel(dossierData.access_situation?.status)}
                    </UiBadge>{" "}
                    — {count(dossierData.access_situation?.active_windows)} janela(s) vigente(s) de{" "}
                    {count(dossierData.access_situation?.grants_registered)} registrada(s).
                  </p>
                  <p className={styles.footnote}>{honestText(dossierData.access_situation?.note)}</p>
                  <p className={styles.footnote}>
                    Data-base declarada pelo servidor: {honestDateTime(dossierData.base_date)}.
                  </p>
                </div>

                <div className={styles.card} data-testid="terceiros-contrato">
                  <h3 className={styles.cardTitle}>Contrato vinculado após validação canônica</h3>
                  {dossierData.contract_link?.contract_id ? (
                    <>
                      <p>{honestText(dossierData.contract_link.title || dossierData.contract_link.contract_id)}</p>
                      <p>
                        Situação agora: {honestText(dossierData.contract_link.status_now)}. Situação na
                        verificação: {honestText(dossierData.contract_link.verified_status)}. Verificado em{" "}
                        {honestDateTime(dossierData.contract_link.verified_at)}.
                      </p>
                    </>
                  ) : (
                    <p>{NO_CONTRACT}. {honestText(dossierData.contract_link?.note)}</p>
                  )}
                  <p className={styles.footnote}>Fonte: {honestText(dossierData.contract_link?.source)}</p>
                  <form onSubmit={bindContract}>
                    <fieldset className={styles.fieldset}>
                      <legend>Vincular contrato canônico</legend>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-contrato-id">Identificador do contrato em crm_contracts</label>
                          <input id="terceiros-contrato-id" name="contract_id" required value={contractForm.contract_id} onChange={event => setContractForm({ ...contractForm, contract_id: event.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-contrato-justificativa">Justificativa do vínculo, escrita por quem opera (5 a 500 caracteres)</label>
                          <input id="terceiros-contrato-justificativa" name="justification" value={contractForm.justification} onChange={event => setContractForm({ ...contractForm, justification: event.target.value })} />
                        </div>
                      </div>
                    </fieldset>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Vincular contrato validado no servidor</button>
                    </div>
                  </form>
                </div>

                <div className={styles.card} data-testid="terceiros-situacao">
                  <h3 className={styles.cardTitle}>Atualizar situação do terceiro</h3>
                  <p className={styles.hint}>
                    Encerrar revoga, na mesma transação do servidor, todas as janelas ainda vigentes.
                    A lista de situações é a do próprio servidor; a tela não cria situação nova.
                  </p>
                  <form onSubmit={updateStatus}>
                    <fieldset className={styles.fieldset}>
                      <legend>Mudança de situação com motivo registrado</legend>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-situacao-valor">Nova situação declarada pelo servidor</label>
                          <select id="terceiros-situacao-valor" name="status" required value={statusForm.status} onChange={event => setStatusForm({ ...statusForm, status: event.target.value })}>
                            <option value="">Selecione a situação</option>
                            {THIRD_PARTY_STATUSES.map(value => (
                              <option key={value} value={value}>{thirdPartyStatusLabel(value)}</option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-situacao-motivo">Motivo da mudança de situação, escrito por quem opera (5 a 500 caracteres)</label>
                          <input id="terceiros-situacao-motivo" name="reason" value={statusForm.reason} onChange={event => setStatusForm({ ...statusForm, reason: event.target.value })} />
                        </div>
                      </div>
                    </fieldset>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Atualizar situação com motivo registrado</button>
                    </div>
                  </form>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "acessos" ? (
          <section {...painel("acessos")} data-testid="terceiros-acessos">
            <h2 className={styles.panelTitle}>Janelas de acesso temporário por escopo autorizado</h2>
            {renderDossierState("terceiros-acessos-erro", "Isto não significa que o terceiro não tenha janela de acesso registrada.")}
            {dossierData ? (
              <>
                {(dossierData.access_grants?.length ?? 0) === 0 ? (
                  <div data-testid="terceiros-acessos-vazio">
                    <UiState
                      variant="empty"
                      title="A leitura funcionou e nenhuma janela de acesso canônica está registrada."
                      detail="Ausência de janela não é acesso liberado: sem janela registrada o servidor não autoriza escopo nenhum."
                    />
                  </div>
                ) : (
                  <ul className={styles.scrollList} data-testid="terceiros-acessos-lista">
                    {(dossierData.access_grants || []).map(grant => (
                      <li key={grant.id} className={styles.dividedItem}>
                        <p>
                          <UiBadge tone={windowStatusTone(grant.window?.status)} srPrefix="Situação da janela">
                            {windowStatusLabel(grant.window?.status)}
                          </UiBadge>{" "}
                          {scopeKindLabel(grant.scope_kind)}:{" "}
                          {honestText(grant.scope_kind === "contrato"
                            ? (grant.contract_title || grant.contract_id)
                            : (grant.service_order_protocol || grant.service_order_id))}
                        </p>
                        <p>{windowSummary(grant.window)}</p>
                        <p className={styles.footnote}>Derivação do servidor: {honestText(grant.window?.derivation)}</p>
                        <p>Justificativa registrada: {honestText(grant.justification)}</p>
                        {grant.revoked_at ? (
                          <p>Revogada em {honestDateTime(grant.revoked_at)}: {honestText(grant.revoke_reason)}</p>
                        ) : (
                          <div className={styles.rowWrap}>
                            <div className={styles.field}>
                              <label htmlFor={`terceiros-revogar-${grant.id}`}>Motivo da revogação desta janela, escrito por quem opera (5 a 500 caracteres)</label>
                              <input
                                id={`terceiros-revogar-${grant.id}`}
                                value={revokeReason[grant.id] || ""}
                                onChange={event => setRevokeReason({ ...revokeReason, [grant.id]: event.target.value })}
                              />
                            </div>
                            <div className={styles.actions}>
                              <button type="button" disabled={busy} onClick={() => void revokeGrant(grant.id)}>
                                Revogar janela com motivo registrado
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Conceder acesso temporário</h3>
                  <p className={styles.hint}>
                    O término é obrigatório: a perda de acesso é derivada dele pelo servidor, nunca
                    marcada à mão. O escopo precisa estar canonicamente ligado a este terceiro.
                  </p>
                  <form onSubmit={grantAccess}>
                    <fieldset className={styles.fieldset}>
                      <legend>Janela de acesso canônica</legend>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-grant-escopo">Tipo de escopo aceito pelo servidor</label>
                          <select id="terceiros-grant-escopo" name="scope_kind" value={grantForm.scope_kind} onChange={event => setGrantForm({ ...grantForm, scope_kind: event.target.value })}>
                            {ACCESS_SCOPE_KINDS.map(value => (
                              <option key={value} value={value}>{scopeKindLabel(value)}</option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-grant-id">Identificador do contrato ou da ordem de serviço</label>
                          <input id="terceiros-grant-id" name="scope_id" required value={grantForm.scope_id} onChange={event => setGrantForm({ ...grantForm, scope_id: event.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-grant-inicio">Início do acesso</label>
                          <input id="terceiros-grant-inicio" name="access_start" type="date" required value={grantForm.access_start} onChange={event => setGrantForm({ ...grantForm, access_start: event.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-grant-fim">Término do acesso (obrigatório)</label>
                          <input id="terceiros-grant-fim" name="access_end" type="date" required value={grantForm.access_end} onChange={event => setGrantForm({ ...grantForm, access_end: event.target.value })} />
                        </div>
                        <div className={`${styles.field} ${styles.full}`}>
                          <label htmlFor="terceiros-grant-justificativa">Justificativa da concessão, escrita por quem opera (10 a 1000 caracteres)</label>
                          <textarea id="terceiros-grant-justificativa" name="justification" rows={2} value={grantForm.justification} onChange={event => setGrantForm({ ...grantForm, justification: event.target.value })} />
                        </div>
                      </div>
                    </fieldset>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Conceder acesso com término obrigatório</button>
                    </div>
                  </form>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "autorizacao" ? (
          <section {...painel("autorizacao")} data-testid="terceiros-autorizacao">
            <h2 className={styles.panelTitle}>Decisão de autorização por escopo (ponto de imposição)</h2>
            <p className={styles.hint}>
              Esta consulta é o ponto de imposição real do servidor. A tela não decide nada: ela
              pergunta, e mostra a resposta como veio. Falha de consulta é estado próprio e NUNCA
              é lida como “não autorizado”.
            </p>
            {!selectedId ? semTerceiro : (
              <>
                <form onSubmit={checkAuthorization}>
                  <fieldset className={styles.fieldset}>
                    <legend>Escopo consultado</legend>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="terceiros-check-escopo">Tipo de escopo aceito pelo servidor</label>
                        <select id="terceiros-check-escopo" name="scope_kind" value={checkForm.scope_kind} onChange={event => setCheckForm({ ...checkForm, scope_kind: event.target.value })}>
                          {ACCESS_SCOPE_KINDS.map(value => (
                            <option key={value} value={value}>{scopeKindLabel(value)}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="terceiros-check-id">Identificador do contrato ou da ordem de serviço consultada</label>
                        <input id="terceiros-check-id" name="scope_id" required value={checkForm.scope_id} onChange={event => setCheckForm({ ...checkForm, scope_id: event.target.value })} />
                      </div>
                    </div>
                  </fieldset>
                  <div className={styles.actions}>
                    <button type="submit">Consultar a decisão do servidor</button>
                  </div>
                </form>

                {decision?.phase === "loading" ? (
                  <UiState variant="loading" title="Consultando a decisão canônica…" detail="Nada é exibido antes de o servidor responder." />
                ) : null}
                {decision?.phase === "failed"
                  ? renderReadFailure(
                      decision.error,
                      () => { void runAuthorizationCheck(selectedId, checkForm.scope_kind, checkForm.scope_id); },
                      "terceiros-autorizacao-erro",
                      "Falha de consulta não é negativa de acesso: o servidor não chegou a decidir.",
                    )
                  : null}
                {decision?.phase === "ready" ? (
                  <div className={styles.card} data-testid="terceiros-decisao">
                    <p>
                      <UiBadge tone={decision.data.authorized ? "success" : "danger"} srPrefix="Decisão do servidor">
                        {decision.data.authorized ? "AUTORIZADO" : "NEGADO"}
                      </UiBadge>{" "}
                      <UiBadge tone={decisionReasonTone(decision.data.reason)} srPrefix="Motivo canônico">
                        {decisionReasonLabel(decision.data.reason)}
                      </UiBadge>
                    </p>
                    <p>Derivação declarada: {honestText(decision.data.derivation)}</p>
                    {decision.data.window ? <p>{windowSummary(decision.data.window)}</p> : null}
                    <p className={styles.footnote}>
                      Fonte: {Array.isArray(decision.data.source) && decision.data.source.length > 0 ? decision.data.source.join(" + ") : ABSENT}.
                      Data-base: {honestDate(decision.data.base_date)}.
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {active === "documentos" ? (
          <section {...painel("documentos")} data-testid="terceiros-documentos">
            <h2 className={styles.panelTitle}>Documentos, vencimento derivado e regra de antecedência</h2>
            {renderDossierState("terceiros-documentos-erro", "Isto não significa que o terceiro não tenha documento registrado.")}
            {dossierData ? (
              <>
                <p data-testid="terceiros-regra">
                  {dossierData.document_rule
                    ? `Regra de antecedência registrada: ${count(dossierData.document_rule.alert_before_days)} dia(s) — ${honestText(dossierData.document_rule.justification)}`
                    : `${documentRuleAbsenceLabel(dossierData.document_rule_absence)}. Sem regra explícita, nenhum “a vencer” é inferido: vigente e vencido continuam derivados apenas da data registrada.`}
                </p>

                {(dossierData.documents?.length ?? 0) === 0 ? (
                  <div data-testid="terceiros-documentos-vazio">
                    <UiState
                      variant="empty"
                      title="A leitura funcionou e nenhum documento canônico está registrado."
                      detail="Ausência de documento registrado não é prova de documentação em dia."
                    />
                  </div>
                ) : (
                  <ul className={styles.scrollList} data-testid="terceiros-documentos-lista">
                    {(dossierData.documents || []).map(document => (
                      <li key={document.id} className={styles.dividedItem}>
                        <p>
                          <UiBadge tone={documentExpiryTone(document.expiry?.status)} srPrefix="Situação do documento">
                            {documentExpiryLabel(document.expiry?.status)}
                          </UiBadge>{" "}
                          {honestText(document.document_type)} · número {honestText(document.document_number)}
                        </p>
                        <p>{expirySummary(document.expiry)}</p>
                        <p className={styles.footnote}>Arquivo declarado: {honestText(document.file_name)}</p>
                        {document.is_active === false ? (
                          <p>Desativado com autor e motivo: {honestText(document.deactivate_reason)}</p>
                        ) : (
                          <div className={styles.rowWrap}>
                            <div className={styles.field}>
                              <label htmlFor={`terceiros-desativar-${document.id}`}>Motivo da desativação deste documento, escrito por quem opera (5 a 500 caracteres)</label>
                              <input
                                id={`terceiros-desativar-${document.id}`}
                                value={deactivateReason[document.id] || ""}
                                onChange={event => setDeactivateReason({ ...deactivateReason, [document.id]: event.target.value })}
                              />
                            </div>
                            <div className={styles.actions}>
                              <button type="button" disabled={busy} onClick={() => void deactivateDocument(document.id)}>
                                Desativar documento com motivo registrado
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Registrar documento</h3>
                  <p className={styles.hint}>
                    Registro de metadados: esta fatia não faz upload de arquivo real, e a ausência de
                    bytes é declarada. Sem data de validade, o servidor devolve a ausência declarada e
                    nenhum vencimento é estimado.
                  </p>
                  <form onSubmit={createDocument}>
                    <fieldset className={styles.fieldset}>
                      <legend>Metadados do documento</legend>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-doc-tipo">Tipo do documento (3 a 100 caracteres)</label>
                          <input id="terceiros-doc-tipo" name="document_type" required value={documentForm.document_type} onChange={event => setDocumentForm({ ...documentForm, document_type: event.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-doc-numero">Número do documento (opcional)</label>
                          <input id="terceiros-doc-numero" name="document_number" value={documentForm.document_number} onChange={event => setDocumentForm({ ...documentForm, document_number: event.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-doc-validade">Data de validade declarada (opcional)</label>
                          <input id="terceiros-doc-validade" name="expiry_date" type="date" value={documentForm.expiry_date} onChange={event => setDocumentForm({ ...documentForm, expiry_date: event.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-doc-arquivo">Nome do arquivo (opcional, apenas metadado)</label>
                          <input id="terceiros-doc-arquivo" name="file_name" value={documentForm.file_name} onChange={event => setDocumentForm({ ...documentForm, file_name: event.target.value })} />
                        </div>
                      </div>
                    </fieldset>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Registrar documento canônico</button>
                    </div>
                  </form>
                </div>

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Registrar regra explícita de antecedência</h3>
                  <form onSubmit={createRule}>
                    <fieldset className={styles.fieldset}>
                      <legend>Regra de alerta de vencimento</legend>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-regra-dias">Antecedência do alerta, em dias</label>
                          <input id="terceiros-regra-dias" name="alert_before_days" inputMode="numeric" value={ruleForm.alert_before_days} onChange={event => setRuleForm({ ...ruleForm, alert_before_days: event.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-regra-justificativa">Justificativa da regra, escrita por quem opera (5 a 500 caracteres)</label>
                          <input id="terceiros-regra-justificativa" name="justification" value={ruleForm.justification} onChange={event => setRuleForm({ ...ruleForm, justification: event.target.value })} />
                        </div>
                      </div>
                    </fieldset>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Registrar regra de antecedência</button>
                    </div>
                  </form>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "avaliacoes" ? (
          <section {...painel("avaliacoes")} data-testid="terceiros-avaliacoes">
            <h2 className={styles.panelTitle}>Avaliações canônicas com autor, data e justificativa</h2>
            {renderDossierState("terceiros-avaliacoes-erro", "Isto não significa que o terceiro não tenha avaliação registrada, e muito menos que a nota seja zero.")}
            {dossierData ? (
              <>
                {(dossierData.evaluations?.length ?? 0) === 0 ? (
                  <div data-testid="terceiros-avaliacoes-vazio">
                    <UiState
                      variant="empty"
                      title={`A leitura funcionou e ${NO_EVALUATION.toLowerCase()}.`}
                      detail="Ausência de avaliação não é nota zero: nenhuma nota é inventada ou estimada."
                    />
                  </div>
                ) : (
                  <ul className={styles.scrollList} data-testid="terceiros-avaliacoes-lista">
                    {(dossierData.evaluations || []).map(item => (
                      <li key={item.id} className={styles.dividedItem}>
                        <p>{evaluationScoreLabel(item.score)} em {honestDate(item.evaluated_on)}</p>
                        <p>{honestText(item.justification)}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <p className={styles.footnote}>
                  {honestText(dossierData.evaluation_summary?.note)} Fonte: {honestText(dossierData.evaluation_summary?.source)}
                </p>

                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Registrar avaliação</h3>
                  <form onSubmit={createEvaluation}>
                    <fieldset className={styles.fieldset}>
                      <legend>Avaliação canônica</legend>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-aval-nota">Nota da avaliação, de 0 a 10 (obrigatória)</label>
                          <input id="terceiros-aval-nota" name="score" inputMode="numeric" required value={evaluationForm.score} onChange={event => setEvaluationForm({ ...evaluationForm, score: event.target.value })} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="terceiros-aval-data">Data da avaliação (obrigatória, até hoje pela data do servidor)</label>
                          <input id="terceiros-aval-data" name="evaluated_on" type="date" required value={evaluationForm.evaluated_on} onChange={event => setEvaluationForm({ ...evaluationForm, evaluated_on: event.target.value })} />
                        </div>
                        <div className={`${styles.field} ${styles.full}`}>
                          <label htmlFor="terceiros-aval-justificativa">Justificativa da avaliação, escrita por quem opera (10 a 1000 caracteres)</label>
                          <textarea id="terceiros-aval-justificativa" name="justification" rows={2} value={evaluationForm.justification} onChange={event => setEvaluationForm({ ...evaluationForm, justification: event.target.value })} />
                        </div>
                      </div>
                    </fieldset>
                    <div className={styles.actions}>
                      <button type="submit" disabled={busy}>Registrar avaliação canônica</button>
                    </div>
                  </form>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "eventos" ? (
          <section {...painel("eventos")} data-testid="terceiros-eventos">
            <h2 className={styles.panelTitle}>Trilha imutável de eventos canônicos</h2>
            {renderDossierState("terceiros-eventos-erro", "Isto não significa que nada tenha acontecido com este terceiro.")}
            {dossierData ? (
              (dossierData.events?.length ?? 0) === 0 ? (
                <div data-testid="terceiros-eventos-vazio">
                  <UiState
                    variant="empty"
                    title="A leitura funcionou e nenhum evento canônico está registrado."
                    detail="A trilha só recebe o que o servidor gravou na mesma transação da escrita."
                  />
                </div>
              ) : (
                <>
                  <ul className={styles.scrollList} data-testid="terceiros-eventos-lista">
                    {(dossierData.events || []).map(event => (
                      <li key={event.id} className={styles.dividedItem}>
                        <p>
                          <UiBadge tone={thirdPartyEventTone(event.event_type)} srPrefix="Evento canônico">
                            {thirdPartyEventLabel(event.event_type)}
                          </UiBadge>{" "}
                          {honestDateTime(event.created_at)}
                        </p>
                        <p>{honestText(event.summary)}</p>
                      </li>
                    ))}
                  </ul>
                  <p className={styles.footnote}>Fonte: {honestText(dossierData.source?.events)}</p>
                </>
              )
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
