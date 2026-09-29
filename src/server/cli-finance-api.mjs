import { randomUUID } from "node:crypto";

function generateProtocol(prefix) {
  const d = new Date();
  const y = d.getFullYear().toString();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export function createCliFinanceApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
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

  // CLI-10 solicitação serviço adicional gera oportunidade CRM origem responsável
  async function handleServiceRequests(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const accountId = url.searchParams.get("client_account_id");
      let q=`SELECT * FROM cli_service_requests WHERE 1=1`;
      const params=[]; let idx=1;
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ serviceRequests: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contract_id, contact_id, title, description, origin, responsible_name } = body;
      if (!client_account_id || !title || !description) return json(res,400,{ error:"missing_fields" });
      if (String(title).length <5 || String(title).length>200) return json(res,400,{ error:"title_5_200" });
      if (String(description).length <10 || String(description).length>2000) return json(res,400,{ error:"description_10_2000" });
      const protocol = generateProtocol("SRV-CLI");
      const { rows } = await pool.query(
        `INSERT INTO cli_service_requests (protocol, client_account_id, contract_id, contact_id, title, description, origin, responsible_name, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [protocol, client_account_id, contract_id||null, contact_id||null, title, description, origin||'portal_cliente', responsible_name||null, session.identityId||null]
      );
      // gera oportunidade CRM com origem e responsável
      let crmOpportunityId = null;
      try {
        // tenta inserir em crm_opportunities se existir
        const crmRes = await pool.query(`SELECT to_regclass('crm_opportunities') as tbl`);
        if (crmRes.rows[0].tbl) {
          const opp = await pool.query(
            `INSERT INTO crm_opportunities (id, client_account_id, title, description, origin, responsible_name, status, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'aberta', NOW()) RETURNING id`,
            [client_account_id, `Serviço adicional: ${title}`, description, origin||'portal_cliente', responsible_name||null]
          );
          crmOpportunityId = opp.rows[0].id;
          await pool.query(`UPDATE cli_service_requests SET crm_opportunity_id=$2, status='convertida_crm' WHERE id=$1`, [rows[0].id, crmOpportunityId]);
        }
      } catch(e) { /* crm pode não existir, mantém solicitação */ }
      await auditLog({ action:"cli_service_request_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, origin, responsible: responsible_name, crm_opportunity_id: crmOpportunityId } });
      if (crmOpportunityId) await auditLog({ action:"cli_service_request_crm", actor: session.identityId||"unknown", target: rows[0].id, meta:{ crm_opportunity_id: crmOpportunityId } });
      const updated = await pool.query(`SELECT * FROM cli_service_requests WHERE id=$1`, [rows[0].id]);
      return json(res,201,{ serviceRequest: updated.rows[0], note:"solicitação gera oportunidade CRM origem responsável" });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  // CLI-11 satisfação pós-atendimento periódica plano ação risco renovação baseado em fatos
  async function handleSatisfactionSurveys(req, res) {
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
