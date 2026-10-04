import type { Metadata } from "next";
import OperacaoWorkspace from "./OperacaoWorkspace";
import AdminGate from "../AdminGate";

export const metadata: Metadata = {
  title: "Operação | SEG System",
  robots: { index: false, follow: false },
};

export default function OperacaoPage() {
  return (
    <AdminGate allowedRoles={["supervisor", "marcelo", "admin", "ti"]}>
      <OperacaoWorkspace />
    </AdminGate>
  );
}
