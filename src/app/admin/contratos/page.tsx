import type { Metadata } from "next";
import ContractWorkspace from "./ContractWorkspace";

export const metadata: Metadata = {
  title: "Contratos | SEG System",
  robots: { index: false, follow: false },
};

export default function ContractsPage() {
  return <ContractWorkspace />;
}
