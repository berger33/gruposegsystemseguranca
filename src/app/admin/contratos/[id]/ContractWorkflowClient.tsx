"use client";

// UX-07 (fatia C — Contratos) — ciclo de vida, composição, alertas,
// obrigações, implantação, fiscalização, diário e encerramento de UM contrato.
//
// Reescrita de APRESENTAÇÃO. Nenhuma URL, método, corpo ou regra mudou: todos
// os formulários continuam chamando exatamente os mesmos
// `/api/crm/contracts/<id>/...` com os mesmos payloads.
//
// O defeito corrigido aqui é o mais grave da família: as oito leituras da
// tela ficavam num único `Promise.all` dentro de um `try/catch`. Bastava UMA
// falhar — por exemplo o diário de gestão, restrito por permissão — para
// `data` ficar nulo e a página inteira virar "Contrato indisponível",
// descartando as sete leituras que haviam funcionado. Agora cada recurso tem
// estado próprio (`Promise.allSettled`): o que leu, mostra; o que falhou,
// declara a falha com o código canônico e oferece repetir.
//
// Também: seis abas com `tablist`/`tab`/`tabpanel` reais (roving tabindex,
// ←/→/Home/End), zero `style` inline e vocabulário em português em toda
// situação exibida.

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import UiBadge from "../../../../components/ui/UiBadge";
import UiState from "../../../../components/ui/UiState";
import styles from "../../../../components/ui/UiWorkspace.module.css";
import { contractRequest, type ContractErrorDescriptor } from "../../../../lib/contract-request";
import {
  alertStatusLabel,
  alertStatusTone,
  alertTypeLabel,
  closureStatusLabel,
  closureStatusTone,
  closureStepLabel,
  closureStepStatusLabel,
  closureStepStatusTone,
  contractErrorFootnote,
  contractOriginLabel,
  contractStatusLabel,
  contractStatusTone,
  diaryCategoryLabel,
  dossierStatusLabel,
  dossierStatusTone,
  implantationStepLabel,
  obligationCategoryLabel,
  obligationPeriodicityLabel,
  obligationStatusLabel,
  obligationStatusTone,
  shortDate,
  stepStatusLabel,
  stepStatusTone,
} from "../../../../lib/contract-vocabulary.mjs";

type Props = { id: string };

type Recurso<T> = { dado: T | null; carregando: boolean; erro: ContractErrorDescriptor | null };
const recursoInicial = <T,>(): Recurso<T> => ({ dado: null, carregando: true, erro: null });

type Qualquer = Record<string, any>;

const ABAS = [
  { id: "ciclo", rotulo: "Ciclo de vida", titulo: "Ciclo de vida (CON-03)" },
  { id: "composicao", rotulo: "Composição", titulo: "Composição (CON-01 e CON-02)" },
  { id: "alertas", rotulo: "Alertas e obrigações", titulo: "Alertas e obrigações (CON-05 e CON-06)" },
  { id: "implantacao", rotulo: "Implantação", titulo: "Implantação e bloqueios (CON-07 e CON-08)" },
  { id: "fiscalizacao", rotulo: "Fiscalização e decisões", titulo: "Fiscalização e decisões (CON-10 e CON-11)" },
  { id: "encerramento", rotulo: "Encerramento", titulo: "Encerramento (CON-09)" },
] as const;
type AbaId = (typeof ABAS)[number]["id"];

const today = () => new Date().toISOString().slice(0, 10);

function Falha({ erro, aoRepetir, testId }: { erro: ContractErrorDescriptor; aoRepetir?: () => void; testId: string }) {
  const negado = erro.kind === "denied" || erro.kind === "auth";
  return (
    <div data-testid={testId}>
      <UiState
        variant={negado ? "denied" : "error"}
        title={erro.title}
        detail={`${erro.detail} ${contractErrorFootnote(erro)}`}
        retryLabel={erro.canRetry && aoRepetir ? "Tentar ler de novo" : undefined}
        onRetry={erro.canRetry && aoRepetir ? aoRepetir : undefined}
      />
    </div>
  );
}

export default function ContractWorkflowClient({ id }: Props) {
  const [detalhe, setDetalhe] = useState<Recurso<Qualquer>>(recursoInicial);
  const [situacao, setSituacao] = useState<Recurso<Qualquer>>(recursoInicial);
  const [implantacao, setImplantacao] = useState<Recurso<Qualquer>>(recursoInicial);
  const [alertas, setAlertas] = useState<Recurso<Qualquer>>(recursoInicial);
  const [obrigacoes, setObrigacoes] = useState<Recurso<Qualquer>>(recursoInicial);
  const [encerramento, setEncerramento] = useState<Recurso<Qualquer>>(recursoInicial);
  const [fiscal, setFiscal] = useState<Recurso<Qualquer>>(recursoInicial);
  const [diario, setDiario] = useState<Recurso<Qualquer>>(recursoInicial);

  const [aviso, setAviso] = useState("");
  const [falhaEnvio, setFalhaEnvio] = useState<ContractErrorDescriptor | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aba, setAba] = useState<AbaId>("ciclo");
  const refsAba = useRef<Record<string, HTMLButtonElement | null>>({});

  /** Uma leitura independente: o que falha aqui não apaga as outras sete. */
  const ler = useCallback(
    async (caminho: string, aplicar: (estado: Recurso<Qualquer>) => void) => {
      aplicar({ dado: null, carregando: true, erro: null });
      const resultado = await contractRequest<Qualquer>(`/api/crm/contracts/${id}${caminho}`);
      aplicar(resultado.ok
        ? { dado: resultado.data, carregando: false, erro: null }
        : { dado: null, carregando: false, erro: resultado.error });
    },
    [id],
  );

  const lerDetalhe = useCallback(() => ler("", setDetalhe), [ler]);
  const lerSituacao = useCallback(() => ler("/status", setSituacao), [ler]);
  const lerImplantacao = useCallback(() => ler("/implantation", setImplantacao), [ler]);
  const lerAlertas = useCallback(() => ler("/alert-rules", setAlertas), [ler]);
  const lerObrigacoes = useCallback(() => ler("/document-obligations", setObrigacoes), [ler]);
  const lerEncerramento = useCallback(() => ler("/closure", setEncerramento), [ler]);
  const lerFiscal = useCallback(() => ler("/fiscal", setFiscal), [ler]);
  const lerDiario = useCallback(() => ler("/management-diary", setDiario), [ler]);

  const lerTudo = useCallback(async () => {
    await Promise.allSettled([
      lerDetalhe(), lerSituacao(), lerImplantacao(), lerAlertas(),
      lerObrigacoes(), lerEncerramento(), lerFiscal(), lerDiario(),
    ]);
  }, [lerDetalhe, lerSituacao, lerImplantacao, lerAlertas, lerObrigacoes, lerEncerramento, lerFiscal, lerDiario]);

  useEffect(() => { void lerTudo(); }, [lerTudo]);

  /** Mesma URL, método e payload de antes; só o tratamento da falha mudou. */
  async function enviar(
    event: FormEvent<HTMLFormElement>,
    caminho: string,
    método: string,
    montar: (form: HTMLFormElement) => object,
    depois: () => Promise<void> | void,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    setOcupado(true); setAviso(""); setFalhaEnvio(null);
    const resultado = await contractRequest(`/api/crm/contracts/${id}${caminho}`, {
      method: método,
      body: JSON.stringify(montar(form)),
    });
    setOcupado(false);
    if (!resultado.ok) { setFalhaEnvio(resultado.error); return; }
    form.reset();
    setAviso("Registro gravado.");
    await depois();
  }

  function aoTeclarNaAba(event: KeyboardEvent<HTMLButtonElement>) {
    const indice = ABAS.findIndex(item => item.id === aba);
    let destino = indice;
    if (event.key === "ArrowRight") destino = (indice + 1) % ABAS.length;
    else if (event.key === "ArrowLeft") destino = (indice - 1 + ABAS.length) % ABAS.length;
    else if (event.key === "Home") destino = 0;
    else if (event.key === "End") destino = ABAS.length - 1;
    else return;
    event.preventDefault();
    const alvo = ABAS[destino].id;
    setAba(alvo);
    refsAba.current[alvo]?.focus();
  }

  const contrato = detalhe.dado?.contract as Qualquer | undefined;
  const lendoCabecalho = detalhe.carregando;

  return (
    <main className={styles.workspace} data-testid="contract-detail">
      <nav aria-label="Navegação contratual" className={styles.breadcrumbNav}>
        <a href="/admin/contratos">← Contratos</a>
      </nav>

      {lendoCabecalho ? (
        <UiState variant="loading" title="Lendo o contrato…" detail="Buscando dados do contrato e de cada frente de trabalho." />
      ) : detalhe.erro ? (
        <Falha erro={detalhe.erro} aoRepetir={() => void lerDetalhe()} testId="contract-detail-error" />
      ) : (
        <>
          <h1>{contrato?.title || "Contrato"}</h1>
          <p className={styles.lede}>
            <UiBadge tone={contractStatusTone(contrato?.status)} srPrefix="Situação do contrato">
              {contractStatusLabel(contrato?.status)}
            </UiBadge>{" "}
            · Origem: {contractOriginLabel(contrato?.origin)} · Vigência:{" "}
            {shortDate(contrato?.starts_on)} — {shortDate(contrato?.ends_on, "em aberto")}
          </p>
        </>
      )}

      {aviso ? <p role="status" data-testid="contract-notice" className={`${styles.notice} ${styles.noticeInfo}`}>{aviso}</p> : null}
      {falhaEnvio ? (
        <div data-testid="contract-write-error" className={`${styles.notice} ${styles.noticeError}`} role="alert">
          <strong>{falhaEnvio.title}.</strong> {falhaEnvio.detail}
          <span className={styles.footnote}>{contractErrorFootnote(falhaEnvio)}</span>
        </div>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Frentes do contrato">
        {ABAS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`con-aba-${item.id}`}
            aria-controls={`con-painel-${item.id}`}
            aria-selected={aba === item.id}
            tabIndex={aba === item.id ? 0 : -1}
            data-testid={`contract-tab-${item.id}`}
            ref={node => { refsAba.current[item.id] = node; }}
            className={aba === item.id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setAba(item.id)}
            onKeyDown={aoTeclarNaAba}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      {ABAS.filter(item => item.id === aba).map(item => (
        <section
          key={item.id}
          role="tabpanel"
          id={`con-painel-${item.id}`}
          aria-labelledby={`con-aba-${item.id}`}
          tabIndex={0}
          className={styles.tabPanel}
        >
          <h2 className={styles.panelTitle}>{item.titulo}</h2>

          {item.id === "ciclo" ? (
            <div className={styles.panel} data-testid="contract-lifecycle">
              <p className={styles.hint}>
                Assinatura é distinta da ativação operacional; ativar exige
                checklist concluído e bloqueios resolvidos — quem decide é o
                servidor.
              </p>
              {situacao.carregando ? (
                <UiState variant="loading" title="Lendo situação e histórico…" detail="Buscando as transições permitidas e o histórico imutável." />
              ) : situacao.erro ? (
                <Falha erro={situacao.erro} aoRepetir={() => void lerSituacao()} testId="contract-status-error" />
              ) : (
                <>
                  <form onSubmit={event => enviar(event, "/status", "POST", form => {
                    const dados = new FormData(form);
                    return {
                      next_status: (dados.get("next_status") || "").toString(),
                      effective_date: (dados.get("effective_date") || "").toString(),
                      reason: (dados.get("reason") || "").toString(),
                      signed_at: (dados.get("signed_at") || "").toString() || null,
                      signature_evidence: (dados.get("signature_evidence") || "").toString() || null,
                    };
                  }, async () => { await Promise.allSettled([lerSituacao(), lerDetalhe()]); })} className={styles.fieldset}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="status-next">Próxima situação <span className={styles.required}>(obrigatório)</span></label>
                        <select id="status-next" name="next_status" required data-testid="contract-next-status">
                          <option value="">Selecione</option>
                          {((situacao.dado?.allowed_transitions || []) as string[]).map(valor => (
                            <option key={valor} value={valor}>{contractStatusLabel(valor)}</option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="status-date">Data efetiva <span className={styles.required}>(obrigatório)</span></label>
                        <input id="status-date" name="effective_date" type="date" defaultValue={today()} required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="status-reason">Motivo <span className={styles.required}>(obrigatório)</span></label>
                        <input id="status-reason" name="reason" minLength={1} required />
                      </div>
                    </div>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="status-signed">Data de assinatura (se aplicável)</label>
                        <input id="status-signed" name="signed_at" type="date" />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="status-evidence">Evidência de assinatura</label>
                        <input id="status-evidence" name="signature_evidence" maxLength={500} />
                        <span className={styles.hint}>Qual é a prova real da assinatura. O servidor exige quando ativa.</span>
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={ocupado}>Registrar transição</button>
                    </div>
                  </form>

                  <h3 className={styles.panelTitle}>Histórico</h3>
                  {((situacao.dado?.history || []) as Qualquer[]).length === 0 ? (
                    <UiState variant="empty" title="Nenhuma transição registrada" detail="A leitura funcionou e este contrato ainda não mudou de situação." />
                  ) : (
                    <ul data-testid="contract-status-history">
                      {((situacao.dado?.history || []) as Qualquer[]).map(linha => (
                        <li key={linha.id} className={styles.dividedItem}>
                          {contractStatusLabel(linha.previous_status) === "—" ? "Início" : contractStatusLabel(linha.previous_status)}
                          {" → "}
                          <strong>{contractStatusLabel(linha.next_status)}</strong>
                          {" em "}{shortDate(linha.effective_date)}: {linha.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          ) : null}

          {item.id === "composicao" ? (
            <div className={styles.panel} data-testid="contract-composition">
              {detalhe.erro ? (
                <Falha erro={detalhe.erro} aoRepetir={() => void lerDetalhe()} testId="contract-composition-error" />
              ) : (
                <>
                  <dl className={styles.facts}>
                    <div><dt>Itens</dt><dd>{detalhe.dado?.items?.length ?? 0}</dd></div>
                    <div><dt>Unidades</dt><dd>{detalhe.dado?.units?.length ?? 0}</dd></div>
                    <div><dt>Responsáveis</dt><dd>{detalhe.dado?.responsibles?.length ?? 0}</dd></div>
                  </dl>

                  <form onSubmit={event => enviar(event, "/responsibles", "POST", form => {
                    const dados = new FormData(form);
                    return { responsible_name: dados.get("responsible_name"), role: dados.get("role"), is_primary: true };
                  }, lerDetalhe)} className={styles.fieldset}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="resp-name">Responsável <span className={styles.required}>(obrigatório)</span></label>
                        <input id="resp-name" name="responsible_name" required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="resp-role">Função <span className={styles.required}>(obrigatório)</span></label>
                        <input id="resp-role" name="role" required />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={ocupado}>Vincular responsável</button>
                    </div>
                  </form>

                  <form onSubmit={event => enviar(event, "/posts", "POST", form => {
                    const dados = new FormData(form);
                    return {
                      title: dados.get("title"), shift: dados.get("shift"),
                      quantity: Number(dados.get("quantity")),
                      schedule: { dias: ["seg", "ter", "qua", "qui", "sex"], inicio: "08:00", fim: "18:00" },
                      recurrence_type: "recorrente",
                    };
                  }, lerDetalhe)} className={styles.fieldset}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="post-title">Posto/turno <span className={styles.required}>(obrigatório)</span></label>
                        <input id="post-title" name="title" required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="post-shift">Turno</label>
                        <select id="post-shift" name="shift">
                          <option value="comercial">Comercial</option>
                          <option value="diurno">Diurno</option>
                          <option value="noturno">Noturno</option>
                          <option value="12x36_dia">12x36 diurno</option>
                          <option value="12x36_noite">12x36 noturno</option>
                          <option value="24x48">24x48</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="post-qty">Quantidade <span className={styles.required}>(obrigatório)</span></label>
                        <input id="post-qty" name="quantity" type="number" min="1" defaultValue="1" required />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={ocupado}>Adicionar posto</button>
                    </div>
                  </form>

                  <form onSubmit={event => enviar(event, "/sla", "POST", form => {
                    const dados = new FormData(form);
                    return {
                      service_type: dados.get("service_type"), description: dados.get("description"),
                      response_time_minutes: Number(dados.get("response")),
                      resolution_time_minutes: Number(dados.get("resolution")),
                    };
                  }, lerDetalhe)} className={styles.fieldset}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="sla-service">Serviço do SLA</label>
                        <select id="sla-service" name="service_type">
                          <option value="vigilancia">Vigilância</option>
                          <option value="portaria">Portaria</option>
                          <option value="limpeza">Limpeza</option>
                          <option value="monitoramento">Monitoramento</option>
                          <option value="manutencao">Manutenção</option>
                          <option value="atendimento">Atendimento</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="sla-desc">Descrição <span className={styles.required}>(obrigatório)</span></label>
                        <input id="sla-desc" name="description" required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="sla-response">Resposta (minutos) <span className={styles.required}>(obrigatório)</span></label>
                        <input id="sla-response" name="response" type="number" min="1" required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="sla-resolution">Resolução (minutos) <span className={styles.required}>(obrigatório)</span></label>
                        <input id="sla-resolution" name="resolution" type="number" min="1" required />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={ocupado}>Adicionar SLA</button>
                    </div>
                  </form>
                </>
              )}
            </div>
          ) : null}

          {item.id === "alertas" ? (
            <div className={styles.panel} data-testid="contract-alerts">
              <p className={styles.hint}>
                Alertas entram somente na caixa de saída local. Nada aqui
                representa e-mail ou mensagem efetivamente entregue.
              </p>

              {alertas.carregando ? (
                <UiState variant="loading" title="Lendo regras de alerta…" detail="Buscando as regras configuradas para este contrato." />
              ) : alertas.erro ? (
                <Falha erro={alertas.erro} aoRepetir={() => void lerAlertas()} testId="contract-alerts-error" />
              ) : (
                <>
                  <form onSubmit={event => enviar(event, "/alert-rules", "POST", form => {
                    const dados = new FormData(form);
                    return {
                      alert_type: dados.get("alert_type"), title: dados.get("title"),
                      days_before: Number(dados.get("days_before")), channel: "sistema",
                    };
                  }, lerAlertas)} className={styles.fieldset}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="alert-type">Tipo</label>
                        <select id="alert-type" name="alert_type">
                          <option value="vencimento">Vencimento</option>
                          <option value="renovacao">Renovação</option>
                          <option value="reajuste">Reajuste</option>
                          <option value="vigencia_fim">Fim de vigência</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="alert-title">Título <span className={styles.required}>(obrigatório)</span></label>
                        <input id="alert-title" name="title" required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="alert-days">Dias antes <span className={styles.required}>(obrigatório)</span></label>
                        <input id="alert-days" name="days_before" type="number" min="1" max="365" defaultValue="30" required />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={ocupado}>Configurar alerta</button>
                    </div>
                  </form>

                  {((alertas.dado?.rules || []) as Qualquer[]).length === 0 ? (
                    <UiState variant="empty" title="Nenhuma regra de alerta configurada" detail="A leitura funcionou e este contrato ainda não tem regra de alerta." />
                  ) : (
                    <ul data-testid="contract-alert-rules">
                      {((alertas.dado?.rules || []) as Qualquer[]).map(regra => (
                        <li key={regra.id} className={styles.dividedItem}>
                          <strong>{regra.title}</strong>{" "}
                          <UiBadge tone={alertStatusTone(regra.status)} srPrefix="Situação do alerta">
                            {alertStatusLabel(regra.status) === "—" ? alertTypeLabel(regra.alert_type) : alertStatusLabel(regra.status)}
                          </UiBadge>
                          <form onSubmit={event => enviar(event, `/alert-rules/${regra.id}/run`, "POST", form => ({
                            due_date: new FormData(form).get("due_date"),
                          }), lerAlertas)} className={styles.rowWrap}>
                            <div className={styles.field}>
                              <label htmlFor={`alert-due-${regra.id}`}>Data de vencimento <span className={styles.required}>(obrigatório)</span></label>
                              <input id={`alert-due-${regra.id}`} name="due_date" type="date" defaultValue={today()} required />
                            </div>
                            <button type="submit" disabled={ocupado}>Processar uma vez</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              <h3 className={styles.panelTitle}>Obrigações documentais (CON-06)</h3>
              {obrigacoes.carregando ? (
                <UiState variant="loading" title="Lendo obrigações documentais…" detail="Buscando certidões, licenças e comprovantes exigidos." />
              ) : obrigacoes.erro ? (
                <Falha erro={obrigacoes.erro} aoRepetir={() => void lerObrigacoes()} testId="contract-obligations-error" />
              ) : (
                <>
                  <form onSubmit={event => enviar(event, "/document-obligations", "POST", form => {
                    const dados = new FormData(form);
                    return {
                      title: dados.get("title"), category: dados.get("category"),
                      periodicity: dados.get("periodicity"), due_date: dados.get("due_date") || null,
                    };
                  }, lerObrigacoes)} className={styles.fieldset}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="obl-title">Obrigação documental <span className={styles.required}>(obrigatório)</span></label>
                        <input id="obl-title" name="title" required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="obl-category">Categoria</label>
                        <select id="obl-category" name="category">
                          <option value="certidao">Certidão</option>
                          <option value="licenca">Licença</option>
                          <option value="comprovante">Comprovante</option>
                          <option value="contrato">Contrato</option>
                          <option value="seguro">Seguro</option>
                          <option value="treinamento">Treinamento</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="obl-period">Periodicidade</label>
                        <select id="obl-period" name="periodicity">
                          <option value="unica">Única</option>
                          <option value="mensal">Mensal</option>
                          <option value="anual">Anual</option>
                          <option value="sob_demanda">Sob demanda</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="obl-due">Prazo</label>
                        <input id="obl-due" name="due_date" type="date" />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={ocupado}>Criar obrigação</button>
                    </div>
                  </form>

                  {((obrigacoes.dado?.obligations || []) as Qualquer[]).length === 0 ? (
                    <UiState variant="empty" title="Nenhuma obrigação documental registrada" detail="A leitura funcionou e este contrato ainda não tem obrigação cadastrada." />
                  ) : (
                    <ul data-testid="contract-obligations">
                      {((obrigacoes.dado?.obligations || []) as Qualquer[]).map(obrigacao => (
                        <li key={obrigacao.id} className={styles.dividedItem}>
                          <strong>{obrigacao.title}</strong> · {obligationCategoryLabel(obrigacao.category)} ·{" "}
                          {obligationPeriodicityLabel(obrigacao.periodicity)} · prazo {shortDate(obrigacao.due_date, "sem prazo")}{" "}
                          <UiBadge tone={obligationStatusTone(obrigacao.status)} srPrefix="Situação da obrigação">
                            {obligationStatusLabel(obrigacao.status)}
                          </UiBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          ) : null}

          {item.id === "implantacao" ? (
            <div className={styles.panel} data-testid="contract-implantation">
              <p className={styles.hint}>
                Dependências posteriores exigem base de verificação explícita.
                Nenhuma etapa é marcada como concluída automaticamente.
              </p>
              {implantacao.carregando ? (
                <UiState variant="loading" title="Lendo o checklist de implantação…" detail="Buscando etapas e bloqueios registrados." />
              ) : implantacao.erro ? (
                <Falha erro={implantacao.erro} aoRepetir={() => void lerImplantacao()} testId="contract-implantation-error" />
              ) : (
                <>
                  {((implantacao.dado?.steps || []) as Qualquer[]).length === 0 ? (
                    <UiState variant="empty" title="Checklist de implantação ainda não iniciado" detail="A leitura funcionou e nenhuma etapa foi criada para este contrato." />
                  ) : (
                    <ul data-testid="contract-implantation-steps">
                      {((implantacao.dado?.steps || []) as Qualquer[]).map(etapa => (
                        <li key={etapa.id} className={styles.dividedItem}>
                          <strong>{etapa.title || implantationStepLabel(etapa.step_id)}</strong>{" "}
                          <UiBadge tone={stepStatusTone(etapa.status)} srPrefix="Situação da etapa">
                            {stepStatusLabel(etapa.status)}
                          </UiBadge>
                          <form onSubmit={event => enviar(event, `/implantation/steps/${etapa.id}`, "PATCH", form => {
                            const dados = new FormData(form);
                            return { status: dados.get("status"), evidence_basis: dados.get("evidence_basis") };
                          }, lerImplantacao)} className={styles.rowWrap}>
                            <div className={styles.field}>
                              <label htmlFor={`step-status-${etapa.id}`}>Nova situação</label>
                              <select id={`step-status-${etapa.id}`} name="status" defaultValue={etapa.status}>
                                <option value="pendente">Pendente</option>
                                <option value="em_andamento">Em andamento</option>
                                <option value="concluido">Concluída</option>
                                <option value="nao_aplicavel">Não se aplica</option>
                                <option value="bloqueado">Bloqueada</option>
                              </select>
                            </div>
                            <div className={styles.field}>
                              <label htmlFor={`step-basis-${etapa.id}`}>Base real de verificação</label>
                              <input id={`step-basis-${etapa.id}`} name="evidence_basis" placeholder="Base real de verificação" maxLength={1000} />
                            </div>
                            <button type="submit" disabled={ocupado}>Atualizar</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form onSubmit={event => enviar(event, "/implantation/blocks", "POST", form => {
                    const dados = new FormData(form);
                    return {
                      block_type: dados.get("block_type"), title: dados.get("title"),
                      description: dados.get("description"),
                      is_legal_requirement: dados.get("is_legal_requirement") === "on",
                      is_blocking: true,
                    };
                  }, lerImplantacao)} className={styles.fieldset}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="block-type">Bloqueio</label>
                        <select id="block-type" name="block_type">
                          <option value="operacional">Operacional</option>
                          <option value="documentacao">Documentação</option>
                          <option value="treinamento">Treinamento</option>
                          <option value="equipamento">Equipamento</option>
                          <option value="legal">Exigência legal</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="block-title">Título <span className={styles.required}>(obrigatório)</span></label>
                        <input id="block-title" name="title" placeholder="Título" required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="block-desc">Descrição <span className={styles.required}>(obrigatório)</span></label>
                        <input id="block-desc" name="description" placeholder="Descrição" required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="block-legal">Exigência legal</label>
                        <input id="block-legal" name="is_legal_requirement" type="checkbox" />
                        <span className={styles.hint}>Exigência legal não é dispensada por caixa marcada: exige exceção autorizada.</span>
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={ocupado}>Registrar bloqueio</button>
                    </div>
                  </form>
                </>
              )}
            </div>
          ) : null}

          {item.id === "fiscalizacao" ? (
            <div className={styles.panel} data-testid="contract-fiscal">
              {fiscal.carregando ? (
                <UiState variant="loading" title="Lendo dossiês fiscais…" detail="Buscando dossiês, medições e evidências deste contrato." />
              ) : fiscal.erro ? (
                <Falha erro={fiscal.erro} aoRepetir={() => void lerFiscal()} testId="contract-fiscal-error" />
              ) : (
                <>
                  <form onSubmit={event => enviar(event, "/fiscal/dossiers", "POST", form => {
                    const dados = new FormData(form);
                    return { title: dados.get("title"), description: dados.get("description") || null };
                  }, lerFiscal)} className={styles.fieldset}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="dossier-title">Novo dossiê <span className={styles.required}>(obrigatório)</span></label>
                        <input id="dossier-title" name="title" required />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="dossier-desc">Descrição</label>
                        <input id="dossier-desc" name="description" placeholder="Descrição" />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={ocupado}>Criar dossiê</button>
                    </div>
                  </form>
                  {((fiscal.dado?.dossiers || []) as Qualquer[]).length === 0 ? (
                    <UiState variant="empty" title="Nenhum dossiê fiscal registrado" detail="A leitura funcionou e este contrato ainda não tem dossiê." />
                  ) : (
                    <ul data-testid="contract-dossiers">
                      {((fiscal.dado?.dossiers || []) as Qualquer[]).map(dossie => (
                        <li key={dossie.id} className={styles.dividedItem}>
                          <strong>{dossie.title}</strong>{" "}
                          <UiBadge tone={dossierStatusTone(dossie.status)} srPrefix="Situação do dossiê">
                            {dossierStatusLabel(dossie.status)}
                          </UiBadge>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              <h3 className={styles.panelTitle}>Diário de gestão (CON-11)</h3>
              {diario.carregando ? (
                <UiState variant="loading" title="Lendo o diário de gestão…" detail="Buscando as decisões registradas para este contrato." />
              ) : diario.erro ? (
                <Falha erro={diario.erro} aoRepetir={() => void lerDiario()} testId="contract-diary-error" />
              ) : (
                <>
                  <form onSubmit={event => enviar(event, "/management-diary", "POST", form => {
                    const dados = new FormData(form);
                    return {
                      title: dados.get("title"), decision: dados.get("decision"),
                      category: dados.get("category"), decision_date: dados.get("decision_date"), tags: [],
                    };
                  }, lerDiario)} className={styles.fieldset}>
                    <div className={styles.field}>
                      <label htmlFor="diary-title">Decisão de gestão <span className={styles.required}>(obrigatório)</span></label>
                      <input id="diary-title" name="title" required />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="diary-decision">O que foi decidido <span className={styles.required}>(obrigatório)</span></label>
                      <textarea
                        id="diary-decision" name="decision" minLength={10} required
                        placeholder="Não incluir senhas, tokens, prontuários ou dados sensíveis"
                      />
                      <span className={styles.hint}>O servidor recusa segredo, token e prontuário neste campo.</span>
                    </div>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="diary-category">Categoria</label>
                        <select id="diary-category" name="category">
                          <option value="decisao">Decisão</option>
                          <option value="risco">Risco</option>
                          <option value="negociacao">Negociação</option>
                          <option value="operacional">Operacional</option>
                          <option value="juridico">Jurídico</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="diary-date">Data da decisão <span className={styles.required}>(obrigatório)</span></label>
                        <input id="diary-date" name="decision_date" type="date" defaultValue={today()} required />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={ocupado}>Registrar decisão restrita</button>
                    </div>
                  </form>

                  {((diario.dado?.entries || []) as Qualquer[]).length === 0 ? (
                    <UiState variant="empty" title="Nenhuma decisão registrada no diário" detail="A leitura funcionou e este contrato ainda não tem decisão registrada." />
                  ) : (
                    <ul data-testid="contract-diary">
                      {((diario.dado?.entries || []) as Qualquer[]).map(registro => (
                        <li key={registro.id} className={styles.dividedItem}>
                          <strong>{registro.title}</strong> · {diaryCategoryLabel(registro.category)} · {shortDate(registro.decision_date)}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          ) : null}

          {item.id === "encerramento" ? (
            <div className={styles.panel} data-testid="contract-closure">
              {encerramento.carregando ? (
                <UiState variant="loading" title="Lendo o encerramento…" detail="Buscando o plano de encerramento e seu checklist." />
              ) : encerramento.erro ? (
                <Falha erro={encerramento.erro} aoRepetir={() => void lerEncerramento()} testId="contract-closure-error" />
              ) : encerramento.dado?.closure ? (
                <>
                  <p>
                    <UiBadge tone={closureStatusTone(encerramento.dado.closure.status)} srPrefix="Situação do encerramento">
                      {closureStatusLabel(encerramento.dado.closure.status)}
                    </UiBadge>
                  </p>
                  <ul data-testid="contract-closure-steps">
                    {((encerramento.dado?.steps || []) as Qualquer[]).map(etapa => (
                      <li key={etapa.id} className={styles.dividedItem}>
                        {etapa.title || closureStepLabel(etapa.step_type)}:{" "}
                        <UiBadge tone={closureStepStatusTone(etapa.status)} srPrefix="Situação da etapa">
                          {closureStepStatusLabel(etapa.status)}
                        </UiBadge>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <form onSubmit={event => enviar(event, "/closure", "POST", form => {
                  const dados = new FormData(form);
                  return {
                    closure_type: "encerramento", closure_date: dados.get("closure_date"),
                    effective_date: dados.get("effective_date"), reason: dados.get("reason"),
                  };
                }, lerEncerramento)} className={styles.fieldset}>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor="closure-date">Data <span className={styles.required}>(obrigatório)</span></label>
                      <input id="closure-date" name="closure_date" type="date" defaultValue={today()} required />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="closure-effective">Efeito <span className={styles.required}>(obrigatório)</span></label>
                      <input id="closure-effective" name="effective_date" type="date" defaultValue={today()} required />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="closure-reason">Motivo <span className={styles.required}>(obrigatório)</span></label>
                      <input id="closure-reason" name="reason" minLength={10} placeholder="Motivo" required />
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <button type="submit" className={styles.primary} disabled={ocupado}>Planejar encerramento</button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </section>
      ))}
    </main>
  );
}
