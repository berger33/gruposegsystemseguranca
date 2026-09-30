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
type CoverageRequest = {
  id: string;
  post_id: string;
  status: string;
  requested_at: string;
  responsible_name: string | null;
  reason: string | null;
  coverage_date: string | null;
};
type Handover = {
  id: string;
  protocol: string;
  from_post_id: string | null;
  from_employee_id: string;
  to_employee_id: string | null;
  handover_date: string;
  status: string;
  pending_tasks: string | null;
};
type Occurrence = {
  id: string;
  protocol: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  occurred_at: string;
};
type ChecklistInstance = {
  id: string;
  template_id: string;
  post_id: string | null;
  scheduled_date: string;
  status: string;
  executed_at: string | null;
};

export default function OperacaoWorkspace() {
  const [activeTab, setActiveTab] = useState<"postos" | "cobertura" | "passagem" | "ocorrencias" | "checklists">("postos");
  const [posts, setPosts] = useState<Post[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [coverages, setCoverages] = useState<CoverageRequest[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [checklists, setChecklists] = useState<ChecklistInstance[]>([]);
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
      const [postData, allocData, covData, handData, occData, checkData] = await Promise.all([
        fetchJson("/api/ops/posts?limit=100"),
        fetchJson("/api/ops/allocations"),
        fetchJson("/api/ops/coverage-requests"),
        fetchJson("/api/ops/handovers"),
        fetchJson("/api/ops/occurrence-book"),
        fetchJson("/api/ops/checklist-instances"),
      ]);
      setPosts(postData.posts || []);
      setAllocations(allocData.allocations || []);
      setCoverages(covData.requests || []);
      setHandovers(handData.handovers || []);
      setOccurrences(occData.occurrences || []);
      setChecklists(checkData.instances || []);
    } catch (err: any) {
      setError(err.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 18px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <nav aria-label="Navegação operacional" style={{ marginBottom: 16 }}>
        <a href="/admin/contratos">Contratos</a> · <a href="/admin/crm">Empresas e funil</a>
      </nav>

      <h1>Operação — Controle e Gestão Operacional (L06)</h1>
      <p style={{ color: "#475569", marginBottom: 24 }}>
        Superfície canônica de operação. Alocar ou cobrir não significa faturamento nem recebimento. Contrato encerrado, cancelado ou suspenso não recebe nova alocação ou rotina; o histórico é preservado.
      </p>

      <div role="tablist" style={{ display: "flex", gap: 8, borderBottom: "2px solid #e2e8f0", marginBottom: 24 }}>
        <button
          role="tab"
          aria-selected={activeTab === "postos"}
          onClick={() => setActiveTab("postos")}
          style={{
            padding: "8px 16px",
            border: "none",
            background: "none",
            borderBottom: activeTab === "postos" ? "3px solid #2563eb" : "3px solid transparent",
            fontWeight: activeTab === "postos" ? "bold" : "normal",
            cursor: "pointer",
          }}
        >
          Postos e Alocações
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "cobertura"}
          onClick={() => setActiveTab("cobertura")}
          style={{
            padding: "8px 16px",
            border: "none",
            background: "none",
            borderBottom: activeTab === "cobertura" ? "3px solid #2563eb" : "3px solid transparent",
            fontWeight: activeTab === "cobertura" ? "bold" : "normal",
            cursor: "pointer",
          }}
        >
          Cobertura (OPS-05)
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "passagem"}
          onClick={() => setActiveTab("passagem")}
          style={{
            padding: "8px 16px",
            border: "none",
            background: "none",
            borderBottom: activeTab === "passagem" ? "3px solid #2563eb" : "3px solid transparent",
            fontWeight: activeTab === "passagem" ? "bold" : "normal",
            cursor: "pointer",
          }}
        >
          Passagem de Turno (OPS-06)
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "ocorrencias"}
          onClick={() => setActiveTab("ocorrencias")}
          style={{
            padding: "8px 16px",
            border: "none",
            background: "none",
            borderBottom: activeTab === "ocorrencias" ? "3px solid #2563eb" : "3px solid transparent",
            fontWeight: activeTab === "ocorrencias" ? "bold" : "normal",
            cursor: "pointer",
          }}
        >
          Livro de Ocorrências (OPS-07)
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "checklists"}
          onClick={() => setActiveTab("checklists")}
          style={{
            padding: "8px 16px",
            border: "none",
            background: "none",
            borderBottom: activeTab === "checklists" ? "3px solid #2563eb" : "3px solid transparent",
            fontWeight: activeTab === "checklists" ? "bold" : "normal",
            cursor: "pointer",
          }}
        >
          Checklists de Posto (OPS-08)
        </button>
      </div>

      {loading && <p role="status">Carregando operação…</p>}
      {!loading && error && (
        <p role="alert" style={{ padding: 12, background: "#fef2f2", borderRadius: 6, color: "#991b1b" }}>
          {error}
        </p>
      )}

      {!loading && !error && activeTab === "postos" && (
        <>
          <section aria-labelledby="posts-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 12 }}>
            <h2 id="posts-title">Postos físicos</h2>
            {posts.length === 0 ? (
              <p>Nenhum posto cadastrado ainda.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th align="left" style={{ padding: 8 }}>Posto</th>
                    <th align="left" style={{ padding: 8 }}>Tipo</th>
                    <th align="left" style={{ padding: 8 }}>Contrato</th>
                    <th align="left" style={{ padding: 8 }}>Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map(post => (
                    <tr key={post.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 8 }}>{post.name}</td>
                      <td style={{ padding: 8 }}>{post.post_type}</td>
                      <td style={{ padding: 8 }}>{post.contract_id ? "vinculado" : "—"}</td>
                      <td style={{ padding: 8 }}>{post.is_active ? "sim" : "não"}</td>
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
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th align="left" style={{ padding: 8 }}>Data</th>
                    <th align="left" style={{ padding: 8 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map(allocation => (
                    <tr key={allocation.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 8 }}>{String(allocation.allocation_date).slice(0, 10)}</td>
                      <td style={{ padding: 8 }}>{allocation.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {!loading && !error && activeTab === "cobertura" && (
        <section aria-labelledby="coverage-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16 }}>
          <h2 id="coverage-title">Solicitações de Cobertura e Substituição (OPS-05)</h2>
          {coverages.length === 0 ? (
            <p>Nenhuma pendência de cobertura registrada.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th align="left" style={{ padding: 8 }}>Data</th>
                  <th align="left" style={{ padding: 8 }}>Status</th>
                  <th align="left" style={{ padding: 8 }}>Responsável</th>
                  <th align="left" style={{ padding: 8 }}>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {coverages.map(cov => (
                  <tr key={cov.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}>{cov.coverage_date || String(cov.requested_at).slice(0, 10)}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: cov.status === "resolvido" ? "#dcfce7" : "#fef3c7" }}>
                        {cov.status}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{cov.responsible_name || "—"}</td>
                    <td style={{ padding: 8 }}>{cov.reason || "Ausência/falta"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!loading && !error && activeTab === "passagem" && (
        <section aria-labelledby="handover-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16 }}>
          <h2 id="handover-title">Passagem de Plantão (OPS-06)</h2>
          {handovers.length === 0 ? (
            <p>Nenhuma passagem de plantão registrada.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th align="left" style={{ padding: 8 }}>Protocolo</th>
                  <th align="left" style={{ padding: 8 }}>Data/Hora</th>
                  <th align="left" style={{ padding: 8 }}>Status</th>
                  <th align="left" style={{ padding: 8 }}>Pendências</th>
                </tr>
              </thead>
              <tbody>
                {handovers.map(h => (
                  <tr key={h.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}><code>{h.protocol}</code></td>
                    <td style={{ padding: 8 }}>{String(h.handover_date).slice(0, 16).replace("T", " ")}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: h.status === "aceito" ? "#dcfce7" : "#fef3c7" }}>
                        {h.status}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{h.pending_tasks || "Sem pendências"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!loading && !error && activeTab === "ocorrencias" && (
        <section aria-labelledby="occurrence-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16 }}>
          <h2 id="occurrence-title">Livro de Ocorrências (OPS-07)</h2>
          {occurrences.length === 0 ? (
            <p>Nenhuma ocorrência registrada no livro.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th align="left" style={{ padding: 8 }}>Protocolo</th>
                  <th align="left" style={{ padding: 8 }}>Título</th>
                  <th align="left" style={{ padding: 8 }}>Categoria</th>
                  <th align="left" style={{ padding: 8 }}>Severidade</th>
                  <th align="left" style={{ padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {occurrences.map(occ => (
                  <tr key={occ.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}><code>{occ.protocol}</code></td>
                    <td style={{ padding: 8 }}>{occ.title}</td>
                    <td style={{ padding: 8 }}>{occ.category}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 4,
                        background: occ.severity === "critica" ? "#fee2e2" : occ.severity === "alta" ? "#ffedd5" : "#f1f5f9",
                        color: occ.severity === "critica" ? "#991b1b" : "#1e293b"
                      }}>
                        {occ.severity}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{occ.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!loading && !error && activeTab === "checklists" && (
        <section aria-labelledby="checklist-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16 }}>
          <h2 id="checklist-title">Checklists de Posto e Execução (OPS-08)</h2>
          {checklists.length === 0 ? (
            <p>Nenhuma execução de checklist registrada.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th align="left" style={{ padding: 8 }}>Data Agendada</th>
                  <th align="left" style={{ padding: 8 }}>Status</th>
                  <th align="left" style={{ padding: 8 }}>Execução</th>
                </tr>
              </thead>
              <tbody>
                {checklists.map(inst => (
                  <tr key={inst.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}>{String(inst.scheduled_date).slice(0, 10)}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: inst.status === "concluido" ? "#dcfce7" : "#fef3c7" }}>
                        {inst.status}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{inst.executed_at ? String(inst.executed_at).slice(0, 16).replace("T", " ") : "Pendente"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}
