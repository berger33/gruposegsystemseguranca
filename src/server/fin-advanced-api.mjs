function generateProtocol(prefix) {
  const d = new Date();
  const y = d.getFullYear().toString();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export function createFinAdvancedApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  async function ensureAuth(req, res, roles) {
    const session = requireSession(req);
    if (!session) { res.writeHead(401, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"unauthorized" })); return null; }
    if (roles && !requireRole(session, roles)) { res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"forbidden" })); return null; }
    if (!sameOrigin(req)) { res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"origin_forbidden" })); return null; }
    return session;
  }
  function json(res, code, obj) { res.writeHead(code, { "Content-Type":"application/json" }); res.end(JSON.stringify(obj)); }

  async function handleBankStatements(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM fin_bank_statements ORDER BY import_date DESC LIMIT 100`);
      return json(res,200,{ statements: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { source, file_name, file_url, storage_key, import_date, total_transactions, total_amount_cents } = body;
      if (!file_name || !file_url || !storage_key) return json(res,400,{ error:"missing_fields" });
      const protocol = generateProtocol("EXT-FIN");
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_bank_statements (protocol, source, file_name, file_url, storage_key, import_date, total_transactions, total_amount_cents, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [protocol, source||'extrato', file_name, file_url, storage_key, import_date||new Date().toISOString().slice(0,10), total_transactions||0, total_amount_cents||0, session.identityId||null]
        );
        await auditLog({ action:"fin_bank_statement_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, source } });
        return json(res,201,{ statement: rows[0] });
      } catch(e) {
        if (String(e.message).includes("duplicate")) return json(res,409,{ error:"duplicate_storage_key" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleBankTransactions(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const statementId = url.searchParams.get("statement_id");
      let q=`SELECT * FROM fin_bank_transactions WHERE 1=1`;
      const params=[]; let idx=1;
      if (statementId) { q+=` AND statement_id=$${idx++}`; params.push(statementId); }
      q+=` ORDER BY transaction_date DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ transactions: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { statement_id, transaction_date, amount_cents, description, bank_ref } = body;
      if (!statement_id || !transaction_date || amount_cents==null || !description || !bank_ref) return json(res,400,{ error:"missing_fields" });
      if (String(description).length <3 || String(description).length>500) return json(res,400,{ error:"description_3_500" });
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_bank_transactions (statement_id, transaction_date, amount_cents, description, bank_ref)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [statement_id, transaction_date, amount_cents, description, bank_ref]
        );
        await pool.query(`UPDATE fin_bank_statements SET total_transactions = total_transactions +1, total_amount_cents = total_amount_cents + $2 WHERE id=$1`, [statement_id, amount_cents]);
        await auditLog({ action:"fin_bank_transaction_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ bank_ref, amount_cents } });
        return json(res,201,{ transaction: rows[0], note:"evitar duplicar transações bank_ref UNIQUE" });
      } catch(e) {
        if (String(e.message).includes("duplicate") || String(e.message).includes("bank_ref")) return json(res,409,{ error:"duplicate_bank_ref", note:"evitar duplicar transações" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleConciliations(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      let q=`SELECT * FROM fin_conciliations WHERE 1=1`;
      const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ conciliations: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { receivable_id, payable_id, bank_transaction_id, source, suggestion_reason, amount_matched_cents } = body;
      if (!source) return json(res,400,{ error:"missing_source" });
      if (!receivable_id && !payable_id) return json(res,400,{ error:"missing_account_ref" });
      // evitar duplicar transações
      if (receivable_id && bank_transaction_id) {
        const dup = await pool.query(`SELECT id FROM fin_conciliations WHERE receivable_id=$1 AND bank_transaction_id=$2`, [receivable_id, bank_transaction_id]);
        if (dup.rows.length>0) return json(res,409,{ error:"already_conciliated", note:"evitar duplicar transações" });
      }
      if (payable_id && bank_transaction_id) {
        const dup = await pool.query(`SELECT id FROM fin_conciliations WHERE payable_id=$1 AND bank_transaction_id=$2`, [payable_id, bank_transaction_id]);
        if (dup.rows.length>0) return json(res,409,{ error:"already_conciliated", note:"evitar duplicar transações" });
      }
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_conciliations (receivable_id, payable_id, bank_transaction_id, source, status, suggested_by_identity, suggested_at, suggestion_reason, amount_matched_cents)
           VALUES ($1,$2,$3,$4,'sugerida',$5,NOW(),$6,$7) RETURNING *`,
          [receivable_id||null, payable_id||null, bank_transaction_id||null, source||'extrato', session.identityId||null, suggestion_reason||'Sugestão automática por valor/data', amount_matched_cents||null]
        );
        await auditLog({ action:"fin_conciliation_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ receivable_id, payable_id, bank_transaction_id, source } });
        return json(res,201,{ conciliation: rows[0], note:"conciliação por importação/extrato ou provedor sugestão evitar duplicar transações" });
      } catch(e) {
        if (String(e.message).includes("duplicate") || String(e.message).includes("unique")) return json(res,409,{ error:"duplicate_conciliation", note:"evitar duplicar" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, status, divergence_reason } = body;
      if (!id || !status) return json(res,400,{ error:"missing_fields" });
      const allowed = ['pendente','sugerida','conciliada','divergente','ignorada'];
      if (!allowed.includes(status)) return json(res,400,{ error:"invalid_status" });
      if (status==='divergente' && (!divergence_reason || String(divergence_reason).length <10)) return json(res,400,{ error:"divergence_reason_10_1000_required" });
      const cur = await pool.query(`SELECT * FROM fin_conciliations WHERE id=$1`, [id]);
      if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
      await pool.query(`UPDATE fin_conciliations SET status=$2, confirmed_by_identity=$3, confirmed_at=NOW(), divergence_reason=$4 WHERE id=$1`, [id, status, session.identityId||null, divergence_reason||null]);
      if (status==='conciliada' && cur.rows[0].bank_transaction_id) {
        await pool.query(`UPDATE fin_bank_transactions SET is_conciliated=true, conciliated_at=NOW() WHERE id=$1`, [cur.rows[0].bank_transaction_id]);
      }
      await auditLog({ action:"fin_conciliation_confirm", actor: session.identityId||"unknown", target: id, meta:{ status, divergence_reason } });
      const { rows } = await pool.query(`SELECT * FROM fin_conciliations WHERE id=$1`, [id]);
      return json(res,200,{ conciliation: rows[0], note:"confirmação conciliação" });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleCollectionPolicies(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM fin_collection_policies ORDER BY name ASC LIMIT 100`);
      return json(res,200,{ policies: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { name, description, rules } = body;
      if (!name || String(name).length <3 || String(name).length>200) return json(res,400,{ error:"name_3_200" });
      try {
        const { rows } = await pool.query(`INSERT INTO fin_collection_policies (name, description, rules) VALUES ($1,$2,$3) RETURNING *`, [name, description||null, rules? JSON.stringify(rules): null]);
        await auditLog({ action:"fin_collection_policy_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ name } });
        return json(res,201,{ policy: rows[0] });
      } catch(e) {
        if (String(e.message).includes("duplicate")) return json(res,409,{ error:"duplicate_name" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, is_approved, is_active } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      if (is_approved) {
        await pool.query(`UPDATE fin_collection_policies SET is_approved=true, approved_by_identity=$2, approved_at=NOW(), is_active=COALESCE($3,is_active) WHERE id=$1`, [id, session.identityId||null, is_active]);
        await auditLog({ action:"fin_collection_policy_approve", actor: session.identityId||"unknown", target: id, meta:{ is_approved:true } });
      } else if (is_active!=null) {
        await pool.query(`UPDATE fin_collection_policies SET is_active=$2 WHERE id=$1`, [id, is_active]);
      }
      const { rows } = await pool.query(`SELECT * FROM fin_collection_policies WHERE id=$1`, [id]);
      return json(res,200,{ policy: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleCollectionReminders(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const receivableId = url.searchParams.get("receivable_id");
      let q=`SELECT * FROM fin_collection_reminders WHERE 1=1`;
      const params=[]; let idx=1;
      if (receivableId) { q+=` AND receivable_id=$${idx++}`; params.push(receivableId); }
      q+=` ORDER BY due_date DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ reminders: rows, note:"sem mensagens reais ou bloqueio portal automático" });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { receivable_id, policy_id, responsible_name, due_date, reminder_type, content } = body;
      if (!receivable_id || !responsible_name || !due_date || !content) return json(res,400,{ error:"missing_fields" });
      if (String(content).length <20 || String(content).length>2000) return json(res,400,{ error:"content_20_2000" });
      // check policy approved
      if (policy_id) {
        const pol = await pool.query(`SELECT is_approved FROM fin_collection_policies WHERE id=$1`, [policy_id]);
        if (pol.rows.length>0 && !pol.rows[0].is_approved) return json(res,400,{ error:"policy_not_approved", note:"política aprovada obrigatória" });
      }
      const { rows } = await pool.query(
        `INSERT INTO fin_collection_reminders (receivable_id, policy_id, responsible_name, due_date, reminder_type, content, is_real_message)
         VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING *`,
        [receivable_id, policy_id||null, responsible_name, due_date, reminder_type||'notificacao_portal', content]
      );
      await pool.query(`INSERT INTO fin_collection_history (receivable_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [receivable_id, null, 'pendente', session.identityId||null, 'Criação lembrete cobrança']);
      await auditLog({ action:"fin_collection_reminder_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ receivable_id, responsible: responsible_name, reminder_type } });
      return json(res,201,{ reminder: rows[0], note:"cobrança com responsável lembretes histórico política aprovada sem mensagens reais" });
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, status, reason } = body;
      if (!id || !status) return json(res,400,{ error:"missing_fields" });
      if (!reason || String(reason).length <10) return json(res,400,{ error:"reason_10_1000_required" });
      const cur = await pool.query(`SELECT * FROM fin_collection_reminders WHERE id=$1`, [id]);
      if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
      const prev = cur.rows[0];
      await pool.query(`UPDATE fin_collection_reminders SET status=$2, sent_at=CASE WHEN $2='lembrete_enviado' THEN NOW() ELSE sent_at END WHERE id=$1`, [id, status]);
      await pool.query(`INSERT INTO fin_collection_history (receivable_id, previous_status, next_status, changed_by_identity, reason) VALUES ($1,$2,$3,$4,$5)`, [prev.receivable_id, prev.status, status, session.identityId||null, reason]);
      await auditLog({ action:"fin_collection_reminder_send", actor: session.identityId||"unknown", target: id, meta:{ previous: prev.status, next: status, reason, note:"sem mensagens reais sem bloqueio automático" } });
      const { rows } = await pool.query(`SELECT * FROM fin_collection_reminders WHERE id=$1`, [id]);
      return json(res,200,{ reminder: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleCollectionHistory(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const receivableId = url.searchParams.get("receivable_id");
    if (!receivableId) return json(res,400,{ error:"missing_receivable_id" });
    const { rows } = await pool.query(`SELECT * FROM fin_collection_history WHERE receivable_id=$1 ORDER BY created_at DESC`, [receivableId]);
    return json(res,200,{ history: rows });
  }

  async function handleCashflowSnapshots(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM fin_cashflow_snapshots ORDER BY competence_date DESC LIMIT 100`);
      return json(res,200,{ snapshots: rows, note:"fluxo caixa previsto/realizado vencidos próximos pagamentos aging" });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { competence_date, cashflow_type, total_receivable_cents, total_payable_cents, vencidos_cents, proximos_pagamentos_cents, notes } = body;
      if (!competence_date) return json(res,400,{ error:"missing_competence_date" });
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_cashflow_snapshots (competence_date, cashflow_type, total_receivable_cents, total_payable_cents, vencidos_cents, proximos_pagamentos_cents, notes, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [competence_date, cashflow_type||'previsto', total_receivable_cents||0, total_payable_cents||0, vencidos_cents||0, proximos_pagamentos_cents||0, notes||null, session.identityId||null]
        );
        await auditLog({ action:"fin_cashflow_snapshot_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ competence_date, cashflow_type } });
        return json(res,201,{ snapshot: rows[0] });
      } catch(e) {
        if (String(e.message).includes("duplicate") || String(e.message).includes("unique")) return json(res,409,{ error:"duplicate_competence_type", note:"previsto/realizado por competência único" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleAgingReceivables(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const bucket = url.searchParams.get("bucket");
      let q=`SELECT ar.*, r.due_date, r.amount_cents as receivable_amount FROM fin_aging_receivables ar JOIN fin_accounts_receivable r ON r.id=ar.receivable_id WHERE 1=1`;
      const params=[]; let idx=1;
      if (bucket) { q+=` AND ar.bucket=$${idx++}`; params.push(bucket); }
      q+=` ORDER BY ar.due_date ASC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ aging: rows, note:"aging recebíveis vencidos próximos" });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { receivable_id, client_account_id, competence_date, due_date, amount_cents } = body;
      if (!receivable_id || !client_account_id || !competence_date || !due_date || amount_cents==null) return json(res,400,{ error:"missing_fields" });
      // Aging é um snapshot da competência, não do relógio atual: alinhar ao campo gerado no SQL.
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
      const competence = dateOnly.test(competence_date) ? new Date(`${competence_date}T00:00:00Z`) : null;
      const due = dateOnly.test(due_date) ? new Date(`${due_date}T00:00:00Z`) : null;
      if (!competence || !due || Number.isNaN(competence.getTime()) || Number.isNaN(due.getTime()) ||
          competence.toISOString().slice(0, 10) !== competence_date || due.toISOString().slice(0, 10) !== due_date) {
        return json(res,400,{ error:"invalid_date" });
      }
      const diffDays = Math.round((competence.getTime() - due.getTime())/(1000*60*60*24));
      let bucket='a_vencer';
      if (diffDays <=0) bucket='a_vencer';
      else if (diffDays <=30) bucket='vencido_0_30';
      else if (diffDays <=60) bucket='vencido_31_60';
      else if (diffDays <=90) bucket='vencido_61_90';
      else bucket='vencido_90_plus';
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_aging_receivables (receivable_id, client_account_id, bucket, amount_cents, competence_date, due_date)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [receivable_id, client_account_id, bucket, amount_cents, competence_date, due_date]
        );
        await auditLog({ action:"fin_aging_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ receivable_id, bucket, days_overdue: diffDays } });
        return json(res,201,{ aging: rows[0], note:"aging recebíveis vencidos próximos pagamentos" });
      } catch(e) {
        if (String(e.message).includes("duplicate") || String(e.message).includes("unique")) return json(res,409,{ error:"already_aged" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleCostImports(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM fin_cost_imports ORDER BY competence_date DESC LIMIT 100`);
      return json(res,200,{ imports: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { source, file_name, file_url, storage_key, competence_date, total_costs_cents, total_records } = body;
      if (!source || !file_name || !file_url || !storage_key || !competence_date) return json(res,400,{ error:"missing_fields" });
      const protocol = generateProtocol("COST-IMP");
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_cost_imports (protocol, source, file_name, file_url, storage_key, competence_date, total_costs_cents, total_records, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [protocol, source, file_name, file_url, storage_key, competence_date, total_costs_cents||0, total_records||0, session.identityId||null]
        );
        await auditLog({ action:"fin_cost_import_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, source, competence_date } });
        return json(res,201,{ import: rows[0], note:"importação custos pessoal equipamentos materiais supervisão rateio documentado" });
      } catch(e) {
        if (String(e.message).includes("duplicate")) return json(res,409,{ error:"duplicate_storage_key" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleCosts(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const contractId = url.searchParams.get("contract_id");
      const accountId = url.searchParams.get("client_account_id");
      const postId = url.searchParams.get("post_id");
      let q=`SELECT * FROM fin_costs WHERE 1=1`;
      const params=[]; let idx=1;
      if (contractId) { q+=` AND contract_id=$${idx++}`; params.push(contractId); }
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      if (postId) { q+=` AND post_id=$${idx++}`; params.push(postId); }
      q+=` ORDER BY competence_date DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ costs: rows, note:"custo por cliente/contrato/posto rateio documentado" });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { import_id, client_account_id, contract_id, post_id, cost_source, competence_date, amount_cents, description, source_employee_id, source_equipment_id, source_material, supervision_id, rateio_rule, rateio_percent } = body;
      if (!cost_source || !competence_date || amount_cents==null || !description || !rateio_rule || rateio_percent==null) return json(res,400,{ error:"missing_fields" });
      if (String(description).length <10 || String(description).length>1000) return json(res,400,{ error:"description_10_1000" });
      if (String(rateio_rule).length <10 || String(rateio_rule).length>1000) return json(res,400,{ error:"rateio_rule_10_1000_required", note:"rateio documentado obrigatório" });
      if (rateio_percent <0 || rateio_percent>100) return json(res,400,{ error:"rateio_percent_0_100" });
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_costs (import_id, client_account_id, contract_id, post_id, cost_source, competence_date, amount_cents, description, source_employee_id, source_equipment_id, source_material, supervision_id, rateio_rule, rateio_percent, rateio_documented, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,$15) RETURNING *`,
          [import_id||null, client_account_id||null, contract_id||null, post_id||null, cost_source, competence_date, amount_cents, description, source_employee_id||null, source_equipment_id||null, source_material||null, supervision_id||null, rateio_rule, rateio_percent, session.identityId||null]
        );
        await auditLog({ action:"fin_cost_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ cost_source, contract_id, post_id, amount_cents, rateio_rule, rateio_percent } });
        return json(res,201,{ cost: rows[0], note:"custo por cliente/contrato/posto importação pessoal equipamentos materiais supervisão rateio documentado" });
      } catch(e) { return json(res,500,{ error:"internal", detail:e.message }); }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  return {
    handleBankStatements,
    handleBankTransactions,
    handleConciliations,
    handleCollectionPolicies,
    handleCollectionReminders,
    handleCollectionHistory,
    handleCashflowSnapshots,
    handleAgingReceivables,
    handleCostImports,
    handleCosts,
  };
}
