import type { Metadata } from "next";
import Layout07 from "@/components/Layout07";
import SitePreviewNotice from "@/components/SitePreviewNotice";

export const metadata: Metadata = {
  title: "Layout 07 — Mapa de cuidado | Grupo SEG System",
  description: "Prévia interativa em formato de mapa para apresentar os serviços do Grupo SEG System.",
  robots: { index: false, follow: false },
};

export default function Layout07Page() {
  return (
    <>
      <SitePreviewNotice visual="07" />
      <Layout07 />
    </>
  );
}
