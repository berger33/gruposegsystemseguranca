import SatisfacaoWorkspace from "./SatisfacaoWorkspace";
import AdminGate from "../AdminGate";
export const metadata={title:"Satisfação | Grupo SEG System",description:"Pesquisas, respostas e acompanhamento com privacidade."};
export default function Page(){return (
    <AdminGate allowedRoles={["marcelo", "admin", "ti"]}>
      <SatisfacaoWorkspace />
    </AdminGate>
  );}
