import AdminGate from "../AdminGate";
import { ContinuityWorkspace } from "./ContinuityWorkspace";
export const metadata={title:"Continuidade de Negócios | Grupo SEG System",robots:{index:false,follow:false}};
export default function Page(){return <AdminGate allowedRoles={["admin","ti","marcelo","operacao","supervisor"]}><ContinuityWorkspace/></AdminGate>;}
