import QualidadeWorkspace from "./QualidadeWorkspace";
import AdminGate from "../AdminGate";
export const metadata={title:"Qualidade | Grupo SEG System",description:"Não conformidades, causas, ações, verificações e reincidências internas."};
export default function QualidadePage(){return (
    <AdminGate allowedRoles={["marcelo", "admin", "ti"]}>
      <QualidadeWorkspace />
    </AdminGate>
  );}
