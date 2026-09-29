import type { Metadata } from "next";
import ComercialWorkspace from "./ComercialWorkspace";

export const metadata: Metadata = {
  title: "Comercial | SEG System",
  robots: { index: false, follow: false },
};

export default function AdminComercialPage() {
  return <ComercialWorkspace />;
}
