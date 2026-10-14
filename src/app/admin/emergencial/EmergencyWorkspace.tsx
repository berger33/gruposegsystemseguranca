"use client";

// UX-PRO-07B — leitura canônica e estados de escrita do apoio emergencial.
//
// A leitura trata os dois GET já existentes (`/api/ext/emergency/channels` e
// `.../channels/:id`) com estado honesto por recurso, seleção válida e
// habilitação das ações de ativação. A escrita (UX-PRO-07B-2) acrescenta
// estado pendente, prevenção de duplo clique e replay manual da solicitação
// ambígua com URL, corpo e `Idempotency-Key` idênticos. A trilha continua sendo
// lida do servidor; sua apresentação legível não altera contrato nem auditoria.

import UiBadge, { type UiBadgeTone } from "@/components/ui/UiBadge";
import UiState from "@/components/ui/UiState";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import styles from "@/components/ui/UiWorkspace.module.css";
import {
  emergencyErrorDetail,
  emergencyRead,
  emergencyWrite,
  emergencyWriteErrorDetail,
  invalidEmergencyResponse,
  invalidEmergencyWriteResponse,
  type EmergencyErrorDescriptor,
} from "@/lib/emergency-request";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import local from "./EmergencyWorkspace.module.css";

type Channel = {
  id: string;
  name: string;
  channel_type: string;
  recipient_name: string;
  status: string;
  is_tested: boolean;
  activated_at?: string | null;
};

type EmergencyTest = {
  id: string;
  test_kind: string;
  result: string;
  evidence_note: string;
  tested_by_name: string;
  is_success: boolean;
  test_date?: string | null;
  created_at: string;
};

type EmergencyEvent = {
  id: string;
  event_type: string;
  summary: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

type EmergencyDetail = {
  channel: Channel;
  tests: EmergencyTest[];
  events: EmergencyEvent[];
  readiness: { receiving_ok: boolean; attendance_ok: boolean; ready: boolean };
};

type ReadState<T> =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "failed"; error: EmergencyErrorDescriptor; forId?: string }
  | {
      phase: "ready";
      data: T;
      readAt: string;
      refreshing: boolean;
      staleError?: EmergencyErrorDescriptor;
      forId?: string;
    };

type WriteAction = 'create' | 'testing' | 'receipt' | 'attendance' | 'activate';

type WriteRequest = {
  action: WriteAction;
  url: string;
  body: Record<string, unknown>;
  idempotencyKey: string;
  channelId?: string;
};

type WriteState =
  | { phase: 'idle' }
  | { phase: 'sending'; action: WriteAction; request: WriteRequest; replaying: boolean }
  | { phase: 'uncertain'; action: WriteAction; request: WriteRequest; error: EmergencyErrorDescriptor }
  | { phase: 'failed'; action: WriteAction; error: EmergencyErrorDescriptor }
  | { phase: 'done'; action: WriteAction; note: string };

const WRITE_ACTION_NAMES: Record<WriteAction, string> = {
  create: 'a configuração do canal',
  testing: 'a transição para o ciclo de testes',
  receipt: 'o teste de recebimento',
  attendance: 'o teste de atendimento',
  activate: 'a ativação',
};

const LIST_URL = "/api/ext/emergency/channels";
const CHANNEL_URL = (id: string) => `${LIST_URL}/${id}`;
const idem = (label: string) => `ext15-ui-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Valores canônicos declarados pelo servidor. A tela mostra o rótulo legível e
// mantém o valor original alcançável; nada além disso é inferido.
const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_teste: "Em teste",
  testado: "Testado",
  ativo: "Ativo",
  desativado: "Desativado",
};

const TEST_LABELS: Record<string, string> = {
  recebimento: "Teste de recebimento",
  atendimento: "Teste de atendimento",
};

const EVENT_LABELS: Record<string, string> = {
  emergency_channel_created: "Canal interno registrado",
  emergency_em_teste: "Ciclo de testes iniciado",
  emergency_test_registered: "Teste interno registrado",
  emergency_ativo: "Ativação humana registrada",
  emergency_desativado: "Canal desativado internamente",
  emergency_rascunho: "Canal retornou a rascunho",
};

function readableStatus(value: string): string {
  return STATUS_LABELS[value] || value.replaceAll("_", " ");
}

function statusTone(value: string): UiBadgeTone {
  if (value === "ativo") return "success";
  if (value === "desativado") return "danger";
  if (value === "testado") return "info";
  if (value === "em_teste") return "warning";
  return "neutral";
}

function readTime(value: string): string {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function readableDateTime(value?: string | null): string {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function readableTestKind(value: string): string {
  return TEST_LABELS[value] || `Tipo de teste: ${value.replaceAll("_", " ")}`;
}

function readableEvent(value: string): string {
  return EVENT_LABELS[value] || `Tipo de evento: ${value.replaceAll("_", " ")}`;
}

function isAuthFailure(error: EmergencyErrorDescriptor): boolean {
  return error.kind === "auth" || error.kind === "denied";
}

function isUncertainWrite(error: EmergencyErrorDescriptor): boolean {
  return error.kind === "network"
    || error.kind === "server"
    || error.code === "invalid_emergency_write_response";
}

/** Motivo explícito de bloqueio das ações que mudam estado canônico. */
function blockedReason(state: ReadState<Channel[]>, selectionValid: boolean): string {
  if (state.phase === "idle" || state.phase === "loading") {
    return "as ações só são liberadas depois que a lista de canais for lida com sucesso.";
  }
  if (state.phase === "failed") {
    const code = state.error.code ?? `HTTP ${state.error.status}`;
    if (isAuthFailure(state.error)) {
      return `a sessão não autorizou a leitura (${code}); sem leitura válida as ações de transição ficam indisponíveis.`;
    }
    return `a lista de canais não foi lida com sucesso (${code}); as ações de transição ficam indisponíveis até uma leitura concluída.`;
  }
  if (state.staleError) {
    return "a última releitura da lista falhou; o recorte exibido pode estar desatualizado e as ações de transição ficam bloqueadas até uma leitura bem-sucedida.";
  }
  if (!selectionValid) {
    return "nenhum canal lido está selecionado; escolha um canal da lista para liberar as ações de transição.";
  }
  return "";
}

export default function EmergencyWorkspace() {
  const [channels, setChannels] = useState<ReadState<Channel[]>>({ phase: "idle" });
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<ReadState<EmergencyDetail>>({ phase: "idle" });
  const [write, setWrite] = useState<WriteState>({ phase: "idle" });
  const [form, setForm] = useState({ name: "Plantão interno de apoio", channel_type: "telefone", recipient_name: "Supervisor de plantão", recipient_contact: "contato-interno-declarado", availability: "Disponibilidade declarada 24 horas por dia, sujeita a conferência humana.", purpose: "Apoio interno em ocorrências operacionais que exijam escalonamento humano.", escalation_responsible: "Gestor de plantão", escalation_contact: "contato-interno-escalacao" });

  const channelsRef = useRef(channels);
  const detailRef = useRef(detail);
  const requestIds = useRef({ list: 0, detail: 0 });
  const sendingRef = useRef<WriteAction | null>(null);

  const commitChannels = useCallback((updater: (current: ReadState<Channel[]>) => ReadState<Channel[]>) => {
    const next = updater(channelsRef.current);
    channelsRef.current = next;
    setChannels(next);
  }, []);

  const commitDetail = useCallback((updater: (current: ReadState<EmergencyDetail>) => ReadState<EmergencyDetail>) => {
    const next = updater(detailRef.current);
    detailRef.current = next;
    setDetail(next);
  }, []);

  const loadChannels = useCallback(async () => {
    const previous = channelsRef.current;
    const preserved = previous.phase === "ready" ? previous : null;
    const requestId = ++requestIds.current.list;

    commitChannels(() => preserved
      ? { ...preserved, refreshing: true, staleError: undefined }
      : { phase: "loading" });

    const result = await emergencyRead<{ items?: Channel[] }>(LIST_URL);
    if (requestIds.current.list !== requestId) return;

    if (!result.ok || !Array.isArray(result.data?.items)) {
      const failure = result.ok ? invalidEmergencyResponse(result.status) : result.error;
      if (preserved && !isAuthFailure(failure)) {
        commitChannels(() => ({ ...preserved, refreshing: false, staleError: failure }));
        return;
      }
      commitChannels(() => ({ phase: "failed", error: failure }));
      if (isAuthFailure(failure)) {
        // Falha fechada: nada de canal, seleção ou trilha protegidos continua visível.
        setSelected("");
        commitDetail(() => ({ phase: "idle" }));
      }
      return;
    }

    const items = result.data.items;
    commitChannels(() => ({ phase: "ready", data: items, readAt: new Date().toISOString(), refreshing: false }));
    setSelected(current => (current && items.some(item => item.id === current) ? current : (items[0]?.id || "")));
  }, [commitChannels, commitDetail]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      commitDetail(() => ({ phase: "idle" }));
      return;
    }
    const previous = detailRef.current;
    const preserved = previous.phase === "ready" && previous.forId === id ? previous : null;
    const requestId = ++requestIds.current.detail;

    commitDetail(() => preserved
      ? { ...preserved, refreshing: true, staleError: undefined }
      : { phase: "loading" });

    const result = await emergencyRead<EmergencyDetail>(CHANNEL_URL(id));
    if (requestIds.current.detail !== requestId) return;

    const invalid = result.ok && (
      !result.data
      || typeof result.data !== "object"
      || !result.data.channel
      || typeof result.data.channel.id !== "string"
      || result.data.channel.id !== id
      || !Array.isArray(result.data.tests)
      || !Array.isArray(result.data.events)
      || !result.data.readiness
      || typeof result.data.readiness !== "object"
      || typeof result.data.readiness.receiving_ok !== "boolean"
      || typeof result.data.readiness.attendance_ok !== "boolean"
      || typeof result.data.readiness.ready !== "boolean"
    );
    if (!result.ok || invalid) {
      const failure = result.ok ? invalidEmergencyResponse(result.status) : result.error;
      if (preserved && !isAuthFailure(failure)) {
        commitDetail(() => ({ ...preserved, refreshing: false, staleError: failure }));
        return;
      }
      commitDetail(() => ({ phase: "failed", error: failure, forId: id }));
      return;
    }

    commitDetail(() => ({
      phase: "ready",
      data: result.data,
      readAt: new Date().toISOString(),
      refreshing: false,
      forId: id,
    }));
  }, [commitDetail]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const hasOptions = channels.phase === "ready" && channels.data.length > 0;
  const selectionValid = hasOptions && channels.phase === "ready"
    && channels.data.some(item => item.id === selected);
  const actionsEnabled = channels.phase === "ready" && !channels.staleError && selectionValid;
  const writePending = write.phase === "sending";
  const writeUncertain = write.phase === "uncertain";
  const writesBlocked = writePending || writeUncertain;
  const actionsAllowed = actionsEnabled && !writesBlocked;
  const blocked = writePending
    ? "uma solicitação está sendo enviada; aguarde a resposta antes de iniciar outra escrita."
    : writeUncertain
      ? "há uma solicitação sem resultado confirmado; reconcilie a mesma solicitação antes de iniciar outra escrita."
      : blockedReason(channels, selectionValid);
  const detailForId = detail.phase === "ready" || detail.phase === "failed" ? detail.forId ?? null : null;

  useEffect(() => {
    if (!selectionValid) return;
    if (detailForId === selected) return;
    void loadDetail(selected);
  }, [selectionValid, selected, detailForId, loadDetail]);

  // A mesma solicitação é retida quando a resposta é ambígua. Uma ação explícita
  // do operador a reenvia com URL, corpo e chave idempotente originais; o servidor
  // reconcilia o resultado sem duplicar eventos ou testes.
  async function runWrite(request: WriteRequest, replaying = false) {
    if (sendingRef.current) return;
    sendingRef.current = request.action;
    setWrite({ phase: "sending", action: request.action, request, replaying });
    try {
      const result = await emergencyWrite<{
        channel?: { id?: unknown } | null;
        readiness?: unknown;
        status?: unknown;
        note?: unknown;
        test?: { id?: unknown } | null;
        detail?: {
          channel?: { id?: unknown } | null;
          tests?: unknown;
          readiness?: unknown;
        } | null;
        replayed?: unknown;
      }>(request.url, { body: request.body, idempotencyKey: request.idempotencyKey });

      if (!result.ok) {
        failWrite(request, result.error);
        return;
      }

      const data = result.data;
      const channel = data?.channel && typeof data.channel === "object" ? data.channel : null;
      const replayDetail = data?.detail && typeof data.detail === "object" ? data.detail : null;
      const replayChannel = replayDetail?.channel && typeof replayDetail.channel === "object" ? replayDetail.channel : null;
      const channelReceipt = (value: { id?: unknown } | null) => Boolean(
        value
          && typeof value.id === "string"
          && value.id
          && (!request.channelId || value.id === request.channelId),
      );
      const normalTestReceipt = Boolean(
        data?.test
          && typeof data.test.id === "string"
          && data.test.id
          && data.readiness !== null
          && typeof data.readiness === "object"
          && typeof data.status === "string",
      );
      const replayedTestReceipt = Boolean(
        data?.replayed === true
          && request.channelId
          && replayChannel?.id === request.channelId
          && Array.isArray(replayDetail?.tests)
          && replayDetail?.readiness !== null
          && typeof replayDetail?.readiness === "object",
      );
      const valid = request.action === "create"
        ? channelReceipt(channel)
        : request.action === "receipt" || request.action === "attendance"
          ? normalTestReceipt || replayedTestReceipt
          : channelReceipt(channel);

      if (!valid) {
        failWrite(request, invalidEmergencyWriteResponse(result.status));
        return;
      }

      const channelId = request.action === "create" ? String(channel?.id || "") : request.channelId || "";
      const note = data?.replayed === true
        ? `A solicitação foi confirmada com a mesma chave idempotente. ${typeof data.note === "string" ? data.note : "A lista e a trilha foram relidas."}`
        : data?.note;
      doneWrite(request.action, note);
      if (request.action === "create") setSelected(channelId);
      await loadChannels();
      if (request.action !== "create" && channelId) await loadDetail(channelId);
    } finally {
      sendingRef.current = null;
    }
  }

  function failWrite(request: WriteRequest, error: EmergencyErrorDescriptor) {
    if (isUncertainWrite(error)) {
      setWrite({ phase: "uncertain", action: request.action, request, error });
    } else {
      setWrite({ phase: "failed", action: request.action, error });
    }
    if (isAuthFailure(error)) {
      // Falha fechada: a releitura da lista (caminho existente) limpa o dado
      // protegido e apresenta a negativa sem repetição quando a sessão perdeu.
      void loadChannels();
    }
  }

  function doneWrite(action: WriteAction, note: unknown) {
    setWrite({
      phase: "done",
      action,
      note: typeof note === "string" && note ? note : "Escrita registrada internamente; a lista e a trilha foram relidas.",
    });
  }

  async function reconcileWrite() {
    if (write.phase !== "uncertain") return;
    await runWrite(write.request, true);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    await runWrite({
      action: "create",
      url: LIST_URL,
      body: { ...form, escalation_steps: [{ responsible: form.escalation_responsible, contact: form.escalation_contact, wait_minutes: 5 }] },
      idempotencyKey: idem("create"),
    });
  }

  async function act(action: WriteAction, path: string, body: Record<string, unknown>) {
    const id = selectionValid ? selected : "";
    if (!id) return;
    await runWrite({
      action,
      url: `${LIST_URL}/${id}${path}`,
      body,
      idempotencyKey: idem(action),
      channelId: id,
    });
  }

  const fieldHelp: Record<keyof typeof form, string> = {
    name: "Nome interno para localizar o canal; não é publicado fora desta tela.",
    channel_type: "Tipo declarado para o registro interno; não confirma conexão com fornecedor.",
    recipient_name: "Informe a pessoa ou função responsável pelo canal no fluxo interno.",
    recipient_contact: "Contato declarado para referência; o sistema não liga nem envia mensagem.",
    availability: "Descreva o período informado; esta tela não mede disponibilidade nem confirma cobertura.",
    purpose: "Registre a finalidade operacional interna, sem acionar um serviço externo.",
    escalation_responsible: "Pessoa ou função que deve ser procurada em um escalonamento.",
    escalation_contact: "Contato declarado do responsável; nenhuma chamada ou mensagem será enviada.",
  };

  const field = (name: keyof typeof form, label: string) => {
    const id = `emergencial-field-${name}`;
    const helpId = `${id}-help`;
    return (
      <div className={styles.field} key={name}>
        <label className={local.fieldLabel} htmlFor={id}>
          <span>{label}</span><span className={local.required} aria-hidden="true" data-testid="emergencial-obrigatorio">Obrigatório</span>
        </label>
        <input
          id={id}
          data-testid={id}
          required
          aria-describedby={helpId}
          disabled={writesBlocked}
          value={form[name]}
          onChange={e => setForm({ ...form, [name]: e.target.value })}
        />
        <span className={local.fieldHelp} id={helpId}>{fieldHelp[name]}</span>
      </div>
    );
  };


  return <UiTaskWorkspace className={styles.workspace}>
    <p className={styles.kicker} data-testid="emergencial-kicker">EXT-15 · F11</p>
    <h1>Apoio emergencial</h1>
    <p className={styles.lede} data-testid="emergencial-lede">Configure destinatário, disponibilidade e escalonamento; depois registre separadamente testes de recebimento e atendimento. Esta tela <strong>não usa handlers legados como cobertura</strong> e não envia telefonema, WhatsApp, mensagem ou alerta externo.</p>
    <p className={`${styles.notice} ${styles.noticeWarning}`} data-testid="emergencial-limite-prova"><strong>Limite da prova:</strong> cada teste é um registro interno declarado por uma pessoa. Não comprova entrega de fornecedor nem central 24h. A ativação exige os dois registros bem-sucedidos e decisão humana.</p>
    <p className={styles.hint}>Os dados desta tela vêm sempre de uma leitura do servidor. Enquanto uma leitura não termina, nada aqui é apresentado como ausência de canal ou de trilha.</p>

    <div className={styles.layout}>
      <form className={styles.panel} onSubmit={create} aria-labelledby="emergencial-form-titulo">
        <h2 id="emergencial-form-titulo" className={styles.panelTitle}>Configurar canal interno</h2>
        <p className={local.requiredNote} data-testid="emergencial-obrigatorio-nota">Todos os campos são obrigatórios. Os dados são declarados para registro interno; esta tela não aciona contatos externos.</p>
        <div className={styles.stack}>
          {field("name", "Nome")}
          <div className={styles.field}>
            <label className={local.fieldLabel} htmlFor="emergencial-field-channel_type">
              <span>Tipo</span><span className={local.required} aria-hidden="true" data-testid="emergencial-obrigatorio">Obrigatório</span>
            </label>
            <select
              id="emergencial-field-channel_type"
              data-testid="emergencial-field-channel_type"
              required
              aria-describedby="emergencial-field-channel_type-help"
              value={form.channel_type}
              disabled={writesBlocked}
              onChange={e => setForm({ ...form, channel_type: e.target.value })}
            >
              {["telefone", "whatsapp", "app", "botao", "outro"].map(x => <option key={x}>{x}</option>)}
            </select>
            <span className={local.fieldHelp} id="emergencial-field-channel_type-help">{fieldHelp.channel_type}</span>
          </div>
          {field("recipient_name", "Destinatário responsável")}
          {field("recipient_contact", "Contato declarado")}
          {field("availability", "Disponibilidade declarada")}
          {field("purpose", "Finalidade")}
          {field("escalation_responsible", "Responsável pelo escalonamento")}
          {field("escalation_contact", "Contato de escalonamento")}
        </div>
        <div className={styles.actions}>
          <button className={local.acaoRotuloLongo} data-testid="emergencial-acao-criar" disabled={writesBlocked} aria-busy={writePending && write.action === "create"}>Registrar rascunho</button>
        </div>
      </form>

      <section className={styles.panel} aria-labelledby="emergencial-acoes-titulo">
        <h2 id="emergencial-acoes-titulo" className={styles.panelTitle}>Teste e ativação</h2>
        <div className={styles.stack}>
          <label className={styles.field} htmlFor="emergencial-canal">Canal selecionado
            <select
              id="emergencial-canal"
              data-testid="emergencial-canal-select"
              value={selected}
              disabled={!hasOptions || writesBlocked}
              onChange={e => setSelected(e.target.value)}
            >
              <option value="">{hasOptions ? "Selecione" : "Nenhum canal lido"}</option>
              {hasOptions ? (channels as { phase: "ready"; data: Channel[] }).data.map(x => <option key={x.id} value={x.id}>{x.name} · {x.status}</option>) : null}
            </select>
          </label>
          {actionsAllowed ? (
            <p className={styles.hint} role="status" id="emergencial-acoes-motivo" data-testid="emergencial-acoes-liberadas">Ações liberadas: a lista foi lida às {channels.phase === "ready" ? readTime(channels.readAt) : ""} e o canal selecionado é válido.</p>
          ) : (
            <p className={styles.hint} role="status" id="emergencial-acoes-motivo" data-testid="emergencial-acoes-bloqueio">Bloqueio: {blocked}</p>
          )}
          <div className={styles.actions}>
            <button type="button" className={local.acaoRotuloLongo} data-testid="emergencial-acao-testes" disabled={!actionsAllowed} aria-busy={write.phase === "sending" && write.action === "testing"} aria-describedby="emergencial-acoes-motivo" onClick={() => void act("testing", "/transition", { status: "em_teste" })}>Iniciar ciclo de testes</button>
            <button type="button" className={local.acaoRotuloLongo} data-testid="emergencial-acao-recebimento" disabled={!actionsAllowed} aria-busy={write.phase === "sending" && write.action === "receipt"} aria-describedby="emergencial-acoes-motivo" onClick={() => void act("receipt", "/tests", { test_kind: "recebimento", result: "Recebimento declarado como conferido pelo operador interno.", evidence_note: "Conferência manual declarada na interface EXT-15, sem envio automatizado.", tested_by_name: "Operador interno", is_success: true })}>Registrar teste de recebimento bem-sucedido</button>
            <button type="button" className={local.acaoRotuloLongo} data-testid="emergencial-acao-atendimento" disabled={!actionsAllowed} aria-busy={write.phase === "sending" && write.action === "attendance"} aria-describedby="emergencial-acoes-motivo" onClick={() => void act("attendance", "/tests", { test_kind: "atendimento", result: "Atendimento declarado como conferido pelo operador interno.", evidence_note: "Conferência manual declarada na interface EXT-15, sem central externa.", tested_by_name: "Operador interno", is_success: true })}>Registrar teste de atendimento bem-sucedido</button>
            <button type="button" className={local.acaoRotuloLongo} data-testid="emergencial-acao-ativar" disabled={!actionsAllowed} aria-busy={write.phase === "sending" && write.action === "activate"} aria-describedby="emergencial-acoes-motivo" onClick={() => void act("activate", "/transition", { status: "ativo", note: "Ativação humana após conferência dos dois registros internos de teste." })}>Marcar ativo (decisão humana)</button>
          </div>
          {write.phase === "sending" ? (
            <p className={`${styles.notice} ${styles.noticeInfo}`} role="status" data-testid="emergencial-escrita-enviando">{write.replaying ? "Reenviando" : "Enviando"} {WRITE_ACTION_NAMES[write.action]}… O resultado ainda não foi confirmado; a lista e a trilha continuam sendo das últimas leituras concluídas.</p>
          ) : null}
          {write.phase === "uncertain" ? (
            <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert" data-testid="emergencial-escrita-incerta">
              <strong>{write.error.title}</strong>
              <p>{emergencyWriteErrorDetail(write.error)} A tela não repete a escrita automaticamente. “Reconciliar solicitação” reenvia exatamente a solicitação armazenada com a mesma URL, o mesmo corpo e a mesma chave idempotente para confirmar o resultado sem criar um registro duplicado. Não inicie outra escrita até a confirmação.</p>
              <div className={styles.actions}>
                <button type="button" data-testid="emergencial-escrita-reconciliar" disabled={writePending} onClick={() => void reconcileWrite()}>Reconciliar solicitação</button>
              </div>
            </div>
          ) : null}
          {write.phase === "failed" ? (
            <div className={`${styles.notice} ${styles.noticeError}`} role="alert" data-testid="emergencial-escrita-erro">
              <strong>{write.error.title}</strong>
              <p>{emergencyWriteErrorDetail(write.error)}</p>
            </div>
          ) : null}
          {write.phase === "done" ? (
            <p className={`${styles.notice} ${styles.noticeInfo}`} role="status" data-testid="emergencial-escrita-mensagem">{write.note}</p>
          ) : null}
        </div>
      </section>
    </div>

    <section className={styles.panel} aria-labelledby="emergencial-lista-titulo" data-testid="emergencial-lista">
      <div className={styles.rowWrap}>
        <div className={styles.grow}>
          <h2 id="emergencial-lista-titulo" className={styles.panelTitle}>Canais canônicos</h2>
          <p className={styles.hint}>{channels.phase === "ready"
            ? `Última leitura concluída às ${readTime(channels.readAt)}.`
            : "Os canais só aparecem depois de uma resposta válida do servidor."}</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            data-testid="emergencial-lista-atualizar"
            disabled={channels.phase === "idle" || channels.phase === "loading" || (channels.phase === "ready" && channels.refreshing)}
            onClick={() => void loadChannels()}
          >
            {channels.phase === "ready" && channels.refreshing ? "Atualizando…" : "Atualizar lista"}
          </button>
        </div>
      </div>

      {channels.phase === "idle" || channels.phase === "loading" ? (
        <div data-testid="emergencial-lista-carregando">
          <UiState variant="loading" title="Lendo os canais canônicos de apoio emergencial…" detail="Aguarde a resposta do servidor; nenhum canal, total ou disponibilidade externa é presumido durante a leitura." />
        </div>
      ) : null}

      {channels.phase === "failed" ? (
        <div data-testid={isAuthFailure(channels.error) ? "emergencial-lista-negado" : "emergencial-lista-falha"}>
          <UiState
            variant={isAuthFailure(channels.error) ? "denied" : "error"}
            title={channels.error.title}
            detail={emergencyErrorDetail(channels.error)}
            onRetry={channels.error.canRetry ? () => void loadChannels() : undefined}
          />
        </div>
      ) : null}

      {channels.phase === "ready" ? (
        <>
          {channels.refreshing ? (
            <p className={`${styles.notice} ${styles.noticeInfo}`} role="status" data-testid="emergencial-lista-atualizando">Atualizando a lista. O conteúdo abaixo continua sendo o da última leitura concluída às {readTime(channels.readAt)}.</p>
          ) : null}
          {channels.staleError ? (
            <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert" data-testid="emergencial-lista-desatualizado">
              <strong>Não foi possível atualizar a lista de canais.</strong>
              <p>{emergencyErrorDetail(channels.staleError)} A lista abaixo é da última leitura concluída às {readTime(channels.readAt)} e pode estar desatualizada; as ações de transição ficam bloqueadas até uma leitura bem-sucedida.</p>
              {channels.staleError.canRetry ? (
                <div className={styles.actions}><button type="button" onClick={() => void loadChannels()}>Tentar novamente</button></div>
              ) : null}
            </div>
          ) : null}
          {channels.data.length === 0 ? (
            <div data-testid="emergencial-lista-vazio">
              <UiState variant="empty" title="A consulta foi concluída e nenhum canal canônico está configurado." detail="Nenhum canal é criado automaticamente e nenhum contato externo é presumido. Registre um canal no formulário desta tela e faça os dois testes declarados antes de ativar." />
            </div>
          ) : (
            <div className={styles.cards} data-testid="emergencial-lista-canais">
              {channels.data.map(item => (
                <article className={styles.card} key={item.id}>
                  <h3 className={styles.cardTitle}>{item.name}</h3>
                  <dl className={styles.facts}>
                    <div><dt>Tipo declarado</dt><dd>{item.channel_type}</dd></div>
                    <div><dt>Situação canônica</dt><dd><UiBadge tone={statusTone(item.status)} srPrefix="Situação do canal">{readableStatus(item.status)}</UiBadge></dd></div>
                    <div><dt>Destinatário</dt><dd>{item.recipient_name}</dd></div>
                    <div><dt>Testes internos completos</dt><dd>{item.is_tested ? "sim" : "não"}</dd></div>
                    <div><dt>Ativação humana</dt><dd>{item.activated_at ? "registrada" : "pendente"}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>

    <section className={styles.panel} aria-labelledby="emergencial-detalhe-titulo" data-testid="emergencial-detalhe">
      <div className={styles.rowWrap}>
        <div className={styles.grow}>
          <h2 id="emergencial-detalhe-titulo" className={styles.panelTitle}>Trilha interna</h2>
          <p className={styles.hint}>{detail.phase === "ready"
            ? `Última leitura da trilha concluída às ${readTime(detail.readAt)}.`
            : "A trilha é o registro interno do canal selecionado; ela só aparece depois de uma resposta válida do servidor."}</p>
        </div>
        <div className={styles.actions}>
          <button type="button" data-testid="emergencial-detalhe-atualizar" disabled={!selectionValid || (detail.phase === "ready" && detail.refreshing)} onClick={() => void loadDetail(selected)}>Atualizar trilha</button>
        </div>
      </div>

      {!selectionValid ? (
        <p className={styles.hint} data-testid="emergencial-detalhe-sem-selecao">Selecione um canal lido com sucesso para ver a trilha interna. Nada de trilha é exibido enquanto não existir seleção válida.</p>
      ) : null}

      {selectionValid && (detail.phase === "idle" || detail.phase === "loading") ? (
        <div data-testid="emergencial-detalhe-carregando">
          <UiState variant="loading" title="Lendo a trilha interna do canal selecionado…" detail="Aguarde a resposta do servidor; a trilha não é presumida a partir da lista." />
        </div>
      ) : null}

      {selectionValid && detail.phase === "failed" ? (
        <div data-testid={isAuthFailure(detail.error) ? "emergencial-detalhe-negado" : "emergencial-detalhe-falha"}>
          <UiState
            variant={isAuthFailure(detail.error) ? "denied" : "error"}
            title={detail.error.title}
            detail={emergencyErrorDetail(detail.error)}
            onRetry={detail.error.canRetry ? () => void loadDetail(selected) : undefined}
          />
        </div>
      ) : null}

      {selectionValid && detail.phase === "ready" ? (
        <>
          {detail.refreshing ? (
            <p className={`${styles.notice} ${styles.noticeInfo}`} role="status" data-testid="emergencial-detalhe-atualizando">Atualizando a trilha. O conteúdo abaixo continua sendo o da última leitura concluída às {readTime(detail.readAt)}.</p>
          ) : null}
          {detail.staleError ? (
            <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert" data-testid="emergencial-detalhe-desatualizado">
              <strong>Não foi possível atualizar a trilha deste canal.</strong>
              <p>{emergencyErrorDetail(detail.staleError)} A trilha abaixo é da última leitura concluída às {readTime(detail.readAt)} e pode estar desatualizada.</p>
              {detail.staleError.canRetry ? (
                <div className={styles.actions}><button type="button" onClick={() => void loadDetail(selected)}>Tentar novamente</button></div>
              ) : null}
            </div>
          ) : null}
          <div className={local.trail} data-testid="emergencial-detalhe-trilha" data-channel-id={detail.data.channel.id}>
            <div className={local.trailOverview}>
              <div className={local.trailHeading}>
                <div>
                  <h3 className={styles.cardTitle}>{detail.data.channel.name}</h3>
                  <p className={styles.hint}>Situação atual: <strong>{readableStatus(detail.data.channel.status)}</strong>.</p>
                </div>
                <time dateTime={detail.readAt}>Última leitura concluída às {readTime(detail.readAt)}.</time>
              </div>
              <h3 className={styles.panelTitle} id="emergencial-prontidao-titulo">Resumo da prontidão interna</h3>
              <dl className={local.readiness} aria-labelledby="emergencial-prontidao-titulo">
                <div><dt>Teste de recebimento</dt><dd>{detail.data.readiness.receiving_ok ? "Sucesso interno declarado" : "Pendente — nenhum sucesso interno foi lido"}</dd></div>
                <div><dt>Teste de atendimento</dt><dd>{detail.data.readiness.attendance_ok ? "Sucesso interno declarado" : "Pendente — nenhum sucesso interno foi lido"}</dd></div>
                <div><dt>Prontidão interna</dt><dd>{detail.data.readiness.ready ? "Os dois sucessos internos foram registrados" : "Ainda falta um ou mais registros internos bem-sucedidos"}</dd></div>
              </dl>
              <p className={local.boundary} data-testid="emergencial-trilha-limite">Este resumo reflete somente registros internos declarados. Não comprova entrega por fornecedor, disponibilidade externa nem acionamento de contato.</p>
            </div>

            <section className={local.trailSection} aria-labelledby="emergencial-testes-titulo">
              <h3 className={styles.panelTitle} id="emergencial-testes-titulo">Testes declarados ({detail.data.tests.length})</h3>
              {detail.data.tests.length ? (
                <ol className={local.trailList}>
                  {detail.data.tests.slice().reverse().map(item => (
                    <li className={local.trailItem} key={item.id}>
                      <div className={local.trailHeading}>
                        <strong>{readableTestKind(item.test_kind)}</strong>
                        <span className={item.is_success ? local.resultSuccess : local.resultFailure} data-testid="emergencial-teste-sucesso">{item.is_success ? "Sucesso declarado" : "Falha declarada"}</span>
                      </div>
                      <p>{item.result}</p>
                      <dl className={local.trailMeta}>
                        <div><dt>Responsável pelo registro</dt><dd>{item.tested_by_name}</dd></div>
                        <div><dt>Data do teste declarada</dt><dd>{readableDateTime(item.test_date || item.created_at)}</dd></div>
                        <div><dt>Observação declarada</dt><dd>{item.evidence_note}</dd></div>
                        <div><dt>Registro interno</dt><dd><time dateTime={item.created_at}>{readableDateTime(item.created_at)}</time></dd></div>
                      </dl>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.hint} data-testid="emergencial-testes-vazios">Nenhum teste interno foi lido para este canal.</p>
              )}
            </section>

            <section className={local.trailSection} aria-labelledby="emergencial-eventos-titulo">
              <h3 className={styles.panelTitle} id="emergencial-eventos-titulo">Eventos internos ({detail.data.events.length})</h3>
              {detail.data.events.length ? (
                <ol className={local.trailList}>
                  {detail.data.events.slice().reverse().map(item => {
                    const boundary = typeof item.payload?.boundary === "string" ? item.payload.boundary : "";
                    return (
                      <li className={local.trailItem} key={item.id}>
                        <div className={local.trailHeading}>
                          <strong>{readableEvent(item.event_type)}</strong>
                          <time dateTime={item.created_at}>{readableDateTime(item.created_at)}</time>
                        </div>
                        <p>{item.summary}</p>
                        {boundary ? <p className={local.boundary}>{boundary}</p> : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className={styles.hint} data-testid="emergencial-eventos-vazios">Nenhum evento interno foi lido para este canal.</p>
              )}
            </section>

            <details className={local.technical} data-testid="emergencial-detalhe-tecnico">
              <summary>Ver dados técnicos do servidor (JSON)</summary>
              <p className={styles.hint}>Resposta original preservada para inspeção técnica; permanece recolhida para não substituir o resumo operacional.</p>
              <pre className={styles.codeBlock} data-testid="emergencial-detalhe-json">{JSON.stringify(detail.data, null, 2)}</pre>
            </details>
          </div>
        </>
      ) : null}
    </section>
  </UiTaskWorkspace>;
}
