export function createAdmApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const generateProtocol = (prefix) => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const rnd = Math.random().toString(36).substring(2,6).toUpperCase();
    return `${prefix}-${y}${m}${day}-${rnd}`;
  };
  const getSession = async (req) => { try { return await requireSession(req); } catch { return null; } };
  const checkAuth = async (req, res) => {
    const sess = await getSession(req);
    if (!sess) { res.writeHead(401, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return null; }
    const r = (sess.role||'').toLowerCase();
    if (!['admin','ti','marcelo','financeiro','finance'].includes(r) && r!=='admin') {
      // allow admin/ti only for ADM
      if (r!=='admin' && r!=='ti') {
        res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return null;
      }
    }
    return sess;
  };
  const readJson = async (req) => new Promise((resolve, reject) => {
    let data=''; req.on('data', c=> data+=c); req.on('end', ()=> { try { resolve(data?JSON.parse(data):{}); } catch(e){ reject(e); } });
  });

  // ADM-01..06: as listas abaixo existem porque o enum e as CHECK constraints do
  // PostgreSQL devolviam 500 e o corpo vazava a mensagem SQL para o navegador
  // (`invalid input value for enum ...`, `violates check constraint ...`).
  // Validar antes de escrever mantém exatamente as mesmas escritas e troca a
  // falha interna por uma recusa explícita, traduzida pela tela.
  const TASK_STATUSES = new Set(['pendente','em_andamento','concluida','cancelada']);
  const TASK_PRIORITIES = new Set(['baixa','media','alta','critica']);
  const SOURCE_MODULES = new Set(['crm','con','hr','ops','fin','cli','plt','adm','outro']);
  const APPROVAL_TYPES = new Set(['desconto','compra','despesa','excecao','outro']);
  const APPROVAL_STATUSES = new Set(['pendente','aprovado','rejeitado','cancelado']);
  const RISK_LEVELS = new Set(['baixo','medio','alto','critico']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
  const cleanText = (value) => typeof value === 'string' ? value.trim() : '';
  const textInRange = (value, min, max) => typeof value === 'string' && value.length >= min && value.length <= max;
  const send400 = (res, error) => { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error})); };

  // ADM-01 meu dia
  const handleMyDay = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      const priority = url.searchParams.get('priority');
      const responsible = url.searchParams.get('responsible_identity');
      const source = url.searchParams.get('source_module');
      let q = `SELECT * FROM adm_my_day_items WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      if (priority) { q+=` AND priority=$${idx++}`; params.push(priority); }
      if (responsible) { q+=` AND responsible_identity=$${idx++}`; params.push(responsible); }
      if (source) { q+=` AND source_module=$${idx++}`; params.push(source); }
      q+=` ORDER BY CASE priority WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END, due_date ASC NULLS LAST, created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ items: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const title = (body.title||'').trim();
      const description = (body.description||'').trim();
      const priority = body.priority || 'media';
      const responsible_name = (body.responsible_name||'').trim();
      const responsible_identity = body.responsible_identity || sess.identityId || null;
      const action_type = (body.action_type||'').trim();
      const action_ref_id = body.action_ref_id || null;
      const action_url = body.action_url || null;
      const due_date = body.due_date || null;
      const source_module = body.source_module || 'adm';
      if (!title || title.length<5 || title.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_5_200'})); return; }
      if (!description || description.length<10 || description.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_10_1000'})); return; }
      if (!responsible_name || responsible_name.length<2 || responsible_name.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'responsible_name_2_200'})); return; }
      if (!action_type || action_type.length<3 || action_type.length>100) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'action_type_3_100'})); return; }
      if (priority !== undefined && priority !== null && !TASK_PRIORITIES.has(priority)) return send400(res, 'invalid_priority');
      if (!SOURCE_MODULES.has(source_module)) return send400(res, 'invalid_source_module');
      if (body.due_date !== undefined && body.due_date !== null && body.due_date !== '' && !isIsoDate(body.due_date)) return send400(res, 'invalid_due_date');
      if (body.status !== undefined && body.status !== null && !TASK_STATUSES.has(body.status)) return send400(res, 'invalid_status');
      try {
        const { rows } = await pool.query(
          `INSERT INTO adm_my_day_items (title, description, priority, responsible_name, responsible_identity, action_type, action_ref_id, action_url, due_date, source_module, is_real_pending, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11) RETURNING *`,
          [title, description, priority, responsible_name, responsible_identity, action_type, action_ref_id, action_url, due_date, source_module, sess.identityId||null]
        );
        try { await auditLog({ action:'adm_my_day_create', actor: sess.identityId, target: rows[0].id, meta:{ title, priority, responsible_name, source_module, is_real_pending:true } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ item: rows[0], note:'painel_meu_dia_pendencias_reais_prioridade_responsavel_acao' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      // Antes da validação, um valor fora do enum virava 500 com a mensagem SQL
      // no corpo. A escrita continua exatamente a mesma para valores aceitos.
      if (body.status !== undefined && body.status !== null && !TASK_STATUSES.has(body.status)) return send400(res, 'invalid_status');
      if (body.priority !== undefined && body.priority !== null && !TASK_PRIORITIES.has(body.priority)) return send400(res, 'invalid_priority');
      if (body.responsible_name !== undefined && body.responsible_name !== null && !textInRange(cleanText(body.responsible_name), 2, 200)) return send400(res, 'responsible_name_2_200');
      if (body.description !== undefined && body.description !== null && !textInRange(cleanText(body.description), 10, 1000)) return send400(res, 'description_10_1000');
      if (body.due_date !== undefined && body.due_date !== null && body.due_date !== '' && !isIsoDate(body.due_date)) return send400(res, 'invalid_due_date');
      try {
        const { rows } = await pool.query(
          `UPDATE adm_my_day_items SET status=COALESCE($1::adm_task_status,status), priority=COALESCE($2::adm_priority,priority), responsible_name=COALESCE($3,responsible_name), description=COALESCE($4,description), due_date=COALESCE($5::date,due_date), updated_at=NOW() WHERE id=$6 RETURNING *`,
          [body.status||null, body.priority||null, cleanText(body.responsible_name)||null, cleanText(body.description)||null, body.due_date||null, id]
        );
        if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        try { await auditLog({ action:'adm_my_day_update', actor: sess.identityId, target: id, meta:{ status: body.status, priority: body.priority } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ item: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // ADM-02 comercial
  const handleCommercialSnapshots = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM adm_commercial_snapshots ORDER BY snapshot_date DESC LIMIT 200`);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ snapshots: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const snapshot_date = body.snapshot_date || new Date().toISOString().slice(0,10);
      const new_leads = body.new_leads_count ?? 0;
      const stalled = body.stalled_opportunities_count ?? 0;
      const proposals = body.proposals_count ?? 0;
      const next_actions = body.next_actions || [];
      const total_value = body.total_value_cents ?? 0;
      const notes = (body.notes||'').trim() || null;
      if (notes && (notes.length<10 || notes.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'notes_10_1000'})); return; }
      try {
        const dup = await pool.query(`SELECT id FROM adm_commercial_snapshots WHERE snapshot_date=$1`, [snapshot_date]);
        if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_snapshot_date'})); return; }
        const { rows } = await pool.query(
          `INSERT INTO adm_commercial_snapshots (snapshot_date, new_leads_count, stalled_opportunities_count, proposals_count, next_actions, total_value_cents, notes, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [snapshot_date, new_leads, stalled, proposals, JSON.stringify(next_actions), total_value, notes, sess.identityId||null]
        );
        try { await auditLog({ action:'adm_commercial_snapshot_create', actor: sess.identityId, target: rows[0].id, meta:{ snapshot_date, new_leads, stalled, proposals } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ snapshot: rows[0], note:'visao_comercial_leads_novos_oportunidades_paradas_propostas_proximas_acoes' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate', details:e.detail})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message}));
      }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // ADM-03 operacional
  const handleOperationalSnapshots = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM adm_operational_snapshots ORDER BY snapshot_date DESC LIMIT 200`);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ snapshots: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const snapshot_date = body.snapshot_date || new Date().toISOString().slice(0,10);
      const req_hours = body.coverage_required_hours ?? 0;
      const cov_hours = body.coverage_covered_hours ?? 0;
      const critical = body.critical_occurrences_count ?? 0;
      const sla_breach = body.sla_breach_count ?? 0;
      const impl_pending = body.implantation_pending_count ?? 0;
      const notes = (body.notes||'').trim() || null;
      if (notes && (notes.length<10 || notes.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'notes_10_1000'})); return; }
      try {
        const dup = await pool.query(`SELECT id FROM adm_operational_snapshots WHERE snapshot_date=$1`, [snapshot_date]);
        if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_snapshot_date'})); return; }
        const { rows } = await pool.query(
          `INSERT INTO adm_operational_snapshots (snapshot_date, coverage_required_hours, coverage_covered_hours, critical_occurrences_count, sla_breach_count, implantation_pending_count, notes, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [snapshot_date, req_hours, cov_hours, critical, sla_breach, impl_pending, notes, sess.identityId||null]
        );
        try { await auditLog({ action:'adm_operational_snapshot_create', actor: sess.identityId, target: rows[0].id, meta:{ snapshot_date, req_hours, cov_hours, critical, sla_breach } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ snapshot: rows[0], note:'visao_operacional_cobertura_ocorrencias_criticas_SLA_implantacao' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate', details:e.detail})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message}));
      }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // ADM-04 financeiro
  const handleFinancialSnapshots = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const competence = url.searchParams.get('competence_date');
      let q = `SELECT * FROM adm_financial_snapshots WHERE 1=1`; const params=[]; let idx=1;
      if (competence) { q+=` AND competence_date=$${idx++}`; params.push(competence); }
      q+=` ORDER BY competence_date DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ snapshots: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const competence_date = body.competence_date;
      const source = (body.source||'geral').trim();
      const total_receivables = body.total_receivables_cents ?? 0;
      const total_payables = body.total_payables_cents ?? 0;
      const overdue = body.overdue_cents ?? 0;
      const upcoming = body.upcoming_cents ?? 0;
      const margin_by_contract = body.margin_by_contract || {};
      const notes = (body.notes||'').trim() || null;
      if (!competence_date) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'competence_date_required'})); return; }
      if (!source || source.length<3 || source.length>100) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'source_3_100'})); return; }
      if (notes && (notes.length<10 || notes.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'notes_10_1000'})); return; }
      try {
        const dup = await pool.query(`SELECT id FROM adm_financial_snapshots WHERE competence_date=$1 AND source=$2`, [competence_date, source]);
        if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_competence_source'})); return; }
        const { rows } = await pool.query(
          `INSERT INTO adm_financial_snapshots (competence_date, source, total_receivables_cents, total_payables_cents, overdue_cents, upcoming_cents, margin_by_contract, notes, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [competence_date, source, total_receivables, total_payables, overdue, upcoming, JSON.stringify(margin_by_contract), notes, sess.identityId||null]
        );
        try { await auditLog({ action:'adm_financial_snapshot_create', actor: sess.identityId, target: rows[0].id, meta:{ competence_date, source, total_receivables, total_payables } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ snapshot: rows[0], note:'visao_financeira_fonte_competencia_saldo_vencimentos_margem_por_contrato' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate', details:e.detail})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message}));
      }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // ADM-05 renewal risks
  const handleRenewalRisks = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const risk_level = url.searchParams.get('risk_level');
      const contract_id = url.searchParams.get('contract_id');
      let q = `SELECT * FROM adm_renewal_risks WHERE 1=1`; const params=[]; let idx=1;
      if (risk_level) { q+=` AND risk_level=$${idx++}`; params.push(risk_level); }
      if (contract_id) { q+=` AND contract_id=$${idx++}`; params.push(contract_id); }
      q+=` ORDER BY renewal_date ASC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ risks: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const contract_id = body.contract_id || null;
      const client_account_id = body.client_account_id || null;
      const renewal_date = body.renewal_date;
      const risk_level = body.risk_level || 'medio';
      const risk_score = body.risk_score ?? 0;
      const justification = (body.justification||'').trim();
      const reincidence_count = body.reincidence_count ?? 0;
      const is_justified = body.is_justified === true;
      const facts_json = body.facts_json || {};
      if (!renewal_date) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'renewal_date_required'})); return; }
      if (!isIsoDate(renewal_date)) return send400(res, 'invalid_renewal_date');
      if (!justification || justification.length<10 || justification.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'justification_10_1000_required_risco_perda_justificado'})); return; }
      if (!RISK_LEVELS.has(risk_level)) return send400(res, 'invalid_risk_level');
      if (risk_score <0 || risk_score>100) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'risk_score_0_100'})); return; }
      if (!isCount(reincidence_count)) return send400(res, 'invalid_reincidence_count');
      if (contract_id !== null && contract_id !== undefined && !UUID_RE.test(contract_id)) return send400(res, 'invalid_contract_id');
      if (client_account_id !== null && client_account_id !== undefined && !UUID_RE.test(client_account_id)) return send400(res, 'invalid_client_account_id');
      if (is_justified && justification.length<10) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'justification_required_when_justified'})); return; }
      try {
        const { rows } = await pool.query(
          `INSERT INTO adm_renewal_risks (contract_id, client_account_id, renewal_date, risk_level, risk_score, justification, reincidence_count, is_justified, facts_json, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [contract_id, client_account_id, renewal_date, risk_level, risk_score, justification, reincidence_count, is_justified, JSON.stringify(facts_json), sess.identityId||null]
        );
        try { await auditLog({ action:'adm_renewal_risk_create', actor: sess.identityId, target: rows[0].id, meta:{ contract_id, renewal_date, risk_level, risk_score, is_justified, facts_json } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ risk: rows[0], note:'contratos_proximos_renovar_reclamacoes_reincidentes_risco_perda_justificado_facts_json' }));
      } catch(e){ if (e.code==='23503') { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_reference'})); return; } res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      // Idem ao meu dia: sem validação o PostgreSQL devolvia 500 com a mensagem
      // SQL no corpo (`invalid input value for enum adm_renewal_risk_level`,
      // `violates check constraint adm_renewal_risks_risk_score_check`).
      if (body.risk_level !== undefined && body.risk_level !== null && !RISK_LEVELS.has(body.risk_level)) return send400(res, 'invalid_risk_level');
      if (body.risk_score !== undefined && body.risk_score !== null && !(typeof body.risk_score === 'number' && body.risk_score >= 0 && body.risk_score <= 100)) return send400(res, 'risk_score_0_100');
      if (body.justification !== undefined && body.justification !== null && !textInRange(cleanText(body.justification), 10, 1000)) return send400(res, 'justification_10_1000_required_risco_perda_justificado');
      if (body.reincidence_count !== undefined && body.reincidence_count !== null && !isCount(body.reincidence_count)) return send400(res, 'invalid_reincidence_count');
      try {
        const { rows } = await pool.query(
          `UPDATE adm_renewal_risks SET risk_level=COALESCE($1::adm_renewal_risk_level,risk_level), risk_score=COALESCE($2,risk_score), justification=COALESCE($3,justification), reincidence_count=COALESCE($4,reincidence_count), is_justified=COALESCE($5,is_justified), facts_json=COALESCE($6,facts_json), updated_at=NOW() WHERE id=$7 RETURNING *`,
          [body.risk_level||null, body.risk_score??null, cleanText(body.justification)||null, body.reincidence_count??null, body.is_justified!=null?body.is_justified:null, body.facts_json?JSON.stringify(body.facts_json):null, id]
        );
        if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        try { await auditLog({ action:'adm_renewal_risk_update', actor: sess.identityId, target: id, meta:{ risk_level: body.risk_level, risk_score: body.risk_score, is_justified: body.is_justified } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ risk: rows[0] }));
      } catch(e){ if (e.code==='23503') { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_reference'})); return; } res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // ADM-06 aprovação unificada
  const handleApprovals = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      const approval_type = url.searchParams.get('approval_type');
      let q = `SELECT * FROM adm_approvals WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      if (approval_type) { q+=` AND approval_type=$${idx++}`; params.push(approval_type); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ approvals: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const approval_type = body.approval_type || 'outro';
      const reference_id = body.reference_id || null;
      const reference_type = body.reference_type || null;
      const amount_cents = body.amount_cents ?? null;
      const threshold_cents = body.threshold_cents ?? null;
      const requester_name = (body.requester_name||'').trim();
      const requester_identity = body.requester_identity || sess.identityId || null;
      const scope = (body.scope||'').trim() || null;
      const reason = (body.reason||'').trim() || null;
      if (!requester_name || requester_name.length<2 || requester_name.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'requester_name_2_200'})); return; }
      if (reason && (reason.length<10 || reason.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reason_10_1000'})); return; }
      if (scope && (scope.length<3 || scope.length>200)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'scope_3_200'})); return; }
      if (!APPROVAL_TYPES.has(approval_type)) return send400(res, 'invalid_approval_type');
      if (amount_cents !== null && amount_cents !== undefined && !(Number.isSafeInteger(amount_cents) && amount_cents >= 0)) return send400(res, 'amount_cents_gte_0');
      if (threshold_cents !== null && threshold_cents !== undefined && !(Number.isSafeInteger(threshold_cents) && threshold_cents >= 0)) return send400(res, 'threshold_cents_gte_0');
      // A criação não recebe aprovador: a constraint `adm_approval_scope_check`
      // exige `approver_identity` quando o valor passa da alçada. Sem esta
      // recusa, o INSERT devolvia 500 com a mensagem SQL no corpo. O aprovador é
      // registrado na decisão (PATCH), que já aplica a mesma regra.
      if (amount_cents && threshold_cents && amount_cents > threshold_cents) return send400(res, 'approver_required_above_threshold_alcada');
      if (reference_id !== null && reference_id !== undefined && !UUID_RE.test(reference_id)) return send400(res, 'invalid_reference_id');
      if (reference_type !== null && reference_type !== undefined && !textInRange(String(reference_type).trim(), 3, 100)) return send400(res, 'invalid_reference_type');
      const protocol = generateProtocol('APR-ADM');
      try {
        const { rows } = await pool.query(
          `INSERT INTO adm_approvals (protocol, approval_type, reference_id, reference_type, amount_cents, threshold_cents, requester_name, requester_identity, scope, reason, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [protocol, approval_type, reference_id, reference_type, amount_cents, threshold_cents, requester_name, requester_identity, scope, reason, sess.identityId||null]
        );
        await pool.query(
          `INSERT INTO adm_approval_history (approval_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason)
           VALUES ($1,NULL,$2,NULL,$3,$4,$5)`,
          [rows[0].id, 'pendente', amount_cents, sess.identityId||null, reason||'Criação aprovação unificada descontos compras despesas exceções alçadas']
        );
        try { await auditLog({ action:'adm_approval_create', actor: sess.identityId, target: rows[0].id, meta:{ protocol, approval_type, amount_cents, threshold_cents, scope } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ approval: rows[0], note:'aprovacao_unificada_descontos_compras_despesas_excecoes_alcadas_valor_escopo' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate', details:e.detail})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message}));
      }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      const status = body.status;
      const reason = (body.reason||'').trim();
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      if (!reason || reason.length<10 || reason.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reason_10_1000_required'})); return; }
      if (!status) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'status_required'})); return; }
      // Sem esta validação o valor ia direto para o enum e o PostgreSQL
      // devolvia 500 (`invalid input value for enum adm_approval_status`).
      if (!APPROVAL_STATUSES.has(status)) return send400(res, 'invalid_status');
      if (body.approver_name !== undefined && body.approver_name !== null && !textInRange(cleanText(body.approver_name), 2, 200)) return send400(res, 'approver_name_2_200');
      if (body.approver_identity !== undefined && body.approver_identity !== null && !UUID_RE.test(body.approver_identity)) return send400(res, 'invalid_approver_identity');
      try {
        const existing = await pool.query(`SELECT * FROM adm_approvals WHERE id=$1`, [id]);
        if (!existing.rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        const prev = existing.rows[0];
        if (prev.requester_identity && body.approver_identity && prev.requester_identity===body.approver_identity) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'requester_approver_must_differ_segregacao'})); return; }
        if (prev.amount_cents && prev.threshold_cents && prev.amount_cents > prev.threshold_cents && status==='aprovado' && !body.approver_identity && !prev.approver_identity) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'approver_required_above_threshold_alcada'})); return; }

        // `$1` precisa do molde explícito do enum: sem ele o PostgreSQL não
        // deduzia o tipo do parâmetro (usado em `status=$1` e no `CASE WHEN`)
        // e toda decisão de aprovação devolvia 500 — nenhuma transição saía.
        const { rows } = await pool.query(
          `UPDATE adm_approvals SET status=$1::adm_approval_status, approver_name=COALESCE($2,approver_name), approver_identity=COALESCE($3::uuid,approver_identity), approved_at=CASE WHEN $1::adm_approval_status='aprovado' THEN NOW() ELSE approved_at END, approved_by_identity=CASE WHEN $1::adm_approval_status='aprovado' THEN $4::uuid ELSE approved_by_identity END, rejection_reason=CASE WHEN $1::adm_approval_status='rejeitado' THEN $5::text ELSE rejection_reason END, reason=COALESCE($6::text,reason), updated_at=NOW() WHERE id=$7 RETURNING *`,
          [status, cleanText(body.approver_name)||null, body.approver_identity||null, sess.identityId||null, status==='rejeitado'?reason:null, reason, id]
        );
        await pool.query(
          `INSERT INTO adm_approval_history (approval_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason)
           VALUES ($1,$2,$3::adm_approval_status,$4,$5,$6,$7)`,
          [id, prev.status, status, prev.amount_cents, rows[0].amount_cents, sess.identityId||null, reason]
        );
        try { await auditLog({ action: status==='aprovado'?'adm_approval_approve':'adm_approval_status', actor: sess.identityId, target: id, meta:{ status, reason, approval_type: prev.approval_type } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ approval: rows[0] }));
      } catch(e){ if (e.code==='23503') { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_approver_or_reference'})); return; } res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleApprovalHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const approval_id = url.searchParams.get('approval_id');
    let q = `SELECT * FROM adm_approval_history WHERE 1=1`; const params=[]; let idx=1;
    if (approval_id) { q+=` AND approval_id=$${idx++}`; params.push(approval_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ history: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
  };

  return {
    handleMyDay,
    handleCommercialSnapshots,
    handleOperationalSnapshots,
    handleFinancialSnapshots,
    handleRenewalRisks,
    handleApprovals,
    handleApprovalHistory,
  };
}
