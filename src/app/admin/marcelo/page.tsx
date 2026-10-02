import type { Metadata } from "next";
import MarceloPanel from "./MarceloPanel";

export const metadata: Metadata = { title: "Painel do Marcelo | SEG System", robots: { index: false, follow: false } };

// ADM-01..12: a página deixou de ser um protótipo descritivo. Os cartões são
// calculados por /api/adm/panel/* a partir de registros canônicos, com
// autorização decidida no servidor.
export default function MarceloDashboardPage() {
  return <MarceloPanel />;
}
