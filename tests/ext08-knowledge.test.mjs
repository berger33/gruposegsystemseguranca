// EXT-08 — teste focal: migração 160 estática + unidade da API com fake pool.
// Valida regras de negócio, versionamento imutável, transições, idempotência, auditoria e controle de acesso.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createExtKnowledgeApi, KB_TRANSITIONS } from "../src/server/ext-knowledge-api.mjs";

const adminIdentity = "11111111-1111-4111-8111-111111111111";
const tiIdentity = "22222222-2222-4222-8222-222222222222";
const rhIdentity = "33333333-3333-4333-8333-333333333333";
const operatorIdentity = "44444444-4444-4444-8444-444444444444";
const articleId = "88888888-8888-4888-8888-888888888888";
const ackId = "99999999-9999-4999-8999-999999999999";

const sql160 = () => readFile(new URL("../db/migrations/160-ext08-knowledge-canonical-journey.sql", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1. Verificação Estática da Migração 160
// ---------------------------------------------------------------------------

test("EXT-08 migração 160 é aditiva, preserva 001–159 e define eventos de idempotência", async () => {
  const migration = await sql160();
  assert.match(migration, /ALTER TABLE ext_knowledge_base/);
  assert.match(migration, /ext_knowledge_origin_check/);
  assert.match(migration, /ext_knowledge_events/);
  assert.match(migration, /ext_knowledge_acknowledgments/);
  assert.match(migration, /knowledge\.read/);
  assert.match(migration, /knowledge\.write/);
  assert.match(migration, /knowledge\.publish/);
  assert.match(migration, /knowledge\.acknowledge/);
  assert.doesNotMatch(migration, /DROP TABLE/);
  assert.doesNotMatch(migration, /DELETE FROM/);
});

// ---------------------------------------------------------------------------
// 2. Helpers para Fake Pool e Captura HTTP
// ---------------------------------------------------------------------------

function responseCapture() {
  return {
    status: 0,
    headers: {},
    payload: null,
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      try {
        this.payload = JSON.parse(body);
      } catch {
        this.payload = body;
      }
    },
  };
}

function request({
  method = "GET",
  url = "/api/ext/knowledge/articles",
  body,
  key = "ext08-focal-key-0001",
  origin = "https://admin.test",
} = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const headers = { host: "admin.test", ...(origin === null ? {} : { origin }) };
  if (key !== null) headers["idempotency-key"] = key;
  return {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() {
      yield* bytes;
    },
  };
}

function createTestApi(pool, { session = { identityId: adminIdentity, role: "admin" }, origin = true } = {}) {
  return createExtKnowledgeApi({
    pool,
    sameOrigin: () => origin,
    requireSession: async () => session,
  });
}

function mockMutationPool({
  article = {
    id: articleId,
    slug: "pop-portaria-principal",
    title: "POP - Controle de Portaria Principal",
    summary: "Procedimento operacional padrão para controle de acesso.",
    content: "Instrução de trabalho para operadores de portaria. Verificação de credenciais e registro de visitantes.",
    category: "operacional",
    status: "rascunho",
    version: 1,
    is_published: false,
    tags: ["portaria", "acesso"],
    access_roles: ["admin", "operacao", "supervisor"],
    created_by_identity: adminIdentity,
  },
  existingEvent = null,
  failAudit = false,
} = {}) {
  const statements = [];
  const client = {
    async query(rawSql, params = []) {
      const sql = String(rawSql).replace(/\s+/g, " ").trim();
      statements.push({ sql, params });

      if (sql.includes("INSERT INTO audit_log")) {
        if (failAudit) throw new Error("audit log offline");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("FROM ext_knowledge_events WHERE created_by_identity = $1 AND idempotency_key = $2")) {
        return { rows: existingEvent ? [existingEvent] : [] };
      }
      if (sql.includes("SELECT COALESCE(MAX(version), 0) AS max_v FROM ext_knowledge_base")) {
        return { rows: [{ max_v: article ? article.version : 0 }] };
      }
      if (sql.includes("FROM ext_knowledge_base WHERE id = $1 FOR UPDATE") || sql.includes("FROM ext_knowledge_base WHERE id = $1")) {
        return { rows: article ? [article] : [] };
      }
      if (sql.includes("FROM ext_knowledge_base WHERE slug = $1")) {
        return { rows: article ? [article] : [] };
      }
      if (sql.startsWith("INSERT INTO ext_knowledge_base")) {
        return {
          rows: [
            {
              id: articleId,
              slug: params[0],
              title: params[1],
              summary: params[2],
              content: params[3],
              category: params[4],
              status: "rascunho",
              version: params[5],
              is_published: false,
              tags: params[6] || [],
              access_roles: params[7] || [],
              created_by_identity: params[8],
              origin: "ext08_canonica",
            },
          ],
        };
      }
      if (sql.startsWith("UPDATE ext_knowledge_base")) {
        const nextStatus = params[1] || article.status;
        return {
          rows: [
            {
              ...article,
              status: nextStatus,
              is_published: nextStatus === "publicado",
            },
          ],
        };
      }
      if (sql.startsWith("INSERT INTO ext_knowledge_acknowledgments")) {
        return {
          rows: [
            {
              id: ackId,
              kb_id: articleId,
              user_identity: params[1],
              notes: params[2],
              source: "jornada_canonica",
            },
          ],
        };
      }
      if (sql.startsWith("INSERT INTO ext_knowledge_events") || sql.startsWith("INSERT INTO ext_knowledge_base_history")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    },
    release() {},
  };

  const pool = {
    async connect() {
      return client;
    },
    async query(rawSql, params = []) {
      return client.query(rawSql, params);
    },
  };

  return { statements, pool, client };
}

// ---------------------------------------------------------------------------
// 3. Testes Unitários de API e Regras de Negócio
// ---------------------------------------------------------------------------

test("EXT-08 criação valida slug, título, conteúdo mínimo (50 chars) e categoria", async () => {
  const invalidCases = [
    { body: { slug: "ab", title: "Título Válido", content: "A".repeat(60), category: "operacional" }, error: "invalid_slug" },
    { body: { slug: "slug-valido", title: "abc", content: "A".repeat(60), category: "operacional" }, error: "invalid_title" },
    { body: { slug: "slug-valido", title: "Título Válido", content: "Muito curto", category: "operacional" }, error: "invalid_content" },
    { body: { slug: "slug-valido", title: "Título Válido", content: "A".repeat(60), category: "" }, error: "invalid_category" },
  ];

  for (const tc of invalidCases) {
    const { pool } = mockMutationPool();
    const res = responseCapture();
    const api = createTestApi(pool);
    await api.handle(request({ method: "POST", url: "/api/ext/knowledge/articles", body: tc.body }), res);
    assert.equal(res.status, 400);
    assert.equal(res.payload.error, tc.error);
  }
});

test("EXT-08 criação válida inicia em status rascunho, versão 1 e registra evento", async () => {
  const { statements, pool } = mockMutationPool({ article: null });
  const res = responseCapture();
  const api = createTestApi(pool);
  const payload = {
    slug: "pop-seguranca-perimetral",
    title: "POP - Segurança Perimetral e Rondas",
    summary: "Resumo do procedimento de segurança perimetral.",
    content: "Este procedimento define as diretrizes para execução de rondas e inspeções diárias nos postos.",
    category: "seguranca",
    tags: ["ronda", "perimetro"],
    access_roles: ["operacao", "supervisor", "admin"],
  };

  await api.handle(request({ method: "POST", url: "/api/ext/knowledge/articles", body: payload }), res);
  assert.equal(res.status, 201);
  assert.equal(res.payload.article.status, "rascunho");
  assert.equal(res.payload.article.version, 1);

  const eventInsert = statements.find(s => s.sql.includes("INSERT INTO ext_knowledge_events"));
  assert.ok(eventInsert, "Deve registrar evento na tabela ext_knowledge_events");
  const auditInsert = statements.find(s => s.sql.includes("INSERT INTO audit_log"));
  assert.ok(auditInsert, "Deve registrar na auditoria corporativa");
});

test("EXT-08 transições de status respeitam máquina de estados estrita", async () => {
  // Transição proibida: rascunho -> publicado direto (precisa passar por revisão e aprovação)
  const { pool: invalidPool } = mockMutationPool({
    article: { id: articleId, status: "rascunho", version: 1 },
  });
  const invalidRes = responseCapture();
  const apiInvalid = createTestApi(invalidPool);
  await apiInvalid.handle(
    request({
      method: "POST",
      url: `/api/ext/knowledge/articles/${articleId}/transition`,
      body: { status: "publicado" },
    }),
    invalidRes
  );
  assert.equal(invalidRes.status, 409);
  assert.equal(invalidRes.payload.error, "invalid_status_transition");

  // Transição válida: rascunho -> em_revisao
  const { pool: validPool } = mockMutationPool({
    article: { id: articleId, status: "rascunho", version: 1 },
  });
  const validRes = responseCapture();
  const apiValid = createTestApi(validPool);
  await apiValid.handle(
    request({
      method: "POST",
      url: `/api/ext/knowledge/articles/${articleId}/transition`,
      body: { status: "em_revisao" },
    }),
    validRes
  );
  assert.equal(validRes.status, 200);
});

test("EXT-08 arquivamento exige motivo formal com ao menos 5 caracteres", async () => {
  const { pool } = mockMutationPool({
    article: { id: articleId, status: "publicado", version: 1, is_published: true },
  });
  const res = responseCapture();
  const api = createTestApi(pool);
  await api.handle(
    request({
      method: "POST",
      url: `/api/ext/knowledge/articles/${articleId}/transition`,
      body: { status: "arquivado" }, // sem reason
    }),
    res
  );
  assert.equal(res.status, 400);
  assert.equal(res.payload.error, "archive_reason_required");
});

test("EXT-08 edição de artigo publicado cria nova versão imutável", async () => {
  const { pool } = mockMutationPool({
    article: {
      id: articleId,
      slug: "pop-portaria",
      title: "POP Portaria Original",
      content: "A".repeat(60),
      category: "operacional",
      status: "publicado",
      version: 1,
      is_published: true,
      tags: ["portaria"],
      access_roles: ["operacao"],
    },
  });
  const res = responseCapture();
  const api = createTestApi(pool);
  await api.handle(
    request({
      method: "PATCH",
      url: `/api/ext/knowledge/articles/${articleId}`,
      body: {
        title: "POP Portaria Revisado",
        content: "B".repeat(60),
        change_summary: "Revisão dos critérios de entrada de fornecedores",
      },
    }),
    res
  );
  assert.equal(res.status, 201);
  assert.equal(res.payload.isNewVersion, true);
  assert.equal(res.payload.article.version, 2);
});

test("EXT-08 ciência exige artigo publicado e registra versão específica", async () => {
  // Tentativa em artigo rascunho -> 409
  const { pool: draftPool } = mockMutationPool({
    article: { id: articleId, status: "rascunho", is_published: false, version: 1 },
  });
  const draftRes = responseCapture();
  const apiDraft = createTestApi(draftPool, { session: { identityId: operatorIdentity, role: "operacao" } });
  await apiDraft.handle(
    request({
      method: "POST",
      url: `/api/ext/knowledge/articles/${articleId}/acknowledge`,
      body: {},
    }),
    draftRes
  );
  assert.equal(draftRes.status, 409);
  assert.equal(draftRes.payload.error, "article_not_published_for_acknowledgment");

  // Tentativa em artigo publicado -> 200
  const { pool: pubPool } = mockMutationPool({
    article: { id: articleId, status: "publicado", is_published: true, version: 1, title: "POP Portaria" },
  });
  const pubRes = responseCapture();
  const apiPub = createTestApi(pubPool, { session: { identityId: operatorIdentity, role: "operacao" } });
  await apiPub.handle(
    request({
      method: "POST",
      url: `/api/ext/knowledge/articles/${articleId}/acknowledge`,
      body: { notes: "Lido e compreendido na integração operacional." },
    }),
    pubRes
  );
  assert.equal(pubRes.status, 200);
  assert.equal(pubRes.payload.version, 1);
});

test("EXT-08 replay de idempotência retorna 200 e payload divergente 409", async () => {
  const payload = {
    slug: "pop-teste-idempotencia",
    title: "POP - Teste de Idempotência",
    content: "C".repeat(60),
    category: "tecnologia",
  };
  const { createHash } = await import("node:crypto");
  const fpObj = {
    op: "create",
    slug: payload.slug,
    title: payload.title,
    content: payload.content,
    category: payload.category,
    summary: null,
    tags: [],
    accessRoles: [],
  };
  const matchingFp = createHash("sha256")
    .update(JSON.stringify(fpObj, Object.keys(fpObj).sort()))
    .digest("hex");

  const existingEvent = {
    kb_id: articleId,
    idempotency_key: "ext08-idem-key-1",
    request_fingerprint: matchingFp,
  };

  const { pool } = mockMutationPool({ existingEvent, article: { id: articleId, slug: payload.slug, title: payload.title, version: 1 } });
  const res = responseCapture();
  const api = createTestApi(pool);
  await api.handle(
    request({
      method: "POST",
      url: "/api/ext/knowledge/articles",
      body: payload,
      key: "ext08-idem-key-1",
    }),
    res
  );
  assert.equal(res.status, 200);
  assert.equal(res.payload.replayed, true);

  // Divergent fingerprint
  const divergentEvent = {
    kb_id: articleId,
    idempotency_key: "ext08-idem-key-1",
    request_fingerprint: "0".repeat(64),
  };
  const { pool: divPool } = mockMutationPool({ existingEvent: divergentEvent, article: { id: articleId, slug: payload.slug, title: payload.title, version: 1 } });
  const divRes = responseCapture();
  const apiDiv = createTestApi(divPool);
  await apiDiv.handle(
    request({
      method: "POST",
      url: "/api/ext/knowledge/articles",
      body: payload,
      key: "ext08-idem-key-1",
    }),
    divRes
  );
  assert.equal(divRes.status, 409);
  assert.equal(divRes.payload.error, "idempotency_key_reused");
});

test("EXT-08 falha de audit_log aborta transação e responde 503 audit_unavailable", async () => {
  const { statements, pool } = mockMutationPool({ failAudit: true });
  const res = responseCapture();
  const api = createTestApi(pool);
  await api.handle(
    request({
      method: "POST",
      url: "/api/ext/knowledge/articles",
      body: {
        slug: "pop-falha-auditoria",
        title: "POP - Falha de Auditoria",
        content: "D".repeat(60),
        category: "compliance",
      },
      key: "ext08-audit-fail-key",
    }),
    res
  );
  assert.equal(res.status, 503);
  assert.equal(res.payload.error, "audit_unavailable");
  assert.ok(statements.some(s => s.sql.includes("ROLLBACK")), "Deve executar ROLLBACK");
});

test("EXT-08 rota legada aposenta escrita com HTTP 410", async () => {
  const { pool } = mockMutationPool();
  const res = responseCapture();
  const api = createTestApi(pool);
  await api.handleLegacy(
    request({
      method: "POST",
      url: "/api/ext/knowledge-base",
      body: { title: "Antigo" },
    }),
    res
  );
  assert.equal(res.status, 410);
  assert.equal(res.payload.error, "legacy_knowledge_writer_retired");
});
