import type { Metadata } from "next";
import ClientRequestsPreview from "./ClientRequestsPreview";

export const metadata: Metadata = {
  title: "Prévia de chamados | Grupo SEG System",
  description: "Demonstração local do fluxo de solicitações do portal do cliente.",
};

export default function ClientRequestsPage() {
  return <ClientRequestsPreview />;
}
