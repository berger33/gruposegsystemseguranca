"use client";

// UX-07 (fatia C — Contratos) — lista da carteira contratual.
//
// Reescrita de APRESENTAÇÃO. Nenhuma URL, método, corpo ou regra mudou:
// continua lendo `/api/crm/companies?type=client`,
// `/api/crm/proposals?status=aceita&limit=100` e `/api/crm/contracts`, e
// continua criando contrato por `POST /api/crm/contracts` com `source`
// `proposal` ou `manual` e a mesma `request_key` idempotente.
//
// O que muda:
//  - as três leituras deixam de ser um `Promise.all` único: cada uma tem o seu
//    estado próprio, e a falha de uma não apaga as outras duas nem vira lista
//    vazia;
//  - o código cru do servidor some da tela, substituído pelo vocabulário de
//    `contract-vocabulary.mjs` (o código canônico continua visível no rodapé);
//  - zero `style` inline: tudo em `UiWorkspace.module.css`;
//  - situação e origem do contrato aparecem em português, com `UiBadge`.
//
// Os títulos "Contratos e implantação" e "Cadastro manual identificado" são
// contrato do gate herdado `tests/l05-delivery.integration.test.mjs` e foram
// preservados exatamente.

import { FormEvent, useCallback, useEffect, useState } from "react";
import UiBadge from "../../../components/ui/UiBadge";
import UiState from "../../../components/ui/UiState";
import styles from "../../../components/ui/UiWorkspace.module.css";
import { contractRequest, type ContractErrorDescriptor } from "../../../lib/contract-request";
import {
  brl,
  contractErrorFootnote,
  contractOriginLabel,
  contractStatusLabel,
  contractStatusTone,
  shortDate,
} from "../../../lib/contract-vocabulary.mjs";

type Company = { id: string; display_name: string; city?: string | null };
type Proposal = { id: string; title: string; version: number; company_id: string; total_price: string };
type Contract = {
  id: string;
  title: string;
  status: string;
  origin: string;
  company_name?: string;
  starts_on?: string | null;
  total_price: string;
};

type Leitura<T> = { itens: T[]; carregando: boolean; erro: ContractErrorDescriptor | null };

const leituraInicial = <T,>(): Leitura<T> => ({ itens: [], carregando: true, erro: null });
const today = () => new Date().toISOString().slice(0, 10);

export default function ContractWorkspace() {
  const [empresas, setEmpresas] = useState<Leitura<Company>>(leituraInicial);
  const [propostas, setPropostas] = useState<Leitura<Proposal>>(leituraInicial);
  const [contratos, setContratos] = useState<Leitura<Contract>>(leituraInicial);
  const [aviso, setAviso] = useState("");
  const [falhaEnvio, setFalhaEnvio] = useState<ContractErrorDescriptor | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [manual, setManual] = useState({
    company_id: "", title: "", service_summary: "", starts_on: today(),
    ends_on: "", total_cost: "0", total_price: "0", origin_details: "",
  });
  const [proposalId, setProposalId] = useState("");

  const carregarEmpresas = useCallback(async () => {
    setEmpresas(atual => ({ ...atual, carregando: true, erro: null }));
    const resultado = await contractRequest<{ companies?: Company[] }>("/api/crm/companies?type=client");
    setEmpresas(resultado.ok
      ? { itens: resultado.data.companies || [], carregando: false, erro: null }
      : { itens: [], carregando: false, erro: resultado.error });
  }, []);

  const carregarPropostas = useCallback(async () => {
    setPropostas(atual => ({ ...atual, carregando: true, erro: null }));
    const resultado = await contractRequest<{ proposals?: Proposal[] }>("/api/crm/proposals?status=aceita&limit=100");
    setPropostas(resultado.ok
      ? { itens: resultado.data.proposals || [], carregando: false, erro: null }
      : { itens: [], carregando: false, erro: resultado.error });
  }, []);

  const carregarContratos = useCallback(async () => {
    setContratos(atual => ({ ...atual, carregando: true, erro: null }));
    const resultado = await contractRequest<{ contracts?: Contract[] }>("/api/crm/contracts");
    setContratos(resultado.ok
      ? { itens: resultado.data.contracts || [], carregando: false, erro: null }
      : { itens: [], carregando: false, erro: resultado.error });
  }, []);

  useEffect(() => {
    void carregarEmpresas();
    void carregarPropostas();
    void carregarContratos();
  }, [carregarEmpresas, carregarPropostas, carregarContratos]);

  async function criarManual(event: FormEvent) {
    event.preventDefault();
    setAviso(""); setFalhaEnvio(null); setEnviando(true);
    const resultado = await contractRequest<{ created?: boolean }>("/api/crm/contracts", {
      method: "POST",
      body: JSON.stringify({
        source: "manual", request_key: crypto.randomUUID(), company_id: manual.company_id,
        title: manual.title, service_summary: manual.service_summary, starts_on: manual.starts_on,
        ends_on: manual.ends_on || null, total_cost: Number(manual.total_cost),
        total_price: Number(manual.total_price), origin_details: manual.origin_details,
      }),
    });
    setEnviando(false);
    if (!resultado.ok) { setFalhaEnvio(resultado.error); return; }
    setAviso(`Contrato manual ${resultado.data.created ? "registrado" : "já existente"}. Ele começa em rascunho; assinatura e ativação operacional são etapas separadas.`);
    setManual({ company_id: "", title: "", service_summary: "", starts_on: today(), ends_on: "", total_cost: "0", total_price: "0", origin_details: "" });
    await carregarContratos();
  }

  async function criarDaProposta(event: FormEvent) {
    event.preventDefault();
    setAviso(""); setFalhaEnvio(null);
    const proposta = propostas.itens.find(item => item.id === proposalId);
    if (!proposta) { setAviso("Selecione uma proposta aceita."); return; }
    setEnviando(true);
    const resultado = await contractRequest<{ created?: boolean }>("/api/crm/contracts", {
      method: "POST",
      body: JSON.stringify({ source: "proposal", proposal_id: proposta.id, proposal_version: proposta.version }),
    });
    setEnviando(false);
    if (!resultado.ok) { setFalhaEnvio(resultado.error); return; }
    setAviso(`Contrato da proposta ${resultado.data.created ? "criado" : "já existente"}; repetição não cria uma segunda implantação.`);
    await carregarContratos();
  }

  return (
    <main className={styles.workspace} data-testid="contracts-workspace">
      <nav aria-label="Navegação comercial" className={styles.breadcrumbNav}>
        <a href="/admin/comercial">Comercial</a> · <a href="/admin/crm">Empresas e funil</a>
      </nav>

      <h1>Contratos e implantação</h1>
      <p className={styles.lede}>
        Área contratual canônica. Contrato comercial não é cobrança, pagamento,
        assinatura externa nem e-mail entregue. Cada leitura abaixo é
        independente: se uma falhar, as outras continuam valendo e a falha é
        declarada — nunca apresentada como lista vazia.
      </p>

      {aviso ? <p role="status" data-testid="contracts-notice" className={`${styles.notice} ${styles.noticeInfo}`}>{aviso}</p> : null}
      {falhaEnvio ? (
        <div data-testid="contracts-write-error" className={`${styles.notice} ${styles.noticeError}`} role="alert">
          <strong>{falhaEnvio.title}.</strong> {falhaEnvio.detail}
          <span className={styles.footnote}>{contractErrorFootnote(falhaEnvio)}</span>
        </div>
      ) : null}

      <section aria-labelledby="proposal-contract-title" className={styles.panel} data-testid="contracts-from-proposal">
        <h2 id="proposal-contract-title" className={styles.panelTitle}>Criar a partir de proposta aceita</h2>
        <p className={styles.hint}>
          Escolha uma proposta aceita e sua versão preservada. A operação é
          idempotente: repetir não cria um segundo contrato.
        </p>
        {propostas.carregando ? (
          <UiState variant="loading" title="Lendo propostas aceitas…" detail="Buscando as propostas aceitas da sua carteira." />
        ) : propostas.erro ? (
          <UiState
            variant={propostas.erro.kind === "denied" || propostas.erro.kind === "auth" ? "denied" : "error"}
            title={propostas.erro.title}
            detail={`${propostas.erro.detail} ${contractErrorFootnote(propostas.erro)}`}
            retryLabel={propostas.erro.canRetry ? "Tentar ler de novo" : undefined}
            onRetry={propostas.erro.canRetry ? () => void carregarPropostas() : undefined}
          />
        ) : propostas.itens.length === 0 ? (
          <UiState variant="empty" title="Nenhuma proposta aceita disponível para sua carteira" detail="A leitura funcionou e não há proposta aceita aguardando virar contrato." />
        ) : (
          <form onSubmit={criarDaProposta} className={styles.fieldset}>
            <div className={styles.field}>
              <label htmlFor="contract-proposal">Proposta aceita <span className={styles.required}>(obrigatório)</span></label>
              <select
                id="contract-proposal" aria-label="Proposta aceita" required
                value={proposalId} onChange={event => setProposalId(event.target.value)}
              >
                <option value="">Selecione</option>
                {propostas.itens.map(proposta => (
                  <option value={proposta.id} key={proposta.id}>
                    {proposta.title} · versão {proposta.version} · {brl(proposta.total_price)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={enviando}>Criar contrato</button>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="manual-contract-title" className={styles.panel} data-testid="contracts-manual">
        <h2 id="manual-contract-title" className={styles.panelTitle}>Cadastro manual identificado</h2>
        <p className={styles.hint}>
          Não cria proposta fictícia. Informe a origem real e o motivo do registro.
        </p>
        {empresas.erro ? (
          <UiState
            variant={empresas.erro.kind === "denied" || empresas.erro.kind === "auth" ? "denied" : "error"}
            title={empresas.erro.title}
            detail={`${empresas.erro.detail} ${contractErrorFootnote(empresas.erro)}`}
            retryLabel={empresas.erro.canRetry ? "Tentar ler de novo" : undefined}
            onRetry={empresas.erro.canRetry ? () => void carregarEmpresas() : undefined}
          />
        ) : null}
        <form onSubmit={criarManual} className={styles.fieldset}>
          <div className={styles.field}>
            <label htmlFor="contract-company">Empresa cliente <span className={styles.required}>(obrigatório)</span></label>
            <select
              id="contract-company" aria-label="Empresa cliente" required
              value={manual.company_id} onChange={event => setManual({ ...manual, company_id: event.target.value })}
            >
              <option value="">{empresas.carregando ? "Lendo empresas…" : "Selecione a empresa"}</option>
              {empresas.itens.map(empresa => (
                <option value={empresa.id} key={empresa.id}>
                  {empresa.display_name}{empresa.city ? ` — ${empresa.city}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="contract-title">Título <span className={styles.required}>(obrigatório)</span></label>
            <input
              id="contract-title" aria-label="Título do contrato" required maxLength={200}
              value={manual.title} onChange={event => setManual({ ...manual, title: event.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="contract-scope">Serviço ou escopo <span className={styles.required}>(obrigatório)</span></label>
            <textarea
              id="contract-scope" aria-label="Serviço ou escopo" required maxLength={2000}
              value={manual.service_summary} onChange={event => setManual({ ...manual, service_summary: event.target.value })}
            />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="contract-starts">Início <span className={styles.required}>(obrigatório)</span></label>
              <input
                id="contract-starts" aria-label="Início" type="date" required
                value={manual.starts_on} onChange={event => setManual({ ...manual, starts_on: event.target.value })}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="contract-ends">Fim (se houver)</label>
              <input
                id="contract-ends" aria-label="Fim" type="date"
                value={manual.ends_on} onChange={event => setManual({ ...manual, ends_on: event.target.value })}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="contract-price">Preço estimado</label>
              <input
                id="contract-price" aria-label="Preço estimado" type="number" min="0" step="0.01"
                value={manual.total_price} onChange={event => setManual({ ...manual, total_price: event.target.value })}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="contract-origin">Origem e motivo do cadastro <span className={styles.required}>(obrigatório)</span></label>
            <textarea
              id="contract-origin" aria-label="Origem e motivo" required minLength={10} maxLength={500}
              value={manual.origin_details} onChange={event => setManual({ ...manual, origin_details: event.target.value })}
            />
            <span className={styles.hint}>Mínimo de 10 caracteres. O servidor recusa origem genérica.</span>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={enviando}>Registrar contrato manual</button>
          </div>
        </form>
      </section>

      <section aria-labelledby="contracts-title" className={styles.panel} data-testid="contracts-list">
        <h2 id="contracts-title" className={styles.panelTitle}>Contratos da carteira</h2>
        {contratos.carregando ? (
          <UiState variant="loading" title="Lendo contratos…" detail="Buscando os contratos acessíveis à sua carteira." />
        ) : contratos.erro ? (
          <UiState
            variant={contratos.erro.kind === "denied" || contratos.erro.kind === "auth" ? "denied" : "error"}
            title={contratos.erro.title}
            detail={`${contratos.erro.detail} ${contractErrorFootnote(contratos.erro)}`}
            retryLabel={contratos.erro.canRetry ? "Tentar ler de novo" : undefined}
            onRetry={contratos.erro.canRetry ? () => void carregarContratos() : undefined}
          />
        ) : contratos.itens.length === 0 ? (
          <UiState variant="empty" title="Nenhum contrato acessível" detail="A leitura funcionou e nenhum contrato está na sua carteira." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="contracts-table">
              <caption className={styles.visuallyHidden}>Contratos acessíveis à sua carteira</caption>
              <thead>
                <tr>
                  <th scope="col">Contrato</th>
                  <th scope="col">Empresa</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Origem</th>
                  <th scope="col">Início</th>
                  <th scope="col">Preço</th>
                  <th scope="col">Abrir</th>
                </tr>
              </thead>
              <tbody>
                {contratos.itens.map(contrato => (
                  <tr key={contrato.id} data-testid={`contract-row-${contrato.id}`}>
                    <th scope="row">{contrato.title}</th>
                    <td>{contrato.company_name || "Empresa não informada"}</td>
                    <td>
                      <UiBadge tone={contractStatusTone(contrato.status)} srPrefix="Situação do contrato">
                        {contractStatusLabel(contrato.status)}
                      </UiBadge>
                    </td>
                    <td>{contractOriginLabel(contrato.origin)}</td>
                    <td>{shortDate(contrato.starts_on)}</td>
                    <td>{brl(contrato.total_price)}</td>
                    <td><a href={`/admin/contratos/${contrato.id}`}>Abrir composição e implantação</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
