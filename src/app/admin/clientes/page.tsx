"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";

import { useCallback, useEffect, useState } from "react";
import AccountsSection from "./AccountsSection";
import GrantsSection from "./GrantsSection";
import ContractsSection from "./ContractsSection";
import DocumentsSection from "./DocumentsSection";
import TicketsSection from "./TicketsSection";
import VisitsSection from "./VisitsSection";
import ReportsSection from "./ReportsSection";
import InvitesSection from "./InvitesSection";
import RecoveriesSection from "./RecoveriesSection";
import AdminGate from "../AdminGate";
import { callApi, type AdminAccount } from "./admin-shared";
import styles from "./AdminClientes.module.css";

// Painel operacional da etapa 2: gestão dos cadastros centrais, vínculos (grants),
// contratos, documentos e chamados. F01: o formulário de login local (com o
// rótulo equivocado "E-mail individual de TI" e a aba permanente de chave
// legada) deu lugar ao gate central: anônimo vai a /admin/entrar com retorno,
// conta individual é o padrão e a chave legada só é oferecida quando habilitada
// no servidor. Papéis desta área continuam marcelo|ti, exatamente como a API
// /api/admin/client-* impõe no servidor.
function ClientAdminWorkspace({ role }: { role: string }) {
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await callApi("/api/admin/client-accounts");
      setAccounts((data.accounts as AdminAccount[]) ?? []);
    } catch {
      /* As seções exibem erro próprio quando necessário. */
    }
  }, []);

  // Carregamento inicial após o gate autorizar a sessão.
  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  return (
    <UiTaskWorkspace aria-labelledby="intro-title">
      <div className={styles.card} id="clientes-intro">
        <h1 id="intro-title" style={{ marginTop: 0 }}>
          Administração de clientes
        </h1>
        <p className={styles.hint}>
          Fluxo em ordem: <strong>1</strong> crie/verifique o cadastro central → <strong>2</strong> emita o vínculo
          com a identidade de acesso (com motivo) → <strong>3</strong> registre contratos → <strong>4</strong>{" "}
          publique documentos → <strong>5</strong> acompanhe os chamados → <strong>6</strong> agende visitas →{" "}
          <strong>7</strong> publique relatórios revisados. Cada operação relevante vai para a trilha de auditoria
          sem conter dados sensíveis.
        </p>
      </div>
      {role === "ti" ? <><InvitesSection /><RecoveriesSection /></> : null}
      <AccountsSection accounts={accounts} reloadAccounts={loadAccounts} />
      <GrantsSection accounts={accounts} />
      <ContractsSection accounts={accounts} />
      <DocumentsSection accounts={accounts} />
      <TicketsSection accounts={accounts} />
      <VisitsSection accounts={accounts} />
      <ReportsSection accounts={accounts} />
    </UiTaskWorkspace>
  );
}

export default function ClientAdminPage() {
  return (
    <AdminGate allowedRoles={["marcelo", "ti"]}>
      {(session) => <ClientAdminWorkspace key={session.identityId ?? session.role} role={session.role} />}
    </AdminGate>
  );
}
