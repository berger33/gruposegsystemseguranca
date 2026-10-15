import type { Metadata } from "next";
import Layout05 from "@/components/Layout05";
import SitePreviewNotice from "@/components/SitePreviewNotice";

export const metadata: Metadata = {
  title: "Layout 05 — B2B | Grupo SEG System",
  description: "Prévia institucional B2B do Grupo SEG System.",
  robots: { index: false, follow: false },
};

export default function Layout05Page() {
  return (
    <>
      <SitePreviewNotice visual="05" />
      <Layout05 />
    </>
  );
}
