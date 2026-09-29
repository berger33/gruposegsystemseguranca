import { randomUUID } from "node:crypto";

function generateProtocol(prefix) {
  const d = new Date();
  const y = d.getFullYear().toString();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export function createCliAdvancedApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  async function ensureAuth(req, res, roles) {
    const session = requireSession(req);
    if (!session) { res.writeHead(401, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"unauthorized" })); return null; }
    // Sessão de staff não comprova vínculo a uma conta cliente. Até existir
    // autorização por escopo em cada recurso v2, negar RH/comercial aqui.
    if (!requireRole(session, ["admin","ti"]) || (roles && !requireRole(session, roles))) {
      res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"forbidden" })); return null;
    }
    if (!sameOrigin(req)) { res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"origin_forbidden" })); return null; }
    return session;
  }
  function json(res, code, obj) { res.writeHead(code, { "Content-Type":"application/json" }); res.end(JSON.stringify(obj)); }

  // CLI-05/06 tickets v2
  async function handleTicketsV2(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      const status = url.searchParams.get("status");
      const priority = url.searchParams.get("priority");
      let q = `SELECT * FROM cli_tickets_v2 WHERE 1=1`;
      const params = [];
      let idx=1;
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      if (priority) { q+=` AND priority=$${idx++}`; params.push(priority); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      // client role filter: only own accounts
      if ((session.role||"").toLowerCase()==="cliente" || (session.userRole||"").toLowerCase()==="cliente") {
        // fetch allowed accounts via grants
        try {
          const grants = await pool.query(`SELECT client_account_id FROM client_access_grants WHERE identity_id=$1 AND revoked_at IS NULL`, [session.identityId]);
          const allowed = grants.rows.map(r=>r.client_account_id);
          const filtered = rows.filter(r=> allowed.includes(r.client_account_id));
          return json(res,200,{ tickets: filtered });
        } catch {}
      }
      return json(res,200,{ tickets: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contact_id, contract_id, category, priority, title, description, sla_due_at } = body;
      if (!client_account_id || !title || !description) return json(res,400,{ error:"missing_fields" });
      if (String(title).length <3 || String(title).length>200) return json(res,400,{ error:"title_3_200" });
      if (String(description).length <10 || String(description).length>5000) return json(res,400,{ error:"description_10_5000" });
      const protocol = generateProtocol("CLI");
      try {
        const { rows } = await pool.query(
          `INSERT INTO cli_tickets_v2 (protocol, client_account_id, contact_id, contract_id, category, priority, title, description, sla_due_at, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [protocol, client_account_id, contact_id||null, contract_id||null, category||'atendimento_servico', priority||'media', title, description, sla_due_at||null, session.identityId||null]
        );
        const ticket = rows[0];
        await pool.query(`INSERT INTO cli_ticket_history (ticket_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [ticket.id, null, 'aberto', session.identityId||null, 'Criação inicial']);
        await auditLog({ action:"cli_ticket_v2_create", actor: session.identityId||session.email||"unknown", target: ticket.id, meta:{ protocol, account_id: client_account_id, category, priority } });
        return json(res,201,{ ticket });
      } catch(e) {
        if (String(e.message).includes("duplicate")) return json(res,409,{ error:"duplicate_protocol" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, status, responsible_name, responsible_identity_id, reason, is_reopen, reopen_reason } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      const cur = await pool.query(`SELECT * FROM cli_tickets_v2 WHERE id=$1`, [id]);
      if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
      const prev = cur.rows[0];
      // CLI-06 estados aberto/em atendimento/aguardando cliente/resolvido/encerrado reabertura motivo
      if (status) {
        const allowed = ['aberto','em_atendimento','aguardando_cliente','resolvido','encerrado'];
        if (!allowed.includes(status)) return json(res,400,{ error:"invalid_status" });
        // reabertura: se de resolvido/encerrado para aberto/em_atendimento requer motivo
        const isReopen = (prev.status==='resolvido' || prev.status==='encerrado') && (status==='aberto' || status==='em_atendimento');
        if (isReopen) {
          if (!reopen_reason || String(reopen_reason).length <10 || String(reopen_reason).length>1000) return json(res,400,{ error:"reopen_reason_10_1000_required", note:"reabertura e motivo obrigatório" });
        }
        // pausas SLA explicitamente definidas: se status aguardando_cliente, pausa SLA
        if (status==='aguardando_cliente' && prev.status!=='aguardando_cliente') {
          // auto pause SLA if not already paused
          if (!prev.sla_paused_at) {
            await pool.query(`UPDATE cli_tickets_v2 SET sla_paused_at=NOW(), sla_pause_reason='aguardando_cliente', status=$2, reopen_count=$3, last_reopen_reason=$4, resolved_at=$5, closed_at=$6, responsible_name=COALESCE($7,responsible_name), responsible_identity_id=COALESCE($8,responsible_identity_id) WHERE id=$1`, [id, status, isReopen? prev.reopen_count+1 : prev.reopen_count, isReopen? reopen_reason : prev.last_reopen_reason, status==='resolvido'? 'NOW()' : null, status==='encerrado'? 'NOW()' : null, responsible_name||null, responsible_identity_id||null].map((v,i)=> i===4 && v==='NOW()' ? undefined : v));
            // Actually need separate handling, simplify
            await pool.query(`UPDATE cli_tickets_v2 SET sla_paused_at=NOW(), sla_pause_reason='aguardando_cliente' WHERE id=$1 AND sla_paused_at IS NULL`, [id]);
            await pool.query(`INSERT INTO cli_ticket_sla_pauses (ticket_id, reason, paused_by_identity, notes) VALUES ($1,'aguardando_cliente',$2,$3)`, [id, session.identityId||null, reason||'Aguardando cliente']);
          }
        }
        // if leaving aguardando_cliente, resume SLA
        if (prev.status==='aguardando_cliente' && status!=='aguardando_cliente') {
          const lastPause = await pool.query(`SELECT * FROM cli_ticket_sla_pauses WHERE ticket_id=$1 AND resumed_at IS NULL ORDER BY paused_at DESC LIMIT 1`, [id]);
          if (lastPause.rows.length>0) {
            await pool.query(`UPDATE cli_ticket_sla_pauses SET resumed_at=NOW() WHERE id=$1`, [lastPause.rows[0].id]);
            // update total paused seconds
            const dur = await pool.query(`SELECT EXTRACT(EPOCH FROM (NOW() - $1))::BIGINT as secs`, [lastPause.rows[0].paused_at]);
            const secs = parseInt(dur.rows[0].secs||0);
            await pool.query(`UPDATE cli_tickets_v2 SET sla_total_paused_seconds = sla_total_paused_seconds + $2, sla_paused_at=NULL, sla_pause_reason=NULL WHERE id=$1`, [id, secs]);
          }
        }
        await pool.query(`UPDATE cli_tickets_v2 SET status=$2, responsible_name=COALESCE($3,responsible_name), responsible_identity_id=COALESCE($4,responsible_identity_id), reopen_count=$5, last_reopen_reason=$6, resolved_at=CASE WHEN $2='resolvido' THEN NOW() WHEN $2 IN ('aberto','em_atendimento','aguardando_cliente') THEN NULL ELSE resolved_at END, closed_at=CASE WHEN $2='encerrado' THEN NOW() WHEN $2 IN ('aberto','em_atendimento','aguardando_cliente','resolvido') THEN NULL ELSE closed_at END WHERE id=$1`, [id, status, responsible_name||null, responsible_identity_id||null, isReopen? prev.reopen_count+1 : prev.reopen_count, isReopen? reopen_reason : prev.last_reopen_reason]);
        await pool.query(`INSERT INTO cli_ticket_history (ticket_id, previous_status, next_status, changed_by_identity, reason, is_reopen) VALUES ($1,$2,$3,$4,$5,$6)`, [id, prev.status, status, session.identityId||null, reason|| (isReopen? reopen_reason : null), isReopen]);
        await auditLog({ action: isReopen? "cli_ticket_v2_reopen" : "cli_ticket_v2_status", actor: session.identityId||"unknown", target: id, meta:{ previous: prev.status, next: status, is_reopen: isReopen, reason } });
        const updated = await pool.query(`SELECT * FROM cli_tickets_v2 WHERE id=$1`, [id]);
        return json(res,200,{ ticket: updated.rows[0] });
      }
      // only responsible update
      await pool.query(`UPDATE cli_tickets_v2 SET responsible_name=COALESCE($2,responsible_name), responsible_identity_id=COALESCE($3,responsible_identity_id) WHERE id=$1`, [id, responsible_name||null, responsible_identity_id||null]);
      const updated = await pool.query(`SELECT * FROM cli_tickets_v2 WHERE id=$1`, [id]);
      return json(res,200,{ ticket: updated.rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleTicketMessages(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const ticketId = url.searchParams.get("ticket_id");
      if (!ticketId) return json(res,400,{ error:"missing_ticket_id" });
      const { rows } = await pool.query(`SELECT * FROM cli_ticket_messages WHERE ticket_id=$1 ORDER BY created_at ASC`, [ticketId]);
      // filter internal for client role
      const role = (session.role||session.userRole||"").toLowerCase();
      if (role==="cliente" || role==="client") {
        return json(res,200,{ messages: rows.filter(r=> !r.is_internal) });
      }
      return json(res,200,{ messages: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { ticket_id, content, message_type, is_internal, contact_id } = body;
      if (!ticket_id || !content) return json(res,400,{ error:"missing_fields" });
      if (String(content).length <1 || String(content).length>5000) return json(res,400,{ error:"content_1_5000" });
      const { rows } = await pool.query(`INSERT INTO cli_ticket_messages (ticket_id, contact_id, identity_id, message_type, content, is_internal) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [ticket_id, contact_id||null, session.identityId||null, message_type||'mensagem', content, is_internal||false]);
      await auditLog({ action:"cli_ticket_message_create", actor: session.identityId||"unknown", target: ticket_id, meta:{ message_id: rows[0].id, is_internal } });
      return json(res,201,{ message: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleTicketAttachments(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const ticketId = url.searchParams.get("ticket_id");
      if (!ticketId) return json(res,400,{ error:"missing_ticket_id" });
      const { rows } = await pool.query(`SELECT * FROM cli_ticket_attachments WHERE ticket_id=$1 ORDER BY created_at DESC`, [ticketId]);
      return json(res,200,{ attachments: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { ticket_id, message_id, file_name, file_url, storage_key } = body;
      if (!ticket_id || !file_name || !file_url || !storage_key) return json(res,400,{ error:"missing_fields" });
      try {
        const { rows } = await pool.query(`INSERT INTO cli_ticket_attachments (ticket_id, message_id, file_name, file_url, storage_key, uploaded_by_identity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [ticket_id, message_id||null, file_name, file_url, storage_key, session.identityId||null]);
        await auditLog({ action:"cli_ticket_attachment_create", actor: session.identityId||"unknown", target: ticket_id, meta:{ file_name, storage_key } });
        return json(res,201,{ attachment: rows[0] });
      } catch(e) {
        if (String(e.message).includes("duplicate") || String(e.message).includes("storage_key")) return json(res,409,{ error:"duplicate_storage_key" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleTicketHistory(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ticketId = url.searchParams.get("ticket_id");
    if (!ticketId) return json(res,400,{ error:"missing_ticket_id" });
    const { rows } = await pool.query(`SELECT * FROM cli_ticket_history WHERE ticket_id=$1 ORDER BY created_at DESC`, [ticketId]);
    return json(res,200,{ history: rows });
  }

  async function handleTicketSlaPauses(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const ticketId = url.searchParams.get("ticket_id");
      if (!ticketId) return json(res,400,{ error:"missing_ticket_id" });
      const { rows } = await pool.query(`SELECT * FROM cli_ticket_sla_pauses WHERE ticket_id=$1 ORDER BY paused_at DESC`, [ticketId]);
      return json(res,200,{ pauses: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { ticket_id, reason, notes, action } = body; // action pause/resume
      if (!ticket_id || !reason) return json(res,400,{ error:"missing_fields" });
      if (action==="pause") {
        // check not already paused
        const cur = await pool.query(`SELECT sla_paused_at FROM cli_tickets_v2 WHERE id=$1`, [ticket_id]);
        if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
        if (cur.rows[0].sla_paused_at) return json(res,400,{ error:"already_paused", note:"pausas de SLA explicitamente definidas" });
        await pool.query(`UPDATE cli_tickets_v2 SET sla_paused_at=NOW(), sla_pause_reason=$2 WHERE id=$1`, [ticket_id, reason]);
        const { rows } = await pool.query(`INSERT INTO cli_ticket_sla_pauses (ticket_id, reason, paused_by_identity, notes) VALUES ($1,$2,$3,$4) RETURNING *`, [ticket_id, reason, session.identityId||null, notes||null]);
        await auditLog({ action:"cli_ticket_sla_pause", actor: session.identityId||"unknown", target: ticket_id, meta:{ reason } });
        return json(res,201,{ pause: rows[0] });
      } else if (action==="resume") {
        const last = await pool.query(`SELECT * FROM cli_ticket_sla_pauses WHERE ticket_id=$1 AND resumed_at IS NULL ORDER BY paused_at DESC LIMIT 1`, [ticket_id]);
        if (last.rows.length===0) return json(res,400,{ error:"not_paused" });
        await pool.query(`UPDATE cli_ticket_sla_pauses SET resumed_at=NOW() WHERE id=$1`, [last.rows[0].id]);
        const dur = await pool.query(`SELECT EXTRACT(EPOCH FROM (NOW() - $1))::BIGINT as secs`, [last.rows[0].paused_at]);
        const secs = parseInt(dur.rows[0].secs||0);
        await pool.query(`UPDATE cli_tickets_v2 SET sla_total_paused_seconds = sla_total_paused_seconds + $2, sla_paused_at=NULL, sla_pause_reason=NULL WHERE id=$1`, [ticket_id, secs]);
        await auditLog({ action:"cli_ticket_sla_resume", actor: session.identityId||"unknown", target: ticket_id, meta:{ secs } });
        const updated = await pool.query(`SELECT * FROM cli_ticket_sla_pauses WHERE id=$1`, [last.rows[0].id]);
        return json(res,200,{ pause: updated.rows[0], resumed_seconds: secs });
      }
      return json(res,400,{ error:"invalid_action", note:"use pause ou resume, pausas de SLA explicitamente definidas" });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  // CLI-07 visitas
  async function handleVisits(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      const status = url.searchParams.get("status");
      let q=`SELECT * FROM cli_visits WHERE 1=1`;
      const params=[]; let idx=1;
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY scheduled_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ visits: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contract_id, ticket_id, visit_type, title, description, scheduled_at, responsible_name, location } = body;
      if (!client_account_id || !title || !scheduled_at) return json(res,400,{ error:"missing_fields" });
      if (String(title).length <5 || String(title).length>200) return json(res,400,{ error:"title_5_200" });
      const protocol = generateProtocol("VIS-CLI");
      try {
        const { rows } = await pool.query(
          `INSERT INTO cli_visits (protocol, client_account_id, contract_id, ticket_id, visit_type, title, description, scheduled_at, responsible_name, location, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [protocol, client_account_id, contract_id||null, ticket_id||null, visit_type||'visita_tecnica', title, description||null, scheduled_at, responsible_name||null, location||null, session.identityId||null]
        );
        await pool.query(`INSERT INTO cli_visit_history (visit_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [rows[0].id, null, 'agendada', session.identityId||null, 'Criação inicial']);
        await auditLog({ action:"cli_visit_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, account_id: client_account_id } });
        return json(res,201,{ visit: rows[0] });
      } catch(e) { return json(res,500,{ error:"internal", detail:e.message }); }
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, status, confirmed_at, rescheduled_to, reschedule_reason, responsible_name } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      const cur = await pool.query(`SELECT * FROM cli_visits WHERE id=$1`, [id]);
      if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
      const prev = cur.rows[0];
      if (status) {
        const allowed = ['agendada','confirmada','reagendada','realizada','cancelada','nao_compareceu'];
        if (!allowed.includes(status)) return json(res,400,{ error:"invalid_status" });
        if (status==='confirmada') {
          await pool.query(`UPDATE cli_visits SET status='confirmada', confirmed_at=NOW(), responsible_name=COALESCE($2,responsible_name) WHERE id=$1`, [id, responsible_name||null]);
          await pool.query(`INSERT INTO cli_visit_history (visit_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [id, prev.status, 'confirmada', session.identityId||null, 'Confirmação']);
          await auditLog({ action:"cli_visit_confirm", actor: session.identityId||"unknown", target: id, meta:{ previous: prev.status, next:'confirmada' } });
        } else if (status==='reagendada') {
          if (!rescheduled_to || !reschedule_reason) return json(res,400,{ error:"reschedule_to_and_reason_required", note:"reagendamento e histórico obrigatório" });
          if (String(reschedule_reason).length <10 || String(reschedule_reason).length>1000) return json(res,400,{ error:"reschedule_reason_10_1000" });
          await pool.query(`UPDATE cli_visits SET status='reagendada', rescheduled_from=$2, rescheduled_to=$3, reschedule_reason=$4, responsible_name=COALESCE($5,responsible_name) WHERE id=$1`, [id, prev.scheduled_at, rescheduled_to, reschedule_reason, responsible_name||null]);
          await pool.query(`INSERT INTO cli_visit_history (visit_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [id, prev.status, 'reagendada', session.identityId||null, reschedule_reason]);
          await auditLog({ action:"cli_visit_reschedule", actor: session.identityId||"unknown", target: id, meta:{ from: prev.scheduled_at, to: rescheduled_to, reason: reschedule_reason } });
        } else {
          await pool.query(`UPDATE cli_visits SET status=$2, responsible_name=COALESCE($3,responsible_name) WHERE id=$1`, [id, status, responsible_name||null]);
          await pool.query(`INSERT INTO cli_visit_history (visit_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [id, prev.status, status, session.identityId||null, body.reason||null]);
          await auditLog({ action:"cli_visit_status", actor: session.identityId||"unknown", target: id, meta:{ previous: prev.status, next: status } });
        }
        const updated = await pool.query(`SELECT * FROM cli_visits WHERE id=$1`, [id]);
        return json(res,200,{ visit: updated.rows[0] });
      }
      return json(res,400,{ error:"missing_status" });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleVisitHistory(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const visitId = url.searchParams.get("visit_id");
    if (!visitId) return json(res,400,{ error:"missing_visit_id" });
    const { rows } = await pool.query(`SELECT * FROM cli_visit_history WHERE visit_id=$1 ORDER BY created_at DESC`, [visitId]);
    return json(res,200,{ history: rows });
  }

  // CLI-08 relatórios execução medição/aceite revisão
  async function handleReportsV2(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      const status = url.searchParams.get("status");
      let q=`SELECT * FROM cli_client_reports_v2 WHERE 1=1`;
      const params=[]; let idx=1;
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      // client only sees próprio + não privado? but spec is_private true default
      const role = (session.role||session.userRole||"").toLowerCase();
      if (role==="cliente") {
        try {
          const grants = await pool.query(`SELECT client_account_id FROM client_access_grants WHERE identity_id=$1 AND revoked_at IS NULL`, [session.identityId]);
          const allowed = grants.rows.map(r=>r.client_account_id);
          const filtered = rows.filter(r=> allowed.includes(r.client_account_id));
          return json(res,200,{ reports: filtered });
        } catch {}
      }
      return json(res,200,{ reports: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contract_id, visit_id, report_type, title, content, period_start, period_end } = body;
      if (!client_account_id || !title || !content) return json(res,400,{ error:"missing_fields" });
      if (String(title).length <5 || String(title).length>200) return json(res,400,{ error:"title_5_200" });
      if (String(content).length <20 || String(content).length>10000) return json(res,400,{ error:"content_20_10000" });
      if (period_start && period_end && new Date(period_end) < new Date(period_start)) return json(res,400,{ error:"period_end_before_start" });
      const protocol = generateProtocol("REP-CLI");
      try {
        const { rows } = await pool.query(
          `INSERT INTO cli_client_reports_v2 (protocol, client_account_id, contract_id, visit_id, report_type, title, content, period_start, period_end, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [protocol, client_account_id, contract_id||null, visit_id||null, report_type||'execucao', title, content, period_start||null, period_end||null, session.identityId||null]
        );
        await pool.query(`INSERT INTO cli_client_report_history_v2 (report_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [rows[0].id, null, 'rascunho', session.identityId||null, 'Criação inicial']);
        await auditLog({ action:"cli_report_v2_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, account_id: client_account_id, report_type } });
        return json(res,201,{ report: rows[0] });
      } catch(e) { return json(res,500,{ error:"internal", detail:e.message }); }
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, status, review_notes, reason } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      const cur = await pool.query(`SELECT * FROM cli_client_reports_v2 WHERE id=$1`, [id]);
      if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
      const prev = cur.rows[0];
      if (status) {
        const allowed = ['rascunho','em_revisao','aprovado','rejeitado','enviado'];
        if (!allowed.includes(status)) return json(res,400,{ error:"invalid_status" });
        if (status==='em_revisao') {
          await pool.query(`UPDATE cli_client_reports_v2 SET status='em_revisao', reviewed_by_identity=$2, reviewed_at=NOW(), review_notes=$3 WHERE id=$1`, [id, session.identityId||null, review_notes||null]);
        } else if (status==='aprovado') {
          // requires reviewed
          if (!prev.reviewed_at) return json(res,400,{ error:"review_required_before_approve", note:"revisão obrigatória antes de aprovação" });
          await pool.query(`UPDATE cli_client_reports_v2 SET status='aprovado', approved_by_identity=$2, approved_at=NOW(), review_notes=COALESCE($3,review_notes) WHERE id=$1`, [id, session.identityId||null, review_notes||null]);
        } else if (status==='enviado') {
          if (prev.status!=='aprovado') return json(res,400,{ error:"must_be_approved_before_send" });
          await pool.query(`UPDATE cli_client_reports_v2 SET status='enviado', sent_at=NOW() WHERE id=$1`, [id]);
        } else {
          await pool.query(`UPDATE cli_client_reports_v2 SET status=$2, review_notes=COALESCE($3,review_notes) WHERE id=$1`, [id, status, review_notes||null]);
        }
        await pool.query(`INSERT INTO cli_client_report_history_v2 (report_id, previous_status, next_status, changed_by_identity, reason, is_review) VALUES ($1,$2,$3,$4,$5,$6)`, [id, prev.status, status, session.identityId||null, reason||review_notes||null, status==='em_revisao' || status==='aprovado']);
        await auditLog({ action: status==='em_revisao' || status==='aprovado' ? "cli_report_v2_review" : "cli_report_v2_status", actor: session.identityId||"unknown", target: id, meta:{ previous: prev.status, next: status } });
        const updated = await pool.query(`SELECT * FROM cli_client_reports_v2 WHERE id=$1`, [id]);
        return json(res,200,{ report: updated.rows[0] });
      }
      return json(res,400,{ error:"missing_status" });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleReportHistoryV2(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const reportId = url.searchParams.get("report_id");
    if (!reportId) return json(res,400,{ error:"missing_report_id" });
    const { rows } = await pool.query(`SELECT * FROM cli_client_report_history_v2 WHERE report_id=$1 ORDER BY created_at DESC`, [reportId]);
    return json(res,200,{ history: rows });
  }

  return {
    handleTicketsV2,
    handleTicketMessages,
    handleTicketAttachments,
    handleTicketHistory,
    handleTicketSlaPauses,
    handleVisits,
    handleVisitHistory,
    handleReportsV2,
    handleReportHistoryV2,
  };
}
