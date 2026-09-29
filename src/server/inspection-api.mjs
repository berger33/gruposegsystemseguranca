// CRM-13: vistoria com checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações e responsável técnico.

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

export function createInspectionApi(ctx) {
  async function audit(db, { action, target, result, actorKind, actorId }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,'none')",
        [actorKind || "system", actorId || null, action, target || null, result]
      );
    } catch {}
  }

  async function requireAdminSession(req, res) {
    const session = await ctx.readAdminSession(req);
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

  async function handleTemplates(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireSameOrigin(req, res)) return;
    if (req.method !== "GET") return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });

    const serviceId = url.searchParams.get("serviceId") || url.searchParams.get("service_id");
    try {
      const db = ctx.getPool();
      let query = "SELECT * FROM crm_inspection_templates WHERE is_active = true";
      const values = [];
      if (serviceId) {
        query += " AND service_id = $1";
        values.push(serviceId);
      }
      query += " ORDER BY name";
      const result = await db.query(query, values);
      return ctx.json(res, 200, { templates: result.rows, total: result.rows.length });
    } catch (e) {
      console.error("inspection templates list failed", e?.message);
      return ctx.json(res, 503, { error: "inspection_unavailable" });
    }
  }

  async function handleInspections(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      const companyId = url.searchParams.get("companyId");
      const opportunityId = url.searchParams.get("opportunityId");
      const serviceId = url.searchParams.get("serviceId");
      const status = url.searchParams.get("status");
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

      if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });

      try {
        const conditions = [];
        const values = [];
        let idx = 1;
        if (companyId) { conditions.push(`company_id = $${idx++}`); values.push(companyId); }
        if (opportunityId) { conditions.push(`opportunity_id = $${idx++}`); values.push(opportunityId); }
        if (serviceId) { conditions.push(`service_id = $${idx++}`); values.push(serviceId); }
        if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const countRes = await db.query(`SELECT COUNT(*)::int as total FROM crm_inspections ${where}`, values);
        const listRes = await db.query(`SELECT * FROM crm_inspections ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);
        return ctx.json(res, 200, { inspections: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
      } catch (e) {
        console.error("inspections list failed", e?.message);
        return ctx.json(res, 503, { error: "inspection_unavailable" });
      }
    }

    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 30 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const companyId = body?.company_id || body?.companyId;
      const opportunityId = body?.opportunity_id || body?.opportunityId || null;
      const unitId = body?.unit_id || body?.unitId || null;
      const templateId = body?.template_id || body?.templateId || null;
      const serviceId = body?.service_id || body?.serviceId || null;
      const title = sanitizeText(body?.title, 200);
      const responsibleName = sanitizeText(body?.responsible_name || body?.responsibleName, 120);
      const limitations = sanitizeText(body?.limitations, 2000);
      const notes = sanitizeText(body?.notes, 2000);
      const scheduledAt = body?.scheduled_at || body?.scheduledAt ? new Date(body.scheduled_at || body.scheduledAt) : null;

      if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (!title) return ctx.json(res, 400, { error: "invalid_title" });
      if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
      if (unitId && !isValidUuid(unitId)) return ctx.json(res, 400, { error: "invalid_unit_id" });
      if (scheduledAt && isNaN(scheduledAt.getTime())) return ctx.json(res, 400, { error: "invalid_scheduled_at" });

      try {
        const id = crypto.randomUUID();
        const coverage = body?.coverage && typeof body.coverage === "object" ? body.coverage : {};
        const quantities = body?.quantities && typeof body.quantities === "object" ? body.quantities : {};
        const infrastructure = body?.infrastructure && typeof body.infrastructure === "object" ? body.infrastructure : {};
        const photos = Array.isArray(body?.photos) ? body.photos.slice(0,20).map((p) => {
          if (typeof p === "string") return { file_name: p.slice(0,200), authorized: false };
          return {
            file_name: String(p.file_name || p.fileName || "").slice(0,200),
            authorized: !!p.authorized,
            description: String(p.description || "").slice(0,500),
          };
        }) : [];

        const result = await db.query(
          `INSERT INTO crm_inspections (id, company_id, opportunity_id, unit_id, template_id, service_id, title, status, responsible_id, responsible_name, scheduled_at, coverage, quantities, infrastructure, limitations, photos, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'rascunho',$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15::jsonb,$16,$17,$18) RETURNING *`,
          [id, companyId, opportunityId, unitId, templateId, serviceId, title, session.identityId, responsibleName, scheduledAt, JSON.stringify(coverage), JSON.stringify(quantities), JSON.stringify(infrastructure), limitations, JSON.stringify(photos), notes, session.role, session.identityId]
        );

        // Se template fornecido, criar answers vazios baseados no checklist
        if (templateId) {
          try {
            const tplRes = await db.query("SELECT checklist FROM crm_inspection_templates WHERE id = $1", [templateId]);
            const checklist = tplRes.rows[0]?.checklist || [];
            for (const item of checklist) {
              if (!item.id || !item.question) continue;
              await db.query(
                `INSERT INTO crm_inspection_answers (id, inspection_id, item_id, question) VALUES ($1,$2,$3,$4) ON CONFLICT (inspection_id, item_id) DO NOTHING`,
                [crypto.randomUUID(), id, String(item.id).slice(0,100), String(item.question).slice(0,500)]
              );
            }
          } catch {}
        }

        await audit(db, { action: "crm_inspection_create", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 201, { inspection: result.rows[0] });
      } catch (e) {
        console.error("inspection create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleInspectionById(req, res, id) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_inspection_id" });

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      try {
        const insRes = await db.query("SELECT * FROM crm_inspections WHERE id = $1", [id]);
        if (!insRes.rows[0]) return ctx.json(res, 404, { error: "inspection_not_found" });
        const answersRes = await db.query("SELECT * FROM crm_inspection_answers WHERE inspection_id = $1 ORDER BY item_id", [id]);
        return ctx.json(res, 200, { inspection: insRes.rows[0], answers: answersRes.rows });
      } catch (e) {
        console.error("inspection get failed", e?.message);
        return ctx.json(res, 503, { error: "inspection_unavailable" });
      }
    }

    if (req.method === "PATCH") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 30 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const fields = [];
      const values = [];
      let idx = 1;

      if (body.status) {
        const st = String(body.status).toLowerCase();
        if (!["rascunho","em_andamento","concluida","cancelada"].includes(st)) return ctx.json(res, 400, { error: "invalid_status" });
        fields.push(`status = $${idx++}`);
        values.push(st);
        if (st === "concluida") fields.push(`completed_at = NOW()`);
      }
      if (body.responsible_name || body.responsibleName) {
        const rn = sanitizeText(body.responsible_name || body.responsibleName, 120);
        if (rn) { fields.push(`responsible_name = $${idx++}`); values.push(rn); }
      }
      if (body.limitations !== undefined) { fields.push(`limitations = $${idx++}`); values.push(sanitizeText(body.limitations, 2000)); }
      if (body.notes !== undefined) { fields.push(`notes = $${idx++}`); values.push(sanitizeText(body.notes, 2000)); }
      if (body.coverage && typeof body.coverage === "object") { fields.push(`coverage = $${idx++}::jsonb`); values.push(JSON.stringify(body.coverage)); }
      if (body.quantities && typeof body.quantities === "object") { fields.push(`quantities = $${idx++}::jsonb`); values.push(JSON.stringify(body.quantities)); }
      if (body.infrastructure && typeof body.infrastructure === "object") { fields.push(`infrastructure = $${idx++}::jsonb`); values.push(JSON.stringify(body.infrastructure)); }
      if (body.photos && Array.isArray(body.photos)) {
        const photos = body.photos.slice(0,20).map((p) => ({
          file_name: String(p.file_name || p.fileName || "").slice(0,200),
          authorized: !!p.authorized,
          description: String(p.description || "").slice(0,500),
        }));
        fields.push(`photos = $${idx++}::jsonb`);
        values.push(JSON.stringify(photos));
      }

      if (fields.length === 0) return ctx.json(res, 400, { error: "no_fields" });

      try {
        values.push(id);
        const result = await db.query(`UPDATE crm_inspections SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);
        if (!result.rows[0]) return ctx.json(res, 404, { error: "inspection_not_found" });

        const action = body.status ? "crm_inspection_status" : "crm_inspection_update";
        await audit(db, { action, target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 200, { inspection: result.rows[0] });
      } catch (e) {
        console.error("inspection update failed", e?.message);
        return ctx.json(res, 503, { error: "update_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, PATCH" });
  }

  async function handleAnswer(req, res, inspectionId) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireSameOrigin(req, res)) return;
    if (!isValidUuid(inspectionId)) return ctx.json(res, 400, { error: "invalid_inspection_id" });
    const db = ctx.getPool();

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      let body;
      try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const itemId = String(body?.item_id || body?.itemId || "").trim().slice(0,100);
      const answer = sanitizeText(body?.answer, 2000);
      const quantity = body?.quantity !== undefined ? parseInt(body.quantity, 10) : null;
      const observed = sanitizeText(body?.observed, 1000);
      const photoRef = sanitizeText(body?.photo_ref || body?.photoRef, 500);

      if (!itemId) return ctx.json(res, 400, { error: "invalid_item_id" });
      if (quantity !== null && (isNaN(quantity) || quantity < 0)) return ctx.json(res, 400, { error: "invalid_quantity" });

      try {
        const existing = await db.query("SELECT id FROM crm_inspection_answers WHERE inspection_id = $1 AND item_id = $2", [inspectionId, itemId]);
        let result;
        if (existing.rows[0]) {
          result = await db.query(
            `UPDATE crm_inspection_answers SET answer = COALESCE($3, answer), quantity = COALESCE($4, quantity), observed = COALESCE($5, observed), photo_ref = COALESCE($6, photo_ref), updated_at = NOW() WHERE inspection_id = $1 AND item_id = $2 RETURNING *`,
            [inspectionId, itemId, answer, quantity, observed, photoRef]
          );
        } else {
          // Buscar question do template ou usar itemId como fallback
          let question = itemId;
          try {
            const insRes = await db.query("SELECT template_id FROM crm_inspections WHERE id = $1", [inspectionId]);
            const tplId = insRes.rows[0]?.template_id;
            if (tplId) {
              const tplRes = await db.query("SELECT checklist FROM crm_inspection_templates WHERE id = $1", [tplId]);
              const item = (tplRes.rows[0]?.checklist || []).find((it) => it.id === itemId);
              if (item?.question) question = String(item.question).slice(0,500);
            }
          } catch {}
          result = await db.query(
            `INSERT INTO crm_inspection_answers (id, inspection_id, item_id, question, answer, quantity, observed, photo_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [crypto.randomUUID(), inspectionId, itemId, question, answer, quantity, observed, photoRef]
          );
        }

        await audit(db, { action: "crm_inspection_answer", target: `${inspectionId}:${itemId}`, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 200, { answer: result.rows[0] });
      } catch (e) {
        console.error("inspection answer failed", e?.message);
        return ctx.json(res, 503, { error: "answer_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "POST, PUT, PATCH" });
  }

  return { handleTemplates, handleInspections, handleInspectionById, handleAnswer };
}
