import RealAccessShell from "../RealAccessShell";
import { ClientSpaceProvider } from "./ClientSpaceProvider";
import ClientAppFrame from "./ClientAppFrame";

// Layout da área real protegida do cliente: a navegação e o provedor de sessão
// cercam todas as sub-rotas (visão geral, contratos, documentos e chamados).
export default function ClientAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealAccessShell>
      <ClientSpaceProvider>
        <ClientAppFrame>{children}</ClientAppFrame>
      </ClientSpaceProvider>
    </RealAccessShell>
  );
}
