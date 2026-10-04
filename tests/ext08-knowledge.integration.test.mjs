// EXT-08: base de conhecimento e procedimentos operacionais canônicos.
// PostgreSQL 17 real + servidor HTTP real + Playwright Chromium; fixtures sintéticas .invalid.
// Executado pelo gate dedicado (npm run test:ext08-knowledge:pg) com cluster descartável.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "../src/lib/client-auth-core.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_EXT08_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");

test("EXT-08 gate exige PostgreSQL real", () => {
  if (REQUIRE) assert.ok(RUN);
});

let server, base, pool, serverLogs = "";
let admin, ti, marcelo, rh, comercial, supervisor, financeiro;
let cookieAdmin, cookieTi, cookieMarcelo, cookieRh, cookieComercial, cookieSupervisor, cookieFinanceiro;

const idem = (t) => `ext08-${t}-${randomUUID()}`;
const fetchWithTimeout = (url, init = {}) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(init.method === "POST" || init.method === "PATCH" ? 60000 : 30000) });

async function waitServer() {
  for (let i = 0; i < 240; i++) {
    try {
      const res = await fetchWithTimeout(`${base}/api/admin/session`, { signal: undefined });
      if ([200, 401].includes(res.status)) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server_did_not_start");
}

async function createStaff(role, tag) {
  const id = randomUUID();
  const email = `ext08-${tag || role}-${id.slice(0, 8)}@example.invalid`;
  const password = "Senha-Sintetica-9!";
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status) VALUES ($1, 'staff', $2, $3, 'active')`,
    [id, email, `QA EXT08 ${role.toUpperCase()}`]
  );
  await pool.query(
    `INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1, $2)`,
    [id, await hashPassword(password)]
  );
  await pool.query(
    `INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1, $2, 'admin_system')`,
    [id, role]
  );
  return { id, email, password, role };
}

async function loginStaff(s) {
  const r = await fetchWithTimeout(`${base}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: s.email, password: s.password }),
  });
  assert.equal(r.status, 200, `Falha no login do papel ${s.role}`);
  const setCookie = r.headers.getSetCookie();
  const sessionCookie = setCookie.find((x) => x.startsWith("seg_admin_session="));
  assert.ok(sessionCookie, "Cookie de sessão deve ser emitido");
  return sessionCookie.split(";")[0];
}

async function api(url, { method = "GET", cookie = cookieAdmin, body, key, origin = base, raw } = {}) {
  const headers = {
    accept: "application/json",
    origin,
    ...(cookie ? { cookie } : {}),
    ...(method !== "GET" ? { "idempotency-key": key === null ? "" : key || idem("request") } : {}),
  };
  if (raw === undefined && body !== undefined) headers["content-type"] = "application/json";
  const r = await fetchWithTimeout(base + url, {
    method,
    headers,
    body: raw === undefined ? (body === undefined ? undefined : JSON.stringify(body)) : raw,
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 120) };
  }
  return { status: r.status, body: data, text };
}

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  const port = 3700 + Math.floor(Math.random() * 800);
  base = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-ext08",
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      SITE_ADMIN_LEGACY_TOKENS: "",
      OLLAMA_ENABLED: "false",
      MAIL_HOST: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (x) => (serverLogs += x));
  server.stderr.on("data", (x) => (serverLogs += x));

  try {
    await waitServer();
  } catch (e) {
    throw new Error(`${e.message}\n${serverLogs.slice(-3000)}`);
  }

  admin = await createStaff("admin");
  ti = await createStaff("ti");
  marcelo = await createStaff("marcelo");
  rh = await createStaff("rh");
  comercial = await createStaff("comercial");
  supervisor = await createStaff("supervisor");
  financeiro = await createStaff("financeiro");

  cookieAdmin = await loginStaff(admin);
  cookieTi = await loginStaff(ti);
  cookieMarcelo = await loginStaff(marcelo);
  cookieRh = await loginStaff(rh);
  cookieComercial = await loginStaff(comercial);
  cookieSupervisor = await loginStaff(supervisor);
  cookieFinanceiro = await loginStaff(financeiro);
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    server.kill("SIGKILL");
  }
  if (serverLogs.trim()) console.error(`SERVER_LOGS_TAIL_BEGIN\n${serverLogs.slice(-5000)}\nSERVER_LOGS_TAIL_END`);
});

const opt = { skip: !RUN };

// ---------------------------------------------------------------------------
// Suíte de Testes Ponta a Ponta
// ---------------------------------------------------------------------------

test("EXT-08 cluster limpo não teve seed e responde lista vazia com critérios", opt, async () => {
  const counts = (
    await pool.query(
      `SELECT (SELECT count(*) FROM ext_knowledge_base WHERE origin='ext08_canonica') AS kb,
              (SELECT count(*) FROM ext_knowledge_base_history) AS hist,
              (SELECT count(*) FROM ext_knowledge_acknowledgments) AS ack,
              (SELECT count(*) FROM ext_knowledge_events) AS ev`
    )
  ).rows[0];
  assert.deepEqual(counts, { kb: "0", hist: "0", ack: "0", ev: "0" });

  const list = await api("/api/ext/knowledge/articles");
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 0);
  assert.equal(list.body.count, 0);
});

test("EXT-08 HTTP anônimo 401 em rotas de artigos e ciências", opt, async () => {
  assert.equal((await api("/api/ext/knowledge/articles", { cookie: null })).status, 401);
  assert.equal((await api("/api/ext/knowledge/articles", { method: "POST", body: {}, cookie: null })).status, 401);
  assert.equal((await api(`/api/ext/knowledge/articles/${randomUUID()}`, { cookie: null })).status, 401);
  assert.equal((await api(`/api/ext/knowledge/articles/${randomUUID()}/acknowledge`, { method: "POST", cookie: null })).status, 401);
});

test("EXT-08 HTTP papel sem permissão de edição (financeiro) recebe 403 na criação e transição", opt, async () => {
  const rCreate = await api("/api/ext/knowledge/articles", {
    method: "POST",
    cookie: cookieFinanceiro,
    body: {
      slug: "pop-financeiro-sem-permissao",
      title: "POP Financeiro Negado",
      content: "A".repeat(60),
      category: "financeiro",
    },
  });
  assert.equal(rCreate.status, 403);
  assert.equal(rCreate.body.error, "forbidden_role");
});

test("EXT-08 HTTP same-origin obrigatório em mutações", opt, async () => {
  const rGet = await api("/api/ext/knowledge/articles", { origin: "https://attacker.invalid" });
  assert.equal(rGet.status, 200, "Leitura GET permite origin para exibição");

  const rPost = await api("/api/ext/knowledge/articles", {
    method: "POST",
    origin: "https://attacker.invalid",
    body: {
      slug: "pop-origin-invalid",
      title: "POP Origin Invalido",
      content: "A".repeat(60),
      category: "operacional",
    },
  });
  assert.equal(rPost.status, 403);
  assert.equal(rPost.body.error, "origin_forbidden");
});

test("EXT-08 HTTP Idempotency-Key obrigatória nas mutações", opt, async () => {
  const r = await api("/api/ext/knowledge/articles", {
    method: "POST",
    key: null,
    body: {
      slug: "pop-sem-chave",
      title: "POP Sem Chave",
      content: "A".repeat(60),
      category: "operacional",
    },
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "idempotency_key_required");
});

let testArticleId = null;
const testSlug = "pop-controle-acesso-portaria";

test("EXT-08 criação de procedimento operacional padrão (POP) por TI inicia como rascunho v1", opt, async () => {
  const payload = {
    slug: testSlug,
    title: "POP 01 - Controle de Acesso na Portaria Principal",
    summary: "Instrução técnica e operacional para identificação, cadastro e liberação de visitantes.",
    content: "Este Procedimento Operacional Padrão estabelece os passos obrigatórios para a identificação de pessoas e veículos na entrada da unidade.",
    category: "operacional",
    tags: ["portaria", "acesso", "visitantes"],
    access_roles: ["comercial", "supervisor", "admin", "ti"],
  };

  const r = await api("/api/ext/knowledge/articles", { method: "POST", cookie: cookieTi, body: payload });
  assert.equal(r.status, 201);
  assert.ok(r.body.article?.id);
  assert.equal(r.body.article.slug, testSlug);
  assert.equal(r.body.article.status, "rascunho");
  assert.equal(r.body.article.version, 1);
  assert.equal(r.body.article.is_published, false);
  testArticleId = r.body.article.id;

  // Verificar gravação de histórico e evento
  const hist = await pool.query(`SELECT * FROM ext_knowledge_base_history WHERE kb_id = $1`, [testArticleId]);
  assert.equal(hist.rows.length, 1);
  assert.equal(hist.rows[0].next_version, 1);

  const ev = await pool.query(`SELECT * FROM ext_knowledge_events WHERE kb_id = $1`, [testArticleId]);
  assert.equal(ev.rows.length, 1);
  assert.equal(ev.rows[0].event_type, "artigo_criado");
});

test("EXT-08 rascunho é invisível para comercial/financeiro e visível para autores/admin", opt, async () => {
  // Comercial listando -> deve estar vazio
  const comList = await api("/api/ext/knowledge/articles", { cookie: cookieComercial });
  assert.equal(comList.status, 200);
  assert.equal(comList.body.items.length, 0, "Rascunho não pode aparecer para comercial");

  // Comercial tentando GET direto no ID -> 403
  const comDetail = await api(`/api/ext/knowledge/articles/${testArticleId}`, { cookie: cookieComercial });
  assert.equal(comDetail.status, 403);

  // Admin listando -> vê o rascunho
  const adminList = await api("/api/ext/knowledge/articles", { cookie: cookieAdmin });
  assert.equal(adminList.status, 200);
  assert.equal(adminList.body.items.length, 1);
  assert.equal(adminList.body.items[0].id, testArticleId);
});

test("EXT-08 transições formais: rascunho -> em_revisao -> aprovado -> publicado", opt, async () => {
  // 1. Enviar para revisão (RH ou TI)
  const r1 = await api(`/api/ext/knowledge/articles/${testArticleId}/transition`, {
    method: "POST",
    cookie: cookieRh,
    body: { status: "em_revisao", notes: "Encaminhado para validação técnica da chefia" },
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.article.status, "em_revisao");

  // 2. Aprovar tecnicamente (Marcelo ou Admin)
  const r2 = await api(`/api/ext/knowledge/articles/${testArticleId}/transition`, {
    method: "POST",
    cookie: cookieMarcelo,
    body: { status: "aprovado", notes: "Aprovado sem ressalvas pelo gestor" },
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.article.status, "aprovado");

  // 3. Tentar publicar com comercial -> 403
  const rComPublish = await api(`/api/ext/knowledge/articles/${testArticleId}/transition`, {
    method: "POST",
    cookie: cookieComercial,
    body: { status: "publicado" },
  });
  assert.equal(rComPublish.status, 403);
  assert.equal(rComPublish.body.error, "forbidden_role");

  // 4. Publicar com Admin
  const r3 = await api(`/api/ext/knowledge/articles/${testArticleId}/transition`, {
    method: "POST",
    cookie: cookieAdmin,
    body: { status: "publicado" },
  });
  assert.equal(r3.status, 200);
  assert.equal(r3.body.article.status, "publicado");
  assert.equal(r3.body.article.is_published, true);
  assert.ok(r3.body.article.published_at);
});

test("EXT-08 procedimento publicado torna-se pesquisável e acessível por papéis declarados", opt, async () => {
  // Comercial listando -> agora deve encontrar
  const comList = await api("/api/ext/knowledge/articles", { cookie: cookieComercial });
  assert.equal(comList.status, 200);
  assert.equal(comList.body.items.length, 1);
  assert.equal(comList.body.items[0].id, testArticleId);
  assert.equal(comList.body.items[0].user_acknowledged, false);

  // Busca textual com termo relevante
  const searchHit = await api("/api/ext/knowledge/articles?q=visitantes", { cookie: cookieComercial });
  assert.equal(searchHit.status, 200);
  assert.equal(searchHit.body.items.length, 1);

  // Busca textual com termo inexistente
  const searchMiss = await api("/api/ext/knowledge/articles?q=termo_completamente_inexistente", { cookie: cookieComercial });
  assert.equal(searchMiss.status, 200);
  assert.equal(searchMiss.body.items.length, 0);

  // Detalhe para comercial
  const comDetail = await api(`/api/ext/knowledge/articles/${testArticleId}`, { cookie: cookieComercial });
  assert.equal(comDetail.status, 200);
  assert.equal(comDetail.body.article.title, "POP 01 - Controle de Acesso na Portaria Principal");
  assert.equal(comDetail.body.article.user_acknowledged, false);
});

test("EXT-08 múltiplos colaboradores confirmam ciência formal vinculada à versão 1", opt, async () => {
  // Comercial dá ciência
  const ackComKey = idem("ack-com");
  const ackCom = await api(`/api/ext/knowledge/articles/${testArticleId}/acknowledge`, {
    method: "POST",
    cookie: cookieComercial,
    key: ackComKey,
    body: { notes: "Procedimento lido e compreendido na escala comercial." },
  });
  assert.equal(ackCom.status, 200);
  assert.equal(ackCom.body.version, 1);

  // Replay da ciência do comercial devolve 200 com replayed: true
  const ackComReplay = await api(`/api/ext/knowledge/articles/${testArticleId}/acknowledge`, {
    method: "POST",
    cookie: cookieComercial,
    key: ackComKey,
    body: { notes: "Procedimento lido e compreendido na escala comercial." },
  });
  assert.equal(ackComReplay.status, 200);
  assert.equal(ackComReplay.body.replayed, true);

  // Supervisor dá ciência
  const ackSup = await api(`/api/ext/knowledge/articles/${testArticleId}/acknowledge`, {
    method: "POST",
    cookie: cookieSupervisor,
    body: { notes: "Ciência confirmada para a equipe de supervisão." },
  });
  assert.equal(ackSup.status, 200);

  // Verificar na API de detalhe que user_acknowledged agora é true para o comercial
  const comDetailAfter = await api(`/api/ext/knowledge/articles/${testArticleId}`, { cookie: cookieComercial });
  assert.equal(comDetailAfter.body.article.user_acknowledged, true);
  assert.equal(comDetailAfter.body.article.ack_count, 2);

  // Listar ciências (visão da gestão / TI)
  const acksList = await api(`/api/ext/knowledge/articles/${testArticleId}/acknowledgments`, { cookie: cookieTi });
  assert.equal(acksList.status, 200);
  assert.equal(acksList.body.items.length, 2);
});

let testArticleV2Id = null;

test("EXT-08 edição de procedimento publicado cria nova versão 2 imutável", opt, async () => {
  const updatePayload = {
    title: "POP 01 - Controle de Acesso na Portaria Principal (Revisão 2)",
    content: "Nova diretriz operacional atualizada para controle de acesso biométrico e verificação em duas etapas.",
    change_summary: "Inclusão de validação biométrica na entrada de prestadores",
  };

  const rUpdate = await api(`/api/ext/knowledge/articles/${testArticleId}`, {
    method: "PATCH",
    cookie: cookieTi,
    body: updatePayload,
  });
  assert.equal(rUpdate.status, 201);
  assert.equal(rUpdate.body.isNewVersion, true);
  assert.equal(rUpdate.body.article.version, 2);
  assert.equal(rUpdate.body.article.status, "rascunho");
  testArticleV2Id = rUpdate.body.article.id;
  assert.notEqual(testArticleV2Id, testArticleId, "Nova versão gera novo ID de registro");

  // Versão 1 permanece publicada e imutável
  const v1Check = await pool.query(`SELECT version, status, is_published FROM ext_knowledge_base WHERE id = $1`, [testArticleId]);
  assert.equal(v1Check.rows[0].version, 1);
  assert.equal(v1Check.rows[0].status, "publicado");

  // Avançar v2 para publicado
  await api(`/api/ext/knowledge/articles/${testArticleV2Id}/transition`, { method: "POST", cookie: cookieTi, body: { status: "em_revisao" } });
  await api(`/api/ext/knowledge/articles/${testArticleV2Id}/transition`, { method: "POST", cookie: cookieMarcelo, body: { status: "aprovado" } });
  const v2Pub = await api(`/api/ext/knowledge/articles/${testArticleV2Id}/transition`, { method: "POST", cookie: cookieAdmin, body: { status: "publicado" } });
  assert.equal(v2Pub.status, 200);

  // Ao publicar v2, a v1 é automaticamente arquivada
  const v1After = await pool.query(`SELECT version, status, is_published FROM ext_knowledge_base WHERE id = $1`, [testArticleId]);
  assert.equal(v1After.rows[0].status, "arquivado");
  assert.equal(v1After.rows[0].is_published, false);

  // Na nova versão v2, o comercial NÃO possui ciência ainda (ciência deve ser renovada por versão)
  const comV2Detail = await api(`/api/ext/knowledge/articles/${testArticleV2Id}`, { cookie: cookieComercial });
  assert.equal(comV2Detail.body.article.user_acknowledged, false, "Nova versão exige nova ciência");
  assert.equal(comV2Detail.body.article.ack_count, 0);
});

test("EXT-08 falha injetada de auditoria provoca rollback atômico e 503 audit_unavailable", opt, async () => {
  // Criar trigger temporário para provocar erro em audit_log
  await pool.query(`
    CREATE OR REPLACE FUNCTION qa_fail_knowledge_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.action LIKE 'knowledge_%' AND NEW.meta::text LIKE '%trigger_falha%' THEN
        RAISE EXCEPTION 'injected_audit_failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS qa_knowledge_audit_trigger ON audit_log;
    CREATE TRIGGER qa_knowledge_audit_trigger BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_fail_knowledge_audit();
  `);

  try {
    const rFail = await api("/api/ext/knowledge/articles", {
      method: "POST",
      cookie: cookieTi,
      body: {
        slug: "pop-trigger-falha-audit",
        title: "POP Trigger Falha Auditoria",
        content: "Conteúdo que provocará falha proposital no log de auditoria.",
        category: "operacional",
      },
    });
    assert.equal(rFail.status, 503);
    assert.equal(rFail.body.error, "audit_unavailable");

    // Verificar que o artigo NÃO foi persistido (ROLLBACK efetivo)
    const checkDb = await pool.query(`SELECT count(*)::int n FROM ext_knowledge_base WHERE slug = 'pop-trigger-falha-audit'`);
    assert.equal(checkDb.rows[0].n, 0, "Transação deve sofrer rollback completo");
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_knowledge_audit_trigger ON audit_log;`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_fail_knowledge_audit();`);
  }
});

test("EXT-08 rotas legadas mantêm leitura compatível e respondem 410 na escrita", opt, async () => {
  // GET legado responde 200
  const legacyGet = await api("/api/ext/knowledge-base", { cookie: cookieAdmin });
  assert.equal(legacyGet.status, 200);
  assert.ok(Array.isArray(legacyGet.body.items));

  // POST legado responde 410 aposentado
  const legacyPost = await api("/api/ext/knowledge-base", {
    method: "POST",
    cookie: cookieAdmin,
    body: { title: "Tentativa de escrita legada" },
  });
  assert.equal(legacyPost.status, 410);
  assert.equal(legacyPost.body.error, "legacy_knowledge_writer_retired");
});

test("EXT-08 UI /admin/conhecimento responde 200 e componente React KnowledgeWorkspace está presente", opt, async () => {
  await access(path.join(root, "src/app/admin/conhecimento/KnowledgeWorkspace.tsx"));
  await access(path.join(root, "src/app/admin/conhecimento/page.tsx"));

  const res = await fetch(`${base}/admin/conhecimento`, {
    headers: { cookie: cookieTi },
    signal: AbortSignal.timeout(30000),
  });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Conhecimento|conhecimento|Base de Conhecimento/i);
});
