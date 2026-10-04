import type { Metadata } from "next";
import ComercialWorkspace from "./ComercialWorkspace";
import AdminGate from "../AdminGate";

export const metadata: Metadata = {
  title: "Comercial | SEG System",
  robots: { index: false, follow: false },
};

export default function AdminComercialPage() {
  return (
    <AdminGate allowedRoles={["comercial", "marcelo", "admin", "ti"]}>
      <ComercialWorkspace />
    </AdminGate>
  );
}
