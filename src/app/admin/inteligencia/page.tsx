import type { Metadata } from "next";
import AdminGate from "../AdminGate";
import IntelWorkspace from "./IntelWorkspace";

export const metadata: Metadata = {
  title: "Inteligência comercial — Administração | Grupo SEG System",
  description: "Sugestões comerciais explicadas com evidência do histórico interno e contato registrado após aprovação humana.",
  robots: { index: false, follow: false },
};

export default function IntelAdminPage() {
  return (
    <AdminGate allowedRoles={["ti", "admin"]}>
      <IntelWorkspace />
    </AdminGate>
  );
}
