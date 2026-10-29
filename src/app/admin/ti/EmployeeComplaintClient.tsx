"use client";

// Canal administrativo restrito. A tela preserva as ações do protótipo e não
// altera o canal autenticado do cliente nem o papel legítimo do RH na API.
import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./EmployeeComplaintClient.module.css";

type Row = Record<string, unknown>;
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };
type DetailState = { kind: "idle" } | ReadState;
type ComplaintDetail = { complaint: Row; messages: Row[]; evidences: Row[]; history: Row[]; hrShares: Row[] };

const ENDPOINTS = {
  complaints: "/api/admin/employee-complaints",
  detail: "/api/admin/employee-complaints/",
  messages: "/api/admin/employee-complaint-messages",
  evidences: "/api/admin/employee-complaint-evidences",
  shares: "/api/admin/employee-complaint-hr-shares",
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEW_COMPLAINT = { client_account_id: "", contract_id: "", contact_id: "", employee_id: "", employee_reference: "", category: "outro", severity: "media", title: "", description: "", is_anonymous: false };
const NEW_MESSAGE = { complaint_id: "", message: "", sender_type: "cliente", is_internal: false, is_hr_visible: false };
const NEW_EVIDENCE = { complaint_id: "", file_name: "", file_url: "", storage_key: "", is_hr_visible: false };
const NEW_SHARE = { complaint_id: "", shared_field: "category", shared_value: "", justification: "" };

const ERROR_LABELS: Record<string, string> = {
  forbidden: "A solicitação precisa partir deste site. Recarregue a página e tente novamente.",
  unauthorized: "A sessão não tem acesso a esta operação. Entre novamente com uma conta autorizada.",
  forbidden_restricted_channel: "Este canal é restrito a pessoas autorizadas. Nenhum relato foi exibido.",
  missing_id: "Selecione uma reclamação antes de atualizar a situação.",
  missing_complaint_id: "Informe o identificador da reclamação para esta operação.",
  invalid_title: "O título precisa ter entre 5 e 200 caracteres.",
  invalid_description: "A descrição precisa ter entre 20 e 5000 caracteres.",
  invalid_category: "Escolha uma categoria aceita pelo servidor.",
  invalid_severity: "Escolha uma severidade aceita pelo servidor.",
  invalid_employee_reference: "A referência do colaborador precisa ter entre 3 e 200 caracteres ou ficar vazia.",
  invalid_reason: "O motivo precisa ter entre 10 e 1000 caracteres.",
  invalid_status: "A situação selecionada não é aceita pelo servidor.",
  invalid_message: "A mensagem precisa ter entre 10 e 5000 caracteres.",
  invalid_sender_type: "Escolha um tipo de remetente aceito pelo servidor.",
  rh_only: "O tipo de remetente RH exige um papel autorizado pelo servidor.",
  hr_share_requires_role: "A visibilidade para o RH exige um papel autorizado pelo servidor.",
  invalid_file_name: "O nome da evidência precisa ter entre 1 e 500 caracteres.",
  invalid_file_url: "A referência de endereço precisa ter entre 5 e 1000 caracteres.",
  invalid_storage_key: "A chave de armazenamento precisa ter entre 5 e 500 caracteres.",
  duplicate_storage_key: "Esta chave de armazenamento já foi registrada. Informe outra chave.",
  invalid_shared_field: "O campo compartilhado é inválido.",
  invalid_shared_value: "O valor compartilhado precisa ter entre 1 e 1000 caracteres.",
  invalid_justification: "A justificativa precisa ter entre 10 e 1000 caracteres.",
  field_not_allowed_minimal_share: "Escolha um dos campos permitidos para compartilhamento mínimo.",
  complaint_not_found: "A reclamação não foi encontrada. Releia a lista antes de tentar novamente.",
  not_found: "A reclamação não foi encontrada. Releia a lista antes de tentar novamente.",
  method_not_allowed: "O servidor não aceita esta operação para o recurso solicitado.",
  internal_error: "O servidor não conseguiu concluir a operação. Confira os identificadores e tente novamente.",
  internal: "O servidor não conseguiu concluir a operação. Confira os identificadores e tente novamente.",
};
function translate(code: unknown, status?: number) {
  const key = typeof code === "string" ? code : "";
  if (ERROR_LABELS[key]) return ERROR_LABELS[key];
  if (status === 401 || status === 403) return ERROR_LABELS.forbidden_restricted_channel;
  if (status && status >= 500) return "O serviço está indisponível. Tente novamente em instantes.";
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}
function isRow(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function records(value: unknown): Row[] | null {
  if (!Array.isArray(value) || !value.every(isRow)) return null;
  return value;
}
const text = (value: unknown) => typeof value === "string" ? value : "";
const yesNo = (value: unknown) => value === true ? "sim" : "não";

// DATE não é um instante: preservar o dia escrito antes de usar fuso local.
function parseDateOnly(value: unknown) {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.valueOf()) ? null : date;
}
function dateOnly(value: unknown) {
  return parseDateOnly(value)?.toLocaleDateString("pt-BR") || "Não informado";
}
function dateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "Não informada";
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? "Data indisponível" : date.toLocaleString("pt-BR");
}
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { id, "aria-describedby": helpId }) : children;
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{control}{help && <small id={helpId}>{help}</small>}</div>;
}
function CheckField({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (value: boolean) => void; help?: string }) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  return <div className={styles.checkField}><label htmlFor={id}><input id={id} type="checkbox" checked={checked} aria-describedby={helpId} onChange={event => onChange(event.target.checked)} />{label}</label>{help && <small id={helpId}>{help}</small>}</div>;
}
async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const payload: unknown = await response.json().catch(() => null);
  return { response, data: isRow(payload) ? payload : {} };
}
function parseDetail(data: Row, expectedId: string): ComplaintDetail | null {
  const messages = records(data.messages);
  const evidences = records(data.evidences);
  const history = records(data.history);
  const hrShares = records(data.hr_shares);
  if (!isRow(data.complaint) || text(data.complaint.id) !== expectedId || !messages || !evidences || !history || !hrShares) return null;
  return { complaint: data.complaint, messages, evidences, history, hrShares };
}

export default function EmployeeComplaintClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [items, setItems] = useState<Row[]>([]);
  const [lastRead, setLastRead] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [form, setForm] = useState(NEW_COMPLAINT);
  const [messageForm, setMessageForm] = useState(NEW_MESSAGE);
  const [evidenceForm, setEvidenceForm] = useState(NEW_EVIDENCE);
  const [shareForm, setShareForm] = useState(NEW_SHARE);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const operationSequence = useRef(0);
  const operationInFlight = useRef(false);

  const resetDetail = useCallback(() => {
    detailSequence.current += 1;
    setSelectedId(null); setDetail(null); setDetailState({ kind: "idle" });
    setMessageForm(NEW_MESSAGE); setEvidenceForm(NEW_EVIDENCE); setShareForm(NEW_SHARE);
  }, []);

  const loadList = useCallback(async (clearFeedback = true): Promise<Row[] | null> => {
    const current = ++listSequence.current;
    resetDetail();
    setItems([]); setLastRead(""); setReadState({ kind: "loading" });
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    try {
      const { response, data } = await requestJson(ENDPOINTS.complaints);
      if (current !== listSequence.current) return null;
      if (response.status === 401 || response.status === 403) { setReadState({ kind: "denied" }); return null; }
      if (!response.ok) { setReadState({ kind: "error", detail: translate(data.error, response.status) }); return null; }
      const rows = records(data.items);
      if (!rows || rows.some(row => !text(row.id))) {
        setReadState({ kind: "error", detail: "O serviço devolveu um payload inválido. Tente consultar novamente." }); return null;
      }
      setItems(rows); setLastRead(new Date().toISOString()); setReadState({ kind: "ready" });
      return rows;
    } catch {
      if (current === listSequence.current) setReadState({ kind: "error", detail: "Falha de rede ao consultar as reclamações. Verifique a conexão e tente novamente." });
      return null;
    }
  }, [resetDetail]);

  const openDetail = useCallback(async (id: string, clearFeedback = true) => {
    const current = ++detailSequence.current;
    setSelectedId(id); setDetail(null); setDetailState({ kind: "loading" });
    setMessageForm(NEW_MESSAGE); setEvidenceForm(NEW_EVIDENCE); setShareForm(NEW_SHARE);
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    try {
      const { response, data } = await requestJson(`${ENDPOINTS.detail}${encodeURIComponent(id)}`);
      if (current !== detailSequence.current) return;
      if (response.status === 401 || response.status === 403) { setDetailState({ kind: "denied" }); return; }
      if (!response.ok) { setDetailState({ kind: "error", detail: translate(data.error, response.status) }); return; }
      const parsed = parseDetail(data, id);
      if (!parsed) { setDetailState({ kind: "error", detail: "O serviço devolveu um payload inválido para o detalhe. Tente novamente." }); return; }
      setDetail(parsed); setDetailState({ kind: "ready" });
    } catch {
      if (current === detailSequence.current) setDetailState({ kind: "error", detail: "Falha de rede ao consultar o detalhe. Tente novamente." });
    }
  }, []);

  useEffect(() => {
    void loadList();
    return () => { listSequence.current += 1; detailSequence.current += 1; operationSequence.current += 1; };
  }, [loadList]);

  async function mutate(path: string, method: "POST" | "PATCH", body: Row, success: string, targetId?: string, afterSuccess?: () => void) {
    if (operationInFlight.current) return;
    const current = ++operationSequence.current;
    operationInFlight.current = true; setBusy(true); setMessage(""); setOperationError("");
    try {
      const { response, data } = await requestJson(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (current !== operationSequence.current) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          listSequence.current += 1; setItems([]); setLastRead(""); resetDetail(); setReadState({ kind: "denied" });
        }
        setOperationError(translate(data.error, response.status)); return;
      }
      if (!text(data.id)) { setOperationError("O servidor não confirmou o registro. Releia a lista antes de repetir a operação."); return; }
      afterSuccess?.();
      setMessage(success);
      const rows = await loadList(false);
      if (current !== operationSequence.current) return;
      if (targetId && rows?.some(row => text(row.id) === targetId)) await openDetail(targetId, false);
    } catch {
      if (current === operationSequence.current) setOperationError("Falha de rede. Confira a lista antes de repetir a operação: o servidor pode ter recebido o pedido.");
    } finally {
      if (current === operationSequence.current) { operationInFlight.current = false; setBusy(false); }
    }
  }

  function target(value: string) {
    const id = (value || selectedId || "").trim();
    if (!UUID.test(id)) { setMessage(""); setOperationError("Informe um identificador de reclamação válido antes de continuar."); return null; }
    return id;
  }
  function submitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (const value of [form.client_account_id, form.contract_id, form.contact_id, form.employee_id]) {
      if (value.trim() && !UUID.test(value.trim())) { setOperationError("Os identificadores opcionais precisam ser UUIDs válidos ou ficar vazios."); return; }
    }
    void mutate(ENDPOINTS.complaints, "POST", form, "Reclamação registrada no canal restrito.", undefined, () => setForm(NEW_COMPLAINT));
  }
  function updateStatus(id: string, status: "em_analise" | "resolvida") {
    const reason = status === "em_analise" ? "Análise inicial reclamação canal restrito responsável definido" : "Resolução reclamação colaborador canal restrito ação corretiva definida";
    void mutate(ENDPOINTS.complaints, "PATCH", { id, status, reason }, status === "em_analise" ? "Reclamação marcada em análise." : "Reclamação marcada como resolvida.", id);
  }
  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const id = target(messageForm.complaint_id); if (!id) return;
    void mutate(ENDPOINTS.messages, "POST", { ...messageForm, complaint_id: id }, "Mensagem restrita registrada.", id);
  }
  function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const id = target(evidenceForm.complaint_id); if (!id) return;
    void mutate(ENDPOINTS.evidences, "POST", { ...evidenceForm, complaint_id: id }, "Referência de evidência registrada.", id);
  }
  function submitShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const id = target(shareForm.complaint_id); if (!id) return;
    void mutate(ENDPOINTS.shares, "POST", { ...shareForm, complaint_id: id }, "Compartilhamento mínimo com RH registrado.", id);
  }

  return <section className={styles.workspace} aria-labelledby="complaint-title" aria-busy={readState.kind === "loading" || busy}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Canal restrito</p><h2 id="complaint-title">Reclamações de colaboradores</h2>
        <p>Registre e acompanhe relatos, mensagens, referências de evidência e o compartilhamento mínimo justificado com o RH.</p></div>
      <button type="button" disabled={busy} onClick={() => void loadList()}>Atualizar reclamações</button>
    </header>
    <p className={styles.source}><strong>Fonte:</strong> registros administrativos de reclamações, mensagens, evidências, histórico e compartilhamentos. <strong>Data-base:</strong> {lastRead ? dateTime(lastRead) : "leitura ainda não concluída"}.</p>
    <aside className={styles.limit} aria-label="Limites do canal">
      <strong>Limites e privacidade:</strong> a leitura administrativa é global e não filtra automaticamente por conta. A referência do colaborador é armazenada em texto claro e também em hash; marcar anonimato não anonimiza o registro.
      Esta tela não faz upload ou verificação de arquivos: endereço e chave são referências declaradas. RH não tem acesso a este console de TI; na lista e no detalhe de relatos, a API do RH exige compartilhamento e oferece projeção mínima. As consultas separadas de mensagens e evidências usam a visibilidade própria de cada item.
      A atualização de situação pelo RH permanece com falha e depende de decisão sobre autorização e resposta. A auditoria administrativa é tentativa, não garantia transacional. Não substitui parecer jurídico, revisão de privacidade ou aceite humano. Produção: <strong>NO-GO</strong>.
    </aside>
    {message && <p className={styles.success} role="status">{message}</p>}
    {operationError && <p className={styles.error} role="alert">{operationError}</p>}
    {busy && <p role="status">Operação em andamento. Aguarde a confirmação do servidor.</p>}

    <div className={styles.split}>
      <section className={styles.panel} aria-labelledby="complaint-list-title">
        <div className={styles.sectionHeading}><div><h3 id="complaint-list-title">Fila restrita</h3><p>Até 200 reclamações, conforme a leitura administrativa existente.</p></div><span className={styles.count}>{items.length} registro(s)</span></div>
        {readState.kind === "loading" && <UiState variant="loading" title="Consultando reclamações" />}
        {readState.kind === "denied" && <UiState variant="denied" title="Acesso não autorizado" detail="Nenhum relato foi exibido." onRetry={() => void loadList()} />}
        {readState.kind === "error" && <UiState variant="error" title="Não foi possível consultar as reclamações" detail={readState.detail} onRetry={() => void loadList()} />}
        {readState.kind === "ready" && items.length === 0 && <UiState variant="empty" title="Nenhuma reclamação encontrada" detail="A leitura foi concluída e não retornou registros." />}
        {readState.kind === "ready" && items.length > 0 && <ul className={styles.recordList}>{items.map(item => {
          const id = text(item.id);
          return <li key={id} aria-current={selectedId === id ? "true" : undefined}>
            <strong>{text(item.protocol)} · {text(item.title)}</strong>
            <span>Categoria: {text(item.category)} · Severidade: {text(item.severity)} · Situação: {text(item.status)}</span>
            <span>Restrito: {yesNo(item.is_restricted)} · Compartilhamento mínimo: {yesNo(item.minimal_share)} · Compartilhado com RH: {yesNo(item.is_shared_with_hr)}</span>
            <div className={styles.actions}>
              <button type="button" disabled={busy} onClick={() => void openDetail(id)}>Ver detalhes</button>
              <button type="button" disabled={busy} onClick={() => updateStatus(id, "em_analise")}>Em análise</button>
              <button type="button" disabled={busy} onClick={() => updateStatus(id, "resolvida")}>Resolver</button>
            </div>
          </li>;
        })}</ul>}
      </section>
      <section className={styles.panel} aria-labelledby="complaint-detail-title" aria-busy={detailState.kind === "loading"}>
        <div className={styles.sectionHeading}><div><h3 id="complaint-detail-title">Detalhe da reclamação</h3><p>Selecione uma reclamação da fila. A troca descarta o detalhe e os rascunhos anteriores.</p></div></div>
        {detailState.kind === "idle" && <p className={styles.note}>Nenhuma reclamação selecionada.</p>}
        {detailState.kind === "loading" && <UiState variant="loading" title="Consultando detalhe" />}
        {detailState.kind === "denied" && <UiState variant="denied" title="Detalhe não autorizado" detail="Nenhum detalhe foi exibido." onRetry={() => { if (selectedId) void openDetail(selectedId); }} />}
        {detailState.kind === "error" && <UiState variant="error" title="Não foi possível consultar o detalhe" detail={detailState.detail} onRetry={() => { if (selectedId) void openDetail(selectedId); }} />}
        {detailState.kind === "ready" && detail && <>
          <div className={styles.detailSummary}>
            <strong>{text(detail.complaint.protocol)} · {text(detail.complaint.title)}</strong>
            <p>Situação: {text(detail.complaint.status)} · Categoria: {text(detail.complaint.category)} · Severidade: {text(detail.complaint.severity)}</p>
            <p>Restrito: {yesNo(detail.complaint.is_restricted)} · Compartilhamento mínimo: {yesNo(detail.complaint.minimal_share)} · Prazo: {dateOnly(detail.complaint.due_date)}</p>
            <p>Descrição: {text(detail.complaint.description)}</p>
          </div>
          <section aria-labelledby="complaint-messages-title"><h4 id="complaint-messages-title">Mensagens ({detail.messages.length})</h4>
            {detail.messages.length === 0 ? <p className={styles.note}>Nenhuma mensagem registrada.</p> : <ul className={styles.historyList}>{detail.messages.map((item, index) => <li key={text(item.id) || index}>{text(item.sender_type)} · {text(item.sender_name)} · interna: {yesNo(item.is_internal)} · restrita: {yesNo(item.is_restricted)} · visível ao RH: {yesNo(item.is_hr_visible)}<br />{text(item.message)}</li>)}</ul>}
          </section>
          <section aria-labelledby="complaint-evidence-title"><h4 id="complaint-evidence-title">Referências de evidência ({detail.evidences.length})</h4>
            {detail.evidences.length === 0 ? <p className={styles.note}>Nenhuma referência registrada.</p> : <ul className={styles.historyList}>{detail.evidences.map((item, index) => <li key={text(item.id) || index}>{text(item.file_name)} · endereço: {text(item.file_url)} · chave: {text(item.storage_key)} · restrita: {yesNo(item.is_restricted)} · visível ao RH: {yesNo(item.is_hr_visible)}</li>)}</ul>}
          </section>
          <section aria-labelledby="complaint-history-title"><h4 id="complaint-history-title">Histórico ({detail.history.length})</h4>
            {detail.history.length === 0 ? <p className={styles.note}>Nenhuma alteração registrada.</p> : <ul className={styles.historyList}>{detail.history.map((item, index) => <li key={text(item.id) || index}>{text(item.previous_status) || "início"} → {text(item.next_status)} · compartilhamento RH: {yesNo(item.is_hr_share)} · {dateTime(item.created_at)}<br />{text(item.reason)} · {text(item.changed_by_name)}</li>)}</ul>}
          </section>
          <section aria-labelledby="complaint-shares-title"><h4 id="complaint-shares-title">Compartilhamentos com RH ({detail.hrShares.length})</h4>
            {detail.hrShares.length === 0 ? <p className={styles.note}>Nenhum compartilhamento registrado.</p> : <ul className={styles.historyList}>{detail.hrShares.map((item, index) => <li key={text(item.id) || index}>{text(item.shared_field)}: {text(item.shared_value)} · justificativa: {text(item.justification)} · {text(item.shared_by_name)} · {dateTime(item.shared_at)}</li>)}</ul>}
          </section>
          <details className={styles.subsection}><summary>Registrar mensagem restrita</summary><form onSubmit={submitMessage} noValidate><fieldset disabled={busy} className={styles.formGrid}>
            <Field label="Identificador da reclamação para mensagem" help="Por padrão, usa o item selecionado; é possível informar outro identificador."><input value={messageForm.complaint_id || selectedId || ""} onChange={event => setMessageForm({ ...messageForm, complaint_id: event.target.value })} /></Field>
            <Field label="Tipo de remetente"><select value={messageForm.sender_type} onChange={event => setMessageForm({ ...messageForm, sender_type: event.target.value })}><option value="cliente">Cliente</option><option value="rh">RH</option><option value="compliance">Compliance</option><option value="gestao">Gestão</option><option value="sistema">Sistema</option></select></Field>
            <Field label="Mensagem restrita" help="De 10 a 5000 caracteres."><textarea value={messageForm.message} onChange={event => setMessageForm({ ...messageForm, message: event.target.value })} /></Field>
            <div className={styles.checks}><CheckField label="Mensagem interna" checked={messageForm.is_internal} onChange={value => setMessageForm({ ...messageForm, is_internal: value })} /><CheckField label="Mensagem visível ao RH" checked={messageForm.is_hr_visible} onChange={value => setMessageForm({ ...messageForm, is_hr_visible: value })} /></div>
            <button type="submit">Enviar mensagem restrita</button>
          </fieldset></form></details>
          <details className={styles.subsection}><summary>Registrar referência de evidência</summary><form onSubmit={submitEvidence} noValidate><fieldset disabled={busy} className={styles.formGrid}>
            <Field label="Identificador da reclamação para evidência" help="Por padrão, usa o item selecionado; é possível informar outro identificador."><input value={evidenceForm.complaint_id || selectedId || ""} onChange={event => setEvidenceForm({ ...evidenceForm, complaint_id: event.target.value })} /></Field>
            <Field label="Nome da evidência"><input value={evidenceForm.file_name} onChange={event => setEvidenceForm({ ...evidenceForm, file_name: event.target.value })} /></Field>
            <Field label="Endereço declarado da evidência" help="É somente metadado, não há upload nem download nesta tela."><input value={evidenceForm.file_url} onChange={event => setEvidenceForm({ ...evidenceForm, file_url: event.target.value })} /></Field>
            <Field label="Chave declarada de armazenamento"><input value={evidenceForm.storage_key} onChange={event => setEvidenceForm({ ...evidenceForm, storage_key: event.target.value })} /></Field>
            <CheckField label="Evidência visível ao RH" checked={evidenceForm.is_hr_visible} onChange={value => setEvidenceForm({ ...evidenceForm, is_hr_visible: value })} />
            <button type="submit">Anexar evidência restrita</button>
          </fieldset></form></details>
          <details className={styles.subsection}><summary>Compartilhar campo mínimo com RH</summary><form onSubmit={submitShare} noValidate><fieldset disabled={busy} className={styles.formGrid}>
            <Field label="Identificador da reclamação para compartilhamento" help="Por padrão, usa o item selecionado; é possível informar outro identificador."><input value={shareForm.complaint_id || selectedId || ""} onChange={event => setShareForm({ ...shareForm, complaint_id: event.target.value })} /></Field>
            <Field label="Campo a compartilhar"><select value={shareForm.shared_field} onChange={event => setShareForm({ ...shareForm, shared_field: event.target.value })}><option value="category">Categoria</option><option value="severity">Severidade</option><option value="title">Título</option><option value="status">Situação</option><option value="protocol">Protocolo</option><option value="minimal_description">Descrição mínima</option></select></Field>
            <Field label="Valor mínimo compartilhado"><input value={shareForm.shared_value} onChange={event => setShareForm({ ...shareForm, shared_value: event.target.value })} /></Field>
            <Field label="Justificativa do compartilhamento" help="De 10 a 1000 caracteres; registre apenas o mínimo necessário."><textarea value={shareForm.justification} onChange={event => setShareForm({ ...shareForm, justification: event.target.value })} /></Field>
            <button type="submit">Compartilhar mínimo com RH justificado</button>
          </fieldset></form></details>
        </>}
      </section>
    </div>
    <details className={styles.subsection}><summary>Nova reclamação restrita</summary><form onSubmit={submitComplaint} noValidate><fieldset disabled={busy} className={styles.formGrid}>
      <Field label="Identificador da conta do cliente" help="Opcional; UUID de um cadastro existente."><input value={form.client_account_id} onChange={event => setForm({ ...form, client_account_id: event.target.value })} /></Field>
      <Field label="Identificador do contrato" help="Opcional; UUID de um contrato existente."><input value={form.contract_id} onChange={event => setForm({ ...form, contract_id: event.target.value })} /></Field>
      <Field label="Identificador do contato" help="Opcional; UUID de um contato existente."><input value={form.contact_id} onChange={event => setForm({ ...form, contact_id: event.target.value })} /></Field>
      <Field label="Identificador do colaborador" help="Opcional; UUID de um colaborador existente."><input value={form.employee_id} onChange={event => setForm({ ...form, employee_id: event.target.value })} /></Field>
      <Field label="Referência do colaborador" help="Opcional, de 3 a 200 caracteres. O servidor guarda o texto e seu hash."><input value={form.employee_reference} onChange={event => setForm({ ...form, employee_reference: event.target.value })} /></Field>
      <Field label="Categoria"><select value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option value="atendimento">Atendimento</option><option value="comportamento">Comportamento</option><option value="seguranca">Segurança</option><option value="assédio">Assédio</option><option value="discriminacao">Discriminação</option><option value="outro">Outro</option></select></Field>
      <Field label="Severidade"><select value={form.severity} onChange={event => setForm({ ...form, severity: event.target.value })}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></Field>
      <Field label="Título da reclamação" help="De 5 a 200 caracteres."><input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></Field>
      <Field label="Descrição da reclamação" help="De 20 a 5000 caracteres; conteúdo restrito."><textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
      <CheckField label="Reclamação anônima (declaração)" checked={form.is_anonymous} onChange={value => setForm({ ...form, is_anonymous: value })} help="Não remove as referências informadas." />
      <button type="submit">Criar reclamação canal restrito</button>
    </fieldset></form></details>
  </section>;
}
