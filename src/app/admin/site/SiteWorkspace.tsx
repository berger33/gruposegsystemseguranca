"use client";
import { useState } from "react";
import PubFaqAssistedClient from "../ti/PubFaqAssistedClient";
import CmsClient from "../ti/CmsClient";
import ThemeClient from "../ti/ThemeClient";
import SeoClient from "../ti/SeoClient";
import PackageClient from "../ti/PackageClient";
import OriginMetricsClient from "../ti/OriginMetricsClient";

type View = "faq" | "conteudo" | "temas" | "seo" | "pacotes" | "metricas";

const TABS: [View, string][] = [
  ["faq", "FAQ assistida & segmentos"],
  ["conteudo", "Conteúdo (CMS)"],
  ["temas", "Temas"],
  ["seo", "SEO & domínio"],
  ["pacotes", "Pacotes & comparador"],
  ["metricas", "Métricas de origem"],
];

const HINTS: Record<View, string> = {
  faq: "Regras da FAQ assistida com transferência para atendimento humano, páginas por segmento e verificações de desempenho/acessibilidade (PUB-02/PUB-05).",
  conteudo: "Páginas, FAQ, cases, blog e vagas com rascunho, revisão, publicação, histórico e reversão (PUB-06).",
  temas: "Versões de tema com preview, aprovação, publicação autorizada, rollback e preferência dia/noite separada (PUB-07).",
  seo: "Títulos, descrições, canônicas, sitemap, redirects e verificação de domínio — noindex é preservado até a publicação autorizada (PUB-08).",
  pacotes: "Montador de pacote a partir do catálogo validado e comparador entre pacotes; demonstração nunca é publicada (PUB-09).",
  metricas: "Origem, campanha e conversão com minimização de dados; testes A/B só com hipótese, tratamento e tráfego definidos (PUB-10).",
};

const card: React.CSSProperties = { border: "1px solid #dce4ee", borderRadius: 10, background: "#fff", overflowX: "auto" };

export default function SiteWorkspace() {
  const [view, setView] = useState<View>("faq");

  return (
    <main style={{ minHeight: "100vh", background: "#f3f6fa", fontFamily: "system-ui, sans-serif", color: "#17253b", overflowX: "hidden" }}>
      <header style={{ padding: "20px 24px", background: "#fff", borderBottom: "1px solid #dce4ee" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "#42699f", textTransform: "uppercase" }}>SEG System · Site público</span>
        <h1 style={{ margin: "6px 0 4px", fontSize: 28 }}>Conteúdo, tema, SEO, pacotes e métricas</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7b90" }}>
          Administração do site público. Requer papel de TI ou administração. O funil comercial fica em{" "}
          <a href="/admin/crm">CRM</a> e <a href="/admin/comercial">Comercial</a>.
        </p>
      </header>

      <nav aria-label="Áreas do site público" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 24px 0" }}>
        {TABS.map(([id, text]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            aria-pressed={view === id}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: view === id ? "2px solid #0b5fff" : "1px solid #ccd7e4",
              background: view === id ? "#eff6ff" : "#fff",
              color: "#17253b",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {text}
          </button>
        ))}
      </nav>

      <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: "100%" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7b90" }}>{HINTS[view]}</p>
        {view === "faq" && <section style={card}><PubFaqAssistedClient /></section>}
        {view === "conteudo" && <section style={card}><CmsClient /></section>}
        {view === "temas" && <section style={card}><ThemeClient /></section>}
        {view === "seo" && <section style={card}><SeoClient /></section>}
        {view === "pacotes" && <section style={card}><PackageClient /></section>}
        {view === "metricas" && <section style={card}><OriginMetricsClient /></section>}
      </div>
    </main>
  );
}
