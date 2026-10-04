// F03 · quarta jornada: conta a receber → baixa → relatório.
//
// Invariantes desta rota canônica (migração 159):
// - negar por padrão: sessão administrativa individual + mesma origem em toda
//   escrita; a autoridade vem de auth_permissions (finance.receivables.read /
//   .write / .settle e finance.reports.read), nunca do rótulo do papel;
// - escopo por conta verificado NO SERVIDOR em cada requisição; ausência de
//   concessão, erro de banco ou escopo fora do alcance respondem fechado;
// - toda transição é transacional: lock consultivo + FOR UPDATE + UPDATE
//   condicionado ao estado anterior, com fin_payments, fin_payment_history,
//   fin_receivable_settlements e auth_access_audit na MESMA transação;
// - idempotência obrigatória por Idempotency-Key: replay idêntico devolve o
//   estado atual, mesma chave com conteúdo divergente responde 409 e não
//   produz efeito material;
// - o relatório é sempre recalculado das fontes canônicas; a emissão é apenas
//   um recibo com o SHA-256 daquele instante, que permite dizer honestamente
//   se o documento emitido ainda confere com o banco.
//
// Nada aqui fala com banco bancário, SMTP ou gateway: a baixa é o registro
// interno do recebimento conferido por uma pessoa autorizada.

import { createHash, randomInt } from "node:crypto";
import { hasPermission } from "./rbac.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const PROTOCOL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PAYMENT_METHODS = new Set(["pix", "boleto", "transferencia", "dinheiro", "cartao", "outro"]);
const SETTLEABLE_STATUS = new Set(["pendente", "parcial", "vencido"]);
const MAX_AMOUNT_CENTS = 100_000_000_00;

export const FINANCE_PERMISSIONS = Object.freeze({
  read: "finance.receivables.read",
  write: "finance.receivables.write",
  settle: "finance.receivables.settle",
  report: "finance.reports.read",
});

class AuditUnavailableError extends Error {
  constructor(cause) {
    super("AUDIT_UNAVAILABLE", { cause });
    this.name = "AuditUnavailableError";
    this.code = "AUDIT_UNAVAILABLE";
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "unknown";
}

function idempotencyKey(req) {
  const value = String(req.headers["idempotency-key"] || "").trim();
  return IDEMPOTENCY_KEY_PATTERN.test(value) ? value : null;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isValidDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function integerCents(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d{1,15}$/.test(value.trim())) return Number(value.trim());
  return null;
}

function protocolFor(prefix) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  let suffix = "";
  for (let index = 0; index < 4; index += 1) suffix += PROTOCOL_ALPHABET[randomInt(PROTOCOL_ALPHABET.length)];
  return `${prefix}-${stamp}-${suffix}`;
}

export function createFinReceivableJourneyApi(ctx) {
  function databaseFailure(res, error, context) {
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && ["42P01", "42703"].includes(error.code);
    const auditUnavailable = error instanceof AuditUnavailableError
      || (error && typeof error === "object" && error.code === "AUDIT_UNAVAILABLE");
    const payload = {
      error: auditUnavailable
        ? "audit_unavailable"
        : unconfigured
          ? "database_not_configured"
          : migrationMissing
            ? "migration_required"
            : "finance_journey_unavailable",
    };
    if (!unconfigured && !migrationMissing && !auditUnavailable) console.error(context, errorMessage(error));
    return ctx.json(res, 503, payload);
  }

  async function audit(db, { actorKind, actorId = null, action, target = null, result, category = "none" }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,$6)",
        [actorKind, actorId, action, target, result, category],
      );
    } catch (error) {
      console.error("Could not record the finance journey audit.", { action, message: errorMessage(error) });
      throw new AuditUnavailableError(error);
    }
  }

  async function rollback(client) {
    if (client) await client.query("ROLLBACK").catch(() => {});
  }

  async function readJsonOr400(req, res) {
    try {
      return await ctx.readJson(req);
    } catch (error) {
      ctx.json(res, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { error: "invalid_request" });
      return undefined;
    }
  }

  function requireSameOrigin(req, res) {
    if (ctx.sameOrigin(req)) return true;
    ctx.json(res, 403, { error: "same_origin_required" });
    return false;
  }

  async function requireStaffSession(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "admin_session_required" });
      return null;
    }
    if (!session.identityId) {
      ctx.json(res, 403, { error: "individual_staff_required" });
      return null;
    }
    return session;
  }

  // Fail-closed: sem concessão ativa (ou com erro de leitura) não há recorte.
  async function readScope(db, identityId, permission) {
    const { rows } = await db.query(
      `SELECT scope_type, scope_id FROM auth_permissions
        WHERE identity_id = $1 AND permission = $2 AND revoked_at IS NULL`,
      [identityId, permission],
    );
    const wide = rows.some(row => row.scope_type === "global" || row.scope_type === "organization");
    const accounts = rows
      .filter(row => row.scope_type === "account" && row.scope_id)
      .map(row => row.scope_id);
    if (!wide && !accounts.length) return null;
    return { wide, accounts, grants: rows };
  }

  function scopeExists(permission, alias = "r") {
    return `EXISTS (
      SELECT 1 FROM auth_permissions p
       WHERE p.identity_id = $1
         AND p.permission = '${permission}'
         AND p.revoked_at IS NULL
         AND (p.scope_type IN ('global','organization')
              OR (p.scope_type = 'account' AND p.scope_id = ${alias}.client_account_id))
    )`;
  }

  function translatePostgres(res, error, context) {
    if (error && typeof error === "object" && String(error.message || "").includes("fin_competence_closed")) {
      return ctx.json(res, 409, { error: "competence_closed" });
    }
    return databaseFailure(res, error, context);
  }

  // ---------- conta a receber canônica ----------

  async function listReceivables(req, res, url, session, db) {
    const status = url.searchParams.get("status");
    if (status && !/^[a-z_]{3,20}$/.test(status)) return ctx.json(res, 400, { error: "invalid_status_filter" });
    const accountId = url.searchParams.get("account");
    if (accountId && !UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
    const competence = url.searchParams.get("competence");
    if (competence && !COMPETENCE_PATTERN.test(competence)) return ctx.json(res, 400, { error: "invalid_competence" });
    try {
      const scope = await readScope(db, session.identityId, FINANCE_PERMISSIONS.read);
      if (!scope) return ctx.json(res, 403, { error: "permission_scope_denied" });
      const values = [session.identityId];
      const conditions = [];
      if (status) {
        values.push(status);
        conditions.push(`r.status = $${values.length}::fin_status`);
      }
      if (accountId) {
        values.push(accountId);
        conditions.push(`r.client_account_id = $${values.length}::uuid`);
      }
      if (competence) {
        values.push(`${competence}-01`);
        conditions.push(`date_trunc('month', r.competence_date) = date_trunc('month', $${values.length}::date)`);
      }
      const extra = conditions.length ? `AND ${conditions.join(" AND ")}` : "";
      const result = await db.query(
        `SELECT r.id, r.protocol, r.client_account_id, a.display_name AS account_name, r.contract_id,
                r.competence_date, r.due_date, r.amount_cents, r.amount_paid_cents,
                (r.amount_cents - r.amount_paid_cents) AS amount_remaining_cents,
                r.status, r.description, r.created_at, r.paid_at,
                COALESCE(trail.rows, '[]'::jsonb) AS settlements
           FROM fin_accounts_receivable r
           JOIN client_accounts a ON a.id = r.client_account_id
           LEFT JOIN LATERAL (
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'amountCents', s.amount_cents,
                        'previousStatus', s.previous_status,
                        'nextStatus', s.next_status,
                        'paymentMethod', s.payment_method,
                        'reason', s.reason,
                        'createdAt', s.created_at
                      ) ORDER BY s.created_at ASC
                    ) AS rows
               FROM fin_receivable_settlements s
              WHERE s.receivable_id = r.id
           ) trail ON TRUE
          WHERE ${scopeExists(FINANCE_PERMISSIONS.read)} ${extra}
          ORDER BY r.competence_date DESC, r.created_at DESC
          LIMIT 200`,
        values,
      );
      return ctx.json(
        res,
        200,
        {
          receivables: result.rows,
          grants: scope.grants,
          scope: "permissões ativas de finance.receivables.read",
        },
        { "Cache-Control": "private, no-store" },
      );
    } catch (error) {
      return databaseFailure(res, error, "Could not list the scoped receivable queue.");
    }
  }

  async function openReceivable(req, res, session, db) {
    if (!requireSameOrigin(req, res)) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const accountId = String(body?.accountId || "");
    if (!UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
    const contractId = body?.contractId == null || body.contractId === "" ? null : String(body.contractId);
    if (contractId !== null && !UUID_PATTERN.test(contractId)) return ctx.json(res, 400, { error: "invalid_contract_id" });
    const competenceDate = String(body?.competenceDate || "");
    const dueDate = String(body?.dueDate || "");
    if (!isValidDate(competenceDate) || !isValidDate(dueDate)) return ctx.json(res, 400, { error: "invalid_receivable_dates" });
    if (dueDate < competenceDate) return ctx.json(res, 400, { error: "due_before_competence" });
    const amountCents = integerCents(body?.amountCents);
    if (amountCents === null || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
      return ctx.json(res, 400, { error: "receivable_amount_invalid" });
    }
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    if (description.length < 10 || description.length > 1000) return ctx.json(res, 400, { error: "receivable_description_invalid" });
    const requestKey = idempotencyKey(req);
    if (!requestKey) return ctx.json(res, 400, { error: "idempotency_key_required_or_invalid" });

    const allowed = await hasPermission(db, {
      identityId: session.identityId,
      permission: FINANCE_PERMISSIONS.write,
      accountId,
    });
    if (!allowed) return ctx.json(res, 403, { error: "permission_scope_denied" });

    const requestFingerprint = fingerprint({ accountId, contractId, competenceDate, dueDate, amountCents, description });
    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`finance-receivable-open:${session.identityId}:${requestKey}`]);
      const replay = await client.query(
        `SELECT id, protocol, status, canonical_request_fingerprint
           FROM fin_accounts_receivable
          WHERE created_by_identity = $1 AND canonical_idempotency_key = $2`,
        [session.identityId, requestKey],
      );
      if (replay.rows[0]) {
        const prior = replay.rows[0];
        await client.query("COMMIT");
        if (prior.canonical_request_fingerprint !== requestFingerprint) {
          return ctx.json(res, 409, { error: "idempotency_conflict" });
        }
        return ctx.json(res, 200, {
          ok: true,
          receivableId: prior.id,
          protocol: prior.protocol,
          status: prior.status,
          replayed: true,
        });
      }
      const account = await client.query("SELECT id FROM client_accounts WHERE id = $1", [accountId]);
      if (!account.rows[0]) {
        await client.query("ROLLBACK");
        return ctx.json(res, 404, { error: "client_account_not_found" });
      }
      if (contractId) {
        const contract = await client.query(
          "SELECT id FROM client_contracts WHERE id = $1 AND client_account_id = $2",
          [contractId, accountId],
        );
        if (!contract.rows[0]) {
          await client.query("ROLLBACK");
          return ctx.json(res, 409, { error: "contract_account_mismatch" });
        }
      }
      let protocol = protocolFor("REC-FIN");
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const taken = await client.query("SELECT 1 FROM fin_accounts_receivable WHERE protocol = $1", [protocol]);
        if (!taken.rows[0]) break;
        protocol = protocolFor("REC-FIN");
      }
      const inserted = await client.query(
        `INSERT INTO fin_accounts_receivable
           (protocol, client_account_id, contract_id, competence_date, due_date, amount_cents,
            description, status, created_by_identity, canonical_idempotency_key, canonical_request_fingerprint)
         VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,'pendente',$8,$9,$10)
         RETURNING id, protocol, status, competence_date, due_date, amount_cents`,
        [protocol, accountId, contractId, competenceDate, dueDate, amountCents, description, session.identityId, requestKey, requestFingerprint],
      );
      const receivable = inserted.rows[0];
      await client.query(
        `INSERT INTO fin_payment_history
           (account_type, receivable_id, previous_status, next_status, previous_paid_cents, next_paid_cents, changed_by_identity, reason)
         VALUES ('receber',$1,NULL,'pendente',0,0,$2,$3)`,
        [receivable.id, session.identityId, `Abertura canônica F03: ${description}`.slice(0, 1000)],
      );
      await audit(client, {
        actorKind: session.role,
        actorId: session.identityId,
        action: "receivable_open",
        target: receivable.id,
        result: "allowed",
      });
      await client.query("COMMIT");
      return ctx.json(res, 201, {
        ok: true,
        receivableId: receivable.id,
        protocol: receivable.protocol,
        status: receivable.status,
        replayed: false,
      });
    } catch (error) {
      await rollback(client);
      if (error && typeof error === "object" && error.code === "23505") {
        const prior = await db.query(
          `SELECT id, protocol, status, canonical_request_fingerprint FROM fin_accounts_receivable
            WHERE created_by_identity = $1 AND canonical_idempotency_key = $2`,
          [session.identityId, requestKey],
        ).catch(() => ({ rows: [] }));
        if (prior.rows[0]) {
          return prior.rows[0].canonical_request_fingerprint !== requestFingerprint
            ? ctx.json(res, 409, { error: "idempotency_conflict" })
            : ctx.json(res, 200, {
              ok: true,
              receivableId: prior.rows[0].id,
              protocol: prior.rows[0].protocol,
              status: prior.rows[0].status,
              replayed: true,
            });
        }
      }
      return translatePostgres(res, error, "Could not open the canonical receivable.");
    } finally {
      client?.release();
    }
  }

  async function settleReceivable(req, res, session, db) {
    if (!requireSameOrigin(req, res)) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const receivableId = String(body?.id || "");
    if (!UUID_PATTERN.test(receivableId)) return ctx.json(res, 400, { error: "invalid_receivable_id" });
    const action = String(body?.action || "").toLowerCase();
    if (action !== "baixar") return ctx.json(res, 400, { error: "invalid_settlement_action" });
    const amountCents = integerCents(body?.amountCents);
    if (amountCents === null || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
      return ctx.json(res, 400, { error: "settlement_amount_invalid" });
    }
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 1000) return ctx.json(res, 400, { error: "settlement_reason_invalid" });
    const paymentMethod = body?.paymentMethod == null ? "pix" : String(body.paymentMethod);
    if (!PAYMENT_METHODS.has(paymentMethod)) return ctx.json(res, 400, { error: "invalid_payment_method" });
    const requestKey = idempotencyKey(req);
    if (!requestKey) return ctx.json(res, 400, { error: "idempotency_key_required_or_invalid" });

    let target;
    try {
      const found = await db.query("SELECT id, client_account_id FROM fin_accounts_receivable WHERE id = $1", [receivableId]);
      target = found.rows[0];
    } catch (error) {
      return databaseFailure(res, error, "Could not load the receivable for settlement.");
    }
    if (!target) return ctx.json(res, 404, { error: "receivable_not_found" });
    const allowed = await hasPermission(db, {
      identityId: session.identityId,
      permission: FINANCE_PERMISSIONS.settle,
      accountId: target.client_account_id,
    });
    if (!allowed) return ctx.json(res, 403, { error: "permission_scope_denied" });

    const requestFingerprint = fingerprint({ receivableId, action, amountCents, reason, paymentMethod });
    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`finance-receivable-settle:${receivableId}:${requestKey}`]);
      const locked = await client.query(
        `SELECT id, status, amount_cents, amount_paid_cents FROM fin_accounts_receivable WHERE id = $1 FOR UPDATE`,
        [receivableId],
      );
      const current = locked.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return ctx.json(res, 404, { error: "receivable_not_found" });
      }
      const replay = await client.query(
        `SELECT request_fingerprint FROM fin_receivable_settlements WHERE receivable_id = $1 AND idempotency_key = $2`,
        [receivableId, requestKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== requestFingerprint) {
          await client.query("ROLLBACK");
          return ctx.json(res, 409, { error: "idempotency_conflict" });
        }
        await client.query("COMMIT");
        return ctx.json(res, 200, {
          ok: true,
          receivableId,
          status: current.status,
          paidCents: Number(current.amount_paid_cents),
          remainingCents: Number(current.amount_cents) - Number(current.amount_paid_cents),
          replayed: true,
        });
      }
      if (!SETTLEABLE_STATUS.has(current.status)) {
        await client.query("ROLLBACK");
        return ctx.json(res, 409, { error: "receivable_settlement_not_allowed", status: current.status });
      }
      const previousPaid = Number(current.amount_paid_cents);
      const total = Number(current.amount_cents);
      const remaining = total - previousPaid;
      if (amountCents > remaining) {
        await client.query("ROLLBACK");
        return ctx.json(res, 409, { error: "settlement_exceeds_remaining", remainingCents: remaining });
      }
      const nextPaid = previousPaid + amountCents;
      const nextStatus = nextPaid >= total ? "recebido" : "parcial";
      const updated = await client.query(
        `UPDATE fin_accounts_receivable
            SET amount_paid_cents = $2,
                status = $3::fin_status,
                paid_at = CASE WHEN $3 = 'recebido' THEN NOW() ELSE paid_at END,
                updated_at = NOW()
          WHERE id = $1 AND status = $4::fin_status AND amount_paid_cents = $5
          RETURNING id`,
        [receivableId, nextPaid, nextStatus, current.status, previousPaid],
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return ctx.json(res, 409, { error: "settlement_conflict" });
      }
      const payment = await client.query(
        `INSERT INTO fin_payments
           (account_type, receivable_id, amount_cents, payment_method, is_partial, notes, created_by_identity)
         VALUES ('receber',$1,$2,$3::fin_payment_method,$4,$5,$6)
         RETURNING id`,
        [receivableId, amountCents, paymentMethod, nextStatus === "parcial", reason, session.identityId],
      );
      await client.query(
        `INSERT INTO fin_payment_history
           (account_type, receivable_id, previous_status, next_status, previous_paid_cents, next_paid_cents,
            payment_id, changed_by_identity, reason)
         VALUES ('receber',$1,$2::fin_status,$3::fin_status,$4,$5,$6,$7,$8)`,
        [receivableId, current.status, nextStatus, previousPaid, nextPaid, payment.rows[0].id, session.identityId, reason],
      );
      await client.query(
        `INSERT INTO fin_receivable_settlements
           (receivable_id, payment_id, amount_cents, previous_status, next_status, previous_paid_cents, next_paid_cents,
            payment_method, settled_by_identity, settled_by_role, reason, idempotency_key, request_fingerprint)
         VALUES ($1,$2,$3,$4::fin_status,$5::fin_status,$6,$7,$8::fin_payment_method,$9,$10,$11,$12,$13)`,
        [receivableId, payment.rows[0].id, amountCents, current.status, nextStatus, previousPaid, nextPaid,
          paymentMethod, session.identityId, session.role, reason, requestKey, requestFingerprint],
      );
      await audit(client, {
        actorKind: session.role,
        actorId: session.identityId,
        action: "receivable_settle",
        target: receivableId,
        result: "allowed",
      });
      await client.query("COMMIT");
      return ctx.json(res, 200, {
        ok: true,
        receivableId,
        previousStatus: current.status,
        status: nextStatus,
        paidCents: nextPaid,
        remainingCents: total - nextPaid,
        replayed: false,
      });
    } catch (error) {
      await rollback(client);
      if (error && typeof error === "object" && error.code === "23505") {
        const prior = await db.query(
          `SELECT request_fingerprint FROM fin_receivable_settlements WHERE receivable_id = $1 AND idempotency_key = $2`,
          [receivableId, requestKey],
        ).catch(() => ({ rows: [] }));
        if (prior.rows[0]) {
          if (prior.rows[0].request_fingerprint !== requestFingerprint) {
            return ctx.json(res, 409, { error: "idempotency_conflict" });
          }
          const fresh = await db.query(
            "SELECT status, amount_cents, amount_paid_cents FROM fin_accounts_receivable WHERE id = $1",
            [receivableId],
          ).catch(() => ({ rows: [] }));
          const row = fresh.rows[0];
          return ctx.json(res, 200, {
            ok: true,
            receivableId,
            status: row?.status ?? null,
            paidCents: row ? Number(row.amount_paid_cents) : null,
            remainingCents: row ? Number(row.amount_cents) - Number(row.amount_paid_cents) : null,
            replayed: true,
          });
        }
      }
      return translatePostgres(res, error, "Could not settle the canonical receivable.");
    } finally {
      client?.release();
    }
  }

  async function handleReceivables(req, res, url) {
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const db = ctx.getPool();
    if (req.method === "GET") return listReceivables(req, res, url, session, db);
    if (req.method === "POST") return openReceivable(req, res, session, db);
    if (req.method === "PATCH") return settleReceivable(req, res, session, db);
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST, PATCH" });
  }

  // ---------- relatório ----------

  async function computeReport(db, { identityId, competence, accountId }) {
    const values = [identityId, `${competence}-01`];
    let accountFilter = "";
    if (accountId) {
      values.push(accountId);
      accountFilter = `AND r.client_account_id = $${values.length}::uuid`;
    }
    const { rows } = await db.query(
      `WITH scoped AS (
         SELECT r.id, r.client_account_id, r.amount_cents, r.amount_paid_cents
           FROM fin_accounts_receivable r
          WHERE date_trunc('month', r.competence_date) = date_trunc('month', $2::date)
            AND r.status <> 'cancelado'
            AND ${scopeExists(FINANCE_PERMISSIONS.report)}
            ${accountFilter}
       ), per_account AS (
         SELECT s.client_account_id AS account_id,
                count(*)::int AS receivable_count,
                sum(s.amount_cents)::bigint AS total_cents,
                sum(s.amount_paid_cents)::bigint AS settled_cents,
                sum(s.amount_cents - s.amount_paid_cents)::bigint AS open_cents
           FROM scoped s
          GROUP BY s.client_account_id
       ), per_account_settlements AS (
         SELECT sc.client_account_id AS account_id, count(*)::int AS settlement_count
           FROM fin_receivable_settlements st
           JOIN scoped sc ON sc.id = st.receivable_id
          GROUP BY sc.client_account_id
       )
       SELECT p.account_id, a.display_name AS account_name, p.receivable_count,
              p.total_cents, p.settled_cents, p.open_cents,
              COALESCE(t.settlement_count, 0) AS settlement_count
         FROM per_account p
         JOIN client_accounts a ON a.id = p.account_id
         LEFT JOIN per_account_settlements t ON t.account_id = p.account_id
        ORDER BY p.account_id ASC`,
      values,
    );
    const accounts = rows.map(row => ({
      accountId: row.account_id,
      accountName: row.account_name,
      receivableCount: Number(row.receivable_count),
      totalCents: Number(row.total_cents),
      settledCents: Number(row.settled_cents),
      openCents: Number(row.open_cents),
      settlementCount: Number(row.settlement_count),
    }));
    const totals = accounts.reduce((acc, item) => ({
      accountCount: acc.accountCount + 1,
      receivableCount: acc.receivableCount + item.receivableCount,
      settlementCount: acc.settlementCount + item.settlementCount,
      totalReceivableCents: acc.totalReceivableCents + item.totalCents,
      totalSettledCents: acc.totalSettledCents + item.settledCents,
      totalOpenCents: acc.totalOpenCents + item.openCents,
    }), {
      accountCount: 0,
      receivableCount: 0,
      settlementCount: 0,
      totalReceivableCents: 0,
      totalSettledCents: 0,
      totalOpenCents: 0,
    });
    // Só números e identificadores entram na impressão: o nome de exibição
    // pode mudar sem que o relatório financeiro tenha mudado.
    const hashable = {
      competence,
      accountFilter: accountId || null,
      accounts: accounts.map(({ accountId: id, receivableCount, totalCents, settledCents, openCents, settlementCount }) =>
        ({ accountId: id, receivableCount, totalCents, settledCents, openCents, settlementCount })),
      totals,
    };
    return { accounts, totals, payloadSha256: fingerprint(hashable) };
  }

  async function handleReceivableReport(req, res, url) {
    const session = await requireStaffSession(req, res);
    if (!session) return;
    if (!["GET", "POST"].includes(req.method)) {
      return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
    }
    const db = ctx.getPool();
    const isEmission = req.method === "POST";
    if (isEmission && !requireSameOrigin(req, res)) return;
    const body = isEmission ? await readJsonOr400(req, res) : {};
    if (body === undefined) return;

    const competence = isEmission ? String(body?.competence || "") : String(url.searchParams.get("competence") || "");
    if (!COMPETENCE_PATTERN.test(competence)) return ctx.json(res, 400, { error: "invalid_competence" });
    const rawAccount = isEmission ? body?.accountId : url.searchParams.get("account");
    const accountId = rawAccount == null || rawAccount === "" ? null : String(rawAccount);
    if (accountId !== null && !UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });

    let scope;
    try {
      scope = await readScope(db, session.identityId, FINANCE_PERMISSIONS.report);
    } catch (error) {
      return databaseFailure(res, error, "Could not read the finance report scope.");
    }
    if (!scope) return ctx.json(res, 403, { error: "permission_scope_denied" });
    if (accountId && !scope.wide && !scope.accounts.includes(accountId)) {
      return ctx.json(res, 403, { error: "permission_scope_denied" });
    }

    let report;
    try {
      report = await computeReport(db, { identityId: session.identityId, competence, accountId });
    } catch (error) {
      return databaseFailure(res, error, "Could not compute the canonical receivable report.");
    }

    if (!isEmission) {
      try {
        const emissions = await db.query(
          `SELECT protocol, competence_month, client_account_id, account_count, receivable_count, settlement_count,
                  total_receivable_cents, total_settled_cents, total_open_cents, payload_sha256, note, created_at
             FROM fin_receivable_report_emissions
            WHERE competence_month = date_trunc('month', $1::date)::date
              AND emitted_by_identity = $2
            ORDER BY created_at DESC LIMIT 20`,
          [`${competence}-01`, session.identityId],
        );
        return ctx.json(
          res,
          200,
          {
            competence,
            accountFilter: accountId,
            accounts: report.accounts,
            totals: report.totals,
            payloadSha256: report.payloadSha256,
            emissions: emissions.rows.map(row => ({
              ...row,
              matchesCurrent: row.payload_sha256 === report.payloadSha256,
            })),
            source: "calculado de fin_accounts_receivable e fin_receivable_settlements; nenhum total é digitado",
          },
          { "Cache-Control": "private, no-store" },
        );
      } catch (error) {
        return databaseFailure(res, error, "Could not list the receivable report emissions.");
      }
    }

    const note = body?.note == null || body.note === "" ? null : String(body.note).trim();
    if (note !== null && (note.length < 10 || note.length > 1000)) return ctx.json(res, 400, { error: "invalid_report_note" });
    const requestKey = idempotencyKey(req);
    if (!requestKey) return ctx.json(res, 400, { error: "idempotency_key_required_or_invalid" });
    const requestFingerprint = fingerprint({ competence, accountId, note });
    const scopeAccountIds = accountId ? [accountId] : report.accounts.map(item => item.accountId);

    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`finance-report-emit:${session.identityId}:${requestKey}`]);
      const replay = await client.query(
        `SELECT protocol, payload_sha256, request_fingerprint, created_at
           FROM fin_receivable_report_emissions
          WHERE emitted_by_identity = $1 AND idempotency_key = $2`,
        [session.identityId, requestKey],
      );
      if (replay.rows[0]) {
        const prior = replay.rows[0];
        await client.query("COMMIT");
        if (prior.request_fingerprint !== requestFingerprint) {
          return ctx.json(res, 409, { error: "idempotency_conflict" });
        }
        return ctx.json(res, 200, {
          ok: true,
          protocol: prior.protocol,
          competence,
          payloadSha256: prior.payload_sha256,
          matchesCurrent: prior.payload_sha256 === report.payloadSha256,
          replayed: true,
        });
      }
      let protocol = protocolFor("REL-FIN");
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const taken = await client.query("SELECT 1 FROM fin_receivable_report_emissions WHERE protocol = $1", [protocol]);
        if (!taken.rows[0]) break;
        protocol = protocolFor("REL-FIN");
      }
      const emission = await client.query(
        `INSERT INTO fin_receivable_report_emissions
           (protocol, competence_month, client_account_id, scope_account_ids, account_count, receivable_count,
            settlement_count, total_receivable_cents, total_settled_cents, total_open_cents, payload_sha256, note,
            emitted_by_identity, emitted_by_role, idempotency_key, request_fingerprint)
         VALUES ($1, date_trunc('month', $2::date)::date, $3, $4::uuid[], $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id, protocol, created_at`,
        [
          protocol, `${competence}-01`, accountId, scopeAccountIds,
          report.totals.accountCount, report.totals.receivableCount, report.totals.settlementCount,
          report.totals.totalReceivableCents, report.totals.totalSettledCents, report.totals.totalOpenCents,
          report.payloadSha256, note, session.identityId, session.role, requestKey, requestFingerprint,
        ],
      );
      await audit(client, {
        actorKind: session.role,
        actorId: session.identityId,
        action: "receivable_report_emit",
        target: emission.rows[0].id,
        result: "allowed",
      });
      await client.query("COMMIT");
      return ctx.json(res, 201, {
        ok: true,
        protocol: emission.rows[0].protocol,
        competence,
        accountFilter: accountId,
        totals: report.totals,
        accounts: report.accounts,
        payloadSha256: report.payloadSha256,
        matchesCurrent: true,
        replayed: false,
      });
    } catch (error) {
      await rollback(client);
      if (error && typeof error === "object" && error.code === "23505") {
        const prior = await db.query(
          `SELECT protocol, payload_sha256, request_fingerprint FROM fin_receivable_report_emissions
            WHERE emitted_by_identity = $1 AND idempotency_key = $2`,
          [session.identityId, requestKey],
        ).catch(() => ({ rows: [] }));
        if (prior.rows[0]) {
          return prior.rows[0].request_fingerprint !== requestFingerprint
            ? ctx.json(res, 409, { error: "idempotency_conflict" })
            : ctx.json(res, 200, {
              ok: true,
              protocol: prior.rows[0].protocol,
              competence,
              payloadSha256: prior.rows[0].payload_sha256,
              matchesCurrent: prior.rows[0].payload_sha256 === report.payloadSha256,
              replayed: true,
            });
        }
      }
      return databaseFailure(res, error, "Could not emit the canonical receivable report.");
    } finally {
      client?.release();
    }
  }

  return { handleReceivables, handleReceivableReport };
}
