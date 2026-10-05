import type { Metadata } from "next";
import AdminGate from "../AdminGate";
import EmergencyWorkspace from "./EmergencyWorkspace";

export const metadata: Metadata = {
  title: "Apoio emergencial — Administração | Grupo SEG System",
  description: "Configuração e testes internos declarados dos canais de apoio emergencial.",
  robots: { index: false, follow: false },
};

export default function EmergencyAdminPage() {
  return <AdminGate allowedRoles={["ti", "admin"]}><EmergencyWorkspace /></AdminGate>;
}
