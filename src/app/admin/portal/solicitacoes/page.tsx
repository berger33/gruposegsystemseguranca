"use client";

// CLI-13 administrativo — configuração dos modos de entrada do portal e fila de
// pedidos de acesso com decisão registrada.
//
// O que a tela faz (nada disso mudou): lê `GET /api/cli/portal-mode-configs`,
// lê a fila de pedidos, salva um modo com motivo (PATCH) e decide um pedido com
// motivo (PATCH). A aprovação emite SOMENTE o convite canônico — conceder
// vínculo e escopo contratual continua sendo uma ação separada, explícita e
// motivada. O `window.prompt` do motivo foi preservado.
//
// UX-PRO-06 (fila de acesso do portal). A sonda na base mediu, em PostgreSQL 17
// e Chromium: a fila administrativa respondia 403 para `ti`/`admin` em TODOS os
// aliases `/api/{admin/,crm/}*hr/cli-portal-access-requests` (a borda legada de
// RH exige a permissão `employees.read`), `/api/cli/portal-access-requests` era
// tratado como caminho público (405), e o pedido público em
// `/api/public/portal-access-requests` devolvia 404 porque o alias estava
// despachado mas ausente da lista de caminhos de API do servidor. Com isso a
// tela dizia ao mesmo tempo "Não foi possível carregar" e "Nenhum pedido
// registrado", engolia a negativa mantendo dado na tela, publicava payload
// inválido como se fosse pedido e, na escrita, morria em silêncio quando o
// corpo não era JSON (`SyntaxError` de `response.json()`), além de mostrar o
// código cru do servidor.
//
// Esta fatia corrige o estado da tela e usa o alias canônico de administração
// criado para a jornada (`/api/admin/portal-access-requests`), que autoriza a
// si mesmo com `admin|ti` + origem, exatamente como o handler já fazia. Nenhum
// papel, permissão, URL antiga, método, corpo ou campo foi removido: os aliases
// anteriores continuam despachados e respondendo como antes.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, FileSearch } from "lucide-react";
import styles from "./AccessRequests.module.css";
import AdminGate from "../../AdminGate";
import {
  descreverFalhaLeitura,
  descreverFalhaRede,
  descreverRespostaInvalida,
  estaVazia,
  parseModos,
  parsePedidos,
  podeDecidir,
  reduzirLeitura,
  rotuloModo,
  rotuloStatus,
  traduzirErroEscrita,
  validarMotivo,
  type FalhaLeitura,
  type Leitura,
  type ModoEntrada,
  type PedidoAcesso,
} from "./access-queue-state";

/** Alias canônico de administração da jornada (admin|ti + origem no servidor). */
const ROTA_FILA = "/api/admin/portal-access-requests";
const ROTA_MODOS = "/api/cli/portal-mode-configs";

type Recurso = "fila" | "modos";
type Feedback = { tom: "ok" | "erro"; texto: string };

const leituraInicial = <T,>(): Leitura<T> => ({
  itens: [], carregando: true, falha: null, concluiu: false, hora: null, desatualizada: null,
});

const horaAgora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

async function lerResposta(resposta: Response): Promise<unknown> {
  try {
    return await resposta.json();
  } catch {
    // Corpo não-JSON (ex.: HTML de 503) NÃO é sucesso nem "vazio": é ausência
    // de contrato. Quem chamou decide a falha; nada é inventado aqui.
    return null;
  }
}

function BandaDeFalha({ falha, testId, aoRepetir, referencia }: {
  falha: FalhaLeitura;
  testId: string;
  aoRepetir: () => void;
  referencia: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={referencia}
      role="alert"
      tabIndex={-1}
      data-testid={testId}
      data-falha={falha.kind}
      className={falha.kind === "auth" || falha.kind === "denied" ? styles.stateDenied : styles.stateError}
    >
      <CircleAlert size={18} aria-hidden="true" />
      <div>
        <strong>{falha.title}.</strong>
        <p>{falha.detail}</p>
        {falha.canRetry ? (
          <button type="button" className={styles.retryButton} onClick={aoRepetir}>Tentar novamente</button>
        ) : null}
      </div>
    </div>
  );
}

function PortalAccessRequestsPageContent() {
  const [modos, setModos] = useState<Leitura<ModoEntrada>>(leituraInicial<ModoEntrada>);
  const [pedidos, setPedidos] = useState<Leitura<PedidoAcesso>>(leituraInicial<PedidoAcesso>);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [salvandoModo, setSalvandoModo] = useState<string | null>(null);

  const sequenciaModos = useRef(0);
  const sequenciaFila = useRef(0);
  const alertaModos = useRef<HTMLDivElement | null>(null);
  const alertaFila = useRef<HTMLDivElement | null>(null);
  const alertaAcao = useRef<HTMLDivElement | null>(null);
  const focarNaFalha = useRef(false);

  /** Empurra o foco só quando a falha foi provocada por uma AÇÃO da pessoa. */
  useEffect(() => {
    if (!focarNaFalha.current) return;
    const alvo = alertaAcao.current ?? alertaFila.current ?? alertaModos.current;
    if (!alvo) return;
    alvo.focus();
    focarNaFalha.current = false;
  }, [feedback, pedidos.falha, pedidos.desatualizada, modos.falha, modos.desatualizada]);

  const registrarFalha = useCallback((recurso: Recurso, falha: FalhaLeitura, sequencia: number, atual: number) => {
    if (recurso === "fila") {
      setPedidos(estado => reduzirLeitura(estado, { tipo: "falha", sequencia, atual, falha }));
      return;
    }
    setModos(estado => reduzirLeitura(estado, { tipo: "falha", sequencia, atual, falha }));
  }, []);

  const ler = useCallback(async (recurso: Recurso) => {
    const sequencia = recurso === "fila" ? (sequenciaFila.current += 1) : (sequenciaModos.current += 1);
    const atual = () => (recurso === "fila" ? sequenciaFila.current : sequenciaModos.current);
    if (recurso === "fila") setPedidos(estado => reduzirLeitura(estado, { tipo: "iniciar" }));
    else setModos(estado => reduzirLeitura(estado, { tipo: "iniciar" }));

    let resposta: Response;
    try {
      resposta = await fetch(recurso === "fila" ? ROTA_FILA : ROTA_MODOS, { headers: { accept: "application/json" } });
    } catch {
      registrarFalha(recurso, descreverFalhaRede(recurso), sequencia, atual());
      return;
    }
    if (!resposta.ok) {
      registrarFalha(recurso, descreverFalhaLeitura(resposta.status, recurso), sequencia, atual());
      return;
    }
    const corpo = await lerResposta(resposta);
    let itens: ModoEntrada[] | PedidoAcesso[];
    try {
      itens = recurso === "fila" ? parsePedidos(corpo) : parseModos(corpo);
    } catch {
      registrarFalha(recurso, descreverRespostaInvalida(recurso), sequencia, atual());
      return;
    }
    const hora = horaAgora();
    if (recurso === "fila") {
      setPedidos(estado => reduzirLeitura(estado, {
        tipo: "sucesso", sequencia, atual: atual(), itens: itens as PedidoAcesso[], hora,
      }));
      return;
    }
    setModos(estado => reduzirLeitura(estado, { tipo: "sucesso", sequencia, atual: atual(), itens: itens as ModoEntrada[], hora }));
  }, [registrarFalha]);

  // Duas leituras INDEPENDENTES: a falha de uma não apaga a outra.
  useEffect(() => {
    void ler("fila");
    void ler("modos");
  }, [ler]);

  async function salvarModo(modo: ModoEntrada) {
    const motivo = window.prompt("Motivo da alteração (10 a 500 caracteres):", "")?.trim();
    if (!motivo) return;
    const validacao = validarMotivo(motivo);
    if (!validacao.ok) {
      setFeedback({ tom: "erro", texto: validacao.mensagem });
      focarNaFalha.current = true;
      return;
    }
    setSalvandoModo(modo.mode);
    try {
      let resposta: Response;
      try {
        resposta = await fetch(ROTA_MODOS, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...modo, reason: motivo }),
        });
      } catch {
        setFeedback({ tom: "erro", texto: "A conexão falhou e a configuração não foi alterada. Tente novamente." });
        focarNaFalha.current = true;
        return;
      }
      const corpo = await lerResposta(resposta);
      const codigo = corpo && typeof corpo === "object" ? (corpo as { error?: unknown }).error : undefined;
      if (resposta.ok) {
        setFeedback({ tom: "ok", texto: "Configuração registrada com autoria e auditoria." });
        void ler("modos");
        return;
      }
      setFeedback({ tom: "erro", texto: traduzirErroEscrita(resposta.status, codigo) });
      focarNaFalha.current = true;
    } finally {
      setSalvandoModo(null);
    }
  }

  async function decidir(pedido: PedidoAcesso, status: "aprovada" | "rejeitada") {
    const motivo = window.prompt(
      status === "aprovada" ? "Motivo da aprovação e da emissão do convite:" : "Motivo da rejeição:",
      "",
    )?.trim();
    if (!motivo) return;
    const validacao = validarMotivo(motivo);
    if (!validacao.ok) {
      setFeedback({ tom: "erro", texto: validacao.mensagem });
      focarNaFalha.current = true;
      return;
    }
    setDecidindo(pedido.id);
    try {
      let resposta: Response;
      try {
        resposta = await fetch(ROTA_FILA, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pedido.id, status, reason: motivo }),
        });
      } catch {
        setFeedback({ tom: "erro", texto: "A conexão falhou e a decisão não foi registrada. Tente novamente." });
        focarNaFalha.current = true;
        return;
      }
      const corpo = await lerResposta(resposta);
      const dados = (corpo && typeof corpo === "object" ? corpo : {}) as { error?: unknown; inviteUrl?: unknown };
      if (!resposta.ok) {
        setFeedback({ tom: "erro", texto: traduzirErroEscrita(resposta.status, dados.error) });
        focarNaFalha.current = true;
        return;
      }
      if (status === "aprovada") {
        setFeedback({
          tom: "ok",
          texto: typeof dados.inviteUrl === "string"
            ? `Convite canônico criado. URL manual: ${dados.inviteUrl}`
            : "Pedido aprovado. O servidor não devolveu a URL do convite — confira a fila antes de reenviar qualquer coisa.",
        });
      } else {
        setFeedback({ tom: "ok", texto: "Rejeição registrada." });
      }
      void ler("fila");
    } finally {
      setDecidindo(null);
    }
  }

  return (
    <div className={styles.page} data-admin-content="true">
      <header className={styles.header}>
        <Link href="/admin/portal" className={styles.back}><ArrowLeft size={15} /> Configuração do portal</Link>
        <span className={styles.headerLabel}><FileSearch size={14} /> CLI-13 · ACESSOS</span>
      </header>
      <section className={styles.content}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>JORNADA REAL · REVISÃO ADMIN/TI</span>
            <h1>Modos e pedidos<br /><em>com decisão registrada.</em></h1>
            <p>
              A aprovação emite somente o convite canônico. Conceder vínculo e escopo contratual continua sendo uma
              ação separada, explícita e motivada.
            </p>
          </div>
        </div>

        {feedback ? (
          <div
            ref={alertaAcao}
            role={feedback.tom === "erro" ? "alert" : "status"}
            tabIndex={-1}
            data-testid={feedback.tom === "erro" ? "cli13-acao-erro" : "cli13-acao-ok"}
            className={feedback.tom === "erro" ? styles.stateError : styles.notice}
          >
            <CircleAlert size={18} aria-hidden="true" />
            <p>{feedback.texto}</p>
          </div>
        ) : null}

        <section className={styles.requesterSection} aria-labelledby="cli13-modos-title" aria-busy={modos.carregando}>
          <div>
            <span className={styles.sectionLabel}>MODOS DE ENTRADA</span>
            <h2 id="cli13-modos-title">Configuração vigente</h2>
            <p>
              Cada alteração exige motivo e é auditada pelo servidor. Autocadastro nunca libera contratos sozinho.
            </p>
          </div>
          <div className={styles.requesterActions}>
            {modos.itens.map((modo, index) => (
              <div className={styles.requestForm} key={modo.mode}>
                <strong>{rotuloModo(modo.mode)}</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={modo.is_active}
                    disabled={salvandoModo === modo.mode}
                    onChange={event => setModos(estado => ({
                      ...estado,
                      itens: estado.itens.map((item, indice) => indice === index ? { ...item, is_active: event.target.checked } : item),
                    }))}
                  />{" "}Ativo
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={modo.requires_approval}
                    disabled={salvandoModo === modo.mode}
                    onChange={event => setModos(estado => ({
                      ...estado,
                      itens: estado.itens.map((item, indice) => indice === index ? { ...item, requires_approval: event.target.checked } : item),
                    }))}
                  />{" "}Exige aprovação
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={modo.auto_release_contracts}
                    disabled={modo.mode === "autocadastro" || salvandoModo === modo.mode}
                    onChange={event => setModos(estado => ({
                      ...estado,
                      itens: estado.itens.map((item, indice) => indice === index ? { ...item, auto_release_contracts: event.target.checked } : item),
                    }))}
                  />{" "}Libera contratos automaticamente
                </label>
                <button
                  type="button"
                  disabled={salvandoModo === modo.mode}
                  onClick={() => void salvarModo(modo)}
                >
                  {salvandoModo === modo.mode ? "Salvando…" : "Salvar com motivo"}
                </button>
              </div>
            ))}
          </div>
        </section>

        {modos.falha ? (
          <BandaDeFalha
            falha={modos.falha}
            testId={modos.falha.kind === "denied" || modos.falha.kind === "auth" ? "cli13-modos-negado" : "cli13-modos-erro"}
            referencia={alertaModos}
            aoRepetir={() => { focarNaFalha.current = true; void ler("modos"); }}
          />
        ) : null}
        {modos.desatualizada ? (
          <BandaDeFalha
            falha={modos.desatualizada}
            testId="cli13-modos-desatualizada"
            referencia={alertaModos}
            aoRepetir={() => { focarNaFalha.current = true; void ler("modos"); }}
          />
        ) : null}
        {modos.carregando && !modos.concluiu ? <p role="status">Carregando a configuração dos modos…</p> : null}

        <section className={styles.queue} aria-labelledby="cli13-fila-title" aria-busy={pedidos.carregando} data-testid="cli13-fila">
          <div className={styles.queueHeader}>
            <div>
              <span className={styles.sectionLabel}>FILA REAL</span>
              <h2 id="cli13-fila-title">Solicitações</h2>
            </div>
            <div className={styles.queueActions}>
              {pedidos.hora ? (
                <span className={styles.readStamp} data-testid="cli13-fila-hora">
                  Última leitura concluída às {pedidos.hora}
                </span>
              ) : null}
              <button
                type="button"
                disabled={pedidos.carregando}
                aria-busy={pedidos.carregando}
                onClick={() => { focarNaFalha.current = true; void ler("fila"); }}
              >
                {pedidos.carregando ? "Atualizando…" : "Atualizar"}
              </button>
            </div>
          </div>

          {pedidos.falha ? (
            <BandaDeFalha
              falha={pedidos.falha}
              testId={pedidos.falha.kind === "denied" || pedidos.falha.kind === "auth" ? "cli13-fila-negado" : "cli13-fila-erro"}
              referencia={alertaFila}
              aoRepetir={() => { focarNaFalha.current = true; void ler("fila"); }}
            />
          ) : null}

          {pedidos.desatualizada ? (
            <BandaDeFalha
              falha={{
                ...pedidos.desatualizada,
                detail: `${pedidos.desatualizada.detail} Os pedidos abaixo são da última leitura concluída${pedidos.hora ? `, às ${pedidos.hora}` : ""}, e podem estar desatualizados.`,
              }}
              testId="cli13-fila-desatualizada"
              referencia={alertaFila}
              aoRepetir={() => { focarNaFalha.current = true; void ler("fila"); }}
            />
          ) : null}

          {pedidos.carregando && !pedidos.concluiu ? <p role="status">Carregando a fila de pedidos…</p> : null}

          {estaVazia(pedidos) ? (
            <p className={styles.emptyState} data-testid="cli13-fila-vazia">Nenhum pedido registrado.</p>
          ) : null}

          {pedidos.itens.length ? (
            <div className={styles.demoRequestList} data-testid="cli13-fila-lista">
              {pedidos.itens.map(item => (
                <article className={styles.demoRequest} key={item.id} data-testid="cli13-pedido" aria-busy={decidindo === item.id}>
                  <div>
                    <strong>{item.protocol}</strong>
                    <p>{item.requested_name} · {item.requested_email}</p>
                    <p>
                      Modo: {rotuloModo(item.mode)} · conta: {item.client_account_id ?? "não informada"}
                    </p>
                    <p>
                      Documento: {item.document_ref ?? "não informado"} · vínculo:{" "}
                      {item.verified_link ? "verificado no servidor" : "não verificado"}
                    </p>
                  </div>
                  <span className={styles.demoRequestStatus}>{rotuloStatus(item.status)}</span>
                  {podeDecidir(item) ? (
                    <div className={styles.decisionGrid}>
                      <button
                        type="button"
                        className={styles.decisionButton}
                        disabled={decidindo === item.id}
                        onClick={() => void decidir(item, "aprovada")}
                      >
                        Aprovar e emitir convite
                      </button>
                      <button
                        type="button"
                        className={styles.decisionButton}
                        disabled={decidindo === item.id}
                        onClick={() => void decidir(item, "rejeitada")}
                      >
                        Rejeitar com motivo
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <footer className={styles.footer}>
          <span>
            Leitura e decisão ficam registradas pelo servidor. Superfície administrativa em validação: produção
            NO-GO e sem aceite humano (0/222).
          </span>
          <Link href="/admin/portal">Voltar à configuração do portal</Link>
        </footer>
      </section>
    </div>
  );
}

// F01: acesso restrito a TI/admin; demais papéis recebem o 403 claro do gate.
export default function PortalAccessRequestsPage() {
  return (
    <AdminGate allowedRoles={["ti", "admin"]}>
      <PortalAccessRequestsPageContent />
    </AdminGate>
  );
}
