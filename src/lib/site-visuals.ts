export type SiteVisualId = "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10";

export const SITE_VISUAL_STORAGE_KEY = "seg-site-visual-v1";
export const DEFAULT_SITE_VISUAL: SiteVisualId = "06";

export const SITE_VISUAL_OPTIONS: Array<{
  id: SiteVisualId;
  name: string;
  descriptor: string;
  previewPath: string;
}> = [
  { id: "01", name: "Institucional clássica", descriptor: "Apresentação institucional clara e tradicional.", previewPath: "/layout-01" },
  { id: "02", name: "Central tecnológica", descriptor: "Azul profundo, precisão e linguagem de monitoramento.", previewPath: "/layout-02" },
  { id: "03", name: "Presença humana", descriptor: "Composição editorial acolhedora e próxima.", previewPath: "/layout-03" },
  { id: "04", name: "Operação industrial", descriptor: "Estrutura robusta com referências operacionais.", previewPath: "/layout-04" },
  { id: "05", name: "Institucional B2B", descriptor: "Tom corporativo e hierarquia executiva.", previewPath: "/layout-05" },
  { id: "06", name: "Azul em camadas", descriptor: "Geometria editorial em azul-cobalto e azul-celeste.", previewPath: "/layout-06" },
  { id: "07", name: "Mapa de cuidado", descriptor: "Navegação em painel com leitura por áreas.", previewPath: "/layout-07" },
  { id: "08", name: "Núcleo integrado", descriptor: "Diagrama circular conceitual e interativo.", previewPath: "/layout-08" },
  { id: "09", name: "Briefing guiado", descriptor: "Fluxo progressivo para iniciar uma conversa.", previewPath: "/layout-09" },
  { id: "10", name: "Linha de cuidado", descriptor: "Frentes independentes ao longo de um eixo visual.", previewPath: "/layout-10" },
];

export function isSiteVisualId(value: string | null | undefined): value is SiteVisualId {
  return !!value && SITE_VISUAL_OPTIONS.some(option => option.id === value);
}
