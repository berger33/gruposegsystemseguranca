import type { Metadata } from "next";
import PatrimonioWorkspace from "./PatrimonioWorkspace";
import AdminGate from "../AdminGate";

export const metadata: Metadata = {
  title: "Patrimônio & Almoxarifado | SEG System",
  robots: { index: false, follow: false },
};

export default function PatrimonioPage() {
  return (
    <AdminGate allowedRoles={["supervisor", "marcelo", "admin", "ti"]}>
      <PatrimonioWorkspace />
    </AdminGate>
  );
}
