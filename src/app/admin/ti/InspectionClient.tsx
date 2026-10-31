"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import local from "./InspectionClient.module.css";

// UX-PRO-06 — Vistoria é a PRIMEIRA etapa de /admin/comercial e é uma superfície
// viva: lê `GET /api/crm/inspections?limit=50` e `GET /api/crm/inspection-templates`
// e escreve em `POST /api/crm/inspections`. Até esta fatia a leitura não tinha
// estado honesto: falha de checklist era engolida (a tela dizia "Templates (0)"),
// falha de vistoria aparecia como o código técnico do servidor, a primeira
// leitura pendente parecia lista vazia e resposta fora de ordem podia sobrescrever
// a leitura mais recente. O que muda aqui é só a LEITURA DE ESTADO: campos,
// ações, rota, método, corpo, papéis e o contrato do servidor continuam iguais.
// A autorização continua no servidor (sessão + mesma origem).

type Template = { id: string; service_id: string | null; name: string; description: string | null; checklist: any[]; };
type Inspection = { id: string; company_id: string; opportunity_id: string | null; service_id: string | null; title: string; status: string; responsible_name: string | null; scheduled_at: string | null; coverage: any; quantities: any; infrastructure: any; limitations: string | null; photos: any[]; };

type Falha = { classe: "negado" | "repetir" | "corrigir"; mensagem: string };

const FORM_VAZIO = { companyId: "", serviceId: "", title: "", templateId: "", responsible: "" };

function horaAgora(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function codigoDeErro(dados: any): string | null {
  return dados && typeof dados.error === "string" ? dados.error : null;
}

function ehFalha(valor: unknown): valor is Falha {
  return Boolean(valor) && typeof valor === "object"
    && "classe" in (valor as Record<string, unknown>)
    && "mensagem" in (valor as Record<string, unknown>);
}

/** Traduz a resposta da LEITURA sem expor o código técnico do servidor. */
function classificarFalhaVistoria(status: number | null, codigo: string | null, erroDeRede: boolean): Falha {
  if (erroDeRede) {
    return { classe: "repetir", mensagem: "Não foi possível falar com o servidor (falha de rede)." };
  }
  if (status === 401 || status === 403 || codigo === "admin_session_required" || codigo === "same_origin_required") {
    return {
      classe: "negado",
      mensagem:
        "Sua sessão não permite ler as vistorias agora: o servidor recusou a consulta por sessão ausente ou origem não confirmada. Repetir a mesma chamada não resolveria — entre novamente no painel e refaça a leitura.",
    };
  }
  if (status === 400 || codigo === "invalid_company_id" || codigo === "invalid_opportunity_id") {
    return {
      classe: "corrigir",
      mensagem: "O servidor recusou os parâmetros da consulta de vistorias. Recarregue a tela; se continuar, avise o TI com o horário.",
    };
  }
  if (codigo === "inspection_unavailable") {
    return { classe: "repetir", mensagem: "O servidor não conseguiu consultar as vistorias agora (serviço indisponível)." };
  }
  return {
    classe: "repetir",
    mensagem: `O servidor não conseguiu responder a consulta de vistorias agora${status ? ` (HTTP ${status})` : ""}.`,
  };
}

/** Traduz a resposta da ESCRITA. Nada aqui muda o que o servidor aceita. */
function classificarFalhaEscrita(status: number | null, codigo: string | null, erroDeRede: boolean): Falha {
  if (erroDeRede) {
    return { classe: "repetir", mensagem: "Não foi possível falar com o servidor (falha de rede); a vistoria não foi criada." };
  }
  if (status === 401 || status === 403 || codigo === "admin_session_required" || codigo === "same_origin_required") {
    return { classe: "negado", mensagem: "Sua sessão não permite criar vistorias (recusa por sessão ou origem). Nada foi criado." };
  }
  if (codigo === "invalid_company_id") {
    return { classe: "corrigir", mensagem: "O código da empresa não foi aceito: informe o UUID de uma empresa já cadastrada no CRM." };
  }
  if (codigo === "invalid_title") {
    return { classe: "corrigir", mensagem: "O título da vistoria não foi aceito: use de 1 a 200 caracteres." };
  }
  if (codigo === "invalid_request") {
    return { classe: "corrigir", mensagem: "O servidor não entendeu o pedido de criação. Confira os campos e envie de novo." };
  }
  if (codigo === "create_failed") {
    return { classe: "repetir", mensagem: "O servidor não conseguiu criar a vistoria agora (falha interna). Nada foi gravado." };
  }
  return {
    classe: "repetir",
    mensagem: `O servidor não conseguiu criar a vistoria agora${status ? ` (HTTP ${status})` : ""}.`,
  };
}

export default function InspectionClient() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [inspections, setInspections] = useState<Inspection[] | null>(null);
  const [horaInspections, setHoraInspections] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [carregandoTemplates, setCarregandoTemplates] = useState(true);
  const [falha, setFalha] = useState<Falha | null>(null);
  const [falhaTemplates, setFalhaTemplates] = useState<Falha | null>(null);
  const [atualizada, setAtualizada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [falhaEscrita, setFalhaEscrita] = useState<Falha | null>(null);
  const [criadaEm, setCriadaEm] = useState("");
  const [form, setForm] = useState(FORM_VAZIO);
  // Sequência própria de LEITURA: cada consulta reivindica um número e só a mais
  // recente publica resultado. Abrir/reler não deixa o estado preso, e uma
  // resposta atrasada não sobrescreve a leitura nova.
  const readSequence = useRef(0);
  const templateSequence = useRef(0);
  const inspectionsRef = useRef<Inspection[] | null>(null);

  const carregarTemplates = useCallback(async () => {
    const sequencia = ++templateSequence.current;
    setCarregandoTemplates(true);
    setFalhaTemplates(null);
    try {
      const resposta = await fetch("/api/crm/inspection-templates", { cache: "no-store" });
      const dados = await resposta.json().catch(() => null);
      if (sequencia !== templateSequence.current) return;
      if (!resposta.ok) throw classificarFalhaVistoria(resposta.status, codigoDeErro(dados), false);
      const lista: Template[] = Array.isArray(dados?.templates)
        ? dados.templates.filter((item: unknown): item is Template =>
            Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")
        : [];
      setTemplates(lista);
    } catch (erro) {
      if (sequencia !== templateSequence.current) return;
      const classificado: Falha = ehFalha(erro) ? erro : classificarFalhaVistoria(null, null, true);
      if (classificado.classe !== "repetir") setTemplates(null);
      setFalhaTemplates(classificado);
    } finally {
      if (sequencia === templateSequence.current) setCarregandoTemplates(false);
    }
  }, []);

  const carregarVistorias = useCallback(async () => {
    const sequencia = ++readSequence.current;
    const tinhaLeitura = inspectionsRef.current !== null;
    setCarregando(true);
    setFalha(null);
    setAtualizada(false);
    try {
      const resposta = await fetch("/api/crm/inspections?limit=50", { cache: "no-store" });
      const dados = await resposta.json().catch(() => null);
      if (sequencia !== readSequence.current) return;
      if (!resposta.ok) throw classificarFalhaVistoria(resposta.status, codigoDeErro(dados), false);
      const lista: Inspection[] = Array.isArray(dados?.inspections)
        ? dados.inspections.filter((item: unknown): item is Inspection =>
            Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")
        : [];
      inspectionsRef.current = lista;
      setInspections(lista);
      setHoraInspections(horaAgora());
      setAtualizada(tinhaLeitura);
    } catch (erro) {
      if (sequencia !== readSequence.current) return;
      const classificado: Falha = ehFalha(erro) ? erro : classificarFalhaVistoria(null, null, true);
      // Negativa e parâmetro recusado não podem manter dado de leitura anterior.
      if (classificado.classe !== "repetir") {
        inspectionsRef.current = null;
        setInspections(null);
        setHoraInspections("");
      }
      setFalha(classificado);
    } finally {
      if (sequencia === readSequence.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarTemplates();
    void carregarVistorias();
  }, [carregarTemplates, carregarVistorias]);

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setFalhaEscrita(null);
    setCriadaEm("");
    setSalvando(true);
    try {
      const resposta = await fetch("/api/crm/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: form.companyId,
          service_id: form.serviceId || null,
          title: form.title,
          template_id: form.templateId || null,
          responsible_name: form.responsible || null,
        }),
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) throw classificarFalhaEscrita(resposta.status, codigoDeErro(dados), false);
      setForm(FORM_VAZIO);
      setCriadaEm(`Vistoria criada às ${horaAgora()}.`);
      await carregarVistorias();
    } catch (erro) {
      setFalhaEscrita(ehFalha(erro) ? erro : classificarFalhaEscrita(null, null, true));
    } finally {
      setSalvando(false);
    }
  }

  const desatualizada = falha?.classe === "repetir" && inspections !== null;

  return (
    <section className={local.vistoria} aria-labelledby="vistoria-titulo">
      <h2 id="vistoria-titulo" className={local.vistoriaTitulo}>Vistorias — CRM-13 (checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações, responsável técnico)</h2>
      <p className={local.hint}>
        Tabelas crm_inspection_templates (id, service_id, name, checklist JSONB, version) + crm_inspections (company_id, opportunity_id, unit_id, template_id, service_id, title, status rascunho/em_andamento/concluida/cancelada, responsible_id/name, scheduled_at/completed_at, coverage JSONB, quantities JSONB, infrastructure JSONB, limitations 2000, photos JSONB com authorized flag, notes) + crm_inspection_answers (inspection_id, item_id, question, answer, quantity, observed, photo_ref). Checklist por serviço: seg_desarmada (cobertura área, turnos, qtd profissionais, infra energia, riscos, fotos autorizadas), cftv (qtd câmeras, cobertura, infra rede, armazenamento LGPD, acesso remoto, limitações, fotos), portaria (entradas, turnos, controle veículos, infra). Fotos autorizadas: photos array com file_name, authorized bool, description — somente fotos com authorized true consideradas válidas. Responsável técnico: responsible_id/name.
      </p>

      <div className={local.vistoriaEstados}>
        {carregando && inspections === null && (
          <p role="status" className={local.status} data-testid="vistoria-carregando">
            Carregando as vistorias registradas…
          </p>
        )}
        {carregando && inspections !== null && (
          <p role="status" className={local.status} data-testid="vistoria-atualizando">
            Atualizando as vistorias registradas…
          </p>
        )}
        {falha && desatualizada && (
          <div role="alert" className={local.aviso} data-testid="vistoria-desatualizada">
            <p><strong>Não foi possível atualizar as vistorias.</strong> {falha.mensagem}</p>
            <p>
              As vistorias abaixo são da última leitura concluída, às {horaInspections}, e podem estar desatualizadas.
              Isso não significa que não haja vistoria registrada.
            </p>
            <button type="button" className={local.botao} disabled={carregando} onClick={() => void carregarVistorias()}>
              Tentar novamente
            </button>
          </div>
        )}
        {falha && !desatualizada && falha.classe === "negado" && (
          <div role="alert" className={local.aviso} data-testid="vistoria-negado">
            <p>{falha.mensagem}</p>
          </div>
        )}
        {falha && !desatualizada && falha.classe !== "negado" && (
          <div role="alert" className={local.aviso} data-testid="vistoria-erro">
            <p>{falha.mensagem}</p>
            <p>Nenhuma vistoria foi lida nesta tentativa; isso não significa que a empresa não tenha vistorias.</p>
            {falha.classe === "repetir" && (
              <button type="button" className={local.botao} disabled={carregando} onClick={() => void carregarVistorias()}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
        {atualizada && !falha && !carregando && inspections !== null && (
          <p role="status" className={local.status} data-testid="vistoria-atualizado">
            Vistorias atualizadas às {horaInspections}.
          </p>
        )}
        {inspections !== null && !falha && inspections.length === 0 && (
          <p role="status" className={local.status} data-testid="vistoria-vazio">
            Nenhuma vistoria registrada até agora (leitura de {horaInspections}). Isso é ausência de registro, não falha
            de leitura.
          </p>
        )}
      </div>

      <form className={local.vistoriaForm} onSubmit={criar}>
        <div className={local.campoVistoria}>
          <label htmlFor="vistoria-empresa">Código da empresa (UUID)</label>
          <input
            id="vistoria-empresa"
            className={local.controle}
            aria-label="Código da empresa (UUID)"
            placeholder="company_id UUID (crm_companies)"
            value={form.companyId}
            onChange={e => setForm({ ...form, companyId: e.target.value })}
            required
          />
        </div>
        <div className={local.campoVistoria}>
          <label htmlFor="vistoria-servico">Serviço (opcional)</label>
          <input
            id="vistoria-servico"
            className={local.controle}
            aria-label="Serviço (opcional)"
            placeholder="service_id (ex: cftv)"
            value={form.serviceId}
            onChange={e => setForm({ ...form, serviceId: e.target.value })}
          />
        </div>
        <div className={local.campoVistoria}>
          <label htmlFor="vistoria-titulo-campo">Título da vistoria</label>
          <input
            id="vistoria-titulo-campo"
            className={local.controle}
            aria-label="Título da vistoria"
            placeholder="título vistoria"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            required
            maxLength={200}
          />
        </div>
        <div className={local.campoVistoria}>
          <label htmlFor="vistoria-template">Checklist (modelo)</label>
          <select
            id="vistoria-template"
            className={local.controle}
            aria-label="Checklist (modelo)"
            value={form.templateId}
            onChange={e => setForm({ ...form, templateId: e.target.value })}
          >
            <option value="">sem template</option>
            {(templates ?? []).map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.service_id || "geral"})</option>
            ))}
          </select>
        </div>
        <div className={local.campoVistoria}>
          <label htmlFor="vistoria-responsavel">Responsável técnico (opcional)</label>
          <input
            id="vistoria-responsavel"
            className={local.controle}
            aria-label="Responsável técnico (opcional)"
            placeholder="responsável técnico"
            value={form.responsible}
            onChange={e => setForm({ ...form, responsible: e.target.value })}
          />
        </div>
        <div className={local.campoVistoriaAcao}>
          <button type="submit" className={local.botao} disabled={salvando} aria-busy={salvando}>
            Criar vistoria
          </button>
          <button type="button" className={local.botao} onClick={() => void carregarVistorias()}>
            Recarregar
          </button>
        </div>
      </form>

      <div className={local.vistoriaEstados}>
        {salvando && (
          <p role="status" className={local.status} data-testid="vistoria-escrita-em-curso">Criando a vistoria…</p>
        )}
        {criadaEm && !falhaEscrita && (
          <p role="status" className={local.status} data-testid="vistoria-escrita-ok">{criadaEm}</p>
        )}
        {falhaEscrita && (
          <div role="alert" className={local.aviso} data-testid="vistoria-escrita-erro">
            <p>{falhaEscrita.mensagem}</p>
            {falhaEscrita.classe === "corrigir" && (
              <p>Corrija o campo indicado e envie de novo; nada foi criado.</p>
            )}
          </div>
        )}
      </div>

      <div className={local.vistoriaBloco}>
        <h3 className={local.vistoriaSubtitulo}>
          Templates{Array.isArray(templates) ? ` (${templates.length})` : ""}
        </h3>
        {carregandoTemplates && templates === null && (
          <p role="status" className={local.status} data-testid="vistoria-templates-carregando">
            Carregando os checklists por serviço…
          </p>
        )}
        {falhaTemplates && (
          <div role="alert" className={local.aviso} data-testid="vistoria-templates-erro">
            <p><strong>Não foi possível ler os checklists por serviço.</strong> {falhaTemplates.mensagem}</p>
            <p>
              {templates !== null
                ? `Os checklists abaixo são da última leitura concluída, às ${horaAgora()}, e podem estar desatualizados.`
                : "Isso não significa que não exista checklist cadastrado; criar vistoria sem checklist continua permitido."}
            </p>
            {falhaTemplates.classe === "repetir" && (
              <button type="button" className={local.botao} disabled={carregandoTemplates} onClick={() => void carregarTemplates()}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
        {templates !== null && templates.length === 0 && !falhaTemplates && (
          <p role="status" className={local.status} data-testid="vistoria-templates-vazio">
            Nenhum checklist ativo cadastrado. Criar vistoria sem checklist continua permitido.
          </p>
        )}
        {templates !== null && templates.length > 0 && (
          <div className={local.templates} data-testid="vistoria-templates-lista">
            {templates.map(t => (
              <article key={t.id} className={local.template}>
                <strong>{t.name}</strong> <span className={local.etiqueta}>{t.service_id || "geral"}</span>
                <p className={local.templateTexto}>{t.description}</p>
                <ul className={local.checklist}>
                  {(Array.isArray(t.checklist) ? t.checklist : []).map((item: any) => (
                    <li key={String(item?.id)}><strong>{item?.id}</strong>: {item?.question} [{item?.type}] {item?.required ? "*" : ""}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className={local.vistoriaBloco}>
        <h3 className={local.vistoriaSubtitulo}>
          Vistorias{Array.isArray(inspections) ? ` (${inspections.length})` : ""}
        </h3>
        {inspections !== null && inspections.length > 0 && (
          <div className={local.tabelaWrap} aria-busy={carregando} data-testid="vistoria-tabela">
            <table className={local.tabela}>
              <caption className={local.tabelaTitulo}>
                Vistorias registradas (leitura de {horaInspections}{carregando ? "; atualizando" : ""})
              </caption>
              <thead>
                <tr>
                  <th scope="col">Título</th>
                  <th scope="col">Serviço</th>
                  <th scope="col">Status</th>
                  <th scope="col">Responsável</th>
                  <th scope="col">Cobertura</th>
                  <th scope="col">Quantidades</th>
                  <th scope="col">Infra</th>
                  <th scope="col">Limitações</th>
                  <th scope="col">Fotos autorizadas</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map(ins => (
                  <tr key={ins.id}>
                    <td>{ins.title}</td>
                    <td>{ins.service_id || "-"}</td>
                    <td>{ins.status}</td>
                    <td>{ins.responsible_name || "-"}</td>
                    <td><code className={local.celulaCodigo}>{JSON.stringify(ins.coverage)}</code></td>
                    <td><code className={local.celulaCodigo}>{JSON.stringify(ins.quantities)}</code></td>
                    <td><code className={local.celulaCodigo}>{JSON.stringify(ins.infrastructure)}</code></td>
                    <td>{ins.limitations || "-"}</td>
                    <td>
                      {Array.isArray(ins.photos)
                        ? ins.photos.filter((p: any) => p?.authorized).length + "/" + ins.photos.length + " autorizadas"
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
