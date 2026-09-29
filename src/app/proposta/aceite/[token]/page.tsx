import type { Metadata } from "next";
import AcceptanceClient from "./AcceptanceClient";

export const metadata: Metadata = {
  title: "Aceite de proposta | Grupo SEG System",
  robots: { index: false, follow: false },
};

export default async function ProposalAcceptancePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptanceClient token={token} />;
}
