// CRM-01..CRM-10: cadastro central, contatos, oportunidades, funil, kanban, agenda, cadências, carteira
// CRM-03: CSV import com prévia, validação, mapeamento, relatório, deduplicação revisável e prevenção fórmula

const COMPANY_TYPES = new Set(["prospect","client","partner"]);
const COMPANY_STATUS = new Set(["active","inactive","archived"]);
const CONTACT_ROLES = new Set(["decisor","influenciador","usuario","financeiro","outro"]);
const OPP_STAGES = new Set(["novo","qualificacao","vistoria","proposta_elaboracao","proposta_enviada","negociacao","ganho","perdido"]);
const OPP_PRIORITY = new Set(["baixa","media","alta","critica"]);
const TASK_STATUS = new Set(["aberta","em_andamento","concluida","cancelada"]);
const VISIT_STATUS = new Set(["solicitada","em_agendamento","confirmada","realizada","cancelada"]);
const INTERACTION_TYPES = new Set(["ligacao","reuniao","email","whatsapp","visita","nota","outro"]);
const IMPORT_TYPES = new Set(["companies","contacts"]);
const IMPORT_STATUS = new Set(["pending","processing","completed","failed"]);

function isValidUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function sanitizeText(s, max) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (t.length === 0) return null;
  if (t.length > max) return null;
  return t;
}

// --- CSV helpers for CRM-03 ---
function parseCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' ) {
      if (inQuotes && line[i+1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result.map(v => v.trim());
}

function parseCsv(text) {
  if (typeof text !== "string") return { headers: [], rows: [] };
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map(h => h.trim()).filter(Boolean);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cols[j] !== undefined ? cols[j] : "";
    }
    rows.push(obj);
  }
  return { headers, rows };
}

function sanitizeForCsvExport(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.length === 0) return "";
  // Prevenção de fórmula maliciosa: = + - @ \t \r no início (OWASP CSV Injection)
  const trimmed = s.trimStart();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    return "'" + s;
  }
  return s;
}

function escapeCsvCell(value) {
  const sanitized = sanitizeForCsvExport(value);
  const s = String(sanitized);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCsv(headers, rows) {
  const lines = [];
  lines.push(headers.map(h => escapeCsvCell(h)).join(","));
  for (const r of rows) {
    lines.push(headers.map(h => escapeCsvCell(r[h] ?? "")).join(","));
  }
  return lines.join("\r\n");
}

function autoMapHeaders(headers) {
  const map = {};
  const lower = headers.map(h => ({ orig: h, low: h.toLowerCase().trim() }));
  for (const { orig, low } of lower) {
    if (["nome","nome fantasia","empresa","razao","razão social","display_name","displayname"].includes(low)) map[orig] = "display_name";
    else if (["cnpj","cpf","documento","document_ref","documentref","cnpj/cpf"].includes(low)) map[orig] = "document_ref";
    else if (["tipo documento","document_type","tipo doc"].includes(low)) map[orig] = "document_type";
    else if (["segmento","segment","setor"].includes(low)) map[orig] = "segment";
    else if (["cidade","city","município","municipio"].includes(low)) map[orig] = "city";
    else if (["estado","state","uf"].includes(low)) map[orig] = "state";
    else if (["tipo","type","tipo empresa"].includes(low)) map[orig] = "type";
    else if (["email","e-mail"].includes(low)) map[orig] = "email";
    else if (["telefone","phone","tel","celular"].includes(low)) map[orig] = "phone";
    else if (["origem","origin","canal","channel"].includes(low)) map[orig] = "origin";
    else if (["campanha","campaign"].includes(low)) map[orig] = "campaign";
    else if (["responsavel","responsável","responsible","responsible_name"].includes(low)) map[orig] = "responsible_name";
    else if (["observacao","observação","notes","obs"].includes(low)) map[orig] = "notes";
    else if (["cargo","role","funcao","função"].includes(low)) map[orig] = "role";
    else if (["empresa nome","company_name","empresa"].includes(low) && !map[orig]) map[orig] = "company_name";
  }
  return map;
}

function validateCompanyMappedRow(mapped) {
  const errors = [];
  const displayName = mapped.display_name ? String(mapped.display_name).trim() : "";
  if (!displayName || displayName.length < 1 || displayName.length > 200) errors.push({ field: "display_name", message: "nome obrigatório 1-200" });
  if (mapped.document_ref) {
    const dr = String(mapped.document_ref).trim();
    if (dr.length > 32) errors.push({ field: "document_ref", message: "documento máx 32" });
    if (dr.length > 0 && !/^[a-zA-Z0-9.\-\/]+$/.test(dr)) errors.push({ field: "document_ref", message: "documento formato inválido" });
  }
  if (mapped.type) {
    const t = String(mapped.type).toLowerCase().trim();
    if (t && !COMPANY_TYPES.has(t)) errors.push({ field: "type", message: "tipo deve ser prospect/client/partner" });
  }
  if (mapped.city && String(mapped.city).length > 100) errors.push({ field: "city", message: "cidade máx 100" });
  if (mapped.segment && String(mapped.segment).length > 100) errors.push({ field: "segment", message: "segmento máx 100" });
  if (mapped.state && String(mapped.state).length > 2) errors.push({ field: "state", message: "estado máx 2" });
  if (mapped.email) {
    const email = String(mapped.email).trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ field: "email", message: "email inválido" });
  }
  if (mapped.phone && String(mapped.phone).length > 30) errors.push({ field: "phone", message: "telefone máx 30" });
  if (mapped.document_type) {
    const dt = String(mapped.document_type).toLowerCase().trim();
    if (dt && !["cnpj","cpf","other"].includes(dt)) errors.push({ field: "document_type", message: "document_type cnpj/cpf/other" });
  }
  // Prevenção fórmula maliciosa na importação: alerta se valor começa com = + - @
  for (const [k,v] of Object.entries(mapped)) {
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(v.trimStart())) {
      errors.push({ field: k, message: "valor com potencial fórmula (= + - @) - será sanitizado na exportação" });
    }
  }
  return errors;
}

export function createCrmApi(ctx) {
  // ctx: { json, readJson, sameOrigin, getPool, readAdminSession, clientIp }

  async function audit(db, { action, target, result, actorKind, actorId, category }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,$6)",
        [actorKind || "system", actorId || null, action, target || null, result, category || "none"]
      );
    } catch (e) {
      console.error("crm audit failed", e?.message);
    }
  }

  function requireMethod(req, res, allowed) {
    if (!allowed.includes(req.method)) {
      ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: allowed.join(", ") });
      return false;
    }
    return true;
  }

  function requireSameOrigin(req, res) {
    if (ctx.sameOrigin(req)) return true;
    ctx.json(res, 403, { error: "same_origin_required" });
    return false;
  }

  async function requireAdminSession(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "admin_session_required" });
      return null;
    }
    return session;
  }

  // --- Companies ---
  async function handleCompanies(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      const type = url.searchParams.get("type");
      const status = url.searchParams.get("status");
      const city = url.searchParams.get("city");
      const search = url.searchParams.get("search");
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

      if (type && !COMPANY_TYPES.has(type)) return ctx.json(res, 400, { error: "invalid_type" });
      if (status && !COMPANY_STATUS.has(status)) return ctx.json(res, 400, { error: "invalid_status" });

      try {
        const conditions = [];
        const values = [];
        let idx = 1;
        if (type) { conditions.push(`type = $${idx++}`); values.push(type); }
        if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
        if (city) { conditions.push(`city ILIKE $${idx++}`); values.push(`%${city}%`); }
        if (search) { conditions.push(`(display_name ILIKE $${idx} OR document_ref ILIKE $${idx})`); values.push(`%${search}%`); idx++; }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const countRes = await db.query(`SELECT COUNT(*)::int as total FROM crm_companies ${where}`, values);
        const listRes = await db.query(`SELECT * FROM crm_companies ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);

        return ctx.json(res, 200, { companies: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
      } catch (e) {
        console.error("crm companies list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const displayName = sanitizeText(body?.display_name || body?.displayName, 200);
      const documentRef = sanitizeText(body?.document_ref || body?.documentRef, 32);
      const documentType = body?.document_type || body?.documentType || null;
      const segment = sanitizeText(body?.segment, 100);
      const city = sanitizeText(body?.city, 100);
      const state = body?.state ? String(body.state).trim().slice(0,2).toUpperCase() : null;
      const type = String(body?.type || "prospect").toLowerCase();
      const channels = Array.isArray(body?.channels) ? body.channels : [];
      const responsibleName = sanitizeText(body?.responsible_name || body?.responsibleName, 120);
      const parentCompanyId = body?.parent_company_id || body?.parentCompanyId || null;
      const notes = sanitizeText(body?.notes, 1000);
      const origin = sanitizeText(body?.origin, 100);
      const campaign = sanitizeText(body?.campaign, 100);

      if (!displayName) return ctx.json(res, 400, { error: "invalid_display_name" });
      if (!COMPANY_TYPES.has(type)) return ctx.json(res, 400, { error: "invalid_type" });
      if (documentType && !["cnpj","cpf","other"].includes(documentType)) return ctx.json(res, 400, { error: "invalid_document_type" });
      if (parentCompanyId && !isValidUuid(parentCompanyId)) return ctx.json(res, 400, { error: "invalid_parent_company_id" });

      try {
        const id = crypto.randomUUID();
        const result = await db.query(
          `INSERT INTO crm_companies (id, display_name, document_ref, document_type, segment, city, state, type, channels, responsible_name, parent_company_id, notes, origin, campaign, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [id, displayName, documentRef, documentType, segment, city, state, type, JSON.stringify(channels), responsibleName, parentCompanyId, notes, origin, campaign, session.role, session.identityId]
        );

        await audit(db, { action: "crm_company_create", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 201, { company: result.rows[0] });
      } catch (e) {
        if (String(e.code) === "23505") return ctx.json(res, 409, { error: "document_exists" });
        console.error("crm company create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleCompanyById(req, res, id) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_company_id" });

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      try {
        const comp = await db.query("SELECT * FROM crm_companies WHERE id = $1", [id]);
        if (!comp.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });
        const [units, contacts, opps] = await Promise.all([
          db.query("SELECT * FROM crm_company_units WHERE company_id = $1 ORDER BY is_main DESC, created_at", [id]),
          db.query("SELECT * FROM crm_contacts WHERE company_id = $1 ORDER BY is_primary DESC, created_at DESC", [id]),
          db.query("SELECT * FROM crm_opportunities WHERE company_id = $1 ORDER BY created_at DESC LIMIT 50", [id]),
        ]);
        return ctx.json(res, 200, { company: comp.rows[0], units: units.rows, contacts: contacts.rows, opportunities: opps.rows });
      } catch (e) {
        console.error("crm company get failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const fields = [];
      const values = [];
      let idx = 1;

      const updatable = ["display_name","displayName","segment","city","state","type","status","responsible_name","responsibleName","notes","origin","campaign"];
      const mapping = { displayName: "display_name", responsibleName: "responsible_name" };

      for (const key of updatable) {
        if (body[key] !== undefined) {
          const col = mapping[key] || key;
          let val = body[key];
          if (col === "display_name") {
            val = sanitizeText(val, 200);
            if (!val) return ctx.json(res, 400, { error: "invalid_display_name" });
          }
          if (col === "type" && !COMPANY_TYPES.has(String(val).toLowerCase())) return ctx.json(res, 400, { error: "invalid_type" });
          if (col === "status" && !COMPANY_STATUS.has(String(val).toLowerCase())) return ctx.json(res, 400, { error: "invalid_status" });
          fields.push(`${col} = $${idx++}`);
          values.push(col === "type" || col === "status" ? String(val).toLowerCase() : val);
        }
      }

      if (fields.length === 0) return ctx.json(res, 400, { error: "no_fields" });

      try {
        values.push(id);
        const result = await db.query(`UPDATE crm_companies SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);
        if (!result.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });

        await audit(db, { action: "crm_company_update", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 200, { company: result.rows[0] });
      } catch (e) {
        console.error("crm company update failed", e?.message);
        return ctx.json(res, 503, { error: "update_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, PATCH, PUT" });
  }

  // --- Contacts ---
  async function handleContacts(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      const companyId = url.searchParams.get("companyId") || url.searchParams.get("company_id");
      const search = url.searchParams.get("search");
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

      if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });

      try {
        const conditions = [];
        const values = [];
        let idx = 1;
        if (companyId) { conditions.push(`company_id = $${idx++}`); values.push(companyId); }
        if (search) { conditions.push(`(display_name ILIKE $${idx} OR email ILIKE $${idx})`); values.push(`%${search}%`); idx++; }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const countRes = await db.query(`SELECT COUNT(*)::int as total FROM crm_contacts ${where}`, values);
        const listRes = await db.query(`SELECT * FROM crm_contacts ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);
        return ctx.json(res, 200, { contacts: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
      } catch (e) {
        console.error("crm contacts list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const companyId = body?.company_id || body?.companyId || null;
      const displayName = sanitizeText(body?.display_name || body?.displayName, 200);
      const email = sanitizeText(body?.email, 254);
      const phone = sanitizeText(body?.phone, 30);
      const role = body?.role ? String(body.role).toLowerCase() : null;
      const buyingRole = body?.buying_role || body?.buyingRole ? String(body.buying_role || body.buyingRole).toLowerCase() : null;
      const restrictions = sanitizeText(body?.restrictions, 500);
      const origin = sanitizeText(body?.origin, 100);
      const isPrimary = !!body?.is_primary || !!body?.isPrimary;

      if (!displayName) return ctx.json(res, 400, { error: "invalid_display_name" });
      if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (role && !CONTACT_ROLES.has(role)) return ctx.json(res, 400, { error: "invalid_role" });
      if (buyingRole && !CONTACT_ROLES.has(buyingRole)) return ctx.json(res, 400, { error: "invalid_buying_role" });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ctx.json(res, 400, { error: "invalid_email" });

      try {
        const id = crypto.randomUUID();
        const result = await db.query(
          `INSERT INTO crm_contacts (id, company_id, display_name, email, phone, role, buying_role, restrictions, origin, is_primary, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [id, companyId, displayName, email, phone, role, buyingRole, restrictions, origin, isPrimary, session.identityId]
        );

        await audit(db, { action: "crm_contact_create", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 201, { contact: result.rows[0] });
      } catch (e) {
        if (String(e.code) === "23505") return ctx.json(res, 409, { error: "contact_exists" });
        console.error("crm contact create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  // --- Opportunities ---
  async function handleOpportunities(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      const companyId = url.searchParams.get("companyId");
      const stage = url.searchParams.get("stage");
      const responsibleId = url.searchParams.get("responsibleId");
      const priority = url.searchParams.get("priority");
      const search = url.searchParams.get("search");
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

      if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (stage && !OPP_STAGES.has(stage)) return ctx.json(res, 400, { error: "invalid_stage" });
      if (priority && !OPP_PRIORITY.has(priority)) return ctx.json(res, 400, { error: "invalid_priority" });

      try {
        const conditions = [];
        const values = [];
        let idx = 1;
        if (companyId) { conditions.push(`company_id = $${idx++}`); values.push(companyId); }
        if (stage) { conditions.push(`stage = $${idx++}`); values.push(stage); }
        if (responsibleId) { conditions.push(`responsible_id = $${idx++}`); values.push(responsibleId); }
        if (priority) { conditions.push(`priority = $${idx++}`); values.push(priority); }
        if (search) { conditions.push(`(title ILIKE $${idx} OR need_description ILIKE $${idx})`); values.push(`%${search}%`); idx++; }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const countRes = await db.query(`SELECT COUNT(*)::int as total FROM crm_opportunities ${where}`, values);
        const listRes = await db.query(`SELECT * FROM crm_opportunities ${where} ORDER BY next_action_date NULLS LAST, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);

        return ctx.json(res, 200, { opportunities: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
      } catch (e) {
        console.error("crm opps list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const companyId = body?.company_id || body?.companyId;
      const contactId = body?.contact_id || body?.contactId || null;
      const title = sanitizeText(body?.title, 200);
      const serviceId = body?.service_id || body?.serviceId || null;
      const serviceName = sanitizeText(body?.service_name || body?.serviceName, 100);
      const needDescription = sanitizeText(body?.need_description || body?.needDescription, 2000);
      const forecastDate = body?.forecast_date || body?.forecastDate ? String(body.forecast_date || body.forecastDate) : null;
      const estimatedValue = body?.estimated_value || body?.estimatedValue ? Number(body.estimated_value || body.estimatedValue) : null;
      const nextAction = sanitizeText(body?.next_action || body?.nextAction, 200);
      const nextActionDate = body?.next_action_date || body?.nextActionDate ? new Date(body.next_action_date || body.nextActionDate) : null;
      const origin = sanitizeText(body?.origin, 100);
      const campaign = sanitizeText(body?.campaign, 100);
      const priority = String(body?.priority || "media").toLowerCase();
      const publicLeadId = body?.public_lead_id || body?.publicLeadId || null;

      if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (!title) return ctx.json(res, 400, { error: "invalid_title" });
      if (contactId && !isValidUuid(contactId)) return ctx.json(res, 400, { error: "invalid_contact_id" });
      if (publicLeadId && !isValidUuid(publicLeadId)) return ctx.json(res, 400, { error: "invalid_public_lead_id" });
      if (!OPP_PRIORITY.has(priority)) return ctx.json(res, 400, { error: "invalid_priority" });
      if (estimatedValue !== null && (isNaN(estimatedValue) || estimatedValue < 0)) return ctx.json(res, 400, { error: "invalid_estimated_value" });
      if (nextActionDate && isNaN(nextActionDate.getTime())) return ctx.json(res, 400, { error: "invalid_next_action_date" });

      try {
        const id = crypto.randomUUID();
        const result = await db.query(
          `INSERT INTO crm_opportunities (id, company_id, contact_id, title, service_id, service_name, need_description, responsible_id, responsible_name, forecast_date, estimated_value, next_action, next_action_date, origin, campaign, priority, public_lead_id, created_by_id, stage)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'novo') RETURNING *`,
          [id, companyId, contactId, title, serviceId, serviceName, needDescription, session.identityId, session.role, forecastDate, estimatedValue, nextAction, nextActionDate, origin, campaign, priority, publicLeadId, session.identityId]
        );

        await db.query(
          `INSERT INTO crm_opportunity_stages (id, opportunity_id, previous_stage, next_stage, changed_by_id, changed_by_role, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [crypto.randomUUID(), id, null, "novo", session.identityId, session.role, "criação"]
        );

        await audit(db, { action: "crm_opportunity_create", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 201, { opportunity: result.rows[0] });
      } catch (e) {
        console.error("crm opp create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleOpportunityById(req, res, id) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      try {
        const opp = await db.query("SELECT * FROM crm_opportunities WHERE id = $1", [id]);
        if (!opp.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        const [stages, tasks, interactions, visits] = await Promise.all([
          db.query("SELECT * FROM crm_opportunity_stages WHERE opportunity_id = $1 ORDER BY created_at DESC", [id]),
          db.query("SELECT * FROM crm_tasks WHERE opportunity_id = $1 AND responsible_id = $2 AND EXISTS (SELECT 1 FROM crm_opportunities o WHERE o.id=$1 AND (o.responsible_id=$2 OR (o.responsible_id IS NULL AND o.created_by_id=$2))) ORDER BY due_date NULLS LAST, created_at DESC LIMIT 200", [id, ["comercial", "admin", "marcelo", "ti"].includes(session.role) ? session.identityId : null]),
          // CRM-07: the interaction history follows the exact same ownership
          // rule as the dedicated /interactions endpoint below, so this
          // legacy detail route can never leak it to an unauthorized viewer.
          db.query("SELECT * FROM crm_interactions WHERE opportunity_id = $1 AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM crm_opportunities o WHERE o.id=$1 AND (o.responsible_id=$2 OR (o.responsible_id IS NULL AND o.created_by_id=$2))) ORDER BY occurred_at DESC LIMIT 50", [id, ["comercial", "admin", "marcelo", "ti"].includes(session.role) ? session.identityId : null]),
          // CRM-08: a agenda segue exatamente a política da rota dedicada
          // /visits — responsável pela oportunidade ou participante convidado
          // da própria visita. Esta rota legada não é mais um atalho de leitura.
          db.query(
            `SELECT * FROM crm_visits v
              WHERE v.opportunity_id = $1
                AND (
                  EXISTS (SELECT 1 FROM crm_opportunities o WHERE o.id=$1 AND (o.responsible_id=$2 OR (o.responsible_id IS NULL AND o.created_by_id=$2)))
                  OR EXISTS (SELECT 1 FROM crm_visit_participants p WHERE p.visit_id=v.id AND p.identity_id=$2)
                )
              ORDER BY v.scheduled_at DESC LIMIT 200`,
            [id, ["comercial", "admin", "marcelo", "ti"].includes(session.role) ? session.identityId : null],
          ),
        ]);
        return ctx.json(res, 200, { opportunity: opp.rows[0], stages: stages.rows, tasks: tasks.rows, interactions: interactions.rows, visits: visits.rows });
      } catch (e) {
        console.error("crm opp get failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (req.method === "PATCH") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const newStage = body?.stage ? String(body.stage).toLowerCase() : null;
      const lossReason = sanitizeText(body?.loss_reason || body?.lossReason, 500);
      const nextAction = body?.next_action || body?.nextAction ? sanitizeText(body.next_action || body.nextAction, 200) : undefined;
      const nextActionDate = body?.next_action_date || body?.nextActionDate ? new Date(body.next_action_date || body.nextActionDate) : undefined;
      const estimatedValue = body?.estimated_value || body?.estimatedValue !== undefined ? Number(body.estimated_value || body.estimatedValue) : undefined;

      if (newStage && !OPP_STAGES.has(newStage)) return ctx.json(res, 400, { error: "invalid_stage" });
      if (newStage === "perdido" && !lossReason) return ctx.json(res, 400, { error: "loss_reason_required" });
      if (nextActionDate && isNaN(nextActionDate.getTime())) return ctx.json(res, 400, { error: "invalid_next_action_date" });

      try {
        const current = await db.query("SELECT stage FROM crm_opportunities WHERE id = $1", [id]);
        if (!current.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        const prevStage = current.rows[0].stage;

        const updates = [];
        const values = [];
        let idx = 1;

        if (newStage) {
          updates.push(`stage = $${idx++}`);
          values.push(newStage);
          updates.push(`stage_changed_at = NOW()`);
          updates.push(`is_won = $${idx++}`);
          values.push(newStage === "ganho");
          updates.push(`is_lost = $${idx++}`);
          values.push(newStage === "perdido");
          if (lossReason) {
            updates.push(`loss_reason = $${idx++}`);
            values.push(lossReason);
          }
        }

        if (nextAction !== undefined) { updates.push(`next_action = $${idx++}`); values.push(nextAction); }
        if (nextActionDate !== undefined) { updates.push(`next_action_date = $${idx++}`); values.push(nextActionDate); }
        if (estimatedValue !== undefined) {
          if (isNaN(estimatedValue) || estimatedValue < 0) return ctx.json(res, 400, { error: "invalid_estimated_value" });
          updates.push(`estimated_value = $${idx++}`);
          values.push(estimatedValue);
        }

        if (updates.length === 0) return ctx.json(res, 400, { error: "no_fields" });

        values.push(id);
        const result = await db.query(`UPDATE crm_opportunities SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);

        if (newStage && prevStage !== newStage) {
          await db.query(
            `INSERT INTO crm_opportunity_stages (id, opportunity_id, previous_stage, next_stage, changed_by_id, changed_by_role, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [crypto.randomUUID(), id, prevStage, newStage, session.identityId, session.role, lossReason || body?.reason || null]
          );
          await audit(db, { action: "crm_opportunity_stage_change", target: `${id}:${prevStage}->${newStage}`, result: "allowed", actorKind: session.role, actorId: session.identityId });
        } else {
          await audit(db, { action: "crm_opportunity_update", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });
        }

        return ctx.json(res, 200, { opportunity: result.rows[0] });
      } catch (e) {
        console.error("crm opp update failed", e?.message);
        return ctx.json(res, 503, { error: "update_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, PATCH" });
  }

  // --- Convert lead to opportunity (CRM-04) ---
  async function handleLeadConvert(req, res, leadId) {
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (!isValidUuid(leadId)) return ctx.json(res, 400, { error: "invalid_lead_id" });

    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const companyId = body?.company_id || body?.companyId || null;
    const createCompany = !!body?.create_company || !!body?.createCompany;
    const companyName = sanitizeText(body?.company_name || body?.companyName, 200);

    if (!companyId && !createCompany) return ctx.json(res, 400, { error: "company_required" });
    if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
    if (createCompany && !companyName) return ctx.json(res, 400, { error: "invalid_company_name" });

    try {
      const leadRes = await db.query("SELECT * FROM public_leads WHERE id = $1", [leadId]);
      const lead = leadRes.rows[0];
      if (!lead) return ctx.json(res, 404, { error: "lead_not_found" });

      const existingOpp = await db.query("SELECT id FROM crm_opportunities WHERE public_lead_id = $1", [leadId]);
      if (existingOpp.rows[0]) {
        return ctx.json(res, 200, { opportunityId: existingOpp.rows[0].id, dedup: true, message: "Lead já convertido anteriormente, histórico preservado" });
      }

      let finalCompanyId = companyId;

      if (createCompany) {
        const dupCheck = await db.query("SELECT id FROM crm_companies WHERE display_name ILIKE $1 OR document_ref = $2", [companyName, lead.phone]);
        if (dupCheck.rows[0]) {
          finalCompanyId = dupCheck.rows[0].id;
        } else {
          finalCompanyId = crypto.randomUUID();
          await db.query(
            `INSERT INTO crm_companies (id, display_name, city, type, origin, campaign, created_by, created_by_id)
             VALUES ($1,$2,$3,'prospect',$4,$5,$6,$7)`,
            [finalCompanyId, companyName, lead.city, lead.origin, lead.campaign, session.role, session.identityId]
          );
          await audit(db, { action: "crm_company_create", target: finalCompanyId, result: "allowed", actorKind: session.role, actorId: session.identityId });
        }
      }

      let contactId = null;
      if (lead.email || lead.phone) {
        const contactCheck = await db.query("SELECT id FROM crm_contacts WHERE company_id = $1 AND (email = $2 OR phone = $3)", [finalCompanyId, lead.email, lead.phone]);
        if (contactCheck.rows[0]) {
          contactId = contactCheck.rows[0].id;
        } else {
          contactId = crypto.randomUUID();
          await db.query(
            `INSERT INTO crm_contacts (id, company_id, display_name, email, phone, origin, is_primary, created_by_id)
             VALUES ($1,$2,$3,$4,$5,$6,true,$7)`,
            [contactId, finalCompanyId, lead.name, lead.email, lead.phone, lead.origin || lead.channel, session.identityId]
          );
        }
      }

      const oppId = crypto.randomUUID();
      const title = `Oportunidade - ${lead.name} - ${lead.services[0] || "Serviços gerais"}`;
      await db.query(
        `INSERT INTO crm_opportunities (id, company_id, contact_id, title, service_name, need_description, origin, campaign, public_lead_id, created_by_id, stage, next_action, next_action_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'novo',$11,NOW() + INTERVAL '2 days')`,
        [oppId, finalCompanyId, contactId, title, lead.services[0] || null, lead.details, lead.origin, lead.campaign, leadId, session.identityId, `Qualificar lead ${leadId.slice(0,8)} - ${lead.city}`]
      );

      await db.query(
        `INSERT INTO crm_opportunity_stages (id, opportunity_id, previous_stage, next_stage, changed_by_id, changed_by_role, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [crypto.randomUUID(), oppId, null, "novo", session.identityId, session.role, `Conversão do lead ${leadId} preservando histórico`]
      );

      await audit(db, { action: "crm_lead_convert", target: `${leadId}->${oppId}`, result: "allowed", actorKind: session.role, actorId: session.identityId });
      await audit(db, { action: "crm_opportunity_create", target: oppId, result: "allowed", actorKind: session.role, actorId: session.identityId });

      return ctx.json(res, 201, { opportunityId: oppId, companyId: finalCompanyId, contactId, converted: true });
    } catch (e) {
      console.error("crm lead convert failed", e?.message);
      return ctx.json(res, 503, { error: "convert_failed" });
    }
  }

  // --- CRM-03: CSV Import ---
  async function handleImportsList(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET"])) return;
    if (!requireSameOrigin(req, res)) return;
    const db = ctx.getPool();
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
    try {
      const countRes = await db.query("SELECT COUNT(*)::int as total FROM crm_import_batches");
      const listRes = await db.query("SELECT * FROM crm_import_batches ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
      return ctx.json(res, 200, { imports: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
    } catch (e) {
      console.error("crm imports list failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  async function handleImportPreview(req, res) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;
    const db = ctx.getPool();

    let body;
    try { body = await ctx.readJson(req, 1024 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const fileName = sanitizeText(body?.fileName || body?.file_name, 255) || "import.csv";
    const csvContent = body?.csvContent || body?.csv_content;
    const importType = (body?.type || "companies").toLowerCase();
    let mapping = body?.mapping && typeof body.mapping === "object" ? body.mapping : null;

    if (!IMPORT_TYPES.has(importType)) return ctx.json(res, 400, { error: "invalid_type" });
    if (typeof csvContent !== "string" || csvContent.trim().length === 0) return ctx.json(res, 400, { error: "invalid_csv_content" });
    if (csvContent.length > 800_000) return ctx.json(res, 400, { error: "csv_too_large" });

    const parsed = parseCsv(csvContent);
    if (parsed.headers.length === 0) return ctx.json(res, 400, { error: "csv_no_headers" });
    if (parsed.rows.length === 0) return ctx.json(res, 400, { error: "csv_no_rows" });
    if (parsed.rows.length > 5000) return ctx.json(res, 400, { error: "csv_too_many_rows", max: 5000 });

    if (!mapping) mapping = autoMapHeaders(parsed.headers);

    // Build mapped rows with validation and dedup
    const previewRows = [];
    let validCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;

    // Pre-fetch existing companies for dedup (by document_ref and display_name)
    const docRefs = [];
    const displayNames = [];
    for (const raw of parsed.rows) {
      const mapped = {};
      for (const [csvHeader, internalField] of Object.entries(mapping)) {
        if (raw[csvHeader] !== undefined) mapped[internalField] = String(raw[csvHeader]).trim();
      }
      if (mapped.document_ref) docRefs.push(mapped.document_ref);
      if (mapped.display_name) displayNames.push(mapped.display_name);
    }

    const existingByDoc = new Map();
    const existingByName = new Map();
    try {
      if (docRefs.length > 0) {
        const uniqDocs = [...new Set(docRefs.filter(Boolean))].slice(0, 200);
        if (uniqDocs.length > 0) {
          const resDocs = await db.query(`SELECT id, display_name, document_ref FROM crm_companies WHERE document_ref = ANY($1)`, [uniqDocs]);
          for (const r of resDocs.rows) existingByDoc.set(r.document_ref, r);
        }
      }
      if (displayNames.length > 0) {
        const uniqNames = [...new Set(displayNames.filter(Boolean))].slice(0, 200);
        for (const name of uniqNames) {
          const r = await db.query(`SELECT id, display_name, document_ref FROM crm_companies WHERE display_name ILIKE $1 LIMIT 1`, [name]);
          if (r.rows[0]) existingByName.set(name.toLowerCase(), r.rows[0]);
        }
      }
    } catch (e) {
      console.error("dedup prefetch failed", e?.message);
    }

    for (let i = 0; i < parsed.rows.length; i++) {
      const raw = parsed.rows[i];
      const mapped = {};
      for (const [csvHeader, internalField] of Object.entries(mapping)) {
        if (raw[csvHeader] !== undefined) mapped[internalField] = String(raw[csvHeader]).trim();
      }

      const errors = validateCompanyMappedRow(mapped);
      let status = "valid";
      let dedupMatch = null;

      if (errors.length > 0 && errors.some(er => !er.message.includes("potencial fórmula"))) {
        status = "invalid";
        invalidCount++;
      } else {
        // Dedup check
        if (mapped.document_ref && existingByDoc.has(mapped.document_ref)) {
          status = "duplicate";
          dedupMatch = existingByDoc.get(mapped.document_ref);
          duplicateCount++;
        } else if (mapped.display_name && existingByName.has(mapped.display_name.toLowerCase())) {
          status = "duplicate";
          dedupMatch = existingByName.get(mapped.display_name.toLowerCase());
          duplicateCount++;
        } else {
          validCount++;
        }
      }

      if (status === "invalid" && errors.length === 0) {
        status = "valid";
        validCount++;
        invalidCount = Math.max(0, invalidCount - 1);
      }

      previewRows.push({
        row_number: i + 1,
        raw_data: raw,
        mapped_data: mapped,
        status,
        errors,
        dedup_match: dedupMatch,
      });
    }

    // Persist batch and rows
    try {
      const batchId = crypto.randomUUID();
      const report = {
        headers: parsed.headers,
        total: parsed.rows.length,
        valid: validCount,
        invalid: invalidCount,
        duplicate: duplicateCount,
        mapping,
        formula_prevention: "exportação sanitiza células iniciadas com = + - @ com prefixo ' (OWASP)",
        dedup_strategy: "document_ref exact + display_name ILIKE",
      };

      await db.query(
        `INSERT INTO crm_import_batches (id, file_name, type, status, total_rows, valid_rows, invalid_rows, duplicate_rows, mapping, report, created_by, created_by_id)
         VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
        [batchId, fileName, importType, parsed.rows.length, validCount, invalidCount, duplicateCount, JSON.stringify(mapping), JSON.stringify(report), session.role, session.identityId]
      );

      for (const pr of previewRows) {
        await db.query(
          `INSERT INTO crm_import_rows (id, batch_id, row_number, raw_data, mapped_data, status, errors, dedup_match_id, dedup_match_type, dedup_match_details, action)
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8,$9,$10::jsonb,$11)`,
          [
            crypto.randomUUID(),
            batchId,
            pr.row_number,
            JSON.stringify(pr.raw_data),
            JSON.stringify(pr.mapped_data),
            pr.status,
            JSON.stringify(pr.errors),
            pr.dedup_match?.id || null,
            pr.dedup_match ? "company" : null,
            JSON.stringify(pr.dedup_match || {}),
            pr.status === "valid" ? "create" : "skip",
          ]
        );
      }

      await audit(db, { action: "crm_import_create", target: batchId, result: "allowed", actorKind: session.role, actorId: session.identityId });

      return ctx.json(res, 201, {
        batchId,
        fileName,
        type: importType,
        report,
        rows: previewRows.slice(0, 100),
        totalRows: previewRows.length,
        previewTruncated: previewRows.length > 100,
      });
    } catch (e) {
      console.error("crm import preview failed", e?.message, e?.stack);
      return ctx.json(res, 503, { error: "import_failed" });
    }
  }

  async function handleImportById(req, res, id, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_import_id" });

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      try {
        const batchRes = await db.query("SELECT * FROM crm_import_batches WHERE id = $1", [id]);
        if (!batchRes.rows[0]) return ctx.json(res, 404, { error: "import_not_found" });
        const rowsRes = await db.query("SELECT * FROM crm_import_rows WHERE batch_id = $1 ORDER BY row_number", [id]);
        return ctx.json(res, 200, { batch: batchRes.rows[0], rows: rowsRes.rows });
      } catch (e) {
        console.error("crm import get failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (req.method === "POST" && url.pathname.endsWith("/commit")) {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 100 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const actions = body?.actions && typeof body.actions === "object" ? body.actions : {};

      try {
        const batchRes = await db.query("SELECT * FROM crm_import_batches WHERE id = $1 FOR UPDATE", [id]);
        const batch = batchRes.rows[0];
        if (!batch) return ctx.json(res, 404, { error: "import_not_found" });
        if (batch.status === "completed") return ctx.json(res, 409, { error: "already_completed" });
        if (batch.status === "processing") return ctx.json(res, 409, { error: "already_processing" });

        await db.query("UPDATE crm_import_batches SET status = 'processing', updated_at = NOW() WHERE id = $1", [id]);

        const rowsRes = await db.query("SELECT * FROM crm_import_rows WHERE batch_id = $1 ORDER BY row_number", [id]);
        let created = 0;
        let skipped = 0;
        let failed = 0;

        for (const row of rowsRes.rows) {
          const overrideAction = actions[String(row.row_number)] || actions[row.row_number] || row.action;
          if (overrideAction === "skip" || row.status === "invalid") {
            await db.query("UPDATE crm_import_rows SET action = 'skip', status = CASE WHEN status = 'valid' THEN 'skipped' ELSE status END WHERE id = $1", [row.id]);
            skipped++;
            continue;
          }
          if (row.status === "duplicate" && overrideAction !== "create") {
            await db.query("UPDATE crm_import_rows SET action = 'skip' WHERE id = $1", [row.id]);
            skipped++;
            continue;
          }

          // Create company
          try {
            const mapped = row.mapped_data;
            const displayName = mapped.display_name ? String(mapped.display_name).trim().slice(0,200) : null;
            if (!displayName) {
              await db.query("UPDATE crm_import_rows SET status = 'failed', errors = $2::jsonb WHERE id = $1", [row.id, JSON.stringify([...(row.errors || []), { field: "display_name", message: "nome obrigatório" }])]);
              failed++;
              continue;
            }

            const docRef = mapped.document_ref ? String(mapped.document_ref).trim().slice(0,32) : null;
            const segment = mapped.segment ? String(mapped.segment).trim().slice(0,100) : null;
            const city = mapped.city ? String(mapped.city).trim().slice(0,100) : null;
            const state = mapped.state ? String(mapped.state).trim().slice(0,2).toUpperCase() : null;
            const type = mapped.type && COMPANY_TYPES.has(String(mapped.type).toLowerCase()) ? String(mapped.type).toLowerCase() : "prospect";
            const origin = mapped.origin ? String(mapped.origin).trim().slice(0,100) : batch.report?.origin || "import";
            const campaign = mapped.campaign ? String(mapped.campaign).trim().slice(0,100) : null;
            const responsibleName = mapped.responsible_name ? String(mapped.responsible_name).trim().slice(0,120) : null;
            const notes = mapped.notes ? String(mapped.notes).trim().slice(0,1000) : null;

            const newId = crypto.randomUUID();
            await db.query(
              `INSERT INTO crm_companies (id, display_name, document_ref, segment, city, state, type, origin, campaign, responsible_name, notes, created_by, created_by_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              [newId, displayName, docRef, segment, city, state, type, origin, campaign, responsibleName, notes, session.role, session.identityId]
            );

            await db.query("UPDATE crm_import_rows SET status = 'created', dedup_match_id = $2 WHERE id = $1", [row.id, newId]);
            created++;
          } catch (e) {
            if (String(e.code) === "23505") {
              await db.query("UPDATE crm_import_rows SET status = 'duplicate', action = 'skip' WHERE id = $1", [row.id]);
              skipped++;
            } else {
              console.error("import row create failed", e?.message);
              await db.query("UPDATE crm_import_rows SET status = 'failed', errors = $2::jsonb WHERE id = $1", [row.id, JSON.stringify([...(row.errors || []), { field: "general", message: e?.message || "create_failed" }])]);
              failed++;
            }
          }
        }

        await db.query(
          `UPDATE crm_import_batches SET status = 'completed', created_rows = $2, completed_at = NOW(), report = report || $3::jsonb, updated_at = NOW() WHERE id = $1`,
          [id, created, JSON.stringify({ created, skipped, failed, committed_at: new Date().toISOString() })]
        );

        await audit(db, { action: "crm_import_commit", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        const finalBatch = await db.query("SELECT * FROM crm_import_batches WHERE id = $1", [id]);
        return ctx.json(res, 200, { batch: finalBatch.rows[0], created, skipped, failed });
      } catch (e) {
        console.error("crm import commit failed", e?.message);
        try { await db.query("UPDATE crm_import_batches SET status = 'failed', updated_at = NOW() WHERE id = $1", [id]); } catch {}
        return ctx.json(res, 503, { error: "commit_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleExportCompanies(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET"])) return;
    if (!requireSameOrigin(req, res)) return;
    const db = ctx.getPool();

    try {
      const type = url.searchParams.get("type");
      const search = url.searchParams.get("search");
      const conditions = [];
      const values = [];
      let idx = 1;
      if (type && COMPANY_TYPES.has(type)) { conditions.push(`type = $${idx++}`); values.push(type); }
      if (search) { conditions.push(`(display_name ILIKE $${idx} OR document_ref ILIKE $${idx})`); values.push(`%${search}%`); idx++; }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await db.query(`SELECT display_name, document_ref, document_type, segment, city, state, type, origin, campaign, responsible_name, notes FROM crm_companies ${where} ORDER BY created_at DESC LIMIT 5000`, values);

      const headers = ["display_name","document_ref","document_type","segment","city","state","type","origin","campaign","responsible_name","notes"];
      const rows = result.rows.map(r => {
        const obj = {};
        for (const h of headers) obj[h] = r[h] ?? "";
        return obj;
      });

      const csv = buildCsv(headers, rows);

      await audit(db, { action: "crm_import_export", target: "companies", result: "allowed", actorKind: session.role, actorId: session.identityId });

      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"empresas-${new Date().toISOString().slice(0,10)}.csv\"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(csv);
    } catch (e) {
      console.error("crm export failed", e?.message);
      return ctx.json(res, 503, { error: "export_failed" });
    }
  }

  return {
    handleCompanies,
    handleCompanyById,
    handleContacts,
    handleOpportunities,
    handleOpportunityById,
    handleLeadConvert,
    handleImportsList,
    handleImportPreview,
    handleImportById,
    handleExportCompanies,
  };
}
