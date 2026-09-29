import { randomUUID } from 'node:crypto';

// CRM-08 — agenda de visitas/reuniões.
//
// Política de escopo, decidida antes da rota (ver migração 107):
//   * Responsável: a identidade que detém a oportunidade (responsible_id, ou
//     created_by_id enquanto não houver responsável). Só ela agenda, edita,
//     reagenda, conclui, cancela e gerencia participantes.
//   * Participante: identidade de staff ativa explicitamente convidada pelo
//     responsável. Enxerga apenas as visitas em que foi convidada e responde
//     somente por si (confirmado/recusado). Não reagenda, não cancela, não
//     convida terceiros e não passa a enxergar a oportunidade.
//   * Papel administrativo não é bypass: comercial/admin/marcelo/ti obedecem
//     exatamente à mesma regra.
//   * Nenhum diretório de staff é exposto. O convite é feito pelo e-mail
//     exato, e a resposta de erro é a mesma para inexistente, não-staff e
//     inativo, para não virar enumeração de contas.
//   * Reagendar zera todas as confirmações: uma confirmação vale para a data
//     confirmada, nunca para a data seguinte.

//   * Conflito de horário (migração 110): a faixa [início, início+duração) do
//     RESPONSÁVEL não pode sobrepor outra visita viva dele. Participante
//     convidado não gera conflito (ele pode recusar; e a agenda de terceiro
//     não é exposta). Duração nula vale 60 minutos. Fail-closed, sem
//     parâmetro de força e sem exceção por papel.
//   * Vínculo PUB-04: quando a oportunidade veio de um lead público, a visita
//     carrega `public_lead_id` e propaga, na mesma transação,
//     confirmada/realizada → `lead_visit_confirm`, cancelada (sem outra visita
//     viva) → `lead_visit_cancel` e reagendamento → `lead_status_change`
//     (a confirmação cai junto com a reserva). Lead `realizada` é congelado.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Duração assumida quando a visita não declara uma: assumir zero deixaria
// passar sobreposição real.
const DEFAULT_CONFLICT_MINUTES = 60;
const ACTIVE_VISIT_STATUSES = ['solicitada', 'em_agendamento', 'confirmada'];
const COMMERCIAL_ROLES = ['comercial', 'admin', 'marcelo', 'ti'];
const RESPONSES = new Set(['confirmado', 'recusado']);
const MAX_PARTICIPANTS = 10;
// Transições permitidas ao responsável. 'realizada' e 'cancelada' são finais.
const TRANSITIONS = {
  solicitada: ['em_agendamento', 'confirmada', 'realizada', 'cancelada'],
  em_agendamento: ['confirmada', 'realizada', 'cancelada'],
  confirmada: ['realizada', 'cancelada'],
  realizada: [],
  cancelada: [],
};

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max + 1) : '';
}
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function parseExpectedVersion(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}
function parsePage(url) {
  const rawLimit = Number(url?.searchParams?.get('limit') || 25);
  const rawOffset = Number(url?.searchParams?.get('offset') || 0);
  if (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 100
    || !Number.isSafeInteger(rawOffset) || rawOffset < 0) return null;
  return { limit: rawLimit, offset: rawOffset };
}
function parseDuration(value) {
  if (value === null || value === undefined || value === '') return { value: null };
  if (!Number.isSafeInteger(value) || value < 15 || value > 480) return { error: 'invalid_duration' };
  return { value };
}

export function createCrmVisitApi(ctx) {
  async function sessionForCommercial(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) { ctx.json(res, 401, { error: 'admin_session_required' }); return null; }
    if (!COMMERCIAL_ROLES.includes(session.role)) {
      ctx.json(res, 403, { error: 'commercial_role_required' }); return null;
    }
    return session;
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

  async function audit(client, session, action, target) {
    // Sem linha de auditoria durável na mesma transação, a mutação não é
    // confirmada ao cliente.
    await client.query(
      "INSERT INTO auth_access_audit (actor_kind,actor_id,action,target,result,detail_category) VALUES ('staff',$1,$2,$3,'allowed','none')",
      [session.identityId, action, target],
    );
  }

  /**
   * Serializa as mutações de agenda de um mesmo responsável dentro da
   * transação. Sem isso, duas requisições simultâneas passariam as duas pela
   * consulta de conflito e gravariam sobreposição.
   */
  async function lockAgenda(client, responsibleId) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('crm_visit_agenda:' || $1::text)::bigint)",
      [responsibleId],
    );
  }

  /**
   * Conflito de horário do responsável (CRM-08). Só visitas vivas reservam
   * faixa; encostar (fim == início) não é conflito. A consulta é restrita às
   * visitas do próprio responsável: a resposta nunca revela agenda alheia.
   */
  async function findConflict(client, { responsibleId, scheduledAt, durationMinutes, excludeVisitId = null }) {
    const minutes = Number.isSafeInteger(durationMinutes) && durationMinutes > 0
      ? durationMinutes : DEFAULT_CONFLICT_MINUTES;
    const found = await client.query(
      `SELECT id,title,scheduled_at,duration_minutes,status
         FROM crm_visits
        WHERE responsible_id=$1
          AND status = ANY($2::text[])
          AND ($5::uuid IS NULL OR id <> $5)
          AND tstzrange(scheduled_at, scheduled_at + (COALESCE(duration_minutes,$6) * INTERVAL '1 minute'), '[)')
              && tstzrange($3::timestamptz, $3::timestamptz + ($4 * INTERVAL '1 minute'), '[)')
        ORDER BY scheduled_at ASC, id ASC
        LIMIT 1`,
      [responsibleId, ACTIVE_VISIT_STATUSES, scheduledAt, minutes, excludeVisitId, DEFAULT_CONFLICT_MINUTES],
    );
    return found.rows[0] || null;
  }

  /**
   * Vínculo PUB-04. Propaga o estado da visita para o lead público de origem,
   * na mesma transação da mutação, com as três trilhas (histórico do lead,
   * auditoria PUB-04 e `crm_visit_lead_sync`). Falha aqui reverte a mutação.
   * Lead `realizada` é congelado; `cancelada` só é propagada quando não sobra
   * nenhuma outra visita viva do mesmo lead.
   */
  async function syncLead(client, session, { visitId, leadId, visitStatus }) {
    if (!leadId) return null;
    const target = visitStatus === 'confirmada' ? 'confirmada'
      : visitStatus === 'realizada' ? 'realizada'
        : visitStatus === 'cancelada' ? 'cancelada'
          : visitStatus === 'reagendada' ? 'em_agendamento' : null;
    if (!target) return null;
    if (target === 'cancelada' || target === 'em_agendamento') {
      const alive = await client.query(
        `SELECT 1 FROM crm_visits
          WHERE public_lead_id=$1 AND id<>$2 AND status = ANY($3::text[]) LIMIT 1`,
        [leadId, visitId, ACTIVE_VISIT_STATUSES],
      );
      // Outra visita viva do mesmo lead mantém o atendimento de pé.
      if (alive.rows[0]) return null;
    }
    const lead = await client.query('SELECT status FROM public_leads WHERE id=$1 FOR UPDATE', [leadId]);
    const previous = lead.rows[0]?.status;
    if (!previous) return null;
    // Atendimento já realizado não é reaberto nem cancelado por visita nova.
    if (previous === 'realizada' || previous === target) return null;
    await client.query('UPDATE public_leads SET status=$2, updated_at=NOW() WHERE id=$1', [leadId, target]);
    await client.query(
      'INSERT INTO public_lead_status_audit (lead_id, previous_status, next_status, changed_by) VALUES ($1,$2,$3,$4)',
      [leadId, previous, target, session.role],
    );
    const action = target === 'cancelada' ? 'lead_visit_cancel'
      : target === 'em_agendamento' ? 'lead_status_change' : 'lead_visit_confirm';
    await audit(client, session, action, `${leadId}:${previous}->${target}`);
    await audit(client, session, 'crm_visit_lead_sync', visitId);
    await client.query(
      'UPDATE crm_visits SET lead_sync_status=$2, lead_sync_at=NOW() WHERE id=$1',
      [visitId, target],
    );
    return { lead_id: leadId, previous_status: previous, status: target };
  }

  async function ownerFor(client, opportunityId, identityId) {
    const result = await client.query(
      `SELECT id, company_id, public_lead_id FROM crm_opportunities
        WHERE id=$1 AND (responsible_id=$2 OR (responsible_id IS NULL AND created_by_id=$2))
        FOR SHARE`,
      [opportunityId, identityId],
    );
    return result.rows[0] || null;
  }

  /** Visita gerenciável: exige ser o responsável pela visita E pela oportunidade. */
  async function manageableVisit(client, opportunityId, visitId, identityId) {
    const owner = await ownerFor(client, opportunityId, identityId);
    if (!owner) return { error: 'opportunity_not_found', status: 404 };
    const found = await client.query(
      `SELECT id,company_id,status,version,scheduled_at,duration_minutes,public_lead_id,lead_sync_status
         FROM crm_visits
        WHERE id=$1 AND opportunity_id=$2 AND responsible_id=$3 FOR UPDATE`,
      [visitId, opportunityId, identityId],
    );
    if (!found.rows[0]) return { error: 'visit_not_found', status: 404 };
    return { owner, visit: found.rows[0] };
  }

  async function participantsOf(client, visitIds) {
    const byVisit = new Map(visitIds.map(id => [id, []]));
    if (!visitIds.length) return byVisit;
    const result = await client.query(
      `SELECT p.visit_id,p.identity_id,p.response,p.responded_at,p.created_at,
              i.display_name,i.email
         FROM crm_visit_participants p
         JOIN auth_identities i ON i.id=p.identity_id
        WHERE p.visit_id = ANY($1::uuid[])
        ORDER BY i.display_name ASC, p.created_at ASC`,
      [visitIds],
    );
    for (const row of result.rows) byVisit.get(row.visit_id)?.push(row);
    return byVisit;
  }

  async function resolveStaffByEmail(client, email) {
    const result = await client.query(
      `SELECT i.id, i.display_name, i.email
         FROM auth_identities i
         JOIN auth_staff_profiles s ON s.identity_id=i.id
        WHERE lower(i.email)=lower($1) AND i.kind='staff' AND i.status='active'`,
      [email],
    );
    return result.rows[0] || null;
  }

  async function validateContact(client, contactId, companyId) {
    if (contactId === null) return null;
    if (typeof contactId !== 'string' || !UUID.test(contactId)) return { error: 'invalid_contact_id' };
    const found = await client.query(
      "SELECT id, display_name FROM crm_contacts WHERE id=$1 AND company_id=$2 AND status='active'",
      [contactId, companyId],
    );
    return found.rows[0] || { error: 'contact_not_available' };
  }

  // ---------------------------------------------------------------- leitura

  async function list(req, res, session, opportunityId, url) {
    const page = parsePage(url);
    if (!page) return ctx.json(res, 400, { error: 'invalid_pagination' });
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const owner = await ownerFor(client, opportunityId, session.identityId);
      // Quem não é responsável só enxerga a agenda desta oportunidade se tiver
      // sido convidado para alguma visita dela; caso contrário, 404.
      const invited = owner ? null : await client.query(
        `SELECT 1 FROM crm_visit_participants p
           JOIN crm_visits v ON v.id=p.visit_id
          WHERE v.opportunity_id=$1 AND p.identity_id=$2 LIMIT 1`,
        [opportunityId, session.identityId],
      );
      if (!owner && !invited.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'opportunity_not_found' });
      }
      const scopeSql = owner
        ? 'v.opportunity_id=$1'
        : `v.opportunity_id=$1 AND EXISTS (SELECT 1 FROM crm_visit_participants p WHERE p.visit_id=v.id AND p.identity_id=$4)`;
      const params = owner ? [opportunityId, page.limit, page.offset] : [opportunityId, page.limit, page.offset, session.identityId];
      const countParams = owner ? [opportunityId] : [opportunityId, session.identityId];
      const countSql = owner
        ? 'SELECT count(*)::int AS total FROM crm_visits v WHERE v.opportunity_id=$1'
        : `SELECT count(*)::int AS total FROM crm_visits v WHERE v.opportunity_id=$1
             AND EXISTS (SELECT 1 FROM crm_visit_participants p WHERE p.visit_id=v.id AND p.identity_id=$2)`;
      const [countResult, visitsResult] = await Promise.all([
        client.query(countSql, countParams),
        client.query(
          `SELECT v.id,v.title,v.status,v.scheduled_at,v.duration_minutes,v.notes,v.contact_id,
                  v.version,v.cancel_reason,v.cancelled_at,v.reschedule_count,v.rescheduled_at,
                  v.created_at,v.updated_at,v.public_lead_id,v.lead_sync_status,
                  c.display_name AS contact_name
             FROM crm_visits v
             LEFT JOIN crm_contacts c ON c.id=v.contact_id
            WHERE ${scopeSql}
            ORDER BY v.scheduled_at DESC, v.created_at DESC, v.id DESC
            LIMIT $2 OFFSET $3`,
          params,
        ),
      ]);
      const visits = visitsResult.rows;
      const byVisit = await participantsOf(client, visits.map(visit => visit.id));
      for (const visit of visits) {
        visit.participants = byVisit.get(visit.id) || [];
        visit.viewer_is_responsible = Boolean(owner);
        visit.viewer_response = visit.participants.find(p => p.identity_id === session.identityId)?.response || null;
      }
      const contacts = owner
        ? await client.query(
          `SELECT id,display_name FROM crm_contacts
            WHERE company_id=$1 AND status='active'
            ORDER BY is_primary DESC, display_name ASC, id ASC LIMIT 200`,
          [owner.company_id],
        )
        : { rows: [] };
      await client.query('COMMIT'); transaction = false;
      const total = countResult.rows[0]?.total || 0;
      return ctx.json(res, 200, {
        visits,
        contacts: contacts.rows,
        viewer: { identity_id: session.identityId, is_responsible: Boolean(owner) },
        pagination: {
          ...page,
          total,
          nextOffset: page.offset + visits.length < total ? page.offset + visits.length : null,
          previousOffset: page.offset > 0 ? Math.max(0, page.offset - page.limit) : null,
        },
      }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_visits_unavailable' });
    } finally { client?.release(); }
  }

  /** Agenda pessoal: visitas em que sou responsável ou participante. */
  async function agenda(req, res, session, url) {
    const page = parsePage(url);
    if (!page) return ctx.json(res, 400, { error: 'invalid_pagination' });
    const fromRaw = url?.searchParams?.get('from');
    const toRaw = url?.searchParams?.get('to');
    const from = fromRaw ? parseDate(fromRaw) : null;
    const to = toRaw ? parseDate(toRaw) : null;
    if ((fromRaw && !from) || (toRaw && !to)) return ctx.json(res, 400, { error: 'invalid_range' });
    if (from && to && to.getTime() < from.getTime()) return ctx.json(res, 400, { error: 'invalid_range' });
    let client;
    try {
      client = await ctx.getPool().connect();
      const where = `(v.responsible_id=$1 OR EXISTS (SELECT 1 FROM crm_visit_participants p WHERE p.visit_id=v.id AND p.identity_id=$1))
        AND ($2::timestamptz IS NULL OR v.scheduled_at >= $2)
        AND ($3::timestamptz IS NULL OR v.scheduled_at <= $3)`;
      const [countResult, visitsResult] = await Promise.all([
        client.query(`SELECT count(*)::int AS total FROM crm_visits v WHERE ${where}`, [session.identityId, from, to]),
        client.query(
          `SELECT v.id,v.opportunity_id,v.title,v.status,v.scheduled_at,v.duration_minutes,
                  v.version,v.cancel_reason,v.reschedule_count,v.public_lead_id,v.lead_sync_status,
                  (v.responsible_id=$1) AS viewer_is_responsible,
                  co.display_name AS company_name
             FROM crm_visits v
             LEFT JOIN crm_companies co ON co.id=v.company_id
            WHERE ${where}
            ORDER BY v.scheduled_at ASC, v.id ASC
            LIMIT $4 OFFSET $5`,
          [session.identityId, from, to, page.limit, page.offset],
        ),
      ]);
      const visits = visitsResult.rows;
      const byVisit = await participantsOf(client, visits.map(visit => visit.id));
      for (const visit of visits) {
        const participants = byVisit.get(visit.id) || [];
        visit.participant_count = participants.length;
        visit.confirmed_count = participants.filter(p => p.response === 'confirmado').length;
        visit.viewer_response = participants.find(p => p.identity_id === session.identityId)?.response || null;
      }
      const total = countResult.rows[0]?.total || 0;
      return ctx.json(res, 200, {
        visits,
        pagination: {
          ...page,
          total,
          nextOffset: page.offset + visits.length < total ? page.offset + visits.length : null,
          previousOffset: page.offset > 0 ? Math.max(0, page.offset - page.limit) : null,
        },
      }, { 'Cache-Control': 'private, no-store' });
    } catch {
      return ctx.json(res, 503, { error: 'crm_visits_unavailable' });
    } finally { client?.release(); }
  }

  // --------------------------------------------------------------- mutações

  async function create(req, res, session, opportunityId) {
    const body = await readMutation(req, res); if (!body) return;
    if (['responsible_id', 'created_by_id', 'company_id', 'opportunity_id', 'version', 'status', 'participants', 'cancelled_at', 'cancelled_by_id', 'reschedule_count', 'public_lead_id', 'lead_sync_status', 'lead_sync_at'].some(key => Object.hasOwn(body, key))) {
      return ctx.json(res, 400, { error: 'server_managed_fields' });
    }
    const title = text(body.title, 200);
    if (!title || title.length > 200) return ctx.json(res, 400, { error: 'invalid_title' });
    const scheduledAt = parseDate(body.scheduled_at);
    if (!scheduledAt) return ctx.json(res, 400, { error: 'invalid_scheduled_at' });
    if (scheduledAt.getTime() <= Date.now()) return ctx.json(res, 400, { error: 'scheduled_at_must_be_future' });
    const duration = parseDuration(body.duration_minutes === undefined ? null : body.duration_minutes);
    if (duration.error) return ctx.json(res, 400, { error: duration.error });
    let notes = null;
    if (body.notes !== undefined && body.notes !== null) {
      if (typeof body.notes !== 'string') return ctx.json(res, 400, { error: 'invalid_notes' });
      notes = text(body.notes, 2000);
      if (notes.length > 2000) return ctx.json(res, 400, { error: 'invalid_notes' });
      if (!notes) notes = null;
    }
    const contactId = body.contact_id === undefined || body.contact_id === '' ? null : body.contact_id;
    const emails = body.participant_emails === undefined ? [] : body.participant_emails;
    if (!Array.isArray(emails) || emails.length > MAX_PARTICIPANTS
      || emails.some(email => typeof email !== 'string' || !email.trim() || email.length > 254)) {
      return ctx.json(res, 400, { error: 'invalid_participants' });
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
      const contact = await validateContact(client, contactId, owner.company_id);
      if (contact?.error) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 400, { error: contact.error });
      }
      // Conflito de horário do responsável: fail-closed, sem força.
      await lockAgenda(client, session.identityId);
      const clash = await findConflict(client, {
        responsibleId: session.identityId, scheduledAt, durationMinutes: duration.value,
      });
      if (clash) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, {
          error: 'visit_schedule_conflict',
          conflict: {
            id: clash.id, title: clash.title, status: clash.status,
            scheduled_at: clash.scheduled_at, duration_minutes: clash.duration_minutes,
          },
        });
      }
      const invited = [];
      for (const email of emails) {
        const staff = await resolveStaffByEmail(client, email.trim());
        if (!staff || staff.id === session.identityId || invited.some(item => item.id === staff.id)) {
          await client.query('ROLLBACK'); transaction = false;
          return ctx.json(res, 400, { error: 'participant_not_available' });
        }
        invited.push(staff);
      }
      const visitId = randomUUID();
      const inserted = await client.query(
        `INSERT INTO crm_visits
           (id,company_id,opportunity_id,contact_id,title,responsible_id,scheduled_at,duration_minutes,status,notes,created_by_id,public_lead_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'solicitada',$9,$6,$10)
         RETURNING id,title,status,scheduled_at,duration_minutes,notes,contact_id,version,
                   cancel_reason,cancelled_at,reschedule_count,rescheduled_at,created_at,updated_at,
                   public_lead_id,lead_sync_status`,
        // O vínculo PUB-04 vem da oportunidade, nunca do corpo da requisição.
        [visitId, owner.company_id, opportunityId, contactId, title, session.identityId, scheduledAt, duration.value, notes, owner.public_lead_id],
      );
      for (const staff of invited) {
        await client.query(
          'INSERT INTO crm_visit_participants (id,visit_id,identity_id,added_by_id) VALUES ($1,$2,$3,$4)',
          [randomUUID(), visitId, staff.id, session.identityId],
        );
        await audit(client, session, 'crm_visit_participant_add', visitId);
      }
      await audit(client, session, 'crm_visit_create', visitId);
      const byVisit = await participantsOf(client, [visitId]);
      await client.query('COMMIT'); transaction = false;
      const visit = inserted.rows[0];
      visit.contact_name = contact?.display_name || null;
      visit.participants = byVisit.get(visitId) || [];
      visit.viewer_is_responsible = true;
      visit.viewer_response = null;
      return ctx.json(res, 201, { visit }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_visits_unavailable' });
    } finally { client?.release(); }
  }

  async function update(req, res, session, opportunityId, visitId) {
    const body = await readMutation(req, res); if (!body) return;
    if (['responsible_id', 'created_by_id', 'company_id', 'opportunity_id', 'version', 'participants', 'cancelled_at', 'cancelled_by_id', 'reschedule_count', 'public_lead_id', 'lead_sync_status', 'lead_sync_at'].some(key => Object.hasOwn(body, key))) {
      return ctx.json(res, 400, { error: 'server_managed_fields' });
    }
    const expectedVersion = parseExpectedVersion(body.expected_version);
    if (!expectedVersion) return ctx.json(res, 400, { error: 'expected_version_required' });
    const fields = ['title', 'scheduled_at', 'duration_minutes', 'notes', 'contact_id', 'status'].filter(key => Object.hasOwn(body, key));
    if (!fields.length) return ctx.json(res, 400, { error: 'visit_update_required' });
    const values = {};
    if (Object.hasOwn(body, 'title')) {
      values.title = text(body.title, 200);
      if (!values.title || values.title.length > 200) return ctx.json(res, 400, { error: 'invalid_title' });
    }
    if (Object.hasOwn(body, 'scheduled_at')) {
      values.scheduledAt = parseDate(body.scheduled_at);
      if (!values.scheduledAt) return ctx.json(res, 400, { error: 'invalid_scheduled_at' });
      if (values.scheduledAt.getTime() <= Date.now()) return ctx.json(res, 400, { error: 'scheduled_at_must_be_future' });
    }
    if (Object.hasOwn(body, 'duration_minutes')) {
      const duration = parseDuration(body.duration_minutes);
      if (duration.error) return ctx.json(res, 400, { error: duration.error });
      values.duration = duration.value;
    }
    if (Object.hasOwn(body, 'notes')) {
      if (body.notes !== null && typeof body.notes !== 'string') return ctx.json(res, 400, { error: 'invalid_notes' });
      values.notes = body.notes === null ? null : text(body.notes, 2000) || null;
      if (values.notes && values.notes.length > 2000) return ctx.json(res, 400, { error: 'invalid_notes' });
    }
    if (Object.hasOwn(body, 'contact_id')) {
      values.contactId = body.contact_id === '' ? null : body.contact_id;
      if (values.contactId !== null && (typeof values.contactId !== 'string' || !UUID.test(values.contactId))) {
        return ctx.json(res, 400, { error: 'invalid_contact_id' });
      }
    }
    let cancelReason = null;
    if (Object.hasOwn(body, 'status')) {
      values.status = typeof body.status === 'string' ? body.status.trim() : '';
      if (!Object.hasOwn(TRANSITIONS, values.status)) return ctx.json(res, 400, { error: 'invalid_status' });
      if (values.status === 'cancelada') {
        cancelReason = text(body.cancel_reason, 500);
        if (cancelReason.length < 3 || cancelReason.length > 500) return ctx.json(res, 400, { error: 'cancel_reason_required' });
      }
    }
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const scope = await manageableVisit(client, opportunityId, visitId, session.identityId);
      if (scope.error) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, scope.status, { error: scope.error });
      }
      const current = scope.visit;
      if (current.version !== expectedVersion) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'visit_version_conflict' });
      }
      // Estado final não é reeditado nem reaberto silenciosamente.
      if (['realizada', 'cancelada'].includes(current.status)) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'visit_status_final' });
      }
      if (values.status && !TRANSITIONS[current.status].includes(values.status)) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'visit_status_conflict' });
      }
      if (Object.hasOwn(values, 'contactId')) {
        const contact = await validateContact(client, values.contactId, current.company_id);
        if (contact?.error) {
          await client.query('ROLLBACK'); transaction = false;
          return ctx.json(res, 400, { error: contact.error });
        }
      }
      const rescheduled = Boolean(values.scheduledAt)
        && values.scheduledAt.getTime() !== new Date(current.scheduled_at).getTime();
      // Conflito de horário: recheca ao mover a faixa (data ou duração) e ao
      // confirmar — confirmar é o momento em que o horário vira promessa.
      const durationChanged = Object.hasOwn(values, 'duration')
        && values.duration !== current.duration_minutes;
      if (rescheduled || durationChanged || values.status === 'confirmada') {
        const effectiveDate = values.scheduledAt || new Date(current.scheduled_at);
        const effectiveDuration = Object.hasOwn(values, 'duration') ? values.duration : current.duration_minutes;
        await lockAgenda(client, session.identityId);
        const clash = await findConflict(client, {
          responsibleId: session.identityId,
          scheduledAt: effectiveDate,
          durationMinutes: effectiveDuration,
          excludeVisitId: visitId,
        });
        if (clash) {
          await client.query('ROLLBACK'); transaction = false;
          return ctx.json(res, 409, {
            error: 'visit_schedule_conflict',
            conflict: {
              id: clash.id, title: clash.title, status: clash.status,
              scheduled_at: clash.scheduled_at, duration_minutes: clash.duration_minutes,
            },
          });
        }
      }
      const sets = ['version=version+1', 'updated_at=NOW()'];
      const params = [visitId];
      const push = (fragment, value) => { params.push(value); sets.push(`${fragment}=$${params.length}`); };
      if (Object.hasOwn(values, 'title')) push('title', values.title);
      if (Object.hasOwn(values, 'scheduledAt')) push('scheduled_at', values.scheduledAt);
      if (Object.hasOwn(values, 'duration')) push('duration_minutes', values.duration);
      if (Object.hasOwn(values, 'notes')) push('notes', values.notes);
      if (Object.hasOwn(values, 'contactId')) push('contact_id', values.contactId);
      if (rescheduled) {
        // Reagendar volta o ciclo ao início: nenhuma confirmação antiga
        // sobrevive a uma data nova.
        sets.push('reschedule_count=reschedule_count+1', 'rescheduled_at=NOW()');
        if (!values.status || values.status !== 'cancelada') sets.push("status='solicitada'");
      }
      if (values.status) {
        push('status', values.status);
        if (values.status === 'cancelada') {
          push('cancel_reason', cancelReason);
          push('cancelled_by_id', session.identityId);
          sets.push('cancelled_at=NOW()');
        }
      }
      const updated = await client.query(
        `UPDATE crm_visits SET ${sets.join(',')} WHERE id=$1
         RETURNING id,title,status,scheduled_at,duration_minutes,notes,contact_id,version,
                   cancel_reason,cancelled_at,reschedule_count,rescheduled_at,created_at,updated_at,
                   public_lead_id,lead_sync_status`,
        params,
      );
      if (rescheduled) {
        await client.query(
          "UPDATE crm_visit_participants SET response='pendente',responded_at=NULL WHERE visit_id=$1 AND response<>'pendente'",
          [visitId],
        );
      }
      const action = values.status === 'cancelada' ? 'crm_visit_cancel'
        : rescheduled ? 'crm_visit_reschedule'
          : values.status ? 'crm_visit_status' : 'crm_visit_update';
      await audit(client, session, action, visitId);
      // Vínculo PUB-04, na mesma transação: sem a trilha do lead, a visita não
      // muda de estado. Reagendar derruba a confirmação do lead.
      const leadSync = await syncLead(client, session, {
        visitId,
        leadId: current.public_lead_id,
        visitStatus: values.status === 'cancelada' ? 'cancelada'
          : rescheduled ? 'reagendada'
            : values.status || null,
      });
      const byVisit = await participantsOf(client, [visitId]);
      const named = updated.rows[0].contact_id
        ? await client.query('SELECT display_name FROM crm_contacts WHERE id=$1', [updated.rows[0].contact_id])
        : { rows: [] };
      await client.query('COMMIT'); transaction = false;
      const visit = updated.rows[0];
      visit.contact_name = named.rows[0]?.display_name || null;
      visit.participants = byVisit.get(visitId) || [];
      visit.viewer_is_responsible = true;
      visit.viewer_response = null;
      if (leadSync) visit.lead_sync_status = leadSync.status;
      return ctx.json(res, 200, { visit, lead_sync: leadSync }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_visits_unavailable' });
    } finally { client?.release(); }
  }

  async function addParticipant(req, res, session, opportunityId, visitId) {
    const body = await readMutation(req, res); if (!body) return;
    const expectedVersion = parseExpectedVersion(body.expected_version);
    if (!expectedVersion) return ctx.json(res, 400, { error: 'expected_version_required' });
    const email = text(body.email, 254).toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return ctx.json(res, 400, { error: 'invalid_email' });
    }
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const scope = await manageableVisit(client, opportunityId, visitId, session.identityId);
      if (scope.error) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, scope.status, { error: scope.error });
      }
      if (scope.visit.version !== expectedVersion) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'visit_version_conflict' });
      }
      if (['realizada', 'cancelada'].includes(scope.visit.status)) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'visit_status_final' });
      }
      const staff = await resolveStaffByEmail(client, email);
      if (!staff || staff.id === session.identityId) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 400, { error: 'participant_not_available' });
      }
      const existing = await client.query(
        'SELECT 1 FROM crm_visit_participants WHERE visit_id=$1 AND identity_id=$2',
        [visitId, staff.id],
      );
      if (existing.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'participant_already_invited' });
      }
      const total = await client.query('SELECT count(*)::int AS total FROM crm_visit_participants WHERE visit_id=$1', [visitId]);
      if (total.rows[0].total >= MAX_PARTICIPANTS) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 400, { error: 'participant_limit_reached' });
      }
      await client.query(
        'INSERT INTO crm_visit_participants (id,visit_id,identity_id,added_by_id) VALUES ($1,$2,$3,$4)',
        [randomUUID(), visitId, staff.id, session.identityId],
      );
      await client.query('UPDATE crm_visits SET version=version+1,updated_at=NOW() WHERE id=$1', [visitId]);
      await audit(client, session, 'crm_visit_participant_add', visitId);
      const byVisit = await participantsOf(client, [visitId]);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 201, {
        visit_id: visitId,
        version: scope.visit.version + 1,
        participants: byVisit.get(visitId) || [],
      }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_visits_unavailable' });
    } finally { client?.release(); }
  }

  async function removeParticipant(req, res, session, opportunityId, visitId, identityId) {
    const body = await readMutation(req, res); if (!body) return;
    const expectedVersion = parseExpectedVersion(body.expected_version);
    if (!expectedVersion) return ctx.json(res, 400, { error: 'expected_version_required' });
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const scope = await manageableVisit(client, opportunityId, visitId, session.identityId);
      if (scope.error) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, scope.status, { error: scope.error });
      }
      if (scope.visit.version !== expectedVersion) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'visit_version_conflict' });
      }
      const deleted = await client.query(
        'DELETE FROM crm_visit_participants WHERE visit_id=$1 AND identity_id=$2 RETURNING id',
        [visitId, identityId],
      );
      if (!deleted.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'participant_not_found' });
      }
      await client.query('UPDATE crm_visits SET version=version+1,updated_at=NOW() WHERE id=$1', [visitId]);
      await audit(client, session, 'crm_visit_participant_remove', visitId);
      const byVisit = await participantsOf(client, [visitId]);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 200, {
        visit_id: visitId,
        version: scope.visit.version + 1,
        participants: byVisit.get(visitId) || [],
      }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_visits_unavailable' });
    } finally { client?.release(); }
  }

  /** Confirmação individual: cada participante responde apenas por si. */
  async function respond(req, res, session, opportunityId, visitId) {
    const body = await readMutation(req, res); if (!body) return;
    const expectedVersion = parseExpectedVersion(body.expected_version);
    if (!expectedVersion) return ctx.json(res, 400, { error: 'expected_version_required' });
    const response = typeof body.response === 'string' ? body.response.trim() : '';
    if (!RESPONSES.has(response)) return ctx.json(res, 400, { error: 'invalid_response' });
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const found = await client.query(
        `SELECT v.id,v.status,v.version,p.id AS participant_id
           FROM crm_visits v
           JOIN crm_visit_participants p ON p.visit_id=v.id AND p.identity_id=$3
          WHERE v.id=$1 AND v.opportunity_id=$2
          FOR UPDATE OF v,p`,
        [visitId, opportunityId, session.identityId],
      );
      const visit = found.rows[0];
      if (!visit) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'visit_not_found' });
      }
      if (visit.version !== expectedVersion) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'visit_version_conflict' });
      }
      if (['realizada', 'cancelada'].includes(visit.status)) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'visit_status_final' });
      }
      await client.query(
        'UPDATE crm_visit_participants SET response=$2,responded_at=NOW() WHERE id=$1',
        [visit.participant_id, response],
      );
      await audit(client, session, 'crm_visit_response', visitId);
      const byVisit = await participantsOf(client, [visitId]);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 200, {
        visit_id: visitId,
        version: visit.version,
        response,
        participants: byVisit.get(visitId) || [],
      }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_visits_unavailable' });
    } finally { client?.release(); }
  }

  async function handleAgenda(req, res, url) {
    if (req.method !== 'GET') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    const session = await sessionForCommercial(req, res); if (!session) return;
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    return agenda(req, res, session, url);
  }

  async function handleVisits(req, res, opportunityId, visitId = null, action = null, participantId = null, url = null) {
    if (!UUID.test(opportunityId) || (visitId && !UUID.test(visitId)) || (participantId && !UUID.test(participantId))) {
      return ctx.json(res, 400, { error: 'invalid_id' });
    }
    const allowed = action === 'participants' ? (participantId ? ['DELETE'] : ['POST'])
      : action === 'response' ? ['POST']
        : visitId ? ['PATCH']
          : ['GET', 'POST'];
    if (!allowed.includes(req.method)) return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: allowed.join(', ') });
    const session = await sessionForCommercial(req, res); if (!session) return;
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    if (action === 'participants' && participantId) return removeParticipant(req, res, session, opportunityId, visitId, participantId);
    if (action === 'participants') return addParticipant(req, res, session, opportunityId, visitId);
    if (action === 'response') return respond(req, res, session, opportunityId, visitId);
    if (visitId) return update(req, res, session, opportunityId, visitId);
    if (req.method === 'GET') return list(req, res, session, opportunityId, url);
    return create(req, res, session, opportunityId);
  }

  return { handleVisits, handleAgenda };
}
