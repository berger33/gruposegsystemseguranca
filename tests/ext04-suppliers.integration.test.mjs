// EXT-04 — jornada interna de fornecedores por HTTP real + PostgreSQL real.
// SQL só cria fixtures sintéticos, verifica persistência/travas e injeta falha
// de auditoria. Todo veredito funcional vem do servidor HTTP real.
//
// CONDIÇÃO: "se volume justificar" = SEM EVIDÊNCIA no repositório.
// FRONTEIRA: não há ator/login/sessão/canal/upload/aceite de fornecedor; este
// gate prova apenas a jornada interna de staff e não finge o ator externo.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE_DB = process.env.QA_EXT04_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");

test("EXT-04 gate: banco real presente — skip silencioso é proibido", () => {
  if (!REQUIRE_DB) return;
  assert.ok(RUN, "o gate exige RUN_DATABASE_INTEGRATION=1 e DATABASE_URL reais; sem eles reprova em vez de pular");
});

let server, baseUrl, pool, ti, rh, cookieTi, cookieRh;
const key = tag => `ext04-${tag}-${randomUUID()}`;
const today = offset => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

async function waitForServer(url) {
  const end = Date.now() + 60_000;
  while (Date.now() < end) {
    try { const response = await fetch(`${url}/api/admin/session`); if ([200, 401].includes(response.status)) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error("server_did_not_start");
}
async function makeStaff(role) {
  const id = randomUUID(), email = `qa-ext04-${role}-${id.slice(0, 8)}@exemplo.invalid`, password = "Senha-Sintetica-9!";
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`, [id, email, `QA EXT-04 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]);
  return { id, email, password, role };
}
async function login(staff) {
  const response = await fetch(`${baseUrl}/api/admin/session`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl }, body: JSON.stringify({ email: staff.email, password: staff.password }), redirect: "manual" });
  assert.equal(response.status, 200);
  const cookie = (response.headers.getSetCookie?.() || []).find(value => value.startsWith("seg_admin_session="));
  assert.ok(cookie); return cookie.split(";")[0];
}
async function catalog(tag = "catalog") {
  const supplierId = randomUUID(), productId = randomUUID(), suffix = `${tag}-${supplierId.slice(0, 8)}`;
  await pool.query(`INSERT INTO ast_suppliers(id,name,document,category,created_by_identity) VALUES($1,$2,$3,'equipamento',$4)`, [supplierId, `Fornecedor sintético ${suffix}`, `SYN-${supplierId.slice(0, 8)}`, ti.id]);
  await pool.query(`INSERT INTO ast_products(id,sku,name,description,category,unit_measure,supplier_id,created_by_identity) VALUES($1,$2,$3,$4,'equipamento','unidade',$5,$6)`, [productId, `SKU-${productId.slice(0, 8)}`, `Produto sintético ${suffix}`, "Produto sintético exclusivo do gate EXT-04, sem dado real.", supplierId, ti.id]);
  return { supplierId, productId };
}
function get(pathname, cookie) { return fetch(`${baseUrl}${pathname}`, { headers: { accept: "application/json", ...(cookie ? { cookie } : {}) }, redirect: "manual" }); }
function mutate(pathname, { method = "POST", body = {}, cookie = cookieTi, idempotencyKey = key("mutation"), origin = baseUrl } = {}) {
  return fetch(`${baseUrl}${pathname}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) }, body: JSON.stringify(body), redirect: "manual" });
}
async function readJson(response) { const text = await response.text(); try { return { body: JSON.parse(text), text }; } catch { return { body: null, text }; } }
async function createQuote(tag = "quote", overrides = {}) {
  const refs = await catalog(tag), idempotencyKey = key(`quote-${tag}`);
  const response = await mutate(`/api/ext/supplier/suppliers/${refs.supplierId}/products/${refs.productId}/quotations`, { idempotencyKey, body: { quantity: 2, unit_price_cents: 2500, notes: "Cotação sintética criada somente pelo gate EXT-04.", ...overrides } });
  const { body, text } = await readJson(response); assert.equal(response.status, 201, text);
  return { ...refs, quote: body.quotation, idempotencyKey };
}
async function transitionQuote(id, status, tag = status) {
  const response = await mutate(`/api/ext/supplier/quotations/${id}/status`, { idempotencyKey: key(`quote-status-${tag}`), body: { status, reason: `Transição sintética para ${status} no gate EXT-04.` } });
  const { body, text } = await readJson(response); assert.equal(response.status, 200, text); return body.quotation;
}
async function quoteInAnalysis(tag) { const created = await createQuote(tag); await transitionQuote(created.quote.id, "enviado", `${tag}-sent`); await transitionQuote(created.quote.id, "em_analise", `${tag}-analysis`); return created; }
async function approveQuote(tag) {
  const created = await quoteInAnalysis(tag);
  const response = await mutate(`/api/ext/supplier/quotations/${created.quote.id}/decision`, { idempotencyKey: key(`decision-${tag}`), body: { decision: "aprovada", justification: "Preço e condições sintéticos aprovados exclusivamente para o gate." } });
  const { body, text } = await readJson(response); assert.equal(response.status, 200, text); return { ...created, quote: body.quotation };
}
async function createOrder(tag) {
  const approved = await approveQuote(tag);
  const response = await mutate(`/api/ext/supplier/quotations/${approved.quote.id}/orders`, { idempotencyKey: key(`order-${tag}`), body: { notes: "Pedido sintético interno criado somente para o gate EXT-04." } });
  const { body, text } = await readJson(response); assert.equal(response.status, 201, text); return { ...approved, order: body.order };
}

before(async () => {
  if (!RUN) return;
  const port = 3000 + Math.floor(Math.random() * 2000); baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], { cwd: root, env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development", NEXT_DIST_DIR: ".next/integration-ext04", SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2), CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"), SITE_ADMIN_TOKEN_MARCELO: "", SITE_ADMIN_TOKEN_TI: "", SITE_ADMIN_LEGACY_TOKENS: "", QA_PGLITE_ONLY: "", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let logs = ""; server.stdout.on("data", chunk => { logs += chunk; }); server.stderr.on("data", chunk => { logs += chunk; });
  try { await waitForServer(baseUrl); } catch (error) { throw new Error(`${error.message}\n${logs.slice(-3000)}`); }
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  ti = await makeStaff("ti"); rh = await makeStaff("rh"); cookieTi = await login(ti); cookieRh = await login(rh);
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill("SIGTERM"); await new Promise(resolve => setTimeout(resolve, 300)); server.kill("SIGKILL"); }
});

// Autorização e tela real.
test("EXT-04 HTTP: anônimo recebe 401", { skip: !RUN }, async () => { const response = await get("/api/ext/supplier/quotations"); assert.equal(response.status, 401); assert.equal((await response.json()).error, "unauthorized"); });
test("EXT-04 HTTP: papel rh recebe 403 distinto", { skip: !RUN }, async () => {
  const read = await get("/api/ext/supplier/quotations", cookieRh); assert.equal(read.status, 403); assert.equal((await read.json()).error, "forbidden_role");
  const refs = await catalog("rh-denied"); const write = await mutate(`/api/ext/supplier/suppliers/${refs.supplierId}/products/${refs.productId}/quotations`, { cookie: cookieRh, body: { quantity: 1, unit_price_cents: 1 } }); assert.equal(write.status, 403);
});
test("EXT-04 HTTP: mutação exige same-origin", { skip: !RUN }, async () => { const refs = await catalog("origin"); const response = await mutate(`/api/ext/supplier/suppliers/${refs.supplierId}/products/${refs.productId}/quotations`, { origin: "https://atacante.invalid", body: { quantity: 1, unit_price_cents: 1 } }); assert.equal(response.status, 403); assert.equal((await response.json()).error, "origin_forbidden"); });
test("EXT-04 HTTP: mutação exige chave de idempotência", { skip: !RUN }, async () => { const refs = await catalog("missing-key"); const response = await mutate(`/api/ext/supplier/suppliers/${refs.supplierId}/products/${refs.productId}/quotations`, { idempotencyKey: null, body: { quantity: 1, unit_price_cents: 1 } }); assert.equal(response.status, 400); assert.equal((await response.json()).error, "idempotency_key_required"); });
test("EXT-04 UI: /admin/fornecedores é rota real", { skip: !RUN }, async () => { const response = await fetch(`${baseUrl}/admin/fornecedores`); const text = await response.text(); assert.equal(response.status, 200, text.slice(0, 500)); assert.match(text, /Fornecedores|fornecedores/); });

// Condição e fronteira honestas.
test("EXT-04 HTTP: API declara sem evidência de volume e ator externo pendente", { skip: !RUN }, async () => { const response = await get("/api/ext/supplier/quotations", cookieTi); const { body, text } = await readJson(response); assert.equal(response.status, 200, text); assert.equal(body.volume_condition.situacao, "sem_evidencia"); assert.equal(body.external_actor_boundary.supplier_session, false); assert.equal(body.external_actor_boundary.situacao, "pendente"); assert.equal(body.document_boundary.upload_real, false); });
test("EXT-04 HTTP+DB: criação ignora IDs/autoria/total forjados no corpo", { skip: !RUN }, async () => {
  const refs = await catalog("forged"); const forged = randomUUID();
  const response = await mutate(`/api/ext/supplier/suppliers/${refs.supplierId}/products/${refs.productId}/quotations`, { body: { id: forged, supplier_id: forged, product_id: forged, created_by_identity: forged, status: "aprovado", total_price_cents: 1, quantity: 3, unit_price_cents: 1200, notes: "Cotação sintética com campos forjados no corpo." } });
  const { body, text } = await readJson(response); assert.equal(response.status, 201, text); assert.notEqual(body.quotation.id, forged); assert.equal(body.quotation.supplier_id, refs.supplierId); assert.equal(body.quotation.product_id, refs.productId); assert.equal(body.quotation.created_by_identity, ti.id); assert.equal(body.quotation.total_price_cents, 3600); assert.equal(body.quotation.status, "rascunho");
  const db = await pool.query(`SELECT * FROM ext_supplier_portal_quotations WHERE id=$1`, [body.quotation.id]); assert.equal(db.rows[0].created_by_identity, ti.id); assert.equal(Number(db.rows[0].total_price_cents), 3600);
});
test("EXT-04 HTTP: produto precisa estar canonicamente ligado ao fornecedor da URL", { skip: !RUN }, async () => { const left = await catalog("link-left"), right = await catalog("link-right"); const response = await mutate(`/api/ext/supplier/suppliers/${left.supplierId}/products/${right.productId}/quotations`, { body: { quantity: 1, unit_price_cents: 100 } }); assert.equal(response.status, 409); assert.equal((await response.json()).error, "product_not_linked_to_supplier"); });

// Idempotência.
test("EXT-04 HTTP+DB: retry idêntico não duplica e chave divergente dá 409", { skip: !RUN }, async () => {
  const refs = await catalog("idempotency"), idem = key("same"); const path = `/api/ext/supplier/suppliers/${refs.supplierId}/products/${refs.productId}/quotations`; const body = { quantity: 2, unit_price_cents: 800, notes: "Cotação sintética para idempotência real." };
  const first = await mutate(path, { idempotencyKey: idem, body }); const firstData = await first.json(); assert.equal(first.status, 201);
  const replay = await mutate(path, { idempotencyKey: idem, body }); const replayData = await replay.json(); assert.equal(replay.status, 200); assert.equal(replayData.replayed, true); assert.equal(replayData.quotation.id, firstData.quotation.id);
  const conflict = await mutate(path, { idempotencyKey: idem, body: { ...body, quantity: 3 } }); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error, "idempotency_key_reused");
  const count = await pool.query(`SELECT count(*)::int n FROM ext_supplier_portal_quotations WHERE supplier_id=$1 AND product_id=$2`, [refs.supplierId, refs.productId]); assert.equal(count.rows[0].n, 1);
});

// Estados e decisão.
test("EXT-04 HTTP: máquina recusa salto de rascunho para análise", { skip: !RUN }, async () => { const { quote } = await createQuote("state-skip"); const response = await mutate(`/api/ext/supplier/quotations/${quote.id}/status`, { body: { status: "em_analise", reason: "Salto sintético que precisa ser recusado." } }); assert.equal(response.status, 409); assert.equal((await response.json()).error, "invalid_status_transition"); });
test("EXT-04 HTTP+DB: decisão guarda autor/data e não é sobrescrita", { skip: !RUN }, async () => {
  const created = await quoteInAnalysis("decision");
  await assert.rejects(
    pool.query(`UPDATE ext_supplier_portal_quotations SET status='aprovado' WHERE id=$1`, [created.quote.id]),
    /ext_supplier_quote_decision_check/,
    "o banco não pode aprovar sem decisão, autor e data",
  );
  const response = await mutate(`/api/ext/supplier/quotations/${created.quote.id}/decision`, { body: { decision: "aprovada", justification: "Condições sintéticas aprovadas para validar a decisão imutável." } }); const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.quotation.decision, "aprovada"); assert.equal(data.quotation.decision_recorded_by_identity, ti.id); assert.ok(data.quotation.decision_recorded_at);
  const overwrite = await mutate(`/api/ext/supplier/quotations/${created.quote.id}/decision`, { body: { decision: "rejeitada", justification: "Tentativa sintética de sobrescrever decisão anterior." } }); assert.equal(overwrite.status, 409); assert.equal((await overwrite.json()).error, "decision_already_recorded");
});
test("EXT-04 HTTP+DB: cotação cancelada não reabre", { skip: !RUN }, async () => { const { quote } = await createQuote("quote-terminal"); await transitionQuote(quote.id, "cancelado", "quote-cancel"); const reopen = await mutate(`/api/ext/supplier/quotations/${quote.id}/status`, { body: { status: "rascunho", reason: "Tentativa sintética de reabertura silenciosa." } }); assert.equal(reopen.status, 409); await assert.rejects(pool.query(`UPDATE ext_supplier_portal_quotations SET status='rascunho' WHERE id=$1`, [quote.id]), /invalid quotation status transition/); });
test("EXT-04 DB: campos de decisão gravada são imutáveis", { skip: !RUN }, async () => { const approved = await approveQuote("decision-db"); await assert.rejects(pool.query(`UPDATE ext_supplier_portal_quotations SET decision_justification='Justificativa alterada indevidamente no banco.' WHERE id=$1`, [approved.quote.id]), /decision is immutable/); });

// Validade e regra explícita.
test("EXT-04 HTTP: validade ausente é declarada, nunca estimada", { skip: !RUN }, async () => { const { quote } = await createQuote("validity-empty"); const response = await get(`/api/ext/supplier/quotations/${quote.id}/validities`, cookieTi); const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.empty_state, "Validade não informada; nenhuma data é estimada."); assert.equal(data.alert_rule_absence, "sem_regra_de_antecedencia"); assert.match(data.base_date, /^\d{4}-\d{2}-\d{2}$/); });
test("EXT-04 HTTP: validade vencida vem de data/fonte registradas", { skip: !RUN }, async () => { const { quote } = await createQuote("validity-expired"); const response = await mutate(`/api/ext/supplier/quotations/${quote.id}/validities`, { body: { valid_until: today(-1), source: "documento_declarado", source_reference: "Documento sintético QA", justification: "validade declarada pela fixture" } }); const data = await response.json(); assert.equal(response.status, 201); assert.equal(data.derived.situation, "vencido"); assert.equal(data.derived.declared_source, "documento_declarado"); assert.match(data.derived.base_date, /^\d{4}-\d{2}-\d{2}$/); });
test("EXT-04 HTTP: a vencer só aparece após regra explícita", { skip: !RUN }, async () => { const { quote } = await createQuote("alert"); await mutate(`/api/ext/supplier/quotations/${quote.id}/validities`, { body: { valid_until: today(2), source: "registro_interno", justification: "validade sintética declarada" } }); const before = await (await get(`/api/ext/supplier/quotations/${quote.id}/validities`, cookieTi)).json(); assert.equal(before.validities[0].derived.situation, "vigente"); const rule = await mutate(`/api/ext/supplier/quotations/${quote.id}/alert-rules`, { body: { days_before: 3, justification: "antecedência sintética explícita" } }); assert.equal(rule.status, 201); const afterData = await (await get(`/api/ext/supplier/quotations/${quote.id}/validities`, cookieTi)).json(); assert.equal(afterData.validities[0].derived.situation, "a_vencer"); });
test("EXT-04 HTTP+DB: validade é substituída, não editada", { skip: !RUN }, async () => { const { quote } = await createQuote("validity-replace"); const first = await mutate(`/api/ext/supplier/quotations/${quote.id}/validities`, { body: { valid_until: today(4), source: "registro_interno", justification: "primeira validade sintética" } }); const old = (await first.json()).validity; const replacement = await mutate(`/api/ext/supplier/validities/${old.id}/supersede`, { body: { valid_until: today(8), source: "email_declarado", source_reference: "email sintético", reason: "nova validade declarada pela equipe" } }); assert.equal(replacement.status, 201); const rows = await pool.query(`SELECT * FROM ext_supplier_quotation_validities WHERE quotation_id=$1 ORDER BY registered_at`, [quote.id]); assert.equal(rows.rows.length, 2); assert.ok(rows.rows[0].superseded_at); await assert.rejects(pool.query(`UPDATE ext_supplier_quotation_validities SET valid_until=$2 WHERE id=$1`, [rows.rows[0].id, today(20)]), /validity source is immutable|superseded quotation validity is immutable/); });

// Documentos e corrida de versão.
test("EXT-04 HTTP+DB: versões documentais concorrentes são serializadas sob lock", { skip: !RUN }, async () => { const { quote } = await createQuote("docs-race"); const path = `/api/ext/supplier/quotations/${quote.id}/documents`; const [a,b] = await Promise.all([mutate(path, { idempotencyKey: key("doc-a"), body: { document_type: "proposta", file_name: "proposta-a.pdf", file_url: "synthetic://ext04/proposta-a.pdf", storage_key: `synthetic/ext04/${randomUUID()}` } }), mutate(path, { idempotencyKey: key("doc-b"), body: { document_type: "certidao", file_name: "certidao-b.pdf", file_url: "synthetic://ext04/certidao-b.pdf", storage_key: `synthetic/ext04/${randomUUID()}` } })]); assert.deepEqual([a.status,b.status].sort(), [201,201]); const rows = await pool.query(`SELECT version FROM ext_supplier_portal_documents WHERE quotation_id=$1 ORDER BY version`, [quote.id]); assert.deepEqual(rows.rows.map(r=>r.version), [1,2]); });
test("EXT-04 HTTP: nova versão deriva vínculo do documento na URL e declara sem upload", { skip: !RUN }, async () => { const { quote } = await createQuote("doc-version"); const first = await mutate(`/api/ext/supplier/quotations/${quote.id}/documents`, { body: { document_type: "proposta", file_name: "v1.pdf", file_url: "synthetic://ext04/v1.pdf", storage_key: `synthetic/ext04/${randomUUID()}` } }); const firstData = await first.json(); const replacement = await mutate(`/api/ext/supplier/documents/${firstData.document.id}/versions`, { body: { quotation_id: randomUUID(), supersedes_document_id: randomUUID(), document_type: "proposta", file_name: "v2.pdf", file_url: "synthetic://ext04/v2.pdf", storage_key: `synthetic/ext04/${randomUUID()}` } }); const data = await replacement.json(); assert.equal(replacement.status, 201); assert.equal(data.document.quotation_id, quote.id); assert.equal(data.superseded_document_id, firstData.document.id); assert.equal(data.document_boundary.upload_real, false); });
test("EXT-04 HTTP+DB: documento é desativado sem apagar histórico", { skip: !RUN }, async () => { const { quote } = await createQuote("doc-deactivate"); const created = await mutate(`/api/ext/supplier/quotations/${quote.id}/documents`, { body: { document_type: "certidao", file_name: "certidao.pdf", file_url: "synthetic://ext04/certidao.pdf", storage_key: `synthetic/ext04/${randomUUID()}` } }); const doc = (await created.json()).document; const response = await mutate(`/api/ext/supplier/documents/${doc.id}/deactivate`, { body: { reason: "referência sintética substituída" } }); assert.equal(response.status, 200); const db = await pool.query(`SELECT deactivated_at,deactivated_by_identity FROM ext_supplier_portal_documents WHERE id=$1`, [doc.id]); assert.ok(db.rows[0].deactivated_at); assert.equal(db.rows[0].deactivated_by_identity, ti.id); });

// Pedidos e prazos.
test("EXT-04 HTTP: pedido exige cotação aprovada", { skip: !RUN }, async () => { const { quote } = await createQuote("order-denied"); const response = await mutate(`/api/ext/supplier/quotations/${quote.id}/orders`, { body: { notes: "pedido que deve ser recusado" } }); assert.equal(response.status, 409); assert.equal((await response.json()).error, "approved_quotation_required"); });
test("EXT-04 HTTP+DB: pedido deriva todos os vínculos/valores da cotação", { skip: !RUN }, async () => { const approved = await approveQuote("order-derived"); const forged = randomUUID(); const response = await mutate(`/api/ext/supplier/quotations/${approved.quote.id}/orders`, { body: { supplier_id: forged, product_id: forged, quantity: 999, total_price_cents: 1, created_by_identity: forged, notes: "Pedido sintético derivado da cotação aprovada." } }); const data = await response.json(); assert.equal(response.status, 201); assert.equal(data.order.supplier_id, approved.supplierId); assert.equal(data.order.product_id, approved.productId); assert.equal(data.order.quantity, 2); assert.equal(data.order.total_price_cents, 5000); assert.equal(data.order.created_by_identity, ti.id); });
test("EXT-04 HTTP+DB: pedido fechado não reabre nem pela API nem pelo banco", { skip: !RUN }, async () => { const created = await createOrder("order-terminal"); for (const status of ["emitido","em_entrega","recebido","fechado"]) { const response = await mutate(`/api/ext/supplier/orders/${created.order.id}/status`, { body: { status, reason: `Transição sintética do pedido para ${status}.` } }); assert.equal(response.status, 200, await response.text()); } const reopen = await mutate(`/api/ext/supplier/orders/${created.order.id}/status`, { body: { status: "rascunho", reason: "Tentativa sintética de reabrir pedido fechado." } }); assert.equal(reopen.status, 409); await assert.rejects(pool.query(`UPDATE ext_supplier_portal_orders SET status='rascunho' WHERE id=$1`, [created.order.id]), /invalid supplier order transition/); });
test("EXT-04 HTTP: prazo de pedido ausente e vencido são declarados com fonte/data-base", { skip: !RUN }, async () => { const created = await createOrder("order-deadline"); const empty = await (await get(`/api/ext/supplier/orders/${created.order.id}/deadlines`, cookieTi)).json(); assert.match(empty.empty_state, /nenhuma data é estimada/i); const response = await mutate(`/api/ext/supplier/orders/${created.order.id}/deadlines`, { body: { due_date: today(-1), source: "pedido_emitido", source_reference: "Pedido sintético QA", justification: "prazo sintético declarado" } }); const data = await response.json(); assert.equal(response.status, 201); assert.equal(data.derived.situation, "vencido"); assert.equal(data.derived.declared_source, "pedido_emitido"); assert.match(data.derived.base_date, /^\d{4}-\d{2}-\d{2}$/); });

// Legado, histórico e rollback de auditoria.
test("EXT-04 HTTP: legado lê com alias items e mutação autenticada retorna 410", { skip: !RUN }, async () => { const read = await get("/api/ext/supplier-portal-quotations", cookieTi); const data = await read.json(); assert.equal(read.status, 200); assert.ok(Array.isArray(data.items)); assert.equal(data.canonical, "/api/ext/supplier/quotations"); const anonymous = await mutate("/api/ext/supplier-portal-quotations", { cookie: null, body: {} }); assert.equal(anonymous.status, 401); const retired = await mutate("/api/ext/supplier-portal-quotations", { body: {} }); assert.equal(retired.status, 410); });
test("EXT-04 DB: eventos são imutáveis", { skip: !RUN }, async () => { const { quote } = await createQuote("events"); const event = await pool.query(`SELECT id FROM ext_supplier_portal_events WHERE quotation_id=$1 LIMIT 1`, [quote.id]); assert.ok(event.rows[0]); await assert.rejects(pool.query(`DELETE FROM ext_supplier_portal_events WHERE id=$1`, [event.rows[0].id]), /immutable/); });
test("EXT-04 HTTP+DB: falha de auditoria devolve 503 e reverte negócio+evento", { skip: !RUN }, async () => {
  const refs = await catalog("audit-failure");
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ext04_reject_audit() RETURNS TRIGGER AS $$ BEGIN IF NEW.action='ext_supplier_quotation_create' THEN RAISE EXCEPTION 'audit unavailable ext04 qa'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext04_reject_audit_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext04_reject_audit()`);
  try {
    const response = await mutate(`/api/ext/supplier/suppliers/${refs.supplierId}/products/${refs.productId}/quotations`, { body: { quantity: 1, unit_price_cents: 999, notes: "Cotação sintética para falha de auditoria." } }); assert.equal(response.status, 503); assert.equal((await response.json()).error, "audit_unavailable");
    const quoteCount = await pool.query(`SELECT count(*)::int n FROM ext_supplier_portal_quotations WHERE supplier_id=$1 AND product_id=$2`, [refs.supplierId, refs.productId]); assert.equal(quoteCount.rows[0].n, 0);
    const eventCount = await pool.query(`SELECT count(*)::int n FROM ext_supplier_portal_events e JOIN ext_supplier_portal_quotations q ON q.id=e.quotation_id WHERE q.supplier_id=$1 AND q.product_id=$2`, [refs.supplierId, refs.productId]); assert.equal(eventCount.rows[0].n, 0);
  } finally { await pool.query(`DROP TRIGGER IF EXISTS qa_ext04_reject_audit_trg ON audit_log`); await pool.query(`DROP FUNCTION IF EXISTS qa_ext04_reject_audit()`); }
});
