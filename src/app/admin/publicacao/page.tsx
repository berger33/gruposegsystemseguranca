import AdminGate from "../AdminGate";
import PublicationClient from './PublicationClient';
export const metadata={title:'Publicação do site | SEG System',robots:{index:false,follow:false}};
export default function Page(){return (
    <AdminGate allowedRoles={["marcelo", "ti", "comercial", "admin"]}>
      <PublicationClient />
    </AdminGate>
  );}
