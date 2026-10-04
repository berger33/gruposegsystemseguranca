import type { Metadata } from "next";
import LicitacoesWorkspace from "./LicitacoesWorkspace";
import AdminGate from "../AdminGate";

export const metadata: Metadata = {
  title: "Licitações | SEG System",
  robots: { index: false, follow: false },
};

export default function LicitacoesPage() {
  return (
    <AdminGate allowedRoles={["marcelo", "admin", "ti"]}>
      <LicitacoesWorkspace />
    </AdminGate>
  );
}
