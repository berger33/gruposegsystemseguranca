// CRM-12: equipamentos: fabricante/modelo, especificações, compatibilidades, fornecedor, garantia e ligação com estoque. Não confundir serviço com item físico.

export function createEquipmentApi(ctx) {
  async function audit(db, { action, target, result, actorKind, actorId }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,'none')",
        [actorKind || "system", actorId || null, action, target || null, result]
      );
    } catch {}
  }

  function requireAdminSession(req, res) {
    const session = ctx.readAdminSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "admin_session_required" });
      return null;
    }
    return session;
  }

  function requireSameOrigin(req, res) {
    if (ctx.sameOrigin(req)) return true;
    ctx.json(res, 403, { error: "same_origin_required" });
    return false;
  }

  async function handleList(req, res, url) {
    const session = requireAdminSession(req, res);
    if (!session) return;
    if (!requireSameOrigin(req, res)) return;
    if (req.method !== "GET") return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });

    const category = url.searchParams.get("category");
    const manufacturer = url.searchParams.get("manufacturer");
    const search = url.searchParams.get("search");
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

    try {
      const db = ctx.getPool();
      const conditions = [];
      const values = [];
      let idx = 1;
      if (!includeInactive) conditions.push("is_active = true");
      if (category) { conditions.push(`category ILIKE $${idx++}`); values.push(`%${category}%`); }
      if (manufacturer) { conditions.push(`manufacturer ILIKE $${idx++}`); values.push(`%${manufacturer}%`); }
      if (search) { conditions.push(`(name ILIKE $${idx} OR model ILIKE $${idx} OR manufacturer ILIKE $${idx})`); values.push(`%${search}%`); idx++; }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const countRes = await db.query(`SELECT COUNT(*)::int as total FROM crm_equipment ${where}`, values);
      const listRes = await db.query(`SELECT * FROM crm_equipment ${where} ORDER BY manufacturer, model LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);
      return ctx.json(res, 200, { equipment: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
    } catch (e) {
      console.error("equipment list failed", e?.message);
      return ctx.json(res, 503, { error: "equipment_unavailable" });
    }
  }

  async function handleGet(req, res, id) {
    const session = requireAdminSession(req, res);
    if (!session) return;
    if (!requireSameOrigin(req, res)) return;
    if (req.method !== "GET") return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });

    try {
      const db = ctx.getPool();
      const result = await db.query("SELECT * FROM crm_equipment WHERE id = $1", [id]);
      if (!result.rows[0]) return ctx.json(res, 404, { error: "equipment_not_found" });
      return ctx.json(res, 200, { equipment: result.rows[0] });
    } catch (e) {
      console.error("equipment get failed", e?.message);
      return ctx.json(res, 503, { error: "equipment_unavailable" });
    }
  }

  async function handleCreate(req, res) {
    const session = requireAdminSession(req, res);
    if (!session) return;
    if (!requireSameOrigin(req, res)) return;
    if (req.method !== "POST") return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });

    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const id = String(body?.id || "").trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "_").slice(0,100);
    const manufacturer = String(body?.manufacturer || "").trim().slice(0,100);
    const model = String(body?.model || "").trim().slice(0,100);
    const name = String(body?.name || "").trim().slice(0,200);
    const description = String(body?.description || "").trim().slice(0,2000) || null;
    const category = String(body?.category || "").trim().slice(0,100) || null;
    const supplierName = String(body?.supplier_name || body?.supplierName || "").trim().slice(0,200) || null;
    const warrantyMonths = body?.warranty_months || body?.warrantyMonths ? parseInt(body.warranty_months || body.warrantyMonths, 10) : null;

    if (!id || !manufacturer || !model || !name) return ctx.json(res, 400, { error: "invalid_fields", required: ["id","manufacturer","model","name"] });
    if (warrantyMonths !== null && (isNaN(warrantyMonths) || warrantyMonths < 1 || warrantyMonths > 120)) return ctx.json(res, 400, { error: "invalid_warranty" });

    try {
      const db = ctx.getPool();
      const specifications = body?.specifications && typeof body.specifications === "object" ? body.specifications : {};
      const compatibilities = Array.isArray(body?.compatibilities) ? body.compatibilities : [];
      const result = await db.query(
        `INSERT INTO crm_equipment (id, manufacturer, model, name, description, specifications, compatibilities, category, supplier_name, warranty_months, stock_sku, stock_location, is_active, is_validated)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,true,false) RETURNING *`,
        [id, manufacturer, model, name, description, JSON.stringify(specifications), JSON.stringify(compatibilities), category, supplierName, warrantyMonths, body?.stock_sku || body?.stockSku || null, body?.stock_location || body?.stockLocation || null]
      );
      await audit(db, { action: "crm_equipment_create", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 201, { equipment: result.rows[0] });
    } catch (e) {
      if (String(e.code) === "23505") return ctx.json(res, 409, { error: "equipment_exists" });
      console.error("equipment create failed", e?.message);
      return ctx.json(res, 503, { error: "create_failed" });
    }
  }

  return { handleList, handleGet, handleCreate };
}
