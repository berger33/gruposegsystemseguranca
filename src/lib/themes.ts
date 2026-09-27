// Catálogo de apresentações. Conteúdo, serviços e fluxos vêm da mesma fonte.
export const THEMES = [
  { id: "classico", number: "01", name: "Institucional clássica", style: "Clara · corporativa", lead: "Segurança para o que", accent: "realmente importa." },
  { id: "tecnologia", number: "02", name: "Central tecnológica", style: "Escura · operacional", lead: "Tecnologia a serviço da", accent: "sua tranquilidade." },
  { id: "minimalista", number: "03", name: "Essencial", style: "Editorial · espaço livre", lead: "Proteção sem", accent: "complicações." },
  { id: "humano", number: "04", name: "Proximidade", style: "Acolhedora · orgânica", lead: "Cuidar de pessoas é o", accent: "nosso ponto de partida." },
  { id: "industrial", number: "05", name: "Operação robusta", style: "Estrutural · alto contraste", lead: "Sua operação merece", accent: "proteção à altura." },
  { id: "corporativo", number: "06", name: "Institucional B2B", style: "Formal · documental", lead: "Confiança para operações", accent: "que não podem parar." },
  { id: "editorial", number: "07", name: "Perspectiva", style: "Revista · conteúdo", lead: "Um olhar atento faz", accent: "toda a diferença." },
  { id: "mobile", number: "08", name: "Conexão", style: "Cards · app-first", lead: "Sua segurança, mais", accent: "perto de você." },
  { id: "indicadores", number: "09", name: "Visão estratégica", style: "Painel · informação", lead: "Cada detalhe conta na", accent: "sua proteção." },
  { id: "campanha", number: "10", name: "Impacto", style: "Campanha · expressiva", lead: "Mais presença. Mais", accent: "segurança." },
] as const;

export type Theme = (typeof THEMES)[number]["id"];
