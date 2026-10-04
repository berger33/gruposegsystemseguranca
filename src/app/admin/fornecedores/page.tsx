import FornecedoresWorkspace from "./FornecedoresWorkspace";
import AdminGate from "../AdminGate";

export const metadata = {
  title: "Fornecedores | Grupo SEG System",
  description: "Jornada interna de cotações, referências documentais e pedidos de fornecedores.",
};

export default function FornecedoresPage() {
  return (
    <AdminGate allowedRoles={["marcelo", "admin", "ti"]}>
      <FornecedoresWorkspace />
    </AdminGate>
  );
}
