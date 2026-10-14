"use client";

import { useState, type FormEvent } from "react";
import { Plus, RefreshCw } from "lucide-react";
import UiState from "../../../components/ui/UiState";
import { callApi, jsonInit, explainApiError, accountStatusLabel, type AdminAccount, type Recurso } from "./admin-shared";
import styles from "./AdminClientes.module.css";

const ACCOUNT_STATUSES: AdminAccount["status"][] = ["active", "suspended", "closed"];

export default function AccountsSection({
  leitura,
  reloadAccounts,
}: {
  leitura: Recurso<AdminAccount[]>;
  reloadAccounts: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const accounts = leitura.dado;
  const falha = leitura.falhaAtualizacao;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi("/api/admin/client-accounts", jsonInit("POST", { displayName, documentRef, notes }));
      setNotice(`Cadastro “${displayName.trim()}” criado. Agora vincule identidades de acesso a ele.`);
      setDisplayName("");
      setDocumentRef("");
      setNotes("");
      await reloadAccounts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o cadastro.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(account: AdminAccount, status: AdminAccount["status"]) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi(`/api/admin/client-accounts/${account.id}`, jsonInit("PATCH", { status }));
      setNotice(`Cadastro “${account.display_name}”: situação alterada para “${accountStatusLabel[status]}”.`);
      await reloadAccounts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o cadastro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="accounts-section-title" data-testid="clientes-cadastros">
      <h2 id="accounts-section-title">1 · Cadastros centrais de clientes</h2>
      <p className={styles.hint}>
        Cada cadastro representa a empresa/condomínio cliente. O login (identidade) nunca entra como
        cliente sozinho: primeiro este cadastro é aprovado e verificado, depois os vínculos são emitidos na seção 2.
      </p>

      <form className={styles.formGrid} onSubmit={create} noValidate>
        <div className={`${styles.formRow} ${styles.two}`}>
          <div className={styles.field}>
            <label htmlFor="new-account-name">Nome do cadastro</label>
            <input
              id="new-account-name"
              value={displayName}
              maxLength={160}
              onChange={event => setDisplayName(event.target.value)}
              placeholder="Ex.: Condomínio Residencial Jardim Azul"
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="new-account-doc">Documento de referência (opcional)</label>
            <input
              id="new-account-doc"
              value={documentRef}
              maxLength={32}
              onChange={event => setDocumentRef(event.target.value)}
              placeholder="Ex.: 12.345.678/0001-90"
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="new-account-notes">Anotações internas (opcional, máx. 500)</label>
          <textarea
            id="new-account-notes"
            value={notes}
            maxLength={500}
            onChange={event => setNotes(event.target.value)}
            placeholder="Contexto administrativo: processo de aprovação, contato principal etc."
          />
        </div>
        <button className={styles.submit} type="submit" disabled={busy}>
          <Plus size={14} aria-hidden="true" />
          {busy ? "Processando…" : "Criar cadastro"}
        </button>
      </form>

      {error ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p> : null}
      {notice ? <p className={`${styles.message} ${styles.messageOk}`} role="status">{notice}</p> : null}

      <p className={styles.hint}>
        <button type="button" className={styles.ghostButton} onClick={() => void reloadAccounts()} style={{ color: "#1a5db2", borderColor: "#1a5db2" }}>
          <RefreshCw size={12} aria-hidden="true" />
          Recarregar lista
        </button>
      </p>
      {leitura.concluiu ? (
        <>
          {leitura.carregando ? (
            <p role="status" data-testid="clientes-cadastros-atualizando" className={styles.updating}>
              Atualizando os cadastros centrais…
            </p>
          ) : null}
          {falha ? (
            <div role="alert" data-testid="clientes-cadastros-desatualizada" className={styles.stale}>
              <strong>{falha.message}</strong>{" "}
              Esta não é uma lista vazia: os dados abaixo são da última leitura concluída, às {leitura.ultimaLeitura}, e
              podem estar desatualizados em relação ao servidor.
              <div>
                <button type="button" onClick={() => void reloadAccounts()}>Tentar novamente</button>
              </div>
            </div>
          ) : null}
          {accounts && accounts.length > 0 ? (
            <ul className={styles.list}>
              {accounts.map(account => (
                <li key={account.id} className={styles.listItem}>
                  <div className={styles.listItemMain}>
                    <p className={styles.listItemTitle}>{account.display_name}</p>
                    <p className={styles.listItemMeta}>
                      {account.document_ref ? `Doc.: ${account.document_ref} · ` : ""}
                      Criado em {new Date(account.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <select
                    className={styles.smallSelect}
                    value={account.status}
                    disabled={busy}
                    onChange={event => void changeStatus(account, event.target.value as AdminAccount["status"])}
                    aria-label={`Situação do cadastro ${account.display_name}`}
                  >
                    {ACCOUNT_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {accountStatusLabel[status]}
                      </option>
                    ))}
                  </select>
                  {account.notes ? <p className={styles.listItemDetail}>Anotações: {account.notes}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>Nenhum cadastro criado ainda. Comece pelo formulário acima.</div>
          )}
        </>
      ) : leitura.erro ? (
        // Nunca houve leitura concluída: a falha é declarada com repetição — e
        // não é apresentada como lista vazia nem como carregamento.
        <div data-testid="clientes-cadastros-falha">
          <UiState
            variant="error"
            title="Falha na consulta de cadastros centrais"
            detail={`${leitura.erro.message} A ausência abaixo não é um zero: a lista simplesmente não foi lida.`}
            retryLabel="Tentar novamente"
            onRetry={() => void reloadAccounts()}
          />
        </div>
      ) : (
        <div className={styles.loadingWrap} style={{ color: "#5a7189" }}>
          <span className={styles.spinner} style={{ borderColor: "#5a7189", borderTopColor: "transparent" }} aria-hidden="true" />
          Carregando cadastros…
        </div>
      )}
    </section>
  );
}
