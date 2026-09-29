import { randomUUID } from 'node:crypto';

// CRM-07 (residual): notas internas dedicadas por oportunidade.
// A borda é a mesma política pessoal já registrada para tarefas, interações,
// visitas e cadências: só o responsável atual (ou o criador enquanto sem
// responsável) lê e escreve. Papel administrativo não é bypass; outro
// comercial recebe 404 (a existência da oportunidade não é revelada); RH
// recebe 403. Nota interna nunca aparece em superfície pública, do cliente ou
// de empresa. Toda mutação audita na mesma transação: falha de auditoria
// injetada reverte a mutação (fail-closed).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 4000;

function parseBody(value) {
  if (typeof value !== 'string') return null;
  const body = value.trim();
  if (body.length < 1 || body.length > MAX_BODY) return null;
  return body;
}

function parseExpectedVersion(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function parsePage(url) {
  const rawLimit = Number(url?.searchParams?.get('limit') || 25);
  const rawOffset = Number(url?.searchParams?.get('offset') || 0);
  if (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 100 || !Number.isSafeInteger(rawOffset) || rawOffset < 0) return null;
  return { limit: rawLimit, offset: rawOffset };
}

export function createCrmNoteApi(ctx) {
  async function sessionForCommercial(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) { ctx.json(res, 401, { error: 'admin_session_required' }); return null; }
    if (!['comercial', 'admin', 'marcelo', 'ti'].includes(session.role)) {
      ctx.json(res, 403, { error: 'commercial_role_required' }); return null;
    }
    return session;
  }

  async function ownerFor(client, opportunityId, identityId) {
    const result = await client.query(
      `SELECT id FROM crm_opportunities
        WHERE id=$1 AND (responsible_id=$2 OR (responsible_id IS NULL AND created_by_id=$2))
        FOR SHARE`,
      [opportunityId, identityId],
    );
    return result.rows[0] || null;
  }

  // Mutação confirmada somente com a trilha de auditoria gravada na mesma
  // transação — sem try/catch engolindo a falha.
  async function audit(client, session, action, target) {
    await client.query(
      "INSERT INTO auth_access_audit (actor_kind,actor_id,action,target,result,detail_category) VALUES ('staff',$1,$2,$3,'allowed','none')",
      [session.identityId, action, target],
    );
  }

  async function readMutation(req, res) {
    try {
      const body = await ctx.readJson(req, 64 * 1024);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
      return body;
    } catch {
      return null;
    }
  }

  async function list(req, res, session, opportunityId, url) {
    const page = parsePage(url);
    if (!page) return ctx.json(res, 400, { error: 'invalid_pagination' });
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const owner = await ownerFor(client, opportunityId, session.identityId);
      if (!owner) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'opportunity_not_found' });
      }
      const [countResult, notesResult] = await Promise.all([
        client.query('SELECT count(*)::int AS total FROM crm_opportunity_notes WHERE opportunity_id=$1 AND deleted_at IS NULL', [opportunityId]),
        client.query(
          `SELECT n.id,n.body,n.version,n.created_at,n.updated_at,n.edited_at,
                  a.display_name AS author_name, a.email AS author_email
             FROM crm_opportunity_notes n
             JOIN auth_identities a ON a.id = n.author_id
            WHERE n.opportunity_id=$1 AND n.deleted_at IS NULL
            ORDER BY n.created_at DESC, n.id DESC
            LIMIT $2 OFFSET $3`,
          [opportunityId, page.limit, page.offset],
        ),
      ]);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 200, {
        notes: notesResult.rows,
        total: countResult.rows[0].total,
        limit: page.limit,
        offset: page.offset,
      }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_notes_unavailable' });
    } finally { client?.release(); }
  }

  async function create(req, res, session, opportunityId, body) {
    const noteBody = parseBody(body.body);
    if (!noteBody) return ctx.json(res, 400, { error: 'invalid_note_body' });
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const owner = await ownerFor(client, opportunityId, session.identityId);
      if (!owner) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'opportunity_not_found' });
      }
      const id = randomUUID();
      const result = await client.query(
        `INSERT INTO crm_opportunity_notes (id,opportunity_id,author_id,body)
         VALUES ($1,$2,$3,$4)
         RETURNING id,body,version,created_at,updated_at,edited_at,author_id`,
        [id, opportunityId, session.identityId, noteBody],
      );
      const note = result.rows[0];
      const named = await client.query('SELECT display_name,email FROM auth_identities WHERE id=$1', [note.author_id]);
      note.author_name = named.rows[0]?.display_name || null;
      note.author_email = named.rows[0]?.email || null;
      delete note.author_id;
      await audit(client, session, 'crm_note_create', id);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 201, { note }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_notes_unavailable' });
    } finally { client?.release(); }
  }

  async function update(req, res, session, opportunityId, noteId, body) {
    const noteBody = parseBody(body.body);
    if (!noteBody) return ctx.json(res, 400, { error: 'invalid_note_body' });
    const expectedVersion = parseExpectedVersion(body.expected_version);
    if (!expectedVersion) return ctx.json(res, 400, { error: 'expected_version_required' });
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const owner = await ownerFor(client, opportunityId, session.identityId);
      if (!owner) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'opportunity_not_found' });
      }
      const current = await client.query(
        `SELECT id,author_id,version FROM crm_opportunity_notes
          WHERE id=$1 AND opportunity_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [noteId, opportunityId],
      );
      const note = current.rows[0];
      if (!note) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'note_not_found' });
      }
      // Só quem escreveu edita a própria nota: nem o responsável pela
      // oportunidade reescreve palavra de outro autor.
      if (note.author_id !== session.identityId) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 403, { error: 'note_author_required' });
      }
      if (note.version !== expectedVersion) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'note_version_conflict' });
      }
      const result = await client.query(
        `UPDATE crm_opportunity_notes
            SET body=$3, updated_at=NOW(), edited_at=NOW()
          WHERE id=$1 AND opportunity_id=$2
          RETURNING id,body,version,created_at,updated_at,edited_at`,
        [noteId, opportunityId, noteBody],
      );
      const updated = result.rows[0];
      const named = await client.query('SELECT display_name,email FROM auth_identities WHERE id=$1', [note.author_id]);
      updated.author_name = named.rows[0]?.display_name || null;
      updated.author_email = named.rows[0]?.email || null;
      await audit(client, session, 'crm_note_update', noteId);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 200, { note: updated }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_notes_unavailable' });
    } finally { client?.release(); }
  }

  async function remove(req, res, session, opportunityId, noteId, body) {
    const expectedVersion = parseExpectedVersion(body.expected_version);
    if (!expectedVersion) return ctx.json(res, 400, { error: 'expected_version_required' });
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const owner = await ownerFor(client, opportunityId, session.identityId);
      if (!owner) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'opportunity_not_found' });
      }
      const current = await client.query(
        `SELECT id,author_id,version FROM crm_opportunity_notes
          WHERE id=$1 AND opportunity_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [noteId, opportunityId],
      );
      const note = current.rows[0];
      if (!note) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'note_not_found' });
      }
      if (note.author_id !== session.identityId) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 403, { error: 'note_author_required' });
      }
      if (note.version !== expectedVersion) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'note_version_conflict' });
      }
      await client.query(
        `UPDATE crm_opportunity_notes
            SET deleted_at=NOW(), deleted_by_id=$2, updated_at=NOW()
          WHERE id=$1`,
        [noteId, session.identityId],
      );
      await audit(client, session, 'crm_note_delete', noteId);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 200, { deleted: true, id: noteId }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_notes_unavailable' });
    } finally { client?.release(); }
  }

  return async function handleNotes(req, res, opportunityId, noteId = null, url = null) {
    if (!UUID.test(opportunityId) || (noteId && !UUID.test(noteId))) {
      return ctx.json(res, 400, { error: 'invalid_id' });
    }
    const allowed = noteId ? ['PATCH', 'DELETE'] : ['GET', 'POST'];
    if (!allowed.includes(req.method)) {
      return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: allowed.join(', ') });
    }
    const session = await sessionForCommercial(req, res); if (!session) return;
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    let body = null;
    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
      body = await readMutation(req, res);
      if (!body) {
        return ctx.json(res, 400, { error: 'invalid_request' });
      }
    }
    if (noteId && req.method === 'PATCH') return update(req, res, session, opportunityId, noteId, body);
    if (noteId && req.method === 'DELETE') return remove(req, res, session, opportunityId, noteId, body);
    if (req.method === 'GET') return list(req, res, session, opportunityId, url);
    return create(req, res, session, opportunityId, body);
  };
}
