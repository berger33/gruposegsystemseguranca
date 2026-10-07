"use client";
import {workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RotateCw, Send, ShieldAlert } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type Complaint = {
  id: string;
  protocol: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  is_anonymous: boolean;
  is_restricted: boolean;
  minimal_share: boolean;
  is_shared_with_hr: boolean;
  shared_with_hr_at: string | null;
  created_at: string;
};

type HrShareInfo = { field: string; justification: string };

type Payload = {
  complaints: Complaint[];
  hrMinimalShare: HrShareInfo[];
};

const categoryLabel: Record<string, string> = {
  atendimento: "Atendimento",
  comportamento: "Comportamento",
  seguranca: "Segurança",
  "assédio": "Assédio",
  discriminacao: "Discriminação",
  outro: "Outro",
};

const severityLabel: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

const statusLabel: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  em_apuracao: "Em apuração",
  resolvida: "Resolvida",
  arquivada: "Arquivada",
  cancelada: "Cancelada",
  escalonada: "Escalonada",
};

const fieldLabel: Record<string, string> = {
  protocol: "Protocolo",
  category: "Categoria",
  severity: "Severidade",
  status: "Situação",
};

function newIdempotencyKey() {
  return `cli15-${crypto.randomUUID()}`;
}

export default function ClientEmployeeComplaintPage() {
  const { activeAccount, loading: spaceLoading, notice: spaceNotice, reload } = useClientSpace();
  const [data, setData] = useState<Payload | null>(null);
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [employeeReference, setEmployeeReference] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef("");

  const load = useCallback(async (accountId: string) => {
    setLoadError("");
    setData(null);
    try {
      const response = await workspaceFetch(`/api/client/employee-complaints?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      const payload = await response.json() as Payload;
      setData(payload);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Não foi possível carregar suas reclamações agora.");
    }
  }, []);

  useEffect(() => {
    setCategory("");
    setSeverity("");
    setTitle("");
    setDescription("");
    setEmployeeReference("");
    setIsAnonymous(false);
    setSubmitError("");
    setSuccess("");
    keyRef.current = newIdempotencyKey();
    if (!activeAccount || activeAccount.status !== "active") {
      setData(null);
      return;
    }
    void load(activeAccount.id);
  }, [activeAccount, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || busy) return;
    setBusy(true);
    setSubmitError("");
    setSuccess("");
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      const reference = employeeReference.trim();
      const response = await workspaceFetch("/api/client/employee-complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current },
        body: JSON.stringify({
          client_account_id: activeAccount.id,
          category,
          severity,
          title: title.trim(),
          description: description.trim(),
          employee_reference: reference.length > 0 ? reference : undefined,
          is_anonymous: isAnonymous,
        }),
      });
      const payload = await response.json() as { complaint?: Complaint; error?: string; replayed?: boolean };
      if (!response.ok || !payload.complaint) {
        const messages: Record<string, string> = {
          title_5_200: "O título precisa ter entre 5 e 200 caracteres.",
          description_20_5000: "O relato precisa ter entre 20 e 5000 caracteres.",
          employee_reference_3_200: "A referência do colaborador precisa ter entre 3 e 200 caracteres.",
          invalid_category: "Selecione uma categoria válida.",
          invalid_severity: "Selecione uma severidade válida.",
          idempotency_key_reused: "Esta tentativa conflitou com outro envio. Recarregue a página.",
          forbidden: "Este cadastro não está disponível no seu vínculo.",
        };
        throw new Error(messages[payload.error || ""] || "Não foi possível registrar a reclamação.");
      }
      setSuccess(payload.replayed
        ? `Reclamação recuperada: já estava registrada com o protocolo ${payload.complaint.protocol}.`
        : `Reclamação registrada em canal restrito com o protocolo ${payload.complaint.protocol}. O RH recebeu somente protocolo, categoria, severidade e situação.`);
      setCategory("");
      setSeverity("");
      setTitle("");
      setDescription("");
      setEmployeeReference("");
      setIsAnonymous(false);
      keyRef.current = newIdempotencyKey();
      await load(activeAccount.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível registrar a reclamação.");
      // A chave é preservada: um retry após queda de conexão não duplica a reclamação.
    } finally {
      setBusy(false);
    }
  }

  if (spaceLoading) return <div className={appStyles.loadingWrapWide}><span className={styles.spinner} aria-hidden="true" />Verificando sua sessão…</div>;
  if (!activeAccount) return spaceNotice ? (
    <p className={`${styles.message} ${styles.messageError}`} role="alert">
      {spaceNotice}<button className={appStyles.retryButton} type="button" onClick={() => reload()}><RotateCw size={13} />Tentar novamente</button>
    </p>
  ) : <div className={appStyles.emptyState}>Seu acesso ainda não possui uma conta vinculada.</div>;

  const complaints = data?.complaints || [];

  return <>
    <section className={appStyles.sectionCard} aria-labelledby="complaint-form-title">
      <span className={styles.badge}><ShieldAlert size={12} aria-hidden="true" />{activeAccount.display_name}</span>
      <h1 id="complaint-form-title" className={appStyles.sectionTitle}>Reclamação sobre colaborador — canal restrito</h1>
      <p className={appStyles.sectionHint}>
        Este canal é restrito: a reclamação fica vinculada ao seu acesso e não aparece em chamados, listagens públicas ou
        outras áreas. O RH recebe somente o mínimo necessário — protocolo, categoria, severidade e situação — com
        justificativa registrada; o seu relato e a sua identificação não são repassados.
      </p>
      {activeAccount.status !== "active" ? <div className={appStyles.suspendedNote}>Este cadastro não está ativo para novas reclamações.</div> : (
        <form className={appStyles.formGrid} onSubmit={submit}>
          <label>Categoria
            <select className={appStyles.select} required value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">Selecione a categoria</option>
              {Object.entries(categoryLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Severidade
            <select className={appStyles.select} required value={severity} onChange={event => setSeverity(event.target.value)}>
              <option value="">Selecione a severidade</option>
              {Object.entries(severityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Título
            <input className={appStyles.inputLike} required minLength={5} maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="Resumo breve do ocorrido (5 a 200 caracteres)" />
          </label>
          <label>Relato
            <textarea className={appStyles.textarea} required minLength={20} maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Descreva o ocorrido com data, local e contexto (20 a 5000 caracteres). O relato permanece no canal restrito e não é repassado ao RH." />
            <span className={appStyles.charCounter}>{description.length}/5000</span>
          </label>
          <label>Referência do colaborador (opcional)
            <input className={appStyles.inputLike} minLength={3} maxLength={200} value={employeeReference} onChange={event => setEmployeeReference(event.target.value)} placeholder="Ex.: nome no crachá, posto ou turno (3 a 200 caracteres)" />
          </label>
          <label className={appStyles.checkboxRow}>
            <input type="checkbox" checked={isAnonymous} onChange={event => setIsAnonymous(event.target.checked)} />
            Prefiro não ser identificado na tratativa interna
          </label>
          {submitError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{submitError}</p> : null}
          {success ? <p className={styles.message} role="status">{success}</p> : null}
          <button className={styles.submit} type="submit" disabled={busy || !category || !severity}><Send size={15} aria-hidden="true" />{busy ? "Enviando…" : "Registrar reclamação"}</button>
        </form>
      )}
    </section>

    <section className={appStyles.sectionCard} aria-labelledby="complaint-list-title">
      <h2 id="complaint-list-title" className={appStyles.sectionTitle}>Suas reclamações nesta conta</h2>
      <p className={appStyles.sectionHint}>Somente as reclamações abertas por você nesta conta. Nada de outros clientes aparece aqui.</p>
      {loadError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{loadError}<button className={appStyles.retryButton} type="button" onClick={() => void load(activeAccount.id)}><RotateCw size={13} />Tentar novamente</button></p>
      : !data ? <div className={appStyles.loadingWrapWide}><span className={styles.spinner} aria-hidden="true" />Carregando reclamações…</div>
      : complaints.length === 0 ? <div className={appStyles.emptyState}>Nenhuma reclamação registrada por você nesta conta.</div>
      : <ul className={appStyles.list}>{complaints.map(item => <li className={appStyles.listItem} key={item.id}>
          <div className={appStyles.listItemMain}>
            <p className={appStyles.listItemTitle}>{item.protocol} · {categoryLabel[item.category] || item.category} · severidade {severityLabel[item.severity] || item.severity}</p>
            <p className={appStyles.listItemMeta}>Aberta em {new Date(item.created_at).toLocaleString("pt-BR")}{item.is_anonymous ? " · tratativa sem identificação" : ""}</p>
          </div>
          <span className={`${appStyles.chip} ${item.status === "resolvida" ? appStyles.chipResolved : item.status === "arquivada" || item.status === "cancelada" ? appStyles.chipClosed : appStyles.chipOpen}`}>{statusLabel[item.status] || item.status}</span>
          <p className={appStyles.listItemDetail}>{item.title}</p>
          {item.is_shared_with_hr ? (
            <p className={appStyles.listItemMeta}>
              RH recebeu somente o envelope mínimo{item.shared_with_hr_at ? ` em ${new Date(item.shared_with_hr_at).toLocaleString("pt-BR")}` : ""}: {(data?.hrMinimalShare || []).map(share => fieldLabel[share.field] || share.field).join(", ")}.
            </p>
          ) : null}
        </li>)}</ul>}
    </section>

    <section className={appStyles.sectionCard} aria-labelledby="complaint-share-title">
      <h2 id="complaint-share-title" className={appStyles.sectionTitle}>O que o RH recebe — e por quê</h2>
      {!data ? (loadError ? null : <div className={appStyles.loadingWrapWide}><span className={styles.spinner} aria-hidden="true" />Carregando…</div>) : (
        <ul className={appStyles.list}>
          {(data.hrMinimalShare || []).map(share => <li className={appStyles.listItem} key={share.field}>
            <div className={appStyles.listItemMain}>
              <p className={appStyles.listItemTitle}>{fieldLabel[share.field] || share.field}</p>
            </div>
            <p className={appStyles.listItemDetail}>{share.justification}</p>
          </li>)}
        </ul>
      )}
    </section>
  </>;
}
