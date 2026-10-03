"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Supplier = { id: string; name: string; category?: string | null };
type Product = { id: string; sku: string; name: string; supplier_id: string | null; unit_measure: string };
type Quotation = {
  id: string; protocol: string; supplier_id: string; supplier_name?: string | null; product_id: string;
  product_name?: string | null; quantity: number; unit_price_cents: number; total_price_cents: number;
  status: string; decision?: string | null; decision_recorded_at?: string | null; derived?: { situation?: string; validity?: { situation?: string } };
};
type Order = { id: string; protocol: string; quotation_id: string; supplier_name?: string | null; product_name?: string | null; total_price_cents: number; status: string; derived?: { situation?: string; deadline?: { situation?: string } } };
type Detail = { quotation: Quotation; validities: Array<Record<string, unknown>>; alert_rule: Record<string, unknown> | null; documents: Array<Record<string, unknown>>; orders: Order[] };

const panel: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 12, padding: 16, background: "#fff" };
const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" };
const input: React.CSSProperties = { minHeight: 38, padding: "7px 9px", border: "1px solid #9ca3af", borderRadius: 6, minWidth: 180 };
const button: React.CSSProperties = { minHeight: 38, padding: "7px 12px", border: 0, borderRadius: 6, background: "#1d4ed8", color: "white", cursor: "pointer" };
const secondary: React.CSSProperties = { ...button, background: "#374151" };

function money(cents: number) { return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function newKey(operation: string) { return `ext04-${operation}-${crypto.randomUUID()}`; }
async function jsonOf(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { error: text || `HTTP ${response.status}` }; }
}

export default function FornecedoresWorkspace() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const keys = useRef<Record<string, string>>({});

  const [quoteForm, setQuoteForm] = useState({ supplier_id: "", product_id: "", quantity: "1", unit_price: "", notes: "" });
  const [validityForm, setValidityForm] = useState({ valid_until: "", source: "registro_interno", source_reference: "", justification: "" });
  const [alertForm, setAlertForm] = useState({ days_before: "", justification: "" });
  const [documentForm, setDocumentForm] = useState({ document_type: "", file_name: "", file_url: "", storage_key: "" });
  const [decisionReason, setDecisionReason] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [deadlineForm, setDeadlineForm] = useState({ order_id: "", due_date: "", source: "registro_interno", source_reference: "", justification: "" });

  const productsForSupplier = useMemo(() => products.filter(p => p.supplier_id === quoteForm.supplier_id), [products, quoteForm.supplier_id]);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) { setDetail(null); return; }
    const response = await fetch(`/api/ext/supplier/quotations/${id}`, { headers: { accept: "application/json" } });
    const body = await jsonOf(response);
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    setDetail(body);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [referencesResponse, quotationsResponse, ordersResponse] = await Promise.all([
        fetch("/api/ext/supplier/references", { headers: { accept: "application/json" } }),
        fetch("/api/ext/supplier/quotations", { headers: { accept: "application/json" } }),
        fetch("/api/ext/supplier/orders", { headers: { accept: "application/json" } }),
      ]);
      const [references, quotationData, orderData] = await Promise.all([jsonOf(referencesResponse), jsonOf(quotationsResponse), jsonOf(ordersResponse)]);
      if (!referencesResponse.ok) throw new Error(references.error || `HTTP ${referencesResponse.status}`);
      if (!quotationsResponse.ok) throw new Error(quotationData.error || `HTTP ${quotationsResponse.status}`);
      if (!ordersResponse.ok) throw new Error(orderData.error || `HTTP ${ordersResponse.status}`);
      setSuppliers(references.suppliers || []); setProducts(references.products || []);
      setQuotations(quotationData.quotations || []); setOrders(orderData.orders || []);
      if (selectedId) await loadDetail(selectedId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha ao carregar a jornada."); }
    finally { setLoading(false); }
  }, [loadDetail, selectedId]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(operation: string, url: string, body: unknown) {
    const key = keys.current[operation] || newKey(operation);
    keys.current[operation] = key; // preservada enquanto houver falha
    setBusy(operation); setError(""); setNotice("");
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body),
      });
      const data = await jsonOf(response);
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      delete keys.current[operation]; // só uma resposta real bem-sucedida encerra a tentativa
      return data;
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : "Falha na operação."} Chave preservada para repetição segura: ${key}`);
      throw caught;
    } finally { setBusy(""); }
  }

  async function refresh(message: string, id = selectedId) {
    await load(); if (id) await loadDetail(id); setNotice(message);
  }

  async function createQuotation(event: FormEvent) {
    event.preventDefault();
    const cents = Math.round(Number(quoteForm.unit_price.replace(",", ".")) * 100);
    try {
      const data = await mutate("create-quotation", `/api/ext/supplier/suppliers/${quoteForm.supplier_id}/products/${quoteForm.product_id}/quotations`, {
        quantity: Number(quoteForm.quantity), unit_price_cents: cents, notes: quoteForm.notes,
      });
      const id = data.quotation.id; setSelectedId(id); setQuoteForm({ supplier_id: "", product_id: "", quantity: "1", unit_price: "", notes: "" });
      await refresh("Cotação confirmada pelo servidor; autoria veio da sessão staff.", id);
    } catch {}
  }

  async function transitionQuotation(status: string) {
    if (!selectedId) return;
    try { await mutate(`quote-${selectedId}-${status}`, `/api/ext/supplier/quotations/${selectedId}/status`, { status, reason: `Transição ${status} confirmada pela equipe interna.` }); await refresh(`Estado ${status} confirmado pelo servidor.`); } catch {}
  }
  async function decide(decision: "aprovada" | "rejeitada") {
    if (!selectedId) return;
    try { await mutate(`decision-${selectedId}`, `/api/ext/supplier/quotations/${selectedId}/decision`, { decision, justification: decisionReason }); setDecisionReason(""); await refresh(`Decisão ${decision} gravada com autor e data; não será sobrescrita.`); } catch {}
  }
  async function addValidity(event: FormEvent) {
    event.preventDefault(); if (!selectedId) return;
    try { await mutate(`validity-${selectedId}`, `/api/ext/supplier/quotations/${selectedId}/validities`, validityForm); setValidityForm({ valid_until: "", source: "registro_interno", source_reference: "", justification: "" }); await refresh("Validade registrada com fonte; situação recalculada pela data-base do servidor."); } catch {}
  }
  async function addAlert(event: FormEvent) {
    event.preventDefault(); if (!selectedId) return;
    try { await mutate(`alert-${selectedId}`, `/api/ext/supplier/quotations/${selectedId}/alert-rules`, { days_before: Number(alertForm.days_before), justification: alertForm.justification }); setAlertForm({ days_before: "", justification: "" }); await refresh("Regra explícita registrada; somente agora existe limiar de alerta."); } catch {}
  }
  async function addDocument(event: FormEvent) {
    event.preventDefault(); if (!selectedId) return;
    try { await mutate(`document-${selectedId}`, `/api/ext/supplier/quotations/${selectedId}/documents`, documentForm); setDocumentForm({ document_type: "", file_name: "", file_url: "", storage_key: "" }); await refresh("Referência documental versionada confirmada; isto não comprova upload."); } catch {}
  }
  async function createOrder() {
    if (!selectedId) return;
    try { const data = await mutate(`order-${selectedId}`, `/api/ext/supplier/quotations/${selectedId}/orders`, { notes: orderNotes }); setOrderNotes(""); await refresh(`Pedido ${data.order.protocol} derivado da cotação aprovada.`); } catch {}
  }
  async function transitionOrder(orderId: string, status: string) {
    try { await mutate(`order-${orderId}-${status}`, `/api/ext/supplier/orders/${orderId}/status`, { status, reason: `Transição ${status} confirmada pela equipe interna.` }); await refresh(`Pedido confirmado em ${status}.`); } catch {}
  }
  async function addDeadline(event: FormEvent) {
    event.preventDefault();
    try { await mutate(`deadline-${deadlineForm.order_id}`, `/api/ext/supplier/orders/${deadlineForm.order_id}/deadlines`, deadlineForm); setDeadlineForm({ order_id: "", due_date: "", source: "registro_interno", source_reference: "", justification: "" }); await refresh("Prazo do pedido registrado com fonte; nenhum prazo foi estimado."); } catch {}
  }

  const quote = detail?.quotation;
  const quoteTransitions: Record<string, string[]> = { rascunho: ["enviado", "cancelado"], enviado: ["em_analise", "cancelado"], em_analise: ["cancelado"] };
  const orderTransitions: Record<string, string[]> = { rascunho: ["emitido", "cancelado"], emitido: ["em_entrega", "cancelado"], em_entrega: ["recebido", "cancelado"], recebido: ["fechado"] };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#111827" }}>
      <h1>EXT-04 — Fornecedores</h1>
      <p>Jornada administrativa interna de cotações, referências documentais e pedidos.</p>

      <section aria-label="Condição de volume" style={{ ...panel, borderColor: "#b45309", background: "#fffbeb", marginBottom: 12 }}>
        <strong>Condição “se volume justificar”: SEM EVIDÊNCIA.</strong>
        <p style={{ marginBottom: 0 }}>O plano apenas declara a condição em <code>docs/PLANO-MESTRE-IMPLEMENTACAO.md:423</code>; a auditoria em <code>docs/AUDITORIA-TERRENO-L08.md:85</code> registra handler/tabelas sem jornada provada. Não há medição, meta ou histórico de volume no repositório. Confirmação do proprietário pendente.</p>
      </section>
      <section aria-label="Fronteira externa" style={{ ...panel, borderColor: "#9f1239", background: "#fff1f2", marginBottom: 16 }}>
        <strong>Fronteira externa PENDENTE.</strong>
        <p style={{ marginBottom: 0 }}>Não existe identidade, login, sessão, grant, canal HTTP, upload ou aceite de fornecedor. A tela usa somente sessão staff. <code>file_url</code>/<code>storage_key</code> são referências declaradas, não arquivos enviados. “Escopo próprio” do ator fornecedor não é afirmado nem simulado.</p>
      </section>

      {loading && <p role="status">Carregando cotações, documentos e pedidos do servidor…</p>}
      {error && <div role="alert" style={{ ...panel, borderColor: "#dc2626", marginBottom: 12 }}><strong>Erro:</strong> {error}<br/><button style={secondary} onClick={() => void load()}>Repetir carregamento</button></div>}
      {notice && <p role="status" style={{ color: "#166534" }}>{notice}</p>}

      <section style={{ ...panel, marginBottom: 16 }}>
        <h2>Nova cotação interna</h2>
        {!suppliers.length || !products.length ? <p>Vazio declarado: é necessário fornecedor e produto ativos, vinculados no cadastro canônico AST. Nada será inventado.</p> : null}
        <form onSubmit={createQuotation} style={row}>
          <label>Fornecedor<br/><select required style={input} value={quoteForm.supplier_id} onChange={e => setQuoteForm({ ...quoteForm, supplier_id: e.target.value, product_id: "" })}><option value="">Selecione</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Produto do fornecedor<br/><select required style={input} value={quoteForm.product_id} onChange={e => setQuoteForm({ ...quoteForm, product_id: e.target.value })}><option value="">Selecione</option>{productsForSupplier.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></label>
          <label>Quantidade<br/><input required min={1} type="number" style={input} value={quoteForm.quantity} onChange={e => setQuoteForm({ ...quoteForm, quantity: e.target.value })}/></label>
          <label>Preço unitário (R$)<br/><input required inputMode="decimal" style={input} value={quoteForm.unit_price} onChange={e => setQuoteForm({ ...quoteForm, unit_price: e.target.value })}/></label>
          <label>Notas (opcional, ≥10)<br/><input style={input} value={quoteForm.notes} onChange={e => setQuoteForm({ ...quoteForm, notes: e.target.value })}/></label>
          <button disabled={Boolean(busy)} style={button}>Confirmar no servidor</button>
        </form>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(420px, 2fr)", gap: 16, alignItems: "start" }}>
        <div style={panel}>
          <h2>Cotações</h2>
          {!loading && !quotations.length && <p>Vazio declarado: nenhuma cotação canônica; nenhum preço ou volume estimado.</p>}
          <ul style={{ padding: 0, listStyle: "none" }}>{quotations.map(q => <li key={q.id} style={{ marginBottom: 8 }}><button style={{ ...secondary, width: "100%", textAlign: "left", background: selectedId === q.id ? "#1d4ed8" : "#374151" }} onClick={() => { setSelectedId(q.id); void loadDetail(q.id).catch(e => setError(String(e.message || e))); }}>{q.protocol}<br/>{q.supplier_name} · {q.product_name}<br/>{money(q.total_price_cents)} · {q.status} · {q.derived?.situation || "situação ausente"}</button></li>)}</ul>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section style={panel}>
            <h2>Detalhe canônico</h2>
            {!quote && <p>Selecione uma cotação. Nenhum detalhe é presumido.</p>}
            {quote && <>
              <p><strong>{quote.protocol}</strong> — {quote.supplier_name} / {quote.product_name}<br/>{quote.quantity} × {money(quote.unit_price_cents)} = {money(quote.total_price_cents)}<br/>Estado: <strong>{quote.status}</strong>; situação derivada: <strong>{quote.derived?.situation}</strong>; validade: <strong>{quote.derived?.validity?.situation || "ausente"}</strong>.</p>
              <div style={row}>{(quoteTransitions[quote.status] || []).map(status => <button key={status} disabled={Boolean(busy)} style={secondary} onClick={() => void transitionQuotation(status)}>Mover para {status}</button>)}</div>
              {quote.status === "em_analise" && !quote.decision && <div style={{ ...row, marginTop: 10 }}><input style={input} placeholder="Justificativa da decisão (≥10)" value={decisionReason} onChange={e => setDecisionReason(e.target.value)}/><button style={button} disabled={Boolean(busy)} onClick={() => void decide("aprovada")}>Aprovar definitivamente</button><button style={{ ...button, background: "#b91c1c" }} disabled={Boolean(busy)} onClick={() => void decide("rejeitada")}>Rejeitar definitivamente</button></div>}
              {quote.decision && <p>Decisão imutável: <strong>{quote.decision}</strong>, registrada em {quote.decision_recorded_at || "data ausente"}.</p>}
              {quote.status === "aprovado" && <div style={row}><input style={input} placeholder="Notas do pedido (opcional)" value={orderNotes} onChange={e => setOrderNotes(e.target.value)}/><button style={button} disabled={Boolean(busy)} onClick={() => void createOrder()}>Criar pedido derivado</button></div>}
            </>}
          </section>

          {quote && <section style={panel}><h2>Validade e alerta</h2>
            <p>{detail?.validities.length ? `${detail.validities.length} registro(s) de validade; anteriores nunca são sobrescritos.` : "Validade ausente declarada; nenhuma data estimada."} {detail?.alert_rule ? "Regra de antecedência explícita registrada." : "Sem regra: o sistema não chama prazo de “a vencer”."}</p>
            <form onSubmit={addValidity} style={row}><label>Válida até<br/><input required type="date" style={input} value={validityForm.valid_until} onChange={e => setValidityForm({ ...validityForm, valid_until: e.target.value })}/></label><label>Fonte<br/><select style={input} value={validityForm.source} onChange={e => setValidityForm({ ...validityForm, source: e.target.value })}><option value="registro_interno">registro interno</option><option value="documento_declarado">documento declarado</option><option value="email_declarado">e-mail declarado</option></select></label><input style={input} placeholder="Referência da fonte" value={validityForm.source_reference} onChange={e => setValidityForm({ ...validityForm, source_reference: e.target.value })}/><input required style={input} placeholder="Justificativa (≥5)" value={validityForm.justification} onChange={e => setValidityForm({ ...validityForm, justification: e.target.value })}/><button style={button} disabled={Boolean(busy)}>Registrar validade</button></form>
            {!detail?.alert_rule && <form onSubmit={addAlert} style={{ ...row, marginTop: 10 }}><input required min={1} max={365} type="number" style={input} placeholder="Dias de antecedência" value={alertForm.days_before} onChange={e => setAlertForm({ ...alertForm, days_before: e.target.value })}/><input required style={input} placeholder="Justificativa da regra" value={alertForm.justification} onChange={e => setAlertForm({ ...alertForm, justification: e.target.value })}/><button style={secondary} disabled={Boolean(busy)}>Registrar regra explícita</button></form>}
          </section>}

          {quote && <section style={panel}><h2>Referências documentais</h2><p><strong>Sem upload real.</strong> Versão é alocada sob transação e lock no servidor.</p>
            {!detail?.documents.length && <p>Vazio declarado: nenhuma referência documental; nenhum arquivo presumido.</p>}
            <ul>{detail?.documents.map((d, index) => <li key={String(d.id || index)}>{String(d.document_type || "tipo legado")} v{String(d.version || "legado")} — {String(d.file_name || "sem nome")} — {String(d.situation)}</li>)}</ul>
            <form onSubmit={addDocument} style={row}><input required style={input} placeholder="Tipo" value={documentForm.document_type} onChange={e => setDocumentForm({ ...documentForm, document_type: e.target.value })}/><input required style={input} placeholder="Nome declarado" value={documentForm.file_name} onChange={e => setDocumentForm({ ...documentForm, file_name: e.target.value })}/><input required style={input} placeholder="file_url (referência)" value={documentForm.file_url} onChange={e => setDocumentForm({ ...documentForm, file_url: e.target.value })}/><input required style={input} placeholder="storage_key (referência)" value={documentForm.storage_key} onChange={e => setDocumentForm({ ...documentForm, storage_key: e.target.value })}/><button style={button} disabled={Boolean(busy)}>Registrar referência</button></form>
          </section>}
        </div>
      </section>

      <section style={{ ...panel, marginTop: 16 }}><h2>Pedidos internos</h2>
        {!loading && !orders.length && <p>Vazio declarado: nenhum pedido. Pedido só nasce de cotação aprovada.</p>}
        {orders.map(orderItem => <article key={orderItem.id} style={{ borderTop: "1px solid #e5e7eb", padding: "12px 0" }}><strong>{orderItem.protocol}</strong> — {orderItem.supplier_name} / {orderItem.product_name} — {money(orderItem.total_price_cents)}<br/>Estado: {orderItem.status}; situação: {orderItem.derived?.situation}; prazo: {orderItem.derived?.deadline?.situation || "ausente"}<div style={row}>{(orderTransitions[orderItem.status] || []).map(status => <button key={status} style={secondary} disabled={Boolean(busy)} onClick={() => void transitionOrder(orderItem.id, status)}>Mover para {status}</button>)}</div></article>)}
        {orders.length > 0 && <form onSubmit={addDeadline} style={{ ...row, marginTop: 12 }}><select required style={input} value={deadlineForm.order_id} onChange={e => setDeadlineForm({ ...deadlineForm, order_id: e.target.value })}><option value="">Pedido para prazo</option>{orders.filter(o => !["fechado","cancelado"].includes(o.status)).map(o => <option key={o.id} value={o.id}>{o.protocol}</option>)}</select><input required type="date" style={input} value={deadlineForm.due_date} onChange={e => setDeadlineForm({ ...deadlineForm, due_date: e.target.value })}/><select style={input} value={deadlineForm.source} onChange={e => setDeadlineForm({ ...deadlineForm, source: e.target.value })}><option value="registro_interno">registro interno</option><option value="cotacao_aprovada">cotação aprovada</option><option value="pedido_emitido">pedido emitido</option></select><input style={input} placeholder="Referência" value={deadlineForm.source_reference} onChange={e => setDeadlineForm({ ...deadlineForm, source_reference: e.target.value })}/><input required style={input} placeholder="Justificativa (≥5)" value={deadlineForm.justification} onChange={e => setDeadlineForm({ ...deadlineForm, justification: e.target.value })}/><button style={button} disabled={Boolean(busy)}>Registrar prazo</button></form>}
      </section>
    </main>
  );
}
