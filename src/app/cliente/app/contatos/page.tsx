"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RotateCw, UsersRound } from "lucide-react";
import { portalRequest, type PortalErrorDescriptor } from "@/lib/portal-request";
import { portalShouldSignIn } from "@/lib/portal-vocabulary.mjs";
import { useRouter } from "next/navigation";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type ContactScope = { unit_id: string | null; contract_id: string | null; role: string; can_delegate: boolean };
type ClientContact = {
  id: string;
  display_name: string;
  email: string;
  role: string;
  status: string;
  is_self: boolean;
  can_delegate: boolean;
  scopes: ContactScope[];
};

const roleLabel: Record<string, string> = {
  titular: "Titular", financeiro: "Financeiro", operacional: "Operacional", rh: "RH",
  comercial: "Comercial", tecnico: "Técnico", outro: "Outro",
};

export default function ClientContactsPage() {
  const router = useRouter();
  const { activeAccount, loading, notice: spaceNotice, reload } = useClientSpace();
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [readError, setReadError] = useState<PortalErrorDescriptor | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ displayName: "", email: "" });
  const latestRequest = useRef(0);

  const loadContacts = useCallback(async (accountId: string) => {
    const requestId = ++latestRequest.current;
    setReadLoading(true);
    setReadError(null);
    const result = await portalRequest<{ contacts: ClientContact[] }>(
      `/api/client/contacts?account=${encodeURIComponent(accountId)}`,
      { cache: "no-store" },
    );
    if (requestId !== latestRequest.current) return;
    if (!result.ok) {
      if (portalShouldSignIn(result.error)) {
        router.replace("/cliente/entrar");
        return;
      }
      setReadError(result.error);
      setReadLoading(false);
      return;
    }
    if (!Array.isArray(result.data?.contacts)) {
      setReadError({ code: "invalid_request", kind: "error", status: 500, title: "Resposta inválida", detail: "A lista de contatos não pôde ser interpretada.", canRetry: true });
      setReadLoading(false);
      return;
    }
    setContacts(result.data.contacts);
    setReadLoading(false);
  }, [router]);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      latestRequest.current += 1;
      setContacts([]);
      setReadError(null);
      setReadLoading(false);
      return;
    }
    void loadContacts(activeAccount.id);
  }, [activeAccount, loadContacts]);

  async function delegate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || busy) return;
    setBusy(true);
    setNotice("");
    const result = await portalRequest<{ contact?: ClientContact; access_granted?: boolean }>("/api/client/contacts/delegate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: activeAccount.id, displayName: form.displayName.trim(), email: form.email.trim() }),
    });
    if (result.ok) {
      setForm({ displayName: "", email: "" });
      setNotice("Contato encaminhado como pendente de convite. Nenhuma identidade, sessão ou autorização de acesso foi criada.");
      await loadContacts(activeAccount.id);
    } else if (portalShouldSignIn(result.error)) {
      router.replace("/cliente/entrar");
    } else if (result.error.code === "delegation_not_authorized") {
      setNotice("Seu contato ou escopo não está autorizado a delegar. A equipe pode confirmar o vínculo cadastral.");
    } else if (result.error.code === "duplicate_contact_email") {
      setNotice("Este e-mail já está cadastrado nesta conta. A tentativa não criou outro contato.");
    } else {
      setNotice(`${result.error.title}. ${result.error.detail}`);
    }
    setBusy(false);
  }

  if (loading) {
    return <div className={appStyles.loadingWrapWide}><span className={styles.spinner} aria-hidden="true" />Verificando sua sessão…</div>;
  }

  if (!activeAccount) {
    return <section className={appStyles.sectionCard} aria-labelledby="contacts-title">
      <h2 id="contacts-title" className={appStyles.sectionTitle}>Contatos e acessos</h2>
      {spaceNotice ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{spaceNotice}<button className={appStyles.retryButton} type="button" onClick={() => reload()}>Tentar novamente</button></p>
        : readError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{readError.title}. {readError.detail}</p>
          : <div className={appStyles.emptyState}>Selecione uma conta ativa vinculada para consultar os contatos autorizados.</div>}
    </section>;
  }

  return (
    <section className={appStyles.sectionCard} aria-labelledby="contacts-title" aria-busy={readLoading || busy}>
      <span className={styles.badge}><UsersRound size={12} aria-hidden="true" />{activeAccount.display_name}</span>
      <h2 id="contacts-title" className={appStyles.sectionTitle}>Contatos e acessos</h2>
      <p className={appStyles.sectionHint}>Veja seu contato vinculado e as pessoas que você delegou nesta conta. A delegação copia somente os escopos que permitem delegar; ela não cria convite nem libera acesso ao portal.</p>
      {activeAccount.status !== "active" ? <div className={appStyles.suspendedNote}>A conta está suspensa ou encerrada. Contatos não podem ser consultados nem delegados.</div> : null}

      {readError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">
        <span>{readError.title}. {readError.detail}</span>
        <button className={appStyles.retryButton} type="button" onClick={() => loadContacts(activeAccount.id)}><RotateCw size={13} aria-hidden="true" />Tentar novamente</button>
      </p> : null}
      {readLoading ? <div className={appStyles.loadingWrapWide} role="status"><span className={styles.spinner} aria-hidden="true" />Carregando contatos autorizados…</div>
        : !readError && contacts.length === 0 ? <div className={appStyles.emptyState}>Nenhum contato foi vinculado à sua identidade para esta conta. A equipe pode concluir o vínculo cadastral.</div>
          : !readError ? <ul className={appStyles.list}>
            {contacts.map(contact => <li key={contact.id} className={appStyles.listItem}>
              <div className={appStyles.listItemMain}>
                <p className={appStyles.listItemTitle}>{contact.display_name}{contact.is_self ? " (você)" : ""}</p>
                <p className={appStyles.listItemMeta}>{contact.email} · {roleLabel[contact.role] || contact.role} · {contact.status === "pendente_convite" ? "Pendente de convite" : contact.status}</p>
              </div>
              {contact.scopes.length ? <ul aria-label={`Escopos de ${contact.display_name}`} className={appStyles.list}>
                {contact.scopes.map((scope, index) => <li key={`${scope.unit_id || "conta"}-${scope.contract_id || "todos"}-${scope.role}-${index}`} className={appStyles.listItemDetail}>
                  {roleLabel[scope.role] || scope.role} · {scope.unit_id ? "unidade vinculada" : "conta"} · {scope.contract_id ? "contrato específico" : "sem restrição por contrato"}
                  {scope.can_delegate ? " · pode delegar este escopo" : " · sem permissão de delegação"}
                </li>)}
              </ul> : <p className={appStyles.listItemDetail}>Nenhum escopo detalhado foi registrado.</p>}
            </li>)}
          </ul> : null}

      <div className={appStyles.dividerLine} />
      <h3 className={appStyles.sectionTitle}>Delegar um escopo autorizado</h3>
      <p className={appStyles.sectionHint}>O novo contato recebe o seu papel e apenas os escopos que foram marcados para delegação. Ele fica pendente; convite e acesso precisam ser tratados em fluxo separado.</p>
      <form className={appStyles.formGrid} onSubmit={delegate}>
        <div className={appStyles.formRow}>
          <label>Nome do contato
            <input className={appStyles.inputLike} name="displayName" autoComplete="name" minLength={2} maxLength={200} required value={form.displayName} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} />
          </label>
          <label>E-mail do contato
            <input className={appStyles.inputLike} name="email" type="email" autoComplete="email" maxLength={320} required value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} />
          </label>
        </div>
        <button className={appStyles.retryButton} type="submit" disabled={busy || readLoading || activeAccount.status !== "active"}>
          {busy ? "Enviando solicitação…" : "Solicitar delegação"}
        </button>
      </form>
      {notice ? <p className={notice.includes("não está autorizado") || notice.includes("já está cadastrado") ? `${styles.message} ${styles.messageError}` : styles.message} role={notice.includes("não está autorizado") || notice.includes("já está cadastrado") ? "alert" : "status"}>{notice}</p> : null}
    </section>
  );
}
