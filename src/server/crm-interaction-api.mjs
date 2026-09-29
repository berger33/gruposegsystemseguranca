import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

// CRM-07 follow-up. The opportunity ownership rule deliberately remains the
// personal rule used by CRM tasks: only its responsible identity, or its
// creator while unassigned, can read it. Team/delegation is a separate policy
// decision and is not inferred from an administrative role.
const ALLOWED_TYPES = new Set(['ligacao', 'reuniao', 'email', 'whatsapp', 'visita', 'nota', 'outro']);
const SAFE_CONTENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain']);
const MAX_PRIVATE_FILE_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_KEY = /^[0-9a-f]{48}$/;

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max + 1) : '';
}
function safeFilename(value) {
  return text(value, 240).replace(/[\r\n\0\\/]/g, '_').trim();
}
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function isFuture(date) {
  return date.getTime() > Date.now() + 5 * 60 * 1000;
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
function decodeContent(value) {
  const base64 = typeof value === 'string' ? value.replace(/\s+/g, '') : '';
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) return null;
  const bytes = Buffer.from(base64, 'base64');
  // Buffer.from is permissive; require canonical standard base64 so a corrupt
  // client payload cannot silently become different bytes.
  if (!bytes.length || bytes.toString('base64') !== base64) return null;
  return bytes;
}

export function createCrmInteractionApi(ctx) {
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
      `SELECT company_id FROM crm_opportunities
        WHERE id=$1 AND (responsible_id=$2 OR (responsible_id IS NULL AND created_by_id=$2))
        FOR SHARE`,
      [opportunityId, identityId],
    );
    return result.rows[0] || null;
  }

  async function validateContact(client, contactId, companyId) {
    if (contactId === null) return null;
    if (!UUID.test(contactId)) return { error: 'invalid_contact_id' };
    const found = await client.query(
      `SELECT id, display_name FROM crm_contacts
        WHERE id=$1 AND company_id=$2 AND status='active'`,
      [contactId, companyId],
    );
    return found.rows[0] || { error: 'contact_not_available' };
  }

  async function audit(client, session, action, target) {
    // Mutation/download success is not acknowledged if the durable audit row
    // cannot be written in the same transaction.
    await client.query(
      "INSERT INTO auth_access_audit (actor_kind,actor_id,action,target,result,detail_category) VALUES ('staff',$1,$2,$3,'allowed','none')",
      [session.identityId, action, target],
    );
  }

  async function readMutation(req, res, max = 8 * 1024) {
    try {
      const body = await ctx.readJson(req, max);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        ctx.json(res, 400, { error: 'invalid_request' }); return null;
      }
      return body;
    } catch {
      ctx.json(res, 400, { error: 'invalid_request' }); return null;
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
      const [countResult, interactionsResult, contactsResult] = await Promise.all([
        client.query('SELECT count(*)::int AS total FROM crm_interactions WHERE opportunity_id=$1 AND deleted_at IS NULL', [opportunityId]),
        client.query(
          `SELECT i.id,i.type,i.title,i.details,i.occurred_at,i.contact_id,i.created_at,i.updated_at,i.version,
                  c.display_name AS contact_name
             FROM crm_interactions i
             LEFT JOIN crm_contacts c ON c.id=i.contact_id
            WHERE i.opportunity_id=$1 AND i.deleted_at IS NULL
            ORDER BY i.occurred_at DESC, i.created_at DESC, i.id DESC
            LIMIT $2 OFFSET $3`,
          [opportunityId, page.limit, page.offset],
        ),
        client.query(
          `SELECT id,display_name FROM crm_contacts
            WHERE company_id=$1 AND status='active'
            ORDER BY is_primary DESC, display_name ASC, id ASC LIMIT 200`,
          [owner.company_id],
        ),
      ]);
      const interactions = interactionsResult.rows;
      const ids = interactions.map(row => row.id);
      const attachmentsByInteraction = new Map(ids.map(id => [id, []]));
      if (ids.length) {
        const attachments = await client.query(
          `SELECT id,interaction_id,original_filename,content_type,size_bytes,created_at
             FROM crm_interaction_attachments
            WHERE interaction_id = ANY($1::uuid[])
            ORDER BY created_at ASC, id ASC`,
          [ids],
        );
        for (const attachment of attachments.rows) attachmentsByInteraction.get(attachment.interaction_id)?.push(attachment);
      }
      for (const interaction of interactions) interaction.attachments = attachmentsByInteraction.get(interaction.id) || [];
      await client.query('COMMIT'); transaction = false;
      const total = countResult.rows[0]?.total || 0;
      const nextOffset = page.offset + interactions.length < total ? page.offset + interactions.length : null;
      return ctx.json(res, 200, {
        interactions,
        contacts: contactsResult.rows,
        pagination: { ...page, total, nextOffset, previousOffset: page.offset > 0 ? Math.max(0, page.offset - page.limit) : null },
      }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_interactions_unavailable' });
    } finally { client?.release(); }
  }

  async function create(req, res, session, opportunityId) {
    const body = await readMutation(req, res); if (!body) return;
    if (['created_by_id', 'company_id', 'opportunity_id', 'version', 'deleted_at', 'deleted_by_id'].some(k => Object.hasOwn(body, k))) {
      return ctx.json(res, 400, { error: 'server_managed_fields' });
    }
    const type = typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';
    const title = text(body.title, 200);
    if (!ALLOWED_TYPES.has(type)) return ctx.json(res, 400, { error: 'invalid_type' });
    if (!title || title.length > 200) return ctx.json(res, 400, { error: 'invalid_title' });
    let details = null;
    if (body.details !== undefined && body.details !== null) {
      details = text(body.details, 5000);
      if (details.length > 5000 || (typeof body.details !== 'string')) return ctx.json(res, 400, { error: 'invalid_details' });
      if (!details) details = null;
    }
    let occurredAt = new Date();
    if (body.occurred_at !== undefined) {
      occurredAt = parseDate(body.occurred_at);
      if (!occurredAt || isFuture(occurredAt)) return ctx.json(res, 400, { error: 'invalid_occurred_at' });
    }
    const contactId = body.contact_id === undefined || body.contact_id === '' ? null : body.contact_id;
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
      const contact = await validateContact(client, contactId, owner.company_id);
      if (contact?.error) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 400, { error: contact.error });
      }
      const result = await client.query(
        `INSERT INTO crm_interactions (id,opportunity_id,company_id,contact_id,type,title,details,occurred_at,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id,type,title,details,occurred_at,contact_id,created_at,updated_at,version`,
        [randomUUID(), opportunityId, owner.company_id, contactId, type, title, details, occurredAt, session.identityId],
      );
      const interaction = result.rows[0];
      interaction.contact_name = contact?.display_name || null;
      interaction.attachments = [];
      await audit(client, session, 'crm_interaction_create', interaction.id);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 201, { interaction }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_interactions_unavailable' });
    } finally { client?.release(); }
  }

  async function update(req, res, session, opportunityId, interactionId) {
    const body = await readMutation(req, res); if (!body) return;
    if (['created_by_id', 'company_id', 'opportunity_id', 'version', 'deleted_at', 'deleted_by_id'].some(k => Object.hasOwn(body, k))) {
      return ctx.json(res, 400, { error: 'server_managed_fields' });
    }
    const expectedVersion = parseExpectedVersion(body.expected_version);
    if (!expectedVersion) return ctx.json(res, 400, { error: 'expected_version_required' });
    const changes = ['type', 'title', 'details', 'occurred_at', 'contact_id'].filter(key => Object.hasOwn(body, key));
    if (!changes.length) return ctx.json(res, 400, { error: 'interaction_update_required' });
    const values = {};
    if (Object.hasOwn(body, 'type')) {
      values.type = typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';
      if (!ALLOWED_TYPES.has(values.type)) return ctx.json(res, 400, { error: 'invalid_type' });
    }
    if (Object.hasOwn(body, 'title')) {
      values.title = text(body.title, 200);
      if (!values.title || values.title.length > 200) return ctx.json(res, 400, { error: 'invalid_title' });
    }
    if (Object.hasOwn(body, 'details')) {
      if (body.details !== null && typeof body.details !== 'string') return ctx.json(res, 400, { error: 'invalid_details' });
      values.details = body.details === null ? null : text(body.details, 5000) || null;
      if (typeof body.details === 'string' && values.details !== null && values.details.length > 5000) return ctx.json(res, 400, { error: 'invalid_details' });
    }
    if (Object.hasOwn(body, 'occurred_at')) {
      values.occurredAt = parseDate(body.occurred_at);
      if (!values.occurredAt || isFuture(values.occurredAt)) return ctx.json(res, 400, { error: 'invalid_occurred_at' });
    }
    if (Object.hasOwn(body, 'contact_id')) {
      values.contactId = body.contact_id;
      if (values.contactId !== null && (typeof values.contactId !== 'string' || !UUID.test(values.contactId))) return ctx.json(res, 400, { error: 'invalid_contact_id' });
    }
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
      const currentResult = await client.query(
        `SELECT id,version FROM crm_interactions
          WHERE id=$1 AND opportunity_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [interactionId, opportunityId],
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'interaction_not_found' });
      }
      if (current.version !== expectedVersion) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'interaction_version_conflict' });
      }
      let contact = null;
      if (Object.hasOwn(values, 'contactId')) {
        contact = await validateContact(client, values.contactId, owner.company_id);
        if (contact?.error) {
          await client.query('ROLLBACK'); transaction = false;
          return ctx.json(res, 400, { error: contact.error });
        }
      }
      const assignments = [];
      const params = [];
      function set(column, value) { params.push(value); assignments.push(`${column}=$${params.length}`); }
      if (Object.hasOwn(values, 'type')) set('type', values.type);
      if (Object.hasOwn(values, 'title')) set('title', values.title);
      if (Object.hasOwn(values, 'details')) set('details', values.details);
      if (Object.hasOwn(values, 'occurredAt')) set('occurred_at', values.occurredAt);
      if (Object.hasOwn(values, 'contactId')) set('contact_id', values.contactId);
      params.push(interactionId);
      const result = await client.query(
        `UPDATE crm_interactions SET ${assignments.join(',')},updated_at=NOW(),version=version+1
          WHERE id=$${params.length}
          RETURNING id,type,title,details,occurred_at,contact_id,created_at,updated_at,version`,
        params,
      );
      const interaction = result.rows[0];
      if (Object.hasOwn(values, 'contactId')) interaction.contact_name = contact?.display_name || null;
      else {
        const named = await client.query('SELECT display_name FROM crm_contacts WHERE id=$1', [interaction.contact_id]);
        interaction.contact_name = named.rows[0]?.display_name || null;
      }
      const attachments = await client.query(
        'SELECT id,interaction_id,original_filename,content_type,size_bytes,created_at FROM crm_interaction_attachments WHERE interaction_id=$1 ORDER BY created_at ASC,id ASC',
        [interaction.id],
      );
      interaction.attachments = attachments.rows;
      await audit(client, session, 'crm_interaction_update', interaction.id);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 200, { interaction }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_interactions_unavailable' });
    } finally { client?.release(); }
  }

  async function remove(req, res, session, opportunityId, interactionId) {
    const body = await readMutation(req, res); if (!body) return;
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
        `SELECT id,version FROM crm_interactions
          WHERE id=$1 AND opportunity_id=$2 AND deleted_at IS NULL FOR UPDATE`,
        [interactionId, opportunityId],
      );
      if (!current.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'interaction_not_found' });
      }
      if (current.rows[0].version !== expectedVersion) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'interaction_version_conflict' });
      }
      await client.query(
        `UPDATE crm_interactions
            SET deleted_at=NOW(),deleted_by_id=$2,updated_at=NOW(),version=version+1
          WHERE id=$1`,
        [interactionId, session.identityId],
      );
      await audit(client, session, 'crm_interaction_delete', interactionId);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 200, { deleted: true, id: interactionId }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_interactions_unavailable' });
    } finally { client?.release(); }
  }

  async function attach(req, res, session, opportunityId, interactionId) {
    const body = await readMutation(req, res, 7 * 1024 * 1024); if (!body) return;
    const content = decodeContent(body.contentBase64);
    if (!content) return ctx.json(res, 400, { error: 'attachment_content_invalid' });
    if (content.length > MAX_PRIVATE_FILE_BYTES) return ctx.json(res, 413, { error: 'attachment_too_large' });
    const filename = safeFilename(body.filename);
    if (!filename || filename.length > 240) return ctx.json(res, 400, { error: 'attachment_filename_invalid' });
    const contentType = text(body.contentType, 120).toLowerCase();
    if (!SAFE_CONTENT_TYPES.has(contentType)) return ctx.json(res, 400, { error: 'attachment_content_type_invalid' });
    const storageKey = randomBytes(24).toString('hex');
    const contentSha256 = createHash('sha256').update(content).digest('hex');
    const filePath = path.join(ctx.docsDir, storageKey);
    let client;
    let transaction = false;
    let fileWritten = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const owner = await ownerFor(client, opportunityId, session.identityId);
      if (!owner) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'opportunity_not_found' });
      }
      const interaction = await client.query(
        `SELECT id FROM crm_interactions
          WHERE id=$1 AND opportunity_id=$2 AND deleted_at IS NULL FOR SHARE`,
        [interactionId, opportunityId],
      );
      if (!interaction.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'interaction_not_found' });
      }
      // Reuse L02's private local-file pattern: generated non-user key, a
      // server-only directory, exclusive write and a database SHA-256.
      await mkdir(ctx.docsDir, { recursive: true, mode: 0o700 });
      await writeFile(filePath, content, { flag: 'wx', mode: 0o600 });
      fileWritten = true;
      const result = await client.query(
        `INSERT INTO crm_interaction_attachments
           (id,interaction_id,storage_key,content_sha256,original_filename,content_type,size_bytes,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,interaction_id,original_filename,content_type,size_bytes,created_at`,
        [randomUUID(), interactionId, storageKey, contentSha256, filename, contentType, content.length, session.identityId],
      );
      await audit(client, session, 'crm_interaction_attachment_create', result.rows[0].id);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 201, { attachment: result.rows[0] }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_interactions_unavailable' });
    } finally {
      client?.release();
      // A file with no committed metadata must not remain in the private store.
      if (fileWritten && transaction) await unlink(filePath).catch(() => {});
    }
  }

  async function download(req, res, session, opportunityId, interactionId, attachmentId) {
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
      const found = await client.query(
        `SELECT a.id,a.storage_key,a.content_sha256,a.original_filename,a.content_type,a.size_bytes
           FROM crm_interaction_attachments a
           JOIN crm_interactions i ON i.id=a.interaction_id
          WHERE a.id=$1 AND a.interaction_id=$2 AND i.opportunity_id=$3 AND i.deleted_at IS NULL
          FOR SHARE OF a,i`,
        [attachmentId, interactionId, opportunityId],
      );
      const attachment = found.rows[0];
      if (!attachment) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'attachment_not_found' });
      }
      if (!STORAGE_KEY.test(attachment.storage_key)) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'attachment_integrity_failed' });
      }
      let bytes;
      try { bytes = await readFile(path.join(ctx.docsDir, attachment.storage_key)); }
      catch {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'attachment_integrity_failed' });
      }
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (bytes.length !== attachment.size_bytes || digest !== attachment.content_sha256) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'attachment_integrity_failed' });
      }
      await audit(client, session, 'crm_interaction_attachment_download', attachment.id);
      await client.query('COMMIT'); transaction = false;
      res.writeHead(200, {
        'Content-Type': attachment.content_type,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.original_filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(bytes);
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_interactions_unavailable' });
    } finally { client?.release(); }
  }

  return async function handleInteractions(req, res, opportunityId, interactionId = null, attachmentId = null, action = null, url = null) {
    if (!UUID.test(opportunityId) || (interactionId && !UUID.test(interactionId)) || (attachmentId && !UUID.test(attachmentId))) {
      return ctx.json(res, 400, { error: 'invalid_id' });
    }
    const allowed = action === 'download' ? ['GET']
      : attachmentId ? []
        : action === 'attachments' ? ['POST']
          : interactionId ? ['PATCH', 'DELETE']
            : ['GET', 'POST'];
    if (!allowed.includes(req.method)) return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: allowed.join(', ') });
    const session = await sessionForCommercial(req, res); if (!session) return;
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    if (action === 'download') return download(req, res, session, opportunityId, interactionId, attachmentId);
    if (action === 'attachments') return attach(req, res, session, opportunityId, interactionId);
    if (interactionId && req.method === 'PATCH') return update(req, res, session, opportunityId, interactionId);
    if (interactionId && req.method === 'DELETE') return remove(req, res, session, opportunityId, interactionId);
    if (req.method === 'GET') return list(req, res, session, opportunityId, url);
    return create(req, res, session, opportunityId);
  };
}
