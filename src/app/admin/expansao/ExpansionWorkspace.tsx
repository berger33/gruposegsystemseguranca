"use client";

import React, { useState, useEffect, useCallback } from "react";

interface ExpansionPlan {
  id: string;
  protocol: string;
  title: string;
  description: string;
  premises: string;
  target_location: string;
  capacity: number | null;
  estimated_cost_cents: number | null;
  estimated_revenue_cents: number | null;
  estimated_margin_cents: number | null;
  status: "rascunho" | "em_analise" | "aprovado" | "rejeitado" | "em_execucao" | "concluido" | "cancelado";
  is_estimate: boolean;
  estimate_note: string;
  justification: string | null;
  created_at: string;
  updated_at: string;
  scenarios_count: number;
}

interface ExpansionScenario {
  id: string;
  plan_id: string;
  scenario_name: string;
  premises: string;
  projected_cost_cents: number | null;
  projected_revenue_cents: number | null;
  projected_margin_cents: number | null;
  is_estimate: boolean;
  estimate_note: string;
  created_at: string;
}

interface ExpansionEvent {
  id: string;
  event_type: string;
  summary: string;
  payload: any;
  created_by_identity: string | null;
  created_at: string;
}

interface PlanDetail extends ExpansionPlan {
  scenarios: ExpansionScenario[];
  events: ExpansionEvent[];
}

export function ExpansionWorkspace() {
  const [plans, setPlans] = useState<ExpansionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Form de criação de plano
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDescription, setNewDescription] = useState<string>("");
  const [newPremises, setNewPremises] = useState<string>("");
  const [newLocation, setNewLocation] = useState<string>("");
  const [newCapacity, setNewCapacity] = useState<number>(10);
  const [newCostReais, setNewCostReais] = useState<number>(50000);
  const [newRevenueReais, setNewRevenueReais] = useState<number>(75000);

  // Form de cenário
  const [showScenarioModal, setShowScenarioModal] = useState<boolean>(false);
  const [scenarioName, setScenarioName] = useState<string>("");
  const [scenarioPremises, setScenarioPremises] = useState<string>("");
  const [scenarioCostReais, setScenarioCostReais] = useState<number>(45000);
  const [scenarioRevenueReais, setScenarioRevenueReais] = useState<number>(80000);

  // Transição de estado
  const [transitionNotes, setTransitionNotes] = useState<string>("");
  const [transitionJustification, setTransitionJustification] = useState<string>("");

  const formatBrl = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined) return "R$ 0,00";
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());

      const res = await fetch(`/api/ext/expansion/plans?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao carregar planos de expansão");
      }
      const data = await res.json();
      setPlans(data.items || []);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro de conexão ao carregar planos");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  const loadPlanDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/ext/expansion/plans/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Falha ao obter detalhe do plano");
      }
      const data = await res.json();
      setSelectedPlan(data.plan);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao carregar detalhes");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const idempotencyKey = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const res = await fetch("/api/ext/expansion/plans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim(),
          premises: newPremises.trim(),
          target_location: newLocation.trim(),
          capacity: Number(newCapacity),
          estimated_cost_cents: Math.round(Number(newCostReais) * 100),
          estimated_revenue_cents: Math.round(Number(newRevenueReais) * 100),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Falha ao criar plano de expansão");
      }

      setSuccessMsg(`Plano criado com sucesso! Protocolo: ${data.plan.protocol}`);
      setShowCreateModal(false);
      setNewTitle("");
      setNewDescription("");
      setNewPremises("");
      setNewLocation("");
      await loadPlans();
      if (data.plan?.id) {
        await loadPlanDetail(data.plan.id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao salvar plano");
    }
  };

  const handleTransition = async (nextStatus: string) => {
    if (!selectedPlan) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const idempotencyKey = `trans-${selectedPlan.id}-${nextStatus}-${Date.now()}`;
    try {
      const res = await fetch(`/api/ext/expansion/plans/${selectedPlan.id}/transition`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          status: nextStatus,
          notes: transitionNotes.trim(),
          justification: transitionJustification.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Erro ao alterar status do plano");
      }

      setSuccessMsg(`Status alterado com sucesso para "${nextStatus}"`);
      setTransitionNotes("");
      setTransitionJustification("");
      await loadPlanDetail(selectedPlan.id);
      await loadPlans();
    } catch (err: any) {
      setErrorMsg(err.message || "Erro na transição");
    }
  };

  const handleAddScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const idempotencyKey = `scen-${selectedPlan.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const res = await fetch(`/api/ext/expansion/plans/${selectedPlan.id}/scenarios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          scenario_name: scenarioName.trim(),
          premises: scenarioPremises.trim(),
          projected_cost_cents: Math.round(Number(scenarioCostReais) * 100),
          projected_revenue_cents: Math.round(Number(scenarioRevenueReais) * 100),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Erro ao cadastrar cenário financeiro");
      }

      setSuccessMsg(`Cenário "${scenarioName}" adicionado com sucesso!`);
      setShowScenarioModal(false);
      setScenarioName("");
      setScenarioPremises("");
      await loadPlanDetail(selectedPlan.id);
      await loadPlans();
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao adicionar cenário");
    }
  };

  const handleDeleteScenario = async (scenarioId: string) => {
    if (!selectedPlan) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const idempotencyKey = `del-scen-${scenarioId}-${Date.now()}`;
    try {
      const res = await fetch(`/api/ext/expansion/scenarios/${scenarioId}`, {
        method: "DELETE",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Erro ao remover cenário");
      }

      setSuccessMsg("Cenário removido com sucesso!");
      await loadPlanDetail(selectedPlan.id);
      await loadPlans();
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao remover cenário");
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1280px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", borderBottom: "1px solid #e2e8f0", paddingBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0, color: "#1e293b" }}>
            Expansão e Novas Unidades (EXT-09)
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "14px" }}>
            Planejamento de filiais e contratos, dimensionamento de capacidade e simulação de cenários financeiros com estimativas declaradas.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            backgroundColor: "#2563eb",
            color: "white",
            padding: "8px 16px",
            borderRadius: "6px",
            border: "none",
            fontWeight: "500",
            cursor: "pointer",
          }}
        >
          + Novo Plano de Expansão
        </button>
      </div>

      {/* Honest Disclaimer Banner */}
      <div style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center" }}>
        <span style={{ fontSize: "20px" }}>ℹ️</span>
        <div style={{ fontSize: "13px", color: "#1e40af" }}>
          <strong>Estimativas Declaradas:</strong> Todos os valores de receita, custos e capacidades são projeções com premissas explícitas para tomada de decisão da diretoria. Não há projeções vendidas como certeza absoluta.
        </div>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: "12px", borderRadius: "6px", marginBottom: "16px", fontSize: "14px" }}>
          <strong>Erro:</strong> {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", padding: "12px", borderRadius: "6px", marginBottom: "16px", fontSize: "14px" }}>
          {successMsg}
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Buscar por título, localidade, premissas ou protocolo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: "260px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "white" }}
        >
          <option value="">Todos os Status</option>
          <option value="rascunho">Rascunho</option>
          <option value="em_analise">Em Análise</option>
          <option value="aprovado">Aprovado</option>
          <option value="em_execucao">Em Execução</option>
          <option value="concluido">Concluído</option>
          <option value="rejeitado">Rejeitado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <button
          onClick={loadPlans}
          style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "#f8fafc", cursor: "pointer" }}
        >
          Atualizar
        </button>
      </div>

      {/* Grid Principal: Lista + Detalhes */}
      <div style={{ display: "grid", gridTemplateColumns: selectedPlan ? "1fr 1.2fr" : "1fr", gap: "24px" }}>
        {/* Painel da Lista */}
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "#334155" }}>
            Planos Cadastrados ({plans.length})
          </h2>

          {loading ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>Carregando planos...</div>
          ) : plans.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", color: "#64748b" }}>
              Nenhum plano de expansão encontrado com os critérios informados.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {plans.map((p) => {
                const isSelected = selectedPlan?.id === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => loadPlanDetail(p.id)}
                    style={{
                      padding: "14px",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                      backgroundColor: isSelected ? "#f0f7ff" : "white",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "bold", color: "#64748b" }}>{p.protocol}</span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "600",
                          textTransform: "uppercase",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          backgroundColor:
                            p.status === "aprovado" || p.status === "concluido" ? "#dcfce7" :
                            p.status === "em_execucao" ? "#e0e7ff" :
                            p.status === "em_analise" ? "#fef9c3" :
                            p.status === "rejeitado" || p.status === "cancelado" ? "#fee2e2" : "#f1f5f9",
                          color:
                            p.status === "aprovado" || p.status === "concluido" ? "#166534" :
                            p.status === "em_execucao" ? "#3730a3" :
                            p.status === "em_analise" ? "#854d0e" :
                            p.status === "rejeitado" || p.status === "cancelado" ? "#991b1b" : "#475569",
                        }}
                      >
                        {p.status.replace("_", " ")}
                      </span>
                    </div>

                    <strong style={{ fontSize: "15px", color: "#1e293b", display: "block", marginBottom: "4px" }}>
                      {p.title}
                    </strong>

                    <div style={{ fontSize: "13px", color: "#475569", marginBottom: "8px" }}>
                      📍 Local: <strong>{p.target_location}</strong> • Capacidade: <strong>{p.capacity ?? "N/D"} colaboradores</strong>
                    </div>

                    <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#64748b", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
                      <span>Custo: {formatBrl(p.estimated_cost_cents)}</span>
                      <span>Receita: {formatBrl(p.estimated_revenue_cents)}</span>
                      <span style={{ fontWeight: "600", color: (p.estimated_margin_cents || 0) >= 0 ? "#16a34a" : "#dc2626" }}>
                        Margem: {formatBrl(p.estimated_margin_cents)}
                      </span>
                      <span>Cenários: {p.scenarios_count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Painel de Detalhes do Plano Selecionado */}
        {selectedPlan && (
          <div style={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {detailLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>Atualizando dados...</div>
            ) : (
              <>
                {/* Topo do Detalhe */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
                  <div>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>Protocolo: <strong>{selectedPlan.protocol}</strong></span>
                    <h2 style={{ fontSize: "18px", margin: "4px 0", color: "#1e293b" }}>{selectedPlan.title}</h2>
                    <span style={{ fontSize: "13px", color: "#64748b" }}>Localidade Alvo: <strong>{selectedPlan.target_location}</strong></span>
                  </div>
                  <button
                    onClick={() => setSelectedPlan(null)}
                    style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#94a3b8" }}
                  >
                    ✕
                  </button>
                </div>

                {/* Bloco de Justificativa se rejeitado/cancelado */}
                {selectedPlan.justification && (
                  <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", padding: "10px", borderRadius: "6px", fontSize: "13px", color: "#991b1b" }}>
                    <strong>Motivo formal da decisão:</strong> {selectedPlan.justification}
                  </div>
                )}

                {/* Métricas Estimadas */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", backgroundColor: "#f8fafc", padding: "12px", borderRadius: "6px" }}>
                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>CUSTO ESTIMADO</span>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: "#1e293b" }}>{formatBrl(selectedPlan.estimated_cost_cents)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>RECEITA ESTIMADA</span>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: "#1e293b" }}>{formatBrl(selectedPlan.estimated_revenue_cents)}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>MARGEM ESTIMADA</span>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: (selectedPlan.estimated_margin_cents || 0) >= 0 ? "#16a34a" : "#dc2626" }}>
                      {formatBrl(selectedPlan.estimated_margin_cents)}
                    </div>
                  </div>
                </div>

                {/* Descrição e Premissas */}
                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "4px", color: "#334155" }}>Descrição do Plano</h3>
                  <p style={{ fontSize: "13px", color: "#475569", whiteSpace: "pre-wrap", marginTop: 0 }}>{selectedPlan.description}</p>
                </div>

                <div>
                  <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "4px", color: "#334155" }}>Premissas Estratégicas Declaradas</h3>
                  <p style={{ fontSize: "13px", color: "#475569", whiteSpace: "pre-wrap", marginTop: 0, backgroundColor: "#fdfefe", border: "1px solid #e2e8f0", padding: "8px", borderRadius: "6px" }}>
                    {selectedPlan.premises}
                  </p>
                </div>

                {/* Cenários Financeiros Alternativos (A/B/C) */}
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <h3 style={{ fontSize: "15px", fontWeight: "600", margin: 0, color: "#1e293b" }}>
                      Cenários Financeiros ({selectedPlan.scenarios.length})
                    </h3>
                    {["rascunho", "em_analise"].includes(selectedPlan.status) && (
                      <button
                        onClick={() => setShowScenarioModal(true)}
                        style={{ fontSize: "12px", backgroundColor: "#0284c7", color: "white", border: "none", padding: "4px 10px", borderRadius: "4px", cursor: "pointer" }}
                      >
                        + Adicionar Cenário
                      </button>
                    )}
                  </div>

                  {selectedPlan.scenarios.length === 0 ? (
                    <div style={{ fontSize: "13px", color: "#94a3b8", fontStyle: "italic" }}>
                      Nenhum cenário financeiro adicional cadastrado para este plano.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {selectedPlan.scenarios.map((sc) => (
                        <div key={sc.id} style={{ border: "1px solid #e2e8f0", borderRadius: "6px", padding: "10px", backgroundColor: "#fafafa" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <strong>{sc.scenario_name}</strong>
                            {["rascunho", "em_analise"].includes(selectedPlan.status) && (
                              <button
                                onClick={() => handleDeleteScenario(sc.id)}
                                style={{ background: "none", border: "none", color: "#dc2626", fontSize: "11px", cursor: "pointer" }}
                              >
                                Excluir
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b", margin: "4px 0" }}>{sc.premises}</div>
                          <div style={{ display: "flex", gap: "14px", fontSize: "12px", marginTop: "6px" }}>
                            <span>Custo: {formatBrl(sc.projected_cost_cents)}</span>
                            <span>Receita: {formatBrl(sc.projected_revenue_cents)}</span>
                            <span style={{ fontWeight: "600", color: (sc.projected_margin_cents || 0) >= 0 ? "#16a34a" : "#dc2626" }}>
                              Margem Projetada: {formatBrl(sc.projected_margin_cents)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ações de Workflow / Máquina de Estados */}
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", backgroundColor: "#f8fafc", padding: "14px", borderRadius: "6px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 10px", color: "#1e293b" }}>Ações de Decisão e Fluxo</h3>

                  {selectedPlan.status === "rascunho" && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => handleTransition("em_analise")}
                        style={{ backgroundColor: "#ca8a04", color: "white", border: "none", padding: "6px 14px", borderRadius: "4px", fontSize: "13px", cursor: "pointer" }}
                      >
                        Submeter para Análise
                      </button>
                    </div>
                  )}

                  {selectedPlan.status === "em_analise" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => handleTransition("aprovado")}
                          style={{ backgroundColor: "#16a34a", color: "white", border: "none", padding: "6px 14px", borderRadius: "4px", fontSize: "13px", cursor: "pointer" }}
                        >
                          Aprovar Plano
                        </button>
                        <button
                          onClick={() => handleTransition("rascunho")}
                          style={{ backgroundColor: "#64748b", color: "white", border: "none", padding: "6px 14px", borderRadius: "4px", fontSize: "13px", cursor: "pointer" }}
                        >
                          Devolver para Rascunho
                        </button>
                      </div>

                      <div style={{ marginTop: "6px" }}>
                        <input
                          placeholder="Justificativa (obrigatória para rejeição)..."
                          value={transitionJustification}
                          onChange={(e) => setTransitionJustification(e.target.value)}
                          style={{ width: "100%", padding: "6px 10px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "12px", marginBottom: "4px" }}
                        />
                        <button
                          onClick={() => handleTransition("rejeitado")}
                          style={{ backgroundColor: "#dc2626", color: "white", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", cursor: "pointer" }}
                        >
                          Rejeitar Plano com Justificativa
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedPlan.status === "aprovado" && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => handleTransition("em_execucao")}
                        style={{ backgroundColor: "#2563eb", color: "white", border: "none", padding: "6px 14px", borderRadius: "4px", fontSize: "13px", cursor: "pointer" }}
                      >
                        Iniciar Execução Operacional
                      </button>
                    </div>
                  )}

                  {selectedPlan.status === "em_execucao" && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => handleTransition("concluido")}
                        style={{ backgroundColor: "#059669", color: "white", border: "none", padding: "6px 14px", borderRadius: "4px", fontSize: "13px", cursor: "pointer" }}
                      >
                        Marcar como Concluído
                      </button>
                    </div>
                  )}

                  {(selectedPlan.status === "concluido" || selectedPlan.status === "cancelado" || selectedPlan.status === "rejeitado") && (
                    <div style={{ fontSize: "13px", color: "#64748b" }}>
                      Este plano encontra-se em estado terminal ({selectedPlan.status}).
                    </div>
                  )}
                </div>

                {/* Trilha de Eventos e Auditoria */}
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px" }}>
                  <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "#334155" }}>
                    Histórico de Eventos e Auditoria ({selectedPlan.events.length})
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "160px", overflowY: "auto" }}>
                    {selectedPlan.events.map((ev) => (
                      <div key={ev.id} style={{ fontSize: "12px", padding: "6px 8px", backgroundColor: "#f8fafc", borderRadius: "4px", borderLeft: "3px solid #3b82f6" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong>{ev.event_type}</strong>
                          <span style={{ color: "#94a3b8" }}>{new Date(ev.created_at).toLocaleString("pt-BR")}</span>
                        </div>
                        <div style={{ color: "#475569" }}>{ev.summary}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal de Criação de Plano */}
      {showCreateModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "white", borderRadius: "8px", padding: "24px", maxWidth: "600px", width: "90%", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: "0 0 16px", color: "#1e293b" }}>
              Novo Plano de Expansão / Nova Filial
            </h2>
            <form onSubmit={handleCreatePlan} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Título do Plano *</label>
                <input
                  required
                  placeholder="Ex: Expansão Operacional Filial Campinas e Região"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Localidade Alvo *</label>
                <input
                  required
                  placeholder="Ex: Campinas / SP e Região Metropolitana"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Capacidade (Vagas)</label>
                  <input
                    type="number"
                    min="0"
                    value={newCapacity}
                    onChange={(e) => setNewCapacity(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Custo Estimado (R$)</label>
                  <input
                    type="number"
                    min="0"
                    value={newCostReais}
                    onChange={(e) => setNewCostReais(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Receita Estimada (R$)</label>
                  <input
                    type="number"
                    min="0"
                    value={newRevenueReais}
                    onChange={(e) => setNewRevenueReais(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Descrição Detalhada *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descrição da oportunidade, objetivos estratégicos e escopo inicial..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Premissas Estratégicas Declaradas *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Premissas de custo de mão de obra, tempo de implantação, infraestrutura e volume de clientes..."
                  value={newPremises}
                  onChange={(e) => setNewPremises(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "white", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: "8px 16px", borderRadius: "6px", border: "none", backgroundColor: "#2563eb", color: "white", fontWeight: "500", cursor: "pointer" }}
                >
                  Criar Plano
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Cenário Financeiro */}
      {showScenarioModal && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ backgroundColor: "white", borderRadius: "8px", padding: "24px", maxWidth: "500px", width: "90%" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: "0 0 16px", color: "#1e293b" }}>
              Adicionar Cenário Financeiro (Simulação A/B)
            </h2>
            <form onSubmit={handleAddScenario} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Nome do Cenário *</label>
                <input
                  required
                  placeholder="Ex: Cenário Otimista com 3 Clientes Ancoras"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Premissas do Cenário *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Premissas específicas deste cenário..."
                  value={scenarioPremises}
                  onChange={(e) => setScenarioPremises(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Custo Projetado (R$)</label>
                  <input
                    type="number"
                    min="0"
                    value={scenarioCostReais}
                    onChange={(e) => setScenarioCostReais(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", display: "block", marginBottom: "4px" }}>Receita Projetada (R$)</label>
                  <input
                    type="number"
                    min="0"
                    value={scenarioRevenueReais}
                    onChange={(e) => setScenarioRevenueReais(Number(e.target.value))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowScenarioModal(false)}
                  style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "white", cursor: "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: "8px 16px", borderRadius: "6px", border: "none", backgroundColor: "#0284c7", color: "white", fontWeight: "500", cursor: "pointer" }}
                >
                  Salvar Cenário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
