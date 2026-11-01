"use client";
import { useEffect, useRef, useState } from "react";
import {
  classificarDetalhe,
  classificarLista,
  podePublicar,
  proximosEstados,
  rotuloStatus,
  traduzirErroCms,
  validarMotivo,
  validarRascunho,
  TIPOS,
  type Conteudo,
} from "./cms-content-state";
import styles from "./CmsClient.module.css";

const FORM_INICIAL = {
  slug: "", title: "", excerpt: "", content: "", content_type: "pagina" as string,
  seo_title: "", seo_description: "", is_authorized: false, metadata: "", tags: "",
};

export default function CmsClient() {
  const [lista, setLista] = useState<ReturnType<typeof classificarLista> | null>(null);
  const [hora, setHora] = useState("");
  const [lendo, setLendo] = useState(true);
  const [form, setForm] = useState(FORM_INICIAL);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [detalhe, setDetalhe] = useState<ReturnType<typeof classificarDetalhe> | null>(null);
  const [aberto, setAberto] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [ok, setOk] = useState("");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState("");
  const sequencia = useRef(0);

  const marcarHora = () => {
    const agora = new Date();
    setHora(`${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`);
  };

  async function carregar() {
    const atual = ++sequencia.current;
    setLendo(true);
    try {
      const resposta = await fetch("/api/admin/cms-contents", { headers: { Accept: "application/json" } });
      const corpo = await resposta.json().catch(() => undefined);
      if (atual !== sequencia.current) return;
      setLista(classificarLista(resposta.status, corpo));
    } catch {
      if (atual === sequencia.current) setLista(classificarLista(0, undefined));
    } finally {
      if (atual === sequencia.current) { setLendo(false); marcarHora(); }
    }
  }
  useEffect(() => { void carregar(); }, []);

  async function escrever(rotulo: string, url: string, method: string, body: unknown, sucesso: string) {
    setGravando(rotulo); setOk(""); setErro("");
    try {
      const resposta = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(traduzirErroCms(resposta.status, typeof dados?.error === "string" ? dados.error : ""));
        return false;
      }
      setOk(sucesso);
      await carregar();
      if (aberto) await abrir(aberto);
      return true;
    } catch {
      setErro("Falha de comunicação: nada foi confirmado. Tente novamente.");
      return false;
    } finally {
      setGravando("");
    }
  }

  async function abrir(id: string) {
    setAberto(id);
    try {
      const resposta = await fetch(`/api/admin/cms-contents/${id}`, { headers: { Accept: "application/json" } });
      const corpo = await resposta.json().catch(() => undefined);
      setDetalhe(classificarDetalhe(resposta.status, corpo));
    } catch {
      setDetalhe(classificarDetalhe(0, undefined));
    }
  }

  function criar() {
    const validado = validarRascunho(form);
    setErros(validado.erros);
    if (!validado.ok || !validado.payload) { setOk(""), setErro(""); return; }
    void escrever("criar", "/api/admin/cms-contents", "POST", validado.payload, `Rascunho de ${String(validado.payload.slug)} criado — nada foi publicado.`)
      .then(criado => { if (criado) setForm({ ...FORM_INICIAL }); });
  }

  function transicionar(conteudo: Conteudo, status: string) {
    const validado = validarMotivo(motivo);
    if (!validado.ok) { setOk(""); setErro(validado.erro); return; }
    // A transição é `PATCH /api/admin/cms-contents/:id` — o protótipo chamava a
    // rota sem id e recebia 405 em toda tentativa.
    void escrever(`transicao-${status}`, `/api/admin/cms-contents/${conteudo.id}`, "PATCH",
      // O handler recusa qualquer chave além de `status` e `reason`
      // (`create_revision_to_edit`): o id vai na rota, não no corpo.
      { status, reason: validado.motivo },
      `${conteudo.slug} v${conteudo.version} agora está ${rotuloStatus(status)}.`);
  }

  function reverter(conteudo: Conteudo, versao: number) {
    const validado = validarMotivo(motivo);
    if (!validado.ok) { setOk(""); setErro(validado.erro); return; }
    void escrever(`reverter-${versao}`, "/api/admin/cms-contents/revert", "POST",
      { content_id: conteudo.id, version: versao, reason: validado.motivo },
      `Reversão para v${versao} criou um novo rascunho — a versão publicada anterior segue no histórico.`);
  }

  const itens = lista?.itens ?? [];
  const bloqueado = gravando !== "";

  return (
    <section className={styles.page} data-testid="cms">
      <header className={styles.head}>
        <div>
          <span className={styles.eyebrow}>PUB-06 · CMS DO SITE</span>
          <h2>Conteúdo do site</h2>
          <p className={styles.lead}>
            Páginas, FAQ, cases, blog e vagas com rascunho, revisão, aprovação, publicação, arquivamento,
            versões por snapshot e histórico imutável. Publicar substitui a versão publicada anterior
            <strong> sem apagar nada</strong>: o histórico guarda quem mudou, quando e por quê.
          </p>
        </div>
        <div className={styles.readBox}>
          <span className={styles.stamp} data-testid="cms-hora">{hora ? `Lido às ${hora}` : "Lendo…"}</span>
          <button type="button" className={styles.retry} onClick={() => void carregar()} disabled={lendo} aria-busy={lendo}>
            {lendo ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </header>

      {lista && lista.situacao !== "ok" && lista.situacao !== "vazio" && (
        <p className={styles.alert} role="alert" data-testid="cms-faixa" data-situacao={lista.situacao}>
          {lista.mensagem}
          {itens.length > 0 ? " A lista anterior foi preservada." : " Isto não significa que não há conteúdo."}
        </p>
      )}
      {ok && <p className={styles.ok} role="status" data-testid="cms-ok">{ok}</p>}
      {erro && (
        <p className={styles.alert} role="alert" data-testid="cms-erro">
          {erro} <button type="button" className={styles.link} onClick={() => setErro("")}>Fechar</button>
        </p>
      )}

      <div className={styles.grid}>
        <article className={styles.card} data-testid="cms-card-lista">
          <h3>Conteúdos</h3>
          {lista && lista.situacao === "vazio" && <p className={styles.stateNote} data-testid="cms-estado-lista" data-situacao="vazio">{lista.mensagem}</p>}
          {lista && (lista.situacao === "negado" || lista.situacao === "falha" || lista.situacao === "invalido") && (
            <p className={styles.stateNote} data-testid="cms-estado-lista" data-situacao={lista.situacao}>{lista.mensagem}</p>
          )}
          <ul className={styles.list} data-testid="cms-lista">
            {itens.map(item => (
              <li key={item.id} data-testid={`cms-item-${item.slug}-v${item.version}`}>
                <span className={styles.tag}>{item.content_type}</span>
                <strong>{item.slug}</strong>
                <span>v{item.version}</span>
                <span className={styles.status} data-status={item.status}>{rotuloStatus(item.status)}</span>
                {item.is_published ? <span className={styles.pub}>publicado</span> : null}
                <button type="button" className={styles.link} onClick={() => void abrir(item.id)}>
                  {aberto === item.id ? "recarregar histórico" : "abrir histórico"}
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article className={styles.card} data-testid="cms-card-criar">
          <h3>Novo rascunho</h3>
          <p className={styles.hint}>Criar sempre nasce <strong>rascunho</strong>. Editar texto exige nova versão — a transição muda só o status.</p>
          <div className={styles.form}>
            <label className={styles.field}>Slug
              <input aria-label="slug" value={form.slug} placeholder="quem-somos" onChange={e => setForm({ ...form, slug: e.target.value })} />
              {erros.slug && <small className={styles.err}>{erros.slug}</small>}
            </label>
            <label className={styles.field}>Título
              <input aria-label="título" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              {erros.title && <small className={styles.err}>{erros.title}</small>}
            </label>
            <label className={styles.field}>Tipo
              <select aria-label="tipo de conteúdo" value={form.content_type} onChange={e => setForm({ ...form, content_type: e.target.value })}>
                {TIPOS.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
            </label>
            <label className={styles.field}>Resumo (10..1000)
              <input aria-label="resumo" value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} />
              {erros.excerpt && <small className={styles.err}>{erros.excerpt}</small>}
            </label>
            <label className={styles.field}>Título de SEO (5..200)
              <input aria-label="título de SEO" value={form.seo_title} onChange={e => setForm({ ...form, seo_title: e.target.value })} />
              {erros.seo_title && <small className={styles.err}>{erros.seo_title}</small>}
            </label>
            <label className={styles.field}>Descrição de SEO (10..500)
              <input aria-label="descrição de SEO" value={form.seo_description} onChange={e => setForm({ ...form, seo_description: e.target.value })} />
              {erros.seo_description && <small className={styles.err}>{erros.seo_description}</small>}
            </label>
            <label className={styles.field}>Tags (vírgula)
              <input aria-label="tags" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
            </label>
            <label className={styles.field}>Conteúdo (50..20000)
              <textarea aria-label="conteúdo" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
              {erros.content && <small className={styles.err}>{erros.content}</small>}
            </label>
            <label className={styles.field}>Metadata (JSON)
              <textarea aria-label="metadata" value={form.metadata} placeholder='{"requirements":"..."}' onChange={e => setForm({ ...form, metadata: e.target.value })} />
              {erros.metadata && <small className={styles.err}>{erros.metadata}</small>}
            </label>
            <label className={styles.check}>
              <input type="checkbox" aria-label="autorizado para case" checked={form.is_authorized} onChange={e => setForm({ ...form, is_authorized: e.target.checked })} />
              cliente autorizou publicar como case
            </label>
            <button type="button" onClick={criar} disabled={bloqueado}>{gravando === "criar" ? "Criando…" : "Criar rascunho"}</button>
          </div>
        </article>

        <article className={styles.card} data-testid="cms-card-detalhe">
          <h3>Histórico e decisões</h3>
          <div className={styles.form}>
            <label className={styles.field}>Motivo da decisão (10..1000)
              <input aria-label="motivo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="por que esta mudança de status" />
            </label>
          </div>
          {!detalhe && <p className={styles.stateNote} data-testid="cms-detalhe">Abra um conteúdo na lista para ver versões e histórico.</p>}
          {detalhe && detalhe.situacao !== "ok" && (
            <p className={styles.stateNote} data-testid="cms-detalhe" data-situacao={detalhe.situacao}>{detalhe.mensagem}</p>
          )}
          {detalhe && detalhe.situacao === "ok" && detalhe.conteudo && (
            <div data-testid="cms-detalhe" data-situacao="ok">
              <p className={styles.detailHead}>
                <strong>{detalhe.conteudo.slug}</strong> v{detalhe.conteudo.version} · {rotuloStatus(detalhe.conteudo.status)} · {detalhe.mensagem}
              </p>
              <div className={styles.actions} data-testid="cms-transicoes">
                {proximosEstados(detalhe.conteudo.status).map(status => {
                  const permitido = status !== "publicado" || podePublicar(detalhe.conteudo!);
                  return (
                    <button
                      key={status}
                      type="button"
                      data-testid={`cms-transicao-${status}`}
                      onClick={() => transicionar(detalhe.conteudo!, status)}
                      disabled={bloqueado || !permitido}
                      title={permitido ? `Mudar para ${rotuloStatus(status)}` : "Case sem autorização não pode ser publicado"}
                    >
                      {gravando === `transicao-${status}` ? "Gravando…" : `→ ${rotuloStatus(status)}`}
                    </button>
                  );
                })}
                {proximosEstados(detalhe.conteudo.status).length === 0 && (
                  <span className={styles.stateNote}>Status terminal: nenhuma transição a partir de {rotuloStatus(detalhe.conteudo.status)}.</span>
                )}
              </div>
              <h4>Versões</h4>
              <ul className={styles.list}>
                {detalhe.versoes.map(versao => (
                  <li key={versao.version}>
                    v{versao.version} · {versao.change_summary || "sem resumo"} · {versao.created_by_name || "sistema"}
                    <button type="button" className={styles.link} data-testid={`cms-reverter-${versao.version}`} onClick={() => reverter(detalhe.conteudo!, versao.version)} disabled={bloqueado}>
                      {gravando === `reverter-${versao.version}` ? "Revertendo…" : "reverter para esta versão"}
                    </button>
                  </li>
                ))}
              </ul>
              <h4>Histórico</h4>
              <ul className={styles.list}>
                {detalhe.historico.map((evento, indice) => (
                  <li key={evento.id ?? indice}>
                    v{evento.previous_version ?? "—"} → v{evento.next_version} · {rotuloStatus(String(evento.previous_status ?? "—"))} → {rotuloStatus(String(evento.next_status))} · {evento.reason || "sem motivo"} · {evento.changed_by_name || "sistema"}
                  </li>
                ))}
                {detalhe.historico.length === 0 && <li>Nenhum evento registrado para este conteúdo.</li>}
              </ul>
            </div>
          )}
        </article>
      </div>
      <p className={styles.foot}>
        {lista ? `${itens.length} conteúdo(s) lidos às ${hora || "—"}.` : "—"} Publicar não apaga versão anterior; reverter cria rascunho novo.
      </p>
    </section>
  );
}
