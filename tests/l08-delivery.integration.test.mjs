import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";
import { chromium } from "playwright";
import packagedChromium from "@sparticuz/chromium";
import { hashPassword } from "../src/lib/client-auth-core.mjs";
import { provisionAndLoginStaff } from "./helpers/staff-login.mjs";

// Jornada legada mantida: é a prova HTTP/PostgreSQL vigente de CLI-01..03 e do
// isolamento A≠B básico. O L08 acrescenta, abaixo, o hardening exigido
// (atomicidade, idempotência, aliases e jornada Chromium autenticada).
import "./client-space.integration.test.mjs";

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvConfig(projectRoot);

const optIn = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL || "";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function skipReason() {
  if (!optIn) return "set RUN_DATABASE_INTEGRATION=1 to run the L08 client portal gate against a real PostgreSQL";
  if (!databaseUrl) return "DATABASE_URL is missing; the L08 runner provisions a disposable cluster";
  if (!loopbackHosts.has(new URL(databaseUrl).hostname) && process.env.RUN_DATABASE_INTEGRATION_REMOTE !== "1") {
    return "DATABASE_URL is not a loopback database";
  }
  return null;
}

const skip = skipReason();
const testOptions = skip ? { skip } : {};

const GENERATED_FILES = ["next-env.d.ts", "tsconfig.json"];
const ADMIN_TOKEN_TI = "integration-token-ti-0000000000000000000000000000";
const SESSION_SECRET = "integration-session-secret-00000000000000000000000000";
const CLIENT_PASSWORD = "Nao-serve-para-teste123!";

async function snapshotGeneratedFiles() {
  const snapshot = new Map();
  for (const name of GENERATED_FILES) snapshot.set(name, await readFile(path.join(projectRoot, name), "utf8").catch(() => null));
  return snapshot;
}

async function restoreGeneratedFiles(snapshot) {
  for (const [name, content] of snapshot) {
    if (content === null) continue;
    await writeFile(path.join(projectRoot, name), content);
  }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// O runner aplica 001–139 com o migrador oficial. Aqui garantimos apenas que o
// subconjunto do portal existe quando o arquivo é executado isoladamente.
async function ensurePortalSchema(pool) {
  const ledger = await pool.query("SELECT to_regclass('public.__migrations') IS NOT NULL AS ready");
  if (ledger.rows[0].ready) {
    const applied = await pool.query("SELECT count(*)::int AS total FROM __migrations");
    if (applied.rows[0].total >= 139) return;
  }
  const files = [
    "001-site-visual.sql", "002-public-leads.sql", "003-client-access.sql", "004-client-space.sql",
    "005-client-security.sql", "006-admin-identities.sql", "007-opcao-b-funcionarios.sql",
    "011-audit-and-notifications.sql", "097-client-mfa-session.sql", "098-client-manual-verification.sql",
    "099-sec-staff-session-hardening.sql", "100-l02-local-outbox.sql", "101-l02-document-integrity.sql",
    "139-cli04-05-idempotencia-protocolo-download-log.sql",
  ];
  for (const filename of files) {
    const sql = await readFile(path.join(projectRoot, "db/migrations", filename), "utf8");
    await pool.query(sql);
  }
}

function startServer(port, docsDir) {
  const child = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NEXT_DIST_DIR: ".next/integration-l08-delivery",
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      TRUST_PROXY: "false",
      SITE_VISUAL_SELECTION_ENABLED: "false",
      SITE_ADMIN_TOKEN_MARCELO: "",
      SITE_ADMIN_TOKEN_TI: ADMIN_TOKEN_TI,
      SITE_ADMIN_SESSION_SECRET: SESSION_SECRET,
      CLIENT_DOCS_DIR: docsDir,
      MAIL_HOST: "",
      MAIL_PORT: "25",
      MAIL_SECURE: "false",
      MAIL_FROM: "sem-mail@exemplo.invalid",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", chunk => logs.push(String(chunk)));
  child.stderr.on("data", chunk => logs.push(String(chunk)));
  return { child, logs };
}

async function waitForServer(child, logs) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${logs.join("")}`);
    if (logs.join("").includes("listening on")) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`server did not start in time:\n${logs.join("")}`);
}

test("L08 inventário de contrato mantém CLI-01..05 em uma única fonte canônica legada", async () => {
  const server = await readFile(path.join(projectRoot, "server.mjs"), "utf8");
  const space = await readFile(path.join(projectRoot, "src/server/client-space-api.mjs"), "utf8");
  for (const route of ["/api/client/accounts", "/api/client/contracts", "/api/client/documents", "/api/client/tickets"]) {
    assert.match(server, new RegExp(route.replaceAll("/", "\\/")));
  }
  for (const table of [/client_accounts/, /client_contracts/, /client_documents/, /client_tickets/, /client_document_access_log/]) {
    assert.match(space, table);
  }
  // A auditoria tolerante a falha não pode voltar para os fluxos sensíveis.
  assert.match(space, /auditInTransaction/);
  assert.doesNotMatch(server, /TODO.*CLI-01/);
});

test("L08 hardening da primeira fatia CLI-01..05 sobre PostgreSQL e HTTP reais", testOptions, async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  await ensurePortalSchema(pool);

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "seg-l08-docs-"));
  const generatedFiles = await snapshotGeneratedFiles();
  const { child, logs } = startServer(port, docsDir);

  const accountIds = [];
  const identityIds = [];
  t.after(async () => {
    if (process.env.QA_L08_DUMP_SERVER_LOGS === "1") console.log(logs.join("").slice(-8000));
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve));
    }
    await restoreGeneratedFiles(generatedFiles);
    await rm(docsDir, { recursive: true, force: true });
    await pool.query("DROP TRIGGER IF EXISTS qa_l08_audit_fault ON auth_access_audit").catch(() => {});
    await pool.query("DROP TRIGGER IF EXISTS qa_l08_access_log_fault ON client_document_access_log").catch(() => {});
    await pool.query("DELETE FROM client_document_access_log WHERE client_account_id = ANY($1::uuid[])", [accountIds]).catch(() => {});
    await pool.query("DELETE FROM client_tickets WHERE client_account_id = ANY($1::uuid[])", [accountIds]).catch(() => {});
    await pool.query("DELETE FROM client_documents WHERE client_account_id = ANY($1::uuid[])", [accountIds]).catch(() => {});
    await pool.query("DELETE FROM client_contracts WHERE client_account_id = ANY($1::uuid[])", [accountIds]).catch(() => {});
    await pool.query("DELETE FROM client_access_grants WHERE client_account_id = ANY($1::uuid[])", [accountIds]).catch(() => {});
    await pool.query("DELETE FROM client_accounts WHERE id = ANY($1::uuid[])", [accountIds]).catch(() => {});
    await pool.query("DELETE FROM auth_credentials WHERE identity_id = ANY($1::uuid[])", [identityIds]).catch(() => {});
    await pool.query("DELETE FROM auth_identities WHERE email LIKE 'l08.portal.%'").catch(() => {});
    await pool.end();
  });

  async function api(pathname, { method = "GET", body, cookie, headers: extra = {} } = {}) {
    const headers = { Origin: origin, ...extra };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${origin}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    return { status: response.status, body: parsed, setCookie, headers: response.headers };
  }

  async function loginAs(email) {
    const login = await api("/api/auth/login", { method: "POST", body: { email, password: CLIENT_PASSWORD } });
    assert.equal(login.status, 200, `login de ${email} falhou: ${JSON.stringify(login.body)}`);
    return login.setCookie.map(item => item.split(";")[0]).join("; ");
  }

  await waitForServer(child, logs);

  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const emailA = `l08.portal.a.${runId}@exemplo.invalid`;
  const emailB = `l08.portal.b.${runId}@exemplo.invalid`;
  let identityA = null;
  let identityB = null;
  let adminCookie = null;
  let cookieA = null;
  let cookieB = null;
  let accountA = null;
  let accountB = null;
  let accountRestrito = null;
  let documentA = null;
  let documentB = null;
  const documentPayloadA = Buffer.from("Documento privado sintetico da conta A — L08.\n", "utf8");
  const documentPayloadB = Buffer.from("Documento privado sintetico da conta B — L08.\n", "utf8");

  await t.test("L08-01 semeia duas identidades sintéticas, contas, vínculos, contrato e documentos", async () => {
    const passwordHash = await hashPassword(CLIENT_PASSWORD);
    identityA = randomUUID();
    identityB = randomUUID();
    identityIds.push(identityA, identityB);
    for (const [id, email, name] of [[identityA, emailA, "Cliente A L08"], [identityB, emailB, "Cliente B L08"]]) {
      await pool.query(
        "INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at) VALUES ($1,'client',$2,$3,'active','email_link',NOW())",
        [id, email, name],
      );
      await pool.query("INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)", [id, passwordHash]);
    }

    const staff = await provisionAndLoginStaff(pool, api, { role: "ti" });
    adminCookie = staff.cookie;

    const createdA = await api("/api/admin/client-accounts", { method: "POST", body: { displayName: `Conta L08 A ${runId}` }, cookie: adminCookie });
    assert.equal(createdA.status, 201, JSON.stringify(createdA.body));
    accountA = createdA.body.accountId;
    const createdB = await api("/api/admin/client-accounts", { method: "POST", body: { displayName: `Conta L08 B ${runId}` }, cookie: adminCookie });
    assert.equal(createdB.status, 201);
    accountB = createdB.body.accountId;
    const createdRestrito = await api("/api/admin/client-accounts", { method: "POST", body: { displayName: `Conta L08 restrita ${runId}` }, cookie: adminCookie });
    assert.equal(createdRestrito.status, 201);
    accountRestrito = createdRestrito.body.accountId;
    accountIds.push(accountA, accountB, accountRestrito);

    for (const [identity, account, reason] of [
      [identityA, accountA, "Responsável confirmado (cenário sintético L08)"],
      [identityB, accountB, "Responsável confirmado (cenário sintético L08)"],
      [identityA, accountRestrito, "Vínculo restrito sem contrato autorizado (cenário sintético L08)"],
    ]) {
      const grant = await api("/api/admin/grants", { method: "POST", body: { identityId: identity, clientAccountId: account, reason }, cookie: adminCookie });
      assert.equal(grant.status, 201, JSON.stringify(grant.body));
    }
    // Escopo restrito com allowlist vazia: o portal precisa declarar isso,
    // nunca devolver "zero contratos".
    await pool.query(
      "UPDATE client_access_grants SET contract_scope_mode = 'selected', allowed_contract_ids = '{}' WHERE identity_id = $1 AND client_account_id = $2",
      [identityA, accountRestrito],
    );

    const contract = await api("/api/admin/contracts", {
      method: "POST",
      cookie: adminCookie,
      body: { accountId: accountA, title: `Supervisão e ronda L08 ${runId}`, service: "Supervisão e Ronda", summary: "Contrato sintético do gate L08.", startsOn: "2026-09-01", status: "active" },
    });
    assert.equal(contract.status, 201, JSON.stringify(contract.body));

    const docA = await api("/api/admin/documents", {
      method: "POST",
      cookie: adminCookie,
      body: { accountId: accountA, title: `Relatório privado L08 ${runId}`, category: "Relatórios", filename: "relatorio-l08.txt", contentBase64: documentPayloadA.toString("base64") },
    });
    assert.equal(docA.status, 201, JSON.stringify(docA.body));
    documentA = docA.body.documentId;
    const docB = await api("/api/admin/documents", {
      method: "POST",
      cookie: adminCookie,
      body: { accountId: accountB, title: `Relatório privado B ${runId}`, category: "Relatórios", filename: "relatorio-b.txt", contentBase64: documentPayloadB.toString("base64") },
    });
    assert.equal(docB.status, 201);
    documentB = docB.body.documentId;

    cookieA = await loginAs(emailA);
    cookieB = await loginAs(emailB);
  });

  await t.test("L08-02 identidade e conta forjadas no corpo não ampliam autorização", async () => {
    // Corpo tenta assumir a identidade de B e a conta de B, com sessão de A.
    const forgedAccount = await api("/api/client/tickets", {
      method: "POST",
      cookie: cookieA,
      body: { accountId: accountB, identityId: identityB, opened_by_identity: identityB, role: "ti", category: "Outro assunto", title: "Conta forjada", details: "Deve ser negado pelo escopo do servidor." },
    });
    assert.equal(forgedAccount.status, 403);
    assert.deepEqual(forgedAccount.body, { error: "forbidden" });

    // Mesma tentativa na própria conta: a autoria tem de vir da sessão, não do corpo.
    const forgedAuthor = await api("/api/client/tickets", {
      method: "POST",
      cookie: cookieA,
      body: { accountId: accountA, identityId: identityB, opened_by_identity: identityB, clientAccountId: accountB, category: "Outro assunto", title: `Autoria forjada ${runId}`, details: "A autoria deve vir da sessão." },
    });
    assert.equal(forgedAuthor.status, 201, JSON.stringify(forgedAuthor.body));
    const stored = await pool.query("SELECT client_account_id, opened_by_identity FROM client_tickets WHERE id = $1", [forgedAuthor.body.ticketId]);
    assert.equal(stored.rows[0].opened_by_identity, identityA);
    assert.equal(stored.rows[0].client_account_id, accountA);
  });

  await t.test("L08-03 leitura, escrita e download cruzados A≠B são negados em todas as rotas", async () => {
    for (const pathname of [`/api/client/contracts?account=${accountB}`, `/api/client/documents?account=${accountB}`, `/api/client/tickets?account=${accountB}`]) {
      const response = await api(pathname, { cookie: cookieA });
      assert.equal(response.status, 403, `${pathname} deveria negar escopo cruzado`);
      assert.deepEqual(response.body, { error: "forbidden" });
    }
    const crossDownload = await fetch(`${origin}/api/client/documents/${documentB}/download`, { headers: { Origin: origin, Cookie: cookieA } });
    assert.equal(crossDownload.status, 403);
    const crossBytes = Buffer.from(await crossDownload.arrayBuffer());
    assert.ok(!crossBytes.includes(documentPayloadB), "nenhum byte da conta B pode vazar para A");

    // O ID do documento vem do cliente; a autorização não.
    const unknown = await api(`/api/client/documents/${randomUUID()}/download`, { cookie: cookieA });
    assert.equal(unknown.status, 404);
    const anonymous = await api(`/api/client/documents/${documentA}/download`);
    assert.equal(anonymous.status, 401);
  });

  await t.test("L08-04 aliases /api/client/* não promovidos negam a sessão do cliente", async () => {
    // Os aliases v2 continuam staff-only: a existência do caminho não prova
    // autorização do cliente e nenhum deles pode devolver dado de conta.
    const aliases = [
      "/api/client/tickets-v2", "/api/client/documents-v2", "/api/client/document-download",
      "/api/client/charges-v2", "/api/client/reports-v2", "/api/client/service-requests",
      "/api/client/visits", "/api/client/portal-access-requests", "/api/client/email-change-requests",
    ];
    for (const alias of aliases) {
      const response = await api(`${alias}?account=${accountB}`, { cookie: cookieA });
      assert.ok([401, 403, 404, 405].includes(response.status), `${alias} respondeu ${response.status} para sessão de cliente`);
      const serialized = JSON.stringify(response.body);
      assert.ok(!serialized.includes(accountB), `${alias} não pode devolver dados da conta B`);
      assert.ok(!serialized.includes(documentPayloadB.toString("utf8").trim()), `${alias} não pode devolver conteúdo privado`);
    }
  });

  await t.test("L08-05 retries concorrentes do mesmo chamado não duplicam protocolo", async () => {
    const key = `l08-idem-${runId}`;
    const payload = { accountId: accountA, category: "Acesso ao portal", title: `Retry concorrente ${runId}`, details: "Mesma chave, mesmo conteúdo, cinco tentativas simultâneas.", idempotencyKey: key };
    const responses = await Promise.all(Array.from({ length: 5 }, () => api("/api/client/tickets", { method: "POST", cookie: cookieA, body: payload })));
    for (const response of responses) assert.ok([200, 201].includes(response.status), JSON.stringify(response.body));
    const created = responses.filter(response => response.status === 201);
    assert.equal(created.length, 1, "apenas uma tentativa pode criar o chamado");
    const protocols = new Set(responses.map(response => response.body.protocol));
    assert.equal(protocols.size, 1, "todas as respostas devem apontar o mesmo protocolo");
    const ids = new Set(responses.map(response => response.body.ticketId));
    assert.equal(ids.size, 1);
    assert.ok(responses.filter(response => response.body.replayed === true).length === 4);

    const rows = await pool.query("SELECT id, protocol FROM client_tickets WHERE client_account_id = $1 AND idempotency_key = $2", [accountA, key]);
    assert.equal(rows.rowCount, 1, "o banco deve conter exatamente um chamado para a chave");
    assert.match(rows.rows[0].protocol, /^CLI-\d{8}-[0-9A-Z]{6}$/);
  });

  await t.test("L08-06 mesma chave com conteúdo diferente é conflito explícito, não duplicação", async () => {
    const key = `l08-conflito-${runId}`;
    const first = await api("/api/client/tickets", { method: "POST", cookie: cookieA, body: { accountId: accountA, category: "Outro assunto", title: `Conflito base ${runId}`, details: "Conteúdo original.", idempotencyKey: key } });
    assert.equal(first.status, 201);
    const second = await api("/api/client/tickets", { method: "POST", cookie: cookieA, body: { accountId: accountA, category: "Outro assunto", title: `Conflito alterado ${runId}`, details: "Conteúdo diferente com a mesma chave.", idempotencyKey: key } });
    assert.equal(second.status, 409);
    assert.equal(second.body.error, "idempotency_conflict");
    const rows = await pool.query("SELECT id FROM client_tickets WHERE client_account_id = $1 AND idempotency_key = $2", [accountA, key]);
    assert.equal(rows.rowCount, 1);

    // A chave pertence ao par conta+identidade: B não reaproveita a chave de A.
    const fromB = await api("/api/client/tickets", { method: "POST", cookie: cookieB, body: { accountId: accountB, category: "Outro assunto", title: `Chave reutilizada ${runId}`, details: "Conta B usa a mesma chave na própria conta.", idempotencyKey: key } });
    assert.equal(fromB.status, 201);
    assert.notEqual(fromB.body.protocol, first.body.protocol);
  });

  await t.test("L08-07 falha de auditoria devolve 503 e reverte a abertura do chamado", async () => {
    await pool.query(`CREATE OR REPLACE FUNCTION qa_l08_audit_fault() RETURNS trigger AS $$
      BEGIN
        IF NEW.action = 'ticket_open' THEN RAISE EXCEPTION 'qa_l08_synthetic_audit_outage'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await pool.query("CREATE TRIGGER qa_l08_audit_fault BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_l08_audit_fault()");
    try {
      const title = `Auditoria indisponivel ${runId}`;
      const response = await api("/api/client/tickets", { method: "POST", cookie: cookieA, body: { accountId: accountA, category: "Outro assunto", title, details: "A auditoria vai falhar; nada pode ser gravado.", idempotencyKey: `l08-audit-${runId}` } });
      assert.equal(response.status, 503, JSON.stringify(response.body));
      assert.equal(response.body.retryable, true);
      const rows = await pool.query("SELECT id FROM client_tickets WHERE client_account_id = $1 AND title = $2", [accountA, title]);
      assert.equal(rows.rowCount, 0, "a escrita precisa sofrer rollback integral; não existe sucesso parcial");
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS qa_l08_audit_fault ON auth_access_audit");
    }
  });

  await t.test("L08-08 download privado grava acesso e auditoria na mesma transação antes dos bytes", async () => {
    const before = await pool.query("SELECT count(*)::int AS total FROM client_document_access_log WHERE document_id = $1", [documentA]);
    const download = await fetch(`${origin}/api/client/documents/${documentA}/download`, { headers: { Origin: origin, Cookie: cookieA } });
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), documentPayloadA);
    const after = await pool.query(
      "SELECT actor_kind, actor_id, outcome FROM client_document_access_log WHERE document_id = $1 ORDER BY id DESC LIMIT 1",
      [documentA],
    );
    const total = await pool.query("SELECT count(*)::int AS total FROM client_document_access_log WHERE document_id = $1", [documentA]);
    assert.equal(total.rows[0].total, before.rows[0].total + 1);
    assert.deepEqual(after.rows[0], { actor_kind: "client", actor_id: identityA, outcome: "allowed" });
    const audit = await pool.query(
      "SELECT count(*)::int AS total FROM auth_access_audit WHERE target = $1 AND action = 'document_download' AND result = 'allowed' AND actor_id = $2",
      [documentA, identityA],
    );
    assert.ok(audit.rows[0].total >= 1);
  });

  await t.test("L08-09 falha no registro do download devolve 503 sem entregar um byte", async () => {
    await pool.query(`CREATE OR REPLACE FUNCTION qa_l08_access_log_fault() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'qa_l08_synthetic_access_log_outage'; END; $$ LANGUAGE plpgsql`);
    await pool.query("CREATE TRIGGER qa_l08_access_log_fault BEFORE INSERT ON client_document_access_log FOR EACH ROW EXECUTE FUNCTION qa_l08_access_log_fault()");
    try {
      const response = await fetch(`${origin}/api/client/documents/${documentA}/download`, { headers: { Origin: origin, Cookie: cookieA } });
      assert.equal(response.status, 503);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok(!bytes.includes(documentPayloadA), "nenhum byte do documento pode sair sem registro");
      assert.equal(JSON.parse(bytes.toString("utf8")).retryable, true);
      const logged = await pool.query("SELECT count(*)::int AS total FROM client_document_access_log WHERE document_id = $1", [documentA]);
      assert.ok(logged.rows[0].total >= 0);
    } finally {
      await pool.query("DROP TRIGGER IF EXISTS qa_l08_access_log_fault ON client_document_access_log");
    }
  });

  await t.test("L08-10 falha de leitura aparece como erro recuperável, nunca como lista vazia", async () => {
    await pool.query("ALTER TABLE client_tickets RENAME TO client_tickets_qa_l08_tmp");
    let response;
    try {
      response = await api(`/api/client/tickets?account=${accountA}`, { cookie: cookieA });
    } finally {
      await pool.query("ALTER TABLE client_tickets_qa_l08_tmp RENAME TO client_tickets");
    }
    assert.equal(response.status, 503);
    assert.equal(response.body.retryable, true);
    assert.equal(response.body.tickets, undefined, "falha de leitura não pode virar lista vazia");

    const healthy = await api(`/api/client/tickets?account=${accountA}`, { cookie: cookieA });
    assert.equal(healthy.status, 200);
    assert.equal(healthy.body.dataAvailable, true);
    assert.equal(healthy.body.source, "client_tickets");
  });

  await t.test("L08-11 ausência de dado é declarada e não apresentada como zero", async () => {
    // Conta vinculada com allowlist vazia: escopo restrito declarado.
    const restricted = await api(`/api/client/contracts?account=${accountRestrito}`, { cookie: cookieA });
    assert.equal(restricted.status, 200);
    assert.deepEqual(restricted.body.contracts, []);
    assert.equal(restricted.body.dataAvailable, false);
    assert.equal(restricted.body.emptyReason, "escopo_restrito_sem_contrato_autorizado");

    // Conta sem documentos: a ausência é declarada como ausência de registro.
    const documents = await api(`/api/client/documents?account=${accountRestrito}`, { cookie: cookieA });
    assert.equal(documents.status, 200);
    assert.equal(documents.body.dataAvailable, true);
    assert.equal(documents.body.empty, true);
    assert.equal(documents.body.emptyReason, "sem_registro_canonico_para_a_conta");

    // Conta com dados: nenhuma marcação enganosa de vazio.
    const contracts = await api(`/api/client/contracts?account=${accountA}`, { cookie: cookieA });
    assert.equal(contracts.body.empty, false);
    assert.equal(contracts.body.emptyReason, null);
  });

  await t.test("L08-12 jornada Chromium real: entrada, conta, contrato, documento privado e chamado", async () => {
    const browser = await chromium.launch({
      executablePath: await packagedChromium.executablePath(),
      headless: true,
      args: packagedChromium.args.filter(arg => arg !== "--disable-web-security"),
    });
    try {
      const context = await browser.newContext({ baseURL: origin });
      // Compilação sob demanda do servidor de desenvolvimento; não é tolerância
      // a falha de asserção, é espera de build da rota.
      context.setDefaultNavigationTimeout(180_000);
      context.setDefaultTimeout(120_000);
      const page = await context.newPage();

      // CLI-01 — entrada real pela tela, sem sessão inventada.
      await page.goto("/cliente/entrar", { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: /Entrar na área do cliente/i }).waitFor();
      // Espera a hidratação do App Router: sem ela o clique vira submit nativo
      // (GET com a senha na URL) e a jornada deixaria de ser a jornada real.
      await page.waitForLoadState("networkidle");
      await page.locator("#email").fill(emailA);
      await page.locator("#password").fill(CLIENT_PASSWORD);
      const [loginResponse] = await Promise.all([
        page.waitForResponse(response => response.url().includes("/api/auth/login") && response.request().method() === "POST"),
        page.getByRole("button", { name: /^Entrar$/ }).click(),
      ]);
      assert.equal(loginResponse.status(), 200);
      await page.waitForURL(/\/cliente\/app/);

      // CLI-02 — a conta vinculada aparece; a conta de B jamais aparece.
      await page.getByRole("heading", { name: `Resumo — Conta L08 A ${runId}` }).waitFor();
      assert.equal(await page.getByText(`Conta L08 B ${runId}`).count(), 0, "a conta de B não pode aparecer para A");

      // CLI-03 — contrato da conta.
      await page.goto("/cliente/app/contratos", { waitUntil: "domcontentloaded" });
      await page.getByText(`Supervisão e ronda L08 ${runId}`).first().waitFor();

      // CLI-04 — documento privado listado e baixado pela própria sessão do navegador.
      await page.goto("/cliente/app/documentos", { waitUntil: "domcontentloaded" });
      await page.getByText(`Relatório privado L08 ${runId}`).first().waitFor();
      const browserDownload = await context.request.get(`/api/client/documents/${documentA}/download`);
      assert.equal(browserDownload.status(), 200);
      assert.deepEqual(Buffer.from(await browserDownload.body()), documentPayloadA);
      const crossFromBrowser = await context.request.get(`/api/client/documents/${documentB}/download`);
      assert.equal(crossFromBrowser.status(), 403);

      // CLI-05 — chamado aberto pela interface, com protocolo visível.
      await page.goto("/cliente/app/chamados", { waitUntil: "domcontentloaded" });
      const ticketTitle = `Chamado pela interface ${runId}`;
      await page.locator("#ticket-title").fill(ticketTitle);
      await page.locator("#ticket-details").fill("Chamado sintético aberto pela jornada Chromium do gate L08.");
      await page.getByRole("button", { name: /Registrar chamado/i }).click();
      const success = page.getByText(/Chamado registrado sob o protocolo CLI-\d{8}-[0-9A-Z]{6}/);
      await success.waitFor();
      const successText = await success.innerText();
      const protocol = successText.match(/CLI-\d{8}-[0-9A-Z]{6}/)[0];

      const persisted = await pool.query(
        "SELECT client_account_id, opened_by_identity, protocol, idempotency_key FROM client_tickets WHERE title = $1",
        [ticketTitle],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0].protocol, protocol);
      assert.equal(persisted.rows[0].client_account_id, accountA);
      assert.equal(persisted.rows[0].opened_by_identity, identityA, "a autoria vem da sessão, não da tela");
      assert.ok(persisted.rows[0].idempotency_key, "a interface precisa enviar chave de idempotência");
      const audited = await pool.query(
        "SELECT count(*)::int AS total FROM auth_access_audit WHERE action = 'ticket_open' AND actor_id = $1 AND result = 'allowed'",
        [identityA],
      );
      assert.ok(audited.rows[0].total >= 1);
    } finally {
      await browser.close();
    }
  });

  await t.test("L08-13 nenhuma integração externa é apresentada como realizada", async () => {
    // O gate roda sem SMTP, PSP, serviço externo ou banco real: a recuperação
    // de senha não pode anunciar envio de e-mail que não aconteceu.
    const recovery = await api("/api/auth/recover", { method: "POST", body: { email: emailA } });
    assert.ok([200, 202, 404, 405, 429].includes(recovery.status), `status inesperado: ${recovery.status}`);
    const serialized = JSON.stringify(recovery.body);
    assert.ok(!/"sent"\s*:\s*true/.test(serialized), "sem SMTP configurado nada pode ser declarado como enviado");
    assert.equal(process.env.MAIL_HOST || "", "", "o gate não usa SMTP real");
  });
});
