"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, ExternalLink, LogOut, Palette, ShieldAlert } from "lucide-react";
import {
  DEFAULT_SITE_VISUAL,
  isSiteVisualId,
  SITE_VISUAL_OPTIONS,
  SITE_VISUAL_STORAGE_KEY,
  type SiteVisualId,
} from "@/lib/site-visuals";
import styles from "./VisualAdmin.module.css";

type AdminRole = "marcelo" | "ti";
type StorageMode = "loading" | "local" | "central";

const roleNames: Record<AdminRole, string> = { marcelo: "Marcelo · administração de negócio", ti: "TI · administração do sistema" };

function readLocalVisual(): SiteVisualId {
  try {
    const value = window.localStorage.getItem(SITE_VISUAL_STORAGE_KEY);
    return isSiteVisualId(value) ? value : DEFAULT_SITE_VISUAL;
  } catch {
    return DEFAULT_SITE_VISUAL;
  }
}

export default function VisualAdmin() {
  const [activeVisual, setActiveVisual] = useState<SiteVisualId>(DEFAULT_SITE_VISUAL);
  const [storageMode, setStorageMode] = useState<StorageMode>("loading");
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadConfiguration() {
      setActiveVisual(readLocalVisual());
      try {
        const [visualResponse, sessionResponse] = await Promise.all([
          fetch("/api/site-visual", { cache: "no-store" }),
          fetch("/api/admin/session", { cache: "no-store" }),
        ]);
        const [visualData, sessionData] = await Promise.all([
          visualResponse.json().catch(() => ({})),
          sessionResponse.json().catch(() => ({})),
        ]);
        if (cancelled) return;
        if (visualResponse.ok && isSiteVisualId(visualData.visual)) {
          setStorageMode("central");
          setActiveVisual(visualData.visual);
        } else {
          setStorageMode("local");
        }
        if (sessionResponse.ok && (sessionData.role === "marcelo" || sessionData.role === "ti")) {
          setAdminRole(sessionData.role);
        }
      } catch {
        if (!cancelled) setStorageMode("local");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void loadConfiguration();
    return () => { cancelled = true; };
  }, []);

  async function refreshCentralVisual() {
    const response = await fetch("/api/site-visual", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !isSiteVisualId(data.visual)) throw new Error("Não foi possível consultar a configuração central.");
    setActiveVisual(data.visual);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setSavedMessage("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: accessToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.error === "admin_auth_not_configured") throw new Error("A autenticação central ainda não está configurada no servidor.");
        if (data.error === "too_many_attempts") throw new Error("Muitas tentativas. Aguarde antes de tentar novamente.");
        throw new Error("Chave administrativa inválida ou indisponível.");
      }
      setAdminRole(data.role === "marcelo" || data.role === "ti" ? data.role : null);
      setAccessToken("");
      await refreshCentralVisual();
      setSavedMessage("Acesso administrativo autenticado neste navegador.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao autenticar.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      setAdminRole(null);
      setSavedMessage("Sessão administrativa encerrada.");
      setBusy(false);
    }
  }

  async function applyVisual(id: SiteVisualId) {
    setBusy(true);
    setErrorMessage("");
    setSavedMessage("");
    if (storageMode === "local") {
      try {
        window.localStorage.setItem(SITE_VISUAL_STORAGE_KEY, id);
        window.dispatchEvent(new CustomEvent("seg-site-visual-updated", { detail: id }));
        setActiveVisual(id);
        setSavedMessage(`Layout ${id} ativado somente neste navegador (modo de demonstração).`);
      } catch {
        setErrorMessage("Não foi possível salvar a seleção local neste navegador.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!adminRole) {
      setErrorMessage("Entre com uma credencial administrativa para publicar a alteração para todos.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/site-visual", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visual: id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !isSiteVisualId(data.visual)) {
        if (data.error === "migration_required") throw new Error("O esquema PostgreSQL não foi migrado. Execute npm run db:migrate.");
        if (data.error === "admin_session_required") {
          setAdminRole(null);
          throw new Error("A sessão expirou. Entre novamente.");
        }
        throw new Error("Não foi possível publicar a escolha no servidor.");
      }
      setActiveVisual(data.visual);
      window.dispatchEvent(new CustomEvent("seg-site-visual-updated", { detail: data.visual }));
      setSavedMessage(`Layout ${data.visual} publicado para o site. Alteração registrada por ${roleNames[adminRole]}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao publicar a aparência.");
    } finally {
      setBusy(false);
    }
  }

  const canApply = storageMode === "local" || (storageMode === "central" && !!adminRole);
  const currentName = SITE_VISUAL_OPTIONS.find(option => option.id === activeVisual)?.name || "Azul em camadas";

  return (
    <main className={styles.adminPage}>
      <header className={styles.header}>
        <a href="/" className={styles.backLink}><ArrowLeft size={15} /> Voltar ao site</a>
        <span className={styles.headerLabel}><Palette size={15} /> APARÊNCIA DO SITE</span>
      </header>
      <section className={styles.content}>
        <div className={styles.headingRow}>
          <div>
            <span className={styles.eyebrow}>MÓDULO DE ADMINISTRAÇÃO · VISUAIS</span>
            <h1>Escolha o visual<br /><em>do site público.</em></h1>
            <p>As dez propostas aprovadas podem ser alternadas. O layout 06 é o padrão inicial; a escolha troca a composição completa da página inicial.</p>
          </div>
          <div className={styles.currentCard} aria-live="polite">
            <span>{storageMode === "central" ? "VISUAL ATIVO NO SITE" : "VISUAL ATIVO NESTE NAVEGADOR"}</span>
            <strong>{ready ? activeVisual : DEFAULT_SITE_VISUAL}</strong>
            <small>{currentName}</small>
          </div>
        </div>

        {storageMode === "central" ? (
          <div className={styles.accessPanel}>
            {adminRole ? (
              <><div><span className={styles.accessLabel}>SESSÃO ADMINISTRATIVA ATIVA</span><strong>{roleNames[adminRole]}</strong><small>A seleção salva passa a ser o visual padrão para visitantes.</small></div><button type="button" className={styles.secondaryButton} onClick={() => void logout()} disabled={busy}><LogOut size={14} /> Encerrar sessão</button></>
            ) : (
              <><div className={styles.accessCopy}><span className={styles.accessLabel}>PUBLICAÇÃO CENTRAL CONECTADA</span><strong>Autentique-se para alterar o site público.</strong><small>Use a chave protegida atribuída a Marcelo ou TI. Ela não é armazenada no navegador.</small></div><form className={styles.loginForm} onSubmit={login}><label htmlFor="admin-token">Chave administrativa<input id="admin-token" name="token" type="password" autoComplete="current-password" required minLength={32} value={accessToken} onChange={event => setAccessToken(event.target.value)} /></label><button type="submit" className={styles.secondaryButton} disabled={busy}>{busy ? "Verificando…" : "Entrar"}</button></form></>
            )}
          </div>
        ) : storageMode === "local" ? (
          <div className={styles.notice} role="note"><ShieldAlert size={19} /><p><strong>Modo de demonstração local:</strong> o servidor ainda não está conectado ao PostgreSQL. Você pode testar os dez visuais neste navegador; a alteração não é compartilhada com outros visitantes. Para publicação central, configure o banco, execute a migração e defina as credenciais de Marcelo/TI no ambiente do servidor.</p></div>
        ) : (
          <div className={styles.notice} role="status"><Palette size={19} /><p>Carregando a configuração e verificando o acesso administrativo…</p></div>
        )}

        {savedMessage && <p className={styles.savedMessage} role="status"><Check size={15} /> {savedMessage} <a href="/">Ver site</a></p>}
        {errorMessage && <p className={styles.errorMessage} role="alert">{errorMessage}</p>}

        <div className={styles.grid}>
          {SITE_VISUAL_OPTIONS.map(option => {
            const isActive = ready && activeVisual === option.id;
            return (
              <article key={option.id} className={`${styles.visualCard} ${isActive ? styles.visualCardActive : ""}`}>
                <div className={styles.previewArt} data-layout={option.id} aria-hidden="true">
                  <span className={styles.previewIndex}>{option.id}</span>
                  <span className={styles.previewLine} />
                  <span className={styles.previewBlock} />
                  <span className={styles.previewDot} />
                </div>
                <div className={styles.cardInfo}>
                  <div className={styles.cardTitleRow}><span className={styles.cardNumber}>LAYOUT {option.id}</span>{isActive && <span className={styles.activePill}><Check size={11} /> ATIVO</span>}</div>
                  <h2>{option.name}</h2>
                  <p>{option.descriptor}</p>
                  <div className={styles.cardActions}>
                    <button type="button" className={styles.applyButton} disabled={!canApply || isActive || busy} onClick={() => void applyVisual(option.id)}>{isActive ? "Ativo" : storageMode === "central" && !adminRole ? "Requer acesso" : busy ? "Salvando…" : storageMode === "central" ? "Publicar visual" : "Aplicar nesta prévia"}</button>
                    <a className={styles.previewLink} href={option.previewPath} target="_blank" rel="noreferrer" aria-label={`Abrir prévia do Layout ${option.id} em outra aba`}><ExternalLink size={14} /> Prévia</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <footer className={styles.footer}><span>{storageMode === "central" ? "A configuração é única para o site e toda alteração administrativa fica registrada." : "A demonstração usa armazenamento local; autenticação e publicação central dependem do servidor."}</span><a href="/">Voltar ao visual ativo <ArrowLeft size={13} /></a></footer>
      </section>
    </main>
  );
}
