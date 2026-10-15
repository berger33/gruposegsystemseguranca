import type { Metadata } from "next";
import Layout09 from "@/components/Layout09";
import SitePreviewNotice from "@/components/SitePreviewNotice";

export const metadata: Metadata = {
  title: "Layout 09 — Briefing guiado | Grupo SEG System",
  description: "Prévia interativa para iniciar uma conversa sobre segurança com contexto.",
  robots: { index: false, follow: false },
};

export default function Layout09Page() {
  return (
    <>
      <SitePreviewNotice visual="09" />
      <Layout09 />
    </>
  );
}
