import type { Metadata } from "next";
import PatrimonioWorkspace from "./PatrimonioWorkspace";

export const metadata: Metadata = {
  title: "Patrimônio & Almoxarifado | SEG System",
  robots: { index: false, follow: false },
};

export default function PatrimonioPage() {
  return <PatrimonioWorkspace />;
}
