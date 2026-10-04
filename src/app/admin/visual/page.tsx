import type { Metadata } from "next";
import AdminGate from "../AdminGate";
import VisualEditorWorkspace from "./VisualEditorWorkspace";

export const metadata: Metadata = {
  title: "Editor visual avançado — Administração | Grupo SEG System",
  description: "Tokens e layouts versionados com prévia interna e publicação auditada.",
  robots: { index: false, follow: false },
};

export default function VisualAdminPage() {
  return (
    <AdminGate allowedRoles={["ti", "admin"]}>
      <VisualEditorWorkspace />
    </AdminGate>
  );
}
