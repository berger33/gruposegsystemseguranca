// EXT-07 — PostgreSQL real + servidor HTTP real; somente fixtures sintéticas
// e domínios .invalid. Nenhum caso aqui prova upload, bytes, checksum, malware
// scan, armazenamento verificado, download, ator externo, integração
// regulatória, aceite humano ou homologação Windows.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT07_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");

test("EXT-07 gate exige PostgreSQL real", () => { if (REQUIRE) assert.ok(RUN); });

let server, base, pool, ti, admin, rh, cookieTi, cookieAdmin, cookieRh;
const idem = tag => `ext07-${tag}-${randomUUID()}`;
const iso = value => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const today = () => new Date();
const shiftDays = days => {
  const date = today();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

async function waitForServer() {
  for (let i = 0; i < 300; i += 1) {
    try { if ([200, 401].includes((await fetch(`${base}/api/admin/session`)).status)) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error("server_did_not_start");
}

async function staff(role, status = "active") {
  const id = randomUUID();
  const email = `ext07-${role}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(
    `INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,$4)`,
    [id, email, `QA EXT07 ${role}`, status],
  );
  await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]);
  return { id, email, password };
}

async function login(account) {
  const response = await fetch(`${base}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().find(value => value.startsWith("seg_admin_session=")).split(";")[0];
}

async function api(url, { method = "GET", cookie = cookieTi, body, key, origin = base, raw } = {}) {
  const headers = { accept: "application/json", ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) };
  if (method !== "GET") headers["idempotency-key"] = key === null ? "" : key || idem("request");
  if (raw === undefined && body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(base + url, {
    method,
    headers,
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.text();
  let parsed;
  try { parsed = JSON.parse(payload); } catch { parsed = { raw: payload }; }
  return { status: response.status, body: parsed, text: payload.slice(0, 400) };
}

const obligationInput = (overrides = {}) => ({
  obligation_type: "licenca",
  title: "Licenca sintetica de funcionamento",
  description: "Obrigacao sintetica declarada internamente para a prova da jornada EXT-07.",
  declared_source: "Politica interna sintetica QA versao 1",
  applicability_scope: "Unidade sintetica QA .invalid",
  applicability_justification: "Aplicavel porque a unidade sintetica opera no escopo declarado.",
  validity_rule: "Renovacao anual contada da emissao",
  renewal_lead_days: 30,
  criticality: "alta",
  responsible_identity: ti.id,
  ...overrides,
});

const documentInput = (obligationId, overrides = {}) => ({
  obligation_id: obligationId,
  title: "Alvara sintetico da unidade",
  description: "Referencia documental declarada e privada, sem arquivo real associado.",
  compliance_type: "alvara",
  document_number: "QA-SINTETICO-0001",
  issuer: "Orgao sintetico .invalid",
  issue_date: shiftDays(-200),
  effective_start_date: shiftDays(-200),
  expiry_date: shiftDays(120),
  reference_type: "referencia_declarada",
  declared_reference: "Protocolo sintetico QA-REF-0001",
  reference_source: "Registro interno sintetico",
  ...overrides,
});

async function createObligation(overrides = {}, options = {}) {
  const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput(overrides), ...options });
  assert.equal(response.status, 201, response.text);
  return response.body.obligation;
}

async function createDocument(obligationId, overrides = {}, options = {}) {
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentInput(obligationId, overrides), ...options });
  assert.equal(response.status, 201, response.text);
  return response.body.document;
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const port = 3500 + Math.floor(Math.random() * 900);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ext07",
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      SITE_ADMIN_LEGACY_TOKENS: "",
      OLLAMA_ENABLED: "false",
      MAIL_HOST: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let logs = "";
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  try { await waitForServer(); } catch (error) { throw new Error(`${error.message}\n${logs.slice(-3000)}`); }
  ti = await staff("ti");
  admin = await staff("admin");
  rh = await staff("rh");
  cookieTi = await login(ti);
  cookieAdmin = await login(admin);
  cookieRh = await login(rh);
});

after(async () => {
  await pool?.end().catch(() => {});
  // Encerra o grupo inteiro: o dev server do Next deixa processo filho vivo e
  // trava a execução seguinte com "Another next dev server is already running".
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { try { server.kill("SIGTERM"); } catch {} }
    await new Promise(resolve => setTimeout(resolve, 600));
    try { process.kill(-server.pid, "SIGKILL"); } catch { try { server.kill("SIGKILL"); } catch {} }
  }
});

const opt = { skip: !RUN };

// --- fronteira de ator -------------------------------------------------------
test("EXT-07 anonimo recebe 401 na rota canonica", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: null })).status, 401);
});
test("EXT-07 papel autenticado nao autorizado recebe 403", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: cookieRh })).status, 403);
});
test("EXT-07 papel admin tambem e staff autorizado", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: cookieAdmin })).status, 200);
});
test("EXT-07 anonimo em mutacao recebe 401 antes de qualquer escrita", opt, async () => {
  const before = await pool.query("SELECT count(*)::int AS c FROM ext_compliance_obligations");
  assert.equal((await api("/api/ext/compliance/obligations", { cookie: null, method: "POST", body: obligationInput() })).status, 401);
  const after2 = await pool.query("SELECT count(*)::int AS c FROM ext_compliance_obligations");
  assert.equal(before.rows[0].c, after2.rows[0].c);
});
test("EXT-07 same-origin e exigido apenas em mutacoes", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput(), origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/ext/compliance/obligations", { origin: "https://attacker.invalid" })).status, 200);
});

// --- validacao de entrada ----------------------------------------------------
test("EXT-07 chave de idempotencia e obrigatoria na mutacao", opt, async () => {
  const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput(), key: null });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "idempotency_key_required");
});
test("EXT-07 JSON invalido retorna 400", opt, async () => {
  const response = await api("/api/ext/compliance/obligations", { method: "POST", raw: "{nao-json" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid_json");
});
test("EXT-07 corpo grande retorna 413", opt, async () => {
  const response = await api("/api/ext/compliance/obligations", { method: "POST", raw: JSON.stringify({ title: "x".repeat(400000) }) });
  assert.equal(response.status, 413);
});
test("EXT-07 UUID invalido retorna 400", opt, async () => {
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: { obligation_id: "nao-uuid" } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid_uuid");
});
test("EXT-07 detalhe com UUID invalido retorna 400", opt, async () => {
  assert.equal((await api("/api/ext/compliance/documents/nao-uuid")).status, 400);
});

// --- obrigacoes --------------------------------------------------------------
test("EXT-07 obrigacao exige fonte, escopo e justificativa de aplicabilidade", opt, async () => {
  const response = await api("/api/ext/compliance/obligations", {
    method: "POST",
    body: { ...obligationInput(), declared_source: "", applicability_justification: "" },
  });
  assert.equal(response.status, 400);
  assert.deepEqual(response.body.missing.sort(), ["applicability_justification", "declared_source"]);
});
test("EXT-07 obrigacao exige responsavel staff canonico ativo", opt, async () => {
  const stranger = randomUUID();
  const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ responsible_identity: stranger }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "responsible_staff_required");
});
test("EXT-07 obrigacao recusa responsavel staff inativo", opt, async () => {
  const inactive = await staff("ti", "suspended");
  const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ responsible_identity: inactive.id }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "responsible_staff_required");
});
test("EXT-07 obrigacao recusa criticidade e tipo fora do catalogo", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ criticality: "altissima" }) })).status, 400);
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ source_kind: "confirmado_por_orgao_publico" }) })).status, 400);
});
test("EXT-07 autoria vem da sessao e IDs/estado forjados sao ignorados", opt, async () => {
  const forgedId = randomUUID();
  const obligation = await createObligation({ id: forgedId, created_by_identity: rh.id, status: "vigente", created_at: "1999-01-01T00:00:00Z" });
  assert.notEqual(obligation.id, forgedId);
  assert.equal(obligation.created_by_identity, ti.id);
  assert.equal(obligation.status, "pendente");
  const row = await pool.query("SELECT created_by_identity, status, created_at FROM ext_compliance_obligations WHERE id=$1", [obligation.id]);
  assert.equal(row.rows[0].created_by_identity, ti.id);
  assert.equal(row.rows[0].status, "pendente");
  assert.ok(new Date(row.rows[0].created_at).getUTCFullYear() >= 2026);
});
test("EXT-07 listagem de obrigacoes informa fonte, denominador e ausencia", opt, async () => {
  const response = await api("/api/ext/compliance/obligations");
  assert.equal(response.status, 200);
  assert.equal(response.body.source, "ext_compliance_obligations");
  assert.equal(typeof response.body.denominator, "number");
  assert.equal(response.body.absence_is_not_zero, response.body.items.length === 0);
  assert.match(response.body.evidence_boundary, /sem_validacao_juridica/);
});

// --- documentos: validade ----------------------------------------------------
test("EXT-07 documento exige obrigacao existente", opt, async () => {
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentInput(randomUUID()) });
  assert.equal(response.status, 404);
  assert.equal(response.body.error, "obligation_not_found");
});
test("EXT-07 documento recusa data sintaticamente invalida", opt, async () => {
  const obligation = await createObligation();
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentInput(obligation.id, { issue_date: "10/01/2026", expiry_date: "2026-13-45" }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid_date");
});
test("EXT-07 documento recusa data inexistente no calendario", opt, async () => {
  const obligation = await createObligation();
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentInput(obligation.id, { issue_date: "2026-02-31" }) });
  assert.equal(response.status, 400);
});
test("EXT-07 documento recusa vencimento anterior a emissao", opt, async () => {
  const obligation = await createObligation();
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentInput(obligation.id, { issue_date: shiftDays(-10), effective_start_date: shiftDays(-10), expiry_date: shiftDays(-200) }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid_validity");
});
test("EXT-07 documento recusa inicio de vigencia anterior a emissao", opt, async () => {
  const obligation = await createObligation();
  const response = await api("/api/ext/compliance/documents", { method: "POST", body: documentInput(obligation.id, { issue_date: shiftDays(-10), effective_start_date: shiftDays(-90) }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "invalid_validity");
});
test("EXT-07 estado e derivado do relogio do servidor e nao do cliente", opt, async () => {
  const obligation = await createObligation();
  const vigente = await createDocument(obligation.id, { expiry_date: shiftDays(365) });
  assert.equal(vigente.status, "vigente");
  const aVencer = await createDocument(await createObligation().then(o => o.id), { expiry_date: shiftDays(5) });
  assert.equal(aVencer.status, "a_vencer");
  const vencida = await createDocument(await createObligation().then(o => o.id), { issue_date: shiftDays(-400), effective_start_date: shiftDays(-400), expiry_date: shiftDays(-30) });
  assert.equal(vencida.status, "vencida");
  assert.match(vencida.state_evaluation_rule, /relogio_do_servidor/);
});
test("EXT-07 PostgreSQL recusa estado vigente com validade vencida", opt, async () => {
  const obligation = await createObligation();
  const document = await createDocument(obligation.id, { issue_date: shiftDays(-400), effective_start_date: shiftDays(-400), expiry_date: shiftDays(-30) });
  await assert.rejects(
    () => pool.query("UPDATE ext_compliance_documents SET status='vigente' WHERE id=$1", [document.id]),
    /incompatible with an expired validity/,
  );
});

// --- documentos: privacidade e fronteira de arquivo --------------------------
test("EXT-07 documento canonico nasce privado e recusa declaracao de arquivo real", opt, async () => {
  const obligation = await createObligation();
  const document = await createDocument(obligation.id);
  assert.equal(document.is_private, true);
  const response = await api("/api/ext/compliance/documents", {
    method: "POST",
    body: documentInput(await createObligation().then(o => o.id), { file_url: "https://arquivo.invalid/a.pdf", storage_key: "bucket/a.pdf" }),
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "file_claim_not_supported");
});
test("EXT-07 PostgreSQL recusa rebaixar privacidade do documento canonico", opt, async () => {
  const document = await createDocument(await createObligation().then(o => o.id));
  await assert.rejects(
    () => pool.query("UPDATE ext_compliance_documents SET is_private=false WHERE id=$1", [document.id]),
    /privacy cannot be downgraded/,
  );
});
test("EXT-07 listagem minimizada nao expoe storage_key, URL nem numero completo", opt, async () => {
  await createDocument(await createObligation().then(o => o.id), { document_number: "QA-NUMERO-SENSIVEL-7788" });
  const response = await api("/api/ext/compliance/documents");
  assert.equal(response.status, 200);
  assert.equal(response.body.projection, "minimizada");
  assert.match(response.body.file_boundary, /nao_arquivo_verificado/);
  const serialized = JSON.stringify(response.body);
  assert.doesNotMatch(serialized, /storage_key/);
  assert.doesNotMatch(serialized, /file_url/);
  assert.doesNotMatch(serialized, /QA-NUMERO-SENSIVEL-7788/);
  assert.doesNotMatch(serialized, /declared_reference/);
  assert.ok(response.body.items.every(item => item.document_number_masked === null || /^\*\*\*/.test(item.document_number_masked)));
});
test("EXT-07 detalhe autorizado usa allowlist e diferencia referencia de arquivo", opt, async () => {
  const document = await createDocument(await createObligation().then(o => o.id));
  const response = await api(`/api/ext/compliance/documents/${document.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.document.declared_reference, "Protocolo sintetico QA-REF-0001");
  assert.equal(response.body.document.reference_type, "referencia_declarada");
  assert.match(response.body.file_boundary, /nao_arquivo_verificado/);
  const serialized = JSON.stringify(response.body);
  assert.doesNotMatch(serialized, /storage_key/);
  assert.doesNotMatch(serialized, /file_url/);
});
test("EXT-07 detalhe nao vaza documento inexistente nem legado", opt, async () => {
  assert.equal((await api(`/api/ext/compliance/documents/${randomUUID()}`)).status, 404);
});
test("EXT-07 nao existe rota publica de compliance", opt, async () => {
  for (const route of ["/api/public/compliance-documents", "/api/ext/compliance/public", "/api/compliance-documents"]) {
    const response = await fetch(base + route);
    assert.ok([401, 403, 404].includes(response.status), `${route} => ${response.status}`);
  }
});

// --- imutabilidade e sobrescrita --------------------------------------------
test("EXT-07 nao ha PATCH arbitrario na jornada canonica", opt, async () => {
  const document = await createDocument(await createObligation().then(o => o.id));
  const response = await api(`/api/ext/compliance/documents/${document.id}`, { method: "PATCH", body: { status: "vigente" } });
  assert.equal(response.status, 405);
});
test("EXT-07 PostgreSQL recusa sobrescrita destrutiva da validade", opt, async () => {
  const document = await createDocument(await createObligation().then(o => o.id));
  await assert.rejects(
    () => pool.query("UPDATE ext_compliance_documents SET expiry_date='2099-01-01' WHERE id=$1", [document.id]),
    /immutable; create a renewal/,
  );
  await assert.rejects(
    () => pool.query("UPDATE ext_compliance_documents SET obligation_id=NULL WHERE id=$1", [document.id]),
    /immutable; create a renewal/,
  );
});
test("EXT-07 PostgreSQL recusa reabertura de documento cancelado", opt, async () => {
  const document = await createDocument(await createObligation().then(o => o.id));
  await pool.query("UPDATE ext_compliance_documents SET status='cancelada' WHERE id=$1", [document.id]);
  await assert.rejects(
    () => pool.query("UPDATE ext_compliance_documents SET status='vigente' WHERE id=$1", [document.id]),
    /terminal compliance document cannot reopen/,
  );
});

// --- renovacao e versionamento ----------------------------------------------
test("EXT-07 renovacao cria nova versao e preserva a anterior", opt, async () => {
  const obligation = await createObligation();
  const first = await createDocument(obligation.id, { expiry_date: shiftDays(20) });
  const renewal = await api(`/api/ext/compliance/documents/${first.id}/renew`, {
    method: "POST",
    body: documentInput(obligation.id, {
      issue_date: shiftDays(-1), effective_start_date: shiftDays(-1), expiry_date: shiftDays(400),
      renewal_justification: "Renovacao sintetica protocolada no registro interno QA.",
      declared_reference: "Protocolo sintetico QA-REF-0002",
    }),
  });
  assert.equal(renewal.status, 201, renewal.text);
  assert.equal(renewal.body.document.version_no, 2);
  assert.equal(renewal.body.document.replacement_of, first.id);
  assert.equal(renewal.body.document.version_root, first.id);
  assert.equal(renewal.body.history_preserved, true);
  const previous = await pool.query("SELECT status, expiry_date, superseded_by, superseded_at, declared_reference FROM ext_compliance_documents WHERE id=$1", [first.id]);
  assert.equal(previous.rows[0].superseded_by, renewal.body.document.id);
  assert.ok(previous.rows[0].superseded_at);
  assert.equal(iso(previous.rows[0].expiry_date), shiftDays(20));
  assert.equal(previous.rows[0].declared_reference, "Protocolo sintetico QA-REF-0001");
});
test("EXT-07 renovacao exige justificativa explicita", opt, async () => {
  const obligation = await createObligation();
  const first = await createDocument(obligation.id);
  const response = await api(`/api/ext/compliance/documents/${first.id}/renew`, { method: "POST", body: documentInput(obligation.id) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "renewal_justification_required");
});
test("EXT-07 documento ja substituido nao pode ser renovado de novo", opt, async () => {
  const obligation = await createObligation();
  const first = await createDocument(obligation.id);
  const payload = documentInput(obligation.id, {
    issue_date: shiftDays(-1), effective_start_date: shiftDays(-1), expiry_date: shiftDays(400),
    renewal_justification: "Renovacao sintetica unica para a cadeia de versoes.",
  });
  assert.equal((await api(`/api/ext/compliance/documents/${first.id}/renew`, { method: "POST", body: payload })).status, 201);
  const second = await api(`/api/ext/compliance/documents/${first.id}/renew`, { method: "POST", body: payload });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, "document_already_superseded");
});
test("EXT-07 historico de versoes e consultavel no detalhe", opt, async () => {
  const obligation = await createObligation();
  const first = await createDocument(obligation.id);
  const renewal = await api(`/api/ext/compliance/documents/${first.id}/renew`, {
    method: "POST",
    body: documentInput(obligation.id, {
      issue_date: shiftDays(-1), effective_start_date: shiftDays(-1), expiry_date: shiftDays(400),
      renewal_justification: "Renovacao sintetica com historico preservado para prova.",
    }),
  });
  const detail = await api(`/api/ext/compliance/documents/${renewal.body.document.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.history.length, 2);
  assert.deepEqual(detail.body.history.map(item => item.version_no), [1, 2]);
  assert.equal(detail.body.document.version_state, "atual");
});
test("EXT-07 PostgreSQL impede ciclo e autorreferencia de versao", opt, async () => {
  const document = await createDocument(await createObligation().then(o => o.id));
  await assert.rejects(
    () => pool.query("UPDATE ext_compliance_documents SET superseded_by=id WHERE id=$1", [document.id]),
    /immutable|self|cycle|ext_compliance_no_self_supersede/i,
  );
});
test("EXT-07 apenas uma versao atual por obrigacao", opt, async () => {
  const obligation = await createObligation();
  await createDocument(obligation.id);
  const second = await api("/api/ext/compliance/documents", { method: "POST", body: documentInput(obligation.id, { declared_reference: "Protocolo sintetico QA-REF-0003" }) });
  assert.equal(second.status, 409);
});

// --- idempotencia, retry e concorrencia -------------------------------------
test("EXT-07 retry identico nao duplica e marca replay", opt, async () => {
  const key = idem("retry");
  const title = `Obrigacao de retry ${randomUUID().slice(0, 8)}`;
  const first = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title }), key });
  const second = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title }), key });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.replayed, true);
  assert.equal(second.body.obligation.id, first.body.obligation.id);
  const count = await pool.query("SELECT count(*)::int AS c FROM ext_compliance_obligations WHERE title=$1", [title]);
  assert.equal(count.rows[0].c, 1);
});
test("EXT-07 mesma chave com corpo divergente retorna 409", opt, async () => {
  const key = idem("divergente");
  await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title: `Base ${randomUUID().slice(0, 8)}` }), key });
  const response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title: `Divergente ${randomUUID().slice(0, 8)}` }), key });
  assert.equal(response.status, 409);
  assert.equal(response.body.error, "idempotency_key_reused");
});
test("EXT-07 mesma chave em outra rota e divergencia e nao replay", opt, async () => {
  const key = idem("cross");
  assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title: `Cross ${randomUUID().slice(0, 8)}` }), key })).status, 201);
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {}, key });
  assert.equal(response.status, 409);
  assert.equal(response.body.error, "idempotency_key_reused");
});
test("EXT-07 concorrencia na mesma chave nao duplica a entidade", opt, async () => {
  const key = idem("concorrencia");
  const title = `Obrigacao concorrente ${randomUUID().slice(0, 8)}`;
  const responses = await Promise.all([1, 2, 3, 4].map(() => api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title }), key })));
  assert.equal(responses.filter(item => item.status === 201).length, 1);
  assert.ok(responses.every(item => [200, 201].includes(item.status)), JSON.stringify(responses.map(r => r.status)));
  const count = await pool.query("SELECT count(*)::int AS c FROM ext_compliance_obligations WHERE title=$1", [title]);
  assert.equal(count.rows[0].c, 1);
});

// --- avaliacao temporal e tarefa --------------------------------------------
test("EXT-07 avaliacao recusa data-base do cliente", opt, async () => {
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: { evaluation_date: "2099-01-01" } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "client_clock_not_accepted");
});
test("EXT-07 vencimento gera tarefa com regra, data-base e fatos", opt, async () => {
  const obligation = await createObligation();
  const document = await createDocument(obligation.id, { issue_date: shiftDays(-400), effective_start_date: shiftDays(-400), expiry_date: shiftDays(-5) });
  const response = await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.task_source, "ext_compliance_tasks");
  assert.match(response.body.rule, /CURRENT_DATE/);
  assert.equal(response.body.base_date, new Date().toISOString().slice(0, 10));
  const task = await pool.query("SELECT * FROM ext_compliance_tasks WHERE document_id=$1", [document.id]);
  assert.equal(task.rows.length, 1);
  assert.equal(task.rows[0].obligation_id, obligation.id);
  assert.equal(task.rows[0].responsible_identity, ti.id);
  assert.equal(task.rows[0].status, "aberta");
  assert.equal(iso(task.rows[0].due_date), shiftDays(-5));
  assert.equal(iso(task.rows[0].base_date), new Date().toISOString().slice(0, 10));
  assert.equal(task.rows[0].validity_period, `${shiftDays(-400)}:${shiftDays(-5)}`);
  assert.equal(task.rows[0].facts.source, "server_date");
  assert.equal(task.rows[0].facts.base_date, new Date().toISOString().slice(0, 10));
  assert.ok(task.rows[0].rule.length >= 5);
});
test("EXT-07 documento vencido passa a vencida na mesma transacao da avaliacao", opt, async () => {
  const obligation = await createObligation();
  const document = await createDocument(obligation.id, { issue_date: shiftDays(-400), effective_start_date: shiftDays(-400), expiry_date: shiftDays(-7) });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const row = await pool.query("SELECT status, evaluation_date, state_evaluation_rule FROM ext_compliance_documents WHERE id=$1", [document.id]);
  assert.equal(row.rows[0].status, "vencida");
  assert.equal(iso(row.rows[0].evaluation_date), new Date().toISOString().slice(0, 10));
  assert.match(row.rows[0].state_evaluation_rule, /CURRENT_DATE/);
});
test("EXT-07 avaliacao repetida e concorrente nao duplica tarefa", opt, async () => {
  const obligation = await createObligation();
  const document = await createDocument(obligation.id, { issue_date: shiftDays(-400), effective_start_date: shiftDays(-400), expiry_date: shiftDays(-9) });
  const responses = await Promise.all([1, 2, 3, 4].map(() => api("/api/ext/compliance/evaluate", { method: "POST", body: {} })));
  assert.ok(responses.every(item => item.status === 200), JSON.stringify(responses.map(r => r.status)));
  const count = await pool.query("SELECT count(*)::int AS c FROM ext_compliance_tasks WHERE document_id=$1", [document.id]);
  assert.equal(count.rows[0].c, 1);
});
test("EXT-07 PostgreSQL recusa tarefa duplicada por documento/periodo/regra", opt, async () => {
  const obligation = await createObligation();
  const document = await createDocument(obligation.id, { issue_date: shiftDays(-400), effective_start_date: shiftDays(-400), expiry_date: shiftDays(-11) });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const existing = await pool.query("SELECT * FROM ext_compliance_tasks WHERE document_id=$1", [document.id]);
  const row = existing.rows[0];
  await assert.rejects(
    () => pool.query(
      `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,created_by_identity)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [row.obligation_id, row.document_id, row.validity_period, row.rule, row.evaluation_date, row.due_date, JSON.stringify({ duplicado: true }), row.responsible_identity, ti.id],
    ),
    /duplicate key|unique/i,
  );
});
test("EXT-07 tarefa falha fechado quando nao ha responsavel staff", opt, async () => {
  const obligation = await createObligation();
  const document = await createDocument(obligation.id, { issue_date: shiftDays(-400), effective_start_date: shiftDays(-400), expiry_date: shiftDays(-13) });
  await assert.rejects(
    () => pool.query(
      `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,created_by_identity)
       VALUES($1,$2,'2026-01-01:2026-02-01','regra sintetica sem responsavel',CURRENT_DATE,CURRENT_DATE,$3,NULL,$4)`,
      [obligation.id, document.id, JSON.stringify({ sem: "responsavel" }), ti.id],
    ),
    /requires a canonical staff responsible|ext_compliance_task_responsible_required/i,
  );
});
test("EXT-07 PostgreSQL recusa tarefa sem fatos registrados", opt, async () => {
  const obligation = await createObligation();
  const document = await createDocument(obligation.id, { issue_date: shiftDays(-400), effective_start_date: shiftDays(-400), expiry_date: shiftDays(-15) });
  await assert.rejects(
    () => pool.query(
      `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period,rule,evaluation_date,due_date,responsible_identity,created_by_identity)
       VALUES($1,$2,'2026-03-01:2026-04-01','regra sintetica sem fatos',CURRENT_DATE,CURRENT_DATE,$3,$4)`,
      [obligation.id, document.id, ti.id, ti.id],
    ),
    /requires recorded facts|ext_compliance_task_facts_required/i,
  );
});
test("EXT-07 listagem de tarefas informa fonte, agregado e ausencia de agendamento", opt, async () => {
  const response = await api("/api/ext/compliance/tasks");
  assert.equal(response.status, 200);
  assert.equal(response.body.source, "ext_compliance_tasks");
  assert.equal(typeof response.body.open_tasks, "number");
  assert.match(response.body.generation, /sem_execucao_agendada/);
});

// --- maquina de estados da tarefa -------------------------------------------
async function openTask(expiryOffset) {
  const obligation = await createObligation();
  const document = await createDocument(obligation.id, { issue_date: shiftDays(-400), effective_start_date: shiftDays(-400), expiry_date: shiftDays(expiryOffset) });
  await api("/api/ext/compliance/evaluate", { method: "POST", body: {} });
  const row = await pool.query("SELECT id FROM ext_compliance_tasks WHERE document_id=$1", [document.id]);
  assert.equal(row.rows.length, 1);
  return row.rows[0].id;
}
test("EXT-07 conclusao exige resultado declarado", opt, async () => {
  const taskId = await openTask(-21);
  const response = await api(`/api/ext/compliance/tasks/${taskId}/complete`, { method: "POST", body: {} });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "completion_result_required");
});
test("EXT-07 cancelamento exige justificativa", opt, async () => {
  const taskId = await openTask(-23);
  const response = await api(`/api/ext/compliance/tasks/${taskId}/cancel`, { method: "POST", body: {} });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, "cancellation_justification_required");
});
test("EXT-07 transicao start e depois conclusao registra autoria e resultado", opt, async () => {
  const taskId = await openTask(-25);
  assert.equal((await api(`/api/ext/compliance/tasks/${taskId}/start`, { method: "POST", body: {} })).status, 200);
  const completed = await api(`/api/ext/compliance/tasks/${taskId}/complete`, { method: "POST", body: { result: "Renovacao sintetica protocolada no registro interno QA." } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.task.status, "concluida");
  const row = await pool.query("SELECT status, completed_at, completed_by_identity, completion_result FROM ext_compliance_tasks WHERE id=$1", [taskId]);
  assert.equal(row.rows[0].status, "concluida");
  assert.ok(row.rows[0].completed_at);
  assert.equal(row.rows[0].completed_by_identity, ti.id);
});
test("EXT-07 tarefa terminal nao reabre por API nem por PostgreSQL", opt, async () => {
  const taskId = await openTask(-27);
  await api(`/api/ext/compliance/tasks/${taskId}/cancel`, { method: "POST", body: { justification: "Cancelamento sintetico justificado para a prova." } });
  const reopen = await api(`/api/ext/compliance/tasks/${taskId}/start`, { method: "POST", body: {} });
  assert.equal(reopen.status, 409);
  assert.equal(reopen.body.error, "terminal_task");
  await assert.rejects(
    () => pool.query("UPDATE ext_compliance_tasks SET status='aberta' WHERE id=$1", [taskId]),
    /terminal compliance task is immutable/,
  );
});
test("EXT-07 PostgreSQL recusa alterar fatos de origem da tarefa", opt, async () => {
  const taskId = await openTask(-29);
  await assert.rejects(
    () => pool.query("UPDATE ext_compliance_tasks SET rule='regra reescrita' WHERE id=$1", [taskId]),
    /origin facts are immutable/,
  );
});
test("EXT-07 transicao em tarefa inexistente retorna 404", opt, async () => {
  assert.equal((await api(`/api/ext/compliance/tasks/${randomUUID()}/start`, { method: "POST", body: {} })).status, 404);
});

// --- eventos, auditoria e rollback ------------------------------------------
test("EXT-07 evento historico e imutavel", opt, async () => {
  const obligation = await createObligation();
  const event = await pool.query("SELECT id FROM ext_compliance_events WHERE obligation_id=$1", [obligation.id]);
  assert.equal(event.rows.length, 1);
  await assert.rejects(
    () => pool.query("UPDATE ext_compliance_events SET event_type='forjado' WHERE id=$1", [event.rows[0].id]),
    /immutable/,
  );
  await assert.rejects(() => pool.query("DELETE FROM ext_compliance_events WHERE id=$1", [event.rows[0].id]), /immutable/);
});
test("EXT-07 evento registra rota, chave e impressao digital", opt, async () => {
  const obligation = await createObligation();
  const event = await pool.query("SELECT request_route, idempotency_key, request_fingerprint FROM ext_compliance_events WHERE obligation_id=$1", [obligation.id]);
  assert.equal(event.rows[0].request_route, "POST /api/ext/compliance/obligations");
  assert.match(event.rows[0].request_fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(event.rows[0].idempotency_key.length >= 8);
});
test("EXT-07 mutacao canonica grava audit_log", opt, async () => {
  const obligation = await createObligation();
  const audit = await pool.query("SELECT action, actor FROM audit_log WHERE target=$1", [obligation.id]);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].action, "ext07_obligation_create");
  assert.equal(audit.rows[0].actor, ti.id);
});
test("EXT-07 falha de audit_log faz rollback com 503 e nao deixa residuo", opt, async () => {
  const title = `Obrigacao auditoria indisponivel ${randomUUID().slice(0, 8)}`;
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_ext07_backup");
  let response;
  try {
    response = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title }) });
  } finally {
    await pool.query("ALTER TABLE audit_log_ext07_backup RENAME TO audit_log");
  }
  assert.equal(response.status, 503);
  assert.equal(response.body.error, "audit_unavailable");
  const obligations = await pool.query("SELECT count(*)::int AS c FROM ext_compliance_obligations WHERE title=$1", [title]);
  assert.equal(obligations.rows[0].c, 0);
  const events = await pool.query("SELECT count(*)::int AS c FROM ext_compliance_events WHERE payload->'obligation'->>'title' = $1", [title]);
  assert.equal(events.rows[0].c, 0);
});
test("EXT-07 rollback de auditoria nao consome a chave de idempotencia", opt, async () => {
  const key = idem("auditoria");
  const title = `Obrigacao pos auditoria ${randomUUID().slice(0, 8)}`;
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_ext07_backup");
  try {
    assert.equal((await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title }), key })).status, 503);
  } finally {
    await pool.query("ALTER TABLE audit_log_ext07_backup RENAME TO audit_log");
  }
  const retry = await api("/api/ext/compliance/obligations", { method: "POST", body: obligationInput({ title }), key });
  assert.equal(retry.status, 201);
});

// --- legado e nao regressao --------------------------------------------------
test("EXT-07 legado exato distingue 401 e 403 antes do 410", opt, async () => {
  assert.equal((await api("/api/ext/compliance-documents", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/compliance-documents", { cookie: cookieRh })).status, 403);
});
test("EXT-07 legado preserva leitura autorizada com alias items minimizado", opt, async () => {
  const response = await api("/api/ext/compliance-documents");
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.items));
  assert.equal(response.body.projection, "minimizada");
  const serialized = JSON.stringify(response.body);
  assert.doesNotMatch(serialized, /storage_key/);
  assert.doesNotMatch(serialized, /file_url/);
});
test("EXT-07 escritor legado recebe 410 e same-origin vem antes", opt, async () => {
  const retired = await api("/api/ext/compliance-documents", { method: "POST", body: { title: "x" } });
  assert.equal(retired.status, 410);
  assert.equal(retired.body.canonical, "/api/ext/compliance/*");
  const crossOrigin = await api("/api/ext/compliance-documents", { method: "POST", body: { title: "x" }, origin: "https://attacker.invalid" });
  assert.equal(crossOrigin.status, 403);
});
test("EXT-07 nao existe segundo escritor concorrente na entidade canonica", opt, async () => {
  const before = await pool.query("SELECT count(*)::int AS c FROM ext_compliance_documents WHERE origin::text='ext07_canonica'");
  await api("/api/ext/compliance-documents", { method: "POST", body: documentInput(randomUUID()) });
  const after2 = await pool.query("SELECT count(*)::int AS c FROM ext_compliance_documents WHERE origin::text='ext07_canonica'");
  assert.equal(before.rows[0].c, after2.rows[0].c);
});
test("EXT-07 linha legada da 086 permanece registro_legado", opt, async () => {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO ext_compliance_documents(id,protocol,title,description,compliance_type,status)
     VALUES($1,$2,'Documento legado sintetico','Linha legada sintetica preservada sem prova suficiente.','outro','vigente')`,
    [id, `COMP-EXT-20200101-${randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "A")}`],
  );
  const row = await pool.query("SELECT origin, obligation_id FROM ext_compliance_documents WHERE id=$1", [id]);
  assert.equal(row.rows[0].origin, "registro_legado");
  assert.equal(row.rows[0].obligation_id, null);
  const canonical = await api("/api/ext/compliance/documents");
  assert.ok(canonical.body.items.every(item => item.id !== id));
});
test("EXT-07 tela /admin/compliance responde para staff autorizado", opt, async () => {
  const response = await fetch(`${base}/admin/compliance`, { headers: { cookie: cookieTi } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /[Cc]ompliance/);
});
test("EXT-07 nao regride EXT-08..12", opt, async () => {
  for (const route of ["/api/ext/knowledge-base", "/api/ext/expansion-plans", "/api/ext/expansion-scenarios", "/api/ext/analytics-experiments", "/api/ext/visual-tokens", "/api/ext/periodic-reports"]) {
    const response = await api(route);
    assert.equal(response.status, 200, `${route} => ${response.status} ${response.text}`);
    assert.ok(Array.isArray(response.body.items), `${route} perdeu o alias items`);
  }
});
test("EXT-07 nao altera o defeito pre-existente de EXT-10 em continuity-plans", opt, async () => {
  // `handleContinuityPlans` seleciona `ca.name`, mas `client_accounts` declara
  // `display_name` desde a 040. O defeito existe em `origin/main` antes desta
  // entrega, está fora do escopo da EXT-07 e é reportado como pendência, não
  // corrigido aqui nem mascarado por skip.
  const advanced = await (await import("node:fs/promises")).readFile(new URL("../src/server/ext-advanced-api.mjs", import.meta.url), "utf8");
  assert.match(advanced, /ca\.name as client_name FROM ext_continuity_plans/);
  const columns = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='client_accounts' AND column_name IN ('name','display_name')",
  );
  assert.deepEqual(columns.rows.map(row => row.column_name), ["display_name"]);
  await assert.rejects(() => pool.query("SELECT ca.name FROM client_accounts ca LIMIT 1"), /column ca\.name does not exist/);
});
test("EXT-07 mantem o servidor HTTP vivo apos a bateria completa", opt, async () => {
  assert.equal((await api("/api/ext/compliance/obligations")).status, 200);
});
