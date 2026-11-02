"use client";
import { useEffect, useRef, useState } from "react";
import {
  CHANGEFREQ,
  REDIRECT_TYPES,
  REGRA_DESTINO,
  VERIFICATION_METHODS,
  classificarLista,
  classificarPreviaSitemap,
  situacaoPublicacao,
  traduzirErroSeo,
  validarConfig,
  validarDominio,
  validarRedirect,
  type ResultadoLista,
  type PreviaSitemap,
} from "./seo-console-state";
import styles from "./SeoClient.module.css";

type Item = Record<string, any>;

const FORM_CONFIG = { path: "", title: "", description: "", keywords: "", canonical_url: "", robots: "noindex, nofollow", sitemap_priority: "0.5", changefreq: "weekly", is_noindex: true };
const FORM_REDIRECT = { old_path: "", new_path: "", redirect_type: "301", reason: "", is_active: true };
const FORM_DOMINIO = { domain: "", verification_method: "dns_txt", verification_token: "" };

export default function SeoClient() {
  const [configs, setConfigs] = useState<ResultadoLista | null>(null);
  const [redirects, setRedirects] = useState<ResultadoLista | null>(null);
  const [dominios, setDominios] = useState<ResultadoLista | null>(null);
  const [sitemap, setSitemap] = useState<PreviaSitemap | null>(null);
  const [hora, setHora] = useState("");
  const [lendo, setLendo] = useState(true);
  const [cfgForm, setCfgForm] = useState(FORM_CONFIG);
  const [redForm, setRedForm] = useState(FORM_REDIRECT);
  const [domForm, setDomForm] = useState(FORM_DOMINIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [ok, setOk] = useState("");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState("");
  const sequencia = useRef(0);

  async function carregar() {
    const atual = ++sequencia.current;
    setLendo(true);
    const ler = async (rota: string, rotulo: string) => {
      try {
        const resposta = await fetch(rota, { headers: { Accept: "application/json" } });
        const corpo = await resposta.json().catch(() => undefined);
        return classificarLista(resposta.status, corpo, rotulo);
      } catch {
        return classificarLista(0, undefined, rotulo);
      }
    };
    const [configsLidas, redirectsLidos, dominiosLidos, previa] = await Promise.all([
      ler("/api/admin/seo-configs", "configurações de SEO"),
      ler("/api/admin/seo-redirects", "redirecionamentos"),
      ler("/api/admin/domain-verifications", "domínios"),
      (async () => {
        try {
          const resposta = await fetch("/api/admin/seo-sitemap", { headers: { Accept: "application/json" } });
          const corpo = await resposta.json().catch(() => undefined);
          return classificarPreviaSitemap(resposta.status, corpo);
        } catch {
          return classificarPreviaSitemap(0, undefined);
        }
      })(),
    ]);
    if (atual !== sequencia.current) return;
    setConfigs(configsLidas);
    setRedirects(redirectsLidos);
    setDominios(dominiosLidos);
    setSitemap(previa);
    const agora = new Date();
    setHora(`${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`);
    setLendo(false);
  }
  useEffect(() => { void carregar(); }, []);

  async function gravar(rotulo: string, url: string, method: string, body: unknown, sucesso: string) {
    setGravando(rotulo); setOk(""); setErro("");
    try {
      const resposta = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(traduzirErroSeo(resposta.status, typeof dados?.error === "string" ? dados.error : ""));
        return false;
      }
      setOk(sucesso);
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
    const validado = validarConfig(cfgForm);
    setErros(validado.erros);
    if (!validado.ok || !validado.payload) { setOk(""); setErro(""); return; }
    void gravar("config", "/api/admin/seo-configs", "POST", validado.payload,
      `Configuração de ${String(validado.payload.path)} criada com noindex preservado — nada foi publicado.`)
      .then(criado => { if (criado) setCfgForm(FORM_CONFIG); });
  }

  function criarRedirect() {
    const validado = validarRedirect(redForm);
    setErros(validado.erros);
    if (!validado.ok || !validado.payload) { setOk(""); setErro(""); return; }
    void gravar("redirect", "/api/admin/seo-redirects", "POST", validado.payload,
      `Redirecionamento ${String(validado.payload.old_path)} → ${String(validado.payload.new_path)} registrado.`)
      .then(criado => { if (criado) setRedForm(FORM_REDIRECT); });
  }

  function criarDominio() {
    const validado = validarDominio(domForm);
    setErros(validado.erros);
    if (!validado.ok || !validado.payload) { setOk(""); setErro(""); return; }
    void gravar("dominio", "/api/admin/domain-verifications", "POST", validado.payload,
      `Domínio ${String(validado.payload.domain)} registrado como pendente. Verificação real não é executável nesta entrega.`)
      .then(criado => { if (criado) setDomForm(FORM_DOMINIO); });
  }

  const publicacao = situacaoPublicacao(dominios?.itens ?? []);
  const itensConfigs = configs?.itens ?? [];
  const itensRedirects = redirects?.itens ?? [];
  const itensDominios = dominios?.itens ?? [];
  const bloqueado = gravando !== "";

  const estado = (resultado: ResultadoLista | null, chave: string) => {
    if (!resultado || resultado.situacao === "ok") return null;
    return (
      <p className={styles.stateNote} data-testid={`seo-estado-${chave}`} data-situacao={resultado.situacao}>
        {resultado.mensagem}
      </p>
    );
  };

  return (
    <section className={styles.page} data-testid="seo">
      <header className={styles.head}>
        <div>
          <span className={styles.eyebrow}>PUB-08 · SEO TÉCNICO E DOMÍNIOS</span>
          <h2>SEO e domínios</h2>
          <p className={styles.lead}>
            Títulos, descrição, canônica, robots, prioridade de sitemap, redirecionamentos e verificação de domínio.
            <strong> Noindex é preservado</strong>: nesta entrega nada é publicado — a verificação real de domínio exige
            DNS/HTTP, que não são executáveis localmente, e o servidor recusa declarar um domínio como verificado.
          </p>
        </div>
        <div className={styles.readBox}>
          <span className={styles.stamp} data-testid="seo-hora">{hora ? `Lido às ${hora}` : "Lendo…"}</span>
          <button type="button" className={styles.retry} onClick={() => void carregar()} disabled={lendo} aria-busy={lendo}>
            {lendo ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      <p className={styles.notice} data-testid="seo-publicacao" data-permitido={publicacao.permitido ? "sim" : "nao"}>
        {publicacao.permitido ? "Há domínio verificado: publicar continua exigindo aprovação." : publicacao.motivo}
      </p>

      {ok && <p className={styles.ok} role="status" data-testid="seo-ok">{ok}</p>}
      {erro && (
        <p className={styles.alert} role="alert" data-testid="seo-erro">
          {erro} <button type="button" className={styles.link} onClick={() => setErro("")}>Fechar</button>
        </p>
      )}

      <div className={styles.grid}>
        <article className={styles.card} data-testid="seo-card-configs">
          <h3>Configurações por caminho</h3>
          {estado(configs, "configs")}
          <div className={styles.form}>
            <label className={styles.field}>Caminho
              <input aria-label="caminho" value={cfgForm.path} placeholder="/servicos" onChange={e => setCfgForm({ ...cfgForm, path: e.target.value })} />
              {erros.path && <small className={styles.err}>{erros.path}</small>}
            </label>
            <label className={styles.field}>Título (5..200)
              <input aria-label="título SEO" value={cfgForm.title} onChange={e => setCfgForm({ ...cfgForm, title: e.target.value })} />
              {erros.title && <small className={styles.err}>{erros.title}</small>}
            </label>
            <label className={styles.field}>Descrição (10..500)
              <input aria-label="descrição SEO" value={cfgForm.description} onChange={e => setCfgForm({ ...cfgForm, description: e.target.value })} />
              {erros.description && <small className={styles.err}>{erros.description}</small>}
            </label>
            <label className={styles.field}>Palavras-chave (vírgula)
              <input aria-label="palavras-chave" value={cfgForm.keywords} onChange={e => setCfgForm({ ...cfgForm, keywords: e.target.value })} />
            </label>
            <label className={styles.field}>URL canônica
              <input aria-label="URL canônica" value={cfgForm.canonical_url} onChange={e => setCfgForm({ ...cfgForm, canonical_url: e.target.value })} />
              {erros.canonical_url && <small className={styles.err}>{erros.canonical_url}</small>}
            </label>
            <label className={styles.field}>Robots
              <input aria-label="robots" value={cfgForm.robots} onChange={e => setCfgForm({ ...cfgForm, robots: e.target.value })} />
              {erros.robots && <small className={styles.err}>{erros.robots}</small>}
            </label>
            <label className={styles.field}>Prioridade (0..1)
              <input aria-label="prioridade" value={cfgForm.sitemap_priority} onChange={e => setCfgForm({ ...cfgForm, sitemap_priority: e.target.value })} />
              {erros.sitemap_priority && <small className={styles.err}>{erros.sitemap_priority}</small>}
            </label>
            <label className={styles.field}>Frequência
              <select aria-label="frequência" value={cfgForm.changefreq} onChange={e => setCfgForm({ ...cfgForm, changefreq: e.target.value })}>
                {CHANGEFREQ.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <button type="button" onClick={criarConfig} disabled={bloqueado}>{gravando === "config" ? "Gravando…" : "Criar configuração (noindex)"}</button>
          </div>
          <ul className={styles.list} data-testid="seo-lista-configs">
            {itensConfigs.map((item: Item) => (
              <li key={item.id} data-testid={`seo-config-${item.path}`}>
                <strong>{item.path}</strong>
                <span>{item.title}</span>
                <span>robots: {item.robots}</span>
                <span className={styles.badge} data-noindex={String(Boolean(item.is_noindex))}>
                  {item.is_noindex ? "noindex" : "indexável"}
                </span>
                <span>{item.is_published ? "publicado" : "não publicado"}</span>
                <button
                  type="button"
                  className={styles.link}
                  data-testid={`seo-manter-${item.path}`}
                  disabled={bloqueado}
                  onClick={() => void gravar(`noindex-${item.id}`, "/api/admin/seo-configs", "PATCH",
                    { id: item.id, title: item.title, description: item.description, robots: item.robots, is_noindex: true, is_published: false },
                    `${item.path} mantido com noindex e não publicado.`)}
                >
                  manter noindex
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className={styles.card} data-testid="seo-card-redirects">
          <h3>Redirecionamentos</h3>
          {estado(redirects, "redirects")}
          <div className={styles.form}>
            <label className={styles.field}>De
              <input aria-label="origem" value={redForm.old_path} placeholder="/servico-antigo" onChange={e => setRedForm({ ...redForm, old_path: e.target.value })} />
              {erros.old_path && <small className={styles.err}>{erros.old_path}</small>}
            </label>
            <label className={styles.field}>Para
              <input aria-label="destino" value={redForm.new_path} placeholder="/servicos" onChange={e => setRedForm({ ...redForm, new_path: e.target.value })} />
              {erros.new_path && <small className={styles.err}>{erros.new_path}</small>}
            </label>
            <label className={styles.field}>Tipo
              <select aria-label="tipo de redirecionamento" value={redForm.redirect_type} onChange={e => setRedForm({ ...redForm, redirect_type: e.target.value })}>
                {REDIRECT_TYPES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className={styles.field}>Motivo (10..1000)
              <input aria-label="motivo do redirecionamento" value={redForm.reason} onChange={e => setRedForm({ ...redForm, reason: e.target.value })} />
              {erros.reason && <small className={styles.err}>{erros.reason}</small>}
            </label>
            <p className={styles.hint} data-testid="seo-regra-destino">{REGRA_DESTINO}</p>
            <button type="button" onClick={criarRedirect} disabled={bloqueado}>{gravando === "redirect" ? "Gravando…" : "Criar redirecionamento"}</button>
          </div>
          <ul className={styles.list} data-testid="seo-lista-redirects">
            {itensRedirects.map((item: Item) => (
              <li key={item.id}>
                <strong>{item.old_path}</strong> → <span>{item.new_path}</span>
                <span>{item.redirect_type}</span>
                <span>{item.is_active ? "ativo" : "inativo"}</span>
                <span>{item.hits ?? 0} hit(s)</span>
              </li>
            ))}
          </ul>
        </article>

        <article className={styles.card} data-testid="seo-card-sitemap">
          <h3>Prévia do sitemap</h3>
          <p className={styles.hint}>Leitura derivada do catálogo público. Não há loja de linhas: POST nesta rota devolve 405.</p>
          {sitemap && sitemap.situacao !== "ok" && (
            <p className={styles.stateNote} data-testid="seo-estado-sitemap" data-situacao={sitemap.situacao}>{sitemap.mensagem}</p>
          )}
          {sitemap && sitemap.situacao === "ok" && (
            <div data-testid="seo-sitemap" data-liberado={sitemap.liberado ? "sim" : "nao"}>
              <p className={styles.detailHead}>{sitemap.mensagem}</p>
              <p className={styles.hint}>origem: {sitemap.origem || "—"} · {sitemap.caminhos.length} caminho(s)</p>
              <pre className={styles.pre} aria-label="prévia do robots.txt">{sitemap.robots}</pre>
              <p className={styles.hint}>{sitemap.nota}</p>
            </div>
          )}
        </article>

        <article className={styles.card} data-testid="seo-card-dominios">
          <h3>Verificação de domínio</h3>
          <p className={styles.hint}>Cadastrar deixa o domínio <strong>pendente</strong>. Declarar verificado é recusado pelo servidor nesta entrega.</p>
          {estado(dominios, "dominios")}
          <div className={styles.form}>
            <label className={styles.field}>Domínio
              <input aria-label="domínio" value={domForm.domain} placeholder="www.exemplo.com.br" onChange={e => setDomForm({ ...domForm, domain: e.target.value })} />
              {erros.domain && <small className={styles.err}>{erros.domain}</small>}
            </label>
            <label className={styles.field}>Método
              <select aria-label="método de verificação" value={domForm.verification_method} onChange={e => setDomForm({ ...domForm, verification_method: e.target.value })}>
                {VERIFICATION_METHODS.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className={styles.field}>Token (10..500)
              <input aria-label="token de verificação" value={domForm.verification_token} onChange={e => setDomForm({ ...domForm, verification_token: e.target.value })} />
              {erros.verification_token && <small className={styles.err}>{erros.verification_token}</small>}
            </label>
            <button type="button" onClick={criarDominio} disabled={bloqueado}>{gravando === "dominio" ? "Gravando…" : "Registrar domínio pendente"}</button>
          </div>
          <ul className={styles.list} data-testid="seo-lista-dominios">
            {itensDominios.map((item: Item) => (
              <li key={item.id}>
                <strong>{item.domain}</strong>
                <span>{item.verification_method}</span>
                <span className={styles.badge} data-status={item.status}>{item.status}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
      <p className={styles.foot}>
        {lendo ? "Lendo…" : `Configurações ${itensConfigs.length} · redirecionamentos ${itensRedirects.length} · domínios ${itensDominios.length}. Nenhuma publicação é confirmada sem resposta do servidor.`}
      </p>
    </section>
  );
}
