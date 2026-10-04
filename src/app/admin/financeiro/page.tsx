import type { Metadata } from "next";
import FinanceiroWorkspace from "./FinanceiroWorkspace";
import AdminGate from "../AdminGate";

export const metadata: Metadata = { title: "Financeiro | SEG System", robots: { index: false, follow: false } };
export default function FinanceiroPage() { return (
    <AdminGate allowedRoles={["financeiro", "marcelo", "admin", "ti"]}>
      <FinanceiroWorkspace />
    </AdminGate>
  ); }
