"use client";
import { useEffect, useRef, useState } from "react";
import {
  BLOCOS,
  agregarLeitura,
  classificarResposta,
  traduzirErroEscrita,
  validarMotivo,
  type ResultadoBloco,
  type ResumoLeitura,
} from "./cli-finance-load";
import styles from "./CliFinanceClient.module.css";

type Charge = { id: string; protocol: string; client_account_id: string; charge_type: string; status: string; amount_cents: number; due_date: string; is_fiscal: boolean; finance_integration_active: boolean };
type ServiceReq = { id: string; protocol: string; client_account_id: string; title: string; status: string; origin: string; responsible_name: string | null; crm_opportunity_id: string | null };
type Survey = { id: string; protocol: string; client_account_id: string; survey_type: string; status: string; score: number | null; feedback: string | null; renewal_risk: string | null; renewal_risk_reason: string | null };
type Renewal = { id: string; protocol: string; client_account_id: string; comm_type: string; title: string; is_blocking: boolean; sent_at: string | null };
type PortalMode = { mode: string; is_active: boolean; requires_approval: boolean; auto_release_contracts: boolean; description: string | null };
type AccessReq = { id: string; protocol: string; mode: string; requested_email: string; requested_name: string; status: string; verified_link: boolean };
type SecEvent = { id: string; client_account_id: string; event_type: string; created_at: string };
type EmailReq = { id: string; protocol: string; client_account_id: string; old_email: string; new_email: string; status: string; token: string; expires_at: string };

const iniciais = () => Object.fromEntries(BLOCOS.map(bloco => [bloco.chave, {
  chave: bloco.chave, rotulo: bloco.rotulo, situacao: "falha", itens: [], mensagem: "Ainda não lido.",
} satisfies ResultadoBloco]));

export default function CliFinanceClient() {
  const [resultados, setResultados] = useState<Record<string, ResultadoBloco>>(iniciais);
  const [resumo, setResumo] = useState<ResumoLeitura | null>(null);
  const [lendo, setLendo] = useState(true);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState("");
  const tentativa = useRef(0);

  const porChave = (chave: string) => resultados[chave];
  const itens = <T,>(chave: string): T[] => (porChave(chave)?.itens ?? []) as T[];
  const lista = (chave: string) => {
    const resultado = porChave(chave);
    if (!resultado) return null;
    if (resultado.situacao === "ok") return null;
    return <p className={styles.stateNote} data-testid={`clifin-estado-${chave}`} data-situacao={resultado.situacao}>{resultado.mensagem}</p>;
  };

  async function loadAll() {
    const atual = ++tentativa.current;
    setLendo(true);
    const respostas = await Promise.all(BLOCOS.map(async bloco => {
      try {
        const resposta = await fetch(bloco.rota, { headers: { Accept: "application/json" } });
        const corpo = await resposta.json().catch(() => undefined);
        return classificarResposta(bloco, resposta.status, corpo);
      } catch {
        return classificarResposta(bloco, 0, undefined);
      }
    }));
    if (atual !== tentativa.current) return; // resposta fora de ordem não sobrescreve a mais nova
    setResultados(Object.fromEntries(respostas.map(item => [item.chave, item])));
    setResumo(agregarLeitura(respostas));
    setLendo(false);
  }
  useEffect(() => { void loadAll(); }, []);

  async function gravar(rotulo: string, rota: string, method: string, body: unknown, sucesso: (dados: Record<string, any>) => string) {
    setGravando(rotulo); setMsg(""); setErro("");
    try {
      const resposta = await fetch(rota, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        const codigo = typeof dados?.error === "string" ? dados.error : "";
        setErro(traduzirErroEscrita(resposta.status, codigo));
        return;
      }
      setMsg(sucesso(dados));
      await loadAll();
    } catch {
      setErro("Falha de comunicação: nada foi confirmado. Tente novamente.");
    } finally {
      setGravando("");
    }
  }

  // CLI-09 cobranças
  const [chargeForm, setChargeForm] = useState({ client_account_id: "", contract_id: "", charge_type: "mensalidade", amount_cents: "", due_date: "", competence_date: "", is_fiscal: "false", fiscal_document_url: "", fiscal_document_storage_key: "", finance_integration_active: "true", notes: "" });
  const criarCobranca = () => gravar("cobranca", "/api/cli/charges-v2", "POST", {
    client_account_id: chargeForm.client_account_id, contract_id: chargeForm.contract_id || null,
    charge_type: chargeForm.charge_type, amount_cents: parseInt(chargeForm.amount_cents, 10),
    due_date: chargeForm.due_date, competence_date: chargeForm.competence_date || null,
    is_fiscal: chargeForm.is_fiscal === "true", fiscal_document_url: chargeForm.fiscal_document_url || null,
    fiscal_document_storage_key: chargeForm.fiscal_document_storage_key || null,
    finance_integration_active: chargeForm.finance_integration_active === "true", notes: chargeForm.notes,
  }, d => `Cobrança ${d.charge?.protocol ?? ""} registrada. Fiscal só existe quando o financeiro está integrado e os dados são da própria conta.`);

  // CLI-10 solicitação de serviço
  const [srvForm, setSrvForm] = useState({ client_account_id: "", contract_id: "", contact_id: "", title: "", description: "", origin: "portal_cliente", responsible_name: "" });
  const criarServico = () => gravar("servico", "/api/cli/service-requests", "POST", {
    client_account_id: srvForm.client_account_id, contract_id: srvForm.contract_id || null,
    contact_id: srvForm.contact_id || null, title: srvForm.title, description: srvForm.description,
    origin: srvForm.origin, responsible_name: srvForm.responsible_name,
  }, d => `Solicitação ${d.serviceRequest?.protocol ?? ""} gerou oportunidade CRM ${d.serviceRequest?.crm_opportunity_id ?? "pendente"} com origem e responsável.`);

  // CLI-11 satisfação + plano de ação
  const [satForm, setSatForm] = useState({ client_account_id: "", contract_id: "", ticket_id: "", survey_type: "pos_atendimento", score: "", feedback: "", renewal_risk: "", renewal_risk_reason: "", facts_json: "", action_plan: "" });
  const criarSatisfacao = () => gravar("satisfacao", "/api/cli/satisfaction-surveys", "POST", {
    client_account_id: satForm.client_account_id, contract_id: satForm.contract_id || null,
    ticket_id: satForm.ticket_id || null, survey_type: satForm.survey_type,
    score: satForm.score === "" ? null : parseInt(satForm.score, 10), feedback: satForm.feedback,
    renewal_risk: satForm.renewal_risk || null, renewal_risk_reason: satForm.renewal_risk_reason || null,
    facts_json: satForm.facts_json || null, action_plan: satForm.action_plan,
  }, d => `Satisfação ${d.survey?.protocol ?? ""} registrada com fatos próprios da conta.`);
  const [satActionForm, setSatActionForm] = useState({ survey_id: "", action: "", responsible_name: "", due_date: "" });
  const criarPlano = () => gravar("plano", "/api/cli/satisfaction-action-plans", "POST", {
    survey_id: satActionForm.survey_id, action: satActionForm.action,
    responsible_name: satActionForm.responsible_name, due_date: satActionForm.due_date,
  }, d => `Plano de ação ${d.actionPlan?.id ? "criado" : "registrado"} para o survey informado.`);

  // CLI-12 renovação
  const [renForm, setRenForm] = useState({ client_account_id: "", contract_id: "", comm_type: "aviso_vencimento", title: "", content: "", is_blocking: "false", block_reason: "" });
  const criarRenovacao = () => gravar("renovacao", "/api/cli/renewal-communications", "POST", {
    client_account_id: renForm.client_account_id, contract_id: renForm.contract_id || null,
    comm_type: renForm.comm_type, title: renForm.title, content: renForm.content,
    is_blocking: renForm.is_blocking === "true", block_reason: renForm.block_reason,
  }, d => `Comunicação ${d.communication?.protocol ?? ""} registrada${renForm.is_blocking === "true" ? " com bloqueio declarado" : " sem bloquear o portal"}.`);

  // CLI-13 modos + pedidos de acesso
  const [modeForm, setModeForm] = useState({ mode: "convite", is_active: "true", requires_approval: "false", auto_release_contracts: "false", reason: "" });
  function atualizarModo() {
    const motivo = validarMotivo(modeForm.reason);
    if (!motivo.ok) { setMsg(""); setErro(motivo.erro); return; }
    void gravar("modo", "/api/cli/portal-mode-configs", "PATCH", {
      mode: modeForm.mode, is_active: modeForm.is_active === "true",
      requires_approval: modeForm.requires_approval === "true",
      auto_release_contracts: modeForm.auto_release_contracts === "true", reason: motivo.motivo,
    }, d => `Modo ${d.mode?.mode ?? modeForm.mode} atualizado. Autocadastro nunca libera contratos sozinho.`);
  }
  const [accReqForm, setAccReqForm] = useState({ mode: "convite", client_account_id: "", requested_email: "", requested_name: "", document_ref: "" });
  const criarPedido = () => gravar("pedido", "/api/admin/portal-access-requests", "POST", {
    mode: accReqForm.mode, client_account_id: accReqForm.client_account_id || null,
    requested_email: accReqForm.requested_email, requested_name: accReqForm.requested_name,
    document_ref: accReqForm.document_ref || null,
  }, d => `Pedido de acesso ${d.request?.protocol ?? ""} registrado com vínculo conferido no servidor.`);
  const [accApproveForm, setAccApproveForm] = useState({ id: "", status: "aprovada", reason: "" });
  function decidirPedido() {
    const motivo = validarMotivo(accApproveForm.reason);
    if (!motivo.ok) { setMsg(""); setErro(motivo.erro); return; }
    void gravar("decisao", "/api/admin/portal-access-requests", "PATCH", {
      id: accApproveForm.id, status: accApproveForm.status, reason: motivo.motivo,
    }, d => `Pedido ${d.request?.protocol ?? accApproveForm.id} agora está ${d.request?.status ?? accApproveForm.status}.`);
  }

  // CLI-14 segurança + troca de e-mail
  const [secForm, setSecForm] = useState({ client_account_id: "", contact_id: "", event_type: "mfa_enabled", ip_address: "" });
  const criarEvento = () => gravar("evento", "/api/cli/security-events", "POST", {
    client_account_id: secForm.client_account_id, contact_id: secForm.contact_id || null,
    event_type: secForm.event_type, ip_address: secForm.ip_address || null,
  }, d => `Evento ${d.event?.event_type ?? secForm.event_type} registrado para a conta.`);
  const [emailForm, setEmailForm] = useState({ client_account_id: "", contact_id: "", old_email: "", new_email: "" });
  const criarTroca = () => gravar("troca", "/api/cli/email-change-requests", "POST", {
    client_account_id: emailForm.client_account_id, contact_id: emailForm.contact_id || null,
    old_email: emailForm.old_email, new_email: emailForm.new_email,
  }, d => `Troca de e-mail ${d.request?.protocol ?? ""} aguardando o token enviado ao endereço novo.`);
  const [emailConfirmForm, setEmailConfirmForm] = useState({ id: "", token: "" });
  const confirmarTroca = () => gravar("confirmacao", "/api/cli/email-change-requests", "PATCH", {
    id: emailConfirmForm.id, token: emailConfirmForm.token, action: "confirm",
  }, d => `E-mail alterado para ${d.request?.new_email ?? emailConfirmForm.id}.`);

  const ocupado = (rotulo: string) => gravando === rotulo;
  const bloqueado = gravando !== "";

  return (
    <section className={styles.page} data-testid="clifin">
      <header className={styles.head}>
        <div>
          <span className={styles.eyebrow}>CLI-09 a CLI-14 · CONSOLE ADMINISTRATIVO</span>
          <h2>Financeiro do portal</h2>
          <p className={styles.lead}>Cobranças fiscais, serviço adicional, satisfação, renovação, modos de entrada, pedidos de acesso, segurança da conta e troca de e-mail — todos em rota canônica alcançável por <code>ti</code> e <code>admin</code>.</p>
        </div>
        <div className={styles.readBox}>
          <span className={styles.stamp} data-testid="clifin-hora">{resumo ? `Lido às ${resumo.hora}` : "Lendo…"}</span>
          <button type="button" className={styles.retry} onClick={() => void loadAll()} disabled={lendo} aria-busy={lendo}>
            {lendo ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {resumo && resumo.mensagem && (
        <p className={styles.alert} role="alert" data-testid="clifin-faixa" data-completo={resumo.completo ? "sim" : "nao"}>
          {resumo.mensagem}{" "}
          <button type="button" className={styles.link} onClick={() => void loadAll()} disabled={lendo}>Tentar de novo</button>
        </p>
      )}

      {msg && <p className={styles.ok} role="status" data-testid="clifin-ok">{msg}</p>}
      {erro && <p className={styles.alert} role="alert" data-testid="clifin-erro">{erro} <button type="button" className={styles.link} onClick={() => setErro("")}>Fechar</button></p>}

      <div className={styles.grid}>
        <article className={styles.card} data-testid="clifin-bloco-cobrancas">
          <h3>Cobranças e documentos fiscais</h3>
          <p className={styles.hint}>Documento fiscal só quando o financeiro está integrado e os dados são da própria conta.</p>
          <div className={styles.formRow}>
            <input aria-label="account_id da cobrança" placeholder="account_id" value={chargeForm.client_account_id} onChange={e => setChargeForm({ ...chargeForm, client_account_id: e.target.value })} />
            <input aria-label="contract_id da cobrança" placeholder="contract_id (opcional)" value={chargeForm.contract_id} onChange={e => setChargeForm({ ...chargeForm, contract_id: e.target.value })} />
            <select aria-label="tipo de cobrança" value={chargeForm.charge_type} onChange={e => setChargeForm({ ...chargeForm, charge_type: e.target.value })}><option value="mensalidade">mensalidade</option><option value="taxa_extra">taxa extra</option><option value="multa">multa</option></select>
            <input aria-label="valor em centavos" placeholder="valor em centavos" value={chargeForm.amount_cents} onChange={e => setChargeForm({ ...chargeForm, amount_cents: e.target.value })} />
            <input aria-label="vencimento" type="date" value={chargeForm.due_date} onChange={e => setChargeForm({ ...chargeForm, due_date: e.target.value })} />
            <select aria-label="documento fiscal" value={chargeForm.is_fiscal} onChange={e => setChargeForm({ ...chargeForm, is_fiscal: e.target.value })}><option value="false">não fiscal</option><option value="true">fiscal</option></select>
            <select aria-label="integração financeira" value={chargeForm.finance_integration_active} onChange={e => setChargeForm({ ...chargeForm, finance_integration_active: e.target.value })}><option value="true">financeiro integrado</option><option value="false">sem integração</option></select>
            <input aria-label="url do documento fiscal" placeholder="url do documento fiscal" value={chargeForm.fiscal_document_url} onChange={e => setChargeForm({ ...chargeForm, fiscal_document_url: e.target.value })} />
            <input aria-label="chave do documento fiscal" placeholder="storage_key do documento" value={chargeForm.fiscal_document_storage_key} onChange={e => setChargeForm({ ...chargeForm, fiscal_document_storage_key: e.target.value })} />
            <button type="button" onClick={criarCobranca} disabled={bloqueado}>{ocupado("cobranca") ? "Registrando…" : "Criar cobrança"}</button>
          </div>
          {lista("cobrancas")}
          <ul className={styles.list} data-testid="clifin-lista-cobrancas">
            {itens<Charge>("cobrancas").map(c => <li key={c.id}>{c.protocol} · {c.charge_type} · {c.status} · R$ {(c.amount_cents / 100).toFixed(2)} · vence {c.due_date}{c.is_fiscal ? " · FISCAL" : ""} · {c.finance_integration_active ? "integrado" : "sem integração"}</li>)}
          </ul>
        </article>

        <article className={styles.card} data-testid="clifin-bloco-servicos">
          <h3>Solicitação de serviço adicional</h3>
          <p className={styles.hint}>Toda solicitação nasce como oportunidade CRM com origem e responsável.</p>
          <div className={styles.formRow}>
            <input aria-label="account_id do serviço" placeholder="account_id" value={srvForm.client_account_id} onChange={e => setSrvForm({ ...srvForm, client_account_id: e.target.value })} />
            <input aria-label="contract_id do serviço" placeholder="contract_id (opcional)" value={srvForm.contract_id} onChange={e => setSrvForm({ ...srvForm, contract_id: e.target.value })} />
            <input aria-label="contact_id do serviço" placeholder="contact_id (opcional)" value={srvForm.contact_id} onChange={e => setSrvForm({ ...srvForm, contact_id: e.target.value })} />
            <input aria-label="título do serviço" placeholder="título" value={srvForm.title} onChange={e => setSrvForm({ ...srvForm, title: e.target.value })} />
            <input aria-label="descrição do serviço" placeholder="descrição" value={srvForm.description} onChange={e => setSrvForm({ ...srvForm, description: e.target.value })} />
            <select aria-label="origem do serviço" value={srvForm.origin} onChange={e => setSrvForm({ ...srvForm, origin: e.target.value })}><option value="portal_cliente">portal do cliente</option><option value="telefone">telefone</option><option value="email">e-mail</option></select>
            <input aria-label="responsável do serviço" placeholder="responsável" value={srvForm.responsible_name} onChange={e => setSrvForm({ ...srvForm, responsible_name: e.target.value })} />
            <button type="button" onClick={criarServico} disabled={bloqueado}>{ocupado("servico") ? "Registrando…" : "Solicitar serviço"}</button>
          </div>
          {lista("servicos")}
          <ul className={styles.list} data-testid="clifin-lista-servicos">
            {itens<ServiceReq>("servicos").map(s => <li key={s.id}>{s.protocol} · {s.title} · {s.status} · origem {s.origin} · resp {s.responsible_name || "—"} · CRM {s.crm_opportunity_id ? s.crm_opportunity_id.slice(0, 6) : "pendente"}</li>)}
          </ul>
        </article>

        <article className={styles.card} data-testid="clifin-bloco-satisfacao">
          <h3>Satisfação e plano de ação</h3>
          <p className={styles.hint}>Risco de renovação precisa de fatos próprios; plano de ação é escrito à parte.</p>
          <div className={styles.formRow}>
            <input aria-label="account_id da satisfação" placeholder="account_id" value={satForm.client_account_id} onChange={e => setSatForm({ ...satForm, client_account_id: e.target.value })} />
            <input aria-label="contract_id da satisfação" placeholder="contract_id (opcional)" value={satForm.contract_id} onChange={e => setSatForm({ ...satForm, contract_id: e.target.value })} />
            <input aria-label="ticket_id da satisfação" placeholder="ticket_id (opcional)" value={satForm.ticket_id} onChange={e => setSatForm({ ...satForm, ticket_id: e.target.value })} />
            <select aria-label="tipo de pesquisa" value={satForm.survey_type} onChange={e => setSatForm({ ...satForm, survey_type: e.target.value })}><option value="pos_atendimento">pós-atendimento</option><option value="periodica">periódica</option></select>
            <input aria-label="nota de 0 a 10" placeholder="nota 0..10" value={satForm.score} onChange={e => setSatForm({ ...satForm, score: e.target.value })} />
            <input aria-label="comentário da satisfação" placeholder="comentário" value={satForm.feedback} onChange={e => setSatForm({ ...satForm, feedback: e.target.value })} />
            <select aria-label="risco de renovação" value={satForm.renewal_risk} onChange={e => setSatForm({ ...satForm, renewal_risk: e.target.value })}><option value="">risco —</option><option value="baixo">baixo</option><option value="medio">médio</option><option value="alto">alto</option></select>
            <input aria-label="motivo do risco" placeholder="motivo do risco" value={satForm.renewal_risk_reason} onChange={e => setSatForm({ ...satForm, renewal_risk_reason: e.target.value })} />
            <input aria-label="fatos em json" placeholder='fatos em json' value={satForm.facts_json} onChange={e => setSatForm({ ...satForm, facts_json: e.target.value })} />
            <input aria-label="plano de ação" placeholder="plano de ação" value={satForm.action_plan} onChange={e => setSatForm({ ...satForm, action_plan: e.target.value })} />
            <button type="button" onClick={criarSatisfacao} disabled={bloqueado}>{ocupado("satisfacao") ? "Registrando…" : "Criar satisfação"}</button>
          </div>
          {lista("satisfacao")}
          <ul className={styles.list} data-testid="clifin-lista-satisfacao">
            {itens<Survey>("satisfacao").map(s => <li key={s.id}>{s.protocol} · {s.survey_type} · {s.status} · nota {s.score ?? "—"} · risco {s.renewal_risk || "—"} <button type="button" className={styles.link} onClick={() => setSatActionForm({ ...satActionForm, survey_id: s.id })}>usar no plano</button></li>)}
          </ul>
          <div className={styles.formRow}>
            <input aria-label="survey_id do plano" placeholder="survey_id" value={satActionForm.survey_id} onChange={e => setSatActionForm({ ...satActionForm, survey_id: e.target.value })} />
            <input aria-label="ação do plano" placeholder="ação" value={satActionForm.action} onChange={e => setSatActionForm({ ...satActionForm, action: e.target.value })} />
            <input aria-label="responsável do plano" placeholder="responsável" value={satActionForm.responsible_name} onChange={e => setSatActionForm({ ...satActionForm, responsible_name: e.target.value })} />
            <input aria-label="prazo do plano" type="date" value={satActionForm.due_date} onChange={e => setSatActionForm({ ...satActionForm, due_date: e.target.value })} />
            <button type="button" onClick={criarPlano} disabled={bloqueado}>{ocupado("plano") ? "Registrando…" : "Criar plano de ação"}</button>
          </div>
        </article>

        <article className={styles.card} data-testid="clifin-bloco-renovacoes">
          <h3>Comunicações de renovação</h3>
          <p className={styles.hint}>Bloqueio do portal só é declarado com motivo; inadimplência não bloqueia em massa.</p>
          <div className={styles.formRow}>
            <input aria-label="account_id da renovação" placeholder="account_id" value={renForm.client_account_id} onChange={e => setRenForm({ ...renForm, client_account_id: e.target.value })} />
            <input aria-label="contract_id da renovação" placeholder="contract_id (opcional)" value={renForm.contract_id} onChange={e => setRenForm({ ...renForm, contract_id: e.target.value })} />
            <select aria-label="tipo de comunicação" value={renForm.comm_type} onChange={e => setRenForm({ ...renForm, comm_type: e.target.value })}><option value="aviso_vencimento">aviso de vencimento</option><option value="proposta_renovacao">proposta de renovação</option><option value="reajuste">reajuste</option><option value="encerramento">encerramento</option></select>
            <input aria-label="título da comunicação" placeholder="título" value={renForm.title} onChange={e => setRenForm({ ...renForm, title: e.target.value })} />
            <input aria-label="conteúdo da comunicação" placeholder="conteúdo" value={renForm.content} onChange={e => setRenForm({ ...renForm, content: e.target.value })} />
            <select aria-label="bloqueio da comunicação" value={renForm.is_blocking} onChange={e => setRenForm({ ...renForm, is_blocking: e.target.value })}><option value="false">não bloqueia</option><option value="true">bloqueia</option></select>
            <input aria-label="motivo do bloqueio" placeholder="motivo do bloqueio" value={renForm.block_reason} onChange={e => setRenForm({ ...renForm, block_reason: e.target.value })} />
            <button type="button" onClick={criarRenovacao} disabled={bloqueado}>{ocupado("renovacao") ? "Registrando…" : "Criar comunicação"}</button>
          </div>
          {lista("renovacoes")}
          <ul className={styles.list} data-testid="clifin-lista-renovacoes">
            {itens<Renewal>("renovacoes").map(r => <li key={r.id}>{r.protocol} · {r.comm_type} · {r.title} · {r.is_blocking ? "BLOQUEIA" : "não bloqueia"} · enviado {r.sent_at ? new Date(r.sent_at).toLocaleDateString("pt-BR") : "—"}</li>)}
          </ul>
        </article>

        <article className={styles.card} data-testid="clifin-bloco-modos">
          <h3>Modos de entrada do portal</h3>
          <p className={styles.hint}>Toda mudança de modo exige motivo de 10 a 500 caracteres e fica no histórico.</p>
          <div className={styles.formRow}>
            <select aria-label="modo" value={modeForm.mode} onChange={e => setModeForm({ ...modeForm, mode: e.target.value })}><option value="convite">convite</option><option value="solicitacao_aprovacao">solicitação com aprovação</option><option value="autocadastro">autocadastro</option></select>
            <select aria-label="situação do modo" value={modeForm.is_active} onChange={e => setModeForm({ ...modeForm, is_active: e.target.value })}><option value="true">ativo</option><option value="false">inativo</option></select>
            <select aria-label="requer aprovação" value={modeForm.requires_approval} onChange={e => setModeForm({ ...modeForm, requires_approval: e.target.value })}><option value="true">requer aprovação</option><option value="false">sem aprovação</option></select>
            <select aria-label="libera contratos" value={modeForm.auto_release_contracts} onChange={e => setModeForm({ ...modeForm, auto_release_contracts: e.target.value })}><option value="false">não libera contratos</option><option value="true">libera contratos</option></select>
            <input aria-label="motivo da mudança de modo" placeholder="motivo (10 a 500)" value={modeForm.reason} onChange={e => setModeForm({ ...modeForm, reason: e.target.value })} />
            <button type="button" onClick={atualizarModo} disabled={bloqueado}>{ocupado("modo") ? "Gravando…" : "Atualizar modo"}</button>
          </div>
          {lista("modos")}
          <ul className={styles.list} data-testid="clifin-lista-modos">
            {itens<PortalMode>("modos").map(m => <li key={m.mode}>{m.mode} · {m.is_active ? "ativo" : "inativo"} · {m.requires_approval ? "requer aprovação" : "sem aprovação"} · {m.auto_release_contracts ? "libera contratos" : "não libera contratos"}{m.mode === "autocadastro" && !m.auto_release_contracts ? " · nunca libera sozinho" : ""}</li>)}
          </ul>
        </article>

        <article className={styles.card} data-testid="clifin-bloco-acessos">
          <h3>Pedidos de acesso ao portal</h3>
          <p className={styles.hint}>Aprovar exige vínculo verificado no servidor; rejeitar e aprovar exigem motivo.</p>
          <div className={styles.formRow}>
            <select aria-label="modo do pedido" value={accReqForm.mode} onChange={e => setAccReqForm({ ...accReqForm, mode: e.target.value })}><option value="convite">convite</option><option value="solicitacao_aprovacao">solicitação com aprovação</option><option value="autocadastro">autocadastro</option></select>
            <input aria-label="account_id do pedido" placeholder="account_id (opcional)" value={accReqForm.client_account_id} onChange={e => setAccReqForm({ ...accReqForm, client_account_id: e.target.value })} />
            <input aria-label="e-mail do pedido" placeholder="e-mail" value={accReqForm.requested_email} onChange={e => setAccReqForm({ ...accReqForm, requested_email: e.target.value })} />
            <input aria-label="nome do pedido" placeholder="nome" value={accReqForm.requested_name} onChange={e => setAccReqForm({ ...accReqForm, requested_name: e.target.value })} />
            <input aria-label="documento do pedido" placeholder="documento" value={accReqForm.document_ref} onChange={e => setAccReqForm({ ...accReqForm, document_ref: e.target.value })} />
            <button type="button" onClick={criarPedido} disabled={bloqueado}>{ocupado("pedido") ? "Registrando…" : "Registrar pedido"}</button>
          </div>
          {lista("acessos")}
          <ul className={styles.list} data-testid="clifin-lista-acessos">
            {itens<AccessReq>("acessos").map(r => <li key={r.id}>{r.protocol} · {r.mode} · {r.requested_email} · {r.status} · vínculo {r.verified_link ? "verificado" : "não verificado"} <button type="button" className={styles.link} onClick={() => setAccApproveForm({ ...accApproveForm, id: r.id })}>usar na decisão</button></li>)}
          </ul>
          <div className={styles.formRow}>
            <input aria-label="id do pedido a decidir" placeholder="id do pedido" value={accApproveForm.id} onChange={e => setAccApproveForm({ ...accApproveForm, id: e.target.value })} />
            <select aria-label="decisão" value={accApproveForm.status} onChange={e => setAccApproveForm({ ...accApproveForm, status: e.target.value })}><option value="aprovada">aprovar</option><option value="rejeitada">rejeitar</option></select>
            <input aria-label="motivo da decisão" placeholder="motivo (10 a 500)" value={accApproveForm.reason} onChange={e => setAccApproveForm({ ...accApproveForm, reason: e.target.value })} />
            <button type="button" onClick={decidirPedido} disabled={bloqueado}>{ocupado("decisao") ? "Gravando…" : "Registrar decisão"}</button>
          </div>
        </article>

        <article className={styles.card} data-testid="clifin-bloco-seguranca">
          <h3>Segurança da conta</h3>
          <p className={styles.hint}>MFA é opcional e o evento é registro, não liberação de acesso.</p>
          <div className={styles.formRow}>
            <input aria-label="account_id do evento" placeholder="account_id" value={secForm.client_account_id} onChange={e => setSecForm({ ...secForm, client_account_id: e.target.value })} />
            <input aria-label="contact_id do evento" placeholder="contact_id (opcional)" value={secForm.contact_id} onChange={e => setSecForm({ ...secForm, contact_id: e.target.value })} />
            <select aria-label="tipo de evento" value={secForm.event_type} onChange={e => setSecForm({ ...secForm, event_type: e.target.value })}><option value="mfa_enabled">MFA habilitado</option><option value="mfa_disabled">MFA desabilitado</option><option value="session_revoked">sessão revogada</option><option value="email_change_requested">troca de e-mail solicitada</option><option value="email_changed">e-mail trocado</option></select>
            <input aria-label="ip do evento" placeholder="ip" value={secForm.ip_address} onChange={e => setSecForm({ ...secForm, ip_address: e.target.value })} />
            <button type="button" onClick={criarEvento} disabled={bloqueado}>{ocupado("evento") ? "Registrando…" : "Registrar evento"}</button>
          </div>
          {lista("seguranca")}
          <ul className={styles.list} data-testid="clifin-lista-seguranca">
            {itens<SecEvent>("seguranca").map(s => <li key={s.id}>{s.event_type} · conta {s.client_account_id.slice(0, 6)} · {new Date(s.created_at).toLocaleString("pt-BR")}</li>)}
          </ul>
        </article>

        <article className={styles.card} data-testid="clifin-bloco-emails">
          <h3>Troca de e-mail da conta</h3>
          <p className={styles.hint}>O token vai para o endereço novo; confirmar exige o token exato.</p>
          <div className={styles.formRow}>
            <input aria-label="account_id da troca" placeholder="account_id" value={emailForm.client_account_id} onChange={e => setEmailForm({ ...emailForm, client_account_id: e.target.value })} />
            <input aria-label="contact_id da troca" placeholder="contact_id (opcional)" value={emailForm.contact_id} onChange={e => setEmailForm({ ...emailForm, contact_id: e.target.value })} />
            <input aria-label="e-mail atual" placeholder="e-mail atual" value={emailForm.old_email} onChange={e => setEmailForm({ ...emailForm, old_email: e.target.value })} />
            <input aria-label="e-mail novo" placeholder="e-mail novo" value={emailForm.new_email} onChange={e => setEmailForm({ ...emailForm, new_email: e.target.value })} />
            <button type="button" onClick={criarTroca} disabled={bloqueado}>{ocupado("troca") ? "Registrando…" : "Solicitar troca"}</button>
          </div>
          {lista("emails")}
          <ul className={styles.list} data-testid="clifin-lista-emails">
            {itens<EmailReq>("emails").map(e => <li key={e.id}>{e.protocol} · {e.old_email} → {e.new_email} · {e.status} · expira {new Date(e.expires_at).toLocaleString("pt-BR")} <button type="button" className={styles.link} onClick={() => setEmailConfirmForm({ id: e.id, token: e.token })}>usar token</button></li>)}
          </ul>
          <div className={styles.formRow}>
            <input aria-label="id da troca a confirmar" placeholder="id da troca" value={emailConfirmForm.id} onChange={e => setEmailConfirmForm({ ...emailConfirmForm, id: e.target.value })} />
            <input aria-label="token da troca" placeholder="token" value={emailConfirmForm.token} onChange={e => setEmailConfirmForm({ ...emailConfirmForm, token: e.target.value })} />
            <button type="button" onClick={confirmarTroca} disabled={bloqueado}>{ocupado("confirmacao") ? "Confirmando…" : "Confirmar troca"}</button>
          </div>
        </article>
      </div>
      <p className={styles.foot}>Leitura: <strong>{resumo ? `${resumo.lidos}/${resumo.total}` : "—"}</strong> blocos · negados {resumo?.negados ?? 0} · falhas {resumo?.falhas ?? 0} · vazios {resumo?.vazios ?? 0}. Nenhuma escrita é confirmada sem resposta do servidor.</p>
      <span className={styles.srOnly} data-testid="clifin-resumo">{JSON.stringify(resumo ?? {})}</span>
    </section>
  );
}
