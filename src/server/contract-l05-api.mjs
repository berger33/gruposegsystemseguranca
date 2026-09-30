import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MANAGERS = new Set(["marcelo", "admin"]);
const CONTRACT_READERS = new Set(["marcelo", "admin", "comercial"]);
const ITEM_TYPES = new Set(["material", "equipamento", "mao_obra", "servico", "instalacao", "deslocamento", "infraestrutura", "licenca", "garantia", "manutencao", "outro"]);
const RECURRENCES = new Set(["recorrente", "avulso", "implantacao", "outro"]);

function isUuid(value) { return typeof value === "string" && UUID.test(value); }
function text(value, max, { required = false, min = 1 } = {}) {
  if (value == null) return required ? null : null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) return null;
  return cleaned;
}
function isoDate(value) {
  if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return null;
  return value;
}
function money(value) {
  if (value == null || value === "") return 0;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 999999999999.99 ? number : null;
}
function cleanFields(body, allowed) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body).every(key => allowed.has(key));
}

/**
 * L05 owns the CRM contract routes.  Earlier modules remain in the repository
 * for migration compatibility, but this API is the server-side authorization
 * boundary used by the business workspace and integration gate.
 */
export function createContractL05Api({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const bad = (res, error) => json(res, 400, { error });
  const unavailable = (res, error = "contracts_unavailable") => json(res, 503, { error });

  async function session(req, res) {
    const value = await readAdminSession(req);
    if (!value) { json(res, 401, { error: "admin_session_required" }); return null; }
    if (!CONTRACT_READERS.has(value.role)) { json(res, 403, { error: "contract_access_forbidden" }); return null; }
    return value;
  }
  function manager(res, value) {
    if (!MANAGERS.has(value.role)) { json(res, 403, { error: "contract_management_forbidden" }); return false; }
    return true;
  }
  function sameOriginRequired(req, res) {
    if (sameOrigin(req)) return true;
    json(res, 403, { error: "same_origin_required" });
    return false;
  }
  async function body(req, res, allowed, limit = 50 * 1024) {
    let parsed;
    try { parsed = await readJson(req, limit); } catch { bad(res, "invalid_json"); return null; }
    if (!cleanFields(parsed, allowed)) { bad(res, "field_not_editable"); return null; }
    return parsed;
  }
  async function audit(db, actor, action, target) {
    // Deliberately no catch: every protected L05 mutation rolls back when the
    // durable audit row cannot be persisted.
    await db.query(
      "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')",
      [actor.role, actor.identityId || null, action, target],
    );
  }
  async function contractForRead(db, id, actor) {
    const params = [id];
    let scope = "";
    if (actor.role === "comercial") {
      params.push(actor.identityId);
      scope = " AND c.responsible_id = $2";
    }
    const result = await db.query(`SELECT c.* FROM crm_contracts c WHERE c.id=$1${scope}`, params);
    return result.rows[0] || null;
  }
  async function existingCompany(db, companyId) {
    const result = await db.query("SELECT id, display_name FROM crm_companies WHERE id=$1 AND status='active'", [companyId]);
    return result.rows[0] || null;
  }
  async function seedImplantation(db, contract, actor) {
    const result = await db.query(
      `INSERT INTO crm_contract_implantations
       (id, contract_id, proposal_id, proposal_version, status, created_by, created_by_id)
       VALUES ($1,$2,$3,$4,'planejada',$5,$6)
       ON CONFLICT (contract_id) DO UPDATE SET contract_id=EXCLUDED.contract_id
       RETURNING *`,
      [randomUUID(), contract.id, contract.proposal_id, contract.proposal_version || 1, actor.role, actor.identityId || null],
    );
    const implantation = result.rows[0];
    const standardSteps = [
      ["contrato", "Contrato e evidência de assinatura"], ["data_inicio", "Data de início definida"],
      ["postos", "Postos e turnos dimensionados"], ["dimensionamento", "Dimensionamento validado"],
      ["contratacao_alocacao", "Contratação ou alocação de equipe"], ["exames_treinamentos", "Exames e treinamentos"],
      ["equipamentos", "Equipamentos disponíveis"], ["instrucoes", "Instruções operacionais"],
      ["faturamento", "Configuração de faturamento"], ["convite_cliente", "Convite do cliente para o portal"],
    ];
    for (const [stepId, title] of standardSteps) {
      await db.query("INSERT INTO crm_implantation_steps (id,implantation_id,contract_id,step_id,title,status) VALUES ($1,$2,$3,$4,$5,'pendente') ON CONFLICT (implantation_id,step_id) DO NOTHING", [randomUUID(), implantation.id, contract.id, stepId, title]);
    }
    return implantation;
  }
  async function createManual(db, actor, input) {
    const companyId = input.company_id;
    const title = text(input.title, 200, { required: true });
    const originDetails = text(input.origin_details, 500, { required: true, min: 10 });
    const serviceSummary = text(input.service_summary, 2000, { required: true });
    const startsOn = isoDate(input.starts_on);
    const endsOn = input.ends_on == null || input.ends_on === "" ? null : isoDate(input.ends_on);
    const totalPrice = money(input.total_price);
    const totalCost = money(input.total_cost);
    const requestKey = input.request_key;
    if (!isUuid(companyId) || !title || !originDetails || !serviceSummary || !startsOn || (input.ends_on && !endsOn) || (endsOn && endsOn < startsOn) || totalPrice == null || totalCost == null || !isUuid(requestKey)) {
      return { status: 400, error: "invalid_manual_contract" };
    }
    if (!await existingCompany(db, companyId)) return { status: 404, error: "company_not_found" };
    const existing = await db.query("SELECT * FROM crm_contracts WHERE idempotency_key=$1", [`manual:${requestKey}`]);
    if (existing.rows[0]) return { status: 200, contract: existing.rows[0], created: false };
    const id = randomUUID();
    const contract = (await db.query(
      `INSERT INTO crm_contracts
       (id, proposal_id, proposal_version, company_id, title, status, origin, origin_details,
        service_summary, starts_on, ends_on, total_cost, total_price, version, idempotency_key, created_by, created_by_id)
       VALUES ($1,NULL,1,$2,$3,'rascunho','manual',$4,$5,$6,$7,$8,$9,1,$10,$11,$12)
       RETURNING *`,
      [id, companyId, title, originDetails, serviceSummary, startsOn, endsOn, totalCost, totalPrice, `manual:${requestKey}`, actor.role, actor.identityId || null],
    )).rows[0];
    await seedImplantation(db, contract, actor);
    await audit(db, actor, "l05_contract_create", id);
    return { status: 201, contract, created: true };
  }
  async function createFromProposal(db, actor, input) {
    const proposalId = input.proposal_id;
    const version = Number.isInteger(input.proposal_version) && input.proposal_version > 0 ? input.proposal_version : null;
    if (!isUuid(proposalId) || !version) return { status: 400, error: "invalid_proposal_reference" };
    const proposalResult = await db.query("SELECT * FROM crm_proposals WHERE id=$1 FOR UPDATE", [proposalId]);
    const proposal = proposalResult.rows[0];
    if (!proposal) return { status: 404, error: "proposal_not_found" };
    if (proposal.status !== "aceita" || proposal.version !== version) return { status: 409, error: "accepted_current_proposal_version_required" };
    const snapshot = await db.query("SELECT id FROM crm_proposal_versions WHERE proposal_id=$1 AND version=$2", [proposalId, version]);
    if (!snapshot.rows[0]) return { status: 409, error: "proposal_version_not_preserved" };
    const previous = await db.query("SELECT * FROM crm_contracts WHERE proposal_id=$1 AND proposal_version=$2", [proposalId, version]);
    if (previous.rows[0]) return { status: 200, contract: previous.rows[0], created: false };
    const id = randomUUID();
    let contract;
    try {
      contract = (await db.query(
        `INSERT INTO crm_contracts
         (id, proposal_id, proposal_version, company_id, opportunity_id, title, status, origin,
          version,total_cost,total_price,margin_percent,validity_days,validity_until,conditions,notes,idempotency_key,created_by,created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,'rascunho','crm_proposal_acceptance',1,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [id, proposal.id, version, proposal.company_id, proposal.opportunity_id, `${proposal.title} — contrato v${version}`,
          proposal.total_cost, proposal.total_price, proposal.margin_percent, proposal.validity_days, proposal.validity_until,
          proposal.conditions, "Criado da versão aceita; aceite não ativa a operação.", `proposal:${proposal.id}:v${version}`, actor.role, actor.identityId || null],
      )).rows[0];
    } catch (error) {
      if (error?.code !== "23505") throw error;
      const concurrent = await db.query("SELECT * FROM crm_contracts WHERE proposal_id=$1 AND proposal_version=$2", [proposalId, version]);
      if (concurrent.rows[0]) return { status: 200, contract: concurrent.rows[0], created: false };
      throw error;
    }
    const items = await db.query("SELECT * FROM crm_proposal_items WHERE proposal_id=$1 AND proposal_version=$2 ORDER BY created_at", [proposalId, version]);
    for (const item of items.rows) {
      await db.query(
        `INSERT INTO crm_contract_items (id,contract_id,proposal_item_id,type,description,equipment_id,quantity,unit,unit_cost,total_cost,unit_price,total_price,recurrence_type,recurrence_details,supplier_name,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [randomUUID(), id, item.id, item.type, item.description, item.equipment_id, item.quantity, item.unit || "un", item.unit_cost, item.total_cost, item.unit_price, item.total_price, item.recurrence_type, item.recurrence_details, item.supplier_name, item.notes],
      );
    }
    await seedImplantation(db, contract, actor);
    await audit(db, actor, "l05_contract_create", id);
    return { status: 201, contract, created: true };
  }

  async function list(req, res, actor, url) {
    const status = url.searchParams.get("status");
    const companyId = url.searchParams.get("companyId");
    const values = [];
    const clauses = [];
    if (status) { clauses.push(`c.status=$${values.length + 1}`); values.push(status); }
    if (companyId) { if (!isUuid(companyId)) return bad(res, "invalid_company_id"); clauses.push(`c.company_id=$${values.length + 1}`); values.push(companyId); }
    if (actor.role === "comercial") { clauses.push(`c.responsible_id=$${values.length + 1}`); values.push(actor.identityId); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    try {
      const rows = await getPool().query(`SELECT c.*, co.display_name AS company_name FROM crm_contracts c LEFT JOIN crm_companies co ON co.id=c.company_id ${where} ORDER BY c.created_at DESC LIMIT 100`, values);
      return json(res, 200, { contracts: rows.rows });
    } catch { return unavailable(res); }
  }
  async function detail(req, res, actor, id) {
    try {
      const db = getPool();
      const contract = await contractForRead(db, id, actor);
      if (!contract) return json(res, 404, { error: "contract_not_found" });
      const [items, units, responsibles, portal, docs] = await Promise.all([
        db.query("SELECT * FROM crm_contract_items WHERE contract_id=$1 ORDER BY created_at", [id]),
        db.query("SELECT cu.*,u.display_name,u.city FROM crm_contract_units cu JOIN crm_company_units u ON u.id=cu.unit_id WHERE cu.contract_id=$1", [id]),
        db.query("SELECT * FROM crm_contract_responsibles WHERE contract_id=$1 ORDER BY is_primary DESC,created_at", [id]),
        db.query("SELECT * FROM crm_contract_portal_links WHERE contract_id=$1", [id]),
        db.query("SELECT d.id,d.category,d.linked_at,cd.id AS client_document_id,cd.title,cd.category AS document_category FROM crm_contract_private_documents d JOIN client_documents cd ON cd.id=d.client_document_id WHERE d.contract_id=$1 ORDER BY d.linked_at DESC", [id]),
      ]);
      return json(res, 200, { contract, items: items.rows, units: units.rows, responsibles: responsibles.rows, portal_link: portal.rows[0] || null, documents: docs.rows });
    } catch { return unavailable(res); }
  }

  async function addUnit(req, res, actor, contractId) {
    if (!manager(res, actor)) return;
    const input = await body(req, res, new Set(["unit_id", "role", "notes"])); if (!input) return;
    const unitId = input.unit_id;
    if (!isUuid(unitId) || (input.role != null && !text(input.role, 100)) || (input.notes != null && !text(input.notes, 500))) return bad(res, "invalid_contract_unit");
    const db = getPool(); const client = await db.connect();
    try {
      await client.query("BEGIN");
      const contract = await contractForRead(client, contractId, actor);
      if (!contract) { await client.query("ROLLBACK"); return json(res, 404, { error: "contract_not_found" }); }
      const unit = await client.query("SELECT id FROM crm_company_units WHERE id=$1 AND company_id=$2", [unitId, contract.company_id]);
      if (!unit.rows[0]) { await client.query("ROLLBACK"); return json(res, 409, { error: "unit_outside_contract_company" }); }
      const result = await client.query("INSERT INTO crm_contract_units (id,contract_id,unit_id,role,notes) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (contract_id,unit_id) DO UPDATE SET role=EXCLUDED.role,notes=EXCLUDED.notes RETURNING *", [randomUUID(), contractId, unitId, input.role ? text(input.role, 100) : null, input.notes ? text(input.notes, 500) : null]);
      await audit(client, actor, "l05_contract_update", contractId);
      await client.query("COMMIT"); return json(res, 201, { unit: result.rows[0] });
    } catch (error) { await client.query("ROLLBACK"); return unavailable(res, "contract_unit_write_failed"); } finally { client.release(); }
  }
  async function addItem(req, res, actor, contractId) {
    if (!manager(res, actor)) return;
    const input = await body(req, res, new Set(["type", "description", "quantity", "unit", "unit_cost", "unit_price", "recurrence_type", "recurrence_details", "notes"])); if (!input) return;
    const type = typeof input.type === "string" ? input.type : null;
    const description = text(input.description, 500, { required: true });
    const quantity = Number(input.quantity);
    const unit = text(input.unit, 50, { required: true });
    const unitCost = money(input.unit_cost); const unitPrice = money(input.unit_price);
    const recurrence = typeof input.recurrence_type === "string" ? input.recurrence_type : null;
    if (!ITEM_TYPES.has(type) || !description || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || !unit || unitCost == null || unitPrice == null || !RECURRENCES.has(recurrence) || (input.recurrence_details != null && !text(input.recurrence_details, 500)) || (input.notes != null && !text(input.notes, 500))) return bad(res, "invalid_contract_item");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const contract = await contractForRead(client, contractId, actor);
      if (!contract) { await client.query("ROLLBACK"); return json(res, 404, { error: "contract_not_found" }); }
      if (["encerrado", "cancelado"].includes(contract.status)) { await client.query("ROLLBACK"); return json(res, 409, { error: "contract_not_editable" }); }
      const result = await client.query(`INSERT INTO crm_contract_items (id,contract_id,type,description,quantity,unit,unit_cost,total_cost,unit_price,total_price,recurrence_type,recurrence_details,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [randomUUID(),contractId,type,description,quantity,unit,unitCost,unitCost*quantity,unitPrice,unitPrice*quantity,recurrence,input.recurrence_details ? text(input.recurrence_details,500) : null,input.notes ? text(input.notes,500) : null]);
      await audit(client, actor, "l05_contract_update", contractId);
      await client.query("COMMIT"); return json(res, 201, { item: result.rows[0] });
    } catch { await client.query("ROLLBACK"); return unavailable(res, "contract_item_write_failed"); } finally { client.release(); }
  }
  async function addResponsible(req, res, actor, contractId) {
    if (!manager(res, actor)) return;
    const input = await body(req, res, new Set(["responsible_id", "responsible_name", "role", "is_primary"])); if (!input) return;
    const name = text(input.responsible_name, 120, { required: true });
    const role = text(input.role, 100, { required: true });
    if (!name || !role || (input.responsible_id != null && !isUuid(input.responsible_id)) || (input.is_primary != null && typeof input.is_primary !== "boolean")) return bad(res, "invalid_contract_responsible");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      if (!await contractForRead(client, contractId, actor)) { await client.query("ROLLBACK"); return json(res, 404, { error: "contract_not_found" }); }
      if (input.responsible_id) {
        const identity = await client.query("SELECT id FROM auth_identities WHERE id=$1 AND status='active'", [input.responsible_id]);
        if (!identity.rows[0]) { await client.query("ROLLBACK"); return json(res, 404, { error: "responsible_not_found" }); }
      }
      if (input.is_primary) await client.query("UPDATE crm_contract_responsibles SET is_primary=false WHERE contract_id=$1", [contractId]);
      const result = await client.query(`INSERT INTO crm_contract_responsibles (id,contract_id,responsible_id,responsible_name,role,is_primary) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (contract_id,responsible_id,role) DO UPDATE SET responsible_name=EXCLUDED.responsible_name,is_primary=EXCLUDED.is_primary RETURNING *`, [randomUUID(),contractId,input.responsible_id || null,name,role,Boolean(input.is_primary)]);
      await audit(client, actor, "l05_contract_update", contractId); await client.query("COMMIT"); return json(res, 201, { responsible: result.rows[0] });
    } catch { await client.query("ROLLBACK"); return unavailable(res, "contract_responsible_write_failed"); } finally { client.release(); }
  }
  const COMPOSITION = {
    posts: {
      table: "crm_contract_posts", audit: "l05_contract_update",
      allowed: new Set(["title","description","shift","quantity","schedule","location","unit_id","recurrence_type"]),
      async values(db, contract, input) {
        const title = text(input.title,200,{required:true}), description=input.description == null?null:text(input.description,1000), location=input.location == null?null:text(input.location,200);
        const shifts=new Set(["diurno","noturno","12x36_dia","12x36_noite","24x48","comercial","madrugada","outro"]), recurrence=new Set(["recorrente","avulso","implantacao","outro"]);
        const quantity=Number(input.quantity); if (!title || (input.description != null && !description) || (input.location != null && !location) || !shifts.has(input.shift) || !recurrence.has(input.recurrence_type) || !Number.isInteger(quantity)||quantity<1||quantity>100 || (input.unit_id != null&&!isUuid(input.unit_id)) || !input.schedule || typeof input.schedule!=="object" || Array.isArray(input.schedule)) return null;
        if (input.unit_id) { const u=await db.query("SELECT id FROM crm_company_units WHERE id=$1 AND company_id=$2",[input.unit_id,contract.company_id]); if(!u.rows[0]) return "unit_outside_contract_company"; }
        return [randomUUID(),contract.id,title,description,input.shift,quantity,JSON.stringify(input.schedule),location,input.unit_id||null,input.recurrence_type];
      }, sql: "INSERT INTO crm_contract_posts (id,contract_id,title,description,shift,quantity,schedule,location,unit_id,recurrence_type) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING *",
    },
    sla: {
      table:"crm_contract_sla",audit:"l05_contract_update",allowed:new Set(["service_type","description","response_time_minutes","resolution_time_minutes","availability_percent","penalty_description"]),
      async values(_db,contract,input) { const services=new Set(["vigilancia","portaria","limpeza","monitoramento","manutencao","atendimento","outro"]); const description=text(input.description,1000,{required:true}); const response=input.response_time_minutes == null?null:Number(input.response_time_minutes), resolution=input.resolution_time_minutes==null?null:Number(input.resolution_time_minutes), availability=input.availability_percent==null?null:Number(input.availability_percent), penalty=input.penalty_description==null?null:text(input.penalty_description,1000); if(!services.has(input.service_type)||!description || (response!==null&&(!Number.isInteger(response)||response<1||response>10080)) ||(resolution!==null&&(!Number.isInteger(resolution)||resolution<1||resolution>10080))||(availability!==null&&(!Number.isFinite(availability)||availability<0||availability>100))||(input.penalty_description!=null&&!penalty)) return null; return [randomUUID(),contract.id,input.service_type,description,response,resolution,availability,penalty]; },
      sql:"INSERT INTO crm_contract_sla (id,contract_id,service_type,description,response_time_minutes,resolution_time_minutes,availability_percent,penalty_description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    },
    obligations: {
      table:"crm_contract_obligations",audit:"l05_contract_update",allowed:new Set(["party","title","description","due_date"]),
      async values(_db,contract,input) { const parties=new Set(["contratada","contratante","ambas"]); const title=text(input.title,200,{required:true}),description=text(input.description,2000,{required:true}),due=input.due_date==null?null:isoDate(input.due_date); if(!parties.has(input.party)||!title||!description||(input.due_date!=null&&!due))return null;return[randomUUID(),contract.id,input.party,title,description,due]; },
      sql:"INSERT INTO crm_contract_obligations (id,contract_id,party,title,description,due_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    },
    exclusions: {
      table:"crm_contract_exclusions",audit:"l05_contract_update",allowed:new Set(["description","category"]),
      async values(_db,contract,input) { const description=text(input.description,2000,{required:true}),category=input.category==null?null:text(input.category,100); if(!description||(input.category!=null&&!category))return null; return[randomUUID(),contract.id,description,category]; },
      sql:"INSERT INTO crm_contract_exclusions (id,contract_id,description,category) VALUES ($1,$2,$3,$4) RETURNING *",
    },
    schedule: {
      table:"crm_contract_schedule",audit:"l05_contract_update",allowed:new Set(["milestone","description","planned_date","responsible_name"]),
      async values(_db,contract,input) {const milestone=text(input.milestone,200,{required:true}),description=input.description==null?null:text(input.description,1000),date=isoDate(input.planned_date),responsible=input.responsible_name==null?null:text(input.responsible_name,120);if(!milestone||!date||(input.description!=null&&!description)||(input.responsible_name!=null&&!responsible))return null;return[randomUUID(),contract.id,milestone,description,date,responsible];},
      sql:"INSERT INTO crm_contract_schedule (id,contract_id,milestone,description,planned_date,responsible_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    },
  };
  async function composition(req,res,actor,contractId,kind) {
    const config=COMPOSITION[kind]; if(!config) return json(res,404,{error:"not_found"});
    if(req.method==="GET") { try { const c=await contractForRead(getPool(),contractId,actor); if(!c)return json(res,404,{error:"contract_not_found"});const rows=await getPool().query(`SELECT * FROM ${config.table} WHERE contract_id=$1 ORDER BY created_at`,[contractId]);return json(res,200,{[kind]:rows.rows});}catch{return unavailable(res);} }
    if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"},{Allow:"GET, POST"});
    if(!manager(res,actor))return; const input=await body(req,res,config.allowed);if(!input)return; const client=await getPool().connect();
    try {await client.query("BEGIN");const contract=await contractForRead(client,contractId,actor);if(!contract){await client.query("ROLLBACK");return json(res,404,{error:"contract_not_found"});}const values=await config.values(client,contract,input);if(typeof values==="string"){await client.query("ROLLBACK");return json(res,409,{error:values});}if(!values){await client.query("ROLLBACK");return bad(res,"invalid_contract_composition");}const result=await client.query(config.sql,values);await audit(client,actor,config.audit,contractId);await client.query("COMMIT");return json(res,201,{[kind.slice(0,-1)]:result.rows[0]});}catch{await client.query("ROLLBACK");return unavailable(res,"contract_composition_write_failed");}finally{client.release();}
  }

  const TRANSITIONS = {rascunho:["em_revisao","cancelado"],em_revisao:["rascunho","aguardando_assinatura","cancelado"],aguardando_assinatura:["em_revisao","ativo","cancelado"],ativo:["suspenso","encerrado","cancelado"],suspenso:["ativo","encerrado","cancelado"],encerrado:[],cancelado:[]};
  async function activationReady(db, contractId) {
    const steps=await db.query("SELECT step_id,status FROM crm_implantation_steps WHERE contract_id=$1",[contractId]);
    const required=["contrato","data_inicio","postos","dimensionamento","contratacao_alocacao","exames_treinamentos","equipamentos","instrucoes","faturamento","convite_cliente"];
    if(required.some(id=>!steps.rows.some(step=>step.step_id===id&&["concluido","nao_aplicavel"].includes(step.status)))) return {ok:false,error:"implantation_checklist_incomplete"};
    const blocks=await db.query(`SELECT b.id FROM crm_implantation_blocks b WHERE b.contract_id=$1 AND b.is_blocking AND b.resolved_at IS NULL AND NOT EXISTS (SELECT 1 FROM crm_implantation_exceptions e WHERE e.block_id=b.id AND e.status='autorizada' AND b.is_legal_requirement=false AND (e.valid_until IS NULL OR e.valid_until >= CURRENT_DATE))`,[contractId]);
    return blocks.rows[0]?{ok:false,error:"unresolved_implantation_block"}:{ok:true};
  }
  async function status(req,res,actor,contractId) {
    if(req.method==="GET") {try{const db=getPool();const contract=await contractForRead(db,contractId,actor);if(!contract)return json(res,404,{error:"contract_not_found"});const history=await db.query("SELECT * FROM crm_contract_status_history WHERE contract_id=$1 ORDER BY effective_date DESC,created_at DESC",[contractId]);return json(res,200,{contract,history:history.rows,allowed_transitions:TRANSITIONS[contract.status]||[]});}catch{return unavailable(res);}}
    if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"},{Allow:"GET, POST"}); if(!manager(res,actor))return;
    const input=await body(req,res,new Set(["next_status","effective_date","reason","signed_at","signature_evidence"]));if(!input)return;
    const next=typeof input.next_status==="string"?input.next_status:null,effective=isoDate(input.effective_date),reason=text(input.reason,1000,{required:true}),signed=input.signed_at==null?null:isoDate(input.signed_at),evidence=text(input.signature_evidence,500);
    if(!next||!effective||!reason||!Object.values(TRANSITIONS).flat().includes(next))return bad(res,"invalid_status_transition");
    const client=await getPool().connect();try{await client.query("BEGIN");const current=(await client.query("SELECT * FROM crm_contracts WHERE id=$1 FOR UPDATE",[contractId])).rows[0];if(!current){await client.query("ROLLBACK");return json(res,404,{error:"contract_not_found"});}if(!(TRANSITIONS[current.status]||[]).includes(next) && !(current.status === "aguardando_assinatura" && next === current.status && signed)){await client.query("ROLLBACK");return json(res,409,{error:"invalid_transition",current_status:current.status,allowed:TRANSITIONS[current.status]||[]});}
      // Signature can be recorded while waiting, without activating the
      // operation.  This is an event, not a status transition.
      if (current.status === "aguardando_assinatura" && next === current.status && signed && evidence) {
        const updated = await client.query("UPDATE crm_contracts SET signed_at=$1,signed_by=$2,signed_by_id=$3 WHERE id=$4 RETURNING *", [signed,actor.role,actor.identityId||null,contractId]);
        const history = await client.query("INSERT INTO crm_contract_status_history (id,contract_id,previous_status,next_status,effective_date,reason,is_signature_event,is_operational_activation,signed_at,changed_by,changed_by_id) VALUES ($1,$2,$3,$4,$5,$6,true,false,$7,$8,$9) RETURNING *",[randomUUID(),contractId,current.status,current.status,effective,reason,signed,actor.role,actor.identityId||null]);
        await audit(client,actor,"l05_contract_transition",contractId); await client.query("COMMIT"); return json(res,200,{contract:updated.rows[0],history:history.rows[0],signature_recorded:true});
      }
      if(next==="ativo"){if(!current.signed_at&&!signed){await client.query("ROLLBACK");return json(res,409,{error:"signature_required_before_activation"});}if(!current.signed_at&&!evidence){await client.query("ROLLBACK");return json(res,400,{error:"signature_evidence_required"});}const ready=await activationReady(client,contractId);if(!ready.ok){await client.query("ROLLBACK");return json(res,409,{error:ready.error});}}
      const isActivation=next==="ativo";const signedAt=signed||current.signed_at;const updated=await client.query(`UPDATE crm_contracts SET status=$1::crm_contract_status,current_status_effective_date=$2,status_changed_at=NOW(),status_changed_by=$3,status_changed_by_id=$4::uuid,signed_at=COALESCE($5,signed_at),signed_by=CASE WHEN $5 IS NOT NULL THEN $3 ELSE signed_by END,signed_by_id=CASE WHEN $5 IS NOT NULL THEN $4::uuid ELSE signed_by_id END,operational_activated_at=CASE WHEN $6 THEN NOW() ELSE operational_activated_at END,suspension_reason=CASE WHEN $1::text='suspenso' THEN $7 ELSE NULL END,closure_reason=CASE WHEN $1::text='encerrado' THEN $7 ELSE NULL END WHERE id=$8 RETURNING *`,[next,effective,actor.role,actor.identityId||null,signed,isActivation,reason,contractId]);
      const history=await client.query("INSERT INTO crm_contract_status_history (id,contract_id,previous_status,next_status,effective_date,reason,is_signature_event,is_operational_activation,signed_at,operational_activated_at,changed_by,changed_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $8 THEN NOW() ELSE NULL END,$10,$11) RETURNING *",[randomUUID(),contractId,current.status,next,effective,reason,Boolean(signed),isActivation,signedAt,actor.role,actor.identityId||null]);await audit(client,actor,"l05_contract_transition",contractId);await client.query("COMMIT");return json(res,200,{contract:updated.rows[0],history:history.rows[0]});
    }catch(error){console.error("L05 status transition failed", error);await client.query("ROLLBACK");return unavailable(res,"status_transition_failed");}finally{client.release();}
  }

  async function amendments(req,res,actor,contractId,amendmentId) {
    const db=getPool();
    if(req.method==="GET") {try{if(!await contractForRead(db,contractId,actor))return json(res,404,{error:"contract_not_found"});const rows=await db.query("SELECT * FROM crm_contract_amendments WHERE contract_id=$1 ORDER BY created_at DESC",[contractId]);return json(res,200,{amendments:rows.rows});}catch{return unavailable(res);}}
    if(!manager(res,actor))return;
    if(req.method==="POST"&&!amendmentId){const input=await body(req,res,new Set(["request_key","type","title","description","base_type","base_description","base_value","justification","vigencia_start","vigencia_end","effective_date","new_total_cost","new_total_price"]));if(!input)return;const types=new Set(["aditivo","reajuste","repactuacao","prorrogacao","supressao","outro"]),bases=new Set(["indice_igpm","indice_ipca","indice_inpc","dissidio_coletivo","convencao_coletiva","alteracao_escopo","prorrogacao_prazo","reajuste_contratual","acordo_comercial","outro"]);const title=text(input.title,200,{required:true}),description=input.description==null?null:text(input.description,2000),baseDesc=input.base_description==null?null:text(input.base_description,1000),justification=text(input.justification,2000,{required:true,min:10}),start=isoDate(input.vigencia_start),end=input.vigencia_end==null?null:isoDate(input.vigencia_end),effective=isoDate(input.effective_date),base=input.base_value==null?null:Number(input.base_value),cost=input.new_total_cost==null?null:money(input.new_total_cost),price=input.new_total_price==null?null:money(input.new_total_price);if(!isUuid(input.request_key)||!types.has(input.type)||!bases.has(input.base_type)||!title||(input.description!=null&&!description)||(input.base_description!=null&&!baseDesc)||!justification||!start||(input.vigencia_end!=null&&!end)||!effective||(end&&end<start)||(effective<start)||(base!==null&&!Number.isFinite(base))||cost===null||price===null)return bad(res,"invalid_amendment");const client=await db.connect();try{await client.query("BEGIN");const contract=await contractForRead(client,contractId,actor);if(!contract){await client.query("ROLLBACK");return json(res,404,{error:"contract_not_found"});}const existing=await client.query("SELECT * FROM crm_contract_amendments WHERE idempotency_key=$1",[`l05:${input.request_key}`]);if(existing.rows[0]){await client.query("COMMIT");return json(res,200,{amendment:existing.rows[0],created:false});}const result=await client.query(`INSERT INTO crm_contract_amendments (id,contract_id,type,title,description,base_type,base_description,base_value,justification,vigencia_start,vigencia_end,effective_date,previous_total_cost,previous_total_price,new_total_cost,new_total_price,idempotency_key,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,[randomUUID(),contractId,input.type,title,description,input.base_type,baseDesc,base,justification,start,end,effective,contract.total_cost,contract.total_price,cost,price,`l05:${input.request_key}`,actor.role,actor.identityId||null]);await client.query("INSERT INTO crm_contract_amendment_history (id,amendment_id,contract_id,previous_status,next_status,effective_date,reason,changed_by,changed_by_id) VALUES ($1,$2,$3,NULL,'rascunho',$4,$5,$6,$7)",[randomUUID(),result.rows[0].id,contractId,effective,justification,actor.role,actor.identityId||null]);await audit(client,actor,"l05_contract_amendment",contractId);await client.query("COMMIT");return json(res,201,{amendment:result.rows[0],created:true});}catch{await client.query("ROLLBACK");return unavailable(res,"amendment_create_failed");}finally{client.release();}}
    if(req.method==="PATCH"&&amendmentId&&isUuid(amendmentId)){const input=await body(req,res,new Set(["status","reason"]));if(!input)return;const next=input.status,reason=text(input.reason,1000,{required:true});if(!["em_revisao","aprovado","rejeitado","cancelado"].includes(next)||!reason)return bad(res,"invalid_amendment_status");const client=await db.connect();try{await client.query("BEGIN");if(!await contractForRead(client,contractId,actor)){await client.query("ROLLBACK");return json(res,404,{error:"contract_not_found"});}const current=(await client.query("SELECT * FROM crm_contract_amendments WHERE id=$1 AND contract_id=$2 FOR UPDATE",[amendmentId,contractId])).rows[0];if(!current){await client.query("ROLLBACK");return json(res,404,{error:"amendment_not_found"});}if(current.status!=="rascunho"&&current.status!=="em_revisao"){await client.query("ROLLBACK");return json(res,409,{error:"amendment_finalized"});}const updated=await client.query("UPDATE crm_contract_amendments SET status=$1::crm_amendment_status,approved_by=CASE WHEN $1::text='aprovado' THEN $2 ELSE approved_by END,approved_by_id=CASE WHEN $1::text='aprovado' THEN $3::uuid ELSE approved_by_id END,approved_at=CASE WHEN $1::text='aprovado' THEN NOW() ELSE approved_at END,rejection_reason=CASE WHEN $1::text='rejeitado' THEN $4 ELSE NULL END WHERE id=$5 RETURNING *",[next,actor.role,actor.identityId||null,reason,amendmentId]);await client.query("INSERT INTO crm_contract_amendment_history (id,amendment_id,contract_id,previous_status,next_status,effective_date,reason,changed_by,changed_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[randomUUID(),amendmentId,contractId,current.status,next,current.effective_date,reason,actor.role,actor.identityId||null]);await audit(client,actor,"l05_contract_amendment",contractId);await client.query("COMMIT");return json(res,200,{amendment:updated.rows[0],notice:"Approval records a future-effective immutable amendment; it does not overwrite historic contract values or create billing."});}catch{await client.query("ROLLBACK");return unavailable(res,"amendment_update_failed");}finally{client.release();}}
    return json(res,405,{error:"method_not_allowed"},{Allow:"GET, POST, PATCH"});
  }

  async function alerts(req,res,actor,contractId,ruleId,action) {
    const db=getPool();
    if(req.method==="GET") {try{if(!await contractForRead(db,contractId,actor))return json(res,404,{error:"contract_not_found"});const [rules,items,runs]=await Promise.all([db.query("SELECT * FROM crm_contract_alert_rules WHERE contract_id=$1 ORDER BY created_at DESC",[contractId]),db.query("SELECT * FROM crm_contract_alerts WHERE contract_id=$1 ORDER BY due_date DESC",[contractId]),db.query("SELECT * FROM crm_contract_alert_runs WHERE contract_id=$1 ORDER BY due_date DESC",[contractId])]);return json(res,200,{rules:rules.rows,alerts:items.rows,runs:runs.rows});}catch{return unavailable(res);}}
    if(!manager(res,actor))return;
    if(!ruleId&&req.method==="POST"){const input=await body(req,res,new Set(["alert_type","title","description","days_before","channel","responsible_id","responsible_name","opportunity_id"]));if(!input)return;const types=new Set(["vencimento","renovacao","reajuste","vigencia_fim","faturamento","outro"]),channels=new Set(["email","whatsapp","sistema","outro"]),title=text(input.title,200,{required:true}),description=input.description==null?null:text(input.description,1000),name=input.responsible_name==null?null:text(input.responsible_name,120),days=Number(input.days_before);if(!types.has(input.alert_type)||!channels.has(input.channel)||!title||(input.description!=null&&!description)||!Number.isInteger(days)||days<1||days>365||(input.responsible_id!=null&&!isUuid(input.responsible_id))||(input.opportunity_id!=null&&!isUuid(input.opportunity_id))||(input.responsible_name!=null&&!name))return bad(res,"invalid_alert_rule");const client=await db.connect();try{await client.query("BEGIN");const contract=await contractForRead(client,contractId,actor);if(!contract){await client.query("ROLLBACK");return json(res,404,{error:"contract_not_found"});}if(input.opportunity_id){const opp=await client.query("SELECT id FROM crm_opportunities WHERE id=$1 AND company_id=$2",[input.opportunity_id,contract.company_id]);if(!opp.rows[0]){await client.query("ROLLBACK");return json(res,409,{error:"opportunity_outside_contract_company"});}}const item=await client.query("INSERT INTO crm_contract_alert_rules (id,contract_id,company_id,alert_type,title,description,days_before,channel,responsible_id,responsible_name,opportunity_id,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",[randomUUID(),contractId,contract.company_id,input.alert_type,title,description,days,input.channel,input.responsible_id||null,name,input.opportunity_id||null,actor.role,actor.identityId||null]);await audit(client,actor,"l05_contract_update",contractId);await client.query("COMMIT");return json(res,201,{rule:item.rows[0]});}catch{await client.query("ROLLBACK");return unavailable(res,"alert_rule_create_failed");}finally{client.release();}}
    if(ruleId&&action==="run"&&req.method==="POST"){const input=await body(req,res,new Set(["due_date"]));if(!input)return;const due=isoDate(input.due_date);if(!due)return bad(res,"invalid_due_date");const client=await db.connect();try{await client.query("BEGIN");const contract=await contractForRead(client,contractId,actor);const rule=(await client.query("SELECT * FROM crm_contract_alert_rules WHERE id=$1 AND contract_id=$2 AND is_enabled FOR UPDATE",[ruleId,contractId])).rows[0];if(!contract||!rule){await client.query("ROLLBACK");return json(res,404,{error:"alert_rule_not_found"});}const run=await client.query("INSERT INTO crm_contract_alert_runs (id,alert_rule_id,contract_id,due_date,created_by_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (alert_rule_id,due_date) DO NOTHING RETURNING *",[randomUUID(),ruleId,contractId,due,actor.identityId||null]);if(!run.rows[0]){const old=await client.query("SELECT * FROM crm_contract_alert_runs WHERE alert_rule_id=$1 AND due_date=$2",[ruleId,due]);await client.query("COMMIT");return json(res,200,{run:old.rows[0],created:false});}const taskId=randomUUID(),alertId=randomUUID(),notificationId=randomUUID();let opportunityId=rule.opportunity_id;if(!opportunityId){opportunityId=randomUUID();await client.query("INSERT INTO crm_opportunities (id,company_id,title,responsible_id,responsible_name,origin,created_by_id) VALUES ($1,$2,$3,$4,$5,'contract_alert',$6)",[opportunityId,contract.company_id,`${rule.title} — negociação contratual`,rule.responsible_id,rule.responsible_name,actor.identityId||null]);}await client.query("INSERT INTO crm_tasks (id,contract_id,opportunity_id,company_id,title,description,responsible_id,due_date,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[taskId,contractId,opportunityId,contract.company_id,rule.title,rule.description,rule.responsible_id,`${due}T09:00:00Z`,actor.identityId||null]);await client.query("INSERT INTO crm_contract_alerts (id,rule_id,contract_id,company_id,alert_type,title,scheduled_date,due_date,task_id,opportunity_id,responsible_id,responsible_name,notes,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7,$8,$9,$10,$11,$12,$13,$14)",[alertId,ruleId,contractId,contract.company_id,rule.alert_type,rule.title,due,taskId,opportunityId,rule.responsible_id,rule.responsible_name,"Queued locally; no external delivery is claimed.",actor.role,actor.identityId||null]);await client.query("INSERT INTO notification_queue (id,dedup_key,recipient_kind,recipient_id,channel,template,payload,status,created_by,created_by_id) VALUES ($1,$2,'staff',$3,'internal','contract_alert',$4,'queued',$5,$6)",[notificationId,`l05-alert:${ruleId}:${due}`,rule.responsible_id||null,JSON.stringify({contractId,ruleId,dueDate:due,taskId}),actor.role,actor.identityId||null]);await client.query("UPDATE crm_contract_alert_runs SET task_id=$1,opportunity_id=$2,notification_id=$3 WHERE id=$4",[taskId,opportunityId,notificationId,run.rows[0].id]);await audit(client,actor,"l05_contract_alert_run",contractId);await client.query("COMMIT");return json(res,201,{run:{...run.rows[0],task_id:taskId,notification_id:notificationId},created:true,delivery:"queued_local_only"});}catch{await client.query("ROLLBACK");return unavailable(res,"alert_run_failed");}finally{client.release();}}
    return json(res,405,{error:"method_not_allowed"},{Allow:"GET, POST"});
  }

  async function documentObligations(req,res,actor,contractId,obligationId) {
    const db=getPool();
    if(req.method==="GET"){try{if(!await contractForRead(db,contractId,actor))return json(res,404,{error:"contract_not_found"});const rows=await db.query("SELECT o.*,p.client_document_id,p.linked_at FROM crm_document_obligations o LEFT JOIN crm_document_obligation_private_documents p ON p.obligation_id=o.id WHERE o.contract_id=$1 ORDER BY o.due_date NULLS LAST,o.created_at",[contractId]);return json(res,200,{obligations:rows.rows});}catch{return unavailable(res);}}
    if(!manager(res,actor))return;
    if(!obligationId&&req.method==="POST"){const input=await body(req,res,new Set(["title","category","description","periodicity","responsible_id","responsible_name","due_date","next_due_date","is_blocking"]));if(!input)return;const categories=new Set(["certidao","alvara","licenca","comprovante","contrato","atestado","seguro","treinamento","outro"]),periods=new Set(["unica","mensal","trimestral","semestral","anual","sob_demanda","outro"]),title=text(input.title,200,{required:true}),description=input.description==null?null:text(input.description,1000),name=input.responsible_name==null?null:text(input.responsible_name,120),due=input.due_date==null?null:isoDate(input.due_date),next=input.next_due_date==null?null:isoDate(input.next_due_date);if(!title||!categories.has(input.category)||!periods.has(input.periodicity)||(input.description!=null&&!description)||(input.responsible_name!=null&&!name)||(input.responsible_id!=null&&!isUuid(input.responsible_id))||(input.due_date!=null&&!due)||(input.next_due_date!=null&&!next)||(due&&next&&next<due))return bad(res,"invalid_document_obligation");const client=await db.connect();try{await client.query("BEGIN");const c=await contractForRead(client,contractId,actor);if(!c){await client.query("ROLLBACK");return json(res,404,{error:"contract_not_found"});}const row=await client.query("INSERT INTO crm_document_obligations (id,contract_id,company_id,title,category,description,periodicity,responsible_id,responsible_name,due_date,next_due_date,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",[randomUUID(),contractId,c.company_id,title,input.category,description,input.periodicity,input.responsible_id||null,name,due,next,actor.role,actor.identityId||null]);await audit(client,actor,"l05_contract_update",contractId);await client.query("COMMIT");return json(res,201,{obligation:row.rows[0]});}catch{await client.query("ROLLBACK");return unavailable(res,"obligation_create_failed");}finally{client.release();}}
    if(obligationId&&isUuid(obligationId)&&req.method==="PATCH"){const input=await body(req,res,new Set(["status","reason","client_document_id"]));if(!input)return;const statuses=new Set(["em_analise","aprovado","rejeitado","cancelado"]),reason=text(input.reason,1000,{required:true});if(!statuses.has(input.status)||!reason||(input.client_document_id!=null&&!isUuid(input.client_document_id)))return bad(res,"invalid_document_obligation_status");const client=await db.connect();try{await client.query("BEGIN");if(!await contractForRead(client,contractId,actor)){await client.query("ROLLBACK");return json(res,404,{error:"contract_not_found"});}const item=(await client.query("SELECT * FROM crm_document_obligations WHERE id=$1 AND contract_id=$2 FOR UPDATE",[obligationId,contractId])).rows[0];if(!item){await client.query("ROLLBACK");return json(res,404,{error:"obligation_not_found"});}if(["aprovado","em_analise"].includes(input.status)&&!input.client_document_id){await client.query("ROLLBACK");return json(res,400,{error:"private_document_proof_required"});}if(input.client_document_id){const portal=(await client.query("SELECT client_contract_id FROM crm_contract_portal_links WHERE contract_id=$1",[contractId])).rows[0];const doc=portal&&await client.query("SELECT id FROM client_documents WHERE id=$1 AND contract_id=$2",[input.client_document_id,portal.client_contract_id]);if(!portal||!doc.rows[0]){await client.query("ROLLBACK");return json(res,403,{error:"private_document_outside_contract_scope"});}await client.query("INSERT INTO crm_document_obligation_private_documents (obligation_id,contract_id,client_document_id,linked_by_id) VALUES ($1,$2,$3,$4) ON CONFLICT (obligation_id) DO UPDATE SET client_document_id=EXCLUDED.client_document_id,linked_by_id=EXCLUDED.linked_by_id,linked_at=NOW()",[obligationId,contractId,input.client_document_id,actor.identityId||null]);}const row=await client.query("UPDATE crm_document_obligations SET status=$1::crm_doc_obligation_status,last_submitted_at=CASE WHEN $1::text IN ('em_analise','aprovado') THEN NOW() ELSE last_submitted_at END,approved_by=CASE WHEN $1::text='aprovado' THEN $2 ELSE NULL END,approved_by_id=CASE WHEN $1::text='aprovado' THEN $3::uuid ELSE NULL END,approved_at=CASE WHEN $1::text='aprovado' THEN NOW() ELSE NULL END,rejection_reason=CASE WHEN $1::text='rejeitado' THEN $4 ELSE NULL END WHERE id=$5 RETURNING *",[input.status,actor.role,actor.identityId||null,reason,obligationId]);await client.query("INSERT INTO crm_document_obligation_history (id,obligation_id,contract_id,company_id,previous_status,next_status,reason,changed_by,changed_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",[randomUUID(),obligationId,contractId,item.company_id,item.status,input.status,reason,actor.role,actor.identityId||null]);await audit(client,actor,"l05_contract_document_link",contractId);await client.query("COMMIT");return json(res,200,{obligation:row.rows[0]});}catch(error){console.error("L05 obligation update failed", error);await client.query("ROLLBACK");return unavailable(res,"obligation_update_failed");}finally{client.release();}}
    return json(res,405,{error:"method_not_allowed"},{Allow:"GET, POST, PATCH"});
  }

  async function implantation(req,res,actor,contractId,segment,resourceId) {
    const db=getPool();
    if(req.method==="GET"){try{if(!await contractForRead(db,contractId,actor))return json(res,404,{error:"contract_not_found"});const imp=(await db.query("SELECT * FROM crm_contract_implantations WHERE contract_id=$1",[contractId])).rows[0];if(!imp)return json(res,404,{error:"implantation_not_found"});const [steps,blocks,exceptions]=await Promise.all([db.query("SELECT * FROM crm_implantation_steps WHERE implantation_id=$1 ORDER BY created_at",[imp.id]),db.query("SELECT * FROM crm_implantation_blocks WHERE implantation_id=$1 ORDER BY created_at DESC",[imp.id]),db.query("SELECT * FROM crm_implantation_exceptions WHERE implantation_id=$1 ORDER BY created_at DESC",[imp.id])]);return json(res,200,{implantation:imp,steps:steps.rows,blocks:blocks.rows,exceptions:exceptions.rows,dependency_notice:"Steps that depend on later HR, operations or billing modules require an operator evidence basis; L05 does not fabricate those integrations."});}catch{return unavailable(res);}}
    if(!manager(res,actor))return;
    if(segment==="steps"&&resourceId&&isUuid(resourceId)&&req.method==="PATCH"){const input=await body(req,res,new Set(["status","evidence_basis","notes"]));if(!input)return;const statuses=new Set(["pendente","em_andamento","concluido","nao_aplicavel","bloqueado"]),basis=input.evidence_basis==null?null:text(input.evidence_basis,1000),notes=input.notes==null?null:text(input.notes,1000);if(!statuses.has(input.status)||(input.evidence_basis!=null&&!basis)||(input.notes!=null&&!notes)||(["concluido","nao_aplicavel"].includes(input.status)&&!basis))return bad(res,"invalid_implantation_step");const client=await db.connect();try{await client.query("BEGIN");const c=await contractForRead(client,contractId,actor);const imp=(await client.query("SELECT * FROM crm_contract_implantations WHERE contract_id=$1",[contractId])).rows[0];const step=imp&&(await client.query("SELECT * FROM crm_implantation_steps WHERE id=$1 AND implantation_id=$2 FOR UPDATE",[resourceId,imp.id])).rows[0];if(!c||!imp||!step){await client.query("ROLLBACK");return json(res,404,{error:"implantation_step_not_found"});}if(step.step_id==="contrato"&&input.status==="concluido"&&!c.signed_at){await client.query("ROLLBACK");return json(res,409,{error:"signature_required_for_contract_step"});}if(step.step_id==="data_inicio"&&input.status==="concluido"&&!c.starts_on){await client.query("ROLLBACK");return json(res,409,{error:"contract_start_date_required"});}if(["postos","dimensionamento"].includes(step.step_id)&&input.status==="concluido"){const posts=await client.query("SELECT 1 FROM crm_contract_posts WHERE contract_id=$1 LIMIT 1",[contractId]);if(!posts.rows[0]){await client.query("ROLLBACK");return json(res,409,{error:"contract_posts_required"});}}const row=await client.query("UPDATE crm_implantation_steps SET status=$1::crm_implantation_step_status,notes=$2,completed_at=CASE WHEN $1::text IN ('concluido','nao_aplicavel') THEN CURRENT_DATE ELSE NULL END,responsible_id=$3::uuid,responsible_name=$4 WHERE id=$5 RETURNING *",[input.status,[basis,notes].filter(Boolean).join("\n"),actor.identityId||null,actor.role,resourceId]);await audit(client,actor,"l05_implantation_update",contractId);await client.query("COMMIT");return json(res,200,{step:row.rows[0]});}catch{await client.query("ROLLBACK");return unavailable(res,"implantation_step_update_failed");}finally{client.release();}}
    if(segment==="blocks"&&!resourceId&&req.method==="POST"){const input=await body(req,res,new Set(["step_id","block_type","title","description","is_legal_requirement","is_blocking"]));if(!input)return;const steps=new Set(["contrato","data_inicio","postos","dimensionamento","contratacao_alocacao","exames_treinamentos","equipamentos","instrucoes","faturamento","convite_cliente"]),types=new Set(["documentacao","treinamento","equipamento","legal","operacional","financeiro","outro"]),title=text(input.title,200,{required:true}),description=text(input.description,2000,{required:true});if((input.step_id!=null&&!steps.has(input.step_id))||!types.has(input.block_type)||!title||!description||typeof input.is_legal_requirement!=="boolean"||typeof input.is_blocking!=="boolean")return bad(res,"invalid_implantation_block");const client=await db.connect();try{await client.query("BEGIN");const imp=(await client.query("SELECT * FROM crm_contract_implantations WHERE contract_id=$1",[contractId])).rows[0];if(!imp||!await contractForRead(client,contractId,actor)){await client.query("ROLLBACK");return json(res,404,{error:"implantation_not_found"});}const row=await client.query("INSERT INTO crm_implantation_blocks (id,contract_id,implantation_id,step_id,block_type,title,description,is_legal_requirement,is_blocking,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",[randomUUID(),contractId,imp.id,input.step_id||null,input.block_type,title,description,input.is_legal_requirement,input.is_blocking,actor.role,actor.identityId||null]);await audit(client,actor,"l05_implantation_update",contractId);await client.query("COMMIT");return json(res,201,{block:row.rows[0]});}catch{await client.query("ROLLBACK");return unavailable(res,"implantation_block_create_failed");}finally{client.release();}}
    if(segment==="exceptions"&&!resourceId&&req.method==="POST"){const input=await body(req,res,new Set(["block_id","step_id","title","motivation","applicable_rule","valid_until"]));if(!input)return;const title=text(input.title,200,{required:true}),motivation=text(input.motivation,2000,{required:true,min:20}),rule=input.applicable_rule==null?null:text(input.applicable_rule,500),until=isoDate(input.valid_until);if((input.block_id!=null&&!isUuid(input.block_id))||!title||!motivation||!until||(input.applicable_rule!=null&&!rule))return bad(res,"invalid_implantation_exception");const client=await db.connect();try{await client.query("BEGIN");const imp=(await client.query("SELECT * FROM crm_contract_implantations WHERE contract_id=$1",[contractId])).rows[0];const block=input.block_id&&imp&&(await client.query("SELECT * FROM crm_implantation_blocks WHERE id=$1 AND implantation_id=$2",[input.block_id,imp.id])).rows[0];if(!imp||!await contractForRead(client,contractId,actor)||(input.block_id&&!block)){await client.query("ROLLBACK");return json(res,404,{error:"implantation_block_not_found"});}if(block?.is_legal_requirement){await client.query("ROLLBACK");return json(res,409,{error:"legal_requirement_not_waivable"});}const row=await client.query("INSERT INTO crm_implantation_exceptions (id,contract_id,implantation_id,block_id,step_id,title,motivation,applicable_rule,valid_until,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",[randomUUID(),contractId,imp.id,input.block_id||null,input.step_id||null,title,motivation,rule,until,actor.role,actor.identityId||null]);await audit(client,actor,"l05_implantation_exception",contractId);await client.query("COMMIT");return json(res,201,{exception:row.rows[0]});}catch{await client.query("ROLLBACK");return unavailable(res,"implantation_exception_create_failed");}finally{client.release();}}
    if(segment==="exceptions"&&resourceId&&isUuid(resourceId)&&req.method==="PATCH"){const input=await body(req,res,new Set(["status","authorization_notes","rejection_reason"]));if(!input)return;const notes=input.authorization_notes==null?null:text(input.authorization_notes,1000),reject=input.rejection_reason==null?null:text(input.rejection_reason,1000);if(!["autorizada","rejeitada"].includes(input.status)||(input.status==="autorizada"&&!notes)||(input.status==="rejeitada"&&!reject))return bad(res,"invalid_implantation_exception_status");const client=await db.connect();try{await client.query("BEGIN");const row=await client.query("UPDATE crm_implantation_exceptions SET status=$1,authorized_by=CASE WHEN $1='autorizada' THEN $2 ELSE authorized_by END,authorized_by_id=CASE WHEN $1='autorizada' THEN $3 ELSE authorized_by_id END,authorized_at=CASE WHEN $1='autorizada' THEN NOW() ELSE authorized_at END,authorization_notes=$4,rejection_reason=$5 WHERE id=$6 AND contract_id=$7 AND status IN ('solicitada','em_analise') RETURNING *",[input.status,actor.role,actor.identityId||null,notes,reject,resourceId,contractId]);if(!row.rows[0]){await client.query("ROLLBACK");return json(res,409,{error:"exception_not_authorizable"});}await audit(client,actor,"l05_implantation_exception",contractId);await client.query("COMMIT");return json(res,200,{exception:row.rows[0]});}catch{await client.query("ROLLBACK");return unavailable(res,"implantation_exception_update_failed");}finally{client.release();}}
    return json(res,405,{error:"method_not_allowed"},{Allow:"GET, POST, PATCH"});
  }

  const CLOSURE_STEPS=[["desmobilizacao_equipe","Desmobilização de equipe"],["devolucao_equipamentos","Devolução de equipamentos"],["devolucao_chaves","Devolução de chaves e acessos"],["cobrancas_pendencias","Cobranças e pendências"],["documentos_finais","Documentos finais e dossiê"],["revogacao_escopos","Revogação de escopos"],["comunicacao_cliente","Comunicação ao cliente"]];
  async function ensureClosureSteps(db,closureId,contractId){for(const [type,title]of CLOSURE_STEPS)await db.query("INSERT INTO crm_closure_steps (id,closure_id,contract_id,step_type,title,status) VALUES ($1,$2,$3,$4,$5,'pendente') ON CONFLICT DO NOTHING",[randomUUID(),closureId,contractId,type,title]);}
  async function revokePortalScope(db,contractId,closureId,actor,effectiveDate){const link=(await db.query("SELECT cc.id,cc.client_account_id FROM crm_contract_portal_links l JOIN client_contracts cc ON cc.id=l.client_contract_id WHERE l.contract_id=$1",[contractId])).rows[0];if(!link)return {revoked:false};await db.query("UPDATE client_contracts SET status='ended',ends_on=COALESCE(ends_on,$1) WHERE id=$2",[effectiveDate,link.id]);const grants=await db.query("SELECT id,contract_scope_mode FROM client_access_grants WHERE client_account_id=$1 AND revoked_at IS NULL FOR UPDATE",[link.client_account_id]);for(const grant of grants.rows){if(grant.contract_scope_mode==='all'){const allowed=await db.query("SELECT COALESCE(array_agg(id),ARRAY[]::uuid[]) ids FROM client_contracts WHERE client_account_id=$1 AND id<>$2 AND status IN ('planned','active','suspended')",[link.client_account_id,link.id]);await db.query("UPDATE client_access_grants SET contract_scope_mode='selected',allowed_contract_ids=$1 WHERE id=$2",[allowed.rows[0].ids,grant.id]);}else await db.query("UPDATE client_access_grants SET allowed_contract_ids=array_remove(allowed_contract_ids,$1::uuid) WHERE id=$2",[link.id,grant.id]);}await db.query("INSERT INTO crm_contract_scope_revocations (id,contract_id,closure_id,scope_type,scope_description,revoked_at,revoked_by,revoked_by_id,reason) VALUES ($1,$2,$3,'client_portal_contract',$4,$5,$6,$7,'Closure completed; only the linked portal contract was removed from active grants.')",[randomUUID(),contractId,closureId,link.id,effectiveDate,actor.role,actor.identityId||null]);return {revoked:true,clientContractId:link.id};}
  async function closure(req,res,actor,contractId,segment,resourceId){const db=getPool();if(req.method==='GET'){try{if(!await contractForRead(db,contractId,actor))return json(res,404,{error:'contract_not_found'});const item=(await db.query("SELECT * FROM crm_contract_closures WHERE contract_id=$1",[contractId])).rows[0]||null;const [steps,revocations]=item?await Promise.all([db.query("SELECT * FROM crm_closure_steps WHERE closure_id=$1 ORDER BY created_at",[item.id]),db.query("SELECT * FROM crm_contract_scope_revocations WHERE closure_id=$1",[item.id])]):[{rows:[]},{rows:[]}];return json(res,200,{closure:item,steps:steps.rows,revocations:revocations.rows});}catch{return unavailable(res);}}if(!manager(res,actor))return;
    if(!segment&&req.method==='POST'){const input=await body(req,res,new Set(['closure_type','closure_date','effective_date','reason','notes']));if(!input)return;const types=new Set(['encerramento','rescisao','distrato','termino_vigencia','outro']),date=isoDate(input.closure_date),effective=isoDate(input.effective_date),reason=text(input.reason,2000,{required:true,min:10}),notes=input.notes==null?null:text(input.notes,2000);if(!types.has(input.closure_type)||!date||!effective||effective<date||!reason||(input.notes!=null&&!notes))return bad(res,'invalid_closure');const client=await db.connect();try{await client.query('BEGIN');if(!await contractForRead(client,contractId,actor)){await client.query('ROLLBACK');return json(res,404,{error:'contract_not_found'});}const current=await client.query("SELECT * FROM crm_contract_closures WHERE contract_id=$1",[contractId]);if(current.rows[0]){await client.query('COMMIT');return json(res,200,{closure:current.rows[0],created:false});}const row=await client.query("INSERT INTO crm_contract_closures (id,contract_id,closure_type,closure_date,effective_date,reason,notes,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[randomUUID(),contractId,input.closure_type,date,effective,reason,notes,actor.role,actor.identityId||null]);await ensureClosureSteps(client,row.rows[0].id,contractId);await client.query("INSERT INTO crm_closure_history (id,closure_id,contract_id,next_status,effective_date,reason,changed_by,changed_by_id) VALUES ($1,$2,$3,'planejado',$4,$5,$6,$7)",[randomUUID(),row.rows[0].id,contractId,effective,reason,actor.role,actor.identityId||null]);await audit(client,actor,'l05_contract_closure',contractId);await client.query('COMMIT');return json(res,201,{closure:row.rows[0],created:true});}catch{await client.query('ROLLBACK');return unavailable(res,'closure_create_failed');}finally{client.release();}}
    if(segment==='steps'&&resourceId&&isUuid(resourceId)&&req.method==='PATCH'){const input=await body(req,res,new Set(['status','notes']));if(!input)return;const statuses=new Set(['pendente','em_andamento','concluido','nao_aplicavel']),notes=input.notes==null?null:text(input.notes,1000);if(!statuses.has(input.status)||(input.notes!=null&&!notes))return bad(res,'invalid_closure_step');const client=await db.connect();try{await client.query('BEGIN');const c=(await client.query("SELECT id FROM crm_contract_closures WHERE contract_id=$1",[contractId])).rows[0];const row=c&&(await client.query("UPDATE crm_closure_steps SET status=$1::crm_closure_step_status,notes=$2,completed_at=CASE WHEN $1::text IN ('concluido','nao_aplicavel') THEN CURRENT_DATE ELSE NULL END,responsible_id=$3::uuid,responsible_name=$4 WHERE id=$5 AND closure_id=$6 RETURNING *",[input.status,notes,actor.identityId||null,actor.role,resourceId,c.id])).rows[0];if(!row){await client.query('ROLLBACK');return json(res,404,{error:'closure_step_not_found'});}await audit(client,actor,'l05_contract_closure',contractId);await client.query('COMMIT');return json(res,200,{step:row});}catch{await client.query('ROLLBACK');return unavailable(res,'closure_step_update_failed');}finally{client.release();}}
    if(!segment&&req.method==='PATCH'){const input=await body(req,res,new Set(['status','reason']));if(!input)return;if(input.status!=='concluido'||!text(input.reason,1000,{required:true}))return bad(res,'only_closure_completion_supported');const client=await db.connect();try{await client.query('BEGIN');const c=(await client.query("SELECT * FROM crm_contract_closures WHERE contract_id=$1 FOR UPDATE",[contractId])).rows[0];if(!c){await client.query('ROLLBACK');return json(res,404,{error:'closure_not_found'});}const incomplete=await client.query("SELECT id FROM crm_closure_steps WHERE closure_id=$1 AND status NOT IN ('concluido','nao_aplicavel')",[c.id]);if(incomplete.rows[0]){await client.query('ROLLBACK');return json(res,409,{error:'closure_steps_incomplete',incomplete_count:incomplete.rows.length});}const row=await client.query("UPDATE crm_contract_closures SET status='concluido' WHERE id=$1 AND status IN ('planejado','em_andamento') RETURNING *",[c.id]);if(!row.rows[0]){await client.query('ROLLBACK');return json(res,409,{error:'closure_finalized'});}await client.query("UPDATE crm_contracts SET status='encerrado',closure_reason=$1,current_status_effective_date=$2,status_changed_at=NOW(),status_changed_by=$3,status_changed_by_id=$4 WHERE id=$5",[input.reason,c.effective_date,actor.role,actor.identityId||null,contractId]);const revocation=await revokePortalScope(client,contractId,c.id,actor,c.effective_date);await client.query("INSERT INTO crm_closure_history (id,closure_id,contract_id,previous_status,next_status,effective_date,reason,changed_by,changed_by_id) VALUES ($1,$2,$3,$4,'concluido',$5,$6,$7,$8)",[randomUUID(),c.id,contractId,c.status,c.effective_date,input.reason,actor.role,actor.identityId||null]);await audit(client,actor,'l05_contract_closure',contractId);await client.query('COMMIT');return json(res,200,{closure:row.rows[0],revocation});}catch{await client.query('ROLLBACK');return unavailable(res,'closure_complete_failed');}finally{client.release();}}
    return json(res,405,{error:'method_not_allowed'},{Allow:'GET, POST, PATCH'});
  }

  async function fiscal(req,res,actor,contractId,segment,resourceId){const db=getPool();if(!manager(res,actor))return;if(req.method==='GET'){try{if(!await contractForRead(db,contractId,actor))return json(res,404,{error:'contract_not_found'});const [dossiers,measurements,evidences]=await Promise.all([db.query("SELECT * FROM crm_contract_fiscal_dossiers WHERE contract_id=$1 ORDER BY created_at DESC",[contractId]),db.query("SELECT * FROM crm_contract_service_measurements WHERE contract_id=$1 ORDER BY measurement_date DESC",[contractId]),db.query("SELECT e.*,p.client_document_id FROM crm_contract_quality_evidences e LEFT JOIN crm_quality_evidence_private_documents p ON p.evidence_id=e.id WHERE e.contract_id=$1 ORDER BY e.created_at DESC",[contractId])]);return json(res,200,{dossiers:dossiers.rows,measurements:measurements.rows,evidences:evidences.rows});}catch{return unavailable(res);}}
    if(segment==='dossiers'&&!resourceId&&req.method==='POST'){const input=await body(req,res,new Set(['title','description','period_start','period_end']));if(!input)return;const title=text(input.title,200,{required:true}),description=input.description==null?null:text(input.description,2000),start=input.period_start==null?null:isoDate(input.period_start),end=input.period_end==null?null:isoDate(input.period_end);if(!title||(input.description!=null&&!description)||(input.period_start!=null&&!start)||(input.period_end!=null&&!end)||(start&&end&&end<start))return bad(res,'invalid_fiscal_dossier');const client=await db.connect();try{await client.query('BEGIN');const c=await contractForRead(client,contractId,actor);if(!c){await client.query('ROLLBACK');return json(res,404,{error:'contract_not_found'});}const row=await client.query("INSERT INTO crm_contract_fiscal_dossiers (id,contract_id,company_id,title,description,period_start,period_end,responsible_id,responsible_name,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",[randomUUID(),contractId,c.company_id,title,description,start,end,actor.identityId||null,actor.role,actor.role,actor.identityId||null]);await audit(client,actor,'l05_fiscal_dossier',contractId);await client.query('COMMIT');return json(res,201,{dossier:row.rows[0]});}catch{await client.query('ROLLBACK');return unavailable(res,'fiscal_dossier_create_failed');}finally{client.release();}}
    if(segment==='measurements'&&!resourceId&&req.method==='POST'){const input=await body(req,res,new Set(['dossier_id','service_type','measurement_date','quantity','quality_score','notes']));if(!input)return;const service=text(input.service_type,100,{required:true}),date=isoDate(input.measurement_date),quantity=input.quantity==null?null:Number(input.quantity),score=input.quality_score==null?null:Number(input.quality_score),notes=input.notes==null?null:text(input.notes,1000);if(!isUuid(input.dossier_id)||!service||!date||(quantity!==null&&(!Number.isFinite(quantity)||quantity<0))||(score!==null&&(!Number.isFinite(score)||score<0||score>100))||(input.notes!=null&&!notes))return bad(res,'invalid_service_measurement');const client=await db.connect();try{await client.query('BEGIN');const dossier=(await client.query("SELECT id FROM crm_contract_fiscal_dossiers WHERE id=$1 AND contract_id=$2",[input.dossier_id,contractId])).rows[0];if(!dossier){await client.query('ROLLBACK');return json(res,404,{error:'dossier_not_found'});}const row=await client.query("INSERT INTO crm_contract_service_measurements (id,dossier_id,contract_id,service_type,measurement_date,quantity,quality_score,responsible_id,responsible_name,notes,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",[randomUUID(),input.dossier_id,contractId,service,date,quantity,score,actor.identityId||null,actor.role,notes,actor.role,actor.identityId||null]);await audit(client,actor,'l05_fiscal_dossier',contractId);await client.query('COMMIT');return json(res,201,{measurement:row.rows[0]});}catch{await client.query('ROLLBACK');return unavailable(res,'measurement_create_failed');}finally{client.release();}}
    if(segment==='evidences'&&!resourceId&&req.method==='POST'){const input=await body(req,res,new Set(['dossier_id','measurement_id','evidence_type','title','description','captured_at','client_document_id']));if(!input)return;const types=new Set(['foto','relatorio','indicador','checklist','outro']),title=text(input.title,200,{required:true}),description=input.description==null?null:text(input.description,1000),date=input.captured_at==null?null:isoDate(input.captured_at);if((input.dossier_id!=null&&!isUuid(input.dossier_id))||(input.measurement_id!=null&&!isUuid(input.measurement_id))||!types.has(input.evidence_type)||!title||(input.description!=null&&!description)||(input.captured_at!=null&&!date)||!isUuid(input.client_document_id))return bad(res,'invalid_quality_evidence');const client=await db.connect();try{await client.query('BEGIN');const portal=(await client.query("SELECT client_contract_id FROM crm_contract_portal_links WHERE contract_id=$1",[contractId])).rows[0];const doc=portal&&await client.query("SELECT id FROM client_documents WHERE id=$1 AND contract_id=$2",[input.client_document_id,portal.client_contract_id]);if(!portal||!doc.rows[0]){await client.query('ROLLBACK');return json(res,403,{error:'private_document_outside_contract_scope'});}if(input.dossier_id&&!(await client.query("SELECT id FROM crm_contract_fiscal_dossiers WHERE id=$1 AND contract_id=$2",[input.dossier_id,contractId])).rows[0]){await client.query('ROLLBACK');return json(res,404,{error:'dossier_not_found'});}if(input.measurement_id&&!(await client.query("SELECT id FROM crm_contract_service_measurements WHERE id=$1 AND contract_id=$2",[input.measurement_id,contractId])).rows[0]){await client.query('ROLLBACK');return json(res,404,{error:'measurement_not_found'});}const row=await client.query("INSERT INTO crm_contract_quality_evidences (id,dossier_id,measurement_id,contract_id,evidence_type,title,description,captured_at,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[randomUUID(),input.dossier_id||null,input.measurement_id||null,contractId,input.evidence_type,title,description,date,actor.role,actor.identityId||null]);await client.query("INSERT INTO crm_quality_evidence_private_documents (evidence_id,contract_id,client_document_id,linked_by_id) VALUES ($1,$2,$3,$4)",[row.rows[0].id,contractId,input.client_document_id,actor.identityId||null]);await audit(client,actor,'l05_contract_document_link',contractId);await client.query('COMMIT');return json(res,201,{evidence:row.rows[0]});}catch{await client.query('ROLLBACK');return unavailable(res,'quality_evidence_create_failed');}finally{client.release();}}
    return json(res,405,{error:'method_not_allowed'},{Allow:'GET, POST'});
  }
  const SENSITIVE_DIARY = /(?:senha|password|token|secret|segredo|cpf\b|rg\b|prontu[aá]rio|diagn[oó]stico|cid\b)/i;
  async function diary(req,res,actor,contractId){if(!manager(res,actor))return;const db=getPool();if(req.method==='GET'){try{if(!await contractForRead(db,contractId,actor))return json(res,404,{error:'contract_not_found'});const query=text(new URL(req.url,'http://local').searchParams.get('q'),100);const values=[contractId];const filter=query?" AND (title ILIKE $2 OR decision ILIKE $2 OR process_ref ILIKE $2)":"";if(query)values.push(`%${query}%`);const rows=await db.query(`SELECT id,contract_id,process_ref,title,decision,category,visibility,responsible_name,decision_date,related_opportunity_id,tags,created_by,created_at FROM crm_management_diary WHERE contract_id=$1${filter} ORDER BY decision_date DESC,created_at DESC LIMIT 100`,values);return json(res,200,{entries:rows.rows});}catch{return unavailable(res);}}if(req.method!=='POST')return json(res,405,{error:'method_not_allowed'},{Allow:'GET, POST'});const input=await body(req,res,new Set(['process_ref','title','decision','category','decision_date','related_opportunity_id','tags']));if(!input)return;const title=text(input.title,200,{required:true}),decision=text(input.decision,5000,{required:true,min:10}),process=input.process_ref==null?null:text(input.process_ref,100),date=isoDate(input.decision_date),categories=new Set(['decisao','risco','negociacao','comercial','operacional','financeiro','juridico','outro']),tags=Array.isArray(input.tags)&&input.tags.length<=10&&input.tags.every(v=>text(v,40)) ? input.tags.map(v=>text(v,40)) : null;if(!title||!decision||!date||!categories.has(input.category)||(input.process_ref!=null&&!process)||(input.related_opportunity_id!=null&&!isUuid(input.related_opportunity_id))||!tags||SENSITIVE_DIARY.test(`${title}\n${decision}`))return bad(res,'invalid_or_sensitive_diary_entry');const client=await db.connect();try{await client.query('BEGIN');const c=await contractForRead(client,contractId,actor);if(!c){await client.query('ROLLBACK');return json(res,404,{error:'contract_not_found'});}if(input.related_opportunity_id&&!(await client.query("SELECT id FROM crm_opportunities WHERE id=$1 AND company_id=$2",[input.related_opportunity_id,c.company_id])).rows[0]){await client.query('ROLLBACK');return json(res,409,{error:'opportunity_outside_contract_company'});}const row=await client.query("INSERT INTO crm_management_diary (id,contract_id,company_id,process_ref,title,decision,category,visibility,responsible_id,responsible_name,decision_date,related_opportunity_id,tags,created_by,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'restrito',$8,$9,$10,$11,$12,$13,$14) RETURNING *",[randomUUID(),contractId,c.company_id,process,title,decision,input.category,actor.identityId||null,actor.role,date,input.related_opportunity_id||null,tags,actor.role,actor.identityId||null]);await audit(client,actor,'l05_management_diary',contractId);await client.query('COMMIT');return json(res,201,{entry:row.rows[0]});}catch(error){console.error('L05 diary create failed', error);await client.query('ROLLBACK');return unavailable(res,'diary_create_failed');}finally{client.release();}}

  async function linkPortal(req, res, actor, contractId) {
    if (!manager(res, actor)) return;
    const input = await body(req, res, new Set(["client_contract_id", "note"])); if (!input) return;
    const note = text(input.note, 500, { required: true, min: 10 });
    if (!isUuid(input.client_contract_id) || !note) return bad(res, "invalid_portal_link");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const contract = await contractForRead(client, contractId, actor);
      const clientContract = await client.query("SELECT id FROM client_contracts WHERE id=$1", [input.client_contract_id]);
      if (!contract || !clientContract.rows[0]) { await client.query("ROLLBACK"); return json(res, 404, { error: "contract_not_found" }); }
      const linked = await client.query("INSERT INTO crm_contract_portal_links (contract_id,client_contract_id,linked_by_id,note) VALUES ($1,$2,$3,$4) ON CONFLICT (contract_id) DO UPDATE SET client_contract_id=EXCLUDED.client_contract_id,linked_by_id=EXCLUDED.linked_by_id,linked_at=NOW(),note=EXCLUDED.note RETURNING *", [contractId,input.client_contract_id,actor.identityId || null,note]);
      await audit(client, actor, "l05_contract_update", contractId); await client.query("COMMIT"); return json(res, 200, { portal_link: linked.rows[0] });
    } catch { await client.query("ROLLBACK"); return unavailable(res,"portal_link_failed"); } finally { client.release(); }
  }
  async function attachPrivateDocument(req, res, actor, contractId) {
    if (!manager(res, actor)) return;
    const input = await body(req, res, new Set(["client_document_id", "category"])); if (!input) return;
    const category = text(input.category, 60, { required: true });
    if (!isUuid(input.client_document_id) || !category) return bad(res, "invalid_private_document_link");
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const portal = await client.query("SELECT client_contract_id FROM crm_contract_portal_links WHERE contract_id=$1", [contractId]);
      if (!portal.rows[0]) { await client.query("ROLLBACK"); return json(res, 409, { error: "portal_contract_link_required" }); }
      const document = await client.query("SELECT id FROM client_documents WHERE id=$1 AND contract_id=$2", [input.client_document_id,portal.rows[0].client_contract_id]);
      if (!document.rows[0]) { await client.query("ROLLBACK"); return json(res, 403, { error: "private_document_outside_contract_scope" }); }
      const linked = await client.query("INSERT INTO crm_contract_private_documents (contract_id,client_document_id,category,linked_by_id) VALUES ($1,$2,$3,$4) ON CONFLICT (contract_id,client_document_id) DO NOTHING RETURNING *", [contractId,input.client_document_id,category,actor.identityId || null]);
      await audit(client, actor, "l05_contract_document_link", contractId); await client.query("COMMIT"); return json(res, linked.rows[0] ? 201 : 200, { document: linked.rows[0] || null, idempotent: !linked.rows[0] });
    } catch { await client.query("ROLLBACK"); return unavailable(res,"private_document_link_failed"); } finally { client.release(); }
  }

  async function handle(req, res, url) {
    if (!sameOriginRequired(req, res)) return;
    const actor = await session(req, res); if (!actor) return;
    const tail = url.pathname.slice("/api/crm/contracts".length).split("/").filter(Boolean);
    if (tail.length === 0) {
      if (req.method === "GET") return list(req,res,actor,url);
      if (req.method !== "POST") return json(res,405,{error:"method_not_allowed"},{Allow:"GET, POST"});
      if (!manager(res,actor)) return;
      const input = await body(req,res,new Set(["source","request_key","company_id","title","origin_details","service_summary","starts_on","ends_on","total_cost","total_price","proposal_id","proposal_version"])); if (!input) return;
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const result = input.source === "proposal" ? await createFromProposal(client,actor,input) : input.source === "manual" ? await createManual(client,actor,input) : {status:400,error:"source_required"};
        if (result.error) { await client.query("ROLLBACK"); return json(res,result.status,{error:result.error}); }
        await client.query("COMMIT"); return json(res,result.status,{contract:result.contract,created:result.created});
      } catch (error) { await client.query("ROLLBACK"); return unavailable(res,"contract_create_failed"); } finally { client.release(); }
    }
    // Compatibility with the L04 workspace.  It reaches the same canonical
    // creation transaction, not the retired handler.
    if (tail[0] === "from-proposal" && tail.length === 1 && req.method === "POST") {
      if (!manager(res, actor)) return;
      const input = await body(req, res, new Set(["proposal_id", "proposal_version"])); if (!input) return;
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const result = await createFromProposal(client, actor, input);
        if (result.error) { await client.query("ROLLBACK"); return json(res, result.status, { error: result.error }); }
        await client.query("COMMIT");
        return json(res, result.status, { contract: result.contract, created: result.created, isNew: result.created, idempotent: true });
      } catch { await client.query("ROLLBACK"); return unavailable(res, "contract_create_failed"); } finally { client.release(); }
    }
    const contractId = tail[0]; if (!isUuid(contractId)) return json(res,404,{error:"not_found"});
    if (tail.length === 1 && req.method === "GET") return detail(req,res,actor,contractId);
    if (tail[1] === "units" && req.method === "POST") return addUnit(req,res,actor,contractId);
    if (tail[1] === "items" && req.method === "POST") return addItem(req,res,actor,contractId);
    if (tail[1] === "responsibles" && req.method === "POST") return addResponsible(req,res,actor,contractId);
    if (tail[1] === "status") return status(req,res,actor,contractId);
    if (tail[1] === "amendments") return amendments(req,res,actor,contractId,tail[2]);
    if (tail[1] === "alert-rules") return alerts(req,res,actor,contractId,tail[2],tail[3]);
    if (tail[1] === "alerts" && req.method === "GET") return alerts(req,res,actor,contractId);
    if (tail[1] === "document-obligations") return documentObligations(req,res,actor,contractId,tail[2]);
    if (tail[1] === "implantation") return implantation(req,res,actor,contractId,tail[2],tail[3]);
    if (tail[1] === "closure") return closure(req,res,actor,contractId,tail[2],tail[3]);
    if (tail[1] === "fiscal") return fiscal(req,res,actor,contractId,tail[2],tail[3]);
    if (tail[1] === "management-diary") return diary(req,res,actor,contractId);
    if (["posts","sla","obligations","exclusions","schedule"].includes(tail[1])) return composition(req,res,actor,contractId,tail[1]);
    if (tail[1] === "portal-link" && req.method === "PUT") return linkPortal(req,res,actor,contractId);
    if (tail[1] === "documents" && req.method === "POST") return attachPrivateDocument(req,res,actor,contractId);
    return json(res,405,{error:"method_not_allowed"},{Allow:"GET, POST, PUT"});
  }
  return { handle };
}
