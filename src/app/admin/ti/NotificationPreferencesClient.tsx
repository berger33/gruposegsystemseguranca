"use client";
import { useEffect, useRef, useState } from "react";
import {
  AVISO_APROVACAO,
  AVISO_MEDICO,
  AVISO_ORDEM,
  AVISO_PREFERENCIA,
  AVISO_QUIET_HOURS,
  AVISO_REJEICAO,
  AVISO_SESSAO,
  CANAIS,
  STATUS_MODELO,
  STATUS_NA_CRIACAO,
  TIPOS_DESTINATARIO,
  chaveModelo,
  chavePreferencia,
  classificarLista,
  contemInfoMedica,
  janelaSilencio,
  proximosEstados,
  simNao,
  traduzirErroPlt,
  validarModelo,
  validarPreferencia,
  validarTransicao,
  type ResultadoLista,
} from "./notification-prefs-state";
import styles from "./NotificationPreferencesClient.module.css";

type Item = Record<string, unknown>;

const FORM_PREFERENCIA = {
  recipient_kind: "staff",
  channel: "email",
  recipient_id: "",
  recipient_email: "",
  is_enabled: true,
  is_email_enabled: true,
  is_push_enabled: false,
  is_whatsapp_enabled: false,
  is_sms_enabled: false,
  is_internal_enabled: true,
  quiet_hours_start: "",
  quiet_hours_end: "",
};

const FORM_MODELO = {
  template_key: "",
  channel: "email",
  subject: "",
  body: "",
  status: "rascunho",
  medical_review_note: "",
};

export default function NotificationPreferencesClient() {
  const [preferencias, setPreferencias] = useState<ResultadoLista | null>(null);
  const [modelos, setModelos] = useState<ResultadoLista | null>(null);
  const [hora, setHora] = useState("");
  const [lendo, setLendo] = useState(true);
  const [gravando, setGravando] = useState("");
  const [ok, setOk] = useState("");
  const [erro, setErro] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [preferencia, setPreferencia] = useState(FORM_PREFERENCIA);
  const [modelo, setModelo] = useState(FORM_MODELO);
  const [motivo, setMotivo] = useState("");
  const sequencia = useRef(0);

  const ler = async (rota: string, chave: "preferences" | "templates", rotulo: string) => {
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
    const [lidasPreferencias, lidosModelos] = await Promise.all([
      ler("/api/crm/notification-preferences", "preferences", "preferências de notificação"),
      ler("/api/crm/notification-templates", "templates", "modelos de mensagem"),
    ]);
    if (atual !== sequencia.current) return;
    setPreferencias(lidasPreferencias);
    setModelos(lidosModelos);
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
        setErro(traduzirErroPlt(resposta.status, typeof dados?.error === "string" ? dados.error : ""));
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

  function salvarPreferencia() {
    const validado = validarPreferencia(preferencia);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    const global = !validado.payload.recipient_id;
    void gravar("preferencia", "/api/crm/notification-preferences", "POST", validado.payload,
      `Preferência de ${String(validado.payload.recipient_kind)} em ${String(validado.payload.channel)} ` +
      `${global ? "gravada como global do tipo (atualizada, não duplicada)" : "gravada para o destinatário informado"}.`)
      .then(salvo => { if (salvo) setPreferencia(FORM_PREFERENCIA); });
  }

  function criarModelo() {
    const validado = validarModelo(modelo);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    const medical = contemInfoMedica(validado.payload.body);
    void gravar("modelo", "/api/crm/notification-templates", "POST", validado.payload,
      corpo => {
        const modelo = (corpo.template as Item | undefined) ?? {};
        const seguro = modelo.is_medical_safe === true;
        return `Modelo ${String(modelo.template_key)} v${String(modelo.version)} criado em ${String(modelo.status)}; ` +
          (seguro
            ? "o servidor marcou o conteúdo como sem informação médica."
            : "o servidor marcou o conteúdo como NÃO seguro para informação médica e ele não pode ser aprovado enquanto isso.");
      })
      .then(criado => { if (criado) { setModelo(FORM_MODELO); void medical; } });
  }

  function avancar(item: Item, destino: string) {
    const validado = validarTransicao(String(item.id ?? ""), destino, motivo, item.status);
    setErros(validado.erros); setOk(""); setErro("");
    if (!validado.ok || !validado.payload) return;
    void gravar("transicao", `/api/crm/notification-templates/${String(item.id)}`, "PATCH", validado.payload,
      `Modelo ${String(item.template_key)} movido para ${destino}${destino === "rejeitado" ? " com o motivo digitado" : ""}.`)
      .then(movido => { if (movido) setMotivo(""); });
  }

  const bloqueado = gravando !== "";
  const estado = (resultado: ResultadoLista | null, chave: string) => {
    if (!resultado || resultado.situacao === "ok") return null;
    return (
      <p className={styles.stateNote} data-testid={`plt-estado-${chave}`} data-situacao={resultado.situacao}>
        {resultado.mensagem}
      </p>
    );
  };

  return (
    <section className={styles.wrap} data-testid="plt-notificacoes" aria-busy={lendo}>
      <header className={styles.head}>
        <div>
          <h2>Preferências de notificação e modelos de mensagem</h2>
          <p className={styles.lead}>
            PLT-05: cada pessoa escolhe canal e janela de silêncio; cada mensagem nasce como modelo versionado,
            revisado e sem informação médica em assunto ou push. Aprovar e rejeitar ficam registrados com quem agiu.
          </p>
        </div>
        <div className={styles.headActions}>
          <span className={styles.stamp} data-testid="plt-hora">{lendo ? "Lendo…" : `Lido às ${hora}`}</span>
          <button type="button" onClick={() => void carregar()} disabled={lendo}>Atualizar</button>
        </div>
      </header>

      {ok && <p className={styles.ok} role="status" data-testid="plt-ok">{ok}</p>}
      {erro && <p className={styles.alert} role="alert" data-testid="plt-erro">{erro}</p>}

      <article className={styles.card} data-testid="plt-card-preferencias">
        <h3>Preferências por destinatário e canal</h3>
        <p className={styles.hint} data-testid="plt-aviso-preferencia">{AVISO_PREFERENCIA}</p>
        <p className={styles.hint} data-testid="plt-aviso-quiet">{AVISO_QUIET_HOURS}</p>
        <p className={styles.hint} data-testid="plt-aviso-sessao">{AVISO_SESSAO}</p>
        {estado(preferencias, "preferencias")}
        <div className={styles.form}>
          <label className={styles.field}>Tipo de destinatário
            <select aria-label="tipo de destinatário" value={preferencia.recipient_kind}
              onChange={e => setPreferencia({ ...preferencia, recipient_kind: e.target.value })}>
              {TIPOS_DESTINATARIO.map(kind => <option key={kind} value={kind}>{kind}</option>)}
            </select>
            {erros.recipient_kind && <small className={styles.err}>{erros.recipient_kind}</small>}
          </label>
          <label className={styles.field}>Canal
            <select aria-label="canal da preferência" value={preferencia.channel}
              onChange={e => setPreferencia({ ...preferencia, channel: e.target.value })}>
              {CANAIS.map(canal => <option key={canal} value={canal}>{canal}</option>)}
            </select>
            {erros.channel && <small className={styles.err}>{erros.channel}</small>}
          </label>
          <label className={styles.field}>Destinatário (UUID, opcional)
            <input aria-label="destinatário da preferência" value={preferencia.recipient_id} maxLength={36}
              onChange={e => setPreferencia({ ...preferencia, recipient_id: e.target.value })} />
            {erros.recipient_id && <small className={styles.err}>{erros.recipient_id}</small>}
          </label>
          <label className={styles.field}>E-mail do destinatário (opcional)
            <input aria-label="e-mail do destinatário" value={preferencia.recipient_email} maxLength={320}
              onChange={e => setPreferencia({ ...preferencia, recipient_email: e.target.value })} />
            {erros.recipient_email && <small className={styles.err}>{erros.recipient_email}</small>}
          </label>
          <label className={styles.field}>Silêncio — início
            <input aria-label="início do silêncio" placeholder="22:00" value={preferencia.quiet_hours_start} maxLength={5}
              onChange={e => setPreferencia({ ...preferencia, quiet_hours_start: e.target.value })} />
          </label>
          <label className={styles.field}>Silêncio — fim
            <input aria-label="fim do silêncio" placeholder="07:00" value={preferencia.quiet_hours_end} maxLength={5}
              onChange={e => setPreferencia({ ...preferencia, quiet_hours_end: e.target.value })} />
            {erros.quiet_hours && <small className={styles.err} data-testid="plt-erro-quiet">{erros.quiet_hours}</small>}
          </label>
          <div className={styles.toggles}>
            {([
              ["is_enabled", "canal ligado"],
              ["is_email_enabled", "e-mail ligado"],
              ["is_push_enabled", "push ligado"],
              ["is_whatsapp_enabled", "whatsapp ligado"],
              ["is_sms_enabled", "sms ligado"],
              ["is_internal_enabled", "painel ligado"],
            ] as const).map(([campo, rotulo]) => (
              <label key={campo} className={styles.check}>
                <input type="checkbox" aria-label={rotulo} checked={preferencia[campo]}
                  onChange={e => setPreferencia({ ...preferencia, [campo]: e.target.checked })} />
                {rotulo}
              </label>
            ))}
          </div>
          <button type="button" onClick={salvarPreferencia} disabled={bloqueado}>
            {gravando === "preferencia" ? "Gravando…" : "Salvar preferência"}
          </button>
        </div>
        <ul className={styles.list} data-testid="plt-lista-preferencias">
          {(preferencias?.itens ?? []).map((item: Item) => (
            <li key={String(item.id)} data-testid={`plt-pref-${chavePreferencia(item)}`}>
              <strong>{String(item.recipient_kind)}</strong>{" "}
              <span>{String(item.channel)}</span>{" "}
              <span>{item.recipient_id ? "destinatário informado" : "global do tipo"}</span>{" "}
              <span>canal {simNao(item.is_enabled)}</span>{" "}
              <span>e-mail {simNao(item.is_email_enabled)}</span>{" "}
              <span>push {simNao(item.is_push_enabled)}</span>{" "}
              <span>whatsapp {simNao(item.is_whatsapp_enabled)}</span>{" "}
              <span>sms {simNao(item.is_sms_enabled)}</span>{" "}
              <span>painel {simNao(item.is_internal_enabled)}</span>{" "}
              <span>{janelaSilencio(item)}</span>
            </li>
          ))}
        </ul>
      </article>

      <article className={styles.card} data-testid="plt-card-modelos">
        <h3>Modelos de mensagem versionados</h3>
        <p className={styles.hint} data-testid="plt-aviso-medico">{AVISO_MEDICO}</p>
        <p className={styles.hint} data-testid="plt-aviso-ordem">{AVISO_ORDEM}</p>
        <p className={styles.hint} data-testid="plt-aviso-aprovacao">{AVISO_APROVACAO}</p>
        <p className={styles.hint} data-testid="plt-aviso-rejeicao">{AVISO_REJEICAO}</p>
        {estado(modelos, "modelos")}
        <div className={styles.form}>
          <label className={styles.field}>Chave do modelo
            <input aria-label="chave do modelo" value={modelo.template_key} maxLength={100}
              onChange={e => setModelo({ ...modelo, template_key: e.target.value })} />
            {erros.template_key && <small className={styles.err}>{erros.template_key}</small>}
          </label>
          <label className={styles.field}>Canal do modelo
            <select aria-label="canal do modelo" value={modelo.channel}
              onChange={e => setModelo({ ...modelo, channel: e.target.value })}>
              {CANAIS.map(canal => <option key={canal} value={canal}>{canal}</option>)}
            </select>
            {erros.channel && <small className={styles.err}>{erros.channel}</small>}
          </label>
          <label className={styles.field}>Assunto (opcional)
            <input aria-label="assunto do modelo" value={modelo.subject} maxLength={200}
              onChange={e => setModelo({ ...modelo, subject: e.target.value })} />
            {erros.subject && <small className={styles.err} data-testid="plt-erro-assunto">{erros.subject}</small>}
          </label>
          <label className={styles.field}>Situação inicial
            <select aria-label="situação inicial do modelo" value={modelo.status}
              onChange={e => setModelo({ ...modelo, status: e.target.value })}>
              {STATUS_NA_CRIACAO.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
            {erros.status && <small className={styles.err}>{erros.status}</small>}
          </label>
          <label className={styles.field}>Observação de revisão (opcional)
            <input aria-label="observação de revisão" value={modelo.medical_review_note} maxLength={1000}
              onChange={e => setModelo({ ...modelo, medical_review_note: e.target.value })} />
            {erros.medical_review_note && <small className={styles.err}>{erros.medical_review_note}</small>}
          </label>
          <label className={styles.field}>Corpo do modelo
            <textarea aria-label="corpo do modelo" value={modelo.body} maxLength={5000} rows={3}
              onChange={e => setModelo({ ...modelo, body: e.target.value })} />
            {erros.body && <small className={styles.err} data-testid="plt-erro-corpo">{erros.body}</small>}
          </label>
          <label className={styles.field}>Motivo da rejeição (para rejeitar)
            <input aria-label="motivo da rejeição" value={motivo} maxLength={1000}
              onChange={e => setMotivo(e.target.value)} />
            {erros.reason && <small className={styles.err} data-testid="plt-erro-motivo">{erros.reason}</small>}
          </label>
          <button type="button" onClick={criarModelo} disabled={bloqueado}>
            {gravando === "modelo" ? "Gravando…" : "Criar modelo"}
          </button>
        </div>
        <ul className={styles.list} data-testid="plt-lista-modelos">
          {(modelos?.itens ?? []).map((item: Item) => {
            const chave = chaveModelo(item);
            const seguro = item.is_medical_safe === true;
            const proximos = proximosEstados(item.status);
            return (
              <li key={String(item.id)} data-testid={`plt-modelo-${chave}`} data-situacao={String(item.status ?? "desconhecida")}>
                <strong>{String(item.template_key)}</strong>{" "}
                <span>{String(item.channel)} v{String(item.version)}</span>{" "}
                <span>situação {String(item.status)}</span>{" "}
                <span>{seguro ? "sem info médica" : "contém info médica: não aprovável"}</span>{" "}
                {item.subject ? <span>assunto {String(item.subject)}</span> : <span>sem assunto</span>}{" "}
                {item.rejection_reason ? <span>motivo gravado: {String(item.rejection_reason)}</span> : null}{" "}
                {proximos.map(destino => (
                  <button key={destino} type="button" disabled={bloqueado}
                    data-testid={`plt-avancar-${chave}-${destino}`}
                    onClick={() => avancar(item, destino)}>
                    {destino}
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      </article>

      <p className={styles.foot}>
        Situações conhecidas pelo banco: {STATUS_MODELO.join(", ")}. Canais: {CANAIS.join(", ")}.
        Modelos aprovados não guardam informação médica; o servidor recusa o assunto e o push com esses termos.
      </p>
    </section>
  );
}
