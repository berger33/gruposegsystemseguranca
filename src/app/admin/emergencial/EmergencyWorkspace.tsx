"use client";

// UX-PRO-07B — leitura canônica e estados de escrita do apoio emergencial.
//
// A leitura trata os dois GET já existentes (`/api/ext/emergency/channels` e
// `.../channels/:id`) com estado honesto por recurso, seleção válida e
// habilitação das ações de ativação. A escrita (UX-PRO-07B-2) acrescenta
// estado de envio pendente, prevenção de duplo clique e reconciliação de
// resultado das cinco mutações canônicas; verbo, URL, corpo,
// `Idempotency-Key` e auditoria do servidor permanecem idênticos.

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

type EmergencyDetail = {
  channel: Channel;
  tests: Array<{ id: string; test_kind: string; is_success: boolean; tested_by_name: string }>;
  events: Array<{ id: string; event_type: string; summary: string; created_at: string }>;
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

type WriteState =
  | { phase: 'idle' }
  | { phase: 'sending'; action: WriteAction }
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

function isAuthFailure(error: EmergencyErrorDescriptor): boolean {
  return error.kind === "auth" || error.kind === "denied";
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

    const invalid = result.ok && (!result.data || typeof result.data !== "object" || !result.data.channel);
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
  const detailForId = detail.phase === "ready" || detail.phase === "failed" ? detail.forId ?? null : null;

  useEffect(() => {
    if (!selectionValid) return;
    if (detailForId === selected) return;
    void loadDetail(selected);
  }, [selectionValid, selected, detailForId, loadDetail]);

  // UX-PRO-07B-2 — uma escrita por vez nesta tela: as cinco entradas tocam a
  // mesma máquina de estado canônica do canal. A guarda síncrona (ref) bloqueia
  // o segundo clique antes do primeiro envio começar; o `disabled` mantém o
  // bloqueio até a resposta chegar. Nenhum POST extra é disparado.
  async function runWrite(action: WriteAction, send: () => Promise<void>) {
    if (sendingRef.current) return;
    sendingRef.current = action;
    setWrite({ phase: "sending", action });
    try {
      await send();
    } finally {
      sendingRef.current = null;
    }
  }

  function failWrite(action: WriteAction, error: EmergencyErrorDescriptor) {
    setWrite({ phase: "failed", action, error });
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

  async function create(e: FormEvent) {
    e.preventDefault();
    await runWrite("create", async () => {
      const result = await emergencyWrite<{ channel?: { id?: unknown }; note?: unknown }>(LIST_URL, {
        body: { ...form, escalation_steps: [{ responsible: form.escalation_responsible, contact: form.escalation_contact, wait_minutes: 5 }] },
        idempotencyKey: idem("create"),
      });
      if (!result.ok) {
        failWrite("create", result.error);
        return;
      }
      const channel = result.data?.channel;
      if (!channel || typeof channel !== "object" || typeof channel.id !== "string" || !channel.id) {
        failWrite("create", invalidEmergencyWriteResponse(result.status));
        return;
      }
      doneWrite("create", result.data.note);
      setSelected(channel.id);
      await loadChannels();
    });
  }

  async function act(action: WriteAction, path: string, body: Record<string, unknown>) {
    const id = selectionValid ? selected : "";
    if (!id) return;
    await runWrite(action, async () => {
      const result = await emergencyWrite<{ channel?: { id?: unknown }; readiness?: unknown; status?: unknown; note?: unknown }>(`${LIST_URL}/${id}${path}`, {
        body,
        idempotencyKey: idem(action),
      });
      if (!result.ok) {
        failWrite(action, result.error);
        return;
      }
      const data = result.data;
      const valid = (action === "receipt" || action === "attendance")
        ? Boolean(data && data.readiness !== null && typeof data.readiness === "object" && typeof data.status === "string")
        : Boolean(data && data.channel !== null && typeof data.channel === "object" && typeof data.channel?.id === "string" && data.channel.id);
      if (!valid) {
        failWrite(action, invalidEmergencyWriteResponse(result.status));
        return;
      }
      doneWrite(action, data.note);
      await loadChannels();
      await loadDetail(id);
    });
  }

  const field = (name: keyof typeof form, label: string) => (
    <label className={styles.field} key={name}>{label}
      <input required value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} />
    </label>
  );

  const blocked = blockedReason(channels, selectionValid);

  return <UiTaskWorkspace className={styles.workspace}>
    <p className={styles.kicker} data-testid="emergencial-kicker">EXT-15 · F11</p>
    <h1>Apoio emergencial</h1>
    <p className={styles.lede} data-testid="emergencial-lede">Configure destinatário, disponibilidade e escalonamento; depois registre separadamente testes de recebimento e atendimento. Esta tela <strong>não usa handlers legados como cobertura</strong> e não envia telefonema, WhatsApp, mensagem ou alerta externo.</p>
    <p className={`${styles.notice} ${styles.noticeWarning}`} data-testid="emergencial-limite-prova"><strong>Limite da prova:</strong> cada teste é um registro interno declarado por uma pessoa. Não comprova entrega de fornecedor nem central 24h. A ativação exige os dois registros bem-sucedidos e decisão humana.</p>
    <p className={styles.hint}>Os dados desta tela vêm sempre de uma leitura do servidor. Enquanto uma leitura não termina, nada aqui é apresentado como ausência de canal ou de trilha.</p>

    <div className={styles.layout}>
      <form className={styles.panel} onSubmit={create} aria-labelledby="emergencial-form-titulo">
        <h2 id="emergencial-form-titulo" className={styles.panelTitle}>Configurar canal interno</h2>
        <div className={styles.stack}>
          {field("name", "Nome")}
          <label className={styles.field}>Tipo<select value={form.channel_type} onChange={e => setForm({ ...form, channel_type: e.target.value })}>{["telefone", "whatsapp", "app", "botao", "outro"].map(x => <option key={x}>{x}</option>)}</select></label>
          {field("recipient_name", "Destinatário responsável")}{field("recipient_contact", "Contato declarado")}{field("availability", "Disponibilidade declarada")}{field("purpose", "Finalidade")}{field("escalation_responsible", "Responsável pelo escalonamento")}{field("escalation_contact", "Contato de escalonamento")}
        </div>
        <div className={styles.actions}><button className={local.acaoRotuloLongo} data-testid="emergencial-acao-criar" disabled={write.phase === "sending"} aria-busy={write.phase === "sending" && write.action === "create"}>Registrar rascunho</button></div>
      </form>

      <section className={styles.panel} aria-labelledby="emergencial-acoes-titulo">
        <h2 id="emergencial-acoes-titulo" className={styles.panelTitle}>Teste e ativação</h2>
        <div className={styles.stack}>
          <label className={styles.field} htmlFor="emergencial-canal">Canal selecionado
            <select
              id="emergencial-canal"
              data-testid="emergencial-canal-select"
              value={selected}
              disabled={!hasOptions}
              onChange={e => setSelected(e.target.value)}
            >
              <option value="">{hasOptions ? "Selecione" : "Nenhum canal lido"}</option>
              {hasOptions ? (channels as { phase: "ready"; data: Channel[] }).data.map(x => <option key={x.id} value={x.id}>{x.name} · {x.status}</option>) : null}
            </select>
          </label>
          {actionsEnabled ? (
            <p className={styles.hint} role="status" id="emergencial-acoes-motivo" data-testid="emergencial-acoes-liberadas">Ações liberadas: a lista foi lida às {channels.phase === "ready" ? readTime(channels.readAt) : ""} e o canal selecionado é válido.</p>
          ) : (
            <p className={styles.hint} role="status" id="emergencial-acoes-motivo" data-testid="emergencial-acoes-bloqueio">Bloqueio: {blocked}</p>
          )}
          <div className={styles.actions}>
            <button type="button" className={local.acaoRotuloLongo} data-testid="emergencial-acao-testes" disabled={!actionsEnabled || write.phase === "sending"} aria-busy={write.phase === "sending" && write.action === "testing"} aria-describedby="emergencial-acoes-motivo" onClick={() => void act("testing", "/transition", { status: "em_teste" })}>Iniciar ciclo de testes</button>
            <button type="button" className={local.acaoRotuloLongo} data-testid="emergencial-acao-recebimento" disabled={!actionsEnabled || write.phase === "sending"} aria-busy={write.phase === "sending" && write.action === "receipt"} aria-describedby="emergencial-acoes-motivo" onClick={() => void act("receipt", "/tests", { test_kind: "recebimento", result: "Recebimento declarado como conferido pelo operador interno.", evidence_note: "Conferência manual declarada na interface EXT-15, sem envio automatizado.", tested_by_name: "Operador interno", is_success: true })}>Registrar teste de recebimento bem-sucedido</button>
            <button type="button" className={local.acaoRotuloLongo} data-testid="emergencial-acao-atendimento" disabled={!actionsEnabled || write.phase === "sending"} aria-busy={write.phase === "sending" && write.action === "attendance"} aria-describedby="emergencial-acoes-motivo" onClick={() => void act("attendance", "/tests", { test_kind: "atendimento", result: "Atendimento declarado como conferido pelo operador interno.", evidence_note: "Conferência manual declarada na interface EXT-15, sem central externa.", tested_by_name: "Operador interno", is_success: true })}>Registrar teste de atendimento bem-sucedido</button>
            <button type="button" className={local.acaoRotuloLongo} data-testid="emergencial-acao-ativar" disabled={!actionsEnabled || write.phase === "sending"} aria-busy={write.phase === "sending" && write.action === "activate"} aria-describedby="emergencial-acoes-motivo" onClick={() => void act("activate", "/transition", { status: "ativo", note: "Ativação humana após conferência dos dois registros internos de teste." })}>Marcar ativo (decisão humana)</button>
          </div>
          {write.phase === "sending" ? (
            <p className={`${styles.notice} ${styles.noticeInfo}`} role="status" data-testid="emergencial-escrita-enviando">Enviando {WRITE_ACTION_NAMES[write.action]}… O resultado ainda não foi reconciliado; a lista e a trilha continuam sendo das últimas leituras concluídas.</p>
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
          <pre className={styles.codeBlock} data-testid="emergencial-detalhe-trilha">{JSON.stringify(detail.data, null, 2)}</pre>
        </>
      ) : null}
    </section>
  </UiTaskWorkspace>;
}
