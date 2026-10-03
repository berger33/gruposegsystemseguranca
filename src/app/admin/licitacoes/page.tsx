import type { Metadata } from "next";
import LicitacoesWorkspace from "./LicitacoesWorkspace";

export const metadata: Metadata = {
  title: "Licitações | SEG System",
  robots: { index: false, follow: false },
};

export default function LicitacoesPage() {
  return <LicitacoesWorkspace />;
}
