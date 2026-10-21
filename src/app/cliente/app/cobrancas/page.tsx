"use client";
import {workspaceFetch} from "@/lib/workspace-response";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../ClientApp.module.css";

type Charge = { id:string; client_account_id:string; protocol:string; charge_type:string; status:string; amount_cents:number; due_date:string; is_fiscal:boolean; fiscal_document_url:string|null; comprovante_url:string|null };
type ChargeRead = { accountId: string; charges: Charge[] };
type ChargeError = { accountId: string; message: string };

export default function CobrancasPage() {
  const { activeAccount, accounts, accountsState, error: spaceError, reload, loading: spaceLoading } = useClientSpace();
  const [read, setRead] = useState<ChargeRead | null>(null);
  const [readError, setReadError] = useState<ChargeError | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeAccount) return;
    const accountId = activeAccount.id;
    setLoading(true);
    setReadError(null);
    try {
      const response = await workspaceFetch("/api/client/cobrancas");
      const data = await response.json();
      setRead({
        accountId,
        charges: (data.charges || []).filter((charge: Charge) => charge.client_account_id === accountId),
      });
    } catch (error) {
      setReadError({
        accountId,
        message: error instanceof Error ? error.message : "Falha ao carregar cobranças",
      });
    } finally {
      setLoading(false);
    }
  }, [activeAccount]);

  useEffect(() => { void load(); }, [load]);

  const accountId = activeAccount?.id;
  const currentRead = accountId && read?.accountId === accountId ? read : null;
  const currentError = accountId && readError?.accountId === accountId ? readError : null;

  return (
    <div className={styles.shell}>
      <div className={styles.content}>
        <div className={styles.breadcrumb}><Link href="/cliente/app">Área do cliente</Link> / Cobranças</div>
        <h1>Cobranças e comprovantes</h1>
        <p>Somente documentos financeiros provenientes de integração ativa e vinculados à conta selecionada.</p>
        {spaceLoading || (activeAccount && (loading || (!currentRead && !currentError))) ? (
          <p role="status">Carregando…</p>
        ) : spaceError ? (
          <div role="alert" className={styles.notice}>
            {spaceError.title}. {spaceError.detail} <button type="button" onClick={() => void reload()}>Tentar novamente</button>
          </div>
        ) : accountsState === "ready" && !activeAccount ? (
          <p>Nenhuma conta vinculada disponível para consultar cobranças.</p>
        ) : currentError ? (
          <div role="alert" className={styles.notice}>
            {currentError.message} <button type="button" onClick={() => void load()}>Tentar novamente</button>
          </div>
        ) : currentRead?.charges.length === 0 ? (
          <p>Nenhuma cobrança integrada disponível.</p>
        ) : (
          <ul>
            {currentRead?.charges.map(charge => (
              <li key={charge.id}>
                <strong>{charge.protocol}</strong> · {charge.charge_type} · R$ {(Number(charge.amount_cents) / 100).toFixed(2)} · vencimento {new Date(charge.due_date).toLocaleDateString("pt-BR")} · {charge.status}
                {charge.fiscal_document_url && <a href={charge.fiscal_document_url}> Documento fiscal</a>}
                {charge.comprovante_url && <a href={charge.comprovante_url}> Comprovante</a>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
