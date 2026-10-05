import AdminGate from "../AdminGate";
import { PendencyWorkspace } from "./PendencyWorkspace";
export const metadata={title:"Pendências internas | Grupo SEG System",robots:{index:false,follow:false}};
export default function Page(){return <AdminGate allowedRoles={["admin","ti","marcelo","operacao","supervisor","rh","financeiro","comercial"]}><PendencyWorkspace/></AdminGate>;}
