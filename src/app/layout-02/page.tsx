import type { Metadata } from "next";
import Layout02 from "@/components/Layout02";
import SitePreviewNotice from "@/components/SitePreviewNotice";

export const metadata: Metadata = {
  title: "Layout 02 — Central | Grupo SEG System",
  description: "Prévia visual da interface tecnológica do Grupo SEG System.",
  robots: { index: false, follow: false },
};

export default function Layout02Page() {
  return (
    <>
      <SitePreviewNotice visual="02" />
      <Layout02 />
    </>
  );
}
