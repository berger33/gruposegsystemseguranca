"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
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

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export default function ClientDocumentsPage() {
  const { activeAccount, loading } = useClientSpace();
  const [documents, setDocuments] = useState<ClientDocument[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      setDocuments(null);
      return;
    }
    setError("");
    let cancelled = false;
    fetch(`/api/client/documents?account=${encodeURIComponent(activeAccount.id)}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("unexpected");
        const data = (await response.json()) as { documents: ClientDocument[] };
        if (!cancelled) setDocuments(data.documents);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar seus documentos agora.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeAccount]);

  if (loading) {
    return (
      <div className={appStyles.loadingWrapWide}>
        <span className={styles.spinner} aria-hidden="true" />
        Verificando sua sessão…
      </div>
    );
  }

  if (!activeAccount) {
    return (
      <div className={appStyles.emptyState}>
        Sua identidade ainda não foi vinculada a um cadastro de cliente. Assim que a equipe concluir a
        verificação cadastral, os documentos compartilhados aparecerão aqui.
      </div>
    );
  }

  return (
    <section className={appStyles.sectionCard} aria-labelledby="documents-title">
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
      {activeAccount.status !== "active" ? (
        <div className={appStyles.suspendedNote}>
          Cadastro {activeAccount.status === "suspended" ? "suspenso" : "encerrado"}. Os documentos não são
          exibidos enquanto a situação não é regularizada.
        </div>
      ) : error ? (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          {error}
        </p>
      ) : !documents ? (
        <div className={appStyles.loadingWrapWide}>
          <span className={styles.spinner} aria-hidden="true" />
          Carregando documentos…
        </div>
      ) : documents.length === 0 ? (
        <div className={appStyles.emptyState}>
          Nenhum documento foi compartilhado ainda com este cadastro.
        </div>
      ) : (
        <ul className={appStyles.list}>
          {documents.map(document => (
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
    </section>
  );
}
