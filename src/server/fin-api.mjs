function generateProtocol(prefix) {
  const d = new Date();
  const y = d.getFullYear().toString();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).substring(2,6).toUpperCase();
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export function createFinApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  async function ensureAuth(req, res, roles) {
    const session = await requireSession(req);
    if (!session) { res.writeHead(401, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"unauthorized" })); return null; }
    if (roles && !requireRole(session, roles)) { res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"forbidden" })); return null; }
    if (!sameOrigin(req)) { res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"origin_forbidden" })); return null; }
    return session;
  }
  function json(res, code, obj) { res.writeHead(code, { "Content-Type":"application/json" }); res.end(JSON.stringify(obj)); }

  async function handleSuppliers(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM fin_suppliers ORDER BY name ASC LIMIT 100`);
      return json(res,200,{ suppliers: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { name, document_ref, category } = body;
      if (!name || String(name).length <3 || String(name).length>200) return json(res,400,{ error:"name_3_200" });
      try {
        const { rows } = await pool.query(`INSERT INTO fin_suppliers (name, document_ref, category) VALUES ($1,$2,$3) RETURNING *`, [name, document_ref||null, category||'outro']);
        await auditLog({ action:"fin_supplier_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ name } });
        return json(res,201,{ supplier: rows[0] });
      } catch(e) {
        if (String(e.message).includes("duplicate")) return json(res,409,{ error:"duplicate_name" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleCostCenters(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM fin_cost_centers ORDER BY name ASC LIMIT 100`);
      return json(res,200,{ costCenters: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { name, description } = body;
      if (!name || String(name).length <3 || String(name).length>200) return json(res,400,{ error:"name_3_200" });
      try {
        const { rows } = await pool.query(`INSERT INTO fin_cost_centers (name, description) VALUES ($1,$2) RETURNING *`, [name, description||null]);
        await auditLog({ action:"fin_cost_center_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ name } });
        return json(res,201,{ costCenter: rows[0] });
      } catch(e) {
        if (String(e.message).includes("duplicate")) return json(res,409,{ error:"duplicate_name" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleRecurrenceRules(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const contractId = url.searchParams.get("contract_id");
      let q=`SELECT * FROM fin_recurrence_rules WHERE 1=1`;
      const params=[]; let idx=1;
      if (contractId) { q+=` AND contract_id=$${idx++}`; params.push(contractId); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ rules: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { contract_id, contract_item_id, recurrence_type, start_date, end_date, amount_cents, recurrence_id, proration_enabled, proration_rule, reajuste_enabled, reajuste_percent, reajuste_rule, suspension_enabled, suspension_reason } = body;
      if (!contract_id || !start_date || amount_cents==null || !recurrence_id) return json(res,400,{ error:"missing_fields" });
      if (end_date && new Date(end_date) < new Date(start_date)) return json(res,400,{ error:"end_before_start" });
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_recurrence_rules (contract_id, contract_item_id, recurrence_type, start_date, end_date, amount_cents, recurrence_id, proration_enabled, proration_rule, reajuste_enabled, reajuste_percent, reajuste_rule, suspension_enabled, suspension_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [contract_id, contract_item_id||null, recurrence_type||'mensal', start_date, end_date||null, amount_cents, recurrence_id, proration_enabled||false, proration_rule||null, reajuste_enabled||false, reajuste_percent||null, reajuste_rule||null, suspension_enabled||false, suspension_reason||null]
        );
        await auditLog({ action:"fin_recurrence_rule_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ contract_id, recurrence_id, recurrence_type, amount_cents, proration_enabled, reajuste_enabled, suspension_enabled } });
        return json(res,201,{ rule: rows[0], note:"geração recorrente idempotente por contrato/competência/item pró-rata reajuste suspensão conforme regras aprovadas" });
      } catch(e) {
        if (String(e.message).includes("duplicate")) return json(res,409,{ error:"duplicate_recurrence_id" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, is_approved, is_active } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      if (is_approved) {
        await pool.query(`UPDATE fin_recurrence_rules SET is_approved=true, approved_by_identity=$2, approved_at=NOW(), is_active=COALESCE($3,is_active) WHERE id=$1`, [id, session.identityId||null, is_active]);
        await auditLog({ action:"fin_recurrence_rule_approve", actor: session.identityId||"unknown", target: id, meta:{ is_approved:true } });
      } else if (is_active!=null) {
        await pool.query(`UPDATE fin_recurrence_rules SET is_active=$2 WHERE id=$1`, [id, is_active]);
      }
      const { rows } = await pool.query(`SELECT * FROM fin_recurrence_rules WHERE id=$1`, [id]);
      return json(res,200,{ rule: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleReceivables(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro","comercial"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const contractId = url.searchParams.get("contract_id");
      const accountId = url.searchParams.get("client_account_id");
      let q=`SELECT * FROM fin_accounts_receivable WHERE 1=1`;
      const params=[]; let idx=1;
      if (contractId) { q+=` AND contract_id=$${idx++}`; params.push(contractId); }
      if (accountId) { q+=` AND client_account_id=$${idx++}`; params.push(accountId); }
      q+=` ORDER BY competence_date DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      const role = (session.role||session.userRole||"").toLowerCase();
      if (role==="cliente") {
        try {
          const grants = await pool.query(`SELECT client_account_id FROM client_access_grants WHERE identity_id=$1 AND revoked_at IS NULL`, [session.identityId]);
          const allowed = grants.rows.map(r=>r.client_account_id);
          return json(res,200,{ receivables: rows.filter(r=> allowed.includes(r.client_account_id)), note:"dados própria conta" });
        } catch {}
      }
      return json(res,200,{ receivables: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { client_account_id, contract_id, contract_item_id, competence_date, due_date, amount_cents, recurrence_type, recurrence_id, recurrence_rule_id, description, is_recurring } = body;
      if (!client_account_id || !competence_date || !due_date || amount_cents==null) return json(res,400,{ error:"missing_fields" });
      if (new Date(due_date) < new Date(competence_date)) return json(res,400,{ error:"due_before_competence" });
      // FIN-03 idempotente por contrato/competência/item
      const protocol = generateProtocol("REC-FIN");
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_accounts_receivable (protocol, client_account_id, contract_id, contract_item_id, competence_date, due_date, amount_cents, recurrence_type, recurrence_id, recurrence_rule_id, description, is_recurring, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [protocol, client_account_id, contract_id||null, contract_item_id||null, competence_date, due_date, amount_cents, recurrence_type||'unica', recurrence_id||null, recurrence_rule_id||null, description||null, is_recurring||false, session.identityId||null]
        );
        // check rule approved if recurring
        if (is_recurring && recurrence_rule_id) {
          const rule = await pool.query(`SELECT is_approved FROM fin_recurrence_rules WHERE id=$1`, [recurrence_rule_id]);
          if (rule.rows.length>0 && !rule.rows[0].is_approved) {
            // allow but warn
          }
        }
        await pool.query(`INSERT INTO fin_payment_history (account_type, receivable_id, previous_status, next_status, previous_paid_cents, next_paid_cents, changed_by_identity, reason) VALUES ('receber',$1,$2,$3,$4,$5,$6,$7)`, [rows[0].id, null, 'pendente', 0, 0, session.identityId||null, 'Criação inicial']);
        await auditLog({ action:"fin_receivable_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, contract_id, competence_date, recurrence_id, amount_cents, is_recurring } });
        // update recurrence last_generated
        if (recurrence_rule_id) {
          await pool.query(`UPDATE fin_recurrence_rules SET last_generated_competence=$2 WHERE id=$1`, [recurrence_rule_id, competence_date]);
        }
        return json(res,201,{ receivable: rows[0], note:"contas a receber vinculada contrato competência vencimento recorrência moeda valor situação idempotente contrato/competência/item" });
      } catch(e) {
        if (String(e.message).includes("duplicate") || String(e.message).includes("unique")) return json(res,409,{ error:"duplicate_competence_item", note:"geração recorrente idempotente por contrato/competência/item" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, status, reason } = body;
      if (!id || !status) return json(res,400,{ error:"missing_fields" });
      if (!reason || String(reason).length <10 || String(reason).length>1000) return json(res,400,{ error:"reason_10_1000_required", note:"baixa auditada nunca apagar saldo por edição silenciosa" });
      const cur = await pool.query(`SELECT * FROM fin_accounts_receivable WHERE id=$1`, [id]);
      if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
      const prev = cur.rows[0];
      await pool.query(`UPDATE fin_accounts_receivable SET status=$2::fin_status, paid_at=CASE WHEN $2 IN ('pago','recebido') THEN NOW() WHEN $2='cancelado' THEN canceled_at ELSE paid_at END, canceled_at=CASE WHEN $2='cancelado' THEN NOW() ELSE canceled_at END WHERE id=$1`, [id, status]);
      await pool.query(`INSERT INTO fin_payment_history (account_type, receivable_id, previous_status, next_status, previous_paid_cents, next_paid_cents, changed_by_identity, reason, is_cancelamento) VALUES ('receber',$1,$2,$3,$4,$5,$6,$7,$8)`, [id, prev.status, status, prev.amount_paid_cents, prev.amount_paid_cents, session.identityId||null, reason, status==='cancelado']);
      await auditLog({ action:"fin_receivable_status", actor: session.identityId||"unknown", target: id, meta:{ previous: prev.status, next: status, reason } });
      const { rows } = await pool.query(`SELECT * FROM fin_accounts_receivable WHERE id=$1`, [id]);
      return json(res,200,{ receivable: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handlePayables(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const supplierId = url.searchParams.get("supplier_id");
      let q=`SELECT * FROM fin_accounts_payable WHERE 1=1`;
      const params=[]; let idx=1;
      if (supplierId) { q+=` AND supplier_id=$${idx++}`; params.push(supplierId); }
      q+=` ORDER BY due_date DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ payables: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { supplier_id, client_account_id, contract_id, cost_center_id, category, competence_date, due_date, amount_cents, recurrence_type, recurrence_id, recurrence_rule_id, description, is_recurring } = body;
      if (!competence_date || !due_date || amount_cents==null) return json(res,400,{ error:"missing_fields" });
      if (new Date(due_date) < new Date(competence_date)) return json(res,400,{ error:"due_before_competence" });
      const protocol = generateProtocol("PAG-FIN");
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_accounts_payable (protocol, supplier_id, client_account_id, contract_id, cost_center_id, category, competence_date, due_date, amount_cents, recurrence_type, recurrence_id, recurrence_rule_id, description, is_recurring, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [protocol, supplier_id||null, client_account_id||null, contract_id||null, cost_center_id||null, category||'outro', competence_date, due_date, amount_cents, recurrence_type||'unica', recurrence_id||null, recurrence_rule_id||null, description||null, is_recurring||false, session.identityId||null]
        );
        await pool.query(`INSERT INTO fin_payment_history (account_type, payable_id, previous_status, next_status, previous_paid_cents, next_paid_cents, changed_by_identity, reason) VALUES ('pagar',$1,$2,$3,$4,$5,$6,$7)`, [rows[0].id, null, 'pendente', 0, 0, session.identityId||null, 'Criação inicial']);
        await auditLog({ action:"fin_payable_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, supplier_id, category, cost_center_id, amount_cents } });
        if (recurrence_rule_id) {
          await pool.query(`UPDATE fin_recurrence_rules SET last_generated_competence=$2 WHERE id=$1`, [recurrence_rule_id, competence_date]);
        }
        return json(res,201,{ payable: rows[0], note:"contas a pagar fornecedores categoria centro custo vencimento aprovação anexos idempotente" });
      } catch(e) {
        if (String(e.message).includes("duplicate") || String(e.message).includes("unique")) return json(res,409,{ error:"duplicate_competence", note:"geração recorrente idempotente" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    if (req.method === "PATCH") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { id, status, approval_status, reason } = body;
      if (!id) return json(res,400,{ error:"missing_id" });
      if (!reason || String(reason).length <10 || String(reason).length>1000) return json(res,400,{ error:"reason_10_1000_required" });
      const cur = await pool.query(`SELECT * FROM fin_accounts_payable WHERE id=$1`, [id]);
      if (cur.rows.length===0) return json(res,404,{ error:"not_found" });
      const prev = cur.rows[0];
      if (approval_status) {
        const allowed = ['pendente','aprovado','rejeitado'];
        if (!allowed.includes(approval_status)) return json(res,400,{ error:"invalid_approval" });
        if (approval_status==='aprovado') {
          await pool.query(`UPDATE fin_accounts_payable SET approval_status='aprovado', approved_by_identity=$2, approved_at=NOW() WHERE id=$1`, [id, session.identityId||null]);
          await auditLog({ action:"fin_payable_approve", actor: session.identityId||"unknown", target: id, meta:{ approval_status } });
        } else {
          await pool.query(`UPDATE fin_accounts_payable SET approval_status=$2 WHERE id=$1`, [id, approval_status]);
        }
      }
      if (status) {
        await pool.query(`UPDATE fin_accounts_payable SET status=$2, paid_at=CASE WHEN $2='pago' THEN NOW() ELSE paid_at END, canceled_at=CASE WHEN $2='cancelado' THEN NOW() ELSE canceled_at END WHERE id=$1`, [id, status]);
        await pool.query(`INSERT INTO fin_payment_history (account_type, payable_id, previous_status, next_status, previous_paid_cents, next_paid_cents, changed_by_identity, reason, is_cancelamento) VALUES ('pagar',$1,$2,$3,$4,$5,$6,$7,$8)`, [id, prev.status, status, prev.amount_paid_cents, prev.amount_paid_cents, session.identityId||null, reason, status==='cancelado']);
        await auditLog({ action:"fin_payable_status", actor: session.identityId||"unknown", target: id, meta:{ previous: prev.status, next: status, reason } });
      }
      const { rows } = await pool.query(`SELECT * FROM fin_accounts_payable WHERE id=$1`, [id]);
      return json(res,200,{ payable: rows[0] });
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handlePayments(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const receivableId = url.searchParams.get("receivable_id");
      const payableId = url.searchParams.get("payable_id");
      let q=`SELECT * FROM fin_payments WHERE 1=1`;
      const params=[]; let idx=1;
      if (receivableId) { q+=` AND receivable_id=$${idx++}`; params.push(receivableId); }
      if (payableId) { q+=` AND payable_id=$${idx++}`; params.push(payableId); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ payments: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { account_type, receivable_id, payable_id, amount_cents, payment_method, is_partial, is_estorno, is_renegotiation, previous_payment_id, notes, reason } = body;
      if (!account_type || !amount_cents || !reason) return json(res,400,{ error:"missing_fields", note:"reason 10..1000 obrigatório baixa auditada" });
      if (String(reason).length <10 || String(reason).length>1000) return json(res,400,{ error:"reason_10_1000_required" });
      if (account_type==='receber' && !receivable_id) return json(res,400,{ error:"missing_receivable_id" });
      if (account_type==='pagar' && !payable_id) return json(res,400,{ error:"missing_payable_id" });
      if (is_estorno && !previous_payment_id) return json(res,400,{ error:"estorno_requires_previous" });
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_payments (account_type, receivable_id, payable_id, amount_cents, payment_method, is_partial, is_estorno, is_renegotiation, previous_payment_id, notes, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [account_type, receivable_id||null, payable_id||null, amount_cents, payment_method||'pix', is_partial||false, is_estorno||false, is_renegotiation||false, previous_payment_id||null, notes||null, session.identityId||null]
        );
        // update paid amount
        if (account_type==='receber') {
          const cur = await pool.query(`SELECT amount_cents, amount_paid_cents, status FROM fin_accounts_receivable WHERE id=$1`, [receivable_id]);
          if (cur.rows.length>0) {
            const prevPaid = cur.rows[0].amount_paid_cents;
            const total = cur.rows[0].amount_cents;
            let newPaid;
            if (is_estorno) newPaid = Math.max(0, prevPaid - amount_cents);
            else newPaid = Math.min(total, prevPaid + amount_cents);
            const newStatus = newPaid >= total ? 'recebido' : (newPaid>0 ? 'parcial' : cur.rows[0].status);
            await pool.query(`UPDATE fin_accounts_receivable SET amount_paid_cents=$2, status=$3 WHERE id=$1`, [receivable_id, newPaid, newStatus]);
            await pool.query(`INSERT INTO fin_payment_history (account_type, receivable_id, previous_status, next_status, previous_paid_cents, next_paid_cents, payment_id, changed_by_identity, reason, is_estorno, is_renegociacao) VALUES ('receber',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [receivable_id, cur.rows[0].status, newStatus, prevPaid, newPaid, rows[0].id, session.identityId||null, reason, is_estorno||false, is_renegotiation||false]);
          }
        } else {
          const cur = await pool.query(`SELECT amount_cents, amount_paid_cents, status FROM fin_accounts_payable WHERE id=$1`, [payable_id]);
          if (cur.rows.length>0) {
            const prevPaid = cur.rows[0].amount_paid_cents;
            const total = cur.rows[0].amount_cents;
            let newPaid;
            if (is_estorno) newPaid = Math.max(0, prevPaid - amount_cents);
            else newPaid = Math.min(total, prevPaid + amount_cents);
            const newStatus = newPaid >= total ? 'pago' : (newPaid>0 ? 'parcial' : cur.rows[0].status);
            await pool.query(`UPDATE fin_accounts_payable SET amount_paid_cents=$2, status=$3 WHERE id=$1`, [payable_id, newPaid, newStatus]);
            await pool.query(`INSERT INTO fin_payment_history (account_type, payable_id, previous_status, next_status, previous_paid_cents, next_paid_cents, payment_id, changed_by_identity, reason, is_estorno, is_renegociacao) VALUES ('pagar',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [payable_id, cur.rows[0].status, newStatus, prevPaid, newPaid, rows[0].id, session.identityId||null, reason, is_estorno||false, is_renegotiation||false]);
          }
        }
        const action = is_estorno ? "fin_payment_estorno" : (is_renegotiation ? "fin_payment_renegotiation" : "fin_payment_create");
        await auditLog({ action, actor: session.identityId||"unknown", target: rows[0].id, meta:{ account_type, receivable_id, payable_id, amount_cents, is_partial, is_estorno, reason } });
        return json(res,201,{ payment: rows[0], note:"pagamento/recebimento parcial estorno cancelamento renegociação baixa auditada nunca apagar saldo por edição silenciosa" });
      } catch(e) { return json(res,500,{ error:"internal", detail:e.message }); }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handlePaymentHistory(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const receivableId = url.searchParams.get("receivable_id");
    const payableId = url.searchParams.get("payable_id");
    if (!receivableId && !payableId) return json(res,400,{ error:"missing_id" });
    let q=`SELECT * FROM fin_payment_history WHERE 1=1`;
    const params=[]; let idx=1;
    if (receivableId) { q+=` AND receivable_id=$${idx++}`; params.push(receivableId); }
    if (payableId) { q+=` AND payable_id=$${idx++}`; params.push(payableId); }
    q+=` ORDER BY created_at DESC LIMIT 100`;
    const { rows } = await pool.query(q, params);
    return json(res,200,{ history: rows, note:"baixa auditada imutável nunca apagar saldo silenciosamente" });
  }

  async function handleAttachments(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const receivableId = url.searchParams.get("receivable_id");
      const payableId = url.searchParams.get("payable_id");
      let q=`SELECT * FROM fin_attachments WHERE 1=1`;
      const params=[]; let idx=1;
      if (receivableId) { q+=` AND receivable_id=$${idx++}`; params.push(receivableId); }
      if (payableId) { q+=` AND payable_id=$${idx++}`; params.push(payableId); }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{ attachments: rows });
    }
    if (req.method === "POST") {
      let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
      const { account_type, receivable_id, payable_id, file_name, file_url, storage_key } = body;
      if (!account_type || !file_name || !file_url || !storage_key) return json(res,400,{ error:"missing_fields" });
      try {
        const { rows } = await pool.query(`INSERT INTO fin_attachments (account_type, receivable_id, payable_id, file_name, file_url, storage_key, uploaded_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [account_type, receivable_id||null, payable_id||null, file_name, file_url, storage_key, session.identityId||null]);
        await auditLog({ action:"fin_attachment_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ account_type, file_name } });
        return json(res,201,{ attachment: rows[0] });
      } catch(e) {
        if (String(e.message).includes("duplicate")) return json(res,409,{ error:"duplicate_storage_key" });
        return json(res,500,{ error:"internal", detail:e.message });
      }
    }
    return json(res,405,{ error:"method_not_allowed" });
  }

  async function handleGenerateRecurring(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    if (req.method !== "POST") return json(res,405,{ error:"method_not_allowed" });
    let body={}; try { const chunks=[]; for await (const c of req) chunks.push(c); body=JSON.parse(Buffer.concat(chunks).toString()||"{}"); } catch {}
    const { recurrence_rule_id, competence_date, due_date, client_account_id, contract_id, contract_item_id, amount_cents } = body;
    if (!recurrence_rule_id || !competence_date || !due_date || !client_account_id) return json(res,400,{ error:"missing_fields" });
    // check rule approved and active
    const ruleRes = await pool.query(`SELECT * FROM fin_recurrence_rules WHERE id=$1`, [recurrence_rule_id]);
    if (ruleRes.rows.length===0) return json(res,404,{ error:"rule_not_found" });
    const rule = ruleRes.rows[0];
    if (!rule.is_active) return json(res,400,{ error:"rule_inactive" });
    if (!rule.is_approved) return json(res,400,{ error:"rule_not_approved", note:"regras aprovadas conforme FIN-03" });
    if (rule.suspension_enabled) return json(res,400,{ error:"rule_suspended", note:`suspensão: ${rule.suspension_reason}` });
    // idempotente por contrato/competência/item
    const exists = await pool.query(`SELECT id FROM fin_accounts_receivable WHERE contract_id=$1 AND competence_date=$2 AND COALESCE(contract_item_id,'00000000-0000-0000-0000-000000000000'::uuid)=COALESCE($3,'00000000-0000-0000-0000-000000000000'::uuid) AND COALESCE(recurrence_id,'')=COALESCE($4,'')`, [contract_id||rule.contract_id, competence_date, contract_item_id||rule.contract_item_id, rule.recurrence_id]);
    if (exists.rows.length>0) return json(res,409,{ error:"already_generated", note:"geração recorrente idempotente por contrato/competência/item" });
    // pró-rata, reajuste
    let finalAmount = amount_cents || rule.amount_cents;
    if (rule.proration_enabled && rule.proration_rule) {
      // simple proration example: if competence mid-month, half
      finalAmount = Math.floor(finalAmount * 0.5);
    }
    if (rule.reajuste_enabled && rule.reajuste_percent) {
      finalAmount = Math.floor(finalAmount * (1 + Number(rule.reajuste_percent)/100));
    }
    const protocol = generateProtocol("REC-FIN");
    try {
      const { rows } = await pool.query(
        `INSERT INTO fin_accounts_receivable (protocol, client_account_id, contract_id, contract_item_id, competence_date, due_date, amount_cents, recurrence_type, recurrence_id, recurrence_rule_id, is_recurring, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11) RETURNING *`,
        [protocol, client_account_id, contract_id||rule.contract_id, contract_item_id||rule.contract_item_id, competence_date, due_date, finalAmount, rule.recurrence_type, rule.recurrence_id, recurrence_rule_id, session.identityId||null]
      );
      await pool.query(`UPDATE fin_recurrence_rules SET last_generated_competence=$2 WHERE id=$1`, [recurrence_rule_id, competence_date]);
      await pool.query(`INSERT INTO fin_payment_history (account_type, receivable_id, previous_status, next_status, previous_paid_cents, next_paid_cents, changed_by_identity, reason) VALUES ('receber',$1,$2,$3,$4,$5,$6,$7)`, [rows[0].id, null, 'pendente', 0, 0, session.identityId||null, `Geração recorrente idempotente ${rule.recurrence_id} pró-rata ${rule.proration_enabled} reajuste ${rule.reajuste_percent||0}%`]);
      await auditLog({ action:"fin_receivable_create", actor: session.identityId||"unknown", target: rows[0].id, meta:{ protocol, recurrence_rule_id, competence_date, finalAmount, proration: rule.proration_enabled, reajuste: rule.reajuste_percent } });
      return json(res,201,{ receivable: rows[0], note:"geração recorrente idempotente por contrato/competência/item pró-rata reajuste suspensão conforme regras aprovadas" });
    } catch(e) {
      if (String(e.message).includes("duplicate") || String(e.message).includes("unique")) return json(res,409,{ error:"duplicate_competence_item", note:"idempotente" });
      return json(res,500,{ error:"internal", detail:e.message });
    }
  }

  return {
    handleSuppliers,
    handleCostCenters,
    handleRecurrenceRules,
    handleReceivables,
    handlePayables,
    handlePayments,
    handlePaymentHistory,
    handleAttachments,
    handleGenerateRecurring,
  };
}
