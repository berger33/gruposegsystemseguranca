import ComplianceWorkspace from "./ComplianceWorkspace";
import AdminGate from "../AdminGate";
export const metadata={title:"Compliance | Grupo SEG System",robots:{index:false,follow:false}};
export default function CompliancePage(){return (
    <AdminGate allowedRoles={["marcelo", "admin", "ti"]}>
      <ComplianceWorkspace />
    </AdminGate>
  );}
