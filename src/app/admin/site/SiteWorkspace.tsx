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
  ["temas", "Temas & publicação"],
  ["seo", "SEO técnico & domínio"],
  ["pacotes", "Pacotes & comparador"],
  ["metricas", "Métricas de origem"],
];

const HINTS: Record<View, string> = {
  faq: "Respostas assistidas só a partir de conteúdo aprovado, com transferência para atendimento humano quando o assunto é sensível. Preço nunca é inventado pelo assistente.",
  conteudo: "Páginas, FAQ, cases, blog e vagas com rascunho, revisão, publicação autorizada, histórico e reversão.",
  temas: "Tema tem prévia, aprovação e publicação explícitas; rollback recria a versão anterior sem apagar histórico.",
  seo: "Títulos, descrições, canônica, sitemap, redirects e verificação de domínio. Publicar com noindex é recusado.",
  pacotes: "Montagem e comparação de pacotes a partir do catálogo validado, sempre sob regra de preço aprovada.",
  metricas: "Origem, campanha e conversão com minimização de dados: sem IP ou user-agent em claro. Teste A/B só com hipótese, tratamento e tráfego definidos.",
};

const card: React.CSSProperties = { border: "1px solid #dce4ee", borderRadius: 10, background: "#fff", overflowX: "auto" };

export default function SiteWorkspace() {
  const [view, setView] = useState<View>("faq");

  return (
    <main style={{ minHeight: "100vh", background: "#f3f6fa", fontFamily: "system-ui, sans-serif", color: "#17253b", overflowX: "hidden" }}>
      <header style={{ padding: "20px 24px", background: "#fff", borderBottom: "1px solid #dce4ee" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color: "#42699f", textTransform: "uppercase" }}>SEG System · Site público</span>
        <h1 style={{ margin: "6px 0 4px", fontSize: 28 }}>Conteúdo, tema, SEO e medição do site</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7b90", maxWidth: 820 }}>
          Área de TI/administração do site público. O funil comercial fica em{" "}
          <a href="/admin/crm">CRM</a> e a jornada de proposta em <a href="/admin/comercial">Comercial</a>.
          Requer sessão de staff com papel de TI ou administração.
        </p>
      </header>

      <nav aria-label="Áreas do site público" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 24px 0" }}>
        {TABS.map(([id, labelText]) => (
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
            {labelText}
          </button>
        ))}
      </nav>

      <div style={{ padding: 24, display: "grid", gap: 16, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "#6b7b90", maxWidth: 820 }}>{HINTS[view]}</p>
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
