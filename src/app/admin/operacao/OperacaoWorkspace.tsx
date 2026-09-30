"use client";

import { useEffect, useState } from "react";

type Post = {
  id: string;
  name: string;
  post_type: string;
  is_active: boolean;
  company_id: string | null;
  unit_id: string | null;
  contract_id: string | null;
};
type Allocation = {
  id: string;
  post_id: string;
  employee_id: string;
  allocation_date: string;
  status: string;
};

export default function OperacaoWorkspace() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchJson(path: string) {
    const response = await fetch(path, { cache: "no-store", headers: { accept: "application/json" } });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || "Não foi possível carregar a operação.");
    return value;
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [postData, allocationData] = await Promise.all([
        fetchJson("/api/ops/posts?limit=100"),
        fetchJson("/api/ops/allocations"),
      ]);
      setPosts(postData.posts || []);
      setAllocations(allocationData.allocations || []);
    } catch (err: any) {
      setError(err.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 18px" }}>
      <nav aria-label="Navegação operacional">
        <a href="/admin/contratos">Contratos</a> · <a href="/admin/crm">Empresas e funil</a>
      </nav>
      <h1>Operação — postos e alocação</h1>
      <p>
        Área operacional canônica. Alocar não significa cobertura concluída nem faturamento. Contrato
        encerrado, cancelado ou suspenso não recebe nova alocação; o histórico é preservado.
      </p>

      {loading && <p role="status">Carregando operação…</p>}
      {!loading && error && (
        <p role="alert" style={{ padding: 12, background: "#fef2f2", borderRadius: 6, color: "#991b1b" }}>
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          <section aria-labelledby="posts-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
            <h2 id="posts-title">Postos físicos</h2>
            {posts.length === 0 ? (
              <p>Nenhum posto cadastrado ainda.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th align="left">Posto</th><th align="left">Tipo</th><th align="left">Contrato</th><th align="left">Ativo</th></tr>
                </thead>
                <tbody>
                  {posts.map(post => (
                    <tr key={post.id}>
                      <td>{post.name}</td>
                      <td>{post.post_type}</td>
                      <td>{post.contract_id ? "vinculado" : "—"}</td>
                      <td>{post.is_active ? "sim" : "não"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="alloc-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
            <h2 id="alloc-title">Alocações</h2>
            {allocations.length === 0 ? (
              <p>Nenhuma alocação registrada ainda.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th align="left">Data</th><th align="left">Status</th></tr>
                </thead>
                <tbody>
                  {allocations.map(allocation => (
                    <tr key={allocation.id}>
                      <td>{String(allocation.allocation_date).slice(0, 10)}</td>
                      <td>{allocation.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
