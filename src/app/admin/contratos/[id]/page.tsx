import type { Metadata } from "next";
import ContractWorkflowClient from "./ContractWorkflowClient";

export const metadata: Metadata = { title: "Contrato | SEG System", robots: { index: false, follow: false } };

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractWorkflowClient id={id} />;
}
