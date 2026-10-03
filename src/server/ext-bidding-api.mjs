// EXT-03 — Licitações ligadas ao backend canônico real.
//
// Critério do plano: "Edital, prazos, documentos, responsáveis, proposta e
// resultado; se mercado relevante". Entrega esperada: "checklist e alerta por
// edital, dossiê versionado".
//
// O que este módulo impõe, em cima da migração 149:
//   * autorização por papel com 401 (anônimo) e 403 (papel sem direito)
//     distintos, mutação só com same-origin e identidade UUID real da sessão;
//   * autoria SEMPRE derivada da sessão — id, autor e vínculo nunca vêm do
//     corpo da requisição;
//   * prazo canônico com fonte declarada; substituir é registrar substituição,
//     nunca editar;
//   * PROPOSTA só dentro do prazo de entrega registrado — a decisão é derivada
//     do prazo canônico e a data-base é declarada na resposta;
//   * RESULTADO só com edital encerrado, com autor/data/justificativa, imutável
//     depois de gravado;
//   * checklist derivado dos documentos ativos (nunca marcado à mão) e alerta
//     de prazo só com regra de antecedência explícita;
//   * negócio + evento imutável + auditoria na MESMA transação; auditoria
//     indisponível devolve 503 e não deixa nada gravado;
//   * idempotência por (identidade, chave): retry idêntico não duplica, reuso
//     com conteúdo diferente devolve 409.
//
// RELEVÂNCIA DE MERCADO — CONDIÇÃO DECLARADA: o critério é condicional ("se
// mercado relevante"). A evidência disponível (docs/referencias-marca.md) cita
// "órgãos públicos" entre os segmentos do site atual, em seção marcada como
// "confirmar antes da nova publicação". A relevância está INDICADA e NÃO
// CONFIRMADA; a API declara isso em MARKET_RELEVANCE e nunca afirma que a
// empresa participa de licitações.
//
// FRONTEIRA DECLARADA: não existe integração com portal público de compras nem
// upload real de arquivo. Nada aqui importa edital de fora ou envia proposta a
// órgão algum; file_url/storage_key são referências declaradas pela equipe.

import { createHash } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;

export const BIDDING_READ_ROLES = Object.freeze(["admin", "marcelo", "ti"]);
export const BIDDING_WRITE_ROLES = Object.freeze(["admin", "marcelo", "ti"]);

export const BIDDING_STATUSES = Object.freeze([
  "rascunho", "publicado", "em_analise", "homologado", "vencido", "cancelado", "deserto",
]);

// Situação terminal: o edital está encerrado. EXT-03 não reinterpreta o sentido
// de negócio de cada rótulo — ele vem da 085 e o plano não o declarou.
export const BIDDING_TERMINAL_STATUSES = Object.freeze(["homologado", "vencido", "cancelado", "deserto"]);

// Transições aceitas. Estado terminal é final: não reabre.
export const BIDDING_STATUS_TRANSITIONS = Object.freeze({
  rascunho: Object.freeze(["publicado", "cancelado"]),
  publicado: Object.freeze(["em_analise", "cancelado", "deserto"]),
  em_analise: Object.freeze(["homologado", "vencido", "cancelado", "deserto"]),
  homologado: Object.freeze([]),
  vencido: Object.freeze([]),
  cancelado: Object.freeze([]),
  deserto: Object.freeze([]),
});

export const DEADLINE_KINDS = Object.freeze([
  "publicacao", "esclarecimento", "impugnacao", "entrega_proposta",
  "sessao_abertura", "recurso", "assinatura",
]);

export const DEADLINE_SOURCES = Object.freeze(["edital_publicado", "retificacao_publicada", "registro_interno"]);

export const PROPOSAL_DEADLINE_KIND = "entrega_proposta";

export const BIDDING_SOURCES = Object.freeze({
  notices: "ext_bidding_notices",
  deadlines: "ext_bidding_deadlines",
  proposals: "ext_bidding_proposals",
  documents: "ext_bidding_documents",
  checklist: "ext_bidding_checklist_items",
  alert_rules: "ext_bidding_alert_rules",
  responsibles: "ext_bidding_responsible_assignments",
  events: "ext_bidding_events",
});

// Condição do critério, declarada e não presumida.
export const MARKET_RELEVANCE = Object.freeze({
  condicao: "se mercado relevante",
  situacao: "indicada_nao_confirmada",
  evidencia: "docs/referencias-marca.md cita \"órgãos públicos\" entre os segmentos do site atual, em seção marcada como \"confirmar antes da nova publicação\".",
  pendencia: "Confirmação do proprietário de que a empresa participa (ou pretende participar) de licitações públicas.",
  efeito: "O módulo registra licitações quando a equipe as cadastrar; não afirma participação nem semeia edital algum.",
});

// Fronteira externa: o que NÃO existe hoje, dito de forma explícita.
export const EXTERNAL_CHANNEL_BOUNDARY = Object.freeze({
  portal_publico_integrado: false,
  importacao_automatica_de_edital: false,
  envio_de_proposta_a_orgao: false,
  upload_real_de_arquivo: false,
  declaracao: "Não existe integração com portal de compras público (ComprasNet, BEC/SP, PNCP ou equivalente) nem armazenamento de arquivo. Todo registro aqui é interno da equipe; file_url e storage_key são referências declaradas, não arquivos recebidos ou verificados.",
});

export const EMPTY_STATE_TEXT =
  "Nenhuma licitação registrada no backend canônico. Nenhum edital, prazo, proposta ou resultado é inventado.";

function fingerprintOf(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDaysIso(dateIso, days) {
  const base = new Date(`${dateIso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}

function stageOf(status) {
  return BIDDING_TERMINAL_STATUSES.includes(String(status)) ? "encerrado" : "em_andamento";
}

function noticeProjection(row) {
  if (!row) return null;
  return {
    id: row.id,
    protocol: row.protocol,
    title: row.title,
    description: row.description,
    edital_number: row.edital_number,
    status: row.status,
    stage: stageOf(row.status),
    origin: row.origin,
    estimated_value_cents: row.estimated_value_cents === null || row.estimated_value_cents === undefined
      ? null
      : Number(row.estimated_value_cents),
    responsible_identity: row.responsible_identity ?? null,
    responsible_assigned_at: row.responsible_assigned_at ?? null,
    responsible_assigned_by_identity: row.responsible_assigned_by_identity ?? null,
    result: row.result ?? null,
    result_recorded_at: row.result_recorded_at ?? null,
    result_recorded_by_identity: row.result_recorded_by_identity ?? null,
    result_justification: row.result_justification ?? null,
    closed_at: row.closed_at ?? null,
    created_by_identity: row.created_by_identity ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Campos de 085 mantidos para leitura, marcados como legado.
    legacy_publication_date: dateOnly(row.publication_date),
    legacy_deadline_date: dateOnly(row.deadline_date),
    legacy_responsible_name: row.responsible_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Derivações puras — a situação NUNCA é um campo gravado à mão.
// ---------------------------------------------------------------------------

/**
 * Situação de um prazo registrado. "a_vencer" só existe quando há regra de
 * antecedência explícita; sem regra, a ausência é declarada em vez de estimada.
 */
export function deriveDeadlineSituation({ deadline, rule = null, today = todayIso() }) {
  if (!deadline) {
    return { situation: "prazo_inexistente", source: BIDDING_SOURCES.deadlines, base_date: today };
  }
  const due = dateOnly(deadline.due_date);
  const base = {
    deadline_id: deadline.id ?? null,
    deadline_kind: deadline.deadline_kind ?? null,
    due_date: due,
    declared_source: deadline.source ?? null,
    source_reference: deadline.source_reference ?? null,
    source: BIDDING_SOURCES.deadlines,
    base_date: today,
  };
  if (deadline.superseded_at) {
    return { ...base, situation: "substituido", superseded_at: deadline.superseded_at };
  }
  if (!due) {
    return { ...base, situation: "sem_data_declarada" };
  }
  if (due < today) {
    return { ...base, situation: "vencido", days_overdue: daysBetween(due, today) };
  }
  if (!rule || rule.deactivated_at) {
    return {
      ...base,
      situation: "vigente",
      alert: null,
      alert_rule_absence: "sem_regra_de_antecedencia",
      alert_rule_note: "Nenhuma antecedência de alerta foi registrada para este edital; o sistema não estima um prazo de aviso.",
    };
  }
  const days = Number(rule.days_before);
  const threshold = addDaysIso(today, days);
  if (due <= threshold) {
    return {
      ...base,
      situation: "a_vencer",
      alert: { days_before: days, threshold_date: threshold, rule_id: rule.id ?? null },
      days_remaining: daysBetween(today, due),
    };
  }
  return {
    ...base,
    situation: "vigente",
    alert: { days_before: days, threshold_date: threshold, rule_id: rule.id ?? null },
    days_remaining: daysBetween(today, due),
  };
}

function daysBetween(fromIso, toIso) {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * CRITÉRIO EXT-03: a proposta só é aceita enquanto o prazo de entrega
 * registrado estiver vigente. Sem prazo registrado não há decisão silenciosa —
 * a ausência é declarada e a proposta é recusada.
 */
export function deriveProposalWindow({ notice, deadline = null, today = todayIso() }) {
  const declaration = { source: BIDDING_SOURCES.deadlines, base_date: today, deadline_kind: PROPOSAL_DEADLINE_KIND };
  if (!notice) return { decision: "edital_inexistente", accepts_proposal: false, ...declaration };
  if (stageOf(notice.status) === "encerrado") {
    return { decision: "edital_encerrado", accepts_proposal: false, bidding_status: notice.status, ...declaration };
  }
  if (!deadline || deadline.superseded_at) {
    return {
      decision: "sem_prazo_registrado",
      accepts_proposal: false,
      missing: "Prazo de entrega de proposta não registrado para este edital.",
      ...declaration,
    };
  }
  const due = dateOnly(deadline.due_date);
  if (!due) return { decision: "sem_data_declarada", accepts_proposal: false, ...declaration };
  if (due < today) {
    return {
      decision: "prazo_encerrado",
      accepts_proposal: false,
      due_date: due,
      declared_source: deadline.source,
      days_overdue: daysBetween(due, today),
      ...declaration,
    };
  }
  return {
    decision: "prazo_vigente",
    accepts_proposal: true,
    due_date: due,
    declared_source: deadline.source,
    days_remaining: daysBetween(today, due),
    ...declaration,
  };
}

/**
 * Checklist: "atendido" é derivado da existência de documento ativo do mesmo
 * tipo. Nunca é um campo marcado pela pessoa.
 */
export function deriveChecklistStatus({ item, documents = [] }) {
  if (!item) return { status: "item_inexistente" };
  const base = {
    checklist_item_id: item.id ?? null,
    document_type: item.document_type ?? null,
    label: item.label ?? null,
    required: item.required !== false,
    source: BIDDING_SOURCES.checklist,
    derived_from: BIDDING_SOURCES.documents,
  };
  if (item.deactivated_at) {
    return { ...base, status: "desativado", deactivated_at: item.deactivated_at, deactivate_reason: item.deactivate_reason ?? null };
  }
  const matching = documents
    .filter(doc => !doc.deactivated_at && !doc.superseded_at)
    .filter(doc => String(doc.document_type) === String(item.document_type)
      || (doc.checklist_item_id && doc.checklist_item_id === item.id));
  if (!matching.length) {
    return { ...base, status: "pendente", satisfied_by: null };
  }
  const latest = matching.reduce((acc, doc) => (Number(doc.version) > Number(acc.version) ? doc : acc), matching[0]);
  return {
    ...base,
    status: "atendido",
    satisfied_by: { document_id: latest.id, version: Number(latest.version), file_name: latest.file_name ?? null },
  };
}

export function summarizeChecklist(entries = []) {
  const active = entries.filter(entry => entry.status !== "desativado");
  const pendentes = active.filter(entry => entry.status === "pendente");
  return {
    total: active.length,
    atendidos: active.filter(entry => entry.status === "atendido").length,
    pendentes: pendentes.length,
    pendentes_obrigatorios: pendentes.filter(entry => entry.required).length,
    checklist_absence: active.length ? null : "sem_checklist_registrado",
  };
}

export function createExtBiddingApi({ pool, sameOrigin, requireSession }) {
  function json(res, code, obj) {
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
  }

  const roleOf = sess => String(sess?.role || sess?.userRole || "").toLowerCase();

  // Autorização: anônimo 401; papel não autorizado 403; mutação exige
  // same-origin e identidade UUID real derivada da sessão.
  async function guard(req, res, { write = false } = {}) {
    let sess = null;
    try { sess = await requireSession(req); } catch { sess = null; }
    if (!sess) { json(res, 401, { error: "unauthorized" }); return null; }
    const role = roleOf(sess);
    const allowed = write ? BIDDING_WRITE_ROLES : BIDDING_READ_ROLES;
    if (!allowed.includes(role)) { json(res, 403, { error: "forbidden_role" }); return null; }
    if (write) {
      if (!sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
      if (!UUID_PATTERN.test(String(sess.identityId || ""))) { json(res, 401, { error: "unauthorized" }); return null; }
    }
    return sess;
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32_768) return { tooLarge: true };
      chunks.push(chunk);
    }
    try {
      return { body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") };
    } catch {
      return { invalid: true };
    }
  }

  function idempotencyKeyOf(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) { json(res, 400, { error: "idempotency_key_required" }); return null; }
    return key;
  }

  function generateProtocol() {
    const d = new Date();
    const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const rand = createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 4).toUpperCase();
    return `LIC-EXT-${stamp}-${rand}`;
  }

  // Toda mutação passa por aqui: BEGIN → replay por (identidade, chave) no
  // ledger de eventos → trabalho (negócio + evento imutável) → audit_log →
  // COMMIT. Falha da auditoria reverte tudo e devolve 503.
  async function runMutation(res, { session, key, fingerprint, audit, work, onReplay, onConflict }) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      const replay = await client.query(
        `SELECT * FROM ext_bidding_events WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE`,
        [session.identityId, key],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        const replayed = await onReplay(client, replay.rows[0]);
        await client.query("COMMIT");
        return json(res, 200, { ...replayed, replayed: true });
      }

      const outcome = await work(client);
      if (outcome.deny) {
        await client.query("ROLLBACK");
        return json(res, outcome.deny.code, outcome.deny.body);
      }

      try {
        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          [audit.action, session.identityId, outcome.auditTarget, JSON.stringify(outcome.auditMeta ?? {})],
        );
      } catch (auditError) {
        // Auditoria é obrigatória: indisponível → nada é persistido.
        await client.query("ROLLBACK");
        console.error("EXT-03 audit unavailable", auditError instanceof Error ? auditError.message : auditError);
        return json(res, 503, { error: "audit_unavailable" });
      }

      await client.query("COMMIT");
      return json(res, outcome.code, outcome.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error && typeof error === "object" && error.code === "23505") {
        // Corrida entre retries simultâneos da MESMA chave: devolve o replay.
        if (/idempotency/i.test(String(error.constraint || error.detail || ""))) {
          try {
            const raced = await client.query(
              `SELECT * FROM ext_bidding_events WHERE created_by_identity=$1 AND idempotency_key=$2`,
              [session.identityId, key],
            );
            if (raced.rows[0]) {
              if (raced.rows[0].request_fingerprint !== fingerprint) return json(res, 409, { error: "idempotency_key_reused" });
              const replayed = await onReplay(client, raced.rows[0]);
              return json(res, 200, { ...replayed, replayed: true });
            }
          } catch {}
        }
        const handled = onConflict ? onConflict(error) : null;
        if (handled) return json(res, handled.code, handled.body);
      }
      console.error("EXT-03 mutation failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "bidding_unavailable" });
    } finally {
      client?.release();
    }
  }

  async function insertEvent(client, { biddingId, eventType, summary, payload, key, fingerprint, identityId }) {
    await client.query(
      `INSERT INTO ext_bidding_events
         (bidding_id, event_type, summary, payload, idempotency_key, request_fingerprint, created_by_identity)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [biddingId, eventType, summary, JSON.stringify(payload ?? {}), key, fingerprint, identityId],
    );
  }

  async function activeAlertRule(client, biddingId) {
    const { rows } = await client.query(
      `SELECT * FROM ext_bidding_alert_rules WHERE bidding_id=$1 AND deactivated_at IS NULL LIMIT 1`,
      [biddingId],
    );
    return rows[0] ?? null;
  }

  async function activeDeadline(client, biddingId, kind) {
    const { rows } = await client.query(
      `SELECT * FROM ext_bidding_deadlines
        WHERE bidding_id=$1 AND deadline_kind=$2 AND superseded_at IS NULL LIMIT 1`,
      [biddingId, kind],
    );
    return rows[0] ?? null;
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/bidding/notices
  // -------------------------------------------------------------------------
  async function handleNotices(req, res, { legacyAlias = false } = {}) {
    if (req.method === "GET") {
      const session = await guard(req, res);
      if (!session) return;
      const url = new URL(req.url, "http://localhost");
      const status = url.searchParams.get("status");
      const responsible = url.searchParams.get("responsible_identity");
      const stage = url.searchParams.get("stage");
      if (status !== null && !BIDDING_STATUSES.includes(status)) return json(res, 400, { error: "invalid_status" });
      if (stage !== null && !["em_andamento", "encerrado"].includes(stage)) return json(res, 400, { error: "invalid_stage" });
      if (responsible !== null && !UUID_PATTERN.test(responsible)) return json(res, 400, { error: "invalid_responsible_identity" });

      const where = [];
      const params = [];
      if (status) { params.push(status); where.push(`status=$${params.length}`); }
      if (responsible) { params.push(responsible); where.push(`responsible_identity=$${params.length}`); }
      // status é enum: comparar com texto exige cast explícito.
      const terminalSql = `status::text = ANY (ARRAY['homologado','vencido','cancelado','deserto'])`;
      if (stage === "encerrado") where.push(terminalSql);
      if (stage === "em_andamento") where.push(`NOT (${terminalSql})`);

      try {
        const { rows } = await pool.query(
          `SELECT * FROM ext_bidding_notices
            ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
            ORDER BY created_at DESC LIMIT 200`,
          params,
        );
        const notices = rows.map(noticeProjection);
        const payload = {
          notices,
          source: BIDDING_SOURCES.notices,
          base_date: todayIso(),
          filters: { status: status ?? null, stage: stage ?? null, responsible_identity: responsible ?? null },
          market_relevance: MARKET_RELEVANCE,
          external_channel_boundary: EXTERNAL_CHANNEL_BOUNDARY,
          empty_state: notices.length ? null : EMPTY_STATE_TEXT,
        };
        // Alias legado: as rotas antigas devolviam "items". Mantido só lá.
        if (legacyAlias) {
          payload.items = notices;
          payload.canonical = "/api/ext/bidding/notices";
        }
        return json(res, 200, payload);
      } catch (error) {
        console.error("EXT-03 notices read failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "bidding_unavailable" });
      }
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

    const session = await guard(req, res, { write: true });
    if (!session) return;
    // A rota legada só é aposentada DEPOIS da mesma ordem de guardas: anônimo
    // continua recebendo 401 e papel sem direito continua recebendo 403.
    if (legacyAlias) return json(res, 410, { error: "legacy_mutation_retired", canonical: "/api/ext/bidding/notices" });
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const editalNumber = typeof body.edital_number === "string" ? body.edital_number.trim() : "";
    const estimated = body.estimated_value_cents;
    if (title.length < 5 || title.length > 200) return json(res, 400, { error: "invalid_title" });
    if (description.length < 10 || description.length > 2000) return json(res, 400, { error: "invalid_description" });
    if (editalNumber.length < 3 || editalNumber.length > 200) return json(res, 400, { error: "invalid_edital_number" });
    let estimatedCents = null;
    if (estimated !== undefined && estimated !== null) {
      if (!Number.isInteger(estimated) || estimated < 0) return json(res, 400, { error: "invalid_estimated_value" });
      estimatedCents = estimated;
    }

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "notice_create", title, description, editalNumber, estimatedCents });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_notice_create" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1`, [event.bidding_id]);
        return { notice: noticeProjection(rows[0]) };
      },
      work: async client => {
        const protocol = generateProtocol();
        const { rows } = await client.query(
          `INSERT INTO ext_bidding_notices
             (protocol, title, description, edital_number, estimated_value_cents, origin, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,'jornada_canonica',$6) RETURNING *`,
          [protocol, title, description, editalNumber, estimatedCents, session.identityId],
        );
        await insertEvent(client, {
          biddingId: rows[0].id, eventType: "edital_criado",
          summary: `Edital ${editalNumber} registrado na jornada canônica.`,
          payload: { protocol, edital_number: editalNumber, estimated_value_cents: estimatedCents },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: { notice: noticeProjection(rows[0]), source: BIDDING_SOURCES.notices, market_relevance: MARKET_RELEVANCE },
          auditTarget: rows[0].id,
          auditMeta: { protocol, edital_number: editalNumber },
        };
      },
      onConflict: error => {
        if (String(error.constraint || "").includes("edital_number")) {
          return { code: 409, body: { error: "duplicate_edital_number" } };
        }
        if (String(error.constraint || "").includes("protocol")) {
          return { code: 409, body: { error: "duplicate_protocol" } };
        }
        return null;
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/PATCH /api/ext/bidding/notices/<id>  — dossiê completo / transição
  // -------------------------------------------------------------------------
  async function handleNoticeById(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });

    if (req.method === "GET") {
      const session = await guard(req, res);
      if (!session) return;
      try {
        const { rows } = await pool.query(`SELECT * FROM ext_bidding_notices WHERE id=$1`, [id]);
        if (!rows[0]) return json(res, 404, { error: "bidding_not_found" });
        const today = todayIso();
        const [deadlines, proposals, documents, checklist, rule, responsibles, events] = await Promise.all([
          pool.query(`SELECT * FROM ext_bidding_deadlines WHERE bidding_id=$1 ORDER BY due_date ASC, registered_at ASC`, [id]),
          pool.query(`SELECT * FROM ext_bidding_proposals WHERE bidding_id=$1 ORDER BY version DESC`, [id]),
          pool.query(`SELECT * FROM ext_bidding_documents WHERE bidding_id=$1 ORDER BY version DESC`, [id]),
          pool.query(`SELECT * FROM ext_bidding_checklist_items WHERE bidding_id=$1 ORDER BY created_at ASC`, [id]),
          pool.query(`SELECT * FROM ext_bidding_alert_rules WHERE bidding_id=$1 AND deactivated_at IS NULL LIMIT 1`, [id]),
          pool.query(`SELECT * FROM ext_bidding_responsible_assignments WHERE bidding_id=$1 ORDER BY assigned_at DESC`, [id]),
          pool.query(`SELECT * FROM ext_bidding_events WHERE bidding_id=$1 ORDER BY created_at ASC`, [id]),
        ]);
        const alertRule = rule.rows[0] ?? null;
        const derivedDeadlines = deadlines.rows.map(deadline => ({
          ...deadline,
          due_date: dateOnly(deadline.due_date),
          derived: deriveDeadlineSituation({ deadline, rule: alertRule, today }),
        }));
        const checklistEntries = checklist.rows.map(item => deriveChecklistStatus({ item, documents: documents.rows }));
        const proposalDeadline = deadlines.rows.find(d => d.deadline_kind === PROPOSAL_DEADLINE_KIND && !d.superseded_at) ?? null;

        return json(res, 200, {
          notice: noticeProjection(rows[0]),
          deadlines: derivedDeadlines,
          proposal_window: deriveProposalWindow({ notice: rows[0], deadline: proposalDeadline, today }),
          proposals: proposals.rows.map(p => ({
            ...p,
            amount_cents: Number(p.amount_cents),
            deadline_date_at_submission: dateOnly(p.deadline_date_at_submission),
            submitted_on: dateOnly(p.submitted_on),
            situation: p.withdrawn_at ? "retirada" : "registrada",
          })),
          documents: documents.rows.map(d => ({
            ...d,
            situation: d.deactivated_at ? "desativado" : d.superseded_at ? "substituido" : "vigente",
          })),
          checklist: checklistEntries,
          checklist_summary: summarizeChecklist(checklistEntries),
          alert_rule: alertRule,
          alert_rule_absence: alertRule ? null : "sem_regra_de_antecedencia",
          responsibles: responsibles.rows,
          events: events.rows,
          source: BIDDING_SOURCES,
          base_date: today,
          market_relevance: MARKET_RELEVANCE,
          external_channel_boundary: EXTERNAL_CHANNEL_BOUNDARY,
        });
      } catch (error) {
        console.error("EXT-03 dossier read failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "bidding_unavailable" });
      }
    }

    if (req.method !== "PATCH") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const status = typeof body.status === "string" ? body.status.trim() : "";
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (!BIDDING_STATUSES.includes(status)) return json(res, 400, { error: "invalid_status" });
    if (justification.length < 5 || justification.length > 500) return json(res, 400, { error: "invalid_justification" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "notice_status", id, status, justification });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_notice_status" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1`, [event.bidding_id]);
        return { notice: noticeProjection(rows[0]) };
      },
      work: async client => {
        const current = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1 FOR UPDATE`, [id]);
        if (!current.rows[0]) return { deny: { code: 404, body: { error: "bidding_not_found" } } };
        const from = current.rows[0].status;
        if (from === status) return { deny: { code: 409, body: { error: "status_unchanged", status: from } } };
        const allowed = BIDDING_STATUS_TRANSITIONS[from] ?? [];
        if (!allowed.includes(status)) {
          return {
            deny: {
              code: 409,
              body: { error: "invalid_status_transition", from, to: status, allowed, terminal: BIDDING_TERMINAL_STATUSES.includes(from) },
            },
          };
        }
        const closing = BIDDING_TERMINAL_STATUSES.includes(status);
        const { rows } = await client.query(
          `UPDATE ext_bidding_notices
              SET status=$2, closed_at=CASE WHEN $3::boolean THEN NOW() ELSE closed_at END, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, status, closing],
        );
        await insertEvent(client, {
          biddingId: id, eventType: "situacao_atualizada",
          summary: `Situação do edital alterada de ${from} para ${status}.`,
          payload: { from, to: status, justification, closed: closing },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 200,
          body: { notice: noticeProjection(rows[0]), transition: { from, to: status }, source: BIDDING_SOURCES.notices },
          auditTarget: id,
          auditMeta: { from, to: status },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/bidding/notices/<id>/responsible
  // -------------------------------------------------------------------------
  async function handleNoticeResponsible(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const responsibleId = typeof body.responsible_identity === "string" ? body.responsible_identity.trim() : "";
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (!UUID_PATTERN.test(responsibleId)) return json(res, 400, { error: "invalid_responsible_identity" });
    if (justification.length < 5 || justification.length > 500) return json(res, 400, { error: "invalid_justification" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "responsible_assign", id, responsibleId, justification });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_responsible_assign" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1`, [event.bidding_id]);
        return { notice: noticeProjection(rows[0]) };
      },
      work: async client => {
        const current = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1 FOR UPDATE`, [id]);
        if (!current.rows[0]) return { deny: { code: 404, body: { error: "bidding_not_found" } } };
        if (BIDDING_TERMINAL_STATUSES.includes(current.rows[0].status)) {
          return { deny: { code: 409, body: { error: "bidding_closed", status: current.rows[0].status } } };
        }
        // Validação canônica: a identidade precisa existir, estar ativa e ter
        // perfil de equipe. O papel é copiado no ato, não inferido depois.
        const identity = await client.query(
          `SELECT i.id, i.status, i.display_name, p.role
             FROM auth_identities i
             LEFT JOIN auth_staff_profiles p ON p.identity_id = i.id
            WHERE i.id=$1`,
          [responsibleId],
        );
        if (!identity.rows[0]) return { deny: { code: 404, body: { error: "responsible_identity_not_found" } } };
        if (!identity.rows[0].role) return { deny: { code: 409, body: { error: "responsible_not_staff" } } };
        if (identity.rows[0].status !== "active") {
          return { deny: { code: 409, body: { error: "responsible_not_active", identity_status: identity.rows[0].status } } };
        }
        const role = identity.rows[0].role;

        const previous = await client.query(
          `SELECT * FROM ext_bidding_responsible_assignments WHERE bidding_id=$1 AND released_at IS NULL FOR UPDATE`,
          [id],
        );
        if (previous.rows[0] && previous.rows[0].responsible_identity === responsibleId) {
          return { deny: { code: 409, body: { error: "responsible_unchanged" } } };
        }
        if (previous.rows[0]) {
          await client.query(`UPDATE ext_bidding_responsible_assignments SET released_at=NOW() WHERE id=$1`, [previous.rows[0].id]);
        }
        const assignment = await client.query(
          `INSERT INTO ext_bidding_responsible_assignments
             (bidding_id, responsible_identity, responsible_role, justification, assigned_by_identity)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [id, responsibleId, role, justification, session.identityId],
        );
        const { rows } = await client.query(
          `UPDATE ext_bidding_notices
              SET responsible_identity=$2, responsible_assigned_at=NOW(),
                  responsible_assigned_by_identity=$3, updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, responsibleId, session.identityId],
        );
        await insertEvent(client, {
          biddingId: id, eventType: "responsavel_designado",
          summary: `Responsável designado para o edital (papel ${role} no ato da designação).`,
          payload: { responsible_identity: responsibleId, responsible_role: role, justification, replaced: previous.rows[0]?.id ?? null },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: {
            notice: noticeProjection(rows[0]),
            assignment: assignment.rows[0],
            replaced_assignment_id: previous.rows[0]?.id ?? null,
            source: BIDDING_SOURCES.responsibles,
          },
          auditTarget: id,
          auditMeta: { responsible_identity: responsibleId, responsible_role: role },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/bidding/notices/<id>/deadlines
  // -------------------------------------------------------------------------
  async function handleNoticeDeadlines(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });

    if (req.method === "GET") {
      const session = await guard(req, res);
      if (!session) return;
      try {
        const notice = await pool.query(`SELECT id FROM ext_bidding_notices WHERE id=$1`, [id]);
        if (!notice.rows[0]) return json(res, 404, { error: "bidding_not_found" });
        const today = todayIso();
        const [deadlines, rule] = await Promise.all([
          pool.query(`SELECT * FROM ext_bidding_deadlines WHERE bidding_id=$1 ORDER BY due_date ASC, registered_at ASC`, [id]),
          pool.query(`SELECT * FROM ext_bidding_alert_rules WHERE bidding_id=$1 AND deactivated_at IS NULL LIMIT 1`, [id]),
        ]);
        const alertRule = rule.rows[0] ?? null;
        return json(res, 200, {
          deadlines: deadlines.rows.map(deadline => ({
            ...deadline,
            due_date: dateOnly(deadline.due_date),
            derived: deriveDeadlineSituation({ deadline, rule: alertRule, today }),
          })),
          alert_rule: alertRule,
          alert_rule_absence: alertRule ? null : "sem_regra_de_antecedencia",
          source: BIDDING_SOURCES.deadlines,
          base_date: today,
          empty_state: deadlines.rows.length ? null : "Nenhum prazo registrado para este edital. Nenhuma data é estimada.",
        });
      } catch (error) {
        console.error("EXT-03 deadlines read failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "bidding_unavailable" });
      }
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const kind = typeof body.deadline_kind === "string" ? body.deadline_kind.trim() : "";
    const dueDate = typeof body.due_date === "string" ? body.due_date.trim() : "";
    const source = typeof body.source === "string" ? body.source.trim() : "";
    const sourceReference = typeof body.source_reference === "string" ? body.source_reference.trim() : "";
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (!DEADLINE_KINDS.includes(kind)) return json(res, 400, { error: "invalid_deadline_kind" });
    if (!isIsoDate(dueDate)) return json(res, 400, { error: "invalid_due_date" });
    if (!DEADLINE_SOURCES.includes(source)) return json(res, 400, { error: "invalid_source" });
    if (sourceReference && (sourceReference.length < 2 || sourceReference.length > 300)) return json(res, 400, { error: "invalid_source_reference" });
    if (justification.length < 5 || justification.length > 500) return json(res, 400, { error: "invalid_justification" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "deadline_register", id, kind, dueDate, source, sourceReference, justification });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_deadline_register" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(
          `SELECT * FROM ext_bidding_deadlines WHERE bidding_id=$1 AND deadline_kind=$2 AND superseded_at IS NULL LIMIT 1`,
          [event.bidding_id, kind],
        );
        return { deadline: rows[0] ? { ...rows[0], due_date: dateOnly(rows[0].due_date) } : null };
      },
      work: async client => {
        const notice = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1 FOR UPDATE`, [id]);
        if (!notice.rows[0]) return { deny: { code: 404, body: { error: "bidding_not_found" } } };
        if (BIDDING_TERMINAL_STATUSES.includes(notice.rows[0].status)) {
          return { deny: { code: 409, body: { error: "bidding_closed", status: notice.rows[0].status } } };
        }
        const existing = await activeDeadline(client, id, kind);
        if (existing) {
          return {
            deny: {
              code: 409,
              body: {
                error: "deadline_already_registered",
                deadline_id: existing.id,
                canonical: `/api/ext/bidding/deadlines/${existing.id}/supersede`,
              },
            },
          };
        }
        const { rows } = await client.query(
          `INSERT INTO ext_bidding_deadlines
             (bidding_id, deadline_kind, due_date, source, source_reference, justification, registered_by_identity)
           VALUES ($1,$2,$3::date,$4,$5,$6,$7) RETURNING *`,
          [id, kind, dueDate, source, sourceReference || null, justification, session.identityId],
        );
        await insertEvent(client, {
          biddingId: id, eventType: "prazo_registrado",
          summary: `Prazo ${kind} registrado para ${dueDate} com fonte ${source}.`,
          payload: { deadline_kind: kind, due_date: dueDate, source, source_reference: sourceReference || null, justification },
          key, fingerprint, identityId: session.identityId,
        });
        const today = todayIso();
        const rule = await activeAlertRule(client, id);
        return {
          code: 201,
          body: {
            deadline: { ...rows[0], due_date: dateOnly(rows[0].due_date) },
            derived: deriveDeadlineSituation({ deadline: rows[0], rule, today }),
            source: BIDDING_SOURCES.deadlines,
            base_date: today,
          },
          auditTarget: rows[0].id,
          auditMeta: { bidding_id: id, deadline_kind: kind, due_date: dueDate, declared_source: source },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/bidding/deadlines/<id>/supersede
  // -------------------------------------------------------------------------
  async function handleDeadlineSupersede(req, res, deadlineId) {
    if (!UUID_PATTERN.test(String(deadlineId || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const dueDate = typeof body.due_date === "string" ? body.due_date.trim() : "";
    const source = typeof body.source === "string" ? body.source.trim() : "";
    const sourceReference = typeof body.source_reference === "string" ? body.source_reference.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!isIsoDate(dueDate)) return json(res, 400, { error: "invalid_due_date" });
    if (!DEADLINE_SOURCES.includes(source)) return json(res, 400, { error: "invalid_source" });
    if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "deadline_supersede", deadlineId, dueDate, source, sourceReference, reason });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_deadline_supersede" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_deadlines WHERE bidding_id=$1 AND superseded_at IS NULL`, [event.bidding_id]);
        return { deadlines: rows.map(r => ({ ...r, due_date: dateOnly(r.due_date) })) };
      },
      work: async client => {
        const old = await client.query(`SELECT * FROM ext_bidding_deadlines WHERE id=$1 FOR UPDATE`, [deadlineId]);
        if (!old.rows[0]) return { deny: { code: 404, body: { error: "deadline_not_found" } } };
        if (old.rows[0].superseded_at) return { deny: { code: 409, body: { error: "deadline_already_superseded" } } };
        const biddingId = old.rows[0].bidding_id;
        const notice = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1 FOR UPDATE`, [biddingId]);
        if (BIDDING_TERMINAL_STATUSES.includes(notice.rows[0]?.status)) {
          return { deny: { code: 409, body: { error: "bidding_closed", status: notice.rows[0].status } } };
        }
        await client.query(
          `UPDATE ext_bidding_deadlines SET superseded_at=NOW(), superseded_by_identity=$2, supersede_reason=$3 WHERE id=$1`,
          [deadlineId, session.identityId, reason],
        );
        const { rows } = await client.query(
          `INSERT INTO ext_bidding_deadlines
             (bidding_id, deadline_kind, due_date, source, source_reference, justification, registered_by_identity)
           VALUES ($1,$2,$3::date,$4,$5,$6,$7) RETURNING *`,
          [biddingId, old.rows[0].deadline_kind, dueDate, source, sourceReference || null, reason, session.identityId],
        );
        await insertEvent(client, {
          biddingId, eventType: "prazo_substituido",
          summary: `Prazo ${old.rows[0].deadline_kind} substituído: ${dateOnly(old.rows[0].due_date)} passa a ${dueDate}.`,
          payload: {
            superseded_deadline_id: deadlineId,
            previous_due_date: dateOnly(old.rows[0].due_date),
            new_due_date: dueDate, source, reason,
          },
          key, fingerprint, identityId: session.identityId,
        });
        const today = todayIso();
        const rule = await activeAlertRule(client, biddingId);
        return {
          code: 201,
          body: {
            superseded_deadline_id: deadlineId,
            deadline: { ...rows[0], due_date: dateOnly(rows[0].due_date) },
            derived: deriveDeadlineSituation({ deadline: rows[0], rule, today }),
            source: BIDDING_SOURCES.deadlines,
            base_date: today,
          },
          auditTarget: rows[0].id,
          auditMeta: { superseded: deadlineId, previous_due_date: dateOnly(old.rows[0].due_date), new_due_date: dueDate },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/bidding/notices/<id>/proposals  — CRITÉRIO EXT-03
  // -------------------------------------------------------------------------
  async function handleNoticeProposals(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });

    if (req.method === "GET") {
      const session = await guard(req, res);
      if (!session) return;
      try {
        const notice = await pool.query(`SELECT * FROM ext_bidding_notices WHERE id=$1`, [id]);
        if (!notice.rows[0]) return json(res, 404, { error: "bidding_not_found" });
        const today = todayIso();
        const [proposals, deadline] = await Promise.all([
          pool.query(`SELECT * FROM ext_bidding_proposals WHERE bidding_id=$1 ORDER BY version DESC`, [id]),
          pool.query(
            `SELECT * FROM ext_bidding_deadlines WHERE bidding_id=$1 AND deadline_kind=$2 AND superseded_at IS NULL LIMIT 1`,
            [id, PROPOSAL_DEADLINE_KIND],
          ),
        ]);
        return json(res, 200, {
          proposals: proposals.rows.map(p => ({
            ...p,
            amount_cents: Number(p.amount_cents),
            deadline_date_at_submission: dateOnly(p.deadline_date_at_submission),
            submitted_on: dateOnly(p.submitted_on),
            situation: p.withdrawn_at ? "retirada" : "registrada",
          })),
          proposal_window: deriveProposalWindow({ notice: notice.rows[0], deadline: deadline.rows[0] ?? null, today }),
          source: BIDDING_SOURCES.proposals,
          base_date: today,
          empty_state: proposals.rows.length ? null : "Nenhuma proposta registrada para este edital. Nenhum valor é estimado.",
        });
      } catch (error) {
        console.error("EXT-03 proposals read failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "bidding_unavailable" });
      }
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const amount = body.amount_cents;
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    if (!Number.isInteger(amount) || amount < 0) return json(res, 400, { error: "invalid_amount_cents" });
    if (summary.length < 10 || summary.length > 2000) return json(res, 400, { error: "invalid_summary" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "proposal_register", id, amount, summary });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_proposal_register" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_proposals WHERE bidding_id=$1 ORDER BY version DESC LIMIT 1`, [event.bidding_id]);
        return {
          proposal: rows[0]
            ? { ...rows[0], amount_cents: Number(rows[0].amount_cents), submitted_on: dateOnly(rows[0].submitted_on), deadline_date_at_submission: dateOnly(rows[0].deadline_date_at_submission) }
            : null,
        };
      },
      work: async client => {
        // O lock no edital serializa a numeração de versão: sem corrida.
        const notice = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1 FOR UPDATE`, [id]);
        if (!notice.rows[0]) return { deny: { code: 404, body: { error: "bidding_not_found" } } };
        const today = todayIso();
        const deadline = await activeDeadline(client, id, PROPOSAL_DEADLINE_KIND);
        const window = deriveProposalWindow({ notice: notice.rows[0], deadline, today });
        if (!window.accepts_proposal) {
          const code = window.decision === "sem_prazo_registrado" || window.decision === "sem_data_declarada" ? 409 : 409;
          return {
            deny: {
              code,
              body: {
                error: window.decision === "edital_encerrado" ? "bidding_closed" : `proposal_${window.decision}`,
                proposal_window: window,
              },
            },
          };
        }
        const max = await client.query(
          `SELECT COALESCE(MAX(version),0)::int AS max_version FROM ext_bidding_proposals WHERE bidding_id=$1`,
          [id],
        );
        const version = Number(max.rows[0].max_version) + 1;
        const { rows } = await client.query(
          `INSERT INTO ext_bidding_proposals
             (bidding_id, version, amount_cents, summary, deadline_id,
              deadline_date_at_submission, deadline_source_at_submission, submitted_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8) RETURNING *`,
          [id, version, amount, summary, deadline.id, dateOnly(deadline.due_date), deadline.source, session.identityId],
        );
        await insertEvent(client, {
          biddingId: id, eventType: "proposta_registrada",
          summary: `Proposta versão ${version} registrada dentro do prazo de entrega ${dateOnly(deadline.due_date)}.`,
          payload: { version, amount_cents: amount, deadline_id: deadline.id, deadline_due_date: dateOnly(deadline.due_date), base_date: today },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: {
            proposal: {
              ...rows[0],
              amount_cents: Number(rows[0].amount_cents),
              submitted_on: dateOnly(rows[0].submitted_on),
              deadline_date_at_submission: dateOnly(rows[0].deadline_date_at_submission),
            },
            proposal_window: window,
            source: BIDDING_SOURCES.proposals,
            base_date: today,
          },
          auditTarget: rows[0].id,
          auditMeta: { bidding_id: id, version, amount_cents: amount, deadline_id: deadline.id },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/bidding/proposals/<id>/withdraw
  // -------------------------------------------------------------------------
  async function handleProposalWithdraw(req, res, proposalId) {
    if (!UUID_PATTERN.test(String(proposalId || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "proposal_withdraw", proposalId, reason });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_proposal_withdraw" },
      onReplay: async client => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_proposals WHERE id=$1`, [proposalId]);
        return { proposal: rows[0] ? { ...rows[0], amount_cents: Number(rows[0].amount_cents) } : null };
      },
      work: async client => {
        const current = await client.query(`SELECT * FROM ext_bidding_proposals WHERE id=$1 FOR UPDATE`, [proposalId]);
        if (!current.rows[0]) return { deny: { code: 404, body: { error: "proposal_not_found" } } };
        if (current.rows[0].withdrawn_at) return { deny: { code: 409, body: { error: "proposal_already_withdrawn" } } };
        const { rows } = await client.query(
          `UPDATE ext_bidding_proposals
              SET withdrawn_at=NOW(), withdrawn_by_identity=$2, withdraw_reason=$3
            WHERE id=$1 RETURNING *`,
          [proposalId, session.identityId, reason],
        );
        await insertEvent(client, {
          biddingId: current.rows[0].bidding_id, eventType: "proposta_retirada",
          summary: `Proposta versão ${current.rows[0].version} retirada; o registro permanece no histórico.`,
          payload: { proposal_id: proposalId, version: current.rows[0].version, reason },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 200,
          body: {
            proposal: { ...rows[0], amount_cents: Number(rows[0].amount_cents), situation: "retirada" },
            source: BIDDING_SOURCES.proposals,
          },
          auditTarget: proposalId,
          auditMeta: { bidding_id: current.rows[0].bidding_id, version: current.rows[0].version },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/bidding/notices/<id>/result
  // -------------------------------------------------------------------------
  async function handleNoticeResult(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const result = typeof body.result === "string" ? body.result.trim() : "";
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (result.length < 10 || result.length > 2000) return json(res, 400, { error: "invalid_result" });
    if (justification.length < 10 || justification.length > 2000) return json(res, 400, { error: "invalid_justification" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "result_record", id, result, justification });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_result_record" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1`, [event.bidding_id]);
        return { notice: noticeProjection(rows[0]) };
      },
      work: async client => {
        const current = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1 FOR UPDATE`, [id]);
        if (!current.rows[0]) return { deny: { code: 404, body: { error: "bidding_not_found" } } };
        // Resultado pressupõe edital encerrado: nada de resultado em andamento.
        if (!BIDDING_TERMINAL_STATUSES.includes(current.rows[0].status)) {
          return {
            deny: {
              code: 409,
              body: { error: "bidding_not_closed", status: current.rows[0].status, terminal_statuses: BIDDING_TERMINAL_STATUSES },
            },
          };
        }
        if (current.rows[0].result_recorded_at) {
          return { deny: { code: 409, body: { error: "result_already_recorded", recorded_at: current.rows[0].result_recorded_at } } };
        }
        const { rows } = await client.query(
          `UPDATE ext_bidding_notices
              SET result=$2, result_justification=$3, result_recorded_at=NOW(),
                  result_recorded_by_identity=$4, closed_at=COALESCE(closed_at, NOW()), updated_at=NOW()
            WHERE id=$1 RETURNING *`,
          [id, result, justification, session.identityId],
        );
        await insertEvent(client, {
          biddingId: id, eventType: "resultado_registrado",
          summary: `Resultado registrado com o edital em situação ${current.rows[0].status}.`,
          payload: { status: current.rows[0].status, justification },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: { notice: noticeProjection(rows[0]), source: BIDDING_SOURCES.notices },
          auditTarget: id,
          auditMeta: { status: current.rows[0].status },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/bidding/notices/<id>/documents  — dossiê versionado
  // -------------------------------------------------------------------------
  async function handleNoticeDocuments(req, res, id, { legacyAlias = false } = {}) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });

    if (req.method === "GET") {
      const session = await guard(req, res);
      if (!session) return;
      try {
        const notice = await pool.query(`SELECT id FROM ext_bidding_notices WHERE id=$1`, [id]);
        if (!notice.rows[0]) return json(res, 404, { error: "bidding_not_found" });
        const { rows } = await pool.query(`SELECT * FROM ext_bidding_documents WHERE bidding_id=$1 ORDER BY version DESC`, [id]);
        const documents = rows.map(d => ({
          ...d,
          situation: d.deactivated_at ? "desativado" : d.superseded_at ? "substituido" : "vigente",
        }));
        const payload = {
          documents,
          source: BIDDING_SOURCES.documents,
          base_date: todayIso(),
          external_channel_boundary: EXTERNAL_CHANNEL_BOUNDARY,
          empty_state: documents.length ? null : "Nenhum documento registrado para este edital.",
        };
        if (legacyAlias) { payload.items = documents; payload.canonical = `/api/ext/bidding/notices/${id}/documents`; }
        return json(res, 200, payload);
      } catch (error) {
        console.error("EXT-03 documents read failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "bidding_unavailable" });
      }
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const documentType = typeof body.document_type === "string" ? body.document_type.trim() : "";
    const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
    const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
    const storageKey = typeof body.storage_key === "string" ? body.storage_key.trim() : "";
    const supersedes = typeof body.supersedes_document_id === "string" ? body.supersedes_document_id.trim() : "";
    if (documentType.length < 3 || documentType.length > 100) return json(res, 400, { error: "invalid_document_type" });
    if (fileName.length < 1 || fileName.length > 500) return json(res, 400, { error: "invalid_file_name" });
    if (fileUrl.length < 5 || fileUrl.length > 1000) return json(res, 400, { error: "invalid_file_url" });
    if (storageKey.length < 5 || storageKey.length > 500) return json(res, 400, { error: "invalid_storage_key" });
    if (supersedes && !UUID_PATTERN.test(supersedes)) return json(res, 400, { error: "invalid_supersedes_document_id" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "document_register", id, documentType, fileName, fileUrl, storageKey, supersedes });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_document_register" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_documents WHERE bidding_id=$1 ORDER BY version DESC LIMIT 1`, [event.bidding_id]);
        return { document: rows[0] ?? null };
      },
      work: async client => {
        // Lock no edital serializa a numeração de versão do dossiê.
        const notice = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1 FOR UPDATE`, [id]);
        if (!notice.rows[0]) return { deny: { code: 404, body: { error: "bidding_not_found" } } };

        let checklistItemId = null;
        const item = await client.query(
          `SELECT * FROM ext_bidding_checklist_items
            WHERE bidding_id=$1 AND document_type=$2 AND deactivated_at IS NULL LIMIT 1`,
          [id, documentType],
        );
        if (item.rows[0]) checklistItemId = item.rows[0].id;

        let supersededRow = null;
        if (supersedes) {
          const old = await client.query(`SELECT * FROM ext_bidding_documents WHERE id=$1 FOR UPDATE`, [supersedes]);
          if (!old.rows[0]) return { deny: { code: 404, body: { error: "superseded_document_not_found" } } };
          if (old.rows[0].bidding_id !== id) return { deny: { code: 409, body: { error: "document_not_in_bidding" } } };
          if (old.rows[0].superseded_at) return { deny: { code: 409, body: { error: "document_already_superseded" } } };
          if (old.rows[0].deactivated_at) return { deny: { code: 409, body: { error: "document_deactivated" } } };
          supersededRow = old.rows[0];
        }

        const max = await client.query(
          `SELECT COALESCE(MAX(version),0)::int AS max_version FROM ext_bidding_documents WHERE bidding_id=$1`,
          [id],
        );
        const version = Number(max.rows[0].max_version) + 1;
        const { rows } = await client.query(
          `INSERT INTO ext_bidding_documents
             (bidding_id, document_type, file_name, file_url, storage_key, version,
              origin, checklist_item_id, supersedes_document_id, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,'jornada_canonica',$7,$8,$9) RETURNING *`,
          [id, documentType, fileName, fileUrl, storageKey, version, checklistItemId, supersededRow?.id ?? null, session.identityId],
        );
        if (supersededRow) {
          await client.query(`UPDATE ext_bidding_documents SET superseded_at=NOW() WHERE id=$1`, [supersededRow.id]);
        }
        await insertEvent(client, {
          biddingId: id, eventType: "documento_registrado",
          summary: `Documento ${documentType} registrado na versão ${version} do dossiê.`,
          payload: {
            document_type: documentType, version, checklist_item_id: checklistItemId,
            supersedes_document_id: supersededRow?.id ?? null, storage_kind: "referencia_externa_declarada",
          },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: {
            document: { ...rows[0], situation: "vigente" },
            superseded_document_id: supersededRow?.id ?? null,
            checklist_item_id: checklistItemId,
            source: BIDDING_SOURCES.documents,
            external_channel_boundary: EXTERNAL_CHANNEL_BOUNDARY,
          },
          auditTarget: rows[0].id,
          auditMeta: { bidding_id: id, document_type: documentType, version },
        };
      },
      onConflict: error => {
        if (String(error.constraint || "").includes("storage_key")) return { code: 409, body: { error: "duplicate_storage_key" } };
        return null;
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/bidding/documents/<id>/deactivate
  // -------------------------------------------------------------------------
  async function handleDocumentDeactivate(req, res, docId) {
    if (!UUID_PATTERN.test(String(docId || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "document_deactivate", docId, reason });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_document_deactivate" },
      onReplay: async client => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_documents WHERE id=$1`, [docId]);
        return { document: rows[0] ?? null };
      },
      work: async client => {
        const current = await client.query(`SELECT * FROM ext_bidding_documents WHERE id=$1 FOR UPDATE`, [docId]);
        if (!current.rows[0]) return { deny: { code: 404, body: { error: "document_not_found" } } };
        if (current.rows[0].deactivated_at) return { deny: { code: 409, body: { error: "document_already_deactivated" } } };
        const { rows } = await client.query(
          `UPDATE ext_bidding_documents
              SET deactivated_at=NOW(), deactivated_by_identity=$2, deactivate_reason=$3
            WHERE id=$1 RETURNING *`,
          [docId, session.identityId, reason],
        );
        await insertEvent(client, {
          biddingId: current.rows[0].bidding_id, eventType: "documento_desativado",
          summary: `Documento ${current.rows[0].document_type} versão ${current.rows[0].version} desativado; o registro permanece.`,
          payload: { document_id: docId, version: current.rows[0].version, reason },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 200,
          body: { document: { ...rows[0], situation: "desativado" }, source: BIDDING_SOURCES.documents },
          auditTarget: docId,
          auditMeta: { bidding_id: current.rows[0].bidding_id, version: current.rows[0].version },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/bidding/notices/<id>/checklist
  // -------------------------------------------------------------------------
  async function handleNoticeChecklist(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });

    if (req.method === "GET") {
      const session = await guard(req, res);
      if (!session) return;
      try {
        const notice = await pool.query(`SELECT id FROM ext_bidding_notices WHERE id=$1`, [id]);
        if (!notice.rows[0]) return json(res, 404, { error: "bidding_not_found" });
        const [items, documents] = await Promise.all([
          pool.query(`SELECT * FROM ext_bidding_checklist_items WHERE bidding_id=$1 ORDER BY created_at ASC`, [id]),
          pool.query(`SELECT * FROM ext_bidding_documents WHERE bidding_id=$1`, [id]),
        ]);
        const entries = items.rows.map(item => deriveChecklistStatus({ item, documents: documents.rows }));
        return json(res, 200, {
          checklist: entries,
          summary: summarizeChecklist(entries),
          source: BIDDING_SOURCES.checklist,
          derived_from: BIDDING_SOURCES.documents,
          base_date: todayIso(),
          empty_state: entries.length ? null : "Nenhum item de checklist registrado para este edital.",
        });
      } catch (error) {
        console.error("EXT-03 checklist read failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "bidding_unavailable" });
      }
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const documentType = typeof body.document_type === "string" ? body.document_type.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const required = body.required === undefined ? true : body.required === true;
    if (documentType.length < 3 || documentType.length > 100) return json(res, 400, { error: "invalid_document_type" });
    if (label.length < 3 || label.length > 200) return json(res, 400, { error: "invalid_label" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "checklist_register", id, documentType, label, required });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_checklist_register" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(
          `SELECT * FROM ext_bidding_checklist_items WHERE bidding_id=$1 AND document_type=$2 AND deactivated_at IS NULL LIMIT 1`,
          [event.bidding_id, documentType],
        );
        return { checklist_item: rows[0] ?? null };
      },
      work: async client => {
        const notice = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1 FOR UPDATE`, [id]);
        if (!notice.rows[0]) return { deny: { code: 404, body: { error: "bidding_not_found" } } };
        const existing = await client.query(
          `SELECT id FROM ext_bidding_checklist_items WHERE bidding_id=$1 AND document_type=$2 AND deactivated_at IS NULL LIMIT 1`,
          [id, documentType],
        );
        if (existing.rows[0]) {
          return { deny: { code: 409, body: { error: "checklist_item_already_registered", checklist_item_id: existing.rows[0].id } } };
        }
        const { rows } = await client.query(
          `INSERT INTO ext_bidding_checklist_items (bidding_id, document_type, label, required, created_by_identity)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [id, documentType, label, required, session.identityId],
        );
        // Documento já registrado antes do item passa a atender o checklist por
        // derivação; o vínculo explícito é gravado para o dossiê.
        await client.query(
          `UPDATE ext_bidding_documents SET checklist_item_id=$2
            WHERE bidding_id=$1 AND document_type=$3 AND checklist_item_id IS NULL`,
          [id, rows[0].id, documentType],
        );
        await insertEvent(client, {
          biddingId: id, eventType: "checklist_item_registrado",
          summary: `Item de checklist "${label}" exigido para o edital.`,
          payload: { document_type: documentType, label, required },
          key, fingerprint, identityId: session.identityId,
        });
        const documents = await client.query(`SELECT * FROM ext_bidding_documents WHERE bidding_id=$1`, [id]);
        return {
          code: 201,
          body: {
            checklist_item: rows[0],
            derived: deriveChecklistStatus({ item: rows[0], documents: documents.rows }),
            source: BIDDING_SOURCES.checklist,
          },
          auditTarget: rows[0].id,
          auditMeta: { bidding_id: id, document_type: documentType, required },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // POST /api/ext/bidding/checklist/<id>/deactivate
  // -------------------------------------------------------------------------
  async function handleChecklistDeactivate(req, res, itemId) {
    if (!UUID_PATTERN.test(String(itemId || ""))) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) return json(res, 400, { error: "invalid_reason" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "checklist_deactivate", itemId, reason });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_checklist_deactivate" },
      onReplay: async client => {
        const { rows } = await client.query(`SELECT * FROM ext_bidding_checklist_items WHERE id=$1`, [itemId]);
        return { checklist_item: rows[0] ?? null };
      },
      work: async client => {
        const current = await client.query(`SELECT * FROM ext_bidding_checklist_items WHERE id=$1 FOR UPDATE`, [itemId]);
        if (!current.rows[0]) return { deny: { code: 404, body: { error: "checklist_item_not_found" } } };
        if (current.rows[0].deactivated_at) return { deny: { code: 409, body: { error: "checklist_item_already_deactivated" } } };
        const { rows } = await client.query(
          `UPDATE ext_bidding_checklist_items
              SET deactivated_at=NOW(), deactivated_by_identity=$2, deactivate_reason=$3
            WHERE id=$1 RETURNING *`,
          [itemId, session.identityId, reason],
        );
        await insertEvent(client, {
          biddingId: current.rows[0].bidding_id, eventType: "checklist_item_desativado",
          summary: `Item de checklist "${current.rows[0].label}" desativado; o registro permanece.`,
          payload: { checklist_item_id: itemId, reason },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 200,
          body: { checklist_item: rows[0], source: BIDDING_SOURCES.checklist },
          auditTarget: itemId,
          auditMeta: { bidding_id: current.rows[0].bidding_id },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // GET/POST /api/ext/bidding/notices/<id>/alert-rules
  // -------------------------------------------------------------------------
  async function handleNoticeAlertRules(req, res, id) {
    if (!UUID_PATTERN.test(String(id || ""))) return json(res, 400, { error: "invalid_reference" });

    if (req.method === "GET") {
      const session = await guard(req, res);
      if (!session) return;
      try {
        const notice = await pool.query(`SELECT id FROM ext_bidding_notices WHERE id=$1`, [id]);
        if (!notice.rows[0]) return json(res, 404, { error: "bidding_not_found" });
        const { rows } = await pool.query(`SELECT * FROM ext_bidding_alert_rules WHERE bidding_id=$1 ORDER BY created_at DESC`, [id]);
        const active = rows.find(r => !r.deactivated_at) ?? null;
        return json(res, 200, {
          alert_rules: rows,
          active_rule: active,
          alert_rule_absence: active ? null : "sem_regra_de_antecedencia",
          note: active
            ? null
            : "Sem regra registrada o sistema não calcula \"a vencer\": a ausência é declarada em vez de estimada.",
          source: BIDDING_SOURCES.alert_rules,
          base_date: todayIso(),
        });
      } catch (error) {
        console.error("EXT-03 alert rules read failed", error instanceof Error ? error.message : error);
        return json(res, 503, { error: "bidding_unavailable" });
      }
    }

    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const session = await guard(req, res, { write: true });
    if (!session) return;
    const { body, tooLarge, invalid } = await readBody(req);
    if (tooLarge) return json(res, 413, { error: "body_too_large" });
    if (invalid) return json(res, 400, { error: "invalid_request" });

    const daysBefore = body.days_before;
    const justification = typeof body.justification === "string" ? body.justification.trim() : "";
    if (!Number.isInteger(daysBefore) || daysBefore < 1 || daysBefore > 365) return json(res, 400, { error: "invalid_days_before" });
    if (justification.length < 5 || justification.length > 500) return json(res, 400, { error: "invalid_justification" });

    const key = idempotencyKeyOf(req, res);
    if (!key) return;
    const fingerprint = fingerprintOf({ op: "alert_rule_register", id, daysBefore, justification });

    return runMutation(res, {
      session, key, fingerprint,
      audit: { action: "ext_bidding_alert_rule_register" },
      onReplay: async (client, event) => {
        const { rows } = await client.query(
          `SELECT * FROM ext_bidding_alert_rules WHERE bidding_id=$1 AND deactivated_at IS NULL LIMIT 1`,
          [event.bidding_id],
        );
        return { alert_rule: rows[0] ?? null };
      },
      work: async client => {
        const notice = await client.query(`SELECT * FROM ext_bidding_notices WHERE id=$1 FOR UPDATE`, [id]);
        if (!notice.rows[0]) return { deny: { code: 404, body: { error: "bidding_not_found" } } };
        const existing = await client.query(
          `SELECT id FROM ext_bidding_alert_rules WHERE bidding_id=$1 AND deactivated_at IS NULL LIMIT 1`,
          [id],
        );
        if (existing.rows[0]) {
          return { deny: { code: 409, body: { error: "alert_rule_already_registered", alert_rule_id: existing.rows[0].id } } };
        }
        const { rows } = await client.query(
          `INSERT INTO ext_bidding_alert_rules (bidding_id, days_before, justification, created_by_identity)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [id, daysBefore, justification, session.identityId],
        );
        await insertEvent(client, {
          biddingId: id, eventType: "regra_alerta_registrada",
          summary: `Antecedência de alerta de ${daysBefore} dia(s) registrada para o edital.`,
          payload: { days_before: daysBefore, justification },
          key, fingerprint, identityId: session.identityId,
        });
        return {
          code: 201,
          body: { alert_rule: rows[0], source: BIDDING_SOURCES.alert_rules },
          auditTarget: rows[0].id,
          auditMeta: { bidding_id: id, days_before: daysBefore },
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // Rotas legadas: leitura autorizada mantida, mutação aposentada com 410.
  // -------------------------------------------------------------------------
  async function handleLegacyBiddingNotices(req, res) {
    return handleNotices(req, res, { legacyAlias: true });
  }

  async function handleLegacyBiddingDocuments(req, res) {
    if (req.method !== "GET") {
      const session = await guard(req, res, { write: true });
      if (!session) return;
      return json(res, 410, { error: "legacy_mutation_retired", canonical: "/api/ext/bidding/notices/<id>/documents" });
    }
    const session = await guard(req, res);
    if (!session) return;
    const url = new URL(req.url, "http://localhost");
    const biddingId = url.searchParams.get("bidding_id");
    if (biddingId !== null && !UUID_PATTERN.test(biddingId)) return json(res, 400, { error: "invalid_bidding_id" });
    try {
      const { rows } = biddingId
        ? await pool.query(`SELECT * FROM ext_bidding_documents WHERE bidding_id=$1 ORDER BY version DESC LIMIT 200`, [biddingId])
        : await pool.query(`SELECT * FROM ext_bidding_documents ORDER BY version DESC LIMIT 200`);
      const documents = rows.map(d => ({
        ...d,
        situation: d.deactivated_at ? "desativado" : d.superseded_at ? "substituido" : "vigente",
      }));
      return json(res, 200, {
        documents,
        items: documents,
        canonical: "/api/ext/bidding/notices/<id>/documents",
        source: BIDDING_SOURCES.documents,
        base_date: todayIso(),
      });
    } catch (error) {
      console.error("EXT-03 legacy documents read failed", error instanceof Error ? error.message : error);
      return json(res, 503, { error: "bidding_unavailable" });
    }
  }

  return {
    handleNotices,
    handleNoticeById,
    handleNoticeResponsible,
    handleNoticeDeadlines,
    handleDeadlineSupersede,
    handleNoticeProposals,
    handleProposalWithdraw,
    handleNoticeResult,
    handleNoticeDocuments,
    handleDocumentDeactivate,
    handleNoticeChecklist,
    handleChecklistDeactivate,
    handleNoticeAlertRules,
    handleLegacyBiddingNotices,
    handleLegacyBiddingDocuments,
  };
}
