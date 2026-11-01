"use client";
import { useEffect, useRef, useState } from "react";
import {
  AVISO_HISTORICO,
  AVISO_MINIMIZACAO,
  AVISO_PUBLICO,
  AVISO_SEGMENTO,
  AVISO_SENSIVEL,
  FORA_DESTA_TELA,
  SITUACOES_REGRA,
  TIPOS_SEGMENTO,
  chaveHandoff,
  chaveRegra,
  chaveSegmento,
  chaveSessao,
  classificarLista,
  dataCurta,
  mascararContato,
  proximosEstados,
  proximosHandoff,
  rotuloSituacao,
  simNao,
  traduzirErroPub,
  validarHandoff,
  validarRegra,
  validarSegmento,
  validarTransicaoRegra,
  type FormRegra,
  type Item,
  type ResultadoLista,
} from "./pub-faq-assistida-state";
import styles from "./PubFaqAssistedClient.module.css";

const FORM_VAZIO: FormRegra = {
  chave: "",
  pergunta: "",
  resposta: "",
  categoria: "servicos",
  palavras: "",
  price: false,
  coverage: false,
  license: false,
  deadline: false,
  handoff: false,
  motivo: "",
};

type ChaveLista = "items";

export default function PubFaqAssistedClient() {
  const [regras, setRegras] = useState<ResultadoLista | null>(null);
  const [sessoes, setSessoes] = useState<ResultadoLista | null>(null);
  const [handoffs, setHandoffs] = useState<ResultadoLista | null>(null);
  const [segmentos, setSegmentos] = useState<ResultadoLista | null>(null);
  const [hora, setHora] = useState("");
  const [lendo, setLendo] = useState(true);
  const [gravando, setGravando] = useState("");
  const [ok, setOk] = useState("");
  const [erro, setErro] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormRegra>(FORM_VAZIO);
  const [motivoTransicao, setMotivoTransicao] = useState("");
  const [respostaHandoff, setRespostaHandoff] = useState("");
  const sequencia = useRef(0);

  const ler = async (rota: string, chave: ChaveLista, rotulo: string): Promise<ResultadoLista> => {
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
    const [lidasRegras, lidasSessoes, lidosHandoffs, lidosSegmentos] = await Promise.all([
      ler("/api/admin/faq-assisted-rules", "items", "regras da FAQ assistida"),
      ler("/api/admin/pub-faq-sessions", "items", "sessões da FAQ assistida"),
      ler("/api/admin/faq-handoff", "items", "transferências humanas"),
      ler("/api/admin/pub-segments", "items", "segmentos do site"),
    ]);
    if (atual !== sequencia.current) return;
    setRegras(lidasRegras);
    setSessoes(lidasSessoes);
    setHandoffs(lidosHandoffs);
    setSegmentos(lidosSegmentos);
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
        await carregar();
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

  function criarRegra() {
    const validado = validarRegra(form);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("criar", "/api/admin/faq-assisted-rules", "POST", validado.payload,
      corpo => `Regra ${String(corpo.rule_key ?? validado.payload?.rule_key ?? "")} criada em rascunho; nada foi publicado.`)
      .then(criado => { if (criado) setForm(FORM_VAZIO); });
  }

  function mover(item: Item, destino: string) {
    const validado = validarTransicaoRegra(String(item.id ?? ""), destino, item.status, motivoTransicao);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("transicao", "/api/admin/faq-assisted-rules", "PATCH", validado.payload,
      `Regra ${String(item.rule_key)} movida para ${rotuloSituacao(destino)}; motivo gravado no histórico.`)
      .then(gravado => { if (gravado) setMotivoTransicao(""); });
  }

  function atenderHandoff(item: Item, destino: string) {
    const validado = validarHandoff(String(item.id ?? ""), String(item.protocol ?? ""), item.status, destino, respostaHandoff);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("handoff", "/api/admin/faq-handoff", "PATCH", validado.payload,
      destino === "concluido"
        ? `Transferência ${String(item.protocol)} concluída com a resposta escrita ao visitante.`
        : `Transferência ${String(item.protocol)} em atendimento humano.`)
      .then(gravado => { if (gravado) setRespostaHandoff(""); });
  }

  function agirSegmento(item: Item, acao: "validar" | "publicar" | "despublicar") {
    const validado = validarSegmento(String(item.id ?? ""), acao, item);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    const mensagem: Readonly<Record<string, string>> = {
      validar: `Segmento ${String(item.segment_key)} validado; publicar libera a página /segmentos/${String(item.segment_key)}.`,
      publicar: `Segmento ${String(item.segment_key)} publicado; a página pública passa a existir.`,
      despublicar: `Segmento ${String(item.segment_key)} despublicado; a página pública deixa de aparecer.`,
    };
    void gravar("segmento", "/api/admin/pub-segments", "PATCH", validado.payload, mensagem[acao]);
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
    <section className={styles.wrap} data-testid="pub-faq" aria-busy={lendo}>
      <header className={styles.head}>
        <div>
          <h2>FAQ assistida, transferência humana e segmentos</h2>
          <p className={styles.lead}>
            PUB-02/PUB-05: páginas por segmento validadas, FAQ revisada e transferência humana quando a pergunta
            toca preço, cobertura, licença ou prazo. O bot nunca inventa esses quatro.
          </p>
        </div>
        <div className={styles.headActions}>
          <span className={styles.stamp} data-testid="pub-hora">{lendo ? "Lendo…" : `Lido às ${hora}`}</span>
          <button type="button" onClick={() => void carregar()} disabled={lendo}>Atualizar</button>
        </div>
      </header>

      {ok && <p className={styles.ok} role="status" data-testid="pub-ok">{ok}</p>}
      {erro && <p className={styles.alert} role="alert" data-testid="pub-erro">{erro}</p>}

      <p className={styles.hint} data-testid="pub-aviso-publico">{AVISO_PUBLICO}</p>
      <p className={styles.hint} data-testid="pub-aviso-historico">{AVISO_HISTORICO}</p>
      <p className={styles.hint} data-testid="pub-aviso-minimizacao">{AVISO_MINIMIZACAO}</p>

      <article className={styles.card} data-testid="pub-card-regras">
        <h3>Regras da FAQ assistida</h3>
        <p className={styles.hint} data-testid="pub-aviso-sensivel">{AVISO_SENSIVEL}</p>
        {estado(regras, "regras")}
        <div className={styles.form}>
          <label className={styles.field}>Chave da regra
            <input aria-label="chave da regra" value={form.chave} maxLength={100}
              onChange={e => setForm({ ...form, chave: e.target.value })} />
            {erros.chave && <small className={styles.err} data-testid="pub-erro-chave">{erros.chave}</small>}
          </label>
          <label className={styles.field}>Padrão da pergunta
            <input aria-label="padrão da pergunta" value={form.pergunta} maxLength={500}
              onChange={e => setForm({ ...form, pergunta: e.target.value })} />
            {erros.pergunta && <small className={styles.err} data-testid="pub-erro-pergunta">{erros.pergunta}</small>}
          </label>
          <label className={styles.field}>Resposta aprovada
            <textarea aria-label="resposta aprovada" value={form.resposta} maxLength={5000} rows={4}
              onChange={e => setForm({ ...form, resposta: e.target.value })} />
            {erros.resposta && <small className={styles.err} data-testid="pub-erro-resposta">{erros.resposta}</small>}
          </label>
          <label className={styles.field}>Categoria
            <input aria-label="categoria da regra" value={form.categoria} maxLength={100}
              onChange={e => setForm({ ...form, categoria: e.target.value })} />
            {erros.categoria && <small className={styles.err} data-testid="pub-erro-categoria">{erros.categoria}</small>}
          </label>
          <label className={styles.field}>Palavras-chave (separadas por vírgula)
            <input aria-label="palavras-chave da regra" value={form.palavras} maxLength={600}
              onChange={e => setForm({ ...form, palavras: e.target.value })} />
            {erros.palavras && <small className={styles.err} data-testid="pub-erro-palavras">{erros.palavras}</small>}
          </label>
          <div className={styles.checks}>
            <label><input type="checkbox" aria-label="preço sensível" checked={form.price}
              onChange={e => setForm({ ...form, price: e.target.checked })} /> preço sensível</label>
            <label><input type="checkbox" aria-label="cobertura sensível" checked={form.coverage}
              onChange={e => setForm({ ...form, coverage: e.target.checked })} /> cobertura sensível</label>
            <label><input type="checkbox" aria-label="licença sensível" checked={form.license}
              onChange={e => setForm({ ...form, license: e.target.checked })} /> licença sensível</label>
            <label><input type="checkbox" aria-label="prazo sensível" checked={form.deadline}
              onChange={e => setForm({ ...form, deadline: e.target.checked })} /> prazo sensível</label>
            <label><input type="checkbox" aria-label="requer transferência humana" checked={form.handoff}
              onChange={e => setForm({ ...form, handoff: e.target.checked })} /> requer transferência humana</label>
          </div>
          {erros.handoff && <small className={styles.err} data-testid="pub-erro-handoff">{erros.handoff}</small>}
          <label className={styles.field}>Motivo da transferência humana
            <input aria-label="motivo da transferência" value={form.motivo} maxLength={1000}
              onChange={e => setForm({ ...form, motivo: e.target.value })} />
            {erros.motivo && <small className={styles.err} data-testid="pub-erro-motivo">{erros.motivo}</small>}
          </label>
          <button type="button" onClick={criarRegra} disabled={bloqueado}>Criar regra da FAQ assistida</button>
        </div>

        <label className={styles.field}>Motivo da mudança de situação
          <input aria-label="motivo da mudança" value={motivoTransicao} maxLength={1000}
            onChange={e => setMotivoTransicao(e.target.value)} />
          {erros.motivoTransicao && <small className={styles.err} data-testid="pub-erro-motivo-transicao">{erros.motivoTransicao}</small>}
        </label>
        {(erros.status || erros.id) && <small className={styles.err} data-testid="pub-erro-transicao">{erros.status ?? erros.id}</small>}

        <ul className={styles.list} data-testid="pub-lista-regras">
          {(regras?.itens ?? []).map(item => {
            const chave = chaveRegra(item);
            const situacao = String(item.status ?? "");
            return (
              <li key={String(item.id)} className={styles.item} data-testid={`pub-regra-${chave}`} data-situacao={situacao}>
                <div className={styles.itemHead}>
                  <strong>{String(item.rule_key ?? "sem chave")}</strong>
                  <span className={styles.badge}>{rotuloSituacao(situacao)}</span>
                </div>
                <p className={styles.meta}>
                  categoria {String(item.category ?? "—")} · aprovada: {simNao(item.is_approved)} · publicada: {simNao(item.is_published)} ·
                  sensível: {[item.is_price_sensitive && "preço", item.is_coverage_sensitive && "cobertura", item.is_license_sensitive && "licença", item.is_deadline_sensitive && "prazo"].filter(Boolean).join(", ") || "não"} ·
                  transferência humana: {simNao(item.is_human_handoff_required)}
                </p>
                <p className={styles.meta}>padrão da pergunta: {String(item.question_pattern ?? "—")}</p>
                <div className={styles.actions}>
                  {proximosEstados(situacao).map(destino => (
                    <button key={destino} type="button" disabled={bloqueado}
                      data-testid={`pub-mover-${chave}-${destino}`}
                      onClick={() => mover(item, destino)}>
                      {destino === "publicado" ? "Publicar" : destino === "aprovado" ? "Aprovar" : destino === "em_revisao" ? "Enviar para revisão" : destino === "arquivado" ? "Arquivar" : destino === "rejeitado" ? "Rejeitar" : "Voltar a rascunho"}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </article>

      <article className={styles.card} data-testid="pub-card-handoffs">
        <h3>Transferências humanas</h3>
        {estado(handoffs, "handoffs")}
        <label className={styles.field}>Resposta escrita ao visitante
          <textarea aria-label="resposta ao visitante" value={respostaHandoff} maxLength={2000} rows={3}
            onChange={e => setRespostaHandoff(e.target.value)} />
          {erros.retorno && <small className={styles.err} data-testid="pub-erro-resposta-handoff">{erros.retorno}</small>}
        </label>
        <ul className={styles.list} data-testid="pub-lista-handoffs">
          {(handoffs?.itens ?? []).map(item => {
            const chave = chaveHandoff(item);
            const situacao = String(item.status ?? "");
            return (
              <li key={String(item.id)} className={styles.item} data-testid={`pub-handoff-${chave}`} data-situacao={situacao}>
                <div className={styles.itemHead}>
                  <strong>{String(item.protocol ?? "sem protocolo")}</strong>
                  <span className={styles.badge}>{rotuloSituacao(situacao)}</span>
                </div>
                <p className={styles.meta}>motivo: {String(item.reason ?? "—")}</p>
                <p className={styles.meta}>
                  responsável: {String(item.responsible_name ?? "não informado")} · resposta: {String(item.response ?? "ainda não escrita")} ·
                  aberta em {dataCurta(item.created_at)}
                </p>
                <div className={styles.actions}>
                  {proximosHandoff(situacao).map(destino => (
                    <button key={destino} type="button" disabled={bloqueado}
                      data-testid={`pub-handoff-${chave}-${destino}`}
                      onClick={() => atenderHandoff(item, destino)}>
                      {destino === "em_atendimento" ? "Assumir atendimento" : destino === "concluido" ? "Concluir com a resposta" : destino === "cancelado" ? "Cancelar" : "Marcar expirado"}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </article>

      <article className={styles.card} data-testid="pub-card-sessoes">
        <h3>Sessões da FAQ assistida (leitura)</h3>
        {estado(sessoes, "sessoes")}
        <ul className={styles.list} data-testid="pub-lista-sessoes">
          {(sessoes?.itens ?? []).map(item => {
            const chave = chaveSessao(item);
            const situacao = String(item.status ?? "");
            return (
              <li key={String(item.id)} className={styles.item} data-testid={`pub-sessao-${chave}`} data-situacao={situacao}>
                <div className={styles.itemHead}>
                  <strong>{String(item.protocol ?? "sem protocolo")}</strong>
                  <span className={styles.badge}>{rotuloSituacao(situacao)}</span>
                </div>
                <p className={styles.meta}>
                  visitante: {String(item.visitor_name ?? "não informado")} · contato:{" "}
                  <span data-testid={`pub-contato-${chave}`}>{mascararContato(item.visitor_contact)}</span> ·
                  origem: {String(item.origin ?? "—")} · aberta em {dataCurta(item.created_at)}
                </p>
                <p className={styles.meta}>
                  transferência humana: {simNao(item.is_human_handoff)} · motivo: {String(item.handoff_reason ?? "—")}
                </p>
              </li>
            );
          })}
        </ul>
      </article>

      <article className={styles.card} data-testid="pub-card-segmentos">
        <h3>Segmentos do site</h3>
        <p className={styles.hint} data-testid="pub-aviso-segmento">{AVISO_SEGMENTO}</p>
        {estado(segmentos, "segmentos")}
        <ul className={styles.list} data-testid="pub-lista-segmentos">
          {(segmentos?.itens ?? []).map(item => {
            const chave = chaveSegmento(item);
            const situacao = item.is_published === true ? "publicado" : item.is_validated === true ? "validado" : "pendente";
            return (
              <li key={String(item.id)} className={styles.item} data-testid={`pub-segmento-${chave}`} data-situacao={situacao}>
                <div className={styles.itemHead}>
                  <strong>{String(item.name ?? item.segment_key ?? "sem nome")}</strong>
                  <span className={styles.badge}>{situacao === "publicado" ? "Publicado" : situacao === "validado" ? "Validado, não publicado" : "Aguardando validação"}</span>
                </div>
                <p className={styles.meta}>
                  chave {String(item.segment_key ?? "—")} · tipo {String(item.segment_type ?? "—")} ·
                  validado: {simNao(item.is_validated)} · publicado: {simNao(item.is_published)}
                </p>
                <div className={styles.actions}>
                  {item.is_validated !== true && (
                    <button type="button" disabled={bloqueado} data-testid={`pub-validar-${chave}`}
                      onClick={() => agirSegmento(item, "validar")}>Validar segmento</button>
                  )}
                  {item.is_validated === true && item.is_published !== true && (
                    <button type="button" disabled={bloqueado} data-testid={`pub-publicar-${chave}`}
                      onClick={() => agirSegmento(item, "publicar")}>Publicar segmento</button>
                  )}
                  {item.is_published === true && (
                    <button type="button" disabled={bloqueado} data-testid={`pub-despublicar-${chave}`}
                      onClick={() => agirSegmento(item, "despublicar")}>Despublicar segmento</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </article>

      <article className={styles.card} data-testid="pub-card-fora">
        <h3>Fora desta tela, de propósito</h3>
        <p className={styles.meta}>
          Estas rotas pertencem ao mesmo módulo, mas não são promovidas aqui: mensagem de sessão, desempenho e
          acessibilidade continuam sem superfície administrativa e são declaradas com rota e tabela — em vez de um
          botão que não prova nada.
        </p>
        <ul className={styles.list} data-testid="pub-lista-fora">
          {FORA_DESTA_TELA.map(item => (
            <li key={item.rota} className={styles.item}>
              <strong>{item.nome}</strong> — <code>{item.rota}</code> — tabela <code>{item.tabela}</code>
            </li>
          ))}
        </ul>
        <p className={styles.meta}>Situações do banco: {SITUACOES_REGRA.join(", ")} · tipos de segmento: {TIPOS_SEGMENTO.join(", ")}.</p>
      </article>
    </section>
  );
}
