import type { Metadata } from "next";
import AdminGate from "../AdminGate";
import ReportsWorkspace from "./ReportsWorkspace";

export const metadata: Metadata = {
  title: "Relatórios periódicos — Administração | Grupo SEG System",
  description: "Consolidação de métricas internas por período com envio registrado e auditado.",
  robots: { index: false, follow: false },
};

export default function ReportsAdminPage() {
  return (
    <AdminGate allowedRoles={["ti", "admin"]}>
      <ReportsWorkspace />
    </AdminGate>
  );
}
