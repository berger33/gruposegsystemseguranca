import RealAccessShell from "../RealAccessShell";
import { ClientSpaceProvider } from "./ClientSpaceProvider";
import ClientAppNavigation from "./ClientAppNavigation";
import appStyles from "./ClientApp.module.css";

// Layout da área real protegida do cliente: a navegação e o provedor de sessão
// cercam todas as sub-rotas (visão geral, contratos, documentos, chamados, agenda e relatórios).
export default function ClientAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealAccessShell>
      <ClientSpaceProvider>
        <div className={appStyles.wide}>
          <ClientAppNavigation />
          {children}
        </div>
      </ClientSpaceProvider>
    </RealAccessShell>
  );
}
