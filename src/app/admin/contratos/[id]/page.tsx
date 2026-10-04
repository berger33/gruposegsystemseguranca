import type { Metadata } from "next";
import AdminGate from "../../AdminGate";
import ContractWorkflowClient from "./ContractWorkflowClient";

export const metadata: Metadata = { title: "Contrato | SEG System", robots: { index: false, follow: false } };

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // F01: mesmo gate da lista — anônimo vai ao login central e retorna a este
  // endereço; o servidor revalida escopo e leitura em cada /api/crm/contracts/*.
  return (
    <AdminGate allowedRoles={["marcelo", "admin", "comercial"]}>
      <ContractWorkflowClient id={id} />
    </AdminGate>
  );
}
