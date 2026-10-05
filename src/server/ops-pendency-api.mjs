// F15 — Caixa interna canônica de pendências da equipe.
// A varredura lê fontes internas reais já existentes (EXT-07 obrigações, planos de ação e
// tarefas vencidas; EXT-10 testes de continuidade vencidos) e materializa uma pendência por
// identidade staff responsável. Nada é inferido, nada é inventado e NADA é enviado: não há
// SMTP, SMS, WhatsApp, push, webhook nem uso da fila legada `notification_queue` (PLT-04).
// A caixa é pessoal: cada sessão staff enxerga e trata somente as próprias pendências.
import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS = ["nao_lida", "lida", "arquivada"];
const text = (v, min, max) => (typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
const fingerprint = (v) => createHash("sha256").update(JSON.stringify(v, Object.keys(v || {}).sort())).digest("hex");

// Fontes internas reais. Cada consulta exige responsável staff ativo e vencimento efetivo;
// linhas sem responsável nunca viram pendência de ninguém (fail-closed, sem destinatário padrão).
const SOURCES = [
  {
    module: "ext07_obligation",
    label: "Obrigação de conformidade vencida",
    sql: `SELECT o.id, o.responsible_identity, o.title, o.criticality, NULL::date AS due_date, o.status AS source_state
            FROM ext_compliance_obligations o
            JOIN auth_identities i ON i.id = o.responsible_identity AND i.kind='staff' AND i.status='active'
            JOIN auth_staff_profiles sp ON sp.identity_id = i.id
           WHERE o.status = 'vencida'`,
    summary: (row) => `Obrigação de conformidade "${row.title}" está com status vencida e exige tratamento formal.`,
  },
  {
    module: "ext07_action_plan",
    label: "Plano de ação de compliance em atraso",
    sql: `SELECT a.id, a.responsible_identity, a.title, NULL::text AS criticality, a.due_date, a.status AS source_state
            FROM ext_compliance_action_plans a
            JOIN auth_identities i ON i.id = a.responsible_identity AND i.kind='staff' AND i.status='active'
            JOIN auth_staff_profiles sp ON sp.identity_id = i.id
           WHERE a.status IN ('aberto','em_andamento') AND a.due_date < CURRENT_DATE`,
    summary: (row) => `Plano de ação "${row.title}" venceu em ${row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : row.due_date} e continua ${row.source_state}.`,
  },
  {
    module: "ext07_task",
    label: "Tarefa de compliance em atraso",
    sql: `SELECT t.id, t.responsible_identity, t.rule AS title, NULL::text AS criticality, t.due_date, t.status AS source_state
            FROM ext_compliance_tasks t
            JOIN auth_identities i ON i.id = t.responsible_identity AND i.kind='staff' AND i.status='active'
            JOIN auth_staff_profiles sp ON sp.identity_id = i.id
           WHERE t.status IN ('aberta','em_andamento') AND t.due_date < CURRENT_DATE`,
    summary: (row) => `Tarefa de compliance "${row.title}" venceu em ${row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : row.due_date} e continua ${row.source_state}.`,
  },
  {
    module: "ext10_continuity_plan",
    label: "Teste de plano de continuidade vencido",
    sql: `SELECT p.id, p.responsible_identity, p.title, NULL::text AS criticality, p.next_test_due AS due_date, p.status::text AS source_state
            FROM ext_continuity_plans p
            JOIN auth_identities i ON i.id = p.responsible_identity AND i.kind='staff' AND i.status='active'
            JOIN auth_staff_profiles sp ON sp.identity_id = i.id
           WHERE p.next_test_due < CURRENT_DATE AND p.status NOT IN ('arquivado','rascunho')`,
    summary: (row) => `Plano de continuidade "${row.title}" está com teste vencido desde ${row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : row.due_date}.`,
  },
];

export function createOpsPendencyApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  // Sessão staff individual: a caixa é pessoal e nunca aceita identidade vinda do navegador.
  async function session(req, res, { write = false } = {}) {
    let s = null;
    try { s = await requireSession(req); } catch { s = null; }
    if (!s?.identityId || !UUID.test(String(s.identityId))) { json(res, 401, { error: "unauthorized" }); return null; }
    if (write && !sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
    return s;
  }

  async function requirePermission(res, identityId, permission) {
    let granted = false;
    try {
      granted = (await pool.query(
        "SELECT 1 FROM auth_permissions WHERE identity_id=$1 AND permission=$2 AND revoked_at IS NULL AND scope_type IN ('global','organization') LIMIT 1",
        [identityId, permission],
      )).rows.length > 0;
    } catch { granted = false; }
    if (!granted) { json(res, 403, { error: "forbidden" }); return false; }
    return true;
  }

  async function body(req) {
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 64 * 1024) return null; }
    try { const parsed = JSON.parse(raw || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null; } catch { return null; }
  }

  function key(req, res) {
    const value = String(req.headers["idempotency-key"] || "").trim();
    if (value.length < 8 || value.length > 200) { json(res, 400, { error: "idempotency_key_required" }); return null; }
    return value;
  }

  // Mutação transacional: lock por chave, trabalho, auditoria atômica e rollback fail-closed.
  async function mutate(res, { identityId, lockKey, action, target, work }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ops-pendency-${identityId}-${lockKey}`]);
      const out = await work(client);
      if (out.error) { await client.query("ROLLBACK"); return json(res, out.status || 400, { error: out.error }); }
      try {
        await client.query(
          "INSERT INTO auth_access_audit (actor_kind,actor_id,action,target,result,detail_category) VALUES ('staff',$1,$2,$3,'allowed','none')",
          [identityId, action, out.target || target || null],
        );
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("F15 pendency audit failure", error.message);
        return json(res, 503, { error: "audit_unavailable" });
      }
      await client.query("COMMIT");
      return json(res, out.statusCode || 200, out.response);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("F15 pendency mutation", error.message);
      return json(res, 500, { error: "internal_error" });
    } finally {
      client.release();
    }
  }

  async function list(req, res) {
    const s = await session(req, res);
    if (!s) return;
    const url = new URL(req.url, "http://localhost");
    const params = [s.identityId];
    const where = ["n.recipient_identity=$1"];
    const status = url.searchParams.get("status");
    if (status) {
      if (!STATUS.includes(status)) return json(res, 400, { error: "invalid_status" });
      params.push(status);
      where.push(`n.status=$${params.length}`);
    }
    let rows;
    try {
      rows = (await pool.query(
        `SELECT n.id,n.source_module,n.source_id,n.title,n.summary,n.criticality,n.due_date,n.status,n.archive_note,n.read_at,n.archived_at,n.created_at
           FROM ops_pendency_notifications n WHERE ${where.join(" AND ")}
          ORDER BY (n.status='nao_lida') DESC, n.due_date NULLS LAST, n.created_at DESC LIMIT 200`,
        params,
      )).rows;
    } catch (error) {
      console.error("F15 pendency list", error.message);
      return json(res, 503, { error: "pendency_unavailable" });
    }
    const unread = rows.filter((row) => row.status === "nao_lida").length;
    return json(res, 200, {
      items: rows,
      unread,
      note: "caixa interna pessoal derivada de pendências reais do sistema; nenhuma mensagem externa é enviada",
    });
  }

  // Varredura idempotente: materializa pendências reais sem duplicar o mesmo estado de origem.
  async function sweep(req, res) {
    const s = await session(req, res, { write: true });
    if (!s) return;
    if (!(await requirePermission(res, s.identityId, "pendency.sweep"))) return;
    const k = key(req, res);
    if (!k) return;
    return mutate(res, {
      identityId: s.identityId,
      lockKey: "sweep",
      action: "ops_pendency_sweep",
      target: s.identityId,
      work: async (client) => {
        const created = {};
        let total = 0;
        for (const source of SOURCES) {
          created[source.module] = 0;
          const rows = (await client.query(source.sql)).rows;
          for (const row of rows) {
            const due = row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : row.due_date || null;
            const fp = fingerprint({ module: source.module, id: row.id, state: row.source_state, due });
            const inserted = await client.query(
              `INSERT INTO ops_pendency_notifications
                 (recipient_identity,source_module,source_id,source_fingerprint,title,summary,criticality,due_date,generated_by_identity)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
               ON CONFLICT (recipient_identity,source_module,source_id,source_fingerprint) DO NOTHING RETURNING id`,
              [row.responsible_identity, source.module, row.id, fp, source.label, source.summary(row).slice(0, 1000), row.criticality || "media", due, s.identityId],
            );
            if (inserted.rows[0]) { created[source.module] += 1; total += 1; }
          }
        }
        return {
          statusCode: 200,
          response: {
            created,
            total,
            note: "varredura interna idempotente: a mesma pendência no mesmo estado não é duplicada e nada é enviado para fora do sistema",
          },
        };
      },
    });
  }

  async function transition(req, res, id, kind) {
    const s = await session(req, res, { write: true });
    if (!s) return;
    const k = key(req, res);
    if (!k) return;
    if (!UUID.test(String(id))) return json(res, 400, { error: "invalid_pendency_id" });
    let note = null;
    if (kind === "archive") {
      const parsed = await body(req);
      if (!parsed) return json(res, 400, { error: "invalid_json" });
      note = text(parsed.note, 10, 1000);
      if (!note) return json(res, 400, { error: "archive_note_required" });
    }
    return mutate(res, {
      identityId: s.identityId,
      lockKey: `${kind}-${id}`,
      action: kind === "archive" ? "ops_pendency_archive" : "ops_pendency_read",
      target: id,
      work: async (client) => {
        // Caixa pessoal: pendência de outra pessoa responde 404, sem revelar que existe.
        const found = await client.query(
          "SELECT * FROM ops_pendency_notifications WHERE id=$1 AND recipient_identity=$2 FOR UPDATE",
          [id, s.identityId],
        );
        const current = found.rows[0];
        if (!current) return { error: "pendency_not_found", status: 404 };
        if (current.status === "arquivada") {
          return kind === "archive"
            ? { statusCode: 200, target: id, response: { pendency: current, replayed: true } }
            : { error: "pendency_archived", status: 409 };
        }
        if (kind === "read" && current.status === "lida") {
          return { statusCode: 200, target: id, response: { pendency: current, replayed: true } };
        }
        const updated = await client.query(
          kind === "archive"
            ? "UPDATE ops_pendency_notifications SET status='arquivada',archive_note=$2,archived_at=NOW(),read_at=COALESCE(read_at,NOW()) WHERE id=$1 RETURNING *"
            : "UPDATE ops_pendency_notifications SET status='lida',read_at=NOW() WHERE id=$1 RETURNING *",
          kind === "archive" ? [id, note] : [id],
        );
        return { statusCode: 200, target: id, response: { pendency: updated.rows[0] } };
      },
    });
  }

  return {
    handle: async (req, res) => {
      const path = new URL(req.url, "http://localhost").pathname;
      if (path === "/api/ops/pendencies") {
        if (req.method === "GET") return list(req, res);
        return json(res, 405, { error: "method_not_allowed" });
      }
      if (path === "/api/ops/pendencies/sweep") {
        if (req.method === "POST") return sweep(req, res);
        return json(res, 405, { error: "method_not_allowed" });
      }
      const match = path.match(/^\/api\/ops\/pendencies\/([^/]+)\/(read|archive)$/);
      if (match) {
        if (req.method === "POST") return transition(req, res, match[1], match[2]);
        return json(res, 405, { error: "method_not_allowed" });
      }
      return json(res, 404, { error: "not_found" });
    },
  };
}
