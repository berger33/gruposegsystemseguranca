"use client";

import { useEffect, useState } from "react";
import OpsAdvanced2Client from "../ti/OpsAdvanced2Client";
import OpsAdvanced3Client from "../ti/OpsAdvanced3Client";

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
type WorkRule = {
  id: string;
  name: string;
  max_daily_hours: string | number;
  min_rest_hours: string | number;
  max_weekly_hours: string | number;
  max_consecutive_days: number;
  requires_certification: boolean;
  is_approved: boolean;
  is_active: boolean;
  approved_by: string | null;
};
type Qualification = {
  id: string;
  employee_id: string;
  role_id: string | null;
  certification_type: string;
  valid_until: string | null;
  is_valid: boolean;
};
type ScheduleValidation = {
  id: string;
  employee_id: string | null;
  validation_type: string;
  is_valid: boolean;
  validated_at: string;
  conflict_details: Record<string, unknown> | null;
};

export default function OperacaoWorkspace() {
  const [activeTab, setActiveTab] = useState<"postos" | "jornada" | "cobertura" | "passagem" | "ocorrencias" | "checklists" | "supervisao" | "rondas" | "relatorios" | "metricas" | "limpeza" | "monitoramento">("postos");
  const [posts, setPosts] = useState<Post[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [coverages, setCoverages] = useState<CoverageRequest[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [checklists, setChecklists] = useState<ChecklistInstance[]>([]);
  const [workRules, setWorkRules] = useState<WorkRule[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [validations, setValidations] = useState<ScheduleValidation[]>([]);
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
      const [postData, allocData, covData, handData, occData, checkData, ruleData, qualData, validationData] = await Promise.all([
        fetchJson("/api/ops/posts?limit=100"),
        fetchJson("/api/ops/allocations"),
        fetchJson("/api/ops/coverage-requests"),
        fetchJson("/api/ops/handovers"),
        fetchJson("/api/ops/occurrence-book"),
        fetchJson("/api/ops/checklist-instances"),
        fetchJson("/api/ops/work-rules"),
        fetchJson("/api/ops/qualifications"),
        fetchJson("/api/ops/validations?is_valid=false"),
      ]);
      setPosts(postData.posts || []);
      setAllocations(allocData.allocations || []);
      setCoverages(covData.requests || []);
      setHandovers(handData.handovers || []);
      setOccurrences(occData.occurrences || []);
      setChecklists(checkData.instances || []);
      setWorkRules(ruleData.rules || []);
      setQualifications(qualData.qualifications || []);
      setValidations(validationData.validations || []);
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

      <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 8, borderBottom: "2px solid #e2e8f0", marginBottom: 24 }}>
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
          aria-selected={activeTab === "jornada"}
          onClick={() => setActiveTab("jornada")}
          style={{
            padding: "8px 16px",
            border: "none",
            background: "none",
            borderBottom: activeTab === "jornada" ? "3px solid #2563eb" : "3px solid transparent",
            fontWeight: activeTab === "jornada" ? "bold" : "normal",
            cursor: "pointer",
          }}
        >
          Jornada &amp; Habilitação (OPS-04)
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
        {([
          ["supervisao", "Supervisão"],
          ["rondas", "Rondas & Claviculário"],
          ["relatorios", "Relatórios"],
          ["metricas", "Métricas & Escalas"],
          ["limpeza", "Limpeza"],
          ["monitoramento", "Monitoramento Sintético"],
        ] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)}
            style={{ padding: "8px 12px", border: "none", background: "none", borderBottom: activeTab === key ? "3px solid #2563eb" : "3px solid transparent", fontWeight: activeTab === key ? "bold" : "normal", cursor: "pointer" }}>
            {label}
          </button>
        ))}
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

      {!loading && !error && activeTab === "jornada" && (
        <>
          <p style={{ padding: 10, background: "#eff6ff", borderRadius: 6 }}>
            A alocação e a entrada de escala só são bloqueadas por jornada e descanso quando existe regra{" "}
            <strong>aprovada e ativa</strong>. Sem regra aprovada, o sistema não presume limite algum e diz isso
            explicitamente. Habilitação e documentação exigem cadastro em qualificações — competência não é inferida.
          </p>

          <section aria-labelledby="work-rules-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 12 }}>
            <h2 id="work-rules-title">Regras de jornada e descanso</h2>
            {workRules.length === 0 ? (
              <p>Nenhuma regra de jornada cadastrada. Sem regra aprovada, jornada e descanso não são validados.</p>
            ) : (
              <>
                {workRules.every(rule => !(rule.is_approved && rule.is_active)) && (
                  <p role="status" style={{ padding: 8, background: "#fef3c7", borderRadius: 6 }}>
                    Nenhuma regra aprovada e ativa: jornada, descanso, jornada semanal e dias consecutivos não estão sendo aplicados.
                  </p>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <th align="left" style={{ padding: 8 }}>Regra</th>
                      <th align="left" style={{ padding: 8 }}>Jornada máx./dia</th>
                      <th align="left" style={{ padding: 8 }}>Descanso mín.</th>
                      <th align="left" style={{ padding: 8 }}>Jornada máx./semana</th>
                      <th align="left" style={{ padding: 8 }}>Dias consec.</th>
                      <th align="left" style={{ padding: 8 }}>Certificação</th>
                      <th align="left" style={{ padding: 8 }}>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workRules.map(rule => {
                      const enforcing = rule.is_approved && rule.is_active;
                      return (
                        <tr key={rule.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>{rule.name}</td>
                          <td style={{ padding: 8 }}>{Number(rule.max_daily_hours)} h</td>
                          <td style={{ padding: 8 }}>{Number(rule.min_rest_hours)} h</td>
                          <td style={{ padding: 8 }}>{Number(rule.max_weekly_hours)} h</td>
                          <td style={{ padding: 8 }}>{rule.max_consecutive_days}</td>
                          <td style={{ padding: 8 }}>{rule.requires_certification ? "exigida" : "não exigida"}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{ padding: "2px 8px", borderRadius: 4, background: enforcing ? "#dcfce7" : "#fef3c7" }}>
                              {enforcing ? "aprovada e aplicada" : rule.is_approved ? "aprovada, inativa" : "não aprovada"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section aria-labelledby="qualifications-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
            <h2 id="qualifications-title">Habilitação e documentação</h2>
            {qualifications.length === 0 ? (
              <p>Nenhuma qualificação cadastrada. Alocar com cargo/função exige habilitação registrada e dentro da validade.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th align="left" style={{ padding: 8 }}>Certificação</th>
                    <th align="left" style={{ padding: 8 }}>Cargo/função</th>
                    <th align="left" style={{ padding: 8 }}>Validade</th>
                    <th align="left" style={{ padding: 8 }}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {qualifications.map(qual => {
                    const expired = !!qual.valid_until && String(qual.valid_until).slice(0, 10) < new Date().toISOString().slice(0, 10);
                    return (
                      <tr key={qual.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: 8 }}>{qual.certification_type}</td>
                        <td style={{ padding: 8 }}>{qual.role_id ? "vinculado" : "—"}</td>
                        <td style={{ padding: 8 }}>{qual.valid_until ? String(qual.valid_until).slice(0, 10) : "sem vencimento"}</td>
                        <td style={{ padding: 8 }}>
                          <span style={{ padding: "2px 8px", borderRadius: 4, background: !qual.is_valid || expired ? "#fee2e2" : "#dcfce7" }}>
                            {!qual.is_valid ? "inválida" : expired ? "vencida" : "válida"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="validations-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
            <h2 id="validations-title">Bloqueios registrados</h2>
            {validations.length === 0 ? (
              <p>Nenhum bloqueio de validação registrado.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th align="left" style={{ padding: 8 }}>Quando</th>
                    <th align="left" style={{ padding: 8 }}>Tipo</th>
                    <th align="left" style={{ padding: 8 }}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {validations.map(item => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 8 }}>{String(item.validated_at).slice(0, 16).replace("T", " ")}</td>
                      <td style={{ padding: 8 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, background: "#fee2e2", color: "#991b1b" }}>
                          {item.validation_type}
                        </span>
                      </td>
                      <td style={{ padding: 8 }}>{String((item.conflict_details as { error?: string } | null)?.error || "—")}</td>
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

      {!loading && !error && (["supervisao", "rondas", "relatorios"] as const).includes(activeTab as any) && (
        <section aria-label="Operação avançada OPS-09 a OPS-12">
          <p style={{ padding: 10, background: "#eff6ff", borderRadius: 6 }}>
            {activeTab === "supervisao" && "Supervisão de postos, inspeções e planos de ação."}
            {activeTab === "rondas" && "Rondas e claviculário — leituras são sintéticas e não comprovam GPS ou presença real."}
            {activeTab === "relatorios" && "Relatórios e livro de serviço: liberação somente após aprovação formal."}
          </p>
          <OpsAdvanced2Client />
        </section>
      )}
      {!loading && !error && (["metricas", "limpeza", "monitoramento"] as const).includes(activeTab as any) && (
        <section aria-label="Operação avançada OPS-13 a OPS-16">
          <p style={{ padding: 10, background: "#fff7ed", borderRadius: 6 }}>
            {activeTab === "metricas" && "Métricas com fonte, fórmula, janela e incompletude explícita; escalas exigem revisão humana."}
            {activeTab === "limpeza" && "Rotinas de limpeza, inspeção de qualidade e não conformidades."}
            {activeTab === "monitoramento" && "Monitoramento Sintético: simulação sem central 24h e sem despacho externo real."}
          </p>
          <OpsAdvanced3Client />
        </section>
      )}
    </main>
  );
}
