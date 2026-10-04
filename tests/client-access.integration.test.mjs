import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";
import { generate as generateTotp } from "otplib";
import { provisionStaff, STAFF_TEST_PASSWORD } from "./helpers/staff-login.mjs";

// L01/SEC-05: sessão administrativa por conta individual; o token compartilhado
// é recusado por padrão. Provisiona sob demanda e devolve o corpo do login.
async function staffCredentials(pool) {
  const staff = await provisionStaff(pool, { role: "ti" });
  return { email: staff.email, password: STAFF_TEST_PASSWORD };
}

const { loadEnvConfig } = nextEnv;
const { Pool } = pg;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvConfig(projectRoot);

const optIn = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL || "";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function skipReason() {
  if (!optIn) return "set RUN_DATABASE_INTEGRATION=1 to run the client access flow against a real PostgreSQL";
  if (!databaseUrl) return "DATABASE_URL is missing; copy .env.example to .env.local first";
  if (!loopbackHosts.has(new URL(databaseUrl).hostname) && process.env.RUN_DATABASE_INTEGRATION_REMOTE !== "1") {
    return "DATABASE_URL is not a loopback database; set RUN_DATABASE_INTEGRATION_REMOTE=1 to allow it";
  }
  return null;
}

const skip = skipReason();
const testOptions = skip ? { skip } : {};

// O Next reescreve estes arquivos apontando para o distDir isolado do teste; o
// conteúdo original é restaurado ao final para não sujar o repositório.
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
const ADMIN_TOKEN_MARCELO = "integration-token-marcelo-000000000000000000000000";
const SESSION_SECRET = "integration-session-secret-00000000000000000000000000";
const MAIL_FROM = "captura-smtp@exemplo.invalid";

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

// Servidor SMTP de captura mínimo: implementa o diálogo necessário para o
// nodemailer entregar as mensagens e guarda os conteúdos em memória. Assim o
// teste confirma de ponta a ponta que convites, confirmações e recuperações saem
// pelo canal de e-mail — sem depender de um provedor externo.
function startSmtpCapture() {
  const messages = [];
  const server = createServer(socket => {
    socket.setEncoding("utf8");
    let buffer = "";
    let collecting = false;
    let dataBuffer = "";
    socket.write("220 captura.local ESMTP pronto\r\n");
    socket.rawChunks = [];
    socket.on("data", chunk => {
      buffer += chunk;
      // Máquina de estados por linha: no modo de dados, tudo até o terminador é
      // conteúdo da mensagem (mesmo quando chega no mesmo pacote do comando DATA).
      for (;;) {
        if (collecting) {
          const terminator = buffer.indexOf("\r\n.\r\n");
          if (terminator === -1) return;
          dataBuffer += buffer.slice(0, terminator);
          buffer = buffer.slice(terminator + 5);
          collecting = false;
          messages.push(dataBuffer.replace(/\r\n\.\./g, "\r\n."));
          dataBuffer = "";
          socket.write("250 OK mensagem recebida\r\n");
          continue;
        }
        const newlineIndex = buffer.indexOf("\r\n");
        if (newlineIndex === -1) return;
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 2);
        const command = line.slice(0, 4).toUpperCase();
        if (command === "EHLO" || command === "HELO") {
          socket.write("250-captura.local\r\n250 OK\r\n");
        } else if (command === "MAIL" || command === "RCPT") {
          socket.write("250 OK\r\n");
        } else if (command === "DATA") {
          collecting = true;
          socket.write("354 Envie os dados, termine com <CRLF>.<CRLF>\r\n");
        } else if (command === "RSET" || command === "NOOP") {
          socket.write("250 OK\r\n");
        } else if (command === "QUIT") {
          socket.write("220 Tchau\r\n", () => socket.end());
          return;
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });
    socket.on("error", () => {});
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, messages, port: server.address().port }));
  });
}

// Decodifica quoted-printable (bytes → utf8) e palavras MIME dos cabeçalhos, para
// comparar assuntos e extrair links sem tropeçar na codificação do nodemailer.
function decodeQuotedPrintableBytes(text) {
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "=" && index + 2 < text.length && /^[0-9A-Fa-f]{2}$/.test(text.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(text.slice(index + 1, index + 3), 16));
      index += 2;
    } else if (char === "=" && (text[index + 1] === "\r" || text[index + 1] === "\n")) {
      index += text[index + 1] === "\r" && text[index + 2] === "\n" ? 2 : 1;
    } else {
      bytes.push(char.charCodeAt(0) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeMimeWords(text) {
  return text.replace(/=\?UTF-8\?(Q|B)\?([^?]*)\?=/gi, (_, encoding, payload) => {
    if (encoding.toUpperCase() === "B") return Buffer.from(payload, "base64").toString("utf8");
    return decodeQuotedPrintableBytes(payload.replace(/_/g, " "));
  });
}

function normalizeMessage(raw) {
  const headerEnd = raw.indexOf("\r\n\r\n");
  const headers = decodeMimeWords(raw.slice(0, headerEnd === -1 ? raw.length : headerEnd).replace(/\r\n[ \t]+/g, " "));
  const body = headerEnd === -1 ? "" : raw.slice(headerEnd + 4);
  return `${headers}\r\n\r\n${decodeQuotedPrintableBytes(body)}`;
}

function waitForMessage(messages, subjectFragment, timeoutMs = 10_000) {
  const matches = typeof subjectFragment === "function"
    ? subjectFragment
    : raw => normalizeMessage(raw).includes(subjectFragment);
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const found = messages.find(raw => matches(normalizeMessage(raw)));
      if (found) {
        clearInterval(timer);
        // Devolve a mensagem bruta: quem consome chama normalizeMessage uma única vez
        // (decodificar duas vezes corrompe caracteres multi-byte e sequências "=").
        resolve(found);
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error(`e-mail esperado não chegou a tempo (${String(subjectFragment).slice(0, 80)})`));
      }
    }, 100);
  });
}

function extractLink(message, pathFragment) {
  const normalized = normalizeMessage(message);
  const lines = normalized.split(/\r?\n/);
  const line = lines.find(item => item.includes(pathFragment));
  assert.ok(line, `link com ${pathFragment} não encontrado no e-mail:\n${normalized}`);
  const match = line.match(/https?:\/\/\S+/);
  assert.ok(match, "nenhuma URL na linha do link");
  return match[0];
}

async function applyMigrations() {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const ready = await pool.query(`SELECT
      to_regclass('auth_permissions') IS NOT NULL
      AND to_regclass('client_ticket_messages') IS NOT NULL AS ready`);
    if (ready.rows[0]?.ready) return;
    // Ledger completo 001..N (migrações idempotentes): mantém esta suíte e a
    // suíte do espaço do cliente no mesmo esquema canônico, sem subconjuntos.
    const dir = path.join(projectRoot, "db", "migrations");
    const filenames = (await readdir(dir)).filter(name => /^\d{3}-.*\.sql$/.test(name)).sort();
    for (const filename of filenames) {
      const sql = await readFile(path.join(dir, filename), "utf8");
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

function startServer(port, smtpPort) {
  const child = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NEXT_DIST_DIR: ".next/integration-client-access",
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      TRUST_PROXY: "false",
      SITE_VISUAL_SELECTION_ENABLED: "false",
      SITE_ADMIN_TOKEN_MARCELO: ADMIN_TOKEN_MARCELO,
      SITE_ADMIN_TOKEN_TI: ADMIN_TOKEN_TI,
      SITE_ADMIN_SESSION_SECRET: SESSION_SECRET,
      CLIENT_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 0x5a).toString("base64url"),
      MAIL_HOST: "127.0.0.1",
      MAIL_PORT: String(smtpPort),
      MAIL_SECURE: "false",
      MAIL_USER: "",
      MAIL_PASSWORD: "",
      MAIL_FROM,
      LEADS_NOTIFY_EMAIL: "",
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

test("client access works end to end against a real PostgreSQL", testOptions, async t => {
  await applyMigrations();

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const { server: smtpServer, messages, port: smtpPort } = await startSmtpCapture();
  const generatedFiles = await snapshotGeneratedFiles();
  const { child, logs } = startServer(port, smtpPort);
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve));
    }
    smtpServer.close();
    await restoreGeneratedFiles(generatedFiles);
  });

  const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const clientEmail = `integracao.acesso.${runId}@exemplo.invalid`;
  const secondEmail = `integracao.segundo.${runId}@exemplo.invalid`;
  const thirdEmail = `integracao.terceiro.${runId}@exemplo.invalid`;

  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qa_l08_access_audit_failure (
      action TEXT PRIMARY KEY
    );
    CREATE OR REPLACE FUNCTION qa_l08_reject_access_audit() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM qa_l08_access_audit_failure f WHERE f.action = NEW.action) THEN
        RAISE EXCEPTION 'forced_l08_access_audit_failure:%', NEW.action;
      END IF;
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS qa_l08_reject_access_audit ON auth_access_audit;
    CREATE TRIGGER qa_l08_reject_access_audit
      BEFORE INSERT ON auth_access_audit
      FOR EACH ROW EXECUTE FUNCTION qa_l08_reject_access_audit();
  `);
  const cleanupIds = [];
  t.after(async () => {
    await pool.query("DELETE FROM auth_login_throttle WHERE email LIKE 'integracao.%'").catch(() => {});
    const ids = [...cleanupIds];
    if (ids.length) {
      await pool.query("DELETE FROM auth_access_audit WHERE target = ANY($1::text[]) OR actor_id = ANY($1::text[])", [ids]).catch(() => {});
    }
    await pool.query("DELETE FROM auth_email_tokens WHERE email LIKE 'integracao.%'").catch(() => {});
    await pool.query("DELETE FROM auth_invites WHERE email LIKE 'integracao.%'").catch(() => {});
    await pool.query("DELETE FROM auth_identities WHERE email LIKE 'integracao.%'").catch(() => {});
    await pool.query("DROP TRIGGER IF EXISTS qa_l08_reject_access_audit ON auth_access_audit").catch(() => {});
    await pool.query("DROP FUNCTION IF EXISTS qa_l08_reject_access_audit()").catch(() => {});
    await pool.query("DROP TABLE IF EXISTS qa_l08_access_audit_failure").catch(() => {});
    await pool.end();
  });

  async function api(pathname, { method = "GET", body, cookie, sendOrigin = true } = {}) {
    const headers = {};
    if (sendOrigin) headers.Origin = origin;
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

  async function withForcedAuditFailure(action, work) {
    await pool.query("INSERT INTO qa_l08_access_audit_failure (action) VALUES ($1) ON CONFLICT DO NOTHING", [action]);
    try {
      return await work();
    } finally {
      await pool.query("DELETE FROM qa_l08_access_audit_failure WHERE action = $1", [action]);
    }
  }

  await waitForServer(child, logs);

  let adminCookie = null;
  let inviteId = null;
  let inviteUrl = null;
  await t.test("admin login and invite creation deliver the invitation by e-mail", async () => {
    const anonymous = await api("/api/admin/invites", { method: "POST", body: { email: clientEmail } });
    assert.equal(anonymous.status, 401);
    assert.deepEqual(anonymous.body, { error: "admin_session_required" });

    const rhStaff = await provisionStaff(pool, { role: "rh" });
    const rhSession = await api("/api/admin/session", {
      method: "POST",
      body: { email: rhStaff.email, password: STAFF_TEST_PASSWORD },
    });
    assert.equal(rhSession.status, 200);
    const rhCookie = rhSession.setCookie.map(item => item.split(";")[0]).join("; ");
    const deniedRole = await api("/api/admin/invites", {
      method: "POST",
      body: { email: `integracao.rh.negado.${runId}@exemplo.invalid` },
      cookie: rhCookie,
    });
    assert.equal(deniedRole.status, 403);
    assert.deepEqual(deniedRole.body, { error: "forbidden" });

    const session = await api("/api/admin/session", { method: "POST", body: await staffCredentials(pool) });
    assert.equal(session.status, 200);
    adminCookie = session.setCookie.map(item => item.split(";")[0]).join("; ");

    const created = await api("/api/admin/invites", {
      method: "POST",
      body: { email: clientEmail, displayName: "Cliente Integração", scopeNote: "Escopo de demonstração em teste" },
      cookie: adminCookie,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.email, clientEmail);
    assert.equal(created.body.emailStatus, "sent");
    assert.equal(created.body.inviteUrl, undefined, "com SMTP ativo o link não deve voltar na resposta");
    inviteId = created.body.inviteId;
    cleanupIds.push(inviteId);

    const inviteMessage = await waitForMessage(messages, "Convite de acesso ao portal do cliente");
    assert.match(inviteMessage, new RegExp(`To:.*<${clientEmail}>|To:.*${clientEmail}`));
    inviteUrl = extractLink(inviteMessage, "/cliente/convite?token=");
    assert.ok(inviteUrl.startsWith(`${origin}/cliente/convite?token=`));

    // O convite é auditado sem conter o token.
    const stored = await pool.query("SELECT email, token_hash, issued_by, scope_note FROM auth_invites WHERE id = $1", [inviteId]);
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].email, clientEmail);
    assert.equal(stored.rows[0].issued_by, "ti");
    assert.notEqual(stored.rows[0].token_hash, inviteUrl.split("token=")[1], "o banco só pode guardar o hash do token");
    const auditRows = await pool.query("SELECT action, actor_kind, result FROM auth_access_audit WHERE target = $1 ORDER BY id", [inviteId]);
    assert.deepEqual(auditRows.rows.map(row => [row.action, row.actor_kind, row.result]), [["invite_issue", "ti", "allowed"]]);
  });

  await t.test("invite listing shows metadata without any token", async () => {
    const list = await api("/api/admin/invites?status=pending", { cookie: adminCookie });
    assert.equal(list.status, 200);
    const mine = list.body.invites.find(invite => invite.id === inviteId);
    assert.ok(mine, "convite pendente deve aparecer na listagem");
    assert.equal(mine.status, "pending");
    assert.equal(mine.token_hash, undefined);
    assert.equal(mine.token, undefined);
    const invalid = await api("/api/admin/invites?status=inventado", { cookie: adminCookie });
    assert.equal(invalid.status, 400);
  });

  await t.test("policy-weak passwords are refused before touching the invite", async () => {
    const token = inviteUrl.split("token=")[1];
    const inspected = await api(`/api/auth/invite/inspect?token=${encodeURIComponent(token)}`);
    assert.equal(inspected.status, 200);
    assert.equal(inspected.body.status, "pending");
    assert.equal(inspected.body.email, clientEmail);

    const shortPassword = await api("/api/auth/invite/accept", { method: "POST", body: { token, password: "curta123" } });
    assert.equal(shortPassword.status, 400);
    assert.deepEqual(shortPassword.body, { error: "password_too_short" });

    const commonPassword = await api("/api/auth/invite/accept", { method: "POST", body: { token, password: "123456789012" } });
    assert.equal(commonPassword.status, 400);
    assert.deepEqual(commonPassword.body, { error: "password_common" });

    const crossOrigin = await api("/api/auth/invite/accept", {
      method: "POST",
      body: { token, password: "frase senha azul 99 cadeado" },
      sendOrigin: false,
    });
    assert.equal(crossOrigin.status, 403);
    assert.deepEqual(crossOrigin.body, { error: "same_origin_required" });
  });

  let identityId = null;
  let confirmationToken = null;
  await t.test("accepting the invite creates the identity and sends the e-mail confirmation", async () => {
    const token = inviteUrl.split("token=")[1];
    const accepted = await api("/api/auth/invite/accept", {
      method: "POST",
      body: { token, password: "frase senha azul 99 cadeado", displayName: "Cliente Integração" },
    });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.status, "pending_email");
    assert.equal(accepted.body.emailStatus, "sent");

    const confirmationMessage = await waitForMessage(messages, "Confirme seu e-mail");
    const confirmationUrl = extractLink(confirmationMessage, "/cliente/confirmar-email?token=");
    t.diagnostic(`confirmation link captured for ${clientEmail}`);
    confirmationToken = confirmationUrl.split("token=")[1];

    const stored = await pool.query(
      `SELECT i.id, i.status, i.display_name, c.password_hash
       FROM auth_identities i LEFT JOIN auth_credentials c ON c.identity_id = i.id
       WHERE i.kind = 'client' AND i.email = $1`,
      [clientEmail],
    );
    assert.equal(stored.rowCount, 1);
    identityId = stored.rows[0].id;
    cleanupIds.push(identityId);
    assert.equal(stored.rows[0].status, "pending_email");
    assert.equal(stored.rows[0].display_name, "Cliente Integração");
    assert.match(stored.rows[0].password_hash, /^s1\$16384\$8\$1\$64\$/);
    assert.ok(!stored.rows[0].password_hash.includes("frase senha"), "hash nunca pode conter a senha");

    const inviteRow = await pool.query("SELECT used_by_identity FROM auth_invites WHERE id = $1", [inviteId]);
    assert.equal(inviteRow.rows[0].used_by_identity, identityId);

    const reused = await api("/api/auth/invite/accept", { method: "POST", body: { token, password: "outra frase senha 73 telhado" } });
    assert.equal(reused.status, 400);
    assert.deepEqual(reused.body, { error: "invite_used" });

    const duplicate = await api("/api/admin/invites", { method: "POST", body: { email: clientEmail }, cookie: adminCookie });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(duplicate.body, { error: "identity_exists" });
  });

  await t.test("five wrong logins are free; the sixth still answers and the next is throttled", async () => {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const wrong = await api("/api/auth/login", { method: "POST", body: { email: clientEmail, password: "senha errada aqui" } });
      assert.equal(wrong.status, 401, `tentativa ${attempt} deveria responder 401`);
      assert.deepEqual(wrong.body, { error: "invalid_credentials" });
    }
    const throttled = await api("/api/auth/login", { method: "POST", body: { email: clientEmail, password: "senha errada aqui" } });
    assert.equal(throttled.status, 429);
    assert.deepEqual(throttled.body, { error: "temporarily_limited" });
    const retryAfter = Number(throttled.headers.get("retry-after"));
    assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After inesperado: ${retryAfter}`);

    const throttleRow = await pool.query("SELECT failures FROM auth_login_throttle WHERE email = $1", [clientEmail]);
    assert.equal(throttleRow.rows[0].failures, 6);

    const deniedAudit = await pool.query(
      "SELECT detail_category, COUNT(*)::int AS total FROM auth_access_audit WHERE actor_id = $1 AND action = 'login' AND result = 'denied' GROUP BY detail_category ORDER BY detail_category",
      [identityId],
    );
    const categories = Object.fromEntries(deniedAudit.rows.map(row => [row.detail_category, row.total]));
    assert.equal(categories.invalid_credentials, 6);
    assert.equal(categories.throttled, 1);

    // A conta de teste continua o fluxo sem a espera: limpa o bloqueio diretamente.
    await pool.query("DELETE FROM auth_login_throttle WHERE email = $1", [clientEmail]);
  });

  await t.test("pending verification cannot create a client session", async () => {
    const pendingLogin = await api("/api/auth/login", { method: "POST", body: { email: clientEmail, password: "frase senha azul 99 cadeado" } });
    assert.equal(pendingLogin.status, 403);
    assert.deepEqual(pendingLogin.body, { error: 'verification_required' });
    assert.equal(pendingLogin.setCookie.length, 0);
    const existing = await pool.query('SELECT count(*)::int AS total FROM auth_sessions WHERE identity_id=$1', [identityId]);
    assert.equal(existing.rows[0].total, 0);
  });

  await t.test("the confirmation link activates the account exactly once", async () => {
    const first = await api("/api/auth/confirm-email", { method: "POST", body: { token: confirmationToken } });
    assert.equal(first.status, 200);
    assert.equal(first.body.ok, true);

    const second = await api("/api/auth/confirm-email", { method: "POST", body: { token: confirmationToken } });
    assert.equal(second.status, 400);
    assert.deepEqual(second.body, { error: "confirmation_link_invalid" });

    const verified = await pool.query("SELECT status, verification_method FROM auth_identities WHERE id=$1", [identityId]);
    assert.equal(verified.rows[0].status, 'active');
    assert.equal(verified.rows[0].verification_method, 'email_link');

    const unknown = await api("/api/auth/confirm-email", { method: "POST", body: { token: "token-inexistente" } });
    assert.equal(unknown.status, 400);
  });

  let clientCookie = null;
  await t.test("valid login creates a revocable server-side session", async () => {
    const anonymous = await api("/api/auth/me");
    assert.equal(anonymous.status, 401);
    assert.deepEqual(anonymous.body, { error: "client_session_required" });

    const login = await api("/api/auth/login", { method: "POST", body: { email: clientEmail, password: "frase senha azul 99 cadeado" } });
    assert.equal(login.status, 200);
    assert.equal(login.body.ok, true);
    assert.equal(login.body.emailConfirmed, true);
    const sessionCookieLine = login.setCookie.find(line => line.startsWith("seg_client_session="));
    assert.ok(sessionCookieLine, "cookie de sessão do cliente ausente");
    assert.match(sessionCookieLine, /HttpOnly/);
    assert.match(sessionCookieLine, /SameSite=Lax/);
    clientCookie = sessionCookieLine.split(";")[0];

    const stored = await pool.query("SELECT token_hash, revoked_at FROM auth_sessions WHERE identity_id = $1", [identityId]);
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].revoked_at, null);
    const rawToken = clientCookie.split("=")[1];
    assert.notEqual(stored.rows[0].token_hash, rawToken, "o banco só pode guardar o hash da sessão");

    const me = await api("/api/auth/me", { cookie: clientCookie });
    assert.equal(me.status, 200);
    assert.equal(me.body.email, clientEmail);
    assert.equal(me.body.emailConfirmed, true);
  });

  await t.test("password recovery is generic in public and rotates the credential via e-mail link", async () => {
    const before = messages.length;
    const missing = await api("/api/auth/recover", { method: "POST", body: { email: `ninguem.${runId}@exemplo.invalid` } });
    assert.equal(missing.status, 202);
    assert.deepEqual(missing.body, { ok: true });

    const requested = await api("/api/auth/recover", { method: "POST", body: { email: clientEmail } });
    assert.equal(requested.status, 202);
    assert.deepEqual(requested.body, { ok: true });

    const resetMessage = await waitForMessage(messages, "Recuperação de senha");
    const resetUrl = extractLink(resetMessage, "/cliente/redefinir-senha?token=");
    const resetToken = resetUrl.split("token=")[1];

    // Resposta pública idêntica para e-mail inexistente, e nenhum e-mail extra saiu para ele.
    const extraForMissing = messages.slice(before).filter(message => message.includes(`ninguem.${runId}@exemplo.invalid`));
    assert.equal(extraForMissing.length, 0);

    const weak = await api("/api/auth/reset", { method: "POST", body: { token: resetToken, password: "curta123" } });
    assert.equal(weak.status, 400);
    assert.deepEqual(weak.body, { error: "password_too_short" });

    const reset = await api("/api/auth/reset", { method: "POST", body: { token: resetToken, password: "nova trilha verde 55 portal" } });
    assert.equal(reset.status, 200);

    const reused = await api("/api/auth/reset", { method: "POST", body: { token: resetToken, password: "nova trilha verde 55 portal" } });
    assert.equal(reused.status, 400);
    assert.deepEqual(reused.body, { error: "reset_link_invalid" });

    // Todas as sessões anteriores foram encerradas.
    const revoked = await pool.query(
      "SELECT COUNT(*)::int AS total FROM auth_sessions WHERE identity_id = $1 AND revoked_at IS NOT NULL AND revoke_reason = 'password_reset'",
      [identityId],
    );
    assert.ok(revoked.rows[0].total >= 1);
    const oldMe = await api("/api/auth/me", { cookie: clientCookie });
    assert.equal(oldMe.status, 401);

    const oldPassword = await api("/api/auth/login", { method: "POST", body: { email: clientEmail, password: "frase senha azul 99 cadeado" } });
    assert.equal(oldPassword.status, 401);
    const newLogin = await api("/api/auth/login", { method: "POST", body: { email: clientEmail, password: "nova trilha verde 55 portal" } });
    assert.equal(newLogin.status, 200);
    clientCookie = newLogin.setCookie.find(line => line.startsWith("seg_client_session=")).split(";")[0];
  });

  await t.test("resend throttling stays silent in public and pauses inside the two-minute window", async () => {
    const immediate = await api("/api/auth/recover", { method: "POST", body: { email: clientEmail } });
    assert.equal(immediate.status, 202);
    // O pedido valeu resposta genérica, mas nenhum e-mail novo (intervalo mínimo de 2 minutos).
    await new Promise(resolve => setTimeout(resolve, 1500));
    const extra = messages.filter(message => normalizeMessage(message).includes("Recuperação de senha"));
    assert.equal(extra.length, 1, "o intervalo mínimo não pode gerar segundo e-mail imediato");

    const throttledAudit = await pool.query(
      "SELECT COUNT(*)::int AS total FROM auth_access_audit WHERE actor_id = $1 AND action = 'password_reset_request' AND result = 'denied' AND detail_category = 'throttled'",
      [identityId],
    );
    assert.ok(throttledAudit.rows[0].total >= 1);
  });

  await t.test("expired server-side sessions are refused and a fresh login remains possible", async () => {
    await pool.query(
      "UPDATE auth_sessions SET expires_at=NOW() - INTERVAL '1 minute' WHERE identity_id=$1 AND revoked_at IS NULL",
      [identityId],
    );
    const expired = await api("/api/auth/me", { cookie: clientCookie });
    assert.equal(expired.status, 401);
    assert.deepEqual(expired.body, { error: "client_session_required" });

    const login = await api("/api/auth/login", {
      method: "POST",
      body: { email: clientEmail, password: "nova trilha verde 55 portal" },
    });
    assert.equal(login.status, 200);
    clientCookie = login.setCookie.find(line => line.startsWith("seg_client_session=")).split(";")[0];
  });

  await t.test("logout revokes the session server-side", async () => {
    const logout = await api("/api/auth/logout", { method: "POST", cookie: clientCookie });
    assert.equal(logout.status, 200);
    const me = await api("/api/auth/me", { cookie: clientCookie });
    assert.equal(me.status, 401);
    const stored = await pool.query(
      "SELECT COUNT(*)::int AS total FROM auth_sessions WHERE identity_id = $1 AND revoke_reason = 'logout'",
      [identityId],
    );
    assert.equal(stored.rows[0].total, 1);
  });

  await t.test("revoked invites cannot be accepted", async () => {
    const created = await api("/api/admin/invites", { method: "POST", body: { email: secondEmail }, cookie: adminCookie });
    assert.equal(created.status, 201);
    const secondInviteId = created.body.inviteId;
    cleanupIds.push(secondInviteId);

    const crossOriginDelete = await api(`/api/admin/invites/${secondInviteId}`, { method: "DELETE", cookie: adminCookie, sendOrigin: false });
    assert.equal(crossOriginDelete.status, 403);

    const revoked = await api(`/api/admin/invites/${secondInviteId}`, { method: "DELETE", cookie: adminCookie });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.outcome, "revoked");

    const again = await api(`/api/admin/invites/${secondInviteId}`, { method: "DELETE", cookie: adminCookie });
    assert.equal(again.status, 200);
    assert.equal(again.body.outcome, "already_revoked");

    const message = await waitForMessage(messages, raw => raw.includes(secondEmail) && raw.includes("Convite de acesso ao portal do cliente"));
    const link = extractLink(message, "/cliente/convite?token=");
    const acceptRevoked = await api("/api/auth/invite/accept", {
      method: "POST",
      body: { token: link.split("token=")[1], password: "frase qualquer bem longa 12" },
    });
    assert.equal(acceptRevoked.status, 400);
    assert.deepEqual(acceptRevoked.body, { error: "invite_revoked" });

    const list = await api("/api/admin/invites?status=revoked", { cookie: adminCookie });
    assert.ok(list.body.invites.some(invite => invite.id === secondInviteId));
  });

  await t.test("used invite kept from an expired window stays closed (expiry guard)", async () => {
    const created = await api("/api/admin/invites", { method: "POST", body: { email: thirdEmail }, cookie: adminCookie });
    assert.equal(created.status, 201);
    const thirdInviteId = created.body.inviteId;
    cleanupIds.push(thirdInviteId);
    await pool.query("UPDATE auth_invites SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [thirdInviteId]);
    const message = await waitForMessage(messages, raw => raw.includes(thirdEmail) && raw.includes("Convite de acesso ao portal do cliente"));
    const link = extractLink(message, "/cliente/convite?token=");
    const acceptExpired = await api("/api/auth/invite/accept", {
      method: "POST",
      body: { token: link.split("token=")[1], password: "frase valida dobrada 44" },
    });
    assert.equal(acceptExpired.status, 400);
    assert.deepEqual(acceptExpired.body, { error: "invite_expired" });
  });

  const auditEmail = `integracao.audit.${runId}@exemplo.invalid`;
  const auditPassword = "senha auditável longa 73 portal";
  const auditNewPassword = "senha auditável nova 84 portal";
  let auditInviteId = null;
  let auditInviteToken = null;
  let auditIdentityId = null;
  let auditConfirmationToken = null;
  let auditResetToken = null;
  let auditClientCookie = null;

  await t.test("invite creation rolls back when its mandatory audit fails", async () => {
    const failedEmail = `integracao.audit.issue.${runId}@exemplo.invalid`;
    const response = await withForcedAuditFailure("invite_issue", () => api("/api/admin/invites", {
      method: "POST",
      body: { email: failedEmail, displayName: "Convite rollback" },
      cookie: adminCookie,
    }));
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "audit_unavailable" });
    const persisted = await pool.query("SELECT count(*)::int AS count FROM auth_invites WHERE email = $1", [failedEmail]);
    assert.equal(persisted.rows[0].count, 0);
  });

  await t.test("invite revocation rolls back when its mandatory audit fails", async () => {
    const created = await api("/api/admin/invites", {
      method: "POST",
      body: { email: auditEmail, displayName: "Cliente auditável" },
      cookie: adminCookie,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    auditInviteId = created.body.inviteId;
    cleanupIds.push(auditInviteId);
    const message = await waitForMessage(messages, raw => raw.includes(auditEmail) && raw.includes("Convite de acesso ao portal do cliente"));
    auditInviteToken = extractLink(message, "/cliente/convite?token=").split("token=")[1];

    const response = await withForcedAuditFailure("invite_revoke", () => api(`/api/admin/invites/${auditInviteId}`, {
      method: "DELETE",
      cookie: adminCookie,
    }));
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: "audit_unavailable" });
    const persisted = await pool.query("SELECT used_at, revoked_at FROM auth_invites WHERE id = $1", [auditInviteId]);
    assert.deepEqual(persisted.rows[0], { used_at: null, revoked_at: null });
  });

  await t.test("invite acceptance rolls back identity, credential, token and invite use on audit failure", async () => {
    const body = { token: auditInviteToken, password: auditPassword, displayName: "Cliente auditável" };
    const failed = await withForcedAuditFailure("invite_accept", () => api("/api/auth/invite/accept", { method: "POST", body }));
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { error: "audit_unavailable" });
    const afterFailure = await pool.query(
      `SELECT v.used_at,
              (SELECT count(*)::int FROM auth_identities i WHERE i.kind='client' AND i.email=$2) AS identities,
              (SELECT count(*)::int FROM auth_email_tokens e WHERE e.email=$2) AS tokens
       FROM auth_invites v WHERE v.id=$1`,
      [auditInviteId, auditEmail],
    );
    assert.deepEqual(afterFailure.rows[0], { used_at: null, identities: 0, tokens: 0 });

    const retried = await api("/api/auth/invite/accept", { method: "POST", body });
    assert.equal(retried.status, 201, JSON.stringify(retried.body));
    const identity = await pool.query("SELECT id, status FROM auth_identities WHERE kind='client' AND email=$1", [auditEmail]);
    assert.equal(identity.rows[0].status, "pending_email");
    auditIdentityId = identity.rows[0].id;
    cleanupIds.push(auditIdentityId);
    const message = await waitForMessage(messages, raw => raw.includes(auditEmail) && raw.includes("Confirme seu e-mail"));
    auditConfirmationToken = extractLink(message, "/cliente/confirmar-email?token=").split("token=")[1];
  });

  await t.test("e-mail confirmation rolls back token use and activation on audit failure", async () => {
    const failed = await withForcedAuditFailure("email_confirm", () => api("/api/auth/confirm-email", {
      method: "POST",
      body: { token: auditConfirmationToken },
    }));
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { error: "audit_unavailable" });
    const afterFailure = await pool.query(
      `SELECT i.status, i.verification_method, e.used_at
       FROM auth_identities i JOIN auth_email_tokens e ON e.identity_id=i.id
       WHERE i.id=$1 AND e.kind='confirm_email' AND e.token_hash IS NOT NULL`,
      [auditIdentityId],
    );
    assert.deepEqual(afterFailure.rows[0], { status: "pending_email", verification_method: null, used_at: null });

    const retried = await api("/api/auth/confirm-email", { method: "POST", body: { token: auditConfirmationToken } });
    assert.equal(retried.status, 200);
    const active = await pool.query("SELECT status, verification_method FROM auth_identities WHERE id=$1", [auditIdentityId]);
    assert.deepEqual(active.rows[0], { status: "active", verification_method: "email_link" });
  });

  await t.test("login emits no cookie and no session when its mandatory audit fails", async () => {
    const before = await pool.query("SELECT count(*)::int AS count FROM auth_sessions WHERE identity_id=$1", [auditIdentityId]);
    const failed = await withForcedAuditFailure("login", () => api("/api/auth/login", {
      method: "POST",
      body: { email: auditEmail, password: auditPassword },
    }));
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { error: "audit_unavailable" });
    assert.equal(failed.setCookie.length, 0);
    const after = await pool.query("SELECT count(*)::int AS count FROM auth_sessions WHERE identity_id=$1", [auditIdentityId]);
    assert.equal(after.rows[0].count, before.rows[0].count);

    const retried = await api("/api/auth/login", {
      method: "POST",
      body: { email: auditEmail, password: auditPassword },
    });
    assert.equal(retried.status, 200);
    auditClientCookie = retried.setCookie.find(line => line.startsWith("seg_client_session=")).split(";")[0];
  });

  await t.test("password recovery token rotation rolls back when its mandatory audit fails", async () => {
    const before = await pool.query(
      "SELECT count(*)::int AS count FROM auth_email_tokens WHERE identity_id=$1 AND kind='password_reset'",
      [auditIdentityId],
    );
    const failed = await withForcedAuditFailure("password_reset_request", () => api("/api/auth/recover", {
      method: "POST",
      body: { email: auditEmail },
    }));
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { error: "audit_unavailable" });
    const after = await pool.query(
      "SELECT count(*)::int AS count FROM auth_email_tokens WHERE identity_id=$1 AND kind='password_reset'",
      [auditIdentityId],
    );
    assert.equal(after.rows[0].count, before.rows[0].count);

    const retried = await api("/api/auth/recover", { method: "POST", body: { email: auditEmail } });
    assert.equal(retried.status, 202);
    const message = await waitForMessage(messages, raw => raw.includes(auditEmail) && raw.includes("Recuperação de senha"));
    auditResetToken = extractLink(message, "/cliente/redefinir-senha?token=").split("token=")[1];
  });

  await t.test("password reset and session revocation roll back together on audit failure", async () => {
    const failed = await withForcedAuditFailure("password_reset_complete", () => api("/api/auth/reset", {
      method: "POST",
      body: { token: auditResetToken, password: auditNewPassword },
    }));
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { error: "audit_unavailable" });
    const afterFailure = await pool.query(
      `SELECT e.used_at,
              (SELECT count(*)::int FROM auth_sessions s WHERE s.identity_id=$1 AND s.revoked_at IS NULL) AS active_sessions
       FROM auth_email_tokens e WHERE e.identity_id=$1 AND e.kind='password_reset' ORDER BY e.created_at DESC LIMIT 1`,
      [auditIdentityId],
    );
    assert.equal(afterFailure.rows[0].used_at, null);
    assert.ok(afterFailure.rows[0].active_sessions >= 1);
    const stillAuthenticated = await api("/api/auth/me", { cookie: auditClientCookie });
    assert.equal(stillAuthenticated.status, 200);

    const retried = await api("/api/auth/reset", {
      method: "POST",
      body: { token: auditResetToken, password: auditNewPassword },
    });
    assert.equal(retried.status, 200);
    const oldSession = await api("/api/auth/me", { cookie: auditClientCookie });
    assert.equal(oldSession.status, 401);
    const login = await api("/api/auth/login", {
      method: "POST",
      body: { email: auditEmail, password: auditNewPassword },
    });
    assert.equal(login.status, 200);
    auditClientCookie = login.setCookie.find(line => line.startsWith("seg_client_session=")).split(";")[0];
  });

  await t.test("logout rolls back revocation and emits no clearing cookie when audit fails", async () => {
    const failed = await withForcedAuditFailure("logout", () => api("/api/auth/logout", {
      method: "POST",
      cookie: auditClientCookie,
    }));
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { error: "audit_unavailable" });
    assert.equal(failed.setCookie.length, 0);
    const stillAuthenticated = await api("/api/auth/me", { cookie: auditClientCookie });
    assert.equal(stillAuthenticated.status, 200);

    const retried = await api("/api/auth/logout", { method: "POST", cookie: auditClientCookie });
    assert.equal(retried.status, 200);
    const revoked = await api("/api/auth/me", { cookie: auditClientCookie });
    assert.equal(revoked.status, 401);
  });

  let auditMfaSecret = null;
  let auditRecoveryCodes = null;
  await t.test("MFA setup rolls back the encrypted secret when its mandatory audit fails", async () => {
    const login = await api("/api/auth/login", {
      method: "POST",
      body: { email: auditEmail, password: auditNewPassword },
    });
    assert.equal(login.status, 200);
    auditClientCookie = login.setCookie.find(line => line.startsWith("seg_client_session=")).split(";")[0];

    const failed = await withForcedAuditFailure("mfa_activate", () => api("/api/client/security/mfa/setup", {
      method: "POST",
      body: { password: auditNewPassword },
      cookie: auditClientCookie,
    }));
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { error: "audit_unavailable" });
    const afterFailure = await pool.query("SELECT count(*)::int AS count FROM auth_mfa WHERE identity_id=$1", [auditIdentityId]);
    assert.equal(afterFailure.rows[0].count, 0);

    const retried = await api("/api/client/security/mfa/setup", {
      method: "POST",
      body: { password: auditNewPassword },
      cookie: auditClientCookie,
    });
    assert.equal(retried.status, 200, JSON.stringify(retried.body));
    auditMfaSecret = retried.body.secret;
    assert.match(auditMfaSecret, /^[A-Z2-7]+$/);
  });

  await t.test("MFA activation rolls back recovery codes and activation on audit failure", async () => {
    const code = await generateTotp({ secret: auditMfaSecret });
    const failed = await withForcedAuditFailure("mfa_activate", () => api("/api/client/security/mfa/activate", {
      method: "POST",
      body: { code },
      cookie: auditClientCookie,
    }));
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { error: "audit_unavailable" });
    const afterFailure = await pool.query("SELECT activated_at, recovery_hashes FROM auth_mfa WHERE identity_id=$1", [auditIdentityId]);
    assert.equal(afterFailure.rows[0].activated_at, null);
    assert.deepEqual(afterFailure.rows[0].recovery_hashes, []);

    const retried = await api("/api/client/security/mfa/activate", {
      method: "POST",
      body: { code },
      cookie: auditClientCookie,
    });
    assert.equal(retried.status, 200, JSON.stringify(retried.body));
    auditRecoveryCodes = retried.body.recoveryCodes;
    assert.equal(auditRecoveryCodes.length, 8);
  });

  await t.test("MFA disable rolls back factor state and session revocation on audit failure", async () => {
    const login = await api("/api/auth/login", {
      method: "POST",
      body: { email: auditEmail, password: auditNewPassword },
    });
    assert.equal(login.status, 202);
    const code = await generateTotp({ secret: auditMfaSecret });
    const completed = await api("/api/auth/mfa/complete", {
      method: "POST",
      body: { challenge: login.body.challenge, code },
    });
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    auditClientCookie = completed.setCookie.find(line => line.startsWith("seg_client_session=")).split(";")[0];

    const body = { password: auditNewPassword, code: auditRecoveryCodes[0] };
    const failed = await withForcedAuditFailure("mfa_disable", () => api("/api/client/security/mfa/disable", {
      method: "POST", body, cookie: auditClientCookie,
    }));
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { error: "audit_unavailable" });
    const afterFailure = await pool.query("SELECT activated_at FROM auth_mfa WHERE identity_id=$1", [auditIdentityId]);
    assert.ok(afterFailure.rows[0].activated_at);
    assert.equal((await api("/api/auth/me", { cookie: auditClientCookie })).status, 200);

    const retried = await api("/api/client/security/mfa/disable", {
      method: "POST", body, cookie: auditClientCookie,
    });
    assert.equal(retried.status, 200);
    const disabled = await pool.query("SELECT activated_at FROM auth_mfa WHERE identity_id=$1", [auditIdentityId]);
    assert.equal(disabled.rows[0].activated_at, null);
    assert.equal((await api("/api/auth/me", { cookie: auditClientCookie })).status, 401);
  });

  await t.test("the real sign-in page is served", async () => {
    const page = await fetch(`${origin}/cliente/entrar`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Entrar na área do cliente/);
  });
});
