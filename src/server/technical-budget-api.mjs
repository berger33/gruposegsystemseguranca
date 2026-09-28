// CRM-15: orçamento técnico com materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia e manutenção.

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

const ITEM_TYPES = new Set(["material","equipamento","mao_obra","instalacao","deslocamento","infraestrutura","licenca","garantia","manutencao","outro"]);

export function createTechnicalBudgetApi(ctx) {
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

  async function handleBudgets(req, res, url) {
    const session = requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      const companyId = url.searchParams.get("companyId");
      const opportunityId = url.searchParams.get("opportunityId");
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
        if (status) { conditions.push(`status = $${idx++}`); values.push(status); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const countRes = await db.query(`SELECT COUNT(*)::int as total FROM crm_technical_budgets ${where}`, values);
        const listRes = await db.query(`SELECT * FROM crm_technical_budgets ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);
        return ctx.json(res, 200, { budgets: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
      } catch (e) {
        console.error("tech budgets list failed", e?.message);
        return ctx.json(res, 503, { error: "budget_unavailable" });
      }
    }

    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 30 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const companyId = body?.company_id || body?.companyId;
      const opportunityId = body?.opportunity_id || body?.opportunityId || null;
      const inspectionId = body?.inspection_id || body?.inspectionId || null;
      const laborBudgetId = body?.labor_budget_id || body?.laborBudgetId || null;
      const title = sanitizeText(body?.title, 200);
      const notes = sanitizeText(body?.notes, 2000);
      const warrantyDesc = sanitizeText(body?.warranty_description || body?.warrantyDescription, 1000);
      const maintenanceDesc = sanitizeText(body?.maintenance_description || body?.maintenanceDescription, 1000);

      if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (!title) return ctx.json(res, 400, { error: "invalid_title" });
      if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
      if (inspectionId && !isValidUuid(inspectionId)) return ctx.json(res, 400, { error: "invalid_inspection_id" });
      if (laborBudgetId && !isValidUuid(laborBudgetId)) return ctx.json(res, 400, { error: "invalid_labor_budget_id" });

      try {
        const id = crypto.randomUUID();
        const result = await db.query(
          `INSERT INTO crm_technical_budgets (id, company_id, opportunity_id, inspection_id, labor_budget_id, title, status, warranty_description, maintenance_description, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,'rascunho',$7,$8,$9,$10,$11) RETURNING *`,
          [id, companyId, opportunityId, inspectionId, laborBudgetId, title, warrantyDesc, maintenanceDesc, notes, session.role, session.identityId]
        );

        await audit(db, { action: "crm_technical_budget_create", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 201, { budget: result.rows[0] });
      } catch (e) {
        console.error("tech budget create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  async function handleBudgetById(req, res, id) {
    const session = requireAdminSession(req, res);
    if (!session) return;
    const db = ctx.getPool();
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_budget_id" });

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      try {
        const budgetRes = await db.query("SELECT * FROM crm_technical_budgets WHERE id = $1", [id]);
        if (!budgetRes.rows[0]) return ctx.json(res, 404, { error: "budget_not_found" });
        const itemsRes = await db.query("SELECT * FROM crm_technical_budget_items WHERE budget_id = $1 ORDER BY type, created_at", [id]);
        return ctx.json(res, 200, { budget: budgetRes.rows[0], items: itemsRes.rows });
      } catch (e) {
        console.error("tech budget get failed", e?.message);
        return ctx.json(res, 503, { error: "budget_unavailable" });
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
        if (!["rascunho","em_revisao","aprovado","arquivado"].includes(st)) return ctx.json(res, 400, { error: "invalid_status" });
        fields.push(`status = $${idx++}`);
        values.push(st);
        if (st === "aprovado") {
          fields.push(`approved_by = $${idx++}`);
          values.push(session.identityId);
          fields.push(`approved_at = NOW()`);
        }
      }
      if (body.title) {
        const t = sanitizeText(body.title, 200);
        if (!t) return ctx.json(res, 400, { error: "invalid_title" });
        fields.push(`title = $${idx++}`);
        values.push(t);
      }
      if (body.notes !== undefined) { fields.push(`notes = $${idx++}`); values.push(sanitizeText(body.notes, 2000)); }
      if (body.warranty_description !== undefined || body.warrantyDescription !== undefined) { fields.push(`warranty_description = $${idx++}`); values.push(sanitizeText(body.warranty_description || body.warrantyDescription, 1000)); }
      if (body.maintenance_description !== undefined || body.maintenanceDescription !== undefined) { fields.push(`maintenance_description = $${idx++}`); values.push(sanitizeText(body.maintenance_description || body.maintenanceDescription, 1000)); }
      if (body.margin_percent !== undefined) {
        const mp = body.margin_percent === null ? null : Number(body.margin_percent);
        if (mp !== null && (isNaN(mp) || mp < -100 || mp > 100)) return ctx.json(res, 400, { error: "invalid_margin" });
        fields.push(`margin_percent = $${idx++}`);
        values.push(mp);
      }

      if (fields.length === 0) return ctx.json(res, 400, { error: "no_fields" });

      try {
        // Recalcular totais por tipo
        const itemsRes = await db.query("SELECT type, COALESCE(SUM(total_cost),0)::numeric as sum_cost, COALESCE(SUM(total_price),0)::numeric as sum_price FROM crm_technical_budget_items WHERE budget_id = $1 GROUP BY type", [id]);
        let totalCost = 0;
        let totalPrice = 0;
        const byType = {};
        for (const r of itemsRes.rows) {
          const c = Number(r.sum_cost || 0);
          const p = Number(r.sum_price || 0);
          byType[r.type] = { cost: c, price: p };
          totalCost += c;
          totalPrice += p;
        }
        if (itemsRes.rows.length > 0) {
          fields.push(`total_cost = $${idx++}`); values.push(totalCost);
          fields.push(`total_price = $${idx++}`); values.push(totalPrice);
          // totais por tipo
          const typeMap = {
            material: "total_materials_cost",
            equipamento: "total_equipment_cost",
            mao_obra: "total_labor_cost",
            instalacao: "total_installation_cost",
            deslocamento: "total_displacement_cost",
            infraestrutura: "total_infrastructure_cost",
            licenca: "total_licenses_cost",
            garantia: "total_warranty_cost",
            manutencao: "total_maintenance_cost",
          };
          for (const [type, col] of Object.entries(typeMap)) {
            fields.push(`${col} = $${idx++}`);
            values.push(byType[type]?.cost || 0);
          }
        }

        values.push(id);
        const result = await db.query(`UPDATE crm_technical_budgets SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);
        if (!result.rows[0]) return ctx.json(res, 404, { error: "budget_not_found" });

        const action = body.status ? "crm_technical_budget_status" : "crm_technical_budget_update";
        await audit(db, { action, target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        // CRM-18: se orçamento foi alterado (não só status), reabrir descontos aprovados
        if (body.title || body.notes !== undefined || body.warranty_description !== undefined || body.warrantyDescription !== undefined || body.maintenance_description !== undefined || body.maintenanceDescription !== undefined || body.margin_percent !== undefined) {
          try {
            await db.query(
              `UPDATE crm_discount_requests SET reapproval_required = true, reapproval_reason = 'Orçamento técnico alterado após aprovação (dados/custos)', status = CASE WHEN status = 'aprovado' THEN 'em_analise' ELSE status END, updated_at = NOW() WHERE technical_budget_id = $1 AND status = 'aprovado'`,
              [id]
            );
          } catch {}
        }

        return ctx.json(res, 200, { budget: result.rows[0] });
      } catch (e) {
        console.error("tech budget update failed", e?.message);
        return ctx.json(res, 503, { error: "update_failed" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, PATCH" });
  }

  async function handleItems(req, res, budgetId) {
    const session = requireAdminSession(req, res);
    if (!session) return;
    if (!isValidUuid(budgetId)) return ctx.json(res, 400, { error: "invalid_budget_id" });
    const db = ctx.getPool();

    if (req.method === "POST") {
      if (!requireSameOrigin(req, res)) return;
      let body;
      try { body = await ctx.readJson(req, 30 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

      const type = String(body?.type || "").toLowerCase();
      const description = sanitizeText(body?.description, 500);
      const quantity = body?.quantity ? Number(body.quantity) : 1;
      const unit = sanitizeText(body?.unit, 50) || "un";
      const unitCost = body?.unit_cost || body?.unitCost ? Number(body.unit_cost || body.unitCost) : 0;
      const unitPrice = body?.unit_price || body?.unitPrice ? Number(body.unit_price || body.unitPrice) : unitCost;
      const equipmentId = body?.equipment_id || body?.equipmentId || null;
      const supplierName = sanitizeText(body?.supplier_name || body?.supplierName, 200);
      const notes = sanitizeText(body?.notes, 500);

      if (!ITEM_TYPES.has(type)) return ctx.json(res, 400, { error: "invalid_type" });
      if (!description) return ctx.json(res, 400, { error: "invalid_description" });
      if (isNaN(quantity) || quantity < 0) return ctx.json(res, 400, { error: "invalid_quantity" });
      if (isNaN(unitCost) || unitCost < 0) return ctx.json(res, 400, { error: "invalid_unit_cost" });

      try {
        const id = crypto.randomUUID();
        const totalCost = quantity * unitCost;
        const totalPrice = quantity * unitPrice;

        const result = await db.query(
          `INSERT INTO crm_technical_budget_items (id, budget_id, type, description, equipment_id, quantity, unit, unit_cost, total_cost, unit_price, total_price, supplier_name, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [id, budgetId, type, description, equipmentId, quantity, unit, unitCost, totalCost, unitPrice, totalPrice, supplierName, notes]
        );

        // Atualizar totais do orçamento por tipo
        const sumRes = await db.query("SELECT type, COALESCE(SUM(total_cost),0)::numeric as sum_cost, COALESCE(SUM(total_price),0)::numeric as sum_price FROM crm_technical_budget_items WHERE budget_id = $1 GROUP BY type", [budgetId]);
        let totalCostSum = 0;
        let totalPriceSum = 0;
        const byType = {};
        for (const r of sumRes.rows) {
          const c = Number(r.sum_cost || 0);
          const p = Number(r.sum_price || 0);
          byType[r.type] = { cost: c, price: p };
          totalCostSum += c;
          totalPriceSum += p;
        }

        const typeMap = {
          material: "total_materials_cost",
          equipamento: "total_equipment_cost",
          mao_obra: "total_labor_cost",
          instalacao: "total_installation_cost",
          deslocamento: "total_displacement_cost",
          infraestrutura: "total_infrastructure_cost",
          licenca: "total_licenses_cost",
          garantia: "total_warranty_cost",
          manutencao: "total_maintenance_cost",
        };

        const setClauses = ["total_cost = $2", "total_price = $3"];
        const vals = [budgetId, totalCostSum, totalPriceSum];
        let idx = 4;
        for (const [typeKey, col] of Object.entries(typeMap)) {
          setClauses.push(`${col} = $${idx++}`);
          vals.push(byType[typeKey]?.cost || 0);
        }
        await db.query(`UPDATE crm_technical_budgets SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $1`, vals);

        // CRM-18: alteração de itens/custos após aprovação reabre aprovação de descontos
        try {
          await db.query(
            `UPDATE crm_discount_requests SET reapproval_required = true, reapproval_reason = 'Orçamento técnico alterado após aprovação (item adicionado)', status = CASE WHEN status = 'aprovado' THEN 'em_analise' ELSE status END, updated_at = NOW() WHERE technical_budget_id = $1 AND status = 'aprovado'`,
            [budgetId]
          );
        } catch {}

        await audit(db, { action: "crm_technical_budget_item_create", target: `${budgetId}:${id}`, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 201, { item: result.rows[0] });
      } catch (e) {
        console.error("tech item create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      }
    }

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      try {
        const result = await db.query("SELECT * FROM crm_technical_budget_items WHERE budget_id = $1 ORDER BY type, created_at", [budgetId]);
        return ctx.json(res, 200, { items: result.rows, total: result.rows.length });
      } catch (e) {
        console.error("tech items list failed", e?.message);
        return ctx.json(res, 503, { error: "budget_unavailable" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  return { handleBudgets, handleBudgetById, handleItems };
}
