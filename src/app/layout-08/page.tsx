import type { Metadata } from "next";
import Layout08 from "@/components/Layout08";
import SitePreviewNotice from "@/components/SitePreviewNotice";

export const metadata: Metadata = {
  title: "Layout 08 — Núcleo integrado | Grupo SEG System",
  description: "Prévia de segurança integrada em um diagrama circular interativo.",
  robots: { index: false, follow: false },
};

export default function Layout08Page() {
  return (
    <>
      <SitePreviewNotice visual="08" />
      <Layout08 />
    </>
  );
}
