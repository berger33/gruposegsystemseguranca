"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, ExternalLink, Palette, ShieldAlert } from "lucide-react";
import {
  DEFAULT_SITE_VISUAL,
  isSiteVisualId,
  SITE_VISUAL_OPTIONS,
  SITE_VISUAL_STORAGE_KEY,
  type SiteVisualId,
} from "@/lib/site-visuals";
import styles from "./VisualAdmin.module.css";

export default function VisualAdmin() {
  const [activeVisual, setActiveVisual] = useState<SiteVisualId>(DEFAULT_SITE_VISUAL);
  const [ready, setReady] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SITE_VISUAL_STORAGE_KEY);
      if (isSiteVisualId(stored)) setActiveVisual(stored);
    } catch {
      setSavedMessage("O navegador não permitiu ler o armazenamento local.");
    }
    setReady(true);
  }, []);

  function applyVisual(id: SiteVisualId) {
    setActiveVisual(id);
    setSavedMessage("");
    try {
      window.localStorage.setItem(SITE_VISUAL_STORAGE_KEY, id);
      window.dispatchEvent(new CustomEvent("seg-site-visual-updated", { detail: id }));
      setSavedMessage(`Layout ${id} ficará ativo neste navegador.`);
    } catch {
      setSavedMessage("Não foi possível salvar esta escolha neste navegador.");
    }
  }

  return (
    <main className={styles.adminPage}>
      <header className={styles.header}>
        <a href="/" className={styles.backLink}><ArrowLeft size={15} /> Voltar ao site</a>
        <span className={styles.headerLabel}><Palette size={15} /> APARÊNCIA DO SITE</span>
      </header>
      <section className={styles.content}>
        <div className={styles.headingRow}>
          <div>
            <span className={styles.eyebrow}>MÓDULO DE ADMINISTRAÇÃO · PRÉVIA</span>
            <h1>Escolha o visual<br /><em>do site público.</em></h1>
            <p>As dez propostas aprovadas podem ser alternadas. O layout 06 é o padrão inicial; a escolha abaixo atualiza a página inicial desta prévia.</p>
          </div>
          <div className={styles.currentCard} aria-live="polite">
            <span>VISUAL ATIVO NESTE NAVEGADOR</span>
            <strong>{ready ? activeVisual : DEFAULT_SITE_VISUAL}</strong>
            <small>{SITE_VISUAL_OPTIONS.find(option => option.id === activeVisual)?.name || "Azul em camadas"}</small>
          </div>
        </div>

        <div className={styles.notice} role="note">
          <ShieldAlert size={19} />
          <p><strong>Limite desta prévia:</strong> a seleção é guardada apenas neste navegador, sem autenticação nem publicação central. Para que a escolha afete todos os visitantes, será necessário ligar este módulo ao acesso protegido de Marcelo/TI e a uma configuração persistente no servidor.</p>
        </div>
        {savedMessage && <p className={styles.savedMessage} role="status"><Check size={15} /> {savedMessage} <a href="/">Ver site</a></p>}

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
                    <button type="button" className={styles.applyButton} disabled={isActive} onClick={() => applyVisual(option.id)}>{isActive ? "Ativo neste navegador" : "Aplicar visual"}</button>
                    <a className={styles.previewLink} href={option.previewPath} target="_blank" rel="noreferrer" aria-label={`Abrir prévia do Layout ${option.id} em outra aba`}><ExternalLink size={14} /> Prévia</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <footer className={styles.footer}><span>O conteúdo e os fluxos permanecem os mesmos quando um layout é selecionado.</span><a href="/">Voltar ao visual ativo <ArrowLeft size={13} /></a></footer>
      </section>
    </main>
  );
}
