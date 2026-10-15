import type { Metadata } from "next";
import Layout04 from "@/components/Layout04";
import SitePreviewNotice from "@/components/SitePreviewNotice";

export const metadata: Metadata = {
  title: "Layout 04 — Operação | Grupo SEG System",
  description: "Prévia visual robusta para operações industriais e empresariais.",
  robots: { index: false, follow: false },
};

export default function Layout04Page() {
  return (
    <>
      <SitePreviewNotice visual="04" />
      <Layout04 />
    </>
  );
}
