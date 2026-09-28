// CRM-14: orçamento de mão de obra com composição de cobertura, salários e custos aplicáveis, benefícios, provisões, substituição, supervisão, uniforme/EPI, deslocamento, materiais e indiretos.

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

function calcItemTotals(item) {
  const salary = Number(item.salary || 0);
  const qty = Number(item.quantity || 1);
  const benefits = item.benefits && typeof item.benefits === "object" ? Object.values(item.benefits).reduce((sum, v) => sum + (Number(v) || 0), 0) : 0;
  const provisions = item.provisions && typeof item.provisions === "object" ? Object.values(item.provisions).reduce((sum, v) => sum + (Number(v) || 0), 0) : 0;
  const other = item.other_costs && typeof item.other_costs === "object" ? Object.values(item.other_costs).reduce((sum, v) => sum + (Number(v) || 0), 0) : 0;
  const totalCostPerUnit = salary + benefits + provisions + Number(item.substitution_cost || 0) + Number(item.supervision_cost || 0) + Number(item.uniform_cost || 0) + Number(item.displacement_cost || 0) + Number(item.materials_cost || 0) + Number(item.indirect_cost || 0) + other;
  const totalCost = totalCostPerUnit * qty;
  const unitPrice = Number(item.unit_price || 0) || totalCostPerUnit;
  const totalPrice = unitPrice * qty;
  return { totalCostPerUnit, totalCost, unitPrice, totalPrice };
}

export function createLaborBudgetApi(ctx) {
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
        const countRes = await db.query(`SELECT COUNT(*)::int as total FROM crm_labor_budgets ${where}`, values);
        const listRes = await db.query(`SELECT * FROM crm_labor_budgets ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...values, limit, offset]);
        return ctx.json(res, 200, { budgets: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
      } catch (e) {
        console.error("labor budgets list failed", e?.message);
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
      const title = sanitizeText(body?.title, 200);
      const notes = sanitizeText(body?.notes, 2000);

      if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (!title) return ctx.json(res, 400, { error: "invalid_title" });
      if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
      if (inspectionId && !isValidUuid(inspectionId)) return ctx.json(res, 400, { error: "invalid_inspection_id" });

      try {
        const id = crypto.randomUUID();
        const coverage = body?.coverage && typeof body.coverage === "object" ? body.coverage : {};
        const result = await db.query(
          `INSERT INTO crm_labor_budgets (id, company_id, opportunity_id, inspection_id, title, status, coverage, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,'rascunho',$6::jsonb,$7,$8,$9) RETURNING *`,
          [id, companyId, opportunityId, inspectionId, title, JSON.stringify(coverage), notes, session.role, session.identityId]
        );

        await audit(db, { action: "crm_labor_budget_create", target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 201, { budget: result.rows[0] });
      } catch (e) {
        console.error("labor budget create failed", e?.message);
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
        const budgetRes = await db.query("SELECT * FROM crm_labor_budgets WHERE id = $1", [id]);
        if (!budgetRes.rows[0]) return ctx.json(res, 404, { error: "budget_not_found" });
        const itemsRes = await db.query("SELECT * FROM crm_labor_budget_items WHERE budget_id = $1 ORDER BY created_at", [id]);
        return ctx.json(res, 200, { budget: budgetRes.rows[0], items: itemsRes.rows });
      } catch (e) {
        console.error("labor budget get failed", e?.message);
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
      if (body.coverage && typeof body.coverage === "object") { fields.push(`coverage = $${idx++}::jsonb`); values.push(JSON.stringify(body.coverage)); }
      if (body.margin_percent !== undefined) {
        const mp = body.margin_percent === null ? null : Number(body.margin_percent);
        if (mp !== null && (isNaN(mp) || mp < -100 || mp > 100)) return ctx.json(res, 400, { error: "invalid_margin" });
        fields.push(`margin_percent = $${idx++}`);
        values.push(mp);
      }

      if (fields.length === 0) return ctx.json(res, 400, { error: "no_fields" });

      try {
        // Recalcular totais se itens existirem
        const itemsRes = await db.query("SELECT total_cost, total_price FROM crm_labor_budget_items WHERE budget_id = $1", [id]);
        let totalCost = 0;
        let totalPrice = 0;
        for (const it of itemsRes.rows) {
          totalCost += Number(it.total_cost || 0);
          totalPrice += Number(it.total_price || 0);
        }
        if (itemsRes.rows.length > 0) {
          fields.push(`total_cost = $${idx++}`);
          values.push(totalCost);
          fields.push(`total_price = $${idx++}`);
          values.push(totalPrice);
        }

        values.push(id);
        const result = await db.query(`UPDATE crm_labor_budgets SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, values);
        if (!result.rows[0]) return ctx.json(res, 404, { error: "budget_not_found" });

        const action = body.status ? "crm_labor_budget_status" : "crm_labor_budget_update";
        await audit(db, { action, target: id, result: "allowed", actorKind: session.role, actorId: session.identityId });

        // CRM-18: se orçamento foi alterado (não só status), reabrir descontos aprovados
        if (body.title || body.notes !== undefined || body.coverage || body.margin_percent !== undefined) {
          try {
            await db.query(
              `UPDATE crm_discount_requests SET reapproval_required = true, reapproval_reason = 'Orçamento mão de obra alterado após aprovação (dados/custos)', status = CASE WHEN status = 'aprovado' THEN 'em_analise' ELSE status END, updated_at = NOW() WHERE labor_budget_id = $1 AND status = 'aprovado'`,
              [id]
            );
          } catch {}
        }

        return ctx.json(res, 200, { budget: result.rows[0] });
      } catch (e) {
        console.error("labor budget update failed", e?.message);
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

      const roleName = sanitizeText(body?.role_name || body?.roleName, 100);
      const functionName = sanitizeText(body?.function_name || body?.functionName, 100);
      const quantity = body?.quantity ? parseInt(body.quantity, 10) : 1;
      const shiftType = sanitizeText(body?.shift_type || body?.shiftType, 100);
      const salary = body?.salary ? Number(body.salary) : 0;
      const notes = sanitizeText(body?.notes, 500);

      if (!roleName) return ctx.json(res, 400, { error: "invalid_role_name" });
      if (isNaN(quantity) || quantity < 1) return ctx.json(res, 400, { error: "invalid_quantity" });
      if (isNaN(salary) || salary < 0) return ctx.json(res, 400, { error: "invalid_salary" });

      try {
        const id = crypto.randomUUID();
        const benefits = body?.benefits && typeof body.benefits === "object" ? body.benefits : {};
        const provisions = body?.provisions && typeof body.provisions === "object" ? body.provisions : {};
        const otherCosts = body?.other_costs && typeof body.other_costs === "object" ? body.other_costs : {};

        const itemData = {
          quantity,
          salary,
          benefits,
          provisions,
          other_costs: otherCosts,
          substitution_cost: Number(body?.substitution_cost || body?.substitutionCost || 0),
          supervision_cost: Number(body?.supervision_cost || body?.supervisionCost || 0),
          uniform_cost: Number(body?.uniform_cost || body?.uniformCost || 0),
          displacement_cost: Number(body?.displacement_cost || body?.displacementCost || 0),
          materials_cost: Number(body?.materials_cost || body?.materialsCost || 0),
          indirect_cost: Number(body?.indirect_cost || body?.indirectCost || 0),
          unit_price: Number(body?.unit_price || body?.unitPrice || 0),
        };

        const totals = calcItemTotals(itemData);

        const result = await db.query(
          `INSERT INTO crm_labor_budget_items (id, budget_id, role_name, function_name, quantity, shift_type, salary, benefits, provisions, substitution_cost, supervision_cost, uniform_cost, displacement_cost, materials_cost, indirect_cost, other_costs, total_cost, unit_price, total_price, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18,$19,$20) RETURNING *`,
          [id, budgetId, roleName, functionName, quantity, shiftType, salary, JSON.stringify(benefits), JSON.stringify(provisions), itemData.substitution_cost, itemData.supervision_cost, itemData.uniform_cost, itemData.displacement_cost, itemData.materials_cost, itemData.indirect_cost, JSON.stringify(otherCosts), totals.totalCost, totals.unitPrice || totals.totalCostPerUnit, totals.totalPrice || totals.totalCost, notes]
        );

        // Atualizar totais do orçamento
        const sumRes = await db.query("SELECT COALESCE(SUM(total_cost),0)::numeric as sum_cost, COALESCE(SUM(total_price),0)::numeric as sum_price FROM crm_labor_budget_items WHERE budget_id = $1", [budgetId]);
        await db.query("UPDATE crm_labor_budgets SET total_cost = $2, total_price = $3, updated_at = NOW() WHERE id = $1", [budgetId, sumRes.rows[0].sum_cost, sumRes.rows[0].sum_price]);

        // CRM-18: alteração de itens/custos após aprovação reabre aprovação de descontos
        try {
          await db.query(
            `UPDATE crm_discount_requests SET reapproval_required = true, reapproval_reason = 'Orçamento mão de obra alterado após aprovação (item adicionado)', status = CASE WHEN status = 'aprovado' THEN 'em_analise' ELSE status END, updated_at = NOW() WHERE labor_budget_id = $1 AND status = 'aprovado'`,
            [budgetId]
          );
        } catch {}

        await audit(db, { action: "crm_labor_budget_item_create", target: `${budgetId}:${id}`, result: "allowed", actorKind: session.role, actorId: session.identityId });

        return ctx.json(res, 201, { item: result.rows[0] });
      } catch (e) {
        console.error("labor item create failed", e?.message);
        return ctx.json(res, 503, { error: "create_failed" });
      }
    }

    if (req.method === "GET") {
      if (!requireSameOrigin(req, res)) return;
      try {
        const result = await db.query("SELECT * FROM crm_labor_budget_items WHERE budget_id = $1 ORDER BY created_at", [budgetId]);
        return ctx.json(res, 200, { items: result.rows, total: result.rows.length });
      } catch (e) {
        console.error("labor items list failed", e?.message);
        return ctx.json(res, 503, { error: "budget_unavailable" });
      }
    }

    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
  }

  return { handleBudgets, handleBudgetById, handleItems };
}
