"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import UiState from "@/components/ui/UiState";

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
import {
  callApi,
  comoAdminApiError,
  recursoInicial,
  resolverLeitura,
  type AdminAccount,
  type Recurso,
} from "./admin-shared";
import styles from "./AdminClientes.module.css";

// Painel operacional da etapa 2: gestão dos cadastros centrais, vínculos (grants),
// contratos, documentos e chamados. F01: o formulário de login local (com o
// rótulo equivocado "E-mail individual de TI" e a aba permanente de chave
// legada) deu lugar ao gate central: anônimo vai a /admin/entrar com retorno,
// conta individual é o padrão e a chave legada só é oferecida quando habilitada
// no servidor. Papéis desta área continuam marcelo|ti, exatamente como a API
// /api/admin/client-* impõe no servidor.
//
// UX-PRO-06 (14/10/2026) — estados da leitura dos cadastros centrais. Antes, a
// leitura de `GET /api/admin/client-accounts` engolia qualquer erro: sem leitura
// concluída a seção 1 girava "Carregando cadastros…" para sempre (falha
// apresentada como carregamento); depois de uma leitura concluída, a falha de
// releitura deixava a lista antiga na tela sem aviso; e uma NEGATIVA (401/403)
// mantinha os cadastros — nomes de clientes — visíveis, falhando ABERTO na tela.
// Agora a leitura tem estado honesto (mesmo padrão das fatias #212–#217):
//  1. nunca houve leitura concluída → carregando, ou falha declarada com repetição;
//  2. releitura EM CURSO com leitura anterior → `role="status"`, conteúdo visível;
//  3. falha TRANSITÓRIA depois de uma leitura → faixa `role="alert"` com o motivo,
//     a hora da última leitura concluída (relógio do navegador; nada é gravado)
//     e repetição, preservando o que foi lido;
//  4. negativa de autorização → falha FECHADA: descarta o dado e substitui o
//     conteúdo pelo estado negado, sem oferecer repetir a mesma chamada.
// Nenhuma URL, método, corpo, papel, permissão ou campo mudou.
function ClientAdminWorkspace({ role }: { role: string }) {
  const [cadastros, setCadastros] = useState<Recurso<AdminAccount[]>>(recursoInicial<AdminAccount[]>);

  const loadAccounts = useCallback(async () => {
    // Começar a reler NÃO é perder o dado: o que já foi lido só sai da tela se
    // a falha for de autorização (ver resolverLeitura).
    setCadastros(atual => ({ ...atual, carregando: true, erro: null, falhaAtualizacao: null }));
    const resultado = await callApi("/api/admin/client-accounts")
      .then(data => ({ ok: true as const, dado: (data.accounts as AdminAccount[]) ?? [] }))
      .catch(causa => ({ ok: false as const, error: comoAdminApiError(causa, "Não foi possível ler os cadastros centrais.") }));
    setCadastros(atual => resolverLeitura(atual, resultado));
  }, []);

  // Carregamento inicial após o gate autorizar a sessão.
  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const negado = cadastros.erro?.negado ?? false;
  const sessaoCaiu = cadastros.erro?.kind === "auth";

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
      {negado ? (
        // Autorização negada: nada de cadastro permanece na tela e não há
        // repetição da mesma chamada — o servidor decidiu, a tela acata.
        <div className={styles.card} data-testid="clientes-cadastros-negado">
          <UiState
            variant="denied"
            title={sessaoCaiu ? "Sua sessão administrativa não está mais ativa." : "Sua conta não tem acesso a esta área."}
            detail={`${cadastros.erro?.message ?? ""} A leitura anterior não é exibida: sem autorização, esta tela não mostra cadastros, vínculos nem chamados.`.trim()}
          />
        </div>
      ) : (
        <>
          {cadastros.erro ? (
            // Sem leitura concluída, as seções 2–7 lêem `accounts ?? []`: o
            // aviso declara por que os seletores delas estão vazios.
            <p role="alert" data-testid="clientes-cadastros-indisponivel" className={styles.unavailable}>
              A lista de cadastros centrais não pôde ser lida. Os seletores das seções 2–7 (vínculos, contratos,
              documentos, chamados, visitas e relatórios) ficam vazios enquanto isso não for resolvido — use
              “Tentar novamente” na seção 1.
            </p>
          ) : null}
          {role === "ti" ? <><InvitesSection /><RecoveriesSection /></> : null}
          <AccountsSection leitura={cadastros} reloadAccounts={loadAccounts} />
          <GrantsSection accounts={cadastros.dado} />
          <ContractsSection accounts={cadastros.dado} />
          <DocumentsSection accounts={cadastros.dado} />
          <TicketsSection accounts={cadastros.dado} />
          <VisitsSection accounts={cadastros.dado} />
          <ReportsSection accounts={cadastros.dado} />
        </>
      )}
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
