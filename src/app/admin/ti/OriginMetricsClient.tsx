"use client";
import { useEffect, useRef, useState } from "react";
import {
  AVISO_HASH,
  AVISO_INGESTAO,
  AVISO_LEAD,
  CANAIS,
  AVISO_MINIMIZACAO,
  AVISO_ORDEM,
  EVENT_TYPES,
  VENCEDORES,
  classificarLista,
  dataCurta,
  proximosEstados,
  situacaoExperimento,
  situacaoHash,
  taxaConversao,
  traduzirErroPub,
  validarEvento,
  validarMetrica,
  validarTeste,
  validarTransicao,
  type ResultadoLista,
} from "./pub-metrics-state";
import styles from "./OriginMetricsClient.module.css";

type Item = Record<string, unknown>;

const FORM_METRICA = {
  origin: "", campaign: "", channel: "", period_start: "", period_end: "",
  total_leads: "0", converted_leads: "0", total_opportunities: "0", total_contracts: "0", notes: "",
};
const FORM_EVENTO = { event_type: "lead_received", origin: "", campaign: "", channel: "", lead_id: "", ip: "", user_agent: "" };
const FORM_TESTE = {
  test_key: "", hypothesis: "", description: "", metric_name: "conversion_rate",
  traffic_required: "100", treatment: "", variant_a: "{}", variant_b: "{}",
};

export default function OriginMetricsClient() {
  const [metricas, setMetricas] = useState<ResultadoLista | null>(null);
  const [eventos, setEventos] = useState<ResultadoLista | null>(null);
  const [testes, setTestes] = useState<ResultadoLista | null>(null);
  const [hora, setHora] = useState("");
  const [lendo, setLendo] = useState(true);
  const [gravando, setGravando] = useState("");
  const [ok, setOk] = useState("");
  const [erro, setErro] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [metrica, setMetrica] = useState(FORM_METRICA);
  const [evento, setEvento] = useState(FORM_EVENTO);
  const [teste, setTeste] = useState(FORM_TESTE);
  const [motivo, setMotivo] = useState("");
  const [vencedor, setVencedor] = useState("A");
  const sequencia = useRef(0);

  const ler = async (rota: string, rotulo: string) => {
    try {
      const resposta = await fetch(rota, { headers: { Accept: "application/json" } });
      const corpo = await resposta.json().catch(() => undefined);
      return classificarLista(resposta.status, corpo, rotulo);
    } catch {
      return classificarLista(0, undefined, rotulo);
    }
  };

  async function carregar() {
    const atual = ++sequencia.current;
    setLendo(true);
    const [lidasMetricas, lidosEventos, lidosTestes] = await Promise.all([
      ler("/api/admin/origin-metrics", "métricas de origem"),
      ler("/api/admin/conversion-events", "eventos de conversão"),
      ler("/api/admin/ab-tests", "testes A/B"),
    ]);
    if (atual !== sequencia.current) return;
    setMetricas(lidasMetricas);
    setEventos(lidosEventos);
    setTestes(lidosTestes);
    const agora = new Date();
    setHora(`${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`);
    setLendo(false);
  }
  useEffect(() => { void carregar(); }, []);

  async function gravar(rotulo: string, url: string, method: string, body: unknown, sucesso: string | ((corpo: Record<string, unknown>) => string)) {
    setGravando(rotulo); setOk(""); setErro("");
    try {
      const resposta = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(traduzirErroPub(resposta.status, typeof dados?.error === "string" ? dados.error : ""));
        return false;
      }
      setOk(typeof sucesso === "function" ? sucesso(dados ?? {}) : sucesso);
      await carregar();
      return true;
    } catch {
      setErro("Falha de comunicação: nada foi confirmado. Tente novamente.");
      return false;
    } finally {
      setGravando("");
    }
  }

  function criarMetrica() {
    const validado = validarMetrica(metrica);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("metrica", "/api/admin/origin-metrics", "POST", validado.payload,
      `Métrica de ${String(validado.payload.origin)} registrada com minimização ligada pelo servidor.`)
      .then(criado => { if (criado) setMetrica(FORM_METRICA); });
  }

  function criarEvento() {
    const validado = validarEvento(evento);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("evento", "/api/admin/conversion-events", "POST", validado.payload,
      corpo => (typeof corpo.ip_hash === "string" && corpo.ip_hash.length === 64
        ? "Evento registrado com IP em hash SHA-256; o valor original não volta para a tela."
        : "Evento registrado, mas o servidor gravou ip_hash nulo — nada de hash foi produzido nesta entrega."))
      .then(criado => { if (criado) setEvento(FORM_EVENTO); });
  }

  function criarTeste() {
    const validado = validarTeste(teste);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("teste", "/api/admin/ab-tests", "POST", validado.payload,
      `Teste ${String(validado.payload.test_key)} criado em rascunho; nada foi executado.`)
      .then(criado => { if (criado) setTeste(FORM_TESTE); });
  }

  function avancar(item: Item, status: string) {
    const validado = validarTransicao(String(item.id ?? ""), status, motivo, status === "concluido" ? vencedor : undefined);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("transicao", "/api/admin/ab-tests", "PATCH", validado.payload,
      `Teste ${String(item.test_key)} movido para ${status} com motivo gravado no histórico.`)
      .then(movido => { if (movido) setMotivo(""); });
  }

  const bloqueado = gravando !== "";
  const estado = (resultado: ResultadoLista | null, chave: string) => {
    if (!resultado || resultado.situacao === "ok") return null;
    return (
      <p className={styles.stateNote} data-testid={`pub-estado-${chave}`} data-situacao={resultado.situacao}>
        {resultado.mensagem}
      </p>
    );
  };

  return (
    <section className={styles.wrap} data-testid="pub-mensuracao" aria-busy={lendo}>
      <header className={styles.head}>
        <div>
          <h2>Mensuração de origem, conversão e testes A/B</h2>
          <p className={styles.lead}>
            PUB-10: origem e conversão com minimização de dados, eventos sem IP original e experimentos
            que só entram em execução com hipótese, tratamento de dados e tráfego definidos.
          </p>
        </div>
        <div className={styles.headActions}>
          <span className={styles.stamp} data-testid="pub-hora">{lendo ? "Lendo…" : `Lido às ${hora}`}</span>
          <button type="button" onClick={() => void carregar()} disabled={lendo}>Atualizar</button>
        </div>
      </header>

      {ok && <p className={styles.ok} role="status" data-testid="pub-ok">{ok}</p>}
      {erro && <p className={styles.alert} role="alert" data-testid="pub-erro">{erro}</p>}

      <article className={styles.card} data-testid="pub-card-metricas">
        <h3>Métricas de origem e conversão</h3>
        <p className={styles.hint} data-testid="pub-aviso-minimizacao">{AVISO_MINIMIZACAO}</p>
        {estado(metricas, "metricas")}
        <div className={styles.form}>
          <label className={styles.field}>Origem
            <input aria-label="origem da métrica" value={metrica.origin} maxLength={100}
              onChange={e => setMetrica({ ...metrica, origin: e.target.value })} />
            {erros.origin && <small className={styles.err}>{erros.origin}</small>}
          </label>
          <label className={styles.field}>Campanha (opcional)
            <input aria-label="campanha" value={metrica.campaign} maxLength={100}
              onChange={e => setMetrica({ ...metrica, campaign: e.target.value })} />
            {erros.campaign && <small className={styles.err}>{erros.campaign}</small>}
          </label>
          <label className={styles.field}>Canal (opcional)
            <select aria-label="canal" value={metrica.channel}
              onChange={e => setMetrica({ ...metrica, channel: e.target.value })}>
              <option value="">sem canal</option>
              {CANAIS.map(canal => <option key={canal} value={canal}>{canal}</option>)}
            </select>
            {erros.channel && <small className={styles.err}>{erros.channel}</small>}
          </label>
          <label className={styles.field}>Início
            <input type="date" aria-label="início da métrica" value={metrica.period_start}
              onChange={e => setMetrica({ ...metrica, period_start: e.target.value })} />
          </label>
          <label className={styles.field}>Fim
            <input type="date" aria-label="fim da métrica" value={metrica.period_end}
              onChange={e => setMetrica({ ...metrica, period_end: e.target.value })} />
            {erros.periodo && <small className={styles.err}>{erros.periodo}</small>}
          </label>
          <label className={styles.field}>Leads
            <input aria-label="total de leads" value={metrica.total_leads}
              onChange={e => setMetrica({ ...metrica, total_leads: e.target.value })} />
            {erros.total_leads && <small className={styles.err}>{erros.total_leads}</small>}
          </label>
          <label className={styles.field}>Convertidos
            <input aria-label="leads convertidos" value={metrica.converted_leads}
              onChange={e => setMetrica({ ...metrica, converted_leads: e.target.value })} />
            {erros.converted_leads && <small className={styles.err}>{erros.converted_leads}</small>}
          </label>
          <label className={styles.field}>Oportunidades
            <input aria-label="oportunidades" value={metrica.total_opportunities}
              onChange={e => setMetrica({ ...metrica, total_opportunities: e.target.value })} />
            {erros.total_opportunities && <small className={styles.err}>{erros.total_opportunities}</small>}
          </label>
          <label className={styles.field}>Contratos
            <input aria-label="contratos" value={metrica.total_contracts}
              onChange={e => setMetrica({ ...metrica, total_contracts: e.target.value })} />
            {erros.total_contracts && <small className={styles.err}>{erros.total_contracts}</small>}
          </label>
          <label className={styles.field}>Observações (opcional)
            <input aria-label="observações da métrica" value={metrica.notes} maxLength={1000}
              onChange={e => setMetrica({ ...metrica, notes: e.target.value })} />
            {erros.notes && <small className={styles.err}>{erros.notes}</small>}
          </label>
          <button type="button" onClick={criarMetrica} disabled={bloqueado}>
            {gravando === "metrica" ? "Gravando…" : "Registrar métrica"}
          </button>
        </div>
        <ul className={styles.list} data-testid="pub-lista-metricas">
          {(metricas?.itens ?? []).map((item: Item) => (
            <li key={String(item.id)} data-testid={`pub-metrica-${String(item.origin)}`}>
              <strong>{String(item.origin)}</strong>{" "}
              <span>{item.campaign ? String(item.campaign) : "sem campanha"}</span>{" "}
              <span>{dataCurta(item.period_start)} → {dataCurta(item.period_end)}</span>{" "}
              <span>{String(item.total_leads)} lead(s) · {String(item.converted_leads)} convertido(s)</span>{" "}
              <span>taxa {taxaConversao(item)}</span>{" "}
              <span>{item.is_minimized ? "minimização ligada" : "minimização não declarada"}</span>
            </li>
          ))}
        </ul>
      </article>

      <article className={styles.card} data-testid="pub-card-eventos">
        <h3>Eventos de conversão</h3>
        <p className={styles.hint} data-testid="pub-aviso-ingestao">{AVISO_INGESTAO}</p>
        <p className={styles.hint} data-testid="pub-aviso-lead">{AVISO_LEAD}</p>
        <p className={styles.hint} data-testid="pub-aviso-hash">{AVISO_HASH}</p>
        {estado(eventos, "eventos")}
        <div className={styles.form}>
          <label className={styles.field}>Tipo de evento
            <select aria-label="tipo de evento" value={evento.event_type}
              onChange={e => setEvento({ ...evento, event_type: e.target.value })}>
              {EVENT_TYPES.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
          </label>
          <label className={styles.field}>Origem
            <input aria-label="origem do evento" value={evento.origin} maxLength={100}
              onChange={e => setEvento({ ...evento, origin: e.target.value })} />
            {erros.origin && <small className={styles.err}>{erros.origin}</small>}
          </label>
          <label className={styles.field}>Campanha (opcional)
            <input aria-label="campanha do evento" value={evento.campaign} maxLength={100}
              onChange={e => setEvento({ ...evento, campaign: e.target.value })} />
            {erros.campaign && <small className={styles.err}>{erros.campaign}</small>}
          </label>
          <label className={styles.field}>Canal (opcional)
            <input aria-label="canal do evento" value={evento.channel} maxLength={100}
              onChange={e => setEvento({ ...evento, channel: e.target.value })} />
            {erros.channel && <small className={styles.err}>{erros.channel}</small>}
          </label>
          <label className={styles.field}>Lead (UUID, opcional)
            <input aria-label="lead do evento" value={evento.lead_id} maxLength={36}
              onChange={e => setEvento({ ...evento, lead_id: e.target.value })} />
            {erros.lead_id && <small className={styles.err}>{erros.lead_id}</small>}
          </label>
          <label className={styles.field}>IP de origem (vira hash)
            <input aria-label="IP do evento" value={evento.ip}
              onChange={e => setEvento({ ...evento, ip: e.target.value })} />
          </label>
          <label className={styles.field}>User-agent (vira hash)
            <input aria-label="user-agent do evento" value={evento.user_agent}
              onChange={e => setEvento({ ...evento, user_agent: e.target.value })} />
          </label>
          <button type="button" onClick={criarEvento} disabled={bloqueado}>
            {gravando === "evento" ? "Gravando…" : "Registrar evento"}
          </button>
        </div>
        <ul className={styles.list} data-testid="pub-lista-eventos">
          {(eventos?.itens ?? []).map((item: Item) => (
            <li key={String(item.id)}>
              <strong>{String(item.event_type)}</strong>{" "}
              <span>{item.origin ? String(item.origin) : "origem não declarada"}</span>{" "}
              <span>{situacaoHash(item).rotulo}</span>{" "}
              <span>{item.is_minimized ? "minimizado" : "minimização não declarada"}</span>
            </li>
          ))}
        </ul>
      </article>

      <article className={styles.card} data-testid="pub-card-ab">
        <h3>Testes A/B</h3>
        <p className={styles.hint} data-testid="pub-aviso-ordem">{AVISO_ORDEM}</p>
        {estado(testes, "ab")}
        <div className={styles.form}>
          <label className={styles.field}>Chave do teste
            <input aria-label="chave do teste" value={teste.test_key} maxLength={100}
              onChange={e => setTeste({ ...teste, test_key: e.target.value })} />
            {erros.test_key && <small className={styles.err}>{erros.test_key}</small>}
          </label>
          <label className={styles.field}>Hipótese (20..2000)
            <input aria-label="hipótese do teste" value={teste.hypothesis} maxLength={2000}
              onChange={e => setTeste({ ...teste, hypothesis: e.target.value })} />
            {erros.hypothesis && <small className={styles.err}>{erros.hypothesis}</small>}
          </label>
          <label className={styles.field}>Descrição (10..2000)
            <input aria-label="descrição do teste" value={teste.description} maxLength={2000}
              onChange={e => setTeste({ ...teste, description: e.target.value })} />
            {erros.description && <small className={styles.err}>{erros.description}</small>}
          </label>
          <label className={styles.field}>Métrica observada
            <input aria-label="métrica observada" value={teste.metric_name} maxLength={200}
              onChange={e => setTeste({ ...teste, metric_name: e.target.value })} />
            {erros.metric_name && <small className={styles.err}>{erros.metric_name}</small>}
          </label>
          <label className={styles.field}>Tráfego exigido (≥10)
            <input aria-label="tráfego exigido" value={teste.traffic_required}
              onChange={e => setTeste({ ...teste, traffic_required: e.target.value })} />
            {erros.traffic_required && <small className={styles.err}>{erros.traffic_required}</small>}
          </label>
          <label className={styles.field}>Tratamento de dados (10..2000)
            <input aria-label="tratamento de dados" value={teste.treatment} maxLength={2000}
              onChange={e => setTeste({ ...teste, treatment: e.target.value })} />
            {erros.treatment && <small className={styles.err}>{erros.treatment}</small>}
          </label>
          <label className={styles.field}>Variante A (JSON)
            <input aria-label="variante A" value={teste.variant_a} maxLength={2000}
              onChange={e => setTeste({ ...teste, variant_a: e.target.value })} />
            {erros.variant_a && <small className={styles.err}>{erros.variant_a}</small>}
          </label>
          <label className={styles.field}>Variante B (JSON)
            <input aria-label="variante B" value={teste.variant_b} maxLength={2000}
              onChange={e => setTeste({ ...teste, variant_b: e.target.value })} />
            {erros.variant_b && <small className={styles.err}>{erros.variant_b}</small>}
          </label>
          <button type="button" onClick={criarTeste} disabled={bloqueado}>
            {gravando === "teste" ? "Gravando…" : "Criar teste em rascunho"}
          </button>
        </div>
        <div className={styles.form}>
          <label className={styles.field}>Motivo da mudança (10..1000)
            <input aria-label="motivo do teste" value={motivo} maxLength={1000}
              onChange={e => setMotivo(e.target.value)} />
            {erros.reason && <small className={styles.err}>{erros.reason}</small>}
          </label>
          <label className={styles.field}>Vencedor (ao concluir)
            <select aria-label="vencedor do teste" value={vencedor} onChange={e => setVencedor(e.target.value)}>
              {VENCEDORES.map(opcao => <option key={opcao} value={opcao}>{opcao}</option>)}
            </select>
            {erros.winner && <small className={styles.err}>{erros.winner}</small>}
          </label>
        </div>
        <ul className={styles.list} data-testid="pub-lista-ab">
          {(testes?.itens ?? []).map((item: Item) => {
            const leitura = situacaoExperimento(item);
            const passos = proximosEstados(item.status);
            return (
              <li key={String(item.id)} data-testid={`pub-ab-${String(item.test_key)}`} data-situacao={leitura.situacao}>
                <strong>{String(item.test_key)}</strong>{" "}
                <span>{leitura.rotulo}</span>{" "}
                <span>{String(item.metric_name)}</span>{" "}
                {passos.map(passo => (
                  <button key={passo} type="button" onClick={() => avancar(item, passo)} disabled={bloqueado}
                    data-testid={`pub-avancar-${String(item.test_key)}-${passo}`}>
                    Mover para {passo.replaceAll("_", " ")}
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      </article>

      <p className={styles.foot}>
        A rota de eventos aceita escrita pública por desenho; as leituras desta tela exigem papel admin ou ti.
        Um papel sem permissão recebe <code>401 unauthorized</code> do servidor — não uma lista vazia.
      </p>
    </section>
  );
}
