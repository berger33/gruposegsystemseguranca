"use client";
import { useEffect, useRef, useState } from "react";
import {
  AVISO_ATIVO,
  AVISO_BORDA,
  AVISO_FAQ,
  AVISO_OFFLINE,
  CATEGORIAS_FAQ,
  DISPLAY,
  NIVEIS_LEITURA,
  STATUS_FAQ,
  TAREFAS_OFFLINE,
  chaveConfig,
  chaveFaq,
  classificarLista,
  estadoConfig,
  proximosEstados,
  simNao,
  tagsLegiveis,
  tarefasLegiveis,
  traduzirErroEmp,
  validarConfig,
  validarFaq,
  validarTransicao,
  type ResultadoLista,
} from "./emp-pwa-state";
import styles from "./EmpPwaClient.module.css";

type Item = Record<string, unknown>;

const FORM_CONFIG = {
  name: "Grupo SEG System - Portal Funcionário",
  short_name: "SEG Func",
  description: "Portal do funcionário com suporte offline limitado às tarefas operacionais aprovadas.",
  theme_color: "#0f172a",
  background_color: "#ffffff",
  display: "standalone",
  scope: "/",
  start_url: "/funcionario",
  max_queue_size: "50",
  max_retries: "5",
  tarefas: ["occurrence", "handover"] as string[],
};

const FORM_FAQ = {
  question: "",
  answer: "",
  category: "geral",
  status: "rascunho",
  reading_level: "simples",
  tags: "",
  is_simple_language: true,
  is_low_data: true,
};

const FORA_DESTA_TELA = [
  ["Fila offline", "/api/admin/hr/offline-queue", "emp_offline_queue"],
  ["Conflitos de sincronização", "/api/admin/hr/offline-conflicts", "emp_offline_conflicts"],
  ["Log de acesso ao FAQ", "/api/admin/hr/faq-access-logs", "emp_faq_access_logs"],
  ["Preferências de acessibilidade", "/api/admin/hr/accessibility-preferences", "emp_accessibility_preferences"],
] as const;

export default function EmpPwaClient() {
  const [configs, setConfigs] = useState<ResultadoLista | null>(null);
  const [faqs, setFaqs] = useState<ResultadoLista | null>(null);
  const [hora, setHora] = useState("");
  const [lendo, setLendo] = useState(true);
  const [gravando, setGravando] = useState("");
  const [ok, setOk] = useState("");
  const [erro, setErro] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [config, setConfig] = useState(FORM_CONFIG);
  const [faq, setFaq] = useState(FORM_FAQ);
  const sequencia = useRef(0);

  const ler = async (rota: string, chave: "configs" | "faqs", rotulo: string) => {
    try {
      const resposta = await fetch(rota, { headers: { Accept: "application/json" } });
      const corpo = await resposta.json().catch(() => undefined);
      return classificarLista(resposta.status, corpo, chave, rotulo);
    } catch {
      return classificarLista(0, undefined, chave, rotulo);
    }
  };

  async function carregar() {
    const atual = ++sequencia.current;
    setLendo(true);
    const [lidasConfigs, lidasFaqs] = await Promise.all([
      ler("/api/admin/pwa-configs", "configs", "configurações do PWA"),
      ler("/api/admin/faq-internal?limit=50", "faqs", "perguntas internas"),
    ]);
    if (atual !== sequencia.current) return;
    setConfigs(lidasConfigs);
    setFaqs(lidasFaqs);
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
        setErro(traduzirErroEmp(resposta.status, typeof dados?.error === "string" ? dados.error : ""));
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

  function criarConfig() {
    const validado = validarConfig(config);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("config", "/api/admin/pwa-configs", "POST", validado.payload,
      corpo => {
        const criada = (corpo.config as Item | undefined) ?? {};
        return `Configuração v${String(criada.version)} criada ${criada.is_active === true ? "ativa" : "inativa"}; manifest e service worker passam a ler esta versão quando ativa.`;
      })
      .then(criado => { if (criado) setConfig(FORM_CONFIG); });
  }

  function alternarAtivo(item: Item) {
    const ativo = item.is_active === true;
    void gravar("ativo", "/api/admin/pwa-configs", "PATCH", { id: String(item.id), is_active: !ativo },
      `Configuração v${String(item.version)} ${ativo ? "desativada" : "ativada"}.`);
  }

  function criarFaq() {
    const validado = validarFaq(faq);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("faq", "/api/admin/faq-internal", "POST", validado.payload,
      corpo => {
        const criada = (corpo.faq as Item | undefined) ?? {};
        return `Pergunta ${String(criada.category)} criada em ${String(criada.status)}` +
          `${criada.is_published === true ? " e já publicada" : "; nada foi publicado ainda"}.`;
      })
      .then(criado => { if (criado) setFaq(FORM_FAQ); });
  }

  function moverFaq(item: Item, destino: string) {
    const validado = validarTransicao(String(item.id ?? ""), destino, item.status);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("transicao", "/api/admin/faq-internal", "PATCH", validado.payload,
      `Pergunta movida para ${destino}${destino === "publicado" ? " com a publicação ligada pelo servidor" : ""}.`);
  }

  const bloqueado = gravando !== "";
  const estado = (resultado: ResultadoLista | null, chave: string) => {
    if (!resultado || resultado.situacao === "ok") return null;
    return (
      <p className={styles.stateNote} data-testid={`emp-estado-${chave}`} data-situacao={resultado.situacao}>
        {resultado.mensagem}
      </p>
    );
  };

  return (
    <section className={styles.wrap} data-testid="emp-pwa" aria-busy={lendo}>
      <header className={styles.head}>
        <div>
          <h2>App do funcionário: PWA e FAQ interna</h2>
          <p className={styles.lead}>
            EMP-18/EMP-19: a instalação do app no celular vem de uma configuração versionada, e a FAQ interna é
            conteúdo revisado — perguntas simples, baixo consumo e suporte a teclado e leitor de tela.
          </p>
        </div>
        <div className={styles.headActions}>
          <span className={styles.stamp} data-testid="emp-hora">{lendo ? "Lendo…" : `Lido às ${hora}`}</span>
          <button type="button" onClick={() => void carregar()} disabled={lendo}>Atualizar</button>
        </div>
      </header>

      {ok && <p className={styles.ok} role="status" data-testid="emp-ok">{ok}</p>}
      {erro && <p className={styles.alert} role="alert" data-testid="emp-erro">{erro}</p>}

      <p className={styles.hint} data-testid="emp-aviso-borda">{AVISO_BORDA}</p>

      <article className={styles.card} data-testid="emp-card-config">
        <h3>Configuração do PWA (versão ativa)</h3>
        <p className={styles.hint} data-testid="emp-aviso-ativo">{AVISO_ATIVO}</p>
        {estado(configs, "configs")}
        <div className={styles.form}>
          <label className={styles.field}>Nome
            <input aria-label="nome do app" value={config.name} maxLength={100}
              onChange={e => setConfig({ ...config, name: e.target.value })} />
            {erros.name && <small className={styles.err} data-testid="emp-erro-nome">{erros.name}</small>}
          </label>
          <label className={styles.field}>Nome curto
            <input aria-label="nome curto do app" value={config.short_name} maxLength={20}
              onChange={e => setConfig({ ...config, short_name: e.target.value })} />
            {erros.short_name && <small className={styles.err}>{erros.short_name}</small>}
          </label>
          <label className={styles.field}>Descrição
            <input aria-label="descrição do app" value={config.description} maxLength={500}
              onChange={e => setConfig({ ...config, description: e.target.value })} />
            {erros.description && <small className={styles.err}>{erros.description}</small>}
          </label>
          <label className={styles.field}>Cor de tema (#rrggbb)
            <input aria-label="cor de tema" value={config.theme_color} maxLength={7}
              onChange={e => setConfig({ ...config, theme_color: e.target.value })} />
            {erros.theme_color && <small className={styles.err} data-testid="emp-erro-cor">{erros.theme_color}</small>}
          </label>
          <label className={styles.field}>Cor de fundo (#rrggbb)
            <input aria-label="cor de fundo" value={config.background_color} maxLength={7}
              onChange={e => setConfig({ ...config, background_color: e.target.value })} />
            {erros.background_color && <small className={styles.err}>{erros.background_color}</small>}
          </label>
          <label className={styles.field}>Exibição
            <select aria-label="modo de exibição" value={config.display}
              onChange={e => setConfig({ ...config, display: e.target.value })}>
              {DISPLAY.map(modo => <option key={modo} value={modo}>{modo}</option>)}
            </select>
            {erros.display && <small className={styles.err}>{erros.display}</small>}
          </label>
          <label className={styles.field}>Escopo
            <input aria-label="escopo do app" value={config.scope} maxLength={200}
              onChange={e => setConfig({ ...config, scope: e.target.value })} />
            {erros.scope && <small className={styles.err}>{erros.scope}</small>}
          </label>
          <label className={styles.field}>URL inicial
            <input aria-label="url inicial" value={config.start_url} maxLength={500}
              onChange={e => setConfig({ ...config, start_url: e.target.value })} />
            {erros.start_url && <small className={styles.err}>{erros.start_url}</small>}
          </label>
          <label className={styles.field}>Tamanho da fila offline (1–200)
            <input aria-label="tamanho da fila" value={config.max_queue_size}
              onChange={e => setConfig({ ...config, max_queue_size: e.target.value })} />
            {erros.max_queue_size && <small className={styles.err} data-testid="emp-erro-fila">{erros.max_queue_size}</small>}
          </label>
          <label className={styles.field}>Tentativas (1–20)
            <input aria-label="tentativas de sincronização" value={config.max_retries}
              onChange={e => setConfig({ ...config, max_retries: e.target.value })} />
            {erros.max_retries && <small className={styles.err}>{erros.max_retries}</small>}
          </label>
          <div className={styles.toggles}>
            {TAREFAS_OFFLINE.map(tarefa => (
              <label key={tarefa} className={styles.check}>
                <input type="checkbox" aria-label={`tarefa offline ${tarefa}`}
                  checked={config.tarefas.includes(tarefa)}
                  onChange={e => setConfig({
                    ...config,
                    tarefas: e.target.checked
                      ? [...config.tarefas, tarefa]
                      : config.tarefas.filter(item => item !== tarefa),
                  })} />
                {tarefa}
              </label>
            ))}
          </div>
          {erros.tarefas && <small className={styles.err}>{erros.tarefas}</small>}
          <button type="button" onClick={criarConfig} disabled={bloqueado}>
            {gravando === "config" ? "Gravando…" : "Criar versão da configuração"}
          </button>
        </div>
        <ul className={styles.list} data-testid="emp-lista-configs">
          {(configs?.itens ?? []).map((item: Item) => (
            <li key={String(item.id)} data-testid={`emp-config-${chaveConfig(item)}`} data-situacao={estadoConfig(item)}>
              <strong>v{String(item.version)}</strong>{" "}
              <span>{String(item.name)} ({String(item.short_name)})</span>{" "}
              <span>{estadoConfig(item)}</span>{" "}
              <span>exibição {String(item.display)}</span>{" "}
              <span>fila {String(item.max_queue_size)} · tentativas {String(item.max_retries)}</span>{" "}
              <span>tarefas: {tarefasLegiveis(item)}</span>{" "}
              <button type="button" disabled={bloqueado}
                data-testid={`emp-alternar-${chaveConfig(item)}`}
                onClick={() => alternarAtivo(item)}>
                {item.is_active === true ? "desativar" : "ativar"}
              </button>
            </li>
          ))}
        </ul>
      </article>

      <article className={styles.card} data-testid="emp-card-faq">
        <h3>FAQ interna</h3>
        <p className={styles.hint} data-testid="emp-aviso-faq">{AVISO_FAQ}</p>
        {estado(faqs, "faqs")}
        <div className={styles.form}>
          <label className={styles.field}>Pergunta (10–500)
            <input aria-label="pergunta da FAQ" value={faq.question} maxLength={500}
              onChange={e => setFaq({ ...faq, question: e.target.value })} />
            {erros.question && <small className={styles.err} data-testid="emp-erro-pergunta">{erros.question}</small>}
          </label>
          <label className={styles.field}>Categoria
            <select aria-label="categoria da FAQ" value={faq.category}
              onChange={e => setFaq({ ...faq, category: e.target.value })}>
              {CATEGORIAS_FAQ.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}
            </select>
            {erros.category && <small className={styles.err}>{erros.category}</small>}
          </label>
          <label className={styles.field}>Nível de leitura
            <select aria-label="nível de leitura" value={faq.reading_level}
              onChange={e => setFaq({ ...faq, reading_level: e.target.value })}>
              {NIVEIS_LEITURA.map(nivel => <option key={nivel} value={nivel}>{nivel}</option>)}
            </select>
            {erros.reading_level && <small className={styles.err}>{erros.reading_level}</small>}
          </label>
          <label className={styles.field}>Situação inicial
            <select aria-label="situação inicial da FAQ" value={faq.status}
              onChange={e => setFaq({ ...faq, status: e.target.value })}>
              {STATUS_FAQ.filter(status => status === "rascunho" || status === "em_revisao").map(status =>
                <option key={status} value={status}>{status}</option>)}
            </select>
            {erros.status && <small className={styles.err}>{erros.status}</small>}
          </label>
          <label className={styles.field}>Etiquetas (separadas por vírgula)
            <input aria-label="etiquetas da FAQ" value={faq.tags} maxLength={400}
              onChange={e => setFaq({ ...faq, tags: e.target.value })} />
            {erros.tags && <small className={styles.err}>{erros.tags}</small>}
          </label>
          <div className={styles.toggles}>
            <label className={styles.check}>
              <input type="checkbox" aria-label="linguagem simples" checked={faq.is_simple_language}
                onChange={e => setFaq({ ...faq, is_simple_language: e.target.checked })} />
              linguagem simples
            </label>
            <label className={styles.check}>
              <input type="checkbox" aria-label="baixo consumo de dados" checked={faq.is_low_data}
                onChange={e => setFaq({ ...faq, is_low_data: e.target.checked })} />
              baixo consumo de dados
            </label>
          </div>
          <label className={styles.field}>Resposta (20–5.000)
            <textarea aria-label="resposta da FAQ" value={faq.answer} maxLength={5000} rows={3}
              onChange={e => setFaq({ ...faq, answer: e.target.value })} />
            {erros.answer && <small className={styles.err} data-testid="emp-erro-resposta">{erros.answer}</small>}
          </label>
          <button type="button" onClick={criarFaq} disabled={bloqueado}>
            {gravando === "faq" ? "Gravando…" : "Criar pergunta"}
          </button>
        </div>
        <ul className={styles.list} data-testid="emp-lista-faqs">
          {(faqs?.itens ?? []).map((item: Item) => {
            const chave = chaveFaq(item);
            return (
              <li key={String(item.id)} data-testid={`emp-faq-${chave}`} data-situacao={String(item.status ?? "desconhecida")}>
                <strong>{String(item.category)}</strong>{" "}
                <span>{String(item.question)}</span>{" "}
                <span>situação {String(item.status)}</span>{" "}
                <span>publicada {simNao(item.is_published)}</span>{" "}
                <span>leitura {String(item.reading_level)}</span>{" "}
                <span>etiquetas: {tagsLegiveis(item)}</span>{" "}
                {proximosEstados(item.status).map(destino => (
                  <button key={destino} type="button" disabled={bloqueado}
                    data-testid={`emp-mover-${chave}-${destino}`}
                    onClick={() => moverFaq(item, destino)}>
                    {destino}
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      </article>

      <article className={styles.card} data-testid="emp-card-fora">
        <h3>O que esta tela não oferece</h3>
        <p className={styles.hint} data-testid="emp-aviso-offline">{AVISO_OFFLINE}</p>
        <ul className={styles.list} data-testid="emp-lista-fora">
          {FORA_DESTA_TELA.map(([rotulo, caminho, tabela]) => (
            <li key={caminho}>
              <strong>{rotulo}</strong>{" "}
              <span>{caminho}</span>{" "}
              <span>tabela {tabela}</span>{" "}
              <span>exige employees.read — não montado aqui</span>
            </li>
          ))}
        </ul>
      </article>

      <p className={styles.foot}>
        Situações da FAQ conhecidas pelo banco: {STATUS_FAQ.join(", ")}. Categorias: {CATEGORIAS_FAQ.join(", ")}.
        O manifest público lê a configuração ativa mais recente; sem configuração ativa, o código serve o padrão embutido.
      </p>
    </section>
  );
}
