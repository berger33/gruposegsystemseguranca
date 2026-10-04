import AdminGate from "../AdminGate";
import PublicationClient from '../publicacao/PublicationClient';
export const metadata={title:'Temas | SEG System',robots:{index:false,follow:false}};
export default function Page(){return (
    <AdminGate allowedRoles={["marcelo", "ti", "admin"]}>
      <PublicationClient initialTab="temas" />
    </AdminGate>
  );}
