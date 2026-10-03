import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createExtSupplierApi,
  deriveTemporalSituation,
  deriveQuotationSituation,
  deriveOrderSituation,
  QUOTATION_STATUS_TRANSITIONS,
  QUOTATION_TERMINAL_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  ORDER_TERMINAL_STATUSES,
  VALIDITY_SOURCES,
  ORDER_DEADLINE_SOURCES,
  VOLUME_CONDITION,
  EXTERNAL_ACTOR_BOUNDARY,
  DOCUMENT_BOUNDARY,
  EMPTY_QUOTATIONS,
  EMPTY_ORDERS,
} from "../src/server/ext-supplier-api.mjs";

const identityId = "22222222-2222-4222-8222-222222222222";
const supplierId = "11111111-1111-4111-8111-111111111111";
const productId = "33333333-3333-4333-8333-333333333333";
const quotationId = "44444444-4444-4444-8444-444444444444";
const orderId = "55555555-5555-4555-8555-555555555555";

function responseCapture() {
  return { status: 0, payload: null, writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } };
}
function request({ method = "GET", body, key = "ext04-unit-key-0001" } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const headers = { host: "admin.test", origin: "https://admin.test" };
  if (key !== null) headers["idempotency-key"] = key;
  return { method, headers, async *[Symbol.asyncIterator]() { yield* chunks; } };
}
function api(pool, { session = { identityId, role: "ti" }, origin = true } = {}) {
  return createExtSupplierApi({ pool, sameOrigin: () => origin, requireSession: async () => session });
}
function emptyPool() {
  const statements = [];
  return { statements, pool: { async query(sql, params) { statements.push({ sql, params }); return { rows: [] }; } } };
}
function mutationPool({ replay = null, failAudit = false, quoteStatus = "rascunho" } = {}) {
  const statements = [];
  const quote = {
    id: quotationId, protocol: "FORN-EXT-20261003-AB12", supplier_id: supplierId, product_id: productId,
    quantity: 2, unit_price_cents: "1500", total_price_cents: "3000", status: quoteStatus,
    notes: "cotação sintética unitária", origin: "jornada_canonica", is_visible_to_supplier: false,
    decision: null, decision_recorded_at: null, created_by_identity: identityId,
  };
  let event = replay;
  const client = {
    async query(raw, params = []) {
      statements.push({ sql: raw, params });
      const sql = String(raw).replace(/\s+/g, " ");
      if (sql.includes("FROM ext_supplier_portal_events WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE")) return { rows: event ? [event] : [] };
      if (sql.includes("FROM ext_supplier_portal_events WHERE created_by_identity=$1")) return { rows: event ? [event] : [] };
      if (sql.includes("FROM ast_suppliers s CROSS JOIN ast_products p")) return { rows: [{ supplier_id: supplierId, supplier_active: true, product_id: productId, product_active: true, product_supplier_id: supplierId }] };
      if (sql.includes("INSERT INTO ext_supplier_portal_quotations")) return { rows: [{ ...quote, protocol: params[0], quantity: params[3], unit_price_cents: params[4], total_price_cents: params[5], notes: params[6], created_by_identity: params[7] }] };
      if (sql.includes("INSERT INTO ext_supplier_portal_events")) { event = { quotation_id: params[0], order_id: params[1], idempotency_key: params[5], request_fingerprint: params[6] }; return { rows: [] }; }
      if (sql.includes("INSERT INTO audit_log")) { if (failAudit) throw new Error("audit offline"); return { rows: [] }; }
      if (sql.includes("SELECT q.*,s.name supplier_name")) return { rows: [{ ...quote, supplier_name: "Fornecedor sintético", product_name: "Produto sintético" }] };
      if (sql.includes("FROM ext_supplier_portal_quotations WHERE id=$1 FOR UPDATE")) return { rows: [{ ...quote }] };
      if (sql.includes("FROM ext_supplier_portal_quotations WHERE id=$1")) return { rows: [{ ...quote }] };
      return { rows: [], rowCount: 0 };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };
  return { statements, get event() { return event; }, pool: { connect: async () => client, query: async (...args) => client.query(...args) } };
}
const normalized = statement => String(statement.sql).replace(/\s+/g, " ");
const indexOfSql = (statements, needle) => statements.findIndex(s => normalized(s).includes(needle));

// Declarações condicionais/fronteiras.
test("EXT-04 declara volume sem evidência, sem convertê-lo em confirmação", () => {
  assert.equal(VOLUME_CONDITION.situacao, "sem_evidencia");
  assert.match(VOLUME_CONDITION.evidencia.join(" "), /PLANO-MESTRE-IMPLEMENTACAO\.md:423/);
});
test("EXT-04 declara ator fornecedor externo pendente", () => {
  assert.equal(EXTERNAL_ACTOR_BOUNDARY.supplier_identity, false);
  assert.equal(EXTERNAL_ACTOR_BOUNDARY.supplier_session, false);
  assert.equal(EXTERNAL_ACTOR_BOUNDARY.situacao, "pendente");
});
test("EXT-04 não chama referência documental de upload", () => {
  assert.equal(DOCUMENT_BOUNDARY.upload_real, false);
  assert.match(DOCUMENT_BOUNDARY.declaracao, /referências declaradas/);
});
test("EXT-04 estados vazios não inventam volume nem pedido", () => {
  assert.match(EMPTY_QUOTATIONS, /Nenhum volume/);
  assert.match(EMPTY_ORDERS, /nada é estimado/);
});

// Máquinas de estado.
test("EXT-04 cotação segue rascunho → enviado → análise → aprovado", () => {
  assert.deepEqual(QUOTATION_STATUS_TRANSITIONS.rascunho, ["enviado", "cancelado"]);
  assert.ok(QUOTATION_STATUS_TRANSITIONS.enviado.includes("em_analise"));
  assert.ok(QUOTATION_STATUS_TRANSITIONS.em_analise.includes("aprovado"));
});
test("EXT-04 cotação aprovada não reabre", () => assert.deepEqual(QUOTATION_STATUS_TRANSITIONS.aprovado, []));
test("EXT-04 cotação rejeitada não reabre", () => assert.deepEqual(QUOTATION_STATUS_TRANSITIONS.rejeitado, []));
test("EXT-04 cotação cancelada não reabre", () => assert.deepEqual(QUOTATION_STATUS_TRANSITIONS.cancelado, []));
test("EXT-04 terminais de cotação são explícitos", () => assert.deepEqual(QUOTATION_TERMINAL_STATUSES, ["aprovado", "rejeitado", "cancelado"]));
test("EXT-04 pedido segue rascunho → emitido → entrega → recebido → fechado", () => {
  assert.ok(ORDER_STATUS_TRANSITIONS.rascunho.includes("emitido"));
  assert.ok(ORDER_STATUS_TRANSITIONS.emitido.includes("em_entrega"));
  assert.ok(ORDER_STATUS_TRANSITIONS.em_entrega.includes("recebido"));
  assert.deepEqual(ORDER_STATUS_TRANSITIONS.recebido, ["fechado"]);
});
test("EXT-04 pedido fechado não reabre", () => assert.deepEqual(ORDER_STATUS_TRANSITIONS.fechado, []));
test("EXT-04 pedido cancelado não reabre", () => assert.deepEqual(ORDER_STATUS_TRANSITIONS.cancelado, []));
test("EXT-04 terminais de pedido são explícitos", () => assert.deepEqual(ORDER_TERMINAL_STATUSES, ["fechado", "cancelado"]));

// Datas/fontes/alertas derivados.
test("EXT-04 validade ausente é declarada", () => {
  const result = deriveTemporalSituation({ record: null, dateField: "valid_until", baseDate: "2026-10-03", missing: "validade_ausente" });
  assert.equal(result.situation, "validade_ausente"); assert.equal(result.base_date, "2026-10-03");
});
test("EXT-04 data futura sem regra fica vigente, nunca a vencer", () => {
  const result = deriveTemporalSituation({ record: { id: "v", valid_until: "2026-10-10", source: "registro_interno" }, dateField: "valid_until", baseDate: "2026-10-03" });
  assert.equal(result.situation, "vigente"); assert.equal(result.alert_rule_absence, "sem_regra_de_antecedencia");
});
test("EXT-04 alerta só deriva a vencer com regra explícita", () => {
  const result = deriveTemporalSituation({ record: { id: "v", valid_until: "2026-10-05", source: "registro_interno" }, dateField: "valid_until", rule: { id: "r", days_before: 3 }, baseDate: "2026-10-03" });
  assert.equal(result.situation, "a_vencer"); assert.equal(result.alert.days_before, 3);
});
test("EXT-04 prazo passado é vencido pela data-base", () => {
  const result = deriveTemporalSituation({ record: { due_date: "2026-10-01", source: "pedido_emitido" }, dateField: "due_date", baseDate: "2026-10-03" });
  assert.equal(result.situation, "vencido"); assert.equal(result.days_overdue, 2);
});
test("EXT-04 registro substituído não é tratado como vigente", () => {
  const result = deriveTemporalSituation({ record: { valid_until: "2026-10-10", superseded_at: "2026-10-02", source: "registro_interno" }, dateField: "valid_until", baseDate: "2026-10-03" });
  assert.equal(result.situation, "substituido");
});
test("EXT-04 situação da cotação terminal prevalece e mantém validade declarada", () => {
  const result = deriveQuotationSituation({ quotation: { status: "aprovado" }, validity: null, baseDate: "2026-10-03" });
  assert.equal(result.situation, "encerrada"); assert.equal(result.validity.situation, "validade_ausente");
});
test("EXT-04 cotação aberta com validade passada deriva validade_vencida", () => {
  const result = deriveQuotationSituation({ quotation: { status: "enviado" }, validity: { valid_until: "2026-10-01", source: "registro_interno" }, baseDate: "2026-10-03" });
  assert.equal(result.situation, "validade_vencida");
});
test("EXT-04 pedido terminal não é reclassificado por prazo", () => {
  const result = deriveOrderSituation({ order: { status: "fechado" }, deadline: { due_date: "2026-10-01" }, baseDate: "2026-10-03" });
  assert.equal(result.situation, "encerrado"); assert.equal(result.deadline.situation, "vencido");
});
test("EXT-04 fontes aceitas são fechadas e explícitas", () => {
  assert.deepEqual(VALIDITY_SOURCES, ["documento_declarado", "email_declarado", "registro_interno"]);
  assert.deepEqual(ORDER_DEADLINE_SOURCES, ["cotacao_aprovada", "pedido_emitido", "registro_interno"]);
});

// Ordem canônica de autorização, com zero SQL nas recusas.
test("EXT-04 anônimo recebe 401 sem SQL", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool, { session: null }).handleQuotations(request(), res);
  assert.equal(res.status, 401); assert.equal(res.payload.error, "unauthorized"); assert.equal(statements.length, 0);
});
test("EXT-04 papel não autorizado recebe 403, não 401, sem SQL", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool, { session: { identityId, role: "rh" } }).handleQuotations(request(), res);
  assert.equal(res.status, 403); assert.equal(res.payload.error, "forbidden_role"); assert.equal(statements.length, 0);
});
test("EXT-04 mutação cross-origin recebe 403 sem SQL", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool, { origin: false }).handleCreateQuotation(request({ method: "POST", body: {} }), res, supplierId, productId);
  assert.equal(res.status, 403); assert.equal(res.payload.error, "origin_forbidden"); assert.equal(statements.length, 0);
});
test("EXT-04 identidade staff não UUID recebe 401 sem SQL", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool, { session: { identityId: "forjada", role: "ti" } }).handleCreateQuotation(request({ method: "POST", body: {} }), res, supplierId, productId);
  assert.equal(res.status, 401); assert.equal(statements.length, 0);
});
test("EXT-04 legado preserva 401 anônimo antes do 410", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool, { session: null }).handleLegacyQuotations(request({ method: "POST", body: {} }), res);
  assert.equal(res.status, 401); assert.equal(statements.length, 0);
});
test("EXT-04 legado preserva 403 de papel antes do 410", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool, { session: { identityId, role: "rh" } }).handleLegacyQuotations(request({ method: "POST", body: {} }), res);
  assert.equal(res.status, 403); assert.equal(statements.length, 0);
});
test("EXT-04 mutação legada autorizada é 410 sem SQL", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool).handleLegacyQuotations(request({ method: "POST", body: {} }), res);
  assert.equal(res.status, 410); assert.match(res.payload.canonical, /supplier\/quotations/); assert.equal(statements.length, 0);
});

// Validação de borda.
test("EXT-04 UUID de vínculo é validado na URL", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool).handleCreateQuotation(request({ method: "POST", body: {} }), res, "x", productId);
  assert.equal(res.status, 400); assert.equal(res.payload.error, "invalid_reference"); assert.equal(statements.length, 0);
});
test("EXT-04 quantidade inválida é recusada", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool).handleCreateQuotation(request({ method: "POST", body: { quantity: 0, unit_price_cents: 1 } }), res, supplierId, productId);
  assert.equal(res.status, 400); assert.equal(res.payload.error, "invalid_quantity"); assert.equal(statements.length, 0);
  const primitive = responseCapture();
  await api(pool).handleCreateQuotation(request({ method: "POST", body: null }), primitive, supplierId, productId);
  assert.equal(primitive.status, 400); assert.equal(primitive.payload.error, "invalid_request"); assert.equal(statements.length, 0);
});
test("EXT-04 preço inválido é recusado", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool).handleCreateQuotation(request({ method: "POST", body: { quantity: 1, unit_price_cents: -1 } }), res, supplierId, productId);
  assert.equal(res.status, 400); assert.equal(res.payload.error, "invalid_unit_price_cents"); assert.equal(statements.length, 0);
});
test("EXT-04 mutação sem chave de idempotência é recusada", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool).handleCreateQuotation(request({ method: "POST", key: null, body: { quantity: 1, unit_price_cents: 100 } }), res, supplierId, productId);
  assert.equal(res.status, 400); assert.equal(res.payload.error, "idempotency_key_required"); assert.equal(statements.length, 0);
});
test("EXT-04 corpo acima de 32768 bytes recebe 413", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool).handleCreateQuotation(request({ method: "POST", body: "x".repeat(33000) }), res, supplierId, productId);
  assert.equal(res.status, 413); assert.equal(statements.length, 0);
});
test("EXT-04 aprovação não passa pelo endpoint genérico de status", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool).handleQuotationStatus(request({ method: "POST", body: { status: "aprovado", reason: "decisão suficiente" } }), res, quotationId);
  assert.equal(res.status, 409); assert.equal(res.payload.error, "decision_endpoint_required"); assert.equal(statements.length, 0);
});
test("EXT-04 decisão curta é recusada antes da transação", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool).handleQuotationDecision(request({ method: "POST", body: { decision: "aprovada", justification: "curta" } }), res, quotationId);
  assert.equal(res.status, 400); assert.equal(statements.length, 0);
});
test("EXT-04 metadado documental inválido é recusado", async () => {
  const { pool, statements } = emptyPool(), res = responseCapture();
  await api(pool).handleDocuments(request({ method: "POST", body: { document_type: "x", file_name: "a", file_url: "url", storage_key: "key" } }), res, quotationId);
  assert.equal(res.status, 400); assert.equal(res.payload.error, "invalid_document_type"); assert.equal(statements.length, 0);
});

// Transação/autoria/vínculos/idempotência/auditoria.
test("EXT-04 cria cotação com vínculos da URL, autoria da sessão e total derivado", async () => {
  const state = mutationPool(), res = responseCapture();
  await api(state.pool).handleCreateQuotation(request({ method: "POST", body: {
    supplier_id: "99999999-9999-4999-8999-999999999999", product_id: "88888888-8888-4888-8888-888888888888",
    id: "77777777-7777-4777-8777-777777777777", created_by_identity: "66666666-6666-4666-8666-666666666666",
    total_price_cents: 1, quantity: 2, unit_price_cents: 1500, notes: "cotação sintética unitária",
  } }), res, supplierId, productId);
  assert.equal(res.status, 201); assert.equal(res.payload.quotation.supplier_id, supplierId); assert.equal(res.payload.quotation.product_id, productId);
  assert.equal(res.payload.quotation.created_by_identity, identityId); assert.equal(res.payload.quotation.total_price_cents, 3000);
  const insert = state.statements.find(s => normalized(s).includes("INSERT INTO ext_supplier_portal_quotations"));
  assert.deepEqual(insert.params.slice(1, 3), [supplierId, productId]); assert.equal(insert.params[5], 3000); assert.equal(insert.params[7], identityId);
});
test("EXT-04 transação ordena BEGIN, lock canônico, evento, auditoria e COMMIT", async () => {
  const state = mutationPool(), res = responseCapture();
  await api(state.pool).handleCreateQuotation(request({ method: "POST", body: { quantity: 2, unit_price_cents: 1500, notes: "cotação sintética unitária" } }), res, supplierId, productId);
  const begin=indexOfSql(state.statements,"BEGIN"), lock=indexOfSql(state.statements,"FROM ast_suppliers s CROSS JOIN ast_products p"), event=indexOfSql(state.statements,"INSERT INTO ext_supplier_portal_events"), audit=indexOfSql(state.statements,"INSERT INTO audit_log"), commit=indexOfSql(state.statements,"COMMIT");
  assert.ok(begin < lock && lock < event && event < audit && audit < commit);
});
test("EXT-04 retry idêntico não duplica", async () => {
  const state = mutationPool();
  const body = { quantity: 2, unit_price_cents: 1500, notes: "cotação sintética unitária" };
  const first=responseCapture(); await api(state.pool).handleCreateQuotation(request({ method:"POST",body }),first,supplierId,productId);
  const second=responseCapture(); await api(state.pool).handleCreateQuotation(request({ method:"POST",body }),second,supplierId,productId);
  assert.equal(first.status,201); assert.equal(second.status,200); assert.equal(second.payload.replayed,true);
  assert.equal(state.statements.filter(s=>normalized(s).includes("INSERT INTO ext_supplier_portal_quotations")).length,1);
});
test("EXT-04 reuso da chave com conteúdo diferente devolve 409", async () => {
  const state = mutationPool();
  const first=responseCapture(); await api(state.pool).handleCreateQuotation(request({method:"POST",body:{quantity:2,unit_price_cents:1500,notes:"cotação sintética unitária"}}),first,supplierId,productId);
  const second=responseCapture(); await api(state.pool).handleCreateQuotation(request({method:"POST",body:{quantity:3,unit_price_cents:1500,notes:"cotação sintética unitária"}}),second,supplierId,productId);
  assert.equal(second.status,409); assert.equal(second.payload.error,"idempotency_key_reused");
});
test("EXT-04 falha de auditoria devolve 503 e ROLLBACK sem COMMIT", async () => {
  const state=mutationPool({failAudit:true}),res=responseCapture();
  await api(state.pool).handleCreateQuotation(request({method:"POST",body:{quantity:2,unit_price_cents:1500,notes:"cotação sintética unitária"}}),res,supplierId,productId);
  assert.equal(res.status,503); assert.equal(res.payload.error,"audit_unavailable");
  assert.ok(indexOfSql(state.statements,"ROLLBACK")>indexOfSql(state.statements,"INSERT INTO audit_log")); assert.equal(indexOfSql(state.statements,"COMMIT"),-1);
});
