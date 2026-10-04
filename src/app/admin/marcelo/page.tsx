import type { Metadata } from "next";
import AdminGate from "../AdminGate";
import MarceloPanel from "./MarceloPanel";

export const metadata: Metadata = { title: "Painel do Marcelo | SEG System", robots: { index: false, follow: false } };

// ADM-01..12: a página deixou de ser um protótipo descritivo. Os cartões são
// calculados por /api/adm/panel/* a partir de registros canônicos, com
// autorização decidida no servidor (leitura admin/marcelo/ti; escrita
// admin/marcelo). F01: o anônimo agora é levado ao login central com retorno
// a este endereço, e papéis sem acesso (ex.: rh) veem o estado 403 claro em
// vez de estrutura com erros — a API segue negando da mesma forma.
export default function MarceloDashboardPage() {
  return (
    <AdminGate allowedRoles={["marcelo", "admin", "ti"]}>
      <MarceloPanel />
    </AdminGate>
  );
}
