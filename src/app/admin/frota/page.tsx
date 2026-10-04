import type { Metadata } from "next";
import FrotaWorkspace from "./FrotaWorkspace";
import AdminGate from "../AdminGate";

export const metadata: Metadata = {
  title: "Frota | SEG System",
  robots: { index: false, follow: false },
};

export default function FrotaPage() {
  return (
    <AdminGate allowedRoles={["marcelo", "admin", "ti"]}>
      <FrotaWorkspace />
    </AdminGate>
  );
}
