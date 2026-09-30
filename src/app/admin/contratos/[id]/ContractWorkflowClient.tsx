"use client";

import { FormEvent, useEffect, useState } from "react";

type Props = { id: string };
const today = () => new Date().toISOString().slice(0, 10);

export default function ContractWorkflowClient({ id }: Props) {
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  async function request(path: string, method = "GET", body?: object) {
    const response = await fetch(`/api/crm/contracts/${id}${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Operação indisponível.");
    return result;
  }
  async function load() {
    setLoading(true);
    try {
      const [detail, status, implementation, alertData, obligationData, closureData, fiscalData, diaryData] = await Promise.all([
        request(""), request("/status"), request("/implantation"), request("/alert-rules"), request("/document-obligations"), request("/closure"), request("/fiscal"), request("/management-diary"),
      ]);
      setData({ detail, status, implementation, alertData, obligationData, closureData, fiscalData, diaryData });
    } catch (error: any) { setMessage(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [id]);
  async function submit(event: FormEvent<HTMLFormElement>, path: string, method = "POST", transform?: (form: HTMLFormElement) => object) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    try {
      const raw = Object.fromEntries(new FormData(form));
      const payload = transform ? transform(form) : raw;
      await request(path, method, payload);
      form.reset(); setMessage("Registro persistido com sucesso."); await load();
    } catch (error: any) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  if (loading) return <main style={{ padding: 24 }}><p>Carregando contrato…</p></main>;
  if (!data) return <main style={{ padding: 24 }}><a href="/admin/contratos">Voltar</a><p role="alert">{message || "Contrato indisponível."}</p></main>;
  const contract = data.detail.contract;
  const imp = data.implementation.implantation;
  return <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 18px" }}>
    <a href="/admin/contratos">← Contratos</a>
    <h1>{contract.title}</h1>
    <p>Estado: <strong>{contract.status}</strong> · Origem: {contract.origin} · Vigência: {contract.starts_on || "não definida"} — {contract.ends_on || "em aberto"}</p>
    {message && <p role="status" style={{ background: "#eff6ff", padding: 10 }}>{message}</p>}
    <section><h2>Ciclo de vida (CON-03)</h2><p>Assinatura é distinta da ativação operacional; ativar exige checklist e bloqueios resolvidos.</p>
      <form onSubmit={event => submit(event, "/status", "POST", form => ({ next_status: (new FormData(form).get("next_status") || "").toString(), effective_date: (new FormData(form).get("effective_date") || "").toString(), reason: (new FormData(form).get("reason") || "").toString(), signed_at: (new FormData(form).get("signed_at") || "").toString() || null, signature_evidence: (new FormData(form).get("signature_evidence") || "").toString() || null }))}>
        <label>Próxima situação <select name="next_status" required><option value="">Selecione</option>{(data.status.allowed_transitions || []).map((status: string) => <option key={status}>{status}</option>)}</select></label> <label>Data efetiva <input name="effective_date" type="date" defaultValue={today()} required/></label> <label>Motivo <input name="reason" minLength={1} required/></label> <label>Data de assinatura (se aplicável)<input name="signed_at" type="date"/></label> <label>Evidência de assinatura<input name="signature_evidence" maxLength={500}/></label><button disabled={busy}>Registrar transição</button>
      </form>
      <h3>Histórico</h3><ul>{(data.status.history || []).map((row: any) => <li key={row.id}>{row.previous_status || "início"} → {row.next_status} em {row.effective_date}: {row.reason}</li>)}</ul>
    </section>
    <section><h2>Composição (CON-01 e CON-02)</h2><p>Itens: {data.detail.items?.length || 0}; unidades: {data.detail.units?.length || 0}; responsáveis: {data.detail.responsibles?.length || 0}.</p>
      <form onSubmit={event => submit(event, "/responsibles", "POST", form => ({ responsible_name: new FormData(form).get("responsible_name"), role: new FormData(form).get("role"), is_primary: true }))}><label>Responsável<input name="responsible_name" required/></label><label>Função<input name="role" required/></label><button disabled={busy}>Vincular responsável</button></form>
      <form onSubmit={event => submit(event, "/posts", "POST", form => ({ title: new FormData(form).get("title"), shift: new FormData(form).get("shift"), quantity: Number(new FormData(form).get("quantity")), schedule: { dias: ["seg", "ter", "qua", "qui", "sex"], inicio: "08:00", fim: "18:00" }, recurrence_type: "recorrente" }))}><label>Posto/turno<input name="title" required/></label><label>Turno<select name="shift"><option>comercial</option><option>diurno</option><option>noturno</option><option>12x36_dia</option><option>12x36_noite</option><option>24x48</option></select></label><label>Quantidade<input name="quantity" type="number" min="1" defaultValue="1" required/></label><button disabled={busy}>Adicionar posto</button></form>
      <form onSubmit={event => submit(event, "/sla", "POST", form => ({ service_type: new FormData(form).get("service_type"), description: new FormData(form).get("description"), response_time_minutes: Number(new FormData(form).get("response")), resolution_time_minutes: Number(new FormData(form).get("resolution")) }))}><label>Serviço SLA<select name="service_type"><option>vigilancia</option><option>portaria</option><option>limpeza</option><option>monitoramento</option><option>manutencao</option><option>atendimento</option></select></label><label>Descrição<input name="description" required/></label><label>Resposta (min)<input name="response" type="number" min="1" required/></label><label>Resolução (min)<input name="resolution" type="number" min="1" required/></label><button disabled={busy}>Adicionar SLA</button></form>
    </section>
    <section><h2>Alertas e obrigações (CON-05 e CON-06)</h2><p>Alertas entram somente na caixa de saída local; não representam e-mail enviado.</p>
      <form onSubmit={event => submit(event, "/alert-rules", "POST", form => ({ alert_type: new FormData(form).get("alert_type"), title: new FormData(form).get("title"), days_before: Number(new FormData(form).get("days_before")), channel: "sistema" }))}><label>Tipo<select name="alert_type"><option>vencimento</option><option>renovacao</option><option>reajuste</option><option>vigencia_fim</option></select></label><label>Título<input name="title" required/></label><label>Dias antes<input name="days_before" type="number" min="1" max="365" defaultValue="30" required/></label><button disabled={busy}>Configurar alerta</button></form>
      {(data.alertData.rules || []).map((rule: any) => <form key={rule.id} onSubmit={event => submit(event, `/alert-rules/${rule.id}/run`, "POST", form => ({ due_date: new FormData(form).get("due_date") }))}><span>{rule.title}</span> <label>Data de vencimento<input name="due_date" type="date" defaultValue={today()} required/></label><button disabled={busy}>Processar uma vez</button></form>)}
      <form onSubmit={event => submit(event, "/document-obligations", "POST", form => ({ title: new FormData(form).get("title"), category: new FormData(form).get("category"), periodicity: new FormData(form).get("periodicity"), due_date: new FormData(form).get("due_date") || null }))}><label>Obrigação documental<input name="title" required/></label><label>Categoria<select name="category"><option>certidao</option><option>licenca</option><option>comprovante</option><option>contrato</option><option>seguro</option><option>treinamento</option><option>outro</option></select></label><label>Periodicidade<select name="periodicity"><option>unica</option><option>mensal</option><option>anual</option><option>sob_demanda</option></select></label><label>Prazo<input name="due_date" type="date"/></label><button disabled={busy}>Criar obrigação</button></form>
    </section>
    <section><h2>Implantação e bloqueios (CON-07 e CON-08)</h2><p>Dependências posteriores exigem base de verificação explícita; nenhum estado é marcado automaticamente como concluído.</p>
      {(data.implementation.steps || []).map((step: any) => <form key={step.id} onSubmit={event => submit(event, `/implantation/steps/${step.id}`, "PATCH", form => ({ status: new FormData(form).get("status"), evidence_basis: new FormData(form).get("evidence_basis") }))}><strong>{step.title}</strong> — {step.status} <select name="status" defaultValue={step.status}><option>pendente</option><option>em_andamento</option><option>concluido</option><option>nao_aplicavel</option><option>bloqueado</option></select><input name="evidence_basis" placeholder="Base real de verificação" maxLength={1000}/><button disabled={busy}>Atualizar</button></form>)}
      <form onSubmit={event => submit(event, "/implantation/blocks", "POST", form => ({ block_type: new FormData(form).get("block_type"), title: new FormData(form).get("title"), description: new FormData(form).get("description"), is_legal_requirement: new FormData(form).get("is_legal_requirement") === "on", is_blocking: true }))}><label>Bloqueio<select name="block_type"><option>operacional</option><option>documentacao</option><option>treinamento</option><option>equipamento</option><option>legal</option></select></label><input name="title" placeholder="Título" required/><input name="description" placeholder="Descrição" required/><label>Exigência legal<input name="is_legal_requirement" type="checkbox"/></label><button disabled={busy}>Registrar bloqueio</button></form>
    </section>
    <section><h2>Fiscalização e decisões (CON-10 e CON-11)</h2>
      <form onSubmit={event => submit(event, "/fiscal/dossiers", "POST", form => ({ title: new FormData(form).get("title"), description: new FormData(form).get("description") || null }))}><label>Novo dossiê<input name="title" required/></label><input name="description" placeholder="Descrição"/><button disabled={busy}>Criar dossiê</button></form>
      <form onSubmit={event => submit(event, "/management-diary", "POST", form => ({ title: new FormData(form).get("title"), decision: new FormData(form).get("decision"), category: new FormData(form).get("category"), decision_date: new FormData(form).get("decision_date"), tags: [] }))}><label>Decisão de gestão<input name="title" required/></label><textarea name="decision" minLength={10} placeholder="Não incluir senhas, tokens, prontuários ou dados sensíveis" required/><select name="category"><option>decisao</option><option>risco</option><option>negociacao</option><option>operacional</option><option>juridico</option></select><input name="decision_date" type="date" defaultValue={today()} required/><button disabled={busy}>Registrar decisão restrita</button></form>
      <ul>{(data.diaryData.entries || []).map((entry: any) => <li key={entry.id}><strong>{entry.title}</strong> — {entry.decision_date}</li>)}</ul>
    </section>
    <section><h2>Encerramento (CON-09)</h2>{data.closureData.closure ? <><p>{data.closureData.closure.status}</p>{(data.closureData.steps || []).map((step: any) => <p key={step.id}>{step.title}: {step.status}</p>)}</> : <form onSubmit={event => submit(event, "/closure", "POST", form => ({ closure_type: "encerramento", closure_date: new FormData(form).get("closure_date"), effective_date: new FormData(form).get("effective_date"), reason: new FormData(form).get("reason") }))}><label>Data<input name="closure_date" type="date" defaultValue={today()} required/></label><label>Efeito<input name="effective_date" type="date" defaultValue={today()} required/></label><input name="reason" minLength={10} placeholder="Motivo" required/><button disabled={busy}>Planejar encerramento</button></form>}</section>
  </main>;
}
