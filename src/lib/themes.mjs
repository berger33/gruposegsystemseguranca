/**
 * Theme engine para 10 interfaces (Camada 1 / Marcelo escolhe pelo painel).
 * Cada tema é um conjunto de tokens CSS; o mesmo layout de componentes
 * se adapta via variáveis. Nenhum dado de demonstração real inserido.
 */
export const THEMES = [
  { id: "institucional", name: "Institucional clássico", desc: "Paleta sóbria, serifada, formal — ideal para licitações e B2B." },
  { id: "minimalista", name: "Minimalista", desc: "Branco, preto, pouco cor; foco em conteúdo e velocidade." },
  { id: "tech", name: "Tech / Monitoramento", desc: "Dark, referências a câmeras e central de monitoramento." },
  { id: "acolhedor", name: "Acolhedor / Humano", desc: "Tons quentes, fotos de equipe, arredondado — confiança humana." },
  { id: "industrial", name: "Industrial / Robusto", desc: "Metálico, concreto, tipografia condensada — força operacional." },
  { id: "formal-b2b", name: "Formal B2B", desc: "Circunspecto, cores profundas, hierarquia clara — vendas corporativas." },
  { id: "editorial", name: "Editorial / Blog", desc: "Tipografia editorial, destaque para conteúdo e casos." },
  { id: "app", name: "App / Mobile-first", desc: "Cards, gestos, sombra leve — experiência nativa em qualquer tela." },
  { id: "dashboard", name: "Dashboard / Métricas", desc: "Dados como protagonistas (postos ativos, câmeras, atendimentos)." },
  { id: "sazonal", name: "Sazonal / Campanha", desc: "Fácil de trocar banner e cores para promoção/feira/estação." },
];

export const DEFAULT_THEME = "institucional";

export function getThemeTokens(id) {
  const map = {
    institucional: { bg: "#f7f6f2", fg: "#1a1a2e", accent: "#8b6f3e", radius: "4px", font: "'Georgia', serif" },
    minimalista:   { bg: "#ffffff", fg: "#0a0a0a", accent: "#111111", radius: "2px", font: "'Inter', sans-serif" },
    tech:          { bg: "#0b0d12", fg: "#e8e8ee", accent: "#00d4aa", radius: "8px", font: "'JetBrains Mono', monospace" },
    acolhedor:     { bg: "#fdf8f3", fg: "#2e1810", accent: "#c27a4e", radius: "24px", font: "'Lora', serif" },
    industrial:    { bg: "#e4e2db", fg: "#1f2730", accent: "#7a6e5d", radius: "0px", font: "'Oswald', sans-serif" },
    "formal-b2b":  { bg: "#f3f1ec", fg: "#15192b", accent: "#2e3d5b", radius: "6px", font: "'Crimson Pro', serif" },
    editorial:     { bg: "#fffdf8", fg: "#1a1a1a", accent: "#bfa15f", radius: "6px", font: "'Libre Baskerville', serif" },
    app:           { bg: "#f4f6fa", fg: "#0f172a", accent: "#4f8ef7", radius: "16px", font: "'Inter', sans-serif" },
    dashboard:     { bg: "#0f1117", fg: "#f0f0f5", accent: "#f59e0b", radius: "8px", font: "'Inter', sans-serif" },
    sazonal:       { bg: "#fdfcf5", fg: "#221e1c", accent: "#e07a4e", radius: "12px", font: "'Inter', sans-serif" },
  };
  return map[id] || map.institucional;
}
