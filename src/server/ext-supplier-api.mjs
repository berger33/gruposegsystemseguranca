// EXT-04 — fornecedores: jornada administrativa interna canônica.
//
// CONDIÇÃO: "se volume justificar" está SEM EVIDÊNCIA no repositório. O plano
// apenas declara a condição (docs/PLANO-MESTRE-IMPLEMENTACAO.md:423) e a
// auditoria registra a capacidade como não provada (docs/AUDITORIA-TERRENO-L08.md:85).
// Nenhum volume é inferido de tabela existente e nenhum dado é semeado.
//
// FRONTEIRA EXTERNA: não existe login, sessão, grant, canal HTTP, upload ou
// aceite de fornecedor. Esta API usa exclusivamente sessão canônica de staff.
// file_url/storage_key são referências declaradas, nunca prova de upload.
//
// Toda mutação: autenticação → papel → same-origin → identidade UUID → corpo
// limitado → Idempotency-Key → BEGIN → replay FOR UPDATE → trabalho + evento
// imutável + audit_log → COMMIT. Falha de auditoria: rollback + 503.

import { createHash } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export const SUPPLIER_READ_ROLES = Object.freeze(["admin", "marcelo", "ti"]);
export const SUPPLIER_WRITE_ROLES = Object.freeze(["admin", "marcelo", "ti"]);
export const QUOTATION_TERMINAL_STATUSES = Object.freeze(["aprovado", "rejeitado", "cancelado"]);
export const ORDER_TERMINAL_STATUSES = Object.freeze(["fechado", "cancelado"]);
export const QUOTATION_STATUS_TRANSITIONS = Object.freeze({
  rascunho: Object.freeze(["enviado", "cancelado"]),
  enviado: Object.freeze(["em_analise", "cancelado"]),
  em_analise: Object.freeze(["aprovado", "rejeitado", "cancelado"]),
  aprovado: Object.freeze([]), rejeitado: Object.freeze([]), cancelado: Object.freeze([]),
});
export const ORDER_STATUS_TRANSITIONS = Object.freeze({
  rascunho: Object.freeze(["emitido", "cancelado"]),
  emitido: Object.freeze(["em_entrega", "cancelado"]),
  em_entrega: Object.freeze(["recebido", "cancelado"]),
  recebido: Object.freeze(["fechado"]),
  fechado: Object.freeze([]), cancelado: Object.freeze([]),
});
export const VALIDITY_SOURCES = Object.freeze(["documento_declarado", "email_declarado", "registro_interno"]);
export const ORDER_DEADLINE_SOURCES = Object.freeze(["cotacao_aprovada", "pedido_emitido", "registro_interno"]);
export const SUPPLIER_SOURCES = Object.freeze({
  quotations: "ext_supplier_portal_quotations",
  validities: "ext_supplier_quotation_validities",
  documents: "ext_supplier_portal_documents",
  orders: "ext_supplier_portal_orders",
  order_deadlines: "ext_supplier_order_deadlines",
  alert_rules: "ext_supplier_alert_rules",
  events: "ext_supplier_portal_events",
  suppliers: "ast_suppliers",
  products: "ast_products",
});

export const VOLUME_CONDITION = Object.freeze({
  condicao: "se volume justificar",
  situacao: "sem_evidencia",
  evidencia: [
    "docs/PLANO-MESTRE-IMPLEMENTACAO.md:423 declara a condição, mas não traz medição, meta ou histórico de volume.",
    "docs/AUDITORIA-TERRENO-L08.md:85 registra somente handler/tabelas e diz que o fornecedor restrito não está provado.",
  ],
  pendencia: "O proprietário ainda precisa confirmar volume e decisão de ativação da capacidade condicional.",
  efeito: "A jornada interna pode registrar dados sintéticos ou futuros; a API não afirma volume real nem justificação comercial.",
});

export const EXTERNAL_ACTOR_BOUNDARY = Object.freeze({
  supplier_identity: false,
  supplier_login: false,
  supplier_session: false,
  supplier_grant: false,
  supplier_http_channel: false,
  supplier_upload: false,
  supplier_acceptance: false,
  situacao: "pendente",
  declaracao: "Não existe ator externo fornecedor canônico comprovável por HTTP/DB. A jornada é somente de staff; o escopo próprio do fornecedor permanece pendente e nenhum acesso externo é simulado.",
});

export const DOCUMENT_BOUNDARY = Object.freeze({
  upload_real: false,
  armazenamento_verificado: false,
  entrega_ao_fornecedor: false,
  declaracao: "file_url e storage_key são referências declaradas pela equipe; não existe upload, armazenamento ou entrega real nesta jornada.",
});

export const EMPTY_QUOTATIONS = "Nenhuma cotação registrada no backend canônico. Nenhum volume, preço ou fornecedor é inventado.";
export const EMPTY_ORDERS = "Nenhum pedido interno registrado. Pedido só nasce de cotação aprovada; nada é estimado.";

function todayIso() { return new Date().toISOString().slice(0, 10); }
function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
function isIsoDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function addDays(date, amount) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10);
}
function daysBetween(from, to) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}
function fingerprintOf(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

/** Situação de validade/prazo é derivada; "a_vencer" exige regra registrada. */
export function deriveTemporalSituation({ record, dateField, rule = null, baseDate = todayIso(), missing = "data_ausente" }) {
  if (!record) return { situation: missing, source: null, base_date: baseDate, alert_rule_absence: rule ? null : "sem_regra_de_antecedencia" };
  const due = dateOnly(record[dateField]);
  const base = {
    record_id: record.id ?? null, due_date: due, declared_source: record.source ?? null,
    source_reference: record.source_reference ?? null, base_date: baseDate,
  };
  if (record.superseded_at) return { ...base, situation: "substituido", superseded_at: record.superseded_at };
  if (!due) return { ...base, situation: "sem_data_declarada" };
  if (due < baseDate) return { ...base, situation: "vencido", days_overdue: daysBetween(due, baseDate) };
  if (!rule) return {
    ...base, situation: "vigente", alert: null, alert_rule_absence: "sem_regra_de_antecedencia",
    note: "Sem regra registrada o sistema não calcula limiar de alerta.",
  };
  const days = Number(rule.days_before), threshold = addDays(baseDate, days);
  return {
    ...base, situation: due <= threshold ? "a_vencer" : "vigente",
    alert: { rule_id: rule.id ?? null, days_before: days, threshold_date: threshold },
    days_remaining: daysBetween(baseDate, due),
  };
}

export function deriveQuotationSituation({ quotation, validity = null, rule = null, baseDate = todayIso() }) {
  if (!quotation) return { situation: "cotacao_inexistente", base_date: baseDate };
  const temporal = deriveTemporalSituation({ record: validity, dateField: "valid_until", rule, baseDate, missing: "validade_ausente" });
  if (QUOTATION_TERMINAL_STATUSES.includes(String(quotation.status))) {
    return { situation: "encerrada", status: quotation.status, terminal: true, validity: temporal, base_date: baseDate };
  }
  if (temporal.situation === "vencido") return { situation: "validade_vencida", status: quotation.status, terminal: false, validity: temporal, base_date: baseDate };
  return { situation: "em_andamento", status: quotation.status, terminal: false, validity: temporal, base_date: baseDate };
}

export function deriveOrderSituation({ order, deadline = null, rule = null, baseDate = todayIso() }) {
  if (!order) return { situation: "pedido_inexistente", base_date: baseDate };
  const temporal = deriveTemporalSituation({ record: deadline, dateField: "due_date", rule, baseDate, missing: "prazo_ausente" });
  if (ORDER_TERMINAL_STATUSES.includes(String(order.status))) return { situation: "encerrado", status: order.status, terminal: true, deadline: temporal, base_date: baseDate };
  if (temporal.situation === "vencido") return { situation: "prazo_vencido", status: order.status, terminal: false, deadline: temporal, base_date: baseDate };
  return { situation: "em_andamento", status: order.status, terminal: false, deadline: temporal, base_date: baseDate };
}

function quotationProjection(row) {
  if (!row) return null;
  return {
    id: row.id, protocol: row.protocol, supplier_id: row.supplier_id, supplier_name: row.supplier_name ?? null,
    product_id: row.product_id, product_name: row.product_name ?? null, quantity: Number(row.quantity),
    unit_price_cents: Number(row.unit_price_cents), total_price_cents: Number(row.total_price_cents),
    status: row.status, notes: row.notes ?? null, origin: row.origin,
    decision: row.decision ?? null, decision_justification: row.decision_justification ?? null,
    decision_recorded_at: row.decision_recorded_at ?? null,
    decision_recorded_by_identity: row.decision_recorded_by_identity ?? null,
    created_by_identity: row.created_by_identity ?? null, created_at: row.created_at, updated_at: row.updated_at,
    legacy_is_visible_to_supplier: Boolean(row.is_visible_to_supplier),
  };
}
function orderProjection(row) {
  if (!row) return null;
  return {
    id: row.id, protocol: row.protocol, quotation_id: row.quotation_id,
    supplier_id: row.supplier_id, supplier_name: row.supplier_name ?? null,
    product_id: row.product_id, product_name: row.product_name ?? null,
    quantity: Number(row.quantity), unit_price_cents: Number(row.unit_price_cents), total_price_cents: Number(row.total_price_cents),
    status: row.status, notes: row.notes ?? null, created_by_identity: row.created_by_identity,
    created_at: row.created_at, updated_at: row.updated_at, closed_at: row.closed_at ?? null,
    closed_by_identity: row.closed_by_identity ?? null,
  };
}

export function createExtSupplierApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  const roleOf = session => String(session?.role || session?.userRole || "").toLowerCase();

  async function guard(req, res, { write = false } = {}) {
    let session = null;
    try { session = await requireSession(req); } catch { session = null; }
    if (!session) { json(res, 401, { error: "unauthorized" }); return null; }
    const roles = write ? SUPPLIER_WRITE_ROLES : SUPPLIER_READ_ROLES;
    if (!roles.includes(roleOf(session))) { json(res, 403, { error: "forbidden_role" }); return null; }
    if (write && !sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
    if (write && !UUID_PATTERN.test(String(session.identityId || ""))) { json(res, 401, { error: "unauthorized" }); return null; }
    return session;
  }

  async function readBody(req) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 32_768) return { tooLarge: true }; chunks.push(chunk); }
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (!body || typeof body !== "object" || Array.isArray(body)) return { invalid: true };
      return { body };
    } catch { return { invalid: true }; }
  }
  function idempotencyKeyOf(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) { json(res, 400, { error: "idempotency_key_required" }); return null; }
    return key;
  }
  function protocol(prefix) {
    const d = new Date();
    const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const suffix = createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 4).toUpperCase();
    return `${prefix}-${stamp}-${suffix}`;
  }

  async function insertEvent(client, { quotationId, orderId = null, type, summary, payload, key, fingerprint, identityId }) {
    await client.query(
      `INSERT INTO ext_supplier_portal_events
         (quotation_id,order_id,event_type,summary,payload,idempotency_key,request_fingerprint,created_by_identity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [quotationId, orderId, type, summary, JSON.stringify(payload ?? {}), key, fingerprint, identityId],
    );
  }

  async function runMutation(res, { session, key, fingerprint, auditAction, work, onReplay, onConflict }) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const replay = await client.query(
        `SELECT * FROM ext_supplier_portal_events WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE`,
        [session.identityId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) {
          await client.query("ROLLBACK"); return json(res, 409, { error: "idempotency_key_reused" });
        }
        const result = await onReplay(client, replay.rows[0]);
        await client.query("COMMIT"); return json(res, 200, { ...result, replayed: true });
      }
      const outcome = await work(client);
      if (outcome.deny) { await client.query("ROLLBACK"); return json(res, outcome.deny.code, outcome.deny.body); }
      try {
        await client.query(`INSERT INTO audit_log (action,actor,target,meta) VALUES ($1,$2,$3,$4)`, [
          auditAction, session.identityId, outcome.auditTarget, JSON.stringify(outcome.auditMeta ?? {}),
        ]);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("EXT-04 audit unavailable", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "audit_unavailable" });
      }
      await client.query("COMMIT"); return json(res, outcome.code, outcome.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error && typeof error === "object" && error.code === "23505") {
        if (/idempotency/i.test(String(error.constraint || error.detail || ""))) {
          try {
            const raced = await client.query(`SELECT * FROM ext_supplier_portal_events WHERE created_by_identity=$1 AND idempotency_key=$2`, [session.identityId, key]);
            if (raced.rows[0]) {
              if (raced.rows[0].request_fingerprint !== fingerprint) return json(res, 409, { error: "idempotency_key_reused" });
              return json(res, 200, { ...(await onReplay(client, raced.rows[0])), replayed: true });
            }
          } catch {}
        }
        const handled = onConflict?.(error);
        if (handled) return json(res, handled.code, handled.body);
      }
      console.error("EXT-04 mutation failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "supplier_journey_unavailable" });
    } finally { client?.release(); }
  }

  async function currentRule(db, quotationId) {
    const { rows } = await db.query(`SELECT * FROM ext_supplier_alert_rules WHERE quotation_id=$1 LIMIT 1`, [quotationId]);
    return rows[0] ?? null;
  }
  async function currentValidity(db, quotationId) {
    const { rows } = await db.query(`SELECT * FROM ext_supplier_quotation_validities WHERE quotation_id=$1 AND superseded_at IS NULL LIMIT 1`, [quotationId]);
    return rows[0] ?? null;
  }
  async function currentDeadline(db, orderId) {
    const { rows } = await db.query(`SELECT * FROM ext_supplier_order_deadlines WHERE order_id=$1 AND superseded_at IS NULL LIMIT 1`, [orderId]);
    return rows[0] ?? null;
  }

  async function handleReferences(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res); if (!session) return;
    try {
      const [suppliers, products] = await Promise.all([
        pool.query(`SELECT id,name,category FROM ast_suppliers WHERE is_active=true ORDER BY name LIMIT 200`),
        pool.query(`SELECT id,sku,name,supplier_id,unit_measure FROM ast_products WHERE is_active=true ORDER BY name LIMIT 500`),
      ]);
      return json(res, 200, {
        suppliers: suppliers.rows, products: products.rows,
        source: { suppliers: SUPPLIER_SOURCES.suppliers, products: SUPPLIER_SOURCES.products },
        external_actor_boundary: EXTERNAL_ACTOR_BOUNDARY,
      });
    } catch (error) {
      console.error("EXT-04 references read failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "supplier_journey_unavailable" });
    }
  }

  async function handleQuotations(req, res, { legacyAlias = false } = {}) {
    if (req.method !== "GET") {
      const session = await guard(req, res, { write: true }); if (!session) return;
      if (legacyAlias) return json(res, 410, { error: "legacy_mutation_retired", canonical: "/api/ext/supplier/quotations" });
      return json(res, 405, { error: "method_not_allowed" });
    }
    const session = await guard(req, res); if (!session) return;
    try {
      const { rows } = await pool.query(
        `SELECT q.*,s.name supplier_name,p.name product_name
           FROM ext_supplier_portal_quotations q
           LEFT JOIN ast_suppliers s ON s.id=q.supplier_id
           LEFT JOIN ast_products p ON p.id=q.product_id
          ORDER BY q.created_at DESC LIMIT 200`,
      );
      const baseDate = todayIso();
      const quotations = await Promise.all(rows.map(async row => {
        const [validity, rule] = await Promise.all([currentValidity(pool, row.id), currentRule(pool, row.id)]);
        const quotation = quotationProjection(row);
        return { ...quotation, derived: deriveQuotationSituation({ quotation, validity, rule, baseDate }) };
      }));
      const payload = {
        quotations, source: SUPPLIER_SOURCES.quotations, base_date: baseDate,
        volume_condition: VOLUME_CONDITION, external_actor_boundary: EXTERNAL_ACTOR_BOUNDARY,
        document_boundary: DOCUMENT_BOUNDARY, empty_state: quotations.length ? null : EMPTY_QUOTATIONS,
      };
      if (legacyAlias) { payload.items = quotations; payload.canonical = "/api/ext/supplier/quotations"; }
      return json(res, 200, payload);
    } catch (error) {
      console.error("EXT-04 quotations read failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "supplier_journey_unavailable" });
    }
  }

  async function handleCreateQuotation(req, res, supplierId, productId) {
    if (!UUID_PATTERN.test(String(supplierId)) || !UUID_PATTERN.test(String(productId))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true }); if (!session) return;
    const parsed = await readBody(req);
    if (parsed.tooLarge) return json(res, 413, { error: "body_too_large" });
    if (parsed.invalid) return json(res, 400, { error: "invalid_request" });
    const quantity = parsed.body.quantity, unitPrice = parsed.body.unit_price_cents;
    const notes = typeof parsed.body.notes === "string" ? parsed.body.notes.trim() : "";
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) return json(res, 400, { error: "invalid_quantity" });
    if (!Number.isInteger(unitPrice) || unitPrice < 0 || unitPrice > Number.MAX_SAFE_INTEGER) return json(res, 400, { error: "invalid_unit_price_cents" });
    if (notes && (notes.length < 10 || notes.length > 1000)) return json(res, 400, { error: "invalid_notes" });
    const total = quantity * unitPrice;
    if (!Number.isSafeInteger(total)) return json(res, 400, { error: "invalid_total_price_cents" });
    const key = idempotencyKeyOf(req, res); if (!key) return;
    const fingerprint = fingerprintOf({ op: "quotation_create", supplierId, productId, quantity, unitPrice, notes });
    return runMutation(res, {
      session, key, fingerprint, auditAction: "ext_supplier_quotation_create",
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT q.*,s.name supplier_name,p.name product_name FROM ext_supplier_portal_quotations q LEFT JOIN ast_suppliers s ON s.id=q.supplier_id LEFT JOIN ast_products p ON p.id=q.product_id WHERE q.id=$1`, [event.quotation_id]);
        return { quotation: quotationProjection(rows[0]) };
      },
      work: async client => {
        const refs = await client.query(
          `SELECT s.id supplier_id,s.is_active supplier_active,p.id product_id,p.is_active product_active,p.supplier_id product_supplier_id
             FROM ast_suppliers s CROSS JOIN ast_products p WHERE s.id=$1 AND p.id=$2 FOR UPDATE`,
          [supplierId, productId],
        );
        if (!refs.rows[0]) return { deny: { code: 404, body: { error: "supplier_or_product_not_found" } } };
        if (!refs.rows[0].supplier_active || !refs.rows[0].product_active) return { deny: { code: 409, body: { error: "supplier_or_product_inactive" } } };
        if (refs.rows[0].product_supplier_id !== supplierId) return { deny: { code: 409, body: { error: "product_not_linked_to_supplier" } } };
        const quoteProtocol = protocol("FORN-EXT");
        const { rows } = await client.query(
          `INSERT INTO ext_supplier_portal_quotations
             (protocol,supplier_id,product_id,quantity,unit_price_cents,total_price_cents,notes,is_visible_to_supplier,origin,created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false,'jornada_canonica',$8) RETURNING *`,
          [quoteProtocol, supplierId, productId, quantity, unitPrice, total, notes || null, session.identityId],
        );
        await insertEvent(client, { quotationId: rows[0].id, type: "cotacao_criada", summary: `Cotação ${quoteProtocol} criada pela equipe.`, payload: { supplier_id: supplierId, product_id: productId, quantity, unit_price_cents: unitPrice, total_price_cents: total }, key, fingerprint, identityId: session.identityId });
        return { code: 201, body: { quotation: quotationProjection(rows[0]), volume_condition: VOLUME_CONDITION, external_actor_boundary: EXTERNAL_ACTOR_BOUNDARY }, auditTarget: rows[0].id, auditMeta: { protocol: quoteProtocol, supplier_id: supplierId, product_id: productId } };
      },
    });
  }

  async function handleQuotationById(req, res, quotationId) {
    if (!UUID_PATTERN.test(String(quotationId))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res); if (!session) return;
    try {
      const [quote, validity, rule, documents, orders] = await Promise.all([
        pool.query(`SELECT q.*,s.name supplier_name,p.name product_name FROM ext_supplier_portal_quotations q LEFT JOIN ast_suppliers s ON s.id=q.supplier_id LEFT JOIN ast_products p ON p.id=q.product_id WHERE q.id=$1`, [quotationId]),
        pool.query(`SELECT * FROM ext_supplier_quotation_validities WHERE quotation_id=$1 ORDER BY registered_at DESC`, [quotationId]),
        pool.query(`SELECT * FROM ext_supplier_alert_rules WHERE quotation_id=$1 LIMIT 1`, [quotationId]),
        pool.query(`SELECT * FROM ext_supplier_portal_documents WHERE quotation_id=$1 ORDER BY version DESC NULLS LAST,created_at DESC`, [quotationId]),
        pool.query(`SELECT * FROM ext_supplier_portal_orders WHERE quotation_id=$1`, [quotationId]),
      ]);
      if (!quote.rows[0]) return json(res, 404, { error: "quotation_not_found" });
      const quotation = quotationProjection(quote.rows[0]), activeValidity = validity.rows.find(v => !v.superseded_at) ?? null, baseDate = todayIso();
      return json(res, 200, {
        quotation: { ...quotation, derived: deriveQuotationSituation({ quotation, validity: activeValidity, rule: rule.rows[0] ?? null, baseDate }) },
        validities: validity.rows.map(v => ({ ...v, valid_until: dateOnly(v.valid_until) })),
        alert_rule: rule.rows[0] ?? null,
        documents: documents.rows.map(d => ({ ...d, situation: d.deactivated_at ? "desativado" : d.superseded_at ? "substituido" : "vigente" })),
        orders: orders.rows.map(orderProjection), base_date: baseDate,
        volume_condition: VOLUME_CONDITION, external_actor_boundary: EXTERNAL_ACTOR_BOUNDARY, document_boundary: DOCUMENT_BOUNDARY,
      });
    } catch (error) {
      console.error("EXT-04 quotation detail failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "supplier_journey_unavailable" });
    }
  }

  async function handleQuotationStatus(req, res, quotationId) {
    if (!UUID_PATTERN.test(String(quotationId))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true }); if (!session) return;
    const parsed = await readBody(req); if (parsed.tooLarge) return json(res, 413, { error: "body_too_large" }); if (parsed.invalid) return json(res, 400, { error: "invalid_request" });
    const status = typeof parsed.body.status === "string" ? parsed.body.status.trim() : "";
    const reason = typeof parsed.body.reason === "string" ? parsed.body.reason.trim() : "";
    if (["aprovado", "rejeitado"].includes(status)) return json(res, 409, { error: "decision_endpoint_required", canonical: `/api/ext/supplier/quotations/${quotationId}/decision` });
    if (!Object.hasOwn(QUOTATION_STATUS_TRANSITIONS, status)) return json(res, 400, { error: "invalid_status" });
    if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });
    const key = idempotencyKeyOf(req, res); if (!key) return;
    const fingerprint = fingerprintOf({ op: "quotation_status", quotationId, status, reason });
    return runMutation(res, {
      session, key, fingerprint, auditAction: "ext_supplier_quotation_status",
      onReplay: async (client, event) => ({ quotation: quotationProjection((await client.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1`, [event.quotation_id])).rows[0]) }),
      work: async client => {
        const current = await client.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1 FOR UPDATE`, [quotationId]);
        if (!current.rows[0]) return { deny: { code: 404, body: { error: "quotation_not_found" } } };
        const previous = String(current.rows[0].status);
        if (!QUOTATION_STATUS_TRANSITIONS[previous]?.includes(status)) return { deny: { code: 409, body: { error: "invalid_status_transition", previous_status: previous, requested_status: status } } };
        const terminal = QUOTATION_TERMINAL_STATUSES.includes(status);
        const { rows } = await client.query(`UPDATE ext_supplier_portal_quotations SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING *`, [quotationId, status]);
        await insertEvent(client, { quotationId, type: "cotacao_status_alterado", summary: `Cotação passou de ${previous} para ${status}.`, payload: { previous_status: previous, next_status: status, reason, terminal }, key, fingerprint, identityId: session.identityId });
        return { code: 200, body: { quotation: quotationProjection(rows[0]) }, auditTarget: quotationId, auditMeta: { previous_status: previous, next_status: status, reason } };
      },
    });
  }

  async function handleQuotationDecision(req, res, quotationId) {
    if (!UUID_PATTERN.test(String(quotationId))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true }); if (!session) return;
    const parsed = await readBody(req); if (parsed.tooLarge) return json(res, 413, { error: "body_too_large" }); if (parsed.invalid) return json(res, 400, { error: "invalid_request" });
    const decision = typeof parsed.body.decision === "string" ? parsed.body.decision.trim() : "";
    const justification = typeof parsed.body.justification === "string" ? parsed.body.justification.trim() : "";
    if (!['aprovada','rejeitada'].includes(decision)) return json(res, 400, { error: "invalid_decision" });
    if (justification.length < 10 || justification.length > 1000) return json(res, 400, { error: "invalid_justification" });
    const key = idempotencyKeyOf(req, res); if (!key) return;
    const fingerprint = fingerprintOf({ op: "quotation_decision", quotationId, decision, justification });
    return runMutation(res, {
      session, key, fingerprint, auditAction: "ext_supplier_quotation_decision",
      onReplay: async (client, event) => ({ quotation: quotationProjection((await client.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1`, [event.quotation_id])).rows[0]) }),
      work: async client => {
        const current = await client.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1 FOR UPDATE`, [quotationId]);
        if (!current.rows[0]) return { deny: { code: 404, body: { error: "quotation_not_found" } } };
        if (current.rows[0].decision_recorded_at) return { deny: { code: 409, body: { error: "decision_already_recorded" } } };
        if (String(current.rows[0].status) !== 'em_analise') return { deny: { code: 409, body: { error: "quotation_not_in_analysis", status: current.rows[0].status } } };
        const nextStatus = decision === 'aprovada' ? 'aprovado' : 'rejeitado';
        const { rows } = await client.query(
          `UPDATE ext_supplier_portal_quotations SET status=$2,decision=$3,decision_justification=$4,decision_recorded_at=NOW(),decision_recorded_by_identity=$5,updated_at=NOW() WHERE id=$1 RETURNING *`,
          [quotationId, nextStatus, decision, justification, session.identityId],
        );
        await insertEvent(client, { quotationId, type: "cotacao_decidida", summary: `Cotação decidida como ${decision}; decisão final e imutável.`, payload: { decision, justification, next_status: nextStatus }, key, fingerprint, identityId: session.identityId });
        return { code: 200, body: { quotation: quotationProjection(rows[0]) }, auditTarget: quotationId, auditMeta: { decision, next_status: nextStatus } };
      },
    });
  }

  async function handleQuotationValidities(req, res, quotationId) {
    if (!UUID_PATTERN.test(String(quotationId))) return json(res, 400, { error: "invalid_reference" });
    if (req.method === "GET") {
      const session = await guard(req, res); if (!session) return;
      try {
        const quote = await pool.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1`, [quotationId]);
        if (!quote.rows[0]) return json(res, 404, { error: "quotation_not_found" });
        const [validities, rule] = await Promise.all([
          pool.query(`SELECT * FROM ext_supplier_quotation_validities WHERE quotation_id=$1 ORDER BY registered_at DESC`, [quotationId]), currentRule(pool, quotationId),
        ]);
        const baseDate = todayIso();
        return json(res, 200, {
          validities: validities.rows.map(v => ({ ...v, valid_until: dateOnly(v.valid_until), derived: deriveTemporalSituation({ record: v, dateField: 'valid_until', rule, baseDate, missing: 'validade_ausente' }) })),
          active_validity: validities.rows.find(v => !v.superseded_at)?.id ?? null, alert_rule: rule,
          alert_rule_absence: rule ? null : 'sem_regra_de_antecedencia', source: SUPPLIER_SOURCES.validities, base_date: baseDate,
          empty_state: validities.rows.length ? null : 'Validade não informada; nenhuma data é estimada.',
        });
      } catch (error) { console.error("EXT-04 validity read failed", error instanceof Error ? error.message : error); return json(res, 503, { error: "supplier_journey_unavailable" }); }
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true }); if (!session) return;
    const parsed = await readBody(req); if (parsed.tooLarge) return json(res, 413, { error: "body_too_large" }); if (parsed.invalid) return json(res, 400, { error: "invalid_request" });
    const validUntil = typeof parsed.body.valid_until === 'string' ? parsed.body.valid_until.trim() : '';
    const source = typeof parsed.body.source === 'string' ? parsed.body.source.trim() : '';
    const sourceReference = typeof parsed.body.source_reference === 'string' ? parsed.body.source_reference.trim() : '';
    const justification = typeof parsed.body.justification === 'string' ? parsed.body.justification.trim() : '';
    if (!isIsoDate(validUntil)) return json(res, 400, { error: 'invalid_valid_until' });
    if (!VALIDITY_SOURCES.includes(source)) return json(res, 400, { error: 'invalid_source' });
    if (sourceReference && (sourceReference.length < 2 || sourceReference.length > 300)) return json(res, 400, { error: 'invalid_source_reference' });
    if (justification.length < 5 || justification.length > 500) return json(res, 400, { error: 'invalid_justification' });
    const key=idempotencyKeyOf(req,res); if(!key)return; const fingerprint=fingerprintOf({op:'validity_register',quotationId,validUntil,source,sourceReference,justification});
    return runMutation(res,{session,key,fingerprint,auditAction:'ext_supplier_validity_register',
      onReplay:async(client,event)=>({validity:(await client.query(`SELECT * FROM ext_supplier_quotation_validities WHERE quotation_id=$1 AND superseded_at IS NULL`,[event.quotation_id])).rows[0]??null}),
      work:async client=>{const quote=await client.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1 FOR UPDATE`,[quotationId]);if(!quote.rows[0])return{deny:{code:404,body:{error:'quotation_not_found'}}};if(QUOTATION_TERMINAL_STATUSES.includes(String(quote.rows[0].status)))return{deny:{code:409,body:{error:'quotation_closed'}}};if(await currentValidity(client,quotationId))return{deny:{code:409,body:{error:'validity_already_registered'}}};
        const {rows}=await client.query(`INSERT INTO ext_supplier_quotation_validities(quotation_id,valid_until,source,source_reference,justification,registered_by_identity)VALUES($1,$2::date,$3,$4,$5,$6)RETURNING *`,[quotationId,validUntil,source,sourceReference||null,justification,session.identityId]);
        await insertEvent(client,{quotationId,type:'validade_registrada',summary:`Validade registrada até ${validUntil}, fonte ${source}.`,payload:{valid_until:validUntil,source,source_reference:sourceReference||null,justification},key,fingerprint,identityId:session.identityId});
        return{code:201,body:{validity:{...rows[0],valid_until:dateOnly(rows[0].valid_until)},derived:deriveTemporalSituation({record:rows[0],dateField:'valid_until',baseDate:todayIso(),missing:'validade_ausente'}),source:SUPPLIER_SOURCES.validities},auditTarget:rows[0].id,auditMeta:{quotation_id:quotationId,valid_until:validUntil,source}};
      }});
  }

  async function handleValiditySupersede(req,res,validityId){
    if(!UUID_PATTERN.test(String(validityId)))return json(res,400,{error:'invalid_reference'});if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res,{write:true});if(!session)return;
    const parsed=await readBody(req);if(parsed.tooLarge)return json(res,413,{error:'body_too_large'});if(parsed.invalid)return json(res,400,{error:'invalid_request'});
    const validUntil=typeof parsed.body.valid_until==='string'?parsed.body.valid_until.trim():'';const source=typeof parsed.body.source==='string'?parsed.body.source.trim():'';const sourceReference=typeof parsed.body.source_reference==='string'?parsed.body.source_reference.trim():'';const reason=typeof parsed.body.reason==='string'?parsed.body.reason.trim():'';
    if(!isIsoDate(validUntil))return json(res,400,{error:'invalid_valid_until'});if(!VALIDITY_SOURCES.includes(source))return json(res,400,{error:'invalid_source'});if(sourceReference&&(sourceReference.length<2||sourceReference.length>300))return json(res,400,{error:'invalid_source_reference'});if(reason.length<5||reason.length>500)return json(res,400,{error:'invalid_reason'});
    const key=idempotencyKeyOf(req,res);if(!key)return;const fingerprint=fingerprintOf({op:'validity_supersede',validityId,validUntil,source,sourceReference,reason});
    return runMutation(res,{session,key,fingerprint,auditAction:'ext_supplier_validity_supersede',onReplay:async(client,event)=>({validity:(await client.query(`SELECT * FROM ext_supplier_quotation_validities WHERE quotation_id=$1 AND superseded_at IS NULL`,[event.quotation_id])).rows[0]??null}),work:async client=>{
      const old=await client.query(`SELECT * FROM ext_supplier_quotation_validities WHERE id=$1 FOR UPDATE`,[validityId]);if(!old.rows[0])return{deny:{code:404,body:{error:'validity_not_found'}}};if(old.rows[0].superseded_at)return{deny:{code:409,body:{error:'validity_already_superseded'}}};const quotationId=old.rows[0].quotation_id;const quote=await client.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1 FOR UPDATE`,[quotationId]);if(QUOTATION_TERMINAL_STATUSES.includes(String(quote.rows[0]?.status)))return{deny:{code:409,body:{error:'quotation_closed'}}};
      await client.query(`UPDATE ext_supplier_quotation_validities SET superseded_at=NOW(),superseded_by_identity=$2,supersede_reason=$3 WHERE id=$1`,[validityId,session.identityId,reason]);const {rows}=await client.query(`INSERT INTO ext_supplier_quotation_validities(quotation_id,valid_until,source,source_reference,justification,registered_by_identity)VALUES($1,$2::date,$3,$4,$5,$6)RETURNING *`,[quotationId,validUntil,source,sourceReference||null,reason,session.identityId]);await insertEvent(client,{quotationId,type:'validade_substituida',summary:`Validade substituída por ${validUntil}.`,payload:{superseded_validity_id:validityId,valid_until:validUntil,source,reason},key,fingerprint,identityId:session.identityId});return{code:201,body:{superseded_validity_id:validityId,validity:{...rows[0],valid_until:dateOnly(rows[0].valid_until)}},auditTarget:rows[0].id,auditMeta:{quotation_id:quotationId,superseded:validityId}};
    }});
  }

  async function handleAlertRules(req,res,quotationId){
    if(!UUID_PATTERN.test(String(quotationId)))return json(res,400,{error:'invalid_reference'});
    if(req.method==='GET'){const session=await guard(req,res);if(!session)return;try{const quote=await pool.query(`SELECT id FROM ext_supplier_portal_quotations WHERE id=$1`,[quotationId]);if(!quote.rows[0])return json(res,404,{error:'quotation_not_found'});const rule=await currentRule(pool,quotationId);return json(res,200,{alert_rule:rule,alert_rule_absence:rule?null:'sem_regra_de_antecedencia',source:SUPPLIER_SOURCES.alert_rules,base_date:todayIso(),note:rule?null:'Sem regra registrada o sistema não calcula “a vencer”.'});}catch(error){console.error('EXT-04 alert read failed',error instanceof Error?error.message:error);return json(res,503,{error:'supplier_journey_unavailable'});}}
    if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res,{write:true});if(!session)return;const parsed=await readBody(req);if(parsed.tooLarge)return json(res,413,{error:'body_too_large'});if(parsed.invalid)return json(res,400,{error:'invalid_request'});const days=parsed.body.days_before,justification=typeof parsed.body.justification==='string'?parsed.body.justification.trim():'';if(!Number.isInteger(days)||days<1||days>365)return json(res,400,{error:'invalid_days_before'});if(justification.length<5||justification.length>500)return json(res,400,{error:'invalid_justification'});const key=idempotencyKeyOf(req,res);if(!key)return;const fingerprint=fingerprintOf({op:'alert_rule_register',quotationId,days,justification});return runMutation(res,{session,key,fingerprint,auditAction:'ext_supplier_alert_rule_register',onReplay:async(client,event)=>({alert_rule:await currentRule(client,event.quotation_id)}),work:async client=>{const quote=await client.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1 FOR UPDATE`,[quotationId]);if(!quote.rows[0])return{deny:{code:404,body:{error:'quotation_not_found'}}};if(await currentRule(client,quotationId))return{deny:{code:409,body:{error:'alert_rule_already_registered'}}};const {rows}=await client.query(`INSERT INTO ext_supplier_alert_rules(quotation_id,days_before,justification,created_by_identity)VALUES($1,$2,$3,$4)RETURNING *`,[quotationId,days,justification,session.identityId]);await insertEvent(client,{quotationId,type:'regra_alerta_registrada',summary:`Antecedência explícita de ${days} dia(s) registrada.`,payload:{days_before:days,justification},key,fingerprint,identityId:session.identityId});return{code:201,body:{alert_rule:rows[0],source:SUPPLIER_SOURCES.alert_rules},auditTarget:rows[0].id,auditMeta:{quotation_id:quotationId,days_before:days}};}});
  }

  async function registerDocument(req,res,{quotationId=null,supersedesId=null}){
    if(quotationId&&!UUID_PATTERN.test(String(quotationId)))return json(res,400,{error:'invalid_reference'});if(supersedesId&&!UUID_PATTERN.test(String(supersedesId)))return json(res,400,{error:'invalid_reference'});if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res,{write:true});if(!session)return;const parsed=await readBody(req);if(parsed.tooLarge)return json(res,413,{error:'body_too_large'});if(parsed.invalid)return json(res,400,{error:'invalid_request'});
    const type=typeof parsed.body.document_type==='string'?parsed.body.document_type.trim():'';const fileName=typeof parsed.body.file_name==='string'?parsed.body.file_name.trim():'';const fileUrl=typeof parsed.body.file_url==='string'?parsed.body.file_url.trim():'';const storageKey=typeof parsed.body.storage_key==='string'?parsed.body.storage_key.trim():'';
    if(type.length<3||type.length>100)return json(res,400,{error:'invalid_document_type'});if(fileName.length<1||fileName.length>500)return json(res,400,{error:'invalid_file_name'});if(fileUrl.length<5||fileUrl.length>1000)return json(res,400,{error:'invalid_file_url'});if(storageKey.length<5||storageKey.length>500)return json(res,400,{error:'invalid_storage_key'});const key=idempotencyKeyOf(req,res);if(!key)return;const fingerprint=fingerprintOf({op:supersedesId?'document_version':'document_register',quotationId,supersedesId,type,fileName,fileUrl,storageKey});
    return runMutation(res,{session,key,fingerprint,auditAction:'ext_supplier_document_register',onReplay:async(client,event)=>({document:(await client.query(`SELECT * FROM ext_supplier_portal_documents WHERE quotation_id=$1 ORDER BY version DESC NULLS LAST LIMIT 1`,[event.quotation_id])).rows[0]??null,document_boundary:DOCUMENT_BOUNDARY}),work:async client=>{
      let old=null;if(supersedesId){const found=await client.query(`SELECT * FROM ext_supplier_portal_documents WHERE id=$1 FOR UPDATE`,[supersedesId]);if(!found.rows[0])return{deny:{code:404,body:{error:'document_not_found'}}};old=found.rows[0];quotationId=old.quotation_id;if(old.superseded_at)return{deny:{code:409,body:{error:'document_already_superseded'}}};if(old.deactivated_at)return{deny:{code:409,body:{error:'document_deactivated'}}};}
      const quote=await client.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1 FOR UPDATE`,[quotationId]);if(!quote.rows[0])return{deny:{code:404,body:{error:'quotation_not_found'}}};if(QUOTATION_TERMINAL_STATUSES.includes(String(quote.rows[0].status))&&String(quote.rows[0].status)!=='aprovado')return{deny:{code:409,body:{error:'quotation_closed'}}};
      const max=await client.query(`SELECT COALESCE(MAX(version),0)::int max_version FROM ext_supplier_portal_documents WHERE quotation_id=$1 AND origin='jornada_canonica'`,[quotationId]);const version=Number(max.rows[0].max_version)+1;const {rows}=await client.query(`INSERT INTO ext_supplier_portal_documents(quotation_id,file_name,file_url,storage_key,created_by_identity,origin,document_type,version,supersedes_document_id)VALUES($1,$2,$3,$4,$5,'jornada_canonica',$6,$7,$8)RETURNING *`,[quotationId,fileName,fileUrl,storageKey,session.identityId,type,version,old?.id??null]);if(old)await client.query(`UPDATE ext_supplier_portal_documents SET superseded_at=NOW() WHERE id=$1`,[old.id]);await insertEvent(client,{quotationId,type:'documento_registrado',summary:`Referência documental ${type}, versão ${version}, registrada.`,payload:{document_type:type,version,supersedes_document_id:old?.id??null,storage_kind:'referencia_declarada_sem_upload'},key,fingerprint,identityId:session.identityId});return{code:201,body:{document:{...rows[0],situation:'vigente'},superseded_document_id:old?.id??null,document_boundary:DOCUMENT_BOUNDARY},auditTarget:rows[0].id,auditMeta:{quotation_id:quotationId,document_type:type,version}};
    },onConflict:error=>String(error.constraint||'').includes('storage_key')?{code:409,body:{error:'duplicate_storage_key'}}:null});
  }

  async function handleDocuments(req,res,quotationId){
    if(!UUID_PATTERN.test(String(quotationId)))return json(res,400,{error:'invalid_reference'});if(req.method==='POST')return registerDocument(req,res,{quotationId});if(req.method!=='GET')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res);if(!session)return;try{const quote=await pool.query(`SELECT id FROM ext_supplier_portal_quotations WHERE id=$1`,[quotationId]);if(!quote.rows[0])return json(res,404,{error:'quotation_not_found'});const {rows}=await pool.query(`SELECT * FROM ext_supplier_portal_documents WHERE quotation_id=$1 ORDER BY version DESC NULLS LAST,created_at DESC`,[quotationId]);return json(res,200,{documents:rows.map(d=>({...d,situation:d.deactivated_at?'desativado':d.superseded_at?'substituido':'vigente'})),source:SUPPLIER_SOURCES.documents,document_boundary:DOCUMENT_BOUNDARY,empty_state:rows.length?null:'Nenhuma referência documental registrada; nenhum arquivo é presumido.'});}catch(error){console.error('EXT-04 docs read failed',error instanceof Error?error.message:error);return json(res,503,{error:'supplier_journey_unavailable'});}
  }
  async function handleDocumentVersion(req,res,documentId){return registerDocument(req,res,{supersedesId:documentId});}
  async function handleDocumentDeactivate(req,res,documentId){
    if(!UUID_PATTERN.test(String(documentId)))return json(res,400,{error:'invalid_reference'});if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res,{write:true});if(!session)return;const parsed=await readBody(req);if(parsed.tooLarge)return json(res,413,{error:'body_too_large'});if(parsed.invalid)return json(res,400,{error:'invalid_request'});const reason=typeof parsed.body.reason==='string'?parsed.body.reason.trim():'';if(reason.length<5||reason.length>500)return json(res,400,{error:'invalid_reason'});const key=idempotencyKeyOf(req,res);if(!key)return;const fingerprint=fingerprintOf({op:'document_deactivate',documentId,reason});return runMutation(res,{session,key,fingerprint,auditAction:'ext_supplier_document_deactivate',onReplay:async client=>({document:(await client.query(`SELECT * FROM ext_supplier_portal_documents WHERE id=$1`,[documentId])).rows[0]??null}),work:async client=>{const current=await client.query(`SELECT * FROM ext_supplier_portal_documents WHERE id=$1 FOR UPDATE`,[documentId]);if(!current.rows[0])return{deny:{code:404,body:{error:'document_not_found'}}};if(current.rows[0].deactivated_at)return{deny:{code:409,body:{error:'document_already_deactivated'}}};const {rows}=await client.query(`UPDATE ext_supplier_portal_documents SET deactivated_at=NOW(),deactivated_by_identity=$2,deactivate_reason=$3 WHERE id=$1 RETURNING *`,[documentId,session.identityId,reason]);await insertEvent(client,{quotationId:current.rows[0].quotation_id,type:'documento_desativado',summary:`Documento versão ${current.rows[0].version} desativado sem apagar histórico.`,payload:{document_id:documentId,reason},key,fingerprint,identityId:session.identityId});return{code:200,body:{document:{...rows[0],situation:'desativado'}},auditTarget:documentId,auditMeta:{quotation_id:current.rows[0].quotation_id,reason}};}});
  }

  async function handleOrders(req,res){
    if(req.method!=='GET')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res);if(!session)return;try{const {rows}=await pool.query(`SELECT o.*,s.name supplier_name,p.name product_name FROM ext_supplier_portal_orders o LEFT JOIN ast_suppliers s ON s.id=o.supplier_id LEFT JOIN ast_products p ON p.id=o.product_id ORDER BY o.created_at DESC LIMIT 200`);const baseDate=todayIso();const orders=await Promise.all(rows.map(async row=>{const [deadline,rule]=await Promise.all([currentDeadline(pool,row.id),currentRule(pool,row.quotation_id)]);const order=orderProjection(row);return{...order,derived:deriveOrderSituation({order,deadline,rule,baseDate})};}));return json(res,200,{orders,source:SUPPLIER_SOURCES.orders,base_date:baseDate,volume_condition:VOLUME_CONDITION,external_actor_boundary:EXTERNAL_ACTOR_BOUNDARY,empty_state:orders.length?null:EMPTY_ORDERS});}catch(error){console.error('EXT-04 orders read failed',error instanceof Error?error.message:error);return json(res,503,{error:'supplier_journey_unavailable'});}
  }
  async function handleCreateOrder(req,res,quotationId){
    if(!UUID_PATTERN.test(String(quotationId)))return json(res,400,{error:'invalid_reference'});if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res,{write:true});if(!session)return;const parsed=await readBody(req);if(parsed.tooLarge)return json(res,413,{error:'body_too_large'});if(parsed.invalid)return json(res,400,{error:'invalid_request'});const notes=typeof parsed.body.notes==='string'?parsed.body.notes.trim():'';if(notes&&(notes.length<10||notes.length>1000))return json(res,400,{error:'invalid_notes'});const key=idempotencyKeyOf(req,res);if(!key)return;const fingerprint=fingerprintOf({op:'order_create',quotationId,notes});return runMutation(res,{session,key,fingerprint,auditAction:'ext_supplier_order_create',onReplay:async(client,event)=>({order:orderProjection((await client.query(`SELECT * FROM ext_supplier_portal_orders WHERE id=$1`,[event.order_id])).rows[0])}),work:async client=>{const quote=await client.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1 FOR UPDATE`,[quotationId]);if(!quote.rows[0])return{deny:{code:404,body:{error:'quotation_not_found'}}};if(quote.rows[0].status!=='aprovado'||quote.rows[0].decision!=='aprovada')return{deny:{code:409,body:{error:'approved_quotation_required'}}};const existing=await client.query(`SELECT id FROM ext_supplier_portal_orders WHERE quotation_id=$1`,[quotationId]);if(existing.rows[0])return{deny:{code:409,body:{error:'order_already_exists',order_id:existing.rows[0].id}}};const orderProtocol=protocol('PED-FORN');const {rows}=await client.query(`INSERT INTO ext_supplier_portal_orders(protocol,quotation_id,supplier_id,product_id,quantity,unit_price_cents,total_price_cents,notes,created_by_identity)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)RETURNING *`,[orderProtocol,quotationId,quote.rows[0].supplier_id,quote.rows[0].product_id,quote.rows[0].quantity,quote.rows[0].unit_price_cents,quote.rows[0].total_price_cents,notes||null,session.identityId]);await insertEvent(client,{quotationId,orderId:rows[0].id,type:'pedido_criado',summary:`Pedido ${orderProtocol} derivado de cotação aprovada.`,payload:{derived_from_quotation:true},key,fingerprint,identityId:session.identityId});return{code:201,body:{order:orderProjection(rows[0]),external_actor_boundary:EXTERNAL_ACTOR_BOUNDARY},auditTarget:rows[0].id,auditMeta:{quotation_id:quotationId,protocol:orderProtocol}};},onConflict:error=>String(error.constraint||'').includes('quotation')?{code:409,body:{error:'order_already_exists'}}:null});
  }
  async function handleOrderStatus(req,res,orderId){
    if(!UUID_PATTERN.test(String(orderId)))return json(res,400,{error:'invalid_reference'});if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res,{write:true});if(!session)return;const parsed=await readBody(req);if(parsed.tooLarge)return json(res,413,{error:'body_too_large'});if(parsed.invalid)return json(res,400,{error:'invalid_request'});const status=typeof parsed.body.status==='string'?parsed.body.status.trim():'';const reason=typeof parsed.body.reason==='string'?parsed.body.reason.trim():'';if(!Object.hasOwn(ORDER_STATUS_TRANSITIONS,status))return json(res,400,{error:'invalid_status'});if(reason.length<5||reason.length>500)return json(res,400,{error:'invalid_reason'});const key=idempotencyKeyOf(req,res);if(!key)return;const fingerprint=fingerprintOf({op:'order_status',orderId,status,reason});return runMutation(res,{session,key,fingerprint,auditAction:'ext_supplier_order_status',onReplay:async(client,event)=>({order:orderProjection((await client.query(`SELECT * FROM ext_supplier_portal_orders WHERE id=$1`,[event.order_id])).rows[0])}),work:async client=>{const current=await client.query(`SELECT * FROM ext_supplier_portal_orders WHERE id=$1 FOR UPDATE`,[orderId]);if(!current.rows[0])return{deny:{code:404,body:{error:'order_not_found'}}};const previous=current.rows[0].status;if(!ORDER_STATUS_TRANSITIONS[previous]?.includes(status))return{deny:{code:409,body:{error:'invalid_status_transition',previous_status:previous,requested_status:status}}};const terminal=ORDER_TERMINAL_STATUSES.includes(status);const {rows}=await client.query(`UPDATE ext_supplier_portal_orders SET status=$2,closed_at=CASE WHEN $3 THEN NOW() ELSE NULL END,closed_by_identity=CASE WHEN $3 THEN $4::uuid ELSE NULL END WHERE id=$1 RETURNING *`,[orderId,status,terminal,session.identityId]);await insertEvent(client,{quotationId:current.rows[0].quotation_id,orderId,type:'pedido_status_alterado',summary:`Pedido passou de ${previous} para ${status}.`,payload:{previous_status:previous,next_status:status,reason,terminal},key,fingerprint,identityId:session.identityId});return{code:200,body:{order:orderProjection(rows[0])},auditTarget:orderId,auditMeta:{previous_status:previous,next_status:status,reason}};}});
  }

  async function handleOrderDeadlines(req,res,orderId){
    if(!UUID_PATTERN.test(String(orderId)))return json(res,400,{error:'invalid_reference'});if(req.method==='GET'){const session=await guard(req,res);if(!session)return;try{const order=await pool.query(`SELECT * FROM ext_supplier_portal_orders WHERE id=$1`,[orderId]);if(!order.rows[0])return json(res,404,{error:'order_not_found'});const [deadlines,rule]=await Promise.all([pool.query(`SELECT * FROM ext_supplier_order_deadlines WHERE order_id=$1 ORDER BY registered_at DESC`,[orderId]),currentRule(pool,order.rows[0].quotation_id)]);const baseDate=todayIso();return json(res,200,{deadlines:deadlines.rows.map(d=>({...d,due_date:dateOnly(d.due_date),derived:deriveTemporalSituation({record:d,dateField:'due_date',rule,baseDate,missing:'prazo_ausente'})})),alert_rule:rule,alert_rule_absence:rule?null:'sem_regra_de_antecedencia',source:SUPPLIER_SOURCES.order_deadlines,base_date:baseDate,empty_state:deadlines.rows.length?null:'Prazo de entrega ausente; nenhuma data é estimada.'});}catch(error){console.error('EXT-04 deadlines read failed',error instanceof Error?error.message:error);return json(res,503,{error:'supplier_journey_unavailable'});}}
    if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res,{write:true});if(!session)return;const parsed=await readBody(req);if(parsed.tooLarge)return json(res,413,{error:'body_too_large'});if(parsed.invalid)return json(res,400,{error:'invalid_request'});const dueDate=typeof parsed.body.due_date==='string'?parsed.body.due_date.trim():'';const source=typeof parsed.body.source==='string'?parsed.body.source.trim():'';const sourceReference=typeof parsed.body.source_reference==='string'?parsed.body.source_reference.trim():'';const justification=typeof parsed.body.justification==='string'?parsed.body.justification.trim():'';if(!isIsoDate(dueDate))return json(res,400,{error:'invalid_due_date'});if(!ORDER_DEADLINE_SOURCES.includes(source))return json(res,400,{error:'invalid_source'});if(sourceReference&&(sourceReference.length<2||sourceReference.length>300))return json(res,400,{error:'invalid_source_reference'});if(justification.length<5||justification.length>500)return json(res,400,{error:'invalid_justification'});const key=idempotencyKeyOf(req,res);if(!key)return;const fingerprint=fingerprintOf({op:'order_deadline_register',orderId,dueDate,source,sourceReference,justification});return runMutation(res,{session,key,fingerprint,auditAction:'ext_supplier_order_deadline_register',onReplay:async(client,event)=>({deadline:await currentDeadline(client,event.order_id)}),work:async client=>{const order=await client.query(`SELECT * FROM ext_supplier_portal_orders WHERE id=$1 FOR UPDATE`,[orderId]);if(!order.rows[0])return{deny:{code:404,body:{error:'order_not_found'}}};if(ORDER_TERMINAL_STATUSES.includes(order.rows[0].status))return{deny:{code:409,body:{error:'order_closed'}}};if(await currentDeadline(client,orderId))return{deny:{code:409,body:{error:'deadline_already_registered'}}};const {rows}=await client.query(`INSERT INTO ext_supplier_order_deadlines(order_id,due_date,source,source_reference,justification,registered_by_identity)VALUES($1,$2::date,$3,$4,$5,$6)RETURNING *`,[orderId,dueDate,source,sourceReference||null,justification,session.identityId]);await insertEvent(client,{quotationId:order.rows[0].quotation_id,orderId,type:'prazo_pedido_registrado',summary:`Prazo do pedido registrado para ${dueDate}.`,payload:{due_date:dueDate,source,source_reference:sourceReference||null,justification},key,fingerprint,identityId:session.identityId});return{code:201,body:{deadline:{...rows[0],due_date:dateOnly(rows[0].due_date)},derived:deriveTemporalSituation({record:rows[0],dateField:'due_date',baseDate:todayIso(),missing:'prazo_ausente'})},auditTarget:rows[0].id,auditMeta:{order_id:orderId,due_date:dueDate,source}};}});
  }
  async function handleOrderDeadlineSupersede(req,res,deadlineId){
    if(!UUID_PATTERN.test(String(deadlineId)))return json(res,400,{error:'invalid_reference'});if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'});const session=await guard(req,res,{write:true});if(!session)return;const parsed=await readBody(req);if(parsed.tooLarge)return json(res,413,{error:'body_too_large'});if(parsed.invalid)return json(res,400,{error:'invalid_request'});const dueDate=typeof parsed.body.due_date==='string'?parsed.body.due_date.trim():'';const source=typeof parsed.body.source==='string'?parsed.body.source.trim():'';const sourceReference=typeof parsed.body.source_reference==='string'?parsed.body.source_reference.trim():'';const reason=typeof parsed.body.reason==='string'?parsed.body.reason.trim():'';if(!isIsoDate(dueDate))return json(res,400,{error:'invalid_due_date'});if(!ORDER_DEADLINE_SOURCES.includes(source))return json(res,400,{error:'invalid_source'});if(sourceReference&&(sourceReference.length<2||sourceReference.length>300))return json(res,400,{error:'invalid_source_reference'});if(reason.length<5||reason.length>500)return json(res,400,{error:'invalid_reason'});const key=idempotencyKeyOf(req,res);if(!key)return;const fingerprint=fingerprintOf({op:'order_deadline_supersede',deadlineId,dueDate,source,sourceReference,reason});return runMutation(res,{session,key,fingerprint,auditAction:'ext_supplier_order_deadline_supersede',onReplay:async(client,event)=>({deadline:await currentDeadline(client,event.order_id)}),work:async client=>{const old=await client.query(`SELECT * FROM ext_supplier_order_deadlines WHERE id=$1 FOR UPDATE`,[deadlineId]);if(!old.rows[0])return{deny:{code:404,body:{error:'deadline_not_found'}}};if(old.rows[0].superseded_at)return{deny:{code:409,body:{error:'deadline_already_superseded'}}};const order=await client.query(`SELECT * FROM ext_supplier_portal_orders WHERE id=$1 FOR UPDATE`,[old.rows[0].order_id]);if(ORDER_TERMINAL_STATUSES.includes(order.rows[0]?.status))return{deny:{code:409,body:{error:'order_closed'}}};await client.query(`UPDATE ext_supplier_order_deadlines SET superseded_at=NOW(),superseded_by_identity=$2,supersede_reason=$3 WHERE id=$1`,[deadlineId,session.identityId,reason]);const {rows}=await client.query(`INSERT INTO ext_supplier_order_deadlines(order_id,due_date,source,source_reference,justification,registered_by_identity)VALUES($1,$2::date,$3,$4,$5,$6)RETURNING *`,[old.rows[0].order_id,dueDate,source,sourceReference||null,reason,session.identityId]);await insertEvent(client,{quotationId:order.rows[0].quotation_id,orderId:order.rows[0].id,type:'prazo_pedido_substituido',summary:`Prazo do pedido substituído por ${dueDate}.`,payload:{superseded_deadline_id:deadlineId,due_date:dueDate,source,reason},key,fingerprint,identityId:session.identityId});return{code:201,body:{superseded_deadline_id:deadlineId,deadline:{...rows[0],due_date:dateOnly(rows[0].due_date)}},auditTarget:rows[0].id,auditMeta:{order_id:order.rows[0].id,superseded:deadlineId}};}});
  }

  async function handleLegacyQuotations(req,res){return handleQuotations(req,res,{legacyAlias:true});}

  return {handleReferences,handleQuotations,handleCreateQuotation,handleQuotationById,handleQuotationStatus,handleQuotationDecision,handleQuotationValidities,handleValiditySupersede,handleAlertRules,handleDocuments,handleDocumentVersion,handleDocumentDeactivate,handleOrders,handleCreateOrder,handleOrderStatus,handleOrderDeadlines,handleOrderDeadlineSupersede,handleLegacyQuotations};
}
