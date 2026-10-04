import type { Metadata } from "next";
import TerceirosWorkspace from "./TerceirosWorkspace";
import AdminGate from "../AdminGate";

export const metadata: Metadata = {
  title: "Terceiros | SEG System",
  robots: { index: false, follow: false },
};

export default function TerceirosPage() {
  return (
    <AdminGate allowedRoles={["marcelo", "admin", "ti"]}>
      <TerceirosWorkspace />
    </AdminGate>
  );
}
