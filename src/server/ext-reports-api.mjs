// EXT-13 / F09 — Relatório periódico canônico.
//
// Consolida métricas contadas de tabelas internas reais por período declarado
// e registra o envio autorizado como registro interno auditado. Não gera
// arquivo, não envia e-mail/SMTP e não aciona fornecedor externo; os
// handlers legados não contam como cobertura da jornada.
import { createHash } from "node:crypto";
import { hasPermission } from "./rbac.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]{1,120}@[^\s@]{1,120}\.[^\s@]{1,60}$/;
const STATUS = new Set(["rascunho", "em_revisao", "aprovado", "gerado", "envio_registrado", "arquivado"]);
const TRANSITIONS = Object.freeze({
  rascunho: ["em_revisao", "arquivado"],
  em_revisao: ["rascunho", "aprovado", "arquivado"],
  aprovado: ["em_revisao", "arquivado"],
  gerado: ["em_revisao", "arquivado"],
  envio_registrado: ["arquivado"],
  arquivado: ["rascunho"],
});

// Fontes internas reais por tipo de relatório. Cada total é um COUNT sobre a
// tabela indicada dentro do período; nada é estimado ou inventado.
export const REPORT_SOURCES = Object.freeze({
  comercial: Object.freeze(["public_leads", "crm_contacts"]),
  operacional: Object.freeze(["client_tickets"]),
  financeiro: Object.freeze(["fin_accounts_receivable", "fin_payments"]),
  qualidade: Object.freeze(["ext_quality_nonconformities", "ext_quality_actions"]),
  satisfacao: Object.freeze(["ext_satisfaction_surveys"]),
  compliance: Object.freeze(["ext_compliance_documents", "ext_compliance_obligations"]),
});

const text = (value, min, max) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max
    ? value.trim()
    : null;

const jsonValue = (value) => {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const raw = JSON.stringify(value);
  return raw.length <= 8 * 1024 ? value : null;
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

const fingerprint = (payload) => createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");

const isoDate = (value) => {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
};

function normalizeRecipients(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const emails = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const email = item.trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 200) return null;
    if (!emails.includes(email)) emails.push(email);
  }
  return emails;
}

// Snapshot puro de totais: cada entrada referencia a tabela-fonte interna e o
// COUNT do período. Fronteira declarada: sem arquivo, sem SMTP, sem externo.
export function buildTotalsSnapshot({ reportType, periodStart, periodEnd, counts }) {
  const sources = {};
  let totalRecords = 0;
  for (const table of REPORT_SOURCES[reportType] || []) {
    const count = Number(counts?.[table] ?? 0);
    sources[table] = count;
    totalRecords += count;
  }
  return {
    report_type: reportType,
    period_start: periodStart,
    period_end: periodEnd,
    sources,
    total_records: totalRecords,
    method: "COUNT(*) por tabela-fonte interna com created_at dentro do período",
    boundary: "totais contados de tabelas internas reais; não gera arquivo, não envia e-mail e não aciona fornecedor externo",
  };
}

export function createExtReportsApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, body) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    });
    res.end(JSON.stringify(body));
  };

  async function guard(req, res, permission, { write = false } = {}) {
    let session = null;
    try { session = await requireSession(req); } catch {}
    if (!session?.identityId || !UUID.test(String(session.identityId))) {
      json(res, 401, { error: "unauthorized" });
      return null;
    }
    if (!(await hasPermission(pool, { identityId: String(session.identityId), permission }))) {
      json(res, 403, { error: "forbidden" });
      return null;
    }
    if (write && !sameOrigin(req)) {
      json(res, 403, { error: "origin_forbidden" });
      return null;
    }
    return session;
  }

  async function readBody(req) {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 64 * 1024) return { error: "payload_too_large", status: 413 };
    }
    if (!raw.trim()) return { value: {} };
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "invalid_json", status: 400 };
      return { value };
    } catch {
      return { error: "invalid_json", status: 400 };
    }
  }

  function requireKey(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!KEY.test(key)) {
      json(res, 400, { error: "idempotency_key_required" });
      return null;
    }
    return key;
  }

  async function recordEvent(client, { reportId, eventType, summary, payload, key, fp, identityId }) {
    await client.query(
      `INSERT INTO ext_report_events
         (report_id, event_type, summary, payload, idempotency_key, request_fingerprint, created_by_identity)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reportId, eventType, summary, JSON.stringify(payload || {}), key, fp, identityId],
    );
  }

  async function mutate(res, { session, key, fp, action, work, replay }) {
    let client = null;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext-reports-${session.identityId}-${key}`]);
      const previous = await client.query(
        `SELECT * FROM ext_report_events
          WHERE created_by_identity = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [session.identityId, key],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].request_fingerprint !== fp) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_conflict_payload_mismatch" });
        }
        const replayed = await replay(client, previous.rows[0]);
        await client.query("COMMIT");
        return json(res, 200, { ...replayed, replayed: true });
      }

      const result = await work(client);
      if (result.error) {
        await client.query("ROLLBACK");
        return json(res, result.status || 400, { error: result.error, ...(result.message ? { message: result.message } : {}) });
      }

      try {
        await client.query(
          `INSERT INTO auth_access_audit
             (actor_kind, actor_id, action, target, result, detail_category)
           VALUES ('staff',$1,$2,$3,'allowed','none')`,
          [session.identityId, action, result.target || result.report?.id || "report"],
        );
      } catch (auditError) {
        await client.query("ROLLBACK");
        console.error("EXT-13 audit unavailable", auditError?.message || auditError);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, result.statusCode || 200, result.response);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      console.error("EXT-13 mutation error", error?.message || error);
      return json(res, 500, { error: "internal_error" });
    } finally {
      client?.release();
    }
  }

  async function reportById(clientOrPool, id, { lock = false } = {}) {
    const { rows } = await clientOrPool.query(
      `SELECT * FROM ext_periodic_reports WHERE id=$1 AND origin='ext13_canonica'${lock ? " FOR UPDATE" : ""}`,
      [id],
    );
    return rows[0] || null;
  }

  async function reportDetail(clientOrPool, id) {
    const report = await reportById(clientOrPool, id);
    if (!report) return null;
    const events = (await clientOrPool.query(
      `SELECT id, event_type, summary, payload, created_by_identity, created_at
         FROM ext_report_events
        WHERE report_id=$1
        ORDER BY created_at ASC, id ASC`,
      [id],
    )).rows;
    return { report, events };
  }

  async function listReports(req, res) {
    const session = await guard(req, res, "reports.read");
    if (!session) return;
    try {
      const { rows } = await pool.query(
        `SELECT id, protocol, title, report_type, period_start, period_end, status,
                totals, total_records, recipient_emails, generated_at, sent_at,
                approved_at, created_by_identity, created_at, updated_at
           FROM ext_periodic_reports
          WHERE origin='ext13_canonica'
          ORDER BY created_at DESC
          LIMIT 200`,
      );
      return json(res, 200, { items: rows, note: "Relatórios canônicos EXT-13; envio é registro interno autorizado, sem SMTP." });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  async function createReport(req, res) {
    const session = await guard(req, res, "reports.write", { write: true });
    if (!session) return;
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const body = parsed.value;
    const title = text(body.title, 5, 200);
    const reportType = typeof body.report_type === "string" ? body.report_type.trim() : "";
    const periodStart = isoDate(body.period_start);
    const periodEnd = isoDate(body.period_end);
    const recipients = normalizeRecipients(body.recipient_emails);
    const filters = jsonValue(body.filters);
    const summary = text(body.change_summary, 10, 1000) || "Definição canônica do relatório periódico criada.";
    if (!title) return json(res, 400, { error: "invalid_title" });
    if (!REPORT_SOURCES[reportType]) return json(res, 400, { error: "invalid_report_type", message: "Tipos aceitos: " + Object.keys(REPORT_SOURCES).join(", ") });
    if (!periodStart || !periodEnd || periodEnd < periodStart) return json(res, 400, { error: "invalid_period" });
    if (!recipients) return json(res, 400, { error: "invalid_recipients" });
    if (filters === null) return json(res, 400, { error: "invalid_filters" });
    const fp = fingerprint({ op: "report_create", title, reportType, periodStart, periodEnd, recipients, filters, summary });
    return mutate(res, {
      session, key, fp, action: "report_create",
      replay: async (client, event) => ({ report: (await client.query("SELECT * FROM ext_periodic_reports WHERE id=$1", [event.report_id])).rows[0] }),
      work: async (client) => {
        const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
        const protocol = `RELP-EXT-${stamp}-${fp.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, "0")}`;
        const inserted = await client.query(
          `INSERT INTO ext_periodic_reports
             (protocol, title, report_type, period_start, period_end, filters,
              recipient_emails, status, origin, created_by_identity,
              idempotency_key, request_fingerprint)
           VALUES ($1,$2,$3::ext_report_type,$4,$5,$6,$7,'rascunho','ext13_canonica',$8,$9,$10)
           ON CONFLICT (protocol) DO NOTHING
           RETURNING *`,
          [protocol, title, reportType, periodStart, periodEnd, JSON.stringify(filters), recipients, session.identityId, key, fp],
        );
        if (!inserted.rows[0]) return { error: "protocol_conflict_retry", status: 409 };
        const report = inserted.rows[0];
        await recordEvent(client, { reportId: report.id, eventType: "report_created", summary, payload: { protocol, report_type: reportType, period_start: periodStart, period_end: periodEnd, recipients }, key, fp, identityId: session.identityId });
        return { report, target: report.id, response: { report }, statusCode: 201 };
      },
    });
  }

  async function transitionReport(req, res, id) {
    const session = await guard(req, res, "reports.review", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_report_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const next = text(parsed.value.status, 5, 30);
    const note = text(parsed.value.approval_note, 10, 1000) || text(parsed.value.justification, 10, 1000);
    if (!next || !STATUS.has(next) || next === "gerado" || next === "envio_registrado") return json(res, 400, { error: "invalid_status" });
    const fp = fingerprint({ op: "report_transition", id, next, note: note || null });
    return mutate(res, {
      session, key, fp, action: "report_transition",
      replay: async (client, event) => ({ report: (await client.query("SELECT * FROM ext_periodic_reports WHERE id=$1", [event.report_id])).rows[0] }),
      work: async (client) => {
        const report = await reportById(client, id, { lock: true });
        if (!report) return { error: "report_not_found", status: 404 };
        if (!(TRANSITIONS[report.status] || []).includes(next)) return { error: "invalid_transition", status: 409 };
        if (["aprovado", "arquivado"].includes(next) && !note) return { error: "justification_required", status: 400 };
        const updated = await client.query(
          `UPDATE ext_periodic_reports
              SET status=$2::ext_report_status,
                  approved_by_identity = CASE WHEN $2::text='aprovado' THEN $3::uuid ELSE approved_by_identity END,
                  approved_at = CASE WHEN $2::text='aprovado' THEN NOW() ELSE approved_at END,
                  approval_note = CASE WHEN $2::text='aprovado' THEN $4 ELSE approval_note END,
                  updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, next, session.identityId, note],
        );
        await recordEvent(client, { reportId: id, eventType: `report_${next}`, summary: `Relatório periódico alterado para ${next}.`, payload: { from: report.status, to: next, note: note || null }, key, fp, identityId: session.identityId });
        return { report: updated.rows[0], target: id, response: { report: updated.rows[0] } };
      },
    });
  }

  async function generateReport(req, res, id) {
    const session = await guard(req, res, "reports.write", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_report_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const note = text(parsed.value.generation_note, 5, 1000) || "Consolidação contada das tabelas-fonte internas do período.";
    const fp = fingerprint({ op: "report_generate", id, note });
    return mutate(res, {
      session, key, fp, action: "report_generate",
      replay: async (client, event) => ({ report: (await client.query("SELECT * FROM ext_periodic_reports WHERE id=$1", [event.report_id])).rows[0] }),
      work: async (client) => {
        const report = await reportById(client, id, { lock: true });
        if (!report) return { error: "report_not_found", status: 404 };
        if (report.status !== "aprovado") return { error: "approval_required", status: 409 };
        const period = (await client.query(
          `SELECT period_start::text AS period_start, period_end::text AS period_end
             FROM ext_periodic_reports WHERE id=$1`,
          [id],
        )).rows[0];
        const counts = {};
        for (const table of REPORT_SOURCES[report.report_type] || []) {
          const counted = await client.query(
            `SELECT count(*)::int AS n FROM ${table}
              WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')`,
            [period.period_start, period.period_end],
          );
          counts[table] = counted.rows[0].n;
        }
        const totals = buildTotalsSnapshot({
          reportType: report.report_type,
          periodStart: period.period_start,
          periodEnd: period.period_end,
          counts,
        });
        const generationFp = fingerprint({ op: "report_totals", id, totals });
        const updated = await client.query(
          `UPDATE ext_periodic_reports
              SET status='gerado', totals=$2, total_records=$3, generated_at=NOW(),
                  generated_by_identity=$4, generation_fingerprint=$5, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, JSON.stringify(totals), totals.total_records, session.identityId, generationFp],
        );
        await recordEvent(client, { reportId: id, eventType: "report_generated", summary: note, payload: { totals, generation_fingerprint: generationFp }, key, fp, identityId: session.identityId });
        return { report: updated.rows[0], target: id, response: { report: updated.rows[0], totals, note: "Totais contados de fontes internas reais; nenhum arquivo foi gerado." } };
      },
    });
  }

  async function sendReport(req, res, id) {
    const session = await guard(req, res, "reports.send", { write: true });
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_report_id" });
    const key = requireKey(req, res);
    if (!key) return;
    const parsed = await readBody(req);
    if (parsed.error) return json(res, parsed.status, { error: parsed.error });
    const note = text(parsed.value.send_note, 10, 1000);
    if (!note) return json(res, 400, { error: "send_note_required" });
    const fp = fingerprint({ op: "report_send", id, note });
    return mutate(res, {
      session, key, fp, action: "report_dispatch_register",
      replay: async (client, event) => ({ report: (await client.query("SELECT * FROM ext_periodic_reports WHERE id=$1", [event.report_id])).rows[0] }),
      work: async (client) => {
        const report = await reportById(client, id, { lock: true });
        if (!report) return { error: "report_not_found", status: 404 };
        if (report.status !== "gerado") return { error: "generation_required", status: 409 };
        const recipients = Array.isArray(report.recipient_emails) ? report.recipient_emails : [];
        if (!recipients.length) return { error: "recipients_required", status: 409 };
        const staff = await client.query(
          `SELECT lower(email) AS email FROM auth_identities
            WHERE kind='staff' AND status='active' AND lower(email) = ANY($1::text[])`,
          [recipients],
        );
        const known = new Set(staff.rows.map((row) => row.email));
        const unknown = recipients.filter((email) => !known.has(email));
        if (unknown.length) return { error: "recipient_not_active_staff", status: 409, message: `Destinatários fora do quadro staff ativo: ${unknown.join(", ")}` };
        const updated = await client.query(
          `UPDATE ext_periodic_reports
              SET status='envio_registrado', sent_at=NOW(), sent_by_identity=$2,
                  send_note=$3, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, session.identityId, note],
        );
        await recordEvent(client, { reportId: id, eventType: "report_dispatch_registered", summary: note, payload: { recipients, boundary: "registro interno autorizado; nenhum e-mail foi enviado (SMTP pendente)" }, key, fp, identityId: session.identityId });
        return { report: updated.rows[0], target: id, response: { report: updated.rows[0], note: "Envio registrado internamente para destinatários staff ativos; nenhum e-mail foi enviado." } };
      },
    });
  }

  async function detailReport(req, res, id) {
    const session = await guard(req, res, "reports.read");
    if (!session) return;
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_report_id" });
    try {
      const detail = await reportDetail(pool, id);
      return detail ? json(res, 200, detail) : json(res, 404, { error: "report_not_found" });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  async function legacy(req, res) {
    const write = req.method !== "GET" && req.method !== "HEAD";
    const session = await guard(req, res, write ? "reports.write" : "reports.read", { write });
    if (!session) return;
    if (write) {
      return json(res, 410, {
        error: "legacy_writer_retired",
        canonical: "/api/ext/reports/periodic",
      });
    }
    try {
      const { rows } = await pool.query(
        `SELECT id, protocol, title, report_type, period_start, period_end, status,
                total_records, generated_at, sent_at, created_at
           FROM ext_periodic_reports
          WHERE origin='registro_legado'
          ORDER BY created_at DESC LIMIT 200`,
      );
      return json(res, 200, { items: rows, note: "Leitura legada minimizada; escritas foram aposentadas." });
    } catch {
      return json(res, 500, { error: "database_error" });
    }
  }

  return {
    handle: async (req, res) => {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      const match = pathname.match(/^\/api\/ext\/reports\/periodic(?:\/([^/]+))?(?:\/(transition|generate|send))?$/);
      if (!match) return json(res, 404, { error: "not_found" });
      const id = match[1];
      const action = match[2];
      if (!id && req.method === "GET") return listReports(req, res);
      if (!id && req.method === "POST") return createReport(req, res);
      if (id && !action && req.method === "GET") return detailReport(req, res, id);
      if (id && action === "transition" && (req.method === "POST" || req.method === "PATCH")) return transitionReport(req, res, id);
      if (id && action === "generate" && req.method === "POST") return generateReport(req, res, id);
      if (id && action === "send" && req.method === "POST") return sendReport(req, res, id);
      return json(res, 405, { error: "method_not_allowed" });
    },
    handleLegacy: (req, res) => legacy(req, res),
  };
}
