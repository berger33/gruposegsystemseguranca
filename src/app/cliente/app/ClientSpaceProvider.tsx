"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { portalRequest, type PortalErrorDescriptor } from "../../../lib/portal-request";
import { portalShouldSignIn } from "../../../lib/portal-vocabulary.mjs";

export type ClientSessionInfo = {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  emailConfirmed: boolean;
  verificationMethod: 'manual' | 'email_link';
  mfaEnabled: boolean;
  expiresAt: number;
};

export type LinkedAccount = {
  id: string;
  display_name: string;
  status: "active" | "suspended" | "closed";
  scope_note: string | null;
  linked_at: string;
};

/**
 * UX-06: o estado da leitura das contas vinculadas passa a ser explícito.
 *
 * Defeito corrigido: a versão anterior tinha um único `catch` que colocava uma
 * frase genérica em `notice` e deixava `accounts` como lista vazia. A tela de
 * visão geral então entrava no ramo `accounts.length === 0` e afirmava, com
 * todas as letras, que "sua identidade ainda não está vinculada a um cadastro
 * de cliente" — uma afirmação de NEGÓCIO produzida a partir de um erro de REDE.
 * Agora "ainda não li", "li e não há vínculo" e "não consegui ler" são três
 * estados distintos, e só o segundo autoriza aquela frase.
 */
export type ReadState = "loading" | "ready" | "error";

type ClientSpaceValue = {
  session: ClientSessionInfo | null;
  accounts: LinkedAccount[];
  activeAccount: LinkedAccount | null;
  setAccountId: (id: string) => void;
  loading: boolean;
  /** Estado da leitura das contas vinculadas. */
  accountsState: ReadState;
  /** Falha classificada, quando houver. Nunca um texto solto. */
  error: PortalErrorDescriptor | null;
  /**
   * Frase pronta derivada de `error`, mantida para as telas que já consumiam
   * `notice`. Antes era sempre a mesma frase genérica ("verifique sua
   * conexão"), independentemente do que o servidor tivesse respondido; agora
   * carrega o título e o detalhe corretos da falha real.
   */
  notice: string;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
};

const ClientSpaceContext = createContext<ClientSpaceValue | null>(null);

// Provedor do espaço real do cliente: garante sessão ativa, carrega as contas
// vinculadas (verificadas no servidor) e mantém a conta selecionada entre as abas.
export function ClientSpaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<ClientSessionInfo | null>(null);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountsState, setAccountsState] = useState<ReadState>("loading");
  const [error, setError] = useState<PortalErrorDescriptor | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    setLoading(true);
    setAccountsState("loading");

    const me = await portalRequest<ClientSessionInfo>("/api/auth/me");
    if (!me.ok) {
      // Só uma sessão ausente leva de volta ao login. Qualquer outra falha
      // continua sendo falha, e a pessoa permanece onde estava.
      if (portalShouldSignIn(me.error)) {
        router.replace("/cliente/entrar");
        return;
      }
      setError(me.error);
      setAccountsState("error");
      setLoading(false);
      return;
    }
    setSession(me.data);

    const linked = await portalRequest<{ accounts: LinkedAccount[] }>("/api/client/accounts");
    if (!linked.ok) {
      if (portalShouldSignIn(linked.error)) {
        router.replace("/cliente/entrar");
        return;
      }
      // A lista NÃO é zerada: não sabemos o que existe, e dizer "nenhuma conta"
      // seria inventar uma resposta que o servidor não deu.
      setError(linked.error);
      setAccountsState("error");
      setLoading(false);
      return;
    }

    const data = linked.data;
    setAccounts(data.accounts);
    setAccountId(current => {
      if (current && data.accounts.some(account => account.id === current)) return current;
      return data.accounts.find(account => account.status === "active")?.id ?? data.accounts[0]?.id ?? null;
    });
    setAccountsState("ready");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    reload();
  }, [reload]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/cliente/entrar");
    }
  }, [router]);

  const activeAccount = useMemo(() => accounts.find(account => account.id === accountId) ?? null, [accounts, accountId]);

  const notice = error ? `${error.title}. ${error.detail}` : "";

  const value = useMemo<ClientSpaceValue>(
    () => ({
      session,
      accounts,
      activeAccount,
      setAccountId,
      loading,
      accountsState,
      error,
      notice,
      reload,
      logout,
    }),
    [session, accounts, activeAccount, loading, accountsState, error, notice, reload, logout],
  );

  return <ClientSpaceContext.Provider value={value}>{children}</ClientSpaceContext.Provider>;
}

export function useClientSpace() {
  const value = useContext(ClientSpaceContext);
  if (!value) throw new Error("useClientSpace exige o ClientSpaceProvider.");
  return value;
}
