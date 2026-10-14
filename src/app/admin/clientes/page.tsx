"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { readApi, type AdminAccount, type AdminReadError } from "./admin-shared";
import styles from "./AdminClientes.module.css";

// Painel operacional da etapa 2: gestão dos cadastros centrais, vínculos (grants),
// contratos, documentos e chamados. F01: o formulário de login local (com o
// rótulo equivocado "E-mail individual de TI" e a aba permanente de chave
// legada) deu lugar ao gate central: anônimo vai a /admin/entrar com retorno,
// conta individual é o padrão e a chave legada só é oferecida quando habilitada
// no servidor. Papéis desta área continuam marcelo|ti, exatamente como a API
// /api/admin/client-* impõe no servidor.
//
// UX-PRO-06: a leitura dos cadastros centrais passou a declarar o próprio
// estado. Antes ela terminava em `catch {}` silencioso — a falha depois de uma
// leitura concluída deixava a lista antiga na tela como se estivesse atual, a
// falha na primeira leitura virava "Carregando cadastros…" eterno e as outras
// sete seções mostravam seletores vazios, e a negativa (401/403) mantinha o dado
// lido antes como se o acesso estivesse autorizado. A URL, o método, os papéis,
// as escritas e as props das seções não mudaram.

/** Hora da última leitura concluída, para a faixa de dados desatualizados.
 *  Derivada do relógio do navegador no instante do sucesso — nenhum valor é
 *  estimado nem gravado em banco. */
function formatReadAt(value: number | null) {
  if (value === null) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

type AccountsRead = {
  /** Cadastros da última leitura concluída; `null` enquanto nenhuma concluiu. */
  itens: AdminAccount[] | null;
  carregando: boolean;
  concluiu: boolean;
  ultimaLeitura: number | null;
  /** Falha transitória SEM leitura concluída anterior: nada a preservar. */
  falha: AdminReadError | null;
  /** Falha transitória DEPOIS de leitura concluída: `itens` é preservado. */
  falhaAtualizacao: AdminReadError | null;
  /** Dúvida de autorização (401/403): o dado é descartado e a tela falha fechada. */
  negada: AdminReadError | null;
};

const leituraInicial: AccountsRead = {
  itens: null,
  carregando: true,
  concluiu: false,
  ultimaLeitura: null,
  falha: null,
  falhaAtualizacao: null,
  negada: null,
};

function ClientAdminWorkspace({ role }: { role: string }) {
  const [leitura, setLeitura] = useState<AccountsRead>(leituraInicial);
  // Uma leitura concluída não é apagada pela falha seguinte. O ref marca que JÁ
  // existiu sucesso sem causar recarga em cascata nas sete seções.
  const leuRef = useRef(false);

  const loadAccounts = useCallback(async () => {
    setLeitura(atual => ({ ...atual, carregando: true }));
    const resultado = await readApi<{ accounts?: AdminAccount[] }>("/api/admin/client-accounts");
    if (!resultado.ok) {
      const { error } = resultado;
      // Dúvida de autorização é diferente de falha transitória: ali o conteúdo
      // é descartado e a apresentação falha fechada, sem convidar a repetir a
      // mesma chamada com a mesma sessão.
      if (error.kind === "denied" || error.kind === "auth") {
        leuRef.current = false;
        setLeitura({ ...leituraInicial, carregando: false, negada: error });
        return;
      }
      if (leuRef.current) {
        setLeitura(atual => ({ ...atual, carregando: false, falha: null, falhaAtualizacao: error }));
        return;
      }
      setLeitura(atual => ({ ...atual, itens: null, carregando: false, concluiu: false, falha: error, falhaAtualizacao: null }));
      return;
    }
    leuRef.current = true;
    setLeitura({
      itens: resultado.data.accounts ?? [],
      carregando: false,
      concluiu: true,
      ultimaLeitura: Date.now(),
      falha: null,
      falhaAtualizacao: null,
      negada: null,
    });
  }, []);

  // Carregamento inicial após o gate autorizar a sessão.
  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const accounts = leitura.itens;

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

      {/* UX-PRO-06: o estado da única leitura compartilhada pelas sete seções é
          declarado UMA vez, acima delas, onde fica sempre visível — a faixa não
          é duplicada por seção. */}
      {leitura.negada ? (
        <div className={styles.readFailure} role="alert" data-testid="clientes-contas-negada">
          <strong>{leitura.negada.title}.</strong> {leitura.negada.detail} Os cadastros que estavam nesta tela foram
          retirados: sem autorização confirmada pelo servidor a página não apresenta dado lido antes, e as sete seções
          abaixo voltam a ficar sem cadastros. Nada foi alterado. Use o menu para as áreas do seu papel ou entre
          novamente em /admin/entrar.
        </div>
      ) : null}

      {leitura.carregando && leitura.concluiu ? (
        <p role="status" className={styles.updating} data-testid="clientes-contas-atualizando">
          Atualizando os cadastros de clientes…
        </p>
      ) : null}

      {leitura.falhaAtualizacao && !leitura.carregando ? (
        <div className={styles.stale} role="alert" data-testid="clientes-contas-desatualizada">
          <strong>{leitura.falhaAtualizacao.title}.</strong> {leitura.falhaAtualizacao.detail} Os cadastros abaixo são
          da última leitura concluída, de {formatReadAt(leitura.ultimaLeitura)}, e podem estar desatualizados — isto não
          significa que não haja cadastros: as sete seções continuam mostrando o que já foi lido, e os seletores de
          cadastro delas também.
          {leitura.falhaAtualizacao.canRetry ? (
            <div>
              <button type="button" onClick={() => void loadAccounts()}>
                Tentar novamente
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {leitura.falha && !leitura.carregando ? (
        <div className={styles.readFailure} role="alert" data-testid="clientes-contas-falha">
          <strong>{leitura.falha.title}.</strong> {leitura.falha.detail} Nenhum cadastro foi lido nesta carga: a tela
          não está vazia nem carregando, e as seções abaixo seguem sem cadastros até uma leitura concluir.
          {leitura.falha.canRetry ? (
            <div>
              <button type="button" onClick={() => void loadAccounts()}>
                Tentar novamente
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {role === "ti" ? <><InvitesSection /><RecoveriesSection /></> : null}
      <AccountsSection accounts={accounts} reloadAccounts={loadAccounts} carregando={leitura.carregando} />
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
