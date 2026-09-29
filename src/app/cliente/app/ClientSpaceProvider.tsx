"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type ClientSessionInfo = {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  emailConfirmed: boolean;
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

type ClientSpaceValue = {
  session: ClientSessionInfo | null;
  accounts: LinkedAccount[];
  activeAccount: LinkedAccount | null;
  setAccountId: (id: string) => void;
  loading: boolean;
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
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (me.status === 401) {
        router.replace("/cliente/entrar");
        return;
      }
      if (!me.ok) throw new Error("unexpected");
      const info = (await me.json()) as ClientSessionInfo;
      setSession(info);
      const linked = await fetch("/api/client/accounts", { cache: "no-store" });
      if (!linked.ok) throw new Error("unexpected");
      const data = (await linked.json()) as { accounts: LinkedAccount[] };
      setAccounts(data.accounts);
      setAccountId(current => {
        if (current && data.accounts.some(account => account.id === current)) return current;
        return data.accounts.find(account => account.status === "active")?.id ?? data.accounts[0]?.id ?? null;
      });
    } catch {
      setNotice("Não foi possível carregar sua área agora. Verifique sua conexão e recarregue a página.");
    } finally {
      setLoading(false);
    }
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

  const value = useMemo<ClientSpaceValue>(
    () => ({
      session,
      accounts,
      activeAccount,
      setAccountId,
      loading,
      notice,
      reload,
      logout,
    }),
    [session, accounts, activeAccount, loading, notice, reload, logout],
  );

  return <ClientSpaceContext.Provider value={value}>{children}</ClientSpaceContext.Provider>;
}

export function useClientSpace() {
  const value = useContext(ClientSpaceContext);
  if (!value) throw new Error("useClientSpace exige o ClientSpaceProvider.");
  return value;
}
