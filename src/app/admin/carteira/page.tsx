"use client";

// UX-03B — carteira comercial: lista → contexto → próxima ação.
// A API `/api/crm/portfolio` não mudou: mesmos filtros, mesmo corpo de criação,
// mesma `request_key` de idempotência e mesmas regras de alçada no servidor.

import { useCallback, useEffect, useState } from "react";
import AdminGate from "../AdminGate";
import UiWorkspace from "../../../components/ui/UiWorkspace";
import UiPanel from "../../../components/ui/UiPanel";
import UiAsyncState, { type UiAsyncStatus } from "../../../components/ui/UiAsyncState";
import UiBadge from "../../../components/ui/UiBadge";
import { readJsonResult, failureFromCause, type UxFailure } from "../../../lib/ux-feedback.mjs";
import { stageLabel, formatDateTimeBR } from "../../../lib/crm-labels.mjs";
import ui from "../../../components/ui/UiWorkspace.module.css";
import styles from "./Carteira.module.css";

type PortfolioItem = {
  id: string; title: string; company_name: string; group_name: string | null; unit_name: string | null;
  stage: string; next_action: string | null; next_action_date: string | null;
};
type PortfolioAction = { id: string; kind: string; title: string; stage: string };
type PortfolioMetric = { kind: string; total: number; won: number; lost: number };
type PortfolioPayload = { total: number; items: PortfolioItem[]; metrics: PortfolioMetric[]; actions: PortfolioAction[] };
type Company = { id: string; display_name: string };

const PAGE_SIZE = 50;

const FILTERS: [string, string, string][] = [
  ["all", "Todas as oportunidades", "Tudo que está sob sua responsabilidade."],
  ["no_next", "Sem próxima ação", "Abertas que não têm próximo contato combinado."],
  ["overdue", "Próxima ação vencida", "Abertas cujo próximo contato já passou da data."],
  ["won", "Ganhas", "Fechadas no funil. Ganho comercial não é dinheiro recebido."],
  ["lost", "Perdidas (reativação)", "Base para tentativas de reativação."],
];

const ACTION_KINDS: [string, string][] = [
  ["renovacao", "Renovação"],
  ["upsell", "Ampliação do serviço"],
  ["cross_sell", "Serviço adicional"],
  ["recuperacao", "Reativação de perdida"],
  ["indicacao", "Indicação"],
];

function kindLabel(kind: string) {
  return ACTION_KINDS.find(([value]) => value === kind)?.[1] || kind;
}

function CarteiraContent() {
  const [data, setData] = useState<PortfolioPayload | null>(null);
  const [status, setStatus] = useState<UiAsyncStatus>("idle");
  const [failure, setFailure] = useState<UxFailure | null>(null);
  const [filter, setFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const [source, setSource] = useState<PortfolioItem | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesFailure, setCompaniesFailure] = useState<UxFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ kind: "renovacao", title: "", next_action: "", next_action_date: "", target_company_id: "" });
  const [requestKey, setRequestKey] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setFailure(null);
    try {
      const response = await fetch(`/api/crm/portfolio?filter=${filter}&offset=${offset}`, { cache: "no-store" });
      const result = await readJsonResult<PortfolioPayload>(response);
      if (!result.ok) { setData(null); setFailure(result.failure); setStatus("failed"); return; }
      setData(result.data);
      setStatus("ready");
    } catch (cause) { setData(null); setFailure(failureFromCause(cause)); setStatus("failed"); }
  }, [filter, offset]);

  useEffect(() => { void load(); }, [load]);

  async function startAction(item: PortfolioItem) {
    setSource(item);
    setMessage("");
    setFormError("");
    setCompaniesFailure(null);
    // Idempotência preservada: uma chave por intenção de criação.
    setRequestKey(crypto.randomUUID());
    setForm({ kind: "renovacao", title: "", next_action: "", next_action_date: "", target_company_id: "" });
    try {
      const response = await fetch("/api/crm/companies?limit=200", { cache: "no-store" });
      const result = await readJsonResult<{ companies?: Company[] }>(response);
      if (!result.ok) { setCompanies([]); setCompaniesFailure(result.failure); return; }
      setCompanies(result.data.companies || []);
    } catch (cause) { setCompanies([]); setCompaniesFailure(failureFromCause(cause)); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !source) return;
    setBusy(true);
    setFormError("");
    setMessage("");
    try {
      const response = await fetch("/api/crm/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          source_id: source.id,
          request_key: requestKey,
          next_action_date: new Date(form.next_action_date).toISOString(),
        }),
      });
      const result = await readJsonResult(response);
      if (!result.ok) { setFormError(result.failure.message); return; }
      setMessage(`Ação de ${kindLabel(form.kind).toLowerCase()} registrada: a nova oportunidade entrou no funil com o próximo contato marcado.`);
      setSource(null);
      await load();
    } catch (cause) { setFormError(failureFromCause(cause).message); }
    finally { setBusy(false); }
  }

  const activeFilter = FILTERS.find(([value]) => value === filter);

  return (
    <UiWorkspace
      title="Carteira e próximos contatos"
      intro="Oportunidades sob sua responsabilidade, incluindo vínculos de grupo e unidade. Ganho comercial é estado do funil e não representa dinheiro recebido."
      tasks={[
        { href: "#carteira-lista", label: "Revisar carteira" },
        { href: "#carteira-resultados", label: "Resultados das ações" },
        { href: "/admin/crm", label: "Ir ao funil (CRM)" },
        { href: "/admin/comercial", label: "Ir ao comercial" },
      ]}
      tasksLabel="Tarefas da carteira"
    >
      <UiPanel
        id="carteira-filtro"
        eyebrow="Consulta"
        title="Escolher o recorte da carteira"
        description="O filtro é aplicado pelo servidor sobre as oportunidades das quais você é responsável."
      >
        <div className={ui.filterBar}>
          <div className={ui.field}>
            <label htmlFor="carteira-filtro-select">Filtro da carteira</label>
            <select
              id="carteira-filtro-select"
              value={filter}
              onChange={event => { setFilter(event.target.value); setOffset(0); }}
              aria-describedby="carteira-filtro-hint"
            >
              {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <p className={ui.fieldHint} id="carteira-filtro-hint">{activeFilter?.[2]}</p>
          </div>
        </div>
      </UiPanel>

      <UiPanel
        id="carteira-lista"
        eyebrow="Lista"
        title={status === "ready" && data ? `Oportunidades na carteira (${data.total})` : "Oportunidades na carteira"}
        description="Cada cartão mostra empresa, vínculo, etapa e o próximo contato. Use “Criar ação de carteira” para abrir uma nova oportunidade derivada."
      >
        <UiAsyncState
          status={status}
          failure={failure}
          label="oportunidades da carteira"
          isEmpty={Boolean(data) && data!.items.length === 0}
          emptyTitle="Nenhuma oportunidade neste recorte"
          emptyMessage="O servidor respondeu sem registros para este filtro. Troque o filtro ou acompanhe o funil no CRM."
          onRetry={() => void load()}
        >
          {data ? (
            <>
              <ul className={styles.cardList}>
                {data.items.map(item => (
                  <li key={item.id}>
                    <article className={styles.card} aria-label={`Oportunidade ${item.title}`}>
                      <h3 className={styles.cardTitle}>{item.title}</h3>
                      <p className={styles.badges}>
                        <UiBadge tone="info" srPrefix="Etapa">{stageLabel(item.stage)}</UiBadge>
                        {!item.next_action ? <UiBadge tone="warning" srPrefix="Atenção">Sem próxima ação</UiBadge> : null}
                      </p>
                      <dl className={styles.facts}>
                        <div className={styles.fact}><dt>Empresa</dt><dd>{item.company_name}</dd></div>
                        <div className={styles.fact}><dt>Grupo</dt><dd>{item.group_name || "não vinculado"}</dd></div>
                        <div className={styles.fact}><dt>Unidade</dt><dd>{item.unit_name || "não definida"}</dd></div>
                        <div className={styles.fact}><dt>Próxima ação</dt><dd>{item.next_action || "não definida"}</dd></div>
                        <div className={styles.fact}><dt>Quando</dt><dd>{item.next_action_date ? formatDateTimeBR(item.next_action_date) : "sem data"}</dd></div>
                      </dl>
                      <div className={ui.formActions}>
                        <button type="button" className={ui.primary} onClick={() => void startAction(item)}>
                          Criar ação de carteira
                        </button>
                        <a className={ui.secondary} href="/admin/crm" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                          Abrir funil para atualizar
                        </a>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
              <nav className={ui.formActions} aria-label="Paginação da carteira">
                <button type="button" className={ui.secondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  Página anterior
                </button>
                <span className={ui.fieldHint}>
                  Mostrando {data.items.length} de {data.total}, a partir do item {data.total === 0 ? 0 : offset + 1}.
                </span>
                <button type="button" className={ui.secondary} disabled={offset + PAGE_SIZE >= data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                  Próxima página
                </button>
              </nav>
            </>
          ) : null}
        </UiAsyncState>
      </UiPanel>

      {source ? (
        <UiPanel
          id="carteira-nova-acao"
          eyebrow="Próximo passo"
          title={`Nova ação a partir de ${source.title}`}
          description="A ação cria uma oportunidade nova no funil, com você como responsável e o próximo contato já marcado. Reenviar o mesmo formulário não duplica o registro."
          actions={<button type="button" className={ui.secondary} onClick={() => setSource(null)}>Cancelar</button>}
        >
          <form onSubmit={submit} aria-label="Nova ação de carteira">
            <div className={ui.formGrid}>
              <div className={ui.field}>
                <label htmlFor="carteira-kind">Tipo de ação</label>
                <select id="carteira-kind" value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value })}>
                  {ACTION_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {form.kind === "recuperacao" ? (
                  <p className={ui.fieldHint}>A reativação só é aceita quando a oportunidade de origem está perdida.</p>
                ) : null}
              </div>
              {form.kind === "indicacao" ? (
                <div className={ui.field}>
                  <label htmlFor="carteira-target">Empresa indicada</label>
                  <span className={ui.required} aria-hidden="true">Campo obrigatório</span>
                  <select id="carteira-target" required aria-required="true" value={form.target_company_id} onChange={event => setForm({ ...form, target_company_id: event.target.value })}>
                    <option value="">Selecione uma empresa cadastrada</option>
                    {companies.map(company => <option key={company.id} value={company.id}>{company.display_name}</option>)}
                  </select>
                  {companiesFailure ? <p className={ui.fieldError}>{companiesFailure.message}</p> : null}
                </div>
              ) : null}
              <div className={ui.field}>
                <label htmlFor="carteira-title">Título da nova oportunidade</label>
                <span className={ui.required} aria-hidden="true">Campo obrigatório</span>
                <input id="carteira-title" required aria-required="true" minLength={3} maxLength={200} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} />
              </div>
              <div className={ui.field}>
                <label htmlFor="carteira-next">Próxima ação</label>
                <span className={ui.required} aria-hidden="true">Campo obrigatório</span>
                <input id="carteira-next" required aria-required="true" minLength={3} maxLength={200} value={form.next_action} onChange={event => setForm({ ...form, next_action: event.target.value })} />
              </div>
              <div className={ui.field}>
                <label htmlFor="carteira-next-date">Data da próxima ação</label>
                <span className={ui.required} aria-hidden="true">Campo obrigatório</span>
                <input id="carteira-next-date" type="datetime-local" required aria-required="true" value={form.next_action_date} onChange={event => setForm({ ...form, next_action_date: event.target.value })} />
              </div>
            </div>
            <div className={ui.formActions}>
              <button type="submit" className={ui.primary} disabled={busy}>
                {busy ? "Registrando…" : "Registrar oportunidade"}
              </button>
            </div>
            {formError ? <p className={ui.fieldError} role="alert">{formError}</p> : null}
          </form>
        </UiPanel>
      ) : null}

      <p className={ui.formStatus} role="status" aria-live="polite">
        {message ? <span className={ui.formStatusOk}>{message}</span> : null}
      </p>

      <UiPanel
        id="carteira-resultados"
        eyebrow="Acompanhamento"
        title="Resultados das ações de carteira"
        description="Contagem das oportunidades criadas por você a partir da carteira e o desfecho delas no funil."
      >
        <UiAsyncState
          status={status}
          failure={failure}
          label="resultados das ações"
          isEmpty={Boolean(data) && data!.metrics.length === 0}
          emptyTitle="Nenhuma ação de carteira registrada ainda"
          emptyMessage="Assim que você criar uma renovação, ampliação, serviço adicional, reativação ou indicação, o resultado aparece aqui."
          onRetry={() => void load()}
        >
          {data && data.metrics.length ? (
            <div className={ui.tableFrame}>
              <table>
                <caption>Ações criadas por você, agrupadas por tipo.</caption>
                <thead>
                  <tr><th scope="col">Tipo de ação</th><th scope="col">Criadas</th><th scope="col">Ganhas</th><th scope="col">Perdidas</th></tr>
                </thead>
                <tbody>
                  {data.metrics.map(metric => (
                    <tr key={metric.kind}>
                      <th scope="row">{kindLabel(metric.kind)}</th>
                      <td className={ui.numeric}>{metric.total}</td>
                      <td className={ui.numeric}>{metric.won}</td>
                      <td className={ui.numeric}>{metric.lost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </UiAsyncState>

        <h3>Ações recentes</h3>
        <UiAsyncState
          status={status}
          failure={failure}
          label="ações recentes"
          isEmpty={Boolean(data) && data!.actions.length === 0}
          emptyTitle="Nenhuma ação recente"
          emptyMessage="Nenhuma ação de carteira foi registrada por você até agora."
          onRetry={() => void load()}
        >
          {data && data.actions.length ? (
            <ul className={styles.actionList}>
              {data.actions.map(action => (
                <li key={action.id}>
                  <strong>{kindLabel(action.kind)}</strong> · {action.title} · etapa atual: {stageLabel(action.stage)}
                </li>
              ))}
            </ul>
          ) : null}
        </UiAsyncState>
      </UiPanel>
    </UiWorkspace>
  );
}

// F01: sessão central obrigatória — anônimo vai ao login e retorna aqui.
export default function Carteira() {
  return (
    <AdminGate allowedRoles={["comercial", "marcelo", "admin", "ti"]}>
      <CarteiraContent />
    </AdminGate>
  );
}
