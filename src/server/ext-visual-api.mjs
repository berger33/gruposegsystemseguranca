// EXT-12 / F08 — Editor visual avançado canônico.
//
// Registra tokens e layouts versionados, gera prévia interna e publica uma
// versão aprovada. Não altera o site público via rota antiga e não usa os
// handlers legados como cobertura da jornada.
import { createHash } from "node:crypto";
import { hasPermission } from "./rbac.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const STATUS = new Set(["rascunho", "em_revisao", "aprovado", "publicado", "arquivado", "revertido"]);
const TRANSITIONS = Object.freeze({
  rascunho: ["em_revisao", "arquivado"],
  em_revisao: ["rascunho", "aprovado", "arquivado"],
  aprovado: ["em_revisao", "arquivado"],
  publicado: ["revertido", "arquivado"],
  arquivado: ["rascunho"],
  revertido: ["rascunho", "arquivado"],
});

const text = (value, min, max) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max
    ? value.trim()
    : null;

const jsonValue = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = JSON.stringify(value);
  return raw.length <= 32 * 1024 ? value : null;
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const fingerprint = (payload) => createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");

function parseJsonb(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return value;
}

export function buildPreviewSnapshot({ layout, token = null }) {
  const layoutData = parseJsonb(layout?.layout_data);
  const tokenValue = parseJsonb(token?.token_value);
  return {
    layout_id: layout?.id || null,
    layout_key: layout?.layout_key || null,
    layout_version: layout?.version || null,
    layout_status: layout?.status || null,
    token_id: token?.id || null,
    token_key: token?.token_key || null,
    token_version: token?.version || null,
    preview_url: layout?.preview_url || (layout?.id ? `/admin/visual?preview=${layout.id}` : null),
    publication_ready: layout?.status === "aprovado",
    tokens: tokenValue,
    layout: layoutData,
    boundary: "prévia interna; não publica o site público nem envia arquivos a fornecedor externo",
  };
}

export function createExtVisualApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, body) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    });
    res.end(JSON.stringify(body));
  };

  async function guard(req, res, permission, { write = false } = {}) {
    let session = null;
    try { session = await requireSession(req); } catch {}
    if (!session?.identityId || !UUID.test(String(session.identityId))) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
    if (!(await hasPermission(pool, { identityId: String(session.identityId), permission }))) {
      json(res, 403, { error: "forbidden" });
      return null;
    }
    if (write && !sameOrigin(req)) {
      json(res, 403, { error: "origin_forbidden" });
      return null;
    }
    return session;
  }

  async function readBody(req) {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 128 * 1024) return { error: "payload_too_large", status: 413 };
    }
    if (!raw.trim()) return { value: {} };
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "invalid_json", status: 400 };
      return { value };
    } catch {
      return { error: "invalid_json", status: 400 };
    }
  }

  function requireKey(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!KEY.test(key)) {
      json(res, 400, { error: "idempotency_key_required" });
      return null;
    }
    return key;
  }

  async function recordEvent(client, { entityType, tokenId = null, layoutId = null, eventType, summary, payload, key, fp, identityId }) {
    await client.query(
      `INSERT INTO ext_visual_editor_events
         (entity_type, token_id, layout_id, event_type, summary, payload,
          idempotency_key, request_fingerprint, created_by_identity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [entityType, tokenId, layoutId, eventType, summary, JSON.stringify(payload || {}), key, fp, identityId],
    );
  }

  async function mutate(res, { session, key, fp, action, work, replay }) {
    let client = null;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext-visual-${session.identityId}-${key}`]);
      const previous = await client.query(
        `SELECT * FROM ext_visual_editor_events
          WHERE created_by_identity = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [session.identityId, key],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].request_fingerprint !== fp) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_conflict_payload_mismatch" });
        }
        const replayed = await replay(client, previous.rows[0]);
        await client.query("COMMIT");
        return json(res, 200, { ...replayed, replayed: true });
      }

      const result = await work(client);
      if (result.error) {
        await client.query("ROLLBACK");
        return json(res, result.status || 400, { error: result.error, ...(result.message ? { message: result.message } : {}) });
      }

      try {
        await client.query(
          `INSERT INTO auth_access_audit
             (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('staff',$1,$2,$3,'allowed','none')`,
          [session.identityId, action, result.target || result.token?.id || result.layout?.id || "visual"],
        );
      } catch (auditError) {
        await client.query("ROLLBACK");
        console.error("EXT-12 audit unavailable", auditError?.message || auditError);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, result.statusCode || 200, result.response);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      console.error("EXT-12 mutation error", error?.message || error);
      return json(res, 500, { error: "internal_error" });
    } finally {
      client?.release();
    }
  }

  async function tokenById(clientOrPool, id, { lock = false } = {}) {
    const { rows } = await clientOrPool.query(
      `SELECT * FROM ext_visual_tokens WHERE id=$1 AND origin='ext12_canonica'${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    return rows[0] || null;
  }

  async function layoutById(clientOrPool, id, { lock = false } = {}) {
    const { rows } = await clientOrPool.query(
      `SELECT * FROM ext_visual_layouts WHERE id=$1 AND origin='ext12_canonica'${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    return rows[0] || null;
  }

  async function tokenDetail(clientOrPool, id) {
    const token = await tokenById(clientOrPool, id);
    if (!token) return null;
    const events = (await clientOrPool.query(
      `SELECT id, event_type, summary, payload, created_by_identity, created_at
         FROM ext_visual_editor_events
        WHERE token_id=$1
        ORDER BY created_at ASC, id ASC`,
      [id],
    )).rows;
    const history = (await clientOrPool.query(
      `SELECT id, previous_version, next_version, change_summary, changed_by_identity, created_at
         FROM ext_editor_history
        WHERE token_id=$1
        ORDER BY created_at ASC, id ASC`,
      [id],
    )).rows;
    return { token, events, history };
  }

  async function layoutDetail(clientOrPool, id) {
    const layout = await layoutById(clientOrPool, id);
    if (!layout) return null;
    const token = layout.token_id ? await tokenById(clientOrPool, layout.token_id) : null;
    const events = (await clientOrPool.query(
      `SELECT id, event_type, summary, payload, created_by_identity, created_at
         FROM ext_visual_editor_events
        WHERE layout_id=$1
        ORDER BY created_at ASC, id ASC`,
      [id],
    )).rows;
    const history = (await clientOrPool.query(
      `SELECT id, previous_version, next_version, change_summary, changed_by_identity, created_at
         FROM ext_editor_history
        WHERE layout_id=$1
        ORDER BY created_at ASC, id ASC`,
      [id],
    )).rows;
    return { layout, token, preview: buildPreviewSnapshot({ layout, token }), events, history };
  }

  async function listTokens(req, res) {
    const session = await guard(req, res, "visual_editor.read");
    if (!session) return;
    try {
      const { rows } = await pool.query(
        `SELECT id, token_key, token_value, category, status, version, is_published,
                published_at, approved_at, created_by_identity, created_at, updated_at
           FROM ext_visual_tokens
          WHERE origin='ext12_canonica'
          ORDER BY token_key ASC, version DESC
          LIMIT 200`,
      );
      return json(res, 200, { items: rows, note: "Tokens canônicos EXT-12; publicação exige versão aprovada e auditada." });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  async function listLayouts(req, res) {
    const session = await guard(req, res, "visual_editor.read");
    if (!session) return;
    try {
      const { rows } = await pool.query(
        `SELECT l.id, l.layout_key, l.layout_data, l.status, l.version, l.is_published,
                l.published_at, l.preview_url, l.token_id, t.token_key,
                l.approved_at, l.created_by_identity, l.created_at, l.updated_at
           FROM ext_visual_layouts l
           LEFT JOIN ext_visual_tokens t ON t.id = l.token_id
          WHERE l.origin='ext12_canonica'
          ORDER BY l.layout_key ASC, l.version DESC
          LIMIT 200`,
      );
      return json(res, 200, { items: rows, note: "Layouts canônicos EXT-12; prévia interna não publica o site." });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  async function createToken(req, res) {
    const session = await guard(req, res, "visual_editor.write", { write: true });
    if (!session) return;
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const body = parsed.value;
    const tokenKey = text(body.token_key, 3, 200);
    const category = text(body.category, 3, 100);
    const tokenValue = jsonValue(body.token_value);
    const summary = text(body.change_summary, 10, 1000) || "Criação canônica do token visual versionado.";
    if (!tokenKey || !category || !tokenValue) return json(res, 400, { error: "invalid_token_fields" });
    const fp = fingerprint({ op: "token_create", tokenKey, category, tokenValue, summary });
    return mutate(res, {
      session, key, fp, action: "visual_token_create",
      replay: async (client, event) => ({ token: (await client.query("SELECT * FROM ext_visual_tokens WHERE id=$1", [event.token_id])).rows[0] }),
      work: async (client) => {
        const max = await client.query(`SELECT COALESCE(MAX(version),0)::int AS version FROM ext_visual_tokens WHERE token_key=$1 AND origin='ext12_canonica'`, [tokenKey]);
        const version = Number(max.rows[0]?.version || 0) + 1;
        const inserted = await client.query(
          `INSERT INTO ext_visual_tokens
             (token_key, token_value, category, version, status, created_by_identity,
              origin, idempotency_key, request_fingerprint)
           VALUES ($1,$2,$3,$4,'rascunho',$5,'ext12_canonica',$6,$7)
           RETURNING *`,
          [tokenKey, JSON.stringify(tokenValue), category, version, session.identityId, key, fp],
        );
        const token = inserted.rows[0];
        await client.query(
          `INSERT INTO ext_editor_history
             (token_id, previous_version, next_version, change_summary, changed_by_identity)
           VALUES ($1,NULL,$2,$3,$4)`,
          [token.id, version, summary, session.identityId],
        );
        await recordEvent(client, { entityType: "token", tokenId: token.id, eventType: "token_created", summary, payload: { token_key: tokenKey, version }, key, fp, identityId: session.identityId });
        return { token, target: token.id, response: { token }, statusCode: 201 };
      },
    });
  }

  async function reviseToken(req, res, id) {
    const session = await guard(req, res, "visual_editor.write", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_token_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const tokenValue = jsonValue(parsed.value.token_value);
    const summary = text(parsed.value.change_summary, 10, 1000);
    if (!tokenValue || !summary) return json(res, 400, { error: "invalid_revision_fields" });
    const fp = fingerprint({ op: "token_revision", id, tokenValue, summary });
    return mutate(res, {
      session, key, fp, action: "visual_token_revision_create",
      replay: async (client, event) => ({ token: (await client.query("SELECT * FROM ext_visual_tokens WHERE id=$1", [event.payload.revision_id])).rows[0] }),
      work: async (client) => {
        const base = await tokenById(client, id, { lock: true });
        if (!base) return { error: "token_not_found", status: 404 };
        const max = await client.query(`SELECT COALESCE(MAX(version),0)::int AS version FROM ext_visual_tokens WHERE token_key=$1 AND origin='ext12_canonica'`, [base.token_key]);
        const version = Number(max.rows[0]?.version || 0) + 1;
        const inserted = await client.query(
          `INSERT INTO ext_visual_tokens
             (token_key, token_value, category, version, status, created_by_identity,
              origin, idempotency_key, request_fingerprint)
           VALUES ($1,$2,$3,$4,'rascunho',$5,'ext12_canonica',$6,$7)
           RETURNING *`,
          [base.token_key, JSON.stringify(tokenValue), base.category, version, session.identityId, key, fp],
        );
        const token = inserted.rows[0];
        await client.query(
          `INSERT INTO ext_editor_history
             (token_id, previous_version, next_version, change_summary, changed_by_identity)
           VALUES ($1,$2,$3,$4,$5)`,
          [token.id, base.version, version, summary, session.identityId],
        );
        await recordEvent(client, { entityType: "token", tokenId: token.id, eventType: "token_revision_created", summary, payload: { previous_id: id, revision_id: token.id, version }, key, fp, identityId: session.identityId });
        return { token, target: token.id, response: { token }, statusCode: 201 };
      },
    });
  }

  async function transitionToken(req, res, id) {
    const session = await guard(req, res, "visual_editor.review", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_token_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const next = text(parsed.value.status, 5, 30);
    const note = text(parsed.value.approval_note, 10, 1000) || text(parsed.value.justification, 10, 1000);
    if (!next || !STATUS.has(next) || next === "publicado") return json(res, 400, { error: "invalid_status" });
    const fp = fingerprint({ op: "token_transition", id, next, note: note || null });
    return mutate(res, {
      session, key, fp, action: "visual_token_transition",
      replay: async (client, event) => ({ token: (await client.query("SELECT * FROM ext_visual_tokens WHERE id=$1", [event.token_id])).rows[0] }),
      work: async (client) => {
        const token = await tokenById(client, id, { lock: true });
        if (!token) return { error: "token_not_found", status: 404 };
        if (!(TRANSITIONS[token.status] || []).includes(next)) return { error: "invalid_transition", status: 409 };
        if (["aprovado", "arquivado", "revertido"].includes(next) && !note) return { error: "justification_required", status: 400 };
        const updated = await client.query(
          `UPDATE ext_visual_tokens
              SET status=$2::ext_editor_status,
                  approved_by_identity = CASE WHEN $2::text='aprovado' THEN $3 ELSE approved_by_identity END,
                  approved_at = CASE WHEN $2::text='aprovado' THEN NOW() ELSE approved_at END,
                  approval_note = CASE WHEN $2::text='aprovado' THEN $4 ELSE approval_note END,
                  updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, next, session.identityId, note],
        );
        await recordEvent(client, { entityType: "token", tokenId: id, eventType: `token_${next}`, summary: `Token visual alterado para ${next}.`, payload: { from: token.status, to: next, note: note || null }, key, fp, identityId: session.identityId });
        return { token: updated.rows[0], target: id, response: { token: updated.rows[0] } };
      },
    });
  }

  async function publishToken(req, res, id) {
    const session = await guard(req, res, "visual_editor.publish", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_token_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const note = text(parsed.value.publish_note, 10, 1000);
    if (!note) return json(res, 400, { error: "publish_note_required" });
    const fp = fingerprint({ op: "token_publish", id, note });
    return mutate(res, {
      session, key, fp, action: "visual_token_publish",
      replay: async (client, event) => ({ token: (await client.query("SELECT * FROM ext_visual_tokens WHERE id=$1", [event.token_id])).rows[0] }),
      work: async (client) => {
        const token = await tokenById(client, id, { lock: true });
        if (!token) return { error: "token_not_found", status: 404 };
        if (token.status !== "aprovado") return { error: "approval_required", status: 409 };
        await client.query(`UPDATE ext_visual_tokens SET is_published=false WHERE origin='ext12_canonica' AND token_key=$1 AND id<>$2`, [token.token_key, id]);
        const updated = await client.query(
          `UPDATE ext_visual_tokens
              SET status='publicado', is_published=true, published_at=NOW(),
                  published_by_identity=$2, publish_note=$3, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, session.identityId, note],
        );
        await recordEvent(client, { entityType: "token", tokenId: id, eventType: "token_published", summary: "Token visual publicado como versão ativa.", payload: { token_key: token.token_key, version: token.version, publish_note: note }, key, fp, identityId: session.identityId });
        return { token: updated.rows[0], target: id, response: { token: updated.rows[0], note: "Token publicado sem alterar rotas legadas." } };
      },
    });
  }

  async function createLayout(req, res) {
    const session = await guard(req, res, "visual_editor.write", { write: true });
    if (!session) return;
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const body = parsed.value;
    const layoutKey = text(body.layout_key, 3, 200);
    const layoutData = jsonValue(body.layout_data);
    const summary = text(body.change_summary, 10, 1000) || "Criação canônica do layout visual versionado.";
    const tokenId = body.token_id === null || body.token_id === undefined || body.token_id === "" ? null : String(body.token_id);
    if (!layoutKey || !layoutData) return json(res, 400, { error: "invalid_layout_fields" });
    if (tokenId && !UUID.test(tokenId)) return json(res, 400, { error: "invalid_token_id" });
    const fp = fingerprint({ op: "layout_create", layoutKey, layoutData, tokenId, summary });
    return mutate(res, {
      session, key, fp, action: "visual_layout_create",
      replay: async (client, event) => ({ layout: (await client.query("SELECT * FROM ext_visual_layouts WHERE id=$1", [event.layout_id])).rows[0] }),
      work: async (client) => {
        if (tokenId && !(await tokenById(client, tokenId))) return { error: "token_not_found", status: 404 };
        const max = await client.query(`SELECT COALESCE(MAX(version),0)::int AS version FROM ext_visual_layouts WHERE layout_key=$1 AND origin='ext12_canonica'`, [layoutKey]);
        const version = Number(max.rows[0]?.version || 0) + 1;
        const previewUrl = `/admin/visual?preview=${layoutKey}-${version}`;
        const inserted = await client.query(
          `INSERT INTO ext_visual_layouts
             (layout_key, layout_data, token_id, version, status, preview_url,
              created_by_identity, origin, idempotency_key, request_fingerprint)
           VALUES ($1,$2,$3,$4,'rascunho',$5,$6,'ext12_canonica',$7,$8)
           RETURNING *`,
          [layoutKey, JSON.stringify(layoutData), tokenId, version, previewUrl, session.identityId, key, fp],
        );
        const layout = inserted.rows[0];
        await client.query(
          `INSERT INTO ext_editor_history
             (layout_id, previous_version, next_version, change_summary, changed_by_identity)
           VALUES ($1,NULL,$2,$3,$4)`,
          [layout.id, version, summary, session.identityId],
        );
        await recordEvent(client, { entityType: "layout", layoutId: layout.id, eventType: "layout_created", summary, payload: { layout_key: layoutKey, version, token_id: tokenId }, key, fp, identityId: session.identityId });
        return { layout, target: layout.id, response: { layout }, statusCode: 201 };
      },
    });
  }

  async function reviseLayout(req, res, id) {
    const session = await guard(req, res, "visual_editor.write", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_layout_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const layoutData = jsonValue(parsed.value.layout_data);
    const summary = text(parsed.value.change_summary, 10, 1000);
    const tokenId = parsed.value.token_id === undefined ? undefined : (parsed.value.token_id === null || parsed.value.token_id === "" ? null : String(parsed.value.token_id));
    if (!layoutData || !summary) return json(res, 400, { error: "invalid_revision_fields" });
    if (tokenId !== undefined && tokenId !== null && !UUID.test(tokenId)) return json(res, 400, { error: "invalid_token_id" });
    const fp = fingerprint({ op: "layout_revision", id, layoutData, tokenId: tokenId === undefined ? "same" : tokenId, summary });
    return mutate(res, {
      session, key, fp, action: "visual_layout_revision_create",
      replay: async (client, event) => ({ layout: (await client.query("SELECT * FROM ext_visual_layouts WHERE id=$1", [event.payload.revision_id])).rows[0] }),
      work: async (client) => {
        const base = await layoutById(client, id, { lock: true });
        if (!base) return { error: "layout_not_found", status: 404 };
        const nextTokenId = tokenId === undefined ? base.token_id : tokenId;
        if (nextTokenId && !(await tokenById(client, nextTokenId))) return { error: "token_not_found", status: 404 };
        const max = await client.query(`SELECT COALESCE(MAX(version),0)::int AS version FROM ext_visual_layouts WHERE layout_key=$1 AND origin='ext12_canonica'`, [base.layout_key]);
        const version = Number(max.rows[0]?.version || 0) + 1;
        const previewUrl = `/admin/visual?preview=${base.layout_key}-${version}`;
        const inserted = await client.query(
          `INSERT INTO ext_visual_layouts
             (layout_key, layout_data, token_id, version, status, preview_url,
              created_by_identity, origin, idempotency_key, request_fingerprint)
           VALUES ($1,$2,$3,$4,'rascunho',$5,$6,'ext12_canonica',$7,$8)
           RETURNING *`,
          [base.layout_key, JSON.stringify(layoutData), nextTokenId, version, previewUrl, session.identityId, key, fp],
        );
        const layout = inserted.rows[0];
        await client.query(
          `INSERT INTO ext_editor_history
             (layout_id, previous_version, next_version, change_summary, changed_by_identity)
           VALUES ($1,$2,$3,$4,$5)`,
          [layout.id, base.version, version, summary, session.identityId],
        );
        await recordEvent(client, { entityType: "layout", layoutId: layout.id, eventType: "layout_revision_created", summary, payload: { previous_id: id, revision_id: layout.id, version }, key, fp, identityId: session.identityId });
        return { layout, target: layout.id, response: { layout }, statusCode: 201 };
      },
    });
  }

  async function transitionLayout(req, res, id) {
    const session = await guard(req, res, "visual_editor.review", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_layout_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const next = text(parsed.value.status, 5, 30);
    const note = text(parsed.value.approval_note, 10, 1000) || text(parsed.value.justification, 10, 1000);
    if (!next || !STATUS.has(next) || next === "publicado") return json(res, 400, { error: "invalid_status" });
    const fp = fingerprint({ op: "layout_transition", id, next, note: note || null });
    return mutate(res, {
      session, key, fp, action: "visual_layout_transition",
      replay: async (client, event) => ({ layout: (await client.query("SELECT * FROM ext_visual_layouts WHERE id=$1", [event.layout_id])).rows[0] }),
      work: async (client) => {
        const layout = await layoutById(client, id, { lock: true });
        if (!layout) return { error: "layout_not_found", status: 404 };
        if (!(TRANSITIONS[layout.status] || []).includes(next)) return { error: "invalid_transition", status: 409 };
        if (["aprovado", "arquivado", "revertido"].includes(next) && !note) return { error: "justification_required", status: 400 };
        const updated = await client.query(
          `UPDATE ext_visual_layouts
              SET status=$2::ext_editor_status,
                  approved_by_identity = CASE WHEN $2::text='aprovado' THEN $3 ELSE approved_by_identity END,
                  approved_at = CASE WHEN $2::text='aprovado' THEN NOW() ELSE approved_at END,
                  approval_note = CASE WHEN $2::text='aprovado' THEN $4 ELSE approval_note END,
                  updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, next, session.identityId, note],
        );
        await recordEvent(client, { entityType: "layout", layoutId: id, eventType: `layout_${next}`, summary: `Layout visual alterado para ${next}.`, payload: { from: layout.status, to: next, note: note || null }, key, fp, identityId: session.identityId });
        return { layout: updated.rows[0], target: id, response: { layout: updated.rows[0] } };
      },
    });
  }

  async function previewLayout(req, res, id) {
    const session = await guard(req, res, "visual_editor.write", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_layout_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const note = text(parsed.value.preview_note, 5, 1000) || "Prévia interna gerada para revisão humana.";
    const fp = fingerprint({ op: "layout_preview", id, note });
    return mutate(res, {
      session, key, fp, action: "visual_layout_preview",
      replay: async (client, event) => {
        const detail = await layoutDetail(client, event.layout_id);
        return { preview: detail?.preview || null };
      },
      work: async (client) => {
        const layout = await layoutById(client, id, { lock: true });
        if (!layout) return { error: "layout_not_found", status: 404 };
        const token = layout.token_id ? await tokenById(client, layout.token_id) : null;
        const previewUrl = layout.preview_url || `/admin/visual?preview=${id}`;
        const updated = await client.query(`UPDATE ext_visual_layouts SET preview_url=$2, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, previewUrl]);
        const preview = buildPreviewSnapshot({ layout: updated.rows[0], token });
        await recordEvent(client, { entityType: "layout", layoutId: id, eventType: "layout_previewed", summary: note, payload: { preview_url: preview.preview_url, token_id: token?.id || null }, key, fp, identityId: session.identityId });
        return { layout: updated.rows[0], target: id, response: { preview, note: "Prévia interna gerada; nada foi publicado." } };
      },
    });
  }

  async function publishLayout(req, res, id) {
    const session = await guard(req, res, "visual_editor.publish", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_layout_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const note = text(parsed.value.publish_note, 10, 1000);
    if (!note) return json(res, 400, { error: "publish_note_required" });
    const fp = fingerprint({ op: "layout_publish", id, note });
    return mutate(res, {
      session, key, fp, action: "visual_layout_publish",
      replay: async (client, event) => ({ layout: (await client.query("SELECT * FROM ext_visual_layouts WHERE id=$1", [event.layout_id])).rows[0] }),
      work: async (client) => {
        const layout = await layoutById(client, id, { lock: true });
        if (!layout) return { error: "layout_not_found", status: 404 };
        if (layout.status !== "aprovado") return { error: "approval_required", status: 409 };
        const preview = await client.query(`SELECT id FROM ext_visual_editor_events WHERE layout_id=$1 AND event_type='layout_previewed' LIMIT 1`, [id]);
        if (!preview.rows[0]) return { error: "preview_required", status: 409 };
        await client.query(`UPDATE ext_visual_layouts SET is_published=false WHERE origin='ext12_canonica' AND layout_key=$1 AND id<>$2`, [layout.layout_key, id]);
        const updated = await client.query(
          `UPDATE ext_visual_layouts
              SET status='publicado', is_published=true, published_at=NOW(),
                  published_by_identity=$2, publish_note=$3, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, session.identityId, note],
        );
        await recordEvent(client, { entityType: "layout", layoutId: id, eventType: "layout_published", summary: "Layout visual publicado como versão ativa.", payload: { layout_key: layout.layout_key, version: layout.version, publish_note: note }, key, fp, identityId: session.identityId });
        return { layout: updated.rows[0], target: id, response: { layout: updated.rows[0], note: "Publicação canônica registrada; rotas legadas permanecem aposentadas." } };
      },
    });
  }

  async function detailToken(req, res, id) {
    const session = await guard(req, res, "visual_editor.read");
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_token_id" });
    try {
      const detail = await tokenDetail(pool, id);
      return detail ? json(res, 200, detail) : json(res, 404, { error: "token_not_found" });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  async function detailLayout(req, res, id) {
    const session = await guard(req, res, "visual_editor.read");
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_layout_id" });
    try {
      const detail = await layoutDetail(pool, id);
      return detail ? json(res, 200, detail) : json(res, 404, { error: "layout_not_found" });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  async function legacy(req, res, kind) {
    const write = req.method !== "GET" && req.method !== "HEAD";
    const session = await guard(req, res, write ? "visual_editor.write" : "visual_editor.read", { write });
    if (!session) return;
    if (write) {
      return json(res, 410, {
        error: "legacy_writer_retired",
        canonical: kind === "token" ? "/api/ext/visual/tokens" : "/api/ext/visual/layouts",
      });
    }
    try {
      const table = kind === "token" ? "ext_visual_tokens" : "ext_visual_layouts";
      const { rows } = await pool.query(
        `SELECT * FROM ${table}
          WHERE origin='registro_legado'
          ORDER BY created_at DESC LIMIT 200`,
      );
      return json(res, 200, { items: rows, note: "Leitura legada minimizada; escritas foram aposentadas." });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  return {
    handle: async (req, res) => {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      const match = pathname.match(/^\/api\/ext\/visual\/(tokens|layouts)(?:\/([^/]+))?(?:\/(revisions|transition|publish|preview))?$/);
      if (!match) return json(res, 404, { error: "not_found" });
      const entity = match[1];
      const id = match[2];
      const action = match[3];
      if (entity === "tokens") {
        if (!id && req.method === "GET") return listTokens(req, res);
        if (!id && req.method === "POST") return createToken(req, res);
        if (id && !action && req.method === "GET") return detailToken(req, res, id);
        if (id && action === "revisions" && req.method === "POST") return reviseToken(req, res, id);
        if (id && action === "transition" && (req.method === "POST" || req.method === "PATCH")) return transitionToken(req, res, id);
        if (id && action === "publish" && req.method === "POST") return publishToken(req, res, id);
      }
      if (entity === "layouts") {
        if (!id && req.method === "GET") return listLayouts(req, res);
        if (!id && req.method === "POST") return createLayout(req, res);
        if (id && !action && req.method === "GET") return detailLayout(req, res, id);
        if (id && action === "revisions" && req.method === "POST") return reviseLayout(req, res, id);
        if (id && action === "transition" && (req.method === "POST" || req.method === "PATCH")) return transitionLayout(req, res, id);
        if (id && action === "preview" && req.method === "POST") return previewLayout(req, res, id);
        if (id && action === "publish" && req.method === "POST") return publishLayout(req, res, id);
      }
      return json(res, 405, { error: "method_not_allowed" });
    },
    handleLegacyTokens: (req, res) => legacy(req, res, "token"),
    handleLegacyLayouts: (req, res) => legacy(req, res, "layout"),
  };
}
