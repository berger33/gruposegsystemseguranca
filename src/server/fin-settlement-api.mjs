// F03 — jornada canônica financeira: conta → baixa → relatório.
//
// Invariantes aplicados (mesma régua das fatias F03 anteriores):
// - negar por padrão: sessão administrativa individual + concessão granular
//   `finance.settlements.read` / `finance.settlements.write` verificada no
//   servidor a cada requisição; erro de banco nunca mantém acesso amplo;
// - o escopo por conta de cliente é decidido pelo servidor, nunca pelo corpo
//   da requisição; conta de outro cliente não aparece na fila nem aceita baixa;
// - toda escrita exige `Idempotency-Key`: replay idêntico devolve o estado
//   atual, mesma chave com conteúdo divergente responde 409 sem efeito;
// - a baixa roda em uma transação com lock consultivo + `FOR UPDATE` +
//   `UPDATE ... WHERE status`, grava pagamento, histórico imutável, ledger de
//   idempotência e auditoria juntos: falha de auditoria desfaz tudo (503);
// - a máquina de estados é estrita: `pendente|vencido|parcial` → `parcial` ou
//   `recebido|pago`. Conta liquidada, cancelada ou estornada não aceita baixa;
//   baixa acima do saldo é recusada (409), nunca truncada em silêncio;
// - o relatório é calculado em tempo real sobre as fontes canônicas
//   (fin_accounts_receivable/fin_accounts_payable/fin_payments). Não há
//   integração bancária, exportação assinada, e-mail ou IA nesta rota.

import { createHash, randomInt } from "node:crypto";
import { hasPermission } from "./rbac.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const PROTOCOL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PAYMENT_METHODS = ["pix", "boleto", "transferencia", "dinheiro", "cartao", "outro"];
const SETTLEABLE_STATUS = ["pendente", "vencido", "parcial"];
const MAX_AMOUNT_CENTS = 100_000_000_000;

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

function protocol(prefix) {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  let suffix = "";
  for (let index = 0; index < 4; index += 1) suffix += PROTOCOL_ALPHABET[randomInt(PROTOCOL_ALPHABET.length)];
  return `${prefix}-${stamp}-${suffix}`;
}

function validDate(value) {
  if (!DATE_PATTERN.test(String(value || ""))) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return String(value);
}

function tableOf(kind) {
  return kind === "receber" ? "fin_accounts_receivable" : "fin_accounts_payable";
}

function settledStatusOf(kind) {
  return kind === "receber" ? "recebido" : "pago";
}

export function createFinSettlementApi(ctx) {
  function databaseFailure(res, error, context) {
    const unconfigured = error instanceof Error && error.message === "DATABASE_NOT_CONFIGURED";
    const migrationMissing = error && typeof error === "object" && ["42P01", "42703"].includes(error.code);
    const auditUnavailable = error instanceof AuditUnavailableError
      || (error && typeof error === "object" && error.code === "AUDIT_UNAVAILABLE");
    if (!unconfigured && !migrationMissing && !auditUnavailable) console.error(context, errorMessage(error));
    return ctx.json(res, 503, {
      error: auditUnavailable
        ? "audit_unavailable"
        : unconfigured
          ? "database_not_configured"
          : migrationMissing
            ? "migration_required"
            : "finance_settlement_unavailable",
    });
  }

  async function audit(db, { actorKind, actorId, action, target, result, category = "none" }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,$6)",
        [actorKind, actorId, action, target, result, category],
      );
    } catch (error) {
      console.error("Could not record the finance settlement audit.", { action, message: errorMessage(error) });
      throw new AuditUnavailableError(error);
    }
  }

  async function rollback(client) {
    if (client) await client.query("ROLLBACK").catch(() => {});
  }

  function requireSameOrigin(req, res) {
    if (ctx.sameOrigin(req)) return true;
    ctx.json(res, 403, { error: "same_origin_required" });
    return false;
  }

  async function readJsonOr400(req, res) {
    try {
      return await ctx.readJson(req);
    } catch (error) {
      ctx.json(res, error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { error: "invalid_request" });
      return undefined;
    }
  }

  // Sessão administrativa individual. O papel sozinho não autoriza nada: a
  // autoridade fina vive em auth_permissions e é checada em cada rota.
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

  async function readGrants(db, identityId, permission) {
    const grants = await db.query(
      `SELECT scope_type, scope_id FROM auth_permissions
        WHERE identity_id = $1 AND permission = $2 AND revoked_at IS NULL`,
      [identityId, permission],
    );
    return grants.rows;
  }

  async function loadAccount(db, kind, id) {
    const found = await db.query(
      `SELECT id, protocol, client_account_id, status, amount_cents, amount_paid_cents,
              competence_date::text AS competence_date, due_date::text AS due_date
         FROM ${tableOf(kind)} WHERE id = $1`,
      [id],
    );
    return found.rows[0] || null;
  }

  // A fila canônica só mostra o recorte das concessões reais. Sem concessão
  // ativa de leitura a resposta é 403 — jamais uma lista vazia que pareça
  // "nada para fazer".
  async function listSettlements(req, res, url, session) {
    const db = ctx.getPool();
    const kind = url.searchParams.get("kind");
    if (kind && !["receber", "pagar"].includes(kind)) return ctx.json(res, 400, { error: "invalid_kind_filter" });
    const accountId = url.searchParams.get("account");
    if (accountId && !UUID_PATTERN.test(accountId)) return ctx.json(res, 400, { error: "invalid_account_id" });
    try {
      const grants = await readGrants(db, session.identityId, "finance.settlements.read");
      if (!grants.length) return ctx.json(res, 403, { error: "permission_scope_denied" });
      const values = [session.identityId];
      const filters = [];
      if (accountId) {
        values.push(accountId);
        filters.push(`client_account_id = $${values.length}`);
      }
      if (kind) {
        values.push(kind);
        filters.push(`kind = $${values.length}::fin_account_type`);
      }
      const extra = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const result = await db.query(
        `WITH scoped AS (
           SELECT 'receber'::fin_account_type AS kind, r.id, r.protocol, r.client_account_id,
                  a.display_name AS account_name, r.contract_id,
                  r.competence_date::text AS competence_date, r.due_date::text AS due_date,
                  r.amount_cents, r.amount_paid_cents, r.amount_remaining_cents, r.status::text AS status,
                  r.description, r.paid_at, r.created_at,
                  (c.id IS NOT NULL) AS canonical
             FROM fin_accounts_receivable r
             LEFT JOIN client_accounts a ON a.id = r.client_account_id
             LEFT JOIN fin_canonical_accounts c ON c.receivable_id = r.id
            WHERE EXISTS (
              SELECT 1 FROM auth_permissions p
               WHERE p.identity_id = $1 AND p.permission = 'finance.settlements.read'
                 AND p.revoked_at IS NULL
                 AND (p.scope_type IN ('global','organization')
                      OR (p.scope_type = 'account' AND p.scope_id = r.client_account_id))
            )
           UNION ALL
           SELECT 'pagar'::fin_account_type AS kind, p2.id, p2.protocol, p2.client_account_id,
                  a.display_name AS account_name, p2.contract_id,
                  p2.competence_date::text AS competence_date, p2.due_date::text AS due_date,
                  p2.amount_cents, p2.amount_paid_cents, p2.amount_remaining_cents, p2.status::text AS status,
                  p2.description, p2.paid_at, p2.created_at,
                  (c.id IS NOT NULL) AS canonical
             FROM fin_accounts_payable p2
             LEFT JOIN client_accounts a ON a.id = p2.client_account_id
             LEFT JOIN fin_canonical_accounts c ON c.payable_id = p2.id
            WHERE EXISTS (
              SELECT 1 FROM auth_permissions p
               WHERE p.identity_id = $1 AND p.permission = 'finance.settlements.read'
                 AND p.revoked_at IS NULL
                 AND (p.scope_type IN ('global','organization')
                      OR (p.scope_type = 'account' AND p.scope_id = p2.client_account_id))
            )
         )
         SELECT * FROM scoped ${extra} ORDER BY due_date ASC, created_at ASC LIMIT 200`,
        values,
      );
      return ctx.json(
        res,
        200,
        {
          accounts: result.rows,
          grants,
          scope: "permissões ativas de finance.settlements.read",
        },
        { "Cache-Control": "private, no-store" },
      );
    } catch (error) {
      return databaseFailure(res, error, "Could not list the scoped finance settlement queue.");
    }
  }

  // Abertura canônica da conta. A conta nasce sob governança (410 no legado),
  // com ledger de idempotência, histórico de abertura e auditoria na mesma
  // transação.
  async function openAccount(req, res, session) {
    if (!requireSameOrigin(req, res)) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const kind = String(body?.kind || "receber");
    if (!["receber", "pagar"].includes(kind)) return ctx.json(res, 400, { error: "invalid_kind" });
    const accountIdRaw = body?.accountId ? String(body.accountId) : "";
    if (accountIdRaw && !UUID_PATTERN.test(accountIdRaw)) return ctx.json(res, 400, { error: "invalid_account_id" });
    if (kind === "receber" && !accountIdRaw) return ctx.json(res, 400, { error: "account_id_required" });
    const accountId = accountIdRaw || null;
    const contractId = body?.contractId ? String(body.contractId) : null;
    if (contractId && !UUID_PATTERN.test(contractId)) return ctx.json(res, 400, { error: "invalid_contract_id" });
    const competenceDate = validDate(body?.competenceDate);
    const dueDate = validDate(body?.dueDate);
    if (!competenceDate || !dueDate) return ctx.json(res, 400, { error: "invalid_dates" });
    if (dueDate < competenceDate) return ctx.json(res, 400, { error: "due_before_competence" });
    const amountCents = Number(body?.amountCents);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
      return ctx.json(res, 400, { error: "invalid_amount_cents" });
    }
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    if (description.length < 10 || description.length > 1000) return ctx.json(res, 400, { error: "description_invalid" });
    const requestKey = idempotencyKey(req);
    if (!requestKey) return ctx.json(res, 400, { error: "idempotency_key_required_or_invalid" });

    const db = ctx.getPool();
    let allowed;
    try {
      if (accountId) {
        const exists = await db.query("SELECT id FROM client_accounts WHERE id = $1", [accountId]);
        if (!exists.rows[0]) return ctx.json(res, 404, { error: "account_not_found" });
      }
      allowed = await hasPermission(db, {
        identityId: session.identityId,
        permission: "finance.settlements.write",
        accountId,
      });
    } catch (error) {
      return databaseFailure(res, error, "Could not verify the finance settlement scope.");
    }
    if (!allowed) return ctx.json(res, 403, { error: "permission_scope_denied" });

    const requestFingerprint = fingerprint({ kind, accountId, contractId, competenceDate, dueDate, amountCents, description });
    const column = kind === "receber" ? "receivable_id" : "payable_id";
    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`fin-account-open:${requestKey}`]);
      const replay = await client.query(
        `SELECT request_fingerprint, receivable_id, payable_id, result_status
           FROM fin_settlement_requests WHERE request_kind = 'account_open' AND idempotency_key = $1`,
        [requestKey],
      );
      if (replay.rows[0]) {
        const previous = replay.rows[0];
        await client.query("ROLLBACK");
        if (previous.request_fingerprint !== requestFingerprint) return ctx.json(res, 409, { error: "idempotency_conflict" });
        const id = previous.receivable_id || previous.payable_id;
        const current = await loadAccount(db, kind, id);
        return ctx.json(res, 200, {
          ok: true, kind, id, protocol: current?.protocol ?? null, status: current?.status ?? previous.result_status, replayed: true,
        });
      }

      let inserted = null;
      for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
        await client.query("SAVEPOINT protocol_attempt");
        try {
          inserted = kind === "receber"
            ? (await client.query(
              `INSERT INTO fin_accounts_receivable
                 (protocol, client_account_id, contract_id, competence_date, due_date, amount_cents, description, created_by_identity)
               VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8)
               RETURNING id, protocol, status::text AS status`,
              [protocol("REC-FIN"), accountId, contractId, competenceDate, dueDate, amountCents, description, session.identityId],
            )).rows[0]
            : (await client.query(
              `INSERT INTO fin_accounts_payable
                 (protocol, client_account_id, contract_id, competence_date, due_date, amount_cents, description, created_by_identity)
               VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8)
               RETURNING id, protocol, status::text AS status`,
              [protocol("PAG-FIN"), accountId, contractId, competenceDate, dueDate, amountCents, description, session.identityId],
            )).rows[0];
          await client.query("RELEASE SAVEPOINT protocol_attempt");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT protocol_attempt");
          const duplicateProtocol = error && typeof error === "object" && error.code === "23505"
            && String(error.constraint || "").includes("protocol");
          if (!duplicateProtocol) throw error;
        }
      }
      if (!inserted) throw new Error("protocol_generation_exhausted");

      await client.query(
        `INSERT INTO fin_canonical_accounts (account_type, ${column}, opened_by_identity)
         VALUES ($1::fin_account_type,$2,$3)`,
        [kind, inserted.id, session.identityId],
      );
      await client.query(
        `INSERT INTO fin_payment_history (account_type, ${column}, previous_status, next_status, previous_paid_cents, next_paid_cents, changed_by_identity, reason)
         VALUES ($1::fin_account_type,$2,NULL,'pendente',0,0,$3,$4)`,
        [kind, inserted.id, session.identityId, `Abertura canônica F03: ${description}`],
      );
      await client.query(
        `INSERT INTO fin_settlement_requests
           (request_kind, account_type, ${column}, idempotency_key, request_fingerprint, actor_identity, amount_cents, result_status)
         VALUES ('account_open',$1::fin_account_type,$2,$3,$4,$5,$6,'pendente')`,
        [kind, inserted.id, requestKey, requestFingerprint, session.identityId, amountCents],
      );
      await audit(client, {
        actorKind: session.role, actorId: session.identityId, action: "fin_account_open", target: inserted.id, result: "allowed",
      });
      await client.query("COMMIT");
      return ctx.json(res, 201, {
        ok: true, kind, id: inserted.id, protocol: inserted.protocol, status: inserted.status, replayed: false,
      });
    } catch (error) {
      await rollback(client);
      if (error && typeof error === "object" && error.code === "23505") {
        const prior = await db.query(
          `SELECT request_fingerprint, receivable_id, payable_id FROM fin_settlement_requests
            WHERE request_kind = 'account_open' AND idempotency_key = $1`,
          [requestKey],
        ).catch(() => ({ rows: [] }));
        if (prior.rows[0]) {
          if (prior.rows[0].request_fingerprint !== requestFingerprint) return ctx.json(res, 409, { error: "idempotency_conflict" });
          const id = prior.rows[0].receivable_id || prior.rows[0].payable_id;
          const current = await loadAccount(db, kind, id).catch(() => null);
          return ctx.json(res, 200, { ok: true, kind, id, protocol: current?.protocol ?? null, status: current?.status ?? "pendente", replayed: true });
        }
      }
      return databaseFailure(res, error, "Could not open the canonical finance account.");
    } finally {
      client?.release();
    }
  }

  // Baixa canônica: máquina estrita, saldo validado, pagamento + histórico +
  // ledger + auditoria na mesma transação.
  async function settleAccount(req, res, session) {
    if (!requireSameOrigin(req, res)) return;
    const body = await readJsonOr400(req, res);
    if (body === undefined) return;
    const kind = String(body?.kind || "receber");
    if (!["receber", "pagar"].includes(kind)) return ctx.json(res, 400, { error: "invalid_kind" });
    const id = String(body?.id || "");
    if (!UUID_PATTERN.test(id)) return ctx.json(res, 400, { error: "invalid_account_id" });
    const amountCents = Number(body?.amountCents);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
      return ctx.json(res, 400, { error: "invalid_amount_cents" });
    }
    const method = String(body?.method || "pix");
    if (!PAYMENT_METHODS.includes(method)) return ctx.json(res, 400, { error: "invalid_payment_method" });
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 1000) return ctx.json(res, 400, { error: "settlement_reason_invalid" });
    const requestKey = idempotencyKey(req);
    if (!requestKey) return ctx.json(res, 400, { error: "idempotency_key_required_or_invalid" });

    const db = ctx.getPool();
    let target;
    try {
      target = await loadAccount(db, kind, id);
    } catch (error) {
      return databaseFailure(res, error, "Could not load the finance account for settlement.");
    }
    if (!target) return ctx.json(res, 404, { error: "account_not_found" });
    let allowed;
    try {
      allowed = await hasPermission(db, {
        identityId: session.identityId,
        permission: "finance.settlements.write",
        accountId: target.client_account_id,
      });
    } catch (error) {
      return databaseFailure(res, error, "Could not verify the finance settlement scope.");
    }
    if (!allowed) return ctx.json(res, 403, { error: "permission_scope_denied" });

    const requestFingerprint = fingerprint({ kind, id, amountCents, method, reason });
    const column = kind === "receber" ? "receivable_id" : "payable_id";
    const table = tableOf(kind);
    const settledStatus = settledStatusOf(kind);
    let client;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`fin-settlement:${id}:${requestKey}`]);
      const locked = await client.query(
        `SELECT status::text AS status, amount_cents, amount_paid_cents FROM ${table} WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const current = locked.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        return ctx.json(res, 404, { error: "account_not_found" });
      }
      const replay = await client.query(
        `SELECT request_fingerprint, result_status FROM fin_settlement_requests
          WHERE request_kind = 'settlement' AND idempotency_key = $1`,
        [requestKey],
      );
      if (replay.rows[0]) {
        const previous = replay.rows[0];
        await client.query("ROLLBACK");
        if (previous.request_fingerprint !== requestFingerprint) return ctx.json(res, 409, { error: "idempotency_conflict" });
        const fresh = await loadAccount(db, kind, id);
        return ctx.json(res, 200, {
          ok: true,
          kind,
          id,
          status: fresh?.status ?? previous.result_status,
          paidCents: Number(fresh?.amount_paid_cents ?? 0),
          remainingCents: Number(fresh?.amount_cents ?? 0) - Number(fresh?.amount_paid_cents ?? 0),
          replayed: true,
        });
      }
      if (!SETTLEABLE_STATUS.includes(current.status)) {
        await client.query("ROLLBACK");
        return ctx.json(res, 409, { error: "settlement_transition_not_allowed", status: current.status });
      }
      const total = Number(current.amount_cents);
      const previousPaid = Number(current.amount_paid_cents);
      const remaining = total - previousPaid;
      if (amountCents > remaining) {
        await client.query("ROLLBACK");
        return ctx.json(res, 409, { error: "settlement_exceeds_balance", remainingCents: remaining });
      }
      const nextPaid = previousPaid + amountCents;
      const nextStatus = nextPaid >= total ? settledStatus : "parcial";
      const payment = await client.query(
        `INSERT INTO fin_payments (account_type, ${column}, amount_cents, payment_method, is_partial, notes, created_by_identity)
         VALUES ($1::fin_account_type,$2,$3,$4::fin_payment_method,$5,$6,$7) RETURNING id`,
        [kind, id, amountCents, method, nextStatus === "parcial", reason, session.identityId],
      );
      const updated = await client.query(
        `UPDATE ${table}
            SET amount_paid_cents = $2,
                status = $3::fin_status,
                paid_at = CASE WHEN $4 THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
                updated_at = NOW()
          WHERE id = $1 AND status = $5::fin_status AND amount_paid_cents = $6
          RETURNING id`,
        [id, nextPaid, nextStatus, nextStatus === settledStatus, current.status, previousPaid],
      );
      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        return ctx.json(res, 409, { error: "settlement_transition_not_allowed", status: current.status });
      }
      await client.query(
        `INSERT INTO fin_payment_history
           (account_type, ${column}, previous_status, next_status, previous_paid_cents, next_paid_cents, payment_id, changed_by_identity, reason)
         VALUES ($1::fin_account_type,$2,$3::fin_status,$4::fin_status,$5,$6,$7,$8,$9)`,
        [kind, id, current.status, nextStatus, previousPaid, nextPaid, payment.rows[0].id, session.identityId, reason],
      );
      await client.query(
        `INSERT INTO fin_settlement_requests
           (request_kind, account_type, ${column}, idempotency_key, request_fingerprint, actor_identity, amount_cents, result_status)
         VALUES ('settlement',$1::fin_account_type,$2,$3,$4,$5,$6,$7::fin_status)`,
        [kind, id, requestKey, requestFingerprint, session.identityId, amountCents, nextStatus],
      );
      await audit(client, {
        actorKind: session.role, actorId: session.identityId, action: "fin_account_settle", target: id, result: "allowed",
      });
      await client.query("COMMIT");
      return ctx.json(res, 200, {
        ok: true,
        kind,
        id,
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
          `SELECT request_fingerprint, result_status FROM fin_settlement_requests
            WHERE request_kind = 'settlement' AND idempotency_key = $1`,
          [requestKey],
        ).catch(() => ({ rows: [] }));
        if (prior.rows[0]) {
          if (prior.rows[0].request_fingerprint !== requestFingerprint) return ctx.json(res, 409, { error: "idempotency_conflict" });
          const fresh = await loadAccount(db, kind, id).catch(() => null);
          return ctx.json(res, 200, {
            ok: true,
            kind,
            id,
            status: fresh?.status ?? prior.rows[0].result_status,
            paidCents: Number(fresh?.amount_paid_cents ?? 0),
            remainingCents: Number(fresh?.amount_cents ?? 0) - Number(fresh?.amount_paid_cents ?? 0),
            replayed: true,
          });
        }
      }
      return databaseFailure(res, error, "Could not settle the finance account.");
    } finally {
      client?.release();
    }
  }

  async function handleSettlements(req, res, url) {
    const session = await requireStaffSession(req, res);
    if (!session) return;
    if (req.method === "GET") return listSettlements(req, res, url, session);
    if (req.method === "POST") return openAccount(req, res, session);
    if (req.method === "PATCH") return settleAccount(req, res, session);
    return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST, PATCH" });
  }

  // Relatório da competência, calculado sobre as fontes canônicas e limitado
  // ao mesmo escopo da fila. A leitura é auditada; falha de auditoria responde
  // 503 em vez de entregar número sem rastro.
  async function handleSettlementReport(req, res, url) {
    if (req.method !== "GET") return ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const competence = String(url.searchParams.get("competence") || "");
    if (!COMPETENCE_PATTERN.test(competence)) return ctx.json(res, 400, { error: "invalid_competence" });
    const db = ctx.getPool();
    try {
      const grants = await readGrants(db, session.identityId, "finance.settlements.read");
      if (!grants.length) return ctx.json(res, 403, { error: "permission_scope_denied" });
      const first = `${competence}-01`;
      const result = await db.query(
        `WITH scoped AS (
           SELECT 'receber'::fin_account_type AS kind, r.id, r.protocol, r.client_account_id,
                  r.amount_cents, r.amount_paid_cents, r.status::text AS status,
                  r.due_date::text AS due_date, (c.id IS NOT NULL) AS canonical
             FROM fin_accounts_receivable r
             LEFT JOIN fin_canonical_accounts c ON c.receivable_id = r.id
            WHERE r.competence_date >= $2::date AND r.competence_date < ($2::date + INTERVAL '1 month')
              AND EXISTS (
                SELECT 1 FROM auth_permissions p
                 WHERE p.identity_id = $1 AND p.permission = 'finance.settlements.read'
                   AND p.revoked_at IS NULL
                   AND (p.scope_type IN ('global','organization')
                        OR (p.scope_type = 'account' AND p.scope_id = r.client_account_id))
              )
           UNION ALL
           SELECT 'pagar'::fin_account_type AS kind, p2.id, p2.protocol, p2.client_account_id,
                  p2.amount_cents, p2.amount_paid_cents, p2.status::text AS status,
                  p2.due_date::text AS due_date, (c.id IS NOT NULL) AS canonical
             FROM fin_accounts_payable p2
             LEFT JOIN fin_canonical_accounts c ON c.payable_id = p2.id
            WHERE p2.competence_date >= $2::date AND p2.competence_date < ($2::date + INTERVAL '1 month')
              AND EXISTS (
                SELECT 1 FROM auth_permissions p
                 WHERE p.identity_id = $1 AND p.permission = 'finance.settlements.read'
                   AND p.revoked_at IS NULL
                   AND (p.scope_type IN ('global','organization')
                        OR (p.scope_type = 'account' AND p.scope_id = p2.client_account_id))
              )
         )
         SELECT kind::text AS kind, id, protocol, client_account_id, status, due_date, canonical,
                amount_cents, amount_paid_cents, (amount_cents - amount_paid_cents) AS amount_remaining_cents
           FROM scoped
          ORDER BY kind, due_date ASC, protocol ASC
          LIMIT 500`,
        [session.identityId, first],
      );
      const empty = () => ({ accounts: 0, totalCents: 0, settledCents: 0, openCents: 0 });
      const totals = { receber: empty(), pagar: empty() };
      for (const row of result.rows) {
        const bucket = totals[row.kind];
        bucket.accounts += 1;
        bucket.totalCents += Number(row.amount_cents);
        bucket.settledCents += Number(row.amount_paid_cents);
        bucket.openCents += Number(row.amount_remaining_cents);
      }
      await audit(db, {
        actorKind: session.role,
        actorId: session.identityId,
        action: "fin_settlement_report_read",
        target: competence,
        result: "allowed",
      });
      return ctx.json(
        res,
        200,
        {
          competence,
          grants,
          totals,
          accounts: result.rows,
          note: "Relatório calculado em tempo real sobre as fontes canônicas desta instalação. Sem integração bancária, envio por e-mail ou exportação assinada.",
        },
        { "Cache-Control": "private, no-store" },
      );
    } catch (error) {
      return databaseFailure(res, error, "Could not build the finance settlement report.");
    }
  }

  return { handleSettlements, handleSettlementReport };
}
