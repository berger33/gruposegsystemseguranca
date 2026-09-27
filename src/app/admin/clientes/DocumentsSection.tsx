"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, FileUp, RefreshCw } from "lucide-react";
import { callApi, jsonInit, type AdminAccount } from "./admin-shared";
import styles from "./AdminClientes.module.css";

type AdminDocument = {
  id: string;
  title: string;
  category: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
};

const MAX_MB = 10;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const comma = dataUrl.indexOf(",");
      if (comma < 0) {
        reject(new Error("Leitura de arquivo não reconhecida."));
        return;
      }
      resolve(dataUrl.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export default function DocumentsSection({ accounts }: { accounts: AdminAccount[] | null }) {
  const [accountId, setAccountId] = useState("");
  const [documents, setDocuments] = useState<AdminDocument[] | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async (selected: string) => {
    if (!selected) {
      setDocuments(null);
      return;
    }
    try {
      const data = await callApi(`/api/admin/documents?account=${encodeURIComponent(selected)}`);
      setDocuments((data.documents as AdminDocument[]) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os documentos.");
    }
  }, []);

  useEffect(() => {
    void reload(accountId);
  }, [accountId, reload]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!file) {
      setError("Selecione um arquivo para enviar.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Arquivo muito grande. O limite é ${MAX_MB} MB.`);
      return;
    }
    setBusy(true);
    try {
      const contentBase64 = await readAsBase64(file);
      await callApi(
        "/api/admin/documents",
        jsonInit("POST", { accountId, title, category, filename: file.name, contentBase64 }),
      );
      setNotice(`Documento “${title.trim()}” publicado. O vínculo ativo já consegue ver e baixar.`);
      setTitle("");
      setCategory("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await reload(accountId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o documento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="documents-section-title">
      <h2 id="documents-section-title">4 · Documentos compartilhados</h2>
      <p className={styles.hint}>
        Envie arquivos para o cadastro central (PDF, imagens, TXT, CSV, DOCX, XLSX; até {MAX_MB} MB).
        Eles ficam em pasta privada fora do site e cada download é verificado e registrado em auditoria.
      </p>

      <div className={styles.field} style={{ maxWidth: 420, marginBottom: 16 }}>
        <label htmlFor="documents-account">Cadastro central</label>
        <select id="documents-account" value={accountId} onChange={event => setAccountId(event.target.value)}>
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
          <form className={styles.formGrid} onSubmit={upload} noValidate>
            <div className={`${styles.formRow} ${styles.two}`}>
              <div className={styles.field}>
                <label htmlFor="doc-title">Título</label>
                <input
                  id="doc-title"
                  value={title}
                  maxLength={160}
                  onChange={event => setTitle(event.target.value)}
                  placeholder="Ex.: Relatório de setembro"
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="doc-category">Categoria</label>
                <input
                  id="doc-category"
                  value={category}
                  maxLength={60}
                  onChange={event => setCategory(event.target.value)}
                  placeholder="Ex.: Relatórios"
                  required
                />
              </div>
            </div>
            <div className={`${styles.formRow} ${styles.two}`}>
              <div className={styles.field}>
                <label htmlFor="doc-file">Arquivo (até {MAX_MB} MB)</label>
                <input
                  id="doc-file"
                  ref={fileInput}
                  type="file"
                  onChange={event => setFile(event.target.files?.[0] ?? null)}
                  required
                />
              </div>
            </div>
            <button className={styles.submit} type="submit" disabled={busy}>
              <FileUp size={14} aria-hidden="true" />
              {busy ? "Enviando…" : "Publicar documento"}
            </button>
          </form>

          {error ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p> : null}
          {notice ? <p className={`${styles.message} ${styles.messageOk}`} role="status">{notice}</p> : null}

          <p className={styles.hint}>
            <button type="button" className={styles.ghostButton} onClick={() => void reload(accountId)} style={{ color: "#1a5db2", borderColor: "#1a5db2" }}>
              <RefreshCw size={12} aria-hidden="true" />
              Recarregar documentos
            </button>
          </p>
          {!documents ? (
            <div className={styles.loadingWrap} style={{ color: "#5a7189" }}>
              <span className={styles.spinner} style={{ borderColor: "#5a7189", borderTopColor: "transparent" }} aria-hidden="true" />
              Carregando documentos…
            </div>
          ) : documents.length === 0 ? (
            <div className={styles.empty}>Nenhum documento publicado para este cadastro.</div>
          ) : (
            <ul className={styles.list}>
              {documents.map(document => (
                <li key={document.id} className={styles.listItem}>
                  <div className={styles.listItemMain}>
                    <p className={styles.listItemTitle}>{document.title}</p>
                    <p className={styles.listItemMeta}>
                      {document.category} · {document.original_name} · {formatSize(document.size_bytes)} ·{" "}
                      {new Date(document.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <a className={styles.linkButton} href={`/api/admin/documents/${document.id}/download`}>
                    <Download size={12} aria-hidden="true" />
                    Baixar (auditado)
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className={styles.empty}>Selecione um cadastro para gerenciar documentos.</div>
      )}
    </section>
  );
}
