"use client";
import {workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, RotateCw } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type ClientDocument = {
  id: string;
  title: string;
  category: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

// UX-PRO-ID3: a lista contém LINKS DE DOWNLOAD. Guardar sem conta permitia que
// um documento de A deixasse um link clicável na tela de B.
type DocumentsRead = { accountId: string; documents: ClientDocument[]; readAt: string };
type DocumentsReadError = { accountId: string; message: string };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function readFailureMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (/^Sua sessão|^Seu acesso|^O registro|^O serviço|^Confira/.test(raw)) {
    return raw.replace(/\s*\(HTTP \d+, [^)]*\)$/, "");
  }
  if (raw.startsWith("A resposta")) return raw;
  return "Não foi possível carregar seus documentos agora. Tente novamente.";
}

function formatReadTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "horário não informado" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ClientDocumentsPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [read, setRead] = useState<DocumentsRead | null>(null);
  const [readError, setReadError] = useState<DocumentsReadError | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const latestRequest = useRef(0);

  const loadDocuments = useCallback(async (accountId: string) => {
    const requestId = ++latestRequest.current;
    setReadLoading(true);
    setReadError(null);
    try {
      const response = await workspaceFetch(`/api/client/documents?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const data = (await response.json()) as { documents: ClientDocument[] };
      // Um 200 com corpo inesperado não é "nenhum documento": é falha de leitura.
      if (!Array.isArray(data.documents)) throw new Error("A resposta não trouxe a lista de documentos. Tente novamente.");
      if (requestId !== latestRequest.current) return;
      setRead({ accountId, documents: data.documents, readAt: new Date().toISOString() });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setReadError({ accountId, message: readFailureMessage(error) });
    } finally {
      if (requestId !== latestRequest.current) return;
      setReadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      latestRequest.current += 1;
      setRead(null);
      setReadError(null);
      setReadLoading(false);
      return;
    }
    void loadDocuments(activeAccount.id);
  }, [activeAccount, loadDocuments]);

  const currentRead = activeAccount?.id === read?.accountId ? read : null;
  const currentError = activeAccount?.id === readError?.accountId ? readError : null;

  if (loading) {
    return (
      <div className={appStyles.loadingWrapWide}>
        <span className={styles.spinner} aria-hidden="true" />
        Verificando sua sessão…
      </div>
    );
  }

  if (!activeAccount) {
    if (notice) {
      return (
        <section className={appStyles.sectionCard} aria-labelledby="documents-title">
          <h2 id="documents-title" className={appStyles.sectionTitle}>
            Documentos
          </h2>
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <span>{notice}</span>
            <button className={appStyles.retryButton} type="button" onClick={() => reload()}>
              <RotateCw size={13} aria-hidden="true" />
              Tentar novamente
            </button>
          </p>
        </section>
      );
    }
    return (
      <div className={appStyles.emptyState}>
        Sua identidade ainda não foi vinculada a um cadastro de cliente. Assim que a equipe concluir a
        verificação cadastral, os documentos compartilhados aparecerão aqui.
      </div>
    );
  }

  return (
    <section className={appStyles.sectionCard} aria-labelledby="documents-title" aria-busy={readLoading}>
      <span className={styles.badge}>
        <FileText size={12} aria-hidden="true" />
        {activeAccount.display_name}
      </span>
      <h2 id="documents-title" className={appStyles.sectionTitle}>
        Documentos
      </h2>
      <p className={appStyles.sectionHint}>
        Arquivos compartilhados pela equipe com este cadastro. Os downloads são verificados no
        servidor e registrados em auditoria.
      </p>
      {activeAccount.scope_note ? <p className={appStyles.scopeNote}>Recorte do vínculo: {activeAccount.scope_note}</p> : null}
      {activeAccount.status !== "active" ? (
        <div className={appStyles.suspendedNote}>
          Cadastro {activeAccount.status === "suspended" ? "suspenso" : "encerrado"}. Os documentos não são
          exibidos enquanto a situação não é regularizada.
        </div>
      ) : (
        <>
          {currentError ? (
            <p className={`${styles.message} ${styles.messageError}`} role="alert">
              <span>{currentError.message}</span>
              <button
                className={appStyles.retryButton}
                type="button"
                onClick={() => void loadDocuments(activeAccount.id)}
              >
                <RotateCw size={13} aria-hidden="true" />
                Tentar novamente
              </button>
            </p>
          ) : null}
          {currentError && currentRead ? (
            <p className={appStyles.sectionHint} role="status">
              Os dados abaixo são da Última leitura concluída às {formatReadTime(currentRead.readAt)}. A nova consulta falhou e nada foi apagado.
            </p>
          ) : null}
          {readLoading || !currentRead ? (
            <div className={appStyles.loadingWrapWide} role={currentError ? undefined : "status"}>
              <span className={styles.spinner} aria-hidden="true" />
              {currentError ? "Aguardando uma leitura concluída…" : "Carregando documentos…"}
            </div>
          ) : currentRead.documents.length === 0 ? (
            <div className={appStyles.emptyState}>
              Nenhum documento foi compartilhado ainda com este cadastro.
            </div>
          ) : (
            <ul className={appStyles.list}>
              {currentRead.documents.map(document => (
                <li key={document.id} className={appStyles.listItem}>
                  <div className={appStyles.listItemMain}>
                    <p className={appStyles.listItemTitle}>{document.title}</p>
                    <p className={appStyles.listItemMeta}>
                      {document.category} · {document.original_filename} · {formatSize(document.size_bytes)} · Enviado em{" "}
                      {new Date(document.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <a className={appStyles.downloadButton} href={`/api/client/documents/${document.id}/download`}>
                    <Download size={14} aria-hidden="true" />
                    Baixar
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
