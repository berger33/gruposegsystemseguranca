"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link2, RefreshCw, Unlink } from "lucide-react";
import { callApi, jsonInit, type AdminAccount, accountStatusLabel } from "./admin-shared";
import styles from "./AdminClientes.module.css";

type IdentitySearchResult = { id: string; email: string; display_name: string | null; status: string };
type Grant = {
  id: string;
  client_account_id: string;
  account_name: string;
  identity_id: string;
  identity_email: string;
  identity_name: string | null;
  scope_note: string | null;
  reason: string;
  granted_by: string;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

// Vínculo oficial (o "grant") entre a identidade de acesso e o cadastro central:
// a única prova usada pelo servidor para liberar dados. Emissor e motivo são registrados.
export default function GrantsSection({ accounts }: { accounts: AdminAccount[] | null }) {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IdentitySearchResult[]>([]);
  const [identity, setIdentity] = useState<IdentitySearchResult | null>(null);
  const [accountId, setAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [scopeNote, setScopeNote] = useState("");
  const [revokee, setRevokee] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    try {
      const data = await callApi("/api/admin/grants");
      setGrants((data.grants as Grant[]) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os vínculos.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await callApi(`/api/admin/identities?q=${encodeURIComponent(query.trim())}`);
        if (!controller.signal.aborted) setResults((data.identities as IdentitySearchResult[]) ?? []);
      } catch {
        /* busca auxiliar: falha silenciosa */
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi(
        "/api/admin/grants",
        jsonInit("POST", { identityId: identity?.id, clientAccountId: accountId, reason, scopeNote: scopeNote || null }),
      );
      setNotice(`Vínculo emitido para ${identity?.email}. O acesso aos dados já vale neste momento.`);
      setIdentity(null);
      setQuery("");
      setReason("");
      setScopeNote("");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível emitir o vínculo.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(grant: Grant) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await callApi(`/api/admin/grants/${grant.id}`, jsonInit("DELETE", { reason: revokeReason }));
      setNotice(
        data.outcome === "already_revoked"
          ? "Este vínculo já estava revogado (nenhuma mudança adicional)."
          : `Vínculo de ${grant.identity_email} com “${grant.account_name}” revogado.`,
      );
      setRevokee(null);
      setRevokeReason("");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível revogar o vínculo.");
    } finally {
      setBusy(false);
    }
  }

  const accountById = new Map((accounts ?? []).map(account => [account.id, account]));

  return (
    <section className={styles.card} aria-labelledby="grants-section-title">
      <h2 id="grants-section-title">2 · Vínculos de acesso verificados</h2>
      <p className={styles.hint}>
        Ligue aqui a identidade de quem entra no portal (pessoa) ao cadastro central (empresa cliente).
        O motivo é obrigatório e fica em auditoria. Enquanto houver vínculo ativo <em>e</em> cadastro
        ativo, a pessoa vê os dados; ao revogar, o acesso cai na hora.
      </p>

      <form className={styles.formGrid} onSubmit={issue} noValidate>
        <div className={`${styles.formRow} ${styles.three}`}>
          <div className={`${styles.field} ${styles.searchResults}`}>
            <label htmlFor="identity-search">Buscar identidade (e-mail ou nome, 3+ letras)</label>
            <input
              id="identity-search"
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setIdentity(null);
              }}
              placeholder="Ex.: pessoa@empresa.com.br"
              autoComplete="off"
            />
            {identity ? (
              <p className={styles.listItemMeta} style={{ marginTop: 4 }}>
                Selecionada: <strong>{identity.email}</strong>
                {identity.display_name ? ` (${identity.display_name})` : ""} · situação: {identity.status}
              </p>
            ) : null}
            {!identity && results.length > 0 ? (
              <ul className={styles.searchList}>
                {results.map(result => (
                  <li key={result.id}>
                    <button
                      type="button"
                      className={styles.searchOption}
                      onClick={() => {
                        setIdentity(result);
                        setResults([]);
                      }}
                    >
                      {result.email}
                      <small>
                        {result.display_name ?? "sem nome de exibição"} · situação: {result.status}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="grant-account">Cadastro central</label>
            <select id="grant-account" value={accountId} onChange={event => setAccountId(event.target.value)} required>
              <option value="">Selecione…</option>
              {(accounts ?? []).map(account => (
                <option key={account.id} value={account.id}>
                  {account.display_name} ({accountStatusLabel[account.status]})
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="grant-scope">Recorte do vínculo (opcional)</label>
            <input
              id="grant-scope"
              value={scopeNote}
              maxLength={500}
              onChange={event => setScopeNote(event.target.value)}
              placeholder="Ex.: Somente sede administrativa"
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="grant-reason">Motivo (obrigatório, vai para a auditoria)</label>
          <input
            id="grant-reason"
            value={reason}
            maxLength={500}
            onChange={event => setReason(event.target.value)}
            placeholder="Ex.: Responsável legal confirmado no contrato 114/2026"
            required
          />
        </div>
        <button className={styles.submit} type="submit" disabled={busy || !identity || !accountId}>
          <Link2 size={14} aria-hidden="true" />
          {busy ? "Processando…" : "Emitir vínculo"}
        </button>
      </form>

      {error ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p> : null}
      {notice ? <p className={`${styles.message} ${styles.messageOk}`} role="status">{notice}</p> : null}

      <p className={styles.hint}>
        <button type="button" className={styles.ghostButton} onClick={() => void reload()} style={{ color: "#1a5db2", borderColor: "#1a5db2" }}>
          <RefreshCw size={12} aria-hidden="true" />
          Recarregar vínculos
        </button>
      </p>
      {!grants ? (
        <div className={styles.loadingWrap} style={{ color: "#5a7189" }}>
          <span className={styles.spinner} style={{ borderColor: "#5a7189", borderTopColor: "transparent" }} aria-hidden="true" />
          Carregando vínculos…
        </div>
      ) : grants.length === 0 ? (
        <div className={styles.empty}>Nenhum vínculo emitido ainda.</div>
      ) : (
        <ul className={styles.list}>
          {grants.map(grant => {
            const account = accountById.get(grant.client_account_id);
            const active = !grant.revoked_at;
            return (
              <li key={grant.id} className={styles.listItem}>
                <div className={styles.listItemMain}>
                  <p className={styles.listItemTitle}>
                    {grant.identity_email} → {grant.account_name}
                  </p>
                  <p className={styles.listItemMeta}>
                    Emitido por {grant.granted_by} em {new Date(grant.created_at).toLocaleString("pt-BR")} · Motivo: {grant.reason}
                    {account ? ` · Cadastro: ${accountStatusLabel[account.status]}` : ""}
                  </p>
                </div>
                <span className={`${styles.chip} ${active ? styles.chipActive : styles.chipEnded}`}>
                  {active ? "Ativo" : "Revogado"}
                </span>
                {active ? (
                  <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => setRevokee(grant.id)}>
                    <Unlink size={12} aria-hidden="true" />
                    Revogar
                  </button>
                ) : null}
                {grant.scope_note ? <p className={styles.listItemDetail}>Recorte: {grant.scope_note}</p> : null}
                {!active ? (
                  <p className={styles.listItemDetail}>
                    Revogado em {grant.revoked_at ? new Date(grant.revoked_at).toLocaleString("pt-BR") : "—"} · Motivo:{" "}
                    {grant.revoke_reason ?? "não informado"}
                  </p>
                ) : null}
                {revokee === grant.id ? (
                  <div className={styles.inlineForm}>
                    <input
                      value={revokeReason}
                      maxLength={500}
                      onChange={event => setRevokeReason(event.target.value)}
                      placeholder="Motivo da revogação (obrigatório)"
                      aria-label="Motivo da revogação"
                    />
                    <button type="button" className={styles.dangerButton} disabled={busy || !revokeReason.trim()} onClick={() => void revoke(grant)}>
                      Confirmar revogação
                    </button>
                    <button type="button" className={styles.ghostButton} style={{ color: "#5a7189", borderColor: "#dce7f0" }} onClick={() => setRevokee(null)}>
                      Cancelar
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
