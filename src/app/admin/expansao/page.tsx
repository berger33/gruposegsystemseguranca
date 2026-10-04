import { ExpansionWorkspace } from "./ExpansionWorkspace";
import AdminGate from "../AdminGate";

export const metadata = {
  title: "Expansão e Novas Unidades | Grupo SEG System",
  robots: { index: false, follow: false },
};

export default function AdminExpansaoPage() {
  return (
    <AdminGate allowedRoles={["comercial", "financeiro", "marcelo", "admin", "ti"]}>
      <ExpansionWorkspace />
    </AdminGate>
  );
}
