// CRM-01..CRM-10: cadastro central, contatos, oportunidades, funil, kanban, agenda, cadências, carteira
// CRM-03: CSV import com prévia, validação, mapeamento, relatório, deduplicação revisável e prevenção fórmula

const COMPANY_TYPES = new Set(["prospect","client","partner"]);
const COMPANY_STATUS = new Set(["active","inactive","archived"]);
const CONTACT_ROLES = new Set(["decisor","influenciador","usuario","financeiro","outro"]);
const CONTACT_ORIGINS = new Set(["manual", "consentimento_formulario", "indicacao", "evento", "importacao", "lead_publico", "site", "contato", "outro"]);
const CONTACT_PREFERENCE_CHANNELS = new Set(["email", "phone", "whatsapp", "meeting", "other"]);
const CONTACT_STATUS = new Set(["active", "inactive"]);
const OPP_STAGES = new Set(["novo","qualificacao","vistoria","proposta_elaboracao","proposta_enviada","negociacao","ganho","perdido"]);
const OPP_OPEN_STAGES = new Set(["novo","qualificacao","vistoria","proposta_elaboracao","proposta_enviada","negociacao"]);
const OPP_PRIORITY = new Set(["baixa","media","alta","critica"]);
const COMMERCIAL_FAMILY_ROLES = new Set(["comercial", "admin", "marcelo", "ti"]);
// Campos de atribuição que nunca são editáveis depois de criada a oportunidade
// (mudança retroativa corromperia a atribuição de PUB-03/PUB-10 e a
// responsabilidade não é transferível por PATCH). O vínculo com lead público
// tem erro próprio (server_managed_fields) e é tratado à parte.
const OPP_IMMUTABLE_FIELDS = new Set(["origin", "campaign", "responsible_id", "responsible_name", "responsibleId", "responsibleName"]);
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

function normalizeContactPreferences(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some(key => !["channels", "best_time"].includes(key))) return null;
  const channels = value.channels === undefined ? [] : value.channels;
  if (!Array.isArray(channels) || channels.length > 4) return null;
  const normalizedChannels = [...new Set(channels.map(channel => String(channel).toLowerCase()))];
  if (normalizedChannels.some(channel => !CONTACT_PREFERENCE_CHANNELS.has(channel))) return null;
  let bestTime = null;
  if (value.best_time !== undefined && value.best_time !== null && value.best_time !== "") {
    bestTime = sanitizeText(value.best_time, 100);
    if (!bestTime) return null;
  }
  return { channels: normalizedChannels, best_time: bestTime };
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

  // CRM-05/06/07: as rotas de oportunidade exigem papel da família comercial,
  // igual a interações/visitas/cadências. O papel não é concessão: a borda de
  // propriedade pessoal continua sendo aplicada separadamente.
  async function requireCommercialFamilySession(req, res) {
    const session = await requireAdminSession(req, res);
    if (!session) return null;
    if (!COMMERCIAL_FAMILY_ROLES.has(session.role)) {
      ctx.json(res, 403, { error: "commercial_role_required" });
      return null;
    }
    return session;
  }

  // CRM-02: contatos pertencem ao cadastro central comercial. A mesma família
  // de papel usada no funil recebe a leitura/escrita; RH não é bypass.
  async function requireContactSession(req, res) {
    const session = await requireAdminSession(req, res);
    if (!session) return null;
    if (!COMMERCIAL_FAMILY_ROLES.has(session.role)) {
      ctx.json(res, 403, { error: "commercial_role_required" });
      return null;
    }
    return session;
  }

  // Auditoria transacional para as mutações de oportunidade desta fatia: a
  // falha do insert propaga e reverte a transação — nunca é engolida.
  async function transactionalAudit(client, session, action, target) {
    await client.query(
      "INSERT INTO auth_access_audit (actor_kind,actor_id,action,target,result,detail_category) VALUES ($1,$2,$3,$4,'allowed','none')",
      [session.role, session.identityId, action, target],
    );
  }

  async function withTransactionalAudit(session, action, target, work) {
    const client = await ctx.getPool().connect();
    try {
      await client.query("BEGIN");
      const value = await work(client);
      await transactionalAudit(client, session, action, target);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  // A busca de oportunidades escapa curingas de ILIKE: `100%` é literal.
  function escapeLikePattern(term) {
    return `%${term.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
  }

  async function displayForIdentity(db, identityId) {
    const result = await db.query("SELECT display_name FROM auth_identities WHERE id = $1", [identityId]);
    return result.rows[0]?.display_name || null;
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
        const result = await withTransactionalAudit(session, "crm_company_create", id, async (client) =>
          client.query(
            `INSERT INTO crm_companies (id, display_name, document_ref, document_type, segment, city, state, type, channels, responsible_name, parent_company_id, notes, origin, campaign, created_by, created_by_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
            [id, displayName, documentRef, documentType, segment, city, state, type, JSON.stringify(channels), responsibleName, parentCompanyId, notes, origin, campaign, session.role, session.identityId]
          )
        );
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
    // O detalhe inclui contatos; não deixe uma leitura de empresa contornar a
    // mesma borda de autorização da superfície CRM-02.
    const session = await requireContactSession(req, res);
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
          // Empresa/contato/unidade são registro central compartilhado (CRM-01);
          // oportunidade é pessoal (política CRM-05..09) e segue a borda do
          // responsável atual (ou do criador enquanto sem responsável).
          db.query(
            "SELECT * FROM crm_opportunities WHERE company_id = $1 AND (responsible_id = $2 OR (responsible_id IS NULL AND created_by_id = $2)) ORDER BY created_at DESC LIMIT 50",
            [id, session.identityId],
          ),
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
    const session = await requireContactSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      const companyId = url.searchParams.get("companyId") || url.searchParams.get("company_id");
      const search = url.searchParams.get("search");
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

      if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "company_required" });

      try {
        const company = await db.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
        if (!company.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });
        const conditions = [`company_id = $1`];
        const values = [companyId];
        let idx = 2;
        if (search) {
          conditions.push(`(display_name ILIKE $${idx} ESCAPE '\\' OR email ILIKE $${idx} ESCAPE '\\')`);
          values.push(escapeLikePattern(search));
          idx++;
        }
        const where = `WHERE ${conditions.join(" AND ")}`;
        const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM crm_contacts ${where}`, values);
        const listRes = await db.query(`SELECT * FROM crm_contacts ${where} ORDER BY is_primary DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);
        return ctx.json(res, 200, { contacts: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset, company_id: companyId });
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
      const email = body?.email === null || body?.email === "" ? null : sanitizeText(body?.email, 254);
      const phone = body?.phone === null || body?.phone === "" ? null : sanitizeText(body?.phone, 30);
      const role = body?.role === null || body?.role === "" || body?.role === undefined ? null : String(body.role).toLowerCase();
      const buyingRole = body?.buying_role === null || body?.buyingRole === null || body?.buying_role === "" || body?.buyingRole === "" || (body?.buying_role === undefined && body?.buyingRole === undefined)
        ? null : String(body.buying_role || body.buyingRole).toLowerCase();
      const restrictions = body?.restrictions === null || body?.restrictions === "" || body?.restrictions === undefined ? null : sanitizeText(body.restrictions, 500);
      const origin = body?.origin === null || body?.origin === "" || body?.origin === undefined ? null : sanitizeText(body.origin, 100);
      const preferences = normalizeContactPreferences(body?.preferences);
      const requestedStatus = body?.status === undefined || body?.status === null || body?.status === "" ? "active" : String(body.status).toLowerCase();
      const isPrimary = body?.is_primary === true || body?.isPrimary === true;

      if (!displayName) return ctx.json(res, 400, { error: "invalid_display_name" });
      if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "company_required" });
      if (body?.email !== undefined && body.email !== null && body.email !== "" && !email) return ctx.json(res, 400, { error: "invalid_email" });
      if (body?.phone !== undefined && body.phone !== null && body.phone !== "" && !phone) return ctx.json(res, 400, { error: "invalid_phone" });
      if (body?.restrictions !== undefined && body.restrictions !== null && body.restrictions !== "" && !restrictions) return ctx.json(res, 400, { error: "invalid_restrictions" });
      if (body?.origin !== undefined && body.origin !== null && body.origin !== "" && (!origin || !CONTACT_ORIGINS.has(origin.toLowerCase()))) return ctx.json(res, 400, { error: "invalid_origin" });
      if (role && !CONTACT_ROLES.has(role)) return ctx.json(res, 400, { error: "invalid_role" });
      if (buyingRole && !CONTACT_ROLES.has(buyingRole)) return ctx.json(res, 400, { error: "invalid_buying_role" });
      if (preferences === null) return ctx.json(res, 400, { error: "invalid_preferences" });
      if (!CONTACT_STATUS.has(requestedStatus)) return ctx.json(res, 400, { error: "invalid_status" });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ctx.json(res, 400, { error: "invalid_email" });

      try {
        const id = crypto.randomUUID();
        const result = await withTransactionalAudit(session, "crm_contact_create", id, async (client) => {
          const company = await client.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
          if (!company.rows[0]) { const error = new Error("company_not_found"); error.code = "COMPANY_NOT_FOUND"; throw error; }
          return client.query(
            `INSERT INTO crm_contacts (id, company_id, display_name, email, phone, role, buying_role, preferences, restrictions, origin, is_primary, status, created_by_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13) RETURNING *`,
            [id, companyId, displayName, email, phone, role, buyingRole, JSON.stringify(preferences), restrictions, origin ? origin.toLowerCase() : null, isPrimary, requestedStatus, session.identityId]
          );
        });
        return ctx.json(res, 201, { contact: result.rows[0] });
      } catch (e) {
        if (e?.code === "COMPANY_NOT_FOUND") return ctx.json(res, 404, { error: "company_not_found" });
        if (String(e.code) === "23505") return ctx.json(res, 409, { error: "contact_exists" });
        console.error("crm contact create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleContactById(req, res, id) {
    const session = await requireContactSession(req, res);
    if (!session) return;
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_contact_id" });
    const db = ctx.getPool();

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      try {
        const result = await db.query(
          "SELECT c.* FROM crm_contacts c JOIN crm_companies co ON co.id = c.company_id WHERE c.id = $1 AND c.company_id IS NOT NULL",
          [id],
        );
        if (!result.rows[0]) return ctx.json(res, 404, { error: "contact_not_found" });
        return ctx.json(res, 200, { contact: result.rows[0] });
      } catch (e) {
        console.error("crm contact get failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }
      if (body?.company_id !== undefined || body?.companyId !== undefined) return ctx.json(res, 400, { error: "company_immutable" });

      const fields = [];
      const values = [];
      let idx = 1;
      const editable = new Set(["display_name", "displayName", "email", "phone", "role", "buying_role", "buyingRole", "preferences", "restrictions", "origin", "is_primary", "isPrimary", "status"]);
      const unknown = Object.keys(body || {}).filter(key => !editable.has(key));
      if (unknown.length) return ctx.json(res, 400, { error: "field_not_editable" });
      const add = (column, value) => { fields.push(`${column} = $${idx++}`); values.push(value); };

      if (body.display_name !== undefined || body.displayName !== undefined) {
        const displayName = sanitizeText(body.display_name ?? body.displayName, 200);
        if (!displayName) return ctx.json(res, 400, { error: "invalid_display_name" });
        add("display_name", displayName);
      }
      if (body.email !== undefined) {
        const email = body.email === null || body.email === "" ? null : sanitizeText(body.email, 254);
        if (body.email !== null && body.email !== "" && !email) return ctx.json(res, 400, { error: "invalid_email" });
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ctx.json(res, 400, { error: "invalid_email" });
        add("email", email);
      }
      if (body.phone !== undefined) {
        const phone = body.phone === null || body.phone === "" ? null : sanitizeText(body.phone, 30);
        if (body.phone !== null && body.phone !== "" && !phone) return ctx.json(res, 400, { error: "invalid_phone" });
        add("phone", phone);
      }
      if (body.role !== undefined) {
        const role = body.role === null || body.role === "" ? null : String(body.role).toLowerCase();
        if (role && !CONTACT_ROLES.has(role)) return ctx.json(res, 400, { error: "invalid_role" });
        add("role", role);
      }
      if (body.buying_role !== undefined || body.buyingRole !== undefined) {
        const raw = body.buying_role !== undefined ? body.buying_role : body.buyingRole;
        const buyingRole = raw === undefined || raw === null || raw === "" ? null : String(raw).toLowerCase();
        if (buyingRole && !CONTACT_ROLES.has(buyingRole)) return ctx.json(res, 400, { error: "invalid_buying_role" });
        add("buying_role", buyingRole);
      }
      if (body.preferences !== undefined) {
        const preferences = normalizeContactPreferences(body.preferences);
        if (preferences === null) return ctx.json(res, 400, { error: "invalid_preferences" });
        add("preferences", JSON.stringify(preferences));
        fields[fields.length - 1] = `preferences = $${idx - 1}::jsonb`;
      }
      if (body.restrictions !== undefined) {
        const restrictions = body.restrictions === null || body.restrictions === "" ? null : sanitizeText(body.restrictions, 500);
        if (body.restrictions !== null && body.restrictions !== "" && !restrictions) return ctx.json(res, 400, { error: "invalid_restrictions" });
        add("restrictions", restrictions);
      }
      if (body.origin !== undefined) {
        const origin = body.origin === null || body.origin === "" ? null : sanitizeText(body.origin, 100);
        if (origin && !CONTACT_ORIGINS.has(origin.toLowerCase())) return ctx.json(res, 400, { error: "invalid_origin" });
        if (body.origin !== null && body.origin !== "" && !origin) return ctx.json(res, 400, { error: "invalid_origin" });
        add("origin", origin ? origin.toLowerCase() : null);
      }
      if (body.is_primary !== undefined || body.isPrimary !== undefined) {
        const value = body.is_primary ?? body.isPrimary;
        if (typeof value !== "boolean") return ctx.json(res, 400, { error: "invalid_is_primary" });
        add("is_primary", value);
      }
      if (body.status !== undefined) {
        const status = String(body.status).toLowerCase();
        if (!CONTACT_STATUS.has(status)) return ctx.json(res, 400, { error: "invalid_status" });
        add("status", status);
      }
      if (!fields.length) return ctx.json(res, 400, { error: "no_fields" });

      try {
        const result = await withTransactionalAudit(session, "crm_contact_update", id, async (client) => {
          const current = await client.query("SELECT id, company_id FROM crm_contacts WHERE id = $1 FOR UPDATE", [id]);
          if (!current.rows[0] || !current.rows[0].company_id) { const error = new Error("contact_not_found"); error.code = "CONTACT_NOT_FOUND"; throw error; }
          const company = await client.query("SELECT id FROM crm_companies WHERE id = $1", [current.rows[0].company_id]);
          if (!company.rows[0]) { const error = new Error("contact_not_found"); error.code = "CONTACT_NOT_FOUND"; throw error; }
          values.push(id);
          return client.query(`UPDATE crm_contacts SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);
        });
        return ctx.json(res, 200, { contact: result.rows[0] });
      } catch (e) {
        if (e?.code === "CONTACT_NOT_FOUND") return ctx.json(res, 404, { error: "contact_not_found" });
        if (String(e.code) === "23505") return ctx.json(res, 409, { error: "contact_exists" });
        console.error("crm contact update failed", e?.message);
        return ctx.json(res, 503, { error: "update_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, PATCH, PUT" });
  }

  // --- Units (CRM-01) ---
  async function handleUnits(req, res, url) {
    const session = await requireContactSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      const companyId = url.searchParams.get("companyId") || url.searchParams.get("company_id");
      const search = url.searchParams.get("search");
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

      if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "company_required" });

      try {
        const company = await db.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
        if (!company.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });

        const conditions = [`company_id = $1`];
        const values = [companyId];
        let idx = 2;
        if (search) {
          conditions.push(`(display_name ILIKE $${idx} ESCAPE '\\' OR city ILIKE $${idx} ESCAPE '\\' OR address ILIKE $${idx} ESCAPE '\\')`);
          values.push(escapeLikePattern(search));
          idx++;
        }
        const where = `WHERE ${conditions.join(" AND ")}`;
        const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM crm_company_units ${where}`, values);
        const listRes = await db.query(`SELECT * FROM crm_company_units ${where} ORDER BY is_main DESC, created_at ASC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);
        return ctx.json(res, 200, { units: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset, company_id: companyId });
      } catch (e) {
        console.error("crm units list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const companyId = body?.company_id || body?.companyId || null;
      const displayName = sanitizeText(body?.display_name || body?.displayName, 200);
      const city = body?.city === null || body?.city === "" || body?.city === undefined ? null : sanitizeText(body.city, 100);
      const address = body?.address === null || body?.address === "" || body?.address === undefined ? null : sanitizeText(body.address, 300);
      const isMain = body?.is_main === true || body?.isMain === true;

      if (!displayName) return ctx.json(res, 400, { error: "invalid_display_name" });
      if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "company_required" });
      if (body?.city !== undefined && body.city !== null && body.city !== "" && !city) return ctx.json(res, 400, { error: "invalid_city" });
      if (body?.address !== undefined && body.address !== null && body.address !== "" && !address) return ctx.json(res, 400, { error: "invalid_address" });
      if (body?.is_main !== undefined && typeof body.is_main !== "boolean") return ctx.json(res, 400, { error: "invalid_is_main" });
      if (body?.isMain !== undefined && typeof body.isMain !== "boolean") return ctx.json(res, 400, { error: "invalid_is_main" });

      const allowedKeys = new Set(["company_id", "companyId", "display_name", "displayName", "city", "address", "is_main", "isMain"]);
      const unknown = Object.keys(body || {}).filter(key => !allowedKeys.has(key));
      if (unknown.length) return ctx.json(res, 400, { error: "field_not_editable" });

      try {
        const id = crypto.randomUUID();
        const result = await withTransactionalAudit(session, "crm_unit_create", id, async (client) => {
          const company = await client.query("SELECT id FROM crm_companies WHERE id = $1 FOR UPDATE", [companyId]);
          if (!company.rows[0]) { const error = new Error("company_not_found"); error.code = "COMPANY_NOT_FOUND"; throw error; }
          if (isMain) {
            await client.query("UPDATE crm_company_units SET is_main = false WHERE company_id = $1 AND is_main = true", [companyId]);
          }
          return client.query(
            `INSERT INTO crm_company_units (id, company_id, display_name, city, address, is_main)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [id, companyId, displayName, city, address, isMain]
          );
        });
        return ctx.json(res, 201, { unit: result.rows[0] });
      } catch (e) {
        if (e?.code === "COMPANY_NOT_FOUND") return ctx.json(res, 404, { error: "company_not_found" });
        console.error("crm unit create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleUnitById(req, res, id) {
    const session = await requireContactSession(req, res);
    if (!session) return;
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_unit_id" });
    const db = ctx.getPool();

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      try {
        const result = await db.query(
          "SELECT u.* FROM crm_company_units u JOIN crm_companies co ON co.id = u.company_id WHERE u.id = $1",
          [id],
        );
        if (!result.rows[0]) return ctx.json(res, 404, { error: "unit_not_found" });
        return ctx.json(res, 200, { unit: result.rows[0] });
      } catch (e) {
        console.error("crm unit get failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (req.method === "PATCH" || req.method === "PUT") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }
      if (body?.company_id !== undefined || body?.companyId !== undefined) return ctx.json(res, 400, { error: "company_immutable" });

      const fields = [];
      const values = [];
      let idx = 1;
      const editable = new Set(["display_name", "displayName", "city", "address", "is_main", "isMain"]);
      const unknown = Object.keys(body || {}).filter(key => !editable.has(key));
      if (unknown.length) return ctx.json(res, 400, { error: "field_not_editable" });
      const add = (column, value) => { fields.push(`${column} = $${idx++}`); values.push(value); };

      let isMainSpecified = false;
      let isMainValue = false;

      if (body.display_name !== undefined || body.displayName !== undefined) {
        const displayName = sanitizeText(body.display_name ?? body.displayName, 200);
        if (!displayName) return ctx.json(res, 400, { error: "invalid_display_name" });
        add("display_name", displayName);
      }
      if (body.city !== undefined) {
        const city = body.city === null || body.city === "" ? null : sanitizeText(body.city, 100);
        if (body.city !== null && body.city !== "" && !city) return ctx.json(res, 400, { error: "invalid_city" });
        add("city", city);
      }
      if (body.address !== undefined) {
        const address = body.address === null || body.address === "" ? null : sanitizeText(body.address, 300);
        if (body.address !== null && body.address !== "" && !address) return ctx.json(res, 400, { error: "invalid_address" });
        add("address", address);
      }
      if (body.is_main !== undefined || body.isMain !== undefined) {
        const value = body.is_main ?? body.isMain;
        if (typeof value !== "boolean") return ctx.json(res, 400, { error: "invalid_is_main" });
        add("is_main", value);
        isMainSpecified = true;
        isMainValue = value;
      }
      if (!fields.length) return ctx.json(res, 400, { error: "no_fields" });

      try {
        const result = await withTransactionalAudit(session, "crm_unit_update", id, async (client) => {
          const current = await client.query("SELECT id, company_id FROM crm_company_units WHERE id = $1 FOR UPDATE", [id]);
          if (!current.rows[0] || !current.rows[0].company_id) { const error = new Error("unit_not_found"); error.code = "UNIT_NOT_FOUND"; throw error; }
          const company = await client.query("SELECT id FROM crm_companies WHERE id = $1", [current.rows[0].company_id]);
          if (!company.rows[0]) { const error = new Error("unit_not_found"); error.code = "UNIT_NOT_FOUND"; throw error; }

          if (isMainSpecified && isMainValue) {
            await client.query("UPDATE crm_company_units SET is_main = false WHERE company_id = $1 AND id <> $2 AND is_main = true", [current.rows[0].company_id, id]);
          }

          values.push(id);
          return client.query(`UPDATE crm_company_units SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`, values);
        });
        return ctx.json(res, 200, { unit: result.rows[0] });
      } catch (e) {
        if (e?.code === "UNIT_NOT_FOUND") return ctx.json(res, 404, { error: "unit_not_found" });
        console.error("crm unit update failed", e?.message);
        return ctx.json(res, 503, { error: "update_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, PATCH, PUT" });
  }

  // --- Opportunities ---
  async function handleOpportunities(req, res, url) {
    const session = await requireCommercialFamilySession(req, res);
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
      if (responsibleId && !isValidUuid(responsibleId)) return ctx.json(res, 400, { error: "invalid_responsible_id" });

      try {
        const conditions = [];
        const values = [];
        let idx = 1;
        // CRM-05..09: o funil é pessoal. Antes desta fatia a listagem devolvia
        // as oportunidades de TODOS para qualquer sessão de staff.
        conditions.push(`(o.responsible_id = $${idx} OR (o.responsible_id IS NULL AND o.created_by_id = $${idx}))`);
        values.push(session.identityId); idx++;
        if (companyId) { conditions.push(`o.company_id = $${idx++}`); values.push(companyId); }
        if (stage) { conditions.push(`o.stage = $${idx++}`); values.push(stage); }
        if (responsibleId) { conditions.push(`o.responsible_id = $${idx++}`); values.push(responsibleId); }
        if (priority) { conditions.push(`o.priority = $${idx++}`); values.push(priority); }
        if (search) {
          const pattern = escapeLikePattern(search);
          conditions.push(`(o.title ILIKE $${idx} ESCAPE '\\' OR o.need_description ILIKE $${idx} ESCAPE '\\')`);
          values.push(pattern); idx++;
        }

        const where = `WHERE ${conditions.join(" AND ")}`;
        const countRes = await db.query(`SELECT COUNT(*)::int as total FROM crm_opportunities o ${where}`, values);
        const listRes = await db.query(
          `SELECT o.*, u.display_name AS unit_name
             FROM crm_opportunities o
             LEFT JOIN crm_company_units u ON u.id = o.unit_id
             ${where}
             ORDER BY o.next_action_date NULLS LAST, o.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
          [...values, limit, offset],
        );

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
      const unitId = body?.unit_id || body?.unitId || null;
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

      if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (!title) return ctx.json(res, 400, { error: "invalid_title" });
      // O vínculo com lead público é gerenciado pelo servidor (decisão CRM-08):
      // só a conversão de lead cria a ponte. O corpo não pode forjar o link.
      if (body?.public_lead_id || body?.publicLeadId) return ctx.json(res, 400, { error: "server_managed_fields" });
      if (contactId && !isValidUuid(contactId)) return ctx.json(res, 400, { error: "invalid_contact_id" });
      if (unitId && !isValidUuid(unitId)) return ctx.json(res, 400, { error: "invalid_unit_id" });
      if (!OPP_PRIORITY.has(priority)) return ctx.json(res, 400, { error: "invalid_priority" });
      if (estimatedValue !== null && (isNaN(estimatedValue) || estimatedValue < 0)) return ctx.json(res, 400, { error: "invalid_estimated_value" });
      if (nextActionDate && isNaN(nextActionDate.getTime())) return ctx.json(res, 400, { error: "invalid_next_action_date" });
      if (forecastDate && !/^\d{4}-\d{2}-\d{2}$/.test(forecastDate)) return ctx.json(res, 400, { error: "invalid_forecast_date" });

      let client;
      let transaction = false;
      try {
        client = await db.connect();
        await client.query("BEGIN"); transaction = true;

        const company = await client.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
        if (!company.rows[0]) {
          await client.query("ROLLBACK"); transaction = false;
          return ctx.json(res, 404, { error: "company_not_found" });
        }
        if (unitId) {
          // CRM-05: a unidade precisa existir e pertencer à mesma empresa.
          const unit = await client.query("SELECT id FROM crm_company_units WHERE id = $1 AND company_id = $2", [unitId, companyId]);
          if (!unit.rows[0]) {
            await client.query("ROLLBACK"); transaction = false;
            return ctx.json(res, 400, { error: "unit_not_available" });
          }
        }
        if (serviceId) {
          const service = await client.query("SELECT id FROM service_catalog WHERE id = $1", [serviceId]);
          if (!service.rows[0]) {
            await client.query("ROLLBACK"); transaction = false;
            return ctx.json(res, 400, { error: "service_not_available" });
          }
        }
        const responsibleName = await displayForIdentity(client, session.identityId);

        const id = crypto.randomUUID();
        const result = await client.query(
          `INSERT INTO crm_opportunities (id, company_id, contact_id, unit_id, title, service_id, service_name, need_description, responsible_id, responsible_name, forecast_date, estimated_value, next_action, next_action_date, origin, campaign, priority, created_by_id, stage)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'novo') RETURNING *`,
          [id, companyId, contactId, unitId, title, serviceId, serviceName, needDescription, session.identityId, responsibleName, forecastDate, estimatedValue, nextAction, nextActionDate, origin, campaign, priority, session.identityId]
        );

        await client.query(
          `INSERT INTO crm_opportunity_stages (id, opportunity_id, previous_stage, next_stage, changed_by_id, changed_by_role, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [crypto.randomUUID(), id, null, "novo", session.identityId, session.role, "criação"]
        );

        await transactionalAudit(client, session, "crm_opportunity_create", id);

        await client.query("COMMIT"); transaction = false;
        return ctx.json(res, 201, { opportunity: result.rows[0] });
      } catch (e) {
        if (transaction) await client?.query("ROLLBACK").catch(() => {});
        console.error("crm opp create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      } finally {
        client?.release();
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleOpportunityById(req, res, id) {
    const session = await requireCommercialFamilySession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });

    // CRM-05..09: a oportunidade em si é pessoal. Esta rota legada era o último
    // atalho onde qualquer sessão de staff lia (e no PATCH alterava)
    // oportunidade de outra pessoa; agora aplica a mesma borda das rotas
    // dedicadas de tarefas/interações/visitas/cadências/notas.
    async function ownerFor(client) {
      const result = await client.query(
        `SELECT o.*, u.display_name AS unit_name
           FROM crm_opportunities o
           LEFT JOIN crm_company_units u ON u.id = o.unit_id
          WHERE o.id = $1 AND (o.responsible_id = $2 OR (o.responsible_id IS NULL AND o.created_by_id = $2))
          FOR SHARE OF o`,
        [id, session.identityId],
      );
      return result.rows[0] || null;
    }

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      let client;
      let transaction = false;
      try {
        client = await db.connect();
        await client.query("BEGIN"); transaction = true;
        const opp = await ownerFor(client);
        if (!opp) {
          await client.query("ROLLBACK"); transaction = false;
          return ctx.json(res, 404, { error: "opportunity_not_found" });
        }
        const [stages, tasks, interactions, visits, notes] = await Promise.all([
          client.query(
            `SELECT s.* FROM crm_opportunity_stages s
              WHERE s.opportunity_id = $1
                AND EXISTS (
                  SELECT 1 FROM crm_opportunities o
                   WHERE o.id = $1
                     AND (o.responsible_id = $2 OR (o.responsible_id IS NULL AND o.created_by_id = $2))
                )
              ORDER BY s.created_at DESC`,
            [id, session.identityId],
          ),
          client.query("SELECT * FROM crm_tasks WHERE opportunity_id = $1 AND (responsible_id = $2 OR delegated_by_id = $2) AND EXISTS (SELECT 1 FROM crm_opportunities o WHERE o.id=$1 AND (o.responsible_id=$2 OR (o.responsible_id IS NULL AND o.created_by_id=$2))) ORDER BY due_date NULLS LAST, created_at DESC LIMIT 200", [id, ["comercial", "admin", "marcelo", "ti"].includes(session.role) ? session.identityId : null]),
          // CRM-07: the interaction history follows the exact same ownership
          // rule as the dedicated /interactions endpoint below, so this
          // legacy detail route can never leak it to an unauthorized viewer.
          client.query("SELECT * FROM crm_interactions WHERE opportunity_id = $1 AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM crm_opportunities o WHERE o.id=$1 AND (o.responsible_id=$2 OR (o.responsible_id IS NULL AND o.created_by_id=$2))) ORDER BY occurred_at DESC LIMIT 50", [id, ["comercial", "admin", "marcelo", "ti"].includes(session.role) ? session.identityId : null]),
          // CRM-08: a agenda segue exatamente a política da rota dedicada
          // /visits — responsável pela oportunidade ou participante convidado
          // da própria visita. Como a rota inteira agora é do responsável, o
          // participante continua enxergando a própria visita pela própria
          // agenda (/api/crm/visits/agenda).
          client.query(
            `SELECT * FROM crm_visits v
              WHERE v.opportunity_id = $1
                AND (
                  EXISTS (SELECT 1 FROM crm_opportunities o WHERE o.id=$1 AND (o.responsible_id=$2 OR (o.responsible_id IS NULL AND o.created_by_id=$2)))
                  OR EXISTS (SELECT 1 FROM crm_visit_participants p WHERE p.visit_id=v.id AND p.identity_id=$2)
                )
              ORDER BY v.scheduled_at DESC LIMIT 200`,
            [id, ["comercial", "admin", "marcelo", "ti"].includes(session.role) ? session.identityId : null],
          ),
          // CRM-07: notas internas dedicadas — dono da oportunidade apenas.
          client.query(
            `SELECT n.id,n.body,n.version,n.created_at,n.updated_at,n.edited_at,a.display_name AS author_name
               FROM crm_opportunity_notes n
               JOIN auth_identities a ON a.id = n.author_id
              WHERE n.opportunity_id = $1 AND n.deleted_at IS NULL
              ORDER BY n.created_at DESC, n.id DESC LIMIT 50`,
            [id],
          ),
        ]);
        await client.query("COMMIT"); transaction = false;
        return ctx.json(res, 200, { opportunity: opp, stages: stages.rows, tasks: tasks.rows, interactions: interactions.rows, visits: visits.rows, notes: notes.rows });
      } catch (e) {
        if (transaction) await client?.query("ROLLBACK").catch(() => {});
        console.error("crm opp get failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      } finally {
        client?.release();
      }
    }

    if (req.method === "PATCH") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      // Atribuição é imutável (política desta fatia) e o vínculo com lead é
      // gerenciado pelo servidor (política CRM-08).
      for (const key of Object.keys(body || {})) {
        if (OPP_IMMUTABLE_FIELDS.has(key)) return ctx.json(res, 400, { error: "field_not_editable" });
        if (key === "public_lead_id" || key === "publicLeadId") return ctx.json(res, 400, { error: "server_managed_fields" });
      }

      const newStage = body?.stage ? String(body.stage).toLowerCase() : null;
      const lossReason = sanitizeText(body?.loss_reason || body?.lossReason, 500);
      const reopenReason = sanitizeText(body?.reason, 500);
      // Chave omitida = sem alteração; null (ou string vazia) = limpar o campo;
      // valor presente = validar. Nada de adivinhar por falsidade.
      const hasOwn = (...keys) => keys.some(key => Object.hasOwn(body || {}, key));
      const pick = (...keys) => keys.map(key => body?.[key]).find(value => value !== undefined);
      const nextActionRaw = hasOwn("next_action", "nextAction") ? pick("next_action", "nextAction") : undefined;
      const needDescriptionRaw = hasOwn("need_description", "needDescription") ? pick("need_description", "needDescription") : undefined;
      const serviceNameRaw = hasOwn("service_name", "serviceName") ? pick("service_name", "serviceName") : undefined;
      // Tipo errado é recusado, não convertido em limpeza silenciosa.
      for (const [field, value] of [["next_action", nextActionRaw], ["need_description", needDescriptionRaw], ["service_name", serviceNameRaw]]) {
        if (value !== undefined && value !== null && typeof value !== "string") return ctx.json(res, 400, { error: `invalid_${field}` });
      }
      const nextAction = nextActionRaw === undefined ? undefined : sanitizeText(nextActionRaw, 200);
      const nextActionDateRaw = hasOwn("next_action_date", "nextActionDate") ? pick("next_action_date", "nextActionDate") : undefined;
      const nextActionDate = nextActionDateRaw === null || nextActionDateRaw === undefined ? nextActionDateRaw : new Date(nextActionDateRaw);
      const estimatedValueRaw = hasOwn("estimated_value", "estimatedValue") ? pick("estimated_value", "estimatedValue") : undefined;
      const estimatedValue = estimatedValueRaw === null || estimatedValueRaw === undefined ? estimatedValueRaw : Number(estimatedValueRaw);
      const priority = hasOwn("priority") ? String(body.priority).toLowerCase() : undefined;
      const forecastDateRaw = hasOwn("forecast_date", "forecastDate") ? pick("forecast_date", "forecastDate") : undefined;
      const forecastDate = forecastDateRaw === null || forecastDateRaw === undefined ? forecastDateRaw : String(forecastDateRaw);
      const needDescription = needDescriptionRaw === undefined ? undefined : sanitizeText(needDescriptionRaw, 2000);
      const serviceName = serviceNameRaw === undefined ? undefined : sanitizeText(serviceNameRaw, 100);
      const unitId = hasOwn("unit_id", "unitId") ? pick("unit_id", "unitId") : undefined;

      if (newStage && !OPP_STAGES.has(newStage)) return ctx.json(res, 400, { error: "invalid_stage" });
      if (newStage === "perdido" && !lossReason) return ctx.json(res, 400, { error: "loss_reason_required" });
      if (priority !== undefined && !OPP_PRIORITY.has(priority)) return ctx.json(res, 400, { error: "invalid_priority" });
      if (nextActionDate && isNaN(nextActionDate.getTime())) return ctx.json(res, 400, { error: "invalid_next_action_date" });
      if (estimatedValue !== undefined && estimatedValue !== null && (isNaN(estimatedValue) || estimatedValue < 0)) return ctx.json(res, 400, { error: "invalid_estimated_value" });
      if (forecastDate !== undefined && forecastDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(forecastDate)) return ctx.json(res, 400, { error: "invalid_forecast_date" });
      if (unitId !== undefined && unitId !== null && !isValidUuid(unitId)) return ctx.json(res, 400, { error: "invalid_unit_id" });

      let client;
      let transaction = false;
      try {
        client = await db.connect();
        await client.query("BEGIN"); transaction = true;

        const current = await client.query(
          "SELECT id, stage, company_id FROM crm_opportunities WHERE id = $1 AND (responsible_id = $2 OR (responsible_id IS NULL AND created_by_id = $2)) FOR UPDATE",
          [id, session.identityId],
        );
        if (!current.rows[0]) {
          await client.query("ROLLBACK"); transaction = false;
          return ctx.json(res, 404, { error: "opportunity_not_found" });
        }
        const prevStage = current.rows[0].stage;

        // CRM-06: sair de perdido/ganho para estágio aberto é reabertura —
        // exige motivo explícito e é auditada com ação dedicada.
        const isReopen = Boolean(newStage) && OPP_OPEN_STAGES.has(newStage) && (prevStage === "perdido" || prevStage === "ganho");
        if (isReopen && !reopenReason) {
          await client.query("ROLLBACK"); transaction = false;
          return ctx.json(res, 400, { error: "reopen_reason_required" });
        }
        // Trocar diretamente entre os dois estados terminais é contraditório:
        // para reabrir, passa por estágio aberto; para perder depois de ganho,
        // reabre antes. Recusa explícita, fail-closed.
        if (newStage && prevStage !== newStage
            && (prevStage === "ganho" || prevStage === "perdido")
            && (newStage === "ganho" || newStage === "perdido")) {
          await client.query("ROLLBACK"); transaction = false;
          return ctx.json(res, 400, { error: "invalid_terminal_transition" });
        }

        if (unitId !== undefined && unitId !== null) {
          const unit = await client.query("SELECT id FROM crm_company_units WHERE id = $1 AND company_id = $2", [unitId, current.rows[0].company_id]);
          if (!unit.rows[0]) {
            await client.query("ROLLBACK"); transaction = false;
            return ctx.json(res, 400, { error: "unit_not_available" });
          }
        }

        const updates = [];
        const values = [];
        function set(column, value) { values.push(value); updates.push(`${column} = $${values.length}`); }

        if (newStage) {
          set("stage", newStage);
          updates.push("stage_changed_at = NOW()");
          set("is_won", newStage === "ganho");
          set("is_lost", newStage === "perdido");
          if (newStage === "perdido" && lossReason) set("loss_reason", lossReason);
          // Reabertura limpa o motivo de perda: o motivo antigo permanece no
          // histórico de estágio, nunca é reescrito.
          if (isReopen && prevStage === "perdido") set("loss_reason", null);
        }

        if (nextAction !== undefined) set("next_action", nextAction);
        if (nextActionDate !== undefined) set("next_action_date", nextActionDate);
        if (estimatedValue !== undefined) set("estimated_value", estimatedValue);
        if (priority !== undefined) set("priority", priority);
        if (forecastDate !== undefined) set("forecast_date", forecastDate === null ? null : forecastDate);
        if (needDescription !== undefined) set("need_description", needDescription);
        if (serviceName !== undefined) set("service_name", serviceName);
        if (unitId !== undefined) set("unit_id", unitId);

        if (updates.length === 0) {
          await client.query("ROLLBACK"); transaction = false;
          return ctx.json(res, 400, { error: "no_fields" });
        }

        values.push(id);
        const result = await client.query(`UPDATE crm_opportunities SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
        const opportunity = result.rows[0];

        if (newStage && prevStage !== newStage) {
          await client.query(
            `INSERT INTO crm_opportunity_stages (id, opportunity_id, previous_stage, next_stage, changed_by_id, changed_by_role, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [crypto.randomUUID(), id, prevStage, newStage, session.identityId, session.role, isReopen ? reopenReason : (lossReason || body?.reason || null)]
          );
          // Auditoria transacional: sem trilha, a mutação é revertida.
          if (isReopen) {
            await transactionalAudit(client, session, "crm_opportunity_reopen", `${id}:${prevStage}->${newStage}`);
          } else {
            await transactionalAudit(client, session, "crm_opportunity_stage_change", `${id}:${prevStage}->${newStage}`);
          }
        } else {
          await transactionalAudit(client, session, "crm_opportunity_update", id);
        }

        await client.query("COMMIT"); transaction = false;
        return ctx.json(res, 200, { opportunity });
      } catch (e) {
        if (transaction) await client?.query("ROLLBACK").catch(() => {});
        console.error("crm opp update failed", e?.message);
        return ctx.json(res, 503, { error: "update_failed" });
      } finally {
        client?.release();
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
      // CRM-05: quem converte é o responsável desde o início — antes a conversão
      // deixava responsible_id nulo e só o fallback "criador enquanto sem
      // responsável" segurava a borda de propriedade.
      const responsibleName = await displayForIdentity(db, session.identityId);
      await db.query(
        `INSERT INTO crm_opportunities (id, company_id, contact_id, title, service_name, need_description, responsible_id, responsible_name, origin, campaign, public_lead_id, created_by_id, stage, next_action, next_action_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'novo',$13,NOW() + INTERVAL '2 days')`,
        [oppId, finalCompanyId, contactId, title, lead.services[0] || null, lead.details, session.identityId, responsibleName, lead.origin, lead.campaign, leadId, session.identityId, `Qualificar lead ${leadId.slice(0,8)} - ${lead.city}`]
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
          // CRM-03: curinga escapado — `Empresa 100%` não casa com terceiros.
          const r = await db.query(`SELECT id, display_name, document_ref FROM crm_companies WHERE display_name ILIKE $1 ESCAPE '\\' LIMIT 1`, [escapeLikePattern(name).slice(1, -1)]);
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
    // CRM-03: ler o lote e fechá-lo é superfície comercial, igual à revisão de
    // deduplicação — papel fora da família recebe 403, não 401.
    const session = await requireContactSession(req, res);
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

      // CRM-03: a decisão de deduplicação não entra mais solta no commit —
      // só pela rota dedicada, que persiste autor/data e audita.
      if (body && typeof body === "object" && Object.keys(body).length > 0) {
        return ctx.json(res, 400, { error: "actions_not_accepted" });
      }

      try {
        const batchRes = await db.query("SELECT * FROM crm_import_batches WHERE id = $1 FOR UPDATE", [id]);
        const batch = batchRes.rows[0];
        if (!batch) return ctx.json(res, 404, { error: "import_not_found" });
        if (batch.status === "completed") return ctx.json(res, 409, { error: "already_completed" });
        if (batch.status === "processing") return ctx.json(res, 409, { error: "already_processing" });

        // Fail-closed: nenhuma duplicata pode ser resolvida por default
        // silencioso. Sem revisão completa o lote continua `pending`.
        const pendingReview = await db.query(
          "SELECT COUNT(*)::int AS total FROM crm_import_rows WHERE batch_id = $1 AND status = 'duplicate' AND decision IS NULL",
          [id],
        );
        if ((pendingReview.rows[0]?.total || 0) > 0) {
          return ctx.json(res, 409, { error: "pending_dedup_review", pending: pendingReview.rows[0].total });
        }

        await db.query("UPDATE crm_import_batches SET status = 'processing', updated_at = NOW() WHERE id = $1", [id]);

        const rowsRes = await db.query("SELECT * FROM crm_import_rows WHERE batch_id = $1 ORDER BY row_number", [id]);
        let created = 0;
        let skipped = 0;
        let failed = 0;

        for (const row of rowsRes.rows) {
          const overrideAction = row.decision || row.action;
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

        // Fechamento do lote + trilha na MESMA transação: se a auditoria
        // falhar, o lote não é dado como concluído (cai no catch e vira
        // 'failed' + 503), em vez de fechar em silêncio.
        const closeClient = await db.connect();
        try {
          await closeClient.query("BEGIN");
          await closeClient.query(
            `UPDATE crm_import_batches SET status = 'completed', created_rows = $2, completed_at = NOW(), report = report || $3::jsonb, updated_at = NOW() WHERE id = $1`,
            [id, created, JSON.stringify({ created, skipped, failed, committed_at: new Date().toISOString() })],
          );
          await transactionalAudit(closeClient, session, "crm_import_commit", id);
          await closeClient.query("COMMIT");
        } catch (closeError) {
          await closeClient.query("ROLLBACK").catch(() => {});
          throw closeError;
        } finally {
          closeClient.release();
        }

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

  // --- CRM-03: revisão dedicada de deduplicação ---
  const IMPORT_DECISIONS = new Set(["create", "skip"]);

  async function handleImportDuplicates(req, res, id) {
    const session = await requireContactSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET"])) return;
    if (!requireSameOrigin(req, res)) return;
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_import_id" });
    const db = ctx.getPool();
    try {
      const batchRes = await db.query("SELECT * FROM crm_import_batches WHERE id = $1", [id]);
      const batch = batchRes.rows[0];
      if (!batch) return ctx.json(res, 404, { error: "import_not_found" });
      const rowsRes = await db.query(
        `SELECT row_number, mapped_data, dedup_match_id, dedup_match_type, dedup_match_details,
                decision, decision_note, decided_by, decided_at
           FROM crm_import_rows
          WHERE batch_id = $1 AND status = 'duplicate'
          ORDER BY row_number`,
        [id],
      );
      const pending = rowsRes.rows.filter(row => !row.decision).length;
      return ctx.json(res, 200, {
        batch: { id: batch.id, file_name: batch.file_name, status: batch.status, type: batch.type, duplicate_rows: batch.duplicate_rows },
        duplicates: rowsRes.rows,
        pending_review: pending,
        review_complete: pending === 0,
      });
    } catch (e) {
      console.error("crm import duplicates failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  async function handleImportRowDecision(req, res, id, rowNumberRaw) {
    const session = await requireContactSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["PATCH"])) return;
    if (!requireSameOrigin(req, res)) return;
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_import_id" });
    const rowNumber = Number.parseInt(rowNumberRaw, 10);
    if (!Number.isInteger(rowNumber) || rowNumber < 1) return ctx.json(res, 400, { error: "invalid_row_number" });

    let body;
    try { body = await ctx.readJson(req, 8 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const editable = new Set(["decision", "note", "decision_note", "decisionNote"]);
    const unknown = Object.keys(body || {}).filter(key => !editable.has(key));
    if (unknown.length) return ctx.json(res, 400, { error: "field_not_editable" });

    const decision = typeof body?.decision === "string" ? body.decision.toLowerCase() : null;
    if (!decision || !IMPORT_DECISIONS.has(decision)) return ctx.json(res, 400, { error: "invalid_decision" });

    const rawNote = body?.note ?? body?.decision_note ?? body?.decisionNote;
    let note = null;
    if (rawNote !== undefined && rawNote !== null && rawNote !== "") {
      note = sanitizeText(rawNote, 300);
      if (!note) return ctx.json(res, 400, { error: "invalid_note" });
    }

    try {
      const result = await withTransactionalAudit(session, "crm_import_row_decision", `${id}:${rowNumber}`, async (client) => {
        const batchRes = await client.query("SELECT id, status FROM crm_import_batches WHERE id = $1 FOR UPDATE", [id]);
        const batch = batchRes.rows[0];
        if (!batch) { const error = new Error("import_not_found"); error.code = "IMPORT_NOT_FOUND"; throw error; }
        if (batch.status !== "pending") { const error = new Error("batch_not_pending"); error.code = "BATCH_NOT_PENDING"; throw error; }

        const rowRes = await client.query(
          "SELECT id, status FROM crm_import_rows WHERE batch_id = $1 AND row_number = $2 FOR UPDATE",
          [id, rowNumber],
        );
        const row = rowRes.rows[0];
        if (!row) { const error = new Error("row_not_found"); error.code = "ROW_NOT_FOUND"; throw error; }
        // Revisão não promove linha inválida nem decide linha que não é
        // duplicata — isso seria bypass da validação da prévia.
        if (row.status !== "duplicate") { const error = new Error("row_not_duplicate"); error.code = "ROW_NOT_DUPLICATE"; throw error; }

        return client.query(
          `UPDATE crm_import_rows
              SET decision = $2, decision_note = $3, decided_by = $4, decided_by_id = $5, decided_at = NOW(),
                  action = $2
            WHERE id = $1
            RETURNING row_number, status, decision, decision_note, decided_by, decided_at`,
          [row.id, decision, note, session.role, session.identityId],
        );
      });
      return ctx.json(res, 200, { row: result.rows[0] });
    } catch (e) {
      if (e?.code === "IMPORT_NOT_FOUND") return ctx.json(res, 404, { error: "import_not_found" });
      if (e?.code === "ROW_NOT_FOUND") return ctx.json(res, 404, { error: "row_not_found" });
      if (e?.code === "BATCH_NOT_PENDING") return ctx.json(res, 409, { error: "batch_not_pending" });
      if (e?.code === "ROW_NOT_DUPLICATE") return ctx.json(res, 409, { error: "row_not_duplicate" });
      console.error("crm import row decision failed", e?.message);
      return ctx.json(res, 503, { error: "decision_failed" });
    }
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
    handleContactById,
    handleUnits,
    handleUnitById,
    handleOpportunities,
    handleOpportunityById,
    handleLeadConvert,
    handleImportsList,
    handleImportPreview,
    handleImportById,
    handleImportDuplicates,
    handleImportRowDecision,
    handleExportCompanies,
  };
}
