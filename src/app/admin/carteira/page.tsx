"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminGate from "../AdminGate";
import UiState from "../../../components/ui/UiState";
import { crmRequest, type CrmErrorDescriptor } from "../../../lib/crm-request";
import { stageLabel } from "../../../lib/crm-vocabulary.mjs";
import styles from "../../../components/ui/UiWorkspace.module.css";
import carteiraStyles from "./Carteira.module.css";

// UX-03B: carteira legível. As chamadas, o `request_key` de idempotência, os
// filtros canônicos e o escopo por responsável continuam exatamente como
// estavam; o que mudou é a forma de ler e decidir o próximo passo.

type PortfolioItem = {
  id: string; title: string; company_name: string; group_name: string | null;
  unit_name: string | null; stage: string; next_action: string | null; next_action_date: string | null;
};
type PortfolioAction = { id: string; kind: string; title: string; stage: string };
type PortfolioMetric = { kind: string; total: number; won: number; lost: number };
type PortfolioData = { total: number; items: PortfolioItem[]; metrics: PortfolioMetric[]; actions: PortfolioAction[] };
type Company = { id: string; display_name: string };

const PAGE = 50;

const FILTERS = [
  { value: "all", label: "Todas as oportunidades", hint: "Tudo sob sua responsabilidade." },
  { value: "no_next", label: "Sem próxima ação", hint: "Abertas e sem combinado de contato." },
  { value: "overdue", label: "Próxima ação vencida", hint: "O prazo combinado já passou." },
  { value: "won", label: "Ganhas", hint: "Estado de funil; não é dinheiro recebido." },
  { value: "lost", label: "Perdidas / reativação", hint: "Base para ação de recuperação." },
] as const;

const ACTION_KINDS = [
  { value: "renovacao", label: "Renovação" },
  { value: "upsell", label: "Ampliação do serviço" },
  { value: "cross_sell", label: "Serviço adicional" },
  { value: "recuperacao", label: "Reativação de perdida" },
  { value: "indicacao", label: "Indicação" },
] as const;

function kindLabel(value: string) {
  return ACTION_KINDS.find(item => item.value === value)?.label ?? value;
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem data combinada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Sem data combinada" : parsed.toLocaleString("pt-BR");
}

// UX-PRO-06 (carteira): hora da última leitura concluída, para a faixa de dados
// desatualizados. Derivada do relógio do navegador no instante do sucesso —
// nenhum valor é estimado nem gravado.
function formatReadAt(value: number | null) {
  if (value === null) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function CarteiraContent() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [readState, setReadState] = useState<"loading" | "ready" | "failed">("loading");
  const [readError, setReadError] = useState<CrmErrorDescriptor | null>(null);
  // UX-PRO-06 (carteira): uma leitura concluída não é apagada pela falha
  // seguinte. O ref marca que JÁ existiu sucesso (sem causar recarga em
  // cascata); o estado guarda quando isso aconteceu e qual recorte foi lido.
  const readRef = useRef(false);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const [readOffset, setReadOffset] = useState(0);
  const [filter, setFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);

  const [source, setSource] = useState<PortfolioItem | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesError, setCompaniesError] = useState<CrmErrorDescriptor | null>(null);
  const [form, setForm] = useState({ kind: "renovacao", title: "", next_action: "", next_action_date: "", target_company_id: "" });
  const [requestKey, setRequestKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<CrmErrorDescriptor | null>(null);
  const [notice, setNotice] = useState("");

  const formHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const load = useCallback(async () => {
    setReadState("loading");
    setReadError(null);
    const result = await crmRequest<PortfolioData>(`/api/crm/portfolio?filter=${filter}&offset=${offset}`);
    if (!result.ok) {
      // UX-03B: falha de leitura não vira carteira vazia.
      // UX-PRO-06 (carteira): uma releitura que falha NÃO apaga o que já foi
      // lido — a tela preserva itens, totais e paginação e os marca como
      // desatualizados. Dúvida de autorização (401/403) é diferente: ali o
      // conteúdo é substituído pelo estado negado completo — a apresentação
      // falha fechada, sem dado preservado.
      const autorizacaoDuvidosa = result.error.kind === "denied" || result.error.kind === "auth";
      if (readRef.current && !autorizacaoDuvidosa) {
        setReadError(result.error);
        setStale(true);
        setReadState("ready");
        return;
      }
      setData(null);
      readRef.current = false;
      setStale(false);
      setReadError(result.error);
      setReadState("failed");
      return;
    }
    setData(result.data);
    readRef.current = true;
    setReadAt(Date.now());
    setReadOffset(offset);
    setStale(false);
    setReadState("ready");
  }, [filter, offset]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (source && formHeadingRef.current) formHeadingRef.current.focus(); }, [source]);

  async function startAction(item: PortfolioItem) {
    setSource(item);
    setNotice("");
    setFormError(null);
    // Chave de idempotência por tentativa: reenviar o mesmo formulário não
    // cria duas oportunidades (o servidor devolve a mesma).
    setRequestKey(crypto.randomUUID());
    setForm({ kind: "renovacao", title: "", next_action: "", next_action_date: "", target_company_id: "" });
    const result = await crmRequest<{ companies?: Company[] }>("/api/crm/companies?limit=200");
    if (!result.ok) { setCompanies([]); setCompaniesError(result.error); return; }
    setCompaniesError(null);
    setCompanies(result.data.companies || []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !source) return;
    setBusy(true);
    setFormError(null);
    setNotice("");
    const result = await crmRequest("/api/crm/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        source_id: source.id,
        request_key: requestKey,
        next_action_date: new Date(form.next_action_date).toISOString(),
      }),
    });
    setBusy(false);
    if (!result.ok) { setFormError(result.error); return; }
    setNotice(`Ação de ${kindLabel(form.kind).toLowerCase()} registrada: nova oportunidade no funil, com próxima ação combinada.`);
    setSource(null);
    await load();
  }

  const filterHint = FILTERS.find(item => item.value === filter)?.hint ?? "";

  return (
    <div className={styles.workspace} data-admin-content="true">
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <a href="/admin/comercial">Comercial</a> · <a href="/admin/crm">Empresas e funil</a> · <span aria-current="page">Carteira</span>
      </nav>
      <h1>Carteira e próximos contatos</h1>
      <p className={styles.lede}>
        Oportunidades sob sua responsabilidade, incluindo vínculos de grupo e unidade. A partir daqui você registra renovação,
        ampliação, serviço adicional, reativação ou indicação — cada uma vira uma oportunidade nova no funil, com próxima ação
        combinada. Ganho comercial é estado de funil, não é dinheiro recebido.
      </p>

      <section aria-labelledby="carteira-filtro-titulo" className={styles.panel}>
        <h2 id="carteira-filtro-titulo" className={styles.panelTitle}>O que você quer revisar agora?</h2>
        <fieldset className={styles.fieldset}>
          <legend>Recorte da carteira</legend>
          <div className={styles.field}>
            <label htmlFor="carteira-filtro">Filtro</label>
            <select id="carteira-filtro" value={filter} aria-describedby="carteira-filtro-hint"
              onChange={e => { setFilter(e.target.value); setOffset(0); }}>
              {FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <p className={styles.hint} id="carteira-filtro-hint">{filterHint}</p>
          </div>
        </fieldset>
      </section>

      {notice ? <UiState variant="success" title={notice} /> : null}

      <section aria-labelledby="carteira-lista-titulo" className={styles.panel}>
        <h2 id="carteira-lista-titulo" className={styles.panelTitle}>
          Oportunidades da carteira{readState === "ready" && data ? ` (${data.total})` : ""}
        </h2>

        {readState === "loading" && !readRef.current ? (
          <UiState variant="loading" title="Consultando a sua carteira…" />
        ) : readState === "failed" && readError ? (
          <UiState
            variant={readError.kind === "denied" || readError.kind === "auth" ? "denied" : "error"}
            title={readError.title}
            detail={readError.detail}
            onRetry={readError.kind === "retry" ? () => load() : undefined}
          />
        ) : (
          <>
            {readState === "loading" ? (
              <p role="status" className={carteiraStyles.updating} data-testid="carteira-atualizando">Atualizando a carteira…</p>
            ) : null}
            {stale && readError ? (
              <p role="alert" className={carteiraStyles.stale} data-testid="carteira-desatualizada">
                A última atualização da carteira falhou ({readError.title}). Os itens, os totais de ações e as ações
                recentes abaixo são da última leitura concluída, de {formatReadAt(readAt)}, e podem estar desatualizados
                — isto não significa que a carteira esteja vazia; o recorte exibido pode não ser o que você acabou de
                escolher. Fundo, totais e paginação voltam a acompanhar o recorte assim que uma leitura concluir.
                {readError.kind === "retry" ? (
                  <>
                    {" "}
                    <button type="button" onClick={() => load()}>Tentar novamente</button>
                  </>
                ) : null}
              </p>
            ) : null}
            {!data || data.items.length === 0 ? (
              <UiState variant="empty" title="Nenhuma oportunidade neste recorte." detail="Troque o filtro acima ou acompanhe o funil em Empresas e funil." />
            ) : (
              <>
                <div className={styles.cards}>
                  {data.items.map(item => {
                    const semProxima = !item.next_action || !item.next_action_date;
                    const vencida = Boolean(item.next_action_date) && new Date(item.next_action_date as string) < new Date();
                    return (
                      <article key={item.id} className={styles.card} data-alert={semProxima || vencida ? "true" : "false"} data-testid="carteira-cartao">
                        <h3 className={styles.cardTitle}>{item.title}</h3>
                        <dl className={styles.facts}>
                          <div><dt>Empresa</dt><dd>{item.company_name}</dd></div>
                          <div><dt>Grupo</dt><dd>{item.group_name || "não vinculado"}</dd></div>
                          <div><dt>Unidade</dt><dd>{item.unit_name || "não definida"}</dd></div>
                          <div><dt>Estágio</dt><dd>{stageLabel(item.stage)}</dd></div>
                          <div><dt>Próxima ação</dt><dd>{item.next_action || "Sem próxima ação combinada"}</dd></div>
                          <div><dt>Quando</dt><dd>{formatDateTime(item.next_action_date)}</dd></div>
                        </dl>
                        {semProxima ? <p className={styles.hint}><strong>Pendente:</strong> esta oportunidade está sem próximo contato combinado.</p> : null}
                        {!semProxima && vencida ? <p className={styles.hint}><strong>Atrasada:</strong> o contato combinado já venceu.</p> : null}
                        <div className={styles.actions}>
                          <button type="button" className={styles.primary} onClick={() => startAction(item)}>
                            Criar ação de carteira<span className={styles.visuallyHidden}> a partir de {item.title}</span>
                          </button>
                          <a className={styles.button} href="/admin/crm">Abrir o funil para atualizar</a>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className={styles.actions}>
                  <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Página anterior</button>
                  <button type="button" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Próxima página</button>
                  {/* UX-PRO-06 (carteira): o intervalo descreve o recorte que
                      produziu os itens exibidos, não o recorte pedido que ainda
                      não voltou — sem leitura nova, `offset` pode estar à frente. */}
                  <span className={styles.hint}>
                    Exibindo {data.items.length ? readOffset + 1 : 0}–{readOffset + data.items.length} de {data.total}
                    {stale ? " (última leitura concluída)" : ""}.
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {source ? (
        <section aria-labelledby="carteira-acao-titulo" className={styles.panel}>
          <h2 id="carteira-acao-titulo" tabIndex={-1} ref={formHeadingRef} className={styles.panelTitle}>
            Nova ação a partir de {source.title}
          </h2>
          <p className={styles.hint}>
            A ação cria uma oportunidade nova vinculada a esta origem. Reenviar o mesmo formulário não duplica o registro.
            Reativação só é aceita quando a origem está perdida — essa regra é do servidor.
          </p>
          <form onSubmit={submit}>
            <fieldset className={styles.fieldset} disabled={busy}>
              <legend>Dados da ação</legend>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="acao-tipo">Tipo de ação</label>
                  <select id="acao-tipo" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                    {ACTION_KINDS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                {form.kind === "indicacao" ? (
                  <div className={styles.field}>
                    <label htmlFor="acao-empresa">Empresa indicada</label>
                    <select id="acao-empresa" required value={form.target_company_id} onChange={e => setForm({ ...form, target_company_id: e.target.value })}>
                      <option value="">Selecione uma empresa cadastrada</option>
                      {companies.map(company => <option key={company.id} value={company.id}>{company.display_name}</option>)}
                    </select>
                  <p className={styles.requiredNote}>Obrigatório</p>
                    {companiesError ? <p className={styles.hint}>{companiesError.title}. {companiesError.detail}</p> : null}
                  </div>
                ) : null}
                <div className={styles.field}>
                  <label htmlFor="acao-titulo">Título</label>
                  <input id="acao-titulo" required minLength={3} maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                  <p className={styles.requiredNote}>Obrigatório</p>
                </div>
                <div className={styles.field}>
                  <label htmlFor="acao-proxima">Próxima ação</label>
                  <input id="acao-proxima" required minLength={3} maxLength={200} value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })} />
                  <p className={styles.requiredNote}>Obrigatório</p>
                </div>
                <div className={styles.field}>
                  <label htmlFor="acao-data">Data da próxima ação</label>
                  <input id="acao-data" type="datetime-local" required value={form.next_action_date} onChange={e => setForm({ ...form, next_action_date: e.target.value })} />
                  <p className={styles.requiredNote}>Obrigatório</p>
                </div>
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.primary} aria-busy={busy}>{busy ? "Registrando…" : "Registrar oportunidade"}</button>
                <button type="button" onClick={() => setSource(null)}>Cancelar</button>
              </div>
            </fieldset>
          </form>
          {formError ? <UiState variant={formError.kind === "denied" ? "denied" : "error"} title={formError.title} detail={formError.detail} /> : null}
        </section>
      ) : null}

      <section aria-labelledby="carteira-resultados-titulo" className={styles.panel}>
        <h2 id="carteira-resultados-titulo" className={styles.panelTitle}>Resultado das ações que você registrou</h2>
        {readState === "ready" && data ? (
          <>
            {stale ? (
              <p className={styles.hint}>
                Estes totais são da última leitura concluída, de {formatReadAt(readAt)}, e podem estar desatualizados.
              </p>
            ) : null}
            {data.metrics.length === 0 ? (
              <UiState variant="empty" title="Nenhuma ação de carteira registrada ainda." detail="Os totais aparecem assim que você criar a primeira ação." />
            ) : (
              <ul>
                {data.metrics.map(metric => (
                  <li key={metric.kind}>
                    <strong>{kindLabel(metric.kind)}</strong>: {metric.total} criada(s), {metric.won} ganha(s), {metric.lost} perdida(s).
                  </li>
                ))}
              </ul>
            )}

            <h3 className={styles.panelTitle}>Ações recentes</h3>
            {data.actions.length === 0 ? (
              <p className={styles.hint}>Nenhuma ação recente.</p>
            ) : (
              <ul>
                {data.actions.map(action => (
                  <li key={action.id}>{kindLabel(action.kind)} — {action.title} — {stageLabel(action.stage)}</li>
                ))}
              </ul>
            )}
          </>
        ) : readState === "failed" && readError ? (
          // UX-PRO-06 (carteira): sem leitura concluída não existe total. A tela
          // diz que a leitura falhou em vez de sugerir que não há ações.
          <p className={styles.hint}>
            A leitura dos resultados falhou ({readError.title}). Nada é mostrado aqui para não parecer que você não
            tem ações registradas: {readError.detail}
          </p>
        ) : (
          <p className={styles.hint}>Os totais aparecem depois que a leitura da carteira terminar.</p>
        )}
      </section>
    </div>
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
