import type { Metadata } from "next";
import ContractWorkspace from "./ContractWorkspace";
import AdminGate from "../AdminGate";

export const metadata: Metadata = {
  title: "Contratos | SEG System",
  robots: { index: false, follow: false },
};

export default function ContractsPage() {
  return (
    <AdminGate allowedRoles={["marcelo", "admin", "comercial"]}>
      <ContractWorkspace />
    </AdminGate>
  );
}
