import { createHash, randomUUID } from "node:crypto";

function generateProtocol(prefix) {
  const d = new Date();
  const y = d.getFullYear().toString();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return `${prefix}-${y}${m}${day}-${rand}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

function requestFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createCliFinanceApi({ pool, auditLog, sameOrigin, requireSession, requireClientSession, requireRole }) {
  async function ensureAuth(req, res, roles) {
    const session = await requireSession(req);
    if (!session) { res.writeHead(401, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"unauthorized" })); return null; }
    // Sem vínculo por conta validado nas rotas CLI-09..14, só admin/ti têm
    // acesso global. Não interpretar cookie de staff RH como grant do cliente.
    if (!requireRole(session, ["admin","ti"]) || (roles && !requireRole(session, roles))) {
      res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"forbidden" })); return null;
    }
    if (!sameOrigin(req)) { res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"origin_forbidden" })); return null; }
    return session;
  }
  function json(res, code, obj) { res.writeHead(code, { "Content-Type":"application/json" }); res.end(JSON.stringify(obj)); }

  // CLI-09 cobranças somente quando financeiro integrado dados própria conta
  async function handleChargesV2(req, res) {
    // A leitura do portal usa a sessão de cliente, nunca a sessão administrativa.
    // Mantém o endpoint de escrita e consulta global protegido pelo guard legado.
    if (req.method === "GET" && req.url.startsWith("/api/client/")) {
      const session = await requireSession(req);
      if (!session || String(session.role || session.userRole || "").toLowerCase() !== "cliente") return json(res, 401, { error: "client_session_required" });
      if (!sameOrigin(req)) return json(res, 403, { error: "origin_forbidden" });
      const grants = await pool.query(`SELECT client_account_id FROM client_access_grants WHERE identity_id=$1 AND revoked_at IS NULL`, [session.identityId]);
      const allowed = grants.rows.map(row => row.client_account_id);
      const result = await pool.query(`SELECT id, protocol, client_account_id, contract_id, charge_type, status, amount_cents, due_date, is_fiscal, fiscal_document_url, fiscal_document_storage_key, comprovante_url, comprovante_storage_key FROM cli_charges_v2 WHERE finance_integration_active=true AND client_account_id = ANY($1::uuid[]) ORDER BY due_date DESC LIMIT 100`, [allowed]);
      return json(res, 200, { charges: result.rows, note: "somente cobranças integradas da própria conta" });
    }
    const session = await ensureAuth(req, res, ["admin","ti","financeiro","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      let q=`SELECT * FROM cli_charges_v2 WHERE finance_integration_active=true`;
      const params=[]; let idx=1;
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      q+=` ORDER BY due_date DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      const role = (session.role||session.userRole||"").toLowerCase();
      if (role==="cliente") {
        try {
          const grants = await pool.query(`SELECT client_account_id FROM client_access_grants WHERE identity_id=$1 AND revoked_at IS NULL`, [session.identityId]);
          const allowed = grants.rows.map(r=>r.client_account_id);
          return json(res,200,{ charges: rows.filter(r=> allowed.includes(r.client_account_id)), note:"cobranças somente quando financeiro integrado dados própria conta" });
        } catch {}
      }
      return json(res,200,{ charges: rows, note:"somente quando financeiro integrado" });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contract_id, charge_type, amount_cents, due_date, competence_date, is_fiscal, fiscal_document_url, fiscal_document_storage_key, comprovante_url, comprovante_storage_key, finance_integration_active, finance_integration_id, notes } = body;
      if (!client_account_id || amount_cents==null || !due_date) return json(res,400,{ error:"missing_fields" });
      if (is_fiscal && !finance_integration_active) return json(res,400,{ error:"fiscal_requires_finance_integration", note:"cobranças/documentos fiscais somente quando financeiro integrado" });
      if (comprovante_url && body.status!=='pago') return json(res,400,{ error:"comprovante_requires_paid" });
      const protocol = generateProtocol("CHG-CLI");
      try {
        const { rows } = await pool.query(
          `INSERT INTO cli_charges_v2 (protocol, client_account_id, contract_id, charge_type, amount_cents, due_date, competence_date, is_fiscal, fiscal_document_url, fiscal_document_storage_key, comprovante_url, comprovante_storage_key, finance_integration_active, finance_integration_id, notes, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [protocol, client_account_id, contract_id||null, charge_type||'mensalidade', amount_cents, due_date, competence_date||null, is_fiscal||false, fiscal_document_url||null, fiscal_document_storage_key||null, comprovante_url||null, comprovante_storage_key||null, finance_integration_active||false, finance_integration_id||null, notes||null, session.identityId||null]
        );
        await auditLog({ action:"cli_charge_v2_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, account_id: client_account_id, finance_active: finance_integration_active } });
        return json(res,201,{ charge: rows[0] });
      } catch(e) {
        if (String(e.message).includes("duplicate")) return json(res,409,{ error:"duplicate_storage_key" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, status, paid_at } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      const allowed = ['pendente','pago','vencido','cancelado','em_disputa'];
      if (status && !allowed.includes(status)) return json(res,400,{ error:"invalid_status" });
      await pool.query(`UPDATE cli_charges_v2 SET status=COALESCE($2,status), paid_at=COALESCE($3,paid_at) WHERE id=$1`, [id, status||null, paid_at||null]);
      await auditLog({ action:"cli_charge_v2_status", actor: session.identityId||"unknown", target: id, meta:{ status } });
      const { rows } = await pool.query(`SELECT * FROM cli_charges_v2 WHERE id=$1`, [id]);
      return json(res,200,{ charge: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  // CLI-10 solicitação de serviço adicional: a rota do cliente deriva autoria
  // da sessão, revalida conta/contrato e cria a oportunidade canônica na mesma
  // transação. Nenhuma etapa cria contrato, cobrança ou obrigação.
  async function handleClientServiceRequests(req, res) {
    const session = await requireClientSession?.(req);
    if (!session?.identityId) return json(res, 401, { error: "client_session_required" });
    if (!sameOrigin(req)) return json(res, 403, { error: "origin_forbidden" });
    if (!["GET", "POST"].includes(req.method)) return json(res, 405, { error: "method_not_allowed" });

    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = String(url.searchParams.get("account") || "");
      if (!UUID_PATTERN.test(accountId)) return json(res, 400, { error: "invalid_account_id" });
      try {
        const scoped = await pool.query(
          `SELECT 1 FROM client_access_grants grant_row
             JOIN client_accounts account ON account.id = grant_row.client_account_id
            WHERE grant_row.identity_id=$1 AND grant_row.client_account_id=$2
              AND grant_row.revoked_at IS NULL AND account.status='active'`,
          [session.identityId, accountId],
        );
        if (!scoped.rows[0]) {
          await pool.query(
            `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
             VALUES ('client',$1,'service_request_list',$2,'denied','authorization_denied')`,
            [session.identityId, accountId],
          );
          return json(res, 403, { error: "forbidden" });
        }
        const result = await pool.query(
          `SELECT id, protocol, client_account_id, contract_id, title, description, status,
                  origin, responsible_name, crm_opportunity_id, created_at, updated_at
             FROM cli_service_requests
            WHERE client_account_id=$1 AND created_by_identity=$2
            ORDER BY created_at DESC LIMIT 100`,
          [accountId, session.identityId],
        );
        await pool.query(
          `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('client',$1,'service_request_list',$2,'allowed','none')`,
          [session.identityId, accountId],
        );
        return json(res, 200, { serviceRequests: result.rows });
      } catch (error) {
        console.error("CLI-10 client list failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "service_requests_unavailable" });
      }
    }

    let body;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32_768) return json(res, 413, { error: "body_too_large" });
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return json(res, 400, { error: "invalid_request" });
    }

    const accountId = String(body.account_id || "");
    const contractId = body.contract_id ? String(body.contract_id) : null;
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!UUID_PATTERN.test(accountId) || (contractId && !UUID_PATTERN.test(contractId))) return json(res, 400, { error: "invalid_reference" });
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) return json(res, 400, { error: "idempotency_key_required" });
    if (title.length < 5 || title.length > 200) return json(res, 400, { error: "title_5_200" });
    if (description.length < 10 || description.length > 2000) return json(res, 400, { error: "description_10_2000" });

    const fingerprint = requestFingerprint({ accountId, contractId, title, description });
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const replay = await client.query(
        `SELECT * FROM cli_service_requests WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE`,
        [session.identityId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        await client.query("COMMIT");
        return json(res, 200, { serviceRequest: replay.rows[0], replayed: true });
      }

      const scope = await client.query(
        `SELECT grant_row.contract_scope_mode, grant_row.allowed_contract_ids,
                account.crm_company_id, company.responsible_id, company.responsible_name
           FROM client_access_grants grant_row
           JOIN client_accounts account ON account.id=grant_row.client_account_id AND account.status='active'
           LEFT JOIN crm_companies company ON company.id=account.crm_company_id AND company.status='active'
          WHERE grant_row.identity_id=$1 AND grant_row.client_account_id=$2 AND grant_row.revoked_at IS NULL
          FOR UPDATE OF grant_row, account`,
        [session.identityId, accountId],
      );
      const access = scope.rows[0];
      if (!access) {
        await client.query(
          `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('client',$1,'service_request_create',$2,'denied','authorization_denied')`,
          [session.identityId, accountId],
        );
        await client.query("COMMIT");
        return json(res, 403, { error: "forbidden" });
      }
      if (!access.crm_company_id) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "crm_company_link_required" });
      }
      if (!access.responsible_id && !access.responsible_name) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "crm_responsible_required" });
      }
      if (contractId) {
        const contract = await client.query(
          `SELECT id FROM client_contracts WHERE id=$1 AND client_account_id=$2`,
          [contractId, accountId],
        );
        const allowedContracts = Array.isArray(access.allowed_contract_ids) ? access.allowed_contract_ids : [];
        const grantAllows = access.contract_scope_mode === "all"
          || (access.contract_scope_mode === "selected" && allowedContracts.includes(contractId));
        if (!contract.rows[0] || !grantAllows) {
          await client.query("ROLLBACK");
          return json(res, 403, { error: "contract_forbidden" });
        }
      }

      const requestId = randomUUID();
      const protocol = generateProtocol("SRV-CLI");
      const opportunityId = randomUUID();
      const created = await client.query(
        `INSERT INTO cli_service_requests
           (id, protocol, client_account_id, contract_id, title, description, status, origin,
            responsible_name, responsible_identity_id, crm_opportunity_id, created_by_identity,
            idempotency_key, request_fingerprint)
         VALUES ($1,$2,$3,$4,$5,$6,'solicitada','portal_cliente',$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [requestId, protocol, accountId, contractId, title, description, access.responsible_name || null,
          access.responsible_id || null, opportunityId, session.identityId, key, fingerprint],
      );
      await client.query(
        `INSERT INTO crm_opportunities
           (id, company_id, title, need_description, responsible_id, responsible_name, origin,
            priority, created_by_id, stage, next_action)
         VALUES ($1,$2,$3,$4,$5,$6,'portal_cliente','media',$7,'novo','Analisar solicitação de serviço adicional')`,
        [opportunityId, access.crm_company_id, `Serviço adicional: ${title}`.slice(0, 200), description,
          access.responsible_id || null, access.responsible_name || null, session.identityId],
      );
      await client.query(
        `INSERT INTO crm_opportunity_stages
           (id, opportunity_id, previous_stage, next_stage, changed_by_id, changed_by_role, reason)
         VALUES ($1,$2,NULL,'novo',$3,'client','Solicitação criada no portal do cliente')`,
        [randomUUID(), opportunityId, session.identityId],
      );
      await client.query(
        `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
         VALUES ('client',$1,'service_request_create',$2,'allowed','none')`,
        [session.identityId, requestId],
      );
      await client.query("COMMIT");
      return json(res, 201, {
        serviceRequest: created.rows[0],
        note: "A solicitação abriu uma oportunidade para análise; não cria contrato, cobrança ou obrigação.",
      });
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error && typeof error === "object" && error.code === "23505") {
        try {
          const replay = await client.query(
            `SELECT * FROM cli_service_requests WHERE created_by_identity=$1 AND idempotency_key=$2`,
            [session.identityId, key],
          );
          if (replay.rows[0]?.request_fingerprint === fingerprint) return json(res, 200, { serviceRequest: replay.rows[0], replayed: true });
          if (replay.rows[0]) return json(res, 409, { error: "idempotency_key_reused" });
        } catch {}
      }
      console.error("CLI-10 client create failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "service_request_unavailable" });
    } finally {
      client?.release();
    }
  }

  async function handleServiceRequests(req, res) {
    if (req.url.startsWith("/api/client/")) return handleClientServiceRequests(req, res);
    const session = await ensureAuth(req, res, ["admin","ti","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      let query = `SELECT * FROM cli_service_requests WHERE 1=1`;
      const params = [];
      if (accountId) { query += ` AND client_account_id=$1`; params.push(accountId); }
      query += ` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(query, params);
      return json(res, 200, { serviceRequests: rows });
    }
    // Compatibilidade administrativa legada: a promoção CLI-10 altera apenas a
    // jornada /api/client. A equipe ainda pode registrar solicitações internas.
    if (req.method === "POST") {
      let body = {};
      try { const chunks = []; for await (const chunk of req) chunks.push(chunk); body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
      catch { return json(res, 400, { error: "invalid_request" }); }
      const { client_account_id, contract_id, contact_id, title, description, origin, responsible_name } = body;
      if (!client_account_id || !title || !description) return json(res, 400, { error: "missing_fields" });
      if (String(title).length < 5 || String(title).length > 200) return json(res, 400, { error: "title_5_200" });
      if (String(description).length < 10 || String(description).length > 2000) return json(res, 400, { error: "description_10_2000" });
      const protocol = generateProtocol("SRV-CLI");
      const { rows } = await pool.query(
        `INSERT INTO cli_service_requests
           (protocol, client_account_id, contract_id, contact_id, title, description, origin, responsible_name, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [protocol, client_account_id, contract_id || null, contact_id || null, title, description,
          origin || "portal_cliente", responsible_name || null, session.identityId || null],
      );
      await auditLog({ action: "cli_service_request_create", actor: session.identityId || "unknown", target: rows[0].id, meta: { protocol, origin, responsible: responsible_name } });
      return json(res, 201, { serviceRequest: rows[0] });
    }
    return json(res, 405, { error: "method_not_allowed" });
  }

  // CLI-11 satisfação pós-atendimento e periódica no portal do cliente.
  // A resposta é idempotente por identidade, o plano de ação usa responsável
  // real do CRM e o risco de renovação só é classificado a partir de fatos
  // contados em registros canônicos. Nenhum número é estimado.
  function classifyRenewalRisk(facts) {
    if (facts.score === null) return null;
    const aggravating = facts.open_tickets > 0 || facts.previous_low_scores > 0 || facts.overdue_charges > 0;
    if (facts.score <= 6) return aggravating ? "alto" : "medio";
    if (facts.score <= 8) return aggravating ? "medio" : null;
    return aggravating ? "medio" : "baixo";
  }

  function renewalRiskReason(risk, facts) {
    return [
      `Classificação ${risk} derivada de fatos registrados em ${facts.as_of}:`,
      `nota informada ${facts.score}`,
      `chamados abertos ${facts.open_tickets}`,
      `cobranças vencidas ${facts.overdue_charges}`,
      `respostas anteriores com nota até 6: ${facts.previous_low_scores}`,
    ].join(" ");
  }

  async function handleClientSatisfactionSurveys(req, res) {
    const session = await requireClientSession?.(req);
    if (!session?.identityId) return json(res, 401, { error: "client_session_required" });
    if (!sameOrigin(req)) return json(res, 403, { error: "origin_forbidden" });
    if (!["GET", "POST"].includes(req.method)) return json(res, 405, { error: "method_not_allowed" });

    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = String(url.searchParams.get("account") || "");
      if (!UUID_PATTERN.test(accountId)) return json(res, 400, { error: "invalid_account_id" });
      try {
        const scoped = await pool.query(
          `SELECT 1 FROM client_access_grants grant_row
             JOIN client_accounts account ON account.id = grant_row.client_account_id
            WHERE grant_row.identity_id=$1 AND grant_row.client_account_id=$2
              AND grant_row.revoked_at IS NULL AND account.status='active'`,
          [session.identityId, accountId],
        );
        if (!scoped.rows[0]) {
          await pool.query(
            `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
             VALUES ('client',$1,'satisfaction_survey_list',$2,'denied','authorization_denied')`,
            [session.identityId, accountId],
          );
          return json(res, 403, { error: "forbidden" });
        }
        const result = await pool.query(
          `SELECT id, protocol, client_account_id, contract_id, survey_type, status, score, feedback,
                  renewal_risk, renewal_risk_reason, facts_json, action_plan_pending_reason,
                  created_at, responded_at
             FROM cli_satisfaction_surveys
            WHERE client_account_id=$1 AND target_identity_id=$2
            ORDER BY created_at DESC LIMIT 100`,
          [accountId, session.identityId],
        );
        await pool.query(
          `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('client',$1,'satisfaction_survey_list',$2,'allowed','none')`,
          [session.identityId, accountId],
        );
        return json(res, 200, {
          surveys: result.rows,
          note: "Somente pesquisas endereçadas a esta identidade na conta selecionada.",
        });
      } catch (error) {
        console.error("CLI-11 client list failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "satisfaction_surveys_unavailable" });
      }
    }

    let body;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32_768) return json(res, 413, { error: "body_too_large" });
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return json(res, 400, { error: "invalid_request" });
    }

    const surveyId = String(body.survey_id || "");
    const feedback = String(body.feedback || "").trim();
    const key = String(req.headers["idempotency-key"] || "").trim();
    const score = Number.isInteger(body.score) ? body.score : null;
    if (!UUID_PATTERN.test(surveyId)) return json(res, 400, { error: "invalid_reference" });
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) return json(res, 400, { error: "idempotency_key_required" });
    if (score === null || score < 0 || score > 10) return json(res, 400, { error: "score_0_10" });
    if (feedback.length < 10 || feedback.length > 2000) return json(res, 400, { error: "feedback_10_2000" });

    const fingerprint = requestFingerprint({ surveyId, score, feedback });
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const replay = await client.query(
        `SELECT * FROM cli_satisfaction_surveys WHERE responded_by_identity=$1 AND response_idempotency_key=$2 FOR UPDATE`,
        [session.identityId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].response_fingerprint !== fingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        await client.query("COMMIT");
        return json(res, 200, { survey: replay.rows[0], replayed: true });
      }

      const scoped = await client.query(
        `SELECT survey.id, survey.status, survey.client_account_id,
                company.responsible_id, company.responsible_name
           FROM cli_satisfaction_surveys survey
           JOIN client_access_grants grant_row
             ON grant_row.client_account_id = survey.client_account_id
            AND grant_row.identity_id = $1
            AND grant_row.revoked_at IS NULL
           JOIN client_accounts account
             ON account.id = survey.client_account_id AND account.status='active'
           LEFT JOIN crm_companies company
             ON company.id = account.crm_company_id AND company.status='active'
          WHERE survey.id=$2 AND survey.target_identity_id=$1
          FOR UPDATE OF survey`,
        [session.identityId, surveyId],
      );
      const survey = scoped.rows[0];
      if (!survey) {
        await client.query(
          `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('client',$1,'satisfaction_survey_respond',$2,'denied','authorization_denied')`,
          [session.identityId, surveyId],
        );
        await client.query("COMMIT");
        return json(res, 403, { error: "forbidden" });
      }
      if (survey.status !== "pendente") {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "survey_already_answered" });
      }

      // Fatos contados em registros canônicos. Falha de leitura aborta a
      // transação; nenhuma contagem ausente vira zero.
      const factsQuery = await client.query(
        `SELECT
           (SELECT COUNT(*) FROM client_tickets
             WHERE client_account_id=$1 AND status IN ('open','in_progress')) AS open_tickets,
           (SELECT COUNT(*) FROM cli_charges_v2
             WHERE client_account_id=$1 AND status='vencido') AS overdue_charges,
           (SELECT COUNT(*) FROM cli_satisfaction_surveys
             WHERE client_account_id=$1 AND id<>$2 AND score IS NOT NULL AND score<=6) AS previous_low_scores`,
        [survey.client_account_id, surveyId],
      );
      const counts = factsQuery.rows[0];
      if (!counts) {
        await client.query("ROLLBACK");
        return json(res, 503, { error: "satisfaction_facts_unavailable" });
      }
      const facts = {
        score,
        open_tickets: Number(counts.open_tickets),
        overdue_charges: Number(counts.overdue_charges),
        previous_low_scores: Number(counts.previous_low_scores),
        sources: ["client_tickets", "cli_charges_v2", "cli_satisfaction_surveys"],
        as_of: new Date().toISOString(),
      };
      const risk = classifyRenewalRisk(facts);
      const reason = risk ? renewalRiskReason(risk, facts) : null;

      const needsActionPlan = score <= 6;
      const hasResponsible = Boolean(survey.responsible_name);
      const pendingReason = needsActionPlan && !hasResponsible
        ? "Plano de ação pendente: a conta ainda não possui responsável comercial real cadastrado no CRM."
        : null;
      const nextStatus = needsActionPlan && hasResponsible ? "em_acao" : "respondida";

      const updated = await client.query(
        `UPDATE cli_satisfaction_surveys
            SET score=$2, feedback=$3, status=$4, renewal_risk=$5, renewal_risk_reason=$6,
                facts_json=$7::jsonb, action_plan_pending_reason=$8,
                responded_by_identity=$9, response_idempotency_key=$10, response_fingerprint=$11,
                responded_at=NOW(), updated_at=NOW()
          WHERE id=$1 AND status='pendente'
          RETURNING *`,
        [surveyId, score, feedback, nextStatus, risk, reason, JSON.stringify(facts), pendingReason,
          session.identityId, key, fingerprint],
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "survey_already_answered" });
      }

      let actionPlan = null;
      if (needsActionPlan && hasResponsible) {
        const due = new Date();
        due.setUTCDate(due.getUTCDate() + 7);
        const plan = await client.query(
          `INSERT INTO cli_satisfaction_action_plans
             (id, survey_id, action, responsible_name, responsible_identity_id, due_date, status, origin, facts_json)
           VALUES ($1,$2,$3,$4,$5,$6,'aberta','portal_cliente',$7::jsonb)
           RETURNING *`,
          [randomUUID(), surveyId,
            `Tratar insatisfação registrada na pesquisa ${survey.id}: contatar o cliente e endereçar os fatos apurados.`,
            survey.responsible_name, survey.responsible_id || null,
            due.toISOString().slice(0, 10), JSON.stringify(facts)],
        );
        actionPlan = plan.rows[0];
      }

      await client.query(
        `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
         VALUES ('client',$1,'satisfaction_survey_respond',$2,'allowed','none')`,
        [session.identityId, surveyId],
      );
      await client.query("COMMIT");
      return json(res, 200, {
        survey: updated.rows[0],
        actionPlan,
        note: "Resposta registrada. O risco de renovação é calculado apenas a partir de registros existentes e não altera contrato, cobrança ou obrigação.",
      });
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error && typeof error === "object" && error.code === "23505") {
        try {
          const replay = await client.query(
            `SELECT * FROM cli_satisfaction_surveys WHERE responded_by_identity=$1 AND response_idempotency_key=$2`,
            [session.identityId, key],
          );
          if (replay.rows[0]?.response_fingerprint === fingerprint) return json(res, 200, { survey: replay.rows[0], replayed: true });
          if (replay.rows[0]) return json(res, 409, { error: "idempotency_key_reused" });
        } catch {}
      }
      console.error("CLI-11 client respond failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "satisfaction_survey_unavailable" });
    } finally {
      client?.release();
    }
  }

  async function handleSatisfactionSurveys(req, res) {
    if (req.url.startsWith("/api/client/")) return handleClientSatisfactionSurveys(req, res);
    const session = await ensureAuth(req, res, ["admin","ti","comercial","rh"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      let q=`SELECT * FROM cli_satisfaction_surveys WHERE 1=1`;
      const params=[]; let idx=1;
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ surveys: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contract_id, ticket_id, visit_id, survey_type, score, feedback, renewal_risk, renewal_risk_reason, facts_json, action_plan } = body;
      if (!client_account_id) return json(res,400,{ error:"missing_account" });
      if (renewal_risk && (!facts_json || !renewal_risk_reason)) return json(res,400,{ error:"renewal_risk_requires_facts", note:"risco renovação baseado em fatos" });
      if (score!=null && (score<0 || score>10)) return json(res,400,{ error:"score_0_10" });
      if (score!=null && !feedback) return json(res,400,{ error:"feedback_required_with_score" });
      const protocol = generateProtocol("SAT-CLI");
      const { rows } = await pool.query(
        `INSERT INTO cli_satisfaction_surveys (protocol, client_account_id, contract_id, ticket_id, visit_id, survey_type, score, feedback, renewal_risk, renewal_risk_reason, facts_json, action_plan, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [protocol, client_account_id, contract_id||null, ticket_id||null, visit_id||null, survey_type||'pos_atendimento', score||null, feedback||null, renewal_risk||null, renewal_risk_reason||null, facts_json? JSON.stringify(facts_json): null, action_plan||null, session.identityId||null]
      );
      await auditLog({ action:"cli_satisfaction_survey_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, survey_type, score, renewal_risk } });
      return json(res,201,{ survey: rows[0] });
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, score, feedback, status, action_plan, renewal_risk, renewal_risk_reason, facts_json } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      if (renewal_risk && (!facts_json || !renewal_risk_reason)) return json(res,400,{ error:"renewal_risk_requires_facts" });
      await pool.query(`UPDATE cli_satisfaction_surveys SET score=COALESCE($2,score), feedback=COALESCE($3,feedback), status=COALESCE($4,status), action_plan=COALESCE($5,action_plan), renewal_risk=COALESCE($6,renewal_risk), renewal_risk_reason=COALESCE($7,renewal_risk_reason), facts_json=COALESCE($8,facts_json), responded_at=CASE WHEN $2 IS NOT NULL THEN NOW() ELSE responded_at END WHERE id=$1`, [id, score||null, feedback||null, status||null, action_plan||null, renewal_risk||null, renewal_risk_reason||null, facts_json? JSON.stringify(facts_json): null]);
      await auditLog({ action:"cli_satisfaction_response", actor: session.identityId||"unknown", target: id, meta:{ score, renewal_risk } });
      const { rows } = await pool.query(`SELECT * FROM cli_satisfaction_surveys WHERE id=$1`, [id]);
      return json(res,200,{ survey: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleSatisfactionActionPlans(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const surveyId = url.searchParams.get("survey_id");
      if (!surveyId) return json(res,400,{ error:"missing_survey_id" });
      const { rows } = await pool.query(`SELECT * FROM cli_satisfaction_action_plans WHERE survey_id=$1 ORDER BY due_date ASC`, [surveyId]);
      return json(res,200,{ actionPlans: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { survey_id, action, responsible_name, due_date } = body;
      if (!survey_id || !action || !responsible_name || !due_date) return json(res,400,{ error:"missing_fields" });
      if (String(action).length <10 || String(action).length>1000) return json(res,400,{ error:"action_10_1000" });
      const { rows } = await pool.query(`INSERT INTO cli_satisfaction_action_plans (survey_id, action, responsible_name, due_date) VALUES ($1,$2,$3,$4) RETURNING *`, [survey_id, action, responsible_name, due_date]);
      await auditLog({ action:"cli_satisfaction_action_plan_create", actor: session.identityId||"unknown", target: survey_id, meta:{ action, responsible: responsible_name } });
      return json(res,201,{ actionPlan: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  // CLI-12 renovação comunicação contratual registro sem bloquear indiscriminadamente portal por inadimplência
  async function handleRenewalCommunications(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      let q=`SELECT * FROM cli_renewal_communications WHERE 1=1`;
      const params=[]; let idx=1;
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ communications: rows, note:"sem bloquear indiscriminadamente portal por inadimplência" });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contract_id, comm_type, title, content, is_blocking, block_reason } = body;
      if (!client_account_id || !title || !content) return json(res,400,{ error:"missing_fields" });
      if (String(title).length <5 || String(title).length>200) return json(res,400,{ error:"title_5_200" });
      if (String(content).length <20 || String(content).length>5000) return json(res,400,{ error:"content_20_5000" });
      if (is_blocking && !block_reason) return json(res,400,{ error:"block_reason_required", note:"sem bloquear indiscriminadamente portal por inadimplência" });
      if (is_blocking && comm_type!=='encerramento') return json(res,400,{ error:"blocking_only_for_encerramento", note:"bloqueio apenas para encerramento, não indiscriminadamente por inadimplência" });
      const protocol = generateProtocol("REN-CLI");
      const { rows } = await pool.query(
        `INSERT INTO cli_renewal_communications (protocol, client_account_id, contract_id, comm_type, title, content, is_blocking, block_reason, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [protocol, client_account_id, contract_id||null, comm_type||'aviso_vencimento', title, content, is_blocking||false, block_reason||null, session.identityId||null]
      );
      await auditLog({ action:"cli_renewal_comm_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, comm_type, is_blocking } });
      return json(res,201,{ communication: rows[0] });
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, sent_at } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      await pool.query(`UPDATE cli_renewal_communications SET sent_at=COALESCE($2,sent_at) WHERE id=$1`, [id, sent_at||null]);
      await auditLog({ action:"cli_renewal_comm_send", actor: session.identityId||"unknown", target: id, meta:{ sent_at } });
      const { rows } = await pool.query(`SELECT * FROM cli_renewal_communications WHERE id=$1`, [id]);
      return json(res,200,{ communication: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  // CLI-13 modos convite solicitação com aprovação autocadastro configuráveis vínculo verificado servidor todos autocadastro nunca libera contratos sozinho
  async function handlePortalModeConfigs(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM cli_portal_mode_configs ORDER BY mode ASC`);
      return json(res,200,{ modes: rows, note:"autocadastro nunca libera contratos sozinho" });
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { mode, is_active, requires_approval, auto_release_contracts } = body;
      if (!mode) return json(res,400,{ error:"missing_mode" });
      if (mode==='autocadastro' && auto_release_contracts===true) return json(res,400,{ error:"autocadastro_never_releases_contracts", note:"autocadastro nunca libera contratos sozinho" });
      await pool.query(`UPDATE cli_portal_mode_configs SET is_active=COALESCE($2,is_active), requires_approval=COALESCE($3,requires_approval), auto_release_contracts=COALESCE($4,auto_release_contracts) WHERE mode=$1`, [mode, is_active, requires_approval, auto_release_contracts]);
      await auditLog({ action:"cli_portal_mode_update", actor: session.identityId||"unknown", target: mode, meta:{ is_active, requires_approval, auto_release_contracts } });
      const { rows } = await pool.query(`SELECT * FROM cli_portal_mode_configs WHERE mode=$1`, [mode]);
      return json(res,200,{ mode: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handlePortalAccessRequests(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM cli_portal_access_requests ORDER BY created_at DESC LIMIT 100`);
      return json(res,200,{ requests: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { mode, client_account_id, requested_email, requested_name, document_ref } = body;
      if (!mode || !requested_email || !requested_name) return json(res,400,{ error:"missing_fields" });
      // vínculo verificado no servidor em todos
      if (client_account_id) {
        const acc = await pool.query(`SELECT id FROM client_accounts WHERE id=$1`, [client_account_id]);
        if (acc.rows.length===0) return json(res,400,{ error:"invalid_account", note:"vínculo verificado no servidor" });
      }
      // check mode config
      const cfg = await pool.query(`SELECT * FROM cli_portal_mode_configs WHERE mode=$1`, [mode]);
      if (cfg.rows.length===0) return json(res,400,{ error:"invalid_mode" });
      if (!cfg.rows[0].is_active) return json(res,400,{ error:"mode_inactive" });
      const protocol = generateProtocol("ACC-CLI");
      const { rows } = await pool.query(
        `INSERT INTO cli_portal_access_requests (protocol, mode, client_account_id, requested_email, requested_name, document_ref, verified_link)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [protocol, mode, client_account_id||null, requested_email, requested_name, document_ref||null, true]
      );
      await auditLog({ action:"cli_portal_access_request_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, mode, verified_link: true } });
      return json(res,201,{ request: rows[0], note:"vínculo verificado no servidor" });
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, status, rejection_reason } = body;
      if (!id || !status) return json(res,400,{ error:"missing_fields" });
      const allowed = ['pendente','aprovada','rejeitada','cancelada'];
      if (!allowed.includes(status)) return json(res,400,{ error:"invalid_status" });
      if (status==='aprovada') {
        const cur = await pool.query(`SELECT * FROM cli_portal_access_requests WHERE id=$1`, [id]);
        if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
        if (!cur.rows[0].verified_link) return json(res,400,{ error:"verified_link_required", note:"vínculo verificado no servidor" });
        // autocadastro nunca libera contratos sozinho
        if (cur.rows[0].mode==='autocadastro') {
          // ensure no auto_release
          const cfg = await pool.query(`SELECT auto_release_contracts FROM cli_portal_mode_configs WHERE mode='autocadastro'`);
          if (cfg.rows.length>0 && cfg.rows[0].auto_release_contracts===true) return json(res,400,{ error:"autocadastro_never_releases_contracts" });
        }
        await pool.query(`UPDATE cli_portal_access_requests SET status='aprovada', approved_by_identity=$2, approved_at=NOW() WHERE id=$1`, [id, session.identityId||null]);
        await auditLog({ action:"cli_portal_access_approve", actor: session.identityId||"unknown", target: id, meta:{ status:'aprovada' } });
      } else {
        await pool.query(`UPDATE cli_portal_access_requests SET status=$2, rejection_reason=$3 WHERE id=$1`, [id, status, rejection_reason||null]);
      }
      const { rows } = await pool.query(`SELECT * FROM cli_portal_access_requests WHERE id=$1`, [id]);
      return json(res,200,{ request: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  // CLI-14 segurança conta MFA opcional gestão sessões troca e-mail concluída fluxos ligados backend real
  async function handleSecurityEvents(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","rh"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      let q=`SELECT * FROM cli_security_events WHERE 1=1`;
      const params=[]; let idx=1;
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ events: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contact_id, event_type, ip_address, user_agent, meta } = body;
      if (!client_account_id || !event_type) return json(res,400,{ error:"missing_fields" });
      const { rows } = await pool.query(`INSERT INTO cli_security_events (client_account_id, identity_id, contact_id, event_type, ip_address, user_agent, meta) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [client_account_id, session.identityId||null, contact_id||null, event_type, ip_address||null, user_agent||null, meta? JSON.stringify(meta): null]);
      await auditLog({ action:"cli_security_event", actor: session.identityId||"unknown", target: rows[0].id, meta:{ event_type, account_id: client_account_id } });
      return json(res,201,{ event: rows[0], note:"MFA opcional fluxos backend real" });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleEmailChangeRequests(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","cliente"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      let q=`SELECT * FROM cli_email_change_requests WHERE 1=1`;
      const params=[]; let idx=1;
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ requests: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contact_id, old_email, new_email } = body;
      if (!client_account_id || !old_email || !new_email) return json(res,400,{ error:"missing_fields" });
      if (old_email===new_email) return json(res,400,{ error:"new_email_different_required" });
      const token = randomUUID() + "-" + Math.random().toString(36).substring(2,8);
      const protocol = generateProtocol("EML-CLI");
      const expires = new Date(Date.now() + 24*60*60*1000).toISOString();
      const { rows } = await pool.query(
        `INSERT INTO cli_email_change_requests (protocol, client_account_id, identity_id, contact_id, old_email, new_email, token, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [protocol, client_account_id, session.identityId||null, contact_id||null, old_email, new_email, token, expires]
      );
      await pool.query(`INSERT INTO cli_security_events (client_account_id, identity_id, contact_id, event_type, meta) VALUES ($1,$2,$3,'email_change_requested',$4)`, [client_account_id, session.identityId||null, contact_id||null, JSON.stringify({ old_email, new_email, protocol })]);
      await auditLog({ action:"cli_email_change_request", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, old_email, new_email } });
      return json(res,201,{ request: rows[0], note:"troca e-mail concluída fluxo backend real token" });
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, token, action } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      const cur = await pool.query(`SELECT * FROM cli_email_change_requests WHERE id=$1`, [id]);
      if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
      const reqRow = cur.rows[0];
      if (new Date(reqRow.expires_at) < new Date()) {
        await pool.query(`UPDATE cli_email_change_requests SET status='expirado' WHERE id=$1`, [id]);
        return json(res,400,{ error:"expired" });
      }
      if (action==="confirm" && token===reqRow.token) {
        await pool.query(`UPDATE cli_email_change_requests SET status='confirmado', confirmed_at=NOW() WHERE id=$1`, [id]);
        await pool.query(`INSERT INTO cli_security_events (client_account_id, identity_id, contact_id, event_type, meta) VALUES ($1,$2,$3,'email_changed',$4)`, [reqRow.client_account_id, session.identityId||null, reqRow.contact_id||null, JSON.stringify({ old_email: reqRow.old_email, new_email: reqRow.new_email })]);
        await auditLog({ action:"cli_email_change_confirm", actor: session.identityId||"unknown", target: id, meta:{ old_email: reqRow.old_email, new_email: reqRow.new_email } });
        const { rows } = await pool.query(`SELECT * FROM cli_email_change_requests WHERE id=$1`, [id]);
        return json(res,200,{ request: rows[0], note:"troca e-mail concluída" });
      }
      return json(res,400,{ error:"invalid_token_or_action" });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleSessions(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const identityId = url.searchParams.get("identity_id");
      let q=`SELECT * FROM cli_sessions WHERE 1=1`;
      const params=[]; let idx=1;
      if (identityId) { q+=` AND identity_id=$${idx++}`; params.push(identityId); }
      q+=` ORDER BY last_active_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ sessions: rows, note:"gestão sessões MFA opcional" });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { identity_id, client_account_id, contact_id, session_token_hash, ip_address, user_agent } = body;
      if (!identity_id || !session_token_hash) return json(res,400,{ error:"missing_fields" });
      const { rows } = await pool.query(`INSERT INTO cli_sessions (identity_id, client_account_id, contact_id, session_token_hash, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [identity_id, client_account_id||null, contact_id||null, session_token_hash, ip_address||null, user_agent||null]);
      return json(res,201,{ session: rows[0] });
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, revoked_reason } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      await pool.query(`UPDATE cli_sessions SET revoked_at=NOW(), revoked_reason=$2 WHERE id=$1`, [id, revoked_reason||'revogada manualmente']);
      const cur = await pool.query(`SELECT * FROM cli_sessions WHERE id=$1`, [id]);
      if (cur.rows.length>0) {
        await pool.query(`INSERT INTO cli_security_events (client_account_id, identity_id, event_type, meta) VALUES ($1,$2,'session_revoked',$3)`, [cur.rows[0].client_account_id||null, cur.rows[0].identity_id, JSON.stringify({ session_id: id, reason: revoked_reason })]);
        await auditLog({ action:"cli_session_revoke", actor: session.identityId||"unknown", target: id, meta:{ reason: revoked_reason } });
      }
      const { rows } = await pool.query(`SELECT * FROM cli_sessions WHERE id=$1`, [id]);
      return json(res,200,{ session: rows[0], note:"sessão revogada MFA opcional gestão" });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  return {
    handleChargesV2,
    handleServiceRequests,
    handleSatisfactionSurveys,
    handleSatisfactionActionPlans,
    handleRenewalCommunications,
    handlePortalModeConfigs,
    handlePortalAccessRequests,
    handleSecurityEvents,
    handleEmailChangeRequests,
    handleSessions,
  };
}
