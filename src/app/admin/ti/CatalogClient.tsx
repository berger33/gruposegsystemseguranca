"use client";

import { useEffect, useState } from "react";
import UiState from "@/components/ui/UiState";
import styles from "@/components/ui/CommercialCatalog.module.css";

type Service = {
  id: string; name: string; short?: string; description?: string; audience?: string; questions?: string[];
  isPublished: boolean; isValidated: boolean; validationNote?: string; serviceType?: string; billingUnit?: string;
  scope?: string; exclusions?: string; resources?: string; validityDays?: number; approvalStatus?: string;
  isRecurring?: boolean; version?: number; cost?: number | null; price?: number | null; currency?: string;
};
type CatalogResponse = { services?: Service[]; total?: number; source?: "database" | "fallback" | string };
const typeOptions = ["recorrente", "avulso", "instalacao", "manutencao", "venda", "locacao", "comodato", "outro"];
const typeLabels: Record<string,string> = { recorrente: "Recorrente", avulso: "Avulso", instalacao: "Instalação", manutencao: "Manutenção", venda: "Venda", locacao: "Locação", comodato: "Comodato", outro: "Outro" };
const dash = (value: unknown) => value == null || value === "" ? "Não informado" : String(value);
const currency = (value: number | null | undefined, code = "BRL") => {
  if (value == null || !Number.isFinite(Number(value))) return "Não informado";
  try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: /^[A-Z]{3}$/.test(code) ? code : "BRL" }).format(value); }
  catch { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }
};
const statusLabel = (value: string | undefined) => value ? ({ aprovado: "Aprovado", rascunho: "Rascunho", em_revisao: "Em revisão", arquivado: "Arquivado" }[value] || value) : "Não informado";

export default function CatalogClient() {
  const [services, setServices] = useState<Service[]>([]); const [total, setTotal] = useState<number | null>(null);
  const [source, setSource] = useState(""); const [loading, setLoading] = useState(false); const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""); const [filterType, setFilterType] = useState("");
  async function load() {
    setLoading(true); setLoaded(false); setError("");
    try {
      const params = new URLSearchParams(); params.set("includeUnpublished", "false"); if (filterType) params.set("serviceType", filterType);
      const res = await fetch(`/api/catalog?${params.toString()}`, { cache: "no-store" }); const data: CatalogResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível consultar o catálogo.");
      setServices(Array.isArray(data.services) ? data.services : []); setTotal(typeof data.total === "number" ? data.total : null); setSource(data.source || ""); setLoaded(true);
    } catch (e) { setServices([]); setTotal(null); setSource(""); setError(e instanceof Error && e.message ? e.message : "Não foi possível consultar o catálogo. Tente novamente."); setLoaded(false); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [filterType]);
  const sourceLabel = source === "fallback" ? "Catálogo de demonstração local" : source === "database" ? "Catálogo cadastrado" : "Origem ainda não informada";
  return <section className={styles.workspace} aria-labelledby="service-catalog-title">
    <header className={styles.header}><div><p className={styles.eyebrow}>Comercial · PUB-01 / CRM-11</p><h2 id="service-catalog-title">Catálogo de serviços</h2><p>Consulte os serviços disponíveis para apresentar ao cliente. Serviço representa uma prestação; equipamento físico está na seção seguinte.</p></div><div className={styles.count}><strong>{loaded ? total ?? services.length : "—"}</strong><span>serviços encontrados</span></div></header>
    <div className={styles.toolbar}>
      <label className={styles.field}>Filtrar por tipo<select value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="">Todos os tipos</option>{typeOptions.map(type=><option key={type} value={type}>{typeLabels[type]}</option>)}</select></label>
      <p className={styles.hint}>Esta tela consulta somente serviços publicados e validados, conforme os filtros aplicados pela API.</p>
      <button type="button" onClick={()=>void load()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar catálogo"}</button>
    </div>
    {loaded && !error && <p className={styles.source}>Origem dos dados: <strong>{sourceLabel}</strong></p>}
    {error && <UiState variant="error" title="Catálogo indisponível" detail={error} onRetry={()=>void load()} />}
    {loading && !loaded ? <UiState variant="loading" title="Carregando serviços" /> : null}
    {loaded && !error && services.length === 0 ? <UiState variant="empty" title={filterType ? `Nenhum serviço do tipo “${typeLabels[filterType] || filterType}”` : "Nenhum serviço publicado e validado encontrado"} detail="Revise o filtro ou atualize o catálogo. Serviços em rascunho não aparecem nesta lista." /> : null}
    {loaded && !error && services.length > 0 && <div className={styles.cards}>{services.map(service=><article key={service.id} className={styles.card}>
      <div className={styles.cardHeader}><div><h3>{service.name}</h3><p>{service.short || service.description || "Descrição não informada."}</p></div><div className={styles.badges}><span className={`${styles.badge} ${service.isValidated ? styles.good : styles.pending}`}>{service.isValidated ? "Validado" : "Aguardando validação"}</span><span className={`${styles.badge} ${service.isPublished ? styles.good : styles.pending}`}>{service.isPublished ? "Publicado" : "Não publicado"}</span></div></div>
      <dl className={styles.facts}><div><dt>Tipo de serviço</dt><dd>{typeLabels[service.serviceType || ""] || dash(service.serviceType)}</dd></div><div><dt>Unidade de cobrança</dt><dd>{dash(service.billingUnit)}</dd></div><div><dt>Recorrência</dt><dd>{service.isRecurring == null ? "Não informado" : service.isRecurring ? "Recorrente" : "Avulso"}</dd></div><div><dt>Vigência</dt><dd>{service.validityDays ? `${service.validityDays} dias` : "Não informada"}</dd></div><div><dt>Versão</dt><dd>{service.version ?? "Não informada"}</dd></div><div><dt>Aprovação</dt><dd>{statusLabel(service.approvalStatus)}</dd></div><div><dt>Custo</dt><dd>{currency(service.cost, service.currency)}</dd></div><div><dt>Preço</dt><dd>{currency(service.price, service.currency)}</dd></div></dl>
      <details className={styles.details}><summary>Escopo e informações para atendimento</summary><div className={styles.detailsBody}><p><strong>Descrição completa</strong>{service.description || "Não informada."}</p><p><strong>Público atendido</strong>{service.audience || "Não informado."}</p><p><strong>Escopo</strong>{service.scope || "Não informado."}</p><p><strong>Exclusões</strong>{service.exclusions || "Não informadas."}</p><p><strong>Recursos</strong>{service.resources || "Não informados."}</p><div><strong>Perguntas de qualificação</strong>{Array.isArray(service.questions) && service.questions.length ? <ul>{service.questions.map((question,i)=><li key={`${service.id}-question-${i}`}>{question}</li>)}</ul> : <p>Nenhuma pergunta cadastrada.</p>}</div>{service.validationNote && <p className={styles.note}><strong>Nota de validação</strong>{service.validationNote}</p>}</div></details>
    </article>)}</div>}
    {loaded && !error && total != null && total > services.length && <p className={styles.hint}>A API retornou {services.length} de {total} serviços. Use o filtro por tipo para localizar os itens desta lista.</p>}
  </section>;
}
