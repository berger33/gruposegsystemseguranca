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

  const CONCILIATION_SOURCES = new Set(["importacao", "extrato", "provedor", "manual"]);
  const CONCILIATION_STATUSES = new Set(["pendente", "sugerida", "conciliada", "divergente", "ignorada"]);
  const FINAL_CONCILIATION_STATUSES = new Set(["conciliada", "divergente", "ignorada"]);

  // FIN-06: cobrança com responsável, lembretes, histórico e política aprovada.
  const REMINDER_TYPES = new Set(["email", "whatsapp", "ligacao", "notificacao_portal", "outro"]);
  const COLLECTION_STATUSES = new Set(["pendente", "lembrete_enviado", "em_negociacao", "acordado", "cancelado"]);
  // "pendente" só existe como estado inicial automático; qualquer PATCH precisa mover para um destes.
  const COLLECTION_FORWARD_STATUSES = new Set(["lembrete_enviado", "em_negociacao", "acordado", "cancelado"]);

  // FIN-07: snapshots de fluxo de caixa e aging por competência. Estes
  // valores são sempre sintéticos e representam uma fotografia autorizada,
  // nunca uma integração bancária ou cobrança automática.
  const CASHFLOW_TYPES = new Set(["previsto", "realizado"]);
  const AGING_BUCKETS = new Set(["a_vencer", "vencido_0_30", "vencido_31_60", "vencido_61_90", "vencido_90_plus"]);

  // FIN-08: custos e importações são registros sintéticos locais. A API não
  // lê arquivos externos nem integra folha, estoque ou supervisão.
  const COST_SOURCES = new Set(["pessoal", "equipamento", "material", "supervisao", "outro"]);

  function isUuid(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  async function readJsonBody(req, res) {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString() || "{}");
    } catch {
      json(res, 400, { error: "invalid_json" });
      return null;
    }
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function integerCents(value, { allowNegative = true } = {}) {
    if (value === "" || value === null || value === undefined) return null;
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isSafeInteger(number) || (!allowNegative && number < 0)) return null;
    return number;
  }

  function isAuditUnavailable(error) {
    return error?.code === "42P01" || /audit_log/i.test(String(error?.message || ""));
  }

  function databaseError(error) {
    if (error?.code === "23505") return "duplicate";
    if (error?.code === "23514" || error?.code === "22P02" || error?.code === "22007") return "invalid";
    return null;
  }

  async function handleBankStatements(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM fin_bank_statements ORDER BY import_date DESC, created_at DESC LIMIT 100`);
      return json(res, 200, { statements: rows, synthetic: true });
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req, res);
    if (!body) return;
    const source = body.source || "extrato";
    const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
    const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
    const storageKey = typeof body.storage_key === "string" ? body.storage_key.trim() : "";
    const importDate = body.import_date || new Date().toISOString().slice(0, 10);
    const totalTransactions = integerCents(body.total_transactions ?? 0, { allowNegative: false });
    const totalAmountCents = integerCents(body.total_amount_cents ?? 0);
    if (!CONCILIATION_SOURCES.has(source)) return json(res, 400, { error: "invalid_source" });
    if (!fileName || fileName.length > 500 || fileUrl.length < 5 || fileUrl.length > 1000 || storageKey.length < 5 || storageKey.length > 500) {
      return json(res, 400, { error: "file_metadata_invalid" });
    }
    if (!validDate(importDate)) return json(res, 400, { error: "invalid_import_date" });
    if (totalTransactions === null || totalAmountCents === null) return json(res, 400, { error: "invalid_statement_totals" });

    const protocol = generateProtocol("EXT-FIN");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO fin_bank_statements
          (protocol, source, file_name, file_url, storage_key, import_date, total_transactions, total_amount_cents, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [protocol, source, fileName, fileUrl, storageKey, importDate, totalTransactions, totalAmountCents, session.identityId || null]
      );
      await auditLog({
        action: "fin_bank_statement_create",
        actor: session.identityId || "unknown",
        target: rows[0].id,
        meta: { protocol, source, storage_key: storageKey, synthetic: true },
        client,
      });
      await client.query("COMMIT");
      return json(res, 201, { statement: rows[0], synthetic: true });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
      if (databaseError(error) === "duplicate") return json(res, 409, { error: "duplicate_storage_key" });
      if (databaseError(error) === "invalid") return json(res, 400, { error: "invalid_statement" });
      return json(res, 500, { error: "internal" });
    } finally {
      client.release();
    }
  }

  async function handleBankTransactions(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const statementId = url.searchParams.get("statement_id");
      let query = `SELECT * FROM fin_bank_transactions WHERE 1=1`;
      const params = [];
      if (statementId) { query += ` AND statement_id=$1`; params.push(statementId); }
      query += ` ORDER BY transaction_date DESC, created_at DESC LIMIT 100`;
      const { rows } = await pool.query(query, params);
      return json(res, 200, { transactions: rows, synthetic: true });
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req, res);
    if (!body) return;
    const statementId = typeof body.statement_id === "string" ? body.statement_id.trim() : "";
    const transactionDate = body.transaction_date;
    const amountCents = integerCents(body.amount_cents);
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const bankRef = typeof body.bank_ref === "string" ? body.bank_ref.trim() : "";
    if (!statementId || !validDate(transactionDate) || amountCents === null || !description || description.length < 3 || description.length > 500 || bankRef.length < 3 || bankRef.length > 200) {
      return json(res, 400, { error: "transaction_fields_invalid" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const statement = await client.query(`SELECT id FROM fin_bank_statements WHERE id=$1 FOR UPDATE`, [statementId]);
      if (!statement.rows.length) {
        await client.query("ROLLBACK");
        return json(res, 404, { error: "statement_not_found" });
      }
      const { rows } = await client.query(
        `INSERT INTO fin_bank_transactions (statement_id, transaction_date, amount_cents, description, bank_ref)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [statementId, transactionDate, amountCents, description, bankRef]
      );
      await client.query(
        `UPDATE fin_bank_statements
            SET total_transactions=total_transactions+1, total_amount_cents=total_amount_cents+$2
          WHERE id=$1`,
        [statementId, amountCents]
      );
      await auditLog({
        action: "fin_bank_transaction_create",
        actor: session.identityId || "unknown",
        target: rows[0].id,
        meta: { statement_id: statementId, bank_ref: bankRef, amount_cents: amountCents, synthetic: true },
        client,
      });
      await client.query("COMMIT");
      return json(res, 201, { transaction: rows[0], synthetic: true });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
      if (databaseError(error) === "duplicate") return json(res, 409, { error: "duplicate_bank_ref" });
      if (databaseError(error) === "invalid") return json(res, 400, { error: "invalid_transaction" });
      return json(res, 500, { error: "internal" });
    } finally {
      client.release();
    }
  }

  async function handleConciliations(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      if (status && !CONCILIATION_STATUSES.has(status)) return json(res, 400, { error: "invalid_status" });
      let query = `SELECT * FROM fin_conciliations WHERE 1=1`;
      const params = [];
      if (status) { query += ` AND status=$1`; params.push(status); }
      query += ` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(query, params);
      return json(res, 200, { conciliations: rows, synthetic: true });
    }
    if (req.method !== "POST" && req.method !== "PATCH") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req, res);
    if (!body) return;
    if (req.method === "POST") {
      const receivableId = typeof body.receivable_id === "string" ? body.receivable_id.trim() : "";
      const payableId = typeof body.payable_id === "string" ? body.payable_id.trim() : "";
      const bankTransactionId = typeof body.bank_transaction_id === "string" ? body.bank_transaction_id.trim() : "";
      const source = body.source || "extrato";
      const suggestionReason = typeof body.suggestion_reason === "string" ? body.suggestion_reason.trim() : "";
      const amountMatched = body.amount_matched_cents == null ? null : integerCents(body.amount_matched_cents, { allowNegative: false });
      if (!CONCILIATION_SOURCES.has(source)) return json(res, 400, { error: "invalid_source" });
      if ((receivableId ? 1 : 0) + (payableId ? 1 : 0) !== 1) return json(res, 400, { error: "exactly_one_account_ref_required" });
      if (!bankTransactionId) return json(res, 400, { error: "bank_transaction_required" });
      if (suggestionReason.length < 10 || suggestionReason.length > 1000) return json(res, 400, { error: "suggestion_reason_10_1000_required" });
      if (body.amount_matched_cents != null && amountMatched === null) return json(res, 400, { error: "invalid_amount_matched" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const bank = await client.query(`SELECT * FROM fin_bank_transactions WHERE id=$1 FOR UPDATE`, [bankTransactionId]);
        if (!bank.rows.length) {
          await client.query("ROLLBACK");
          return json(res, 404, { error: "bank_transaction_not_found" });
        }
        if (bank.rows[0].is_conciliated) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "bank_transaction_already_conciliated" });
        }
        const accountTable = receivableId ? "fin_accounts_receivable" : "fin_accounts_payable";
        const accountId = receivableId || payableId;
        const account = await client.query(`SELECT id, amount_remaining_cents FROM ${accountTable} WHERE id=$1 FOR UPDATE`, [accountId]);
        if (!account.rows.length) {
          await client.query("ROLLBACK");
          return json(res, 404, { error: "account_not_found" });
        }
        // A sugestão nunca casa mais do que o saldo aberto da conta nem mais do
        // que o valor absoluto do movimento (resíduo da PR #47 adaptado); sem
        // valor explícito, casa o mínimo entre os dois.
        const available = Number(account.rows[0].amount_remaining_cents);
        const movementAmount = Math.abs(Number(bank.rows[0].amount_cents));
        if (!Number.isFinite(available) || available <= 0 || movementAmount <= 0) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "account_or_transaction_not_open" });
        }
        const matched = amountMatched ?? Math.min(available, movementAmount);
        if (!Number.isSafeInteger(matched) || matched < 1 || matched > available || matched > movementAmount) {
          await client.query("ROLLBACK");
          return json(res, 400, { error: "invalid_amount_matched" });
        }
        const { rows } = await client.query(
          `INSERT INTO fin_conciliations
             (receivable_id, payable_id, bank_transaction_id, source, status, suggested_by_identity, suggested_at, suggestion_reason, amount_matched_cents)
           VALUES ($1,$2,$3,$4,'sugerida',$5,NOW(),$6,$7) RETURNING *`,
          [receivableId || null, payableId || null, bankTransactionId, source, session.identityId || null, suggestionReason, matched]
        );
        await auditLog({
          action: "fin_conciliation_create",
          actor: session.identityId || "unknown",
          target: rows[0].id,
          meta: { receivable_id: receivableId || null, payable_id: payableId || null, bank_transaction_id: bankTransactionId, source, amount_matched_cents: matched, synthetic: true },
          client,
        });
        await client.query("COMMIT");
        return json(res, 201, { conciliation: rows[0], synthetic: true });
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
        if (databaseError(error) === "duplicate") return json(res, 409, { error: "already_conciliated" });
        if (databaseError(error) === "invalid") return json(res, 400, { error: "invalid_conciliation" });
        return json(res, 500, { error: "internal" });
      } finally {
        client.release();
      }
    }

    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = body.status;
    const divergenceReason = typeof body.divergence_reason === "string" ? body.divergence_reason.trim() : "";
    if (!id || !CONCILIATION_STATUSES.has(status)) return json(res, 400, { error: "invalid_confirmation" });
    if (status === "divergente" && (divergenceReason.length < 10 || divergenceReason.length > 1000)) {
      return json(res, 400, { error: "divergence_reason_10_1000_required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query(`SELECT * FROM fin_conciliations WHERE id=$1 FOR UPDATE`, [id]);
      if (!currentResult.rows.length) {
        await client.query("ROLLBACK");
        return json(res, 404, { error: "not_found" });
      }
      const current = currentResult.rows[0];
      if (FINAL_CONCILIATION_STATUSES.has(current.status)) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: current.status === status ? "already_confirmed" : "conciliation_already_final" });
      }
      if (!FINAL_CONCILIATION_STATUSES.has(status) && status !== "pendente" && status !== "sugerida") {
        await client.query("ROLLBACK");
        return json(res, 400, { error: "invalid_confirmation" });
      }
      if (!current.bank_transaction_id) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "bank_transaction_required" });
      }
      const bank = await client.query(`SELECT * FROM fin_bank_transactions WHERE id=$1 FOR UPDATE`, [current.bank_transaction_id]);
      if (!bank.rows.length) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "bank_transaction_not_found" });
      }
      if (status === "conciliada" && bank.rows[0].is_conciliated) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "bank_transaction_already_conciliated" });
      }
      const confirmed = FINAL_CONCILIATION_STATUSES.has(status);
      await client.query(
        `UPDATE fin_conciliations
            SET status=$2::fin_conciliation_status,
                confirmed_by_identity=CASE WHEN $3 THEN $4::uuid ELSE NULL END,
                confirmed_at=CASE WHEN $3 THEN NOW() ELSE NULL END,
                divergence_reason=CASE WHEN $2::fin_conciliation_status='divergente' THEN $5 ELSE NULL END
          WHERE id=$1`,
        [id, status, confirmed, session.identityId || null, divergenceReason || null]
      );
      if (status === "conciliada") {
        await client.query(`UPDATE fin_bank_transactions SET is_conciliated=true, conciliated_at=NOW() WHERE id=$1`, [current.bank_transaction_id]);
      }
      await auditLog({
        action: "fin_conciliation_confirm",
        actor: session.identityId || "unknown",
        target: id,
        meta: { previous_status: current.status, status, bank_transaction_id: current.bank_transaction_id, divergence_reason: divergenceReason || null, synthetic: true },
        client,
      });
      const { rows } = await client.query(`SELECT * FROM fin_conciliations WHERE id=$1`, [id]);
      await client.query("COMMIT");
      return json(res, 200, { conciliation: rows[0], synthetic: true });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
      if (databaseError(error) === "invalid") return json(res, 400, { error: "invalid_confirmation" });
      return json(res, 500, { error: "internal" });
    } finally {
      client.release();
    }
  }

  // FIN-06 cobrança: política aprovada, lembretes com responsável e
  // histórico imutável. Toda escrita é transacional e a auditoria é
  // fail-closed (mesmo padrão de FIN-05): se `audit_log` estiver
  // indisponível, a transação inteira é revertida e a API responde 503.
  async function handleCollectionPolicies(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(`SELECT * FROM fin_collection_policies ORDER BY name ASC LIMIT 100`);
      return json(res, 200, { policies: rows, note: "política de cobrança sintética; sem mensagens reais ou bloqueio automático" });
    }
    if (req.method !== "POST" && req.method !== "PATCH") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req, res);
    if (!body) return;

    if (req.method === "POST") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const reminderType = body.reminder_type || "notificacao_portal";
      const daysBefore = body.days_before == null ? 3 : Number(body.days_before);
      const escalationLevel = body.escalation_level == null ? 0 : Number(body.escalation_level);
      if (name.length < 3 || name.length > 200) return json(res, 400, { error: "name_3_200_required" });
      if (body.description != null && (description.length < 10 || description.length > 1000)) {
        return json(res, 400, { error: "description_10_1000" });
      }
      if (!REMINDER_TYPES.has(reminderType)) return json(res, 400, { error: "invalid_reminder_type" });
      if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 365) return json(res, 400, { error: "invalid_days_before" });
      if (!Number.isInteger(escalationLevel) || escalationLevel < 0 || escalationLevel > 5) return json(res, 400, { error: "invalid_escalation_level" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Criação nunca aprova sozinha: separação explícita entre criar e aprovar.
        const { rows } = await client.query(
          `INSERT INTO fin_collection_policies (name, description, reminder_type, days_before, escalation_level, is_approved, is_active)
           VALUES ($1,$2,$3,$4,$5,false,true) RETURNING *`,
          [name, description || null, reminderType, daysBefore, escalationLevel]
        );
        await auditLog({
          action: "fin_collection_policy_create",
          actor: session.identityId || "unknown",
          target: rows[0].id,
          meta: { name, reminder_type: reminderType, days_before: daysBefore, escalation_level: escalationLevel, synthetic: true },
          client,
        });
        await client.query("COMMIT");
        return json(res, 201, { policy: rows[0] });
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
        if (databaseError(error) === "duplicate") return json(res, 409, { error: "duplicate_name" });
        if (databaseError(error) === "invalid") return json(res, 400, { error: "invalid_policy" });
        return json(res, 500, { error: "internal" });
      } finally {
        client.release();
      }
    }

    // PATCH: aprovação autorizada e auditada, ou alternância de estado ativo/inativo.
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id || !isUuid(id)) return json(res, 400, { error: "invalid_policy_id" });
    const wantsApproval = body.is_approved === true;
    const wantsActiveChange = body.is_active != null && typeof body.is_active === "boolean";
    if (!wantsApproval && !wantsActiveChange) return json(res, 400, { error: "no_change_requested" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT * FROM fin_collection_policies WHERE id=$1 FOR UPDATE`, [id]);
      if (!current.rows.length) {
        await client.query("ROLLBACK");
        return json(res, 404, { error: "policy_not_found" });
      }
      if (wantsApproval && current.rows[0].is_approved) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "already_approved" });
      }
      if (wantsApproval) {
        await client.query(
          `UPDATE fin_collection_policies SET is_approved=true, approved_by_identity=$2, approved_at=NOW() WHERE id=$1`,
          [id, session.identityId || null]
        );
        await auditLog({ action: "fin_collection_policy_approve", actor: session.identityId || "unknown", target: id, meta: { is_approved: true, synthetic: true }, client });
      }
      if (wantsActiveChange) {
        await client.query(`UPDATE fin_collection_policies SET is_active=$2 WHERE id=$1`, [id, body.is_active]);
        await auditLog({ action: "fin_collection_policy_set_active", actor: session.identityId || "unknown", target: id, meta: { is_active: body.is_active, synthetic: true }, client });
      }
      const { rows } = await client.query(`SELECT * FROM fin_collection_policies WHERE id=$1`, [id]);
      await client.query("COMMIT");
      return json(res, 200, { policy: rows[0] });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
      if (databaseError(error) === "invalid") return json(res, 400, { error: "invalid_policy_update" });
      return json(res, 500, { error: "internal" });
    } finally {
      client.release();
    }
  }

  async function handleCollectionReminders(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const receivableId = url.searchParams.get("receivable_id");
      if (receivableId && !isUuid(receivableId)) return json(res, 400, { error: "invalid_receivable_id" });
      let q = `SELECT r.*, a.client_account_id, a.contract_id FROM fin_collection_reminders r
                JOIN fin_accounts_receivable a ON a.id = r.receivable_id WHERE 1=1`;
      const params = []; let idx = 1;
      if (receivableId) { q += ` AND r.receivable_id=$${idx++}`; params.push(receivableId); }
      q += ` ORDER BY r.due_date DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res, 200, { reminders: rows, note: "lembrete sintético; nenhuma mensagem real e nenhum bloqueio automático de portal" });
    }
    if (req.method !== "POST" && req.method !== "PATCH") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req, res);
    if (!body) return;

    if (req.method === "POST") {
      const receivableId = typeof body.receivable_id === "string" ? body.receivable_id.trim() : "";
      const policyId = typeof body.policy_id === "string" ? body.policy_id.trim() : "";
      const responsibleName = typeof body.responsible_name === "string" ? body.responsible_name.trim() : "";
      const dueDate = body.due_date;
      const reminderType = body.reminder_type || "notificacao_portal";
      const content = typeof body.content === "string" ? body.content.trim() : "";

      if (body.is_real_message === true) return json(res, 400, { error: "real_message_forbidden", note: "FIN-06 nunca envia mensagem real" });
      if (!isUuid(receivableId)) return json(res, 400, { error: "invalid_receivable_id" });
      if (!isUuid(policyId)) return json(res, 400, { error: "invalid_policy_id", note: "política vinculada é obrigatória" });
      if (responsibleName.length < 2 || responsibleName.length > 200) return json(res, 400, { error: "responsible_name_2_200_required" });
      if (!validDate(dueDate)) return json(res, 400, { error: "invalid_due_date" });
      if (!REMINDER_TYPES.has(reminderType)) return json(res, 400, { error: "invalid_reminder_type" });
      if (content.length < 20 || content.length > 2000) return json(res, 400, { error: "content_20_2000_required" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const policy = await client.query(`SELECT id, is_approved, is_active FROM fin_collection_policies WHERE id=$1 FOR UPDATE`, [policyId]);
        if (!policy.rows.length) {
          await client.query("ROLLBACK");
          return json(res, 404, { error: "policy_not_found" });
        }
        if (!policy.rows[0].is_approved) {
          await client.query("ROLLBACK");
          return json(res, 400, { error: "policy_not_approved", note: "política aprovada é obrigatória" });
        }
        if (!policy.rows[0].is_active) {
          await client.query("ROLLBACK");
          return json(res, 400, { error: "policy_inactive" });
        }
        const receivable = await client.query(`SELECT id, client_account_id, contract_id FROM fin_accounts_receivable WHERE id=$1`, [receivableId]);
        if (!receivable.rows.length) {
          await client.query("ROLLBACK");
          return json(res, 404, { error: "receivable_not_found" });
        }
        const { rows } = await client.query(
          `INSERT INTO fin_collection_reminders (receivable_id, policy_id, responsible_name, due_date, reminder_type, content, is_real_message)
           VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING *`,
          [receivableId, policyId, responsibleName, dueDate, reminderType, content]
        );
        await client.query(
          `INSERT INTO fin_collection_history (receivable_id, previous_status, next_status, changed_by_identity, reason, is_blocking_action)
           VALUES ($1,NULL,'pendente',$2,$3,false)`,
          [receivableId, session.identityId || null, `Criação de lembrete de cobrança sintético (responsável: ${responsibleName})`]
        );
        await auditLog({
          action: "fin_collection_reminder_create",
          actor: session.identityId || "unknown",
          target: rows[0].id,
          meta: { receivable_id: receivableId, policy_id: policyId, responsible_name: responsibleName, reminder_type: reminderType, is_real_message: false, synthetic: true },
          client,
        });
        await client.query("COMMIT");
        return json(res, 201, {
          reminder: { ...rows[0], client_account_id: receivable.rows[0].client_account_id, contract_id: receivable.rows[0].contract_id },
          note: "lembrete sintético com responsável, política aprovada e histórico; sem mensagem real ou bloqueio automático",
        });
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
        if (databaseError(error) === "duplicate") return json(res, 409, { error: "duplicate_reminder" });
        if (databaseError(error) === "invalid") return json(res, 400, { error: "invalid_reminder" });
        return json(res, 500, { error: "internal" });
      } finally {
        client.release();
      }
    }

    // PATCH: avança o estado do lembrete (ex.: envio simulado) com motivo auditado.
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = body.status;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (body.is_real_message === true) return json(res, 400, { error: "real_message_forbidden" });
    if (!isUuid(id)) return json(res, 400, { error: "invalid_reminder_id" });
    if (!COLLECTION_FORWARD_STATUSES.has(status)) return json(res, 400, { error: "invalid_status" });
    if (reason.length < 10 || reason.length > 1000) return json(res, 400, { error: "reason_10_1000_required" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`SELECT * FROM fin_collection_reminders WHERE id=$1 FOR UPDATE`, [id]);
      if (!current.rows.length) {
        await client.query("ROLLBACK");
        return json(res, 404, { error: "reminder_not_found" });
      }
      const prev = current.rows[0];
      if (prev.status === status) {
        await client.query("ROLLBACK");
        return json(res, 409, { error: "already_in_status" });
      }
      await client.query(
        `UPDATE fin_collection_reminders
            SET status=$2::fin_collection_status, sent_at=CASE WHEN $2::fin_collection_status='lembrete_enviado' THEN NOW() ELSE sent_at END, updated_at=NOW()
          WHERE id=$1`,
        [id, status]
      );
      await client.query(
        `INSERT INTO fin_collection_history (receivable_id, previous_status, next_status, changed_by_identity, reason, is_blocking_action)
         VALUES ($1,$2,$3,$4,$5,false)`,
        [prev.receivable_id, prev.status, status, session.identityId || null, reason]
      );
      await auditLog({
        action: status === "lembrete_enviado" ? "fin_collection_reminder_send" : "fin_collection_reminder_update",
        actor: session.identityId || "unknown",
        target: id,
        meta: { previous: prev.status, next: status, reason, is_real_message: false, is_blocking_action: false, synthetic: true },
        client,
      });
      const { rows } = await client.query(`SELECT * FROM fin_collection_reminders WHERE id=$1`, [id]);
      await client.query("COMMIT");
      return json(res, 200, { reminder: rows[0], note: "envio apenas simulado/local; sem bloqueio automático de portal" });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
      if (databaseError(error) === "invalid") return json(res, 400, { error: "invalid_status_update" });
      return json(res, 500, { error: "internal" });
    } finally {
      client.release();
    }
  }

  async function handleCollectionHistory(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const receivableId = url.searchParams.get("receivable_id");
    if (!receivableId) return json(res, 400, { error: "missing_receivable_id" });
    if (!isUuid(receivableId)) return json(res, 400, { error: "invalid_receivable_id" });
    const { rows } = await pool.query(`SELECT * FROM fin_collection_history WHERE receivable_id=$1 ORDER BY created_at DESC`, [receivableId]);
    return json(res, 200, { history: rows, note: "histórico imutável; nenhuma ação aqui bloqueia o portal automaticamente" });
  }

  async function handleCashflowSnapshots(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET") {
      const cashflowType = url.searchParams.get("cashflow_type");
      if (cashflowType && !CASHFLOW_TYPES.has(cashflowType)) {
        return json(res, 400, { error: "invalid_cashflow_type" });
      }
      let query = `SELECT * FROM fin_cashflow_snapshots WHERE 1=1`;
      const params = [];
      if (cashflowType) {
        query += ` AND cashflow_type=$1`;
        params.push(cashflowType);
      }
      query += ` ORDER BY competence_date DESC, cashflow_type ASC LIMIT 100`;
      const { rows } = await pool.query(query, params);
      return json(res, 200, {
        snapshots: rows,
        note: "fluxo de caixa sintético por competência; previsto/realizado, vencidos e próximos pagamentos",
      });
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req, res);
    if (!body) return;
    const competenceDate = body.competence_date;
    const cashflowType = body.cashflow_type || "previsto";
    const totalReceivable = integerCents(body.total_receivable_cents ?? 0, { allowNegative: false });
    const totalPayable = integerCents(body.total_payable_cents ?? 0, { allowNegative: false });
    const overdue = integerCents(body.vencidos_cents ?? 0, { allowNegative: false });
    const upcoming = integerCents(body.proximos_pagamentos_cents ?? 0, { allowNegative: false });
    const notes = body.notes == null ? null : typeof body.notes === "string" ? body.notes.trim() : null;

    if (!validDate(competenceDate)) return json(res, 400, { error: "invalid_competence_date" });
    if (!CASHFLOW_TYPES.has(cashflowType)) return json(res, 400, { error: "invalid_cashflow_type" });
    if ([totalReceivable, totalPayable, overdue, upcoming].some(value => value === null)) {
      return json(res, 400, { error: "invalid_cashflow_amount" });
    }
    if (body.notes != null && (!notes || notes.length < 10 || notes.length > 1000)) {
      return json(res, 400, { error: "notes_10_1000_required" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO fin_cashflow_snapshots
           (competence_date, cashflow_type, total_receivable_cents, total_payable_cents,
            vencidos_cents, proximos_pagamentos_cents, notes, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [competenceDate, cashflowType, totalReceivable, totalPayable, overdue, upcoming, notes, session.identityId || null]
      );
      await auditLog({
        action: "fin_cashflow_snapshot_create",
        actor: session.identityId || "unknown",
        target: rows[0].id,
        meta: {
          competence_date: competenceDate,
          cashflow_type: cashflowType,
          total_receivable_cents: totalReceivable,
          total_payable_cents: totalPayable,
          vencidos_cents: overdue,
          proximos_pagamentos_cents: upcoming,
          synthetic: true,
        },
        client,
      });
      await client.query("COMMIT");
      return json(res, 201, { snapshot: rows[0], synthetic: true });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
      if (error?.code === "23505") return json(res, 409, { error: "duplicate_competence_type" });
      if (["23503", "23514", "22P02", "22007"].includes(error?.code)) return json(res, 400, { error: "invalid_cashflow_snapshot" });
      return json(res, 500, { error: "internal" });
    } finally {
      client.release();
    }
  }

  async function handleAgingReceivables(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET") {
      const bucket = url.searchParams.get("bucket");
      if (bucket && !AGING_BUCKETS.has(bucket)) return json(res, 400, { error: "invalid_aging_bucket" });
      let query = `
        SELECT aging.*, receivable.protocol, receivable.status AS receivable_status,
               receivable.amount_cents AS receivable_amount_cents,
               receivable.amount_paid_cents AS receivable_paid_cents
          FROM fin_aging_receivables aging
          JOIN fin_accounts_receivable receivable ON receivable.id = aging.receivable_id
         WHERE 1=1`;
      const params = [];
      if (bucket) {
        query += ` AND aging.bucket=$1`;
        params.push(bucket);
      }
      query += ` ORDER BY aging.competence_date DESC, aging.due_date ASC LIMIT 100`;
      const { rows } = await pool.query(query, params);
      return json(res, 200, {
        aging: rows,
        note: "aging sintético por competência; vencidos e a vencer calculados contra o recebível canônico",
      });
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req, res);
    if (!body) return;
    const receivableId = typeof body.receivable_id === "string" ? body.receivable_id.trim() : "";
    const requestedAccountId = body.client_account_id == null ? null : String(body.client_account_id).trim();
    const competenceDate = body.competence_date;
    const dueDate = body.due_date;
    const amount = integerCents(body.amount_cents, { allowNegative: false });
    const paid = integerCents(body.amount_paid_cents ?? 0, { allowNegative: false });

    if (!isUuid(receivableId)) return json(res, 400, { error: "invalid_receivable_id" });
    if (requestedAccountId !== null && !isUuid(requestedAccountId)) return json(res, 400, { error: "invalid_client_account_id" });
    if (!validDate(competenceDate) || !validDate(dueDate)) return json(res, 400, { error: "invalid_aging_date" });
    if (amount === null || paid === null) return json(res, 400, { error: "invalid_aging_amount" });
    if (paid > amount) return json(res, 400, { error: "amount_paid_exceeds_amount" });

    const competence = new Date(`${competenceDate}T00:00:00Z`);
    const due = new Date(`${dueDate}T00:00:00Z`);
    const diffDays = Math.max(0, Math.round((competence.getTime() - due.getTime()) / (24 * 60 * 60 * 1000)));
    const bucket = diffDays === 0
      ? "a_vencer"
      : diffDays <= 30
        ? "vencido_0_30"
        : diffDays <= 60
          ? "vencido_31_60"
          : diffDays <= 90
            ? "vencido_61_90"
            : "vencido_90_plus";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const receivableResult = await client.query(
        `SELECT id, client_account_id, contract_id, due_date, amount_cents, amount_paid_cents
           FROM fin_accounts_receivable
          WHERE id=$1
          FOR SHARE`,
        [receivableId]
      );
      if (!receivableResult.rows.length) {
        await client.query("ROLLBACK");
        return json(res, 404, { error: "receivable_not_found" });
      }
      const receivable = receivableResult.rows[0];
      if (requestedAccountId && requestedAccountId !== receivable.client_account_id) {
        await client.query("ROLLBACK");
        return json(res, 400, { error: "client_account_mismatch" });
      }
      if (new Date(receivable.due_date).toISOString().slice(0, 10) !== dueDate) {
        await client.query("ROLLBACK");
        return json(res, 400, { error: "due_date_mismatch" });
      }
      if (amount > Number(receivable.amount_cents)) {
        await client.query("ROLLBACK");
        return json(res, 400, { error: "amount_exceeds_receivable" });
      }

      const { rows } = await client.query(
        `INSERT INTO fin_aging_receivables
           (receivable_id, client_account_id, contract_id, bucket, amount_cents,
            amount_paid_cents, competence_date, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [receivable.id, receivable.client_account_id, receivable.contract_id, bucket, amount, paid, competenceDate, dueDate]
      );
      await auditLog({
        action: "fin_aging_create",
        actor: session.identityId || "unknown",
        target: rows[0].id,
        meta: {
          receivable_id: receivable.id,
          competence_date: competenceDate,
          due_date: dueDate,
          bucket,
          days_overdue: diffDays,
          amount_cents: amount,
          amount_paid_cents: paid,
          synthetic: true,
        },
        client,
      });
      await client.query("COMMIT");
      return json(res, 201, {
        aging: rows[0],
        note: "aging sintético criado; bucket calculado e sincronizado ao recebível, sem vencimento automático",
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
      if (error?.code === "23505") return json(res, 409, { error: "already_aged_for_competence" });
      if (["23503", "23514", "22P02", "22007"].includes(error?.code)) return json(res, 400, { error: "invalid_aging_snapshot" });
      return json(res, 500, { error: "internal" });
    } finally {
      client.release();
    }
  }

  async function handleCostImports(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    if (req.method === "GET") {
      const { rows } = await pool.query(
        `SELECT cost_import.*,
                COUNT(cost.id)::int AS allocated_records,
                COALESCE(SUM(cost.amount_cents), 0)::bigint AS allocated_costs_cents
           FROM fin_cost_imports cost_import
           LEFT JOIN fin_costs cost ON cost.import_id=cost_import.id
          GROUP BY cost_import.id
          ORDER BY cost_import.competence_date DESC, cost_import.created_at DESC
          LIMIT 100`
      );
      return json(res, 200, { imports: rows, synthetic: true });
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req, res);
    if (!body) return;
    const source = body.source;
    const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
    const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
    const storageKey = typeof body.storage_key === "string" ? body.storage_key.trim() : "";
    const competenceDate = body.competence_date;
    const totalCosts = integerCents(body.total_costs_cents ?? 0, { allowNegative: false });
    const totalRecords = integerCents(body.total_records ?? 0, { allowNegative: false });
    if (!COST_SOURCES.has(source)) return json(res, 400, { error: "invalid_cost_source" });
    if (!fileName || fileName.length > 500 || fileUrl.length < 5 || fileUrl.length > 1000 || storageKey.length < 5 || storageKey.length > 500) {
      return json(res, 400, { error: "file_metadata_invalid" });
    }
    if (!validDate(competenceDate)) return json(res, 400, { error: "invalid_competence_date" });
    if (totalCosts === null || totalRecords === null) return json(res, 400, { error: "invalid_import_totals" });

    const protocol = generateProtocol("COST-IMP");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO fin_cost_imports
          (protocol, source, file_name, file_url, storage_key, competence_date,
           total_costs_cents, total_records, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [protocol, source, fileName, fileUrl, storageKey, competenceDate, totalCosts, totalRecords, session.identityId || null]
      );
      await auditLog({
        action: "fin_cost_import_create",
        actor: session.identityId || "unknown",
        target: rows[0].id,
        meta: { protocol, source, competence_date: competenceDate, storage_key: storageKey, synthetic: true },
        client,
      });
      await client.query("COMMIT");
      return json(res, 201, {
        import: rows[0],
        synthetic: true,
        note: "metadados de importação sintética registrados; nenhum arquivo externo foi lido",
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
      if (error?.code === "23505") return json(res, 409, { error: "duplicate_storage_key" });
      if (["23503", "23514", "22P02", "22007"].includes(error?.code)) return json(res, 400, { error: "invalid_cost_import" });
      return json(res, 500, { error: "internal" });
    } finally {
      client.release();
    }
  }

  async function handleCosts(req, res) {
    const session = await ensureAuth(req, res, ["admin", "ti", "financeiro"]);
    if (!session) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET") {
      const filters = [
        ["contract_id", url.searchParams.get("contract_id")],
        ["client_account_id", url.searchParams.get("client_account_id")],
        ["post_id", url.searchParams.get("post_id")],
        ["import_id", url.searchParams.get("import_id")],
      ];
      const source = url.searchParams.get("cost_source");
      const competenceDate = url.searchParams.get("competence_date");
      if (filters.some(([, value]) => value && !isUuid(value))) return json(res, 400, { error: "invalid_cost_filter" });
      if (source && !COST_SOURCES.has(source)) return json(res, 400, { error: "invalid_cost_source" });
      if (competenceDate && !validDate(competenceDate)) return json(res, 400, { error: "invalid_competence_date" });
      let query = `SELECT cost.*, account.display_name AS client_name, contract.title AS contract_title, post.name AS post_name
                     FROM fin_costs cost
                     JOIN client_accounts account ON account.id=cost.client_account_id
                     LEFT JOIN client_contracts contract ON contract.id=cost.contract_id
                     LEFT JOIN ops_posts post ON post.id=cost.post_id
                    WHERE 1=1`;
      const params = [];
      for (const [column, value] of filters) {
        if (value) { params.push(value); query += ` AND cost.${column}=$${params.length}`; }
      }
      if (source) { params.push(source); query += ` AND cost.cost_source=$${params.length}`; }
      if (competenceDate) { params.push(competenceDate); query += ` AND cost.competence_date=$${params.length}`; }
      query += ` ORDER BY cost.competence_date DESC, cost.created_at DESC LIMIT 100`;
      const { rows } = await pool.query(query, params);
      return json(res, 200, { costs: rows, synthetic: true, note: "custos sintéticos com rateio documentado" });
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    const body = await readJsonBody(req, res);
    if (!body) return;
    const importId = body.import_id == null || body.import_id === "" ? null : String(body.import_id).trim();
    const accountId = typeof body.client_account_id === "string" ? body.client_account_id.trim() : "";
    const contractId = body.contract_id == null || body.contract_id === "" ? null : String(body.contract_id).trim();
    const postId = body.post_id == null || body.post_id === "" ? null : String(body.post_id).trim();
    const costSource = body.cost_source;
    const competenceDate = body.competence_date;
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const rateioRule = typeof body.rateio_rule === "string" ? body.rateio_rule.trim() : "";
    const rateioPercent = typeof body.rateio_percent === "number" ? body.rateio_percent : Number(body.rateio_percent);
    const amountInput = integerCents(body.amount_cents, { allowNegative: false });
    let sourceAmount = integerCents(body.source_amount_cents, { allowNegative: false });
    const importRecordKey = importId && typeof body.import_record_key === "string" ? body.import_record_key.trim() : null;
    const employeeId = body.source_employee_id == null || body.source_employee_id === "" ? null : String(body.source_employee_id).trim();
    const equipmentId = body.source_equipment_id == null || body.source_equipment_id === "" ? null : String(body.source_equipment_id).trim();
    const supervisionId = body.supervision_id == null || body.supervision_id === "" ? null : String(body.supervision_id).trim();
    const sourceMaterial = body.source_material == null || body.source_material === "" ? null : String(body.source_material).trim();

    if (!isUuid(accountId)) return json(res, 400, { error: "invalid_client_account_id" });
    if ([importId, contractId, postId, employeeId, equipmentId, supervisionId].some(value => value !== null && !isUuid(value))) return json(res, 400, { error: "invalid_cost_reference" });
    if (!COST_SOURCES.has(costSource)) return json(res, 400, { error: "invalid_cost_source" });
    if (!validDate(competenceDate)) return json(res, 400, { error: "invalid_competence_date" });
    if (description.length < 10 || description.length > 1000) return json(res, 400, { error: "description_10_1000" });
    if (rateioRule.length < 10 || rateioRule.length > 1000) return json(res, 400, { error: "rateio_rule_10_1000_required" });
    if (!Number.isFinite(rateioPercent) || rateioPercent <= 0 || rateioPercent > 100 || Math.round(rateioPercent * 100) !== rateioPercent * 100) {
      return json(res, 400, { error: "rateio_percent_0_01_100" });
    }
    if (importId && (!importRecordKey || importRecordKey.length > 200)) return json(res, 400, { error: "import_record_key_required" });
    if (!importId && body.import_record_key != null) return json(res, 400, { error: "import_record_key_without_import" });
    if (sourceMaterial && sourceMaterial.length > 500) return json(res, 400, { error: "source_material_too_long" });

    if (sourceAmount === null) {
      if (amountInput === null || amountInput <= 0) return json(res, 400, { error: "invalid_cost_amount" });
      sourceAmount = Math.round(amountInput * 100 / rateioPercent);
    }
    if (sourceAmount <= 0) return json(res, 400, { error: "invalid_source_amount" });
    const allocatedAmount = Math.round(sourceAmount * rateioPercent / 100);
    if (allocatedAmount <= 0 || (amountInput !== null && amountInput !== allocatedAmount)) return json(res, 400, { error: "allocated_amount_mismatch" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const account = await client.query(`SELECT id FROM client_accounts WHERE id=$1 FOR SHARE`, [accountId]);
      if (!account.rows.length) { await client.query("ROLLBACK"); return json(res, 404, { error: "client_account_not_found" }); }
      if (contractId) {
        const contract = await client.query(`SELECT id FROM client_contracts WHERE id=$1 AND client_account_id=$2 FOR SHARE`, [contractId, accountId]);
        if (!contract.rows.length) { await client.query("ROLLBACK"); return json(res, 400, { error: "contract_account_mismatch" }); }
      }
      if (postId) {
        const post = await client.query(
          `SELECT post.id FROM ops_posts post
             JOIN cli_contract_scopes scope ON scope.post_id=post.id
            WHERE post.id=$1 AND scope.contract_id=$2 AND scope.client_account_id=$3
            FOR SHARE OF post`,
          [postId, contractId, accountId]
        );
        if (!post.rows.length) { await client.query("ROLLBACK"); return json(res, 400, { error: "post_contract_scope_mismatch" }); }
      }
      if (employeeId) {
        const employee = await client.query(`SELECT id FROM hr_employees WHERE id=$1 FOR SHARE`, [employeeId]);
        if (!employee.rows.length) { await client.query("ROLLBACK"); return json(res, 400, { error: "employee_not_found" }); }
      }
      const { rows } = await client.query(
        `INSERT INTO fin_costs
          (import_id, import_record_key, client_account_id, contract_id, post_id,
           cost_source, competence_date, source_amount_cents, amount_cents,
           description, source_employee_id, source_equipment_id, source_material,
           supervision_id, rateio_rule, rateio_percent, rateio_documented, created_by_identity)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17)
         RETURNING *`,
        [importId, importRecordKey, accountId, contractId, postId, costSource, competenceDate,
          sourceAmount, allocatedAmount, description, employeeId, equipmentId, sourceMaterial,
          supervisionId, rateioRule, rateioPercent, session.identityId || null]
      );
      await auditLog({
        action: "fin_cost_create",
        actor: session.identityId || "unknown",
        target: rows[0].id,
        meta: {
          import_id: importId, import_record_key: importRecordKey, client_account_id: accountId,
          contract_id: contractId, post_id: postId, cost_source: costSource,
          competence_date: competenceDate, source_amount_cents: sourceAmount,
          amount_cents: allocatedAmount, rateio_rule: rateioRule,
          rateio_percent: rateioPercent, synthetic: true,
        },
        client,
      });
      await client.query("COMMIT");
      return json(res, 201, {
        cost: rows[0], synthetic: true,
        note: "custo sintético criado com vínculo canônico e rateio documentado",
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (isAuditUnavailable(error)) return json(res, 503, { error: "audit_unavailable" });
      if (error?.code === "23505") return json(res, 409, { error: "duplicate_import_record" });
      if (["23503", "23514", "22P02", "22007", "P0001"].includes(error?.code)) return json(res, 400, { error: "invalid_cost_allocation" });
      return json(res, 500, { error: "internal" });
    } finally {
      client.release();
    }
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
