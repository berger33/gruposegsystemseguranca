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
    const session = await requireSession(req);
    if (!session) { res.writeHead(401, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"unauthorized" })); return null; }
    if (roles && !requireRole(session, roles)) { res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"forbidden" })); return null; }
    if (!sameOrigin(req)) { res.writeHead(403, { "Content-Type":"application/json" }); res.end(JSON.stringify({ error:"origin_forbidden" })); return null; }
    return session;
  }
  function json(res, code, obj) { res.writeHead(code, { "Content-Type":"application/json" }); res.end(JSON.stringify(obj)); }

  const reconciliationSources = new Set(['importacao', 'extrato', 'provedor', 'manual']);
  const resolutionStatuses = new Set(['conciliada', 'divergente', 'ignorada']);
  function duplicateError(error) { return error?.code === '23505' || /duplicate|unique/i.test(String(error?.message || error)); }
  function auditUnavailable(error) { return error?.code === '42P01' || /audit_log/i.test(String(error?.message || error)); }
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function validDate(value) {
    const date = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === date;
  }
  function validInteger(value, { minimum = undefined } = {}) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && (minimum === undefined || parsed >= minimum);
  }
  async function readJson(req) {
    try { const chunks=[]; for await (const chunk of req) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
    catch { return null; }
  }
  async function rollback(client) { try { await client.query('ROLLBACK'); } catch {} }

  async function handleBankStatements(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM fin_bank_statements ORDER BY import_date DESC, created_at DESC LIMIT 100`);
      return json(res,200,{ statements: rows, note:"metadados de extratos sintéticos; nenhum arquivo externo é buscado" });
    }
    if (req.method !== "POST") return json(res,405,{ error:"method_not_allowed" });

    const body = await readJson(req);
    if (!body) return json(res,400,{ error:"invalid_json" });
    const source = text(body.source) || 'extrato';
    const fileName = text(body.file_name); const fileUrl = text(body.file_url); const storageKey = text(body.storage_key);
    const importDate = text(body.import_date) || new Date().toISOString().slice(0,10);
    const transactions = body.transactions === undefined ? [] : body.transactions;
    if (!reconciliationSources.has(source)) return json(res,400,{ error:"invalid_source" });
    if (!fileName || fileName.length > 500 || !fileUrl || fileUrl.length > 1000 || !storageKey || storageKey.length > 500 || !validDate(importDate)) return json(res,400,{ error:"invalid_statement" });
    if (!Array.isArray(transactions) || transactions.length > 500) return json(res,400,{ error:"transactions_0_500_required" });
    const seenReferences = new Set();
    for (const transaction of transactions) {
      const bankRef = text(transaction?.bank_ref); const description = text(transaction?.description);
      if (!validDate(transaction?.transaction_date) || !validInteger(transaction?.amount_cents) || Number(transaction.amount_cents) === 0 || description.length < 3 || description.length > 500 || bankRef.length < 3 || bankRef.length > 200) return json(res,400,{ error:"invalid_transaction" });
      if (seenReferences.has(bankRef)) return json(res,409,{ error:"duplicate_bank_ref_in_import", note:"a importação é atômica; nenhuma linha foi gravada" });
      seenReferences.add(bankRef);
    }

    const protocol = generateProtocol("EXT-FIN");
    const client = await pool.connect(); let auditing = false;
    try {
      await client.query('BEGIN');
      const totalAmount = transactions.reduce((sum, item) => sum + Number(item.amount_cents), 0);
      const statement = await client.query(
        `INSERT INTO fin_bank_statements (protocol, source, file_name, file_url, storage_key, import_date, total_transactions, total_amount_cents, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [protocol, source, fileName, fileUrl, storageKey, importDate, transactions.length, totalAmount, session.identityId || null]
      );
      const imported = [];
      for (const transaction of transactions) {
        const inserted = await client.query(
          `INSERT INTO fin_bank_transactions (statement_id, transaction_date, amount_cents, description, bank_ref)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [statement.rows[0].id, transaction.transaction_date, Number(transaction.amount_cents), text(transaction.description), text(transaction.bank_ref)]
        );
        imported.push(inserted.rows[0]);
      }
      auditing = true;
      await auditLog({ action:"fin_bank_statement_create", actor: session.identityId || "unknown", target: statement.rows[0].id, meta:{ protocol, source, transaction_count: imported.length, synthetic: true }, client });
      for (const transaction of imported) await auditLog({ action:"fin_bank_transaction_create", actor: session.identityId || "unknown", target: transaction.id, meta:{ bank_ref: transaction.bank_ref, amount_cents: transaction.amount_cents, statement_id: statement.rows[0].id, synthetic: true }, client });
      await client.query('COMMIT');
      return json(res,201,{ statement: statement.rows[0], transactions: imported, note:"extrato sintético importado atomicamente; nenhum provedor ou arquivo externo foi acessado" });
    } catch (error) {
      await rollback(client);
      if (auditing && auditUnavailable(error)) return json(res,503,{ error:"audit_unavailable" });
      if (duplicateError(error)) return json(res,409,{ error:"duplicate_statement_or_bank_ref", note:"a importação foi revertida por completo" });
      return json(res,500,{ error:"internal" });
    } finally { client.release(); }
  }

  async function handleBankTransactions(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const statementId = url.searchParams.get("statement_id");
      let query=`SELECT * FROM fin_bank_transactions WHERE 1=1`; const params=[];
      if (statementId) { query += ` AND statement_id=$1`; params.push(statementId); }
      const { rows } = await pool.query(`${query} ORDER BY transaction_date DESC, created_at DESC LIMIT 100`, params);
      return json(res,200,{ transactions: rows });
    }
    if (req.method !== "POST") return json(res,405,{ error:"method_not_allowed" });
    const body = await readJson(req);
    if (!body) return json(res,400,{ error:"invalid_json" });
    const statementId = text(body.statement_id); const bankRef = text(body.bank_ref); const description = text(body.description);
    if (!statementId || !validDate(body.transaction_date) || !validInteger(body.amount_cents) || Number(body.amount_cents) === 0 || description.length < 3 || description.length > 500 || bankRef.length < 3 || bankRef.length > 200) return json(res,400,{ error:"invalid_transaction" });
    const client = await pool.connect(); let auditing = false;
    try {
      await client.query('BEGIN');
      const statement = await client.query(`SELECT id FROM fin_bank_statements WHERE id=$1 FOR UPDATE`, [statementId]);
      if (!statement.rows.length) { await rollback(client); return json(res,404,{ error:"statement_not_found" }); }
      const inserted = await client.query(`INSERT INTO fin_bank_transactions (statement_id, transaction_date, amount_cents, description, bank_ref) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [statementId, body.transaction_date, Number(body.amount_cents), description, bankRef]);
      await client.query(`UPDATE fin_bank_statements SET total_transactions=total_transactions+1, total_amount_cents=total_amount_cents+$2 WHERE id=$1`, [statementId, Number(body.amount_cents)]);
      auditing = true;
      await auditLog({ action:"fin_bank_transaction_create", actor: session.identityId || "unknown", target: inserted.rows[0].id, meta:{ bank_ref: bankRef, amount_cents: Number(body.amount_cents), statement_id: statementId, synthetic: true }, client });
      await client.query('COMMIT');
      return json(res,201,{ transaction: inserted.rows[0], note:"movimento sintético registrado uma vez por bank_ref" });
    } catch (error) {
      await rollback(client);
      if (auditing && auditUnavailable(error)) return json(res,503,{ error:"audit_unavailable" });
      if (duplicateError(error)) return json(res,409,{ error:"duplicate_bank_ref", note:"evitar duplicar transações" });
      return json(res,500,{ error:"internal" });
    } finally { client.release(); }
  }

  async function handleConciliations(req, res) {
    const session = await ensureAuth(req, res, ["admin","ti","financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      const validStatus = !status || ['pendente','sugerida','conciliada','divergente','ignorada'].includes(status);
      if (!validStatus) return json(res,400,{ error:"invalid_status" });
      const params=[]; let where='';
      if (status) { params.push(status); where='WHERE c.status=$1'; }
      const { rows } = await pool.query(
        `SELECT c.*, t.bank_ref, t.transaction_date, t.amount_cents AS bank_amount_cents, t.is_conciliated,
                r.protocol AS receivable_protocol, r.amount_remaining_cents AS receivable_remaining_cents,
                p.protocol AS payable_protocol, p.amount_remaining_cents AS payable_remaining_cents
           FROM fin_conciliations c
           JOIN fin_bank_transactions t ON t.id=c.bank_transaction_id
           LEFT JOIN fin_accounts_receivable r ON r.id=c.receivable_id
           LEFT JOIN fin_accounts_payable p ON p.id=c.payable_id
           ${where}
          ORDER BY c.created_at DESC LIMIT 100`, params
      );
      return json(res,200,{ conciliations: rows, note:"sugestões não alteram saldo: baixa/estorno seguem FIN-04" });
    }
    if (req.method === "POST") {
      const body = await readJson(req);
      if (!body) return json(res,400,{ error:"invalid_json" });
      const receivableId = text(body.receivable_id); const payableId = text(body.payable_id); const bankTransactionId = text(body.bank_transaction_id);
      const source = text(body.source) || 'extrato';
      if (!reconciliationSources.has(source)) return json(res,400,{ error:"invalid_source" });
      if (!bankTransactionId || (!!receivableId === !!payableId)) return json(res,400,{ error:"one_account_and_bank_transaction_required" });
      const client = await pool.connect(); let auditing = false;
      try {
        await client.query('BEGIN');
        const bank = await client.query(`SELECT * FROM fin_bank_transactions WHERE id=$1 FOR UPDATE`, [bankTransactionId]);
        if (!bank.rows.length) { await rollback(client); return json(res,404,{ error:"bank_transaction_not_found" }); }
        if (bank.rows[0].is_conciliated) { await rollback(client); return json(res,409,{ error:"bank_transaction_already_conciliated" }); }
        let account;
        if (receivableId) account = await client.query(`SELECT id, amount_remaining_cents, protocol FROM fin_accounts_receivable WHERE id=$1 FOR UPDATE`, [receivableId]);
        else account = await client.query(`SELECT id, amount_remaining_cents, protocol FROM fin_accounts_payable WHERE id=$1 FOR UPDATE`, [payableId]);
        if (!account.rows.length) { await rollback(client); return json(res,404,{ error:"account_not_found" }); }
        const available = Number(account.rows[0].amount_remaining_cents);
        const amount = Math.abs(Number(bank.rows[0].amount_cents));
        if (available <= 0 || amount <= 0) { await rollback(client); return json(res,409,{ error:"account_or_transaction_not_open" }); }
        const requested = body.amount_matched_cents === undefined || body.amount_matched_cents === null ? Math.min(available, amount) : Number(body.amount_matched_cents);
        if (!validInteger(requested, { minimum: 1 }) || requested > available || requested > amount) { await rollback(client); return json(res,400,{ error:"invalid_amount_matched" }); }
        const reason = text(body.suggestion_reason) || `Sugestão sintética por valor e saldo disponível (${requested} centavos)`;
        if (reason.length < 10 || reason.length > 1000) { await rollback(client); return json(res,400,{ error:"suggestion_reason_10_1000" }); }
        const created = await client.query(
          `INSERT INTO fin_conciliations (receivable_id, payable_id, bank_transaction_id, source, status, suggested_by_identity, suggested_at, suggestion_reason, amount_matched_cents)
           VALUES ($1,$2,$3,$4,'sugerida',$5,NOW(),$6,$7) RETURNING *`,
          [receivableId || null, payableId || null, bankTransactionId, source, session.identityId || null, reason, requested]
        );
        auditing = true;
        await auditLog({ action:"fin_conciliation_create", actor: session.identityId || "unknown", target: created.rows[0].id, meta:{ bank_transaction_id: bankTransactionId, receivable_id: receivableId || null, payable_id: payableId || null, amount_matched_cents: requested, source, synthetic: true }, client });
        await client.query('COMMIT');
        return json(res,201,{ conciliation: created.rows[0], note:"sugestão registrada; confirme explicitamente antes de marcar o extrato conciliado" });
      } catch (error) {
        await rollback(client);
        if (auditing && auditUnavailable(error)) return json(res,503,{ error:"audit_unavailable" });
        if (duplicateError(error)) return json(res,409,{ error:"duplicate_conciliation", note:"um movimento bancário aceita uma única conciliação" });
        return json(res,500,{ error:"internal" });
      } finally { client.release(); }
    }
    if (req.method === "PATCH") {
      const body = await readJson(req);
      if (!body) return json(res,400,{ error:"invalid_json" });
      const id = text(body.id); const status = text(body.status); const divergenceReason = text(body.divergence_reason);
      if (!id || !resolutionStatuses.has(status)) return json(res,400,{ error:"invalid_resolution" });
      if (status === 'divergente' && (divergenceReason.length < 10 || divergenceReason.length > 1000)) return json(res,400,{ error:"divergence_reason_10_1000_required" });
      const client = await pool.connect(); let auditing = false;
      try {
        await client.query('BEGIN');
        const current = await client.query(`SELECT * FROM fin_conciliations WHERE id=$1 FOR UPDATE`, [id]);
        if (!current.rows.length) { await rollback(client); return json(res,404,{ error:"not_found" }); }
        if (current.rows[0].status !== 'sugerida') { await rollback(client); return json(res,409,{ error:"conciliation_already_resolved" }); }
        const bank = await client.query(`SELECT * FROM fin_bank_transactions WHERE id=$1 FOR UPDATE`, [current.rows[0].bank_transaction_id]);
        if (!bank.rows.length || (status === 'conciliada' && bank.rows[0].is_conciliated)) { await rollback(client); return json(res,409,{ error:"bank_transaction_already_conciliated" }); }
        const updated = await client.query(
          `UPDATE fin_conciliations
              SET status=$2, confirmed_by_identity=$3, confirmed_at=NOW(), divergence_reason=$4
            WHERE id=$1 RETURNING *`,
          [id, status, session.identityId || null, status === 'divergente' ? divergenceReason : null]
        );
        if (status === 'conciliada') await client.query(`UPDATE fin_bank_transactions SET is_conciliated=true, conciliated_at=NOW() WHERE id=$1`, [current.rows[0].bank_transaction_id]);
        auditing = true;
        await auditLog({ action:"fin_conciliation_confirm", actor: session.identityId || "unknown", target: id, meta:{ status, divergence_reason: status === 'divergente' ? divergenceReason : null, bank_transaction_id: current.rows[0].bank_transaction_id, synthetic: true }, client });
        await client.query('COMMIT');
        return json(res,200,{ conciliation: updated.rows[0], note: status === 'conciliada' ? "conciliação confirmada; nenhum pagamento foi criado" : "resultado da conciliação registrado" });
      } catch (error) {
        await rollback(client);
        if (auditing && auditUnavailable(error)) return json(res,503,{ error:"audit_unavailable" });
        return json(res,500,{ error:"internal" });
      } finally { client.release(); }
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
