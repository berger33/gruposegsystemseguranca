// PUB-01: catálogo único dos seis serviços validados, com descrição, público, perguntas de qualificação e flag de publicação
// CRM-11: separar serviços recorrentes/avulsos, instalação, manutenção, venda, locação/comodato. Campos: unidade de cobrança, escopo, exclusões, recursos, custo, preço, vigência e aprovação.
// Fonte primária: tabela service_catalog (DB), fallback: src/lib/service-catalog.mjs

import { PUBLIC_SERVICES as FALLBACK_SERVICES } from "../lib/service-catalog.mjs";

const VALID_SERVICE_TYPES = new Set(["recorrente","avulso","instalacao","manutencao","venda","locacao","comodato","outro"]);
const VALID_APPROVAL = new Set(["rascunho","em_revisao","aprovado","arquivado"]);

export function createServiceCatalogApi(ctx) {
  // ctx: { json, getPool }

  async function handleList(req, res, url) {
    if (req.method !== "GET") {
      return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
    }

    const includeUnpublished = url.searchParams.get("includeUnpublished") === "true";
    const onlyValidated = url.searchParams.get("onlyValidated") !== "false"; // default true
    const serviceType = url.searchParams.get("serviceType") || url.searchParams.get("type");
    const approvalStatus = url.searchParams.get("approvalStatus");

    if (serviceType && !VALID_SERVICE_TYPES.has(serviceType)) {
      return ctx.json(res, 400, { error: "invalid_service_type" });
    }
    if (approvalStatus && !VALID_APPROVAL.has(approvalStatus)) {
      return ctx.json(res, 400, { error: "invalid_approval_status" });
    }

    let services = [];

    try {
      const db = ctx.getPool();
      let query = `SELECT id, name, short_description, full_description, target_audience, qualification_questions, is_published, is_validated, validation_note,
        service_type, billing_unit, scope_description, exclusions, resources, resources_json, cost, price, validity_days, approval_status, is_recurring, version, currency, created_at, updated_at
        FROM service_catalog`;
      const conditions = [];
      const values = [];
      let idx = 1;
      if (!includeUnpublished) conditions.push("is_published = true");
      if (onlyValidated) conditions.push("is_validated = true");
      if (serviceType) { conditions.push(`service_type = $${idx++}`); values.push(serviceType); }
      if (approvalStatus) { conditions.push(`approval_status = $${idx++}`); values.push(approvalStatus); }
      if (conditions.length) query += " WHERE " + conditions.join(" AND ");
      query += " ORDER BY name";

      const result = await db.query(query, values);
      services = result.rows.map(r => ({
        id: r.id,
        name: r.name,
        short: r.short_description,
        description: r.full_description,
        audience: r.target_audience,
        questions: r.qualification_questions,
        isPublished: r.is_published,
        isValidated: r.is_validated,
        validationNote: r.validation_note,
        serviceType: r.service_type,
        billingUnit: r.billing_unit,
        scope: r.scope_description,
        exclusions: r.exclusions,
        resources: r.resources,
        resourcesJson: r.resources_json,
        cost: r.cost,
        price: r.price,
        validityDays: r.validity_days,
        approvalStatus: r.approval_status,
        isRecurring: r.is_recurring,
        version: r.version,
        currency: r.currency,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (e) {
      // Fallback para arquivo estático quando DB não configurado
      services = FALLBACK_SERVICES.filter(s => {
        if (!includeUnpublished && s.isPublished === false) return false;
        if (onlyValidated && s.isValidated === false) return false;
        if (serviceType && s.serviceType !== serviceType) return false;
        if (approvalStatus && s.approvalStatus !== approvalStatus) return false;
        return true;
      }).map(s => ({
        id: s.id,
        name: s.name,
        short: s.short,
        description: s.description,
        audience: s.audience,
        questions: s.questions,
        isPublished: s.isPublished,
        isValidated: s.isValidated,
        validationNote: s.validationNote,
        serviceType: s.serviceType,
        billingUnit: s.billingUnit,
        scope: s.scope,
        exclusions: s.exclusions,
        resources: s.resources,
        validityDays: s.validityDays,
        approvalStatus: s.approvalStatus,
        isRecurring: s.isRecurring,
        version: s.version,
        cost: s.cost,
        price: s.price,
        currency: s.currency,
        fallback: true,
      }));
    }

    return ctx.json(res, 200, { services, total: services.length, source: services[0]?.fallback ? "fallback" : "database" });
  }

  async function handleGet(req, res, id) {
    if (req.method !== "GET") {
      return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
    }

    let service = null;

    try {
      const db = ctx.getPool();
      const result = await db.query(`SELECT id, name, short_description, full_description, target_audience, qualification_questions, is_published, is_validated, validation_note,
        service_type, billing_unit, scope_description, exclusions, resources, resources_json, cost, price, validity_days, approval_status, is_recurring, version, currency
        FROM service_catalog WHERE id = $1 OR name = $1`, [id]);
      if (result.rows[0]) {
        const r = result.rows[0];
        service = {
          id: r.id,
          name: r.name,
          short: r.short_description,
          description: r.full_description,
          audience: r.target_audience,
          questions: r.qualification_questions,
          isPublished: r.is_published,
          isValidated: r.is_validated,
          validationNote: r.validation_note,
          serviceType: r.service_type,
          billingUnit: r.billing_unit,
          scope: r.scope_description,
          exclusions: r.exclusions,
          resources: r.resources,
          resourcesJson: r.resources_json,
          cost: r.cost,
          price: r.price,
          validityDays: r.validity_days,
          approvalStatus: r.approval_status,
          isRecurring: r.is_recurring,
          version: r.version,
          currency: r.currency,
        };
      }
    } catch {
      // fallback
      const fb = FALLBACK_SERVICES.find(s => s.id === id || s.name === id) || null;
      if (fb) service = { ...fb, fallback: true };
    }

    if (!service) return ctx.json(res, 404, { error: "service_not_found" });

    return ctx.json(res, 200, { service });
  }

  return { handleList, handleGet };
}
