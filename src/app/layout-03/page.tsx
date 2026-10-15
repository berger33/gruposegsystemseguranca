import type { Metadata } from "next";
import Layout03 from "@/components/Layout03";
import SitePreviewNotice from "@/components/SitePreviewNotice";

export const metadata: Metadata = {
  title: "Layout 03 — Presença | Grupo SEG System",
  description: "Prévia visual editorial e humana do Grupo SEG System.",
  robots: { index: false, follow: false },
};

export default function Layout03Page() {
  return (
    <>
      <SitePreviewNotice visual="03" />
      <Layout03 />
    </>
  );
}
