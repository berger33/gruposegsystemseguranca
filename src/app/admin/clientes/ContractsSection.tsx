"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BriefcaseBusiness, RefreshCw } from "lucide-react";
import { PUBLIC_SERVICES } from "@/lib/service-catalog.mjs";
import { callApi, jsonInit, contractStatusLabel, type AdminAccount } from "./admin-shared";
import styles from "./AdminClientes.module.css";

type Contract = {
  id: string;
  title: string;
  service: string;
  summary: string | null;
  status: "planned" | "active" | "suspended" | "ended";
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

const CONTRACT_STATUSES: Contract["status"][] = ["planned", "active", "suspended", "ended"];

export default function ContractsSection({ accounts }: { accounts: AdminAccount[] | null }) {
  const [accountId, setAccountId] = useState("");
  const [contracts, setContracts] = useState<Contract[] | null>(null);
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [summary, setSummary] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async (selected: string) => {
    if (!selected) {
      setContracts(null);
      return;
    }
    try {
      const data = await callApi(`/api/admin/contracts?account=${encodeURIComponent(selected)}`);
      setContracts((data.contracts as Contract[]) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os contratos.");
    }
  }, []);

  useEffect(() => {
    void reload(accountId);
  }, [accountId, reload]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi(
        "/api/admin/contracts",
        jsonInit("POST", {
          accountId,
          title,
          service,
          summary,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          status: "planned",
        }),
      );
      setNotice(`Contrato “${title.trim()}” registrado. Ajuste a situação para “Ativo” quando iniciar a execução.`);
      setTitle("");
      setService("");
      setSummary("");
      setStartsOn("");
      setEndsOn("");
      await reload(accountId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar o contrato.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(contract: Contract, status: Contract["status"]) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi(`/api/admin/contracts/${contract.id}`, jsonInit("PATCH", { status }));
      setNotice(`Contrato “${contract.title}”: situação alterada para “${contractStatusLabel[status]}”.`);
      await reload(accountId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o contrato.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="contracts-section-title">
      <h2 id="contracts-section-title">3 · Contratos</h2>
      <p className={styles.hint}>
        Registre os contratos de cada cadastro. O serviço deve ser uma das ofertas públicas do site —
        isso evita anunciar itens que a empresa ainda não confirmou.
      </p>

      <div className={styles.field} style={{ maxWidth: 420, marginBottom: 16 }}>
        <label htmlFor="contracts-account">Cadastro central</label>
        <select id="contracts-account" value={accountId} onChange={event => setAccountId(event.target.value)}>
          <option value="">Selecione o cadastro…</option>
          {(accounts ?? []).map(account => (
            <option key={account.id} value={account.id}>
              {account.display_name}
            </option>
          ))}
        </select>
      </div>

      {accountId ? (
        <>
          <form className={styles.formGrid} onSubmit={create} noValidate>
            <div className={`${styles.formRow} ${styles.two}`}>
              <div className={styles.field}>
                <label htmlFor="contract-title">Título do contrato</label>
                <input
                  id="contract-title"
                  value={title}
                  maxLength={160}
                  onChange={event => setTitle(event.target.value)}
                  placeholder="Ex.: Vigilância na portaria — sede"
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="contract-service">Serviço (catálogo público)</label>
                <select id="contract-service" value={service} onChange={event => setService(event.target.value)} required>
                  <option value="">Selecione…</option>
                  {PUBLIC_SERVICES.map(item => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="contract-summary">Resumo (opcional, máx. 500)</label>
              <textarea
                id="contract-summary"
                value={summary}
                maxLength={500}
                onChange={event => setSummary(event.target.value)}
                placeholder="Escopo combinado, postos cobertos, horários etc."
              />
            </div>
            <div className={`${styles.formRow} ${styles.two}`}>
              <div className={styles.field}>
                <label htmlFor="contract-starts">Início (opcional)</label>
                <input id="contract-starts" type="date" value={startsOn} onChange={event => setStartsOn(event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="contract-ends">Término (opcional)</label>
                <input id="contract-ends" type="date" value={endsOn} onChange={event => setEndsOn(event.target.value)} />
              </div>
            </div>
            <button className={styles.submit} type="submit" disabled={busy}>
              <BriefcaseBusiness size={14} aria-hidden="true" />
              {busy ? "Processando…" : "Registrar contrato"}
            </button>
          </form>

          {error ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p> : null}
          {notice ? <p className={`${styles.message} ${styles.messageOk}`} role="status">{notice}</p> : null}

          <p className={styles.hint}>
            <button type="button" className={styles.ghostButton} onClick={() => void reload(accountId)} style={{ color: "#1a5db2", borderColor: "#1a5db2" }}>
              <RefreshCw size={12} aria-hidden="true" />
              Recarregar contratos
            </button>
          </p>
          {!contracts ? (
            <div className={styles.loadingWrap} style={{ color: "#5a7189" }}>
              <span className={styles.spinner} style={{ borderColor: "#5a7189", borderTopColor: "transparent" }} aria-hidden="true" />
              Carregando contratos…
            </div>
          ) : contracts.length === 0 ? (
            <div className={styles.empty}>Nenhum contrato registrado para este cadastro.</div>
          ) : (
            <ul className={styles.list}>
              {contracts.map(contract => (
                <li key={contract.id} className={styles.listItem}>
                  <div className={styles.listItemMain}>
                    <p className={styles.listItemTitle}>{contract.title}</p>
                    <p className={styles.listItemMeta}>
                      {contract.service}
                      {contract.starts_on ? ` · Desde ${new Date(`${contract.starts_on}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                      {contract.ends_on ? ` até ${new Date(`${contract.ends_on}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                  <select
                    className={styles.smallSelect}
                    value={contract.status}
                    disabled={busy}
                    onChange={event => void changeStatus(contract, event.target.value as Contract["status"])}
                    aria-label={`Situação do contrato ${contract.title}`}
                  >
                    {CONTRACT_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {contractStatusLabel[status]}
                      </option>
                    ))}
                  </select>
                  {contract.summary ? <p className={styles.listItemDetail}>{contract.summary}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className={styles.empty}>Selecione um cadastro para gerenciar os contratos.</div>
      )}
    </section>
  );
}
