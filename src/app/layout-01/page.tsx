import type { Metadata } from "next";
import Layout01 from "@/components/Layout01";
import SitePreviewNotice from "@/components/SitePreviewNotice";

export const metadata: Metadata = {
  title: "Layout 01 — Institucional clássica | Grupo SEG System",
  description: "Prévia visual original da proposta institucional clássica do Grupo SEG System.",
  robots: { index: false, follow: false },
};

export default function Layout01Page() {
  return (
    <>
      <SitePreviewNotice visual="01" />
      <Layout01 />
    </>
  );
}
