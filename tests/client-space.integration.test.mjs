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
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvConfig(projectRoot);

const optIn = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL || "";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function skipReason() {
  if (!optIn) return "set RUN_DATABASE_INTEGRATION=1 to run the client space flow against a real PostgreSQL";
  if (!databaseUrl) return "DATABASE_URL is missing; copy .env.example to .env.local first";
  if (!loopbackHosts.has(new URL(databaseUrl).hostname) && process.env.RUN_DATABASE_INTEGRATION_REMOTE !== "1") {
    return "DATABASE_URL is not a loopback database; set RUN_DATABASE_INTEGRATION_REMOTE=1 to allow it";
  }
  return null;
}

const skip = skipReason();
const testOptions = skip ? { skip } : {};

const GENERATED_FILES = ["next-env.d.ts", "tsconfig.json"];

async function snapshotGeneratedFiles() {
  const snapshot = new Map();
  for (const name of GENERATED_FILES) {
    snapshot.set(name, await readFile(path.join(projectRoot, name), "utf8").catch(() => null));
  }
  return snapshot;
}

async function restoreGeneratedFiles(snapshot) {
  for (const [name, content] of snapshot) {
    if (content === null) continue;
    await writeFile(path.join(projectRoot, name), content);
  }
}

const ADMIN_TOKEN_TI = "integration-token-ti-0000000000000000000000000000";
const SESSION_SECRET = "integration-session-secret-00000000000000000000000000";

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

async function applyMigrations() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    for (const filename of ["001-site-visual.sql", "002-public-leads.sql", "003-client-access.sql", "004-client-space.sql", "005-client-security.sql", "006-admin-identities.sql", "007-opcao-b-funcionarios.sql", "097-client-mfa-session.sql", "098-client-manual-verification.sql"]) {
      const sql = await readFile(path.join(projectRoot, "db/migrations", filename), "utf8");
      await pool.query(sql);
    }
  } finally {
    await pool.end();
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
      NEXT_DIST_DIR: ".next/integration-client-space",
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

test("client space enforces verified scoping end to end", testOptions, async t => {
  await applyMigrations();

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const docsDir = await mkdtemp(path.join(os.tmpdir(), "seg-client-docs-"));
  const generatedFiles = await snapshotGeneratedFiles();
  const { child, logs } = startServer(port, docsDir);
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve));
    }
    await restoreGeneratedFiles(generatedFiles);
    await rm(docsDir, { recursive: true, force: true });
  });

  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const clientAEmail = `integracao.espaco.a.${runId}@exemplo.invalid`;
  const clientBEmail = `integracao.espaco.b.${runId}@exemplo.invalid`;
  const clientPassword = "Nao-serve-para-teste123!";

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const cleanupIds = [];
  t.after(async () => {
    const ids = [...cleanupIds];
    await pool
      .query(
        "DELETE FROM client_ticket_status_audit WHERE ticket_id IN (SELECT id FROM client_tickets WHERE client_account_id = ANY($1::uuid[]))",
        [ids],
      )
      .catch(() => {});
    await pool.query("DELETE FROM client_tickets WHERE client_account_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await pool.query("DELETE FROM client_documents WHERE client_account_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await pool.query("DELETE FROM client_contracts WHERE client_account_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await pool.query("DELETE FROM client_access_grants WHERE client_account_id = ANY($1::uuid[])", [ids]).catch(() => {});
    await pool.query("DELETE FROM client_accounts WHERE id = ANY($1::uuid[])", [ids]).catch(() => {});
    if (ids.length) {
      await pool.query("DELETE FROM auth_access_audit WHERE target = ANY($1::text[]) OR actor_id = ANY($1::text[])", [ids]).catch(() => {});
    }
    await pool.query("DELETE FROM auth_identities WHERE email LIKE 'integracao.espaco.%'").catch(() => {});
    await pool.end();
  });

  async function api(pathname, { method = "GET", body, cookie } = {}) {
    const headers = { Origin: origin };
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${origin}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.getSetCookie?.() ?? [];
    const text = await response.text();
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    return { status: response.status, body: parsed, setCookie, headers: response.headers };
  }

  await waitForServer(child, logs);

  let adminCookie = null;
  let identityA = null;
  let identityB = null;
  await t.test("seeds two client identities and authenticates the admin role", async () => {
    const passwordHash = await hashPassword(clientPassword);
    identityA = randomUUID();
    identityB = randomUUID();
    await pool.query(
      "INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at) VALUES ($1,'client',$2,$3,'active','email_link',NOW())",
      [identityA, clientAEmail, "Cliente A Integração"],
    );
    await pool.query(
      "INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at) VALUES ($1,'client',$2,$3,'active','email_link',NOW())",
      [identityB, clientBEmail, "Cliente B Integração"],
    );
    cleanupIds.push(identityA, identityB);
    await pool.query("INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)", [identityA, passwordHash]);
    await pool.query("INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)", [identityB, passwordHash]);

    const session = await api("/api/admin/session", { method: "POST", body: { token: ADMIN_TOKEN_TI } });
    assert.equal(session.status, 200);
    adminCookie = session.setCookie.map(item => item.split(";")[0]).join("; ");
    assert.match(adminCookie, /^[^=]+=/);
  });

  async function loginAs(email) {
    const login = await api("/api/auth/login", { method: "POST", body: { email, password: clientPassword } });
    assert.equal(login.status, 200, `login de ${email} falhou: ${JSON.stringify(login.body)}`);
    assert.equal(login.body.emailConfirmed, true);
    return login.setCookie.map(item => item.split(";")[0]).join("; ");
  }

  let accountA1 = null;
  let accountA2 = null;
  let accountA3 = null;
  let cookieA = null;
  let cookieB = null;

  await t.test("admin creates central accounts, suspends one, and both wipes are audited", async () => {
    const anon = await api("/api/admin/client-accounts", { method: "POST", body: { displayName: "Anônimo" } });
    assert.equal(anon.status, 401);

    const first = await api("/api/admin/client-accounts", {
      method: "POST",
      body: { displayName: "Condomínio Integração A1", documentRef: "11.111.111/0001-11", notes: "Cadastro de teste (integração)" },
      cookie: adminCookie,
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    accountA1 = first.body.accountId;
    cleanupIds.push(accountA1);

    const second = await api("/api/admin/client-accounts", {
      method: "POST",
      body: { displayName: "Empresa Integração A2" },
      cookie: adminCookie,
    });
    assert.equal(second.status, 201);
    accountA2 = second.body.accountId;
    cleanupIds.push(accountA2);

    const third = await api("/api/admin/client-accounts", {
      method: "POST",
      body: { displayName: "Fazenda Integração A3" },
      cookie: adminCookie,
    });
    assert.equal(third.status, 201);
    accountA3 = third.body.accountId;
    cleanupIds.push(accountA3);

    const suspended = await api(`/api/admin/client-accounts/${accountA3}`, {
      method: "PATCH",
      body: { status: "suspended" },
      cookie: adminCookie,
    });
    assert.equal(suspended.status, 200);

    const listed = await api("/api/admin/client-accounts", { cookie: adminCookie });
    assert.equal(listed.status, 200);
    const names = listed.body.accounts.slice(0, 3).map(item => item.display_name);
    assert.ok(names.includes("Condomínio Integração A1"));
    assert.equal(listed.body.role, "ti");

    const audit = await pool.query(
      "SELECT action, actor_kind, result FROM auth_access_audit WHERE target = $1 ORDER BY id",
      [accountA3],
    );
    assert.deepEqual(
      audit.rows.map(row => [row.action, row.actor_kind, row.result]),
      [
        ["account_create", "ti", "allowed"],
        ["account_status", "ti", "allowed"],
      ],
    );

    cookieA = await loginAs(clientAEmail);
    cookieB = await loginAs(clientBEmail);
  });

  let grantA1 = null;
  await t.test("grant issuance is audited, duplicate-protected, and requires confirmed motive", async () => {
    const missingReason = await api("/api/admin/grants", {
      method: "POST",
      body: { identityId: identityA, clientAccountId: accountA1, reason: "   " },
      cookie: adminCookie,
    });
    assert.equal(missingReason.status, 400);
    assert.equal(missingReason.body.error, "reason_required");

    const issued = await api("/api/admin/grants", {
      method: "POST",
      body: {
        identityId: identityA,
        clientAccountId: accountA1,
        reason: "Responsável legal conforme contrato 114/2026",
        scopeNote: "Somente sede administrativa",
      },
      cookie: adminCookie,
    });
    assert.equal(issued.status, 201, JSON.stringify(issued.body));
    grantA1 = issued.body.grantId;
    cleanupIds.push(grantA1);

    const duplicate = await api("/api/admin/grants", {
      method: "POST",
      body: { identityId: identityA, clientAccountId: accountA1, reason: "Tentativa duplicada" },
      cookie: adminCookie,
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, "grant_exists");

    const issuedA3 = await api("/api/admin/grants", {
      method: "POST",
      body: { identityId: identityA, clientAccountId: accountA3, reason: "Consultoria pontual cadastrada" },
      cookie: adminCookie,
    });
    assert.equal(issuedA3.status, 201);

    const issuedB = await api("/api/admin/grants", {
      method: "POST",
      body: { identityId: identityB, clientAccountId: accountA2, reason: "Gestora da empresa confirmada" },
      cookie: adminCookie,
    });
    assert.equal(issuedB.status, 201);

    const unknownIdentity = await api("/api/admin/grants", {
      method: "POST",
      body: { identityId: randomUUID(), clientAccountId: accountA1, reason: "Identidade inexistente" },
      cookie: adminCookie,
    });
    assert.equal(unknownIdentity.status, 404);
    assert.equal(unknownIdentity.body.error, "identity_not_found");

    const search = await api(`/api/admin/identities?q=${encodeURIComponent(clientBEmail.slice(0, 12))}`, { cookie: adminCookie });
    assert.equal(search.status, 200);
    assert.ok(search.body.identities.some(item => item.email === clientBEmail));
    const tooShort = await api("/api/admin/identities?q=ab", { cookie: adminCookie });
    assert.deepEqual(tooShort.body, { identities: [] });

    const grantsList = await api("/api/admin/grants", { cookie: adminCookie });
    assert.equal(grantsList.status, 200);
    const grantRow = grantsList.body.grants.find(item => item.id === grantA1);
    assert.equal(grantRow.identity_email, clientAEmail);
    assert.equal(grantRow.account_name, "Condomínio Integração A1");
    assert.equal(grantRow.scope_note, "Somente sede administrativa");
    assert.equal(grantRow.reason, "Responsável legal conforme contrato 114/2026");

    const audit = await pool.query(
      "SELECT action, result FROM auth_access_audit WHERE target = ANY($1::text[]) AND action = 'grant_issue'",
      [[grantA1]],
    );
    assert.deepEqual(audit.rows.map(row => [row.action, row.result]), [["grant_issue", "allowed"]]);
  });

  await t.test("client account listing reflects the server-side verified links", async () => {
    const anon = await api("/api/client/accounts");
    assert.equal(anon.status, 401);
    assert.deepEqual(anon.body, { error: "client_session_required" });

    const listA = await api("/api/client/accounts", { cookie: cookieA });
    assert.equal(listA.status, 200);
    const byName = new Map(listA.body.accounts.map(item => [item.display_name, item]));
    assert.equal(listA.body.accounts.length, 2);
    assert.equal(byName.get("Condomínio Integração A1").status, "active");
    assert.equal(byName.get("Fazenda Integração A3").status, "suspended");
    assert.equal(byName.get("Condomínio Integração A1").scope_note, "Somente sede administrativa");

    const listB = await api("/api/client/accounts", { cookie: cookieB });
    assert.equal(listB.body.accounts.length, 1);
    assert.equal(listB.body.accounts[0].display_name, "Empresa Integração A2");
  });

  let contractId = null;
  await t.test("contracts follow the verified scope on the server, not browser-supplied ids", async () => {
    const adminCreate = await api("/api/admin/contracts", {
      method: "POST",
      body: {
        accountId: accountA1,
        title: "Supervisão e ronda — sede",
        service: "Supervisão e Ronda",
        summary: "Cobertura de rondas programadas (teste de integração).",
        startsOn: "2026-09-01",
        status: "active",
      },
      cookie: adminCookie,
    });
    assert.equal(adminCreate.status, 201, JSON.stringify(adminCreate.body));
    contractId = adminCreate.body.contractId;
    cleanupIds.push(contractId);

    const inventedService = await api("/api/admin/contracts", {
      method: "POST",
      body: { accountId: accountA1, title: "Serviço inventado", service: "Detector de Unicórnio 5G" },
      cookie: adminCookie,
    });
    assert.equal(inventedService.status, 400);
    assert.equal(inventedService.body.error, "contract_service_unknown");

    const listA = await api(`/api/client/contracts?account=${accountA1}`, { cookie: cookieA });
    assert.equal(listA.status, 200);
    assert.equal(listA.body.contracts.length, 1);
    assert.equal(listA.body.contracts[0].title, "Supervisão e ronda — sede");
    assert.equal(listA.body.contracts[0].status, "active");

    // Duas contas A/B reais no PostgreSQL QA: sessão A não pode listar B e vice-versa.
    const secondA = await api("/api/admin/contracts", {
      method: "POST",
      body: { accountId: accountA1, title: "Outro contrato sintético A", service: "Supervisão e Ronda" },
      cookie: adminCookie,
    });
    assert.equal(secondA.status, 201);
    cleanupIds.push(secondA.body.contractId);
    const ownB = await api("/api/admin/contracts", {
      method: "POST",
      body: { accountId: accountA2, title: "Contrato sintético B", service: "Supervisão e Ronda" },
      cookie: adminCookie,
    });
    assert.equal(ownB.status, 201);
    cleanupIds.push(ownB.body.contractId);
    const listB = await api(`/api/client/contracts?account=${accountA2}`, { cookie: cookieB });
    assert.equal(listB.status, 200);
    assert.deepEqual(listB.body.contracts.map(item => item.id), [ownB.body.contractId]);
    const crossAtoB = await api(`/api/client/contracts?account=${accountA2}`, { cookie: cookieA });
    assert.equal(crossAtoB.status, 403);
    assert.deepEqual(crossAtoB.body, { error: "forbidden" });

    // Mesmo dentro da conta A, allowlist selecionada não pode incluir C2.
    await pool.query(`UPDATE client_access_grants SET contract_scope_mode='selected', allowed_contract_ids=$2 WHERE id=$1`, [grantA1, [contractId]]);
    const selected = await api(`/api/client/contracts?account=${accountA1}`, { cookie: cookieA });
    assert.equal(selected.status, 200);
    assert.deepEqual(selected.body.contracts.map(item => item.id), [contractId]);
    await pool.query(`UPDATE client_access_grants SET allowed_contract_ids='{}' WHERE id=$1`, [grantA1]);
    const empty = await api(`/api/client/contracts?account=${accountA1}`, { cookie: cookieA });
    assert.deepEqual(empty.body, { contracts: [] });
    await pool.query(`UPDATE client_access_grants SET contract_scope_mode='all' WHERE id=$1`, [grantA1]);

    // Negação por padrão: B pediu um cadastro que não é dele. Resposta genérica e auditada.
    const cross = await api(`/api/client/contracts?account=${accountA1}`, { cookie: cookieB });
    assert.equal(cross.status, 403);
    assert.deepEqual(cross.body, { error: "forbidden" });
    const denied = await pool.query(
      `SELECT action, result, detail_category AS category FROM auth_access_audit
       WHERE actor_id = $1 AND action = 'contract_list' ORDER BY id DESC LIMIT 1`,
      [identityB],
    );
    assert.deepEqual(denied.rows[0], { action: "contract_list", result: "denied", category: "authorization_denied" });

    // Vínculo existe, porém o cadastro está suspenso: o acesso continua negado.
    const suspendedAccount = await api(`/api/client/contracts?account=${accountA3}`, { cookie: cookieA });
    assert.equal(suspendedAccount.status, 403);
    assert.deepEqual(suspendedAccount.body, { error: "forbidden" });

    // Restrição de unidade incompatível com A1: não presumir acesso irrestrito.
    await pool.query('UPDATE client_access_grants SET unit_account_id=$2 WHERE id=$1', [grantA1, accountA2]);
    const unitDenied = await api(`/api/client/contracts?account=${accountA1}`, { cookie: cookieA });
    assert.equal(unitDenied.status, 403);
    assert.deepEqual(unitDenied.body, { error: "forbidden" });
    await pool.query('UPDATE client_access_grants SET unit_account_id=NULL WHERE id=$1', [grantA1]);

    const ended = await api(`/api/admin/contracts/${contractId}`, {
      method: "PATCH",
      body: { status: "ended" },
      cookie: adminCookie,
    });
    assert.equal(ended.status, 200);
    const relisted = await api(`/api/client/contracts?account=${accountA1}`, { cookie: cookieA });
    assert.equal(relisted.body.contracts.find(item => item.id === contractId)?.status, "ended");
  });

  let documentId = null;
  const documentPayload = Buffer.from("conteudo de demonstracao do arquivo 1234567890\nsegunda linha\n", "utf8");
  await t.test("documents round-trip exactly and downloads are audited with safe headers", async () => {
    const badType = await api("/api/admin/documents", {
      method: "POST",
      body: {
        accountId: accountA1,
        title: "Executável perigoso",
        category: "Teste",
        filename: "malicioso.exe",
        contentBase64: Buffer.from("MZ90").toString("base64"),
      },
      cookie: adminCookie,
    });
    assert.equal(badType.status, 400);
    assert.equal(badType.body.error, "document_type_not_allowed");

    const uploaded = await api("/api/admin/documents", {
      method: "POST",
      body: {
        accountId: accountA1,
        title: "Relatório de integração",
        category: "Relatórios",
        filename: "relatorio-integracao.txt",
        contentBase64: documentPayload.toString("base64"),
      },
      cookie: adminCookie,
    });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    documentId = uploaded.body.documentId;
    cleanupIds.push(documentId);
    assert.equal(uploaded.body.sizeBytes, documentPayload.length);
    assert.equal(uploaded.body.contentType, "text/plain; charset=utf-8");

    const listA = await api(`/api/client/documents?account=${accountA1}`, { cookie: cookieA });
    assert.equal(listA.status, 200);
    assert.equal(listA.body.documents.length, 1);
    assert.equal(listA.body.documents[0].original_filename, "relatorio-integracao.txt");

    const listBFromA = await api(`/api/client/documents?account=${accountA2}`, { cookie: cookieA });
    assert.equal(listBFromA.status, 403);
    assert.deepEqual(listBFromA.body, { error: "forbidden" });
    const payloadB = Buffer.from('DOCUMENTO-SINTETICO-B-NAO-EXIBIR-PARA-A');
    const createdB = await api('/api/admin/documents', {
      method: 'POST',
      body: { accountId: accountA2, title: 'Documento da conta B', category: 'Teste', filename: 'qa-b.txt', contentBase64: payloadB.toString('base64') },
      cookie: adminCookie,
    });
    assert.equal(createdB.status, 201, JSON.stringify(createdB.body));
    cleanupIds.push(createdB.body.documentId);
    const listB = await api(`/api/client/documents?account=${accountA2}`, { cookie: cookieB });
    assert.equal(listB.status, 200);
    assert.deepEqual(listB.body.documents.map(item => item.id), [createdB.body.documentId]);
    const ownB = await fetch(`${origin}/api/client/documents/${createdB.body.documentId}/download`, {
      headers: { Origin: origin, Cookie: cookieB },
    });
    assert.equal(ownB.status, 200);
    assert.deepEqual(Buffer.from(await ownB.arrayBuffer()), payloadB);
    const crossB = await fetch(`${origin}/api/client/documents/${createdB.body.documentId}/download`, {
      headers: { Origin: origin, Cookie: cookieA },
    });
    assert.equal(crossB.status, 403);
    assert.deepEqual(await crossB.json(), { error: "forbidden" });

    const downloadResponse = await fetch(`${origin}/api/client/documents/${documentId}/download`, {
      headers: { Origin: origin, Cookie: cookieA },
    });
    assert.equal(downloadResponse.status, 200);
    assert.match(
      downloadResponse.headers.get("content-disposition") ?? "",
      /attachment; filename="relatorio-integracao\.txt"; filename\*=UTF-8''relatorio-integracao\.txt/,
    );
    assert.equal(downloadResponse.headers.get("cache-control"), "private, no-store");
    assert.equal(downloadResponse.headers.get("x-content-type-options"), "nosniff");
    const bytes = Buffer.from(await downloadResponse.arrayBuffer());
    assert.deepEqual(bytes, documentPayload, "o download deve devolver exatamente os bytes enviados");

    const cross = await fetch(`${origin}/api/client/documents/${documentId}/download`, {
      headers: { Origin: origin, Cookie: cookieB },
    });
    assert.equal(cross.status, 403);
    assert.deepEqual(await cross.json(), { error: "forbidden" });

    // O documento realmente saiu do banco para a pasta privada controlada por CLIENT_DOCS_DIR.
    const stored = await pool.query("SELECT storage_key FROM client_documents WHERE id = $1", [documentId]);
    assert.equal(stored.rowCount, 1);
    assert.match(stored.rows[0].storage_key, /^[0-9a-f]{48}$/);
    const fileContent = await readFile(path.join(docsDir, stored.rows[0].storage_key));
    assert.deepEqual(fileContent, documentPayload);

    const audit = await pool.query(
      `SELECT action, actor_kind, actor_id, result FROM auth_access_audit
       WHERE target = $1 AND action = 'document_download' ORDER BY id`,
      [documentId],
    );
    assert.ok(audit.rows.some(row => row.actor_kind === "client" && row.actor_id === identityA && row.result === "allowed"));

    const oversized = Buffer.alloc(10 * 1024 * 1024 + 4, 0x61);
    const tooLarge = await api("/api/admin/documents", {
      method: "POST",
      body: { accountId: accountA1, title: "Grande demais", category: "Teste", filename: "grande.bin.txt", contentBase64: oversized.toString("base64") },
      cookie: adminCookie,
    });
    assert.equal(tooLarge.status, 413);
    assert.equal(tooLarge.body.error, "document_too_large");
  });

  let ticketId = null;
  await t.test("tickets open only inside the verified scope and carry a status audit trail", async () => {
    const invalidCategory = await api("/api/client/tickets", {
      method: "POST",
      body: { accountId: accountA1, category: "Categoria inventada", title: "a", details: "b" },
      cookie: cookieA,
    });
    assert.equal(invalidCategory.status, 400);
    assert.equal(invalidCategory.body.error, "ticket_category_invalid");

    const tooLong = await api("/api/client/tickets", {
      method: "POST",
      body: { accountId: accountA1, category: "Acesso ao portal", title: "a", details: "b".repeat(501) },
      cookie: cookieA,
    });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.body.error, "ticket_details_too_long");

    const opened = await api("/api/client/tickets", {
      method: "POST",
      body: {
        accountId: accountA1,
        category: "Contratos ou documentos",
        title: "Dúvida sobre o resumo do contrato",
        details: "No resumo aparece 'teste de integração'. Confirmam? (cenário de teste automatizado)",
      },
      cookie: cookieA,
    });
    assert.equal(opened.status, 201, JSON.stringify(opened.body));
    assert.equal(opened.body.status, "open");
    ticketId = opened.body.ticketId;
    cleanupIds.push(ticketId);

    const cross = await api("/api/client/tickets", {
      method: "POST",
      body: { accountId: accountA1, category: "Outro assunto", title: "Não é meu", details: "Tentativa fora do escopo" },
      cookie: cookieB,
    });
    assert.equal(cross.status, 403);
    assert.deepEqual(cross.body, { error: "forbidden" });

    const listA = await api(`/api/client/tickets?account=${accountA1}`, { cookie: cookieA });
    assert.equal(listA.status, 200);
    assert.equal(listA.body.tickets.length, 1);
    assert.equal(listA.body.tickets[0].status, "open");
    const crossList = await api(`/api/client/tickets?account=${accountA1}`, { cookie: cookieB });
    assert.equal(crossList.status, 403);
    const ownB = await api('/api/client/tickets', {
      method: 'POST',
      body: { accountId: accountA2, category: 'Outro assunto', title: 'Chamado sintético B', details: 'Somente conta B pode ler.' },
      cookie: cookieB,
    });
    assert.equal(ownB.status, 201);
    cleanupIds.push(ownB.body.ticketId);
    const listB = await api(`/api/client/tickets?account=${accountA2}`, { cookie: cookieB });
    assert.deepEqual(listB.body.tickets.map(item => item.id), [ownB.body.ticketId]);
    const crossAtoB = await api(`/api/client/tickets?account=${accountA2}`, { cookie: cookieA });
    assert.equal(crossAtoB.status, 403);
    const crossWrite = await api('/api/client/tickets', {
      method: 'POST',
      body: { accountId: accountA2, category: 'Outro assunto', title: 'A não é B', details: 'Pedido não autorizado.' },
      cookie: cookieA,
    });
    assert.equal(crossWrite.status, 403);

    const adminList = await api(`/api/admin/tickets?status=open&account=${accountA1}`, { cookie: adminCookie });
    assert.equal(adminList.status, 200);
    assert.equal(adminList.body.tickets.length, 1);
    assert.equal(adminList.body.tickets[0].opened_by_email, clientAEmail);

    const patch = await api(`/api/admin/tickets/${ticketId}`, {
      method: "PATCH",
      body: { status: "in_progress", adminResponse: "Sim, é um cenário de teste. Acompanhamos por aqui." },
      cookie: adminCookie,
    });
    assert.equal(patch.status, 200);

    const clientSees = await api(`/api/client/tickets?account=${accountA1}`, { cookie: cookieA });
    assert.equal(clientSees.body.tickets[0].status, "in_progress");
    assert.equal(clientSees.body.tickets[0].admin_response, "Sim, é um cenário de teste. Acompanhamos por aqui.");

    const statusAudit = await pool.query(
      "SELECT previous_status, next_status, changed_by FROM client_ticket_status_audit WHERE ticket_id = $1",
      [ticketId],
    );
    assert.deepEqual(statusAudit.rows[0], { previous_status: "open", next_status: "in_progress", changed_by: "ti" });

    const invalidStatus = await api(`/api/admin/tickets/${ticketId}`, {
      method: "PATCH",
      body: { status: "em analise" },
      cookie: adminCookie,
    });
    assert.equal(invalidStatus.status, 400);
    assert.equal(invalidStatus.body.error, "ticket_status_invalid");
  });

  await t.test("revoking the grant cuts access immediately and is idempotent", async () => {
    const revoked = await api(`/api/admin/grants/${grantA1}`, {
      method: "DELETE",
      body: { reason: "Troca de responsável comunicada pela empresa" },
      cookie: adminCookie,
    });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.ok, true);

    const listA = await api("/api/client/accounts", { cookie: cookieA });
    assert.deepEqual(listA.body.accounts.map(item => item.display_name), ["Fazenda Integração A3"]);

    const contracts = await api(`/api/client/contracts?account=${accountA1}`, { cookie: cookieA });
    assert.equal(contracts.status, 403);
    assert.deepEqual(contracts.body, { error: "forbidden" });
    const documents = await api(`/api/client/documents?account=${accountA1}`, { cookie: cookieA });
    assert.equal(documents.status, 403);
    const download = await api(`/api/client/documents/${documentId}/download`, { cookie: cookieA });
    assert.equal(download.status, 403);
    const tickets = await api(`/api/client/tickets?account=${accountA1}`, { cookie: cookieA });
    assert.equal(tickets.status, 403);
    const blockedWrite = await api('/api/client/tickets', {
      method: 'POST',
      body: { accountId: accountA1, category: 'Outro assunto', title: 'Após revogação', details: 'Deve ser negado.' },
      cookie: cookieA,
    });
    assert.equal(blockedWrite.status, 403);
    const bUnaffected = await api(`/api/client/contracts?account=${accountA2}`, { cookie: cookieB });
    assert.equal(bUnaffected.status, 200);
    assert.equal(bUnaffected.body.contracts.length, 1);

    const again = await api(`/api/admin/grants/${grantA1}`, {
      method: "DELETE",
      body: { reason: "Tentativa repetida sem efeito" },
      cookie: adminCookie,
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.outcome, "already_revoked");

    const missingReason = await api(`/api/admin/grants/${grantA1}`, {
      method: "DELETE",
      body: { reason: " " },
      cookie: adminCookie,
    });
    assert.equal(missingReason.status, 400);
    assert.equal(missingReason.body.error, "reason_required");

    const audit = await pool.query(
      "SELECT action, result FROM auth_access_audit WHERE target = $1 AND action = 'grant_revoke' ORDER BY id",
      [grantA1],
    );
    assert.deepEqual(audit.rows.map(row => [row.action, row.result]), [["grant_revoke", "allowed"]]);
  });
});
