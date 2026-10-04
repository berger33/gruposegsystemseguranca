// EXT-08 — base de conhecimento e procedimentos operacionais canônicos.
// Procedimentos versionados, busca por permissão, controle de acesso e ciência.
import { createHash } from "node:crypto";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_REGEX = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STAFF_ROLES = ["admin", "ti", "marcelo", "rh", "operacao", "supervisor", "comercial", "financeiro"];
const EDIT_ROLES = ["admin", "ti", "marcelo", "rh", "operacao"];
const PUBLISH_ROLES = ["admin", "ti", "marcelo"];

export const KB_TRANSITIONS = Object.freeze({
  rascunho: ["em_revisao"],
  em_revisao: ["rascunho", "aprovado"],
  aprovado: ["publicado", "rascunho"],
  publicado: ["arquivado"],
  arquivado: ["rascunho"],
});

const fp = (value) =>
  createHash("sha256").update(JSON.stringify(value, Object.keys(value || {}).sort())).digest("hex");

const text = (v, min, max) =>
  typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null;

export function createExtKnowledgeApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    });
    res.end(JSON.stringify(body));
  };

  const getRole = (s) => String(s?.role || s?.userRole || "").toLowerCase();

  async function guard(req, res, { write = false, requiredRoles = STAFF_ROLES } = {}) {
    let s = null;
    try {
      s = await requireSession(req);
    } catch {}
    if (!s || !s.identityId || !UUID_REGEX.test(String(s.identityId))) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
    const role = getRole(s);
    if (!requiredRoles.includes(role)) {
      json(res, 403, { error: "forbidden_role" });
      return null;
    }
    if (write && !sameOrigin(req)) {
      json(res, 403, { error: "origin_forbidden" });
      return null;
    }
    return s;
  }

  async function parseBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) return { large: true };
      chunks.push(chunk);
    }
    if (!chunks.length) return { value: {} };
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      return !parsed || typeof parsed !== "object" || Array.isArray(parsed)
        ? { invalid: true }
        : { value: parsed };
    } catch {
      return { invalid: true };
    }
  }

  function requireKey(req, res) {
    const k = String(req.headers["idempotency-key"] || "").trim();
    if (!KEY_REGEX.test(k)) {
      json(res, 400, { error: "idempotency_key_required" });
      return null;
    }
    return k;
  }

  async function recordEvent(client, { kbId, eventType, summary, payload, idempotencyKey, requestFingerprint, identityId }) {
    await client.query(
      `INSERT INTO ext_knowledge_events
         (kb_id, event_type, summary, payload, idempotency_key, request_fingerprint, created_by_identity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [kbId, eventType, summary, JSON.stringify(payload || {}), idempotencyKey, requestFingerprint, identityId]
    );
  }

  async function executeMutation(res, { session, idempotencyKey, requestFingerprint, auditAction, replay, work }) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      // Verificar replay de evento idempotente
      const existingEvent = await client.query(
        `SELECT * FROM ext_knowledge_events
          WHERE created_by_identity = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [session.identityId, idempotencyKey]
      );

      if (existingEvent.rows[0]) {
        if (existingEvent.rows[0].request_fingerprint !== requestFingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        const replayResult = await replay(client, existingEvent.rows[0]);
        await client.query("COMMIT");
        return json(res, 200, { ...replayResult, replayed: true });
      }

      const outcome = await work(client);
      if (outcome.deny) {
        await client.query("ROLLBACK");
        return json(res, outcome.deny.status, outcome.deny.body);
      }

      // Auditoria na mesma transação
      try {
        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1, $2, $3, $4)`,
          [auditAction, session.identityId, outcome.target, JSON.stringify(outcome.meta || {})]
        );
      } catch (auditErr) {
        await client.query("ROLLBACK");
        console.error("EXT-08 audit unavailable", auditErr?.message || auditErr);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, outcome.status, outcome.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505" && /idempotency/i.test(String(error.constraint || error.detail || ""))) {
        try {
          const rechecked = await client.query(
            `SELECT * FROM ext_knowledge_events WHERE created_by_identity = $1 AND idempotency_key = $2`,
            [session.identityId, idempotencyKey]
          );
          if (rechecked.rows[0]) {
            if (rechecked.rows[0].request_fingerprint !== requestFingerprint) {
              return json(res, 409, { error: "idempotency_key_reused" });
            }
            return json(res, 200, { ...(await replay(client, rechecked.rows[0])), replayed: true });
          }
        } catch {}
      }
      console.error("EXT-08 mutation error", error?.message || error);
      return json(res, 503, { error: "knowledge_mutation_failed" });
    } finally {
      client?.release();
    }
  }

  // --- Handlers ---

  async function handleListArticles(req, res, session) {
    const role = getRole(session);
    const url = new URL(req.url, "http://localhost");
    const category = text(url.searchParams.get("category"), 1, 100);
    const statusParam = text(url.searchParams.get("status"), 1, 50);
    const qParam = text(url.searchParams.get("q"), 1, 100);
    const tagParam = text(url.searchParams.get("tag"), 1, 50);

    const conditions = [];
    const params = [];

    // Controle de acesso: usuários comuns só veem procedimentos publicados com role matching
    const canSeeDrafts = EDIT_ROLES.includes(role);
    if (!canSeeDrafts) {
      conditions.push(`status = 'publicado' AND is_published = true`);
      conditions.push(`(access_roles = '{}' OR access_roles IS NULL OR $${params.length + 1} = ANY(access_roles))`);
      params.push(role);
    } else if (statusParam) {
      conditions.push(`status = $${params.length + 1}`);
      params.push(statusParam);
    }

    if (category) {
      conditions.push(`category = $${params.length + 1}`);
      params.push(category);
    }

    if (tagParam) {
      conditions.push(`$${params.length + 1} = ANY(tags)`);
      params.push(tagParam);
    }

    if (qParam) {
      conditions.push(`(title ILIKE $${params.length + 1} OR content ILIKE $${params.length + 1} OR summary ILIKE $${params.length + 1} OR slug ILIKE $${params.length + 1})`);
      params.push(`%${qParam}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `
      SELECT id, slug, title, summary, category, status, version, is_published,
             published_at, tags, access_roles, created_at, updated_at,
             (SELECT count(*)::int FROM ext_knowledge_acknowledgments ack WHERE ack.kb_id = ext_knowledge_base.id) AS ack_count,
             EXISTS(SELECT 1 FROM ext_knowledge_acknowledgments ack WHERE ack.kb_id = ext_knowledge_base.id AND ack.user_identity = $${params.length + 1}) AS user_acknowledged
        FROM ext_knowledge_base
       ${whereClause}
       ORDER BY category ASC, title ASC, version DESC
       LIMIT 200
    `;
    params.push(session.identityId);

    try {
      const { rows } = await pool.query(query, params);
      return json(res, 200, {
        items: rows,
        count: rows.length,
        criteria: "Procedimentos versionados, busca, acesso e ciência vinculada",
      });
    } catch (err) {
      console.error("EXT-08 list error", err?.message || err);
      return json(res, 500, { error: "database_error" });
    }
  }

  async function handleGetArticleDetail(req, res, session, id) {
    if (!UUID_REGEX.test(id)) return json(res, 400, { error: "invalid_id" });
    const role = getRole(session);
    try {
      const { rows } = await pool.query(
        `SELECT kb.*,
                auth.display_name AS creator_name,
                rev.display_name AS reviewer_name,
                app.display_name AS approver_name,
                (SELECT count(*)::int FROM ext_knowledge_acknowledgments ack WHERE ack.kb_id = kb.id) AS ack_count,
                EXISTS(SELECT 1 FROM ext_knowledge_acknowledgments ack WHERE ack.kb_id = kb.id AND ack.user_identity = $2) AS user_acknowledged
           FROM ext_knowledge_base kb
           LEFT JOIN auth_identities auth ON auth.id = kb.created_by_identity
           LEFT JOIN auth_identities rev ON rev.id = kb.reviewed_by_identity
           LEFT JOIN auth_identities app ON app.id = kb.approved_by_identity
          WHERE kb.id = $1`,
        [id, session.identityId]
      );

      const article = rows[0];
      if (!article) return json(res, 404, { error: "article_not_found" });

      // Verificação de acesso
      const canSeeDraft = EDIT_ROLES.includes(role) || article.created_by_identity === session.identityId;
      if (article.status !== "publicado" && !canSeeDraft) {
        return json(res, 403, { error: "draft_not_accessible" });
      }
      if (article.status === "publicado" && article.access_roles?.length > 0 && !article.access_roles.includes(role) && !EDIT_ROLES.includes(role)) {
        return json(res, 403, { error: "forbidden_by_role_scope" });
      }

      // Histórico de versões
      const { rows: history } = await pool.query(
        `SELECT h.*, auth.display_name AS changer_name
           FROM ext_knowledge_base_history h
           LEFT JOIN auth_identities auth ON auth.id = h.changed_by_identity
          WHERE h.kb_id = $1
          ORDER BY h.created_at DESC`,
        [id]
      );

      // Outras versões do mesmo slug
      const { rows: versions } = await pool.query(
        `SELECT id, version, status, is_published, published_at, created_at
           FROM ext_knowledge_base
          WHERE slug = $1
          ORDER BY version DESC`,
        [article.slug]
      );

      return json(res, 200, {
        article,
        history,
        versions,
      });
    } catch (err) {
      console.error("EXT-08 detail error", err?.message || err);
      return json(res, 500, { error: "database_error" });
    }
  }

  async function handleCreateArticle(req, res, session) {
    const k = requireKey(req, res);
    if (!k) return;
    const bodyResult = await parseBody(req);
    if (bodyResult.invalid || bodyResult.large) {
      return json(res, bodyResult.large ? 413 : 400, { error: bodyResult.large ? "body_too_large" : "invalid_body" });
    }
    const b = bodyResult.value;

    const slug = text(b.slug, 3, 200);
    const title = text(b.title, 5, 200);
    const content = text(b.content, 50, 20000);
    const category = text(b.category, 3, 100);
    const summary = b.summary ? text(b.summary, 10, 500) : null;
    const tags = Array.isArray(b.tags) ? b.tags.map(t => String(t).trim()).filter(t => t.length > 0 && t.length <= 50) : [];
    const accessRoles = Array.isArray(b.access_roles) ? b.access_roles.map(r => String(r).trim().toLowerCase()).filter(r => STAFF_ROLES.includes(r)) : [];

    if (!slug || !SLUG_REGEX.test(slug)) return json(res, 400, { error: "invalid_slug" });
    if (!title) return json(res, 400, { error: "invalid_title" });
    if (!content) return json(res, 400, { error: "invalid_content" });
    if (!category) return json(res, 400, { error: "invalid_category" });
    if (b.summary && !summary) return json(res, 400, { error: "invalid_summary" });

    const requestFingerprint = fp({ op: "create", slug, title, content, category, summary, tags, accessRoles });

    return executeMutation(res, {
      session,
      idempotencyKey: k,
      requestFingerprint,
      auditAction: "knowledge_create",
      replay: async (client, event) => {
        const row = (await client.query(`SELECT * FROM ext_knowledge_base WHERE id = $1`, [event.kb_id])).rows[0];
        return { article: row };
      },
      work: async (client) => {
        // Obter próxima versão para o slug
        const maxRes = await client.query(
          `SELECT COALESCE(MAX(version), 0) AS max_v FROM ext_knowledge_base WHERE slug = $1`,
          [slug]
        );
        const nextVersion = Number(maxRes.rows[0].max_v) + 1;

        const insertRes = await client.query(
          `INSERT INTO ext_knowledge_base
             (slug, title, summary, content, category, status, version, is_published, tags, access_roles, created_by_identity, origin)
           VALUES ($1, $2, $3, $4, $5, 'rascunho', $6, false, $7, $8, $9, 'ext08_canonica')
           RETURNING *`,
          [slug, title, summary, content, category, nextVersion, tags, accessRoles, session.identityId]
        );
        const created = insertRes.rows[0];

        await client.query(
          `INSERT INTO ext_knowledge_base_history
             (kb_id, previous_version, next_version, change_summary, changed_by_identity)
           VALUES ($1, NULL, $2, $3, $4)`,
          [created.id, nextVersion, "Criação inicial de procedimento operacional", session.identityId]
        );

        await recordEvent(client, {
          kbId: created.id,
          eventType: "artigo_criado",
          summary: `Procedimento '${title}' criado v${nextVersion}.`,
          payload: { slug, version: nextVersion, category },
          idempotencyKey: k,
          requestFingerprint,
          identityId: session.identityId,
        });

        return {
          status: 201,
          body: { article: created },
          target: created.id,
          meta: { slug, version: nextVersion },
        };
      },
    });
  }

  async function handleUpdateArticle(req, res, session, id) {
    if (!UUID_REGEX.test(id)) return json(res, 400, { error: "invalid_id" });
    const k = requireKey(req, res);
    if (!k) return;
    const bodyResult = await parseBody(req);
    if (bodyResult.invalid || bodyResult.large) {
      return json(res, bodyResult.large ? 413 : 400, { error: bodyResult.large ? "body_too_large" : "invalid_body" });
    }
    const b = bodyResult.value;

    const title = b.title !== undefined ? text(b.title, 5, 200) : null;
    const content = b.content !== undefined ? text(b.content, 50, 20000) : null;
    const category = b.category !== undefined ? text(b.category, 3, 100) : null;
    const summary = b.summary !== undefined ? (b.summary ? text(b.summary, 10, 500) : null) : undefined;
    const changeSummary = text(b.change_summary || "Atualização de conteúdo", 5, 1000);
    const tags = Array.isArray(b.tags) ? b.tags.map(t => String(t).trim()).filter(t => t.length > 0 && t.length <= 50) : undefined;
    const accessRoles = Array.isArray(b.access_roles) ? b.access_roles.map(r => String(r).trim().toLowerCase()).filter(r => STAFF_ROLES.includes(r)) : undefined;

    if (b.title !== undefined && !title) return json(res, 400, { error: "invalid_title" });
    if (b.content !== undefined && !content) return json(res, 400, { error: "invalid_content" });
    if (b.category !== undefined && !category) return json(res, 400, { error: "invalid_category" });
    if (b.summary && !summary) return json(res, 400, { error: "invalid_summary" });
    if (!changeSummary) return json(res, 400, { error: "change_summary_required" });

    const requestFingerprint = fp({ op: "update", id, title, content, category, summary, tags, accessRoles, changeSummary });

    return executeMutation(res, {
      session,
      idempotencyKey: k,
      requestFingerprint,
      auditAction: "knowledge_update",
      replay: async (client, event) => {
        const row = (await client.query(`SELECT * FROM ext_knowledge_base WHERE id = $1`, [event.kb_id])).rows[0];
        return { article: row };
      },
      work: async (client) => {
        const existing = (await client.query(`SELECT * FROM ext_knowledge_base WHERE id = $1 FOR UPDATE`, [id])).rows[0];
        if (!existing) return { deny: { status: 404, body: { error: "article_not_found" } } };

        // Se o artigo já está publicado ou arquivado, edição de conteúdo DEVE gerar nova versão imutável
        if (existing.status === "publicado" || existing.status === "arquivado") {
          const maxRes = await client.query(
            `SELECT COALESCE(MAX(version), 0) AS max_v FROM ext_knowledge_base WHERE slug = $1`,
            [existing.slug]
          );
          const nextVersion = Number(maxRes.rows[0].max_v) + 1;

          const newTitle = title || existing.title;
          const newContent = content || existing.content;
          const newCategory = category || existing.category;
          const newSummary = summary !== undefined ? summary : existing.summary;
          const newTags = tags !== undefined ? tags : existing.tags;
          const newAccessRoles = accessRoles !== undefined ? accessRoles : existing.access_roles;

          const insertRes = await client.query(
            `INSERT INTO ext_knowledge_base
               (slug, title, summary, content, category, status, version, is_published, tags, access_roles, created_by_identity, origin)
             VALUES ($1, $2, $3, $4, $5, 'rascunho', $6, false, $7, $8, $9, 'ext08_canonica')
             RETURNING *`,
            [existing.slug, newTitle, newSummary, newContent, newCategory, nextVersion, newTags, newAccessRoles, session.identityId]
          );
          const newArticle = insertRes.rows[0];

          await client.query(
            `INSERT INTO ext_knowledge_base_history
               (kb_id, previous_version, next_version, change_summary, changed_by_identity)
             VALUES ($1, $2, $3, $4, $5)`,
            [newArticle.id, existing.version, nextVersion, changeSummary, session.identityId]
          );

          await recordEvent(client, {
            kbId: newArticle.id,
            eventType: "nova_versao_criada",
            summary: `Nova versão v${nextVersion} criada a partir de v${existing.version}: ${changeSummary}`,
            payload: { previousVersion: existing.version, newVersion: nextVersion },
            idempotencyKey: k,
            requestFingerprint,
            identityId: session.identityId,
          });

          return {
            status: 201,
            body: { article: newArticle, isNewVersion: true },
            target: newArticle.id,
            meta: { slug: existing.slug, version: nextVersion, previousVersion: existing.version },
          };
        }

        // Se é rascunho ou em revisão, atualiza no mesmo registro
        const updated = (await client.query(
          `UPDATE ext_knowledge_base
              SET title = COALESCE($2, title),
                  content = COALESCE($3, content),
                  category = COALESCE($4, category),
                  summary = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE summary END,
                  tags = COALESCE($6, tags),
                  access_roles = COALESCE($7, access_roles),
                  updated_at = NOW()
            WHERE id = $1
            RETURNING *`,
          [id, title, content, category, summary, tags, accessRoles]
        )).rows[0];

        await client.query(
          `INSERT INTO ext_knowledge_base_history
             (kb_id, previous_version, next_version, change_summary, changed_by_identity)
           VALUES ($1, $2, $2, $3, $4)`,
          [id, existing.version, changeSummary, session.identityId]
        );

        await recordEvent(client, {
          kbId: id,
          eventType: "artigo_atualizado",
          summary: `Procedimento v${existing.version} atualizado: ${changeSummary}`,
          payload: { version: existing.version },
          idempotencyKey: k,
          requestFingerprint,
          identityId: session.identityId,
        });

        return {
          status: 200,
          body: { article: updated, isNewVersion: false },
          target: id,
          meta: { slug: existing.slug, version: existing.version },
        };
      },
    });
  }

  async function handleTransitionArticle(req, res, session, id) {
    if (!UUID_REGEX.test(id)) return json(res, 400, { error: "invalid_id" });
    const k = requireKey(req, res);
    if (!k) return;
    const bodyResult = await parseBody(req);
    if (bodyResult.invalid || bodyResult.large) {
      return json(res, bodyResult.large ? 413 : 400, { error: bodyResult.large ? "body_too_large" : "invalid_body" });
    }
    const b = bodyResult.value;
    const nextStatus = text(b.status, 3, 50);
    const notes = b.notes ? text(b.notes, 5, 1000) : null;
    const reason = b.reason ? text(b.reason, 5, 1000) : null;
    const role = getRole(session);

    if (!nextStatus || !["rascunho", "em_revisao", "aprovado", "publicado", "arquivado"].includes(nextStatus)) {
      return json(res, 400, { error: "invalid_target_status" });
    }

    if (nextStatus === "publicado" && !PUBLISH_ROLES.includes(role)) {
      return json(res, 403, { error: "publish_permission_required" });
    }

    if (nextStatus === "arquivado" && !reason) {
      return json(res, 400, { error: "archive_reason_required" });
    }

    const requestFingerprint = fp({ op: "transition", id, nextStatus, notes, reason });

    return executeMutation(res, {
      session,
      idempotencyKey: k,
      requestFingerprint,
      auditAction: `knowledge_transition_${nextStatus}`,
      replay: async (client, event) => {
        const row = (await client.query(`SELECT * FROM ext_knowledge_base WHERE id = $1`, [event.kb_id])).rows[0];
        return { article: row };
      },
      work: async (client) => {
        const existing = (await client.query(`SELECT * FROM ext_knowledge_base WHERE id = $1 FOR UPDATE`, [id])).rows[0];
        if (!existing) return { deny: { status: 404, body: { error: "article_not_found" } } };

        const allowedNext = KB_TRANSITIONS[existing.status] || [];
        if (!allowedNext.includes(nextStatus)) {
          return {
            deny: {
              status: 409,
              body: {
                error: "invalid_status_transition",
                current_status: existing.status,
                target_status: nextStatus,
                allowed: allowedNext,
              },
            },
          };
        }

        let updated;
        if (nextStatus === "em_revisao") {
          updated = (await client.query(
            `UPDATE ext_knowledge_base
                SET status = 'em_revisao', updated_at = NOW()
              WHERE id = $1 RETURNING *`,
            [id]
          )).rows[0];
        } else if (nextStatus === "aprovado") {
          updated = (await client.query(
            `UPDATE ext_knowledge_base
                SET status = 'aprovado',
                    reviewed_by_identity = $2,
                    reviewed_at = NOW(),
                    review_notes = $3,
                    approved_by_identity = $2,
                    updated_at = NOW()
              WHERE id = $1 RETURNING *`,
            [id, session.identityId, notes || "Aprovado tecnicamente"]
          )).rows[0];
        } else if (nextStatus === "publicado") {
          // Publicação formal: pode despublicar versões anteriores do mesmo slug
          await client.query(
            `UPDATE ext_knowledge_base
                SET is_published = false, status = 'arquivado', archived_at = NOW(), archive_reason = 'Substituído por nova versão publicada'
              WHERE slug = $1 AND id <> $2 AND status = 'publicado'`,
            [existing.slug, id]
          );

          updated = (await client.query(
            `UPDATE ext_knowledge_base
                SET status = 'publicado',
                    is_published = true,
                    published_at = NOW(),
                    published_by_identity = $2,
                    updated_at = NOW()
              WHERE id = $1 RETURNING *`,
            [id, session.identityId]
          )).rows[0];
        } else if (nextStatus === "arquivado") {
          updated = (await client.query(
            `UPDATE ext_knowledge_base
                SET status = 'arquivado',
                    is_published = false,
                    archived_at = NOW(),
                    archived_by_identity = $2,
                    archive_reason = $3,
                    updated_at = NOW()
              WHERE id = $1 RETURNING *`,
            [id, session.identityId, reason]
          )).rows[0];
        } else if (nextStatus === "rascunho") {
          updated = (await client.query(
            `UPDATE ext_knowledge_base
                SET status = 'rascunho', is_published = false, updated_at = NOW()
              WHERE id = $1 RETURNING *`,
            [id]
          )).rows[0];
        }

        await client.query(
          `INSERT INTO ext_knowledge_base_history
             (kb_id, previous_version, next_version, change_summary, changed_by_identity)
           VALUES ($1, $2, $2, $3, $4)`,
          [id, existing.version, `Transição de ${existing.status} para ${nextStatus}${notes ? `: ${notes}` : ""}`, session.identityId]
        );

        await recordEvent(client, {
          kbId: id,
          eventType: `transicao_${nextStatus}`,
          summary: `Procedimento v${existing.version} transicionado de ${existing.status} para ${nextStatus}.`,
          payload: { previousStatus: existing.status, nextStatus, notes, reason },
          idempotencyKey: k,
          requestFingerprint,
          identityId: session.identityId,
        });

        return {
          status: 200,
          body: { article: updated },
          target: id,
          meta: { previousStatus: existing.status, nextStatus },
        };
      },
    });
  }

  async function handleAcknowledgeArticle(req, res, session, id) {
    if (!UUID_REGEX.test(id)) return json(res, 400, { error: "invalid_id" });
    const k = requireKey(req, res);
    if (!k) return;
    const bodyResult = await parseBody(req);
    if (bodyResult.invalid || bodyResult.large) {
      return json(res, bodyResult.large ? 413 : 400, { error: bodyResult.large ? "body_too_large" : "invalid_body" });
    }
    const b = bodyResult.value;
    const notes = b.notes ? text(b.notes, 3, 500) : null;

    const requestFingerprint = fp({ op: "acknowledge", id, notes, user: session.identityId });

    return executeMutation(res, {
      session,
      idempotencyKey: k,
      requestFingerprint,
      auditAction: "knowledge_acknowledge",
      replay: async (client) => {
        const row = (await client.query(
          `SELECT * FROM ext_knowledge_acknowledgments WHERE kb_id = $1 AND user_identity = $2`,
          [id, session.identityId]
        )).rows[0];
        return { acknowledgment: row };
      },
      work: async (client) => {
        const article = (await client.query(`SELECT * FROM ext_knowledge_base WHERE id = $1`, [id])).rows[0];
        if (!article) return { deny: { status: 404, body: { error: "article_not_found" } } };
        if (article.status !== "publicado" || !article.is_published) {
          return { deny: { status: 409, body: { error: "article_not_published_for_acknowledgment" } } };
        }

        // Inserir ou recuperar ciência existente para esta versão
        const insertRes = await client.query(
          `INSERT INTO ext_knowledge_acknowledgments
             (kb_id, user_identity, notes, idempotency_key, request_fingerprint, source)
           VALUES ($1, $2, $3, $4, $5, 'jornada_canonica')
           ON CONFLICT (kb_id, user_identity) DO UPDATE
             SET notes = EXCLUDED.notes, acknowledged_at = NOW()
           RETURNING *`,
          [id, session.identityId, notes, k, requestFingerprint]
        );
        const ack = insertRes.rows[0];

        await recordEvent(client, {
          kbId: id,
          eventType: "ciencia_registrada",
          summary: `Ciência confirmada por colaborador na versão v${article.version}.`,
          payload: { version: article.version, ackId: ack.id },
          idempotencyKey: k,
          requestFingerprint,
          identityId: session.identityId,
        });

        return {
          status: 200,
          body: { acknowledgment: ack, articleTitle: article.title, version: article.version },
          target: ack.id,
          meta: { kb_id: id, version: article.version },
        };
      },
    });
  }

  async function handleListAcknowledgments(req, res, session, id) {
    if (!UUID_REGEX.test(id)) return json(res, 400, { error: "invalid_id" });
    const role = getRole(session);
    if (!EDIT_ROLES.includes(role)) {
      return json(res, 403, { error: "forbidden_role" });
    }

    try {
      const { rows } = await pool.query(
        `SELECT ack.id, ack.kb_id, ack.user_identity, ack.acknowledged_at, ack.notes, ack.source,
                auth.display_name AS user_name,
                prof.role AS user_role
           FROM ext_knowledge_acknowledgments ack
           LEFT JOIN auth_identities auth ON auth.id = ack.user_identity
           LEFT JOIN auth_staff_profiles prof ON prof.identity_id = ack.user_identity
          WHERE ack.kb_id = $1
          ORDER BY ack.acknowledged_at DESC
          LIMIT 200`,
        [id]
      );
      return json(res, 200, { items: rows, count: rows.length });
    } catch (err) {
      console.error("EXT-08 acknowledgments list error", err?.message || err);
      return json(res, 500, { error: "database_error" });
    }
  }

  // --- Router Principal ---
  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const session = await guard(req, res, { write: req.method !== "GET" });
    if (!session) return;

    // GET /api/ext/knowledge/articles
    if (url.pathname === "/api/ext/knowledge/articles" && req.method === "GET") {
      return handleListArticles(req, res, session);
    }

    // POST /api/ext/knowledge/articles
    if (url.pathname === "/api/ext/knowledge/articles" && req.method === "POST") {
      const editSession = await guard(req, res, { write: true, requiredRoles: EDIT_ROLES });
      if (!editSession) return;
      return handleCreateArticle(req, res, editSession);
    }

    // GET /api/ext/knowledge/articles/:id
    const detailMatch = url.pathname.match(/^\/api\/ext\/knowledge\/articles\/([0-9a-f-]{36})$/i);
    if (detailMatch && req.method === "GET") {
      return handleGetArticleDetail(req, res, session, detailMatch[1]);
    }

    // PATCH /api/ext/knowledge/articles/:id
    if (detailMatch && req.method === "PATCH") {
      const editSession = await guard(req, res, { write: true, requiredRoles: EDIT_ROLES });
      if (!editSession) return;
      return handleUpdateArticle(req, res, editSession, detailMatch[1]);
    }

    // POST /api/ext/knowledge/articles/:id/transition
    const transitionMatch = url.pathname.match(/^\/api\/ext\/knowledge\/articles\/([0-9a-f-]{36})\/transition$/i);
    if (transitionMatch && req.method === "POST") {
      const editSession = await guard(req, res, { write: true, requiredRoles: EDIT_ROLES });
      if (!editSession) return;
      return handleTransitionArticle(req, res, editSession, transitionMatch[1]);
    }

    // POST /api/ext/knowledge/articles/:id/acknowledge
    const ackMatch = url.pathname.match(/^\/api\/ext\/knowledge\/articles\/([0-9a-f-]{36})\/acknowledge$/i);
    if (ackMatch && req.method === "POST") {
      return handleAcknowledgeArticle(req, res, session, ackMatch[1]);
    }

    // GET /api/ext/knowledge/articles/:id/acknowledgments
    const ackListMatch = url.pathname.match(/^\/api\/ext\/knowledge\/articles\/([0-9a-f-]{36})\/acknowledgments$/i);
    if (ackListMatch && req.method === "GET") {
      return handleListAcknowledgments(req, res, session, ackListMatch[1]);
    }

    return json(res, 404, { error: "knowledge_route_not_found" });
  }

  // --- Rotas Legadas (Compatibilidade + 410 na escrita) ---
  async function handleLegacy(req, res) {
    const session = await guard(req, res, { write: req.method !== "GET" });
    if (!session) return;

    if (req.method === "GET") {
      return handleListArticles(req, res, session);
    }

    // Mutação legada aposentada: responde 410 após as guardas
    return json(res, 410, {
      error: "legacy_knowledge_writer_retired",
      canonical: "/api/ext/knowledge/articles",
    });
  }

  return {
    handle,
    handleLegacy,
    handleListArticles,
    handleGetArticleDetail,
    handleCreateArticle,
    handleUpdateArticle,
    handleTransitionArticle,
    handleAcknowledgeArticle,
    handleListAcknowledgments,
  };
}
