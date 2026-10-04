import KnowledgeWorkspace from "./KnowledgeWorkspace";
import AdminGate from "../AdminGate";

export const metadata = {
  title: "Base de Conhecimento | Grupo SEG System",
  robots: { index: false, follow: false },
};

export default function KnowledgePage() {
  return (
    <AdminGate allowedRoles={["marcelo", "admin", "ti"]}>
      <KnowledgeWorkspace />
    </AdminGate>
  );
}
